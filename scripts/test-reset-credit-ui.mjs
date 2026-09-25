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
  const world = ({ credits = 3, hourCap = 100, session = true } = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rcui-'));
    roots.push(root);
    const prevHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(root, 'shared-codex');
    const wam = new AccountManager({ dataDir: path.join(root, 'data') });
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { id: A } = wam.createCodexSubscription({ name: 'Cx Alpha' });
    const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: 'alpha@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-alpha' } })}.sig`;
    fs.writeFileSync(path.join(wam.codexSubDir(A), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-a', id_token: idTok } }));
    process.env.CODEX_HOME = prevHome;
    const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(path.join(cacheDir, A + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'codex-rate-limits', limitId: 'codex', fiveHour: { utilization: 0.3, usedPercent: 30, windowMinutes: 300, resetsAt: nowS + 3600 }, sevenDay: { utilization: 1, usedPercent: 100, windowMinutes: 10080, resetsAt: nowS + 2 * 86400 } }));
    const settings = { 'codex.limitResetCredit': 'off', 'spend.unattendedPerIdentityHour': hourCap };
    const sessions = new Map(), notices = [], arms = [];
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const eng = engMod.create({
      app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t),
      serverSetting: (k) => settings[k], getAccounts: () => wam, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
      getAutoResume: () => ({ armIfEnabled: (sid, s2, until, why) => arms.push({ sid, until, why }), noteRecovered() { }, noteFireOutcome() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
      getUserTodos: () => ({ add: () => ({ id: 'ut-1' }) }),
    });
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
    const s1 = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx1', backendSessionId: 'thread-1', _accountId: A, name: 'cx-conv', pty: { write: (x) => wrote.push(String(x)) }, _normalizer: { injectPeerCard: () => null }, _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now() };
    if (session) sessions.set('cx1', s1);
    const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
    if (session && credits != null) quietly(() => eng.recordCodexQuotaSignal(s1, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: credits }, rateLimits: { primary: { used_percent: 100, window_minutes: 10080, resets_at: nowS + 2 * 86400 }, secondary: null } }));
    const verbs = () => wrote.filter((x) => /"codex-reset-credit"/.test(x)).length;
    return { eng, A, s1, sessions, call, verbs, notices, arms, quietly, nowS, charged: () => (eng.spendGuard.snapshot().budget.instance || []).length };
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
  ok('a failed PERSON\'s attempt ⇒ ONE notice naming the account and the vendor\'s answer', w.notices.some((n) => /Reset credit not used on Cx Alpha — the vendor answered nothingToReset\./.test(n)), JSON.stringify(w.notices));
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
      const q = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
      const r = q(() => eng2.consumeResetCreditFor('__global_codex__', {}));
      ok('NEGATIVE CONTROL: without the authorizer the 0/hour ceiling no longer refuses — the spend_refused leg sees the gate', r.ok === true && wrote.length === 1, JSON.stringify(r));
    } finally { /* MUTRC's scratch dir is removed at exit */ }
  }
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  const eng = read('src/server/usage-pool-engine.js');
  ok('ONE writer: the auto rung and the manual use both call writeResetCredit with the CREDIT\'S identity (the verb is spelled once in the engine)', /const wr = writeResetCredit\(session, \{ resetsAtSec: R, lane, origin: 'auto', now, key \}\);/.test(eng) && /const wr = writeResetCredit\(session, \{ resetsAtSec: p\.resetsAtSec \|\| 0, lane: null, origin: 'user', now, key: p\.key \}\);/.test(eng) && (eng.match(/type: 'codex-reset-credit' \}\)/g) || []).length === 1);
  ok('the carrier is picked by CAPABILITY (capsOf(s.backend).resetCredit), never a backend id', /capsOf\(s\.backend\)\.resetCredit === true && ids\.has\(codexQuotaKeyFor\(s\)\)/.test(eng) && !/function resetCreditCarriers[\s\S]{0,400}backend === 'codex'/.test(eng));
  ok('the route is wired where the accounts routes live, and server.js hands the engine both functions', /require\('\.\.\/routes\/reset-credit\.js'\)\.registerResetCreditRoutes\(app, \{ engine \}\);/.test(read('src/server/account-usage-routes.js')) && /engine: \{ clearSealedOrders, resetCreditPreview, consumeResetCreditFor(, claimColdRestarts)? \}/.test(read('server.js')));
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
    'src/lib/user-todos-panel.js': /openResetCreditDialog\(app, \{ accountKey: rec\.action\.accountKey, sessionId: rec\.action\.sessionId \|\| null, todoId: rec\.id \}\)/g,
  };
  for (const [f, re] of Object.entries(callers)) {
    const s = read(f);
    ok(`${f} imports the ONE dialog and calls it`, /import \{ openResetCreditDialog \} from '\.\/reset-credit-dialog\.js';/.test(s) && (s.match(re) || []).length >= 1);
  }
  ok('manage-agents: BOTH rosters route the button to it (codex live, claude disabled until it can)', (read('src/lib/manage-agents.js').match(/openResetCreditDialog\(this, \{ accountKey: useBtn\.dataset\.resetKey \}\)/g) || []).length === 2);
  ok('chat-renderers: the button rides a peer card only when the offer names an account', /if \(rc && rc\.accountKey && Number\(rc\.available\) > 0\) \{/.test(read('src/lib/chat-renderers.js')));
  // 2.369.169: the row markup moved to THE row renderer (src/lib/user-todos-row.js) the panel imports
  ok('user-todos-panel: the button only on a reset-credit action item (drawn by THE row renderer the panel imports)', /i\.action\.type === 'reset-credit' && i\.action\.accountKey/.test(read('src/lib/user-todos-row.js')) && /from '\.\/user-todos-row\.js'/.test(read('src/lib/user-todos-panel.js')));
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
  ok('the wall card and the arm card carry the account the credits belong to (offer.accountKey)', /return n !== null && n > 0 \? \{ available: n, mode, accountKey: key \} : null;/.test(read('src/server/usage-pool-engine.js')) && /resetCredit: \{ available: n, mode, accountKey: key \}/.test(read('src/server/usage-pool-engine.js')));
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
