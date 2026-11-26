#!/usr/bin/env node
// test-billing-slot-parity — B-87fd U5, THE ROOT FIX'S PROGRAMME (lane bl-accounts, 2026-11-18): ONE answer to «which account
// is this conversation billing» over the transition record (src/slot-transitions.js), retiring the pile of resolvers one
// consumer at a time — the way the three-tier table asks for facts about a machine: a census that makes a one-sided edit red.
//
// (a) THE CENSUS (this leg; the lane's census file lists every line). Every call of the resolvers (64 names at B-87fd's product unit; 55 at the census cure 2)
//     below in the tracked source (src/ + server.js, git ls-files) is a DECLARED ROW — (resolver, file, enclosing function,
//     stage, count). A call the table does not name is red BY NAME (a new consumer of a resolver the programme retires must
//     say its stage); a row the tree no longer has is red (a dead row: the census shrinks as stages land). The stages, money
//     first: spend → cost → readings → pool → routes; `pile` = a resolver calling a resolver (retired last).
// (b) THE DIFFERENTIAL (with stage 1): seeded transition histories through the real accounts + engine — every resolver still
//     standing answers what the ONE answer answers at that instant. Not in this commit.
// RED CONTROL: a call planted in an in-memory copy of a tracked file is red by name; a removed call is a dead row.
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from './tracked-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof m !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs, B-1747)'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

export const RESOLVERS = Object.freeze(['fireIdentityFor', 'sessionBillingMember', 'resolveUsageKey', 'validateBillingSlot', 'wallSlotFor', 'rejectionSlotFor', 'requestSlotFor', 'readingSlotFor', 'poolCurrentFor', 'poolMemberOfSession',
  // the census cure (主开发 2026-11-19 04:09Z, round w02ucwmzf): the list was not whole — the held member, whose credit, the engine's
  // wrappers, the provider models' own, and the pool's current member (the default a spawn and a fallback read)
  'heldPoolMemberFor', 'creditIdentityFor', 'wallKeyFor', 'poolMemberOfSessionFor', 'liveQuotaKeyFor', 'usageCacheKeyFor', 'linkMemberOf', 'accountOfSession', 'poolCurrent',
  // the census cure 2 (主开发 2026-11-19 05:27Z / 05:43Z (a)): every function whose return its callers USE as the billing account (the member,
  // slot or identity a spend, a reading or a spawn is filed under), found by THE NET below and followed up until only consumers call
  // them — a spawn's member, the default's fallback, the spend identity through the guard (its verdict) and auto-resume, the credit's
  // identity, the reading's slot, the billing chip. «name@file» = a generic name read in that file only; «spendGuard.authorize» = the
  // guard's verdict called through its own handle (another handle is the alias gap)
  'poolDefaultOf', '_resolveHomeSpawn', 'resolveForSpawn', 'poolChooserForModel', 'fallbackDefaultTarget', 'fallbackBackTarget', 'fallbackBackVerdict', '_wallScope', 'cliTarget', 'identityOf@src/server/spend-guard.js',
  'identityFor@src/server/spend-guard.js', 'fireIdentity@src/server/auto-resume.js', 'identityFor@src/server/auto-resume.js', 'setConversationPin', 'resetCreditOffer',
  'writeResetCredit', 'writeCodexReading', 'demoteWalledAccount', 'refreshCodexForPerson', 'resetCreditPreview', 'projectionBillingIndex', 'claudeBillingIdentity',
  'codexBillingIdentity', 'poolAuth@src/harnesses/claude.js', 'poolAuth@src/harnesses/codex.js', 'billingIdentity@server.js', 'sessionAuth@server.js', 'sessionAuth@src/routes/sessions.js',
  // the census cure 3 (主开发 2026-11-19 09:12Z): a resolver HANDED ON under another name is declared where it is received — the
  // engine's chooser as server.js's poolChooser → ws-create's chooseMember → accounts' opts.chooseMember (the member a new pooled
  // start bills); and a dependency row or closure that hands the answer on in ITS file (the net reads a caller by name AND file)
  'poolChooser@src/ws-create.js', 'chooseMember@src/ws-create.js', 'chooseMember@src/accounts.js', 'chooseDefault@src/server/account-usage-routes.js',
  'fireIdentity@server.js', 'identityOf@src/server/usage-pool-engine.js', 'poolAuth@server.js',
  // B-87fd's product cure (the pooled codex reading): the account a codex reading is FILED under — a pool's member through the shared rule
  'codexKeyOf@src/usage-routes.js', 'spendGuard.authorize',
  'authorizeSpend', 'spendGuard.authorizeBatch', 'authorizeSpendBatch', 'stoppedRows', 'stoppedPlan', 'writeSnap@src/server/usage-pool-engine.js', 'billingIndex@src/server/auto-cli-loop.js',
  'chooseDefault@src/accounts.js', 'authorize@src/server/spend-guard.js', 'authorizeBatch@src/server/spend-guard.js']);
