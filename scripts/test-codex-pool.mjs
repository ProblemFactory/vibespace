#!/usr/bin/env node
// Codex pooled account, cold-switch v1 (P2, design-backend-parity.md §2):
// same three layers as claude's pool — pure decision (reused verbatim),
// symlink material (repointPoolSymlink among CODEX_HOME dirs), cold-restart
// client machinery (already backend-agnostic). Hot switching stays OFF until
// the P3 symlink-swap verification proves the codex app-server re-reads
// auth.json mid-run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// Every patched copy (the R-series negative controls) is written OUTSIDE the
// tree (scripts/mutant-copy.mjs: this process's scratch dir, `require` re-bound
// on line 1 to the real module's path, so relative requires resolve as a
// sibling's). They used to be un-ignored siblings (src/.accounts.<tag>-<pid>.js,
// src/server/.usage-pool-engine.<tag>-<pid>.js, …): the tree was DIRTY while
// the suite ran and every src/ scanner beside it read them as source.
// `copyPath` names a copy, `writeCopy` writes it; R-tree measures the placement.
const MUTCP = mutantCopies('codex-pool', REPO);
const copyOrig = new Map();
let copySeq = 0;
const copyPath = (origRel, tag) => { const p = MUTCP.pathFor(`${path.basename(origRel, '.js')}-${tag}-${++copySeq}`); copyOrig.set(p, origRel); return p; };
const writeCopy = (p, src) => MUTCP.write(copyOrig.get(p), src, null, { esm: false, name: path.basename(p, '.cjs') });

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxpool-'));
process.env.CODEX_HOME = path.join(dataDir, 'shared-codex'); // keep _seedCodexDir off the real ~/.codex
const am = new AccountManager({ dataDir });
const mkSub = (name) => {
  const { id } = am.createCodexSubscription({ name });
  fs.writeFileSync(path.join(am.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name } }));
  return id;
};
const a1 = mkSub('CxA'), a2 = mkSub('CxB');

// ── pool store ──
const pool = am.createPool({ name: 'CxPool', backend: 'codex' });
ok('codex pool creates and targets the first logged-in ChatGPT member', pool.current === a1 || pool.current === a2);
const pid = am.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex')?.id;
ok('the pool record carries backend codex', !!pid);
ok('the pool symlink lives among the CODEX_HOME dirs (data/codex-subs)', fs.readlinkSync(path.join(dataDir, 'codex-subs', pid)).includes('codex-subs'));
ok('poolMembers lists only logged-in ChatGPT subs', am.poolMembers(pid).length === 2 && am.poolMembers(pid).every((m) => [a1, a2].includes(m.id)));
const other = pool.current === a1 ? a2 : a1;
am.setPoolTarget(pid, other);
ok('setPoolTarget repoints atomically and poolCurrent reads the link', am.poolCurrent(pid) === other);
let threw = null; try { am.setPoolTarget(pid, 'sub-nope'); } catch (e) { threw = e.message; }
ok('a non-codex/unknown target refuses loudly', /not a codex subscription|unknown/i.test(threw || ''), threw);

// ── spawn resolution ──
const r = am.resolveForSpawn(pid, 'codex');
ok('a codex session on the pool spawns with CODEX_HOME = the pool symlink', r.kind === 'codex-pooled' && r.localEnv.CODEX_HOME === path.join(dataDir, 'codex-subs', pid));
// self-heal: dead target re-points instead of throwing (the 2.330.2 claude lesson)
fs.rmSync(path.join(am.codexSubDir(other), 'auth.json'));
const r2 = am.resolveForSpawn(pid, 'codex');
ok('a signed-out target self-heals to a live member at spawn', r2 && am.poolCurrent(pid) !== other, JSON.stringify({ cur: am.poolCurrent(pid) }));

