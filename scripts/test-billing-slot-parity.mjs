#!/usr/bin/env node
// test-billing-slot-parity — B-87fd U5, THE ROOT FIX'S PROGRAMME (lane bl-accounts, 2026-11-18): ONE answer to «which account
// is this conversation billing» over the transition record (src/slot-transitions.js), retiring the pile of resolvers one
// consumer at a time — the way the three-tier table asks for facts about a machine: a census that makes a one-sided edit red.
//
// (a) THE CENSUS (this leg; the lane's census file lists every line). Every call of the nineteen names
//     below in the tracked source (src/ + server.js, git ls-files) is a DECLARED ROW — (resolver, file, enclosing function,
//     stage, count). A call the table does not name is red BY NAME (a new consumer of a resolver the programme retires must
//     say its stage); a row the tree no longer has is red (a dead row: the census shrinks as stages land). The stages, money
//     first: spend → cost → readings → pool → routes; `pile` = a resolver calling a resolver (retired last).
// (b) THE DIFFERENTIAL (with stage 1): seeded transition histories through the real accounts + engine — every resolver still
//     standing answers what the ONE answer answers at that instant. Not in this commit.
// RED CONTROL: a call planted in an in-memory copy of a tracked file is red by name; a removed call is a dead row.
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
  'heldPoolMemberFor', 'creditIdentityFor', 'wallKeyFor', 'poolMemberOfSessionFor', 'liveQuotaKeyFor', 'usageCacheKeyFor', 'linkMemberOf', 'accountOfSession', 'poolCurrent']);
export const STAGES = Object.freeze(['spend', 'cost', 'readings', 'pool', 'routes', 'pile']);
// [resolver, file, enclosing function, stage, calls] — derived by THIS suite's own scan (146 calls: the ten 66, the census cure's nine 80); the census file names each line
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
  ['poolCurrentFor', 'src/server/usage-pool-engine.js', 'crossMoveNow', 'pool', 1],
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
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'crossMoveNow', 'pool', 1],
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
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'recordCodexQuotaSignal', 'readings', 2],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'refreshCodexForPerson', 'readings', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'resetCreditCarriers', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'walkLadderAfterCredit', 'spend', 1],
  ['liveQuotaKeyFor', 'src/server/usage-pool-engine.js', 'writeCodexReading', 'readings', 1],
  ['poolMemberOfSessionFor', 'src/server/usage-pool-engine.js', 'heldPoolMemberFor', 'pile', 1],
  ['poolMemberOfSessionFor', 'src/server/usage-pool-engine.js', 'heldPoolUnknown', 'spend', 1],   // an unknown held member refuses a credit spend
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'cacheFactsOf', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'markLimitBannerNow', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'noteLateFact', 'readings', 1],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'recordRateLimitEventNow', 'readings', 2],
  ['usageCacheKeyFor', 'src/server/usage-pool-engine.js', 'wallSlotFor', 'pile', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', '_wallScope', 'readings', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'creditIdentityFor', 'pile', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'demoteWalledAccount', 'readings', 1],
  ['wallKeyFor', 'src/server/usage-pool-engine.js', 'fireIdentityFor', 'pile', 1],
  ['poolCurrent', 'server.js', 'poolDefault', 'routes', 1],
  ['poolCurrent', 'src/accounts.js', '_healPoolsAfterRemoval', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', '_poolLoginCandidates', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', '_resolveHomeSpawn', 'spend', 1],   // the member a home spawn bills
  ['poolCurrent', 'src/accounts.js', 'evaluateOnHost', 'pool', 1],
  ['poolCurrent', 'src/accounts.js', 'list', 'routes', 1],
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
]);

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
export function census(files, readOf) {
  const out = new Map();
  for (const f of files) {
    let text = ''; try { text = readOf(f); } catch { continue; }
    if (!RESOLVERS.some((n) => text.includes(n + '('))) continue;
    const L = text.split('\n');
    L.forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return;
      for (const n of RESOLVERS) {
        let at = line.indexOf(n + '(');
        while (at >= 0) {
          const before = line.slice(0, at);
          const isDef = /function\s+$/.test(before) || (i >= 0 && new RegExp('^\\s*' + n + '\\s*\\([^)]*\\)\\s*\\{').test(line) && before.trim() === '');
          const word = at > 0 && /[\w$]/.test(line[at - 1]);
          if (!isDef && !word) {
            const k = `${n}|${f}|${enclosing(L, i, before)}`;
            out.set(k, (out.get(k) || 0) + 1);
          }
          at = line.indexOf(n + '(', at + 1);
        }
      }
    });
  }
  return out;
}
const declared = () => { const m = new Map(); for (const [n, f, enc, , c] of ROWS) m.set(`${n}|${f}|${enc}`, (m.get(`${n}|${f}|${enc}`) || 0) + c); return m; };
const diff = (have, want) => ({ fresh: [...have].filter(([k, c]) => (want.get(k) || 0) < c).map(([k, c]) => `${k} ×${c - (want.get(k) || 0)}`), dead: [...want].filter(([k, c]) => (have.get(k) || 0) < c).map(([k, c]) => `${k} ×${c - (have.get(k) || 0)}`) });

console.log('§a THE BILLING-SLOT CENSUS — every call of the ten resolvers is a declared row with its stage');
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
}

console.log('§b THE RESOLVERS ARE WHOLE — a function that reads as an answer and asks a resolver IS one (主开发 2026-11-19 04:09Z)');
// A census of NAMES cannot see a new wrapper: a lane that writes «the held member, else the pool's current» in a new function stays
// green. So, found mechanically: every function DEFINED in the tracked source whose name reads as «which slot / member / identity /
// key / account» and whose body calls a declared resolver is itself declared — a resolver (its calls are rows above) or a
// NOT_RESOLVERS row with its reason; and every name the pool engine EXPORTS (create()'s returned object) that reads so is declared.
// A helper named plainly is not read here — but its call of a resolver is a fresh row of §a, by name.
export const ANSWER_NAME = /^(?:\w*(?:Slot|Member|Identity|Key)For|\w*MemberOf\w*|accountOf\w*|poolCurrent\w*|\w*BillingMember|validateBillingSlot|resolveUsageKey)$/;
export const NOT_RESOLVERS = Object.freeze({});   // name → why (none today: every such function that asks a resolver answers the account)
const declaredName = (n) => RESOLVERS.includes(n) || Object.prototype.hasOwnProperty.call(NOT_RESOLVERS, n);
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
export function answerDefs(files, readOf, resolvers = RESOLVERS) {
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
  ok(RESOLVERS.filter((n) => n !== 'poolMemberOfSession' && n !== 'poolCurrentFor' && n !== 'validateBillingSlot' && n !== 'poolCurrent' && n !== 'resolveUsageKey').every((n) => defs.some((d) => d.name === n)),
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
