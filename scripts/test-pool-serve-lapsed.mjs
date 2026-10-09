// A LAPSED SUBSCRIPTION IS A DURABLE MEMBER STATE (lane pool-subscription-lapsed, 2026-10-08; owner: "UCI Max 订阅到期没续费，
// 系统会自动排除它吗？续费后不想重新添加"). Production (journal, read-only): the pool moved four conversations + its default
// ONTO the canceled member at 13:29Z (its cached readings looked best — a lapse leaves no reading); the first turn failed
// with "Your organization has disabled Claude subscription access for Claude Code"; the 10-minute IN-MEMORY auth mark,
// cleared early by any token refresh, let it attract placements again (21:26Z the same failure on a fresh server).
// This suite pins what the PURE verdict legs (test-pool-auto "LAPSED:") cannot:
//   §1 the harness's CLOSED census of lapse sentences (claude rows, codex/none, the controls)
//   §2 the persisted record through the accounts writer (atomic, survives a reload, membership + note kept)
//   §3 the engine's two functions run for real on a scratch store: evidence clears, a token refresh does NOT (+ the
//      mutant that clears on a token change goes RED), one journal line + one For-you item per EPISODE
//   §4 the auto-cli idle rung keeps probing a lapsed member at its 30–60 min cadence (no failure backoff to hours)
//   §5 wiring: the reader every gate consults, the act list, the auth-failure path, the evidence edge, the ⟳ route
//   §6 the words: roster chip, pool submenu, zh/ja
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve('.');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-psl-'));
const PROD = 'Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask you…'; // the journal's line, verbatim (truncated by the notice)

// ── §1 THE CENSUS ───────────────────────────────────────────────────────────
console.log('§1 the closed census of lapse sentences (harness quota.classifyServeFailure)');
const harnesses = require(path.join(REPO, 'src/harnesses'));
const CQ = require(path.join(REPO, 'src/harnesses/claude-quota.js'));
const XQ = require(path.join(REPO, 'src/harnesses/codex-quota.js'));
const { NULL_QUOTA } = require(path.join(REPO, 'src/harnesses/null-quota.js'));
ck('claude: the production sentence (the journal\'s words) ⇒ lapsed', CQ.classifyServeFailure({ message: PROD })?.kind === 'lapsed');
ck('claude: the CLI\'s full sentence (2.1.288 `oauth_org_not_allowed`) ⇒ lapsed', CQ.classifyServeFailure({ message: 'API Error: 403 Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access' })?.kind === 'lapsed');
ck('claude: the raw API message the CLI renders that sentence from ⇒ lapsed', CQ.classifyServeFailure({ status: 403, message: 'OAuth authentication is currently not allowed for this organization' })?.kind === 'lapsed');
ck('claude: the census is CLOSED — exactly the two measured rows, each quoting the CLI version it was read from', CQ.SERVE_CENSUS.length === 2 && CQ.SERVE_CENSUS.every((r) => r.kind === 'lapsed' && r.cli === '2.1.288' && typeof r.needle === 'string') && Object.isFrozen(CQ.SERVE_CENSUS));
ck('CONTROL: an account HOLD is not a lapse (stays the 10-minute auth mark)', CQ.classifyServeFailure({ status: 403, message: "Your account is on hold and can't sign in to Claude Code" })?.kind === 'auth');
ck('CONTROL: a revoked OAuth token / a disabled org stay `auth`', CQ.classifyServeFailure({ status: 401, attempt: 2, message: 'OAuth token revoked' })?.kind === 'auth' && CQ.classifyServeFailure({ message: 'API Error: organization has been disabled', status: 403 })?.kind === 'auth');
ck('CONTROL: an unknown wording is NEVER promoted to a lapse (auth or nothing)', CQ.classifyServeFailure({ message: 'something else entirely' }) === null && CQ.classifyServeFailure({ status: 403, message: 'Forbidden' })?.kind === 'auth');
ck('claude: the lapse sentence also passes today\'s auth gate (notePoolAuthFailure ran on it in production)', CQ.classifyAuthFailure({ message: PROD }) === true);
ck('codex: NO lapse census (0.159.3 measured) — its plan wall `usage_not_included` stays an exhaustion enum, never `lapsed`',
  XQ.classifyServeFailure({ message: 'To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.', codexErrorInfo: 'usage_not_included' }) === null && XQ.classifyServeFailure({ codexErrorInfo: 'unauthorized' })?.kind === 'auth');
ck('null quota: no verdict', NULL_QUOTA.classifyServeFailure({ message: PROD }) === null);
ck('registry: every registered harness that declares classifyServeFailure declares a function (optional in the contract)', harnesses.list().every((h) => h.quota.classifyServeFailure === undefined || typeof h.quota.classifyServeFailure === 'function'));
let contractErr = null; try { harnesses.register({ id: 'fake-psl', label: 'x', quota: { ...NULL_QUOTA, classifyServeFailure: 'no' } }); } catch (e) { contractErr = e.message; } finally { try { harnesses.unregister?.('fake-psl'); } catch { } }
ck('contract: a non-function classifyServeFailure is refused', /classifyServeFailure must be a function/.test(contractErr || ''));

