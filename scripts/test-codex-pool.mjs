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
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
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
  ok('exhaustion ladder: ① reset credit (opt-in) → ② pool switch → ③ auto-resume', /if \(tryResetCredit\(tripped\?\.resetsAt\)\) return;[\s\S]{0,200}maybePoolAutoSwitch\(session\)/.test(eng) && /if \(tryResetCredit\(resets\)\) return;[\s\S]{0,120}maybePoolAutoSwitch\(session\)/.test(eng));
  ok("…auto-consume is OPT-IN (codex.limitResetCredit 'auto', default off) with a 10min retry floor", /serverSetting\('codex\.limitResetCredit'\) !== 'auto'\) return false;/.test(eng) && /_codexResetTriedAt && now - session\._codexResetTriedAt < 10 \* 60e3\) return false;/.test(eng));
  ok('a successful reset recovers in place; a failed one falls through the ladder', /out === 'reset'[\s\S]{0,400}noteRecovered[\s\S]{0,800}codex-reset-credit-failed[\s\S]{0,200}maybePoolAutoSwitch\(session\)/.test(eng));
  ok('the setting exists in the Codex group', /'codex\.limitResetCredit'/.test(read('src/lib/settings-schema.js')));
  ok('session-schema registers the throttle fields', /_codexResetTriedAt/.test(read('src/session-schema.js')) && /_codexLastResetsAt/.test(read('src/session-schema.js')));
  const wsrc = read('src/ws-handler.js');
  ok('manual actions exist as ws cases (codex-reset-credit / codex-read-limits), codex-chat-gated', /case 'codex-reset-credit':\s*\n\s*case 'codex-read-limits':/.test(wsrc) && /session\.backend === 'codex'/.test(wsrc));
  const w2 = read('data/bin/codex-chat-wrapper.js');
  ok('the wrapper serves both verbs via the LIVE app-server RPC (rateLimits/read + rateLimitResetCredit/consume)', /account\/rateLimits\/read/.test(w2) && /account\/rateLimitResetCredit\/consume/.test(w2) && /reset_credit_result/.test(w2));
  // ── reset-credit COUNT in the usage popup (owner: usage里展示剩余reset) ──
  ok('the wrapper reads limits ONCE at startup (credits only ride rateLimits/read, never the passive push)', /readAccountLimits\(false\); \/\/ surface reset-credit count/.test(w2));
  ok('the engine keeps resetCredits on the account snapshot', /snap0\.resetCredits = \{ availableCount:/.test(eng));
  ok('…and the sidecar reader merges meta.rateLimitResetCredits', /snap\.resetCredits = \{ availableCount:/.test(read('src/usage-routes.js')));
  const um2 = read('src/lib/usage-meter.js');
  ok('the popup shows the stored reset-credit count', /Reset credits'\)\)\}<\/span> \$\{Number\(codex\.resetCredits\.availableCount\)/.test(um2));
  ok("…and the codex ⟳ is CAPABILITY-gated (quotaRefresh 'session-rpc'), riding a live session's app-server", /backendFeatureCaps\('codex'\)\.quotaRefresh === 'session-rpc'/.test(um2) && /_refreshCodexQuota\(btn\)/.test(um2) && /codex-read-limits', sessionId: live\.webuiId/.test(um2));
  ok('recordCodexQuotaSignal exists: readings write the member cache, exhaustion switches then arms auto-resume', /function recordCodexQuotaSignal[\s\S]{0,3000}maybePoolAutoSwitch\(session\);[\s\S]{0,400}armIfEnabled/.test(eng));
  ok('…typed exhaustion enum covers the workspace variants', /usage_limit_reached\|quota_exceeded\|usage_not_included\|workspace_owner_usage_limit_reached\|workspace_member_usage_limit_reached\|workspace_member_credits_depleted/.test(eng));
  ok('…a pool-billed reading lands on the CURRENT MEMBER, never the pool wrapper', /a\.type === 'pooled'\) key = accounts\.poolCurrentFor\(key, session\._webuiId\)/.test(eng));
  const ss = read('src/server/session-stdout.js');
  ok('the codex stdout pipeline feeds the engine (rate_limits_updated + task_failed + reset_credit_result)', /rate_limits_updated' \|\| msg\.payload\?\.type === 'task_failed' \|\| msg\.payload\?\.type === 'reset_credit_result'\)/.test(ss) && /recordCodexQuotaSignal\?\.\(session, msg\.payload\)/.test(ss));
  const w = read('data/bin/codex-chat-wrapper.js');
  ok('the wrapper RELAYS rateLimits to stdout (sidecar was display-only)', /emitTaskEvent\('rate_limits_updated', \{ rateLimits: params\.rateLimits \}\)/.test(w));
  ok('…and forwards the typed codex_error_info on task_failed (it was dropped)', /codexErrorInfo: params\?\.codexErrorInfo \?\? params\?\.codex_error_info/.test(w));
  ok('the pool-create route accepts backend codex', /backend: req\.body\?\.backend === 'codex' \? 'codex' : 'claude'/.test(read('src/server/account-usage-routes.js')));
}

fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