export const STAGES = Object.freeze(['spend', 'cost', 'readings', 'pool', 'routes', 'pile']);
// [resolver, file, enclosing function, stage, calls] — derived by THIS suite's own scan (231 calls in 204 rows: the ten 66, the census cure's nine 80, the cure 2's net 72, the cure 3's handed-on names 7, the product cure's codexKeyOf 4, piece 7's delivery start 2); the census file names each line
export const ROWS = Object.freeze([
  ['poolCurrentFor', 'src/server/usage-attribution.js', 'recordUsageAttribution', 'cost', 1],
  ['poolMemberOfSession', 'src/server/usage-attribution.js', 'recordUsageAttribution', 'cost', 1],
  ['poolCurrentFor', 'src/accounts.js', 'link', 'pile', 1],   // inside poolMemberOfSession: a resolver calling a resolver
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'sessionBillingMember', 'pile', 1],
  ['requestSlotFor', 'src/server/usage-pool-engine.js', 'readingSlotFor', 'pile', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'resolveUsageKey', 'pile', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'wallSlotFor', 'pile', 1],
  ['validateBillingSlot', 'src/server/usage-pool-engine.js', 'readingSlotFor', 'pile', 1],
  ['validateBillingSlot', 'src/server/usage-pool-engine.js', 'requestSlotFor', 'pile', 1],
  ['validateBillingSlot', 'src/server/usage-pool-engine.js', 'sessionBillingMember', 'pile', 1],
  ['wallSlotFor', 'src/server/usage-pool-engine.js', 'readingSlotFor', 'pile', 1],
  ['wallSlotFor', 'src/server/usage-pool-engine.js', 'rejectionSlotFor', 'pile', 1],
  ['wallSlotFor', 'src/server/usage-pool-engine.js', 'requestSlotFor', 'pile', 3],
  ['poolCurrentFor', 'src/accounts.js', 'ensureSessionPoolLink', 'pool', 1],
  ['poolCurrentFor', 'src/accounts.js', 'setPoolTarget', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'crossVerdictNow', 'pool', 1],   // B-d578 F2: crossMoveNow's verdict, shared with the fallback queue's re-judgement
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'gatherPlan', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'linkMemberOf', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'refreshCodexForPerson', 'readings', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'maybePoolAutoSwitchForPool', 'pool', 2],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'notePoolAuthFailure', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'poolAlternativeFor', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'setConversationPin', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'memberRemoved', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'sweepNonMemberLinks', 'pool', 1],
  ['poolMemberOfSession', 'src/server/usage-pool-engine.js', 'poolMemberOfSessionFor', 'pool', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'crossVerdictNow', 'pool', 1],   // B-d578 F2: crossMoveNow's verdict, shared with the fallback queue's re-judgement
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'gatherPlan', 'pool', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'maybePoolAutoSwitchForPool', 'pool', 2],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'quotaVerdictFor', 'spend', 1],   // the verdict that authorises a billed continue (its own comment: «authorises money»)
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'projectionBillingIndex', 'pool', 1],
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'liveQuotaKeyFor', 'readings', 1],   // the key a live quota probe reads
  ['readingSlotFor', 'src/server/usage-pool-engine.js', 'markLimitBannerNow', 'readings', 1],
  ['readingSlotFor', 'src/server/usage-pool-engine.js', 'recordRateLimitEventNow', 'readings', 1],
  ['readingSlotFor', 'src/server/usage-pool-engine.js', 'writeCodexReading', 'readings', 1],
  ['rejectionSlotFor', 'src/server/usage-pool-engine.js', 'markLimitBannerNow', 'readings', 1],
  ['rejectionSlotFor', 'src/server/usage-pool-engine.js', 'recordRateLimitEventNow', 'readings', 1],
  ['requestSlotFor', 'src/server/usage-pool-engine.js', 'noteTurnAsk', 'readings', 1],
  ['requestSlotFor', 'src/server/usage-pool-engine.js', 'turnAskedFamily', 'readings', 1],
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'probeUsageForAccountKey', 'readings', 1],
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'logControlProbe', 'readings', 1],
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'onRecord', 'cost', 1],   // the census cure: it prices each record on that key (live cost)
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'probeUsageViaSession', 'readings', 2],
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'usageCacheKeyFor', 'readings', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'demoteWalledAccount', 'readings', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'linkHold', 'readings', 1],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'scheduleWallProbe', 'readings', 1],
  ['validateBillingSlot', 'src/server/usage-pool-engine.js', 'recordRateLimitEventNow', 'readings', 1],
  ['wallSlotFor', 'src/server/usage-pool-engine.js', 'noteOatFileGen', 'readings', 1],
  ['wallSlotFor', 'src/server/usage-pool-engine.js', 'wallKeyFor', 'readings', 1],
  ['poolMemberOfSession', 'server.js', 'poolAuth', 'routes', 1],
  ['poolMemberOfSession', 'src/routes/provider-models.js', 'accountOfSession', 'routes', 1],
  ['poolMemberOfSession', 'src/server/account-usage-routes.js', '(module)', 'routes', 1],
  ['resolveUsageKey', 'src/server/session-brain.js', 'claudeSideEffects', 'cost', 1],   // the census cure: the live cost of each message, on that key
  ['resolveUsageKey', 'src/server/stdout/claude-stream-json.js', 'attach', 'cost', 1],   // the census cure: the live cost of each message, on that key
  ['fireIdentityFor', 'server.js', 'fireIdentity', 'spend', 1],   // auto-resume's dependency row on server.js's wiring line
  ['fireIdentityFor', 'src/server/usage-pool-engine.js', 'identityOf', 'spend', 1],
  ['fireIdentityFor', 'src/server/usage-pool-engine.js', 'onMemberReadingFresh', 'spend', 2],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'beforeAutoResumeFire', 'spend', 2],
  // ── the census cure (主开发 2026-11-19 04:09Z): the nine names the list lacked, every call a row (derived by this suite's scan) ──
  ['accountOfSession', 'src/routes/provider-models.js', 'cliTarget', 'routes', 1],
  ['accountOfSession', 'src/routes/provider-models.js', 'registerProviderModelRoutes', 'routes', 1],
  ['accountOfSession', 'src/server/channels-engine.js', 'pathBudgetVerdict', 'routes', 1],   // names the account in a refusal's words (its dep is optional)
  ['creditIdentityFor', 'src/server/usage-pool-engine.js', 'recordCodexQuotaSignal', 'readings', 1],
  ['creditIdentityFor', 'src/server/usage-pool-engine.js', 'resetCreditOffer', 'spend', 1],
  ['creditIdentityFor', 'src/server/usage-pool-engine.js', 'resetCreditRung', 'spend', 1],
  ['creditIdentityFor', 'src/server/usage-pool-engine.js', 'writeResetCredit', 'spend', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'creditIdentityFor', 'pile', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'holdRemoved', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'leavingTo', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'liveQuotaKeyFor', 'pile', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'maybePoolAutoSwitchForPool', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'memberRemoved', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'quotaVerdictFor', 'spend', 1],   // the verdict that authorises a billed continue
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'requestHeldRestart', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'requestSlotFor', 'pile', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'sessionBillingMember', 'pile', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'setConversationPin', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'sweepNonMemberLinks', 'pool', 1],
  ['linkMemberOf', 'src/server/usage-pool-engine.js', 'cacheFactsOf', 'readings', 1],
  ['linkMemberOf', 'src/server/usage-pool-engine.js', 'noteModelRequest', 'readings', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'creditIdentityFor', 'pile', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'handleResetCreditResult', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'onResetCreditSentRecord', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'pickLiveProbeSession', 'readings', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'recordCodexQuotaSignal', 'readings', 3],   // B-f276 r5188: + the held codex wall's own signal (keyed as the release's road keys it; its ring mark is not made)
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'refreshCodexForPerson', 'readings', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'resetCreditCarriers', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'unknownHolderOn', 'readings', 1],   // B-87fd follow: the conversation a key's carrier skipped (its held member unknown) — named, never read
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'walkLadderAfterCredit', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'writeCodexReading', 'readings', 1],
  ['poolMemberOfSessionFor', 'src/server/usage-pool-engine.js', 'heldPoolMemberFor', 'pile', 1],
  ['poolMemberOfSessionFor', 'src/server/usage-pool-engine.js', 'heldPoolUnknown', 'spend', 1],   // an unknown held member refuses a credit spend — and (B-87fd) files no reading
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'cacheFactsOf', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'markLimitBannerNow', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'noteLateFact', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'recordRateLimitEventNow', 'readings', 2],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'wallSlotFor', 'pile', 1],
  ['usageCacheKeyFor', 'src/server/delivery-wake.js', 'startOne', 'readings', 1],   // piece 7 (deliveries resume): the account's limit scope for the quota verdict — met my census at .413 checkpoint 2
  ['wallKeyFor', 'src/server/usage-pool-engine.js', '_wallScope', 'readings', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'creditIdentityFor', 'pile', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'demoteWalledAccount', 'readings', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'fireIdentityFor', 'pile', 1],
  ['poolCurrent', 'server.js', 'poolDefault', 'routes', 1],
  ['poolCurrent', 'src/accounts.js', '_healPoolsAfterRemoval', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', '_poolLoginCandidates', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', '_resolveHomeSpawn', 'spend', 1],   // the member a home spawn bills
  ['poolCurrent', 'src/accounts.js', 'evaluateOnHost', 'pool', 1],
  // (B-360d, lane chrome-157: list()'s poolCurrent row LEFT — the roster's pool row reads the KEPT link target, read off the loop)
  ['poolCurrent', 'src/accounts.js', 'migrateManualPools', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', 'poolCurrentFor', 'pile', 1],
  ['poolCurrent', 'src/accounts.js', 'poolMemberOfSession', 'pile', 1],
  ['poolCurrent', 'src/accounts.js', 'resolveForSpawn', 'spend', 1],   // the member a NEW spawn bills
  ['poolCurrent', 'src/accounts.js', 'setPoolTarget', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', 'unplacedOf', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', 'updatePool', 'pool', 1],
  ['poolCurrent', 'src/server/account-usage-routes.js', '(module)', 'routes', 3],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'creditIdentityFor', 'pile', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'fallbackDefaultTarget', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'holdRemoved', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'leavingTo', 'pool', 2],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'liveQuotaKeyFor', 'pile', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'maybePoolAutoSwitchForPool', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'memberRemoved', 'pool', 2],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'notePoolAuthFailure', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'poolAlternativeFor', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'poolChooserForModel', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'poolDefaultOf', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'pushSealedOrders', 'pool', 2],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'refreshCodexForPerson', 'readings', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'requestHeldRestart', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'resetCreditPreview', 'spend', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'setConversationPin', 'pool', 1],
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'sweepNonMemberLinks', 'pool', 1],
  ['poolCurrent', 'src/ws-create.js', 'createBody', 'spend', 1],   // the account a created conversation is bound to
  // ── the census cure 2 (主开发 2026-11-19 05:27Z / 05:43Z): the answers' own calls, every one a row ──
  ['_resolveHomeSpawn', 'src/accounts.js', 'resolveForSpawn', 'pile', 1],
  ['_wallScope', 'src/server/usage-pool-engine.js', 'beforeAutoResumeFire', 'spend', 1],
  ['_wallScope', 'src/server/usage-pool-engine.js', 'holdRemoved', 'pool', 1],
  ['_wallScope', 'src/server/usage-pool-engine.js', 'onWalledTurn', 'readings', 1],
  ['_wallScope', 'src/server/usage-pool-engine.js', 'sessionWallVerdict', 'readings', 1],
  ['authorizeSpendBatch', 'src/server/auto-resume.js', 'resumeBatch', 'spend', 2],
  ['authorizeSpend', 'src/server/auto-resume.js', 'spendOk', 'spend', 1],   // auto-resume charges the continue to the verdict's identity
  ['authorizeSpend', 'src/server/conversation-deliver.js', 'attemptRetry', 'spend', 1],
  ['authorizeSpend', 'src/server/conversation-deliver.js', 'deliverToConversation', 'spend', 1],
  ['authorizeSpend', 'src/server/worker-dispatch.js', 'dispatch', 'spend', 1],
  ['authorizeSpend', 'src/server/worker-dispatch.js', 'askOwedCompaction', 'spend', 1],   // B-ef83 unit 1 (i): the owed compaction's one ask at the gate's lift
  ['billingIdentity@server.js', 'server.js', 'sessionAuth', 'pile', 1],
  ['billingIndex@src/server/auto-cli-loop.js', 'src/server/auto-cli-loop.js', 'tick', 'readings', 1],
  ['chooseDefault@src/accounts.js', 'src/accounts.js', '_healPoolsAfterRemoval', 'pool', 1],
  ['cliTarget', 'src/routes/provider-models.js', 'cliDoor', 'routes', 1],
  ['demoteWalledAccount', 'src/server/usage-pool-engine.js', 'onWalledTurn', 'readings', 1],
  ['fallbackDefaultTarget', 'src/server/account-usage-routes.js', '(module)', 'routes', 1],
  ['fallbackDefaultTarget', 'src/server/account-usage-routes.js', 'chooseDefault', 'pile', 2],   // B-e381 (r4680): + the kept folder's wipe door — the DELETE route's own chooser, for the same heal
  ['fallbackDefaultTarget', 'src/server/usage-pool-engine.js', 'memberRemoved', 'pool', 1],
  ['fallbackDefaultTarget', 'src/server/usage-pool-engine.js', 'poolChooserForModel', 'pile', 3],
  ['poolChooserForModel', 'src/server/usage-pool-engine.js', 'fallbackBackVerdict', 'pool', 1],   // B-d578 F3a: the new-conversation verdict of the first model (verdictOnly)
  ['poolCurrent', 'src/server/usage-pool-engine.js', 'fallbackBackVerdict', 'pool', 1],   // B-d578 F3a small (r3338 (2)): the pool's default — a lapsed one is said, never a silent stay
  ['fallbackBackVerdict', 'src/server/usage-pool-engine.js', 'fallbackBackTarget', 'pool', 1],   // the target is the verdict's `to`
  ['fallbackBackVerdict', 'src/server/usage-pool-engine.js', 'judgeFallbackReturns', 'pool', 1],   // B-d578 F3a: each pass judges coming back
  ['fallbackBackTarget', 'src/server/usage-pool-engine.js', 'executeFallbackBack', 'pool', 2],   // B-d578 F3a: re-judged at the move, and again after its record landed
  ['fallbackBackVerdict', 'src/server/usage-pool-engine.js', 'fallbackMoveBack', 'pool', 1],   // B-d578 F3a: the person's press (F3b's page)
  ['fallbackBackVerdict', 'src/server/usage-pool-engine.js', 'fallbackStatus', 'pool', 1],   // B-d578 F3a: the pool row's count of those that can come back
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'judgeFallbackReturns', 'pool', 1],   // B-d578 F3a: a conversation held by a fallback provider
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'executeFallbackBack', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'fallbackMoveBack', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'fallbackStatus', 'pool', 1],
  ['heldPoolMemberFor', 'src/server/usage-pool-engine.js', 'fallbackFactOf', 'pool', 1],   // B-d578 r3918: the conversation's own strip — is it held by a fallback provider
  ['fallbackBackVerdict', 'src/server/usage-pool-engine.js', 'fallbackFactOf', 'pool', 1],   // B-d578 r3918: the member that can take it back NOW (the pool row's verdict)
  ['fireIdentity@src/server/auto-resume.js', 'src/server/auto-resume.js', 'identityFor', 'pile', 1],
  ['identityFor@src/server/auto-resume.js', 'src/server/auto-resume.js', 'attemptFire', 'spend', 1],
  ['identityFor@src/server/auto-resume.js', 'src/server/auto-resume.js', 'deliver', 'spend', 1],
  ['identityFor@src/server/auto-resume.js', 'src/server/auto-resume.js', 'resumeBatch', 'spend', 2],
  ['identityFor@src/server/auto-resume.js', 'src/server/auto-resume.js', 'stoppedRows', 'pile', 1],
  ['identityFor@src/server/spend-guard.js', 'src/server/spend-guard.js', 'authorize', 'pile', 1],
  ['identityFor@src/server/spend-guard.js', 'src/server/spend-guard.js', 'authorizeBatch', 'pile', 1],
  ['identityFor@src/server/spend-guard.js', 'src/server/spend-guard.js', 'note', 'spend', 1],
  ['identityFor@src/server/spend-guard.js', 'src/server/spend-guard.js', 'previewBatch', 'spend', 1],
  ['identityOf@src/server/spend-guard.js', 'src/server/spend-guard.js', 'identityFor', 'pile', 1],
  ['poolAuth@src/harnesses/claude.js', 'src/harnesses/claude.js', 'claudeBillingIdentity', 'pile', 1],
  ['poolAuth@src/harnesses/codex.js', 'src/harnesses/codex.js', 'codexBillingIdentity', 'pile', 1],
  ['poolDefaultOf', 'src/server/usage-pool-engine.js', 'recordCodexQuotaSignal', 'readings', 4],
  ['projectionBillingIndex', 'src/server/auto-cli-loop.js', 'billingIndex', 'pile', 1],
  ['projectionBillingIndex', 'src/server/usage-pool-engine.js', 'projectionRereadFor', 'readings', 1],
  ['refreshCodexForPerson', 'src/routes/reset-credit.js', 'registerResetCreditRoutes', 'routes', 1],
  ['resetCreditOffer', 'server.js', 'resetCreditOffer', 'pile', 1],
  ['resetCreditOffer', 'src/server/auto-resume.js', 'armIfEnabled', 'spend', 1],
  ['resetCreditPreview', 'src/routes/reset-credit.js', 'registerResetCreditRoutes', 'routes', 1],
  ['resetCreditPreview', 'src/server/usage-pool-engine.js', 'consumeResetCreditFor', 'spend', 1],
  ['resolveForSpawn', 'src/server/cli-models-door.js', 'listOnce', 'readings', 1],   // a model-list probe spawned under the account
  ['resolveForSpawn', 'src/server/cli-usage-door.js', 'readOnce', 'readings', 1],   // a usage probe spawned under the account
  ['resolveForSpawn', 'src/server/permission-rules.js', 'runOracle', 'spend', 1],   // the account the permission oracle's billed check runs under
  ['resolveForSpawn', 'src/ws-create.js', 'createBody', 'spend', 1],   // the account a created conversation spawns under
  ['sessionAuth@server.js', 'server.js', 'activeSessionsPayload', 'routes', 1],
  ['sessionAuth@src/routes/sessions.js', 'src/routes/sessions.js', 'setup', 'routes', 1],
  ['setConversationPin', 'src/server/account-usage-routes.js', '(module)', 'routes', 1],
  ['setConversationPin', 'src/server/account-usage-routes.js', 'pinRoad', 'routes', 1],   // B-2083 unit A: the pin road handed to the automation verb conversations.pin
  ['spendGuard.authorizeBatch', 'server.js', 'authorizeSpendBatch', 'pile', 1],
  ['spendGuard.authorize', 'server.js', 'authorizeSpend', 'pile', 2],
  ['spendGuard.authorize', 'src/server/delivery-wake.js', 'startOne', 'spend', 1],   // piece 7: the guard's probe before a delivery starts (hold: false)
  ['spendGuard.authorize', 'src/agent-routes.js', 'dispatcher', 'spend', 1],
  ['spendGuard.authorize', 'src/agent-routes.js', 'setupAgentRoutes', 'spend', 1],
  ['spendGuard.authorize', 'src/server/conversation-ops.js', 'openConversation', 'spend', 1],
  ['spendGuard.authorize', 'src/server/stash-handover.js', 'handOverGroups', 'spend', 1],
  ['spendGuard.authorize', 'src/server/usage-pool-engine.js', 'writeResetCredit', 'pile', 1],
  ['spendGuard.authorize', 'src/server/usage-pool-engine.js', 'writeResetCreditViaHelper', 'spend', 1],
  ['stoppedPlan', 'src/server/auto-resume.js', 'resumeBatch', 'spend', 1],
  ['stoppedPlan', 'src/server/bulk-resume-routes.js', 'stopped', 'routes', 1],   // the bulk dialog's plan for the page
  ['stoppedRows', 'src/server/auto-resume.js', 'stoppedPlan', 'pile', 1],
  ['writeCodexReading', 'src/server/usage-pool-engine.js', 'onResetCreditHelperDone', 'readings', 1],
  ['writeCodexReading', 'src/server/usage-pool-engine.js', 'writeResetCreditViaHelper', 'spend', 1],
  ['writeCodexReading', 'src/server/usage-pool-engine.js', 'writeSnap', 'pile', 1],
  ['writeResetCredit', 'src/server/usage-pool-engine.js', 'consumeResetCreditFor', 'spend', 1],
  ['writeResetCredit', 'src/server/usage-pool-engine.js', 'resetCreditRung', 'spend', 1],
  ['writeSnap@src/server/usage-pool-engine.js', 'src/server/usage-pool-engine.js', 'recordCodexQuotaSignal', 'readings', 2],
  // ── the census cure 3 (主开发 2026-11-19 09:12Z): the chooser handed on, its received names' calls ──
  ['poolChooser@src/ws-create.js', 'src/ws-create.js', 'chooseMember', 'pile', 1],   // ws-create's chooseMember arrow calls the engine's chooser it received
  ['poolChooser@src/ws-create.js', 'src/ws-create.js', 'createBody', 'pile', 1],   // B-d578 F2 cure (r2939 (1)): the create asks the engine's chooser for the fallback move's RECORD (carryRecord) — no member is chosen there
  ['chooseMember@src/accounts.js', 'src/accounts.js', 'resolveForSpawn', 'pile', 4],   // the member a new pooled start bills (+1, B-d578 F2: the PEEK before the self-heal — the fallback a conversation was moved to, nothing else)
  ['chooseMember@src/accounts.js', 'src/accounts.js', '_resolveHomeSpawn', 'pile', 1],
  ['chooseMember@src/accounts.js', 'src/accounts.js', 'activeAlt', 'pile', 1],   // resolveForSpawn's own closure (INNER)
  ['chooseMember@src/accounts.js', 'src/accounts.js', 'updatePool', 'pool', 1],   // the pool's default pointed at the chooser's pick
  // ── B-87fd's product cure: the pooled codex reading filed under the member its process holds ──
  ['poolMemberOfSession', 'src/usage-routes.js', 'codexKeyOf', 'pile', 1],
  ['codexKeyOf@src/usage-routes.js', 'src/usage-routes.js', 'summarizeCodexRateLimits', 'readings', 3],   // the live wrapper's limits; a rollout line its live process made, else the thread's recorded account
]);

