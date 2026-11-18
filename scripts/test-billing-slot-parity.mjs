#!/usr/bin/env node
// test-billing-slot-parity — B-87fd U5, THE ROOT FIX'S PROGRAMME (lane bl-accounts, 2026-11-18): ONE answer to «which account
// is this conversation billing» over the transition record (src/slot-transitions.js), retiring the pile of resolvers one
// consumer at a time — the way the three-tier table asks for facts about a machine: a census that makes a one-sided edit red.
//
// (a) THE CENSUS (this leg; the lane's census file lists every line). Every call of the ten names
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
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

export const RESOLVERS = Object.freeze(['fireIdentityFor', 'sessionBillingMember', 'resolveUsageKey', 'validateBillingSlot', 'wallSlotFor', 'rejectionSlotFor', 'requestSlotFor', 'readingSlotFor', 'poolCurrentFor', 'poolMemberOfSession']);
export const STAGES = Object.freeze(['spend', 'cost', 'readings', 'pool', 'routes', 'pile']);
// [resolver, file, enclosing function, stage, calls] — derived by THIS suite's own scan (66 calls); the census file names each line
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
  ['resolveUsageKey', 'src/server/usage-pool-engine.js', 'onRecord', 'readings', 1],
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
  ['resolveUsageKey', 'src/server/session-brain.js', 'claudeSideEffects', 'routes', 1],
  ['resolveUsageKey', 'src/server/stdout/claude-stream-json.js', 'attach', 'routes', 1],
  ['fireIdentityFor', 'server.js', 'fireIdentity', 'spend', 1],   // auto-resume's dependency row on server.js's wiring line
  ['fireIdentityFor', 'src/server/usage-pool-engine.js', 'identityOf', 'spend', 1],
  ['fireIdentityFor', 'src/server/usage-pool-engine.js', 'onMemberReadingFresh', 'spend', 2],
  ['sessionBillingMember', 'src/server/usage-pool-engine.js', 'beforeAutoResumeFire', 'spend', 2],
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
