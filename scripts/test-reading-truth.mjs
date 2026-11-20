#!/usr/bin/env node
// THE READING'S TRUTH (lane readings-attribution-2, 主开发 2026-11-15) — a quota reading is never filed on an account the
// conversation was not using. The owner's requirement: «它的数字至少要一直是准确的，也就是每次发生变动（当然我自己脱离 vibespace
// 用不算）都必须能跟踪新的用量是多少». Every change made THROUGH VibeSpace is tracked, on the right account.
//
// LAW 1 — ONE ANSWER TO «WHICH ACCOUNT». MEASURED (P0, scripts/fixtures/claude-cred-read-midturn-2.1.322.json): a running
// claude spends a re-pointed credential on its NEXT REQUEST, inside a turn too. So a reading's account is the account its
// REQUEST went out on (usage-pool-engine requestSlotFor: the link at the conversation's latest request-out), every road that
// ends a turn ends its pins, and a reading whose window contradicts its request's account is ARCHIVED BY NAME, never re-filed.
//
// THE PROOF: an INVENTED episode of the shape the owner's instance showed (no real id, instant or figure: scripts/fixtures/
// reading-truth-episode.json), replayed through the REAL engine and the REAL account manager — a pool of two members that share
// one weekly reset instant, the pool's move at a stop, the next turn's readings: the first member's number never moves.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { endScratchAtExit } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const J = JSON.stringify;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const ENG = 'src/server/usage-pool-engine.js';
const realEng = require(path.join(REPO, ENG));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const TS = require(path.join(REPO, 'src/turn-state.js'));
const { TMP_ROOTS, FIXTURE_CWD_PREFIX } = require(path.join(REPO, 'src/fixture-guard.js'));   // the scratch helper's root, whatever TMPDIR says
const readingLag = require(path.join(REPO, 'src/reading-lag.js'));
const MUT = mutantCopies('reading-truth', REPO);
const FX = JSON.parse(read('scripts/fixtures/reading-truth-episode.json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });

/** A real pool: MA and MB share ONE weekly reset instant (two members can), MC has its own. The session runs
 *  on MA. Auto is OFF: the suite drives the move the pool made (accounts.ensureSessionPoolLink — the ledger row included). */
function mkWorld(engMod = realEng, { autoResume = null } = {}) {
  const root = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-')));
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
  const MA = am.createSubscription({ name: 'Member A' }).id; login(MA);
  const MB = am.createSubscription({ name: 'Member B' }).id; login(MB);
  const MC = am.createSubscription({ name: 'Member C' }).id; login(MC);
  const P = am.createPool({ name: 'all' }).id;
  am.setPoolTarget(P, MA); am.updatePool(P, { hot: true }); am.get(P).auto = false; am._save();
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000);
  const R7 = nowS + 6 * 86400, R7MC = nowS + 2 * 86400 + 7 * 3600, R5 = nowS + 2 * 3600;
  const cache = (u7, r7) => ({ fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: R5 }, sevenDay: { utilization: u7, resetsAt: r7 } });
  const writeCache = (id, c) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(c));
  const readCache = (id) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, id + '.json'), 'utf8')); } catch { return null; } };
  writeCache(MA, cache(FX.before.MA, R7)); writeCache(MB, cache(FX.before.MB, R7)); writeCache(MC, cache(0.5, R7MC));
  for (const [id, r] of [[MA, R7], [MB, R7], [MC, R7MC]]) fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(id)), J({ at: Date.now(), source: 'on-demand', sevenDay: r }));
  const sessions = new Map();
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => autoResume, getQuotaProbe: () => null,
  });
  const SID = 'sess-rt-1';
  const session = { backend: 'claude', mode: 'chat', host: null, _webuiId: SID, claudeSessionId: 'cid-rt-1', _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'w' };
  sessions.set(SID, session);
  am.ensureSessionPoolLink(P, SID, MA, { why: 'spawn' });
  // a SECOND conversation on MA that the pool never moved (its spawn row is no re-point): law 3's unmoved producer
  const s2 = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-rt-2', claudeSessionId: 'cid-rt-2', _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'w2' };
  sessions.set('sess-rt-2', s2); am.ensureSessionPoolLink(P, 'sess-rt-2', MA, { why: 'spawn' });
  const RC = require(path.join(REPO, 'src/usage-reset-claim.js')).at(path.join(root, 'data'));   // the store the engine writes (its file is paced by the store writer)
  const archive = () => { try { return fs.readFileSync(path.join(root, 'data', 'archive', 'readings-window-mismatch.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const u7 = (id) => readCache(id)?.sevenDay?.utilization;
  // the stream's own roads, driven as the parse drives them
  const W = {
    root, am, eng, session, P, MA, MB, MC, R7, R7MC, readCache, u7, archive, s2,
    outcomesOf: (id) => RC.outcomesOf(id),
    unmovedReading: (u, r7 = R7) => { s2._isStreaming = true; s2._turnState = 'running'; TS.noteRequestSent(s2, Date.now()); quiet(() => eng.recordRateLimitEvent(s2, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: r7 } })); },
    out: () => { session._isStreaming = true; session._turnState = 'running'; TS.noteRequestSent(session, Date.now()); },   // a request leaves (the prompt's echo or a tool result)
    reading: (u, r7 = R7) => quiet(() => eng.recordRateLimitEvent(session, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: r7 } })),
    result: () => quiet(() => eng.noteTurnEnd(session, { type: 'result' })),
    idle: () => { session._isStreaming = false; session._turnState = 'idle'; TS.noteTurnFlight(session, Date.now()); quiet(() => eng.noteTurnStopped(session)); },   // the CLI's idle = the STOP
    reconcile: () => { session._isStreaming = false; TS.noteTurnFlight(session, Date.now()); quiet(() => eng.maybePoolAutoSwitch(session, { stop: true })); },   // the attach reconcile
    move: (to) => am.ensureSessionPoolLink(P, SID, to, { why: 'per-session-switch' }),   // the pool's move (its ledger row)
    // a response's quota record stating the plan week and the model cap (2.1.274 `unifiedWindows`); capOnly = the cap is all it states
    capReading: (u7, r7, cap, rcap, { capOnly = false } = {}) => quiet(() => eng.recordRateLimitEvent(session, { type: 'rate_limit_event', rate_limit_info: capOnly
      ? { status: 'allowed', rateLimitType: 'seven_day_overage_included', utilization: cap, resetsAt: rcap, unifiedWindows: { seven_day_overage_included: { utilization: cap, resets_at: rcap } } }
      : { status: 'allowed', rateLimitType: 'seven_day', utilization: u7, resetsAt: r7, unifiedWindows: { seven_day: { utilization: u7, resets_at: r7 }, seven_day_overage_included: { utilization: cap, resets_at: rcap } } } })),
    answer: (model) => quiet(() => eng.noteModelRequest(session, { type: 'assistant', message: { model, usage: { input_tokens: 5, output_tokens: 5 } } })),   // an answered request of this turn
    capOf: (id) => { const c = readCache(id); const l = (c && Array.isArray(c.scopedWeekly) ? c.scopedWeekly : []).find((x) => /fable/i.test(String(x && x.name))); return l ? l.utilization : null; },
    stampCap: (id, r7, rcap) => fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(id)), J({ at: Date.now(), source: 'on-demand', sevenDay: r7, scoped: { fable: rcap } })),
  };
  return W;
}
const probe = mkWorld();
if (!probe) { console.log('  · SKIP (pooled accounts are unsupported here)'); console.log('\nALL PASS (0)'); process.exit(0); }