// THE HOMES (主开发 2026-11-19 09:12Z: the net reads a caller by name AND file): the file(s) where each resolver not scoped by «@file»
// is DEFINED — a function, a method, an arrow, a dependency row. A same-named function in another file is another function.
export const HOME = Object.freeze({
  "fireIdentityFor": ["src/server/usage-pool-engine.js"],
  "sessionBillingMember": ["src/server/usage-pool-engine.js"],
  "resolveUsageKey": ["src/server/usage-pool-engine.js"],
  "validateBillingSlot": ["src/server/usage-pool-engine.js"],
  "wallSlotFor": ["src/server/usage-pool-engine.js"],
  "rejectionSlotFor": ["src/server/usage-pool-engine.js"],
  "requestSlotFor": ["src/server/usage-pool-engine.js"],
  "readingSlotFor": ["src/server/usage-pool-engine.js"],
  "poolCurrentFor": ["src/accounts.js"],
  "poolMemberOfSession": ["src/accounts.js"],
  "heldPoolMemberFor": ["src/server/usage-pool-engine.js"],
  "creditIdentityFor": ["src/server/usage-pool-engine.js"],
  "wallKeyFor": ["src/server/usage-pool-engine.js"],
  "poolMemberOfSessionFor": ["src/server/usage-pool-engine.js"],
  "liveQuotaKeyFor": ["src/server/usage-pool-engine.js"],
  "usageCacheKeyFor": ["src/server/usage-pool-engine.js"],
  "linkMemberOf": ["src/server/usage-pool-engine.js"],
  "accountOfSession": ["src/routes/provider-models.js"],
  "poolCurrent": ["src/accounts.js"],
  "poolDefaultOf": ["src/server/usage-pool-engine.js"],
  "_resolveHomeSpawn": ["src/accounts.js"],
  "resolveForSpawn": ["src/accounts.js"],
  "poolChooserForModel": ["src/server/usage-pool-engine.js"],
  "fallbackDefaultTarget": ["src/server/usage-pool-engine.js"],
  "fallbackBackVerdict": ["src/server/usage-pool-engine.js"],   // B-d578 F3a small (r3338 (2)): the way back's verdict WITH its reason (no first model, family unknown, the default lapsed, no member)
  "fallbackBackTarget": ["src/server/usage-pool-engine.js"],   // B-d578 F3a: the member a conversation on the fallback comes BACK to (the chooser's new-conversation verdict, then memberCanServe)
  "_wallScope": ["src/server/usage-pool-engine.js"],
  "cliTarget": ["src/routes/provider-models.js"],
  "setConversationPin": ["src/server/usage-pool-engine.js"],
  "resetCreditOffer": ["server.js", "src/server/usage-pool-engine.js"],
  "writeResetCredit": ["src/server/usage-pool-engine.js"],
  "writeCodexReading": ["src/server/usage-pool-engine.js"],
  "demoteWalledAccount": ["src/server/usage-pool-engine.js"],
  "refreshCodexForPerson": ["src/server/usage-pool-engine.js"],
  "resetCreditPreview": ["src/server/usage-pool-engine.js"],
  "projectionBillingIndex": ["src/server/usage-pool-engine.js"],
  "claudeBillingIdentity": ["src/harnesses/claude.js"],
  "codexBillingIdentity": ["src/harnesses/codex.js"],
  "authorizeSpend": ["server.js"],
  "authorizeSpendBatch": ["server.js"],
  "stoppedRows": ["src/server/auto-resume.js"],
  "stoppedPlan": ["src/server/auto-resume.js"],
});
const isAnswerAt = (name, file) => RESOLVERS.includes(`${name}@${file}`) || (Object.prototype.hasOwnProperty.call(HOME, name) && HOME[name].includes(file));

