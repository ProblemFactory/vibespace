#!/usr/bin/env node
// THE MANUAL RESET-CREDIT USE (docs/design-reset-credits.zh.md §5, chunk p2).
// Owner rulings 2026-09-22: automatic consumption is never the default; a
// BUTTON wherever an interface exists (codex now; claude's is interactive-only
// ⇒ disabled WITH its reason). Three entry points — the Manage Agents roster,
// the chat wall / arm card, the ask-mode For-you item — open ONE dialog, which
// POSTs ONE route; the route writes the verb through the SAME engine writer the
// auto rung uses (the spend ceiling + the 10-min floor).
//
//   §1 dialogModel — the dialog's sentences (PURE, DOM-free table)
//   §2 rosterResetOffer + resetChipHtml — the roster chip / button (claude disabled with its reason)
//   §3 the ROUTE on a fake express over the REAL engine + a stub codex wrapper:
//      not_supported by name for claude · no_live_session · the verb written ONCE
//      through the authorizer · cooldown · no_credits · spend_refused · agent refused ·
//      a person's failed attempt is reported, never walked down the ladder
//   §4 the three entry points call ONE dialog function (source pins + controls)
//   §5 i18n: every new key has zh + ja
// §ban-safety: zero vendor calls — the "wrapper" is a stdin collector.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { writeStub } from './codex-app-server-stub.mjs';
import { runScenarios, SCENARIOS } from './reset-credit-scenarios.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// The negative control's patched engine is written OUTSIDE the tree
// (scripts/mutant-copy.mjs, `require` re-bound on line 1 to the real module's
// path). It used to be an un-ignored sibling (src/server/.usage-pool-engine.rcui-<pid>.js).
const MUTRC = mutantCopies('rcui', REPO);

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
const RC = require(path.join(REPO, 'src/reset-credit.js'));

console.log('§1 dialogModel (PURE)');
{
  const fmt = (s) => `T${s}`;
  const keys = (m) => m.lines.map((l) => l.key);
  const walled = RC.dialogModel({ key: 'cxs-1', name: 'Alpha', vendor: 'openai', creditsLeft: 3, resetsAtSec: 1000 + 7200, periodSec: 604800, remainingPct: 0, sessionId: 'cx1' }, { nowSec: 1000, fmtTime: fmt });
  ok('openai at a wall: account → new window until t+P → the reset it replaces → the wait saved → credits left after',
    JSON.stringify(keys(walled)) === JSON.stringify(['Account: {account}', 'Starts a new {period} window now, running until {until}.', 'Without it the limit resets at {resetsAt}.', 'Saves a wait of {wait}.', '{n} reset credits left after this one.']), JSON.stringify(keys(walled)));
  ok('…with the right numbers (7d period, until = now + P, wait 2h, 2 left) and the name', walled.lines[0].params.account === 'Alpha' && walled.lines[1].params.period === '7d' && walled.lines[1].params.until === 'T605800' && walled.lines[2].params.resetsAt === 'T8200' && walled.lines[3].params.wait === '2h' && walled.lines[4].params.n === 2);
  ok('…confirmable, no refusal', walled.canConfirm === true && walled.refusal === null);
  const open = RC.dialogModel({ key: 'cxs-1', name: 'Alpha', vendor: 'openai', creditsLeft: 1, resetsAtSec: 1000 + 7200, periodSec: 18000, remainingPct: 40 }, { nowSec: 1000, fmtTime: fmt });
  ok('openai NOT at a wall: says what it discards (40 %), and saves NO wait (nobody is waiting)', keys(open).includes('The {pct}% still left in the current window is discarded.') && open.lines.find((l) => /discarded/.test(l.key)).params.pct === 40 && !keys(open).includes('Saves a wait of {wait}.'), JSON.stringify(keys(open)));
  ok('…the LAST credit is named as such', keys(open).includes('This is the last stored reset credit.'));
  ok('NEGATIVE CONTROL: the same facts at a wall DO save the wait — the leg above sees the walled gate', keys(RC.dialogModel({ vendor: 'openai', resetsAtSec: 8200, periodSec: 18000, remainingPct: 0 }, { nowSec: 1000, fmtTime: fmt })).includes('Saves a wait of {wait}.'));
  const an = RC.dialogModel({ key: 'sub-1', name: 'Max', vendor: 'anthropic', resetsAtSec: 9000, remainingPct: 0, creditsLeft: 2 }, { nowSec: 1000, fmtTime: fmt });
  ok('anthropic (P3 reuse): refills in place, the reset time unchanged; no "discarded" line', keys(an)[1] === 'Refills the limit now; it still resets at {resetsAt} (the period does not change).' && !keys(an).some((k) => /discarded/.test(k)));
  const none = RC.dialogModel({ key: '__global__', vendor: null }, { nowSec: 1000, fmtTime: fmt });
  ok('no vendor ⇒ not_supported refusal, not confirmable, only the account line', none.canConfirm === false && none.refusal.key === RC.refusalLine('not_supported').key && none.lines.length === 1);
  for (const code of ['no_live_session', 'no_credits', 'cooldown', 'spend_refused']) {
    const m = RC.dialogModel({ key: 'cxs-1', vendor: 'openai', code, cooldownUntilSec: 5000, error: 'hour cap' }, { nowSec: 1000, fmtTime: fmt });
    ok(`code ${code} ⇒ its own refusal sentence, not confirmable`, m.canConfirm === false && m.refusal && m.refusal.key === RC.refusalLine(code, { until: 'x' }).key);
  }
  ok('cooldown names the instant it lifts; spend_refused carries the ceiling\'s why', RC.dialogModel({ vendor: 'openai', code: 'cooldown', cooldownUntilSec: 5000 }, { nowSec: 1000, fmtTime: fmt }).refusal.params.until === 'T5000' && RC.dialogModel({ vendor: 'openai', code: 'spend_refused', error: 'hour cap' }, { fmtTime: fmt }).refusal.params.why === 'hour cap');
  ok('every REFUSAL_CODE has its own sentence (none falls to the generic line)', RC.REFUSAL_CODES.every((c) => RC.refusalLine(c, { until: 'x' }).key !== RC.refusalLine('zzz').key));
  ok('offerOf keeps a plain accountKey and drops anything else (the card\'s button target)', RC.offerOf({ available: 2, mode: 'off', accountKey: 'cxs-ab_12' }).accountKey === 'cxs-ab_12' && RC.offerOf({ available: 2, mode: 'off', accountKey: '<img src=x>' }).accountKey === undefined && RC.offerOf({ available: 2, mode: 'off', accountKey: 7 }).accountKey === undefined);
}