/** THE EPISODE'S REPLAY, step by step from the fixture. `kind` ∈ out | reading | result | idle | reconcile | move. */
async function replay(W, steps) {
  const seen = [];
  for (const s of steps) {
    if (s.kind === 'out') W.out();
    else if (s.kind === 'reading' || s.kind === 'trailing') W.reading(s.u);
    else if (s.kind === 'result') W.result();
    else if (s.kind === 'idle') W.idle();
    else if (s.kind === 'reconcile') W.reconcile();
    else if (s.kind === 'move') W.move(W[s.to]);
    await sleep(3);   // the records' order, one instant each (a request that left before a move is BEFORE it)
    if (s.kind === 'reading' || s.kind === 'trailing') seen.push({ at: s.at, u: s.u, MA: W.u7(W.MA), MB: W.u7(W.MB) });
  }
  return seen;
}

console.log('LAW 1 — the shared-phase episode, replayed through the real engine (two members, one weekly reset instant)');
{
  const W = mkWorld();
  const seen = await replay(W, FX.steps);
  const pmAfter = W.u7(W.MA), cxAfter = W.u7(W.MB);
  const moved = seen.filter((x) => x.at > FX.moveAt);
  ok(`the first member's number never moves: ${FX.before.MA} before, ${pmAfter} after the move and the next turn's readings (the second member's numbers never shown as the first's)`, pmAfter === FX.before.MA && seen.every((x) => x.MA === FX.before.MA), J(seen));
  ok(`…the next turn's readings (the second member's numbers) land on the second member: ${moved.map((x) => x.u).join(' → ')}`, cxAfter === moved[moved.length - 1].u && moved.every((x) => x.MB === x.u), J(moved));
  ok('…and nothing was archived: no reading had to be refused to keep the numbers right', W.archive().length === 0, J(W.archive()));
}
{
  // the other road the code had: no `result` at all — the attach reconcile is the stop
  const W = mkWorld();
  const steps = FX.steps.filter((s) => s.kind !== 'result' && s.kind !== 'idle').map((s) => (s.kind === 'trailing' ? { ...s, kind: 'reading' } : s));
  const at = steps.findIndex((s) => s.kind === 'move');
  steps.splice(at, 0, { kind: 'reconcile', at: FX.moveAt - 4 });
  const seen = await replay(W, steps);
  ok('…the same with no turn end at all (the attach reconcile is the stop): the first member still never moves', W.u7(W.MA) === FX.before.MA && W.u7(W.MB) === seen[seen.length - 1].u, J({ MA: W.u7(W.MA), MB: W.u7(W.MB), seen }));
}
{
  // P0's measured shape: the link moves while a request is IN FLIGHT — that request's reading is the old member's, the next one's the new
  const W = mkWorld();
  W.out(); await sleep(3); W.move(W.MB); await sleep(3);
  W.reading(0.902);                  // the answer to the request that left BEFORE the move
  const inFlight = { MA: W.u7(W.MA), MB: W.u7(W.MB) };
  W.out(); await sleep(3); W.reading(0.133);    // the next request of the SAME turn left after the move
  ok('MID-TURN (P0: the next request): the reading of the request in flight at the move lands on the OLD member, the next request\'s on the NEW one — inside one turn', inFlight.MA === 0.902 && inFlight.MB === FX.before.MB && W.u7(W.MB) === 0.133 && W.u7(W.MA) === 0.902, J({ inFlight, after: { MA: W.u7(W.MA), MB: W.u7(W.MB) } }));
}
{
  // a disagreement: the request went out on MA, the reading's window is MC's — ARCHIVED BY NAME, written nowhere
  const W = mkWorld();
  W.out(); await sleep(3);
  const before = { MA: W.u7(W.MA), MC: W.u7(W.MC) };
  W.reading(0.33, W.R7MC);
  const a = W.archive();
  ok('A DISAGREEMENT IS ARCHIVED BY NAME, NEVER RE-FILED: the request went out on one member, the reading\'s window names another ⇒ written on neither, archived «the reading and its request disagree»',
    W.u7(W.MA) === before.MA && W.u7(W.MC) === before.MC && a.length === 1 && /the reading and its request disagree/.test(a[0].reason) && a[0].entry?.slot?.slotReason === 'request-stamped', J({ before, after: { MA: W.u7(W.MA), MC: W.u7(W.MC) }, a: a.map((x) => x.reason) }));
}
{
  // a conversation whose request this hub never saw (a restore before its first request): the ladder it had — filed on the link
  const W = mkWorld();
  W.reading(0.77);
  ok('…a conversation with no known request keeps the ladder it had (filed on its link)', W.u7(W.MA) === 0.77, J({ MA: W.u7(W.MA) }));
}
{
  // EVERY road that ends a turn ends its pins: a stop, and a move of a conversation not in a turn
  const src = read(ENG);
  ok('EVERY ROAD THAT ENDS A TURN ENDS ITS PINS: a stop of a conversation no longer in a turn clears the reading pin, and so does a move of one not in a turn',
    /if \(stop && !conversationInTurn\(\{ isStreaming: session\._isStreaming, turnState: session\._turnState \}\)\) \{ session\._turnReadingSlot = null; session\._turnAsks = null; \}/.test(src)
      && /if \(!conversationInTurn\(\{ isStreaming: s2\._isStreaming, turnState: s2\._turnState \}\)\) s2\._turnReadingSlot = null;/.test(src));
  ok('…and the request\'s instant is kept by turn-state\'s ONE request-out writer, never cleared by a pause or the turn\'s end', /if \(inFlight && Number\(now\) > 0\) session\._lastRequestOutAt = Number\(now\);/.test(read('src/turn-state.js')) && !/_lastRequestOutAt = null/.test(read('src/turn-state.js')));
}
console.log('LAW 2 — a model\'s cap is stated by that model\'s requests');
{
  // the shape: the cap reading came with one request of ANOTHER model. The turn asked this account for Opus only;
  // a Fable cap in its quota record is not this account's Fable cap — the lane is archived by name, the plan week written
  const W = mkWorld(); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
  W.session._servedModel = 'claude-opus-5';
  W.out(); W.answer('claude-opus-5'); await sleep(3);
  W.capReading(0.902, W.R7, 0.03, RCAP);
  const a = W.archive();
  ok('LAW 2: a Fable cap on a turn that asked this account for no Fable request ⇒ the cap lane archived by name («a fable model cap on a turn in which this hub saw no fable request to …»), the plan week written',
    W.capOf(W.MA) === null && W.u7(W.MA) === 0.902 && a.some((x) => /a fable model cap on a turn in which this hub saw no fable request to /.test(x.reason)), J({ cap: W.capOf(W.MA), u7: W.u7(W.MA), a: a.map((x) => x.reason) }));
}
{
  const W = mkWorld(); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
  W.out(); W.answer('claude-fable-5'); await sleep(3);
  W.capReading(0.902, W.R7, 0.71, RCAP);
  ok('…the same record on a turn that asked for Fable: its cap is the account\'s (written, nothing archived)', W.capOf(W.MA) === 0.71 && W.archive().length === 0, J({ cap: W.capOf(W.MA), a: W.archive().map((x) => x.reason) }));
}
console.log('LAW 3 — a fall is not a reset until something confirms it');
const heldWorld = async () => {
  // the account MA has its number under its reset; a conversation the pool moved onto it a moment ago reads a far lower one under the SAME reset
  const W = mkWorld(); W.move(W.MC); await sleep(3); W.move(W.MA); await sleep(3);
  W.out(); await sleep(3); W.reading(0.13);
  return W;
};
{
  const W = await heldWorld();
  const o = W.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('LAW 3: a fall of 3 points or more under an unchanged reset, from a conversation the pool moved inside the shadow time, is HELD — the account keeps its 91 % (what the pool reads), an UNCONFIRMED FALL is said (its own state, never «reset»), until the window\'s own reset',
    W.u7(W.MA) === 0.91 && !!o && o.state === 'fall-unconfirmed' && Math.round(o.before) === 91 && Math.round(o.usedPct) === 13 && o.until === W.R7 * 1000, J({ u7: W.u7(W.MA), o }));
  W.unmovedReading(0.14);
  const o2 = W.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('…CONFIRMED by a producer that was not moved: its 14 % is taken, and the fall becomes the reset a reading shows (91 → 14)', W.u7(W.MA) === 0.14 && !!o2 && o2.state === 'reset-seen' && Math.round(o2.before) === 91, J({ u7: W.u7(W.MA), o2 }));
}
{
  const W = await heldWorld();
  W.unmovedReading(0.92);
  ok('…REFUTED by a reading back near the old value: the hold ends, nothing is called a reset', W.u7(W.MA) === 0.92 && !W.outcomesOf(W.MA).some((x) => x.lane === 'plan:7d'), J({ u7: W.u7(W.MA), o: W.outcomesOf(W.MA) }));
}
{
  // a vendor's early reset read by a producer that was NOT moved (the shape of the two real ones: seen when the member was next
  // used, or live in a running session) is its own confirmation — taken at once
  const W = mkWorld();
  W.out(); await sleep(3); W.reading(0.03);
  const o = W.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('ROW R (a real early reset\'s shape): the fall read by a conversation the pool did not move is taken at once and said as a reset a reading shows', W.u7(W.MA) === 0.03 && !!o && o.state === 'reset-seen', J({ u7: W.u7(W.MA), o }));
}
{
  const words = read('src/lib/account-wall-words.js');
  ok('…the unconfirmed fall has its OWN words (not the «reset — unconfirmed» look), in en and in the zh / ja dictionaries', /o\.state === 'fall-unconfirmed'\) return t\('\{name\}: \{what\} fell from \{before\}% to \{after\}% in one reading — not confirmed yet/.test(words)
    && /fell from \{before\}% to \{after\}% in one reading — not confirmed yet[^"]*": "[^"]+/.test(read('src/lib/i18n-zh.js')) && /fell from \{before\}% to \{after\}% in one reading — not confirmed yet[^"]*": "[^"]+/.test(read('src/lib/i18n-ja.js')));
}
console.log('THE CAP ROWS (invented, of the shape five of the six clear episodes had) — an answer IN FLIGHT across the pool\'s move');
// each: conversations moved onto the account a few minutes before, and the account's cap lane showed
// another member's number — the answer to a request that had left on the member the conversation was leaving. A cap names no
// account the guard can check; only the request can say whose it is.
for (const [row, foreign] of [['C1', 0.93], ['C2', 0.92], ['C3', 0.87], ['C4', 0.9], ['C5', 0.89]]) {
  const W = mkWorld(); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
  W.out(); await sleep(3);                       // the request leaves on the member being left (MA)
  W.move(W.MC); await sleep(3);                  // the pool moves the conversation onto the row's account (MC)
  W.capReading(null, null, foreign, RCAP, { capOnly: true });   // the answer to the request in flight: MA's cap, no window naming its account
  ok(`ROW ${row} (a cap lane showing another member's ${Math.round(foreign * 100)} %): the in-flight answer's cap lands on the member its request left on, never on the account the conversation was moved onto`, W.capOf(W.MA) === foreign && W.capOf(W.MC) === null, J({ left: W.capOf(W.MA), movedOnto: W.capOf(W.MC) }));
}
console.log('THE EPISODE ROWS (invented, each of a shape the owner\'s instance showed) — law 1\'s');
{
  // ROW A — a pool switch moves a conversation INSIDE a turn (a hard move); the member it moves onto has JUST reset, and its
  // first low number lands on the member being left for hours. The shape: the turn pin kept the left member while the next
  // requests already spent the new one's credential (P0) — and the left member had no established window for the guard.
  const W = mkWorld();
  fs.rmSync(path.join(W.root, 'data', 'usage-cache', readingLag.windowSidecarName(W.MA)), { force: true });   // no evidence on the left member
  W.out(); await sleep(3); W.reading(0.61);              // its own number, this turn
  W.move(W.MC); await sleep(3);                          // the hard move, mid-turn (the conversation still streams)
  W.out(); await sleep(3); W.reading(0.04, W.R7MC + 7 * 86400);   // the next request of the same turn: the new member's just-reset number (its NEW window)
  ok('ROW A (plan week): a move INSIDE a turn — the next request\'s reading lands on the member the request went out on, never on the one the turn began on', W.u7(W.MA) === 0.61 && W.u7(W.MC) === 0.04, J({ left: W.u7(W.MA), new: W.u7(W.MC) }));
}
console.log('THE CLOSURE LOOK (two verifiers, bounded by the owner\'s four musts) — each leg red on 6d5e94692');
{
  // M1 — a process that HOLDS its spawn login (a codex pool cannot hot-switch): the pool moved its link cold before the request
  // and again after it; the request, and the reading that answers it, are the held login's — never the member the link named
  const W = mkWorld(); const am = W.am;
  process.env.CODEX_HOME = path.join(W.root, 'shared-codex');   // the codex seeder's shared home: the scratch one, never a real ~/.codex
  const cxSub = (name) => { const { id } = am.createCodexSubscription({ name }); fs.writeFileSync(path.join(am.codexSubDir(id), 'auth.json'), J({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name } })); return id; };
  const A = cxSub('Codex A'), B = cxSub('Codex B'), C = cxSub('Codex C');
  const CP = am.createPool({ name: 'codex pool', backend: 'codex' }).id; am.setPoolTarget(CP, A);
  const s = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'sess-rt-codex', _accountId: CP, _heldPoolMember: A, _heldPoolOrigin: 'stamp', pty: { write() { } }, name: 'codex', createdAt: Date.now() };
  let r = null, err = null;
  try {
    await sleep(3); am.setPoolTarget(CP, B); await sleep(3);   // a cold move of the pool's link (a codex pool has no per-conversation link): the process still holds A
    s._isStreaming = true; s._turnState = 'running'; TS.noteRequestSent(s, Date.now()); await sleep(3);   // the request leaves — on A
    am.setPoolTarget(CP, C); await sleep(3);
    r = W.eng.requestSlotFor(s);
  } catch (e) { err = e.message; }
  ok('M1 (a held process): the request of a process that holds its spawn login is that login\'s — the link moved cold before it and again after it, and the answer is the held member, never the member the link named at the request (6d5e94692: that member)', !!r && r.key === A, J({ got: r && r.key, A, B, C, err }));
}
{
  // M1 — a row that moved nothing (a re-link to the same member) is no move: the first REAL move after the request names its account
  const W = mkWorld();
  W.out(); await sleep(3);                                                    // the request leaves on MA
  // a row MA → MA: the ledger keeps a same-member row a minute after the one before it (DEDUP_MS) — written here as it stores one
  fs.appendFileSync(W.am.slotTransitions.file, J({ sessionId: W.session._webuiId, poolId: W.P, from: W.MA, to: W.MA, at: Date.now(), why: 'session-link' }) + '\n'); await sleep(3);
  W.move(W.MB); await sleep(3);                                               // the real move, after the request
  const r = W.eng.requestSlotFor(W.session);
  ok('M1 (a same-member row): a re-link to the same member after the request is no move — the request is still MA\'s, not the member the link names now (6d5e94692: MB)', !!r && r.key === W.MA, J({ got: r && r.key, MA: W.MA, MB: W.MB }));
}
{
  // M1 — a SUB-AGENT's request after a mid-turn move goes out on the new member (P0: the next request reads the new credential);
  // its tool result is the record that says so, and its reading lands on the member that request went out on
  const W = mkWorld();
  W.out(); await sleep(3);                       // the main thread's request (MA) — it launches a sub-agent
  W.move(W.MB); await sleep(3);                  // the pool moves the conversation mid-turn
  const sub = { type: 'user', parent_tool_use_id: 'toolu_rt_sub', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_rt_s1', content: 'ok' }] } };
  const turnStart = W.session._turnStartedAt;
  if (typeof TS.sendsSubRequest === 'function' && TS.sendsSubRequest(sub)) TS.noteSubRequestSent(W.session, Date.now());   // the parse's and the device feed's call
  await sleep(3); W.reading(0.2);
  const parse = read('src/server/stdout/claude-stream-json.js'), brain = read('src/server/session-brain.js');
  const WIRE = /if \(sendsSubRequest\(msg\) && !recordIsLate\?\.\(session, msg\)\) noteSubRequestSent\(session, Date\.now\(\)\);/;
  ok('M1 (a sub-agent\'s request): the sub-agent\'s tool result after a mid-turn move stamps its request-out — its reading lands on MB, the member it went out on; MA keeps its own (6d5e94692: stamped nothing, so the reading was MA\'s and its fall held) — both feeds make the call, sendsRequest stays the main thread\'s, and the conversation\'s own turn start is left alone',
    W.u7(W.MB) === 0.2 && W.u7(W.MA) === FX.before.MA && WIRE.test(parse) && WIRE.test(brain) && TS.sendsRequest(sub) === false && turnStart > 0 && W.session._turnStartedAt === turnStart, J({ mb: W.u7(W.MB), ma: W.u7(W.MA), parse: WIRE.test(parse), brain: WIRE.test(brain), turnStart, after: W.session._turnStartedAt }));
}
{
  // M2 — law 2 with the cap as the record's REPRESENTATIVE: a 2.1.274+ record states the plan 5-hour and week as well; they are a
  // reading of their own and are written — only the cap is archived (6d5e94692: the whole record dropped)
  const W = mkWorld(); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
  W.session._servedModel = 'claude-opus-5';
  W.out(); W.answer('claude-opus-5'); await sleep(3);
  const r5 = W.readCache(W.MA).fiveHour.resetsAt;
  quiet(() => W.eng.recordRateLimitEvent(W.session, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day_overage_included', utilization: 0.03, resetsAt: RCAP,
    unifiedWindows: { five_hour: { utilization: 0.27, resets_at: r5 }, seven_day: { utilization: 0.93, resets_at: W.R7 }, seven_day_overage_included: { utilization: 0.03, resets_at: RCAP } } } }));
  const c = W.readCache(W.MA), a = W.archive();
  ok('M2 (law 2, the cap the representative): the record\'s plan week and 5-hour are written (93 %, 27 %), its unasked Fable cap archived by name — never the whole record lost',
    W.u7(W.MA) === 0.93 && c.fiveHour.utilization === 0.27 && W.capOf(W.MA) === null && a.some((x) => /a fable model cap on a turn in which this hub saw no fable request to /.test(x.reason)), J({ u7: W.u7(W.MA), u5: c.fiveHour.utilization, cap: W.capOf(W.MA), a: a.map((x) => x.reason) }));
}
{
  // M2 — law 3 with the plan week as the representative that fell: the record's 5-hour did not fall and is written; only the week is held
  // — and the auto-resume edge (an ARMED waiter) is handed the record without its held lane
  const edge = [];
  const W = mkWorld(realEng, { autoResume: { statusFor: () => ({ armed: true }), noteQuotaReading: (id, snap) => { edge.push(snap); return { open: true }; } } });
  W.move(W.MC); await sleep(3); W.move(W.MA); await sleep(3);
  W.out(); await sleep(3);
  const r5 = W.readCache(W.MA).fiveHour.resetsAt;
  quiet(() => W.eng.recordRateLimitEvent(W.session, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.13, resetsAt: W.R7,
    unifiedWindows: { five_hour: { utilization: 0.37, resets_at: r5 }, seven_day: { utilization: 0.13, resets_at: W.R7 } } } }));
  const o = W.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('M2 (law 3, the representative fell): the week is held (91 % kept, an unconfirmed fall said) and the same record\'s 5-hour, which did not fall, is written (37 %) — never held with it',
    W.u7(W.MA) === 0.91 && !!o && o.state === 'fall-unconfirmed' && W.readCache(W.MA).fiveHour.utilization === 0.37, J({ u7: W.u7(W.MA), u5: W.readCache(W.MA).fiveHour.utilization, o }));
  ok('…and the resume edge is handed that record WITHOUT its held lane (its 5-hour, never the week that fell)', edge.length > 0 && edge.every((x) => !x.sevenDay) && edge.some((x) => x.fiveHour && x.fiveHour.utilization === 0.37), J(edge));
}
{
  // M2 — a hub restart inside a turn keeps neither the turn's asks nor its request's instant: law 2 cannot judge, so it refuses nothing
  const W = mkWorld(); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
  W.session._isStreaming = true; W.session._turnState = 'running';   // restored running; no request of this hub's life is known
  W.capReading(0.93, W.R7, 0.71, RCAP);
  ok('M2 (a restart mid-turn): with no request and no asks known, the turn\'s Fable cap is written (71 %) and nothing archived — unjudged, never refused (6d5e94692: archived as «asked for no fable request», a false reason)',
    W.capOf(W.MA) === 0.71 && W.archive().length === 0, J({ cap: W.capOf(W.MA), a: W.archive().map((x) => x.reason) }));
}
{
  // M4 — a person claimed the week reset; the pool moved a conversation onto the account; its first reading shows the fall. The press
  // IS law 3's confirmation: the fall is taken (and settles the claim), never held as «it counts as 91 %» while the pool reads it reset
  const W = mkWorld();
  const RC = require(path.join(REPO, 'src/usage-reset-claim.js')).at(path.join(W.root, 'data'));
  const cl = RC.claim(W.MA, ['plan:7d'], W.readCache(W.MA));
  W.move(W.MC); await sleep(3); W.move(W.MA); await sleep(3);
  W.out(); await sleep(3); W.reading(0.05);
  const outs = W.outcomesOf(W.MA).filter((x) => x.lane === 'plan:7d');
  ok('M4 (a standing reset claim): the moved conversation\'s fall on a lane a person claimed reset is taken (5 %), the claim settled — no «not confirmed yet; it counts as 91 %» said',
    !!cl && cl.ok && W.u7(W.MA) === 0.05 && !outs.some((x) => x.state === 'fall-unconfirmed') && !RC.get(W.MA), J({ cl, u7: W.u7(W.MA), outs, claim: RC.get(W.MA) }));
}
console.log('THE BOUNDED CHECK (主开发 13:21Z) — a conversation\'s creation is no re-point; law 3\'s end on a skewed clock');
{
  // THE MUST: the account manager writes a new conversation's link row from the pool's DEFAULT member to the member it was placed
  // on (why: spawn). A new process never sent a request on another member, so its first reading's fall is taken at once — ROW R
  // holds only because its conversation sits on the default
  const W = mkWorld();
  const s3 = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-rt-3', claudeSessionId: 'cid-rt-3', _accountId: W.P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'w3' };
  W.am.ensureSessionPoolLink(W.P, 'sess-rt-3', W.MB, { why: 'spawn' }); await sleep(3);   // placed OFF the default (MA): a row MA → MB, its why the spawn
  s3._isStreaming = true; s3._turnState = 'running'; TS.noteRequestSent(s3, Date.now()); await sleep(3);
  quiet(() => W.eng.recordRateLimitEvent(s3, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.05, resetsAt: W.R7 } }));
  const o = W.outcomesOf(W.MB).find((x) => x.lane === 'plan:7d');
  ok('THE MUST (a new conversation placed off the pool\'s default): its first reading\'s fall is taken at once (12 → 5 %, a reset a reading shows) — its spawn row moved nothing, so nothing is held',
    W.u7(W.MB) === 0.05 && !!o && o.state === 'reset-seen', J({ u7: W.u7(W.MB), o }));
}
{
  // LAW 3's END on a skewed clock: the store's own clock past the window's reset ends the hold, a minute short of it keeps it; and a
  // RELOAD keeps the held fall and its until. Copies of the store file, so the engine's own store is never written by a second one
  const W = await heldWorld();
  const RCm = require(path.join(REPO, 'src/usage-reset-claim.js'));
  const live = RCm.at(path.join(W.root, 'data')); await live.flush();
  const o = live.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  let n = 0;
  const storeAt = (t) => { const f = path.join(W.root, `reset-claims-copy-${++n}.json`); fs.copyFileSync(live.file, f); return RCm.create({ file: f, now: () => t, log: () => { } }); };
  const held = (st) => ((st.forClients()[W.MA] || {}).outcomes || []).some((x) => x.lane === 'plan:7d' && x.state === 'fall-unconfirmed');
  const short = !!o && held(storeAt(o.until - 60e3)), past = !!o && held(storeAt(o.until + 60e3));
  ok('LAW 3\'s END (the clock past the window\'s reset): the held fall is gone past its until, kept a minute short of it', !!o && short && !past, J({ o, short, past }));
  const re = storeAt(Date.now()).outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('…a RELOAD of the store keeps the held fall and its until (the window\'s own reset)', !!re && re.state === 'fall-unconfirmed' && re.until === W.R7 * 1000, J(re));
}
{
  // …the moved conversation's reading PAST its ten minutes is taken: the same world, its ledger rows ten minutes and a second older
  // (the clock skewed on the moves, not on the reading)
  const W = mkWorld(); W.move(W.MC); await sleep(3); W.move(W.MA); await sleep(3);
  const f = W.am.slotTransitions.file;
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => ({ ...r, at: r.at - readingLag.SHADOW_MS - 1000 }));
  fs.writeFileSync(f, rows.map((r) => J(r)).join('\n') + '\n');
  W.out(); await sleep(3); W.reading(0.13);
  const o = W.outcomesOf(W.MA).find((x) => x.lane === 'plan:7d');
  ok('…the moved conversation\'s reading past its ten minutes is taken (91 → 13 %, a reset a reading shows), never held', W.u7(W.MA) === 0.13 && !!o && o.state === 'reset-seen', J({ u7: W.u7(W.MA), o }));
}
console.log('THE ASK (主开发 16:41Z) — a model request\'s ask is recorded only under a KNOWN request\'s account');
// three scenes on one engine: a stand-in restart with no request known; the over-defence control after the first stamp; and the
// unit's own complaint (the pool moved the conversation, an answer of another family came before the first stamp)
const askLeg = async (engMod) => {
  const r = {};
  {
    const W = mkWorld(engMod); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
    W.session._isStreaming = true; W.session._turnState = 'running';   // restored running: no request of this hub's life is known
    W.answer('claude-fable-5');
    r.asks = W.session._turnAsks || null;
    r.noAsk = !r.asks || !Object.keys(r.asks).length;
    W.capReading(0.93, W.R7, 0.71, RCAP); r.filedUnjudged = W.capOf(W.MA) === 0.71 && W.archive().length === 0;
  }
  {
    const W = mkWorld(engMod); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP);
    W.session._isStreaming = true; W.session._turnState = 'running';
    W.out(); await sleep(3);   // the first stamped request: the conversation's own model (Fable) on the request's account
    W.capReading(0.93, W.R7, 0.71, RCAP); r.ownFamilyFiled = W.capOf(W.MA) === 0.71 && W.archive().length === 0;
  }
  {
    const W = mkWorld(engMod); const RCAP = W.R7 - 3600; W.stampCap(W.MB, W.R7, RCAP);
    W.session._servedModel = 'claude-opus-5'; W.session._isStreaming = true; W.session._turnState = 'running';
    W.move(W.MB); await sleep(3);    // the pool moved the conversation while no request was known
    W.answer('claude-fable-5');      // an answer of ANOTHER family (in flight on the member left) before the first stamp
    W.out(); await sleep(3);         // the first stamped request leaves on MB
    W.capReading(0.93, W.R7, 0.71, RCAP); r.capOnMoved = W.capOf(W.MB);
    r.notTakenOnMoved = r.capOnMoved === null;
  }
  return r;
};
{
  const r = await askLeg(realEng);
  ok('THE ASK (a stand-in restart, no request known): an answered request records NO ask, and a cap reading of that family is filed (unjudged, as the release files it)', r.noAsk && r.filedUnjudged, J(r));
  ok('…the over-defence control: after the first stamped request the conversation\'s own family is judged asked — its cap filed, nothing archived', r.ownFamilyFiled, J(r));
  ok('…and an answer of another family before the first stamp keys no ask to the member the pool moved to — that family\'s cap is not taken there', r.notTakenOnMoved, J(r));
}
console.log('MUTANTS — law 1, each red by name');
{
  const src = read(ENG);
  const REQ = '  const req = requestSlotFor(session, at);\n';
  const STOP = '    if (stop && !conversationInTurn({ isStreaming: session._isStreaming, turnState: session._turnState })) { session._turnReadingSlot = null; session._turnAsks = null; }\n';
  const MOVE = '        if (!conversationInTurn({ isStreaming: s2._isStreaming, turnState: s2._turnState })) s2._turnReadingSlot = null;\n';
  const mut = (edits, tag) => { let t = src; for (const [a, b] of edits) { if (!t.includes(a)) return null; t = t.split(a).join(b); } return require(MUT.write(ENG, t, tag)); };
  // (a) the request stamp alone gone: the reading of the request IN FLIGHT at a move lands on the member the link names NOW
  const ma = mut([[REQ, '  const req = null;\n']], 'no-request');
  let a = null;
  if (ma) { const W = mkWorld(ma); W.out(); await sleep(3); W.move(W.MB); await sleep(3); W.reading(0.902); a = { MA: W.u7(W.MA), MB: W.u7(W.MB) }; }
  ok('MUTANT (law 1, the request): the reading filed by the link NOW instead of its request\'s account ⇒ the answer to the request in flight at a move lands on the NEW member', !!a && a.MB === 0.902 && a.MA !== 0.902, J(a));
  // (b) d64075ba4's road whole — no request stamp and no turn-ending road clears the pin: the second member's numbers land on the first
  const mb = mut([[REQ, '  const req = null;\n'], [STOP, ''], [MOVE, '']], 'pin-only');
  const W = mb ? mkWorld(mb) : null;
  if (W) await replay(W, FX.steps);
  ok('MUTANT (law 1, the pins): readings filed by a turn pin that a trailing reading re-made and no stop ended ⇒ the episode\'s replay files the second member\'s numbers on the first — the second member is never told its own (law 3 then holds the first one\'s fall)', !!W && W.u7(W.MB) === FX.before.MB && W.u7(W.MA) !== 0.11, J(W && { MA: W.u7(W.MA), MB: W.u7(W.MB) }));
}
{
  const src = read(ENG);
  const L2 = "&& ev.modelCapName && !turnAskedFamily(session, writeKey, ev.modelCapName)) {";
  const m = src.includes(L2) ? require(MUT.write(ENG, src.split(L2).join('&& false) {'), 'no-law2')) : null;
  let got = null;
  if (m) { const W = mkWorld(m); const RCAP = W.R7 - 3600; W.stampCap(W.MA, W.R7, RCAP); W.session._servedModel = 'claude-opus-5'; W.out(); W.answer('claude-opus-5'); await sleep(3); W.capReading(0.902, W.R7, 0.03, RCAP); got = W.capOf(W.MA); }
  ok('MUTANT (law 2, red by name): a cap lane taken whatever the turn asked ⇒ the Opus turn\'s record writes its 3 % as the account\'s Fable cap', got === 0.03, J({ got }));
}
{
  const src = read(ENG);
  const L3 = "    if (!row) return null;   // a producer that was not moved: its fall is its own confirmation\n";
  const m = src.includes(L3) ? require(MUT.write(ENG, src.split(L3).join('    return null;\n'), 'no-law3')) : null;
  let got = null;
  if (m) { const W = mkWorld(m); W.move(W.MC); await sleep(3); W.move(W.MA); await sleep(3); W.out(); await sleep(3); W.reading(0.13); got = W.u7(W.MA); }
  ok('MUTANT (law 3, red by name): every fall taken at once ⇒ the moved conversation\'s 13 % becomes the account\'s number («the weekly limit was reset»)', got === 0.13, J({ got }));
}
{
  const src = read(ENG);
  const CURE = "    const k = (requestSlotFor(session) || {}).key; if (!k) return;\n";
  const m = src.includes(CURE) ? require(MUT.write(ENG, src.split(CURE).join("    const k = (requestSlotFor(session) || wallSlotFor(session)).key; if (!k) return;\n"), 'ask-fallback')) : null;
  const r = m ? await askLeg(m) : null;
  ok('MUTANT (the ask\'s fresh-slot fallback back, red by name): with no request known the answered request\'s ask is keyed to the link NOW — recorded, and the moved conversation\'s other-family cap is taken on the member it was moved to', !!r && !r.noAsk && !r.notTakenOnMoved, J(r));
}
console.log('B-6a92 — a conversation in NO pool whose login answers as ANOTHER known account (主开发 r560): its window is never re-anchored onto that account\'s, its numbers never filed, the row says so by name');
{
  const WS = require(path.join(REPO, 'src/window-stamp.js'));
  const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
  const held = (engMod = realEng, { ownReading = true, again = null, ro = null, cli = null } = {}) => {
    // `again`: the same data folder and accounts under a FRESH engine (a restart: no in-memory window cache)
    const root = again ? again.root : endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-held-')));
    const dataDir = path.join(root, 'data');
    const am = again ? again.am : new AccountManager({ dataDir });
    const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    const V = again ? again.V : am.createSubscription({ name: 'Vela' }).id; if (!again) login(V);
    const O = again ? again.O : am.createSubscription({ name: 'Orin' }).id; if (!again) login(O);
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000), RV = again ? again.RV : nowS + 2 * 86400, RO = again ? again.RO : (ro || nowS + 5 * 86400), RX = again ? again.RX : nowS + 3 * 86400 + 11 * 3600;
    if (!again && ownReading) fs.writeFileSync(path.join(cacheDir, V + '.json'), J({ fetchedAt: Date.now() - 3600e3, source: 'cli-usage', sevenDay: { utilization: 0.2, resetsAt: RV } }));   // Vela's OWN last reading
    fs.writeFileSync(path.join(cacheDir, O + '.json'), J({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: RO } }));
    if (!again) for (const [id, r] of [[V, RV], [O, RO]]) fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(id)), J({ at: Date.now(), source: 'on-demand', sevenDay: r }));
    // r5: each row's API witness established on its own window, as a row that has read before holds it (the panel's door judges against it)
    if (!again) for (const [id, r] of [[V, RV], [O, RO]]) fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(id)), J({ sevenDay: r, scoped: {}, at: Date.now() - 7200e3, sessionId: null, source: 'rate-limit-events', n: 3, ring: [] }));
    const sessions = new Map();
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const eng = engMod.create({ app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
      serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
    const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-held', claudeSessionId: 'cid-held', _accountId: V, pty: { write() { } }, name: 'h' };   // billed to Vela, in no pool
    sessions.set('sess-held', s);
    const reading = (u, r7) => { s._isStreaming = true; s._turnState = 'running'; TS.noteRequestSent(s, Date.now()); quiet(() => eng.recordRateLimitEvent(s, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: r7 } })); };
    const readJ = (f) => { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')); } catch { return null; } };
    // the REAL usage route over the same account manager and engine (the scene's wiring: a stub app, the engine's own doors)
    const routes = {};
    const rapp = { get: (p0, h) => { routes['GET ' + p0] = h; }, post() { }, put() { }, delete() { }, use() { }, locals: app.locals };   // ONE app, as the hub has: the engine's doors on its locals
    const api = quiet(() => setupUsage({ app: rapp, accounts: am, hosts: null, usageHistory: null, activeSessions: sessions, serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'nocodex'), META_DIR: path.join(root, 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(root, 'buffers'), apiDerivedWindow: eng.apiDerivedWindow, establishedWindows: eng.establishedWindows, ...(cli ? { CLAUDE_CMD: cli } : {}) }));
    const usage = () => { const res = { body: null, json(o) { this.body = o; return this; }, status() { return this; } }; quiet(() => routes['GET /api/usage']({ query: {}, headers: {} }, res)); return res.body; };
    return { root, am, eng, api, V, O, RV, RO, RX, cacheDir, reading, own: () => readJ(V + '.json'), stamp: () => readJ(readingLag.windowSidecarName(V)), wit: () => readJ(readingLag.apiWindowSidecarName(V)), usage };
  };
  // c2b: SIX readings in a row, every one with Orin's window, on a conversation billed to Vela
  const run6 = async (H) => { for (let i = 0; i < 6; i++) { H.reading(0.81, H.RO); await sleep(3); } };
  const H = held();
  await run6(H);
  const ring = (H.wit() && H.wit().ring) || [];
  const named = ring.filter((e) => Array.isArray(e.names) && e.names.includes(H.O)).length;
  const own = H.own(), st = H.stamp(), f = (H.eng.apiDerivedWindow(H.V, { witness: true }) || {}).foreign;
  console.log(`    the ring: ${ring.length} entries, ${named} naming Orin's window; Vela's stamp ${st && st.sevenDay} (its own ${H.RV}); Vela's file ${J(own && own.sevenDay)}`);
  ok('B-6a92 the guard\'s verdict reaches the ring: each archived reading NAMES the account whose window it carries (≥ K of them)', named >= 3, ring);
  ok('B-6a92 NOTHING MOVES: Vela\'s established window stays its own after six readings of Orin\'s window (no re-anchor)', st && st.sevenDay === H.RV, st);
  ok('B-6a92 NOTHING IS FILED: Vela\'s file keeps its OWN last reading — never Orin\'s numbers (0.81) or window', own && own.sevenDay && own.sevenDay.utilization === 0.2 && own.sevenDay.resetsAt === H.RV, own);
  ok('B-6a92 the row\'s own window is UNKNOWN, by the other account: the witness names Orin', f && Array.isArray(f.names) && f.names[0] === H.O, f);
  const u = H.usage(), wu = u && u.accounts && u.accounts[H.V] && u.accounts[H.V].windowUnknown;
  ok('B-6a92 the usage route carries it on Vela\'s row with the name the person gave Orin — never an address', wu && wu.otherNames && wu.otherNames[0] === 'Orin' && !J(wu).includes('@') && !(u.accounts[H.O] && u.accounts[H.O].windowUnknown), wu);
  // THE POOL (主开发 r560 item 3): what the pool engine reads for that member while its window is unknown
  const pv = H.eng.poolReadCache(null)(H.V);
  ok('B-6a92 THE POOL reads Vela\'s OWN last reading (its age said by its fetchedAt) — never the other account\'s numbers', pv && pv.sevenDay && pv.sevenDay.utilization === 0.2 && pv.sevenDay.resetsAt === H.RV, pv && pv.sevenDay);
  // r5: A RUN SHORTER THAN K (one reading of a third window) rewrites the sidecar and KEEPS the hold — the words never vanish unproven
  H.reading(0.5, H.RX); await sleep(3);
  const hF = H.wit() && H.wit().foreign, hWu = (() => { const u5 = H.usage(); return u5 && u5.accounts && u5.accounts[H.V] && u5.accounts[H.V].windowUnknown; })();
  ok('B-6a92 a run shorter than K (one reading of another window) keeps the hold: the sidecar and the row still name Orin', !!(hF && hF.names[0] === H.O && hWu && hWu.otherNames[0] === 'Orin'), { hF, hWu });
  const H0 = held(realEng, { ownReading: false });
  await run6(H0);
  const pv0 = H0.eng.poolReadCache(null)(H0.V);
  ok('B-6a92 THE POOL with no reading of Vela\'s own: UNKNOWN (no weekly numbers) — as any member with no reading, never Orin\'s', !(pv0 && pv0.sevenDay && Number.isFinite(pv0.sevenDay.utilization)), pv0);
  // RED CONTROL: the ring that weighs a phase alone (the hold removed) — Vela re-anchored onto Orin's window, Orin's numbers filed on Vela
  const src = read(ENG);
  const HOLD = "      if (moved && heldBy.length) {\n";
  const mRed = src.includes(HOLD) ? require(MUT.write(ENG, src.split(HOLD).join("      if (false) {\n"), 'b6a92-no-hold')) : null;
  const R = mRed ? held(mRed) : null;
  if (R) await run6(R);
  const rOwn = R && R.own(), rSt = R && R.stamp();
  ok('B-6a92 RED CONTROL (the hold removed): Vela re-anchored onto Orin\'s window and Orin\'s numbers filed on Vela\'s row — the row\'s harm', !!R && rSt && rSt.sevenDay === R.RO && rOwn && rOwn.sevenDay && rOwn.sevenDay.utilization === 0.81, { rSt, rOwn: rOwn && rOwn.sevenDay });
  // ── r5 (主开发 r677) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const sideOf = (u, id) => (u && u.accounts && u.accounts[id] && u.accounts[id].windowUnknown) || null;
  // THE STANDING IDENTITY REPAIR OVER THE HELD SCENE (THE MUST): it runs at the start, every hour and on its own route — the REAL
  // repair over the same data folder: the row's stamp, its file and its words all stand
  const RP = require(path.join(REPO, 'src/reading-repair.js'));
  const repairOver = (W, mod = RP) => quiet(() => mod.repairSidecarsByApiPhase({ dataDir: path.join(W.root, 'data'), accounts: W.am.list().accounts }));
  const G = held();
  await run6(G);
  const gRep = repairOver(G);
  const gRow = ((gRep && gRep.identities) || []).find((r) => r.key === G.V) || {};
  const gSt = G.stamp(), gOwn = G.own(), gWit = G.wit(), gWu = sideOf(G.usage(), G.V);
  const G2 = held(realEng, { again: G });   // …and a restarted hub, reading the hold back from the sidecar the repair left
  const g2Wu = sideOf(G2.usage(), G2.V);
  ok('B-6a92 THE REPAIR (the must): the standing identity repair counts NONE of the readings the guard found to name Orin as Vela\'s evidence', !!gRow.sources && gRow.sources.named >= 3 && gRow.sources.archived === 0, gRow);
  ok('B-6a92 THE REPAIR: Vela\'s stamp stays its own and its file keeps its own last reading — no restamp, no readmit of Orin\'s numbers', gSt && gSt.sevenDay === G.RV && gOwn && gOwn.sevenDay && gOwn.sevenDay.utilization === 0.2 && gOwn.sevenDay.resetsAt === G.RV, { gSt, own: gOwn && gOwn.sevenDay, row: gRow });
  ok('B-6a92 THE REPAIR: the row\'s words stand — the sidecar keeps Orin\'s name, the route says it, and so does a restarted hub', !!(gWit && gWit.foreign && gWit.foreign.names[0] === G.O && gWu && gWu.otherNames[0] === 'Orin' && g2Wu && g2Wu.otherNames[0] === 'Orin'), { foreign: gWit && gWit.foreign, gWu, g2Wu });
  // RED CONTROL: the release's repair (the two skips removed) — Vela restamped onto Orin's window, Orin's numbers written back on its row
  const RREL = 'src/reading-repair.js', rsrc = read(RREL);
  const SKIP1 = "    if (namedOthers(x, key).length) { sources.named++; continue; }\n";
  const SKIP2 = "        if (namedOthers(x, key).length) return false;   // B-6a92 r5: another known account's reading is never written back on this row\n";
  const mRep = rsrc.includes(SKIP1) && rsrc.includes(SKIP2) ? require(MUT.write(RREL, rsrc.split(SKIP1).join('').split(SKIP2).join(''), 'b6a92-release-repair')) : null;
  const GR = held();
  await run6(GR);
  if (mRep) repairOver(GR, mRep);
  const grSt = GR.stamp(), grOwn = GR.own();
  ok('B-6a92 RED CONTROL (the release\'s repair): Vela restamped onto Orin\'s window and Orin\'s numbers written back on Vela\'s row — the hold undone within the hour', !!mRep && !!(grSt && grSt.sevenDay === GR.RO && grOwn && grOwn.sevenDay && grOwn.sevenDay.utilization === 0.81), { grSt, own: grOwn && grOwn.sevenDay });
  // THE HELD ROW'S DOOR (ruled in 1): the person's ⟳ on Vela — the /usage panel through Vela's OWN credential (a stand-in CLI that
  // prints a panel) — answering in the window its readings were held on (an honest shared window) is the row's proven read
  const hush = async (fn) => { const o = console.log, w = console.warn, said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = () => { }; try { return { v: await fn(), said }; } finally { console.log = o; console.warn = w; } };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const panelText = (t, pct) => { const d = new Date(t * 1000), h = d.getUTCHours(); return `You are currently using your subscription to power your Claude Code usage\n\nCurrent week (all models): ${pct}% used · resets ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${h % 12 || 12}${h < 12 ? 'am' : 'pm'} (UTC)\n`; };
  const binDir = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-cli-')));
  const standIn = (name, text) => { const f = path.join(binDir, name); fs.writeFileSync(f, `#!/bin/sh\ncat <<'PANEL'\n${text}PANEL\n`, { mode: 0o755 }); return f; };
  const { parseCliUsageText } = require(path.join(REPO, 'src/usage-routes.js'));
  const hourAt = (sec) => Math.ceil((Math.floor(Date.now() / 1000) + sec) / 3600) * 3600;
  const roP = hourAt(5 * 86400), tP = panelText(roP, 12);
  const parsedP = parseCliUsageText(tP);
  ok('B-6a92 SETUP: the stand-in panel parses to the held window exactly', !!(parsedP && parsedP.sevenDay && parsedP.sevenDay.resetsAt === roP), parsedP);
  const P = held(realEng, { ro: roP, cli: standIn('claude-panel-held.sh', tP) });
  await run6(P);
  const pBefore = sideOf(P.usage(), P.V);
  const pr = await hush(() => P.api.refreshViaCliPanel(P.V));
  const pSt = P.stamp(), pOwn = P.own(), pWit = P.wit(), pWu = sideOf(P.usage(), P.V);
  ok('B-6a92 THE DOOR: Vela\'s own ⟳ read answering in the held window is written (true), the stamp moves there BY ITS OWN READ, and the hold ends in that turn (sidecar and route)', !!pBefore && pr.v === true && !!(pSt && pSt.sevenDay === roP && pSt.verifiedBy === 'own-panel') && !!pWit && !pWit.foreign && !pWu, { pBefore, v: pr.v, pSt, wit: pWit && { sevenDay: pWit.sevenDay, foreign: pWit.foreign }, pWu, said: pr.said.filter((l) => /window|panel/.test(l)).slice(0, 4) });
  ok('B-6a92 THE DOOR: the numbers are the row\'s own read (its panel\'s 12%), never the other account\'s 81%', !!(pOwn && pOwn.sevenDay && pOwn.sevenDay.utilization === 0.12 && pOwn.sevenDay.resetsAt === roP), pOwn && pOwn.sevenDay);
  P.reading(0.4, P.RO); await sleep(3);
  const pOwn2 = P.own();
  ok('B-6a92 THE DOOR: from then on the row\'s readings in that shared window WRITE on it (honest sharing converges)', !!(pOwn2 && pOwn2.sevenDay && pOwn2.sevenDay.utilization === 0.4 && pOwn2.sevenDay.resetsAt === roP), pOwn2 && pOwn2.sevenDay);
  // …a held row's panel answering a THIRD window is refused (nothing written, the hold stands), and its words say what is true
  const Q = held(realEng, { cli: standIn('claude-panel-third.sh', panelText(hourAt(3 * 86400 + 11 * 3600), 7)) });
  await run6(Q);
  const qr = await hush(() => Q.api.refreshViaCliPanel(Q.V));
  const qv = Q.api.panelVerdictFor(Q.V) || {}, qWu = sideOf(Q.usage(), Q.V), qOwn = Q.own();
  ok('B-6a92 THE DOOR, refused: a panel answering neither window writes nothing, the hold stands, and its words name the hold and the one road that ends it — never «re-anchor it automatically»', qr.v === false && !!qWu && /own weekly window is unknown: its readings name Orin's window/.test(String(qv.why)) && !/re-anchor it automatically/.test(String(qv.why)) && !!(qOwn && qOwn.sevenDay && qOwn.sevenDay.utilization === 0.2), { v: qr.v, why: qv.why, qWu, own: qOwn && qOwn.sevenDay });
  // NO FILE IS READ ON A POLL (ruled in 2): the stamps and witness sidecars, counted over ten polls of the usage route (each its
  // own run) after the first ask of each row since the start — none: the held window and the roster's stamps are memory
  const T = held();
  await run6(T);
  T.usage();
  const SIDE = [readingLag.windowSidecarName(''), readingLag.apiWindowSidecarName('')];
  const realRead = fs.readFileSync, seen = [];
  fs.readFileSync = function (p0, ...a) { try { if (typeof p0 === 'string' && SIDE.some((x) => path.basename(p0).startsWith(x))) seen.push(path.basename(p0)); } catch { } return realRead.call(this, p0, ...a); };
  let premise = 0, tWu = null;
  try {
    await sleep(1); T.eng.apiDerivedWindow(T.V, { witness: true }); premise = seen.length; seen.length = 0;   // PREMISE: the counter sees the sidecar's own road
    for (let i = 0; i < 10; i++) { await sleep(1); tWu = sideOf(T.usage(), T.V); }
  } finally { fs.readFileSync = realRead; }
  ok('B-6a92 NO FILE READ ON A POLL: ten polls of the usage route read no stamp and no witness sidecar (the premise: the counter sees a sidecar read), and the row still says Orin', premise > 0 && seen.length === 0 && !!(tWu && tWu.otherNames[0] === 'Orin'), { premise, seen: seen.slice(0, 6), tWu });
  // A MOVE ONTO A PHASE NO KNOWN ACCOUNT HOLDS is as today: K readings re-anchor it
  const X = held();
  for (let i = 0; i < 4; i++) { X.reading(0.33, X.RX); await sleep(3); }
  const xSt = X.stamp(), xF = (X.eng.apiDerivedWindow(X.V, { witness: true }) || {}).foreign;
  ok('B-6a92 a move onto a phase NO known account holds re-anchors at K, as today (a genuine plan change), and nothing is unknown', xSt && xSt.sevenDay === X.RX && !xF, { xSt, xF });
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