// ── §2 THE PERSISTED RECORD ─────────────────────────────────────────────────
console.log('§2 the record lives on the account, through the atomic writer');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const DATA = path.join(SCR, 'data'); fs.mkdirSync(DATA);
let changes = 0;
const am = new AccountManager({ dataDir: DATA, onChange: () => { changes++; } });
const login = (m, id) => fs.writeFileSync(path.join(m.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-1', refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });
const U = am.createSubscription({ name: 'UCI Max' }).id; login(am, U);
const M = am.createSubscription({ name: 'Mat Max' }).id; login(am, M);
am.setNote(U, '0248 08 Canceled');
const T0 = Date.now() - 3600e3;
const c0 = changes;
const stored = am.setServeState(U, { state: 'lapsed', since: T0, why: 'has disabled Claude subscription access for Claude Code', lastFail: T0 });
const file = JSON.parse(fs.readFileSync(path.join(DATA, 'accounts.json'), 'utf8'));
ck('setServeState writes the record INTO accounts.json (the account record — no sidecar file)', file.accounts.find((a) => a.id === U)?.serve?.state === 'lapsed' && fs.readdirSync(DATA).filter((f) => /serve|lapse/i.test(f)).length === 0 && stored.since === T0);
ck('…atomically (tmp + rename: no .tmp left behind) and the roster hears it (onChange)', !fs.existsSync(path.join(DATA, 'accounts.json.tmp')) && changes > c0);
const am2 = new AccountManager({ dataDir: DATA });
ck('the state SURVIVES a reload (a restart keeps a lapsed member lapsed)', am2.serveStateOf(U)?.state === 'lapsed' && am2.serveStateOf(U)?.lastFail === T0);
const row = am2.list().accounts.find((a) => a.id === U);
ck('the roster row carries `serve`; the note and the login are KEPT (nothing to re-add after renewal)', row.serve?.state === 'lapsed' && row.note === '0248 08 Canceled' && row.loggedIn === true && !('serve' in am2.list().accounts.find((a) => a.id === M)));
let bad = []; for (const s of [{ state: 'gone', since: 1, lastFail: 1 }, { state: 'lapsed', since: 0, lastFail: 1 }, { state: 'lapsed', since: 1 }]) { try { am2.setServeState(U, s); bad.push('accepted'); } catch { bad.push('refused'); } }
ck('the writer refuses an unknown state / a missing instant (a closed shape)', bad.every((x) => x === 'refused') && am2.serveStateOf(U)?.since === T0);
const P = am2.createPool({ name: '全部', members: [U, M] }).id;
ck('pool MEMBERSHIP is untouched by a lapse', JSON.stringify(am2.poolMembership(P)) === JSON.stringify([U, M]) || (Array.isArray(am2.poolMembership(P)) && am2.poolMembership(P).includes(U)));

// ── §3 THE ENGINE'S TWO FUNCTIONS, RUN FOR REAL ─────────────────────────────
console.log('§3 memberServeLapsed / noteMemberServeFailure on a scratch store');
const ENG = read('src/server/usage-pool-engine.js');
const i0 = ENG.indexOf('function ownReading(id) {'), i1 = ENG.indexOf('\n/** A RENEWED SUBSCRIPTION\'S FIRST ANSWER');
const SLICE = i0 > 0 && i1 > i0 ? ENG.slice(i0, i1) : '';
ck('the engine declares ownReading + memberServeLapsed + noteMemberServeFailure together, before the renewal rung', /function memberServeLapsed\(id, \{ verified = false \} = \{\}\)/.test(SLICE) && /function noteMemberServeFailure\(/.test(SLICE));
const PA = require(path.join(REPO, 'src/account-pool-auto.js'));
const CACHE = path.join(SCR, 'usage-cache'); fs.mkdirSync(CACHE);
const NUM = { fiveHour: { utilization: 0.4, resetsAt: 1791100000 }, sevenDay: { utilization: 0.6, resetsAt: 1791500000 } };
const writeReading = (id, at, { numbers = NUM, source = 'passive' } = {}) => fs.writeFileSync(path.join(CACHE, id + '.json'), JSON.stringify({ fetchedAt: at, source, ...numbers }));
const build = (src, { tokenSig = () => 'tok-1', setting = undefined, lapseCleared = PA.lapseCleared } = {}) => {
  const lines = [], todos = [], events = [], done = [];
  const fakeTodos = { add: (k, o) => { const it = { id: 'td' + (todos.length + 1), key: k, ...o, status: 'open' }; todos.push(it); return it; }, get: (id) => todos.find((x) => x.id === id) || null, setStatus: (id, st, why) => { done.push([id, st, why]); const it = todos.find((x) => x.id === id); if (it) it.status = st; } };
  const con = { log: (l) => lines.push(String(l)), warn: (...a) => lines.push('WARN ' + a.join(' ')) };
  const fn = new Function('fs', 'path', 'USAGE_CACHE_DIR', 'accounts', 'SERVE_LAPSED', 'lapseCleared', 'serveAfterFailure', 'readingFingerprint', 'getUserTodos', 'i18nKey', 'quotaSourceFor', 'console', 'global', 'credsTokenSig', 'serverSetting',
    src + '\nreturn { ownReading, memberServeLapsed, noteMemberServeFailure };');
  const api = fn(fs, path, CACHE, am2, PA.SERVE_LAPSED, lapseCleared, PA.serveAfterFailure, PA.readingFingerprint, () => fakeTodos, (s) => s, (be) => harnesses.get(be).quota, con, { __vsEvent: (k, d) => events.push([k, d]) }, tokenSig, (k) => (k === 'accounts.onDemandQuotaRefresh' ? setting : undefined));
  return { ...api, lines, todos, events, done };
};
am2.setServeState(U, null);
writeReading(U, Date.now() - 600e3); // the member's last reading before the lapse (its numbers = NUM)
const E = build(SLICE);
const v1 = E.noteMemberServeFailure(U, { message: PROD }, { source: 'a turn of fixture' });
const r1 = am2.serveStateOf(U);
ck('a lapse answer opens an EPISODE: the record is persisted (state lapsed, since = lastFail) with the numbers it held at the failure (fp)', v1?.kind === 'lapsed' && v1.episode === true && r1?.state === 'lapsed' && r1.since === r1.lastFail && r1.fp === PA.readingFingerprint(NUM));
ck('…said ONCE: one journal line + one For-you item (origin pool, notice, the member\'s name), its id kept on the record',
  E.lines.filter((l) => /\[pool\] serve: UCI Max .* subscription inactive/.test(l)).length === 1 && E.todos.length === 1 && E.todos[0].origin === 'pool' && E.todos[0].kind === 'notice' && E.todos[0].i18n?.text?.params?.account === 'UCI Max' && r1.todoId === E.todos[0].id);
ck('…and SAYS WHAT IS TRUE under the default usage-refresh setting (manual: nothing asks it by itself — "after renewing, press Re-check")',
  /^UCI Max's subscription is no longer active \(since .+\): the pool skips it until it answers again — after renewing, press Re-check on its row in Manage Agents$/.test(E.todos[0].text) && /Nothing asks it by itself/.test(E.todos[0].detail) && !/by itself once|hourly/.test(E.todos[0].text));
const lastFail1 = r1.lastFail;
await new Promise((r) => setTimeout(r, 5));
const v2 = E.noteMemberServeFailure(U, { message: PROD }, { source: 'a usage check' });
const r2 = am2.serveStateOf(U);
ck('a REPEAT (a probe answering the same sentence) only moves lastFail — no second line, no second item, since kept', v2?.episode === false && r2.lastFail > lastFail1 && r2.since === r1.since && E.todos.length === 1 && E.lines.filter((l) => /subscription inactive/.test(l)).length === 1);
const v3 = E.noteMemberServeFailure(M, { status: 403, message: 'Forbidden' });
ck('an `auth` answer persists NOTHING (the 10-minute mark keeps the transient failures)', v3?.kind === 'auth' && am2.serveStateOf(M) === null);
writeReading(U, r2.lastFail - 1000, { numbers: { ...NUM, fiveHour: { utilization: 0.02, resetsAt: 1791200000 } } });
ck('a reading measured BEFORE the last failure is not evidence (even with other numbers) — still lapsed', E.memberServeLapsed(U)?.state === 'lapsed');
writeReading(U, r2.lastFail + 60e3, { source: 'passive' });
ck('verify r1 ②⑦ REPRO: a statusline RE-STAMP of the pre-lapse numbers AFTER the failure is not evidence — still lapsed', E.memberServeLapsed(U)?.state === 'lapsed' && am2.serveStateOf(U)?.state === 'lapsed');
const W1 = build(SLICE, { lapseCleared: (s, r) => Number(r.at) > Number(s.lastFail) }); // the r1 rule, patched in
ck('CONTROL (patched copy: r1\'s write-time rule): that same re-stamp RE-ADMITS the lapsed member — the leg above is the fix', W1.memberServeLapsed(U) === null);
am2.setServeState(U, { ...r2 });
const TOK = build(SLICE, { tokenSig: () => 'tok-2-refreshed' });
ck('a TOKEN REFRESH does not clear it (the credential material changed, no new reading) — still lapsed', TOK.memberServeLapsed(U)?.state === 'lapsed' && am2.serveStateOf(U)?.state === 'lapsed');
const MUT = SLICE.replace('  if (!lapseCleared(s, { ...r, verified: verified === true })) return s;\n', '  if (!lapseCleared(s, { ...r, verified: verified === true }) && credsTokenSig(id) === s.tok) return s;\n');
const TM = build(MUT, { tokenSig: () => 'tok-2-refreshed' });
ck('CONTROL (patched copy clearing on a token change): RED here — it re-admits the lapsed member', MUT !== SLICE && TM.memberServeLapsed(U) === null);
am2.setServeState(U, { ...r2 });
ck('a VERIFIED panel answer after the failure clears it (memberServeLapsed(id, {verified: true}) — the ⟳ / hourly panel\'s edge)', build(SLICE).memberServeLapsed(U, { verified: true }) === null && am2.serveStateOf(U) === null);
am2.setServeState(U, { ...r2 });
writeReading(U, r2.lastFail + 90e3, { source: 'rate-limit-event' });
ck('a rate_limit_event reading after the failure clears it (the API served a request on its window)', build(SLICE).memberServeLapsed(U) === null);
am2.setServeState(U, { ...r2 });
writeReading(U, r2.lastFail + 120e3, { numbers: { ...NUM, fiveHour: { utilization: 0.01, resetsAt: 1791900000 } } });
const E2 = build(SLICE);
ck('numbers that MOVED after the failure clear it: null, record removed, one "answered again" line, the For-you item done',
  E2.memberServeLapsed(U) === null && am2.serveStateOf(U) === null && E2.lines.filter((l) => /\[pool\] serve: UCI Max .* answered again/.test(l)).length === 1 && E2.events.some(([k]) => k === 'pool-member-serve-restored'));
const E3 = build(SLICE, { setting: 'auto-cli' });
ck('…a NEW lapse after that is a NEW episode; under accounts.onDemandQuotaRefresh = auto-cli its words say the hourly check is asking',
  E3.noteMemberServeFailure(U, { message: PROD })?.episode === true && E3.todos.length === 1 && /it rejoins by itself once it answers again \(checked about hourly\) — Re-check it in Manage Agents$/.test(E3.todos[0].text) && /every 30–60 min/.test(E3.todos[0].detail));
am2.setServeState(U, null);

// verify r2 ②: under 'off' the ⟳ route refuses (403) — the words NAME the setting instead of sending the owner to Re-check
am2.setServeState(U, null);
const EO = build(SLICE, { setting: 'off' });
EO.noteMemberServeFailure(U, { message: PROD });
ck('r2 ② under accounts.onDemandQuotaRefresh = off the item NAMES the setting and never says Re-check asks the CLI',
  EO.todos.length === 1 && /usage refresh is Off in Settings: turn it on to Re-check, or run a turn on it directly$/.test(EO.todos[0].text) && /On-demand quota refresh is Off in Settings/.test(EO.todos[0].detail) && !/asks the CLI once/.test(EO.todos[0].detail));
const OFFMUT = SLICE.replace("todos.add('webui:pool-serve', mode === 'off' ? {", "todos.add('webui:pool-serve', false ? {");
am2.setServeState(U, null);
const EOM = build(OFFMUT, { setting: 'off' }); EOM.noteMemberServeFailure(U, { message: PROD });
ck('CONTROL (patched copy without the off branch): under Off the item tells the owner to press Re-check — the press the route refuses', OFFMUT !== SLICE && /press Re-check on its row in Manage Agents$/.test((EOM.todos[0] || {}).text || ''));
// verify r2 ③: a subscription NO pool lists gets no pool words
am2.setServeState(U, null);
const SOLO = am2.createSubscription({ name: 'Solo Max' }).id; login(am2, SOLO);
const ES = build(SLICE);
const vs = ES.noteMemberServeFailure(SOLO, { message: PROD });
ck('r2 ③ a subscription NO pool lists: the lapse is recorded (its roster row says it) but NO pool-worded For-you item; the journal says no pool lists it',
  vs?.episode === true && am2.serveStateOf(SOLO)?.state === 'lapsed' && ES.todos.length === 0 && ES.lines.some((l) => /no pool lists it; its conversations fail/.test(l)) && !ES.lines.some((l) => /the pool skips it/.test(l)));
const SOLOMUT = SLICE.replace('const item = !pooled ? null : todos', 'const item = false ? null : todos');
am2.setServeState(SOLO, null);
const ESM = build(SOLOMUT); ESM.noteMemberServeFailure(SOLO, { message: PROD });
ck('CONTROL (patched copy with the pooled branch forced): "Solo Max\'s … the pool skips it" is filed for an account no pool lists', SOLOMUT !== SLICE && /^Solo Max's .*the pool skips it/.test((ESM.todos[0] || {}).text || ''));
am2.setServeState(U, { state: 'lapsed', since: Date.now(), why: 'x', lastFail: Date.now() });
const rowsNow = am2.list().accounts;
ck('accounts.list() carries inPools beside serve (true for a pool member, false for an account no pool lists)', rowsNow.find((x) => x.id === U)?.inPools === true && rowsNow.find((x) => x.id === SOLO)?.inPools === false);
am2.setServeState(U, null); am2.setServeState(SOLO, null);

// ── §4 THE AUTO-CLI IDLE RUNG ───────────────────────────────────────────────
console.log('§4 the idle rung keeps probing a lapsed member at its 30–60 min cadence');
const { createAutoCliLoop } = require(path.join(REPO, 'src/server/auto-cli-loop.js'));
const runLoop = async ({ lapsedDep, hours = 12 }) => {
  const D2 = path.join(SCR, 'loop-' + Math.random().toString(36).slice(2)); fs.mkdirSync(D2);
  const am3 = new AccountManager({ dataDir: D2 });
  const id = am3.createSubscription({ name: 'UCI Max' }).id; login(am3, id);
  am3.setServeState(id, { state: 'lapsed', since: 1, why: 'x', lastFail: 1 });
  let T = Date.parse('2026-10-08T13:30:00Z'); const at = [];
  const loop = createAutoCliLoop({
    serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined), accounts: am3, autoCliReady: () => true,
    ...(lapsedDep ? { memberServeLapsed: (x) => am3.serveStateOf(x) } : {}),
    USAGE_CACHE_DIR: path.join(D2, 'cache'), usageIdentityGroupsCached: () => new Map(), usageEstimator: { estimateFor: () => null },
    projectionRereadFor: () => null, projectionBillingIndex: () => null, lastMemberReadAt: () => 0,
    usage: { refreshViaCliPanel: async () => { at.push(T); return false; } }, onMemberReadingFresh() { }, dataDir: D2, now: () => T, rand: () => 0.5, log() { }, warn() { },
  });
  for (let m = 0; m <= hours * 60; m += 5) { T = Date.parse('2026-10-08T13:30:00Z') + m * 60e3; await loop.tick(); }
  const gaps = at.slice(1).map((x, i) => (x - at[i]) / 60e3);
  return { n: at.length, maxGap: gaps.length ? Math.max(...gaps) : 0, minGap: gaps.length ? Math.min(...gaps) : 0 };
};
const lap = await runLoop({ lapsedDep: true }), ctl = await runLoop({ lapsedDep: false });
ck(`a lapsed member whose every probe fails is still probed at the idle cadence (${lap.n} probes in 12 h, gaps ${lap.minGap}–${lap.maxGap} min)`, lap.n >= 13 && lap.maxGap <= 60 && lap.minGap >= 30);
ck(`CONTROL: without the lapse dep the same failures back off to hours (${ctl.n} probes, max gap ${ctl.maxGap} min) — the cadence above is the lapse rule's doing`, ctl.n < lap.n && ctl.maxGap > 120);

// ── §5 WIRING ───────────────────────────────────────────────────────────────
console.log('§5 wiring');
const UR = read('src/usage-routes.js'), SRV = read('server.js'), ACL = read('src/server/auto-cli-loop.js');
const prl = (ENG.match(/\nfunction poolReadLogin\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
ck('poolReadLogin — the reader EVERY gate consults — folds the record in as `serve` (never as a login state)', /const sv = memberServeLapsed\(id\); if \(sv\) st = \{ \.\.\.\(st \|\| \{ state: 'unknown'/.test(prl) && /serve: sv \}/.test(prl));
const hpm = (ENG.match(/\nfunction healthyPoolMembers\(poolId\) \{[\s\S]*?\n\}\n/) || [''])[0];
ck('healthyPoolMembers (the act list) drops a lapsed member with NO fallback — like a dead login', /return \(!st \|\| st\.usable\) && !memberServeLapsed\(m\.id\);/.test(hpm) && /return ok\.length \? ok : usable;/.test(hpm));
const npa = (ENG.match(/\nfunction notePoolAuthFailure\(session, sid, info = \{\}\) \{[\s\S]*?\n\}\n/) || [''])[0];
ck('notePoolAuthFailure: a lapse is recorded durably and NEVER sets the 10-minute mark; the 10-minute path is unchanged for the rest',
  /classifyServeFailure\?\.\(info\)/.test(npa) && /noteMemberServeFailure\(memberId, info, \{/.test(npa) && /if \(!lapsed && !memberAuthFailed\(memberId\)\) \{\n\s*_memberAuthFail\.set\(memberId, \{ at: now, reason: why, tok: credsTokenSig\(memberId\) \}\);/.test(npa)
  && /const AUTH_FAIL_TTL_MS = 10 \* 60e3;/.test(ENG) && /if \(credsTokenSig\(id\) !== m\.tok\) \{ _memberAuthFail\.delete\(id\); return false; \}/.test(ENG));
ck('notePoolAuthFailure: no toast per attempt for a lapse (the episode\'s For-you item is the one voice)', /if \(!lapsed && now - \(_authNoticeAt\.get\(memberId\) \|\| 0\) > 60000\) \{/.test(npa) && /if \(lapsed\) \{ console\.log\(/.test(npa));
ck('the evidence edge: onMemberReadingFresh asks memberServeLapsed first (a Re-check that answers re-admits at once)', /out\.reason = 'no-member'; return out; \}\n\s*try \{ memberServeLapsed\(memberId\); \} catch \{ \}/.test(ENG));
ck('the ⟳ route: a failed panel on a lapsed member answers lapsed and never falls to the token ladder; the panel\'s failed answer reaches the census',
  /if \(!cliOk && !isGlobal && typeof app\.locals\.memberServeLapsed === 'function' && app\.locals\.memberServeLapsed\(key\)\) \{\n\s*const refused = !!\(pv && pv\.outcome === 'write-refused' && pv\.code === 'identity' && pv\.at >= t0\);/.test(UR) && /app\.locals\.noteMemberServeFailure\?\.\(key, \{ message: /.test(UR)
  && /app\.locals\.memberServeLapsed = memberServeLapsed;/.test(ENG) && /app\.locals\.noteMemberServeFailure = \(id, info\) => noteMemberServeFailure\(id, info, \{ source: 'a usage check' \}\);/.test(ENG));
ck('server.js hands memberServeLapsed to the auto-cli loop; the loop paces a lapsed member by the idle threshold', /createAutoCliLoop\(\{ serverSetting, accounts, autoCliReady, memberServeLapsed,/.test(SRV) && /const lapsed = !!\(d\.memberServeLapsed && d\.memberServeLapsed\(a\.id\)\);/.test(ACL));
ck('the panel\'s renewal rung (verify r1 ③): a lapsed member\'s phase-only refusal is handed to reanchorLapsedMember BEFORE the refusal branch, and a verified write is the evidence',
  /if \(idv && idv\.refused && !isGlobal && typeof app\.locals\.reanchorLapsedMember === 'function' && app\.locals\.reanchorLapsedMember\(key, idv\)\) \{/.test(UR) && UR.indexOf('app.locals.reanchorLapsedMember(key, idv)') < UR.indexOf('  if (idv.refused) {')
  && /if \(wrote\.ok && idv && idv\.verified && !isGlobal\) \{ try \{ app\.locals\.memberServeLapsed\?\.\(key, \{ verified: true \}\); \} catch \{ \} \}/.test(UR) && /app\.locals\.reanchorLapsedMember = reanchorLapsedMember;/.test(ENG));
ck('the dwell belt exempts a lapse escape (hard death) like a dead login, in both passes', (ENG.match(/reason !== 'subscription-lapsed' && (ds|d)\.reason !== 'login-expired'/g) || []).length === 2);

// ── §6 THE WORDS ────────────────────────────────────────────────────────────
console.log('§6 the words (roster chip, pool submenu, zh/ja)');
const { memberState, gatherWords } = await import(path.join(REPO, 'src/lib/pool-priority-model.js'));
const ms = memberState({ loggedIn: true, loginState: { state: 'live' }, usage: { sevenDay: { utilization: 0.1, resetsAt: Date.now() / 1000 + 86400 } }, serve: { state: 'lapsed', since: 1 } });
ck('pool submenu: a lapsed member is worded "skipped — subscription inactive" (never greyed without words), even with a usable-looking cache', ms.code === 'lapsed' && ms.key === 'skipped — subscription inactive');
ck('…a dead login still wins the row (order: not signed in › login expired › subscription inactive)', memberState({ loggedIn: true, loginState: { state: 'expired' }, serve: { state: 'lapsed' } }).code === 'login-expired');
ck('gather refusal words a pin-lapsed target', /subscription inactive/.test(gatherWords({ success: false, code: 'target_cannot_serve', why: 'pin-lapsed', member: 'UCI Max' }, (k, p) => k.replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')), {}).text));
const MA = read('src/lib/manage-agents.js');
const cs = MA.indexOf('export function serveLapsedChipHtml('), ce = MA.indexOf('\n}\n', cs);
const chipFn = new Function('t', 'escHtml', 'loginWhenText', 'ROSTER_ICONS', MA.slice(cs, ce + 2).replace(/^export /, '') + '\nreturn serveLapsedChipHtml;')(
  (k, p) => k.replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')), (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), () => '10/8/26, 1:30 PM', { CLOCK: '' });
const chip = chipFn({ id: 'sub-080ce98c7dca', serve: { state: 'lapsed', since: 1, why: 'has <disabled> access' } });
const chipAuto = chipFn({ id: 'sub-080ce98c7dca', serve: { state: 'lapsed', since: 1, why: 'x' } }, { mode: 'auto-cli' });
const chipOff = chipFn({ id: 'sub-080ce98c7dca', serve: { state: 'lapsed', since: 1, why: 'x' } }, { mode: 'off' });
const chipSolo = chipFn({ id: 'sub-solo', serve: { state: 'lapsed', since: 1, why: 'x' } }, { pooled: false });
ck('r2 ② roster chip under Off: NO Re-check verb, not a button, and its title names the setting', !/Re-check/.test(chipOff) && !/role="button"/.test(chipOff) && !/data-serve-recheck/.test(chipOff) && /Usage refresh is Off in Settings/.test(chipOff));
ck('r2 ③ roster chip for an account NO pool lists: no pool words (its conversations fail until it answers again)', !/pool/i.test(chipSolo) && /its conversations fail until it answers again/.test(chipSolo) && /· Re-check<\/span>$/.test(chipSolo));
ck('roster chip title says what is true per setting (manual: nothing asks it by itself; auto-cli: it rejoins by itself)', /Nothing asks it by itself under the current usage-refresh setting/.test(chip) && !/rejoins by itself/.test(chip) && /rejoins by itself once it answers again/.test(chipAuto));
ck('roster chip: "subscription inactive since {when} · Re-check", a Re-check button for THIS account, the why escaped', /subscription inactive since 10\/8\/26, 1:30 PM · Re-check<\/span>$/.test(chip) && /data-serve-recheck="sub-080ce98c7dca"/.test(chip) && /has &lt;disabled&gt; access/.test(chip) && chipFn({ id: 'x' }) === '' && chipFn({ id: 'x', serve: { state: 'other' } }) === '');
ck('roster: the chip rides the login slot of a subscription row (outside the note\'s ellipsis box) and Re-check posts the existing ⟳ route', /\+ \(isSub && !selectedHost \? serveLapsedChipHtml\(a, \{ mode: this\.settings\?\.get\?\.\('accounts\.onDemandQuotaRefresh'\) \|\| 'manual', pooled: a\.inPools !== false \}\) : ''\);/.test(MA) && /else if \(r && r\.refused\) showToast\(/.test(MA) && /closest\?\.\('\.acct-serve-chip'\)/.test(MA) && /fetchJson\('\/api\/usage\/refresh', \{ method: 'POST', headers: \{ 'Content-Type': 'application\/json' \}, body: JSON\.stringify\(\{ account: target \}\) \}\)/.test(MA));
const hs = MA.indexOf("const serveChip = e.target.closest?.('.acct-serve-chip');"), hb = MA.indexOf('.then((r) => {', hs), he = MA.indexOf('\n          });', hb);
const thenBody = hs > 0 && hb > hs && he > hb ? MA.slice(hb + '.then((r) => {'.length, he) : '';
const runThen = (body, r, inPools = true) => { const toasts = []; new Function('r', 'showToast', 't', 'name', 'inPools', 'refresh', body)(r, (m, o) => toasts.push([m, (o && o.type) || null]), (k, p) => k.replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : '')), 'UCI Max', inPools, () => { }); return toasts; };
const off403 = { error: 'on-demand quota refresh is disabled in Settings' };
ck('r2 ② the chip handler toasts the ROUTE\'s own refusal (the 403 under Off), never "still does not answer"', JSON.stringify(runThen(thenBody, off403)) === JSON.stringify([['on-demand quota refresh is disabled in Settings', 'error']]));
ck('…a lapsed "did not answer" still gets the plain words; an account no pool lists gets no pool words', /still does not answer — the pool keeps skipping it/.test(runThen(thenBody, { error: 'x', lapsed: true })[0][0]) && /still does not answer — its subscription stays inactive/.test(runThen(thenBody, { error: 'x', lapsed: true }, false)[0][0]));
const thenMut = thenBody.replace(/\n\s*else if \(r && r\.error && !r\.lapsed\) showToast\(String\(r\.error\), \{ type: 'error' \}\);[^\n]*/, '');
ck('CONTROL (patched copy without the r.error branch): the 403 is reported as "still does not answer"', thenMut !== thenBody && /still does not answer/.test(runThen(thenMut, off403)[0][0]));
const KEYS = ['skipped — subscription inactive', 'subscription inactive', 'subscription inactive since {when}', 'Re-check', '{name} answered — it is back in its pools', '{name} still does not answer — the pool keeps skipping it',
  'This account’s subscription no longer serves ({why}). The pool skips it and keeps its membership, note and readings.', 'This account’s subscription no longer serves ({why}); its conversations fail until it answers again.',
  'Usage refresh is Off in Settings — turn it on to check it, or run a turn on it directly.', 'It rejoins by itself once it answers again (checked about hourly). Click to check now.',
  '{name} answered — its subscription is active again', '{name} answered, but the reading was refused as another account’s window — it stays inactive', '{name} still does not answer — its subscription stays inactive',
  "{account}'s subscription is no longer active (since {since}): the pool skips it until it answers again — usage refresh is Off in Settings: turn it on to Re-check, or run a turn on it directly",
  "{account}'s subscription is no longer active (since {since}): the pool skips it; it rejoins by itself once it answers again (checked about hourly) — Re-check it in Manage Agents",
  "{account}'s subscription is no longer active (since {since}): the pool skips it until it answers again — after renewing, press Re-check on its row in Manage Agents",
  'Nothing asks it by itself under the current usage-refresh setting — after renewing, click to check it now.',
  '{name} answered, but the reading was refused as another account’s window — the pool keeps skipping it',
  'Pool "{pool}": conversation "{title}" — {member}\'s subscription is inactive — running on {target} until it answers again (pin kept).'];
for (const lang of ['zh', 'ja']) {
  const dict = (await import(path.join(REPO, `src/lib/i18n-${lang}.js`))).default;
  const miss = KEYS.filter((k) => typeof dict[k] !== 'string' || !dict[k].trim());
  const ph = KEYS.filter((k) => dict[k] && JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((dict[k].match(/\{\w+\}/g) || []).sort()));
  ck(`${lang}: every new word is translated with the same {placeholders}`, !miss.length && !ph.length);
}
ck('the For-you keys and the engine texts are the same sentences (the client words the item with t(key, params))', ENG.includes("i18nKey('{account}\\'s subscription is no longer active (since {since}): the pool skips it; it rejoins by itself once it answers again (checked about hourly) — Re-check it in Manage Agents')") && ENG.includes("i18nKey('{account}\\'s subscription is no longer active (since {since}): the pool skips it until it answers again — after renewing, press Re-check on its row in Manage Agents')"));

// ── §7 THE REAL ENGINE (verify r1 ⑥): the money paths, each fix beside a PATCHED COPY that reverts it ──
console.log('§7 the real engine: quotaVerdictFor, beforeAutoResumeFire, fallbackDefaultTarget, the evidence writers');
{
  const ENGINE = path.join(REPO, 'src/server/usage-pool-engine.js');
  const patched = (name, edits) => {
    let txt = fs.readFileSync(ENGINE, 'utf8').replace(/require\('(\.\.?\/[^']+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(ENGINE), f))})`);
    for (const [a, b] of edits) { if (!txt.includes(a)) throw new Error(`patch anchor missing in ${name}: ${a.slice(0, 70)}`); txt = txt.replace(a, b); }
    const out = path.join(SCR, name); fs.writeFileSync(out, txt); return require(out);
  };
  const REAL = require(ENGINE);
  const NO_VERDICT = patched('eng-no-verdict.js', [["      if (memberLapsed(li)) return { id: m.id, name: m.name || m.id, v: { ...v, usable: false, blockedUntil: 0, reason: 'subscription inactive — it rejoins once it answers again' } }; // verify r1 ①\n", '']]);
  const NO_FALLBACK = patched('eng-no-fallback.js', [[", readLogin: poolReadLogin() }); // a lapsed member last (verify r1 ④)", ' });']]);
  const NO_DIRECT = patched('eng-no-direct.js', [["    if (a && a.type === 'subscription' && !session.host) {\n", "    if (false) {\n"]]);
  const { captureRateLimitEvent, parseRateLimitEvent } = require(path.join(REPO, 'src/rate-limit-capture.js'));
  const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
  let wn = 0;
  const nowS = () => Math.floor(Date.now() / 1000);
  const mkWorld = (engMod) => {
    const root = path.join(SCR, 'eng-' + (++wn)), dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
    const am = new AccountManager({ dataDir });
    const lg = (id, n) => { login(am, id); fs.writeFileSync(path.join(am.subDir(id), '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: n + '@example.com', organizationName: 'org ' + n } })); };
    const A = am.createSubscription({ name: 'UCI Max' }).id; lg(A, 'a');
    const B = am.createSubscription({ name: 'Mat Max' }).id; lg(B, 'b');
    const C = am.createSubscription({ name: 'Third' }).id; lg(C, 'c');
    const P = am.createPool({ name: '全部', members: [A, B, C] }).id;
    am.updatePool(P, { auto: true, hot: true });
    am.setPoolTarget(P, B);
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const put = (id, u5, u7) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 120e3, source: 'cli-usage', fiveHour: { utilization: u5, resetsAt: nowS() + 4 * 3600 }, sevenDay: { utilization: u7, resetsAt: nowS() + 3 * 86400 } }));
    put(A, 0.1, 0.2); put(B, 1, 0.5); put(C, 1, 0.5); // the lapsed member's cache is the only usable-looking one (the production shape)
    const sessions = new Map(), notices = [], todos = [];
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const eng = engMod.create({
      app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
      serverNotice: (k, t) => notices.push(t), serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
      getUserTodos: () => ({ add: (k, o) => { const it = { id: 'td' + (todos.length + 1), ...o, status: 'open' }; todos.push(it); return it; }, get: () => null, setStatus() { } }),
    });
    const lapse = (id) => am.setServeState(id, { state: 'lapsed', since: Date.now() - 60e3, why: 'has disabled Claude subscription access for Claude Code', lastFail: Date.now() - 60e3, fp: PA.readingFingerprint(JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8'))) });
    return { am, eng, P, A, B, C, cacheDir, sessions, notices, todos, app, lapse, root };
  };
  const quiet = async (f) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await f(); } finally { console.log = l; console.warn = w; } };
  // ① quotaVerdictFor — the verdict the wall's arm and the pre-fire gate spend on
  const w1 = mkWorld(REAL);
  const v0 = await quiet(() => w1.eng.quotaVerdictFor(w1.P, { model: 'claude-opus-4-5' }));
  w1.lapse(w1.A);
  const v1 = await quiet(() => w1.eng.quotaVerdictFor(w1.P, { model: 'claude-opus-4-5' }));
  ck(`① CONTROL: before the lapse the pool verdict is "usable via UCI Max" (${v0.usable} via ${v0.via})`, v0.usable === true && v0.viaId === w1.A);
  ck(`① quotaVerdictFor never answers "usable via" a LAPSED member — usable false, armed at the others' real reset, the lapse named (${String(v1.reason).slice(0, 90)})`,
    v1.usable === false && v1.blockedUntil > Date.now() && /UCI Max: subscription inactive/.test(v1.reason));
  const wN = mkWorld(NO_VERDICT); wN.lapse(wN.A);
  const vN = await quiet(() => wN.eng.quotaVerdictFor(wN.P, { model: 'claude-opus-4-5' }));
  ck('① PATCHED COPY without the lapse refusal: "usable via UCI Max" — the billed continue into a member that cannot serve', vN.usable === true && vN.viaId === wN.A);
  const vd = await quiet(() => w1.eng.quotaVerdictFor(w1.A, { model: 'claude-opus-4-5' }));
  ck('① a subscription bound DIRECTLY and lapsed is refused too (usable false, no timer heals it)', vd.usable === false && vd.blockedUntil === 0 && /subscription inactive/.test(vd.reason));
  // the pre-fire gate (auto-resume asks it before it spends a turn): a conversation walled on Mat Max
  const sid = 'sess-walled';
  w1.sessions.set(sid, { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, _accountId: w1.P, _servedModel: 'claude-opus-4-5', name: 'walled', createdAt: Date.now() - 6e5 });
  w1.am.ensureSessionPoolLink(w1.P, sid, w1.B);
  const fire1 = await quiet(() => w1.eng.beforeAutoResumeFire(sid, w1.sessions.get(sid)));
  wN.sessions.set(sid, { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, _accountId: wN.P, _servedModel: 'claude-opus-4-5', name: 'walled', createdAt: Date.now() - 6e5 });
  wN.am.ensureSessionPoolLink(wN.P, sid, wN.B);
  const fireN = await quiet(() => wN.eng.beforeAutoResumeFire(sid, wN.sessions.get(sid)));
  ck('① beforeAutoResumeFire REFUSES the continue when the only usable-looking member is lapsed', fire1 === false);
  ck('① PATCHED COPY: the same gate says GO (a billed continue) — the leg above is the fix', fireN === true);
  // ④ the default's fallback when the default is removed and nobody can take it over
  const f1 = await quiet(() => w1.eng.fallbackDefaultTarget(w1.P, w1.C));
  const wF = mkWorld(NO_FALLBACK); wF.lapse(wF.A);
  const fN = await quiet(() => wF.eng.fallbackDefaultTarget(wF.P, wF.C));
  ck(`④ fallbackDefaultTarget never parks the pool (and every NEW conversation) on the lapsed member while another is listed (→ ${w1.am.get(f1)?.name})`, f1 === w1.B);
  ck('④ PATCHED COPY without the lapse order: it parks the pool on the lapsed UCI Max', fN === wF.A);
  // ⑤ + the evidence writers, on the real engine
  const w2 = mkWorld(REAL);
  const s2 = { backend: 'claude', mode: 'chat', host: null, _webuiId: 's-pool', _accountId: w2.P, name: 'c1', createdAt: Date.now() - 6e5 };
  w2.sessions.set('s-pool', s2); w2.am.ensureSessionPoolLink(w2.P, 's-pool', w2.A);
  await quiet(() => w2.eng.notePoolAuthFailure(s2, 's-pool', { message: PROD }));
  const st2 = w2.am.serveStateOf(w2.A);
  ck('the real auth-failure path records the lapse on the account (not the 10-min mark): healthyPoolMembers drops it, one For-you item',
    st2?.state === 'lapsed' && !w2.eng.healthyPoolMembers(w2.P).some((m) => m.id === w2.A) && w2.todos.length === 1 && w2.notices.length === 0);
  await new Promise((r) => setTimeout(r, 5));
  usageWrite.writeCacheObject({ cacheDir: w2.cacheDir, key: w2.A, obj: { ...JSON.parse(fs.readFileSync(path.join(w2.cacheDir, w2.A + '.json'), 'utf8')), source: 'passive', fetchedAt: Date.now() }, measuredAt: Date.now(), backend: 'claude' });
  ck('②⑦ the real cache writer RE-STAMPING the pre-lapse numbers (a statusline render) does not re-admit it', JSON.parse(fs.readFileSync(path.join(w2.cacheDir, w2.A + '.json'), 'utf8')).fetchedAt > st2.lastFail && w2.eng.memberServeLapsed(w2.A)?.state === 'lapsed');
  const ev = parseRateLimitEvent({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.03, resetsAt: nowS() + 5 * 3600 } });
  const cap = captureRateLimitEvent({ cacheDir: w2.cacheDir, key: w2.A, identityIds: [w2.A], ev, now: Date.now() + 1000 });
  ck('②⑦ a real rate_limit_event reading on its window after the failure re-admits it', cap.ok === true && w2.eng.memberServeLapsed(w2.A) === null && w2.am.serveStateOf(w2.A) === null);
  // ⑤ a conversation bound DIRECTLY to the subscription
  const s3 = { backend: 'claude', mode: 'chat', host: null, _webuiId: 's-direct', _accountId: w2.C, name: 'd1' };
  await quiet(() => w2.eng.notePoolAuthFailure(s3, 's-direct', { message: PROD }));
  const w5 = mkWorld(NO_DIRECT);
  await quiet(() => w5.eng.notePoolAuthFailure({ ...s3, _accountId: w5.C }, 's-direct', { message: PROD }));
  ck('⑤ a conversation bound DIRECTLY to the subscription records the lapse too (its pools then skip it)', w2.am.serveStateOf(w2.C)?.state === 'lapsed' && !w2.eng.healthyPoolMembers(w2.P).some((m) => m.id === w2.C));
  ck('⑤ PATCHED COPY (r1: returns at type !== pooled): nothing recorded', w5.am.serveStateOf(w5.C) === null);
  // ③ the renewal rung: a lapsed member's phase-only refusal, its window held by nobody else
  const idv = { refused: true, org: 'unknown', phase: 'differ', matched: [], panelWindow: { sevenDay: nowS() + 6 * 86400, fiveHour: null, scoped: { fable: nowS() + 6 * 86400 } }, apiWindow: { sevenDay: nowS() + 2 * 86400, fiveHour: null, scoped: {} } };
  const { compareWindows } = require(path.join(REPO, 'src/reading-lag.js'));
  // the pre-lapse witness the renewal's panel is refused against (what the real panelIdentityVerdict compares)
  const preApi = { sevenDay: idv.apiWindow.sevenDay, scoped: {}, at: Date.now() - 86400e3, sessionId: null, source: 'rate-limit-events', n: 3, ring: [], ringAt: Date.now() - 86400e3 };
  usageWrite.writeSidecar(w2.cacheDir, require(path.join(REPO, 'src/reading-lag.js')).apiWindowSidecarName(w2.C), preApi);
  const before3 = compareWindows(idv.panelWindow, w2.eng.apiDerivedWindow(w2.C));
  ck('③ CONTROL (no rung): the renewal\'s panel DIFFERS from the pre-lapse witness — the real comparison the identity check refuses on', before3 === 'differ');
  const rNot = await quiet(() => w2.app.locals.reanchorLapsedMember(w2.B, idv));
  const rMatched = await quiet(() => w2.app.locals.reanchorLapsedMember(w2.C, { ...idv, matched: [w2.B] }));
  const rOrg = await quiet(() => w2.app.locals.reanchorLapsedMember(w2.C, { ...idv, org: 'differ' }));
  const rYes = await quiet(() => w2.app.locals.reanchorLapsedMember(w2.C, idv));
  const side = fs.readdirSync(w2.cacheDir).filter((f) => f.includes(w2.C) && f !== w2.C + '.json');
  ck('③ the renewal rung re-anchors ONLY a lapsed member\'s phase-only refusal whose window nobody else holds (not: a member not lapsed, a window another account holds, a differing org)',
    rNot === false && rMatched === false && rOrg === false && rYes === true && side.length >= 1);
  ck('③ …after the rung the account\'s witness AGREES with that window: the next panel answer is verified (the member is not lapsed for good)', compareWindows(idv.panelWindow, w2.eng.apiDerivedWindow(w2.C)) === 'agree');
  // ── verify r2 ①: ONLY LAPSED members left — the default never moves onto one and a NEW conversation is refused by name ──
  const patchedFile = (name, file, edits, { swap = null } = {}) => {
    let txt = fs.readFileSync(file, 'utf8').replace(/require\('(\.\.?\/[^']+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(file), f))})`);
    if (swap) txt = txt.split(JSON.stringify(swap[0])).join(JSON.stringify(swap[1]));
    for (const [a, b] of edits) { if (!txt.includes(a)) throw new Error(`patch anchor missing in ${name}: ${a.slice(0, 70)}`); txt = txt.replace(a, b); }
    const out = path.join(SCR, name); fs.writeFileSync(out, txt); return out;
  };
  const PA_FILE = path.join(REPO, 'src/account-pool-auto.js'), ACC_FILE = path.join(REPO, 'src/accounts.js');
  const PA_R2 = patchedFile('pa-r2.js', PA_FILE, [["    if (!m || typeof m.id !== 'string' || lapsed(m.id)) return;\n", "    if (!m || typeof m.id !== 'string') return;\n"]]);
  const ENG_R2 = require(patchedFile('eng-r2-fallback.js', ENGINE, [], { swap: [PA_FILE, PA_R2] }));
  const NO_CHOOSER = require(patchedFile('eng-no-chooser.js', ENGINE, [["    if (!staleDefault && memberServeLapsed(cur)) return fallbackDefaultTarget(poolId, cur);\n", '']]));
  const ACC_R2 = require(patchedFile('acc-r2.js', ACC_FILE, [["      if (lapsed(cur)) {\n        const alt = activeAlt();", "      if (false) {\n        const alt = activeAlt();"], ["        if (!servable(member)) {", "        if (!liveTarget(member)) {"], [".filter((m) => this.serveStateOf(m.id)?.state !== 'lapsed');\n    if (list.length && !list.some((m) => m.id === cur)) {", ";\n    if (list.length && !list.some((m) => m.id === cur)) {"]]));
  const spawnErr = (am, P, eng, sessionKey) => { try { const r = am.resolveForSpawn(P, 'claude', { ...(sessionKey ? { sessionKey } : {}), chooseMember: (pid, o) => eng.poolChooserForModel(pid, { model: null, ...(o || {}) }) }); return { target: r && r.poolTarget }; } catch (e) { return { code: e.code || null, msg: e.message }; } };
  // (a) the removal door: the owner removes Mat Max + Third, leaving only the lapsed UCI Max (the members route's own sequence)
  const removeAllBut = async (w) => {
    const decide = (from) => w.eng.decideDefaultTarget(w.P, from) || w.eng.fallbackDefaultTarget(w.P, from);
    const logs = [];
    const l0 = console.log, w0 = console.warn; console.log = (x) => logs.push(String(x)); console.warn = (x) => logs.push(String(x));
    try { w.am.updatePool(w.P, { members: [w.A] }, { chooseMember: decide }); w.eng.memberRemoved(w.P, [w.B, w.C], { why: 'removed-from-pool' }); } finally { console.log = l0; console.warn = w0; }
    return logs;
  };
  const w6 = mkWorld(REAL); w6.lapse(w6.A);
  const logs6 = await removeAllBut(w6);
  const fb6 = await quiet(() => w6.eng.fallbackDefaultTarget(w6.P, w6.B));
  const sp6 = await quiet(() => spawnErr(w6.am, w6.P, w6.eng, 'n-1'));
  ck(`r2 ① removal leaves only a lapsed member: fallbackDefaultTarget null, the default STAYS (not onto UCI Max), journal "…is signed in and active", a new conversation REFUSED by name (${sp6.code})`,
    fb6 === null && w6.am.poolCurrent(w6.P) !== w6.A && logs6.some((l) => /stays — no member the pool lists is signed in and active/.test(l)) && sp6.code === 'all_lapsed' && /inactive subscription — renew one and press Re-check/.test(sp6.msg));
  const w6r = mkWorld(ENG_R2); w6r.lapse(w6r.A); await removeAllBut(w6r);
  ck('r2 ① PATCHED COPY (r2\'s rank-last soonestUsableMember): after the same removal fallbackDefaultTarget hands out the lapsed UCI Max and the default lands on it', (await quiet(() => w6r.eng.fallbackDefaultTarget(w6r.P, w6r.B))) === w6r.A && w6r.am.poolCurrent(w6r.P) === w6r.A);
  // (b) a single-member pool whose only member lapsed
  const mkSingle = async (engMod, AccCls = null) => {
    const w = mkWorld(engMod);
    if (AccCls) { const am2b = new AccCls.AccountManager({ dataDir: path.join(w.root, 'data') }); w.am = am2b; w.eng = engMod.create({ app: w.app, rootDir: w.root, USAGE_CACHE_DIR: w.cacheDir, activeSessions: w.sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am2b, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null }); }
    w.am.updatePool(w.P, { members: [w.A] }); w.am.setPoolTarget(w.P, w.A);
    w.am.setServeState(w.A, { state: 'lapsed', since: Date.now() - 60e3, why: 'x', lastFail: Date.now() - 60e3 });
    return w;
  };
  const w7 = await mkSingle(REAL);
  const s7a = await quiet(() => spawnErr(w7.am, w7.P, w7.eng, 'n-2')), s7b = await quiet(() => spawnErr(w7.am, w7.P, w7.eng, null));
  ck(`r2 ① a single-member pool whose member lapsed: the chooser answers null and resolveForSpawn REFUSES by name, with and without a session link (${s7a.code}/${s7b.code})`,
    (await quiet(() => w7.eng.poolChooserForModel(w7.P, { model: null }))) === null && s7a.code === 'all_lapsed' && s7b.code === 'all_lapsed' && w7.am.poolCurrent(w7.P) === w7.A);
  const w7c = await mkSingle(NO_CHOOSER);
  ck('r2 ① PATCHED COPY (the chooser without the lapse door): it hands out the lapsed default', (await quiet(() => w7c.eng.poolChooserForModel(w7c.P, { model: null }))) === w7c.A);
  const w7s = await mkSingle(REAL, ACC_R2);
  const s7c = await quiet(() => spawnErr(w7s.am, w7s.P, w7s.eng, 'n-3'));
  ck(`r2 ① PATCHED COPY (r2's store, no lapse door): the new conversation STARTS on the lapsed member (→ ${s7c.target === w7s.A ? 'UCI Max' : String(s7c.code || s7c.target)})`, s7c.target === w7s.A);
  // (c) with another active member listed, the store re-points the lapsed default instead of refusing
  const w8 = mkWorld(REAL); w8.am.setPoolTarget(w8.P, w8.A); w8.lapse(w8.A);
  const s8 = await quiet(() => spawnErr(w8.am, w8.P, w8.eng, 'n-4'));
  ck('r2 ① a lapsed default with an active member listed: the conversation starts on the active one (never on UCI Max), and the default moves off it', s8.target && s8.target !== w8.A && w8.am.poolCurrent(w8.P) !== w8.A);
}

fs.rmSync(SCR, { recursive: true, force: true });
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