console.log('\n§2 the roster chip');
{
  ok('rosterResetOffer: capable + a stored count ⇒ usable chip', JSON.stringify(RC.rosterResetOffer({ resetCredits: { availableCount: 3 } }, { capable: true })) === '{"count":3,"useBySec":null,"canUse":true}');
  ok('…zero / unknown count ⇒ nothing', RC.rosterResetOffer({ resetCredits: { availableCount: 0 } }, { capable: true }) === null && RC.rosterResetOffer({ fiveHour: {} }, { capable: true }) === null && RC.rosterResetOffer(null, { capable: true }) === null);
  ok('not capable, no grant sample (claude today) ⇒ nothing — even with a codex-shaped count', RC.rosterResetOffer({ resetCredits: { availableCount: 3 } }, { capable: false }) === null);
  ok('not capable WITH a passive grant ⇒ a chip whose button cannot be used', JSON.stringify(RC.rosterResetOffer({ resetGrant: { resetsLeft: 1, useBySec: 2e9 } }, { capable: false })) === '{"count":1,"useBySec":2000000000,"canUse":false}');
  const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  const live = MA.resetChipHtml({ count: 3, useBySec: null, canUse: true }, { key: 'cxs-"x' });
  ok('resetChipHtml (usable): the count + a LIVE "Use…" button carrying the escaped key', /· 3 reset credits/.test(live) && /<button class="agent-btn acct-reset-use" data-reset-key="cxs-&quot;x"/.test(live) && !/disabled/.test(live), live);
  const dead = MA.resetChipHtml({ count: 1, useBySec: 2e9, canUse: false }, { key: 'sub-1', disabledWhy: 'Claude Code offers only the interactive /limit-reset — run it in a terminal session' });
  ok('resetChipHtml (claude): the button is DISABLED and its title says why (the interactive /limit-reset)', /<button class="agent-btn acct-reset-use" disabled title="Claude Code offers only the interactive \/limit-reset — run it in a terminal session"/.test(dead) && !/data-reset-key/.test(dead), dead);
  ok('no offer ⇒ empty (a row without credits says nothing)', MA.resetChipHtml(null, { key: 'k' }) === '');
  const ma = read('src/lib/manage-agents.js');
  ok('the claude roster passes the CAPABILITY (resetCreditCapable), and the reason only where it cannot spend — never a harness-id branch on the rows', /const claudeCanReset = resetCreditCapable\('claude'\);/.test(ma) && /disabledWhy: claudeCanReset \? '' : CLAUDE_RESET_WHY\(\)/.test(ma));
  ok('the codex roster renders the slot only for local, logged-in, non-pool rows + the machine login, gated on resetCreditCapable', /const canReset = !selectedHost && resetCreditCapable\('codex'\);/.test(ma) && /\$\{!isPool && a\.loggedIn \? resetSlot\(a\.id\) : ''\}/.test(ma) && /resetSlot\('__global_codex__'\)/.test(ma));
  ok('the 8 s poll repaints the chip from the same maps (_repaintRosterUsage second pass)', /document\.querySelectorAll\('\.acct-reset-slot\[data-reset-src\]'\)/.test(ma) && /resetChipHtml\(rosterResetOffer\(snap\.u, \{ capable: true \}\), \{ key: slot\.dataset\.resetKey \}\)/.test(ma));
  ok('agent-meta reads the SERVER caps row (no client mirror to drift)', /export function resetCreditCapable\(backend\) \{\s*\n\s*return serverCapsOf\(backend\)\.resetCredit === true;/.test(read('src/lib/agent-meta.js')));
}

console.log('\n§3 the route over the real engine');
{
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const { registerResetCreditRoutes } = require(path.join(REPO, 'src/routes/reset-credit.js'));
  const roots = [];
  // `keyed` (lane reset-path) = the session's wrapper ADVERTISES `resetCreditKey` in its sidecar, exactly as the
  // current codex-chat-wrapper writes it (data/session-buffers/<id>.json caps): only such a wrapper carries a press
  // `root` (verify r1) = a SECOND engine over an earlier world's data/ — the server restarted
  // verify r5 (the pool's reality): `pool` = a codex POOL [A, B] whose process HOLDS A (the spawn stamp — codex cannot
  // hot-switch) while its link can be moved to B (`repoint`); `acct2` = a SECOND single account B with its own keyed session
  // cx2 (keys crossing); `windows` = the established-window sidecars of A and B (distinct weekly phases) written BEFORE the
  // engine's first reading, so the window guard has evidence to re-file a reading that carries the other member's window
  const world = ({ credits = 3, hourCap = 100, session = true, engine = engMod, sends = true, ackMs = null, keyed = true, helper = null, mode = 'off', root: root0 = null, todos = null, acct = null, cacheCount = null, pool = false, acct2 = false, windows = false, readsFirst = true } = {}) => {
    const root = root0 || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-'));
    roots.push(root);
    const prevHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(root, 'shared-codex');
    const wam = new AccountManager({ dataDir: path.join(root, 'data') });
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const A = root0 ? (acct || wam.list().accounts.find((a) => a.name === 'Cx Alpha').id) : wam.createCodexSubscription({ name: 'Cx Alpha' }).id;
    const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: 'alpha@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-alpha' } })}.sig`;
    if (!root0) fs.writeFileSync(path.join(wam.codexSubDir(A), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-a', id_token: idTok } }));
    const addMember = (name, email, acctId, tok) => { const id = wam.createCodexSubscription({ name }).id; fs.writeFileSync(path.join(wam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: tok, id_token: `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: acctId } })}.sig` } })); return id; };
    const B = (pool || acct2) ? (root0 ? ((wam.list().accounts.find((a) => a.name === 'Cx Beta') || {}).id || null) : addMember('Cx Beta', 'beta@example.com', 'acct-beta', 'tok-b')) : null;
    process.env.CODEX_HOME = prevHome;
    const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    const wallB = nowS + 2 * 86400 + 3 * 3600; // B's weekly phase: three hours off A's (the guard tells them apart)
    if (B && !root0) fs.writeFileSync(path.join(cacheDir, B + '.json'), JSON.stringify({ fetchedAt: Date.now() - 120e3, source: 'codex-rate-limits', limitId: 'codex', sevenDay: { utilization: 1, usedPercent: 100, windowMinutes: 10080, resetsAt: wallB }, fiveHour: null, ...(acct2 ? { resetCredits: { availableCount: 2, at: Date.now() - 120e3 } } : {}) }));
    if (windows && B && !root0) { fs.writeFileSync(path.join(cacheDir, '.window-' + A), JSON.stringify({ sevenDay: nowS + 2 * 86400, fiveHour: null, scoped: {}, at: Date.now() })); fs.writeFileSync(path.join(cacheDir, '.window-' + B), JSON.stringify({ sevenDay: wallB, fiveHour: null, scoped: {}, at: Date.now() })); }
    const poolId = pool ? (root0 ? ((wam.list().accounts.find((a) => a.type === 'pooled') || {}).id || null) : wam.createPool({ name: 'Cx Pool', members: [A, B], backend: 'codex' }).id) : null;
    if (poolId && !root0) wam.setPoolTarget(poolId, A);
    if (!root0) fs.writeFileSync(path.join(cacheDir, A + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'codex-rate-limits', limitId: 'codex', fiveHour: { utilization: 0.3, usedPercent: 30, windowMinutes: 300, resetsAt: nowS + 3600 }, sevenDay: { utilization: 1, usedPercent: 100, windowMinutes: 10080, resetsAt: nowS + 2 * 86400 }, ...(cacheCount !== null ? { resetCredits: { availableCount: cacheCount, fetchedAt: Date.now() - 60e3 } } : {}) }));
    // verify r5: the stub app-server's read RESTATES THIS WORLD'S WALL (the same 7 d reset) unless a leg moves it — a real
    // vendor restates the same instant exactly, and the helper's read-first now refuses a window other than the one shown.
    // A BOOT (root0) keeps the wall the first world seeded (read off the cache file): a wall re-seeded from a later `nowS`
    // would "move" the window by the seconds the restart took
    const wallS = (() => { if (!root0) return nowS + 2 * 86400; try { const c = JSON.parse(fs.readFileSync(path.join(cacheDir, A + '.json'), 'utf8')); return Number(c.sevenDay && c.sevenDay.resetsAt) || nowS + 2 * 86400; } catch { return nowS + 2 * 86400; } })();
    process.env.STUB_READ_RESETS_AT = String(wallS);
    const settings = { 'codex.limitResetCredit': mode, 'spend.unattendedPerIdentityHour': hourCap }; // mode: verify r1's auto-rung legs
    const sessions = new Map(), notices = [], arms = [];
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const eng = engine.create({
      app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t),
      serverSetting: (k) => settings[k], getAccounts: () => wam, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
      getAutoResume: () => ({ armIfEnabled: (sid, s2, until, why) => arms.push({ sid, until, why }), noteRecovered() { }, noteFireOutcome() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
      getUserTodos: () => todos || ({ add: () => ({ id: 'ut-1' }) }),
      ...(ackMs ? { resetCreditAckMs: ackMs } : {}),
      ...(helper ? { resetCreditHelper: helper } : {}),
    });
    // verify r8 T0: the stub wrapper's advert — `resetCreditReadFirst` like the 2.369.202 wrapper (readsFirst:false = an older keyed one)
    const stubCaps = { resetCreditKey: true, ...(readsFirst ? { resetCreditReadFirst: true } : {}) };
    if (keyed) { const bd = path.join(root, 'data', 'session-buffers'); fs.mkdirSync(bd, { recursive: true }); fs.writeFileSync(path.join(bd, 'cx1.json'), JSON.stringify({ caps: stubCaps })); }
    // the fake express: capture the two handlers the route module registers
    const routes = {};
    const fx = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
    registerResetCreditRoutes(fx, { engine: eng });
    const call = (method, id, { body = {}, query = {}, headers = {} } = {}) => {
      const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
      routes[`${method} /api/accounts/:id/reset-credit`]({ params: { id }, body, query, headers }, res);
      return res;
    };
    const wrote = [];
    // THE STUB WRAPPER (lane reset-path): it collects the verbs and — like the current wrapper — says the
    // consume LEFT (`reset_credit_sent`, synchronously at the write); `stubSends: false` = a wrapper that
    // takes the verb and never says so (an old or a hung one)
    const s1 = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx1', backendSessionId: 'thread-1', _accountId: poolId || A, name: 'cx-conv', stubSends: sends, _normalizer: { injectPeerCard: () => null }, _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now(), ...(poolId ? { _heldPoolMember: A, _heldPoolOrigin: 'stamp' } : {}) };
    // verify r8 T0: THE READ BEFORE THE CONSUME, as the 2.369.202 wrapper does it — a verb with `readFirst:true` ⇒ ONE
    // reading pushed with the press's key (`beforeReset`; `stubBefore()` shapes it, `stubBeforeFails` = the read errors and
    // the wrapper goes on to its consume), then the engine's `codex-reset-credit-go` (synchronous here: it is written
    // inside recordCodexQuotaSignal) ⇒ go:true = the consume LEFT (`reset_credit_sent`), go:false = `reset_credit_result
    // {skipped, why}` and nothing sent. `goes` / `befores` = what the stub saw and pushed, for the scenarios' truths
    const goes = [], befores = []; let lastBefore = null;
    const stubPty = (s, wroteList) => ({ write: (x) => {
      const str = String(x); wroteList.push(str);
      let m = null; try { m = JSON.parse(str); } catch { m = null; }
      const sent = () => { if (s.stubSends) { try { eng.recordCodexQuotaSignal(s, { type: 'reset_credit_sent', idempotencyKey: m.idempotencyKey, attempt: 1 }); } catch { } } };
      if (m && m.type === 'codex-reset-credit') {
        if (m.readFirst === true) {
          const dflt = () => { const p = reading(s.stubCount === undefined ? credits : s.stubCount); const c = cacheOf(s._acct || (s === s1 ? A : B)); const b = c && (c.sevenDay || c.fiveHour); if (b && Number(b.resetsAt) > 0) p.rateLimits.primary.resets_at = Number(b.resetsAt); return p; }; // a vendor restates the window the cache (the dialog) shows, exactly
          const payload = s.stubBeforeFails ? { type: 'rate_limits_updated', error: 'account/rateLimits/read timed out after 20000ms (stub)', onDemand: true, beforeReset: true, idempotencyKey: m.idempotencyKey } : { ...(s.stubBefore ? s.stubBefore() : s.stubLimits ? s.stubLimits() : dflt()), beforeReset: true, idempotencyKey: m.idempotencyKey };
          lastBefore = payload; befores.push(payload);
          // verify r9: `s.stubHold` parks the push (a wrapper still reading, a bridge stalled) — `s.held` entries deliver later, to
          // this engine or (a restart) to another world's engine + session; a failed read still goes on to its consume
          const deliver = (toEng = eng, toS = s) => { try { toEng.recordCodexQuotaSignal(toS, payload); } catch { } if (payload.error && toS.stubSends) { try { toEng.recordCodexQuotaSignal(toS, { type: 'reset_credit_sent', idempotencyKey: m.idempotencyKey, attempt: 1 }); } catch { } } };
          if (s.stubHold) { (s.held || (s.held = [])).push({ key: m.idempotencyKey, payload, deliver }); return; }
          deliver(); return;
        }
        sent(); return;
      }
      if (m && m.type === 'codex-reset-credit-go') {
        goes.push(m);
        if (s.stubIgnoreGo) return; // verify r9 ①: a wrapper that gave up (no waiter for this key) / was restarted
        if (m.go === true) sent();
        else { try { eng.recordCodexQuotaSignal(s, { type: 'reset_credit_result', skipped: true, why: m.why || 'skipped', idempotencyKey: m.idempotencyKey, attempts: 0, sent: false }); } catch { } }
        return;
      }
      if (m && m.type === 'codex-read-limits' && s.stubLimits) setImmediate(() => { try { eng.recordCodexQuotaSignal(s, s.stubLimits()); } catch { } });
    } });
    s1.pty = stubPty(s1, wrote);
    s1.stubLimits = null; // R4: the stub wrapper's answer to `codex-read-limits` (a macrotask later, like the real round trip)
    if (session) sessions.set('cx1', s1);
    // verify r5: the second single account's own keyed session (cx2 bills B)
    const wrote2 = [];
    const s2 = acct2 ? { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx2', backendSessionId: 'thread-2', _accountId: B, name: 'cx-conv-2', stubSends: sends, _normalizer: { injectPeerCard: () => null }, _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now() } : null;
    if (s2) { s2.pty = stubPty(s2, wrote2); if (keyed) fs.writeFileSync(path.join(root, 'data', 'session-buffers', 'cx2.json'), JSON.stringify({ caps: stubCaps })); sessions.set('cx2', s2); }
    const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
    if (session && credits != null) quietly(() => eng.recordCodexQuotaSignal(s1, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: credits }, rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: wallS }, secondary: null } }));
    const verbs = () => wrote.filter((x) => /"codex-reset-credit"/.test(x)).length;
    const keyOf = (i) => { const v = wrote.filter((x) => /"codex-reset-credit"/.test(x))[i]; try { return JSON.parse(v).idempotencyKey; } catch { return null; } };
    // verify r4 (the scenario table, scripts/reset-credit-scenarios.mjs): the async POST (the route awaits the session path's
    // read), the newest record + its chain in words, a reading, the file, the timers a dead process would not run, the
    // world's own options (a boot re-creates it over the same root with them)
    const post = (id, body = {}) => new Promise((resolve) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; } }; routes['POST /api/accounts/:id/reset-credit']({ params: { id }, body, query: {}, headers: {} }, res); });
    const tries = () => eng._resetCreditTries.get(A) || null;
    const chain = () => { const v = []; for (let x = tries(); x; x = x.prior) v.push(`${RC.phaseOf(x)}:${x.outcome || '-'}:${x.charged ? 'C' : '-'}:${x.settled ? x.settled.how : '-'}${x.supersededAt ? ':S' : ''}`); return v.join(' | ') || 'none'; };
    const reading = (count, { moved = false } = {}) => ({ type: 'rate_limits_updated', onDemand: true, ...(count === null ? {} : { resetCredits: { availableCount: count } }), rateLimits: { primary: { used_percent: moved ? 0 : 100, window_minutes: 10080, resets_at: moved ? nowS + 7 * 86400 : wallS }, secondary: null } });
    const killTimers = () => { for (const t of eng._resetCreditTries.values()) for (let x = t; x; x = x.prior) { try { clearTimeout(x.ackTimer); clearTimeout(x.timer); } catch { } } };
    const keyOf2 = (i) => { const v = wrote2.filter((x) => /"codex-reset-credit"/.test(x))[i]; try { return JSON.parse(v).idempotencyKey; } catch { return null; } };
    // verify r5: the pool moves cx1's billing to B (the process still holds A until its cold restart lands)
    const repoint = (to = B) => wam.setPoolTarget(poolId, to, { why: 'auto-switch' });
    const cacheOf = (id) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8')); } catch { return null; } };
    // verify r9 ④: a second conversation on an account, with its own keyed + reads-first sidecar and stub pty
    const addSession = (id, acctId = A, { thread = 'thread-' + id, name = 'cx-conv-' + id } = {}) => { const list = []; const s = { backend: 'codex', mode: 'chat', host: null, _webuiId: id, backendSessionId: thread, _accountId: acctId, _acct: acctId, name, stubSends: sends, _normalizer: { injectPeerCard: () => null }, _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now(), wrote: list }; s.pty = stubPty(s, list); fs.mkdirSync(path.join(root, 'data', 'session-buffers'), { recursive: true }); fs.writeFileSync(path.join(root, 'data', 'session-buffers', id + '.json'), JSON.stringify({ caps: stubCaps })); sessions.set(id, s); return s; };
    return { eng, A, B, poolId, wallB, wam, root, cacheDir, s1, s2, sessions, call, post, verbs, wrote, keyOf, wrote2, keyOf2, repoint, cacheOf, notices, arms, goes, befores, lastBefore: () => lastBefore, addSession, held: () => s1.held || [], credits, quietly, nowS, reading, tries, chain, killTimers, opts: { session, keyed, sends, ackMs, mode, hourCap, helper, pool, acct2, windows, readsFirst }, charged: () => (eng.spendGuard.snapshot().budget.instance || []).length, holdsOpen: () => eng.spendGuard.snapshot().holdsOpen };
  };

  const w = world();
  ok('the module registers exactly the GET preview + the POST', typeof w.call === 'function');
  // not_supported BY NAME: a claude identity (the machine's claude login key) — capability, not an id
  const cl = w.call('POST', '__global__');
  ok('claude ⇒ 400 not_supported, and NO verb anywhere', cl.code === 400 && cl.body.code === 'not_supported' && w.verbs() === 0, JSON.stringify(cl.body));
  ok('…the GET preview says the same thing (the dialog shows the refusal, the button disabled)', w.call('GET', '__global__').body.code === 'not_supported');
  const pv = w.call('GET', w.A);
  ok('GET preview on the codex account: vendor openai, the stored count, the carrier session, the most-spent window (7d, reset, walled)',
    pv.code === 200 && pv.body.vendor === 'openai' && pv.body.creditsLeft === 3 && pv.body.sessionId === 'cx1' && pv.body.name === 'Cx Alpha' && pv.body.periodSec === 604800 && pv.body.resetsAtSec === w.nowS + 2 * 86400 && pv.body.remainingPct === 0 && !pv.body.code, JSON.stringify(pv.body));
  ok('an agent\'s session token is refused (human-triggered only) — and writes nothing', (() => { const r = w.call('POST', w.A, { headers: { authorization: 'Bearer vsst_abc' } }); return r.code === 403 && r.body.code === 'agent_forbidden' && w.verbs() === 0; })());
  const before = w.charged();
  const r1 = w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
  ok('POST on the codex account ⇒ 200 {ok, sessionId}', r1.code === 200 && r1.body.ok === true && r1.body.sessionId === 'cx1', JSON.stringify(r1.body));
  ok('…the verb is written ONCE on that session\'s own wrapper', w.verbs() === 1);
  ok('…through the spend authorizer (exactly one charge on the ledger)', w.charged() === before + 1, `${before} → ${w.charged()}`);
  ok('…the attempt is marked as a PERSON\'s', w.s1._resetCreditOrigin === 'user');
  const r2 = w.quietly(() => w.call('POST', w.A));
  ok('a second POST inside the 10-min floor ⇒ 429 cooldown (with the instant it lifts), no second verb', r2.code === 429 && r2.body.code === 'cooldown' && r2.body.cooldownUntilSec > w.nowS && w.verbs() === 1, JSON.stringify(r2.body));
  // the outcome: a PERSON's failed attempt is reported and never walks the ladder
  w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'nothingToReset' }));
  ok('a failed PERSON\'s attempt ⇒ ONE notice naming the account and the vendor\'s answer (in words: codex-cli 0.159.3\'s own outcome description)', w.notices.some((n) => /Reset credit not used on Cx Alpha — no current limit window is eligible for a reset \(nothing was spent\)\./.test(n)), JSON.stringify(w.notices));
  ok('…and NO wait is armed from it (the ladder is not walked a second time)', w.arms.length === 0, JSON.stringify(w.arms));
  ok('…the origin is consumed (one answer per attempt)', w.s1._resetCreditOrigin === null);
  // CONTRAST (the control for the two legs above): an AUTO attempt's failure says nothing and walks the ladder
  {
    const w2 = world();
    w2.s1._resetCreditOrigin = 'auto'; w2.s1._codexLastResetsAt = w2.nowS + 3600;
    w2.quietly(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_result', outcome: 'nothingToReset' }));
    ok('CONTROL: an AUTO attempt\'s failure files no "not used" notice (the ladder speaks for it) — the leg above sees the origin', !w2.notices.some((n) => /Reset credit not used/.test(n)), JSON.stringify(w2.notices));
  }
  {
    const w3 = world();
    w3.quietly(() => w3.call('POST', w3.A));
    w3.quietly(() => w3.eng.recordCodexQuotaSignal(w3.s1, { type: 'reset_credit_result', outcome: 'reset' }));
    ok('a PERSON\'s successful attempt ⇒ the consumed notice (the same success path as the rung)', w3.notices.some((n) => /reset credit consumed/.test(n)), JSON.stringify(w3.notices));
  }
  // lane-codex-0159 — THE PRESS'S IDEMPOTENCY KEY (incident 2026-09-30: codex-cli 0.159.3 answered the keyless consume
  // "Invalid request: missing field `idempotencyKey`"; its schema: "reuse the same value when retrying that attempt")
  {
    const wk = world();
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const keyOf = (i) => { const v = wk.wrote.filter((x) => /"codex-reset-credit"/.test(x))[i]; try { return JSON.parse(v).idempotencyKey; } catch { return null; } };
    wk.quietly(() => wk.call('POST', wk.A, { body: { sessionId: 'cx1' } }));
    const k1 = keyOf(0);
    ok('codex-0159: the verb carries a server-minted idempotencyKey (a v4 UUID — the schema\'s recommendation)', UUID.test(String(k1)), String(wk.wrote[0]));
    ok('codex-0159: …the identity\'s try record holds the SAME key (the press\'s key, one per press)', wk.eng._resetCreditTries.get(wk.A)?.idempotencyKey === k1);
    wk.quietly(() => wk.eng.recordCodexQuotaSignal(wk.s1, { type: 'reset_credit_result', outcome: 'noCredit', idempotencyKey: k1, attempts: 1 }));
    ok('codex-0159: 0.159.3\'s new `noCredit` outcome is a failed attempt, said in words', wk.notices.some((n) => /Reset credit not used on Cx Alpha — the account has no reset credits available\./.test(n)), JSON.stringify(wk.notices));
    { const t = wk.eng._resetCreditTries.get(wk.A); t.at -= 11 * 60e3; if (t.sentAt) t.sentAt -= 11 * 60e3; } // the 10-min floor passed (the _poolAutoLast seam — never a sleep; it runs from the SEND since lane reset-path)
    wk.quietly(() => wk.call('POST', wk.A, { body: { sessionId: 'cx1' } }));
    const k2 = keyOf(1);
    ok('codex-0159: a NEW press mints a NEW key (never the previous press\'s)', wk.verbs() === 2 && UUID.test(String(k2)) && k2 !== k1, `${k1} / ${k2}`);
    wk.quietly(() => wk.eng.recordCodexQuotaSignal(wk.s1, { type: 'reset_credit_result', outcome: 'alreadyRedeemed', idempotencyKey: k2, attempts: 2 }));
    ok('codex-0159: a KEYED `alreadyRedeemed` (the vendor: "the same idempotency key already completed a reset") = this press\'s own reset ⇒ the consumed path', wk.notices.some((n) => /Codex reset credit consumed/.test(n)) && wk.eng._resetCreditTries.get(wk.A)?.outcome === 'reset', JSON.stringify(wk.notices));
  }
  {
    const wo = world();
    wo.quietly(() => wo.call('POST', wo.A, { body: { sessionId: 'cx1' } }));
    wo.quietly(() => wo.eng.recordCodexQuotaSignal(wo.s1, { type: 'reset_credit_result', outcome: 'alreadyRedeemed' }));
    ok('codex-0159 CONTROL: a KEYLESS `alreadyRedeemed` (a wrapper older than the key — the 0.153 meaning) keeps the superseded path, never "consumed"', !wo.notices.some((n) => /Codex reset credit consumed/.test(n)) && wo.notices.some((n) => /already redeemed/.test(n)), JSON.stringify(wo.notices));
  }
  {
    const ws = world();
    ws.quietly(() => ws.call('POST', ws.A, { body: { sessionId: 'cx1' } }));
    ws.quietly(() => ws.eng.recordCodexQuotaSignal(ws.s1, { type: 'reset_credit_result', error: 'Invalid request: missing field `idempotencyKey`' }));
    ok('codex-0159: an OLD wrapper (no key echoed) refused locally by codex-cli 0.159 ⇒ the notice names the remedy (Terminate + Resume, or the Agents list — the helper), never the raw vendor text', ws.notices.some((n) => /Reset credit not used on Cx Alpha — this conversation's codex wrapper predates the reset-credit fix and codex refused the request \(nothing was sent\) — Terminate \+ Resume the conversation, or use the credit from the Agents list/.test(n)) && !ws.notices.some((n) => /missing field/.test(n)), JSON.stringify(ws.notices));
    const wn = world();
    wn.quietly(() => wn.call('POST', wn.A, { body: { sessionId: 'cx1' } }));
    wn.quietly(() => wn.eng.recordCodexQuotaSignal(wn.s1, { type: 'reset_credit_result', error: 'Invalid request: missing field `idempotencyKey`', idempotencyKey: wn.keyOf(0), attempts: 1 })); // the key the wrapper echoes is the press's own (verify r4: a key no record holds is a LATE answer, ignored)
    ok('codex-0159 CONTROL: the same words from a wrapper that SENT a key are a different drift — quoted as the vendor said them', wn.notices.some((n) => /the vendor answered Invalid request: missing field/.test(n)) && !wn.notices.some((n) => /Terminate \+ Resume/.test(n)), JSON.stringify(wn.notices));
  }
  // verify-r6 R1: the POST names the window the dialog SHOWED — a window that reset (or moved) while the dialog stayed
  // open would spend the credit on a FRESH window ("0% discarded" shown): refused by name, nothing spent
  {
    const wr = world();
    const shown = wr.call('GET', wr.A).body.resetsAtSec;
    const moved = wr.quietly(() => wr.call('POST', wr.A, { body: { sessionId: 'cx1', expect: { resetsAtSec: shown - 3600 } } }));
    ok('verify-r6 R1: the dialog showed a window that has since reset / moved (another reset instant) ⇒ 409 preview_changed, NO verb, nothing charged (pre-fix: the credit spent on the fresh window)', moved.code === 409 && moved.body.code === 'preview_changed' && wr.verbs() === 0 && wr.charged() === 0, JSON.stringify(moved.body));
    const past = wr.quietly(() => wr.call('POST', wr.A, { body: { sessionId: 'cx1', expect: { resetsAtSec: wr.nowS - 5 } } }));
    ok('verify-r6 R1: …a shown reset instant already in the past ⇒ preview_changed too', past.code === 409 && past.body.code === 'preview_changed' && wr.verbs() === 0);
    const same = wr.quietly(() => wr.call('POST', wr.A, { body: { sessionId: 'cx1', expect: { resetsAtSec: shown } } }));
    ok('verify-r6 R1: the window it showed ⇒ spent (one verb)', same.code === 200 && same.body.ok === true && wr.verbs() === 1, JSON.stringify(same.body));
    const RC = require(path.join(REPO, 'src/reset-credit.js'));
    ok('verify-r6 R1: the dialog words preview_changed (nothing was spent), and the dialog POSTs the window it showed', RC.refusalLine('preview_changed').key === 'The limit this dialog showed has reset since it opened — nothing was spent. Open it again to see the account now.' && /expect: \{ resetsAtSec: p\.resetsAtSec \?\? null \}/.test(read('src/lib/reset-credit-dialog.js')));
    // CONTROL (r1): an engine that ignores what the dialog showed spends the credit on the moved window
    const esrc = read('src/server/usage-pool-engine.js');
    const emut = esrc.replace("  if (expect && typeof expect === 'object' && expect.resetsAtSec != null) {", '  if (false) {');
    ok('CONTROL (r1): the patch applies', emut !== esrc);
    const wm = world({ engine: require(MUTRC.write('src/server/usage-pool-engine.js', emut, 'r1')) });
    const shownM = wm.call('GET', wm.A).body.resetsAtSec;
    const movedM = wm.quietly(() => wm.call('POST', wm.A, { body: { sessionId: 'cx1', expect: { resetsAtSec: shownM - 3600 } } }));
    ok('CONTROL (r1): an engine ignoring the shown window SPENDS the credit on the moved one — the R1 leg goes red', movedM.code === 200 && wm.verbs() === 1, JSON.stringify(movedM.body));
  }
  // ── lane reset-path: THE FLOOR ARMS ONLY ON A CONSUME THAT WENT OUT (the owner's report 2026-10-01: a
  //    REFUSED attempt answered "already tried in the last 10 minutes — try again after 10:40", the button grey)
  {
    // (1) the vendor's `nothingToReset`: it went out and spent nothing ⇒ no floor, a second press is a new request
    const wn = world();
    wn.quietly(() => wn.call('POST', wn.A, { body: { sessionId: 'cx1' } }));
    ok('reset-path: a press whose wrapper says the consume LEFT is charged at the send (one charge, no open hold)', wn.charged() === 1 && wn.holdsOpen() === 0, `${wn.charged()} / ${wn.holdsOpen()}`);
    wn.quietly(() => wn.eng.recordCodexQuotaSignal(wn.s1, { type: 'reset_credit_result', outcome: 'nothingToReset', idempotencyKey: wn.keyOf(0), attempts: 1 }));
    const pv = wn.call('GET', wn.A).body;
    ok('reset-path: after the vendor answered `nothingToReset` the preview names NO wait (no cooldown, no refusal)', !pv.code && pv.cooldownUntilSec === null, JSON.stringify(pv));
    const again = wn.quietly(() => wn.call('POST', wn.A, { body: { sessionId: 'cx1' } }));
    ok('reset-path: …and the next press goes out at once, with a NEW key', again.code === 200 && wn.verbs() === 2 && wn.keyOf(1) !== wn.keyOf(0), JSON.stringify(again.body));
    // (2) sent, then no answer (the wrapper's same-key retry timed out too): it may still land ⇒ the floor, from the SEND
    const wu = world();
    wu.quietly(() => wu.call('POST', wu.A, { body: { sessionId: 'cx1' } }));
    const sentAt = wu.eng._resetCreditTries.get(wu.A)?.sentAt || 0;
    wu.quietly(() => wu.eng.recordCodexQuotaSignal(wu.s1, { type: 'reset_credit_result', error: 'account/rateLimitResetCredit/consume timed out after 30000ms', idempotencyKey: wu.keyOf(0), attempts: 2 }));
    const pu = wu.call('GET', wu.A).body;
    ok('reset-path: a consume that went out and got NO answer keeps the ten-minute wait (counted from the send)', pu.code === 'cooldown' && sentAt > 0 && pu.cooldownUntilSec === Math.ceil((sentAt + 10 * 60e3) / 1000), JSON.stringify(pu));
    const pu2 = wu.quietly(() => wu.call('POST', wu.A, { body: { sessionId: 'cx1' } }));
    ok('reset-path: …a second press inside it ⇒ 429 cooldown, no second verb', pu2.code === 429 && pu2.body.code === 'cooldown' && wu.verbs() === 1, JSON.stringify(pu2.body));
    ok('reset-path: …and the person is told it may still land (never "nothing was spent")', wu.notices.some((n) => /Reset credit not used on Cx Alpha — no answer came back \(account\/rateLimitResetCredit\/consume timed out after 30000ms\) — it may still land, so the next try waits ten minutes\./.test(n)), JSON.stringify(wu.notices));
    // (3) the wrapper takes the verb and never says it went out (an old or a hung one)
    const wh = world({ sends: false, ackMs: 80 });
    wh.quietly(() => wh.call('POST', wh.A, { body: { sessionId: 'cx1' } }));
    const ph = wh.call('GET', wh.A).body;
    ok('reset-path: written but not yet sent ⇒ `in_flight` (a second press would race it), NOT the ten-minute wait', ph.code === 'in_flight' && ph.cooldownUntilSec === null, JSON.stringify(ph));
    const ph2 = wh.quietly(() => wh.call('POST', wh.A, { body: { sessionId: 'cx1' } }));
    ok('reset-path: …a second press then ⇒ 409 in_flight, no second verb, nothing charged yet', ph2.code === 409 && ph2.body.code === 'in_flight' && wh.verbs() === 1 && wh.charged() === 0, JSON.stringify(ph2.body));
    await new Promise((r) => setTimeout(r, 200));
    const ph3 = wh.call('GET', wh.A).body;
    ok('reset-path: nothing said it went out within the ack window ⇒ no wait at all, the spend hold given back, nothing charged', !ph3.code && ph3.cooldownUntilSec === null && wh.holdsOpen() === 0 && wh.charged() === 0, JSON.stringify(ph3) + ` holds=${wh.holdsOpen()} charged=${wh.charged()}`);
    ok('reset-path: …and the person is told the request was never sent (nothing spent)', wh.notices.some((n) => /Reset credit not used on Cx Alpha — the conversation's codex wrapper never sent the request \(nothing was spent\)/.test(n)), JSON.stringify(wh.notices));
    // (4) the shape of the owner's report: a wrapper older than the key — codex refused the keyless consume locally
    const ws = world({ sends: false });
    ws.quietly(() => ws.call('POST', ws.A, { body: { sessionId: 'cx1' } }));
    ws.quietly(() => ws.eng.recordCodexQuotaSignal(ws.s1, { type: 'reset_credit_result', error: 'Invalid request: missing field `idempotencyKey`' }));
    const ps = ws.call('GET', ws.A).body;
    ok('reset-path: THE OWNER\'S REPORT — a consume codex refused before the send arms NO wait, charges nothing, gives the hold back', ps.code !== 'cooldown' && ps.cooldownUntilSec === null && ws.charged() === 0 && ws.holdsOpen() === 0, JSON.stringify(ps) + ` charged=${ws.charged()} holds=${ws.holdsOpen()}`);
    ok('reset-path: …the conversation is marked (its wrapper predates the key) so nothing it writes is tried again', ws.s1._resetCreditStale === true);
    // CONTROL: the pre-fix rule (the floor stamped at the WRITE, whatever happened) answers the owner's screenshot
    const esrc = read('src/server/usage-pool-engine.js');
    const from = 'function resetCreditBlock(key, now = Date.now()) { return resetCredit.attemptBlock(resetCreditTryFor(key), { now, floorMs: RESET_CREDIT_FLOOR_MS, ackMs: RESET_CREDIT_ACK_MS }); }';
    ok('reset-path CONTROL: the patch hits the product source', esrc.includes(from));
    const pre = require(MUTRC.write('src/server/usage-pool-engine.js', esrc.replace(from, 'function resetCreditBlock(key, now = Date.now()) { const t = resetCreditTryFor(key); return t && now - t.at < RESET_CREDIT_FLOOR_MS ? { code: \'cooldown\', until: t.at + RESET_CREDIT_FLOOR_MS, armedAt: t.at } : { code: null, until: 0, armedAt: 0 }; }'), 'prefloor'));
    const wc = world({ sends: false, engine: pre });
    wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
    wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, { type: 'reset_credit_result', error: 'Invalid request: missing field `idempotencyKey`' }));
    const pc = wc.call('GET', wc.A).body;
    ok('reset-path CONTROL: with the floor stamped at the write, the refused attempt shows the owner\'s "already tried in the last 10 minutes" (the ten-minute wait) — the legs above see the rule', pc.cooldownUntilSec > wc.nowS, JSON.stringify(pc));
  }
  // ── lane reset-path: THE HELPER PATH (the owner's report 2026-10-01: the Agents list could not use a codex
  //    credit without a live chat session — 409 no_live_session). ONE bounded `codex app-server` child on the
  //    account's own login, over a STUB app-server answering as the MEASURED 0.159.3 table says (never a real
  //    codex, never a real CODEX_HOME: the account's home is this world's scratch dir)
  {
    const SDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-stub-')); roots.push(SDIR);
    const STUB = writeStub(SDIR);
    const TABLE = path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json');
    const stubEnv = (tag, { mode = 'answer', readUsed = 0 } = {}) => { const log = path.join(SDIR, tag + '.ndjson'); fs.writeFileSync(log, ''); Object.assign(process.env, { STUB_TABLE: TABLE, STUB_LOG: log, STUB_MODE: mode, STUB_READ_USED: String(readUsed) }); return () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
    const until = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 40)); } return false; };
    const helper = { codexCmd: STUB, extraArgs: [] };
    // H1 no chat session on the account at all
    const rpc1 = stubEnv('h1');
    const wh = world({ session: false, helper });
    const p1 = wh.call('GET', wh.A).body;
    ok('helper: no chat session on the account ⇒ the preview offers the HELPER (via helper, no-session) — no refusal, the button live', p1.via === 'helper' && p1.helperWhy === 'no-session' && !p1.code && p1.sessionId === null, JSON.stringify(p1));
    const m1 = RC.dialogModel(p1, { nowSec: wh.nowS, fmtTime: (x) => 'T' + x, harness: 'Codex' });
    ok('helper: the dialog names the harness on the account line ("Codex · Cx Alpha") and says the helper carries it', m1.lines[0].key === 'Account: {harness} · {account}' && m1.lines[0].params.harness === 'Codex' && m1.lines[0].params.account === 'Cx Alpha' && m1.lines[1].key === RC.helperLine({ via: 'helper', helperWhy: 'no-session' }).key && m1.canConfirm === true, JSON.stringify(m1.lines.slice(0, 2)));
    const r1 = wh.quietly(() => wh.call('POST', wh.A, { body: { expect: { resetsAtSec: p1.resetsAtSec } } }));
    ok('helper: the POST ⇒ 200 {ok, via:helper} (no conversation needed)', r1.code === 200 && r1.body.ok === true && r1.body.via === 'helper' && r1.body.sessionId === null, JSON.stringify(r1.body));
    await until(() => wh.notices.some((n) => /reset credit used on Cx Alpha/.test(n)));
    const L1 = rpc1();
    ok('helper: ONE app-server child spoke exactly the wrapper\'s protocol — initialize → initialized → rateLimits/read (verify r8 T0: the read before EVERY press) → consume {idempotencyKey} → rateLimits/read, every request valid on the measured 0.159.3 table', JSON.stringify(L1.map((x) => x.method)) === JSON.stringify(['initialize', 'initialized', 'account/rateLimits/read', 'account/rateLimitResetCredit/consume', 'account/rateLimits/read']) && L1.every((x) => x.verdict === 'ok') && /^[0-9a-f-]{36}$/.test(String(L1[3] && L1[3].params.idempotencyKey)), JSON.stringify(L1.map((x) => [x.method, x.verdict])));
    ok('helper: …on the ACCOUNT\'S OWN login (CODEX_HOME = its isolated home), started as `<codex> app-server`', L1.every((x) => x.home === wh.wam.codexSubDir(wh.A)) && JSON.stringify(L1[0].args) === '["app-server"]', JSON.stringify([L1[0] && L1[0].home, wh.wam.codexSubDir(wh.A)]));
    const t1 = wh.eng._resetCreditTries.get(wh.A);
    ok('helper: the attempt went out (sentAt), answered `reset`, the key on the record is the one sent', t1 && t1.via === 'helper' && t1.sentAt > 0 && t1.outcome === 'reset' && t1.idempotencyKey === L1[3].params.idempotencyKey, JSON.stringify(t1 && { via: t1.via, sentAt: t1.sentAt, outcome: t1.outcome }));
    ok('helper: …charged ONCE on the spend ceiling, no hold left open', wh.charged() === 1 && wh.holdsOpen() === 0, `${wh.charged()} / ${wh.holdsOpen()}`);
    const c1 = JSON.parse(fs.readFileSync(path.join(wh.cacheDir, wh.A + '.json'), 'utf8'));
    ok('helper: the post-consume reading went through the ONE cache writer, stamped `codex-reset-helper`, newer than the attempt, with the stored count', c1.source === 'codex-reset-helper' && c1.fetchedAt > t1.at && c1.resetCredits && c1.resetCredits.availableCount === 1 && Math.round(c1.sevenDay?.usedPercent ?? -1) === 0, JSON.stringify({ src: c1.source, rc: c1.resetCredits, u: c1.sevenDay?.usedPercent }));
    ok('helper: the person hears the outcome as a notice naming the account', wh.notices.some((n) => /Codex reset credit used on Cx Alpha — the limit was reset\./.test(n)), JSON.stringify(wh.notices));
    const p1b = wh.call('GET', wh.A).body;
    const r1b = wh.quietly(() => wh.call('POST', wh.A));
    ok('helper: a reset arms the floor like any other — the next press ⇒ 429 cooldown, and NO second child', p1b.code === 'cooldown' && r1b.code === 429 && rpc1().filter((x) => x.method === 'account/rateLimitResetCredit/consume').length === 1, JSON.stringify(p1b));
    // H2 the conversation's wrapper predates the fix (no `resetCreditKey` advert) — FALL to the helper, never refuse
    const rpc2 = stubEnv('h2');
    const wp = world({ keyed: false, helper });
    const p2 = wp.call('GET', wp.A).body;
    ok('helper: a live conversation whose wrapper predates the fix ⇒ the helper (wrapper-predates), not a refusal', p2.via === 'helper' && p2.helperWhy === 'wrapper-predates' && !p2.code, JSON.stringify(p2));
    const m2 = RC.dialogModel(p2, { nowSec: wp.nowS, fmtTime: (x) => 'T' + x, harness: 'Codex' });
    ok('helper: …the dialog says why and both ways out (Terminate + Resume it, or use the credit from here)', m2.lines.some((l) => /predates the reset-credit fix — Terminate \+ Resume it, or use the credit from here/.test(l.key)) && m2.canConfirm, JSON.stringify(m2.lines.map((l) => l.key)));
    wp.quietly(() => wp.call('POST', wp.A, { body: { sessionId: 'cx1' } }));
    await until(() => wp.notices.some((n) => /reset credit used/.test(n)));
    ok('helper: …the press never touched the old wrapper (no verb on its stdin) and went out through the helper', wp.verbs() === 0 && rpc2().some((x) => x.method === 'account/rateLimitResetCredit/consume'), `verbs=${wp.verbs()}`);
    // H3 sent, never answered (the wall): it may still land ⇒ the floor
    const rpc3 = stubEnv('h3', { mode: 'hang-consume' });
    const wg = world({ session: false, helper: { ...helper, wallMs: 400 } });
    wg.quietly(() => wg.call('POST', wg.A));
    await until(() => wg.notices.some((n) => /Reset credit not used/.test(n)), 5000);
    const t3 = wg.eng._resetCreditTries.get(wg.A);
    ok('helper: a consume the app-server never answered (the 30 s wall, shortened here) ⇒ sent + unanswered ⇒ THE FLOOR, the person told it may still land', t3 && t3.outcome === 'unanswered' && t3.sentAt > 0 && wg.call('GET', wg.A).body.code === 'cooldown' && wg.notices.some((n) => /no answer came back .* it may still land/.test(n)), JSON.stringify({ o: t3 && t3.outcome, n: wg.notices }));
    ok('helper: …and the child was ended at the wall (no stub left running)', await until(() => !fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).some((d) => { try { return fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes(STUB) && fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes('STUB_MODE=hang-consume'); } catch { return false; } }), 4000));
    void rpc3;
    // H4 the vendor's `nothingToReset`: went out, spent nothing ⇒ no floor
    stubEnv('h4', { mode: 'nothing', readUsed: 100 }); // the window still spent: the vendor's word decides (a 0 % read would be the superseded path)
    const wz = world({ session: false, helper });
    wz.quietly(() => wz.call('POST', wz.A));
    await until(() => wz.notices.some((n) => /Reset credit not used/.test(n)));
    const p4 = wz.call('GET', wz.A).body;
    ok('helper: `nothingToReset` ⇒ said in words, NO floor (the next press is free)', wz.notices.some((n) => /no current limit window is eligible for a reset \(nothing was spent\)/.test(n)) && !p4.code && p4.cooldownUntilSec === null, JSON.stringify(p4) + ' ' + JSON.stringify(wz.notices));
    // H5 a login that is not signed in on this machine: nothing can carry it — refused by name, no child
    const wl = world({ session: false, helper });
    fs.rmSync(path.join(wl.wam.codexSubDir(wl.A), 'auth.json'), { force: true });
    const p5 = wl.call('GET', wl.A).body;
    ok('helper: an account not signed in here ⇒ no_live_session naming why, and nothing spawned', p5.code === 'no_live_session' && /not signed in on this machine/.test(p5.error || ''), JSON.stringify(p5));
    // H5b (verify r1) a call refused BEFORE the spawn resolves with a named error — it never rejects (the module's contract)
    { const HM = require(path.join(REPO, 'src/codex-reset-helper.js'));
      const outcomes = await Promise.all([HM.consumeResetCreditViaAppServer({ idempotencyKey: '', env: { CODEX_HOME: SDIR }, codexCmd: STUB, pressedBy: 'person' }), HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k', env: { CODEX_HOME: SDIR }, codexCmd: null, pressedBy: 'person' })].map((p) => p.then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String(e) }))));
      ok('helper: a refusal before the spawn (no key / no codex) RESOLVES with a named error — never rejects', outcomes.every((o) => o.ok) && /idempotencyKey is required/.test(outcomes[0].r.error || '') && /not configured/.test(outcomes[1].r.error || '') && outcomes.every((o) => o.r.sent === false), JSON.stringify(outcomes));
      const hsrc = read('src/codex-reset-helper.js');
      const fromT = "    let child = null, settled = false, buf = '', nextId = 1, timer = null;";
      ok('helper CONTROL: the timer patch hits the product source', hsrc.includes(fromT) && hsrc.includes('    timer = setTimeout(() => finish(out.stage === \'consume\''));
      const preT = require(MUTRC.write('src/codex-reset-helper.js', hsrc.replace(fromT, "    let child = null, settled = false, buf = '', nextId = 1;").replace("    timer = setTimeout(() => finish(out.stage === 'consume'", "    const timer = setTimeout(() => finish(out.stage === 'consume'").replace('      if (timer) clearTimeout(timer);', '      clearTimeout(timer);'), 'tdz'));
      const ctl = await preT.consumeResetCreditViaAppServer({ idempotencyKey: '', env: { CODEX_HOME: SDIR }, codexCmd: STUB, pressedBy: 'person' }).then(() => 'resolved', (e) => String(e));
      ok('helper CONTROL: with the wall declared below finish, the same refusal REJECTS (Cannot access timer) — the row above sees the rule', /Cannot access 'timer'/.test(ctl), ctl);
    }
    // H5c (verify r1, the credential class) THE BELTS: the app-server's own children die with it; no env / no login /
    //     no person's press ⇒ refused before the spawn
    { const HM = require(path.join(REPO, 'src/codex-reset-helper.js'));
      const gstub = path.join(SDIR, 'stub-grandchild.cjs');
      fs.writeFileSync(gstub, `#!/usr/bin/env node\nconst { spawn } = require('child_process');\nspawn('sleep', ['300.' + process.env.MARK], { stdio: 'ignore' });\nlet b = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.method === 'initialize') process.stdout.write(JSON.stringify({ id: m.id, result: { userAgent: 'stub' } }) + '\\n'); } });\nprocess.stdin.on('end', () => process.exit(0));\n`, { mode: 0o755 });
      const alive = (mark) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() === `sleep 300.${mark}`; } catch { return false; } });
      const mark = String(process.pid) + '1';
      const rg = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-g', env: { PATH: process.env.PATH, CODEX_HOME: SDIR, MARK: mark }, codexCmd: gstub, wallMs: 300, pressedBy: 'person' });
      await new Promise((r) => setTimeout(r, 2600));
      ok('helper belts: the app-server\'s OWN child (like its git ls-remote / bwrap) dies with it at the wall — the child is a process group', rg.sent === true && alive(mark).length === 0, JSON.stringify([rg.sent, rg.error, alive(mark).length]));
      const hsrc = read('src/codex-reset-helper.js');
      const fromG = "      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: cwd || undefined, detached: true });";
      ok('helper belts CONTROL: the group patch hits the product source', hsrc.includes(fromG) && hsrc.includes('process.kill(-child.pid, sig)'));
      const preG = require(MUTRC.write('src/codex-reset-helper.js', hsrc.replace(fromG, "      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: cwd || undefined });").replace('process.kill(-child.pid, sig)', 'child.kill(sig)'), 'nogroup'));
      const mark2 = String(process.pid) + '2';
      await preG.consumeResetCreditViaAppServer({ idempotencyKey: 'k-g2', env: { PATH: process.env.PATH, CODEX_HOME: SDIR, MARK: mark2 }, codexCmd: gstub, wallMs: 300, pressedBy: 'person' });
      await new Promise((r) => setTimeout(r, 2600));
      const left = alive(mark2);
      ok('helper belts CONTROL: killing the child alone leaves its own child running after the wall — the row above sees the rule', left.length === 1, JSON.stringify(left));
      for (const pid of left) { try { process.kill(Number(pid), 'SIGKILL'); } catch { } }
      const rpcB = stubEnv('belts');
      const noEnv = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-b1', codexCmd: STUB, pressedBy: 'person' });
      const noHome = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-b2', env: { PATH: process.env.PATH, STUB_TABLE: TABLE, STUB_LOG: process.env.STUB_LOG }, codexCmd: STUB, pressedBy: 'person' });
      const noPerson = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-b3', env: { PATH: process.env.PATH, STUB_TABLE: TABLE, STUB_LOG: process.env.STUB_LOG, CODEX_HOME: SDIR }, codexCmd: STUB, pressedBy: 'auto' });
      ok('helper belts: no env ⇒ refused by name before the spawn (never the server\'s own process.env — the machine\'s global login)', noEnv.sent === false && /explicit CODEX_HOME/.test(noEnv.error || ''), JSON.stringify(noEnv.error));
      ok('helper belts: an env without CODEX_HOME ⇒ refused by name before the spawn', noHome.sent === false && /explicit CODEX_HOME/.test(noHome.error || ''), JSON.stringify(noHome.error));
      ok('helper belts: a caller that is not a person\'s press ⇒ refused by name before the spawn (the runtime belt under the static census)', noPerson.sent === false && /only a person/.test(noPerson.error || ''), JSON.stringify(noPerson.error));
      ok('helper belts: …none of the three spawned anything', rpcB().length === 0, JSON.stringify(rpcB()));
      ok('helper belts WIRING: the engine passes the witness from the attempt\'s origin, never a constant', /pressedBy: t\.origin === 'user' \? 'person' : 'auto' \}\)\)/.test(read('src/server/usage-pool-engine.js')));
    }
    // H6 an agent's token never reaches it (human-only route)
    const wa = world({ session: false, helper });
    const r6 = wa.call('POST', wa.A, { headers: { authorization: 'Bearer jbt_abc' } });
    ok('helper: a job / session token is refused before anything runs (403 agent_forbidden)', r6.code === 403 && r6.body.code === 'agent_forbidden');
    // CONTROL: the engine without the helper fallback answers the owner's report (409 no_live_session)
    const esrc = read('src/server/usage-pool-engine.js');
    const from = "  const via = carrier ? 'session' : (helper && helper.ok ? 'helper' : null);";
    ok('helper CONTROL: the patch hits the product source', esrc.includes(from));
    const noHelper = require(MUTRC.write('src/server/usage-pool-engine.js', esrc.replace(from, "  const via = carrier ? 'session' : null;"), 'nohelper'));
    const wn = world({ session: false, helper, engine: noHelper });
    const rn = wn.quietly(() => wn.call('POST', wn.A));
    ok('helper CONTROL: without the helper fallback the Agents list\'s press answers 409 no_live_session — the owner\'s second report, which the H legs see', rn.code === 409 && rn.body.code === 'no_live_session', JSON.stringify(rn.body));
    for (const k of ['STUB_TABLE', 'STUB_LOG', 'STUB_MODE', 'STUB_READ_USED']) delete process.env[k];
  }
  // ── lane reset-path R3: THE WALL CARD RESOLVES WHEN THE CREDIT IS USED / THE WALL IS GONE (the owner, 2026-10-01:
  //    a credit used at 10:45 — the card "Usage limit hit … 2 stored reset credits available … Use a reset credit" stayed,
  //    button and all). The rule = the compaction card's: an offered action a later fact answered is withdrawn on
  //    BOTH carriers — the live op (an `edit` of THAT card, in place) and every re-render (the message carries it).
  {
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
    const withNormalizer = (w) => { const mm = createMessageManager('codex', 'cx1'); const ops = []; mm.onOp((op) => ops.push(op)); w.s1._normalizer = mm; return { mm, ops, cards: () => mm.messages.filter((m) => m.resetCredit) }; };
    const wr3 = world();
    const N = withNormalizer(wr3);
    wr3.quietly(() => wr3.eng.recordCodexQuotaSignal(wr3.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wr3.nowS + 7200 }));
    ok('R3: the wall drew ONE card offering the credit (the owner\'s card: "Usage limit hit … stored reset credits available")', N.cards().length === 1 && /Usage limit hit on Cx Alpha — 3 stored reset credits available/.test(N.cards()[0].content[0].text) && N.cards()[0].resetCredit.accountKey === wr3.A, JSON.stringify(N.cards().map((m) => m.resetCredit)));
    const before = N.ops.length;
    wr3.quietly(() => wr3.call('POST', wr3.A, { body: { sessionId: 'cx1' } }));
    { const t0 = Date.now(); while (Date.now() < t0 + 3) { } } // the post-reset reading is LATER than the attempt (a same-millisecond tie is not "after")
    wr3.quietly(() => wr3.eng.recordCodexQuotaSignal(wr3.s1, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 0, window_minutes: 10080, resets_at: wr3.nowS + 7 * 86400 }, secondary: null }, resetCredits: { availableCount: 2 } }));
    wr3.quietly(() => wr3.eng.recordCodexQuotaSignal(wr3.s1, { type: 'reset_credit_result', outcome: 'reset', idempotencyKey: wr3.keyOf(0), attempts: 1 }));
    const card = N.cards()[0];
    ok('R3: the credit USED ⇒ the card is resolved on the message itself (how used, when, the new window\'s end) — every re-render carries it', card && card.resetCredit.resolved && card.resetCredit.resolved.how === 'used' && card.resetCredit.resolved.untilSec === wr3.nowS + 7 * 86400, JSON.stringify(card && card.resetCredit));
    const edits = N.ops.slice(before).filter((op) => op.op === 'edit' && op.id === (card && card.id) && op.fields && op.fields.resetCredit);
    ok('R3: …and the live carrier: ONE `edit` op for THAT card, carrying only its resetCredit (patched in place, never a re-created card)', edits.length === 1 && Object.keys(edits[0].fields).join() === 'resetCredit' && N.ops.slice(before).every((op) => op.op !== 'create' || !op.message.resetCredit), JSON.stringify(N.ops.slice(before).map((o) => o.op)));
    const v = RC.resetCreditCardView(card.resetCredit, { fmtTime: (x) => 'T' + x });
    ok('R3: the card\'s view: no button, one line stating the outcome ("Used at … — the 7d window runs until …")', v.button === false && v.line && v.line.key === 'Used at {time} — the new window runs until {until}.' && v.line.params.until === 'T' + (wr3.nowS + 7 * 86400), JSON.stringify(v));
    // the WALL IS GONE by itself: a reading of the account that is usable again
    const wo = world();
    const N2 = withNormalizer(wo);
    wo.quietly(() => wo.eng.recordCodexQuotaSignal(wo.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wo.nowS + 7200 }));
    { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
    wo.quietly(() => wo.eng.recordCodexQuotaSignal(wo.s1, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 4, window_minutes: 10080, resets_at: wo.nowS + 7 * 86400 }, secondary: null } }));
    const c2 = N2.cards()[0];
    ok('R3: a reading that shows the account usable again resolves the card (how open) — no credit was needed', c2 && c2.resetCredit.resolved && c2.resetCredit.resolved.how === 'open', JSON.stringify(c2 && c2.resetCredit));
    ok('R3: …its view says so, no button', (() => { const vv = RC.resetCreditCardView(c2.resetCredit, { fmtTime: (x) => 'T' + x }); return vv.button === false && /no credit was needed/.test(vv.line.key); })());
    // a card AFTER the event is about a NEW wall: it keeps its button
    wo.quietly(() => wo.eng.recordCodexQuotaSignal(wo.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wo.nowS + 9000 }));
    const c3 = N2.cards()[1];
    ok('R3: a wall card drawn AFTER the reading keeps its button (a new wall is a new offer)', c3 && !c3.resetCredit.resolved && RC.resetCreditCardView(c3.resetCredit).button === true, JSON.stringify(N2.cards().map((m) => m.resetCredit)));
    // the PURE rule's edges (a card older/newer than the fact, a reading past the stated reset, the sanitizer)
    ok('R3 rule: a reading taken past the card\'s stated reset resolves it `reset` at that reset, even if it is not usable', JSON.stringify(RC.offerResolution({ available: 1, mode: 'off', accountKey: 'a', resetsAtSec: 100 }, 50e3, { kind: 'reading', at: 101e3, usable: false })) === '{"how":"reset","at":100000}');
    ok('R3 rule: a reading that is NOT usable and before the reset answers nothing', RC.offerResolution({ available: 1, mode: 'off', accountKey: 'a', resetsAtSec: 100 }, 50e3, { kind: 'reading', at: 60e3, usable: false }) === null);
    ok('R3 rule: a fact OLDER than the card answers nothing; an already-resolved card is not resolved twice', RC.offerResolution({ available: 1 }, 70e3, { kind: 'used', at: 60e3 }) === null && RC.offerResolution({ available: 1, resolved: { how: 'used', at: 1 } }, 0, { kind: 'used', at: 60e3 }) === null);
    ok('R3 rule: offerOf keeps a valid resolution and the wall\'s reset, drops a forged one', JSON.stringify(RC.offerOf({ available: 2, mode: 'off', accountKey: 'k', resetsAtSec: 9, resolved: { how: 'used', at: 5, untilSec: 7 } })) === '{"available":2,"mode":"off","accountKey":"k","resetsAtSec":9,"resolved":{"how":"used","at":5,"untilSec":7}}' && RC.offerOf({ available: 2, mode: 'off', resolved: { how: '<img>', at: 5 } }).resolved === undefined);
    // the CLIENT carrier: the renderer reads the PURE view, the edit op patches the card IN PLACE
    const cr = read('src/lib/chat-renderers.js'), cv = read('src/lib/chat-view.js');
    ok('R3 client: the card renders the PURE view — the outcome line (textContent) instead of the button', /const view = resetCreditCardView\(rc, \{ fmtTime: fmtInstant \}\);/.test(cr) && /line\.textContent = t\(view\.line\.key, view\.line\.params \|\| \{\}\);/.test(cr) && /if \(view\.button\) \{/.test(cr));
    ok('R3 client: a `resetCredit` edit patches THAT card in place (patchResetCredit) before any re-render branch', /if \('resetCredit' in fields && !fields\.status\) \{\s*\n\s*const el = this\._elements\.get\(id\);\s*\n\s*if \(el\) this\._renderers\.patchResetCredit\(el, msg\);\s*\n\s*return;/.test(cv) && cv.indexOf("if ('resetCredit' in fields") < cv.indexOf("if (fields.status === 'complete' || fields.status === 'error'") && /patchResetCredit\(el, msg\) \{/.test(cr));
    // CONTROL: the engine without the resolution at the credit's answer reproduces the owner's card
    const esrc = read('src/server/usage-pool-engine.js');
    const fromR3 = "      resolveResetCreditCards(tKey, { kind: 'used', at: Date.now(), untilSec });";
    ok('R3 CONTROL: the patch hits the product source', esrc.includes(fromR3));
    const noR3 = require(MUTRC.write('src/server/usage-pool-engine.js', esrc.replace(fromR3, ''), 'nor3'));
    const wn3 = world({ engine: noR3 });
    const Nn = withNormalizer(wn3);
    wn3.quietly(() => wn3.eng.recordCodexQuotaSignal(wn3.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wn3.nowS + 7200 }));
    wn3.quietly(() => wn3.call('POST', wn3.A, { body: { sessionId: 'cx1' } }));
    wn3.quietly(() => wn3.eng.recordCodexQuotaSignal(wn3.s1, { type: 'reset_credit_result', outcome: 'reset', idempotencyKey: wn3.keyOf(0), attempts: 1 }));
    ok('R3 CONTROL: without it the card keeps "Use a reset credit" after the credit was used — the owner\'s screenshot, which the R3 legs see', Nn.cards().length === 1 && !Nn.cards()[0].resetCredit.resolved && RC.resetCreditCardView(Nn.cards()[0].resetCredit).button === true);
  }
  // ── lane reset-path R4: THE USAGE MENU'S CODEX ⟳ IS ANSWERED (the owner: the press refreshed the cache at
  //    10:48:38 and nothing told him — the client sent the ws verb, spun 1.5 s, refreshed after a fixed 2.5 s)
  {
    const US = await import(path.join(REPO, 'src/lib/usage-source.js'));
    const fmt = (x) => 'T' + x;
    const w4 = world({ credits: null });
    const route = (body) => new Promise((resolve) => {
      const routes = {};
      registerResetCreditRoutes({ get() { }, post: (p, h) => { routes[p] = h; } }, { engine: w4.eng });
      const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; } };
      routes['/api/usage/codex-refresh']({ body, headers: {} }, res);
    });
    w4.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 1 }, rateLimits: { primary: { used_percent: 3, window_minutes: 10080, resets_at: w4.nowS + 6 * 86400 }, secondary: { used_percent: 12, window_minutes: 300, resets_at: w4.nowS + 3600 } } });
    const a = await w4.quietly(() => route({ key: w4.A, sessionId: 'cx1' }));
    ok('R4: the ⟳ waits for the session\'s own round trip and answers WITH the reading it wrote (whose, the windows, the stored credits)', a.code === 200 && a.body.ok === true && a.body.key === w4.A && a.body.name === 'Cx Alpha' && a.body.reading.sevenDay.usedPercent === 3 && a.body.reading.sevenDay.resetsAt === w4.nowS + 6 * 86400 && a.body.resetCredits === 1, JSON.stringify(a.body));
    ok('R4: …one verb on that session\'s stdin (the existing caps-routed rung — no new vendor surface)', w4.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 1);
    const toast = US.codexRefreshToast(a.body, { fmtTime: fmt });
    ok('R4: the toast says it in one sentence — "Codex · Cx Alpha: 5h 12% · resets … · 7d 3% · resets … · 1 reset credit stored"', !toast.error && toast.text === `Codex · Cx Alpha: 5h 12% · resets T${w4.nowS + 3600} · 7d 3% · resets T${w4.nowS + 6 * 86400} · 1 reset credit stored`, toast.text);
    ok('R4: a window that has not started (its "reset" slides with the clock — quota-model) is said "starts on first use", never a reset instant', US.codexRefreshToast({ ok: true, name: 'Cx Alpha', reading: { sevenDay: { usedPercent: 0, resetsAt: null, notStarted: true } }, resetCredits: null }, { fmtTime: fmt }).text === 'Codex · Cx Alpha: 7d 0% · starts on first use');
    // the wrapper's own refusal (a failed on-demand read)
    w4.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, error: 'codex account authentication required to read rate limits' });
    const b = await w4.quietly(() => route({ key: w4.A }));
    const tb = US.codexRefreshToast(b.body, { fmtTime: fmt });
    ok('R4: a read the session\'s codex refused ⇒ 502 refused, and the toast quotes why', b.code === 502 && b.body.code === 'refused' && tb.error && /Codex ⟳ on Cx Alpha failed — codex account authentication required to read rate limits/.test(tb.text), JSON.stringify(b.body) + ' ' + tb.text);
    // no answer at all
    w4.s1.stubLimits = null;
    const c = await w4.quietly(() => w4.eng.refreshCodexForPerson({ key: w4.A, timeoutMs: 1000 }));
    const tc4 = US.codexRefreshToast(c, { fmtTime: fmt });
    ok('R4: the session\'s codex never answers ⇒ `timeout`, named in seconds', c.ok === false && c.code === 'timeout' && tc4.error && /no answer from its codex within 1 s/.test(tc4.text), JSON.stringify(c) + ' ' + tc4.text);
    // verify r1 (reproduced): two presses in flight wrote two verbs — two vendor reads for one answer
    { const w2p = world({ credits: null });
      w2p.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 3, window_minutes: 10080, resets_at: w2p.nowS + 6 * 86400 }, secondary: null } });
      const [x1, x2] = await Promise.all([w2p.quietly(() => w2p.eng.refreshCodexForPerson({ key: w2p.A })), w2p.quietly(() => w2p.eng.refreshCodexForPerson({ key: w2p.A }))]);
      ok('R4 single-flight: two presses in flight ⇒ ONE codex-read-limits on the session, both answered with the reading', x1.ok === true && x2.ok === true && w2p.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 1, JSON.stringify([x1.ok, x2.ok, w2p.wrote.filter((x) => /"codex-read-limits"/.test(x)).length]));
      const esrcS = read('src/server/usage-pool-engine.js');
      const fromS = '    if (waiters.length > 1 && !fresh) return;\n';
      ok('R4 single-flight CONTROL: the patch hits the product source', esrcS.includes(fromS));
      const twoReads = require(MUTRC.write('src/server/usage-pool-engine.js', esrcS.replace(fromS, ''), 'tworeads'));
      const w2q = world({ credits: null, engine: twoReads });
      w2q.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 3, window_minutes: 10080, resets_at: w2q.nowS + 6 * 86400 }, secondary: null } });
      await Promise.all([w2q.quietly(() => w2q.eng.refreshCodexForPerson({ key: w2q.A })), w2q.quietly(() => w2q.eng.refreshCodexForPerson({ key: w2q.A }))]);
      ok('R4 single-flight CONTROL: without the guard the two presses write TWO verbs — the row above sees the rule', w2q.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 2);
      // a deliberate RE-ASK after silence (the reset hold's 30 s retry) still goes out while an older read waits
      const w2r = world({ credits: null });
      w2r.s1.stubLimits = null; // the first read never answers
      w2r.quietly(() => w2r.eng.probeQuotaForKey(w2r.A, { session: w2r.s1, timeoutMs: 300 }));
      w2r.quietly(() => w2r.eng.probeQuotaForKey(w2r.A, { session: w2r.s1, timeoutMs: 300, fresh: true }));
      ok('R4 single-flight: a deliberate fresh re-ask (the hold\'s retry after silence) is written even while an older read is waiting', w2r.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 2);
    }
    // verify r1 (reproduced): the popup's key is a POOL (the default codex account) while a member's session is live
    { const wp = world({ credits: null });
      const pool = wp.wam.createPool({ name: 'CxPool', backend: 'codex', members: [wp.A] });
      const pid = wp.wam.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex').id;
      wp.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 1 }, rateLimits: { primary: { used_percent: 3, window_minutes: 10080, resets_at: wp.nowS + 6 * 86400 }, secondary: null } });
      const routeP = (body) => new Promise((resolve) => { const routes = {}; registerResetCreditRoutes({ get() { }, post: (p, h) => { routes[p] = h; } }, { engine: wp.eng }); const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; } }; routes['/api/usage/codex-refresh']({ body, headers: {} }, res); });
      const ap = await wp.quietly(() => routeP({ key: pid }));
      ok('R4 pool: the popup shows the POOL (the default account) — the read rides its current MEMBER\'s session and the answer names the member', ap.code === 200 && ap.body.ok === true && ap.body.key === wp.A && ap.body.name === 'Cx Alpha' && wp.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 1, JSON.stringify([ap.code, ap.body && ap.body.code, ap.body && ap.body.key, ap.body && ap.body.name]));
      const esrcP = read('src/server/usage-pool-engine.js');
      const fromP = "  if (key) { try { const a = accounts.get(String(key)); if (a && a.type === 'pooled') key = accounts.poolCurrentFor(String(key), null) || accounts.poolCurrent(String(key)) || key; } catch { } }\n";
      ok('R4 pool CONTROL: the patch hits the product source', esrcP.includes(fromP));
      const noPool = require(MUTRC.write('src/server/usage-pool-engine.js', esrcP.replace(fromP, ''), 'nopool'));
      const wq = world({ credits: null, engine: noPool });
      wq.wam.createPool({ name: 'CxPool', backend: 'codex', members: [wq.A] });
      const pq = wq.wam.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex').id;
      const aq = await wq.quietly(() => wq.eng.refreshCodexForPerson({ key: pq, timeoutMs: 500 }));
      ok('R4 pool CONTROL: without the resolution the pool key matches no session ⇒ no_live_session naming the pool — the row above sees the rule', aq.ok === false && aq.code === 'no_live_session' && /CxPool/.test(aq.error || ''), JSON.stringify(aq));
      void pool;
    }
    // no session on the account the popup shows
    const d = await route({ key: '__global_codex__' });
    ok('R4: no running session on the account the popup SHOWS ⇒ 409 no_live_session naming it (never a silent read of another account)', d.code === 409 && d.body.code === 'no_live_session' && /No Codex chat session on CLI login is running/.test(US.codexRefreshToast(d.body).text), JSON.stringify(d.body));
    ok('R4: a server that never answered (a lost request) is said too', US.codexRefreshToast(null).error === true);
    // R3 × R4: the fresh reading re-judges an open wall card
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
    const w5 = world();
    const mm = createMessageManager('codex', 'cx1'); w5.s1._normalizer = mm;
    w5.quietly(() => w5.eng.recordCodexQuotaSignal(w5.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w5.nowS + 7200 }));
    { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
    w5.s1.stubLimits = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 3, window_minutes: 10080, resets_at: w5.nowS + 7 * 86400 }, secondary: null } });
    await w5.quietly(() => w5.eng.refreshCodexForPerson({ key: w5.A }));
    ok('R4: …and the reading the ⟳ brought back re-judges the wall card (usable again ⇒ resolved, no button)', mm.messages.filter((m) => m.resetCredit).every((m) => m.resetCredit.resolved && m.resetCredit.resolved.how === 'open'), JSON.stringify(mm.messages.filter((m) => m.resetCredit).map((m) => m.resetCredit)));
    // the CLIENT: the press posts the route, toasts the PURE sentence, repaints at the round trip
    const um = read('src/lib/usage-meter.js');
    const fn = um.slice(um.indexOf('async _refreshCodexQuota(btn) {'), um.indexOf('async _refreshQuotaOnDemand('));
    const answered = (src) => /fetchJson\('\/api\/usage\/codex-refresh'/.test(src) && /codexRefreshToast\(r, /.test(src) && /showToast\(toast\.text/.test(src) && /if \(r\) \{ clearTimeout\(fallback\); this\.refreshUsage\?\.\(\); \}/.test(src);
    ok('R4 client: the press POSTs the route, toasts the PURE sentence, repaints at the round trip (the 2.5 s refresh only as the fallback)', answered(fn) && !/this\.ws\.send\(\{ type: 'codex-read-limits'/.test(fn));
    const preFix = "  _refreshCodexQuota(btn) {\n    const live = (this.sidebar?._allSessions || []).find((s) => backendFeatureCaps(s.backend || 'claude').quotaRefresh === 'session-rpc' && s.status === 'live' && s.webuiId && !s.host);\n    if (!live) { showToast(t('Needs a running Codex chat session (the read rides its own app-server)'), { type: 'error' }); return; }\n    try { this.ws.send({ type: 'codex-read-limits', sessionId: live.webuiId }); } catch { }\n    if (btn) { btn.classList.add('spin'); setTimeout(() => btn.classList.remove('spin'), 1500); }\n    setTimeout(() => this.refreshUsage?.(), 2500);\n  },";
    ok('R4 CONTROL: the pre-fix press (the ws verb + a fixed 2.5 s timer, a toast only for the refusal) fails the same census — the owner\'s silent ⟳', !answered(preFix));
  }
  // ── verify r1 (the MONEY class): THE UNKNOWN CONSUME. A consume that went out — or may have — and was never
  //    answered must never free a second key by the clock alone: after the floor it stays UNSETTLED until a
  //    reading of the account says whether it landed; every press reads first. Three carriers, both verdicts.
  {
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
    const post = (w, id, body, engine = w.eng) => new Promise((resolve) => { const routes = {}; registerResetCreditRoutes({ get() { }, post: (p, h) => { routes[p] = h; } }, { engine }); const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; } }; routes['/api/accounts/:id/reset-credit']({ params: { id }, body, query: {}, headers: {} }, res); });
    const past = (t) => { t.at -= 11 * 60e3; if (t.sentAt) t.sentAt -= 11 * 60e3; try { clearTimeout(t.timer); } catch { } if (!t.outcome) { t.outcome = 'no-answer'; t.outcomeAt = Date.now() - 60e3; } };
    const reading = (w, count, { moved = false } = {}) => ({ type: 'rate_limits_updated', onDemand: true, ...(count === null ? {} : { resetCredits: { availableCount: count } }), rateLimits: { primary: { used_percent: moved ? 0 : 100, window_minutes: 10080, resets_at: moved ? w.nowS + 7 * 86400 : w.nowS + 2 * 86400 }, secondary: null } });
    const SDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-unk-')); roots.push(SDIR);
    const STUB = writeStub(SDIR);
    const TABLE = path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json');
    const stubEnv = (tag) => { const log = path.join(SDIR, tag + '.ndjson'); fs.writeFileSync(log, ''); Object.assign(process.env, { STUB_TABLE: TABLE, STUB_LOG: log, STUB_MODE: 'answer', STUB_READ_USED: '100' }); return () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
    const until = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 40)); } return false; };
    const helper = { codexCmd: STUB, extraArgs: [] };
    const worldAuto = (engine = engMod) => world({ keyed: false, sends: false, ackMs: 120, mode: 'auto', helper, engine });
    // U1 the AUTO rung on a wrapper that CANNOT report its send (older than resetCreditKey): silence is not "not sent"
    for (const [tag, count] of [['landed', 2], ['not-landed', 3]]) {
      const w = worldAuto();
      const mm = createMessageManager('codex', 'cx1'); w.s1._normalizer = mm;
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 2 * 86400 }));
      ok(`unknown/${tag}: the auto rung wrote the verb to the old wrapper`, w.verbs() === 1);
      await new Promise((r) => setTimeout(r, 300));
      const t = w.eng._resetCreditTries.get(w.A);
      ok(`unknown/${tag}: silence from a carrier that cannot say ⇒ the attempt is UNKNOWN (never not-sent): charged once, no hold, the floor armed`, t && t.outcome === 'unknown' && t.sentAt > 0 && w.charged() === 1 && w.holdsOpen() === 0 && w.call('GET', w.A).body.code === 'cooldown', JSON.stringify({ o: t && t.outcome, c: w.charged(), h: w.holdsOpen(), pv: w.call('GET', w.A).body.code }));
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 2 * 86400 + 1 }));
      ok(`unknown/${tag}: a new event inside the floor writes no second verb (the restated wall draws a card offering the stale credit)`, w.verbs() === 1 && mm.messages.filter((m) => m.resetCredit).length >= 1, `verbs=${w.verbs()}`);
      past(t); t.outcome = 'unknown';
      const pv = w.call('GET', w.A).body;
      ok(`unknown/${tag}: past the floor it is UNSETTLED — the preview carries the fact (no refusal, no cooldown), the button live`, !pv.code && pv.cooldownUntilSec === null && pv.unsettled && pv.unsettled.sinceSec > 0, JSON.stringify(pv));
      const m = RC.dialogModel(pv, { nowSec: w.nowS, fmtTime: (x) => 'T' + x, harness: 'Codex' });
      ok(`unknown/${tag}: …the dialog says it (sent at T, got no answer, Use reads first)`, m.canConfirm && m.lines.some((l) => /got no answer — it may have been spent\. Use reads the account first/.test(l.key) && l.params.time === 'T' + pv.unsettled.sinceSec), JSON.stringify(m.lines.map((l) => l.key)));
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 2 * 86400 + 2 }));
      ok(`unknown/${tag}: the auto rung stays blocked while unsettled (no verb)`, w.verbs() === 1, `verbs=${w.verbs()}`);
      { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, reading(w, count, { moved: count === 2 })));
      const t2 = w.eng._resetCreditTries.get(w.A);
      if (tag === 'landed') {
        const c = mm.messages.filter((m2) => m2.resetCredit)[0];
        ok('unknown/landed: the reading (count 3→2) settles it LANDED — the attempt is reset, the person told it did land, the card says USED (never "no credit was needed")', t2.outcome === 'reset' && t2.settled && t2.settled.how === 'landed' && w.notices.some((n) => /did land \(the stored credit count fell 3 → 2\); the limit was reset then/.test(n)) && c.resetCredit.resolved && c.resetCredit.resolved.how === 'used', JSON.stringify([t2.outcome, t2.settled, c.resetCredit.resolved, w.notices]));
        ok('unknown/landed: …and the block is gone (a new wall is a new decision)', !w.call('GET', w.A).body.code && !w.call('GET', w.A).body.unsettled, JSON.stringify(w.call('GET', w.A).body));
      } else {
        ok('unknown/not-landed: the reading (count still 3, the window unchanged) settles it NOT LANDED — the block ends', t2.outcome === 'unknown' && t2.settled && t2.settled.how === 'not-landed' && !w.call('GET', w.A).body.unsettled, JSON.stringify([t2.outcome, t2.settled]));
        w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 2 * 86400 + 3 }));
        ok('unknown/not-landed: …the rung is free again: the next event writes a verb with a NEW key', w.verbs() === 2 && w.keyOf(1) !== w.keyOf(0), `verbs=${w.verbs()}`);
      }
    }
    // U2 the SESSION path: a press over an unsettled attempt — the route reads the account through the conversation first
    for (const [tag, count, moved] of [['landed', 2, true], ['not-landed', 3, false]]) {
      const w = world();
      w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      past(w.eng._resetCreditTries.get(w.A));
      const pv = w.call('GET', w.A).body;
      ok(`unknown/session/${tag}: a keyed wrapper that sent and never answered ⇒ after the floor, unsettled (fact), via session, the button live`, !pv.code && pv.unsettled && pv.via === 'session', JSON.stringify(pv));
      w.s1.stubLimits = () => reading(w, count, { moved });
      { const t0 = Date.now(); while (Date.now() < t0 + 3) { } } // the read is LATER than the world's own push (a same-millisecond tie is not "after")
      const r = await w.quietly(() => post(w, w.A, { sessionId: 'cx1', expect: { resetsAtSec: pv.resetsAtSec } }));
      const reads = w.wrote.filter((x) => /"codex-read-limits"/.test(x)).length;
      if (tag === 'landed') ok('unknown/session/landed: the press read the account (ONE read on the conversation), learned the earlier request landed ⇒ 409 preview_changed BY THE READ\'S OWN VERDICT (settled: landed), NO second verb, the person told it landed', reads === 1 && r.code === 409 && r.body.code === 'preview_changed' && r.body.settled === 'landed' && w.verbs() === 1 && w.notices.some((n) => /did land/.test(n)), JSON.stringify([reads, r.code, r.body, w.verbs(), w.call('GET', w.A).body, w.notices, w.eng._resetCreditTries.get(w.A) && { o: w.eng._resetCreditTries.get(w.A).outcome, s: w.eng._resetCreditTries.get(w.A).settled, p: !!w.eng._resetCreditTries.get(w.A).prior }]));
      else ok('unknown/session/not-landed: the press read the account (ONE read), the earlier one never landed ⇒ the consume goes out with a NEW key', reads === 1 && r.code === 200 && w.verbs() === 2 && w.keyOf(1) !== w.keyOf(0), JSON.stringify([reads, r.code, r.body, w.verbs()]));
    }
    // U3 the HELPER path: ONE child reads first; the consume goes out only over a prior settled NOT landed
    for (const [tag, creditsAt] of [['landed', 2], ['not-landed', 1]]) {
      const rpc = stubEnv('unk-' + tag);
      const w = world({ session: false, helper });
      w.quietly(() => w.call('POST', w.A));
      await until(() => !!(w.eng._resetCreditTries.get(w.A) || {}).outcome, 6000);
      const t1 = w.eng._resetCreditTries.get(w.A);
      past(t1); t1.outcome = 'unanswered'; t1.settled = null; t1.creditsAt = creditsAt; // the stub's read answers availableCount 1: 2→1 = landed, 1→1 = not landed
      fs.writeFileSync(process.env.STUB_LOG, '');
      const pv = w.call('GET', w.A).body;
      ok(`unknown/helper/${tag}: unsettled on the helper path — the fact rides the preview, via helper, no refusal`, pv.unsettled && pv.via === 'helper' && !pv.code, JSON.stringify(pv));
      const n0 = w.notices.length;
      const r = w.quietly(() => w.call('POST', w.A));
      await until(() => w.notices.length > n0, 8000);
      const L = rpc().map((x) => x.method);
      const consumes = L.filter((m) => m === 'account/rateLimitResetCredit/consume').length;
      if (tag === 'landed') ok('unknown/helper/landed: ONE child — initialize → read → (landed) ⇒ NO consume; the person told the earlier one had landed and this press spent nothing; the hold given back', r.code === 200 && consumes === 0 && L.includes('account/rateLimits/read') && w.notices.some((n) => /had already landed \(the stored credit count fell 2 → 1\); this press spent nothing/.test(n)) && w.holdsOpen() === 0, JSON.stringify([r.code, L, w.notices, w.holdsOpen()]));
      else ok('unknown/helper/not-landed: ONE child — initialize → read → (not landed) → consume → read; the credit spent once', r.code === 200 && consumes === 1 && JSON.stringify(L) === JSON.stringify(['initialize', 'initialized', 'account/rateLimits/read', 'account/rateLimitResetCredit/consume', 'account/rateLimits/read']) && w.notices.some((n) => /reset credit used on Cx Alpha/.test(n)), JSON.stringify([r.code, L, w.notices]));
    }
    // U3b (verify r2, reproduced — money): an attempt on an account whose stored count was UNKNOWN at the press
    // was recorded as `creditsAt: 0` (`Number(null)`), so the first reading ("count still 1 ≥ 0") settled it NOT
    // LANDED and the next press minted a second key over a consume that may have landed
    {
      const rpc = stubEnv('unk-nowitness'); process.env.STUB_MODE = 'hang-consume';
      const w = world({ session: false, helper: { ...helper, wallMs: 500 } }); // the world's cache carries no count
      // verify r8 T0: every helper press READS FIRST now, so the witness-less shape is a read that carries NO count (the
      // vendor's rateLimitResetCredits null — STUB_READ_COUNT=none) restating the window the dialog showed
      process.env.STUB_READ_COUNT = 'none';
      w.quietly(() => w.call('POST', w.A));
      await until(() => !!(w.eng._resetCreditTries.get(w.A) || {}).outcome, 6000);
      const t1 = w.eng._resetCreditTries.get(w.A);
      ok('no-witness: an attempt with no known count (the cache none, the read before the consume none) records NULL, never a fabricated 0', t1 && t1.creditsAt === null && t1.outcome === 'unanswered', JSON.stringify({ creditsAt: t1 && t1.creditsAt, outcome: t1 && t1.outcome }));
      past(t1); t1.outcome = 'unanswered'; t1.settled = null;
      delete process.env.STUB_READ_COUNT;
      process.env.STUB_READ_RESETS_AT = String(w.nowS + 2 * 86400 - 600); // verify r5: the read restates the window EARLIER — no window witness, the count alone speaks (the r2 legs' shape; a restated wall would PROVE not-landed by the window now)
      process.env.STUB_MODE = 'answer'; fs.writeFileSync(process.env.STUB_LOG, '');
      const n0 = w.notices.length; const r = w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n0, 8000);
      const L = rpc().map((x) => x.method);
      ok('no-witness: the next press reads (the count 1 carried) and does NOT consume over an attempt whose count it cannot compare', r.code === 200 && L.includes('account/rateLimits/read') && !L.includes('account/rateLimitResetCredit/consume'), JSON.stringify([r.code, L]));
      // verify r2 (1b): …that attempt is UNTOLD — the block ends, the person is told the count the reading carries, and
      // the NEXT press (the dialog now showing that count) spends one credit, once
      const pvU = w.call('GET', w.A).body;
      ok('no-witness/untold: the reading settles it UNTOLD (no count was known at the send; the account now holds 1) — the block ends, the notice says so', t1.settled && t1.settled.how === 'untold' && !pvU.unsettled && !pvU.code && w.notices.some((n) => /cannot be judged \(no credit count was known when it was sent — the account now holds 1\); nothing was spent this time/.test(n)), JSON.stringify([t1.settled, pvU, w.notices.slice(-2)]));
      fs.writeFileSync(process.env.STUB_LOG, '');
      process.env.STUB_READ_RESETS_AT = String(JSON.parse(fs.readFileSync(path.join(w.cacheDir, w.A + '.json'), 'utf8')).sevenDay.resetsAt); // the read restates the window the dialog shows now
      const n1 = w.notices.length; const r3 = w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n1, 8000);
      const L3 = rpc().map((x) => x.method);
      ok('no-witness/untold: the next press consumes ONCE (it reads first — the seam, verify r8 T0 — and nothing unsettled remains)', r3.code === 200 && L3.filter((m) => m === 'account/rateLimitResetCredit/consume').length === 1 && L3.indexOf('account/rateLimits/read') < L3.indexOf('account/rateLimitResetCredit/consume') && w.notices.some((n) => /reset credit used on Cx Alpha/.test(n)), JSON.stringify([r3.code, L3]));
      // verify r2 (1b): THE LAPSE on the session path — an unsettled attempt whose wall is gone by itself blocks nothing,
      // the preview carries `lapsed`, the dialog says the count may be one high, and a press writes the verb
      { const wl = world({ readsFirst: false }); // the r2 shape on a wrapper that reads nothing before the send (verify r8 T0: the reads-first shape follows)
        wl.quietly(() => wl.call('POST', wl.A, { body: { sessionId: 'cx1' } }));
        const tl = wl.eng._resetCreditTries.get(wl.A); past(tl); tl.outcome = 'unanswered'; tl.settled = null;
        tl.resetsAtSec = wl.nowS - 2 * 86400; // the wall it was for passed two days ago (its window rolled)
        const pl = wl.call('GET', wl.A).body;
        const ml = RC.dialogModel(pl, { nowSec: wl.nowS, fmtTime: (x) => 'T' + x, harness: 'Codex' });
        ok('lapsed: the preview is FREE (no unsettled, no refusal) and carries the lapsed fact; the dialog says the count may be one high', !pl.code && !pl.unsettled && pl.lapsed && pl.lapsed.sinceSec > 0 && ml.canConfirm && ml.lines.some((l) => /count shown may be one high/.test(l.key) && l.params.time === 'T' + pl.lapsed.sinceSec), JSON.stringify([pl.code, pl.unsettled, pl.lapsed, ml.lines.map((l) => l.key)]));
        const rl = wl.quietly(() => wl.call('POST', wl.A, { body: { sessionId: 'cx1' } }));
        ok('lapsed: a press writes the verb (a new key) — no read first, nothing refused', rl.code === 200 && wl.verbs() === 2 && wl.keyOf(1) !== wl.keyOf(0), JSON.stringify([rl.code, rl.body, wl.verbs()]));
        const tl2 = wl.eng._resetCreditTries.get(wl.A);
        // verify r3 restated the r2 row: the lapsed attempt rides as the new one's prior at the OPEN (the helper's read-first, the
        // route's read can still settle it BEFORE the send) and is DROPPED at the send — nothing can settle it after (superseded)
        ok('lapsed: the lapsed attempt rode as the new one\'s prior until the send, then was dropped (superseded at the send; charged already, blocks nothing)', tl2 && tl2.sentAt > 0 && tl2.prior === null && tl.supersededAt === tl2.sentAt && RC.isUnsettled(tl), JSON.stringify([!!(tl2 && tl2.prior), tl.supersededAt === tl2.sentAt, tl.outcome, tl.settled]));
        // verify r8 T0: on a wrapper that READS FIRST the lapsed prior is judged by that reading before the send (the count
        // unchanged, a window other than its own ⇒ untold) and still blocks nothing — the press goes out; the settled prior rides
        const wr = world();
        wr.quietly(() => wr.call('POST', wr.A, { body: { sessionId: 'cx1' } }));
        const tr = wr.eng._resetCreditTries.get(wr.A); past(tr); tr.outcome = 'unanswered'; tr.settled = null; tr.resetsAtSec = wr.nowS - 2 * 86400;
        const rr = wr.quietly(() => wr.call('POST', wr.A, { body: { sessionId: 'cx1' } }));
        const tr2 = wr.eng._resetCreditTries.get(wr.A);
        ok('lapsed (verify r8 T0, a reads-first wrapper): the read before the send settles the lapsed prior (untold), the press still goes out — a lapsed prior blocks nothing whatever the reading said about it', rr.code === 200 && tr2 && tr2.sentAt > 0 && tr2.readFirst === true && wr.befores.length === 2 && wr.verbs() === 2 && tr.settled && tr.settled.how === 'untold' && tr2.prior === tr, JSON.stringify([rr.code, tr2 && tr2.sentAt > 0, wr.befores.length, tr.settled, tr2 && tr2.prior === tr]));
      }
      // verify r2 (2, reproduced — money): the helper's app-server EXITED the moment the consume arrived — sent, never
      // answered; its error text ('exited (0) during consume') is not a timeout, so it was settled "error" (nothing
      // spent), the preview was free at once and the next press minted a SECOND key over a request that may have landed
      { const rpcX = stubEnv('exit-consume'); process.env.STUB_MODE = 'exit-on-consume';
        const wx = world({ session: false, helper });
        wx.quietly(() => wx.call('POST', wx.A));
        await until(() => !!(wx.eng._resetCreditTries.get(wx.A) || {}).outcome, 8000);
        const tx = wx.eng._resetCreditTries.get(wx.A);
        const px = wx.call('GET', wx.A).body;
        ok('exited app-server: the consume went out (logged by the stub), the attempt is UNANSWERED (may have landed): charged, the floor armed, the preview says cooldown', rpcX().some((x) => x.method === 'account/rateLimitResetCredit/consume') && tx && tx.outcome === 'unanswered' && tx.sentAt > 0 && tx.charged && px.code === 'cooldown' && wx.notices.some((n) => /no answer came back/.test(n)), JSON.stringify([rpcX().map((x) => x.method), tx && tx.outcome, px.code, wx.notices]));
        process.env.STUB_MODE = 'answer';
        const rx2 = wx.quietly(() => wx.call('POST', wx.A));
        ok('exited app-server: …a second press is refused by name (429 cooldown), no second key', rx2.code === 429 && rx2.body.code === 'cooldown' && rpcX().filter((x) => x.method === 'account/rateLimitResetCredit/consume').length === 1, JSON.stringify([rx2.code, rx2.body.code]));
        const esrcX = read('src/server/usage-pool-engine.js');
        const fromX = "attempts: res.sent ? 1 : 0, sent: !!res.sent, answered: !!res.answered, via: 'helper' });";
        ok('exited app-server CONTROL: the patch hits the product source', esrcX.includes(fromX));
        const preX = require(MUTRC.write('src/server/usage-pool-engine.js', esrcX.replace(fromX, "attempts: res.sent ? 1 : 0, sent: !!res.sent, via: 'helper' });"), 'noanswered'));
        const rpcC = stubEnv('exit-consume-ctl'); process.env.STUB_MODE = 'exit-on-consume';
        const wc = world({ session: false, helper, engine: preX });
        wc.quietly(() => wc.call('POST', wc.A));
        await until(() => !!(wc.eng._resetCreditTries.get(wc.A) || {}).outcome, 8000);
        process.env.STUB_MODE = 'answer';
        const rc2 = wc.quietly(() => wc.call('POST', wc.A));
        await until(() => rpcC().filter((x) => x.method === 'account/rateLimitResetCredit/consume').length >= 2, 8000);
        ok('exited app-server CONTROL: without `answered` on the payload the exit reads as an answered error, the press is free and a SECOND key goes out — the legs above see the rule', (wc.eng._resetCreditTries.get(wc.A) || {}).outcome !== 'unanswered' && rc2.code === 200 && rpcC().filter((x) => x.method === 'account/rateLimitResetCredit/consume').length === 2, JSON.stringify([rc2.code, rpcC().map((x) => x.method)]));
      }
      const esrcW = read('src/server/usage-pool-engine.js');
      const fromW = "    creditsAt: creditsAt != null && creditsAt !== '' && Number.isFinite(Number(creditsAt)) ? Number(creditsAt) : null, reportsSent: reportsSent !== false,";
      ok('no-witness CONTROL: the patch hits the product source', esrcW.includes(fromW));
      const preW = require(MUTRC.write('src/server/usage-pool-engine.js', esrcW.replace(fromW, "    creditsAt: Number.isFinite(Number(creditsAt)) ? Number(creditsAt) : null, reportsSent: reportsSent !== false,"), 'zerowitness'));
      const rpcC = stubEnv('unk-nowitness-ctl'); process.env.STUB_MODE = 'hang-consume'; process.env.STUB_READ_COUNT = 'none'; // the same witness-less read before press 1 (verify r8 T0)
      const wc = world({ session: false, helper: { ...helper, wallMs: 500 }, engine: preW });
      wc.quietly(() => wc.call('POST', wc.A));
      await until(() => !!(wc.eng._resetCreditTries.get(wc.A) || {}).outcome, 6000);
      const tc = wc.eng._resetCreditTries.get(wc.A); past(tc); tc.outcome = 'unanswered'; tc.settled = null;
      delete process.env.STUB_READ_COUNT; // (the read restates the SAME wall here: the pre-fix engine then reads "0 → 1, the window unchanged" as not landed and spends again)
      process.env.STUB_MODE = 'answer'; fs.writeFileSync(process.env.STUB_LOG, '');
      const nc = wc.notices.length; wc.quietly(() => wc.call('POST', wc.A)); await until(() => wc.notices.length > nc, 8000);
      ok('no-witness CONTROL: the pre-fix engine records 0 and the next press spends a SECOND credit ("count still 1") — the legs above see the rule', tc.creditsAt === 0 && rpcC().some((x) => x.method === 'account/rateLimitResetCredit/consume'), JSON.stringify([tc.creditsAt, rpcC().map((x) => x.method)]));
    }
    // verify r2 (Q3): the helper's `pressedBy` witness is the PRESS'S OWN attempt's origin — a person's press over a
    // prior the AUTO rung opened (and never got answered) still reaches the helper (it reads first, over that prior)
    { const rpcA = stubEnv('auto-prior'); const w = worldAuto();
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 2 * 86400 }));
      await new Promise((r) => setTimeout(r, 300));
      const ta = w.eng._resetCreditTries.get(w.A); past(ta); ta.outcome = 'unknown'; ta.settled = null;
      ok('auto prior: the auto rung\'s attempt on the old wrapper is unknown, origin auto, unsettled', ta && ta.origin === 'auto' && RC.isUnsettled(ta), JSON.stringify([ta && ta.origin, ta && ta.outcome]));
      fs.writeFileSync(process.env.STUB_LOG, '');
      const n0 = w.notices.length; const r = w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n0, 8000);
      const tp = w.eng._resetCreditTries.get(w.A);
      const L = rpcA().map((x) => x.method);
      ok('auto prior: a PERSON\'s press opens its own attempt (origin user) whose prior is the auto one, and the helper RAN (pressedBy person — a refused witness would have spawned nothing): initialize → read first', r.code === 200 && tp && tp.origin === 'user' && tp.prior === ta && L[0] === 'initialize' && L.includes('account/rateLimits/read'), JSON.stringify([r.code, tp && tp.origin, tp && tp.prior === ta, L]));
    }
    // verify r3 (reproduced): A LAPSED PRIOR JUDGED BY THE READING AFTER ITS SUCCESSOR'S CONSUME. Press 1 unanswered,
    // its wall long gone (lapsed, free, said); press 2 went out and its post-consume reading showed 3 → 2 — the NEW
    // consume's drop — yet it settled press 1 LANDED and the person was told the OLD request "did land"
    // (verify r8 T0: on a wrapper that reads nothing before the send — the reads-first one settles the lapsed prior by its
    // own read first, pinned in the lapsed leg above)
    { const w = world({ readsFirst: false });
      w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      const t1 = w.eng._resetCreditTries.get(w.A);
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', error: 'account/rateLimitResetCredit/consume timed out after 30000ms', idempotencyKey: w.keyOf(0), attempts: 2 }));
      past(t1); t1.outcome = 'unanswered'; t1.settled = null; t1.resetsAtSec = w.nowS - 2 * 86400; // lapsed
      ok('superseded: press 1 is lapsed (free, said)', !!w.call('GET', w.A).body.lapsed && !w.call('GET', w.A).body.unsettled);
      const r2 = w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      const t2 = w.eng._resetCreditTries.get(w.A);
      ok('superseded: press 2 went out — press 1 was its prior at the open and is DROPPED at the send (lapsed: nothing can settle it now), stamped superseded; the file carries no press 1', r2.code === 200 && t2.sentAt > 0 && t2.prior === null && t1.supersededAt === t2.sentAt && !JSON.parse(fs.readFileSync(path.join(w.root, 'data', 'reset-credit-tries.json'), 'utf8')).tries.some((x) => x.idempotencyKey === w.keyOf(0)), JSON.stringify([r2.code, t2.prior, t1.supersededAt === t2.sentAt]));
      { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, reading(w, 2, { moved: true }))); // the post-consume read: 3 → 2 (the NEW consume's)
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'reset', idempotencyKey: w.keyOf(1), attempts: 1 }));
      ok('superseded: the reading settles NOTHING about press 1 (no "did land" notice); press 2 is the reset', !t1.settled && t1.outcome === 'unanswered' && !w.notices.some((n) => /did land/.test(n)) && t2.outcome === 'reset' && w.notices.some((n) => /reset credit consumed/.test(n)), JSON.stringify([t1.settled, t1.outcome, w.notices.filter((n) => /did land|consumed/.test(n))]));
      ok('superseded PURE: the same prior judged by a reading BEFORE the send still settles (the helper\'s read-first, the route\'s)', (RC.settleByReading({ ...t1, supersededAt: t2.sentAt, settled: null }, { fetchedAt: t2.sentAt - 1, creditsLeft: 2 }) || {}).how === 'landed');
      // CONTROL: an engine that never supersedes (the pre-r3 send) tells the person the old request "did land"
      const esrcS = read('src/server/usage-pool-engine.js');
      const fromS = "  t.prior = resetCredit.supersede(t.prior, now, clockOpts(now));\n  if (!t.charged) {"; // (verify r10 moved the persist AFTER the charge — the anchor follows it)
      ok('superseded CONTROL: the patch hits the product source', esrcS.includes(fromS));
      const preS = require(MUTRC.write('src/server/usage-pool-engine.js', esrcS.replace(fromS, '  if (!t.charged) {'), 'nosupersede'));
      const wc = world({ engine: preS, readsFirst: false });
      wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      const c1 = wc.eng._resetCreditTries.get(wc.A);
      wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, { type: 'reset_credit_result', error: 'account/rateLimitResetCredit/consume timed out after 30000ms', idempotencyKey: wc.keyOf(0), attempts: 2 }));
      past(c1); c1.outcome = 'unanswered'; c1.settled = null; c1.resetsAtSec = wc.nowS - 2 * 86400;
      wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
      wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, reading(wc, 2, { moved: true })));
      ok('superseded CONTROL: without the supersession the post-consume reading settles the OLD request LANDED and says so — the legs above see the rule', c1.settled && c1.settled.how === 'landed' && wc.notices.some((n) => /did land/.test(n)), JSON.stringify([c1.settled, wc.notices.filter((n) => /did land/.test(n))]));
    }
    // verify r3 (reproduced — money): THE CLOCK, NOT THE TIMER. The floor's end was the TIMER's stamp (`no-answer`): a
    // press landing after the floor elapsed but before the timer's callback ran (a busy event loop — 350 ms here, the
    // product has measured gaps of seconds) found the attempt FREE and minted a second key. The same past the ack window
    // on a carrier that cannot report its send (the auto rung on an old wrapper): a person's press ran the helper and the
    // open attempt (which may have gone out) was replaced in the map with its timers cleared
    { const spin = (ms) => { const t0 = Date.now(); while (Date.now() < t0 + ms) { } };
      const esrcF = read('src/server/usage-pool-engine.js');
      const fromF = 'const RESET_CREDIT_FLOOR_MS = resetCredit.RESET_CREDIT_FLOOR_MS;';
      ok('clock: the floor constant is the one the engine reads (a short-floor copy is the leg\'s clock)', esrcF.includes(fromF));
      const shortFloor = require(MUTRC.write('src/server/usage-pool-engine.js', esrcF.replace(fromF, 'const RESET_CREDIT_FLOOR_MS = 300;'), 'floor300'));
      const w = world({ engine: shortFloor });
      w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      const t1 = w.eng._resetCreditTries.get(w.A);
      spin(350); // the loop was busy: the floor elapsed, the timer has not run — the record still has no outcome
      const pv = w.call('GET', w.A).body;
      ok('clock: sent 350 ms ago on a 300 ms floor, no outcome stamped yet ⇒ the preview says UNSETTLED (the press reads first), not free, not cooldown', t1.outcome === null && !pv.code && pv.cooldownUntilSec === null && !!pv.unsettled, JSON.stringify([t1.outcome, pv.code, pv.cooldownUntilSec, !!pv.unsettled]));
      w.s1.stubLimits = () => reading(w, 3);
      const r2 = await w.quietly(() => post(w, w.A, { sessionId: 'cx1', expect: { resetsAtSec: pv.resetsAtSec } }));
      const reads = w.wrote.filter((x) => /"codex-read-limits"/.test(x)).length;
      ok('clock: …a press then READS the account first (one read; the count still 3 ⇒ not landed) before its new key goes out', reads === 1 && r2.code === 200 && w.verbs() === 2 && t1.settled && t1.settled.how === 'not-landed', JSON.stringify([reads, r2.code, w.verbs(), t1.settled]));
      await new Promise((r) => setTimeout(r, 400));
      const tn = w.eng._resetCreditTries.get(w.A), fileT = JSON.parse(fs.readFileSync(path.join(w.root, 'data', 'reset-credit-tries.json'), 'utf8')).tries;
      ok('clock: …the settled record is carried by nobody (the newer attempt has no prior; its own floor timer was cleared — nothing left to wait for) and the file holds the settle', t1.settled.how === 'not-landed' && tn && tn.idempotencyKey === w.keyOf(1) && tn.prior === null && fileT.some((x) => x.idempotencyKey === w.keyOf(1)) && !fileT.some((x) => x.idempotencyKey === w.keyOf(0) && !x.settled), JSON.stringify([t1.outcome, t1.settled, tn && tn.prior, fileT.map((x) => [x.idempotencyKey === w.keyOf(0) ? 'k0' : 'k1', x.outcome, x.settled && x.settled.how])]));
      // the ack window on a carrier that cannot report (the auto rung on an old wrapper)
      const rpcK = stubEnv('clock-ack');
      const wa = worldAuto();
      wa.quietly(() => wa.eng.recordCodexQuotaSignal(wa.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wa.nowS + 2 * 86400 }));
      const ta = wa.eng._resetCreditTries.get(wa.A);
      spin(170); // past the 120 ms ack window, the ack timer not yet run
      const pa = wa.call('GET', wa.A).body;
      const ra = wa.quietly(() => wa.call('POST', wa.A));
      ok('clock: the auto rung\'s open attempt on an old wrapper, 170 ms past a 120 ms ack window, timer not run ⇒ the preview says COOLDOWN (armed from the write by the clock), a person\'s press is refused 429, NO helper spawned, the attempt still in the map', ta.outcome === null && pa.code === 'cooldown' && ra.code === 429 && rpcK().length === 0 && wa.eng._resetCreditTries.get(wa.A) === ta, JSON.stringify([ta.outcome, pa.code, ra.code, rpcK().length]));
      await until(() => ta.outcome !== null, 2000);
      ok('clock: …the ack timer then stamps it unknown (charged once)', ta.outcome === 'unknown' && ta.charged && wa.charged() === 1);
      // CONTROL: the pre-r3 PURE rule (the floor and the ack window judged by the timer's stamp) bound into the short-floor engine
      const psrc = read('src/reset-credit.js');
      const fromP1 = "  return !!(armed && now - armed >= floorMs); // a sent attempt past the floor whose timer has not run is unsettled by the clock\n";
      const fromP2 = "  if (t.reportsSent === false && now - at >= ackMs) return at; // the ack timer's `unknown`, from the write, by the clock\n";
      ok('clock CONTROL: the two patches hit the PURE source', psrc.includes(fromP1) && psrc.includes(fromP2));
      const purePre = MUTRC.write('src/reset-credit.js', psrc.replace(fromP1, '  return false;\n').replace(fromP2, ''), 'timeronly');
      const fromE = "const resetCredit = require('../reset-credit.js');";
      const engPre = require(MUTRC.write('src/server/usage-pool-engine.js', esrcF.replace(fromF, 'const RESET_CREDIT_FLOOR_MS = 300;').replace(fromE, `const resetCredit = require(${JSON.stringify(purePre)});`), 'timeronly-eng'));
      const wc = world({ engine: engPre });
      wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      spin(350);
      const rc = wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      ok('clock CONTROL: with the floor judged by the timer\'s stamp the second press in the gap is FREE — a second key, no read — the legs above see the rule', rc.code === 200 && wc.verbs() === 2 && wc.wrote.filter((x) => /"codex-read-limits"/.test(x)).length === 0, JSON.stringify([rc.code, wc.verbs()]));
      const rpcC = stubEnv('clock-ack-ctl');
      const wd = world({ keyed: false, sends: false, ackMs: 120, mode: 'auto', helper, engine: engPre });
      wd.quietly(() => wd.eng.recordCodexQuotaSignal(wd.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wd.nowS + 2 * 86400 }));
      const td = wd.eng._resetCreditTries.get(wd.A);
      spin(170);
      const rd = wd.quietly(() => wd.call('POST', wd.A));
      await until(() => rpcC().some((x) => x.method === 'account/rateLimitResetCredit/consume'), 8000);
      ok('clock CONTROL: …and the open attempt past the ack window is FREE too — a person\'s press ran the helper (a second key) and the open attempt was replaced in the map', rd.code === 200 && rpcC().some((x) => x.method === 'account/rateLimitResetCredit/consume') && wd.eng._resetCreditTries.get(wd.A) !== td, JSON.stringify([rd.code, rpcC().map((x) => x.method)]));
    }
    // verify r3 (reproduced — money): AN UNMEASURED VENDOR WORD. codex answered the consume `cooldownActive` (a word no
    // measured table lists) and the engine settled it "the vendor answered cooldownActive" — nothing armed, the next
    // press minted a second key over a consume the vendor had taken. A word we do not know fails CLOSED
    { const w = world();
      w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', outcome: 'cooldownActive', idempotencyKey: w.keyOf(0), attempts: 1 }));
      const tu = w.eng._resetCreditTries.get(w.A); const pu = w.call('GET', w.A).body;
      const ru = w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      ok('unknown word: a consume answered «cooldownActive» is an attempt of UNKNOWN effect — charged, the floor (429 on the next press, no second key), and the person is told the word and that it may have spent a credit', tu && tu.outcome === 'unknown-outcome' && tu.charged && pu.code === 'cooldown' && ru.code === 429 && w.verbs() === 1 && w.notices.some((n) => /codex answered «cooldownActive», a word VibeSpace does not know .* it may have spent a credit, so the next try waits ten minutes/.test(n)), JSON.stringify([tu && tu.outcome, pu.code, ru.code, w.verbs(), w.notices.slice(-1)]));
      past(tu); tu.outcome = 'unknown-outcome';
      ok('unknown word: …past the floor it is UNSETTLED (a press reads first), never free by the clock', !!w.call('GET', w.A).body.unsettled);
      { const t0 = Date.now(); while (Date.now() < t0 + 3) { } }
      w.quietly(() => w.eng.recordCodexQuotaSignal(w.s1, reading(w, 2, { moved: true })));
      ok('unknown word: …a reading (3 → 2) settles it LANDED: the word WAS a consume', tu.outcome === 'reset' && tu.settled && tu.settled.how === 'landed');
      // CONTROL: the engine over the pre-r3 PURE classifier (the word kept verbatim) frees the press and mints a second key
      const psrc = read('src/reset-credit.js');
      const fromP = "    if (!VENDOR_OUTCOMES.includes(word)) return { outcome: 'unknown-outcome', sent: true, answered: true, keyed, word };\n";
      ok('unknown word CONTROL: the patch hits the PURE source', psrc.includes(fromP));
      const purePre = MUTRC.write('src/reset-credit.js', psrc.replace(fromP, ''), 'openworld');
      const esrcP = read('src/server/usage-pool-engine.js');
      const fromE = "const resetCredit = require('../reset-credit.js');";
      ok('unknown word CONTROL: the engine binds the PURE rule by that one require', esrcP.includes(fromE));
      const engPre = require(MUTRC.write('src/server/usage-pool-engine.js', esrcP.replace(fromE, `const resetCredit = require(${JSON.stringify(purePre)});`), 'openworld-eng'));
      const wc = world({ engine: engPre });
      wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, { type: 'reset_credit_result', outcome: 'cooldownActive', idempotencyKey: wc.keyOf(0), attempts: 1 }));
      const rc = wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
      ok('unknown word CONTROL: with the word kept verbatim the preview is free and the second press mints a SECOND key — the legs above see the rule', rc.code === 200 && wc.verbs() === 2, JSON.stringify([rc.code, wc.verbs()]));
    }
    // verify r3 (reproduced — money): THE CHAIN. Press 1 went out and was never answered (unsettled after the floor);
    // press 2's helper never started (codex gone: ENOENT) — a FREE record whose prior is press 1; press 3 then saw NO
    // unsettled fact, carried no prior, and consumed with no read first while press 1 may have landed
    { const rpcD = stubEnv('chain'); process.env.STUB_MODE = 'hang-consume';
      const hd = { codexCmd: STUB, extraArgs: [], wallMs: 400 };
      const w = world({ session: false, helper: hd });
      w.quietly(() => w.call('POST', w.A));
      await until(() => !!(w.eng._resetCreditTries.get(w.A) || {}).outcome, 6000);
      const t1 = w.eng._resetCreditTries.get(w.A); past(t1); t1.outcome = 'unanswered'; t1.settled = null; t1.creditsAt = 2; // the stub's read answers 1: 2 → 1 = landed
      ok('chain: press 1 is unsettled — the preview says so', !!w.call('GET', w.A).body.unsettled);
      hd.codexCmd = path.join(SDIR, 'no-such-codex'); // codex is gone when press 2 lands
      const n0 = w.notices.length; const r2 = w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n0, 6000);
      const t2 = w.eng._resetCreditTries.get(w.A);
      const pv2 = w.call('GET', w.A).body;
      ok('chain: press 2 could not start the helper ⇒ its record is FREE (error, nothing sent) with press 1 as its prior — and the preview STILL says unsettled (the chain, not the newest record)', r2.code === 200 && t2 && t2.outcome === 'error' && !t2.sentAt && t2.prior === t1 && pv2.unsettled && !pv2.code, JSON.stringify([r2.code, t2 && t2.outcome, t2 && t2.prior === t1, pv2.code, !!pv2.unsettled]));
      hd.codexCmd = STUB; process.env.STUB_MODE = 'answer'; fs.writeFileSync(process.env.STUB_LOG, '');
      const n1 = w.notices.length; const r3 = w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n1, 8000);
      const L = rpcD().map((x) => x.method);
      const t3 = w.eng._resetCreditTries.get(w.A);
      ok('chain: press 3 carries press 1 as its prior (through the free record), READS FIRST, learns press 1 had landed (2 → 1) and consumes NOTHING', r3.code === 200 && t3 && t3.prior === t1 && L.includes('account/rateLimits/read') && !L.includes('account/rateLimitResetCredit/consume') && t1.settled && t1.settled.how === 'landed' && w.notices.some((n) => /had already landed \(the stored credit count fell 2 → 1\)/.test(n)), JSON.stringify([r3.code, t3 && t3.prior === t1, L, t1.settled, w.notices.slice(-1)]));
      // CONTROL: an engine whose prior is only the immediate record (the pre-r3 rule) consumes on press 3 with no read
      const esrcD = read('src/server/usage-pool-engine.js');
      const fromD = "settled: null, readFirst: via === 'helper' || readFirst === true, prior: resetCredit.priorForPress(prev, clockOpts(now)) };";
      ok('chain CONTROL: the patch hits the product source', esrcD.includes(fromD));
      const preD = require(MUTRC.write('src/server/usage-pool-engine.js', esrcD.replace(fromD, "settled: null, readFirst: via === 'helper' || readFirst === true, prior: prev && resetCredit.isUnsettled(prev, clockOpts(now)) ? prev : null };"), 'prevonly'));
      const rpcC = stubEnv('chain-ctl'); process.env.STUB_MODE = 'hang-consume';
      const hc = { codexCmd: STUB, extraArgs: [], wallMs: 400 };
      const wc = world({ session: false, helper: hc, engine: preD });
      wc.quietly(() => wc.call('POST', wc.A));
      await until(() => !!(wc.eng._resetCreditTries.get(wc.A) || {}).outcome, 6000);
      const c1 = wc.eng._resetCreditTries.get(wc.A); past(c1); c1.outcome = 'unanswered'; c1.settled = null; c1.creditsAt = 2;
      hc.codexCmd = path.join(SDIR, 'no-such-codex');
      const nc0 = wc.notices.length; wc.quietly(() => wc.call('POST', wc.A)); await until(() => wc.notices.length > nc0, 6000);
      hc.codexCmd = STUB; process.env.STUB_MODE = 'answer'; fs.writeFileSync(process.env.STUB_LOG, '');
      const nc1 = wc.notices.length; wc.quietly(() => wc.call('POST', wc.A)); await until(() => wc.notices.length > nc1, 8000);
      const LC = rpcC().map((x) => x.method);
      ok('chain CONTROL: with the prior = the immediate record only, press 3 carries NO prior and CONSUMES over the landed request (its read-first — every press reads since verify r8 T0 — had no prior to judge) — the legs above see the rule', (wc.eng._resetCreditTries.get(wc.A) || {}).prior === null && LC.includes('account/rateLimitResetCredit/consume'), JSON.stringify(LC));
    }
    // ── verify r3 T1: ENGINE PARITY — the REAL engine driven through the table's events (a short floor on a patched copy,
    //    a short ack window), compared phase by phase with src/reset-credit.js attemptStep after every step: the newest
    //    record and its priors (phase / charged / outcome class / settle), the block the preview answers, the ledger
    //    delta within a world. The clock event SHIFTS the record (the timers do not run — exactly the r3 hole)
    { const FLOOR = 300, ACK = 120;
      const esrcP = read('src/server/usage-pool-engine.js');
      const fromFP = 'const RESET_CREDIT_FLOOR_MS = resetCredit.RESET_CREDIT_FLOOR_MS;';
      ok('parity: the floor constant is the one the engine reads', esrcP.includes(fromFP));
      const engP = require(MUTRC.write('src/server/usage-pool-engine.js', esrcP.replace(fromFP, `const RESET_CREDIT_FLOOR_MS = ${FLOOR};`), 'parity'));
      const o = () => ({ now: Date.now(), floorMs: FLOOR, ackMs: ACK });
      const shift = (t, ms) => { for (let x = t; x; x = x.prior) { for (const k of ['at', 'sentAt', 'outcomeAt', 'supersededAt']) if (x[k]) x[k] -= ms; if (x.settled && x.settled.at) x.settled.at -= ms; if (x.resetsAtSec) x.resetsAtSec -= Math.round(ms / 1000); if (x.window && x.window.resetsAtSec) x.window.resetsAtSec -= Math.round(ms / 1000); } };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let seed = 0x2545f491; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
      const cls = (x) => (!x || !x.outcome ? '-' : x.outcome === 'reset' ? 'R' : RC.UNSETTLED_OUTCOMES.includes(x.outcome) ? 'U' : x.outcome === 'not-sent' ? 'N' : 'X');
      const view = (t) => { const v = []; for (let x = t, n = 0; x && n < 4; x = x.prior, n++) v.push(`${RC.phaseOf(x, o())}:${x.charged ? 1 : 0}:${cls(x)}:${x.settled ? x.settled.how : '-'}`); return v.join('|') || 'none'; };
      const mism = []; let stepsRun = 0, seqs = 0; const kinds = new Set();
      const SEQS = 20, STEPS = 5;
      for (let n = 0; n < SEQS; n++) {
        let cur = world({ engine: engP, ackMs: ACK, sends: false });
        const key = cur.A; let T = null; let ledger0 = cur.charged(), tableCharges = 0; const trail = [];
        for (let d = 0; d < STEPS; d++) {
          const e = cur.eng._resetCreditTries.get(key) || null;
          const pv = cur.call('GET', key).body;
          const live = RC.unsettledInChain(T, o());
          const c0 = live ? live.creditsAt : null, Rr = live && live.window ? live.window.resetsAtSec : null;
          const r7 = (count, moved) => ({ engine: { type: 'rate_limits_updated', onDemand: true, ...(count === null ? {} : { resetCredits: { availableCount: count } }), rateLimits: { primary: { used_percent: moved ? 0 : 100, window_minutes: 10080, resets_at: moved ? cur.nowS + 7 * 86400 : cur.nowS + 2 * 86400 }, secondary: null } }, table: { creditsLeft: count, resetsAtSec: moved ? cur.nowS + 7 * 86400 : cur.nowS + 2 * 86400, periodSec: 604800, windowStartSec: (moved ? cur.nowS + 7 * 86400 : cur.nowS + 2 * 86400) - 7 * 86400 } });
          const EVS = [
            ['press', 'press'], ['press', 'press'], ['sent', 'sent'], ['sent', 'sent'],
            ['answer', { outcome: 'reset' }], ['answer', { outcome: 'nothingToReset' }], ['answer', { error: 'account/rateLimitResetCredit/consume timed out after 30000ms', attempts: 2 }],
            ['answer', { error: 'codex app-server exited (0) during consume', attempts: 1, sent: true, answered: false }], ['answer', { outcome: 'cooldownActive' }], ['answer', { error: 'upstream 502', attempts: 1 }],
            ['wait-ack', ACK + 60], ['wait-floor', FLOOR + 60],
            ['reading', r7(c0 !== null ? c0 - 1 : 2, true)], ['reading', r7(c0 !== null ? c0 : 3, false)], ['reading', r7(null, false)],
            ['clock', FLOOR + 50], ['clock', 8 * 86400e3], ['boot', null], ['boot', null], ['torn', null],
          ];
          const [kind, arg] = EVS[Math.floor(rnd() * EVS.length)];
          trail.push(kind); kinds.add(kind);
          const now = Date.now();
          if (kind === 'press') {
            const r = cur.quietly(() => cur.eng.consumeResetCreditFor(key, { preferSessionId: 'cx1' }));
            const eNew = cur.eng._resetCreditTries.get(key) || null; // verify r4: the table's record carries the ENGINE's key (an answer is matched by key)
            const st = RC.attemptStep(T, { type: 'press', origin: 'user', creditsAt: pv.creditsLeft, resetsAtSec: pv.resetsAtSec, window: { resetsAtSec: pv.resetsAtSec, periodSec: pv.periodSec }, now, ...(eNew && eNew !== e ? { idemKey: eNew.idempotencyKey } : {}) }, o());
            T = st.t; if (st.effects.charge) tableCharges++;
            const want = st.effects.minted ? null : st.effects.refused;
            const got = r && r.ok ? null : (r && r.code) || 'refused';
            if (want !== got) mism.push(['press verdict', want, got, trail.join('>')]);
          } else if (kind === 'sent') {
            if (e) cur.quietly(() => cur.eng.recordCodexQuotaSignal(cur.s1, { type: 'reset_credit_sent', idempotencyKey: e.idempotencyKey, attempt: 1 }));
            const st = RC.attemptStep(T, { type: 'sent', now }, o()); T = st.t; if (st.effects.charge) tableCharges++;
          } else if (kind === 'answer') {
            const payload = { type: 'reset_credit_result', ...(e ? { idempotencyKey: e.idempotencyKey, attempts: 1 } : {}), ...arg };
            if (e) cur.quietly(() => cur.eng.recordCodexQuotaSignal(cur.s1, payload));
            const st = RC.attemptStep(T, { type: 'answer', payload, now }, o()); T = st.t; if (st.effects.charge) tableCharges++;
          } else if (kind === 'wait-ack' || kind === 'wait-floor') {
            await sleep(arg);
            const n2 = Date.now();
            let st = RC.attemptStep(T, { type: 'ack-expired', now: n2 }, o()); if (st.effects.charge) tableCharges++; T = st.t;
            if (kind === 'wait-floor') { st = RC.attemptStep(T, { type: 'floor-expired', now: n2 }, o()); if (st.effects.charge) tableCharges++; T = st.t; }
          } else if (kind === 'reading') {
            cur.quietly(() => cur.eng.recordCodexQuotaSignal(cur.s1, arg.engine));
            const st = RC.attemptStep(T, { type: 'reading', r: { fetchedAt: Date.now(), ...arg.table }, now: Date.now() }, o()); T = st.t;
          } else if (kind === 'clock') {
            shift(e, arg); shift(T, arg);
          } else if (kind === 'boot' || kind === 'torn') {
            if (kind === 'torn') { const f = path.join(cur.root, 'data', 'reset-credit-tries.json'); fs.writeFileSync(f, '{"v":1,"tries":[{"key":"' + key + '","at":1'); }
            // THE DEATH: the old engine's timers never run again (a process that died has none) — else its ack / floor timer
            // would settle the open record and persist it before the "new" engine reads the file (a harness artefact)
            for (const t of cur.eng._resetCreditTries.values()) for (let x = t; x; x = x.prior) { try { clearTimeout(x.ackTimer); clearTimeout(x.timer); } catch { } }
            await sleep(600); // the spend guard flushes its ledger 500 ms after a charge — the next engine reads it from disk
            cur = world({ root: cur.root, credits: null, engine: engP, ackMs: ACK, sends: false, todos: { add: () => ({ id: 'ut-p' }) } });
            const st = RC.attemptStep(T, { type: kind, now: Date.now() }, o()); T = st.t; ledger0 = cur.charged() - (st.effects.charge ? 1 : 0); tableCharges = st.effects.charge ? 1 : 0;
          }
          await sleep(5);
          stepsRun++;
          const e2 = cur.eng._resetCreditTries.get(key) || null;
          const ve = view(e2), vt = view(T);
          if (ve !== vt) mism.push(['record', ve, vt, trail.join('>')]);
          const be = RC.attemptBlock(e2, o()).code, bt = RC.attemptBlock(T, o()).code;
          if (be !== bt) mism.push(['block', be, bt, trail.join('>')]);
          const p2 = cur.call('GET', key).body;
          const pcode = p2.code && ['in_flight', 'cooldown'].includes(p2.code) ? p2.code : (p2.unsettled ? 'unsettled' : null);
          if (pcode !== bt) mism.push(['preview', pcode, bt, trail.join('>')]);
          if (cur.charged() - ledger0 !== tableCharges) mism.push(['ledger', cur.charged() - ledger0, tableCharges, trail.join('>')]);
        }
        seqs++;
      }
      ok(`parity: ${seqs} seeded sequences × ${STEPS} steps on the real engine (${stepsRun} steps) agree with the table — the newest record and its priors, the block, the preview, the ledger`, stepsRun === SEQS * STEPS && mism.length === 0, JSON.stringify(mism.slice(0, 6)));
      ok('parity: the sample exercised every event kind (press · sent · answer · the ack and floor waits · reading · clock · boot · torn)', ['press', 'sent', 'answer', 'wait-ack', 'wait-floor', 'reading', 'clock', 'boot', 'torn'].every((k) => kinds.has(k)), [...kinds].join(','));
    }
    // ── verify r3 T2: the helper's stdout cut MID-JSON (the app-server died while writing its answer) — the line never
    //    parses, the exit ends the run: sent + unanswered, never "answered, nothing spent"; a line that parses but is not
    //    the answer keeps the wait (the wall ends it: unanswered)
    { const HM = require(path.join(REPO, 'src/codex-reset-helper.js'));
      const cut = path.join(SDIR, 'stub-cut.cjs');
      fs.writeFileSync(cut, `#!/usr/bin/env node\nlet b = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.method === 'initialize') process.stdout.write(JSON.stringify({ id: m.id, result: { userAgent: 'stub' } }) + '\\n'); else if (m.method === 'account/rateLimitResetCredit/consume') { process.stdout.write(process.env.CUT_MODE === 'noise' ? '{"method":"codex/event","params":{}}\\n' : '{"id":' + m.id + ',"result":{"outcome":"re'); if (process.env.CUT_MODE !== 'noise') process.exit(0); } } });\nprocess.stdin.on('end', () => process.exit(0));\n`, { mode: 0o755 });
      const r1 = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-cut', env: { PATH: process.env.PATH, CODEX_HOME: SDIR, CUT_MODE: 'cut' }, codexCmd: cut, wallMs: 3000, pressedBy: 'person' });
      const a1 = RC.creditAnswerOf({ ...r1, idempotencyKey: 'k-cut', attempts: r1.sent ? 1 : 0 });
      ok('helper stdout cut mid-JSON: the consume was sent, the truncated answer never parsed, the exit ended the run ⇒ sent + unanswered ⇒ UNANSWERED (arms, unsettled), never an answered error', r1.sent === true && r1.answered === false && /exited/.test(r1.error || '') && a1.outcome === 'unanswered' && RC.outcomeArmsFloor(a1.outcome), JSON.stringify([r1.sent, r1.answered, r1.error, a1.outcome]));
      const r2 = await HM.consumeResetCreditViaAppServer({ idempotencyKey: 'k-noise', env: { PATH: process.env.PATH, CODEX_HOME: SDIR, CUT_MODE: 'noise' }, codexCmd: cut, wallMs: 700, pressedBy: 'person' });
      const a2 = RC.creditAnswerOf({ ...r2, idempotencyKey: 'k-noise', attempts: 1 });
      ok('helper stdout: a line that parses but is not the answer keeps the wait — the wall ends it: sent + unanswered (timed out) ⇒ UNANSWERED', r2.sent === true && r2.answered === false && /timed out after/.test(r2.error || '') && a2.outcome === 'unanswered', JSON.stringify([r2.sent, r2.answered, r2.error, a2.outcome]));
    }
    // ── verify r3 T2: the boot charge when the MEMBER WAS REMOVED between the stop and the boot — charged to the identity
    //    the record carries (its key + name at the press), never dropped, never re-resolved
    { const wo = world({ keyed: true, sends: false, ackMs: 60000 });
      wo.quietly(() => wo.call('POST', wo.A, { body: { sessionId: 'cx1' } }));
      const to = wo.eng._resetCreditTries.get(wo.A);
      ok('removed member: the attempt is open at the stop (a hold, no charge), its identity recorded on the record', to && !to.outcome && !to.charged && to.identity && to.identity.key === wo.A && wo.charged() === 0, JSON.stringify([to && to.identity, wo.charged()]));
      wo.wam.remove(wo.A);
      ok('removed member: the account record is gone before the boot', !wo.wam.get(wo.A));
      const wo2 = world({ root: wo.root, credits: null, acct: wo.A });
      const snap = JSON.stringify(wo2.eng.spendGuard.snapshot());
      ok('removed member: the new engine revives it unknown and CHARGES the recorded identity (the ledger names the removed key) — never dropped for the lack of a record', (wo2.eng._resetCreditTries.get(wo.A) || {}).charged === true && wo2.charged() === 1 && snap.includes(wo.A), JSON.stringify([(wo2.eng._resetCreditTries.get(wo.A) || {}).outcome, wo2.charged(), snap.includes(wo.A)]));
    }
    // ── verify r4 T1: THE GROUND-TRUTH TABLE (scripts/reset-credit-scenarios.mjs) — the THIRD judgement. ≥ 30 owner-visible
    //    scenarios drawn from the real incidents (r1–r3's findings, the owner's 2026-10-01 reports), each run through the REAL
    //    engine (stub wrapper + stub app-server), the TABLE (attemptStep over the same events) and the ORACLE (§9's predicates)
    //    and judged against a HAND-WRITTEN truth: the ledger, the block on the dialog, the requests handed to a carrier, the
    //    words, the ladder. A scenario where any judge and the truth disagree is red BY NAME (the table and the oracle can
    //    share a blind spot — r4 found two: a restart mid-press over an unsettled prior, a late keyed answer for a dropped one)
    {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const quietly4 = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
      const stubEnv4 = (tag, { mode = 'answer', readUsed = 100, readCount = null } = {}) => { const log = path.join(SDIR, 'r4-' + tag + '.ndjson'); fs.writeFileSync(log, ''); Object.assign(process.env, { STUB_TABLE: TABLE, STUB_LOG: log, STUB_MODE: mode, STUB_READ_USED: String(readUsed) }); if (readCount !== null) process.env.STUB_READ_COUNT = String(readCount); else delete process.env.STUB_READ_COUNT; return () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
      const past4 = (t, ms = 11 * 60e3) => { for (let x = t; x; x = x.prior) { x.at -= ms; if (x.sentAt) x.sentAt -= ms; if (x.outcomeAt) x.outcomeAt -= ms; if (x.supersededAt) x.supersededAt -= ms; if (x.settled && x.settled.at) x.settled.at -= ms; try { clearTimeout(x.timer); clearTimeout(x.ackTimer); } catch { } } };
      const makeTorn = (w) => fs.writeFileSync(path.join(w.root, 'data', 'reset-credit-tries.json'), '{"v":1,"tries":[{"key":"x","at":1');
      // THE RESTART: a new engine over the same root; the old one's timers never run again (a dead process has none)
      const boot4 = (engine) => async (w, o = {}) => { w.killTimers(); await sleep(600); const todos = { add: () => { w2.tornFiled = true; return { id: 'ut-r4' }; } }; const w2 = world({ root: w.root, credits: null, acct: w.A, engine, ...w.opts, ...o, todos }); return w2; };
      const depsFor = (engine = engMod) => ({ world: (o) => world({ engine, ...o }), stubEnv: stubEnv4, STUB, RC, until, past: past4, boot: boot4(engine), quietly: quietly4, sleep, makeTorn });
      const rows = await runScenarios(depsFor());
      for (const r of rows) ok(`r4 T1 ${r.id}: ${r.title}`, r.agree.engine && r.agree.table && r.agree.oracle, (r.why.join('; ') || '') + ' | chain ' + r.chain);
      const agreed = rows.filter((r) => r.agree.engine && r.agree.table && r.agree.oracle).length;
      // verify r5: ≥ 44 — thirteen scenarios from the pool's reality (a grant between the send and the reading, the carried cache
      // file, a late record, a pool move, a lagging slot, keys crossing, the read-first seam, a replayed answer)
      // verify r6: ≥ 59 — twelve more (the wrapper version split, a failed post-consume read, the clock class at the wall, a plan
      // change, the owner's pool move, a replayed boot buffer, two accounts' unknown words, the next press after a refused
      // read-first, a skewed clock, a count that fell by two, a foreign-key mark, the auto rung's untold)
      // verify r8 T0: ≥ 67 — seven more (the session path's read-first: the happy press, a moved window, a failed read, zero
      // credits, one read per press over an unsettled prior, an older keyed wrapper, the auto rung unchanged)
      // verify r9 ②: ≥ 69 — two more (a press that straddles a restart: the wrapper's push re-opens the revived record and the
      // consume goes out once; the wrapper's `skipped` beats the boot's guess)
      ok(`r4 T1 + r5 + r6 + r8 + r9: the table holds ${SCENARIOS.length} scenarios (≥ 69) and the engine, the table, the oracle and the truth agree on every one (${agreed}/${rows.length})`, SCENARIOS.length >= 69 && agreed === rows.length && rows.length === SCENARIOS.length);
      // CONTROLS — three patched copies, each turning its scenario red by name (the table's own blind spots found this round)
      const esrc4 = read('src/server/usage-pool-engine.js'), psrc4 = read('src/reset-credit.js');
      const fromE4 = "const resetCredit = require('../reset-credit.js');";
      const fromSup = '  const sup = num(t.supersededAt), superseded = !!(sup && at >= sup);\n';
      const fromKey = "    return null;\n  }\n  const t0 = tKey ? _resetCreditTries.get(tKey) : null;";
      const fromF3 = '    try { if (tryRec && tryRec.postConsume) settleResetCreditByReading(tKey, tryRec.postConsume); } catch { }\n'; // verify r5: the attempt's OWN post-consume reading, never the cache file
      // verify r5: the count-first order (PURE), the cache-file consult (engine), no lateness gate on the codex feed (engine)
      const fromMoved = "    if (win === 'moved') return { how: 'untold', why: `the stored credit count is still ${c1} but the window moved (${R0} → ${R1}) — a credit may have been granted since the send, or another request moved the window; which cannot be said` };\n";
      const fromGate = "    if (rec && typeof rec === 'object' && payload && (payload.type === 'rate_limits_updated' || payload.type === 'task_failed')) {";
      // verify r6: the skew rule (PURE, record-lateness.js) and the untold notice for every origin (engine)
      const lsrc = read('src/record-lateness.js'), fromL = "const recordLateness = require('../record-lateness.js');";
      const fromSkew = 'if (x.inBand && run.n >= SKEW_MIN_RECORDS && now - run.firstArrivedAt >= SKEW_SPAN_MS';
      const fromHold = "    replayHeldLate(session); // the first minute's facts, each through its own gate against the offset (verify r7 ④)\n";
      const fromUntold = "      serverNotice(`codex-reset-untold-";
      // verify r8 T0: the read-first seam as a PURE constant (false ⇒ the helper consumes on the CACHED count — the r3 LOW back)
      // and the engine's go written whatever the read said (the session path's window-moved / no-credits refusals gone)
      const fromRBP = 'function readBeforePress() { return true; }';
      const fromGo = "  const go = judgeReadFirst(t, v, { readError: snap ? null : (readError || 'the read before the consume failed') });";
      ok('r8 T0 CONTROLS: the two patches hit the product source', esrc4.includes(fromRBP) && esrc4.includes(fromGo));
      const engNoRBP = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromRBP, 'function readBeforePress() { return false; }'), 'r8-norbp'));
      const engGoAlways = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromGo, '  const go = true; void judgeReadFirst;'), 'r8-goalways'));
      ok('r4 T1 + r5 + r6 + r7 CONTROLS: the ten patches hit the product source', esrc4.includes(fromE4) && psrc4.includes(fromSup) && esrc4.includes(fromKey) && esrc4.includes(fromF3) && psrc4.includes(fromMoved) && esrc4.includes(fromGate) && esrc4.includes(fromL) && lsrc.includes(fromSkew) && esrc4.includes(fromUntold) && esrc4.includes(fromHold));
      const pureNoSkew = MUTRC.write('src/record-lateness.js', lsrc.replace(fromSkew, 'if (false && x.inBand && run.n >= SKEW_MIN_RECORDS && now - run.firstArrivedAt >= SKEW_SPAN_MS'), 'r6-noskew');
      const engNoHold = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromHold, ''), 'r7-nohold'));
      const engNoSkew = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromL, `const recordLateness = require(${JSON.stringify(pureNoSkew)});`), 'r6-noskew-eng'));
      const engUntoldGate = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromUntold, "      if (x.origin === 'user') serverNotice(`codex-reset-untold-"), 'r6-untoldgate'));
      const pureR3 = MUTRC.write('src/reset-credit.js', psrc4.replace(fromSup, fromSup + '  if (superseded) return null;\n'), 'r4-r3rule');
      const engR3 = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromE4, `const resetCredit = require(${JSON.stringify(pureR3)});`), 'r4-r3rule-eng'));
      const engFallback = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromKey, "    // control: the pre-r4 session fallback\n  }\n  const t0 = tKey ? _resetCreditTries.get(tKey) : null;"), 'r4-fallback'));
      const engNoCache = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromF3, ''), 'r4-nocache'));
      const pureCountFirst = MUTRC.write('src/reset-credit.js', psrc4.replace(fromMoved, ''), 'r5-countfirst');
      const engCountFirst = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromE4, `const resetCredit = require(${JSON.stringify(pureCountFirst)});`), 'r5-countfirst-eng'));
      const engFileConsult = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromF3, '    try { const c = tKey ? readRawUsageCache(tKey) : null; if (c && Number(c.fetchedAt) > 0) settleResetCreditByReading(tKey, c); } catch { }\n'), 'r5-fileconsult'));
      const engNoGate = require(MUTRC.write('src/server/usage-pool-engine.js', esrc4.replace(fromGate, '    if (false) {'), 'r5-nogate'));
      for (const [what, engine, id, re] of [['the r3 supersede rule back (a superseded prior refused every later reading)', engR3, 'S18', /could not tell|engine block unsettled/], ['the session fallback for a keyed answer (press 1\'s late reset marks press 2)', engFallback, 'S19', /engine|table/], ['no consult of the cached reading at an unknown-outcome stamp', engNoCache, 'S15', /engine block unsettled/],
        ['r5: the count-first order back (an unchanged count outranks a moved window — press 1 settled not-landed; the helper belt alone still refuses the moved window, so the WORDS go red: nothing says the request cannot be judged)', engCountFirst, 'S36', /never said|engine verbs 2/], ['r5: the cache-file consult back (a carried count / bucket settled the attempt)', engFileConsult, 'S39', /engine block null/], ['r5: no lateness gate on the codex feed (a 3-h-old reading settled it)', engNoGate, 'S41', /engine block null/],
        ['r6: no systematic-offset rule (a skewed clock\'s every reading refused — the attempt never settles)', engNoSkew, 'S56', /engine block unsettled/], ['r6: the untold notice gated on a person\'s press (the auto rung\'s untold journal-only)', engUntoldGate, 'S59', /never said/], ['r7: the first minute\'s held facts never replayed (the first wall of a skewed stream dropped for good — no arm until the next wall)', engNoHold, 'S60', /engine arms 0/],
        ['r8 T0: the seam back to false (a helper press with no unsettled prior consumes on the CACHED count — the r3 LOW)', engNoRBP, 'S46', /engine extra/], ['r8 T0: the engine answers go whatever the read said (a moved window consumed on the session path)', engGoAlways, 'S62', /engine ledger 1≠0/], ['r8 T0: …and a read counting zero credits consumed too', engGoAlways, 'S64', /engine ledger 1≠0/]]) {
        const rr = await runScenarios(depsFor(engine), { only: [id] });
        ok(`r4 T1 + r5 CONTROL (${what}): ${id} goes RED by name`, rr.length === 1 && !(rr[0].agree.engine) && re.test(rr[0].why.join('; ')), rr[0] && rr[0].why.join('; '));
      }
    }
    // CONTROLS — the pre-verify rules, as patched copies
    const esrc = read('src/server/usage-pool-engine.js');
    const fromAck = "  if (!t.reportsSent) return onResetCreditUnknown(t); // silence from a carrier that cannot say is not \"not sent\" (verify r1)\n";
    ok('unknown CONTROL: the ack patch hits the product source', esrc.includes(fromAck));
    const preAck = require(MUTRC.write('src/server/usage-pool-engine.js', esrc.replace(fromAck, ''), 'notsent'));
    const wc = worldAuto(preAck);
    wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wc.nowS + 2 * 86400 }));
    await new Promise((r) => setTimeout(r, 300));
    const tc = wc.eng._resetCreditTries.get(wc.A);
    wc.quietly(() => wc.eng.recordCodexQuotaSignal(wc.s1, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: wc.nowS + 2 * 86400 + 1 }));
    ok('unknown CONTROL: with silence settled "not-sent" the old wrapper\'s consume is called unspent and the next event mints a SECOND key — the U1 legs see the rule', tc && tc.outcome === 'not-sent' && wc.verbs() === 2, JSON.stringify([tc && tc.outcome, wc.verbs()]));
    const fromRF = "  const readFirst = (t.prior || readBeforePress()) ? async (rl) => {"; // verify r5: the pinned read-first seam
    ok('unknown CONTROL: the read-first patch hits the product source', esrc.includes(fromRF));
    const preRF = require(MUTRC.write('src/server/usage-pool-engine.js', esrc.replace(fromRF, "  const readFirst = null; const _unusedReadFirst = (t.prior || readBeforePress()) ? async (rl) => {"), 'noreadfirst'));
    { const rpc = stubEnv('unk-ctl'); const w = world({ session: false, helper, engine: preRF });
      w.quietly(() => w.call('POST', w.A));
      await until(() => !!(w.eng._resetCreditTries.get(w.A) || {}).outcome, 6000);
      const t1 = w.eng._resetCreditTries.get(w.A); past(t1); t1.outcome = 'unanswered'; t1.settled = null; t1.creditsAt = 2;
      fs.writeFileSync(process.env.STUB_LOG, '');
      const n0 = w.notices.length; w.quietly(() => w.call('POST', w.A)); await until(() => w.notices.length > n0, 8000);
      ok('unknown CONTROL: without the read before the consume the helper spends a SECOND credit over a request that had landed — the U3 legs see the rule', rpc().filter((x) => x.method === 'account/rateLimitResetCredit/consume').length === 1, JSON.stringify(rpc().map((x) => x.method)));
    }
    // U4 THE SERVER RESTARTS with an attempt open (verify r1, reproduced: the floor died with the process)
    { const w = world();
      w.quietly(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
      const t = w.eng._resetCreditTries.get(w.A);
      ok('restart: the press went out; the attempt is on disk (data/reset-credit-tries.json), atomic', t && t.sentAt > 0 && fs.existsSync(path.join(w.root, 'data', 'reset-credit-tries.json')) && !fs.existsSync(path.join(w.root, 'data', 'reset-credit-tries.json.tmp')) && JSON.parse(fs.readFileSync(path.join(w.root, 'data', 'reset-credit-tries.json'), 'utf8')).tries.some((x) => x.idempotencyKey === t.idempotencyKey && x.sentAt === t.sentAt));
      const w2 = world({ root: w.root, credits: null }); // no reading yet after the restart (one would settle it — that is the rule)
      const t2 = w2.eng._resetCreditTries.get(w2.A);
      const p2 = w2.call('GET', w2.A).body;
      const r2 = w2.quietly(() => w2.call('POST', w2.A, { body: { sessionId: 'cx1' } }));
      ok('restart: a NEW engine over the same data/ restores it as UNKNOWN (it may have gone out) — the floor still stands: 429 cooldown, no second verb', t2 && t2.outcome === 'unknown' && t2.idempotencyKey === t.idempotencyKey && p2.code === 'cooldown' && r2.code === 429 && w2.verbs() === 0, JSON.stringify([t2 && t2.outcome, p2.code, r2.code, w2.verbs()]));
      past(t2); t2.outcome = 'unknown';
      ok('restart: …and past the floor it is unsettled (a press reads first), never free by the restart', w2.call('GET', w2.A).body.unsettled && !w2.call('GET', w2.A).body.code, JSON.stringify(w2.call('GET', w2.A).body));
      // verify r2 (3, reproduced — D6 never under-count): an attempt OPEN at the stop (written, its send not yet reported:
      // the hold taken, nothing charged) came back `unknown` and was never charged — the ledger said nothing was spent
      { const wo = world({ keyed: true, sends: false, ackMs: 60000 }); // a keyed wrapper that has not said "sent" yet
        wo.quietly(() => wo.call('POST', wo.A, { body: { sessionId: 'cx1' } }));
        const to = wo.eng._resetCreditTries.get(wo.A);
        ok('restart/open: before the stop the attempt is open — a hold, no charge', to && !to.outcome && !to.charged && wo.holdsOpen() === 1 && wo.charged() === 0, JSON.stringify([to && to.outcome, to && to.charged, wo.holdsOpen(), wo.charged()]));
        const wo2 = world({ root: wo.root, credits: null });
        const to2 = wo2.eng._resetCreditTries.get(wo2.A);
        ok('restart/open: the new engine revives it UNKNOWN and CHARGES it (the hold died with the process; the identity rides the record): ledger 1, the record says charged', to2 && to2.outcome === 'unknown' && to2.charged === true && wo2.charged() === 1 && JSON.parse(fs.readFileSync(path.join(wo.root, 'data', 'reset-credit-tries.json'), 'utf8')).tries.some((x) => x.idempotencyKey === to.idempotencyKey && x.charged === true), JSON.stringify([to2 && to2.outcome, to2 && to2.charged, wo2.charged()]));
        // the spend guard flushes its ledger 500 ms after a charge (spend-guard.js persist): wait for the file before the next boot
        await until(() => { try { return /codex-reset-credit/.test(fs.readFileSync(path.join(wo.root, 'data', 'spend-budget.json'), 'utf8')); } catch { return false; } }, 4000);
        const wo3 = world({ root: wo.root, credits: null });
        ok('restart/open: a THIRD engine over the same data/ charges nothing more (the file says charged)', wo3.charged() === 1 && (wo3.eng._resetCreditTries.get(wo3.A) || {}).charged === true, `ledger=${wo3.charged()}`);
        const esrcO = read('src/server/usage-pool-engine.js');
        const fromO = "      if (!t.charged) {\n        t.charged = true; charged++;";
        ok('restart/open CONTROL: the patch hits the product source', esrcO.includes(fromO));
        const preO = require(MUTRC.write('src/server/usage-pool-engine.js', esrcO.replace(fromO, "      if (false) {\n        t.charged = true; charged++;"), 'nochargeboot'));
        const wc = world({ keyed: true, sends: false, ackMs: 60000 });
        wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
        const wc2 = world({ root: wc.root, credits: null, engine: preO });
        ok('restart/open CONTROL: an engine that revives without charging shows the ledger EMPTY after the restart — the legs above see the rule', (wc2.eng._resetCreditTries.get(wc2.A) || {}).outcome === 'unknown' && wc2.charged() === 0, `ledger=${wc2.charged()}`);
      }
      // verify r2 (4, reproduced): a TORN / unreadable attempts file at boot was silently ignored — no line, the bytes
      // left to be overwritten, the next press minting a key as if nothing had gone out. Set aside with its bytes,
      // said in the journal, ONE For-you item (filed lazily: the inbox is created after the engine in server.js)
      { const wt = world();
        wt.quietly(() => wt.call('POST', wt.A, { body: { sessionId: 'cx1' } }));
        const f = path.join(wt.root, 'data', 'reset-credit-tries.json');
        const torn = '{"v":1,"tries":[{"key":"' + wt.A + '","at":' + (Date.now() - 1000);
        fs.writeFileSync(f, torn);
        const warned = []; const added = [];
        const ow = console.warn; console.warn = (...a) => warned.push(a.join(' '));
        let wt2; try { wt2 = world({ root: wt.root, credits: null, todos: { add: (k, it) => { added.push(it); return { id: 'ut-torn' }; } } }); } finally { console.warn = ow; }
        const aside = fs.readdirSync(path.join(wt.root, 'data')).filter((x) => /^reset-credit-tries\.json\.corrupt-/.test(x));
        ok('torn file: set aside with its bytes (.corrupt-<ts>), named in the journal, the live file gone', aside.length === 1 && fs.readFileSync(path.join(wt.root, 'data', aside[0]), 'utf8') === torn && !fs.existsSync(f) && warned.some((w) => /reset-credit-tries\.json is unreadable \(not JSON/.test(w) && /UNKNOWN now/.test(w)), JSON.stringify([aside, warned]));
        ok('torn file: ONE For-you item (origin pool) tells the person to refresh a codex account before spending a credit', added.length === 1 && added[0].origin === 'pool' && /could not be read at start/.test(added[0].text) && /refresh the account/.test(added[0].text) && /set aside as reset-credit-tries\.json\.corrupt-/.test(added[0].detail), JSON.stringify(added));
        wt2.call('GET', wt2.A); wt2.call('GET', wt2.A);
        ok('torn file: …filed once (a later preview does not file it again)', added.length === 1, `added=${added.length}`);
        // the inbox created AFTER the engine (server.js): the item waits for the first preview
        const lateAdds = []; let inboxUp = false;
        fs.writeFileSync(f, torn);
        const wt3 = world({ root: wt.root, credits: null, todos: { add: (k, it) => { if (!inboxUp) throw new Error('TDZ'); lateAdds.push(it); return { id: 'ut-late' }; } } });
        ok('torn file (late inbox): nothing filed at boot while the inbox does not exist yet', lateAdds.length === 0);
        inboxUp = true; wt3.call('GET', wt3.A);
        ok('torn file (late inbox): …the first preview files it', lateAdds.length === 1, `late=${lateAdds.length}`);
        // CONTROL — the pre-r2 loader: silent, the file left in place, the next press free
        const esrcT = read('src/server/usage-pool-engine.js');
        const fromT = "  if (why) {\n    const asideAs = `${RESET_CREDIT_TRIES_FILE}.corrupt-";
        ok('torn file CONTROL: the patch hits the product source', esrcT.includes(fromT));
        const preT = require(MUTRC.write('src/server/usage-pool-engine.js', esrcT.replace(fromT, "  if (why) return 0;\n  if (false) {\n    const asideAs = `${RESET_CREDIT_TRIES_FILE}.corrupt-"), 'silenttorn'));
        const wc = world(); wc.quietly(() => wc.call('POST', wc.A, { body: { sessionId: 'cx1' } }));
        const fc = path.join(wc.root, 'data', 'reset-credit-tries.json'); fs.writeFileSync(fc, torn);
        const warnedC = []; const owc = console.warn; console.warn = (...a) => warnedC.push(a.join(' '));
        let wc2; try { wc2 = world({ root: wc.root, credits: null, engine: preT, todos: { add: () => { throw new Error('never'); } } }); } finally { console.warn = owc; }
        ok('torn file CONTROL: the pre-r2 loader says nothing, leaves the bytes in place and the next press is free — the legs above see the rule', warnedC.length === 0 && fs.existsSync(fc) && wc2.quietly(() => wc2.call('POST', wc2.A, { body: { sessionId: 'cx1' } })).code === 200, JSON.stringify(warnedC));
      }
      // a settled attempt older than a day is not carried; an unsettled one is
      const esrc2 = read('src/server/usage-pool-engine.js');
      const fromLoad = 'loadResetCreditTries();\n';
      ok('restart CONTROL: the patch hits the product source', esrc2.includes(fromLoad));
      const noLoad = require(MUTRC.write('src/server/usage-pool-engine.js', esrc2.replace(fromLoad, ''), 'noload'));
      const w3 = world({ root: w.root, credits: null, engine: noLoad });
      const r3 = w3.quietly(() => w3.call('POST', w3.A, { body: { sessionId: 'cx1' } }));
      ok('restart CONTROL: an engine that does not restore the attempts lets the next press mint a SECOND key after a restart — the legs above see the rule', r3.code === 200 && w3.verbs() === 1 && w3.keyOf(0) !== t.idempotencyKey, JSON.stringify([r3.code, w3.verbs()]));
    }
    for (const k of ['STUB_TABLE', 'STUB_LOG', 'STUB_MODE', 'STUB_READ_USED']) delete process.env[k];
  }
  const w0 = world({ session: false });
  const nl = w0.call('POST', w0.A);
  ok('no live chat session on the account ⇒ 409 no_live_session, nothing written', nl.code === 409 && nl.body.code === 'no_live_session', JSON.stringify(nl.body));
  const wz = world({ credits: 0 });
  const nc = wz.call('POST', wz.A);
  ok('a stored count of zero ⇒ 409 no_credits, nothing written', nc.code === 409 && nc.body.code === 'no_credits' && wz.verbs() === 0, JSON.stringify(nc.body));
  const wc = world({ hourCap: 0 });
  const sr = wc.quietly(() => wc.call('POST', wc.A));
  ok('the ceiling at 0/hour ⇒ 429 spend_refused, NO verb (fails closed on the manual path too)', sr.code === 429 && sr.body.code === 'spend_refused' && wc.verbs() === 0, JSON.stringify(sr.body));
  // NEGATIVE CONTROL: a patched engine whose manual path SKIPS the writer's authorizer is caught by the charge leg
  {
    const src = read('src/server/usage-pool-engine.js');
    const from = "  try { av = spendGuard.authorize({ reason: 'codex-reset-credit', session, sessionId: session._webuiId, sessionName: session.name || null, identity: key ? { key, name: nameOf(key) || key } : null }); }";
    ok('NEGATIVE CONTROL: the patch hits the product source', src.includes(from));
    const f = MUTRC.write('src/server/usage-pool-engine.js', src.replace(from, '  try { av = { ok: true }; }'), 'rcui');
    try {
      const patched = require(f);
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-ctl-')); roots.push(root);
      const sessions = new Map();
      const eng2 = patched.create({ app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: path.join(root, 'uc'), activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 0 })[k], getAccounts: () => new AccountManager({ dataDir: path.join(root, 'data') }), getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null, getUserTodos: () => null });
      const wrote = [];
      const s = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx9', _accountId: null, pty: { write: (x) => wrote.push(x) } };
      sessions.set('cx9', s);
      { const bd = path.join(root, 'data', 'session-buffers'); fs.mkdirSync(bd, { recursive: true }); fs.writeFileSync(path.join(bd, 'cx9.json'), JSON.stringify({ caps: { resetCreditKey: true } })); } // the current wrapper's advert (lane reset-path)
      const q = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
      const r = q(() => eng2.consumeResetCreditFor('__global_codex__', {}));
      ok('NEGATIVE CONTROL: without the authorizer the 0/hour ceiling no longer refuses — the spend_refused leg sees the gate', r.ok === true && wrote.length === 1, JSON.stringify(r));
    } finally { /* MUTRC's scratch dir is removed at exit */ }
  }