const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'try']);
const FN = /^\s*(?:async\s+)?function\s+(\w+)\s*\(|^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|^\s*(\w+)\s*\([^)]*\)\s*\{\s*(?:\/\/.*)?$|^\s{2,}(\w+)\s*:\s*(?:async\s*)?\(/;
const HEAD = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/;   // a one-line method's head, read on the call's own line only
const DEP = /(\w+)\s*:\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g;   // a dependency row on a wiring line («fireIdentity: (id, s2) => …»)
/** the function that encloses the call at line `i` (its text before the call = `before`): the call's OWN line first — the last
 *  dependency row before it (a wiring line hands many), a one-line function or a same-line arrow encloses its call (the
 *  adversarial read: the scan began a line above, so those were filed under the function before them) — then upward */
// WALKING UP from the call (the confirming read: a one-line function, an inner arrow or an `if` block closed or open between
// the call and its function named the wrong caller): each `}` met waits for its `{`; a `{` with none waiting opens a block that
// is still open at the call. The caller is the nearest FUNCTION HEAD whose own brace is such a block (a multi-line head: the
// `) {` line's brace, claimed by the head above it); an `if` / a callback / an object literal is passed by. Strings, template
// text and a line comment are set aside first — a census's approximation.
const STR = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
function openersOf(text, st) {
  const t = String(text).replace(STR, '""').replace(/\/\/.*$/, '');
  let opened = 0;
  for (let k = t.length - 1; k >= 0; k--) {
    const c = t[k];
    if (c === '}') st.depth++;
    else if (c === '{') { if (st.depth > 0) st.depth--; else opened++; }
  }
  return opened;
}
function enclosing(L, i, before) {
  const deps = [...before.matchAll(DEP)];
  if (deps.length) return deps[deps.length - 1][1];
  const st = { depth: 0 };
  const openHere = openersOf(before, st);
  const fn = FN.exec(before), own = fn || HEAD.exec(before);
  const arrow = !!(fn && fn[2]);   // a same-line arrow encloses its expression body; a function only while its brace is open
  if (own) { const g = own.slice(1).find(Boolean); if (!KW.has(g) && (arrow || openHere > 0)) return g; }
  let headPending = false;   // a `) {` line's open brace, waiting for the head above it
  for (let j = i - 1; j >= 0; j--) {
    const opened = openersOf(L[j], st);
    const m = FN.exec(L[j]);
    const g = m ? m.slice(1).find(Boolean) : null;
    if (m && !KW.has(g) && (opened > 0 || headPending)) return g;
    if (opened > 0) headPending = /^\s*\)/.test(L[j]) && !(m && KW.has(g));
  }
  return '(module)';
}
/** THE CENSUS over `files` (repo-relative) read through `readOf` → Map key «resolver|file|caller» → count */
// THE FORMS A CALL TAKES (主开发 2026-11-19 05:27Z): a plain call, an optional call, call / apply, and a bind (the bound function
// is the resolver's answer handed on) are each a call of the name. A resolver given as «name@file» is a GENERIC name read only in
// that file (its own module's closure or dependency, e.g. the spend guard's identityFor).
export const CALL_FORMS = Object.freeze(['(', '?.(', '.call(', '.apply(', '.bind(']);
// THE GAPS, said (a call the scan cannot see — each is found by reading, not here):
//   · an ALIAS in a variable — `const f = poolCurrentFor; f(x)`: the alias's calls are no row (the name's own reference is no call);
//   · an arrow whose body starts on the NEXT line — `const pick = (s) =>\n  poolCurrent(s)`: the call is a row, filed under the
//     function around the arrow (a head without a brace on its line is no enclosing head);
//   · an arrow assigned to a FIELD — `o.pick = (s) => poolCurrent(s)`: the same, filed under the function around it.
export const GAPS = Object.freeze(['a handed-on name declared in another file than the one that receives it (§f reads the name)', 'an alias of a resolver in a variable (account-usage-routes\' «decide», handed on as chooseMember: its receiver is declared)', 'an arrow whose body starts on the next line (filed under the function around it)', 'an arrow assigned to a field (filed under the function around it)', 'an arrow inside a conditional expression (filed under the function around it — account-usage-routes\' decide, under (module))', 'a resolver handed on through a variable, not its own name (the handed-on leg reads a resolver\'s own name only)']);
// ONE regex pass per file says which names it holds (a substring search per name and form, per file, cost seconds)
const NAMES_RE = new Map();
export function namesIn(text, names) {
  let re = NAMES_RE.get(names);
  if (!re) {
    const alt = [...new Set(names.map((e) => String(e).split('@')[0]))].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.$]/g, '\\$&')).join('|');
    re = new RegExp(`(?<![\\w$])(${alt})(?:\\(|\\?\\.\\(|\\.call\\(|\\.apply\\(|\\.bind\\()`, 'g');
    NAMES_RE.set(names, re);
  }
  const out = new Set();
  for (const m of String(text).matchAll(re)) out.add(m[1]);
  return out;
}
export function census(files, readOf, names = RESOLVERS) {
  const out = new Map();
  for (const f of files) {
    let text = ''; try { text = readOf(f); } catch { continue; }
    const here = names.map((e) => [String(e).split('@')[0], e, String(e).includes('@') ? String(e).slice(String(e).indexOf('@') + 1) : null]).filter(([, , only]) => !only || only === f);
    // only the names this file holds, in only the forms it holds (a file with one name is read for that one — the scan's cost)
    const found = namesIn(text, names);
    const present = here.filter(([n]) => found.has(n)).map(([n, e]) => [n, e, CALL_FORMS.filter((form) => text.includes(n + form))]).filter(([, , forms]) => forms.length);
    if (!present.length) continue;
    const L = text.split('\n');
    L.forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return;
      for (const [n, e, forms] of present) {
        if (!line.includes(n)) continue;
        for (const form of forms) {
          let at = line.indexOf(n + form);
          while (at >= 0) {
            const before = line.slice(0, at);
            const isDef = form === '(' && (/function\s+$/.test(before) || (new RegExp('^\\s*' + n.replace(/[$]/g, '\\$') + '\\s*\\([^)]*\\)\\s*\\{').test(line) && before.trim() === ''));
            const word = at > 0 && /[\w$]/.test(line[at - 1]);
            if (!isDef && !word) {
              const k = `${e}|${f}|${enclosing(L, i, before)}`;
              out.set(k, (out.get(k) || 0) + 1);
            }
            at = line.indexOf(n + form, at + 1);
          }
        }
      }
    });
  }
  return out;
}
const declared = () => { const m = new Map(); for (const [n, f, enc, , c] of ROWS) m.set(`${n}|${f}|${enc}`, (m.get(`${n}|${f}|${enc}`) || 0) + c); return m; };
const diff = (have, want) => ({ fresh: [...have].filter(([k, c]) => (want.get(k) || 0) < c).map(([k, c]) => `${k} ×${c - (want.get(k) || 0)}`), dead: [...want].filter(([k, c]) => (have.get(k) || 0) < c).map(([k, c]) => `${k} ×${c - (have.get(k) || 0)}`) });

console.log(`§a THE BILLING-SLOT CENSUS — every call of the ${RESOLVERS.length} resolvers is a declared row with its stage (the forms: ${CALL_FORMS.map((f) => 'name' + f).join(' ')}; the gaps: ${GAPS.join(' · ')})`);
const files = [...trackedFiles(ROOT, 'src'), 'server.js'].filter((f) => f.endsWith('.js'));
const TEXT = new Map();   // one read per file: the controls below re-read nothing
const read = (f) => { if (!TEXT.has(f)) TEXT.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); return TEXT.get(f); };
const have = census(files, read);
// a control's copy changes ONE file; every other file without a call adds none, so a control scans the callers + that file
const callers = [...new Set([...have.keys()].map((k) => k.split('|')[1]))];
const scope = (f) => [...new Set([...callers, f])];
const want = declared();
const total = [...have.values()].reduce((a, b) => a + b, 0);
const byStage = {}; for (const [, , , st, c] of ROWS) byStage[st] = (byStage[st] || 0) + c;
console.log(`    ${total} calls in ${new Set([...have.keys()].map((k) => k.split('|')[1])).size} files · by stage: ${STAGES.map((s) => `${s} ${byStage[s] || 0}`).join(' · ')}`);
const d = diff(have, want);
ok(d.fresh.length === 0, 'every call of a resolver is a declared row (a new consumer must name its stage)', d.fresh);
ok(d.dead.length === 0, 'no declared row is dead (the table shrinks with the stages that land)', d.dead);
ok(ROWS.every(([n, f, enc, st, c]) => RESOLVERS.includes(n) && STAGES.includes(st) && c > 0 && f && enc), 'every row names a resolver, a file, a caller, a known stage and a count');
ok(total >= 60, `the census reads the tree, not nothing (${total} calls)`);
// RED CONTROLS — on in-memory copies of the tree
{
  // three consumers on their own line — a one-line function, a same-line arrow, a wiring line's dependency row (the shapes the
  // first scan filed under the function above them): each is red BY NAME
  const ENG = 'src/server/usage-pool-engine.js';
  const plant = '\nfunction plantedConsumer(s) { return wallSlotFor(s); }\nconst plantedArrow = (s) => sessionBillingMember(s, null);\nconst plantedWiring = { log: () => null, plantedDep: (s) => fireIdentityFor(s) };\n'
    // (the confirming read) a call inside an `if`, below a one-line arrow already closed, inside a function: the FUNCTION is its caller
    + 'function plantedOuter(s) {\n  const helper = (x) => { return x; };\n  if (s) {\n    return requestSlotFor(helper(s));\n  }\n}\n';
  const planted = (f) => (f === ENG ? read(f) + plant : read(f));
  const dp = diff(census(scope(ENG), planted), want);
  const wantFresh = [`wallSlotFor|${ENG}|plantedConsumer ×1`, `sessionBillingMember|${ENG}|plantedArrow ×1`, `fireIdentityFor|${ENG}|plantedDep ×1`, `requestSlotFor|${ENG}|plantedOuter ×1`];
  ok(dp.fresh.length === 4 && wantFresh.every((x) => dp.fresh.includes(x)) && dp.dead.length === 0, 'CONTROL: planted consumers (a one-line function, a same-line arrow, a wiring row, a call under a closed one-liner and an `if`) are red BY NAME (resolver, file, caller)', dp);
  const removed = (f) => (f === 'src/server/usage-attribution.js' ? read(f).replace('accounts.poolCurrentFor(', 'accounts.poolCurrentForGone(') : read(f));
  const dr = diff(census(scope('src/server/usage-attribution.js'), removed), want);
  ok(dr.dead.length === 1 && /^poolCurrentFor\|src\/server\/usage-attribution\.js\|recordUsageAttribution ×1$/.test(dr.dead[0]), 'CONTROL: a consumer that left (the cost record moved off the link) shows as a dead row until the table says so', dr);
  // the forms a call takes (主开发 05:27Z): an optional call, call / apply and a bind of a resolver are each a row — red by name
  const formsPlant = '\nfunction plantedForms(s) {\n  const a = wallSlotFor?.(s);\n  const b = poolCurrent.call(null, s._accountId);\n  const c = sessionBillingMember.bind(null, s);\n  return [a, b, c];\n}\n';
  const df = diff(census(scope(ENG), (f) => (f === ENG ? read(f) + formsPlant : read(f))), want);
  const wantForms = [`wallSlotFor|${ENG}|plantedForms ×1`, `poolCurrent|${ENG}|plantedForms ×1`, `sessionBillingMember|${ENG}|plantedForms ×1`];
  ok(df.fresh.length === 3 && wantForms.every((x) => df.fresh.includes(x)), 'CONTROL: an optional call, a call() and a bind() of a resolver are each a fresh row, red by name', df.fresh);
}