// ── engine + wiring pins ──
{
  // ── capability registry (P4 slice, 2.368.21): the engine consults
  // backend-caps.js instead of backend-id special cases; hotSwitch encodes
  // the per-backend VERDICT (claude 'verified' by test-creds-symlink-swap;
  // codex 'impossible' by the 2026-08-24 P3 experiment — CODEX_HOME is
  // canonicalized at startup AND a turn completed on garbage auth content,
  // i.e. tokens live in process memory).
  const { capsOf, BACKEND_CAPS } = require(path.join(REPO, 'src/backend-caps.js'));
  ok("capsOf('claude').hotSwitch === 'verified'", capsOf('claude').hotSwitch === 'verified');
  ok("capsOf('codex').hotSwitch === 'impossible' (P3 experimental verdict, twice over)", capsOf('codex').hotSwitch === 'impossible' && /canonicalizes CODEX_HOME/.test(read('src/backend-caps.js')));
  ok('an unknown backend gets NO capabilities (pool refused, cold, no credits)', capsOf('gemini').pool === false && capsOf('gemini').hotSwitch === 'unverified');
  ok('codex declares resetCredit; claude does not', BACKEND_CAPS.codex.resetCredit === true && BACKEND_CAPS.claude.resetCredit === false);
  const eng = read('src/server/usage-pool-engine.js');
  ok("the eval's hot gate is capability-based (hot only where 'verified')", /const hot = !!a\.hot && poolCaps\.hotSwitch === 'verified';/.test(eng));
  ok('sealed orders + plan-C gate on capabilities, not backend ids', /if \(poolCaps\.sealedOrders\) pushSealedOrders/.test(eng) && /if \(!poolCaps\.planC\) break;/.test(eng));
  // ── reset-credit escape ladder (owner ask: reset vs switch choice) ──
  // 2026-09-08: both calls also hand over the LIMIT LANE they tripped, so a
  // credit that fails arms a wait that names its own wall (an arm with no lane
  // can never be reopened by a reading — see src/auto-resume-signal.js).
  // 2.369.157 (design-reset-credits §2-§4): ONE rung — resetCreditRung, the PURE
  // verdict's consumer — runs BEFORE the switch at both exhaustion sites; the
  // verdict forks it by warmth (a cold conversation with somewhere to go is
  // refused `cold-switch-first`, so the switch rung moves it). The wiring pins
  // live in test-reset-credit-verdict §7; the behaviour is driven in §R below.
  // r2: the rung's args ride `rcArgs` so a switch that moved nothing re-asks at `after-switch` (pinned exactly in test-reset-credit-verdict §7)
  ok('exhaustion ladder: the credit rung → ② pool switch → ③ auto-resume (both sites)', /const rcArgs = \{ resetsAtSec: tripped\?\.resetsAt, lane: arSignal\.laneOf\(w\.snap\)[^\n]*\n\s*const rung = resetCreditRung\(session, rcArgs\);\s*\n\s*if \(rung === 'consumed'\) return;[\s\S]{0,300}maybePoolAutoSwitch\(session\)/.test(eng) && /const rcArgs = \{ resetsAtSec: resets, lane: arSignal\.laneOf\(w2\?\.snap \|\| snap\)[^\n]*\n\s*const rung = resetCreditRung\(session, rcArgs\);\s*\n\s*if \(rung === 'consumed'\) return;[\s\S]{0,300}maybePoolAutoSwitch\(session\)/.test(eng));
  // 2.369.123 (design-harness-settings §5): the row is read through the DESCRIPTOR of the session's own backend — never a literal harness id (test-architecture §46 censuses the old spelling)
  ok("…the mode (off | ask | auto, default off) is read through the session's harness; the one-try floor is the verdict's cooldown", /harnessDeclares\(session\.backend, 'limitResetCredit'\)\) return null;\s*\n\s*return harnessSetting\(session\.backend, 'limitResetCredit'\) \|\| 'off';/.test(eng) && /cooldownUntilSec: tried \? Math\.floor\(\(tried \+ RESET_CREDIT_FLOOR_MS\) \/ 1000\) : null,/.test(eng) && /const RESET_CREDIT_FLOOR_MS = 10 \* 60e3;/.test(eng));
  // round 4: the recovery call also CLASSIFIES itself — a redeemed credit
  // moved the LIMIT, it is not proof this conversation produced anything, so
  // it disarms the wait without clearing the loop breaker (the full table of
  // noteRecovered callers is derived + enforced in test-auto-resume-loop §5)
  // p2 (2.369.157): a PERSON's failed attempt is reported (a notice) and returns BEFORE the ladder — the window grew by that branch
  // r2: the switch/wait rungs after a credit are ONE function (walkLadderAfterCredit) the attempt's own conversation AND its followers walk
  ok('a successful reset recovers in place (disarm yes, breaker no); a failed one falls through the ladder', /out === 'reset'[\s\S]{0,1200}noteRecovered\?\.\(session\._webuiId, 'codex reset credit consumed', \{ worked: false \}\)[\s\S]{0,4000}codex-reset-credit-failed[\s\S]{0,3500}walkLadderAfterCredit\(session, /.test(eng) && /function walkLadderAfterCredit\(s, [^\n]*\n\s*maybePoolAutoSwitch\(s\);\s*\n\s*try \{ noteWallSignal\(s, /.test(eng));
  ok('…unless it was a PERSON\'s attempt (the manual button): reported by name, never walked down the switch/wait ladder', /const userAttempt = session\._resetCreditOrigin === 'user';\s*\n\s*session\._resetCreditOrigin = null;/.test(eng) && /if \(userAttempt\) \{\s*\n\s*serverNotice\([^\n]*Reset credit not used on[^\n]*\n\s*return;\s*\n\s*\}\s*\n\s*if \(alreadyWalked\) return;[^\n]*\n\s*walkLadderAfterCredit\(session, /.test(eng));
  // the row lives in the codex harness's DECLARED table (src/harness-settings.js) and the schema DERIVES the Codex section from it (2.369.123)
  const { HARNESS_SETTINGS: HS_TABLES, rowOf: hsRowOf } = require(path.join(REPO, 'src/harness-settings.js'));
  const lrc = hsRowOf(HS_TABLES.codex, 'limitResetCredit');
  ok('the setting exists in the Codex group: off | ask | auto, default off (NEVER auto by default)', !!lrc && lrc.default === 'off' && JSON.stringify(lrc.options.map((o) => o.value)) === '["off","ask","auto"]' && lrc.apply.kind === 'server' && /deriveHarnessTable\(tbl\)/.test(read('src/lib/settings-schema.js')));
  ok('session-schema registers the throttle fields', /_codexResetTriedAt/.test(read('src/session-schema.js')) && /_codexLastResetsAt/.test(read('src/session-schema.js')));
  const wsrc = read('src/ws-handler.js');
  // 2.369.151: CAPABILITY-gated (quotaProbe 'rpc-rate-limits'), never a backend id — test-harness-contract pins the verdict per harness.
  // r2 (design-reset-credits): the RESET verb is no ws case any more — it bypassed the engine's ONE writer (test-reset-credit-ui §4 censuses every writer)
  ok('the manual read is a ws case gated on the harness caps row (quotaProbe rpc-rate-limits), not a backend id; the reset verb is NOT a ws case', /case 'codex-read-limits': \{/.test(wsrc) && /const served = qcaps\.quotaProbe === 'rpc-rate-limits';/.test(wsrc) && !/case 'codex-reset-credit':/.test(wsrc) && !/session\.backend === 'codex'/.test(wsrc));
  const w2 = read('data/bin/codex-chat-wrapper.js');
  ok('the wrapper serves both verbs via the LIVE app-server RPC (rateLimits/read + rateLimitResetCredit/consume)', /account\/rateLimits\/read/.test(w2) && /account\/rateLimitResetCredit\/consume/.test(w2) && /reset_credit_result/.test(w2));
  // ── reset-credit COUNT in the usage popup (owner: usage里展示剩余reset) ──
  ok('the wrapper reads limits ONCE at startup (credits only ride rateLimits/read, never the passive push)', /readAccountLimits\(false\); \/\/ surface reset-credit count/.test(w2));
  ok('the codex harness keeps resetCredits on the account snapshot (S4: the engine writes sig.snapshot)', /snapshot\.resetCredits = \{ availableCount:/.test(read('src/harnesses/codex-quota.js')) && /const snap0 = sig\?\.snapshot \|\| null;/.test(eng));
  ok('…and the sidecar reader merges meta.rateLimitResetCredits', /snap\.resetCredits = \{ availableCount:/.test(read('src/usage-routes.js')));
  const um2 = read('src/lib/usage-meter.js');
  ok('the popup shows the stored reset-credit count', /Reset credits'\)\)\}<\/span> \$\{Number\(codex\.resetCredits\.availableCount\)/.test(um2));
  ok("…and the codex ⟳ is CAPABILITY-gated (quotaRefresh 'session-rpc'), riding a live session's app-server", /backendFeatureCaps\('codex'\)\.quotaRefresh === 'session-rpc'/.test(um2) && /_refreshCodexQuota\(btn\)/.test(um2) && /codex-read-limits', sessionId: live\.webuiId/.test(um2));
  ok('recordCodexQuotaSignal exists: readings write the member cache, exhaustion switches then feeds the WALL MACHINE (2.369.0)', /function recordCodexQuotaSignal[\s\S]{0,14000}maybePoolAutoSwitch\(session\); \/\/ another ChatGPT account[\s\S]{0,800}noteWallSignal/.test(eng)); // window 9000→9500 in 2.369.123: tryResetCredit reads the row through the descriptor (harnessDeclares + harnessSetting), +~80 chars inside the function; →14000/800 in r2 (the credit result's followers + superseded check, the after-switch re-ask)
  ok('…typed exhaustion enum covers the workspace variants (owned by the codex harness since S4)', /usage_limit_reached\|quota_exceeded\|usage_not_included\|workspace_owner_usage_limit_reached\|workspace_member_usage_limit_reached\|workspace_member_credits_depleted/.test(read('src/harnesses/codex-quota.js')) && !/CODEX_EXHAUSTION_RE/.test(eng));
  // r2: …on the member the process HOLDS when it was stamped at spawn (a codex wrapper cannot follow a re-point), else the current member
  ok('…a pool-billed reading lands on the member (the held one, else the CURRENT one), never the pool wrapper', /a\.type === 'pooled'\) key = heldPoolMemberFor\(session, key\) \|\| accounts\.poolCurrentFor\(key, session\._webuiId\)/.test(eng));
  const ss = read('src/server/stdout/codex-events.js'); // S5: the codex-events consumer module
  ok('the codex stdout pipeline feeds the engine (rate_limits_updated + task_failed + reset_credit_result)', /rate_limits_updated' \|\| msg\.payload\?\.type === 'task_failed' \|\| msg\.payload\?\.type === 'reset_credit_result'\)/.test(ss) && /recordCodexQuotaSignal\?\.\(session, msg\.payload\)/.test(ss));
  const w = read('data/bin/codex-chat-wrapper.js');
  ok('the wrapper RELAYS rateLimits to stdout (sidecar was display-only)', /emitTaskEvent\('rate_limits_updated', \{ rateLimits: params\.rateLimits \}\)/.test(w));
  ok('…and forwards the typed codex_error_info on task_failed (it was dropped)', /codexErrorInfo: params\?\.codexErrorInfo \?\? params\?\.codex_error_info/.test(w));
  ok('the pool-create route accepts backend codex', /backend: req\.body\?\.backend === 'codex' \? 'codex' : 'claude'/.test(read('src/server/account-usage-routes.js')));
}

// ── list() pool shape for EVERY backend + ONE shared pool UI (2.369.18, P1) ──
{
  // The codex branch of list() used to run BEFORE the pooled branch, so a
  // codex pool listed as a bare ChatGPT login — no pooled/current/currentName/
  // memberOptions/auto/hot — and no client surface could operate it (nor
  // could the engine's `type==='pooled' && a.auto` tick enumeration see it).
  // Identity must read THROUGH the symlink with the member's own reader:
  // give the current member an id_token carrying email + plan (the real
  // auth.json shape: tokens.id_token JWT with the openai auth claim).
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cur = am.poolCurrent(pid);
  const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: 'cxa@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } })}.sig`;
  fs.writeFileSync(path.join(am.codexSubDir(cur), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-cur', id_token: idTok } }));
  const row = am.list().accounts.find((a) => a.id === pid);
  ok('a codex pool row is POOLED (pooled:true, type pooled, backend codex)', row?.pooled === true && row.type === 'pooled' && row.backend === 'codex', JSON.stringify(row));
  ok('…carries current + currentName (the member the symlink points at)', row?.current === cur && row.currentName === am.get(cur)?.name, JSON.stringify({ current: row?.current, cur }));
  ok('…carries memberOptions = poolMembers (logged-in ChatGPT members only)', JSON.stringify((row?.memberOptions || []).map((m) => m.id)) === JSON.stringify(am.poolMembers(pid).map((m) => m.id)) && row?.memberOptions?.length === 1);
  ok('…carries auto/hot flags (false by default) and members:null (= all)', row?.auto === false && row?.hot === false && row?.members === null);
  ok("…hotSupported is the registry verdict: codex 'impossible' ⇒ false (the UI hides the toggle)", row?.hotSupported === false);
  ok('…supported is true for codex (the darwin exclusion is claude-keychain-specific)', row?.supported === true);
  ok('…identity reads THROUGH the symlink with the codex reader (loggedIn + email + plan of the current member)', row?.loggedIn === true && row?.email === 'cxa@example.com' && row?.subscriptionType === 'plus', JSON.stringify({ loggedIn: row?.loggedIn, email: row?.email, plan: row?.subscriptionType }));
  // negative control: a plain codex login row keeps its own shape
  const plain = am.list().accounts.find((a) => a.id === cur);
  ok('negative control: a plain ChatGPT login row is NOT pooled and keeps authMode', plain && !plain.pooled && plain.type === 'subscription' && plain.authMode === 'chatgpt' && plain.email === 'cxa@example.com');
  // the engine's tick enumerates auto pools from list() — a codex pool must be visible there
  am.updatePool(pid, { auto: true });
  ok("the engine's auto-pool enumeration (list().filter(type==='pooled' && auto)) SEES a codex pool", (am.list().accounts || []).filter((a) => a.type === 'pooled' && a.auto).some((a) => a.id === pid));
  // claude pool for the hotSupported contrast (linux only — createPool refuses on darwin by design)
  if (am.poolSupported()) {
    const { id: cs } = am.createSubscription({ name: 'ClA' });
    fs.writeFileSync(am.subCredsPath(cs), JSON.stringify({ claudeAiOauth: { accessToken: 'at', subscriptionType: 'max' } }));
    const cp = am.createPool({ name: 'ClPool' });
    const crow = am.list().accounts.find((a) => a.id === cp.id);
    ok("a claude pool row says hotSupported:true ('verified') with the same pool shape", crow?.pooled === true && crow.backend === 'claude' && crow.hotSupported === true && crow.current === cs && crow.loggedIn === true && crow.subscriptionType === 'max', JSON.stringify(crow));
  } else console.log('  · SKIP claude pool contrast (pools unsupported on ' + process.platform + ')');

  // ── static pins: the ordering fix + ONE pool menu for both rosters ──
  const acc = read('src/accounts.js');
  const listBody = acc.slice(acc.indexOf('  list() {'), acc.indexOf('// ── Subscription accounts'));
  ok('accounts.list() evaluates the pooled branch BEFORE the (now harness-neutral, S2) subscription branch', listBody.indexOf("if (type === 'pooled')") > 0 && listBody.indexOf("if (type === 'pooled')") < listBody.indexOf("if (type === 'subscription')") && !/if \(backend === 'codex'\) \{/.test(listBody));
  ok('…the pool row reads identity via the backend\'s own auth reader and carries the registry\'s hotSwitch verdict', /this\._readAuthFor\(backend, a\.id\)/.test(listBody) && /hotSupported: capsOf\(backend\)\.hotSwitch === 'verified'/.test(listBody));
  const ma = read('src/lib/manage-agents.js');
  const count = (s, re) => (s.match(re) || []).length;
  ok('manage-agents defines ONE pool menu block (_poolMenuItems)', count(ma, /_poolMenuItems\(id, a, refresh\) \{/g) === 1);
  ok('…spliced into BOTH rosters (claude + codex) — no per-backend copy', count(ma, /items\.splice\(0, 1, \.\.\.this\._poolMenuItems\(id, a, refresh\)\)/g) === 2);
  ok('…the Switch target / Hot switch labels live ONLY in the shared block', count(ma, /t\('Switch target'\)/g) === 1 && count(ma, /t\('Hot switch \(no restart\)'\)/g) === 1 && count(ma, /t\('Auto-switch when nearly exhausted'\)/g) === 1);
  ok("…the hot toggle is gated on the server's hotSupported verdict (codex gets a disabled explanatory row, SVG-free text)", /const hotOk = a\.hotSupported !== false;/.test(ma) && /if \(hotOk\) items\.push\(\{ label: \(a\.hot \? '✓ ' : ''\) \+ t\('Hot switch \(no restart\)'\)/.test(ma) && /Hot switch unavailable — every switch restarts the session/.test(ma));
  ok('…a codex pool cold-restarts even when hot is set (effHot = hotOk && a.hot)', /const effHot = hotOk && !!a\.hot;/.test(ma) && /this\._poolSwitchTarget\(id, m\.id, a\.name, effHot\)/.test(ma));
  ok('…the members dialog filters members by the POOL\'s backend and uses the same effective-hot rule', /\(x\.backend \|\| 'claude'\) === be && !x\.pooled/.test(ma) && /const effHot = a\?\.hotSupported !== false && !!a\?\.hot;/.test(ma) && /if \(!effHot\) for \(const sess of \(r\.affected \|\| \[\]\)\) this\._poolColdRestart/.test(ma));
  ok('…ONE create-pool dialog for both rosters (api(), so a refused create is a visible error)', count(ma, /_createPoolDialog\(/g) === 3 && /await api\('\/api\/accounts\/pool', \{ method: 'POST'/.test(ma) && !/fetchJson\('\/api\/accounts\/pool'/.test(ma));
  ok('…BOTH rosters sort with the shared rosterSort (pool → login → key)', count(ma, /\.sort\(rosterSort\)/g) === 2 && /export const rosterSort/.test(ma));
  ok('…the codex roster draws the POOL glyph (shared ROSTER_ICONS, SVG) and shows → target + the target\'s usage', /const \{ CROWN, GLOBE, POOL, STAR_F, STAR_O, DOTS \} = ROSTER_ICONS;/.test(ma) && count(ma, /isPool \? POOL : /g) === 2 && /no target — pick a ChatGPT account in ⋯/.test(ma) && /this\._codexAccountUsage\[a\.current\], this\._usageEstimates\?\.\[a\.current\]/.test(ma));
  ok('…codex pool rows never get the set-email item (identity is the member\'s)', /if \(!a\?\.pooled && a\?\.loggedIn && \(!a\.email \|\| a\.emailDeclared\)\) items\.push/.test(ma));
  // the three wrong-icon/label surfaces
  const sv = read('server.js');
  ok('server.js sessionAuth: a codex pool reports source pooled + poolTarget (the status-bar chip / title badge / session props render it as a pool)', count(sv, /if \(a && a\.type === 'pooled'\) return poolAuth\(a\);/g) === 2 && /const poolAuth = \(a\) =>/.test(sv));
  ok('chat-status-bar + window.js consume source pooled with the pool glyph + target (unchanged consumers)', /isPooled \? '⣿ ' \+ \(a\.name \|\| t\('Pool'\)\) \+ \(a\.poolTarget/.test(read('src/lib/chat-status-bar.js')) && /const isPooled = auth\.source === 'pooled';/.test(read('src/lib/window.js')));
  ok('usage-meter: codex account chips exclude pools (a pool is not a quota holder — same rule as claudeSubs)', /a\.backend === 'codex' && a\.type === 'subscription'\)/.test(read('src/lib/usage-meter.js')));
  ok('session-card ⚙ account list: a pool row names its target (was "— API …undefined")', /\(a\.pooled \|\| a\.type === 'pooled'\) \? a\.name \+ \(a\.currentName \? ` → \$\{a\.currentName\}` : ' · ' \+ tr\('pool'\)\)/.test(read('src/lib/session-card.js')));
  ok('session-props billing row: pooled / codex-subscription / codex-cli are labeled, never "Unknown"', /a\.source === 'pooled' \? t\('Pooled account — \{name\}'/.test(read('src/lib/session-props.js')) && /a\.source === 'codex-subscription' \? t\('ChatGPT account — \{name\}'/.test(read('src/lib/session-props.js')) && /a\.source === 'codex-cli' \? t\('ChatGPT login \(the machine’s own\)'\)/.test(read('src/lib/session-props.js')));
  // i18n: every new human-visible string has zh + ja entries
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['no logged-in ChatGPT accounts', 'Hot switch unavailable — every switch restarts the session', 'All ChatGPT accounts', 'Pool set to all ChatGPT accounts (incl. future ones)',
    'no target — pick a ChatGPT account in ⋯', 'Pooled account — one billing identity auto-switching across your ChatGPT accounts', 'Pooled account — {name}', 'ChatGPT account — {name}', 'ChatGPT login (the machine’s own)',
    'The pool switches between these ChatGPT accounts. Not-signed-in accounts are skipped until they log in.'];
  const missing = keys.filter((k) => !zh.includes(`"${k}":`) || !ja.includes(`"${k}":`));
  ok('zh + ja dictionaries carry every new pool-UI key', missing.length === 0, missing.join(' | '));
}

// ── §R THE RESET-CREDIT RUNG ON THE REAL ENGINE (design-reset-credits §2-§4) ──
// A real codex pool (two ChatGPT members, real symlinks), the REAL engine and its
// REAL spend guard, a stub codex wrapper (the session's stdin collects the verbs
// the real wrapper would serve). The wall is the production exhaustion record
// (`task_failed` + codexErrorInfo) the codex stdout consumer hands the engine.
{
  console.log('\n§R the reset-credit rung on the real engine');
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const worlds = [];
  // r2: `sessions` conversations on the pool, each `held` = stamped with the member
  // its process holds, exactly as ws-create stamps a pool spawn on a backend that
  // cannot hot-switch (`_heldPoolMember`); `cacheModule` swaps the cache writer
  // r3: `clients` = fake ws clients (the cold-restart requests land in `sentWs`),
  // `realAr` = the REAL auto-resume wired exactly as server.js wires it (continues
  // land in `sent`), `stubLimits` = the stub wrapper answers codex-read-limits
  // r4: `metaStore` = the lazy session-meta store the engine persists a ledger-derived stamp through; `newEngine()` = a
  // second engine over the SAME world (a server restart: nothing in memory, the inbox and the sessions survive)
  const world = ({ mode = 'off', otherSpent = false, warm = true, hourCap = 100, credits = 3, engineModule = engMod, sessions: nSess = 1, held = false, clients = 0, realAr = false, metaStore = null } = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-'));
    worlds.push(root);
    const prevHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(root, 'shared-codex');
    const wam = new AccountManager({ dataDir: path.join(root, 'data') });
    // two DISTINCT identities (an id_token each, the real auth.json shape): two
    // identity-less logins would read as ONE usage identity, and the engine reads
    // quota through the identity group (freshest file wins)
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sub = (name) => {
      const { id } = wam.createCodexSubscription({ name });
      const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: name.replace(/\W+/g, '').toLowerCase() + '@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-' + name.replace(/\W+/g, '') } })}.sig`;
      fs.writeFileSync(path.join(wam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: idTok } }));
      return id;
    };
    const A = sub('Cx Alpha'), B = sub('Cx Beta');
    wam.createPool({ name: 'CxRung', backend: 'codex' });
    const P = wam.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex').id;
    wam.setPoolTarget(P, A); wam.updatePool(P, { auto: true });
    process.env.CODEX_HOME = prevHome;
    const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    const cache = (u) => ({ fetchedAt: Date.now() - 60e3, source: 'codex-rate-limits', limitId: 'codex', fiveHour: { utilization: u, usedPercent: u * 100, windowMinutes: 300, resetsAt: nowS + 3600 }, sevenDay: { utilization: u, usedPercent: u * 100, windowMinutes: 10080, resetsAt: nowS + 3 * 86400 } });
    fs.writeFileSync(path.join(cacheDir, A + '.json'), JSON.stringify(cache(0.5)));
    fs.writeFileSync(path.join(cacheDir, B + '.json'), JSON.stringify(cache(otherSpent ? 1 : 0.2)));
    const settings = { 'codex.limitResetCredit': mode, 'spend.unattendedPerIdentityHour': hourCap };
    const sessions = new Map(), notices = [], inbox = [], cards = [], arms = [];
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const sentWs = [], attrib = [], sent = [];
    const wsClients = new Set(); for (let i = 0; i < clients; i++) wsClients.add({ readyState: 1, send: (x) => sentWs.push(JSON.parse(x)) });
    let arRef = null;
    const stubAr = { armIfEnabled: (sid, s2, until, why) => arms.push({ sid, until, why }), noteRecovered() { }, noteFireOutcome() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } };
    const todos = { add: (key, item) => { const it = { id: 'ut-' + (inbox.length + 1), key, status: 'open', ...item }; inbox.push(it); return it; }, snapshot: () => ({ open: inbox.filter((x) => x.status === 'open'), resolved: [] }), setStatus: (id, st, by) => { const it = inbox.find((x) => x.id === id); if (it) { it.status = st; it.resolvedBy = by; } return it; } };
    const deps = {
      app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: wsClients }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t),
      serverSetting: (k) => settings[k], getAccounts: () => wam, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution: (m) => attrib.push(m), adapterRegistry: { get() { return null; } },
      getAutoResume: () => (realAr ? arRef : stubAr),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
      getUserTodos: () => todos, getSessionMetaStore: () => metaStore,
    };
    const eng = engineModule.create(deps);
    const newEngine = () => engineModule.create(deps);
    if (realAr) {
      const arMod = require(path.join(REPO, 'src/server/auto-resume.js'));
      const arDir = path.join(root, 'ar'); fs.mkdirSync(arDir, { recursive: true });
      arRef = arMod.create({
        dataDir: arDir, activeSessions: sessions, serverSetting: () => true, log: (...a) => console.log(...a), notifyDelayMs: 0,
        beforeFire: (id, s2) => { try { return eng.beforeAutoResumeFire(id, s2); } catch { return false; } },
        fireIdentity: (id, s2) => { try { return eng.fireIdentityFor(s2); } catch { return null; } },
        authorizeSpend: (id, s2, identity, o) => eng.spendGuard.authorize({ reason: 'auto-resume', session: s2, sessionId: id, sessionName: s2 && s2.name, identity, hold: !!(o && o.hold) }),
        noteSpend: (id, s2, identity, hold) => eng.spendGuard.note({ reason: 'auto-resume', session: s2, identity, hold }),
        releaseSpend: (id, s2, hold) => eng.spendGuard.release({ hold }),
        notify: () => { }, sendToSession: (id, s2, text, carried) => { sent.push({ id, text, carried }); return true; },
        resetCreditOffer: (id, s2) => eng.resetCreditOffer(s2),
      });
    }
    const mk = (i) => {
      const s = {
        backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx' + i, backendSessionId: 'thread-' + i, _accountId: P, name: i === 1 ? 'cx-conv' : 'cx-conv-' + i,
        // the production shape (ws-create stamps createdAt at spawn): an UNSTAMPED
        // session is answered by the slot-transition ledger (r3); held 'unknown'
        // = a process older than every ledger row (nothing can name its login)
        createdAt: held === 'unknown' ? 1 : Date.now(),
        wrote: [], _normalizer: { injectPeerCard: (card) => { cards.push(card); return card; } },
        ...(held === true ? { _heldPoolMember: A } : {}),
        ...(warm ? { _isStreaming: true, _turnState: 'running', _lastPtyDataAt: Date.now() } : { _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now() - 3 * 3600e3 }),
      };
      // THE STUB WRAPPER: collects verbs; answers codex-read-limits (a macrotask
      // later, like the real app-server round trip) with `stubLimits()` if set
      s.stubLimits = null;
      s.pty = { write: (x) => { s.wrote.push(String(x)); if (/"codex-read-limits"/.test(String(x)) && s.stubLimits) setImmediate(() => { try { eng.recordCodexQuotaSignal(s, s.stubLimits()); } catch { } }); } };
      if (realAr) s._autoResume = true;
      sessions.set(s._webuiId, s);
      return s;
    };
    const ss = []; for (let i = 1; i <= nSess; i++) ss.push(mk(i));
    const s1 = ss[0];
    // the on-demand read the wrapper does at startup carries the stored count
    if (credits != null) for (const s of ss) eng.recordCodexQuotaSignal(s, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: credits }, rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: nowS + 3 * 86400 }, secondary: null } });
    // the wall comes LATER than that read: the cache write keeps the newer file,
    // and a wall stamped in the same millisecond as the read would lose the tie
    { const t0 = Date.now(); while (Date.now() < t0 + 2) { } }
    const wall = (s = s1, resetsAt = nowS + 7200) => eng.recordCodexQuotaSignal(s, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt });
    const verbs = (s = null) => (s ? [s] : ss).reduce((n, x) => n + x.wrote.filter((y) => /"codex-reset-credit"/.test(y)).length, 0);
    // the spend ceiling's per-IDENTITY ledger ({A: n, B: n})
    const charges = () => { const id = eng.spendGuard.snapshot().budget.identities || {}; return { A: (id[A] || []).length, B: (id[B] || []).length }; };
    const reading = (s = s1, usedPct = 60, resetsAt = nowS + 3 * 86400) => eng.recordCodexQuotaSignal(s, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: usedPct, window_minutes: 10080, resets_at: resetsAt }, secondary: null } });
    const cacheOf = (k) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, k + '.json'), 'utf8')); } catch { return null; } };
    return { root, wam, eng, newEngine, ar: arRef, P, A, B, s1, ss, mk, wall, reading, verbs, charges, notices, inbox, cards, arms, sentWs, attrib, sent, cacheOf, current: () => wam.poolCurrent(P), settings, cacheDir, nowS, sessions };
  };
  const quietly = (fn) => { const o = console.log, w = console.warn; const lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { fn(); } finally { console.log = o; console.warn = w; } return lines; };

  // (1) WARM + AUTO: the credit BEFORE the switch — authorizer, one verb, the floor
  {
    const w = world({ mode: 'auto' });
    const lines = quietly(() => w.wall());
    ok('R1 warm + auto: the reset-credit verb is written ONCE', w.verbs() === 1, `verbs=${w.verbs()} | ${lines.join(' | ').slice(0, 300)}`);
    ok('R1 …BEFORE any switch: the pool default did not move', w.current() === w.A, w.current());
    ok('R1 …through the spend ceiling: the guard charged exactly one unattended spend', (w.eng.spendGuard.snapshot().budget.instance || []).length === 1, JSON.stringify(w.eng.spendGuard.snapshot().budget.instance));
    // the wall is stamped nowS + 7200 at world creation and the product measures the wait from ITS clock at the wall,
    // so the saved wait is 2h minus the fixture's age — under a loaded gate a second boundary passed and the hook
    // read "1h 59m" (2.369.170, the .169 push): the wait is asserted as a band, never a literal
    ok('R1 …the notice names the account, the wait saved and the credits left', w.notices.some((n) => /Usage limit hit on Cx Alpha — using a stored reset credit — saves a wait of (2h|1h 5\dm); 2 left after this one \(warm conversation: before switching accounts\)\./.test(n)), JSON.stringify(w.notices));
    ok('R1 …journaled with the verdict reason', lines.some((l) => /\[reset-credit\] cx1: worth it \(wall-use-now/.test(l) && /in-turn/.test(l)), lines.join(' | ').slice(0, 300));
    quietly(() => w.wall());
    ok('R1 a second wall inside the 10-min floor writes NO second verb (the verdict\'s cooldown)…', w.verbs() === 1, `verbs=${w.verbs()}`);
    ok('R1 …and the ladder continues: the switch rung moves the pool to the other member', w.current() === w.B, w.current());
  }
  // (2) WARM + ASK: ONE For-you item, then the switch
  {
    const w = world({ mode: 'ask' });
    quietly(() => w.wall());
    ok('R2 warm + ask: NO verb is written (ask never spends)', w.verbs() === 0);
    ok('R2 …exactly ONE For-you action item on this conversation\'s session key', w.inbox.length === 1 && w.inbox[0].key === 'codex:thread-1' && w.inbox[0].kind === 'action', JSON.stringify(w.inbox));
    const it = w.inbox[0] || {};
    ok('R2 …worded as structure (i18n) with the dialog\'s sentences, and a reset-credit action payload',
      it.i18n?.text?.key === 'Use a stored reset credit on {account}?' && it.i18n.text.params.account === 'Cx Alpha'
      && Array.isArray(it.i18n.detail) && it.i18n.detail[0].key === 'Starts a new {period} window now, running until {until}.'
      && it.action?.type === 'reset-credit' && it.action.sessionId === 'cx1' && it.action.creditsLeft === 3, JSON.stringify(it));
    ok('R2 …then the switch rung ran: the pool moved to the other member', w.current() === w.B, w.current());
    ok('R2 …and the wall card names the credits and carries the offer {available, mode, accountKey}', w.cards.length === 1 && /3 stored reset credits available/.test(w.cards[0].text) && JSON.stringify(w.cards[0].resetCredit) === JSON.stringify({ available: 3, mode: 'ask', accountKey: w.A }), JSON.stringify(w.cards));
    // the restatement needs the conversation to STAY on the walled member (after a
    // switch a new wall is a new member's, i.e. a new event): no member can serve
    const w2 = world({ mode: 'ask', otherSpent: true });
    quietly(() => { w2.wall(); w2.wall(); w2.wall(); });
    ok('R2 the SAME limit event restated three times files ONE item and ONE card', w2.inbox.length === 1 && w2.cards.length === 1 && w2.current() === w2.A, `${w2.inbox.length}/${w2.cards.length}`);
  }
  // (3) COLD + AUTO: switch first; the credit only when no member serves
  {
    const w = world({ mode: 'auto', warm: false });
    const lines = quietly(() => w.wall());
    ok('R3 cold + auto with a healthy member: the pool SWITCHES and no credit is spent', w.current() === w.B && w.verbs() === 0, `${w.current()} verbs=${w.verbs()}`);
    ok('R3 …the journal says why (cold-switch-first)', lines.some((l) => /kept \(cold-switch-first/.test(l)), lines.join(' | ').slice(0, 300));
    const w2 = world({ mode: 'auto', warm: false, otherSpent: true });
    quietly(() => w2.wall());
    ok('R3 cold + auto with NO member that can serve: the credit is its rung (one verb, the default stays)', w2.verbs() === 1 && w2.current() === w2.A, `${w2.current()} verbs=${w2.verbs()}`);
  }
  // (4) OFF: never — the wall card only
  {
    const w = world({ mode: 'off' });
    quietly(() => w.wall());
    ok('R4 off: no verb, no For-you item — ever', w.verbs() === 0 && w.inbox.length === 0);
    ok('R4 …the switch rung runs as before', w.current() === w.B);
    ok('R4 …and the wall card names the credits (the only mention), offer mode off', w.cards.length === 1 && /3 stored reset credits available/.test(w.cards[0].text) && !/Not used automatically/.test(w.cards[0].text) && w.cards[0].resetCredit?.mode === 'off', JSON.stringify(w.cards));
    const w0 = world({ mode: 'off', credits: 0 });
    quietly(() => w0.wall());
    ok('R4 …no credits ⇒ no card at all', w0.cards.length === 0);
    // p2: the offer names the identity it is FOR (the card's button opens the dialog on it)
    const wf = world({ mode: 'off' });
    ok('R4 resetCreditOffer: {available, mode, accountKey} where credits exist — the key = the member the session bills, null where none', JSON.stringify(wf.eng.resetCreditOffer(wf.s1)) === JSON.stringify({ available: 3, mode: 'off', accountKey: wf.A }) && w0.eng.resetCreditOffer(w0.s1) === null, JSON.stringify(wf.eng.resetCreditOffer(wf.s1)));
    // …and after the switch moved the session onto B, the count the session read for A is not B's
    // r3: an unstamped process is held by the ledger — after the switch it still
    // speaks as A, so the offer stays A's (the count keyed by identity is A's, never B's)
    ok('R4 after the switch to the other member the offer names the member the process still HOLDS (A) — never B', w.current() === w.B && w.eng.resetCreditOffer(w.s1)?.accountKey === w.A, JSON.stringify(w.eng.resetCreditOffer(w.s1)));
  }
  // (5) the ceiling fails CLOSED on this path too (0/hour ⇒ nothing spent), and
  //     the wall card then says why it was not used
  {
    const w = world({ mode: 'auto', hourCap: 0 });
    quietly(() => w.wall());
    ok('R5 auto under a 0/hour ceiling: no verb (the guard refused)', w.verbs() === 0);
    ok('R5 …and the switch rung still ran', w.current() === w.B);
    ok('R5 …and the wall card says the ceiling refused it (a refusal with a voice)', w.cards.length === 1 && /Not used automatically: the unattended-spend ceiling refused it \(/.test(w.cards[0].text), JSON.stringify(w.cards));
  }
  // (6) NEGATIVE CONTROL: a patched engine without the warmth fork (the verdict told
  //     every conversation it is cold) spends nothing warm with a pool alternative
  {
    const src = read('src/server/usage-pool-engine.js');
    const from = 'inTurn: warmth.inTurn, warm: warmth.warm, poolAlternative,';
    const hit = src.includes(from);
    ok('R6 NEGATIVE CONTROL: the patch hit the product source', hit);
    if (hit) {
      const f = copyPath('src/server/usage-pool-engine.js', 'nofork');
      writeCopy(f, src.replace(from, 'inTurn: false, warm: false, poolAlternative,'));
      try {
        const w = world({ mode: 'auto', engineModule: require(f) });
        quietly(() => w.wall());
        ok('R6 NEGATIVE CONTROL: without the warmth fork the warm conversation is switched and no credit is tried — R1 can see the fork', w.verbs() === 0 && w.current() === w.B, `${w.current() === w.A ? 'A' : 'B'} verbs=${w.verbs()}`);
      } finally { /* MUTCP's scratch dir is removed at exit */ }
    }
  }
  // (7) THE ARM CARD carries the same offer: the REAL auto-resume, wired the way
  //     server.js wires it (resetCreditOffer → the engine's), announces an arm
  //     with `{resetCredit: {available, mode}}` beside the sentence
  {
    const arMod = require(path.join(REPO, 'src/server/auto-resume.js'));
    const w = world({ mode: 'off' });
    const arDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-ar-')); worlds.push(arDir);
    const notes = [];
    const mkAr = (offerDep) => arMod.create({ dataDir: arDir, activeSessions: new Map([['cx1', w.s1]]), serverSetting: () => true, log: () => { }, notifyDelayMs: 0,
      notify: (id, s2, text, extra) => notes.push({ id, text, extra }), sendToSession: () => true, ...(offerDep ? { resetCreditOffer: offerDep } : {}) });
    const ar = mkAr((id, s2) => w.eng.resetCreditOffer(s2));
    w.s1._autoResume = true;
    ar.armIfEnabled('cx1', w.s1, Date.now() + 3600e3, 'usage limit');
    await new Promise((r) => setTimeout(r, 30));
    ok('R7 the auto-resume ARM card carries {resetCredit: {available, mode, accountKey}} from the engine', notes.length === 1 && JSON.stringify(notes[0].extra) === JSON.stringify({ resetCredit: { available: 3, mode: 'off', accountKey: w.A } }), JSON.stringify(notes));
    ar.disarm?.('cx1');
    const notes2 = notes.length;
    const ar2 = mkAr(null);
    ar2.armIfEnabled('cx1', w.s1, Date.now() + 7200e3, 'usage limit');
    await new Promise((r) => setTimeout(r, 30));
    ok('R7 NEGATIVE CONTROL: without the offer dep the arm card carries nothing (the leg sees the wiring)', notes.length === notes2 + 1 && notes[notes.length - 1].extra === undefined, JSON.stringify(notes.slice(notes2)));
    ar.stop?.(); ar2.stop?.();
  }
  // ── §R r2 (2026-09-22 verifier findings, each reproduced on this real engine
  //    BEFORE its fix; every leg below has its pre-fix negative control) ──────
  const spin = () => { const t0 = Date.now(); while (Date.now() < t0 + 2) { } };
  const { registerResetCreditRoutes } = require(path.join(REPO, 'src/routes/reset-credit.js'));
  const routesOf = (w) => {
    const routes = {};
    registerResetCreditRoutes({ get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } }, { engine: w.eng });
    return (method, id, body = {}, query = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; quietly(() => routes[`${method} /api/accounts/:id/reset-credit`]({ params: { id }, body, query, headers: {} }, res)); return res; };
  };
  const patchedEngine = (tag, edits) => {
    let src = read('src/server/usage-pool-engine.js');
    for (const [from, to] of edits) { if (!src.includes(from)) return null; src = src.split(from).join(to); }
    const f = copyPath('src/server/usage-pool-engine.js', `${tag}`);
    writeCopy(f, src);
    try { return require(f); } finally { /* MUTCP's scratch dir is removed at exit */ }
  };
  // (8) ONE ACCOUNT WALL, TWO WARM CONVERSATIONS: ONE credit, and the pool stays
  {
    const w = world({ mode: 'auto', sessions: 2, held: true });
    const lines = quietly(() => { w.wall(w.ss[0]); w.wall(w.ss[1]); });
    ok('R8 one account wall seen by TWO warm conversations writes ONE verb (the floor is the IDENTITY\'s, not each session\'s)', w.verbs() === 1, `verbs=${w.verbs()} | ${lines.filter((l) => /reset-credit\]/.test(l)).join(' | ').slice(0, 300)}`);
    ok('R8 …ONE charge on the ceiling, on the account whose credit it is', JSON.stringify(w.charges()) === '{"A":1,"B":0}', JSON.stringify(w.charges()));
    ok('R8 …the second conversation FOLLOWS the credit in flight and the pool did not move', lines.some((l) => /\[reset-credit\] cx2: following cx1's reset credit in flight on Cx Alpha/.test(l)) && w.current() === w.A, lines.join(' | ').slice(0, 300));
    const l2 = quietly(() => {
      w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'reset_credit_result', outcome: 'reset' });
      spin();
      w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'rate_limits_updated', resetCredits: { availableCount: 2 }, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w.nowS + 7 * 86400 }, secondary: null } });
      w.wall(w.ss[1]); // a late restatement of the SAME wall (same stated reset) from the follower
    });
    ok('R8 after the reset (+ the wrapper\'s re-read) and a late restatement: the pool STAYS on the re-opened account, nothing demoted, no wait armed, still ONE verb',
      w.current() === w.A && !l2.some((l) => /\[wall\] demoted/.test(l)) && w.arms.length === 0 && w.verbs() === 1, `${w.current() === w.A ? 'A' : 'B'} arms=${JSON.stringify(w.arms)} | ${l2.join(' | ').slice(0, 300)}`);
    // the leader's FAILURE settles its follower too: both walk their own ladder
    const wf = world({ mode: 'auto', sessions: 2, held: true });
    quietly(() => { wf.wall(wf.ss[0]); wf.wall(wf.ss[1]); });
    quietly(() => wf.eng.recordCodexQuotaSignal(wf.ss[0], { type: 'reset_credit_result', outcome: 'nothingToReset' }));
    ok('R8 a leader\'s credit that does NOT land walks the ladder for the leader AND its follower (switch, each armed)', wf.current() === wf.B && ['cx1', 'cx2'].every((sid) => wf.arms.some((a) => a.sid === sid)), `${wf.current() === wf.A ? 'A' : 'B'} ${JSON.stringify(wf.arms)}`);
    // NEGATIVE CONTROL: the per-session floor (pre-r2) — no identity record, no followers
    const pre = patchedEngine('perSessionFloor', [['function resetCreditTryFor(key) {\n  if (!key) return null;', 'function resetCreditTryFor(key) {\n  return null;']]);
    ok('R8 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) {
      const wn = world({ mode: 'auto', sessions: 2, held: true, engineModule: pre });
      quietly(() => { wn.wall(wn.ss[0]); wn.wall(wn.ss[1]); });
      ok('R8 NEGATIVE CONTROL: with the floor per session the same wall spends TWO credits — R8 can see the identity floor', wn.verbs() === 2, `verbs=${wn.verbs()}`);
    }
  }
  // (8s) A CREDIT ANSWER THAT IS NOT A WALL: `alreadyRedeemed`, or a reading newer
  //      than the attempt that shows the limit open — re-read, never demote/arm
  {
    const w = world({ mode: 'auto', held: true });
    quietly(() => w.wall());
    const l = quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'alreadyRedeemed' }));
    ok('R8s `alreadyRedeemed` is not a wall: the pool stays, nothing is demoted or armed, the journal says why', w.current() === w.A && w.arms.length === 0 && !l.some((x) => /\[wall\] demoted/.test(x)) && l.some((x) => /already redeemed; not a wall/.test(x)), `${w.current() === w.A ? 'A' : 'B'} ${JSON.stringify(w.arms)} | ${l.join(' | ').slice(0, 300)}`);
    ok('R8s …and it RE-READS through the account\'s own app-server (the existing rung: one codex-read-limits verb on the wrapper)', w.s1.wrote.some((x) => /"codex-read-limits"/.test(x)), JSON.stringify(w.s1.wrote));
    const w2 = world({ mode: 'auto', held: true });
    quietly(() => w2.wall());
    spin();
    quietly(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w2.nowS + 7 * 86400 }, secondary: null } }));
    const l2 = quietly(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_result', outcome: 'nothingToReset' }));
    ok('R8s a failure answer AFTER a newer reading shows the account open: no switch, no arm', w2.current() === w2.A && w2.arms.length === 0 && l2.some((x) => /a reading newer than the attempt shows the limit open/.test(x)), `${w2.current() === w2.A ? 'A' : 'B'} ${JSON.stringify(w2.arms)}`);
    const w3 = world({ mode: 'auto', held: true });
    quietly(() => w3.wall());
    quietly(() => w3.eng.recordCodexQuotaSignal(w3.s1, { type: 'reset_credit_result', outcome: 'nothingToReset' }));
    ok('R8s CONTROL: the same failure with NO newer reading walks the ladder (switch + arm) — the leg sees the difference', w3.current() === w3.B && w3.arms.length === 1, `${w3.current() === w3.A ? 'A' : 'B'} ${JSON.stringify(w3.arms)}`);
    const pre = patchedEngine('noSupersede', [['        if (superseded) {\n', '        if (false) {\n']]);
    ok('R8s NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) {
      const wn = world({ mode: 'auto', held: true, engineModule: pre });
      quietly(() => wn.wall());
      quietly(() => wn.eng.recordCodexQuotaSignal(wn.s1, { type: 'reset_credit_result', outcome: 'alreadyRedeemed' }));
      ok('R8s NEGATIVE CONTROL: without the superseded check `alreadyRedeemed` moves the pool off the account (the pre-r2 defect)', wn.current() === wn.B && wn.arms.length === 1, `${wn.current() === wn.A ? 'A' : 'B'} ${JSON.stringify(wn.arms)}`);
    }
  }
  // (9) AFTER A SWITCH THE WRAPPER STILL HOLDS A: A's credit is A's, never B's
  {
    const run = (held, engineModule = engMod) => {
      const w = world({ mode: 'auto', hourCap: 1, held, engineModule });
      quietly(() => w.wall());                         // wall 1: consumed on A
      quietly(() => w.wall(w.s1, w.nowS + 9000));      // a NEW event inside the floor: cooldown → the switch rung moves the pool to B
      const t = w.eng._resetCreditTries.get(w.A); if (t) t.at -= 11 * 60e3; // the floor elapsed (wall-clock seam)
      w.s1._codexResetTriedAt = (w.s1._codexResetTriedAt || 0) - 11 * 60e3;
      const l3 = quietly(() => w.wall(w.s1, w.nowS + 12345)); // the SAME wrapper — still A's login (codex cannot hot-switch) — walls again
      return { w, l3 };
    };
    const { w, l3 } = run(true);
    ok('R9 wall 1 consumed on A, then a new event inside the floor moved the pool to B', w.current() === w.B);
    const ci = w.eng.creditIdentityFor(w.s1);
    ok('R9 …the stamped wrapper\'s credit identity is still A (moved = true), not the pool\'s current B', ci.key === w.A && ci.current === w.B && ci.moved === true, JSON.stringify(ci));
    ok('R9 …the auto rung refuses BY NAME (pool-moved) and writes no second verb', w.verbs() === 1 && l3.some((l) => /kept \(pool-moved — this conversation still holds Cx Alpha's login, the pool moved to Cx Beta/.test(l)), l3.join(' | ').slice(0, 300));
    ok('R9 …the ceiling never charged B for A\'s credit', JSON.stringify(w.charges()) === '{"A":1,"B":0}', JSON.stringify(w.charges()));
    ok('R9 …and the fire identity / wall key name A (where a continue into this process would really land)', w.eng.fireIdentityFor(w.s1)?.key === w.A, JSON.stringify(w.eng.fireIdentityFor(w.s1)));
    // NEGATIVE CONTROL: the SAME sequence with the held rule removed (an engine that
    // bills the pool's current member — the pre-r2 shape) reproduces the misattribution
    const noHeld = patchedEngine('noHeldRule', [['    const r = accounts.poolMemberOfSession(pid, session);\n', '    const r = null;\n']]);
    ok('R9 NEGATIVE CONTROL: the patch hit the product source', !!noHeld);
    if (noHeld) { const { w: wn } = run(true, noHeld); ok('R9 NEGATIVE CONTROL: without the held rule the second credit is written and charged to B — the leg sees the rule', wn.verbs() === 2 && JSON.stringify(wn.charges()) === '{"A":1,"B":1}', `verbs=${wn.verbs()} ${JSON.stringify(wn.charges())}`); }
    // r3: an UNSTAMPED process spawned after the ledger began is answered by it — the same A
    { const { w: wl, l3: ll } = run(false); ok('R9 r3: an UNSTAMPED process is held by the slot-transition ledger (the pool default at its start): pool-moved, still ONE verb, never charged to B', wl.verbs() === 1 && JSON.stringify(wl.charges()) === '{"A":1,"B":0}' && wl.s1._heldPoolMember === wl.A && wl.s1._heldPoolOrigin === 'ledger' && ll.some((l) => /pool-moved/.test(l)), `verbs=${wl.verbs()} ${JSON.stringify(wl.charges())} held=${wl.s1._heldPoolMember === wl.A ? 'A' : wl.s1._heldPoolMember} ${wl.s1._heldPoolOrigin}`); }
    // a PERSON on that wrapper after the move: allowed, and charged to the account whose credit it is
    const wp = world({ mode: 'off', held: true });
    quietly(() => wp.wall());
    const call = routesOf(wp);
    const r = call('POST', wp.A, { sessionId: 'cx1' });
    ok('R9 a person\'s Use… on A through the moved wrapper ⇒ 200, one verb, charged to A (never B)', wp.current() === wp.B && r.code === 200 && wp.verbs() === 1 && JSON.stringify(wp.charges()) === '{"A":1,"B":0}', `${r.code} ${JSON.stringify(r.body)} ${JSON.stringify(wp.charges())}`);
  }
  // (10) THE ASK ITEM'S / THE WALL CARD'S BUTTON AFTER THE POOL SWITCHED: alive
  {
    const w = world({ mode: 'ask', held: true });
    quietly(() => w.wall());
    const it = w.inbox[0] || {};
    ok('R10 ask + warm + an alternative: ONE item filed for A on cx1, and the pool moved to B', w.inbox.length === 1 && it.action?.accountKey === w.A && it.action?.sessionId === 'cx1' && w.current() === w.B);
    const call = routesOf(w);
    const pv = call('GET', it.action.accountKey, {}, { sessionId: it.action.sessionId });
    ok('R10 …the item\'s preview finds its carrier (cx1 still holds A\'s login): no refusal, the stored count', !pv.body.code && pv.body.sessionId === 'cx1' && pv.body.creditsLeft === 3, JSON.stringify(pv.body));
    const r = call('POST', it.action.accountKey, { sessionId: it.action.sessionId });
    ok('R10 …its POST ⇒ 200, ONE verb on cx1, charged to A', r.code === 200 && w.verbs() === 1 && JSON.stringify(w.charges()) === '{"A":1,"B":0}', `${r.code} ${JSON.stringify(r.body)}`);
    const wo = world({ mode: 'off', held: true });
    quietly(() => wo.wall());
    const c = wo.cards[0];
    const r2 = routesOf(wo)('POST', c?.resetCredit?.accountKey, { sessionId: 'cx1' });
    ok('R10 off: the wall card\'s button (offer on A) POSTs ⇒ 200 after the pool moved to B', wo.current() === wo.B && c?.resetCredit?.accountKey === wo.A && r2.code === 200, `${r2.code} ${JSON.stringify(r2.body)}`);
    const noHeld10 = patchedEngine('noHeldRule10', [['    const r = accounts.poolMemberOfSession(pid, session);\n', '    const r = null;\n']]);
    ok('R10 NEGATIVE CONTROL: the patch hit the product source', !!noHeld10);
    if (noHeld10) {
      const wn = world({ mode: 'ask', held: true, engineModule: noHeld10 });
      quietly(() => wn.wall());
      const rn = routesOf(wn)('POST', wn.inbox[0]?.action?.accountKey, { sessionId: 'cx1' });
      ok('R10 NEGATIVE CONTROL: without the held rule the button is dead (409 no_live_session) — the leg sees the carrier rule', rn.code === 409 && rn.body.code === 'no_live_session', `${rn.code} ${JSON.stringify(rn.body)}`);
    }
  }
  // (11) THE STORED COUNT SURVIVES A PASSIVE PUSH (the roster chip's source)
  {
    const w = world({ mode: 'off' });
    const file = path.join(w.cacheDir, w.A + '.json');
    ok('R11 after the on-demand read the cache file carries the count', JSON.parse(fs.readFileSync(file, 'utf8')).resetCredits?.availableCount === 3);
    spin();
    quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 55, window_minutes: 10080, resets_at: w.nowS + 3 * 86400 }, secondary: null } }));
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('R11 …ONE passive push later (no resetCredits — every turn\'s account/rateLimits/updated) the file still carries it, with the push\'s own reading', after.resetCredits?.availableCount === 3 && Math.round(after.sevenDay?.usedPercent) === 55, JSON.stringify({ rc: after.resetCredits, u: after.sevenDay?.usedPercent }));
    spin();
    quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'rate_limits_updated', resetCredits: { availableCount: 2 }, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w.nowS + 7 * 86400 }, secondary: null } }));
    ok('R11 …a NEWER stated count still wins (2)', JSON.parse(fs.readFileSync(file, 'utf8')).resetCredits?.availableCount === 2);
    // …and a later read whose file write LOST (a newer-stamped file already there:
    // a same-millisecond tie, an archived write) is not shadowed by the older
    // count the file carries — the count is dated (`resetCredits.at`) and the
    // fresher statement wins
    const bumpTie = (w2) => { const f2 = path.join(w2.cacheDir, w2.A + '.json'); const o = JSON.parse(fs.readFileSync(f2, 'utf8')); o.fetchedAt = Date.now() + 60e3; fs.writeFileSync(f2, JSON.stringify(o)); };
    const lostRead = (w2) => { spin(); bumpTie(w2); spin(); quietly(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 1 }, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w2.nowS + 7 * 86400 }, secondary: null } })); return w2.eng.resetCreditOffer(w2.s1)?.available; };
    ok('R11 a read whose write lost the file tie still updates the offer (the session\'s fresher statement beats the carried count)', lostRead(w) === 1 && JSON.parse(fs.readFileSync(file, 'utf8')).resetCredits?.availableCount === 2, String(w.eng.resetCreditOffer(w.s1)?.available));
    const preCarry = patchedEngine('cacheFirst', [['  if (cached !== null && seen && (Number(seen.at) || 0) > cachedAt) return n(seen.count);\n', '']]);
    ok('R11 NEGATIVE CONTROL: the patch hit the product source', !!preCarry);
    if (preCarry) { const wc = world({ mode: 'off', engineModule: preCarry }); ok('R11 NEGATIVE CONTROL: with the carried count read first the lost read is shadowed (offer stays 3)', lostRead(wc) === 3); }
    // the roster's map (usage-routes addSnapshot): { ...newestSnapshot, ...toLegacyView(merged) }
    const qm = require(path.join(REPO, 'src/quota-model.js'));
    const cq = require(path.join(REPO, 'src/harnesses/codex-quota.js'));
    const od = cq.signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 3 }, rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: w.nowS + 3 * 86400 }, secondary: null } } }).snapshot;
    const pv = cq.signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 55, window_minutes: 10080, resets_at: w.nowS + 3 * 86400 }, secondary: null } } }).snapshot;
    const merged = qm.mergeLimitSets(cq.limitSetFromSnapshot({ ...od, fetchedAt: Date.now() - 1000 }, { identity: 'k', source: 's' }), cq.limitSetFromSnapshot({ ...pv, fetchedAt: Date.now() }, { identity: 'k', source: 's' }));
    ok('R11 the roster\'s projection: on-demand read then a passive push ⇒ codexAccounts[key].resetCredits still 3', ({ ...pv, ...qm.toLegacyView(merged) }).resetCredits?.availableCount === 3, JSON.stringify(qm.toLegacyView(merged).resetCredits));
    ok('R11 …a set that never read a count projects NONE (no fabricated zero)', qm.toLegacyView(cq.limitSetFromSnapshot({ ...pv }, { identity: 'k', source: 's' })).resetCredits === undefined);
    ok('R11 WIRING: usage-routes projects the merged set over the newest snapshot, and the cache writer re-emits the count', /const out = \{ \.\.\.base, \.\.\.view, limits: setOf\[key\]\.limits/.test(read('src/usage-routes.js')) && /if \(out\.resetCredits === undefined\) \{\s*\n\s*if \(view\.resetCredits !== undefined\) out\.resetCredits = view\.resetCredits;\s*\n\s*else if \(prevObj && prevObj\.resetCredits/.test(read('src/usage-cache-write.js')));
    // NEGATIVE CONTROLS: the two projections without the r2 lines (patched copies next to the originals, so relative requires resolve)
    const qsrc = read('src/quota-model.js');
    const qfrom = "  if (rc && typeof rc === 'object' && Number.isFinite(Number(rc.availableCount))) out.resetCredits = { ...rc, availableCount: Number(rc.availableCount) };\n";
    ok('R11 NEGATIVE CONTROL: the quota-model patch hit the product source', qsrc.includes(qfrom));
    const qf = copyPath('src/quota-model.js', 'norc');
    writeCopy(qf, qsrc.replace(qfrom, ''));
    try { const qn = require(qf); ok('R11 NEGATIVE CONTROL: without the projection the roster map loses the count (the pre-r2 chip)', ({ ...pv, ...qn.toLegacyView(qn.mergeLimitSets(cq.limitSetFromSnapshot({ ...od, fetchedAt: Date.now() - 1000 }, { identity: 'k' }), cq.limitSetFromSnapshot({ ...pv, fetchedAt: Date.now() }, { identity: 'k' }))) }).resetCredits === undefined); } finally { /* MUTCP's scratch dir is removed at exit */ }
    const usrc = read('src/usage-cache-write.js');
    const ufrom = "    else if (prevObj && prevObj.resetCredits && typeof prevObj.resetCredits === 'object') out.resetCredits = prevObj.resetCredits;\n";
    ok('R11 NEGATIVE CONTROL: the cache-writer patch hit the product source', usrc.includes(ufrom));
    const uf = copyPath('src/usage-cache-write.js', 'norc');
    writeCopy(uf, usrc.replace(ufrom, ''));
    try {
      const un = require(uf);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-uc-')); worlds.push(dir);
      un.writeCacheObject({ cacheDir: dir, key: 'k', obj: { ...od }, set: cq.limitSetFromSnapshot(od, { identity: 'k', source: 's' }), source: 's', backend: 'codex' });
      un.writeCacheObject({ cacheDir: dir, key: 'k', obj: { ...pv, fetchedAt: od.fetchedAt + 5 }, set: cq.limitSetFromSnapshot({ ...pv, fetchedAt: od.fetchedAt + 5 }, { identity: 'k', source: 's' }), source: 's', backend: 'codex' });
      ok('R11 NEGATIVE CONTROL: without the carry one passive push erases the count from the file (the pre-r2 defect)', JSON.parse(fs.readFileSync(path.join(dir, 'k.json'), 'utf8')).resetCredits === undefined);
    } finally { /* MUTCP's scratch dir is removed at exit */ }
  }
  // (12) A COLD WALL THE SWITCH RUNG COULD NOT MOVE (the 10 s eval gate): the
  //      verdict's `after-switch` rung — it had no call site
  {
    const run = (engineModule = engMod) => {
      const w = world({ mode: 'auto', warm: false, engineModule });
      w.eng._poolAutoLast.set(w.P, Date.now()); // a switch a moment ago closed the per-pool eval gate
      const l = quietly(() => w.wall());
      return { w, l };
    };
    const { w, l } = run();
    ok('R12 cold + auto, alternative predicted but the switch gated: the pool did not move and the credit is the after-switch rung (ONE verb)', w.current() === w.A && w.verbs() === 1 && l.some((x) => /worth it \(wall-use-now[^\n]*after-switch/.test(x)), `${w.current() === w.A ? 'A' : 'B'} verbs=${w.verbs()} | ${l.filter((x) => /reset-credit\]/.test(x)).join(' | ').slice(0, 300)}`);
    const pre = patchedEngine('noAfterSwitch', [["resetCreditRung(session, { ...rcArgs, ladderPosition: 'after-switch' }) === 'consumed'", 'false']]);
    ok('R12 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const { w: wn } = run(pre); ok('R12 NEGATIVE CONTROL: without the after-switch re-ask the gated cold wall gets neither the switch nor the credit — the leg sees the call site', wn.current() === wn.A && wn.verbs() === 0, `${wn.current() === wn.A ? 'A' : 'B'} verbs=${wn.verbs()}`); }
  }
  // (13) THE SPAWN STAMP is where ws-create resolves the spawn, gated on the caps
  //      row, persisted beside accountId and restored on BOTH restore paths
  {
    const wc = read('src/ws-create.js'), br = read('src/server/boot-restore.js');
    ok('R13 WIRING: ws-create stamps the held member for a LOCAL pool on a backend that cannot hot-switch (caps row, never an id)', /if \(pa && pa\.type === 'pooled' && capsOf\(backend\)\.hotSwitch !== 'verified'\) heldPoolMember = accounts\.poolCurrent\(pa\.id\) \|\| null;/.test(wc) && /_heldPoolMember: heldPoolMember,/.test(wc));
    ok('R13 WIRING: …persisted in the session meta and restored by the dtach AND the pipe restore paths', /heldPoolMember: session\._heldPoolMember \|\| undefined,/.test(wc) && (br.match(/_heldPoolMember: typeof meta\.heldPoolMember === 'string' \? meta\.heldPoolMember : null,/g) || []).length === 2);
    ok('R13 the ONE rule (accounts.poolMemberOfSession) honours the stamp only for a non-hot pool (a claude pool re-reads its link; the stamp is ignored there) and the engine resolves through it', /if \(capsOf\(a\.backend \|\| session\.backend \|\| 'claude'\)\.hotSwitch === 'verified'\) return \{ id: link\(\), held: false, origin: 'link' \};/.test(read('src/accounts.js')) && /const r = accounts\.poolMemberOfSession\(pid, session\);/.test(read('src/server/usage-pool-engine.js')));
    { const held = (backend, hot) => { const fake = Object.create(AccountManager.prototype); fake.get = (id) => (id === 'P' ? { id: 'P', type: 'pooled', backend } : id === 'A' ? { id: 'A' } : null); fake.poolCurrentFor = () => 'B'; return fake.poolMemberOfSession('P', { _accountId: 'P', _webuiId: 'w', _heldPoolMember: 'A', backend }); };
      ok('R13 …a codex pool session with a stamp holds it; a claude pool session with the same stamp bills its link', held('codex').id === 'A' && held('codex').held === true && held('claude').id === 'B' && held('claude').held === false, JSON.stringify({ codex: held('codex'), claude: held('claude') })); }
  }
  // ── §R r3 (2026-09-22 round-2 verifier findings, each reproduced on this real
  //    engine BEFORE its fix; every leg has its pre-fix negative control) ─────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const quietlyAsync = async (fn) => { const o = console.log, wn = console.warn; const lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { await fn(); } finally { console.log = o; console.warn = wn; } return lines; };
  // (14) A HELD PROCESS WHOSE POOL MOVED ON IS NEVER CONTINUED: the REAL
  //      auto-resume + the real pre-fire gate, the stub wrapper answering the
  //      gate's probe with the held member's state (A spent)
  {
    const run = async (engineModule = engMod) => {
      const w = world({ mode: 'off', sessions: 2, held: true, realAr: true, engineModule });
      const [sHeld, sOther] = w.ss;
      sHeld.stubLimits = () => ({ type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: w.nowS + 9000 }, secondary: null } });
      quietly(() => w.wall(sOther)); // another conversation's wall moves the default A→B
      spin();
      sHeld._isStreaming = false; sHeld._turnState = 'idle'; // the walled turn ended — auto-resume fires only at an idle session
      await quietlyAsync(async () => { w.wall(sHeld, w.nowS + 9000); await sleep(50); });
      const arm = w.ar._armed.get('cx1');
      const armInfo = arm ? { reason: arm.reason, inSec: Math.round((arm.resetsAt - Date.now()) / 1000) } : null;
      if (arm) arm.resetsAt = Date.now() - 5 * 60e3; // due, past GRACE_MS (the wall-clock seam)
      const lt = await quietlyAsync(async () => { w.ar.tick(); await sleep(300); });
      w.ar.stop();
      return { w, sHeld, armInfo, lt };
    };
    const { w, sHeld, armInfo, lt } = await run();
    ok('R14 setup: another conversation\'s wall moved the pool default A→B while cx1 still holds A', w.current() === w.B);
    ok('R14 the held process\'s wall on A arms for A\'s OWN reset — not a 45 s near-arm "switched to a usable account (Cx Beta)"', !!armInfo && armInfo.inSec > 3600 && !/switched to a usable account/.test(armInfo.reason), JSON.stringify(armInfo));
    ok('R14 the real auto-resume + the real pre-fire gate deliver NO continue into the process holding walled A', w.sent.length === 0, `sent=${JSON.stringify(w.sent.map((x) => x.text.slice(0, 40)))} | ${lt.filter((l) => /auto-resume/.test(l)).join(' | ').slice(0, 300)}`);
    ok('R14 …the gate probed A through cx1\'s own wrapper and re-armed on A\'s answer', sHeld.wrote.some((x) => /"codex-read-limits"/.test(x)) && !!w.ar._armed.get('cx1'), JSON.stringify(sHeld.wrote.map((x) => x.slice(0, 40))));
    const pre = patchedEngine('noHeldVerdict', [['    const members = heldId ? (heldRec ? [{ id: heldId, name: heldRec.name || heldId }] : []) : (accounts.poolMembers(scope) || []);\n', '    const members = accounts.poolMembers(scope) || [];\n']]);
    ok('R14 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = await run(pre); ok('R14 NEGATIVE CONTROL: with the pool verdict (B usable) a billed continue IS delivered into the process holding walled A — the leg sees the held verdict', c.w.sent.length >= 1 && /switched to a usable account/.test((c.armInfo && c.armInfo.reason) || ''), `sent=${c.w.sent.length} ${JSON.stringify(c.armInfo)}`); }
  }
  // (14b) …ITS WAY OUT IS THE COLD RESTART: re-asked when the switch's request did
  //       not land, never doubled while one may be in flight
  {
    const run = (engineModule = engMod, clients = 1) => {
      const w = world({ mode: 'off', sessions: 2, held: true, clients, engineModule });
      const [sHeld, sOther] = w.ss;
      quietly(() => w.wall(sOther));
      const afterSwitch = w.sentWs.length;
      spin();
      const l1 = quietly(() => w.wall(sHeld, w.nowS + 9000));
      const afterWall = w.sentWs.length;
      sHeld._heldRestartAskedAt -= 11 * 60e3; // ten minutes passed, the process still walls: the first restart never landed
      spin();
      const l2 = quietly(() => w.wall(sHeld, w.nowS + 9100));
      return { w, afterSwitch, afterWall, l1, l2 };
    };
    const { w, afterSwitch, afterWall, l2 } = run();
    ok('R14b the default switch asked ONE client to restart both followers', afterSwitch === 1 && w.sentWs[0].type === 'pool-auto-switched' && w.sentWs[0].affected.length === 2);
    ok('R14b the held process walling inside the 10-min gap asks NOTHING more (a second request would resume the conversation twice)', afterWall === 1, `sent=${afterWall}`);
    ok('R14b …after the gap it is asked again, for that conversation alone, and the journal says why', w.sentWs.length === 2 && w.sentWs[1].affected.length === 1 && w.sentWs[1].affected[0].serverId === 'cx1' && l2.some((l) => /holds Cx Alpha's login while the pool is on Cx Beta — asked a client to restart it there/.test(l)), JSON.stringify(w.sentWs.map((x) => x.affected.map((y) => y.serverId))));
    const { l1: n1 } = run(engMod, 0);
    ok('R14b no client connected: it says so — the conversation waits for its own member\'s reset', n1.some((l) => /no client connected to restart it; it waits for Cx Alpha's reset/.test(l)), n1.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 300));
    const pre = patchedEngine('noAskStamp', [['    for (const t of fresh) { const s3 = activeSessions.get(t.serverId); if (s3) s3._heldRestartAskedAt = now; } // the stamp: a request that went out is never doubled\n', '']]);
    ok('R14b NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(pre); ok('R14b NEGATIVE CONTROL: without the switch stamping its request the conversation is asked to restart TWICE inside the gap — the leg sees the stamp', c.afterWall > 1, `sent=${c.afterWall} | ${c.l1.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 300)}`); }
  }
  // (14c) r4: A HELD MEMBER THAT IS NO LONGER A LOGGED-IN POOL MEMBER (the pool
  //       narrowed, or its login file wiped — the process keeps its in-memory
  //       tokens) is judged DIRECTLY: its wall lands on its cache, the fire
  //       verdict fails closed, and no continue goes into the process
  {
    const run = async (how, engineModule = engMod) => {
      const w = world({ mode: 'off', held: true, realAr: true, clients: 1, engineModule });
      if (how === 'narrowed') w.wam.updatePool(w.P, { members: [w.B] }); // the user narrows the pool; the default re-points to B
      else { w.wam.setPoolTarget(w.P, w.B, { why: 'pool-switch' }); fs.rmSync(path.join(w.wam.codexSubDir(w.A), 'auth.json'), { force: true }); }
      const setup = w.current() === w.B && !w.wam.poolMembers(w.P).some((m) => m.id === w.A) && w.eng.heldPoolMemberFor(w.s1) === w.A;
      w.s1._isStreaming = false; w.s1._turnState = 'idle';
      w.s1.stubLimits = () => ({ type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: w.nowS + 9000 }, secondary: null } });
      const lw = await quietlyAsync(async () => { w.wall(w.s1, w.nowS + 9000); await sleep(80); });
      const v = w.eng.quotaVerdictFor(w.P, { model: null, session: w.s1 });
      const arm = w.ar._armed.get('cx1');
      if (arm) arm.resetsAt = Date.now() - 5 * 60e3; // due, past GRACE_MS
      const lt = await quietlyAsync(async () => { w.ar.tick(); await sleep(300); });
      w.ar.stop();
      return { w, setup, lw, v, lt, aSpent: Math.round(Number(w.cacheOf(w.A)?.sevenDay?.utilization) * 100) };
    };
    for (const how of ['narrowed', 'wiped']) {
      const r = await run(how);
      ok(`R14c [${how}] setup: the pool is on B, A is not a logged-in member, cx1 holds A`, r.setup);
      ok(`R14c [${how}] the held process's wall DEMOTES A on its own slot's authority (never held back as "slot-not-a-member")`, r.aSpent === 100 && r.lw.some((l) => /\[wall\] demoted Cx Alpha/.test(l)) && !r.lw.some((l) => /slot-not-a-member/.test(l)), `A=${r.aSpent} | ${r.lw.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300)}`);
      ok(`R14c [${how}] the verdict is the held member's, known, and not usable (never "pool has no members")`, r.v.usable === false && r.v.held === r.w.A && !/pool has no members/.test(r.v.reason || ''), JSON.stringify({ usable: r.v.usable, known: r.v.known, reason: r.v.reason }));
      ok(`R14c [${how}] the real auto-resume + the real pre-fire gate deliver NO continue and charge nothing`, r.w.sent.length === 0 && JSON.stringify(r.w.charges()) === '{"A":0,"B":0}', `sent=${r.w.sent.length} ${JSON.stringify(r.w.charges())} | ${r.lt.filter((l) => /auto-resume/.test(l)).join(' | ').slice(0, 300)}`);
    }
    const pre = patchedEngine('r3HeldVerdict', [
      ['    const members = heldId ? (heldRec ? [{ id: heldId, name: heldRec.name || heldId }] : []) : (accounts.poolMembers(scope) || []);\n', '    const members = (accounts.poolMembers(scope) || []).filter((m) => !heldId || m.id === heldId);\n'],
      ['    if (!verdicts.length) return heldId\n', '    if (!verdicts.length) return false\n'],
      ['    if (v.usable === false || (v.held && v.usable !== true)) {\n', '    if (v.usable === false) {\n'],
      ['    const hs = validateHeldSlot(poolId, held);\n', '    const hs = validateBillingSlot(poolId, held);\n'],
    ]);
    ok('R14c NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = await run('wiped', pre); ok('R14c NEGATIVE CONTROL: the r3 held verdict (through poolMembers) answers null and the gate delivers a billed continue into the process holding walled A — the leg sees the rule', c.w.sent.length >= 1 && c.v.usable === null && c.lw.some((l) => /slot-not-a-member/.test(l)), `sent=${c.w.sent.length} usable=${c.v.usable} | ${c.lw.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 200)}`); }
  }
  // (14c r5) …AND AT ITS RESET: the held member reads HEALTHY again, but the pool
  //       no longer lists it (narrowed / wiped — codex has no login reader, so
  //       nothing else refuses it): still no continue into that process. The
  //       verifier's recipe: a due tick before A's reset (nothing), then A's
  //       stated reset passes, its own app-server answers open, the session's
  //       wall memory ages out, and the arm is due again.
  {
    const run = async (how, engineModule = engMod) => {
      const w = world({ mode: 'off', held: true, realAr: true, clients: 1, engineModule });
      if (how === 'narrowed') w.wam.updatePool(w.P, { members: [w.B] });
      else { w.wam.setPoolTarget(w.P, w.B, { why: 'pool-switch' }); fs.rmSync(path.join(w.wam.codexSubDir(w.A), 'auth.json'), { force: true }); }
      w.s1._isStreaming = false; w.s1._turnState = 'idle';
      const R = w.nowS + 9000;
      const spent = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: R }, secondary: null } });
      w.s1.stubLimits = spent;
      await quietlyAsync(async () => { w.wall(w.s1, R); await sleep(120); });
      const wind = () => { const a = w.ar._armed.get('cx1'); if (a) a.resetsAt = Date.now() - 5 * 60e3; };
      wind(); await quietlyAsync(async () => { w.ar.tick(); await sleep(300); });
      const before = w.sent.length;
      // A's stated reset PASSED (+ the 60 s grace): its cache's resets are in the past, its app-server answers open
      const cf = path.join(w.cacheDir, w.A + '.json'); const c = JSON.parse(fs.readFileSync(cf, 'utf8')); const past = Math.floor(Date.now() / 1000) - 61;
      for (const b of ['fiveHour', 'sevenDay']) if (c[b]) c[b].resetsAt = past;
      for (const l of c.limits || []) for (const x of Object.values(l.windows || {})) if (x && typeof x === 'object' && x.resetsAt) x.resetsAt = past;
      c.fetchedAt = Date.now(); fs.writeFileSync(cf, JSON.stringify(c));
      w.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w.nowS + 7 * 86400 }, secondary: null } });
      const sw = w.eng._sessionWalls.get('cx1'); if (sw) for (const k of [...sw.keys()]) sw.set(k, Date.now() - w.eng.SESSION_WALL_MS - 1); // the 10-min session-wall memory expired
      const v = w.eng.quotaVerdictFor(w.P, { model: null, session: w.s1 });
      wind();
      const lt = await quietlyAsync(async () => { w.ar.tick(); await sleep(300); });
      w.ar.stop();
      return { w, v, lt, before };
    };
    for (const how of ['narrowed', 'wiped']) {
      const r = await run(how);
      ok(`R14c r5 [${how}] before A's reset: nothing fired`, r.before === 0, String(r.before));
      ok(`R14c r5 [${how}] the held verdict still refuses — A is no longer a logged-in member of this pool — with no timer wait`, r.v.usable === false && r.v.held === r.w.A && /no longer a logged-in member of this pool/.test(r.v.reason || ''), JSON.stringify({ usable: r.v.usable, reason: r.v.reason, blockedUntil: r.v.blockedUntil }));
      ok(`R14c r5 [${how}] the real auto-resume + the real pre-fire gate deliver NO continue into the process still holding A`, r.w.sent.length === 0 && JSON.stringify(r.w.charges()) === '{"A":0,"B":0}', `sent=${r.w.sent.length} | ${r.lt.filter((l) => /auto-resume/.test(l)).join(' | ').slice(0, 300)}`);
    }
    const pre = patchedEngine('r4HeldListed', [['      if (heldId && m.id === heldId && !heldListed) return', '      if (false) return']]);
    ok('R14c r5 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) for (const how of ['narrowed', 'wiped']) { const c = await run(how, pre); ok(`R14c r5 NEGATIVE CONTROL [${how}]: the r4 verdict calls A usable at its reset and a continue goes into the process holding it — the leg sees the rule`, c.v.usable === true && c.w.sent.length >= 1, `usable=${c.v.usable} sent=${c.w.sent.length} | ${c.lt.join(' | ').slice(0, 400)}`); }
  }
  // (14d) r4: ONE SENDER of the cold-restart request — no builder re-names a
  //       conversation whose restart is in flight (the default switch here), and
  //       the manual routes claim the same way
  {
    const run = (engineModule = engMod) => {
      const w = world({ mode: 'off', sessions: 2, held: true, clients: 1, engineModule });
      const [sHeld, sOther] = w.ss;
      sHeld._heldRestartAskedAt = Date.now(); // requestHeldRestart asked for cx1 a moment ago (in flight)
      quietly(() => w.wall(sOther));        // the default switch A→B names every follower
      return { w };
    };
    const { w } = run();
    ok('R14d the default switch leaves out the conversation whose restart is in flight — ONE request, cx2 only', w.current() === w.B && w.sentWs.length === 1 && JSON.stringify(w.sentWs[0].affected.map((x) => x.serverId)) === '["cx2"]', JSON.stringify(w.sentWs.map((x) => x.affected.map((y) => y.serverId))));
    const s3 = w.mk(3);
    const claimed = w.eng.claimColdRestarts([{ serverId: 'cx1' }, { serverId: 'cx2' }, { serverId: 'cx3' }]);
    ok('R14d the manual routes\' claim: the two just asked are left out, a fresh one is handed over AND stamped', JSON.stringify(claimed.map((x) => x.serverId)) === '["cx3"]' && Date.now() - s3._heldRestartAskedAt < 5000, JSON.stringify(claimed));
    const pre = patchedEngine('noInFlightFilter', [['  const fresh = all.filter((t) => !restartInFlight(activeSessions.get(t.serverId), now));\n', '  const fresh = all;\n']]);
    ok('R14d NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(pre); ok('R14d NEGATIVE CONTROL: without the filter the switch re-names the in-flight conversation — the leg sees it', c.w.sentWs.length === 1 && c.w.sentWs[0].affected.some((x) => x.serverId === 'cx1')); }
    // CENSUS: exactly ONE place in the server tree builds a `pool-auto-switched` payload
    const census = (txt) => (txt.match(/type: 'pool-auto-switched'/g) || []).length;
    const eng = read('src/server/usage-pool-engine.js');
    ok('R14d CENSUS: exactly one `pool-auto-switched` payload is built in the engine (sendColdRestart)', census(eng) === 1, String(census(eng)));
    const four = eng + "\n{ type: 'pool-auto-switched' }";
    ok('R14d CENSUS NEGATIVE CONTROL: a second builder is counted', census(four) === 2);
    const aur = read('src/server/account-usage-routes.js');
    const routePin = (txt) => /affected: claimRestarts\(affected\) \}\);/.test(txt) && /affected: hot \? affected : claimRestarts\(affected\) \}\);/.test(txt);
    ok('R14d WIRING: both manual routes (member narrowing, the target pick) answer only claimed conversations', routePin(aur));
    ok('R14d WIRING NEGATIVE CONTROL: the pin fails on the r3 routes', !routePin(aur.split('claimRestarts(affected)').join('affected')));
  }
  // (15) THE RESET'S ANSWER IN THE WRAPPER'S REAL ORDER: `reset_credit_result`
  //      first, the post-reset re-read a macrotask (an rpc round trip) later
  {
    const run = async (engineModule = engMod) => {
      const w = world({ mode: 'auto', sessions: 2, held: true, engineModule });
      quietly(() => { w.wall(w.ss[0]); w.wall(w.ss[1]); });
      const l1 = await quietlyAsync(async () => { w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'reset_credit_result', outcome: 'reset' }); await sleep(30); });
      const between = w.current();
      spin();
      const l2 = await quietlyAsync(async () => { w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'rate_limits_updated', resetCredits: { availableCount: 2 }, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w.nowS + 7 * 86400 }, secondary: null } }); await sleep(30); });
      return { w, between, l1, l2 };
    };
    const { w, between, l1, l2 } = await run();
    ok('R15 `reset` answered before its re-read: the pool STAYS on the re-opened account in the gap (no switch off stale data)', between === w.A && !w.notices.some((n) => /auto-switched/.test(n)), `${between === w.A ? 'A' : 'B'} | ${l1.join(' | ').slice(0, 300)}`);
    ok('R15 …the journal says the pool waits for the post-reset reading', l1.some((l) => /Cx Alpha's limit was reset — pool decisions about it wait for its post-reset reading/.test(l)), l1.join(' | ').slice(0, 300));
    ok('R15 …the re-read lifts the hold and re-decides on it: still A, nothing restarted', w.current() === w.A && l2.some((l) => /pool decisions resume \(its post-reset reading landed\)/.test(l)) && !w.notices.some((n) => /auto-switched/.test(n)), `${w.current() === w.A ? 'A' : 'B'} | ${l2.join(' | ').slice(0, 300)}`);
    // the wrapper's NEW order: the re-read first, then the answer ⇒ no hold at all
    const wn = world({ mode: 'auto', held: true });
    quietly(() => wn.wall());
    spin();
    const ln = await quietlyAsync(async () => { wn.reading(wn.s1, 0, wn.nowS + 7 * 86400); wn.eng.recordCodexQuotaSignal(wn.s1, { type: 'reset_credit_result', outcome: 'reset' }); await sleep(30); });
    ok('R15 the current wrapper\'s order (re-read, then the answer): no hold, the pool stays', wn.current() === wn.A && !ln.some((l) => /wait for its post-reset reading/.test(l)), ln.join(' | ').slice(0, 300));
    // r4: NO READING WITHIN 30 s — the hold ASKS the account (at once and again
    // at 30 s) and keeps the pool on the vendor's `reset`; its 10-min ceiling
    // lifts it WITHOUT a forced decision (r3 forced a re-decide on the wall's
    // own pre-reset mark at 30 s: the pool left the re-opened account)
    const run30 = (engineModule = engMod) => {
      const wt = world({ mode: 'auto', held: true, engineModule });
      quietly(() => wt.wall());
      const caught = []; const realST = global.setTimeout;
      global.setTimeout = (fn, ms, ...a) => { if (ms === 30e3 || ms > 60e3) { caught.push({ fn, ms }); return { unref() { } }; } return realST(fn, ms, ...a); };
      let lt = [], lc = [];
      try {
        quietly(() => wt.eng.recordCodexQuotaSignal(wt.s1, { type: 'reset_credit_result', outcome: 'reset' }));
        const probesAtReset = wt.s1.wrote.filter((x) => /"codex-read-limits"/.test(x)).length;
        const t30 = caught.find((c) => c.ms === 30e3);
        lt = quietly(() => t30 && t30.fn());
        const probesAt30 = wt.s1.wrote.filter((x) => /"codex-read-limits"/.test(x)).length;
        const at30 = wt.current();
        const p = wt.eng._resetCreditPending.get(wt.A);
        if (p) p.until = Date.now() - 1; // the ceiling passed (the wall-clock seam)
        const tMax = caught.filter((c) => c.ms > 60e3).pop();
        lc = quietly(() => tMax && tMax.fn());
        return { wt, caught, lt, lc, probesAtReset, probesAt30, at30 };
      } finally { global.setTimeout = realST; }
    };
    const h = run30();
    ok('R15 r4: the hold ASKS A\'s own app-server at once (a codex-read-limits probe through the leader)', h.probesAtReset >= 1, `probes=${h.probesAtReset} | ${h.wt.s1.wrote.map((x) => x.slice(0, 30)).join(' ')}`);
    ok('R15 r4: no reading within 30 s ⇒ it asks again and the pool STAYS on the re-opened account (no switch off the wall\'s pre-reset mark, nobody restarted)', h.probesAt30 > h.probesAtReset && h.at30 === h.wt.A && !h.wt.notices.some((n) => /auto-switched/.test(n)) && h.lt.some((l) => /no post-reset reading within 30 s — asked its app-server again; the pool keeps it on the vendor's word/.test(l)), `${h.at30 === h.wt.A ? 'A' : 'B'} probes ${h.probesAtReset}→${h.probesAt30} | ${h.lt.join(' | ').slice(0, 300)}`);
    ok('R15 r4: the 10-min ceiling lifts the hold WITHOUT a forced decision (the pool is still on A the instant it lifts)', h.wt.current() === h.wt.A && h.lc.some((l) => /pool decisions resume \(no post-reset reading within 10 min/.test(l)) && !h.wt.eng._resetCreditPending.has(h.wt.A), `${h.wt.current() === h.wt.A ? 'A' : 'B'} | ${h.lc.join(' | ').slice(0, 200)}`);
    const pre30 = patchedEngine('r3HoldTimer', [['function onResetHoldTimer(key, p) {\n', "function onResetHoldTimer(key, p) {\n  return releaseResetHold(key, 'no post-reset reading within 30 s');\n"]]);
    ok('R15 r4 NEGATIVE CONTROL: the patch hit the product source', !!pre30);
    if (pre30) { const c = run30(pre30); ok('R15 r4 NEGATIVE CONTROL: the r3 timer (release + forced re-decide at 30 s) moves the pool A→B on the stale mark — the leg sees the hold', c.at30 === c.wt.B, `${c.at30 === c.wt.A ? 'A' : 'B'}`); }
    // r4 (low): A SIBLING'S STALE SPENT PUSH in the gap is not the post-reset reading
    const runStale = (engineModule = engMod) => {
      const w = world({ mode: 'auto', sessions: 2, held: true, engineModule });
      quietly(() => { w.wall(w.ss[0]); w.wall(w.ss[1]); });
      quietly(() => w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'reset_credit_result', outcome: 'reset' }));
      spin();
      const l = quietly(() => w.reading(w.ss[1], 100, w.nowS + 7200)); // cx2's app-server pushes A's PRE-reset state
      return { w, l, held: w.eng._resetCreditPending.has(w.A) };
    };
    const st = runStale();
    ok('R15 r4: a sibling\'s stale SPENT reading of A in the gap does not lift the hold — the pool stays on A, and the journal says why', st.held && st.w.current() === st.w.A && st.l.some((x) => /a reading from cx2 still shows the wall — not the post-reset reading; the hold stands/.test(x)), `${st.held} ${st.w.current() === st.w.A ? 'A' : 'B'} | ${st.l.join(' | ').slice(0, 300)}`);
    const preSt = patchedEngine('anyReadingEnds', [['  if (session && session._webuiId === p.sid) return e;\n', '  return e;\n']]);
    ok('R15 r4 NEGATIVE CONTROL: the patch hit the product source', !!preSt);
    if (preSt) { const c = runStale(preSt); ok('R15 r4 NEGATIVE CONTROL: releasing on ANY newer reading lets the stale push move the pool off A — the leg sees the rule', !c.held && c.w.current() === c.w.B, `${c.held} ${c.w.current() === c.w.A ? 'A' : 'B'}`); }
    // …and a NEW WALL on A after the reset ends the hold (the reset did not hold)
    { const w = world({ mode: 'auto', held: true }); quietly(() => w.wall()); quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'reset' })); spin(); const l = quietly(() => w.wall(w.s1, w.nowS + 9000));
      ok('R15 r4: a new wall on A after the reset ends the hold (by name), and the ladder decides on it', !w.eng._resetCreditPending.has(w.A) && l.some((x) => /pool decisions resume \(a new wall on it after the reset\)/.test(x)), l.join(' | ').slice(0, 300)); }
    // r5: …but a wall record RESTATING THE SAME EVENT (the same stated reset — a
    // third conversation's turn that was in flight at the vendor when the credit
    // landed) is not a new wall: it neither re-marks the re-opened account, nor
    // ends the hold, nor moves the pool at the NEXT evaluation — in both orders
    // (the hold: answer before the re-read; no hold: the re-read first).
    // CONTROL beside it: the different-R leg above (a genuinely new wall).
    const runRestated = (hold, engineModule = engMod) => {
      const w = world({ mode: 'auto', sessions: 3, held: true, clients: 1, engineModule });
      const R = w.nowS + 7200;
      quietly(() => { w.wall(w.ss[0], R); w.wall(w.ss[1], R); }); // cx1 leads, cx2 follows
      spin();
      if (!hold) quietly(() => w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: w.nowS + 7 * 86400 }, secondary: null } }));
      quietly(() => w.eng.recordCodexQuotaSignal(w.ss[0], { type: 'reset_credit_result', outcome: 'reset' }));
      spin();
      const l = quietly(() => w.wall(w.ss[2], R)); // cx3: the SAME event restated
      const util = Number((w.cacheOf(w.A) || {}).sevenDay?.utilization);
      const held = w.eng._resetCreditPending.has(w.A);
      w.eng._poolAutoLast.set(w.P, 0);
      const ln = quietly(() => w.eng.maybePoolAutoSwitchForPool(w.P)); // the NEXT evaluation
      return { w, l, ln, util, held };
    };
    for (const hold of [true, false]) {
      const tag = hold ? 'with the hold (answer first)' : 'without a hold (re-read first)';
      const r = runRestated(hold);
      ok(`R15 r5 ${tag}: a restated wall (same stated reset) is journaled as the re-opened event and does not re-mark A`, r.l.some((x) => /cx3: restated wall of the re-opened event on Cx Alpha/.test(x)) && (hold ? r.held : Math.round(r.util * 100) === 0) && !r.l.some((x) => /pool decisions resume/.test(x)), `util=${r.util} held=${r.held} | ${r.l.join(' | ').slice(0, 300)}`);
      ok(`R15 r5 ${tag}: …and the NEXT evaluation keeps the pool on A — nobody cold-restarted, one credit charged`, r.w.current() === r.w.A && r.w.sentWs.length === 0 && JSON.stringify(r.w.charges()) === '{"A":1,"B":0}', `${r.w.current() === r.w.A ? 'A' : 'B'} restarts=${r.w.sentWs.length} charges=${JSON.stringify(r.w.charges())} | ${r.ln.join(' | ').slice(0, 300)}`);
    }
    const preRestated = patchedEngine('noRestatedCheck', [['        if (restated) {\n', '        if (false) {\n']]);
    ok('R15 r5 NEGATIVE CONTROL: the patch hit the product source', !!preRestated);
    if (preRestated) for (const hold of [true, false]) { const c = runRestated(hold, preRestated); ok(`R15 r5 NEGATIVE CONTROL ${hold ? 'with the hold' : 'without a hold'}: writing the restated wall moves the pool off the re-opened account at the next evaluation — the leg sees the check`, c.w.current() === c.w.B && c.w.sentWs.length > 0, `${c.w.current() === c.w.A ? 'A' : 'B'} restarts=${c.w.sentWs.length}`); }
    const pre = patchedEngine('noResetHold', [['        if (tKey && !reRead) holdForResetReading(tKey, session._webuiId);\n        else kickPoolEval();', '        kickPoolEval();']]);
    ok('R15 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = await run(pre); ok('R15 NEGATIVE CONTROL: without the hold the gap moves the pool A→B and restarts its conversations — the leg sees the real order', c.between === c.w.B && c.w.notices.some((n) => /auto-switched to Cx Beta/.test(n)), `${c.between === c.w.A ? 'A' : 'B'}`); }
    // THE WRAPPER emits the re-read BEFORE the answer (the pin), control = the pre-r3 order
    const wr = read('data/bin/codex-chat-wrapper.js');
    const pin = (txt) => { const b = txt.indexOf("if (msg.type === 'codex-reset-credit') {"); const e = txt.indexOf("if (msg.type === 'review-start') {", b); const br = b >= 0 && e > b ? txt.slice(b, e) : ''; const i = br.indexOf("emitTaskEvent('rate_limits_updated'"), j = br.indexOf("emitTaskEvent('reset_credit_result', { result"); return i > 0 && j > i; };
    ok('R15 WIRING: the wrapper emits the post-reset rate_limits_updated BEFORE reset_credit_result', pin(wr));
    const b0 = wr.indexOf("if (msg.type === 'codex-reset-credit') {"), e0 = wr.indexOf("if (msg.type === 'review-start') {", b0);
    const oldOrder = wr.slice(0, b0) + wr.slice(b0, e0).replace("      emitTaskEvent('reset_credit_result', { result: r || null, outcome: r?.outcome || null });\n", '').replace("      try {\n        const r2 = await request('account/rateLimits/read'", "      emitTaskEvent('reset_credit_result', { result: r || null, outcome: r?.outcome || null });\n      try {\n        const r2 = await request('account/rateLimits/read'") + wr.slice(e0);
    ok('R15 NEGATIVE CONTROL: the pin fails on the pre-r3 order (answer first)', oldOrder !== wr && !pin(oldOrder));
    // r4: a FAILED post-reset re-read is SAID ({error, onDemand, afterReset}) — control = the r3 `catch { }`
    const failPin = (txt) => { const b = txt.indexOf("if (msg.type === 'codex-reset-credit') {"); const e = txt.indexOf("if (msg.type === 'review-start') {", b); const br = b >= 0 && e > b ? txt.slice(b, e) : ''; return /catch \(e2\) \{ emitTaskEvent\('rate_limits_updated', \{ error: [^}]*onDemand: true, afterReset: true \}\); \}/.test(br) && /else emitTaskEvent\('rate_limits_updated', \{ error: /.test(br) && !/\} catch \{ \}\n\s*emitTaskEvent\('reset_credit_result'/.test(br); };
    ok('R15 r4 WIRING: the wrapper reports a failed / empty post-reset re-read as rate_limits_updated {error, onDemand, afterReset}', failPin(wr));
    const r3Swallow = wr.replace(/\n\s*else emitTaskEvent\('rate_limits_updated', \{ error: 'no rateLimits in the post-reset read'[^\n]*\n(\s*)\} catch \(e2\) \{[^\n]*\n/, '\n$1} catch { }\n');
    ok('R15 r4 NEGATIVE CONTROL: the pin fails on the r3 wrapper (a swallowed failure)', r3Swallow !== wr && !failPin(r3Swallow));
    { const w = world({ mode: 'auto', held: true }); quietly(() => w.wall()); quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'reset' })); const l = quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'rate_limits_updated', error: 'timeout', onDemand: true, afterReset: true }));
      ok('R15 r4: the engine hears the failure as a failure (journal), keeps the hold and the pool on A', w.eng._resetCreditPending.has(w.A) && w.current() === w.A && l.some((x) => /the post-reset re-read of Cx Alpha failed \(timeout\) — the pool keeps it on the vendor's word/.test(x)), l.join(' | ').slice(0, 300)); }
  }
  // (16) THE PERMANENT LEDGER bills a held process to the member it HOLDS — the
  //      PRODUCTION recordUsageAttribution text lifted from server.js
  {
    const srv = read('server.js');
    const a0 = srv.indexOf('const _lastAttrib = new Map();');
    const endMark = 'usageHistory.recordAttribution({ sid, acct, pool, ts: Date.now() });\n}';
    const b0 = srv.indexOf(endMark, a0);
    const body = a0 > 0 && b0 > a0 ? srv.slice(a0, b0 + endMark.length) : '';
    ok('R16 the production recordUsageAttribution text was found in server.js', !!body);
    const resolver = (txt, w, rows) => new Function('accounts', 'activeSessions', 'usageHistory', txt + '\nreturn recordUsageAttribution;')(w.wam, w.sessions, { recordAttribution: (r) => rows.push(r) });
    const w = world({ mode: 'off', sessions: 2, held: true });
    quietly(() => w.wall(w.ss[1])); // the default moves A→B
    ok('R16 setup: the default moved to B; the switch re-recorded NO held follower (their process still bills A until the restart)', w.current() === w.B && !w.attrib.some((m) => /thread-[12]/.test(m.claudeSessionId || '')), JSON.stringify(w.attrib));
    const rows = [];
    const rec = resolver(body, w, rows);
    rec({ backendSessionId: 'thread-1', accountId: w.P }); // any later attribution call for the held conversation (a session-meta write)
    ok('R16 the production resolver bills the held process to A (the login it still speaks as), pool-tagged', rows.length === 1 && rows[0].acct === w.A && rows[0].pool === w.P, JSON.stringify(rows));
    const s3 = w.mk(3); s3._heldPoolMember = w.B;
    rec({ backendSessionId: 'thread-3', accountId: w.P });
    ok('R16 …a conversation spawned after the switch (stamped B) bills B', rows.length === 2 && rows[1].acct === w.B, JSON.stringify(rows));
    ok('R16 the billing badge reads the same rule (sessionAuth poolAuth → accounts.poolMemberOfSession) and it answers A for the held process', /const poolAuth = \(a\) => \{ let cur = null; try \{ const c = accounts\.poolMemberOfSession\(a\.id, s, s\._webuiId \|\| null\)\.id;/.test(srv) && w.wam.poolMemberOfSession(w.P, w.ss[0]).id === w.A);
    const oldTxt = body.replace('acct = (live ? accounts.poolMemberOfSession(acct, live, sessKey).id : accounts.poolCurrentFor(acct, sessKey)) || null;', 'acct = accounts.poolCurrentFor(acct, sessKey) || null;');
    ok('R16 NEGATIVE CONTROL: the patch hit the production text', oldTxt !== body);
    const rowsN = []; resolver(oldTxt, w, rowsN)({ backendSessionId: 'thread-1', accountId: w.P });
    ok('R16 NEGATIVE CONTROL: the pre-r3 resolver bills the held process to B — the leg sees the rule', rowsN.length === 1 && rowsN[0].acct === w.B, JSON.stringify(rowsN));
    const pre = patchedEngine('reattribHeld', [['      if (!heldPoolMemberFor(s, poolId)) { try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch {} }', '      try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch {}']]);
    ok('R16 NEGATIVE CONTROL: the switch-loop patch hit the product source', !!pre);
    if (pre) { const wc = world({ mode: 'off', sessions: 2, held: true, engineModule: pre }); quietly(() => wc.wall(wc.ss[1])); ok('R16 NEGATIVE CONTROL: without the skip the switch re-records the held followers — the leg sees it', wc.attrib.some((m) => m.claudeSessionId === 'thread-1'), JSON.stringify(wc.attrib)); }
  }
  // (17) A LEGACY PROCESS (no stamp): the ledger names its login; with no ledger
  //      row covering its start it is 'unknown' and nothing spends through it
  {
    const w = world({ mode: 'off', sessions: 2, held: false });
    const [sLeg, sOther] = w.ss;
    quietly(() => w.wall(sOther)); // the default moves A→B
    spin();
    quietly(() => { w.eng.noteTurnEnd(sLeg); w.reading(sLeg, 73); });
    ok('R17 an unstamped process spawned while the ledger ran: its reading after the move lands on A (the ledger\'s answer), B untouched', Math.round(w.cacheOf(w.A)?.sevenDay?.usedPercent) === 73 && Math.round(w.cacheOf(w.B)?.sevenDay?.usedPercent) !== 73 && sLeg._heldPoolOrigin === 'ledger', JSON.stringify({ a: w.cacheOf(w.A)?.sevenDay?.usedPercent, b: w.cacheOf(w.B)?.sevenDay?.usedPercent, o: sLeg._heldPoolOrigin }));
    spin();
    const lw = quietly(() => w.wall(sLeg, w.nowS + 12345));
    ok('R17 …and its wall demotes A, never healthy B', lw.some((l) => /\[wall\] demoted Cx Alpha/.test(l)) && !lw.some((l) => /\[wall\] demoted Cx Beta/.test(l)), lw.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300));
    const run = (engineModule = engMod) => { const wu = world({ mode: 'auto', held: 'unknown', engineModule }); const l = quietly(() => wu.wall()); return { wu, l }; };
    const { wu, l } = run();
    ok('R17 a process older than every ledger row: the auto rung refuses BY NAME (held-unknown) — no verb, no charge', wu.verbs() === 0 && JSON.stringify(wu.charges()) === '{"A":0,"B":0}' && l.some((x) => /kept \(held-unknown/.test(x)), `verbs=${wu.verbs()} ${JSON.stringify(wu.charges())} | ${l.filter((x) => /reset-credit/.test(x)).join(' | ').slice(0, 300)}`);
    const r = routesOf(wu)('POST', wu.current(), { sessionId: 'cx1' });
    ok('R17 …and it carries no person\'s credit either (409 no_live_session — whose login it holds is unknown)', r.code === 409 && r.body.code === 'no_live_session', `${r.code} ${JSON.stringify(r.body)}`);
    const pre = patchedEngine('noUnknown', [['    if (ci.unknown) {\n', '    if (false) {\n']]);
    ok('R17 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const { wu: wc } = run(pre); ok('R17 NEGATIVE CONTROL: without the refusal the unknown process spends a credit — the leg sees it', wc.verbs() === 1, `verbs=${wc.verbs()}`); }
  }
  // (17b) r4: THE LEDGER ANSWER IS STABLE — a pool older than the ledger (no
  //       creation row) keeps naming the member its legacy process started on
  //       across the pool's first recorded move (whose `from` names it), across a
  //       restart (the answer persisted into the meta), and an unrecorded
  //       re-point is answered unknown, never confidently
  {
    const acctSrc = read('src/accounts.js');
    const newBlock = acctSrc.slice(acctSrc.indexOf('    // a session restored from a meta that never recorded its start'), acctSrc.indexOf("    return { id: link(), held: false, origin: 'unknown' };\n  }\n  dropSessionPoolLink"));
    const r3Block = `    const at = Number(session.createdAt) || 0;
    if (at) {
      let row = null;
      try { row = this.slotTransitions.slotAt(key, at, { poolId }); } catch { row = null; }
      if (row && row.id && this.get(row.id)) return { id: row.id, held: true, origin: 'ledger' };
      try {
        const rows = this.slotTransitions.all();
        if (rows.length && rows[0].at <= at && !rows.some((r) => r.at > at && !r.sessionId && r.poolId === poolId)) {
          const cur = this.poolCurrent(poolId);
          if (cur && this.get(cur)) return { id: cur, held: true, origin: 'ledger' };
        }
      } catch { }
    }
`;
    const acctPatched = (tag, src) => { const f = copyPath('src/accounts.js', `${tag}`); writeCopy(f, src); try { return require(f).AccountManager; } finally { /* MUTCP's scratch dir is removed at exit */ } };
    const R3AM = newBlock.length > 100 ? acctPatched('r3Ledger', acctSrc.replace(newBlock, r3Block)) : null;
    ok('R17b NEGATIVE CONTROL source: the r4 ledger block was found and the r3 rule rebuilt', !!R3AM);
    const preLedgerPool = async (w) => {
      fs.rmSync(path.join(w.root, 'data', 'slot-transitions.jsonl'), { force: true });
      w.wam.slotTransitions._cache = null; w.wam.slotTransitions._last.clear();
      w.wam.slotTransitions.record({ sessionId: 'sess-elsewhere', poolId: 'pool-elsewhere', from: null, to: 'sub-x', at: Date.now() - 1000, why: 'spawn' });
      await sleep(5);
    };
    const pmo = (am, P, s) => { const r = am.poolMemberOfSession(P, s); return { id: r.id, held: r.held, origin: r.origin }; };
    {
      const metas = new Map();
      const w = world({ mode: 'off', sessions: 0, held: false, metaStore: { readSessionMeta: (k) => metas.get(k) || {}, writeSessionMeta: (k, m) => metas.set(k, m) } });
      await preLedgerPool(w);
      const s = w.mk(1); s.sockName = 'cw-legacy'; metas.set('cw-legacy', { accountId: w.P, createdAt: s.createdAt });
      const before = pmo(w.wam, w.P, { ...s });
      await sleep(5);
      w.wam.setPoolTarget(w.P, w.B, { why: 'pool-switch' }); // the pool's FIRST recorded row: from A → B, after the start
      const after = pmo(w.wam, w.P, { ...s });                 // a fresh object: nothing memoized (a server restart)
      ok('R17b a pre-ledger pool: the legacy process names A before AND after the pool\'s first recorded move (the row\'s `from`)', before.id === w.A && before.held && before.origin === 'ledger' && after.id === w.A && after.held && after.origin === 'ledger', JSON.stringify({ before, after }));
      const fresh = w.newEngine();                              // a restarted engine over an unmemoized session
      const s2 = { ...s }; delete s2._heldPoolMember; delete s2._heldPoolOrigin;
      ok('R17b …a restarted engine agrees (A, never unknown)', fresh.heldPoolMemberFor(s2) === w.A && !fresh.heldPoolUnknown(s2));
      quietly(() => w.eng.heldPoolMemberFor(s));
      ok('R17b …and the ledger answer is PERSISTED into the session-meta (heldPoolMember A, origin ledger) — a restart restores it', metas.get('cw-legacy').heldPoolMember === w.A && metas.get('cw-legacy').heldPoolOrigin === 'ledger', JSON.stringify(metas.get('cw-legacy')));
      if (R3AM) { const am3 = new R3AM({ dataDir: path.join(w.root, 'data') }); const c = pmo(am3, w.P, { ...s, _heldPoolMember: undefined });
        ok('R17b NEGATIVE CONTROL: the r3 rule flips the same process to unknown at that move — the leg sees the rule', c.origin === 'unknown' && c.held === false, JSON.stringify(c)); }
      // the consequence on a wall after a "restart": A marked, healthy B untouched
      const w2 = world({ mode: 'off', sessions: 0, held: false });
      await preLedgerPool(w2);
      const sl = w2.mk(1); sl._isStreaming = false;
      await sleep(5);
      w2.wam.setPoolTarget(w2.P, w2.B, { why: 'pool-switch' });
      const bBefore = w2.cacheOf(w2.B)?.sevenDay?.utilization;
      const lw = quietly(() => w2.wall(sl, w2.nowS + 9000));
      ok('R17b …the legacy process\'s wall after the move lands on A, never on healthy B (the pool stays on B)', w2.cacheOf(w2.B)?.sevenDay?.utilization === bBefore && w2.current() === w2.B && lw.some((l) => /\[wall\] demoted Cx Alpha/.test(l)), `B ${bBefore}→${w2.cacheOf(w2.B)?.sevenDay?.utilization} | ${lw.filter((l) => /\[wall\]/.test(l)).join(' | ').slice(0, 300)}`);
    }
    // an UNRECORDED re-point between two rows: unknown (and the row after it is not deduped away)
    {
      const w = world({ mode: 'off', sessions: 0, held: false });
      w.wam.setPoolTarget(w.P, w.B, { why: 'pool-switch' });                     // recorded A→B
      const mat = require(path.join(REPO, 'src/account-material.js'));
      mat.repointPoolSymlink(w.wam._poolLinkDir(w.wam.get(w.P)), w.wam._poolMemberDir(w.wam.get(w.P), w.A), null); // B→A with no row
      await sleep(5);
      const sg = w.mk(1);                                                         // really started on A
      await sleep(5);
      w.wam.setPoolTarget(w.P, w.B, { why: 'pool-switch' });                     // recorded from A → B (inside the dedup minute)
      const rows = w.wam.slotTransitions.all().filter((r) => r.poolId === w.P && !r.sessionId);
      const g = pmo(w.wam, w.P, { ...sg });
      ok('R17b a re-point the ledger never saw: the row after it is KEPT (its `from` contradicts the previous `to`) and the process is unknown, never confidently B', rows.length === 3 && g.origin === 'unknown' && g.held === false, JSON.stringify({ rows: rows.map((r) => [r.from && w.wam.get(r.from)?.name, w.wam.get(r.to)?.name]), g }));
      const stSrc = read('src/slot-transitions.js');
      const oldDedup = stSrc.replace(' && (!from || from === prev.to)) return null;', ') return null;');
      ok('R17b NEGATIVE CONTROL: the dedup patch hit the product source', oldDedup !== stSrc);
      const f = copyPath('src/slot-transitions.js', 'r3dedup'); writeCopy(f, oldDedup);
      try { const ST = require(f).SlotTransitions; const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-st-')); worlds.push(d); const t = new ST({ dataDir: d }); const now = Date.now();
        t.record({ poolId: 'p', from: 'a', to: 'b', at: now }); t.record({ poolId: 'p', from: 'a', to: 'b', at: now + 10 });
        ok('R17b NEGATIVE CONTROL: the r3 dedup drops the contradicting row — the leg sees the rule', t.all().length === 1, String(t.all().length)); } finally { /* MUTCP's scratch dir is removed at exit */ }
      { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-st-')); worlds.push(d); const { SlotTransitions: ST } = require(path.join(REPO, 'src/slot-transitions.js')); const t = new ST({ dataDir: d }); const now = Date.now();
        t.record({ poolId: 'p', from: 'a', to: 'b', at: now }); t.record({ poolId: 'p', from: 'b', to: 'b', at: now + 10 }); t.record({ poolId: 'p', from: null, to: 'b', at: now + 20 });
        ok('R17b …a TRUE repeat (same target, `from` = that target or unknown) is still one fact', t.all().length === 1, String(t.all().length)); }
    }
    // a restored session whose meta never recorded its start: unknown (boot-restore marks it 'no-start')
    {
      const w = world({ mode: 'off', sessions: 0, held: false });
      const s = w.mk(1); s._heldPoolOrigin = 'no-start';
      const r = pmo(w.wam, w.P, s);
      ok('R17b a meta without createdAt (restored with the boot instant) is unknown — never the pool default at the boot', r.origin === 'unknown' && r.held === false, JSON.stringify(r));
      const br = read('src/server/boot-restore.js');
      ok('R17b WIRING: both restore paths carry the held origin (heldOriginOf: ledger / no-start)', (br.match(/_heldPoolOrigin: heldOriginOf\(meta\)/g) || []).length === 2 && /return meta\.createdAt \? null : 'no-start';/.test(br));
      const noStart = acctSrc.replace("session._heldPoolOrigin === 'no-start' ? 0 : ", '');
      const NS = noStart !== acctSrc ? acctPatched('noNoStart', noStart) : null;
      ok('R17b NEGATIVE CONTROL: the patch hit the product source', !!NS);
      if (NS) { const c = pmo(new NS({ dataDir: path.join(w.root, 'data') }), w.P, s); ok('R17b NEGATIVE CONTROL: without the no-start rule the boot instant is answered confidently (held, ledger)', c.origin === 'ledger' && c.held === true, JSON.stringify(c)); }
    }
    // r5: THE no-start MARKER SURVIVES A RENAME. The restore fills createdAt with
    // the boot instant and the rename / codex thread-meta writers persist it
    // (`{...prev, createdAt: session.createdAt}`) — so the SECOND restart read a
    // createdAt and named the pool default at the previous boot. The first
    // restore now persists `heldPoolOrigin: 'no-start'` and heldOriginOf honours
    // it first. Driven through boot-restore's own helpers over a meta store.
    {
      const w = world({ mode: 'off', sessions: 0, held: false });
      const brPath = path.join(REPO, 'src/server/boot-restore.js');
      const runBoots = (BR) => {
        const metas = new Map([['cw-nostart', { accountId: w.P, name: 'legacy', backend: 'codex', mode: 'chat' }]]); // an old meta: no createdAt, no stamp
        const store = { readSessionMeta: (k) => (metas.has(k) ? { ...metas.get(k) } : null), writeSessionMeta: (k, m) => metas.set(k, { ...m }) };
        const boot = () => { const m = store.readSessionMeta('cw-nostart'); BR.persistNoStart('cw-nostart', m, store); return { origin: BR.heldOriginOf(m), createdAt: m.createdAt || Date.now() }; };
        const b1 = boot();
        // the rename writer (ws-handler's `rename` case shape): prev spread + the in-memory createdAt (= boot 1's instant)
        store.writeSessionMeta('cw-nostart', { ...(store.readSessionMeta('cw-nostart') || {}), name: 'renamed', createdAt: b1.createdAt });
        const b2 = boot();
        const s = w.mk(2); s._heldPoolMember = null; s._heldPoolOrigin = b2.origin; s.createdAt = b2.createdAt;
        return { b1, b2, meta: metas.get('cw-nostart'), r: pmo(w.wam, w.P, s) };
      };
      const BR = require(brPath);
      const g = runBoots(BR);
      ok('R17b r5: a no-start meta renamed between two restarts is STILL unknown at the second one (the marker is persisted, the rename keeps it)', g.b1.origin === 'no-start' && g.meta.heldPoolOrigin === 'no-start' && g.b2.origin === 'no-start' && g.r.origin === 'unknown' && g.r.held === false, JSON.stringify(g));
      ok('R17b r5: a meta WITH a start or a stamp is never marked (the helper writes nothing)', (() => { const ms = new Map(); const st = { readSessionMeta: (k) => ms.get(k) || null, writeSessionMeta: (k, m) => ms.set(k, m) }; return !BR.persistNoStart('a', { accountId: w.P, createdAt: 5 }, st) && !BR.persistNoStart('b', { accountId: w.P, heldPoolMember: w.A }, st) && !BR.persistNoStart('c', { name: 'no account' }, st) && ms.size === 0; })());
      let src = fs.readFileSync(brPath, 'utf8');
      const r4 = src.replace("  if (meta.heldPoolOrigin === 'no-start') return 'no-start';\n", '').replace("  try {\n    if (!meta || !meta.accountId || heldOriginOf(meta) !== 'no-start'", "  try {\n    return false;\n    if (!meta || !meta.accountId || heldOriginOf(meta) !== 'no-start'");
      ok('R17b r5 NEGATIVE CONTROL: the patch hit the product source (both edits)', r4 !== src && (r4.match(/return false;\n    if \(!meta \|\| !meta\.accountId/g) || []).length === 1 && !/heldPoolOrigin === 'no-start'\) return 'no-start'/.test(r4));
      const f = copyPath('src/server/boot-restore.js', 'r4NoStart');
      writeCopy(f, r4);
      let C = null; try { C = require(f); } finally { /* MUTCP's scratch dir is removed at exit */ }
      if (C) { const c = runBoots(C); ok('R17b r5 NEGATIVE CONTROL: the r4 restore forgets no-start after the rename and names the pool default at the previous BOOT confidently — the leg sees the marker', c.b2.origin === null && c.r.held === true && c.r.origin === 'ledger', JSON.stringify(c)); }
      ok('R17b r5 WIRING: both restore paths persist the marker before any writer runs', (fs.readFileSync(brPath, 'utf8').match(/persistNoStart\(sockFile, meta, \{ readSessionMeta, writeSessionMeta \}\);/g) || []).length === 2);
    }
    // one unreadable ledger read at first resolution is NOT memoized as unknown
    {
      const run = (engineModule = engMod) => {
        const w = world({ mode: 'off', sessions: 0, held: false, engineModule });
        const s = w.mk(1);
        const file = path.join(w.root, 'data', 'slot-transitions.jsonl');
        const saved = fs.readFileSync(file);
        fs.rmSync(file); w.wam.slotTransitions._cache = null;
        quietly(() => w.eng.heldPoolMemberFor(s));
        fs.writeFileSync(file, saved); w.wam.slotTransitions._cache = null;
        return { w, later: w.eng.heldPoolMemberFor(s) };
      };
      const { w, later } = run();
      ok('R17b a transiently unreadable ledger does not pin the process unknown for life: the next resolution names A', later === w.A, String(later));
      const pre = patchedEngine('memoUnknown', [["    if (!pid || pid !== session._accountId) return null;\n    const r = accounts.poolMemberOfSession(pid, session);\n", "    if (!pid || pid !== session._accountId) return null;\n    if (session._heldPoolOrigin === 'unknown' && !session._heldPoolMember) return { id: accounts.poolCurrent(pid) || null, held: false, origin: 'unknown' };\n    const r = accounts.poolMemberOfSession(pid, session);\n"]]);
      ok('R17b NEGATIVE CONTROL: the patch hit the product source', !!pre);
      if (pre) { const c = run(pre); ok('R17b NEGATIVE CONTROL: the r3 memo keeps it unknown — the leg sees the rule', c.later === null, String(c.later)); }
    }
  }
  // (18) THE WALL CARD NAMES WHOSE CEILING refused (low): the account and the count
  {
    const run = (engineModule = engMod) => { const w = world({ mode: 'auto', hourCap: 0, engineModule }); quietly(() => w.wall()); return w; };
    const w = run();
    ok('R18 the ceiling\'s refusal on the wall card names the account (and the detail)', w.cards.length === 1 && /Not used automatically: the unattended-spend ceiling refused it \(hour-cap\) for Cx Alpha — unattended turns per identity per hour are set to 0\./.test(w.cards[0].text), JSON.stringify(w.cards.map((c) => c.text)));
    const pre = patchedEngine('cardCode', [['refused it (${wr.why}) for ${nameOf(key)}${wr.detail ? ` — ${String(wr.detail).replace(/\\.$/, \'\')}` : \'\'}`', 'refused it (${wr.why})`']]);
    ok('R18 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(pre); ok('R18 NEGATIVE CONTROL: the pre-r3 card says only the code — the leg sees the name', c.cards.length === 1 && !/Cx Alpha/.test(c.cards[0].text.split('Not used automatically')[1] || ''), JSON.stringify(c.cards.map((x) => x.text))); }
  }
  // (19) AN ASK ITEM OUTLIVES ITS CARRIER (low): dismissed once no process holds that login
  {
    const run = (engineModule = engMod, via = 'sweep') => {
      const w = world({ mode: 'ask', held: true, engineModule });
      quietly(() => w.wall());
      const it = w.inbox[0];
      quietly(() => w.eng.sweepResetCreditAsks?.());
      const openWhileCarried = it && it.status === 'open';
      w.sessions.delete('cx1'); // the conversation restarted onto B (the old process is gone)
      const s7 = w.mk(7); s7._heldPoolMember = w.B;
      const l = via === 'sweep' ? quietly(() => w.eng.sweepResetCreditAsks?.()) // what every pool-eval kick runs
        : (routesOf(w)('GET', it.action.accountKey, {}, { sessionId: it.action.sessionId }), []); // the item's own button: the preview finds no carrier
      return { w, it, openWhileCarried, l };
    };
    const { w, it, openWhileCarried, l } = run();
    ok('R19 the ask item carries the wall\'s reset as its expiry (moot after it)', !!it && it.expiresAt === (w.nowS + 7200) * 1000, JSON.stringify(it && it.expiresAt));
    ok('R19 while its carrier lives the item stays open', openWhileCarried === true);
    ok('R19 once no process holds A\'s login the item is DISMISSED, and the journal says why', it.status === 'dismissed' && l.some((x) => /dismissed the For-you question about Cx Alpha's reset credit — no running conversation holds that login/.test(x)), `${it.status} | ${l.join(' | ').slice(0, 200)}`);
    ok('R19 …the item\'s own button (its preview answering no_live_session) dismisses it too', run(engMod, 'preview').it.status === 'dismissed');
    const pre = patchedEngine('noAskSweep', [['  if (!_resetCreditAsks.size) return 0;\n  let n = 0;', '  return 0;\n  let n = 0;']]);
    ok('R19 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(pre); ok('R19 NEGATIVE CONTROL: without the sweep the item stays open with a dead button — the leg sees it', c.it.status === 'open'); }
  }
  // (19b) r4: AN ASK ITEM FILED BEFORE A SERVER RESTART is swept by the new engine
  //       (re-seeded from the inbox — the item's own action names its account)
  {
    const run = (engineModule = engMod) => {
      const w = world({ mode: 'ask', held: true, engineModule });
      quietly(() => w.wall());
      const it = w.inbox[0];
      const eng2 = w.newEngine();                 // the restart: a new engine, the inbox survives
      w.sessions.delete('cx1');                   // …and the old process did not (restarted onto B)
      const s7 = w.mk(7); s7._heldPoolMember = w.B;
      const l = quietly(() => eng2.sweepResetCreditAsks());
      return { w, it, l };
    };
    const { it, l } = run();
    ok('R19b the restarted engine dismisses the pre-restart item once no process holds its login, by name', it && it.status === 'dismissed' && l.some((x) => /dismissed the For-you question about Cx Alpha's reset credit/.test(x)), `${it && it.status} | ${l.join(' | ').slice(0, 200)}`);
    const pre = patchedEngine('noAskReseed', [['let _resetCreditAsksSeeded = false;\n', 'let _resetCreditAsksSeeded = true;\n']]);
    ok('R19b NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(pre); ok('R19b NEGATIVE CONTROL: without the re-seed the item stays open with a dead button — the leg sees it', c.it.status === 'open'); }
  }
  // (19c) r4/r5: A PERSON'S Use… THROUGH A CARRIER THAT IS LEAVING the account.
  //       r5 names the state: a cold-restart request that WENT OUT (in flight)
  //       is REFUSED by name (`restart_pending`, 409 — the verb would ride a
  //       process a client is replacing); a pool move with no request yet (no
  //       client connected) is allowed and the dialog says the process keeps
  //       this login until a client restarts it
  {
    const RCmod = require(path.join(REPO, 'src/reset-credit.js'));
    const { STATUS } = require(path.join(REPO, 'src/routes/reset-credit.js'));
    const run = (clients, engineModule = engMod) => {
      const w = world({ mode: 'off', sessions: 2, held: true, clients, engineModule });
      quietly(() => w.wall(w.ss[1]));             // the default moves A→B; with a client, both followers are asked to restart
      const route = routesOf(w);
      const r = route('GET', w.A, {}, { sessionId: 'cx1' });
      const verbsBefore = w.verbs();
      const post = route('POST', w.A, { sessionId: 'cx1' });
      return { w, r, post, verbs: w.verbs() - verbsBefore };
    };
    const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
    const hasWords = (key) => zh.includes(JSON.stringify(key) + ':') && ja.includes(JSON.stringify(key) + ':');
    // (a) IN FLIGHT: refused by name, no verb
    const a = run(1);
    ok('R19c r5 in flight: the request went out (the stamp), the preview names it inFlight and REFUSES (restart_pending)', a.w.sentWs.length === 1 && a.r.code === 200 && a.r.body.restartPending && a.r.body.restartPending.inFlight === true && a.r.body.restartPending.name === 'Cx Beta' && a.r.body.code === 'restart_pending', JSON.stringify(a.r.body));
    ok('R19c r5 in flight: the POST answers 409 restart_pending (with the member) and writes NO verb', a.post.code === 409 && STATUS.restart_pending === 409 && a.post.body.code === 'restart_pending' && a.post.body.restartPending?.name === 'Cx Beta' && a.verbs === 0, `${a.post.code} ${JSON.stringify(a.post.body)} verbs=${a.verbs}`);
    const dmA = RCmod.dialogModel(a.r.body, { nowSec: a.w.nowS });
    ok('R19c r5 in flight: the dialog disables Confirm and says why, naming the member (zh + ja words)', dmA.canConfirm === false && dmA.refusal && /is being restarted onto \{member\}/.test(dmA.refusal.key) && dmA.refusal.params.member === 'Cx Beta' && hasWords(dmA.refusal.key) && !dmA.lines.some((l) => /restart/.test(l.key)), JSON.stringify(dmA));
    // (b) PENDING (no client connected): allowed, said first
    const b = run(0);
    ok('R19c r5 pending: no request went out; the preview names it pending, not in flight, and answers no refusal', b.w.sentWs.length === 0 && b.r.body.restartPending && b.r.body.restartPending.pending === true && !b.r.body.restartPending.inFlight && b.r.body.restartPending.name === 'Cx Beta' && !b.r.body.code, JSON.stringify(b.r.body));
    const dmB = RCmod.dialogModel(b.r.body, { nowSec: b.w.nowS });
    ok('R19c r5 pending: the dialog says it FIRST (after the account line) — keeps this login until a client restarts it — and confirming stays possible', dmB.canConfirm === true && /keeps this login until a client restarts it onto \{member\}/.test(dmB.lines[1] && dmB.lines[1].key) && dmB.lines[1].params.member === 'Cx Beta' && hasWords(dmB.lines[1].key), JSON.stringify(dmB.lines.slice(0, 2)));
    ok('R19c r5 pending: the person\'s POST goes through (one verb on cx1)', b.post.code === 200 && b.verbs === 1, `${b.post.code} ${JSON.stringify(b.post.body)} verbs=${b.verbs}`);
    // NEGATIVE CONTROLS: the r4 preview (warn-and-allow, one unnamed state)
    const pre = patchedEngine('r4RestartPending', [["  if (restartPending && restartPending.inFlight) return { ...out, code: 'restart_pending',", "  if (false) return { ...out, code: 'restart_pending',"]]);
    ok('R19c r5 NEGATIVE CONTROL: the patch hit the product source', !!pre);
    if (pre) { const c = run(1, pre); ok('R19c r5 NEGATIVE CONTROL: the r4 rule lets the verb ride the process being replaced (200 + a verb) — the leg sees the refusal', c.post.code === 200 && c.verbs === 1, `${c.post.code} verbs=${c.verbs}`); }
    const pre2 = patchedEngine('r4OneState', [['...(leaving.inFlight ? { inFlight: true } : { pending: true })', 'inFlight: true']]);
    ok('R19c r5 NEGATIVE CONTROL: the patch hit the product source (the state)', !!pre2);
    if (pre2) { const c = run(0, pre2); ok('R19c r5 NEGATIVE CONTROL: one state for both calls a restart nobody asked for "in flight" — the pending leg sees the difference', c.r.body.code === 'restart_pending' && c.w.sentWs.length === 0); }
  }
  // (20) THE ROSTER CHIP through the REAL usage-routes (low): a live wrapper whose
  //      startup read failed (sidecar without the count) pushes a newer reading
  {
    const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
    const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
    const cq = require(path.join(REPO, 'src/harnesses/codex-quota.js'));
    const run = (setup = setupUsage) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrung-ur-')); worlds.push(root);
      const prevHome = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(root, 'shared-codex');
      const wam = new AccountManager({ dataDir: path.join(root, 'data') });
      const { id: A } = wam.createCodexSubscription({ name: 'Cx Alpha' });
      fs.writeFileSync(path.join(wam.codexSubDir(A), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 't' } }));
      process.env.CODEX_HOME = prevHome;
      const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
      const buffers = path.join(root, 'data', 'session-buffers'); fs.mkdirSync(buffers, { recursive: true });
      const nowS = Math.floor(Date.now() / 1000);
      const od = cq.signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 3 }, rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: nowS + 3 * 86400 }, secondary: null } } }).snapshot;
      od.fetchedAt = Date.now() - 5000; od.source = 'codex-rate-limits';
      usageWrite.writeCacheObject({ cacheDir, key: A, obj: od, set: cq.limitSetFromSnapshot(od, { identity: A, source: 'codex-rate-limits' }), source: 'codex-rate-limits', backend: 'codex' });
      fs.writeFileSync(path.join(buffers, 'cx1.json'), JSON.stringify({ startedAt: Date.now() - 60000, rateLimits: { primary: { used_percent: 55, window_minutes: 10080, resets_at: nowS + 3 * 86400 }, secondary: null }, rateLimitsFetchedAt: Date.now() }));
      const routes = {};
      const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, put() { }, delete() { }, use() { }, locals: {} };
      quietly(() => setup({ app, accounts: wam, hosts: null, usageHistory: { scan() { }, warm() { } }, activeSessions: new Map([['cx1', { backend: 'codex', mode: 'chat', _accountId: A }]]), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(root, 'data', 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'nocodex'), META_DIR: path.join(root, 'data', 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: buffers, apiDerivedWindow: () => null, establishedWindows: () => null }));
      const res = { body: null, json(o) { this.body = o; return this; }, status() { return this; } };
      quietly(() => routes['GET /api/usage']({ query: {}, headers: {} }, res));
      return res.body && res.body.codexAccounts && res.body.codexAccounts[A];
    };
    const out = run();
    ok('R20 the file\'s count survives a newer sidecar push that states none (the wrapper\'s startup read failed): the roster still shows 3, usage from the push', out && out.resetCredits && out.resetCredits.availableCount === 3 && Math.round(out.sevenDay?.usedPercent) === 55, JSON.stringify({ rc: out && out.resetCredits, u: out && out.sevenDay?.usedPercent }));
    const src = read('src/usage-routes.js');
    const from = "    if (out.resetCredits === undefined && prev && prev.resetCredits && typeof prev.resetCredits === 'object') out.resetCredits = prev.resetCredits;\n";
    ok('R20 NEGATIVE CONTROL: the patch hit the product source', src.includes(from));
    const f = copyPath('src/usage-routes.js', 'nocarry');
    writeCopy(f, src.replace(from, ''));
    try { const outN = run(require(f).setupUsage); ok('R20 NEGATIVE CONTROL: without the carry the chip disappears — the leg sees it', !(outN && outN.resetCredits), JSON.stringify(outN && outN.resetCredits)); } finally { /* MUTCP's scratch dir is removed at exit */ }
  }
  for (const r of worlds) fs.rmSync(r, { recursive: true, force: true });
}

fs.rmSync(dataDir, { recursive: true, force: true });

// ── R-tree THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\nR-tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTCP.files, MUTCP.dir, REPO, { minCopies: 8 })) ok('R-tree ' + r.name, r.pass, r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