// ── verify r8 T2 ② ④ ⑥: THE HELD RING, ITS REPLAY AND THE LATE-WALL NOTICE on the REAL engine (reproduced in
//    r8-repro/r8-02, r8-04 before the fix): a held wall replayed over a NEWER reading of the account (another conversation's)
//    regressed the cache and armed auto-resume for a wall already answered; a wall pushed out of the 32-deep ring by the
//    readings that followed it was never replayed; a late wall that stops a conversation was said in no place the owner reads.
console.log('\n§4c the held ring, its replay and the late-wall notice (verify r8 T2 ② ④ ⑥)');
{
  const SKEW = 5 * 60e3;
  const todoStub = () => { const items = []; return { items, add: (k, it) => { const id = 'ut-' + (items.length + 1); items.push({ id, key: k, status: 'open', ...it }); return { id }; }, get: (id) => items.find((i) => i.id === id) || null, setStatus: (id, st, by) => { const it = items.find((i) => i.id === id); if (it) { it.status = st; it.by = by; } return it; } }; };
  const J = [];
  const feed = (w, s, payload, { arrivedAgo = 0, skew = SKEW, rec = true } = {}) => { const r = rec ? { timestamp: new Date(Date.now() - skew).toISOString(), type: 'event_msg', payload } : null; const c = s._recordClock; if (arrivedAgo && c && c.run) c.run.firstArrivedAt -= arrivedAgo; const o = console.log; console.log = (...a) => J.push(a.join(' ')); try { w.eng.recordCodexQuotaSignal(s, payload, r); } finally { console.log = o; } };
  const wall = (w) => ({ type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 7200 });
  const sib = (w) => { const s3 = { ...w.s1, _webuiId: 'cx3', backendSessionId: 'thread-3', name: 'cx-conv-3', _recordClock: null, _heldLate: null, _lateBurst: null, pty: { write() { } } }; w.sessions.set('cx3', s3); return s3; };
  const cacheOf = (w) => { const c = w.cacheOf(w.A); return { used: c.sevenDay && c.sevenDay.usedPercent, resetsAt: c.sevenDay && c.sevenDay.resetsAt, count: c.resetCredits && c.resetCredits.availableCount, at: c.fetchedAt }; };
  const busy = (ms) => { const t0 = Date.now(); while (Date.now() < t0 + ms) { } };
  const esrc8 = read('src/server/usage-pool-engine.js');
  const fromBelt = '    if (e.key && newestAt[e.key] > Number(e.at)) { superseded++; supKinds[e.what] = (supKinds[e.what] || 0) + 1; continue; }';
  const fromAsOf = "(at) => recordCodexQuotaSignal(session, payload, rec, { asOf: at })";
  const fromRing = '      let i = h.findIndex((x) => !HELD_WALL_KINDS.includes(x.what)); if (i < 0) i = 0;';
  const fromItem = '  if (HELD_WALL_KINDS.includes(what)) fileLateWallItem(session, b, what, v);\n';
  ok('§4c CONTROLS: the four patches hit the product source', esrc8.includes(fromBelt) && esrc8.includes(fromAsOf) && esrc8.includes(fromRing) && esrc8.includes(fromItem));
  const engNoBelt = require(MUTRC.write('src/server/usage-pool-engine.js', esrc8.replace(fromBelt, '    if (false) { continue; }'), 'r8-nobelt'));
  const engNoAsOf = require(MUTRC.write('src/server/usage-pool-engine.js', esrc8.replace(fromBelt, '    if (false) { continue; }').replace(fromAsOf, '(at) => recordCodexQuotaSignal(session, payload, rec)'), 'r8-noasof'));
  const engRingAny = require(MUTRC.write('src/server/usage-pool-engine.js', esrc8.replace(fromRing, '      let i = 0;'), 'r8-ringany'));
  const engNoItem = require(MUTRC.write('src/server/usage-pool-engine.js', esrc8.replace(fromItem, ''), 'r8-noitem'));
  // ② a held wall + reading, a NEWER reading of the account from another conversation, the declaration
  const leg2 = (engine) => { J.length = 0; const todos = todoStub(); const w = world({ todos, engine }); const s3 = sib(w);
    feed(w, w.s1, wall(w)); feed(w, w.s1, w.reading(3), { arrivedAgo: 1e3 });
    const held = (w.s1._heldLate || []).map((e) => e.what);
    busy(5); feed(w, s3, w.reading(2, { moved: true }), { rec: false }); const live = cacheOf(w);
    busy(5); feed(w, w.s1, w.reading(2, { moved: true }), { arrivedAgo: 61e3 });
    const after = cacheOf(w); w.killTimers();
    return { held, live, after, arms: w.arms.length, said: J.slice(), heldAfter: w.s1._heldLate, items: todos.items, skew: w.s1._recordClock && w.s1._recordClock.skewMs }; };
  { const r = leg2();
    ok('§4c ② the wall and the reading of the first minute are held; a newer LIVE reading of the account (another conversation: the window moved, 2 credits) lands meanwhile', r.held.join() === 'codex wall,codex reading' && r.live.used === 0 && r.live.count === 2, JSON.stringify([r.held, r.live]));
    ok('§4c ② at the declaration the held facts are NOT replayed — a newer reading of the account exists already (said by count and kind); the cache keeps the newer numbers; nothing armed; the ring emptied once', r.arms === 0 && r.after.used === 0 && r.after.resetsAt === r.live.resetsAt && r.after.count === 2 && r.heldAfter === null && r.skew === SKEW && r.said.some((l) => /2 held fact\(s\) not replayed — a newer reading of the account exists already \(1 codex wall, 1 codex reading\)/.test(l)), JSON.stringify([r.arms, r.after, r.said.filter((l) => /held fact/.test(l)).map((l) => l.slice(0, 160))]));
    ok('§4c ② the burst\'s late-wall item was filed at the wall and resolved when the offset was declared (the conversation is producing records)', r.items.length === 1 && r.items[0].origin === 'pool' && r.items[0].status === 'done' && r.items[0].by === 'offset-declared', JSON.stringify(r.items.map((i) => [i.origin, i.status, i.by])));
    const c1 = leg2(engNoBelt), c2 = leg2(engNoAsOf);
    ok('§4c ② CONTROL (the belt removed): the stale wall is replayed and ARMS auto-resume for a wall the newer reading had answered — the leg sees the rule (the cache survives on asOf alone)', c1.arms === 1 && c1.after.used === 0, JSON.stringify([c1.arms, c1.after]));
    ok('§4c ② CONTROL (the belt AND the fact\'s own instant removed — the r7 engine): the replay REGRESSES the cache to the held numbers (100 %, the old window, 3 credits) and arms — the incident shape', c2.arms === 1 && c2.after.used === 100 && c2.after.count === 3 && c2.after.resetsAt !== c2.live.resetsAt, JSON.stringify([c2.arms, c2.after])); }
  // ④ a wall followed by more readings than the ring holds
  const leg4 = (engine) => { J.length = 0; const todos = todoStub(); const w = world({ todos, engine });
    feed(w, w.s1, wall(w)); for (let i = 0; i < 34; i++) feed(w, w.s1, w.reading(3), { arrivedAgo: 1e3 });
    const held = (w.s1._heldLate || []).reduce((m, e) => { m[e.what] = (m[e.what] || 0) + 1; return m; }, {}), heldN = (w.s1._heldLate || []).length;
    feed(w, w.s1, w.reading(3), { arrivedAgo: 61e3 });
    const out = { held, heldN, arms: w.arms.length, said: J.slice(), items: todos.items }; w.killTimers(); return out; };
  { const r = leg4();
    ok('§4c ④ the ring keeps the WALL: 1 wall + 31 readings held of 35 facts (the oldest readings dropped first), the drop counted', r.heldN === 32 && r.held['codex wall'] === 1 && r.held['codex reading'] === 31, JSON.stringify([r.heldN, r.held]));
    ok('§4c ④ at the declaration the wall is replayed and taken: auto-resume armed once; the close says what was dropped from the ring', r.arms === 1 && r.said.some((l) => /3 dropped from the held ring of 32 \(3 codex reading\)/.test(l)), JSON.stringify([r.arms, r.said.filter((l) => /dropped|taken/.test(l)).map((l) => l.slice(0, 200))]));
    ok('§4c ④ …and the burst\'s late-wall item is resolved by the replay (wall-replayed)', r.items.length === 1 && r.items[0].status === 'done' && r.items[0].by === 'wall-replayed', JSON.stringify(r.items.map((i) => [i.status, i.by])));
    const c = leg4(engRingAny);
    ok('§4c ④ CONTROL (the ring drops the oldest whatever it is): the wall is pushed out by the readings — no arm at the declaration — the leg sees the rule', c.arms === 0 && !c.held['codex wall'], JSON.stringify([c.arms, c.held])); }
  // ⑥ a late wall with nothing after it (a backlog shape — no declaration, no live record): the owner is told once
  { J.length = 0; const todos = todoStub(); const w = world({ todos });
    feed(w, w.s1, wall(w), { skew: 3 * 3600e3 });
    const one = todos.items.slice();
    feed(w, w.s1, wall(w), { skew: 3 * 3600e3 - 1000 });
    ok('§4c ⑥ a late WALL (3 h, a backlog shape) files ONE For-you item (origin pool) naming the conversation and the lateness, in its i18n shape; a second late wall of the same burst files no second', one.length === 1 && one[0].origin === 'pool' && /A usage limit was hit on cx-conv while its records were arriving 3h00m late/.test(one[0].text) && one[0].i18n && one[0].i18n.text && /auto-resume will not continue it/.test(one[0].i18n.text.key) && Number(one[0].expiresAt) > Date.now() && todos.items.length === 1 && w.arms.length === 0, JSON.stringify(todos.items.map((i) => [i.origin, i.text.slice(0, 90), i.status])));
    { const { replyVerdict } = require(path.join(REPO, 'src/inbox-reply.js')); const live = { live: true, mode: 'chat', remoteState: null };
      ok('§4c ⑥ (verify r9 ⑩, reproduced): the item is filed under the CONVERSATION\'s own key (`codex:<thread>`, the auto rung\'s spelling — the key the reply route and the client\'s jump resolve): Reply is admitted on the live chat; the pre-fix key `webui:late-wall:<id>` matched no session (Reply refused no_live_session on a live conversation)', one[0].key === 'codex:thread-1' && replyVerdict({ item: { sessionKey: one[0].key }, session: live }).ok === true && replyVerdict({ item: { sessionKey: 'webui:late-wall:cx1' }, session: null }).code === 'no_live_session', JSON.stringify([one[0].key, replyVerdict({ item: { sessionKey: one[0].key }, session: live })])); }
    ok('§4c ⑥ the journal is English-only by design (an operator\'s log: the [stream] lines carry no i18n), the item carries the words', J.some((l) => /^\[stream\] cx1: records arriving 3h00m late/.test(l)) && !/i18n/.test(esrc8.slice(esrc8.indexOf('function noteLateFact('), esrc8.indexOf('function noteLateFact(') + 1200).replace(/fileLateWallItem[^\n]*/g, '')));
    feed(w, w.s1, w.reading(3), { skew: 0 });
    ok('§4c ⑥ a LIVE record ends the burst: the conversation is alive, the item resolves itself (stream-alive); the held list is cleared with the run (per run, never a global ring)', todos.items[0].status === 'done' && todos.items[0].by === 'stream-alive' && w.s1._heldLate === null && w.s1._lateBurst === null, JSON.stringify([todos.items[0].status, todos.items[0].by]));
    w.killTimers();
    const tn = todoStub(); const wn = world({ todos: tn, engine: engNoItem }); feed(wn, wn.s1, wall(wn), { skew: 3 * 3600e3 });
    ok('§4c ⑥ CONTROL (the item removed): a late wall says nothing the owner reads — the leg sees the rule', tn.items.length === 0); wn.killTimers(); }
  // replayed at most once: a burst record still late by the offset is counted at the declaration, never re-held
  { J.length = 0; const w = world({ todos: todoStub() });
    feed(w, w.s1, w.reading(3), { skew: 3 * 3600e3 }); // a 3-h-old burst record (held: the ring is undeclared)
    feed(w, w.s1, wall(w)); feed(w, w.s1, w.reading(3), { arrivedAgo: 30e3 }); feed(w, w.s1, w.reading(3), { arrivedAgo: 61e3 });
    ok('§4c replayed at most once: the 3-h-old record held before the skewed run is re-judged at the declaration (still late by the offset — counted, not taken), the ring is null after, the burst closed with it named', w.s1._heldLate === null && J.some((l) => /held from the offset stream's first minute re-judged live by the offset and taken \(1 codex wall, 1 codex reading\)/.test(l)) && J.some((l) => /first minute over — 1 fact\(s\) not replayed \(1 codex reading/.test(l)), JSON.stringify(J.filter((l) => /\[stream\]/.test(l)).map((l) => l.slice(0, 170))));
    w.killTimers(); }
  // ⑦ (verify r9): "the newest reading of the account" is judged by ARRIVAL on both sides — the held entry's `at` and the cache's
  // `fetchedAt` (a reading written at its arrival; a replay at the fact's own arrival) — never by a raw stamp (a held stream's stamps
  // are the whole skew behind: the raw stamp would call the wall 5 min OLDER than the reading). The bound: a reading EMITTED before
  // the wall but delivered inside LATE_MS is live by the rule and supersedes it — bounded by LATE_MS, self-correcting at the next turn
  { ok('§4c ⑦ the comparator is arrival vs arrival (code pin): the hold stamps Date.now(), the belt compares the cache\'s fetchedAt to it, a replay runs at the fact\'s own instant, and no stamp enters the comparison', /h\.push\(\{ what, lateMs: Number\(v\.lateMs\) \|\| 0, at: Date\.now\(\), key, replay \}\)/.test(esrc8) && /if \(e\.key && newestAt\[e\.key\] > Number\(e\.at\)\)/.test(esrc8) && /const now = Number\(asOf\) > 0 \? Number\(asOf\) : Date\.now\(\);/.test(esrc8) && !/newestAt\[[^\]]+\] > [^\n]*stampOf/.test(esrc8));
    J.length = 0; const w = world({ todos: todoStub() }); const s3 = sib(w);
    feed(w, w.s1, wall(w)); busy(20);
    feed(w, s3, w.reading(2, { moved: true }), { skew: 110e3 }); // cx3 (in step) read A 110 s ago — delivered now: live by the rule (< LATE_MS), its arrival after the wall's
    feed(w, w.s1, w.reading(3), { arrivedAgo: 1e3 }); feed(w, w.s1, w.reading(3), { arrivedAgo: 61e3 });
    ok('§4c ⑦ the documented bound: a reading of the account emitted 110 s BEFORE the held wall but delivered inside LATE_MS (live by the rule) is the account\'s newest by arrival — the wall is not replayed (said), nothing armed', w.arms.length === 0 && J.some((l) => /held fact\(s\) not replayed — a newer reading of the account exists already \(1 codex wall/.test(l)), JSON.stringify(J.filter((l) => /held fact/.test(l)).map((l) => l.slice(0, 120))));
    w.killTimers(); }
  // ⑧ (verify r9): a burst of 40 WALLS (a flapping limit) inside the first minute — the ring keeps the 32 NEWEST walls (the oldest
  // dropped first, never the newest), every drop said by kind; the declaration replays all 32
  { J.length = 0; const todos = todoStub(); const w = world({ todos }); const arrivals = [];
    for (let i = 0; i < 40; i++) { busy(2); arrivals.push(Date.now()); feed(w, w.s1, wall(w), { arrivedAgo: i ? 1e3 : 0 }); }
    const h = (w.s1._heldLate || []);
    ok('§4c ⑧ 40 walls ⇒ the ring holds 32, all walls, the 8 OLDEST dropped (the first kept entry arrived with the 9th wall, the last kept with the 40th), the drops counted by kind', h.length === 32 && h.every((e) => e.what === 'codex wall') && h[0].at >= arrivals[8] && h[0].at < arrivals[9] && h[31].at >= arrivals[39] && w.s1._lateBurst.dropped === 8 && w.s1._lateBurst.droppedKinds['codex wall'] === 8, JSON.stringify([h.length, h[0] && h[0].at - arrivals[8], w.s1._lateBurst.dropped]));
    feed(w, w.s1, wall(w), { arrivedAgo: 61e3 });
    ok('§4c ⑧ at the declaration every kept wall is replayed and taken (32), the close names the 8 dropped walls', J.some((l) => /32 fact\(s\) held from the offset stream's first minute re-judged live by the offset and taken \(32 codex wall\)/.test(l)) && J.some((l) => /8 dropped from the held ring of 32 \(8 codex wall\)/.test(l)) && w.arms.length >= 32, JSON.stringify([w.arms.length, J.filter((l) => /dropped|taken/.test(l)).map((l) => l.slice(0, 140))]));
    w.killTimers(); }
}

// ── verify r9 T1: A PRESS THAT STRADDLES A RESTART (② reproduced on the real engine: it ended `unknown` on a 10-min cooldown,
//    charged, the wrapper's own "nothing sent" ignored, the person told nothing), the two clocks (①), two conversations on one
//    account (④) — the REAL engine over a world that can HOLD the wrapper's read-first push and boot a second engine over the
//    same root; the money legs have patched-copy controls
console.log('\n§4d a press that straddles a restart, the two clocks, two conversations on one account (verify r9 T1 ① ② ④)');
{
  const esrc9 = read('src/server/usage-pool-engine.js');
  const fromReopen = "      if (payload.beforeReset === true && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) { try { reopenRevivedReadFirst(session, payload.idempotencyKey); } catch (e) { console.warn('[reset-credit] the revived attempt could not be re-opened:', e.message); } }\n";
  const fromAccept = "    if (tryRec && ans.sent === false && revivedReadFirstWaiting(tryRec)) {";
  const fromRestamp = "  t.pressedAt = t.pressedAt || t.at; t.at = now; t.reopenedAt = now;\n";
  ok('§4d CONTROLS: the three patches hit the product source', esrc9.includes(fromReopen) && esrc9.includes(fromAccept) && esrc9.includes(fromRestamp));
  const engNoReopen = require(MUTRC.write('src/server/usage-pool-engine.js', esrc9.replace(fromReopen, ''), 'r9-noreopen'));
  const engNoAccept = require(MUTRC.write('src/server/usage-pool-engine.js', esrc9.replace(fromAccept, '    if (false) {'), 'r9-noaccept'));
  const engNoRestamp = require(MUTRC.write('src/server/usage-pool-engine.js', esrc9.replace(fromRestamp, '  t.reopenedAt = now;\n'), 'r9-norestamp'));
  const J = []; const jl = (fn) => { const o = console.log; console.log = (...a) => J.push(a.join(' ')); try { return fn(); } finally { console.log = o; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rec = (t) => t && ({ phase: RC.phaseOf(t), outcome: t.outcome, sent: !!t.sentAt, charged: !!t.charged, readFirst: t.readFirst === true, revived: !!t.revivedAt, reopened: !!t.reopenedAt, settled: t.settled && t.settled.how });
  const bootW = async (w, engine) => { w.killTimers(); await sleep(600); return world({ engine, root: w.root, credits: null, acct: w.A, ...w.opts }); };
  const press = (w) => { const pv = w.call('GET', w.A).body; return jl(() => w.call('POST', w.A, { body: { sessionId: 'cx1', expect: { resetsAtSec: pv.resetsAtSec } } })); };
  // ② the restart BEFORE the wrapper's push: the boot revives the record unknown + charged (S10); then the push reaches the new engine
  const legPush = async (engine, { slow = false, sends = true } = {}) => { J.length = 0; const w = world({ engine }); w.s1.stubHold = true; press(w); const key = w.keyOf(0); const held = w.held().splice(0);
    const w2 = await bootW(w, engine); const revived = rec(w2.tries()); const L1 = w2.charged();
    if (slow) { w2.tries().at -= 3 * 60e3; w2.tries().sentAt -= 3 * 60e3; } // the restart took 3 min (the press is older than the ack window)
    w2.s1.stubSends = sends;
    jl(() => { for (const e of held) e.deliver(w2.eng, w2.s1); });
    const afterPush = rec(w2.tries()), block = RC.attemptBlock(w2.tries(), { now: Date.now() }), goes = w2.goes.slice();
    const second = jl(() => w2.call('POST', w2.A, { body: { sessionId: 'cx1' } })); // a second press while the go flies / after the send
    return { key, revived, L1, afterPush, block, goes, second: { code: second.code, c: second.body && second.body.code }, verbs: w2.verbs(), w: w2, said: J.slice() }; };
  { const r = await legPush(engMod);
    ok('§4d ② the boot revives the open read-first press unknown + charged (it MAY have gone out — a failed read consumes at once), marked revived', r.revived.outcome === 'unknown' && r.revived.charged && r.revived.readFirst && r.revived.revived && r.L1 === 1, JSON.stringify(r.revived));
    ok('§4d ② the wrapper\'s push for that key at the NEW engine proves nothing went out: the record is RE-OPENED (said), judged by the one table, go:true written, the consume sent — ONE consume, charged once (the restart\'s charge stands, nothing twice)', r.afterPush.reopened && r.afterPush.sent && r.afterPush.outcome === null && r.goes.length === 1 && r.goes[0].go === true && r.goes[0].idempotencyKey === r.key && r.w.charged() === 1 && r.said.some((l) => /re-opened and judged now; the restart's charge on the ledger stays/.test(l)), JSON.stringify([r.afterPush, r.goes, r.w.charged()]));
    jl(() => r.w.eng.recordCodexQuotaSignal(r.w.s1, { type: 'reset_credit_result', result: { outcome: 'reset' }, outcome: 'reset', idempotencyKey: r.key, attempts: 1 }));
    ok('§4d ② …a second press after the send is on the floor (cooldown), and the wrapper\'s reset lands on the re-opened record', r.second.c === 'cooldown' && r.w.tries().outcome === 'reset' && r.w.notices.some((n) => /reset credit consumed/.test(n)), JSON.stringify([r.second, r.w.tries().outcome]));
    r.w.killTimers(); }
  { const c = await legPush(engNoReopen);
    ok('§4d ② CONTROL (the re-open removed — the r8 engine): the push at the new engine is "sent already — no verdict written": no go, the wrapper waits its 25 s for nothing — the leg sees the rule', c.goes.length === 0 && c.afterPush.outcome === 'unknown' && c.said.some((l) => /sent already/.test(l)), JSON.stringify([c.goes, c.afterPush])); c.w.killTimers(); }
  { const r = await legPush(engMod, { slow: true, sends: false });
    ok('§4d ② a restart longer than the ack window: the re-opened press is stamped NOW — a second press while the go flies is refused in_flight on the dialog (never a second verb over a consume about to go out)', r.block.code === 'in_flight' && r.second.code === 409 && r.second.c === 'in_flight' && r.verbs === 0 && r.goes.length === 1, JSON.stringify([r.block.code, r.second, r.verbs])); r.w.killTimers();
    const c = await legPush(engNoRestamp, { slow: true, sends: false });
    ok('§4d ② CONTROL (the re-stamp removed): the second press is ADMITTED — a second verb, a second key, while the first consume is about to go out (the money leg sees the rule)', c.second.code === 200 && c.verbs === 1, JSON.stringify([c.second, c.verbs])); c.w.killTimers(); }
  // ② the restart, then NO push reaches the new engine (the wrapper gave up / the bridge lost it): the wrapper's own `skipped` beats the boot's guess
  const legSkip = async (engine) => { J.length = 0; const w = world({ engine }); w.s1.stubHold = true; press(w); const key = w.keyOf(0); const w2 = await bootW(w, engine);
    jl(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_result', skipped: true, why: 'no-verdict', idempotencyKey: key, attempts: 0, sent: false, error: 'no verdict on the read before the consume within 25000ms — nothing sent' }));
    const out = { rec: rec(w2.tries()), block: RC.attemptBlock(w2.tries(), { now: Date.now() }), notices: w2.notices.slice(), charged: w2.charged(), said: J.slice(), pv: w2.call('GET', w2.A).body }; w2.killTimers(); return out; };
  { const r = await legSkip(engMod);
    ok('§4d ② the wrapper\'s keyed `skipped` (sent:false) for the revived press settles it SKIPPED: no floor (the dialog is free), the person told (the no-verdict words), the restart\'s charge said to stand', r.rec.outcome === 'skipped' && !r.rec.sent && r.block.code === null && !r.pv.code && r.notices.some((n) => /got no verdict in time; nothing was spent/.test(n)) && r.said.some((l) => /its word stands over the boot's guess; the restart's charge on the ledger stays/.test(l)) && r.charged === 1, JSON.stringify([r.rec, r.block.code, r.pv.code, r.notices]));
    const c = await legSkip(engNoAccept);
    ok('§4d ② CONTROL (the acceptance removed — the r8 engine, the incident shape): the press ends unknown on a 10-min cooldown, the person told NOTHING', c.rec.outcome === 'unknown' && c.block.code === 'cooldown' && c.notices.length === 0, JSON.stringify([c.rec.outcome, c.block.code, c.notices])); }
  // ① the two clocks: the wrapper gave up (no-verdict) before its push reached the engine (a stalled bridge) — the late push writes no go, re-opens nothing, charges nothing
  { J.length = 0; const w = world(); w.s1.stubHold = true; press(w); const key = w.keyOf(0); const L0 = w.charged();
    jl(() => w.eng.recordCodexQuotaSignal(w.s1, { type: 'reset_credit_result', skipped: true, why: 'no-verdict', idempotencyKey: key, attempts: 0, sent: false }));
    w.s1.stubIgnoreGo = true; jl(() => { for (const e of w.held().splice(0)) e.deliver(); });
    ok('§4d ① the engine side of the two clocks: a push arriving AFTER the wrapper\'s no-verdict writes no go, the attempt stays skipped, nothing charged (the wrapper side: §4b ④ drops a late go)', w.goes.length === 0 && w.tries().outcome === 'skipped' && w.charged() === L0 && w.notices.length === 1, JSON.stringify([w.goes, w.tries().outcome, w.notices.length])); w.killTimers(); }
  // ④ two conversations on ONE account, two presses while the first reads: in_flight on the preview AND the POST; free after the first's skip; on the floor after its consume
  { J.length = 0; const w = world(); const s3 = w.addSession('cx3', w.A); w.s1.stubHold = true; s3.stubHold = true;
    const r1 = press(w); const pv3 = w.call('GET', w.A, { query: { sessionId: 'cx3' } }).body; const r3 = jl(() => w.call('POST', w.A, { body: { sessionId: 'cx3', expect: { resetsAtSec: pv3.resetsAtSec } } }));
    ok('§4d ④ press 2 (another conversation on the account) while press 1 reads: the preview says in_flight, the POST refuses 409 in_flight, no second verb on either carrier', r1.code === 200 && pv3.code === 'in_flight' && r3.code === 409 && r3.body.code === 'in_flight' && w.verbs() === 1 && s3.wrote.filter((x) => /"codex-reset-credit"/.test(x)).length === 0, JSON.stringify([pv3.code, r3.body && r3.body.code]));
    const key1 = w.keyOf(0); jl(() => w.eng.recordCodexQuotaSignal(w.s1, { ...w.reading(3, { moved: true }), beforeReset: true, idempotencyKey: key1 })); // press 1's read: the window moved ⇒ skipped
    const pvB = w.call('GET', w.A, { query: { sessionId: 'cx3' } }).body; const r3b = jl(() => w.call('POST', w.A, { body: { sessionId: 'cx3', expect: { resetsAtSec: pvB.resetsAtSec } } }));
    s3.stubHold = false; jl(() => { for (const e of (s3.held || []).splice(0)) e.deliver(); });
    const r1b = jl(() => w.call('POST', w.A, { body: { sessionId: 'cx1' } }));
    ok('§4d ④ after press 1\'s skip (window-moved) press 2 is free — its own verb, its own read-first, its consume (go ⇒ sent); a third press (the first conversation) is then on the floor', w.goes.some((g) => g.idempotencyKey === key1 && g.go === false) && r3b.code === 200 && !pvB.code && w.tries().sid === 'cx3' && !!w.tries().sentAt && r1b.code === 429 && r1b.body.code === 'cooldown', JSON.stringify([r3b.code, pvB.code, w.tries().sid, !!w.tries().sentAt, r1b.body && r1b.body.code]));
    w.killTimers(); }
}


// ── verify r10: r9's revived-press machinery attacked on the REAL engine (+ the REAL wrapper file on the stub app-server) ──
console.log('\n§4e the revived press — two pushes, a SENT press revived, the clocks, another conversation, the orphan, the items, the word a restart LOSES (verify r10 T1 ①–⑤ ⑦ + the buffer-file catch-up + the double charge)');
{
  const esrc10 = read('src/server/usage-pool-engine.js');
  const fromGuess = "function revivedReadFirstWaiting(t) { return !!(t && t.outcome === 'unknown' && t.revivedAt && t.sentGuessed === true && t.readFirst === true); }";
  const fromPersist = "  t.prior = resetCredit.supersede(t.prior, now, clockOpts(now));\n  if (!t.charged) {";
  const fromPersist2 = "  persistResetCreditTries();\n  if (t.outcome) return; // a late \"sent\" after the attempt ended: charged, nothing left to wait for";
  const fromCatchUp = "function catchUpResetCreditFromBuffer(session, id) {\n  if (!session || !id || session.host) return null;";
  ok('§4e CONTROLS: the three patches hit the product source', esrc10.includes(fromGuess) && esrc10.includes(fromPersist) && esrc10.includes(fromPersist2) && esrc10.includes(fromCatchUp));
  const engNoGuess = require(MUTRC.write('src/server/usage-pool-engine.js', esrc10.replace(fromGuess, "function revivedReadFirstWaiting(t) { return !!(t && t.outcome === 'unknown' && t.revivedAt && t.readFirst === true); }"), 'r10-noguess'));
  const engPersistFirst = require(MUTRC.write('src/server/usage-pool-engine.js', esrc10.replace(fromPersist, "  t.prior = resetCredit.supersede(t.prior, now, clockOpts(now));\n  persistResetCreditTries();\n  if (!t.charged) {").replace(fromPersist2, "  if (t.outcome) return; // a late \"sent\" after the attempt ended: charged, nothing left to wait for"), 'r10-persistfirst'));
  const engNoCatchUp = require(MUTRC.write('src/server/usage-pool-engine.js', esrc10.replace(fromCatchUp, "function catchUpResetCreditFromBuffer(session, id) {\n  return null;"), 'r10-nocatchup'));
  const J = []; const jl = (fn) => { const o = console.log; console.log = (...a) => J.push(a.join(' ')); try { return fn(); } finally { console.log = o; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(40); } return false; };
  const rec = (t) => t && ({ phase: RC.phaseOf(t), outcome: t.outcome, sent: !!t.sentAt, charged: !!t.charged, revived: !!t.revivedAt, reopened: !!t.reopenedAt, guessed: t.sentGuessed === true, settled: t.settled && t.settled.how });
  const block = (w) => RC.attemptBlock(w.tries(), { now: Date.now() });
  const bootW = async (w, engine, over = {}) => { w.killTimers(); await sleep(600); return world({ engine, root: w.root, credits: null, acct: w.A, ...w.opts, ...over }); };
  const press = (w, sid = 'cx1') => { const pv = w.call('GET', w.A, { query: { sessionId: sid } }).body; return jl(() => w.call('POST', w.A, { body: { sessionId: sid, expect: { resetsAtSec: pv.resetsAtSec } } })); };
  const age = (t, ms) => { for (const k of ['at', 'sentAt', 'outcomeAt', 'revivedAt']) if (t[k]) t[k] -= ms; };
  // ① TWO identical pushes for one revived press (a duplicated stream): before the send ⇒ two go:true for ONE key (the wrapper's one
  //    waiter drops the second by name — §4b ④); after the send ⇒ nothing; ONE consume, charged once
  { J.length = 0; const w = world(); w.s1.stubHold = true; press(w); const key = w.keyOf(0); const held = w.held().splice(0);
    const w2 = await bootW(w, engMod); w2.s1.stubSends = false;
    jl(() => { for (const e of held) { e.deliver(w2.eng, w2.s1); e.deliver(w2.eng, w2.s1); } });
    const goes1 = w2.goes.slice();
    jl(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_sent', idempotencyKey: key, attempt: 1 }));
    jl(() => { for (const e of held) e.deliver(w2.eng, w2.s1); });
    jl(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_result', result: { outcome: 'reset' }, outcome: 'reset', idempotencyKey: key, attempts: 1 }));
    ok('§4e ① the same keyed push twice before the send ⇒ two go:true for ONE key (the wrapper\'s single waiter takes one), a third push after the send writes no go ("sent already"); ONE consume, the restart\'s charge the only ledger line, the reset lands', goes1.length === 2 && goes1.every((g) => g.go === true && g.idempotencyKey === key) && w2.goes.length === 2 && w2.tries().outcome === 'reset' && w2.charged() === 1 && J.some((l) => /sent already/.test(l)), JSON.stringify([goes1.map((g) => g.go), w2.goes.length, w2.tries().outcome, w2.charged()]));
    w2.killTimers(); }
  // ② a press SENT before the restart (its consume went out, the answer lost): revived unknown with its send a FACT — a replayed copy
  //    of its ORIGINAL push re-opens NOTHING (no go, the floor holds, a second press refused), its late answer lands
  const legSent = async (engine) => { J.length = 0; const w = world({ engine, ackMs: 600 }); press(w); const key = w.keyOf(0); const pushed = w.lastBefore();
    const L1 = w.charged(); const onDisk = JSON.parse(fs.readFileSync(path.join(w.root, 'data', 'reset-credit-tries.json'), 'utf8')).tries[0];
    const w2 = await bootW(w, engine); const revived = rec(w2.tries()); const L2 = w2.charged();
    w2.s1.stubIgnoreGo = true; jl(() => w2.eng.recordCodexQuotaSignal(w2.s1, pushed));
    const afterPush = rec(w2.tries()), goes = w2.goes.slice(), b1 = block(w2);
    await sleep(900);
    const second = jl(() => w2.call('POST', w2.A, { body: { sessionId: 'cx1' } }));
    const out = { key, L1, L2, diskCharged: onDisk.charged, revived, afterPush, goes, b1, second: { code: second.code, c: second.body && second.body.code }, verbs: w2.verbs(), notices: w2.notices.slice(), w: w2, said: J.slice() };
    return out; };
  { const r = await legSent(engMod);
    ok('§4e ② a press SENT before the restart is revived unknown with its send a FACT (not guessed): the replayed ORIGINAL push re-opens nothing and writes no go; its reading settles the record NOT LANDED (the count is still 3); the floor holds — a second press is refused cooldown, no second verb', r.revived.outcome === 'unknown' && r.revived.sent && !r.revived.guessed && !r.afterPush.reopened && r.goes.length === 0 && r.afterPush.settled === 'not-landed' && r.b1.code === 'cooldown' && r.second.code === 429 && r.second.c === 'cooldown' && r.verbs === 0, JSON.stringify([r.revived, r.afterPush, r.goes, r.b1.code, r.second, r.verbs]));
    jl(() => r.w.eng.recordCodexQuotaSignal(r.w.s1, { type: 'reset_credit_result', result: { outcome: 'reset' }, outcome: 'reset', idempotencyKey: r.key, attempts: 1 }));
    ok('§4e ② …and the first consume\'s late `reset` lands on it (said), the ledger still one line', r.w.tries().outcome === 'reset' && r.w.notices.some((n) => /reset credit consumed/.test(n)) && r.w.charged() === 1, JSON.stringify([r.w.tries().outcome, r.w.charged(), r.w.notices]));
    ok('§4e THE DOUBLE CHARGE (reproduced, money): the record is on disk `charged:true` WITH its send, so the boot over a sent-and-unanswered press charges nothing — one ledger line before and after the restart', r.diskCharged === true && r.L1 === 1 && r.L2 === 1, JSON.stringify([r.diskCharged, r.L1, r.L2]));
    r.w.killTimers(); }
  { const c = await legSent(engNoGuess);
    ok('§4e ② CONTROL (the r9 predicate — `revivedAt` alone): the replayed push RE-OPENS the sent record (a go to nobody), the ack window ends it not-sent and a SECOND press is admitted — a second key over a consume that went out (the money leg sees the rule)', c.afterPush.reopened && c.goes.length === 1 && c.second.code === 200 && c.verbs === 1 && c.notices.some((n) => /never sent the request/.test(n)), JSON.stringify([c.afterPush, c.goes.length, c.second, c.verbs])); c.w.killTimers(); }
  { const c = await legSent(engPersistFirst);
    ok('§4e DOUBLE CHARGE CONTROL (the persist moved back before the charge — the pre-r10 order): the file says charged:false at the send and the boot charges the SAME consume again — two ledger lines (the leg sees the rule)', c.diskCharged === false && c.L1 === 1 && c.L2 === 2, JSON.stringify([c.diskCharged, c.L1, c.L2])); c.w.killTimers(); }
  // ③ the clocks after a re-open: a press 9 min old revived (1 min of guessed floor left) → the push re-opens it: in_flight (the ack window
  //    from NOW), then the send arms the floor from the SEND (10 min); the journal names the press's own instant (`pressedAt`, its one reader)
  { J.length = 0; const w = world(); w.s1.stubHold = true; press(w); const key = w.keyOf(0); const held = w.held().splice(0);
    const w2 = await bootW(w, engMod); age(w2.tries(), 9 * 60e3); const b0 = block(w2);
    w2.s1.stubSends = false; jl(() => { for (const e of held) e.deliver(w2.eng, w2.s1); }); const b1 = block(w2); const t1 = w2.tries();
    jl(() => w2.eng.recordCodexQuotaSignal(w2.s1, { type: 'reset_credit_sent', idempotencyKey: key, attempt: 1 })); const b2 = block(w2); const t2 = w2.tries(); const pv = w2.call('GET', w2.A).body;
    ok('§4e ③ revived 9 min old: cooldown with ~1 min left → re-opened: in_flight (≤ the ack window from now, `at` = now, `pressedAt` = the press 9 min ago) → sent: cooldown from the SEND (armedAt = sentAt, ~10 min on the dialog) — the floor follows the consume that went out, never the press', b0.code === 'cooldown' && b0.until - Date.now() < 70e3 && b1.code === 'in_flight' && Date.now() - t1.at < 5000 && Date.now() - t1.pressedAt > 8 * 60e3 && b2.code === 'cooldown' && b2.armedAt === t2.sentAt && b2.until - Date.now() > 9.5 * 60e3 && pv.code === 'cooldown' && Math.round(pv.cooldownUntilSec - Date.now() / 1000) > 9.5 * 60, JSON.stringify([b0.code, Math.round((b0.until - Date.now()) / 1000), b1.code, b2.code, Math.round((b2.until - Date.now()) / 60e3), pv.code]));
    ok('§4e ③ the re-open\'s journal line names the press\'s own instant (pressedAt is READ, not only persisted)', J.some((l) => /re-opened and judged now/.test(l) && /pressed 5\d\d s ago/.test(l)), JSON.stringify(J.filter((l) => /re-opened/.test(l)).map((l) => l.slice(0, 200))));
    w2.killTimers(); }
  // ④ whose push: cx1's key delivered through ANOTHER conversation (cx3) on the account re-opens nothing and gets no go (by sid at the
  //    re-open); its reading still settles the account's unsettled record like any reading; the key's own conversation re-opens it
  { J.length = 0; const w = world(); w.s1.stubHold = true; press(w); const held = w.held().splice(0);
    const w2 = await bootW(w, engMod); const s3 = w2.addSession('cx3', w2.A);
    jl(() => { for (const e of held) e.deliver(w2.eng, s3); }); const viaOther = rec(w2.tries()); const goes3 = s3.wrote.filter((x) => /"codex-reset-credit-go"/.test(x)).length;
    jl(() => { for (const e of held) e.deliver(w2.eng, w2.s1); });
    ok('§4e ④ a push carrying cx1\'s key through cx3 (same account): not re-opened (said: "came from another conversation"), no go to cx3 — its reading settles the unsettled record not-landed (any reading does); the same push through cx1 re-opens it and gets the go', !viaOther.reopened && viaOther.settled === 'not-landed' && goes3 === 0 && J.some((l) => /came from another conversation \(cx1\) — not re-opened/.test(l)) && rec(w2.tries()).reopened && w2.goes.length === 1 && w2.goes[0].go === true, JSON.stringify([viaOther, goes3, rec(w2.tries()), w2.goes.length]));
    w2.killTimers(); }
  // ⑤ the orphan: the conversation is never resumed after the restart — the record holds the floor (charged: it MAY have gone out), then is
  //    UNSETTLED; the HELPER's next press on the account is admitted over it, its read-first settles the orphan, the consume goes out
  { const SD = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-r10-')); roots.push(SD); const STUB10 = writeStub(SD); const log10 = path.join(SD, 'orphan.ndjson'); fs.writeFileSync(log10, '');
    const w = world(); w.s1.stubHold = true; press(w); const key = w.keyOf(0);
    Object.assign(process.env, { STUB_TABLE: path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json'), STUB_LOG: log10, STUB_MODE: 'answer', STUB_READ_COUNT: '3', STUB_READ_USED: '100' });
    const w2 = await bootW(w, engMod, { session: false, helper: { codexCmd: STUB10, extraArgs: [], wallMs: 6000 } });
    const pv1 = w2.call('GET', w2.A).body; age(w2.tries(), 11 * 60e3); const pv2 = w2.call('GET', w2.A).body;
    const r = await w2.post(w2.A, { expect: { resetsAtSec: pv2.resetsAtSec } });
    await until(() => w2.notices.length > 0, 9000); await sleep(300);
    const L = fs.readFileSync(log10, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).method);
    const orphan = (() => { for (let x = w2.tries(); x; x = x.prior) if (x.idempotencyKey === key) return x; return null; })();
    ok('§4e ⑤ never resumed: inside the floor the orphan refuses every press (cooldown, via the helper); past it the preview says unsettled + the helper reads first; the helper press is ADMITTED over it, its read-first settles the orphan NOT LANDED (the count is still 3), the consume goes out once; ledger = the boot\'s guess + the helper\'s consume', pv1.code === 'cooldown' && pv1.via === 'helper' && !pv2.code && pv2.via === 'helper' && !!pv2.unsettled && pv2.readsFirst === true && r.code === 200 && JSON.stringify(L) === JSON.stringify(['initialize', 'initialized', 'account/rateLimits/read', 'account/rateLimitResetCredit/consume', 'account/rateLimits/read']) && orphan && orphan.settled && orphan.settled.how === 'not-landed' && w2.tries().outcome === 'reset' && w2.charged() === 2, JSON.stringify([pv1.code, pv1.via, pv2.code, pv2.via, !!pv2.unsettled, r.code, L, orphan && orphan.settled, w2.tries().outcome, w2.charged()]));
    for (const k of ['STUB_TABLE', 'STUB_LOG', 'STUB_MODE', 'STUB_READ_COUNT', 'STUB_READ_USED']) delete process.env[k];
    w2.killTimers(); }
  // ⑦ the late-wall items keyed by the conversation, on the REAL For-you store: two conversations on one account ⇒ two items; one conversation,
  //    21 bursts ⇒ 20 self-resolved + 1 open, the resolved never re-notify; a re-burst with the same words re-opens ITS OWN item by id
  { const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const td = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-r10-todos-')); roots.push(td); const todos = new UserTodoManager({ dataDir: td });
    const w = world({ todos }); const s3 = w.addSession('cx3', w.A);
    const feed10 = (s, payload, lateMs) => { const r = { timestamp: new Date(Date.now() - lateMs).toISOString(), type: 'event_msg', payload }; jl(() => w.eng.recordCodexQuotaSignal(s, payload, r)); };
    const wall10 = () => ({ type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 7200 });
    const live10 = () => ({ type: 'rate_limits_updated', onDemand: true, rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: w.nowS + 7200 }, secondary: null } });
    const all = () => todos._state.items;
    feed10(w.s1, wall10(), 3 * 3600e3); feed10(s3, wall10(), 3 * 3600e3);
    const two = all().map((i) => [i.sessionKey, i.status]);
    feed10(w.s1, live10(), 0); feed10(s3, live10(), 0);
    for (let i = 0; i < 20; i++) { feed10(w.s1, wall10(), 3 * 3600e3 + (i + 1) * 60e3); feed10(w.s1, live10(), 0); }
    const before = all().filter((i) => i.sessionKey === `codex:${w.s1.backendSessionId}`).map((i) => [i.id, i.status, i.resolvedAt]);
    feed10(w.s1, wall10(), 3 * 3600e3 + 25 * 60e3);
    const mine = all().filter((i) => i.sessionKey === `codex:${w.s1.backendSessionId}`);
    const untouched = before.every(([id, st, at]) => { const x = mine.find((i) => i.id === id); return x && x.status === st && x.resolvedAt === at; });
    feed10(w.s1, live10(), 0);
    const n0 = all().length; const twin = all().find((i) => i.sessionKey === `codex:${w.s1.backendSessionId}` && /3h01m late/.test(i.text));
    feed10(w.s1, wall10(), 3 * 3600e3 + 1 * 60e3);
    ok('§4e ⑦ two conversations on one account ⇒ two items under their OWN keys; 21 bursts on one conversation ⇒ 21 resolved + 1 open and the resolved ones untouched by the next filing (never re-notified); the same lateness words re-open THEIR OWN earlier item by id — one open item, never a new one', JSON.stringify(two) === JSON.stringify([[`codex:${w.s1.backendSessionId}`, 'open'], [`codex:${s3.backendSessionId}`, 'open']]) && mine.length === 22 && mine.filter((i) => i.status === 'open').length === 1 && untouched && all().length === n0 && twin && all().find((i) => i.id === twin.id).status === 'open' && all().filter((i) => i.status === 'open').length === 1, JSON.stringify([two, mine.length, untouched, all().length, n0]));
    w.killTimers(); }
  // ⑧ THE WORD A RESTART LOSES (reproduced on the REAL wrapper file): the restart outlasts the wrapper's wait — its push and its `skipped`
  //    went to stdout with no server attached and into its own buffer FILE; the new engine reads them back at the attach
  { const { spawn } = await import('node:child_process');
    const { stopWrapper, withoutVendorKeys } = await import('./scratch.mjs');
    const SD = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-r10-wrap-')); roots.push(SD); const STUB10 = writeStub(SD);
    const runReal = async (w, tag, verb) => {
      const bd = path.join(w.root, 'data', 'session-buffers'); const d = path.join(SD, tag); fs.mkdirSync(d, { recursive: true }); const log = path.join(d, 'rpc.ndjson'); fs.writeFileSync(log, '');
      const wr = spawn(process.execPath, [path.join(REPO, 'data/bin/codex-chat-wrapper.js'), path.join(bd, 'cx1.buf'), path.join(bd, 'cx1.json'), process.execPath, STUB10], { stdio: ['pipe', 'pipe', 'pipe'], cwd: d, env: { ...withoutVendorKeys(process.env), HOME: d, CODEX_HOME: path.join(d, 'no-codex-home'), CODEX_WEBUI_CWD: d, VIBESPACE_API: '', VIBESPACE_SESSION_TOKEN: '', VIBESPACE_SKIP_AGENT_HOOKS: '1', STUB_TABLE: path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json'), STUB_LOG: log, STUB_MODE: 'answer', STUB_READ_COUNT: '3', STUB_READ_USED: '100', STUB_READ_RESETS_AT: process.env.STUB_READ_RESETS_AT || '', VIBESPACE_CODEX_RESET_GO_TIMEOUT_MS: '300' } });
      let out = ''; wr.stdout.on('data', (x) => { out += x; }); wr.stderr.on('data', () => { });
      const recs = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const rpc = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      await until(() => rpc().some((r) => r.method === 'thread/queue/list'), 8000);
      wr.stdin.write(JSON.stringify(verb) + '\n');
      await until(() => recs().some((r) => r.type === 'event_msg' && r.payload && r.payload.type === 'reset_credit_result'), 8000);
      await sleep(1400); // the wrapper's buffer-file debounce (1 s)
      const inFile = fs.readFileSync(path.join(bd, 'cx1.buf'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.type === 'event_msg' && r.payload && r.payload.idempotencyKey === verb.idempotencyKey).map((r) => r.payload.type + (r.payload.beforeReset ? ':beforeReset' : r.payload.afterReset ? ':afterReset' : '') + (r.payload.skipped ? ':skipped' : r.payload.outcome ? ':' + r.payload.outcome : ''));
      await stopWrapper(wr);
      return { inFile, consumes: rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume').length };
    };
    const legLost = async (engine, verbOf) => { J.length = 0; const w = world({ engine }); w.s1.stubHold = true; press(w); const key = w.keyOf(0);
      const file = await runReal(w, 'lost-' + Math.random().toString(36).slice(2, 7), verbOf(key));
      const w2 = await bootW(w, engine); const atBoot = { rec: rec(w2.tries()), block: block(w2).code, notices: w2.notices.length, L: w2.charged() };
      const fed = jl(() => w2.eng.catchUpResetCreditFromBuffer(w2.s1, 'cx1')); // what codex-events.js does at the attach (test-stdout-registry pins the call)
      const pv = w2.call('GET', w2.A).body;
      return { key, file, atBoot, fed, rec: rec(w2.tries()), block: block(w2).code, pv: pv.code || 'free', L: w2.charged(), notices: w2.notices.slice(), said: J.slice(), w: w2 }; };
    { const r = await legLost(engMod, (key) => ({ type: 'codex-reset-credit', idempotencyKey: key, readFirst: true }));
      ok('§4e ⑧ (A) the REAL wrapper, no server attached: its read-first push and its `skipped {no-verdict}` are in its buffer file, NO consume at the app-server; the boot revives the press unknown + charged on a cooldown, nothing said', JSON.stringify(r.file.inFile) === JSON.stringify(['rate_limits_updated:beforeReset', 'reset_credit_result:skipped']) && r.file.consumes === 0 && r.atBoot.rec.outcome === 'unknown' && r.atBoot.rec.guessed && r.atBoot.block === 'cooldown' && r.atBoot.notices === 0 && r.atBoot.L === 1, JSON.stringify([r.file, r.atBoot]));
      ok('§4e ⑧ (A) the catch-up at the attach reads the file back: the push (answered before the restart) is NOT re-fed, the `skipped` settles the press SKIPPED — the floor gone, the dialog free, the person told, the restart\'s charge the one ledger line (said to stand)', !!r.fed && JSON.stringify(r.fed.fed) === JSON.stringify(['reset_credit_result:skipped']) && r.fed.dropped.length === 1 && /answered before the restart/.test(r.fed.dropped[0]) && r.rec.outcome === 'skipped' && !r.rec.sent && r.block === null && r.pv === 'free' && r.L === 1 && r.notices.some((n) => /got no verdict in time; nothing was spent/.test(n)) && r.said.some((l) => /read back from its buffer file at the attach/.test(l)), JSON.stringify([r.fed, r.rec, r.block, r.pv, r.L, r.notices]));
      r.w.killTimers(); }
    { const r = await legLost(engMod, (key) => ({ type: 'codex-reset-credit', idempotencyKey: key }));
      ok('§4e ⑧ (B) a consume that went out and was ANSWERED during the downtime (sent, the post-reset read, `reset` — all in the file): the catch-up feeds the three at their own instants — the send is now a fact (the guess gone), the press LANDED, said; one ledger line', JSON.stringify(r.file.inFile) === JSON.stringify(['reset_credit_sent', 'rate_limits_updated:afterReset', 'reset_credit_result:reset']) && r.file.consumes === 1 && r.atBoot.rec.guessed && !!r.fed && r.fed.fed.length === 3 && r.rec.outcome === 'reset' && !r.rec.guessed && r.rec.sent && r.L === 1 && r.notices.some((n) => /reset credit consumed|did land/.test(n)), JSON.stringify([r.file, r.fed, r.rec, r.L, r.notices]));
      r.w.killTimers(); }
    { const c = await legLost(engNoCatchUp, (key) => ({ type: 'codex-reset-credit', idempotencyKey: key, readFirst: true }));
      ok('§4e ⑧ CONTROL (the catch-up removed — the r9 engine): the press stays unknown on a 10-min cooldown, the person told NOTHING — the incident shape for every restart longer than the wrapper\'s wait (the leg sees the rule)', c.fed === null && c.rec.outcome === 'unknown' && c.block === 'cooldown' && c.notices.length === 0, JSON.stringify([c.fed, c.rec.outcome, c.block, c.notices.length]));
      c.w.killTimers(); }
    ok('§4e ⑧ the catch-up is BOUNDED and keyed: nothing is read when no attempt of the session is open (null), a remote session is never read, and a reading older than LATE_MS is dropped by name (source pins)', /if \(!open\.size\) return null;/.test(esrc10) && /if \(!session \|\| !id \|\| session\.host\) return null;/.test(esrc10) && /const RESET_CATCHUP_TAIL_BYTES = 512 \* 1024;/.test(esrc10) && /Date\.now\(\) - at > recordLateness\.LATE_MS\)\) \{ dropped\.push/.test(esrc10) && /recordCodexQuotaSignal\(session, p, null, \{ asOf: at \}\)/.test(esrc10));
    { const w = world(); ok('§4e ⑧ a session with no open attempt costs no file read (null, no journal line)', jl(() => w.eng.catchUpResetCreditFromBuffer(w.s1, 'cx1')) === null && !J.some((l) => /buffer file/.test(l))); w.killTimers(); }
  }
}

  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  const eng = read('src/server/usage-pool-engine.js');
  ok('ONE writer: the auto rung and the manual use both call writeResetCredit with the CREDIT\'S identity (the verb is spelled once in the engine; verify r8 T0: only the manual use asks for the read first)', /const wr = writeResetCredit\(session, \{ resetsAtSec: R, lane, origin: 'auto', now, key \}\);/.test(eng) && /const wr = writeResetCredit\(session, \{ resetsAtSec: p\.resetsAtSec \|\| 0, lane: null, origin: 'user', now, key: p\.key, readFirst: !afterRead \}\);/.test(eng) && (eng.match(/type: 'codex-reset-credit', idempotencyKey: idemKey, \.\.\.\(rf \? \{ readFirst: true \} : \{\}\) \}\)/g) || []).length === 1 && (eng.match(/type: 'codex-reset-credit'[,'\s]/g) || []).length === 1);
  ok('the carrier is picked by CAPABILITY (capsOf(s.backend).resetCredit), never a backend id', /capsOf\(s\.backend\)\.resetCredit === true && ids\.has\(codexQuotaKeyFor\(s\)\)/.test(eng) && !/function resetCreditCarriers[\s\S]{0,400}backend === 'codex'/.test(eng));
  ok('the route is wired where the accounts routes live, and server.js hands the engine both functions', /require\('\.\.\/routes\/reset-credit\.js'\)\.registerResetCreditRoutes\(app, \{ engine \}\);/.test(read('src/server/account-usage-routes.js')) && /engine: \{ clearSealedOrders, resetCreditPreview, consumeResetCreditFor(, claimColdRestarts)?(, \w+)* \}/.test(read('server.js')));
}

console.log('\n§4 THE three entry points open ONE dialog');
{
  const dlg = read('src/lib/reset-credit-dialog.js');
  ok('the dialog is ONE exported function, built on createModalShell, worded by the PURE dialogModel, POSTing the route', /export async function openResetCreditDialog\(app, \{ accountKey, sessionId = null, todoId = null \} = \{\}\)/.test(dlg) && /createModalShell\(\{ id: 'reset-credit-dialog'/.test(dlg) && /dialogModel\(p, \{/.test(dlg) && /\/api\/accounts\/\$\{encodeURIComponent\(p\.key\)\}\/reset-credit`, \{ method: 'POST'/.test(dlg));
  ok('…draws every string with textContent (a peer/account name is data), and a failure reaches the user (toast)', /el\.textContent = words\(l\);/.test(dlg) && /showToast\(t\('Reset credit not used — \{reason\}'/.test(dlg) && !/innerHTML = [^U]/.test(dlg));
  ok('…resolves the For-you item after the decision (Confirm ⇒ done, Not now ⇒ dismissed)', /await resolveTodo\('done'\);/.test(dlg) && /await resolveTodo\('dismissed'\);/.test(dlg));
  const callers = {
    'src/lib/manage-agents.js': /openResetCreditDialog\(this, \{ accountKey: useBtn\.dataset\.resetKey \}\)/g,
    'src/lib/chat-renderers.js': /openResetCreditDialog\(this\.app, \{ accountKey: rc\.accountKey, sessionId: this\.sessionId \|\| null \}\)/g,
    // §9 (2026-09-27): the For-you button's verb moved VERBATIM into THE client model (the popup and the For-you window both call it)
    'src/lib/user-todos-actions.js': /openResetCreditDialog\(app, \{ accountKey: rec\.action\.accountKey, sessionId: rec\.action\.sessionId \|\| null, todoId: rec\.id \}\)/g,
  };
  for (const [f, re] of Object.entries(callers)) {
    const s = read(f);
    ok(`${f} imports the ONE dialog and calls it`, /import \{ openResetCreditDialog(, fmtInstant)? \} from '\.\/reset-credit-dialog\.js';/.test(s) && (s.match(re) || []).length >= 1);
  }
  ok('manage-agents: BOTH rosters route the button to it (codex live, claude disabled until it can)', (read('src/lib/manage-agents.js').match(/openResetCreditDialog\(this, \{ accountKey: useBtn\.dataset\.resetKey \}\)/g) || []).length === 2);
  // lane reset-path R3: the rule moved into the PURE card view (a resolved card shows its outcome line instead)
  ok('chat-renderers: the button rides a peer card only when the offer names an account (and no later fact answered it)', /if \(view\.button\) \{/.test(read('src/lib/chat-renderers.js')) && /return \{ button: !!\(o\.accountKey && Number\(o\.available\) > 0\), line: null \};/.test(read('src/reset-credit.js')));
  // 2.369.169: the row markup moved to THE row renderer (src/lib/user-todos-row.js) the panel imports
  ok('user-todos-panel: the button only on a reset-credit action item (drawn by THE row renderer the panel imports)', /i\.action\.type === 'reset-credit' && i\.action\.accountKey/.test(read('src/lib/user-todos-row.js')) && /from '\.\/user-todos-row\.js'/.test(read('src/lib/user-todos-panel.js')));
  ok('…the popup\'s button and the For-you window\'s producer action both run THE model\'s verb (no second dialog call)', /model\.runAction\(todos\.open\.find\(\(i\) => i\.id === id\)\)/.test(read('src/lib/user-todos-panel.js')) && /if \(a === 'producer'\) \{ model\.runAction\(it\); return; \}/.test(read('src/lib/inbox-window.js'))
    && !/openResetCreditDialog/.test(read('src/lib/user-todos-panel.js')) && !/openResetCreditDialog/.test(read('src/lib/inbox-window.js')));
  const all = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js') && !/^i18n/.test(f)).map((f) => ['src/lib/' + f, read('src/lib/' + f)]);
  const definers = all.filter(([, s]) => /function openResetCreditDialog\b/.test(s)).map(([f]) => f);
  ok('exactly ONE client file defines the dialog', JSON.stringify(definers) === '["src/lib/reset-credit-dialog.js"]', JSON.stringify(definers));
  const senders = all.filter(([, s]) => /type: 'codex-reset-credit'/.test(s)).map(([f]) => f);
  ok('no client file sends the raw ws verb (every manual spend goes through the dialog → the route → the authorizer)', senders.length === 0, JSON.stringify(senders));
  // THE VERB CENSUS BEYOND src/lib (r2, reproduced: ws-handler's
  // `codex-reset-credit` case wrote the verb straight to the pty — no spend
  // ceiling, no per-identity floor, no origin, and its failure then walked the
  // switch/wait ladder as an AUTO attempt). Over EVERY tracked JS surface that
  // can reach a wrapper's stdin (server.js, src/**, data/bin/*.js): the verb is
  // WRITTEN in exactly one place (the engine's writer), no dispatcher spells it
  // as a case label (a relay of `{ type: data.type }` hides the literal from
  // the writer grep, which is exactly the shape the ws case had), and only the
  // wrapper READS it.
  {
    const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(f)) walk(f, out); } else if (/\.js$/.test(e.name) && !/^i18n-/.test(e.name) && !/^\./.test(e.name)) out.push(f); } return out; };
    const files = ['server.js', ...walk('src'), ...fs.readdirSync(path.join(REPO, 'data/bin')).filter((f) => /\.js$/.test(f)).map((f) => 'data/bin/' + f)];
    const WRITE = /type:\s*['"]codex-reset-credit['"]/;
    const CASE = /case\s*['"]codex-reset-credit['"]\s*:/;
    const READ = /===\s*['"]codex-reset-credit['"]/;
    const hits = (re) => files.filter((f) => re.test(read(f)));
    ok(`the census is non-vacuous (${files.length} files incl. the engine, ws-handler and the codex wrapper)`, files.length > 100 && ['src/server/usage-pool-engine.js', 'src/ws-handler.js', 'data/bin/codex-chat-wrapper.js'].every((f) => files.includes(f)));
    ok('the verb is WRITTEN by exactly one server-tier file: the engine (writeResetCredit)', JSON.stringify(hits(WRITE)) === '["src/server/usage-pool-engine.js"]', JSON.stringify(hits(WRITE)));
    ok('no dispatcher relays it (no `case \'codex-reset-credit\':` anywhere — the ws bypass is gone)', hits(CASE).length === 0, JSON.stringify(hits(CASE)));
    ok('only the codex wrapper READS it', JSON.stringify(hits(READ)) === '["data/bin/codex-chat-wrapper.js"]', JSON.stringify(hits(READ)));
    const preFix = "        case 'codex-reset-credit':\n        case 'codex-read-limits': {\n          if (session?.pty && served) session.pty.write(JSON.stringify({ type: data.type }) + '\\n');";
    ok('NEGATIVE CONTROL: the pre-r2 ws relay is what the case census reports, and the writer grep alone would have missed it', CASE.test(preFix) && !WRITE.test(preFix));
  }
  ok('NEGATIVE CONTROL: a caller that bypasses the dialog is what the census reports', /type: 'codex-reset-credit'/.test("app.ws.send({ type: 'codex-reset-credit', sessionId })") && !(/openResetCreditDialog\(app, \{ accountKey: rec\.action\.accountKey/.test('openResetCredit(app, rec)')));
  ok('the wall card and the arm card carry the account the credits belong to (offer.accountKey)', /return n !== null && n > 0 \? \{ available: n, mode, accountKey: key \} : null;/.test(read('src/server/usage-pool-engine.js')) && /resetCredit: \{ available: n, mode, accountKey: key, \.\.\.\(R \? \{ resetsAtSec: R \} : \{\}\) \}/.test(read('src/server/usage-pool-engine.js')));
}

// ── verify r8 T0: THE SESSION PATH'S READ-FIRST ON THE REAL WRAPPER FILE (data/bin/codex-chat-wrapper.js) against the stub
//    app-server (the measured 0.159.3 table): the read goes out BEFORE the consume (request ids), the consume waits for
//    the engine's `codex-reset-credit-go`, go:false ⇒ no consume ever, a failed read ⇒ the consume at once (said), no verdict
//    in time ⇒ no consume (said), a verb without the flag ⇒ the consume at once; a patched wrapper copy as the control.
//    §ban-safety: the "codex" is the stub, CODEX_HOME a scratch dir, no network.
console.log('\n§4b the session path reads first on the REAL wrapper (stub app-server)');
{
  const { spawn } = await import('node:child_process');
  const { scratch, stopWrapper, withoutVendorKeys, endRootedProcesses } = await import('./scratch.mjs');
  const WDIR = scratch('rcui-wrap'); fs.mkdirSync(WDIR, { recursive: true });
  const WSTUB = writeStub(WDIR);
  const TABLE = path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json');
  const WRAPPER = 'data/bin/codex-chat-wrapper.js';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const runWrapper = async (tag, { wrapperFile = path.join(REPO, WRAPPER), env = {}, mode = 'answer', drive = async () => { } } = {}) => {
    const d = path.join(WDIR, tag); fs.mkdirSync(d, { recursive: true });
    const log = path.join(d, 'rpc.ndjson'); fs.writeFileSync(log, '');
    const SID = 'sess-1-1700000000201';
    const w = spawn(process.execPath, [wrapperFile, path.join(d, SID + '.buf'), path.join(d, SID + '.json'), process.execPath, WSTUB], {
      stdio: ['pipe', 'pipe', 'pipe'], cwd: d,
      env: { ...withoutVendorKeys(process.env), HOME: d, CODEX_HOME: path.join(d, 'no-codex-home'), CODEX_WEBUI_CWD: d, VIBESPACE_API: '', VIBESPACE_SESSION_TOKEN: '', VIBESPACE_SKIP_AGENT_HOOKS: '1', STUB_TABLE: TABLE, STUB_LOG: log, STUB_MODE: mode, ...env },
    });
    let out = ''; w.stdout.on('data', (x) => { out += x; }); w.stderr.on('data', () => { });
    const recs = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const rpc = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const until = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(40); } return false; };
    const send = (o) => w.stdin.write(JSON.stringify(o) + '\n');
    const booted = await until(() => rpc().some((r) => r.method === 'thread/queue/list'));
    const ctx = { w, recs, rpc, until, send, booted, events: (type) => recs().filter((r) => r.type === 'event_msg' && r.payload?.type === type).map((r) => r.payload), sidecar: () => { try { return JSON.parse(fs.readFileSync(path.join(d, SID + '.json'), 'utf8')); } catch { return null; } } };
    try { await drive(ctx); } finally { await stopWrapper(w); }
    return ctx;
  };
  const idOf = (c, method, nth = 0) => (c.rpc().filter((r) => r.method === method)[nth] || {}).id;
  // ① read → (go:true) → consume → read, by request id
  const a = await runWrapper('go', { drive: async (c) => {
    c.verbMark = Math.max(0, ...c.rpc().map((r) => r.id).filter(Number.isFinite)); // verify r10 ⑥: the last request id BEFORE the verb — the press's own reads are the ones after it (a notification has no id)
    c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0001', readFirst: true });
    await c.until(() => c.events('rate_limits_updated').some((e) => e.beforeReset === true));
    await sleep(250); // the wrapper is WAITING: no consume yet
    c.noConsumeYet = !c.rpc().some((r) => r.method === 'account/rateLimitResetCredit/consume');
    c.send({ type: 'codex-reset-credit-go', idempotencyKey: 'k-rf-0001', go: true });
    await c.until(() => c.events('reset_credit_result').length > 0);
  } });
  ok('§4b the real wrapper booted on the stub and advertises resetCreditReadFirst in its sidecar', a.booted && a.sidecar()?.caps?.resetCreditReadFirst === true, JSON.stringify(a.sidecar()?.caps));
  { const before = a.events('rate_limits_updated').find((e) => e.beforeReset === true) || {};
    ok('§4b ① the read before the consume is pushed with the press\'s key (`beforeReset`, `onDemand`, the count and the window), and NO consume went out until the engine\'s go', before.idempotencyKey === 'k-rf-0001' && before.onDemand === true && !!before.rateLimits && !!before.resetCredits && a.noConsumeYet === true, JSON.stringify([before.idempotencyKey, before.onDemand, !!before.rateLimits, a.noConsumeYet]));
    // (the wrapper's own boot read — readAccountLimits(false) at startup — is the first read; the press's are the ones around the consume)
    const readIds = a.rpc().filter((r) => r.method === 'account/rateLimits/read').map((r) => r.id), cI = idOf(a, 'account/rateLimitResetCredit/consume', 0);
    const pre = readIds.filter((i) => i < cI), post = readIds.filter((i) => i > cI);
    ok('§4b ① by request id: boot read < the pre-consume read < consume < the post-consume read (two reads before the consume, one after; one consume)', Number.isFinite(cI) && pre.length === 2 && post.length === 1 && a.rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume').length === 1 && pre[1] > pre[0] && post[0] > cI, JSON.stringify([readIds, cI]));
    const res = a.events('reset_credit_result')[0] || {};
    ok('§4b ① the answer is this press\'s reset, one attempt; the post-consume read is still marked afterReset', res.outcome === 'reset' && res.idempotencyKey === 'k-rf-0001' && res.attempts === 1 && a.events('rate_limits_updated').some((e) => e.afterReset === true && e.idempotencyKey === 'k-rf-0001'), JSON.stringify(res)); }
  // ② go:false ⇒ no consume, ever; said as skipped with the why
  const b = await runWrapper('nogo', { drive: async (c) => {
    c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0002', readFirst: true });
    await c.until(() => c.events('rate_limits_updated').some((e) => e.beforeReset === true));
    c.send({ type: 'codex-reset-credit-go', idempotencyKey: 'k-rf-0002', go: false, why: 'window-moved' });
    await c.until(() => c.events('reset_credit_result').length > 0);
    await sleep(300);
  } });
  { const res = b.events('reset_credit_result')[0] || {};
    ok('§4b ② go:false ⇒ NO consume at the app-server, the result says skipped with the engine\'s why, sent:false', res.skipped === true && res.why === 'window-moved' && res.sent === false && res.attempts === 0 && res.idempotencyKey === 'k-rf-0002' && !b.rpc().some((r) => r.method === 'account/rateLimitResetCredit/consume'), JSON.stringify([res, b.rpc().map((r) => r.method)])); }
  // ③ the read fails ⇒ the consume goes out at once on the count shown (no go awaited), the failure pushed as its own shape
  const f = await runWrapper('readfail', { mode: 'fail-read', drive: async (c) => {
    c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0003', readFirst: true });
    await c.until(() => c.events('reset_credit_result').length > 0);
  } });
  { const err = f.events('rate_limits_updated').find((e) => e.beforeReset === true) || {}; const res = f.events('reset_credit_result')[0] || {};
    ok('§4b ③ a FAILED read before the consume is pushed as {error, beforeReset, idempotencyKey} and the consume still goes out with no go awaited — the answer is reset', typeof err.error === 'string' && err.idempotencyKey === 'k-rf-0003' && res.outcome === 'reset' && f.rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume').length === 1 && f.rpc().filter((r) => r.method === 'account/rateLimits/read' && r.id < idOf(f, 'account/rateLimitResetCredit/consume', 0)).length === 2, JSON.stringify([err.error, res.outcome, f.rpc().map((r) => r.method)])); }
  // ④ no verdict within the wait ⇒ no consume, said (a press nobody judged never spends)
  const t = await runWrapper('noverdict', { env: { VIBESPACE_CODEX_RESET_GO_TIMEOUT_MS: '300' }, drive: async (c) => {
    c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0004', readFirst: true });
    await c.until(() => c.events('reset_credit_result').length > 0, 6000);
    c.consumesAtGiveUp = c.rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume').length;
    c.send({ type: 'codex-reset-credit-go', idempotencyKey: 'k-rf-0004', go: true }); // verify r9 ①: the engine's go arrives AFTER the wrapper gave up
    await sleep(400);
  } });
  { const res = t.events('reset_credit_result')[0] || {};
    ok('§4b ④ no go within the wait ⇒ NO consume, the result says skipped / no-verdict with its error, sent:false', res.skipped === true && res.why === 'no-verdict' && /no verdict on the read before the consume/.test(String(res.error)) && res.sent === false && t.consumesAtGiveUp === 0, JSON.stringify(res));
    ok('§4b ④ (verify r9 ①, the two clocks) a go:true arriving AFTER the wrapper gave up is DROPPED — still no consume (the wrapper holds no waiter for the key; the engine side: §4d ①)', !t.rpc().some((r) => r.method === 'account/rateLimitResetCredit/consume') && t.events('reset_credit_result').length === 1, JSON.stringify(t.rpc().map((r) => r.method))); }
  // ⑤ a verb WITHOUT the flag (the auto rung, the route's re-ask after its own read, an older server) consumes at once
  const p = await runWrapper('plain', { drive: async (c) => { c.verbMark = Math.max(0, ...c.rpc().map((r) => r.id).filter(Number.isFinite)); c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0005' }); await c.until(() => c.events('reset_credit_result').length > 0); } });
  const readsBeforeConsume = (c) => c.rpc().filter((r) => r.method === 'account/rateLimits/read' && r.id < idOf(c, 'account/rateLimitResetCredit/consume', 0)).length; // 1 = the wrapper's own boot read only
  ok('§4b ⑤ a verb without readFirst consumes at once: no beforeReset push, only the boot read before the consume, the post-consume read after (unchanged)', !p.events('rate_limits_updated').some((e) => e.beforeReset === true) && readsBeforeConsume(p) === 1 && (p.events('reset_credit_result')[0] || {}).outcome === 'reset', JSON.stringify(p.rpc().map((r) => [r.id, r.method])));
  // THE RUNTIME READ CENSUS (verify r10 ⑥): the text census (test-vendor-whitelist §8) counts literal request sites; the stub app-server's own
  // log counts what a PRESS actually sends — the reads between the verb's arrival and the consume: exactly 1 for a person's press, 0 for a verb
  // without the flag (the auto rung's shape), 1 after the consume on both; the helper's run is pinned as a sequence in §3
  const readsOfPress = (c, { before = true } = {}) => { const cI = idOf(c, 'account/rateLimitResetCredit/consume', 0); return c.rpc().filter((r) => r.method === 'account/rateLimits/read' && r.id > c.verbMark && (before ? r.id < cI : r.id > cI)).length; };
  ok('§4b RUNTIME READ CENSUS (verify r10 ⑥): a person\'s press = exactly ONE read between the verb and the consume on the real wrapper (the boot read excluded by request id), one after', Number.isFinite(a.verbMark) && readsOfPress(a) === 1 && readsOfPress(a, { before: false }) === 1 && a.rpc().filter((r) => r.method === 'account/rateLimitResetCredit/consume').length === 1, JSON.stringify([a.verbMark, a.rpc().map((r) => [r.id, r.method])]));
  ok('§4b RUNTIME READ CENSUS: a verb without the flag (the auto rung) = ZERO reads between the verb and the consume, one after', Number.isFinite(p.verbMark) && readsOfPress(p) === 0 && readsOfPress(p, { before: false }) === 1, JSON.stringify([p.verbMark, p.rpc().map((r) => [r.id, r.method])]));
  // ⑥ CONTROL: a wrapper copy that ignores the flag consumes with no read before — leg ① sees the rule
  { const wsrc = read(WRAPPER); const fromRF = '    if (msg.readFirst === true) {'; ok('§4b CONTROL: the patch hits the wrapper source', wsrc.includes(fromRF));
    const f6 = MUTRC.write(WRAPPER, wsrc.replace(fromRF, '    if (false) {'), 'r8-wrapper-noreadfirst');
    const c6 = await runWrapper('control', { wrapperFile: f6, drive: async (c) => { c.send({ type: 'codex-reset-credit', idempotencyKey: 'k-rf-0006', readFirst: true }); await c.until(() => c.events('reset_credit_result').length > 0); } });
    ok('§4b CONTROL: the patched wrapper consumes at once on readFirst:true — no beforeReset push, only the boot read before the consume (leg ① would be RED on it)', !c6.events('rate_limits_updated').some((e) => e.beforeReset === true) && readsBeforeConsume(c6) === 1, JSON.stringify(c6.rpc().map((r) => [r.id, r.method]))); }
  // no stub outlives its wrapper
  { const live = () => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes(WSTUB); } catch { return false; } });
    const t0 = Date.now(); while (live().length && Date.now() - t0 < 3000) await sleep(50);
    ok('§4b every stub app-server exited with its wrapper', live().length === 0, live().join(',')); }
  try { endRootedProcesses(WDIR); } catch { } try { fs.rmSync(WDIR, { recursive: true, force: true }); } catch { }
}

console.log('\n§5 i18n');
{
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
  const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const re = /\b(?:t|i18nKey)\(\s*'((?:[^'\\]|\\.)*)'/g;
  const keys = new Set();
  for (const f of ['src/reset-credit.js', 'src/lib/reset-credit-dialog.js']) for (const m of read(f).matchAll(re)) keys.add(m[1].replace(/\\'/g, "'"));
  for (const k of ['Claude Code offers only the interactive /limit-reset — run it in a terminal session', '{n} reset credits', '1 reset credit', 'Use…', 'Use a reset credit…', '{n} stored reset credits on this account — opens the confirmation']) keys.add(k);
  const missing = [...keys].filter((k) => !(k in zh) || !(k in ja));
  ok(`every new key has zh + ja (${keys.size} keys)`, keys.size > 25 && missing.length === 0, missing.join(' | '));
}
ok('ci.mjs runs this suite', /'test-reset-credit-ui'/.test(read('scripts/ci.mjs')));


// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTRC.files, MUTRC.dir, REPO, { minCopies: 1 })) ok('tree: ' + r.name, r.pass, r.detail);

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