console.log('§b THE RESOLVERS ARE WHOLE — a function that reads as an answer and asks a resolver IS one (主开发 2026-11-19 04:09Z)');
// A census of NAMES cannot see a new wrapper: a lane that writes «the held member, else the pool's current» in a new function stays
// green. So, found mechanically: every function DEFINED in the tracked source whose name reads as «which slot / member / identity /
// key / account» and whose body calls a declared resolver is itself declared — a resolver (its calls are rows above) or a
// NOT_RESOLVERS row with its reason; and every name the pool engine EXPORTS (create()'s returned object) that reads so is declared.
// A helper named plainly is not read here — but its call of a resolver is a fresh row of §a, by name.
export const ANSWER_NAME = /^(?:\w*(?:Slot|Member|Identity|Key)For|\w*MemberOf\w*|accountOf\w*|poolCurrent\w*|\w*BillingMember|validateBillingSlot|resolveUsageKey)$/;
export const NOT_RESOLVERS = Object.freeze({});   // name → why (none today: every such function that asks a resolver answers the account)
const declaredName = (n) => RESOLVERS.some((e) => String(e).split('@')[0] === n) || Object.prototype.hasOwnProperty.call(NOT_RESOLVERS, n);
const strip = (t) => String(t).replace(STR, '""').replace(/\/\/.*$/, '');
function bodyOf(L, i) {   // a definition's body: its line through the matching close brace (an expression arrow: its own line)
  let depth = 0, started = false; const out = [];
  for (let j = i; j < L.length; j++) {
    const t = strip(L[j]); out.push(L[j]);
    for (const c of t) { if (c === '{') { depth++; started = true; } else if (c === '}') depth--; }
    if (started && depth <= 0) break;
    if (!started && j === i && t.includes('=>') && !t.split('=>').slice(1).join('=>').includes('{')) break;
  }
  return out.join('\n');
}
export function answerDefs(files, readOf, resolvers = [...new Set(RESOLVERS.map((e) => String(e).split('@')[0]).filter((n) => /^[\w$]+$/.test(n)))]) {
  const out = [];
  for (const f of files) {
    let text = ''; try { text = readOf(f); } catch { continue; }
    const L = text.split('\n');
    L.forEach((line, i) => {
      const m = FN.exec(line); if (!m) return;
      const n = m.slice(1).find(Boolean); if (!n || !ANSWER_NAME.test(n)) return;
      const b = bodyOf(L, i);
      const calls = resolvers.filter((r) => r !== n && new RegExp(`(?<![\\w$])${r}\\(`).test(b));
      if (calls.length) out.push({ name: n, file: f, line: i + 1, calls });
    });
  }
  return out;
}
export function engineExports(text) {   // the names create()'s returned object lists (the engine's last `  return {` … `  };`)
  const i = String(text).lastIndexOf('\n  return {\n'), j = i < 0 ? -1 : String(text).indexOf('\n  };\n', i);
  if (i < 0 || j < 0) return [];
  return String(text).slice(i + 12, j).split('\n').flatMap((l) => strip(l).split(/[\s,]+/)).filter((w) => /^[A-Za-z_$][\w$]*$/.test(w));
}
{
  const ENGF = 'src/server/usage-pool-engine.js';
  const undeclaredDefs = (ds) => ds.filter((d) => !declaredName(d.name)).map((d) => `${d.name} (${d.file}:${d.line}, asks ${d.calls.join(', ')})`);
  const defs = answerDefs(files, read);
  ok(undeclaredDefs(defs).length === 0, `every function that reads as an answer and asks a resolver is declared (${defs.length} found, ${new Set(defs.map((d) => d.name)).size} names)`, undeclaredDefs(defs));
  ok(['heldPoolMemberFor', 'creditIdentityFor', 'wallKeyFor', 'poolMemberOfSessionFor', 'liveQuotaKeyFor', 'usageCacheKeyFor', 'linkMemberOf', 'accountOfSession'].every((n) => defs.some((d) => d.name === n)),
    'the mechanical read finds every declared wrapper itself (a resolver that asks a resolver)', RESOLVERS.filter((n) => !defs.some((d) => d.name === n)));
  const ex = engineExports(read(ENGF)), exAns = ex.filter((n) => ANSWER_NAME.test(n));
  ok(ex.length > 100 && exAns.length >= 8 && exAns.every(declaredName), `every name the pool engine exports that reads as an answer is declared (${exAns.length} of ${ex.length} exports)`, exAns.filter((n) => !declaredName(n)));
  ok(Object.entries(NOT_RESOLVERS).every(([n, w]) => typeof w === 'string' && w.length > 20 && defs.some((d) => d.name === n)), 'every NOT_RESOLVERS row names its reason and a function the tree still defines (no dead reason)');
  // RED CONTROLS: a planted wrapper (the held member, else the pool's current) and a planted export — each red BY NAME
  const plantDef = '\nfunction plantedMemberFor(s) { return heldPoolMemberFor(s) || poolCurrentFor(s._accountId, s._webuiId); }\n';
  const pd = undeclaredDefs(answerDefs([ENGF], (f) => read(f) + plantDef));
  ok(pd.length === 1 && /^plantedMemberFor \(src\/server\/usage-pool-engine\.js:\d+, asks /.test(pd[0]) && /poolCurrentFor/.test(pd[0]) && /heldPoolMemberFor/.test(pd[0]), 'CONTROL: a planted wrapper («the held member, else the pool\'s current») is RED by name', pd);
  const { anchored } = await import('./scratch.mjs');
  const exPlanted = engineExports(anchored(read(ENGF), '\n  return {\n    _vsuPending,', '\n  return {\n    plantedSlotFor, _vsuPending,', 'census cure: a planted export'));
  ok(exPlanted.includes('plantedSlotFor') && exPlanted.filter((n) => ANSWER_NAME.test(n)).filter((n) => !declaredName(n)).join() === 'plantedSlotFor', 'CONTROL: a planted export that reads as an answer is RED by name', exPlanted.filter((n) => ANSWER_NAME.test(n) && !declaredName(n)));
}

console.log('§c THE RAW KEYS AT READING SITES — a reading filed under an account id read straight off the conversation (主开发 2026-11-19 05:27Z)');
// They call no resolver, so no census sees them: each such site is a DECLARED ROW — its file, its anchor (the line's own text, found
// exactly once), its stage and its reason. A row whose anchor moved or left is red (the table follows the tree).
export const RAW_KEYS = Object.freeze([
  ['src/usage-routes.js', "if ((m.backend || 'claude') === 'codex' && m.backendSessionId) map[m.backendSessionId] = m.accountId || null;", 'readings', 'the codex thread → account map, read from the conversations\' meta files as stored (a pooled one stores the pool id): B-87fd\'s product cure judges it through codexKeyOf — a rollout line the LIVE process made goes by the live conversation\'s own account (a pooled one: the member it holds); any other line by this recorded account, a pool\'s nowhere'],
  ['src/server/stream-wall.js', 'const key = session._accountId || null;', 'readings', 'a usage wall the stream named is written under the conversation\'s own account id — harmless today: that harness has no pool'],
  ['src/usage-history.js', 'map[sid] = { acct: m.accountId || m._accountId || null,', 'cost', 'the history\'s session → account map from the meta files (whose records a session\'s cost is filed under): the account id as stored — not yet followed to its end'],
]);
{
  const count = (text, a) => String(text).split(a).length - 1;
  const rawOf = (rows, readOf) => rows.map(([f, a]) => ({ f, a, n: count(readOf(f), a) }));
  const r = rawOf(RAW_KEYS, read);
  ok(r.every((x) => x.n === 1) && RAW_KEYS.every(([, , st, why]) => STAGES.includes(st) && typeof why === 'string' && why.length > 40), `every raw-key row's anchor is in its file exactly once, with a known stage and its reason (${RAW_KEYS.length} rows)`, r.filter((x) => x.n !== 1).map((x) => `${x.f} ×${x.n}: ${x.a.slice(0, 60)}`));
  const { anchored } = await import('./scratch.mjs');
  const moved = rawOf(RAW_KEYS, (f) => (f === 'src/server/stream-wall.js' ? anchored(read(f), 'const key = session._accountId || null;', 'const key = (session && session._accountId) || null;', 'raw keys: a rewritten line') : read(f)));
  ok(moved.filter((x) => x.n !== 1).length === 1 && moved.find((x) => x.n !== 1).f === 'src/server/stream-wall.js', 'CONTROL: a raw-key line rewritten (its anchor gone) is red by its file — the row follows the tree', moved.filter((x) => x.n !== 1));
}

console.log('§d THE NET — every function that calls a resolver is classified ONCE: it answers (a resolver), it only consumes, or it is a resolver\'s own inner closure (主开发 2026-11-19 05:27Z / 05:43Z)');
// No name matching: the enclosing function §a prints for every row is looked up in the three lists; one in none is red BY NAME. A
// function whose return its callers USE as the billing account is a resolver (its calls rows, and so on up); a report, a verdict or a
// roster that only ECHOES it is a CONSUMER with its reason and the fields of its return that carry an account (checked in §e); a
// resolver's own inner closure (its answer leaves only through that resolver) is INNER. The name filter of §b stays as a second look.
export const INNER = Object.freeze({
  "activeAlt": {"of": "resolveForSpawn", "file": "src/accounts.js", "why": "resolveForSpawn's own closure: the live member a spawn bills when the current one lapsed — its answer leaves only through resolveForSpawn"},
  "leavingTo": {"of": "resetCreditPreview", "file": "src/server/usage-pool-engine.js", "why": "Closure inside resetCreditPreview (a resolver): returns {to, inFlight} with to = poolCurrent, feeding the preview's restartPending row."},
  "link": {"of": "poolMemberOfSession", "file": "src/accounts.js", "why": "Already decided INNER: closure in poolMemberOfSession returning poolCurrentFor(poolId, key), the member the session's link names."},
  "poolDefault": {"of": "sessionAuth", "file": "server.js", "why": "Already decided INNER: property IIFE inside poolAuth returning the name of poolCurrent(a.id), the pool's current member."},
});
export const CONSUMERS = Object.freeze({
  "(module)": {"file": "src/server/account-usage-routes.js", "fields": [], "why": "module-level route code: poolCurrent before / after, setConversationPin and the default's decide arrow (a conditional arrow the scan files here: it answers, handed to updatePool as chooseMember) go into HTTP answers or the store; nothing returned"},
  "_healPoolsAfterRemoval": {"file": "src/accounts.js", "fields": [], "why": "Re-points pool defaults and session links off a deleted member; poolCurrent only picks a link's fallback target; returns nothing."},
  "_poolLoginCandidates": {"file": "src/accounts.js", "fields": ["id", "name"], "why": "Returns the pool's login candidates [{id, name}] (members plus poolCurrent's target), a membership set for login and token checks."},
  "activeSessionsPayload": {"file": "server.js", "fields": ["accountId", "accountName", "accountTail", "auth", "poolPin"], "why": "Builds the session list rows for the page (an array); sessionAuth's billing chip rides each row's auth field as display, never a spend's account."},
  "armIfEnabled": {"file": "src/server/auto-resume.js", "fields": ["cause"], "why": "Arms an auto-resume wait; resetCreditOffer only decorates the arm card's notice, and the arm record returned echoes the caller's cause."},
  "attach": {"file": "src/server/stdout/claude-stream-json.js", "fields": [], "why": "Stream parser: prices each assistant usage record under resolveUsageKey and notes it live; the function itself returns nothing."},
  "attemptFire": {"file": "src/server/auto-resume.js", "fields": [], "why": "Fires one auto-resume continue on identityFor's slot (check, authorize and charge happen inside); returns only a boolean fired/not."},
  "attemptRetry": {"file": "src/server/conversation-deliver.js", "fields": [], "why": "retries a held delivery through the spend authorizer; returns nothing — the identity stays inside the retry"},
  "beforeAutoResumeFire": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Pre-fire gate: sessionBillingMember and _wallScope pick the probe target and the verdict scope; it returns only a boolean go/no-go."},
  "cacheFactsOf": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns prompt-cache facts (TTL, lost, inFlight); usageCacheKeyFor only reads overage state and linkMemberOf only yields the lost boolean."},
  "claudeSideEffects": {"file": "src/server/session-brain.js", "fields": [], "why": "Device-feed twin of the stream parser: prices each usage record under resolveUsageKey and notes it live; returns nothing."},
  "cliDoor": {"file": "src/routes/provider-models.js", "fields": null, "why": "Builds the CLI-models door handler; cliTarget's account keys the listing request inside it, and the factory hands back only the handler.", "gap": "Returns an Express request handler (a closure); its outcome is an HTTP response, not a value any caller reads."},
  "consumeResetCreditFor": {"file": "src/server/usage-pool-engine.js", "fields": ["preview"], "why": "The manual reset-credit use: spends via writeResetCredit on resetCreditPreview's key inside; its return echoes that preview for the route."},
  "createBody": {"file": "src/ws-create.js", "fields": [], "why": "The create path spawns on resolveForSpawn's account and stamps the held member on the session; the async body returns nothing."},
  "executeFallbackBack": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "B-d578 F3a: a move BACK made — heldPoolMemberFor names the fallback it leaves, fallbackBackTarget the member (re-judged after the record landed); it restarts there and returns {moved, why} only."},
  "fallbackMoveBack": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "B-d578 F3a: the person's press — queues each conversation held by a fallback (heldPoolMemberFor) whose way back fallbackBackTarget names; returns {queued} only."},
  "fallbackStatus": {"file": "src/server/usage-pool-engine.js", "fields": ["provider"], "why": "B-d578 F3a: the pool row's counts per fallback provider: provider = the member heldPoolMemberFor names (a provider id), canReturn counted by fallbackBackTarget."},
  "fallbackFactOf": {"file": "src/server/usage-pool-engine.js", "fields": ["provider", "back"], "why": "B-d578 r3918: the conversation's own strip fact: provider = the member heldPoolMemberFor names (a provider id), back = the member fallbackBackVerdict names now; reads only, moves nothing."},
  "crossVerdictNow": {"file": "src/server/usage-pool-engine.js", "fields": ["curFor"], "why": "B-d578 F2: the ONE re-judgement under allow of a conversation (the cross card's answer through crossMoveNow, the fallback queue's move through fallbackJudge): sessionBillingMember/poolCurrentFor give its currentId, returned as curFor beside the verdict so the caller moves FROM that member."},
  "deliver": {"file": "src/server/auto-resume.js", "fields": [], "why": "attemptFire's post-gate closure: re-resolves identityFor, authorizes and charges the continue inside; returns only a boolean delivered."},
  "deliverToConversation": {"file": "src/server/conversation-deliver.js", "fields": ["identity"], "why": "delivers a message after the spend check; a refusal's object echoes the verdict's identity for the refusal's words and the stash"},
  "dispatch": {"file": "src/server/worker-dispatch.js", "fields": [], "why": "the worker dispatch's spend check before it sends; returns {ok, code, error} — no account in its return"},
  "askOwedCompaction": {"file": "src/server/worker-dispatch.js", "fields": [], "why": "B-ef83 unit 1 (i): the compaction a held gate refused, asked ONCE at that hold's lift — the same peer-compact check before it compacts; returns nothing (its end is the ledger's row and the journal)"},
  "dispatcher": {"file": "src/agent-routes.js", "fields": null, "why": "the agent routes' dispatcher: its sends ask the guard; it returns the dispatcher itself", "gap": "it returns the dispatcher object (its methods close over the authorizer), not a value whose fields can be named"},
  "ensureSessionPoolLink": {"file": "src/accounts.js", "fields": [], "why": "Re-points a session's pool link; poolCurrentFor only feeds the slot ledger's from field, and it returns the link's file path."},
  "evaluateOnHost": {"file": "src/accounts.js", "fields": ["dirEmail"], "why": "Usability verdict for an account on a machine; poolCurrent only checks a pool has a target; dirEmail names a mismatched dir login in a refusal."},
  "gatherPlan": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Plans which conversations may move onto a member; the billing member only gates the provider check; returns sids and skip reasons."},
  "handOverGroups": {"file": "src/server/stash-handover.js", "fields": [], "why": "the group hand-over's spend check per group; returns {ok, code, error} and counts — the verdict's identity is said in words only"},
  "handleResetCreditResult": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Settles a reset-credit answer; liveQuotaKeyFor names the attempt's key for the lookup and the ladder walk; returns nothing."},
  "heldPoolUnknown": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns a boolean (the held member's origin is unknown): a gate that refuses money moves and (B-87fd) files no reading, never the member itself."},
  "judgeFallbackReturns": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "B-d578 F3a: after a pass, each conversation held by a fallback (heldPoolMemberFor) is judged for coming back (fallbackBackTarget): said or queued; returns nothing."},
  "holdRemoved": {"file": "src/server/usage-pool-engine.js", "fields": ["to"], "why": "Parks a removed member's conversation; heldPoolMemberFor/poolCurrent/_wallScope only gate the act; to is the verdict's parking target."},
  "linkHold": {"file": "src/server/usage-pool-engine.js", "fields": ["on", "linked", "held", "via", "viaId", "soonest", "rejector"], "why": "Returns the link member's own quotaVerdictFor verdict when blocked; its callers read only usable/blockedUntil/reason to re-arm or hold."},
  "listOnce": {"file": "src/server/cli-models-door.js", "fields": [], "why": "Lists a CLI's models under resolveForSpawn's spawn env for the account; returns only the store's save promise, no account."},
  "logControlProbe": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Appends one probe-log line whose sessionKey field is resolveUsageKey(session), a journal write; returns nothing."},
  "markLimitBannerNow": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "The slot resolvers pick which cache file a limit banner's wall mark is written on and the wall signal's key; returns nothing."},
  "maybePoolAutoSwitchForPool": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Decides and applies a pool's per-conversation and default switches from the resolved current members; returns nothing."},
  "memberRemoved": {"file": "src/server/usage-pool-engine.js", "fields": ["pool", "removed", "moved", "stayed", "held", "defaultMoved"], "why": "Evicts conversations off removed members; its report echoes each one's member (moved[].from, stayed[].on, held[].on) for the route and suites."},
  "migrateManualPools": {"file": "src/accounts.js", "fields": ["id", "name", "priority"], "why": "One-shot reshape: returns [{id, name, priority}] with poolCurrent seeded first in each new priority order, an ordering not a spend's account."},
  "note": {"file": "src/server/spend-guard.js", "fields": ["identity"], "why": "Records a spend under identityFor's slot in the ledger; returns only the budget warning, which echoes that identity for the notice."},
  "noteLateFact": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Stores usageCacheKeyFor(session) on a held late fact so its replay can compare readings, a write; returns nothing."},
  "noteModelRequest": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Writes linkMemberOf(session) to session._lastRequestMember (where the prompt cache lives), a write; returns nothing."},
  "noteOatFileGen": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Stamps session._oatFileGen with wallSlotFor(session).key and the token file's generation, a write; returns nothing."},
  "notePoolAuthFailure": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Acts on an auth failure of the member poolCurrentFor names (marks it, may move the conversation, logs); returns nothing."},
  "noteTurnAsk": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Records the model family under requestSlotFor(session).key in session._turnAsks, a write; returns nothing."},
  "onMemberReadingFresh": {"file": "src/server/usage-pool-engine.js", "fields": ["member", "pools", "skipped"], "why": "Member-wake pass: fireIdentityFor decides which armed continues fire; its report echoes skipped[].landsOn and the member for the journal."},
  "onRecord": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Workflow tailer callback: prices a sub-agent usage record under resolveUsageKey(session) and notes it live; returns nothing."},
  "onResetCreditHelperDone": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Helper answer: writes the post-consume reading through writeCodexReading and settles the attempt by its key; returns nothing."},
  "onResetCreditSentRecord": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "liveQuotaKeyFor finds the reset-credit attempt to mark as sent, a write that starts the cooldown; returns nothing."},
  "onWalledTurn": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Walled-turn handler: demotes the walled account, arms auto-resume from the verdict on _wallScope, runs the pool switch; returns nothing."},
  "openConversation": {"file": "src/server/conversation-ops.js", "fields": ["identity"], "why": "an automation's open asks the guard; a refusal returns the verdict itself, echoing its identity to the opener's words"},
  "pathBudgetVerdict": {"file": "src/server/channels-engine.js", "fields": [], "why": "Returns {ok, used, lim, why}; accountOfSession's answer appears only as words inside the refusal sentence (display)."},
  "pickLiveProbeSession": {"file": "src/server/usage-pool-engine.js", "fields": null, "why": "Picks a live session to probe through; liveQuotaKeyFor only matches sessions to the target's identity group; callers re-resolve its key.", "gap": "Returns a live session object (the whole mutable session record), not an answer object; no fixed field carries the resolver's answer."},
  "pinRoad": {"file": "src/server/account-usage-routes.js", "fields": null, "why": "B-2083 unit A: the pin route's own two calls (setConversationPin, then the session list's broadcast) handed to the automation verb conversations.pin; its answer reaches src/server/conversation-ops.js pinConversation and the verb's reply (`member`, `current` told to the calling agent), never a spend, a reading's file name or a spawn's account.", "gap": "Returns the road itself (a closure handed through conversation-ops' provide as `pin`), not an answer object; the answer's fields are read only in the verb's reply."},
  "poolAlternativeFor": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns a boolean (can the pool move this conversation now); the current member is only the decision's input."},
  "previewBatch": {"file": "src/server/spend-guard.js", "fields": ["refusedSlots", "overageBilled"], "why": "Previews a bulk resume: identityFor groups items by slot; refusedSlots/overageBilled name accounts for the dialog and plan skips, no charge."},
  "probeUsageForAccountKey": {"file": "src/server/usage-pool-engine.js", "fields": ["target"], "why": "resolveUsageKey only selects which live session to ask; the detail's target is the window guard's write target from guardReadingTarget."},
  "probeUsageViaSession": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns the parsed get_usage reply or null; resolveUsageKey only labels the timeout/unparsed probe-log lines."},
  "projectionRereadFor": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns a burn projection (inMs, label, band, fam); the billing index only names which conversations' families to project."},
  "pushSealedOrders": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Pushes the pool's ranked sealed orders (currentId = poolCurrent) to the device daemon, a write; returns nothing."},
  "quotaVerdictFor": {"file": "src/server/usage-pool-engine.js", "fields": ["on", "linked", "held", "via", "viaId", "soonest", "rejector"], "why": "The quota verdict: on/linked/held echo sessionBillingMember for the journal and tests; callers decide on usable/blockedUntil, never file a spend."},
  "readOnce": {"file": "src/server/cli-usage-door.js", "fields": ["key"], "why": "Runs one on-demand usage read in resolveForSpawn's spawn env; returns {ok, key, ...} where key echoes its input account id."},
  "recordCodexQuotaSignal": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Writes codex readings, notes walls and runs credit rungs; poolDefaultOf is only compared around the switch; returns nothing."},
  "recordRateLimitEventNow": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "The slot resolvers pick where a reading or rejection is written and stamp session._turnReadingSlot; returns nothing."},
  "recordUsageAttribution": {"file": "src/server/usage-attribution.js", "fields": [], "why": "Writes the conversation's resolved member (poolMemberOfSession or poolCurrentFor) into the attribution ledger; returns nothing."},
  "registerProviderModelRoutes": {"file": "src/routes/provider-models.js", "fields": [], "why": "Registers routes whose handlers send accountOfSession's account in the HTTP menu answer (display); the registrar returns nothing."},
  "registerResetCreditRoutes": {"file": "src/routes/reset-credit.js", "fields": [], "why": "Registers the reset-credit routes; resetCreditPreview's and refreshCodexForPerson's answers go out as HTTP JSON; returns nothing."},
  "requestHeldRestart": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns a boolean (a cold restart was asked); heldPoolMemberFor versus poolCurrent only decides whether to send it."},
  "resetCreditCarriers": {"file": "src/server/usage-pool-engine.js", "fields": null, "why": "Lists live sessions able to carry a reset credit for key; liveQuotaKeyFor only filters them by the key's identity group.", "gap": "Returns an array of live session objects (whole mutable records); callers take a carrier's _webuiId, so no fixed answer field exists."},
  "resetCreditRung": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns an outcome word (consumed, asked, skipped, switch-first); creditIdentityFor only names the credit for the act."},
  "resumeBatch": {"file": "src/server/auto-resume.js", "fields": ["refused", "skipped"], "why": "Bulk resume: charges each continue on identityFor's slot inside; returns the batch status, whose refused/skipped rows name accounts in words."},
  "runOracle": {"file": "src/server/permission-rules.js", "fields": [], "why": "Runs a local oracle CLI in resolveForSpawn's spawn env; its result (exit code, streams, json) names the oracle, not an account."},
  "scheduleWallProbe": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Arms the wall probe timer; sessionBillingMember picks the member to probe inside the timer; returns nothing."},
  "sessionWallVerdict": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns {usable, blockedUntil, reason} trimmed from quotaVerdictFor on _wallScope; the verdict's account fields are dropped."},
  "setPoolTarget": {"file": "src/accounts.js", "fields": ["id", "current", "name"], "why": "Re-points the pool default; poolCurrent/poolCurrentFor only feed the ledger's from rows; it returns its input target echoed as current."},
  "setup": {"file": "src/routes/sessions.js", "fields": [], "why": "Registers the session routes; /api/active puts sessionAuth's billing chip in each row (display); setup itself returns nothing."},
  "setupAgentRoutes": {"file": "src/agent-routes.js", "fields": null, "why": "the stop-nudge route asks the guard before it nudges; the answer is a response, nothing returned", "gap": "route setup: the verdict goes into an HTTP response, not a return whose fields can be named"},
  "spendOk": {"file": "src/server/auto-resume.js", "fields": [], "why": "auto-resume's spend check before a continue: asks the guard and returns true / false — the charge is noted inside, nothing handed on"},
  "startOne": {"file": "src/server/delivery-wake.js", "fields": [], "why": "Piece 7 (deliveries resume): the delivery's start judge — usageCacheKeyFor scopes the account's quota verdict, spendGuard.authorize probes the guard (hold: false); returns the outcome and the session id, never an account."},
  "stopped": {"file": "src/server/bulk-resume-routes.js", "fields": null, "why": "the bulk resume's GET route: hands the stopped plan to the page — the rows' identities are the page's words", "gap": "a route handler: the plan (its rows carry each identity) goes into the HTTP response, not a return"},
  "summarizeCodexRateLimits": {"file": "src/usage-routes.js", "fields": ["byAccount", "overall"], "why": "the codex usage summary for the page and the cache: each reading filed under codexKeyOf's account — a map keyed BY account and the newest reading, not an answer of which account a conversation bills"},
  "sweepNonMemberLinks": {"file": "src/server/usage-pool-engine.js", "fields": ["pool", "removed", "moved", "stayed", "held", "defaultMoved"], "why": "Runs memberRemoved for each pool with stale links; returns the array of those reports, which echo members for the journal and suites."},
  "tick": {"file": "src/server/auto-cli-loop.js", "fields": [], "why": "the auto-cli loop's tick reads the member → sessions index to choose due reads; returns nothing"},
  "turnAskedFamily": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Returns a boolean (did this turn ask key for the family); requestSlotFor's key is only compared against it."},
  "unknownHolderOn": {"file": "src/server/usage-pool-engine.js", "fields": null, "why": "B-87fd follow: finds a running codex conversation that MIGHT hold a key (its pool lists it, or liveQuotaKeyFor matches) but whose held member cannot be named — only so the person's ⟳ names that reason; nothing is read through it and nothing is filed by its answer.", "gap": "Returns a live session object (the whole mutable session record), not an answer object; no fixed field carries the resolver's answer."},
  "unplacedOf": {"file": "src/accounts.js", "fields": ["member", "name"], "why": "Returns the UNPLACED mark (the deleted member; the conversation bills nobody); poolCurrent only checks whether it was re-placed."},
  "updatePool": {"file": "src/accounts.js", "fields": ["members"], "why": "writes a pool's members and points its default at the chooser's pick (setPoolTarget); returns the pool record — its members are the accounts it may bill on, watched by §e"},
  "walkLadderAfterCredit": {"file": "src/server/usage-pool-engine.js", "fields": [], "why": "Runs the switch rung and notes a wall signal keyed by liveQuotaKeyFor(s), a decision and a write; returns nothing."},
  "writeResetCreditViaHelper": {"file": "src/server/usage-pool-engine.js", "fields": ["identity"], "why": "Helper-path credit spend: writeCodexReading files the read-first reading; the returned identity is the guard's echo of the input key."},
});
{
  const ENGF = 'src/server/usage-pool-engine.js';
  const base = new Set(RESOLVERS.map((e) => String(e).split('@')[0]));
  const rowAt = (T, name, file) => { const r = T[`${name}@${file}`] || T[name]; return r && r.file === file ? r : null; };
  const isListed = (name, file) => isAnswerAt(name, file) || !!rowAt(CONSUMERS, name, file) || !!rowAt(INNER, name, file);
  const pairsOf = (m) => [...new Set([...m.keys()].map((k) => { const [, f, e] = k.split('|'); return `${e}|${f}`; }))].map((x) => x.split('|'));
  const enclosingOf = (m) => [...new Set(pairsOf(m).map(([e]) => e))];
  const unclassified = (m) => pairsOf(m).filter(([e, f]) => !isListed(e, f)).map(([e, f]) => `${e} (${f})`);
  ok(unclassified(have).length === 0, `every function that calls a resolver is classified once, by name AND file — ${pairsOf(have).length} functions: ${pairsOf(have).filter(([e, f]) => isAnswerAt(e, f)).length} answer, ${pairsOf(have).filter(([e, f]) => rowAt(CONSUMERS, e, f)).length} consume, ${pairsOf(have).filter(([e, f]) => rowAt(INNER, e, f)).length} inner`, unclassified(have));
  const twice = [...Object.keys(CONSUMERS), ...Object.keys(INNER)].filter((n, i, a) => base.has(n) || a.indexOf(n) !== i);
  ok(twice.length === 0, 'no function is in two lists', twice);
  const callersNow = new Set(pairsOf(have).map(([e, f]) => `${e}|${f}`));
  const dead = [...Object.entries(CONSUMERS), ...Object.entries(INNER)].filter(([n, r]) => !callersNow.has(`${n.split('@')[0]}|${r.file}`)).map(([n]) => n);
  ok(dead.length === 0, 'every consumer and inner row still calls a resolver (no dead reason)', dead);
  ok(Object.values(CONSUMERS).every((c) => typeof c.why === 'string' && c.why.length > 40 && (Array.isArray(c.fields) || (c.fields === null && typeof c.gap === 'string' && c.gap.length > 20))) && Object.values(INNER).every((x) => base.has(x.of) && typeof x.why === 'string'),
    'every consumer names its reason and the fields of its return that carry an account (or says why that search is not mechanical); every inner closure names its resolver');
  // CONTROLS
  const pickPlant = '\nfunction pick(s) { return poolCurrent(s._accountId); }\n';
  const pm = unclassified(census(scope(ENGF), (f) => (f === ENGF ? read(f) + pickPlant : read(f))));
  ok(pm.length === 1 && pm[0] === `pick (${ENGF})`, 'CONTROL: a planted plainly named wrapper («pick», returning the pool\'s current) is red by name', pm);
  // a same-named function in ANOTHER file is another function (主开发 09:12Z): a consumer's name planted in a file that is not its own
  const twinPlant = '\nfunction setup(s) { return poolCurrent(s._accountId) ? 1 : 0; }\n';
  const tw = unclassified(census(scope(ENGF), (f) => (f === ENGF ? read(f) + twinPlant : read(f))));
  ok(CONSUMERS.setup && CONSUMERS.setup.file !== ENGF && tw.length === 1 && tw[0] === `setup (${ENGF})`, 'CONTROL: a consumer\'s name («setup») defined in another file is red by name and file', tw);
  // every unscoped resolver has its home, and each home still defines it
  const defines = (file, name) => read(file).split('\n').some((l) => { const m = FN.exec(l); if (m && m.slice(1).find(Boolean) === name) return true; for (const d of l.matchAll(DEP)) if (d[1] === name) return true; return false; });
  const unscoped = RESOLVERS.filter((e) => !String(e).includes('@') && !String(e).includes('.'));
  const homeless = unscoped.filter((n) => !HOME[n] || !HOME[n].length || !HOME[n].every((f) => defines(f, n)));
  ok(homeless.length === 0 && Object.keys(HOME).every((n) => unscoped.includes(n)), `every resolver not scoped to a file has its HOME, and each home still defines it (${unscoped.length} names)`, homeless);
  const moved = 'gatherPlan';   // a consumer moved to answering, without its callers' rows
  const dm = diff(census(files, read, [...RESOLVERS, moved]), want);
  ok(!!CONSUMERS[moved] && dm.fresh.length > 0 && dm.fresh.every((x) => x.startsWith(moved + '|')), 'CONTROL: a consumer moved to answering without its callers\' rows is red (its calls are fresh rows, by name)', dm.fresh);
}

