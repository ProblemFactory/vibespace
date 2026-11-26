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
//
// B-6a92's TABLE (the held row's door), its reach said plainly (主开发 r1034): the oracle is REAL on the truth side — laws a, c, e
// judge the verdict against the true accounts a world was drawn from; on «the facts suffice» — laws b, d, f and the cannot-tell
// count — it restates the verdict's own conditions (the same address, the row's own field). The generator never draws one
// address in two organisations (every true account has its own address): that limit is named in the kb, not drawn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { endScratchAtExit, anchored } from './scratch.mjs';
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
// B-6a92 r8 (the round's should): ONE stand-in HOME for the whole suite — no leg reads the runner's own home (the panel's reads of
// the machine's own login around the probe included); a leg that needs a home login seeds its own under this one
process.env.HOME = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-home-')));
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
  const held = (engMod = realEng, { ownReading = true, again = null, ro = null, cli = null, logins = null, routesMod = null, withGlobal = false, rowOrg = null, globalOrg = null, amOpts = null } = {}) => {
    // `again`: the same data folder and accounts under a FRESH engine (a restart: no in-memory window cache)
    const root = again ? again.root : endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-held-')));
    const dataDir = path.join(root, 'data');
    const am = again ? again.am : new AccountManager({ dataDir, ...(amOpts || {}) });   // `amOpts`: e.g. a file door the leg holds (r2809)
    const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    const V = again ? again.V : am.createSubscription({ name: 'Vela' }).id; if (!again) login(V);
    const O = again ? again.O : am.createSubscription({ name: 'Orin' }).id; if (!again) login(O);
    // r6: whose login each sign-in folder holds (the CLI's own .claude.json beside the credentials) — invented identities
    if (!again && logins) for (const [id, who] of [[V, logins.V], [O, logins.O]]) if (who) fs.writeFileSync(path.join(am.subDir(id), '.claude.json'), J({ oauthAccount: { emailAddress: who.email, organizationUuid: who.org } }), { mode: 0o600 });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000), RV = again ? again.RV : nowS + 2 * 86400, RO = again ? again.RO : (ro || nowS + 5 * 86400), RX = again ? again.RX : nowS + 3 * 86400 + 11 * 3600;
    // r8 `rowOrg`: Vela's cache names ITS OWN organisation (the group's key, an identity of its own apart from its folder)
    if (!again && ownReading) fs.writeFileSync(path.join(cacheDir, V + '.json'), J({ fetchedAt: Date.now() - 3600e3, source: 'cli-usage', sevenDay: { utilization: 0.2, resetsAt: RV }, ...(rowOrg ? { orgUuid: rowOrg } : {}) }));   // Vela's OWN last reading
    // r7 `withGlobal`: the HUB'S OWN LOGIN ('__global__', a cache file and its stamp like any other) holds the window Orin held, and
    // Orin moves to a window of its own — the held name is then the hub's own login
    const RZ = nowS + 6 * 86400 + 5 * 3600, ROo = withGlobal && !again ? RZ : RO;
    fs.writeFileSync(path.join(cacheDir, O + '.json'), J({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: ROo } }));
    if (withGlobal && !again) {
      fs.writeFileSync(path.join(cacheDir, '__global__.json'), J({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: RO }, ...(globalOrg ? { orgUuid: globalOrg } : {}) }));   // r8 `globalOrg`: the hub's login's organisation on file
      fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName('__global__')), J({ at: Date.now(), source: 'on-demand', sevenDay: RO }));
    }
    if (!again) for (const [id, r] of [[V, RV], [O, ROo]]) fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(id)), J({ at: Date.now(), source: 'on-demand', sevenDay: r }));
    // r5: each row's API witness established on its own window, as a row that has read before holds it (the panel's door judges against it)
    if (!again) for (const [id, r] of [[V, RV], [O, ROo]]) fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(id)), J({ sevenDay: r, scoped: {}, at: Date.now() - 7200e3, sessionId: null, source: 'rate-limit-events', n: 3, ring: [] }));
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
    const api = quiet(() => (routesMod || { setupUsage }).setupUsage({ app: rapp, accounts: am, hosts: null, usageHistory: null, activeSessions: sessions, serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir, CODEX_SESSIONS_DIR: path.join(root, 'nocodex'), META_DIR: path.join(root, 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(root, 'buffers'), apiDerivedWindow: eng.apiDerivedWindow, establishedWindows: eng.establishedWindows, ...(cli ? { CLAUDE_CMD: cli } : {}) }));
    // B-360d part 3 U3 moved the route: GET /api/usage first awaits the usage folder's fresh reply (off the loop), then answers — so the
    // answer is AWAITED here. An answer with no body throws: a «nothing unknown» leg never passes on a route that said nothing
    const usage = async () => {
      const res = { body: null, json(o) { this.body = o; return this; }, status() { return this; } };
      const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { };
      try { await routes['GET /api/usage']({ query: {}, headers: {} }, res); } finally { console.log = o; console.warn = w; }
      if (!res.body) throw new Error('B-6a92: the usage route answered no body — every row leg below would read nothing');
      return res.body;
    };
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
  const u = (await H.usage()), wu = u && u.accounts && u.accounts[H.V] && u.accounts[H.V].windowUnknown;
  ok('B-6a92 the usage route carries it on Vela\'s row with the name the person gave Orin — never an address', wu && wu.otherNames && wu.otherNames[0] === 'Orin' && !J(wu).includes('@') && !(u.accounts[H.O] && u.accounts[H.O].windowUnknown), wu);
  // THE POOL (主开发 r560 item 3): what the pool engine reads for that member while its window is unknown
  const pv = H.eng.poolReadCache(null)(H.V);
  ok('B-6a92 THE POOL reads Vela\'s OWN last reading (its age said by its fetchedAt) — never the other account\'s numbers', pv && pv.sevenDay && pv.sevenDay.utilization === 0.2 && pv.sevenDay.resetsAt === H.RV, pv && pv.sevenDay);
  // r5: A RUN SHORTER THAN K (one reading of a third window) rewrites the sidecar and KEEPS the hold — the words never vanish unproven
  H.reading(0.5, H.RX); await sleep(3);
  const hF = H.wit() && H.wit().foreign, hWu = ((u5) => u5 && u5.accounts && u5.accounts[H.V] && u5.accounts[H.V].windowUnknown)(await H.usage());
  const esrc = read(ENG);   // r6: the mutants below are made from the engine as it is
  ok('B-6a92 a run shorter than K (one reading of another window) keeps the hold: the sidecar and the row still name Orin', !!(hF && hF.names[0] === H.O && hWu && hWu.otherNames[0] === 'Orin'), { hF, hWu });
  // RED CONTROL (r6, ruled 4): the carry removed — the same one reading drops the hold and the words vanish unproven
  const CARRY = ", ...(heldFactOf(key, raw.foreign) ? { foreign: { ...raw.foreign, names: heldFactOf(key, raw.foreign).names } } : {}) };";
  const mCarry = esrc.includes(CARRY) ? require(MUT.write(ENG, esrc.split(CARRY).join(' };'), 'b6a92-no-carry')) : null;
  const HC = mCarry ? held(mCarry) : null;
  if (HC) { await run6(HC); HC.reading(0.5, HC.RX); await sleep(3); }
  const hcBefore = HC && HC.eng.apiDerivedWindow(HC.V, { held: true }).foreign, hcF = HC && HC.wit() && HC.wit().foreign;
  ok('B-6a92 RED CONTROL (the short run\'s carry removed): one reading of another window drops the hold — the leg above can fail', !!HC && !hcF && !hcBefore, { hcF, hcBefore });
  const H0 = held(realEng, { ownReading: false });
  await run6(H0);
  const pv0 = H0.eng.poolReadCache(null)(H0.V);
  ok('B-6a92 THE POOL with no reading of Vela\'s own: UNKNOWN (no weekly numbers) — as any member with no reading, never Orin\'s', !(pv0 && pv0.sevenDay && Number.isFinite(pv0.sevenDay.utilization)), pv0);
  // RED CONTROL: the ring that weighs a phase alone (the hold removed) — Vela re-anchored onto Orin's window, Orin's numbers filed on Vela
  const src = read(ENG);
  const HOLD = "      if (moved && heldBy.length) {\n";
  // r2619: since the standing check (r2543) a re-anchor onto Orin's instant is held at its stamp's write too — a second barrier, so
  // this control cuts BOTH (the ring's hold and the check) and says so in its name
  const SI_FN = 'function holdSameInstants(why, fresh = null) {\n  try {\n';
  const mRed = src.includes(HOLD) ? require(MUT.write(ENG, anchored(src.split(HOLD).join("      if (false) {\n"), SI_FN, 'function holdSameInstants(why, fresh = null) {\n  return;\n  try {\n', 'b6a92-no-standing-check'), 'b6a92-no-hold')) : null;
  const R = mRed ? held(mRed) : null;
  if (R) await run6(R);
  const rOwn = R && R.own(), rSt = R && R.stamp();
  ok('B-6a92 RED CONTROL (TWO BARRIERS CUT: the hold removed and the standing check removed): Vela re-anchored onto Orin\'s window and Orin\'s numbers filed on Vela\'s row — the row\'s harm', !!R && rSt && rSt.sevenDay === R.RO && rOwn && rOwn.sevenDay && rOwn.sevenDay.utilization === 0.81, { rSt, rOwn: rOwn && rOwn.sevenDay });
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
  const gSt = G.stamp(), gOwn = G.own(), gWit = G.wit(), gWu = sideOf((await G.usage()), G.V);
  const G2 = held(realEng, { again: G });   // …and a restarted hub, reading the hold back from the sidecar the repair left
  quiet(() => G2.eng.repairIdentityAnchors('boot'));   // r6: the start's identity repair warms the held facts (the poll reads memory only)
  const g2Wu = sideOf((await G2.usage()), G2.V);
  ok('B-6a92 THE REPAIR (the must): the standing identity repair counts NONE of the readings the guard found to name Orin as Vela\'s evidence', !!gRow.sources && gRow.sources.named >= 3 && gRow.sources.archived === 0, gRow);
  ok('B-6a92 THE REPAIR: Vela\'s stamp stays its own and its file keeps its own last reading — no restamp, no readmit of Orin\'s numbers', gSt && gSt.sevenDay === G.RV && gOwn && gOwn.sevenDay && gOwn.sevenDay.utilization === 0.2 && gOwn.sevenDay.resetsAt === G.RV, { gSt, own: gOwn && gOwn.sevenDay, row: gRow });
  ok('B-6a92 THE REPAIR: the row\'s words stand — the sidecar keeps Orin\'s name, the route says it, and so does a restarted hub', !!(gWit && gWit.foreign && gWit.foreign.names[0] === G.O && gWu && gWu.otherNames[0] === 'Orin' && g2Wu && g2Wu.otherNames[0] === 'Orin'), { foreign: gWit && gWit.foreign, gWu, g2Wu });
  // RED CONTROL: the release's repair (the two skips removed) — Vela restamped onto Orin's window, Orin's numbers written back on its row
  const RREL = 'src/reading-repair.js', rsrc = read(RREL);
  const SKIP1 = "    if (namedOthers(x, key, own).length) { sources.named++; continue; }\n";
  const SKIP2 = "        if (namedOthers(x, key, own).length) return false;   // B-6a92 r5: another known account's reading is never written back on this row\n";
  // r2619: since r2543 the repair never restamps a row onto another identity group's instant — a second barrier, so this control
  // cuts BOTH (the two skips and that guard) and says so in its name
  const NORESTAMP = "      if (apiShared.length) { sameInstantSkip(`not restamped: the phase its readings name is ${apiShared.map(personName).join(', ')}'s to the second`); continue; }\n";
  const mRep = rsrc.includes(SKIP1) && rsrc.includes(SKIP2) ? require(MUT.write(RREL, anchored(rsrc.split(SKIP1).join('').split(SKIP2).join(''), NORESTAMP, '', 'b6a92-release-repair-guard'), 'b6a92-release-repair')) : null;
  const GR = held();
  await run6(GR);
  if (mRep) repairOver(GR, mRep);
  const grSt = GR.stamp(), grOwn = GR.own();
  ok('B-6a92 RED CONTROL (TWO BARRIERS CUT: the release\'s repair and the repair\'s same-instant guard): Vela restamped onto Orin\'s window and Orin\'s numbers written back on Vela\'s row — the hold undone within the hour', !!mRep && !!(grSt && grSt.sevenDay === GR.RO && grOwn && grOwn.sevenDay && grOwn.sevenDay.utilization === 0.81), { grSt, own: grOwn && grOwn.sevenDay });
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
  const ORIN = { email: 'mail-orin-0001', org: 'org-orin-0001' }, VELA = { email: 'mail-vela-0001', org: 'org-vela-0001' };   // invented
  const binHeld = standIn('claude-panel-held.sh', tP);
  const P = held(realEng, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN } });   // each folder holds its OWN account's login
  await run6(P);
  const pBefore = sideOf((await P.usage()), P.V);
  const pr = await hush(() => P.api.refreshViaCliPanel(P.V));
  const pSt = P.stamp(), pOwn = P.own(), pWit = P.wit(), pWu = sideOf((await P.usage()), P.V);
  ok('B-6a92 THE DOOR: Vela\'s own ⟳ read answering in the held window is written (true), the stamp moves there BY ITS OWN READ, and the hold ends in that turn (sidecar and route)', !!pBefore && pr.v === true && !!(pSt && pSt.sevenDay === roP && pSt.verifiedBy === 'own-panel') && !!pWit && !pWit.foreign && !pWu, { pBefore, v: pr.v, pSt, wit: pWit && { sevenDay: pWit.sevenDay, foreign: pWit.foreign }, pWu, said: pr.said.filter((l) => /window|panel/.test(l)).slice(0, 4) });
  ok('B-6a92 THE DOOR: the numbers are the row\'s own read (its panel\'s 12%), never the other account\'s 81%', !!(pOwn && pOwn.sevenDay && pOwn.sevenDay.utilization === 0.12 && pOwn.sevenDay.resetsAt === roP), pOwn && pOwn.sevenDay);
  P.reading(0.4, P.RO); await sleep(3);
  const pOwn2 = P.own();
  ok('B-6a92 THE DOOR: from then on the row\'s readings in that shared window WRITE on it (honest sharing converges)', !!(pOwn2 && pOwn2.sevenDay && pOwn2.sevenDay.utilization === 0.4 && pOwn2.sevenDay.resetsAt === roP), pOwn2 && pOwn2.sevenDay);
  // RED CONTROL (r6, ruled 4): no door (the engine's door not handed to the route) — the same read is refused and the row never leaves «unknown»
  const LOC = "app.locals.liftHeldWindow = liftHeldWindow; // B-6a92 r5: a held row's own ⟳ read is its door\n";
  const mNoDoor = esrc.includes(LOC) ? require(MUT.write(ENG, esrc.split(LOC).join(''), 'b6a92-no-door')) : null;
  const PN = mNoDoor ? held(mNoDoor, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN } }) : null;
  if (PN) await run6(PN);
  const pnr = PN ? await hush(() => PN.api.refreshViaCliPanel(PN.V)) : { v: null };
  ok('B-6a92 RED CONTROL (no door): the same read is refused, the stamp stays, the row still says unknown — the door legs can fail', !!PN && pnr.v === false && !!sideOf((await PN.usage()), PN.V) && (PN.stamp() || {}).sevenDay === PN.RV, { v: pnr.v });
  // ── r8 (主开发 r873 / r879 / r890): THE DOOR IS ONE PURE VERDICT, AND A ROW IS NEVER HELD ON A NAME OF ITS OWN ACCOUNT ─────────
  // «The account a row is» = what its identity GROUP says (the ONE notion, as in the pool and the estimator): its cache's
  // organisation, else its record's address — the folder's login where the folder names one, the declared address otherwise.
  const wordsOf = (W) => String((W.api.panelVerdictFor(W.V) || {}).why);
  const noId = (w) => !/mail-|org-[a-z]+-0001/.test(w);   // no identity value in any sentence
  const THIRD = { email: 'mail-third-0001', org: 'org-third-0001' };   // invented
  // THE r6 MUST WHERE IT STANDS: Vela's cache names ITS OWN organisation (an identity apart from its folder) and its folder is
  // signed in as Orin — the person's ⟳: no lift, nothing written, refused naming Orin
  const S = held(realEng, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org });
  await run6(S);
  const sr = await hush(() => S.api.refreshViaCliPanel(S.V));
  const sSt = S.stamp() || {}, sOwn = S.own() || {}, sWit = S.wit() || {}, sWu = sideOf((await S.usage()), S.V), sWhy = wordsOf(S);
  ok('B-6a92 THE DOOR, Vela (its own organisation on file) with its folder signed in as Orin: no lift and nothing written — the stamp, the file, the sidecar\'s name and the row\'s words all stand', sr.v === false && sSt.sevenDay === S.RV && !!(sOwn.sevenDay && sOwn.sevenDay.utilization === 0.2 && sOwn.sevenDay.resetsAt === S.RV) && !!(sWit.foreign && sWit.foreign.names[0] === S.O) && !!(sWu && sWu.otherNames[0] === 'Orin'), { v: sr.v, sSt, own: sOwn.sevenDay, foreign: sWit.foreign, sWu });
  ok('B-6a92 …refused signed-in-as, the true remedy: «Vela\'s sign-in folder is signed in as Orin … sign Vela in again with its own account» — no identity value', /Vela's sign-in folder is signed in as Orin/.test(sWhy) && /sign Vela in again with its own account/.test(sWhy) && noId(sWhy), sWhy);
  // RED CONTROL: r5's door (it lifted whenever the answer was in the held window) — Vela stamped on Orin's window, Orin's numbers on Vela
  const VCALL = "    const v = readingLag.heldLiftVerdict(heldLiftFacts(key, idv, h));";
  const R5LIFT = "    const v = (() => { const f = heldLiftFacts(key, idv, h); return f.onHeld ? { act: 'lift' } : { act: 'none' }; })();";
  const mLift = esrc.includes(VCALL) ? require(MUT.write(ENG, esrc.split(VCALL).join(R5LIFT), 'b6a92-r5-lift')) : null;
  const SR = mLift ? held(mLift, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org }) : null;
  if (SR) await run6(SR);
  const srr = SR ? await hush(() => SR.api.refreshViaCliPanel(SR.V)) : { v: null };
  const srSt = SR && SR.stamp(), srOwn = SR && SR.own();
  ok('B-6a92 RED CONTROL (r5\'s door, no verdict): the folder signed in as Orin lifts — Vela stamped on Orin\'s window and the panel\'s numbers written on Vela as verified', !!SR && srr.v === true && !!(srSt && srSt.sevenDay === roP) && !!(srOwn && srOwn.sevenDay && srOwn.sevenDay.utilization === 0.12), { v: srr.v, srSt, own: srOwn && srOwn.sevenDay });
  // THE r8 MUST (round weorx6iw2): VELA AND ORIN ARE TWO SEATS OF ONE TEAM ORGANISATION (one organisation, two addresses), neither
  // cache naming it — the group reads two accounts. Vela is held naming Orin; signed in rightly, its own read LIFTS (proven
  // stands before the hit: a reply that IS the row's own identity is never another account's)
  const TEAMV = { email: 'mail-vela-0001', org: 'org-team-0001' }, TEAMO = { email: 'mail-orin-0001', org: 'org-team-0001' };   // invented
  const TSW = held(realEng, { ro: roP, cli: binHeld, logins: { V: TEAMV, O: TEAMO } });
  await run6(TSW);
  const tsBefore = sideOf((await TSW.usage()), TSW.V);
  const tsr = await hush(() => TSW.api.refreshViaCliPanel(TSW.V));
  ok('B-6a92 THE r8 MUST: two seats of one Team organisation, Vela held naming Orin — Vela\'s honest own read lifts (stamped by its own read, written, the row no longer «unknown»)', !!(tsBefore && tsBefore.otherNames[0] === 'Orin') && tsr.v === true && (TSW.stamp() || {}).sevenDay === roP && !sideOf((await TSW.usage()), TSW.V), { tsBefore, v: tsr.v, st: TSW.stamp(), why: wordsOf(TSW) });
  // RED CONTROL: r8's verdict order (the hit, by organisation first, before the proof) — the honest seat refused «signed in as Orin»
  const RLF0 = 'src/reading-lag.js', rlsrc0 = read(RLF0), PROVEN0 = "  if (proven) return !liftable ? { act: 'none' } : onHeld ? { act: 'lift' } : { act: 'own' };";
  const R8HIT0 = "  if (rowKey && answer) { const k = (l) => (l && l.org ? 'org:' + String(l.org).toLowerCase() : l && l.email ? 'email:' + String(l.email).trim().toLowerCase() : null); const hit = others.filter((h) => k(h.login) && k(h.login) === k(answer)); if (hit.length) return { act: 'refuse', code: 'signed-in-as', names: hit.map((h) => h.name) }; }\n";
  const rlHitPath = rlsrc0.includes(PROVEN0) ? MUT.write(RLF0, rlsrc0.split(PROVEN0).join(R8HIT0 + PROVEN0), 'b6a92-world-hit-before-proven') : null;
  const mSeat = rlHitPath && esrc.includes(VCALL) ? require(MUT.write(ENG, esrc.split(VCALL).join(`    const v = require(${J(rlHitPath)}).heldLiftVerdict(heldLiftFacts(key, idv, h));`), 'b6a92-engine-r8-order')) : null;
  const TSR = mSeat ? held(mSeat, { ro: roP, cli: binHeld, logins: { V: TEAMV, O: TEAMO } }) : null;
  if (TSR) await run6(TSR);
  const tsrr = TSR ? await hush(() => TSR.api.refreshViaCliPanel(TSR.V)) : { v: null };
  ok('B-6a92 RED CONTROL (r8\'s order, the hit before the proof): the honest seat is refused «signed in as Orin» and stays «unknown»', !!TSR && tsrr.v === false && /Vela's sign-in folder is signed in as Orin/.test(wordsOf(TSR)) && !!sideOf((await TSR.usage()), TSR.V), { v: tsrr.v, why: TSR && wordsOf(TSR) });
  // BOUND 1 (r890): Vela's cache names NO organisation and its folder holds Orin's login — by the group Vela IS Orin's account under
  // a second name (one quota in the pool), so no hold forms: its window follows its readings and nothing reads «unknown»
  // ON THE TRAIN's DECISION ROAD (B-360d, d229032f4 — «an account not confirmed is its own identity (no merge)»): the group merges by
  // the folder's login only once the sign-in facts are CONFIRMED (the hub's boot and hourly runs, and a person's press, settle them):
  // the bound is read on a confirmed world
  const M = held(realEng, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN } });
  await M.am.signinFactsSettled();
  await run6(M);
  const mWit = M.wit() || {}, mSt = M.stamp() || {};
  ok('B-6a92 BOUND 1: a row with no organisation of its own whose folder holds another row\'s login is that account by the group — no hold, its stamp follows its readings, the row says nothing «unknown»', !mWit.foreign && mSt.sevenDay === M.RO && !sideOf((await M.usage()), M.V), { foreign: mWit.foreign, mSt });
  // …and BEFORE the sign-in is confirmed (the decision road's own law, named and judged here): the row is its own identity, so a hold
  // forms naming Orin; once the sign-in is confirmed the hold is NOT shown — a row is never held on a name of its own account, at every
  // read of a hold (r8) — read by a fresh engine (its groups' 30 s memo new) over the same folder and accounts
  // r2809 (the candidate's red, box zone, Node 24): «before» is a STATE the leg holds, never a moment — the account folders are read
  // off the loop at the start and the identity groups' memo is cleared at every usage-folder reply (B-360d part 3 U3), so the
  // confirmation could land inside the six readings and merge the two rows (the decision road's law, rightly): the folder reads go
  // through a door this leg opens only after the readings, and the leg checks the sign-in is still unconfirmed when it judges:
  // the decision road's identity record of each row names no login yet (the create's own seed: no address, no organisation,
  // no seat); after the door opens and the reads settle, Vela's names Orin's login (the confirmation landed)
  const SafeFsC = require(path.join(REPO, 'src/safe-fs.js')).SafeFs;
  const realDoorMU = new SafeFsC({ poolSize: 1, name: 'rt-held-door' });
  let openMU = null; const openedMU = new Promise((r) => { openMU = r; });
  const doorMU = { call: async (...a) => { await openedMU; return realDoorMU.call(...a); } };
  const MU = held(realEng, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN }, amOpts: { safeFs: doorMU } });
  await run6(MU);
  const muIdOf = (id) => MU.am.identityRecordOf(id, { withinMs: 60000 }), muNoLogin = (id) => { const r = muIdOf(id); return !r || (!r.address && !r.org && !r.seat); };
  const muUnconfirmed = muNoLogin(MU.V) && muNoLogin(MU.O);
  const muWit = MU.wit() || {}, muBefore = sideOf((await MU.usage()), MU.V);
  openMU();
  await MU.am.signinFactsSettled();
  const muConfirmed = (muIdOf(MU.V) || {}).address === ORIN.email;
  const MU2 = held(realEng, { again: MU }), muAfter = sideOf((await MU2.usage()), MU2.V);
  try { realDoorMU.close(); } catch { }
  ok('B-6a92 BOUND 1 BEFORE THE SIGN-IN IS CONFIRMED (B-360d\'s decision road): the row is its own identity — a hold forms naming Orin, and once the sign-in is confirmed it is not shown (never held on a name of its own account)', muUnconfirmed && muConfirmed && !!muWit.foreign && !!muBefore && !muAfter, J({ muUnconfirmed, muConfirmed, foreign: muWit.foreign, muBefore, muAfter }));
  // EACH REFUSAL CODE IN A WORLD (the table below covers every combination), each with its true remedy
  const U = held(realEng, { ro: roP, cli: binHeld });   // nothing names which account Vela is: no organisation, no login, no address
  await run6(U);
  const ur = await hush(() => U.api.refreshViaCliPanel(U.V));
  ok('B-6a92 row-unknown: nothing on file names which account Vela is — no lift, nothing written, «sign Vela in again with its own account (the sign-in records which account it is)»', ur.v === false && (U.stamp() || {}).sevenDay === U.RV && !!sideOf((await U.usage()), U.V) && /nothing on file names which account Vela is/.test(wordsOf(U)) && /sign Vela in again with its own account/.test(wordsOf(U)), wordsOf(U));
  const AU = held(realEng, { ro: roP, cli: binHeld, logins: { O: ORIN }, rowOrg: VELA.org });   // Vela's own organisation on file, its folder names no login
  await run6(AU);
  const aur = await hush(() => AU.api.refreshViaCliPanel(AU.V));
  ok('B-6a92 answer-unnamed: Vela\'s folder names no login — no lift, nothing written, «… names no login, so whose read it was cannot be told — sign Vela in again …»', aur.v === false && (AU.stamp() || {}).sevenDay === AU.RV && /Vela's sign-in folder names no login/.test(wordsOf(AU)), wordsOf(AU));
  const OA = held(realEng, { ro: roP, cli: binHeld, logins: { V: THIRD, O: ORIN }, rowOrg: VELA.org });   // its folder holds a third account's login
  await run6(OA);
  const oar = await hush(() => OA.api.refreshViaCliPanel(OA.V));
  ok('B-6a92 other-answered: Vela\'s folder holds an account that is not Vela\'s own (by its record) and not held — no lift, nothing written, said so with the true remedy, no identity value', oar.v === false && (OA.stamp() || {}).sevenDay === OA.RV && /signed in as an account that is not Vela's own/.test(wordsOf(OA)) && noId(wordsOf(OA)), wordsOf(OA));
  // THE HUB'S OWN LOGIN (r7): the held name is the hub's own login, read through THE ONE READER from the home's file (a seeded
  // stand-in home for the call). An honest Vela lifts; Vela with an identity of its own whose folder holds the hub's login is
  // refused by the hub's label
  const GLOBAL = { email: 'mail-cli-0001', org: 'org-cli-0001' };   // invented
  const withHome = async (who, fn) => {
    const h0 = process.env.HOME, home = fs.mkdtempSync(path.join(binDir, 'home-'));
    if (who) fs.writeFileSync(path.join(home, '.claude.json'), J({ oauthAccount: { emailAddress: who.email, organizationUuid: who.org } }), { mode: 0o600 });
    process.env.HOME = home;
    try { return await fn(); } finally { process.env.HOME = h0; }
  };
  const GH = held(realEng, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN }, withGlobal: true });
  await run6(GH);
  const ghNames = ((GH.wit() || {}).foreign || {}).names || [];
  ok('B-6a92 SETUP: the hold names the hub\'s own login (its window stamp is among the established windows)', ghNames.includes('__global__') && !ghNames.includes(GH.O), ghNames);
  const ghr = await withHome(GLOBAL, () => hush(() => GH.api.refreshViaCliPanel(GH.V)));
  ok('B-6a92 THE DOOR, the held name the hub\'s own login, Vela honestly signed in: the hold lifts (stamped by its own read, the hold ended, the panel written)', ghr.v === true && (GH.stamp() || {}).sevenDay === roP && !sideOf((await GH.usage()), GH.V), { v: ghr.v, st: GH.stamp(), why: wordsOf(GH) });
  const GS = held(realEng, { ro: roP, cli: binHeld, logins: { V: GLOBAL, O: ORIN }, withGlobal: true, rowOrg: VELA.org });
  await run6(GS);
  const gsr = await withHome(GLOBAL, () => hush(() => GS.api.refreshViaCliPanel(GS.V)));
  const gsWhy = wordsOf(GS);
  ok('B-6a92 THE DOOR, Vela (its own organisation on file) with its folder holding the hub\'s login: refused by the hub\'s label — nothing written, the hold standing, no identity value', gsr.v === false && (GS.stamp() || {}).sevenDay === GS.RV && !!sideOf((await GS.usage()), GS.V) && /Vela's sign-in folder is signed in as this machine's own login \(CLI login\)/.test(gsWhy) && noId(gsWhy), { v: gsr.v, why: gsWhy });
  // RED CONTROL: the folder-only read (r6's form: every held name from its pool folder) — the hub's own login has none, so the
  // refusal can no longer NAME it (another code, not the hub's label)
  const ONE = "loginOf: (n) => probeLog.loginOfAccount(n, { accounts })";
  const FOLDER = "loginOf: (n) => probeLog.machineOauthAccount(accounts.subDir(n))";
  const mFolder = esrc.includes(ONE) ? require(MUT.write(ENG, esrc.split(ONE).join(FOLDER), 'b6a92-folder-only')) : null;
  const GR2 = mFolder ? held(mFolder, { ro: roP, cli: binHeld, logins: { V: GLOBAL, O: ORIN }, withGlobal: true, rowOrg: VELA.org }) : null;
  if (GR2) await run6(GR2);
  const gr2 = GR2 ? await withHome(GLOBAL, () => hush(() => GR2.api.refreshViaCliPanel(GR2.V))) : { v: null };
  const gr2Why = GR2 ? wordsOf(GR2) : '';
  ok('B-6a92 RED CONTROL (the folder-only read): the hub\'s login unread, the refusal can no longer say the folder is signed in as it (another code — the leg above can fail)', !!GR2 && gr2.v === false && !/sign-in folder is signed in as this machine's own login/.test(gr2Why) && /signed in as an account that is not Vela's own/.test(gr2Why), { v: gr2.v, why: gr2Why });
  // THE r7 MUST: THE HUB'S OWN LOGIN IS VELA'S ACCOUNT, merged by the group (both caches name Vela's organisation) — rule 1: no hold
  // ever forms, Vela's window follows its readings, and its honest verified read is written
  const GM = held(realEng, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN }, withGlobal: true, rowOrg: VELA.org, globalOrg: VELA.org });
  await run6(GM);
  const gmWit = GM.wit() || {}, gmSt = GM.stamp() || {};
  const gmr = await withHome(VELA, () => hush(() => GM.api.refreshViaCliPanel(GM.V)));
  ok('B-6a92 THE r7 MUST: the hub\'s own login and Vela one account by the group — no hold forms (rule 1), Vela\'s stamp follows its readings, nothing «unknown», and its honest read is written', !gmWit.foreign && gmSt.sevenDay === GM.RO && !sideOf((await GM.usage()), GM.V) && gmr.v === true, { foreign: gmWit.foreign, gmSt, v: gmr.v, why: wordsOf(GM) });
  // …a hold already on disk naming only the row's own group is no hold: planted on Vela's witness, read back by a restarted hub
  { const w0 = GM.wit() || {}; fs.writeFileSync(path.join(GM.cacheDir, readingLag.apiWindowSidecarName(GM.V)), J({ ...w0, foreign: { names: ['__global__'], phase: GM.RO, at: Date.now(), n: 3 } })); }
  const GM2 = held(realEng, { again: GM });
  quiet(() => GM2.eng.repairIdentityAnchors('boot'));
  ok('B-6a92 …a hold on disk naming only Vela\'s own group (the hub\'s login merged with it) reads as no hold after a restart', !sideOf((await GM2.usage()), GM2.V) && !(GM2.eng.apiDerivedWindow(GM2.V, { held: true }) || {}).foreign, (GM2.eng.apiDerivedWindow(GM2.V, { held: true }) || {}).foreign);
  // RED CONTROL: rule 1 taken out at the source (the row's own group not dropped) — Vela held on its own account's other name
  const OWNG = "const othersOf = (key, names) => { const own = ownGroupOf(key);";
  const mNoRule1 = esrc.includes(OWNG) ? require(MUT.write(ENG, esrc.split(OWNG).join("const othersOf = (key, names) => { const own = new Set([key]);"), 'b6a92-no-rule1')) : null;
  const GMR = mNoRule1 ? held(mNoRule1, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN }, withGlobal: true, rowOrg: VELA.org, globalOrg: VELA.org }) : null;
  if (GMR) await run6(GMR);
  const gmrWu = GMR ? sideOf((await GMR.usage()), GMR.V) : null;
  ok('B-6a92 RED CONTROL (rule 1 out): Vela is held on the hub\'s login — its own account under a second name', !!GMR && !!(gmrWu && (gmrWu.others || []).includes('__global__')), gmrWu);
  // THE ONE READER, PINNED (r7; r8: the machine's own login read around the probe pinned by its TEXT): every `machineOauthAccount(`
  // call is a rowed one, and the three identity sites ask the one reader. A planted second reader is red BY NAME
  const SRC = path.join(REPO, 'src');
  const jsFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : jsFiles(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const LOGIN_ROWS = {   // file → the argument rows; an empty argument (the home's own login) only on these exact lines
    'src/server/usage-probe-log.js': { args: ['', 'd'], bare: ["if (name === '__global__') return machineOauthAccount();"] },
    'src/usage-routes.js': { args: ['', 'probeConfigDir'], bare: ['machineOrgBefore: probeLog.machineOauthAccount()', 'probeRec.machineOrgAfter = probeLog.machineOauthAccount();'] },
    'src/server/oat-mint.js': { args: ['d'], bare: [] },
  };
  const loginCensus = (swap = {}) => {
    const red = [];
    for (const f of [...jsFiles(SRC), path.join(REPO, 'server.js')]) {
      const rel = path.relative(REPO, f).split(path.sep).join('/');
      const text = swap[rel] != null ? swap[rel] : read(rel);
      for (const line of text.split('\n')) {
        const t = line.trim(); if (t.startsWith('//') || t.startsWith('*') || /function machineOauthAccount\(/.test(line)) continue;
        for (const m of line.matchAll(/machineOauthAccount\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
          const arg = m[1].trim(), row = LOGIN_ROWS[rel];
          if (!row || !row.args.includes(arg) || (arg === '' && !row.bare.some((b) => line.includes(b)))) red.push(`${rel} › ${arg || '(none)'}`);
        }
      }
    }
    return red;
  };
  const lc = loginCensus();
  const usesOne = /const expected = probeLog\.loginOfAccount\(isGlobal \? '__global__' : key, \{ dir: credsDir \}\);/.test(read('src/usage-routes.js')) && esrc.includes(ONE) && /own = loginOfAccount\(id, \{ accounts \}\);/.test(read('src/server/oat-mint.js'));
  ok('B-6a92 THE ONE READER: every machineOauthAccount( call is a rowed one (the reader itself, the machine\'s own login around the probe — by its text —, the probe folder, the mint folders), and the three identity sites ask loginOfAccount', lc.length === 0 && usesOne, { lc, usesOne });
  const planted = loginCensus({ [ENG]: esrc.split(ONE).join(FOLDER) });
  const plantedBare = loginCensus({ 'src/usage-routes.js': read('src/usage-routes.js').replace('  const expected = probeLog.loginOfAccount(', '  const homeAgain = probeLog.machineOauthAccount(); void homeAgain;\n  const expected = probeLog.loginOfAccount(') });
  ok('B-6a92 RED CONTROL (the census): a planted second reader (a held name read from its pool folder by hand) is red BY NAME, and so is a second read of the home\'s login in the route', planted.length === 1 && planted[0] === 'src/server/usage-pool-engine.js › accounts.subDir(n)' && plantedBare.length === 1 && plantedBare[0] === 'src/usage-routes.js › (none)', { planted, plantedBare });
  // ── THE TABLE (r9, 主开发 r975): THE GENERATOR KNOWS THE TRUTH; THE ORACLE IS THE LAW IN PLAIN SENTENCES ─────────────────────
  // Every world has TRUE accounts (letters) apart from the facts the product can see of them, drawn FREELY by a seeded generator:
  // an organisation of its own or one SHARED with another account (seats of a Team); a login carrying both an organisation and an
  // address, only one, or nothing readable; a cache that names its organisation or not, for the row AND every other name; the
  // reply naming the row's account, a pool-mate's, the hub's, a stranger's, or nobody; a panel with or without its window witness.
  // The facts go through THE ENGINE'S OWN FACT BUILDER (usage-pool-engine heldLiftFactsOf, groupKeyOf) and the verdict; the
  // oracle is a list of laws over the truth — never the verdict's branches.
  const RL = require(path.join(REPO, 'src/reading-lag.js'));
  const { heldLiftFactsOf, groupKeyOf } = realEng;
  const HELDW = 1_800_000_000, OWNW = HELDW - 3 * 86400;   // the held window · the row's own (any two phases apart)
  const rngOf = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const genWorlds = ({ seed, n, blind = false }) => {
    const rnd = rngOf(seed), pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const worlds = [];
    for (let i = 0; i < n; i++) {
      // THE TRUTH: R the row's account, S a seat-mate (shares R's organisation when R is a Team seat), P another account, X a
      // stranger never in the pool; the hub's own login is one of them
      const team = blind ? false : rnd() < 0.5;
      const ORG = { R: team ? 'team' : 'r', S: 'team', P: 'p', X: 'x' };
      const acct = (L) => ({ org: 'org-' + ORG[L] + '-0001', email: 'mail-' + L.toLowerCase() + '-0001' });   // invented, opaque
      const hub = pick(['R', 'S', 'P', 'X']);
      const TRUE = { vela: 'R', vela2: 'R', seat: 'S', other: 'P', __global__: hub, ghost: pick(['S', 'P']) };
      const fieldsOf = () => (blind ? 'both' : pick(['both', 'org', 'email']));
      const show = (L, f) => (L && f ? { orgUuid: f !== 'email' ? acct(L).org : null, email: f !== 'org' ? acct(L).email : null } : null);
      const cands = ['seat', 'other', '__global__', 'vela2', 'ghost'];
      const first = pick(cands), second = rnd() < 0.4 ? pick(cands.filter((c) => c !== first)) : null;
      const held = second ? [first, second] : [first];
      const folderL = pick(['R', 'S', 'P', 'H', 'X', null]), folderTrue = folderL === 'H' ? hub : folderL;
      const folder = folderTrue ? show(folderTrue, fieldsOf()) : null;
      // each name's own facts: its folder's login (the ghost's never readable) and whether its cache names its organisation
      const login = {}, cacheOrg = {};
      for (const n of ['vela2', 'seat', 'other', 'ghost']) { login[n] = n === 'ghost' ? null : (rnd() < (blind ? 0 : 0.15) ? null : show(TRUE[n], fieldsOf())); cacheOrg[n] = rnd() < 0.5; }
      login.__global__ = rnd() < (blind ? 0 : 0.15) ? null : show(hub, fieldsOf()); cacheOrg.__global__ = rnd() < 0.5;
      const rowCacheOrg = rnd() < 0.5, declared = rnd() < 0.3 ? acct('R').email : null;
      const replyL = pick(['folder', 'R', 'S', 'P', 'H', 'X']), replyTrue = replyL === 'folder' ? null : replyL === 'H' ? hub : replyL;
      const panelShows = replyTrue ? show(replyTrue, fieldsOf()) : null;
      const window = pick(['held', 'own']), witness = blind ? true : rnd() < 0.8;
      worlds.push({ i, team, ORG, acct, TRUE, held, folderTrue, folder, login, cacheOrg, rowCacheOrg, declared, replyTrue, panelShows, window, witness });
    }
    return worlds;
  };
  // THE FACTS a world hands the product — files as the engine would read them, through the ENGINE'S builder
  const factsOfWorld = (w) => {
    const recordEmail = (w.folder && w.folder.email) || w.declared || null;   // list(): the folder's address first, the declared one after
    const rowCache = { fetchedAt: 1, ...(w.rowCacheOrg ? { orgUuid: w.acct(w.TRUE.vela).org } : {}) };
    const keyOf = (n) => (n === 'vela' ? groupKeyOf({ accountId: 'vela', cache: rowCache, email: recordEmail })
      : groupKeyOf({ accountId: n === '__global__' ? null : n, cache: { fetchedAt: 1, ...(w.cacheOrg[n] ? { orgUuid: w.acct(w.TRUE[n]).org } : {}) }, email: n === '__global__' ? undefined : ((w.login[n] && w.login[n].email) || undefined) }));
    const rk = keyOf('vela'), groupIds = ['vela', ...['vela2', 'seat', 'other', 'ghost', '__global__'].filter((n) => keyOf(n) === rk)];
    const expected = w.folder, panelIdent = w.panelShows || { orgUuid: null, email: null };
    const cmp = (a, b, f) => (a && b && a[f] && b[f] ? (a[f] === b[f] ? 'agree' : 'differ') : null);
    const org = cmp(expected, w.panelShows, 'orgUuid') || cmp(expected, w.panelShows, 'email') || 'unknown';
    const phase = w.witness ? (w.window === 'held' ? 'differ' : 'agree') : 'unknown';
    const refused = org === 'differ' || phase === 'differ', verified = !refused && (org === 'agree' || phase === 'agree');
    const idv = { panel: panelIdent, expected, panelWindow: { sevenDay: w.window === 'held' ? HELDW : OWNW, scoped: {} }, refused, verified, phase, org };
    return heldLiftFactsOf({ key: 'vela', idv, h: { names: w.held, phase: HELDW }, sameAccountIds: groupIds, rowCache, rowEmail: recordEmail, loginOf: (n) => w.login[n] || null });
  };
  // THE LAWS, over the truth (never the verdict's branches):
  const lawsOf = (w, v) => {
    const A = w.acct, broken = [];
    // «the account a row is» = what its group says (r890): its organisation on file (every account of that organisation), else
    // its record's address (the folder's, else the declared one), else nothing
    const recordEmail = (w.folder && w.folder.email) || w.declared || null;
    const rowSet = w.rowCacheOrg ? ['R', 'S', 'P', 'X'].filter((L) => A(L).org === A('R').org) : recordEmail ? ['R', 'S', 'P', 'X'].filter((L) => A(L).email === recordEmail) : [];
    const inRow = (L) => !!L && rowSet.includes(L);
    const reply = w.replyTrue || w.folderTrue || null;                   // who truly answered
    const shown = w.panelShows || w.folder;                               // what the reply shows of itself
    const shownOwn = w.rowCacheOrg ? !!(shown && shown.orgUuid === A('R').org) : !!(recordEmail && shown && shown.email === recordEmail);
    const shownNotOwn = w.rowCacheOrg ? !!(shown && shown.orgUuid && shown.orgUuid !== A('R').org) : !!(recordEmail && shown && shown.email && shown.email !== recordEmail);
    const knowsSame = (n) => !!(shown && shown.email && w.login[n] && w.login[n].email && shown.email === w.login[n].email);
    const shownNotRow = (n) => !!(w.login[n] && (w.rowCacheOrg ? (w.login[n].orgUuid && w.login[n].orgUuid !== A('R').org) : (recordEmail && w.login[n].email && w.login[n].email !== recordEmail)));
    const orgDiffer = !!(w.folder && w.panelShows && ((w.folder.orgUuid && w.panelShows.orgUuid && w.folder.orgUuid !== w.panelShows.orgUuid) || (!(w.folder.orgUuid && w.panelShows.orgUuid) && w.folder.email && w.panelShows.email && w.folder.email !== w.panelShows.email)));
    const passes = !orgDiffer;   // the panel's own verdict does not deny the read (its organisations or addresses do not differ)
    // (a) a reply whose true account is the row's own is never refused as another account's, nor said not to be the row's
    if (inRow(reply) && v.act === 'refuse' && (v.code === 'signed-in-as' || v.code === 'other-answered')) broken.push('a');
    // (b) a refusal that NAMES an account names the reply's TRUE account, one not the row's, and only when the facts know it
    if (v.act === 'refuse' && v.code === 'signed-in-as' && !(v.names || []).every((n) => w.TRUE[n] === reply && !inRow(w.TRUE[n]) && knowsSame(n) && shownNotRow(n))) broken.push('b');
    // (c) a hold is lifted — or ended as the row's own read — only when the reply's true account is the row's own and the facts show it
    if ((v.act === 'lift' && !(inRow(reply) && shownOwn && w.window === 'held')) || (v.act === 'own' && !(inRow(reply) && shownOwn && w.window === 'own'))) broken.push('c');
    // (d) «not the row's» only when the facts show it; a hold ends as «only the row's own names» only when every held name truly is
    if (v.act === 'refuse' && v.code === 'other-answered' && !(shownNotOwn && !inRow(reply))) broken.push('d');
    if (v.act === 'unhold' && !w.held.every((n) => inRow(w.TRUE[n]))) broken.push('d2');
    // (e) THE HONEST ROW IS NEVER STUCK: a reply the facts show to be the row's own, through a panel that does not deny it, in the
    // held window, lifts; on its own window it ends the hold
    if (shownOwn && passes && inRow(reply) && w.window === 'held' && v.act !== 'lift') broken.push('e');
    // (f) THE r6 LAW: the facts know the reply IS a held account that is not the row's — refused, naming it
    const named = w.held.filter((n) => knowsSame(n) && shownNotRow(n) && !inRow(w.TRUE[n]) && w.TRUE[n] === reply);
    if (rowSet.length && !orgDiffer && !shownOwn && named.length && !(v.act === 'refuse' && v.code === 'signed-in-as' && named.every((n) => (v.names || []).includes(n)))) broken.push('f');
    return { broken, cannotTell: !!reply && !shownOwn && !shownNotOwn };
  };
  const tableOf = (verdict, opts) => {
    const worlds = genWorlds(opts), bad = [], refusing = [], remedyBad = [], cannot = [];
    const desc = (w) => `#${w.i} ${w.team ? 'team' : 'own-org'} · held ${w.held.map((n) => n + '=' + w.TRUE[n]).join('+')} · row cache ${w.rowCacheOrg ? 'org' : '—'}${w.declared ? ' declared' : ''} · folder ${w.folderTrue || '—'}${w.folder ? '(' + (w.folder.orgUuid ? 'o' : '') + (w.folder.email ? 'e' : '') + ')' : ''} · reply ${w.replyTrue || 'folder'} · ${w.window}${w.witness ? '' : ' no-witness'}`;
    for (const w of worlds) {
      const v = verdict(factsOfWorld(w)), L = lawsOf(w, v);
      if (L.broken.length) bad.push({ w: desc(w), laws: L.broken, v });
      if (L.cannotTell) cannot.push(desc(w) + ' → ' + v.act + (v.code ? ' ' + v.code : ''));
      if (v.act === 'refuse') {
        refusing.push(`${v.code}: ${desc(w)}`);
        // THE REMEDY COLUMN: «sign the row in again with its own account» — its folder then holds R's login (both fields), the
        // record's address follows it, a panel that named someone names R; the state it names: the row's own proven read
        const rem = RL.HELD_REFUSALS[v.code] || {};
        const R = w.acct('R'), signed = { orgUuid: R.org, email: R.email };
        const w2 = { ...w, folderTrue: 'R', folder: signed, replyTrue: w.replyTrue ? 'R' : null, panelShows: w.replyTrue ? signed : null };
        const after = verdict(factsOfWorld(w2));
        const okState = w.window === 'held' ? after.act === 'lift' : (after.act === 'own' || after.act === 'unhold');
        if (!(rem.remedy === 'sign-in-own' && rem.leadsTo === 'proven' && okState)) remedyBad.push({ row: refusing[refusing.length - 1], rem, after });
      }
    }
    return { worlds, bad, refusing, remedyBad, cannot };
  };
  const SEED = 0x6a92, N = 4000;
  const T1 = tableOf(RL.heldLiftVerdict, { seed: SEED, n: N });
  const byCode = T1.refusing.reduce((m, r) => { const k = r.split(':')[0]; m[k] = (m[k] || 0) + 1; return m; }, {});
  const reach = { team: T1.worlds.filter((w) => w.team).length, heldHub: T1.worlds.filter((w) => w.held.includes('__global__')).length, seatsHonest: T1.worlds.filter((w) => w.team && w.held.includes('seat') && !w.rowCacheOrg && w.folderTrue === 'R').length, noWitness: T1.worlds.filter((w) => !w.witness).length, onlyOneField: T1.worlds.filter((w) => w.folder && !(w.folder.orgUuid && w.folder.email)).length };
  console.log(`    THE TABLE: ${T1.worlds.length} worlds (seed ${SEED}) — reach ${J(reach)} — ${T1.refusing.length} refuse ${J(byCode)}; ${T1.cannot.length} where the facts cannot tell the reply's account apart from the row's (printed below, then the refusing rows):`);
  for (const r of T1.cannot) console.log('      cannot tell: ' + r);
  for (const r of T1.refusing) console.log('      ' + r);
  ok('B-6a92 THE TABLE: every law holds on every world (a never refused as another\'s when it is the row\'s own · b a name only for the reply\'s true account the facts know · c a lift only for the row\'s own shown read · d «not the row\'s» only when shown · e the honest row never stuck · f the r6 refusal), and every refusal\'s remedy leads to the row\'s own proven read', T1.bad.length === 0 && T1.remedyBad.length === 0 && T1.refusing.length > 0 && Object.values(reach).every((x) => x > 0), { bad: T1.bad.slice(0, 3), n: T1.bad.length, remedyBad: T1.remedyBad.slice(0, 2) });
  // RED CONTROLS: the hit put back BEFORE proven (r8's verdict) — the Team seats break law a / e; and r8's BLIND generator put back
  // — FOUR dimensions fixed at once, not one: no shared organisation, every login carrying both fields, every login readable,
  // every witness present — the same mutant is green there by blindness: the control proves the generator's reach
  const RLF = 'src/reading-lag.js', rlsrc = read(RLF), PROVEN = "  if (proven) return !liftable ? { act: 'none' } : onHeld ? { act: 'lift' } : { act: 'own' };";
  const R8HIT = "  if (rowKey && answer) { const k = (l) => (l && l.org ? 'org:' + String(l.org).toLowerCase() : l && l.email ? 'email:' + String(l.email).trim().toLowerCase() : null); const hit = others.filter((h) => k(h.login) && k(h.login) === k(answer)); if (hit.length) return { act: 'refuse', code: 'signed-in-as', names: hit.map((h) => h.name) }; }\n";
  const mHit = rlsrc.includes(PROVEN) ? require(MUT.write(RLF, rlsrc.split(PROVEN).join(R8HIT + PROVEN), 'b6a92-hit-before-proven')).heldLiftVerdict : null;
  const T2 = mHit ? tableOf(mHit, { seed: SEED, n: N }) : null, T3 = mHit ? tableOf(mHit, { seed: SEED, n: N, blind: true }) : null;
  ok('B-6a92 RED CONTROL (the hit before proven): the free generator finds worlds where an honest seat is refused as its pool-mate', !!T2 && T2.bad.some((b) => b.laws.includes('a') || b.laws.includes('e')), T2 && { n: T2.bad.length, first: T2.bad[0] });
  ok('B-6a92 RED CONTROL (r8\'s blind generator put back — four dimensions fixed at once: no shared organisation, both fields, every login readable, every witness): the same mutant is GREEN there by blindness (the generator\'s reach is what found it)', !!T3 && T3.bad.length === 0, T3 && { n: T3.bad.length, first: T3.bad[0] });
  // PRIVACY (主开发 r975 ALSO CURED, pinned r1034): a panel that answers for ANOTHER login (the CLI rewrote the probe's isolated
  // login file to another account) is refused on the organisation — and its words, the probe record's identity block and the
  // refusal's archive row carry NO organisation and NO address (labels and the verdict only)
  const binDiffer = (() => { const f = path.join(binDir, 'claude-panel-other-login.sh'); fs.writeFileSync(f, `#!/bin/sh\nprintf '%s' '${J({ oauthAccount: { emailAddress: THIRD.email, organizationUuid: THIRD.org } })}' > "$CLAUDE_CONFIG_DIR/.claude.json"\ncat <<'PANEL'\n${tP}PANEL\n`, { mode: 0o755 }); return f; })();
  const PV = held(realEng, { ro: roP, cli: binDiffer, logins: { V: VELA, O: ORIN } });
  const pvr = await hush(() => PV.api.refreshViaCliPanel(PV.V));
  const pvWhy = wordsOf(PV);
  const lastOf = (f) => { try { const t = fs.readFileSync(f, 'utf8').trim().split('\n'); return JSON.parse(t[t.length - 1]); } catch { return null; } };
  const probeRec = lastOf(path.join(PV.root, 'data', require(path.join(REPO, 'src/server/usage-probe-log.js')).FILE));
  const archRow = lastOf(path.join(PV.root, 'data', 'archive', 'readings-window-mismatch.ndjson'));
  const blocks = J([probeRec && probeRec.identity, archRow && archRow.identity]);
  ok('B-6a92 PRIVACY: a panel answering for another login is refused on the organisation, and its words, the probe record\'s identity block and the archive row\'s carry no organisation and no address', pvr.v === false && /answered for/.test(pvWhy) && noId(pvWhy) && !!(probeRec && probeRec.identity && probeRec.identity.org === 'differ') && !!(archRow && archRow.identity && archRow.identity.org === 'differ') && noId(blocks) && !/expected|"panel"/.test(blocks), { v: pvr.v, why: pvWhy, blocks });
  // …a held row's panel answering a THIRD window is refused (nothing written, the hold stands), and its words say what is true
  const Q = held(realEng, { cli: standIn('claude-panel-third.sh', panelText(hourAt(3 * 86400 + 11 * 3600), 7)) });
  await run6(Q);
  const qr = await hush(() => Q.api.refreshViaCliPanel(Q.V));
  const qv = Q.api.panelVerdictFor(Q.V) || {}, qWu = sideOf((await Q.usage()), Q.V), qOwn = Q.own();
  const RTS = 'src/usage-routes.js', rtsrc = read(RTS), HELDARG = ", held: (wit && wit.foreign) || null });";
  const mRts = rtsrc.includes(HELDARG) ? require(MUT.write(RTS, rtsrc.split(HELDARG).join(' });'), 'b6a92-no-held-words')) : null;
  const QN = mRts ? held(realEng, { cli: standIn('claude-panel-third.sh', panelText(hourAt(3 * 86400 + 11 * 3600), 7)), routesMod: mRts }) : null;
  if (QN) await run6(QN);
  if (QN) await hush(() => QN.api.refreshViaCliPanel(QN.V));
  const qnWhy = QN ? String((QN.api.panelVerdictFor(QN.V) || {}).why) : '';
  ok('B-6a92 RED CONTROL (the hold not told to the panel\'s verdict): the refusal\'s words lose the hold — the words leg below can fail', !!QN && !/own weekly window is unknown/.test(qnWhy) && /not Vela's own API-derived window/.test(qnWhy), qnWhy);
  ok('B-6a92 THE DOOR, refused: a panel answering neither window writes nothing, the hold stands, and its words name the hold and the one road that ends it — never «re-anchor it automatically»', qr.v === false && !!qWu && /own weekly window is unknown: its readings name Orin's window/.test(String(qv.why)) && !/re-anchor it automatically/.test(String(qv.why)) && !!(qOwn && qOwn.sevenDay && qOwn.sevenDay.utilization === 0.2), { v: qr.v, why: qv.why, qWu, own: qOwn && qOwn.sevenDay });
  // NO FILE IS READ ON A POLL (ruled in 2; r6 ruled 3 and 4): a RESTARTED hub — a fresh engine over the held scene, warmed by its
  // start's identity repair — then ten polls, each its own run, the clock carried past the window list's 5 s memo halfway, each
  // poll followed by the window list (as the guard asks it): no poll reads a stamp or a witness sidecar, and the stamp-only
  // member's stamp (Vela: no cache file) is never read again. PREMISES: the counter sees the sidecar's own road; the memo WAS crossed
  const T0 = held(realEng, { ownReading: false });
  await run6(T0);
  const T = held(realEng, { again: T0 });
  quiet(() => T.eng.repairIdentityAnchors('boot'));
  const SIDE = [readingLag.windowSidecarName(''), readingLag.apiWindowSidecarName('')];
  const realRead = fs.readFileSync, realNow = Date.now, seen = [];
  let phase = 'poll';
  fs.readFileSync = function (p0, ...a) { try { if (typeof p0 === 'string' && SIDE.some((x) => path.basename(p0).startsWith(x))) seen.push(phase + ' ' + path.basename(p0)); } catch { } return realRead.call(this, p0, ...a); };
  let premise = 0, tWu = null;
  try {
    await sleep(1); phase = 'premise'; T.eng.apiDerivedWindow(T.V, { witness: true }); premise = seen.length; seen.length = 0;   // the sidecar's own road is seen
    for (let i = 0; i < 10; i++) {
      await sleep(1);
      if (i === 5) Date.now = () => realNow() + 6000;   // past the window list's 5 s memo
      phase = 'poll'; tWu = sideOf((await T.usage()), T.V);
      phase = 'list'; T.eng.establishedWindows();
    }
  } finally { fs.readFileSync = realRead; Date.now = realNow; }
  const vS = readingLag.windowSidecarName(T.V), oS = readingLag.windowSidecarName(T.O);
  const pollReads = seen.filter((x) => x.startsWith('poll ')), vReads = seen.filter((x) => x === 'list ' + vS), crossed = seen.filter((x) => x === 'list ' + oS).length;
  ok('B-6a92 NO FILE READ ON A POLL: after a restart warmed at its start, ten polls read no stamp and no witness sidecar, the stamp-only member\'s stamp is never re-read across the 5 s memo, and the row still says Orin (premises: the counter sees a sidecar read; the memo was crossed — a cache-file member\'s stamp re-read)', premise > 0 && crossed > 0 && pollReads.length === 0 && vReads.length === 0 && !!(tWu && tWu.otherNames[0] === 'Orin'), { premise, crossed, pollReads: pollReads.slice(0, 6), vReads: vReads.length, tWu });
  // ═══ B-6a92 (主开发 r2540 / r2543 / r2561) — A ROW THAT ARRIVES ALREADY ON ANOTHER ACCOUNT'S INSTANT ═══
  // An older version re-anchored Vela onto Orin's window and dropped the hold from its kept file (or the hourly repair seeded it from
  // readings that were Orin's); back on the train Vela's readings agree with the wrong anchor and nothing moves. THE STANDING CHECK
  // holds it at the start — on the SAME INSTANT only (to the second, never the reading-match tolerance); a proven row never; of two
  // unproven rows BOTH, each naming the other; it starts no read; the row's own proven read lifts it, once a pair
  {
    const stampOf = (sevenDay, ageMs, proven) => J({ sevenDay, fiveHour: null, scoped: {}, at: Date.now() - ageMs, source: 'api', verifiedAt: Date.now() - ageMs, verifiedBy: proven ? 'own-panel' : 'rate-limit-events', n: 3, producer: 'login' });
    const witOf = (sevenDay, ageMs) => J({ sevenDay, scoped: {}, at: Date.now() - ageMs, sessionId: null, source: 'rate-limit-events', n: 3, ring: [] });
    const asks = path.join(binDir, 'si-panel-asks.log');   // every own read the hub asks runs this stand-in once
    const binCount = path.join(binDir, 'claude-panel-si.sh'); fs.writeFileSync(binCount, `#!/bin/sh\necho ask >> '${asks}'\ncat <<'PANEL'\n${tP}PANEL\n`, { mode: 0o755 });
    const asked = () => { try { return fs.readFileSync(asks, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
    // THE OLDER RECORD AS IT ARRIVES: Vela's anchor and witness on `v` with NO hold in its kept file; Orin's on roP — then THE START
    const panelStampOf = (sevenDay, ageMs) => J({ sevenDay, fiveHour: null, scoped: {}, at: Date.now() - ageMs, source: 'on-demand', verifiedAt: Date.now() - ageMs, verifiedBy: 'cli-org', producer: 'login' });   // a panel's: rounded to the hour
    const arrive = (engMod, { v, vProven = false, oProven = false, logins = null, vNone = false, rowOrg = null, routesMod = null, vStampJ = null, vWitJ = null, oStampJ = null, oWitJ = null, cli = binCount } = {}) => {
      const A0 = held(realEng, { ro: roP, logins, rowOrg });
      const d = A0.cacheDir;
      if (vNone) for (const f of [readingLag.windowSidecarName(A0.V), readingLag.apiWindowSidecarName(A0.V)]) fs.rmSync(path.join(d, f), { force: true });
      else { fs.writeFileSync(path.join(d, readingLag.windowSidecarName(A0.V)), vStampJ || stampOf(v, 60e3, vProven)); fs.writeFileSync(path.join(d, readingLag.apiWindowSidecarName(A0.V)), vWitJ || witOf(v, 60e3)); }
      fs.writeFileSync(path.join(d, readingLag.windowSidecarName(A0.O)), oStampJ || stampOf(roP, 3600e3, oProven));
      fs.writeFileSync(path.join(d, readingLag.apiWindowSidecarName(A0.O)), oWitJ || witOf(roP, 3600e3));
      const A = held(engMod, { again: A0, cli, routesMod });
      const said = [], o = console.log, w = console.warn; console.log = (...a) => said.push(a.join(' ')); console.warn = () => { };
      try { A.eng.repairIdentityAnchors('boot'); } finally { console.log = o; console.warn = w; }
      A.saidHeld = said.filter((l) => /window held \(the start\)/.test(l));
      return A;
    };
    const witO = (X) => { try { return JSON.parse(fs.readFileSync(path.join(X.cacheDir, readingLag.apiWindowSidecarName(X.O)), 'utf8')); } catch { return null; } };
    const heldOn = async (X) => { const u = await X.usage(); return { v: (X.wit() || {}).foreign || null, o: (witO(X) || {}).foreign || null, vu: sideOf(u, X.V), ou: sideOf(u, X.O) }; };
    // (1) HONEST NEIGHBOURS — seconds apart, and inside the reading-match tolerance: NOBODY held (this leg keeps the check from
    // growing back into «agrees»)
    const N1 = arrive(realEng, { v: roP + 7 }), N2 = arrive(realEng, { v: roP + 90 });
    const n1 = await heldOn(N1), n2 = await heldOn(N2);
    ok('B-6a92 r2543 HONEST NEIGHBOURS: two accounts\' weekly windows 7 s apart, and 90 s apart (inside the 120 s a reading is matched with), hold NOBODY at the start — nearness is not the fault', !n1.v && !n1.o && !n1.vu && !n1.ou && !n2.v && !n2.o && !n2.vu && !n2.ou, { n1, n2 });
    const SI_BODY = '  return Math.min(d, WEEK_SEC - d) < SAME_INSTANT_SEC;\n', rlsrcSI = read('src/reading-lag.js');
    const rlTol = MUT.write('src/reading-lag.js', anchored(rlsrcSI, SI_BODY, '  return Math.min(d, WEEK_SEC - d) <= JITTER_SEC;\n', 'b6a92-si-tolerance'), 'b6a92-si-tolerance');
    const engTol = require(MUT.write(ENG, anchored(esrc, "const readingLag = require('../reading-lag.js');", `const readingLag = require(${J(rlTol)});`, 'b6a92-si-tol-eng'), 'b6a92-si-tol-eng'));
    const N2x = engTol ? arrive(engTol, { v: roP + 90 }) : null, n2x = N2x ? await heldOn(N2x) : null;
    ok('B-6a92 RED CONTROL (the check by the reading-match tolerance, in a copy): the honest neighbour 90 s apart IS held — the leg above can fail', !!n2x && !!n2x.v && n2x.v.by === 'same-instant', n2x);
    // (2) THE SAME INSTANT, NEITHER PROVEN (r2561): BOTH held, each naming the other; the route says it on both rows; said ONCE
    const P2 = arrive(realEng, { v: roP }), p2 = await heldOn(P2);
    ok('B-6a92 r2561 THE SAME INSTANT, NEITHER PROVEN: an older record arriving with no hold in its kept file — at the start BOTH rows are held, each naming the other (no clock tells which copied); the sidecars carry it and the usage route says it on both rows',
      !!p2.v && p2.v.by === 'same-instant' && p2.v.names[0] === P2.O && !!p2.o && p2.o.by === 'same-instant' && p2.o.names[0] === P2.V && !!p2.vu && p2.vu.otherNames[0] === 'Orin' && p2.vu.by === 'same-instant' && !!p2.ou && p2.ou.otherNames[0] === 'Vela', p2);
    ok('B-6a92 r2561 SAID ONCE, NAMES ONLY: the start\'s journal names the pair in ONE line, no address', P2.saidHeld.length === 1 && /Vela/.test(P2.saidHeld[0]) && /Orin/.test(P2.saidHeld[0]) && !P2.saidHeld[0].includes('@'), P2.saidHeld);
    ok('B-6a92 r2561 THE CHECK STARTS NO READ: held pairs at every start above, and the own read the hub would run was asked ZERO times', asked() === 0, asked());
    const NOCHECK = "  holdSameInstants('the start');   // B-6a92 (r2543): a row that ARRIVED on another account's instant is held here\n";
    const engNo = require(MUT.write(ENG, anchored(esrc, NOCHECK, '', 'b6a92-si-nocheck'), 'b6a92-si-nocheck'));
    const P2x = engNo ? arrive(engNo, { v: roP }) : null, p2x = P2x ? await heldOn(P2x) : null;
    ok('B-6a92 RED CONTROL (no standing check, in a copy — the train before this unit): the copied row stays on the other account\'s instant, wrong and silent', !!p2x && !p2x.v && !p2x.vu && !p2x.o, p2x);
    // (3) A PROVEN ROW IS NEVER HELD; the unproven one on its instant is; two proven rows: nobody
    const Q1 = arrive(realEng, { v: roP, oProven: true }), q1 = await heldOn(Q1);
    const Q2 = arrive(realEng, { v: roP, vProven: true, oProven: true }), q2 = await heldOn(Q2);
    ok('B-6a92 r2543 A PROVEN ROW IS NEVER HELD: Orin stamped by its own proven read keeps its window and Vela (unproven, on its instant) is held naming Orin; two proven rows on one instant: nobody',
      !!q1.v && q1.v.names[0] === Q1.O && !q1.o && !q1.ou && !q2.v && !q2.o && !q2.vu && !q2.ou, { q1, q2 });
    // (r2923 3) …BY THE STAND-IN'S PROOF CARRY: Orin's anchor is its own proven read (a panel's: never compared), its exact witness
    // stands in for it WITH that proof — cut the carry (in a copy) and the honest, lifted Orin is held
    const rlNoCarry = MUT.write('src/reading-lag.js', anchored(rlsrcSI, 'proven: standsIn && !!r.anchor.proven, anchor: standsIn });', 'proven: false, anchor: standsIn });', 'b6a92-si-no-proof-carry'), 'b6a92-si-no-proof-carry');
    const engNoCarry = require(MUT.write(ENG, anchored(esrc, "const readingLag = require('../reading-lag.js');", `const readingLag = require(${J(rlNoCarry)});`, 'b6a92-si-no-proof-carry-eng'), 'b6a92-si-no-proof-carry-eng'));
    const Q1c = arrive(engNoCarry, { v: roP, oProven: true }), q1c = await heldOn(Q1c);
    ok('B-6a92 RED CONTROL (r2923 3: the stand-in carries no proof, in a copy): the lifted honest Orin (its own proven read, its exact witness agreeing) is HELD — the leg above can fail', !!q1c.o && q1c.o.by === 'same-instant', q1c);
    // (4) AGREEING READINGS NEVER LIFT IT, and its numbers are not filed
    await run6(Q1);
    const q1b = await heldOn(Q1), q1own = Q1.own();
    ok('B-6a92 r2543 AGREEING READINGS NEVER LIFT IT, NOTHING FILED: six readings on the held instant — the hold stands and Vela\'s file keeps its OWN last reading',
      !!q1b.v && q1b.v.by === 'same-instant' && !!q1b.vu && !!q1own && !!q1own.sevenDay && q1own.sevenDay.utilization === 0.2 && q1own.sevenDay.resetsAt === Q1.RV, { q1b, own: q1own && q1own.sevenDay });
    const KEEP = "      const keepSame = !!(next.foreign && next.foreign.by === 'same-instant' && readingLag.weeklyNear(next.foreign.phase, entry.resetsAt) === true);\n";
    const engKeep = require(MUT.write(ENG, anchored(esrc, KEEP, '      const keepSame = false;\n', 'b6a92-si-nokeep'), 'b6a92-si-nokeep'));
    const Q1x = engKeep ? arrive(engKeep, { v: roP, oProven: true }) : null;
    if (Q1x) await run6(Q1x);
    const q1x = Q1x ? await heldOn(Q1x) : null;
    ok('B-6a92 RED CONTROL (the ring ends the hold on a run that agrees with the held anchor, in a copy): six readings on the held instant lift it — the leg above can fail', !!q1x && !q1x.v, q1x);
    // (5) AN ANCHOR JUST WRITTEN onto another account's instant is held at once (the stamp writer's hearer): Vela with NO window of its
    // own, six readings in Orin's window — the ring stamps it there, and the check holds it
    const W5 = arrive(realEng, { vNone: true, oProven: true });
    await run6(W5); await sleep(5);
    const w5 = await heldOn(W5), w5st = W5.stamp();
    ok('B-6a92 r2543 AN ANCHOR WRITTEN ONTO ANOTHER ACCOUNT\'S INSTANT IS HELD AT ONCE: the ring stamps Vela (no window of its own) on Orin\'s window to the second, and the check holds it naming Orin', !!w5st && readingLag.sameInstant(w5st.sevenDay, roP) && !!w5.v && w5.v.by === 'same-instant' && w5.v.names[0] === W5.O, { w5, st: w5st });
    // (6) THE ROW'S OWN PROVEN READ LIFTS IT, ONCE A PAIR: its folder holds its own login; the next start holds it no more
    const L = arrive(realEng, { v: roP, oProven: true, logins: { V: TEAMV, O: TEAMO } });
    const lBefore = await heldOn(L);
    const lr = await hush(() => L.api.refreshViaCliPanel(L.V));
    const lAfter = await heldOn(L), lSt = L.stamp();
    const L2 = held(realEng, { again: L, cli: binCount }); quiet(() => L2.eng.repairIdentityAnchors('boot'));
    const l2 = await heldOn(L2);
    ok('B-6a92 r2561 THE ROW\'S OWN PROVEN READ LIFTS IT, ONCE A PAIR: Vela held at the start; its own /usage read (its folder holds its own login) lifts it, stamped by its own read; the next start holds it no more against Orin',
      !!lBefore.v && lr.v === true && !lAfter.v && !!lSt && lSt.verifiedBy === 'own-panel' && !l2.v && !l2.vu, { lBefore, v: lr.v, lAfter, st: lSt, l2 });
    // (r2688 (3)) THE PANEL ROUNDS: two honest rows each anchored by a PANEL read in one hour (their events seconds apart) — NOBODY
    // held: only instants stated at event precision are compared; the copy scene above (event-precise on two groups) is still held
    const PH = arrive(realEng, { vStampJ: panelStampOf(roP, 60e3), vWitJ: witOf(roP + 10, 60e3), oStampJ: panelStampOf(roP, 3600e3), oWitJ: witOf(roP + 40, 3600e3) });
    const ph = await heldOn(PH);
    ok('B-6a92 r2688 THE PANEL ROUNDS: two honest rows anchored by panel reads on one hour (their events 30 s apart) hold NOBODY — only event-precise instants are compared; the copy scene (event-precise on both groups) is held above',
      !ph.v && !ph.o && !ph.vu && !ph.ou && !!p2.v && !!p2.o, { ph, copyHeld: !!p2.v });
    const EPS = "function eventPreciseStamp(st) { return !!st && typeof st === 'object' && st.verifiedBy === 'rate-limit-events'; }";
    const rlPanel = MUT.write('src/reading-lag.js', anchored(rlsrcSI, EPS, "function eventPreciseStamp(st) { return !!st && typeof st === 'object'; }", 'b6a92-si-panel-compared'), 'b6a92-si-panel-compared');
    const engPanel = require(MUT.write(ENG, anchored(esrc, "const readingLag = require('../reading-lag.js');", `const readingLag = require(${J(rlPanel)});`, 'b6a92-si-panel-eng'), 'b6a92-si-panel-eng'));
    const PHx = arrive(engPanel, { vStampJ: panelStampOf(roP, 60e3), vWitJ: witOf(roP + 10, 60e3), oStampJ: panelStampOf(roP, 3600e3), oWitJ: witOf(roP + 40, 3600e3) }), phx = await heldOn(PHx);
    ok('B-6a92 RED CONTROL (panel stamps compared, in a copy): the two honest rows on one panel hour are BOTH held — the leg above can fail', !!phx.v && !!phx.o, phx);
    // (r2855 (1)) THE COPY'S ANCHOR A PANEL WROTE (the commonest way a copy arises): Vela's stamp is the panel's (rounded, on Orin's
    // reset), its witness Orin's events to the second; Orin's own anchor is exact on that second — BOTH held, each naming the other
    // (neither proven), never the honest row alone while the copy goes free
    const CP = arrive(realEng, { vStampJ: panelStampOf(roP, 60e3), vWitJ: witOf(roP, 60e3) }), cp = await heldOn(CP);
    ok('B-6a92 r2855 THE COPY\'S ANCHOR A PANEL WROTE: Vela stamped by a panel read on Orin\'s reset, its witness Orin\'s events to the second, Orin\'s own anchor exact there — BOTH held, each naming the other: the witness stands in for the anchor it agrees with',
      !!cp.v && cp.v.by === 'same-instant' && cp.v.names[0] === CP.O && !!cp.o && cp.o.by === 'same-instant' && cp.o.names[0] === CP.V && !!cp.vu && !!cp.ou, cp);
    const STANDS = 'proven: standsIn && !!r.anchor.proven, anchor: standsIn });';
    const rlNoStand = MUT.write('src/reading-lag.js', anchored(rlsrcSI, STANDS, 'proven: false, anchor: false });', 'b6a92-si-no-stand-in'), 'b6a92-si-no-stand-in');   // stale-pins: kept (the red control puts the rule before back)
    const engNoStand = require(MUT.write(ENG, anchored(esrc, "const readingLag = require('../reading-lag.js');", `const readingLag = require(${J(rlNoStand)});`, 'b6a92-si-no-stand-eng'), 'b6a92-si-no-stand-eng'));
    const CPx = arrive(engNoStand, { vStampJ: panelStampOf(roP, 60e3), vWitJ: witOf(roP, 60e3) }), cpx = await heldOn(CPx);
    ok('B-6a92 RED CONTROL (r2855 (1): no stand-in, in a copy — the rule before): the honest Orin is held naming the copy and the copy goes FREE — the leg above can fail', !!cpx.o && !cpx.v, cpx);
    // (r2855, small) A ROUNDED INSTANT NEVER TAKES THE EXACT LABEL THROUGH A KEPT VALUE: Vela's witness holds a lift's panel week
    // (source own-panel); a run of scoped events only (the week kept) leaves its label the panel's — the standing check never
    // compares it as exact
    const XL = held(realEng, { ro: roP });
    fs.writeFileSync(path.join(XL.cacheDir, readingLag.apiWindowSidecarName(XL.V)), J({ sevenDay: XL.RV, scoped: {}, at: Date.now() - 60e3, sessionId: null, source: 'own-panel', n: 1, ring: [] }));
    const scopedRun = (E, X) => { for (let i = 0; i < E.API_WITNESS_K + 1; i++) quiet(() => E.noteApiDerivedWindow(X.V, { resetsAt: X.RV + 5, kind: 'scoped', scopedName: 'opus' }, null, { producer: 'login' })); };
    scopedRun(XL.eng, XL);
    const xlW = XL.wit() || {};
    const KEPTW = "      const keptWeek = Number(w.sevenDay) > 0 && !agreeing.some((e) => e.kind === 'sevenDay') && !readingLag.eventPreciseWitness(raw);\n";
    const engKeptW = require(MUT.write(ENG, anchored(esrc, KEPTW, '      const keptWeek = false;\n', 'b6a92-si-kept-week'), 'b6a92-si-kept-week'));
    const XLx = held(engKeptW, { ro: roP });
    fs.writeFileSync(path.join(XLx.cacheDir, readingLag.apiWindowSidecarName(XLx.V)), J({ sevenDay: XLx.RV, scoped: {}, at: Date.now() - 60e3, sessionId: null, source: 'own-panel', n: 1, ring: [] }));
    scopedRun(XLx.eng, XLx);
    const xlxW = XLx.wit() || {};
    ok('B-6a92 r2855 A ROUNDED INSTANT NEVER TAKES THE EXACT LABEL THROUGH A KEPT VALUE: a run of scoped events over a witness whose week a panel read stated keeps that week and its label (own-panel) — never «rate-limit-events»; the run\'s own scoped window is written',
      xlW.sevenDay === XL.RV && xlW.source === 'own-panel' && !readingLag.eventPreciseWitness(xlW) && !!xlW.scoped && xlW.scoped.opus === XL.RV + 5, { sevenDay: xlW.sevenDay, source: xlW.source, scoped: xlW.scoped });
    ok('B-6a92 RED CONTROL (r2855 small: the kept week labelled by the run, in a copy): the panel\'s week takes the exact label — the leg above can fail', xlxW.sevenDay === XLx.RV && xlxW.source === 'rate-limit-events' && readingLag.eventPreciseWitness(xlxW), { sevenDay: xlxW.sevenDay, source: xlxW.source });
    // (r2688 (1)) THE WAY OUT STAYS OPEN: Vela's own read lifts it WITH the organisation agreeing (its cache names its organisation, its
    // folder holds its own login) — the route's second write keeps the lift's mark, and the next start holds it no more
    // the panel's stand-in REPORTS the organisation the way the CLI does: it rewrites its isolated config — the SAME organisation
    // under a refreshed address, so the route reads the login it reported (changed) and the organisation AGREES with the row's own
    const binOrg = path.join(binDir, 'claude-panel-si-org.sh'); fs.writeFileSync(binOrg, `#!/bin/sh\necho ask >> '${asks}'\n[ -n "$CLAUDE_CONFIG_DIR" ] && printf '%s' '${J({ oauthAccount: { emailAddress: 'mail-vela-0002', organizationUuid: VELA.org } })}' > "$CLAUDE_CONFIG_DIR/.claude.json"\ncat <<'PANEL'\n${tP}PANEL\n`, { mode: 0o755 });
    const LA = arrive(realEng, { v: roP, logins: { V: VELA, O: ORIN }, rowOrg: VELA.org, cli: binOrg });
    const laBefore = await heldOn(LA);
    const lar = await hush(() => LA.api.refreshViaCliPanel(LA.V));
    await sleep(5);
    const laAfter = await heldOn(LA), laSt = LA.stamp();
    const LA2 = held(realEng, { again: LA, cli: binCount }); quiet(() => LA2.eng.repairIdentityAnchors('boot'));
    const la2 = await heldOn(LA2);
    ok('B-6a92 r2688 THE WAY OUT STAYS OPEN: Vela held at the start; its own read with the organisation agreeing lifts it, the route\'s second write keeps the own-panel mark, and neither that call nor the next start holds it again',
      !!laBefore.v && lar.v === true && !laAfter.v && !!laSt && laSt.verifiedBy === 'own-panel' && !la2.v && !la2.vu, { why: String((LA.api.panelVerdictFor(LA.V) || {}).why).slice(0, 200), v: lar.v, st: laSt && laSt.verifiedBy, laAfter: !!laAfter.v, la2: !!la2.v, laBefore: !!laBefore.v });
    const RTS2 = 'src/usage-routes.js', rtsrc2 = read(RTS2);
    const CARRY = "verifiedBy: keepOwn ? 'own-panel' : idv.org === 'agree' ? 'cli-org' : (idv.verifiedBy || 'api-phase') }, producer);";
    const rtNoCarry = require(MUT.write(RTS2, anchored(rtsrc2, CARRY, "verifiedBy: idv.org === 'agree' ? 'cli-org' : (idv.verifiedBy || 'api-phase') }, producer);", 'b6a92-si-no-carry'), 'b6a92-si-no-carry'));   // stale-pins: kept (the red control puts the route's line as it was back)
    const LAx = arrive(engPanel, { v: roP, logins: { V: VELA, O: ORIN }, rowOrg: VELA.org, routesMod: rtNoCarry, cli: binOrg });
    const larx = await hush(() => LAx.api.refreshViaCliPanel(LAx.V));
    await sleep(5);
    const laxAfter = await heldOn(LAx), laxSt = LAx.stamp();
    ok('B-6a92 RED CONTROL (TWO CUTS: the carry dropped and panel stamps compared, in copies): the lift is demoted to the organisation\'s mark in the same call and the row is held again at once', larx.v === true && !!laxSt && laxSt.verifiedBy === 'cli-org' && !!laxAfter.v, { v: larx.v, st: laxSt, laxAfter });
    // (r2688 (2)) THE POOL READS NONE for a held row, and a START never ranks the copy above a measured member
    const pvV = P2.eng.poolReadCache(null)(P2.V), pvO = P2.eng.poolReadCache(null)(P2.O);
    const prV = P2.eng.poolReadReading ? P2.eng.poolReadReading()(P2.V) : pvV;
    ok('B-6a92 r2688 THE POOL READS NONE for both rows of a held pair (their files froze and may be the other account\'s numbers): the one decision door answers a MARK with no numbers — no identity sibling\'s file and no estimate stands in',
      !!pvV && pvV.held === 'same-instant' && !pvV.sevenDay && !pvV.fiveHour && !!pvO && pvO.held === 'same-instant' && !pvO.sevenDay && !!prV && prV.held === 'same-instant', { pvV, pvO, prV });
    {
      const AP = require(path.join(REPO, 'src/account-pool-auto.js'));
      const nowS = Math.floor(Date.now() / 1000);
      const measured = { fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 3 * 86400 } };
      const MARK = { held: 'same-instant' };   // the engine's reading of a held row (poolReadReading / poolReadCache)
      const decide = (members, heldIds, marked = true) => { const r = (id) => (heldIds.includes(id) ? (marked ? MARK : null) : id === 'm' ? measured : null); return AP.decidePoolSwitch({ currentId: members[0].id, members, readCache: r, readReading: r, nowSec: nowS, placing: true, proving: new Map(), explain: true }); };
      const mem3 = [{ id: 'copy', name: 'Vela' }, { id: 'orin', name: 'Orin' }, { id: 'm', name: 'Mira' }];
      const dStart = decide(mem3, ['copy', 'orin']), dAll = decide(mem3.slice(0, 2), ['copy', 'orin']), dRel = decide(mem3, ['copy', 'orin'], false);
      ok('B-6a92 r2688 A START NEVER RANKS THE COPY ABOVE A MEASURED MEMBER: the pool\'s default held, a measured member beside it — the start goes to the measured member; a pool whose members are ALL held places on its first member (nothing to rank; the row says why its numbers are unknown)',
        !!dStart && dStart.to === 'm' && dStart.reason === 'held-same-instant' && !!dAll && dAll.to == null, { dStart, dAll });
      ok('B-6a92 RED CONTROL (the held rows read as plain none, no mark — the chooser not told): the held default reads «unread» and the start lands on it to prove it', !!dRel && dRel.to !== 'm' && (dRel.to === 'copy' || dRel.to == null), dRel);
      // (r2855 (2)) A WALL IS A FACT ABOUT THE MEMBER, whatever its reading: a conversation RUNNING on a held member (not a start)
      // that walled it (the caller's `exclude`) moves to the measured member, a busy one (60 % used): it leaves as from any walled member
      const busy = { fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.6, resetsAt: nowS + 3 * 86400 } };
      const rW = (id) => (id === 'copy' || id === 'orin' ? MARK : id === 'm' ? busy : null);
      const walled = (Mod) => Mod.decidePoolSwitch({ currentId: 'copy', members: mem3, readCache: rW, readReading: rW, nowSec: nowS, exclude: ['copy'], explain: true });
      const dWall = walled(AP), dQuiet = AP.decidePoolSwitch({ currentId: 'copy', members: mem3, readCache: rW, readReading: rW, nowSec: nowS, explain: true });
      ok('B-6a92 r2855 A WALL IS A FACT ABOUT THE MEMBER: a conversation running on a held member that walled it moves to the measured member (a hard leave, as from any walled member); with no wall it stays (the held member is judged as unknown)',
        !!dWall && dWall.to === 'm' && dWall.reason === 'exhausted' && dWall.band === 'hard' && !!dQuiet && dQuiet.to == null && dQuiet.reason === 'no-data', { dWall, dQuiet });
      const APF = 'src/account-pool-auto.js', apsrc = read(APF);
      const APnoWall = require(MUT.write(APF, anchored(apsrc, '  const curHeldWalled = !!excluded && excluded.has(currentId) && isHeld(currentId);\n', '  const curHeldWalled = false;\n', 'b6a92-si-mark-masks-wall'), 'b6a92-si-mark-masks-wall'));
      const dWallX = walled(APnoWall);
      ok('B-6a92 RED CONTROL (r2855 (2): the mark masks the wall, in a copy): the walled conversation stays on the held member («no data») — the leg above can fail',
        !!dWallX && dWallX.to == null && dWallX.reason === 'no-data', dWallX);
      // (r2855, small) THE PARKING DEFAULT NEVER FALLS ON A HELD MEMBER (soonestUsableMember: the default's fallback, a removal's hold)
      const park = (Mod, ids) => Mod.soonestUsableMember({ members: ids.map((id) => ({ id })), readCache: rW, nowSec: nowS });
      const APpark = require(MUT.write(APF, anchored(apsrc, "    if (rd && typeof rd === 'object' && typeof rd.held === 'string') return;", '    if (false) return;', 'b6a92-si-park-held'), 'b6a92-si-park-held'));
      const pk = park(AP, ['copy', 'orin', 'm']), pkAll = park(AP, ['copy', 'orin']), pkX = park(APpark, ['copy', 'orin', 'm']);
      ok('B-6a92 r2855 THE PARKING DEFAULT NEVER FALLS ON A HELD MEMBER: listed first, the held members are passed over for the measured one; every member held ⇒ none (as a pool whose members are all signed out)', pk === 'm' && pkAll == null, { pk, pkAll });
      ok('B-6a92 RED CONTROL (r2855 small: parking reads no mark, in a copy): the held member listed first is the parking pick — the leg above can fail', pkX === 'copy', pkX);
      // (r2923) THE REAL WALL ROAD: a pool [Hale, Mira]; Hale held at the start (it and Zeno, outside the pool, on one weekly instant
      // to the second, neither proven), Mira measured and busy (60 % used); a conversation on Hale that moved 5 s ago. Its wall
      // signal on Hale goes through the engine's own demote road (the session's wall recorded, the wall written into Hale's file);
      // then the per-session pass moves it to Mira — past the 180 s dwell belt (a wall is a fact on the belt too) — and the
      // notice says why. With no wall the conversation stays on Hale (judged as any unknown member)
      const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
      const poolWorld = (engMod, { wall = true, unread = null } = {}) => {
        const root = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-si-pool-')));
        const dataDir = path.join(root, 'data'), am = new AccountManager({ dataDir });
        if (!am.poolSupported()) return null;
        const sub = (name) => { const id = am.createSubscription({ name }).id; fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 }); return id; };
        const H = sub('Hale'), M = sub('Mira'), Z = sub('Zeno');
        const P = am.createPool({ name: 'Pool', members: [H, M] }).id;
        am.setPoolTarget(P, H); am.updatePool(P, { auto: true, hot: true });
        const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
        const nS = Math.floor(Date.now() / 1000), INST = nS + 4 * 86400 + 7 * 3600 + 17;
        for (const k of [H, Z]) {
          // r3630: Hale held ONLY by its own file (no shared instant): torn BEFORE the wall (the wall's own write then starts the file again:
          // «started again», its caps unstated) or AFTER it (the file cannot be read at the move)
          if (unread === 'before' && k === H) { fs.writeFileSync(path.join(cacheDir, k + '.json'), '{"fetchedAt": 1, "fiveHour": {'); continue; }
          if (unread === 'after' && k === H) { fs.writeFileSync(path.join(cacheDir, k + '.json'), J({ fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.2, resetsAt: nS + 3600 }, sevenDay: { utilization: 0.3, resetsAt: nS + 3 * 86400 } })); continue; }
          fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(k)), stampOf(INST, 60e3, false));
          fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(k)), witOf(INST, 60e3));
          fs.writeFileSync(path.join(cacheDir, k + '.json'), J({ fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.2, resetsAt: nS + 3600 }, sevenDay: { utilization: 0.3, resetsAt: INST } }));
        }
        fs.writeFileSync(path.join(cacheDir, M + '.json'), J({ fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: nS + 3600 }, sevenDay: { utilization: 0.6, resetsAt: nS + 2 * 86400 } }));
        const sessions = new Map(), notices = [];
        const eng = engMod.create({
          app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
          wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(String(t)), serverSetting: () => undefined, getAccounts: () => am,
          getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
          getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
          getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow: () => false, armedIds: () => [] }),
          getQuotaProbe: () => null, getSessionMetaStore: () => null,
        });
        eng.usageEstimator.burnFor = () => ({});
        eng.usageEstimator.predictVerdict = () => ({ state: 'on', n: 99 });
        quiet(() => eng.repairIdentityAnchors('boot'));   // the start's warm: the standing check holds Hale (and Zeno)
        const sid = 'si-pool-conv';
        const sx = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: 'conv', cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
          _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - 70 * 60e3, _lastRequestAt: Date.now() - 70 * 60e3, _isStreaming: false, _turnState: 'idle' };
        sessions.set(sid, sx); am.ensureSessionPoolLink(P, sid, H, { why: 'spawn' });
        eng._poolSwitchAt.set(P + ':' + sid, Date.now() - 5000);   // it moved 5 s ago: inside the 180 s dwell belt
        const heldAtStart = !!(eng.poolReadCache(P)(H) || {}).held;
        if (wall) quiet(() => eng.demoteWalledAccount(sx, [{ key: H, bucket: 'fiveHour', slot: true, resetsAtMs: (nS + 3600) * 1000, at: Date.now() }]));
        if (unread === 'after') { const fH = path.join(cacheDir, H + '.json'), later = new Date(Date.now() + 2000); fs.writeFileSync(fH, '{"fetchedAt": 1, "fiveHour": {'); fs.utimesSync(fH, later, later); }   // r3630: torn after the wall (a later mtime: no reader keeps the wall's bytes)
        const heldAtMove = !!(eng.poolReadCache(P)(H) || {}).held || !!(eng.poolReadCache(P)(H) || {}).startedAgain;
        const walled = eng._sessionWalls.get(sid);
        quiet(() => eng.maybePoolAutoSwitchForPool(P, { force: true }));
        return { on: am.poolCurrentFor(P, sid), H, M, heldAtStart, heldAtMove, walledH: !!(walled && walled.has(H)), notices };
      };
      const PW = poolWorld(realEng), PWq = poolWorld(realEng, { wall: false });
      const APesc = MUT.write(APF, anchored(apsrc, "...(curHeldWalled ? { escape: 'held-walled' } : {}), ...scrapsInfo(best)", '...scrapsInfo(best)', 'b6a92-si-held-wall-belt'), 'b6a92-si-held-wall-belt');
      const engNoEsc = require(MUT.write(ENG, anchored(esrc, "require('../account-pool-auto.js')", `require(${J(APesc)})`, 'b6a92-si-held-wall-belt-eng', { count: 'any' }), 'b6a92-si-held-wall-belt-eng'));
      const PWx = poolWorld(engNoEsc);
      if (!PW) ok('B-6a92 r2923 THE REAL WALL ROAD — SKIP: pools unsupported on this platform', true);
      else {
        const heldNote = (PW.notices.find((t) => /answered it with a limit while its own numbers are unknown/.test(t)) || null);
        ok('B-6a92 r2923 THE REAL WALL ROAD: Hale held at the start; its wall on the conversation recorded by the engine\'s own demote road; the per-session pass moves the conversation to the measured Mira — inside the 180 s dwell belt (a wall is a fact on the belt too) — and the notice names the cause (Hale answered it with a limit while held)',
          PW.heldAtStart && PW.walledH && PW.on === PW.M && !!heldNote && /Hale/.test(heldNote), { heldAtStart: PW.heldAtStart, walledH: PW.walledH, on: PW.on === PW.M ? 'Mira' : PW.on === PW.H ? 'Hale' : PW.on, heldNote, notices: PW.notices.slice(-3) });
        ok('B-6a92 r2923 …WITH NO WALL the conversation stays on the held Hale (judged as any unknown member: nothing moves it)', !!PWq && PWq.heldAtStart && !PWq.walledH && PWq.on === PWq.H, { on: PWq && (PWq.on === PWq.H ? 'Hale' : PWq.on) });
        ok('B-6a92 RED CONTROL (r2923 1: the held wall\'s move carries no escape, in a copy): the 180 s dwell belt holds the walled conversation on Hale — the leg above can fail', !!PWx && PWx.walledH && PWx.on === PWx.H, { on: PWx && (PWx.on === PWx.H ? 'Hale' : PWx.on === PWx.M ? 'Mira' : PWx.on) });
        // r3630 (round wnv7929nx's must): the escape rides EVERY held cause (the chooser's one predicate), so the notice names the cause it
        // HAS — a member held only because its usage file cannot be read is never said to be on another account's instant (the wrong fix)
        const PU = poolWorld(realEng, { unread: 'after' }), PS = poolWorld(realEng, { unread: 'before' });
        const engAlways = require(MUT.write(ENG, anchored(esrc, "heldWhy: ds.escape === 'held-walled' ? heldWallWhy(curFor, readCache) : null", "heldWhy: ds.escape === 'held-walled' ? \"held on another account's weekly instant\" : null", 'b6a92-r3630-cause-always'), 'b6a92-r3630-cause-always'));   // stale-pins: kept (the red control puts the unconditional clause back; B-9369: through the move's builder, its `heldWhy`)
        const PUx = poolWorld(engAlways, { unread: 'after' });
        const noteOf = (w) => (w && w.notices.find((t) => /answered it with a limit while its own numbers are unknown/.test(t))) || null;
        const unreadNote = noteOf(PU), startedNote = noteOf(PS), unreadNoteX = noteOf(PUx);
        const SAME = /another account's weekly instant/;
        ok('B-6a92 r3630 THE NOTICE NAMES THE CAUSE IT HAS (a file that cannot be read): Hale, held only because its usage file is torn AFTER its wall, moves the conversation to Mira, and the notice says its usage reading could not be read, never «another account\'s weekly instant»; the same-instant world above still says the instant',
          !!PU && PU.heldAtMove && PU.walledH && PU.on === PU.M && !!unreadNote && /its usage reading could not be read/.test(unreadNote) && !SAME.test(unreadNote) && SAME.test(heldNote || ''), { heldAtMove: PU && PU.heldAtMove, walledH: PU && PU.walledH, on: PU && (PU.on === PU.M ? 'Mira' : PU.on === PU.H ? 'Hale' : PU.on), unreadNote, heldNote, notices: PU && PU.notices.slice(-3) });
        ok('B-6a92 r3630 …AND (a file started again): Hale\'s file torn BEFORE its wall: the wall\'s own write starts it again with its caps unstated, the move goes to Mira and the notice says no whole usage reading has come since, never another account\'s instant',
          !!PS && PS.heldAtStart && PS.walledH && PS.on === PS.M && !!startedNote && /no whole usage reading has come since its reading file started again/.test(startedNote) && !SAME.test(startedNote), { on: PS && (PS.on === PS.M ? 'Mira' : PS.on === PS.H ? 'Hale' : PS.on), startedNote });
        ok('B-6a92 RED CONTROL (r3630: the clause unconditional, in a copy): the unread member\'s move is said to be on another account\'s weekly instant — the legs above can fail', !!PUx && PUx.on === PUx.M && !!unreadNoteX && SAME.test(unreadNoteX), { unreadNoteX });
      }
      // (r2923 4) THE REMOVAL'S JOURNAL SAYS THE TRUE REASON: the removed default's only other listed member is held — the parking pick
      // passes it over, the default stays, and the line names the hold (never «no member is signed in and active»)
      const rmWorld = (engMod, { unread = false } = {}) => {
        const root = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-si-rm-')));
        const dataDir = path.join(root, 'data'), am = new AccountManager({ dataDir });
        if (!am.poolSupported()) return null;
        const sub = (name) => { const id = am.createSubscription({ name }).id; fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 }); return id; };
        const D = sub('Dara'), H = sub('Hale'), Z = sub('Zeno');
        const P = am.createPool({ name: 'Pool', members: [D, H] }).id;
        am.setPoolTarget(P, D); am.updatePool(P, { auto: true, hot: true });
        const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
        const nS = Math.floor(Date.now() / 1000), INST = nS + 3 * 86400 + 5 * 3600 + 41;
        if (unread) fs.writeFileSync(path.join(cacheDir, H + '.json'), '{"fetchedAt": 1, "fiveHour": {');   // r3630: Hale's usage file cannot be read (torn bytes), no shared instant
        else for (const k of [H, Z]) { fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(k)), stampOf(INST, 60e3, false)); fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(k)), witOf(INST, 60e3)); }
        const eng = engMod.create({ app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
          serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter }, getAutoResume: () => null, getQuotaProbe: () => null });
        quiet(() => eng.repairIdentityAnchors('boot'));
        // an older record as it arrives (a boot before the first sweep): the pool lists Hale only, its default still Dara
        am.get(P).members = [H];
        const said = [], o = console.log, w = console.warn; console.log = (...a) => said.push(a.join(' ')); console.warn = () => { };
        try { eng.memberRemoved(P, [D]); } finally { console.log = o; console.warn = w; }
        return said.filter((l) => /removed-member evict .*\/default/.test(l));
      };
      const rmL = rmWorld(realEng);
      const engRmOld = require(MUT.write(ENG, anchored(esrc, "          const heldN = othersL.filter((m) => heldForPool(m.id)).length;\n", '          const heldN = 0;\n', 'b6a92-si-rm-reason'), 'b6a92-si-rm-reason'));
      const rmU = rmWorld(realEng, { unread: true });
      const engRmSame = require(MUT.write(ENG, anchored(esrc, "if (heldForPool(m.id)) return false; const r = rcH(m.id); return !!(r && typeof r === 'object' && typeof r.held === 'string');", 'return false;', 'b6a92-r3630-rm-unread'), 'b6a92-r3630-rm-unread'));
      const rmUx = rmWorld(engRmSame, { unread: true });
      const rmX = rmWorld(engRmOld);
      if (rmL) {
        ok('B-6a92 r2923 THE REMOVAL\'S JOURNAL SAYS THE TRUE REASON: the removed default\'s only other listed member is held — the default stays and the line names the hold (1 held on another account\'s weekly instant), never «no member the pool lists is signed in and active»',
          rmL.length === 1 && /stays — no member the pool lists can take it: 1 held on another account's weekly instant/.test(rmL[0]) && !/is signed in and active/.test(rmL[0]), rmL);
        ok('B-6a92 RED CONTROL (r2923 4: the hold not counted, in a copy): the line gives the untrue reason — the leg above can fail', !!rmX && rmX.length === 1 && /is signed in and active/.test(rmX[0]), rmX);
        ok('B-6a92 r3630 THE REMOVAL\'S JOURNAL COUNTS ANY HELD MARK: the only other listed member\'s usage file cannot be read — the default stays and the line says so in its own words (1 whose usage reading could not be read), never «another account\'s weekly instant» nor «signed in and active»',
          !!rmU && rmU.length === 1 && /stays — no member the pool lists can take it: 1 whose usage reading could not be read/.test(rmU[0]) && !/weekly instant|is signed in and active/.test(rmU[0]), rmU);
        ok('B-6a92 RED CONTROL (r3630: only the same-instant hold counted, in a copy): the line gives the untrue reason — the leg above can fail', !!rmUx && rmUx.length === 1 && /is signed in and active/.test(rmUx[0]), rmUx);
      }
      const engSrc = read(ENG);
      // THE CHECK STARTS NO READ — by its own text, able to fail: holdSameInstants calls nothing on the read road
      const bodyOf = (t) => { const a = t.indexOf('function holdSameInstants('); const b = a < 0 ? -1 : t.indexOf('\n}\n', a); return a >= 0 && b > a ? t.slice(a, b) : ''; };
      const READ_ROAD = /refreshViaCliPanel|getQuotaProbe|cliRefresh|autoCli|quotaRefresh|probeUsage|\.tick\(/;
      const own = bodyOf(engSrc), planted = own.replace('    const saidPairs', "    getQuotaProbe()?.ask?.('x');\n    const saidPairs");
      ok('B-6a92 r2688 THE CHECK STARTS NO READ, by its own text: the standing check calls nothing on the read road (no refresh, probe or tick) — and a planted ask in a copy of its text is seen (the pin can fail)', own.length > 500 && !READ_ROAD.test(own) && READ_ROAD.test(planted), own.length);
    }
    // (7) THE REPAIR never seeds a second row onto an instant, and never confirms an anchor on another account's instant from the
    // row's own readings (it may still restamp a row AWAY onto its own different phase — test-readings-attribution §20)
    {
      const RRm = require(path.join(REPO, 'src/reading-repair.js'));
      const plant = ({ velaStamp = null } = {}) => {
        const dd = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-si-rep-')));
        const cache = path.join(dd, 'usage-cache'), anchors = path.join(dd, 'usage-anchors'); fs.mkdirSync(cache, { recursive: true }); fs.mkdirSync(anchors, { recursive: true });
        const nowMs = Date.now(), WO = Math.floor(nowMs / 1000) + 4 * 86400 + 7 * 3600 + 17;   // Orin's instant, to the second
        fs.writeFileSync(path.join(cache, readingLag.windowSidecarName('acct-orin')), J({ sevenDay: WO, fiveHour: null, scoped: {}, at: nowMs - 3600e3, source: 'api', verifiedAt: nowMs - 3600e3, verifiedBy: 'rate-limit-events', producer: 'login' }));   // event-precise (a ring's): r2688 compares only these
        if (velaStamp) fs.writeFileSync(path.join(cache, readingLag.windowSidecarName('acct-vela')), J(velaStamp(WO, nowMs)));
        // Vela's WRITTEN readings were Orin's (filed while it had no window to contradict): five rate-limit moves on Orin's instant
        const rows = Array.from({ length: 5 }, (_, i) => ({ ts: nowMs - (20 - i * 3) * 3600e3, fetchedAt: nowMs - (20 - i * 3) * 3600e3, source: 'rate-limit-event', accountId: 'acct-vela', identityKey: 'id-vela', buckets: { sevenDay: { u: 0.3 + i * 0.05, resetsAt: WO } } }));
        fs.writeFileSync(path.join(anchors, 'anchors-id-vela.ndjson'), rows.map((r) => J(r)).join('\n') + '\n');
        return { dd, cache, WO };
      };
      const repOf = (mod, P) => quiet(() => mod.repairSidecarsByApiPhase({ dataDir: P.dd, roster: ['acct-vela', 'acct-orin'], id: 'si-T', ownIdsOf: (k) => [k] }));
      const stampV = (P) => { try { return JSON.parse(fs.readFileSync(path.join(P.cache, readingLag.windowSidecarName('acct-vela')), 'utf8')); } catch { return null; } };
      const S1 = plant(), r1 = repOf(RRm, S1), s1 = stampV(S1), row1 = r1.identities.find((x) => x.key === 'acct-vela');
      ok('B-6a92 r2543 THE REPAIR SEEDS NO SECOND ROW ONTO AN INSTANT: Vela\'s written readings name Orin\'s instant to the second — nothing is seeded, the row is said', !s1 && !!row1 && /^not seeded/.test(row1.sidecar) && r1.counts.sameInstant >= 1, { row1, s1 });
      const S2 = plant({ velaStamp: (WO, nowMs) => ({ sevenDay: WO, fiveHour: null, scoped: {}, at: nowMs - 600e3, source: 'on-demand' }) });
      const before2 = fs.readFileSync(path.join(S2.cache, readingLag.windowSidecarName('acct-vela')), 'utf8');
      const r2 = repOf(RRm, S2), row2 = r2.identities.find((x) => x.key === 'acct-vela');
      ok('B-6a92 r2543 …AND NEVER CONFIRMS AN ANCHOR ON ANOTHER ACCOUNT\'S INSTANT FROM ITS OWN READINGS: Vela\'s unproven anchor on Orin\'s instant stays as it was, byte for byte', !!row2 && /^not confirmed/.test(row2.sidecar) && fs.readFileSync(path.join(S2.cache, readingLag.windowSidecarName('acct-vela')), 'utf8') === before2, row2);
      const rrsrc = read('src/reading-repair.js'), SEED = "      if (apiShared.length) { sameInstantSkip(`not seeded: the phase its readings name is ${apiShared.map(personName).join(', ')}'s to the second`); continue; }\n";
      const RRx = require(MUT.write('src/reading-repair.js', anchored(rrsrc, SEED, '', 'b6a92-si-seed'), 'b6a92-si-seed'));
      const S3 = RRx ? plant() : null, s3 = S3 ? (repOf(RRx, S3), stampV(S3)) : null;
      ok('B-6a92 RED CONTROL (the repair seeding from its own readings, in a copy — the train before this unit): Vela is seeded onto Orin\'s instant to the second', !!s3 && s3.sevenDay === S3.WO && s3.seededBy === 'si-T', s3);
    }
  }
  // A MOVE ONTO A PHASE NO KNOWN ACCOUNT HOLDS is as today: K readings re-anchor it
  const X = held();
  for (let i = 0; i < 4; i++) { X.reading(0.33, X.RX); await sleep(3); }
  const xSt = X.stamp(), xF = (X.eng.apiDerivedWindow(X.V, { witness: true }) || {}).foreign;
  ok('B-6a92 a move onto a phase NO known account holds re-anchors at K, as today (a genuine plan change), and nothing is unknown', xSt && xSt.sevenDay === X.RX && !xF, { xSt, xF });
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