console.log('§e THE ECHO LEG — a consumer\'s reason is CHECKED: no field of its return that carries an account is read into a spend, a reading\'s file name or a spawn\'s account (主开发 2026-11-19 05:43Z)');
// For each consumer with fields: each call of it, the variable its result is bound to on that line, and the next 40 lines — a read of
// one of those fields (off the variable, or off the call itself) on a line that names a SINK is red BY NAME («an echo used as the
// billing account»). The sinks are the stage words in code: a spend (the guard's authorize / noteSpend / a credit's consume / the cost
// record), a reading's file name (the usage cache's writer, its cacheDir), a spawn's account (resolveForSpawn, setPoolTarget, an
// _accountId assignment; the guard's own note and release, through its handle or its noteSpend / releaseSpend). ONE HOP is followed:
// a field renamed into a variable (`const k = r.current`) and that variable read into a sink. THE GAPS, said: a consumer whose return
// is not a plain object (fields null: its row says why); a read in another function than the call's, or past 40 lines; a
// destructured field; a second rename.
export const SINK = /\b(?:authorize|authorizeBatch|authorizeSpend|authorizeSpendBatch|writeCacheObject|writeUsageCacheForKey|setPoolTarget|resolveForSpawn|consumeResetCreditFor|recordUsageAttribution|noteSpend|releaseSpend)\s*\(|\bspendGuard\.(?:note|release)\s*\(|\b_accountId\s*=[^=]|\bcacheDir\s*:/;
export function echoHits(files, readOf, consumers = CONSUMERS) {
  const hits = [];
  const withF = Object.keys(consumers).filter((k) => Array.isArray(consumers[k].fields) && consumers[k].fields.length);
  const esc = (x) => String(x).replace(/[$]/g, '\\$');
  for (const f of files) {
    let text = ''; try { text = readOf(f); } catch { continue; }
    const L = text.split('\n');
    const found = namesIn(text, withF);
    for (const [name, c] of Object.entries(consumers)) {
      const n = name.split('@')[0];
      if (!found.has(n) || !Array.isArray(c.fields) || !c.fields.length) continue;
      L.forEach((line, i) => {
        if (!line.includes(n + '(')) return;
        const at = line.indexOf(n + '('); if (at < 0 || (at > 0 && /[\w$]/.test(line[at - 1]))) return;
        const v = (line.match(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=[^;]*\\b${esc(n)}\\(`)) || [])[1];
        const hop = new Set();   // one hop: a field renamed into a variable, then that variable into a sink
        const reads = (l) => c.fields.some((fl) => (v && new RegExp(`\\b${v}\\??\\.${fl}\\b`).test(l)) || new RegExp(`${esc(n)}\\([^)]*\\)\\??\\.${fl}\\b`).test(l))
          || [...hop].some((x) => new RegExp(`\\b${x}\\b`).test(l) && !new RegExp(`(?:const|let|var)\\s+${x}\\b`).test(l));
        for (let j = i; j < Math.min(L.length, i + 40); j++) {
          if (v) for (const fl of c.fields) { const h = L[j].match(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${v}\\??\\.${fl}\\b`)); if (h) hop.add(h[1]); }
          if (reads(L[j]) && SINK.test(L[j])) { hits.push(`${name} (${f}:${j + 1}): ${L[j].trim().slice(0, 90)}`); break; }
        }
      });
    }
  }
  return hits;
}
{
  const withFields = Object.entries(CONSUMERS).filter(([, c]) => Array.isArray(c.fields) && c.fields.length);
  const eh = echoHits(files, read);
  ok(eh.length === 0, `no consumer's account field is read into a spend, a reading's file name or a spawn's account («an echo used as the billing account») — ${withFields.length} consumers with fields, ${Object.values(CONSUMERS).filter((c) => c.fields === null).length} stated gaps`, eh);
  const [cn, cc] = withFields.find(([, c]) => files.includes(c.file));
  const plantE = `\nfunction plantedEcho(s) { const r = ${cn.split('@')[0]}(s); usageWrite.writeCacheObject({ cacheDir: 'x', key: r.${cc.fields[0]} }); }\n`;
  const ep = echoHits([cc.file], (f) => read(f) + plantE);
  ok(ep.length === 1 && ep[0].startsWith(cn + ' ('), `CONTROL: a planted read of ${cn}()'s «${cc.fields[0]}» into a reading's file name is red by name`, ep);
  const plantH = `\nfunction plantedHop(s) { const r = ${cn.split('@')[0]}(s); const k = r.${cc.fields[0]}; spendGuard.note({ reason: 'x', identity: { key: k } }); }\n`;
  const eh2 = echoHits([cc.file], (f) => read(f) + plantH);
  ok(eh2.length === 1 && eh2[0].startsWith(cn + ' ('), `CONTROL: the same field renamed into a variable, then into the guard's own note, is red by name (one hop)`, eh2);
}

console.log('§f THE HANDED-ON NAMES — a resolver passed BY REFERENCE under another property name is red unless the receiving name is a declared resolver (主开发 2026-11-19 09:12Z)');
// `poolChooser: poolChooserForModel` hands the engine's chooser to the create; ws-create receives it as poolChooser, hands it on as
// chooseMember, and accounts calls opts.chooseMember: every received name is declared where it is called. A reference is a
// property value that ENDS there (`key: name,` / `key: x.name }`), never a call or a test (`x.name ? …`). WHY decideDefaultTarget IS
// NO RESOLVER: it DECIDES the pool default's next member from the readings and calls no resolver; its answer bills only after the
// write it feeds (updatePool / setPoolTarget), which poolCurrent then reads — the chooser it is handed through (chooseDefault,
// chooseMember) is declared. WHY removalTargetFor IS NO RESOLVER (主开发 09:40Z): it DECIDES where a removed member's conversations go
// (the soonest usable member) from the readings and calls no resolver; it is handed on as chooseLink, whose answer bills only after
// the link write it feeds — which poolCurrentFor then reads. THE RECEIVER'S FILE, said: §f checks that the receiving NAME is a
// declared resolver somewhere, not that it is declared in the very file that receives it (a gap by name).
export function handedOn(files, readOf, names = RESOLVERS) {
  const out = [];
  const ents = names.map((e) => { const full = String(e).split('@')[0]; return { full, last: full.split('.').pop(), only: String(e).includes('@') ? String(e).slice(String(e).indexOf('@') + 1) : null }; });
  const alt = [...new Set(ents.map((x) => x.last))].sort((a, b) => b.length - a.length).map((n) => n.replace(/[$]/g, '\\$')).join('|');
  const re = new RegExp(`(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*:\\s*((?:[A-Za-z_$][\\w$]*\\.)*(?:${alt}))\\s*(?=[,}]|$)`, 'gm');
  const declared = new Set(ents.map((x) => x.last));
  for (const f of files) {
    let text = ''; try { text = readOf(f); } catch { continue; }
    for (const m of text.matchAll(re)) {
      const [, key, ref] = m;
      const last = ref.split('.').pop();
      if (key === last) continue;   // shorthand-like `name: name` hands on the same name
      if (!ents.some((x) => x.last === last && (!x.only || x.only === f) && (ref === x.full || ref.endsWith('.' + x.full) || ref === x.last || ref.endsWith('.' + x.last)))) continue;   // that name is no resolver in this file
      const ls = text.lastIndexOf('\n', m.index) + 1, lineText = text.slice(ls, text.indexOf('\n', m.index) < 0 ? text.length : text.indexOf('\n', m.index));
      const t = lineText.trimStart(); if (t.startsWith('//') || t.startsWith('*') || lineText.slice(0, m.index - ls).includes('//')) continue;
      if (!declared.has(key)) out.push(`${f}:${text.slice(0, m.index).split('\n').length} ${key}: ${ref}`);
    }
  }
  return out;
}
{
  const ho = handedOn(files, read);
  ok(ho.length === 0, 'every resolver handed on under another property name is received under a declared name (its calls are rows where it is received)', ho);
  const ENGF = 'src/server/usage-pool-engine.js';
  const hp = handedOn([ENGF], (f) => read(f) + '\nconst plantedDeps = { pickMember: poolCurrentFor, other: 1 };\n');
  ok(hp.length === 1 && hp[0].endsWith(' pickMember: poolCurrentFor'), 'CONTROL: a resolver planted under another property name («pickMember: poolCurrentFor») is red by name', hp);
  const hd = handedOn(['server.js'], (f) => read(f), RESOLVERS.filter((e) => e !== 'poolChooser@src/ws-create.js'));
  ok(hd.some((x) => / poolChooser: poolChooserForModel$/.test(x)), 'CONTROL: the receiving name taken out of the list, server.js\'s poolChooser hand-off is red by name', hd);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
