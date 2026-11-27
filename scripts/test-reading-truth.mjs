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
import { execFileSync } from 'node:child_process';
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
  const held = (engMod = realEng, { ownReading = true, again = null, ro = null, cli = null, logins = null, routesMod = null, withGlobal = false, rowOrg = null, globalOrg = null, amOpts = null, rv = null, oStamp = null, globalCache = null, oExtra = null } = {}) => {
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
    const nowS = Math.floor(Date.now() / 1000), RV = again ? again.RV : (rv || nowS + 2 * 86400), RO = again ? again.RO : (ro || nowS + 5 * 86400), RX = again ? again.RX : nowS + 3 * 86400 + 11 * 3600;
    // r8 `rowOrg`: Vela's cache names ITS OWN organisation (the group's key, an identity of its own apart from its folder)
    if (!again && ownReading) fs.writeFileSync(path.join(cacheDir, V + '.json'), J({ fetchedAt: Date.now() - 3600e3, source: 'cli-usage', sevenDay: { utilization: 0.2, resetsAt: RV }, ...(rowOrg ? { orgUuid: rowOrg } : {}) }));   // Vela's OWN last reading
    // r7 `withGlobal`: the HUB'S OWN LOGIN ('__global__', a cache file and its stamp like any other) holds the window Orin held, and
    // Orin moves to a window of its own — the held name is then the hub's own login
    const RZ = nowS + 6 * 86400 + 5 * 3600, ROo = withGlobal && !again ? RZ : RO;
    fs.writeFileSync(path.join(cacheDir, O + '.json'), J({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: ROo }, ...(!again && oExtra ? oExtra : {}) }));   // `oExtra`: more of Orin's own file (its address)
    if (!again && globalCache) fs.writeFileSync(path.join(cacheDir, '__global__.json'), J(globalCache({ RO, RV })));   // the hub's own login's file, written BEFORE the engine is made
    if (withGlobal && !again) {
      fs.writeFileSync(path.join(cacheDir, '__global__.json'), J({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: RO }, ...(globalOrg ? { orgUuid: globalOrg } : {}) }));   // r8 `globalOrg`: the hub's login's organisation on file
      fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName('__global__')), J({ at: Date.now(), source: 'on-demand', sevenDay: RO }));
    }
    if (!again) for (const [id, r] of [[V, RV], [O, ROo]]) fs.writeFileSync(path.join(cacheDir, readingLag.windowSidecarName(id)), J({ at: Date.now(), source: 'on-demand', sevenDay: r, ...(id === O && oStamp ? oStamp : {}) }));   // 2.369.422 `oStamp`: more of Orin's stamp (its proof)
    // r5: each row's API witness established on its own window, as a row that has read before holds it (the panel's door judges against it)
    if (!again) for (const [id, r] of [[V, RV], [O, ROo]]) fs.writeFileSync(path.join(cacheDir, readingLag.apiWindowSidecarName(id)), J({ sevenDay: r, scoped: {}, at: Date.now() - 7200e3, sessionId: null, source: 'rate-limit-events', n: 3, ring: [] }));
    const sessions = new Map();
    const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
    const eng = engMod.create({ app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
      serverNotice() { }, serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null });
    const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-held', claudeSessionId: 'cid-held', _accountId: V, pty: { write() { } }, name: 'h' };   // billed to Vela, in no pool
    sessions.set('sess-held', s);
    const sO = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-held-o', claudeSessionId: 'cid-held-o', _accountId: O, pty: { write() { } }, name: 'ho' };   // 2.369.422: a conversation billed to Orin
    sessions.set('sess-held-o', sO);
    const reading = (u, r7) => { s._isStreaming = true; s._turnState = 'running'; TS.noteRequestSent(s, Date.now()); quiet(() => eng.recordRateLimitEvent(s, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: r7 } })); };
    const readingO = (u, r7) => { sO._isStreaming = true; sO._turnState = 'running'; TS.noteRequestSent(sO, Date.now()); quiet(() => eng.recordRateLimitEvent(sO, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: r7 } })); };
    const bannerOf = (sess) => (text = "You've reached your 5-hour limit") => { sess._isStreaming = true; sess._turnState = 'running'; TS.noteRequestSent(sess, Date.now()); quiet(() => eng.markLimitBanner(sess, text)); };   // a limit banner the CLI prints in that conversation
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
    return { s, sessions, readJ, app, root, am, eng, api, V, O, RV, RO, RX, cacheDir, reading, readingO, bannerV: bannerOf(s), bannerO: bannerOf(sO), ownO: () => readJ(O + '.json'), stampO: () => readJ(readingLag.windowSidecarName(O)), witO: () => readJ(readingLag.apiWindowSidecarName(O)), own: () => readJ(V + '.json'), stamp: () => readJ(readingLag.windowSidecarName(V)), wit: () => readJ(readingLag.apiWindowSidecarName(V)), usage };
  };
  // c2b: SIX readings in a row, every one with Orin's window, on a conversation billed to Vela
  const run6 = async (H) => { for (let i = 0; i < 6; i++) { H.reading(0.81, H.RO); await sleep(3); } };
  const sideOf = (u, id) => (u && u.accounts && u.accounts[id] && u.accounts[id].windowUnknown) || null;
  // 2.369.422 HOTFIX (主开发 r5407 / r5410) — THE r560 SCENE RESTATED: a run of readings that moves the row onto a window another
  // known account holds RE-ANCHORS at K, as before 6d6e4d3e7 (through 2.369.417; this hold came with 2.369.418) — nothing held, nothing «unknown», the pool reads the row with no mark
  const H = held();
  await run6(H);
  const ring = (H.wit() && H.wit().ring) || [];
  const named = ring.filter((e) => Array.isArray(e.names) && e.names.includes(H.O)).length;
  const st = H.stamp(), f = (H.eng.apiDerivedWindow(H.V, { witness: true }) || {}).foreign, hU = sideOf((await H.usage()), H.V), hPool = H.eng.poolReadCache(null)(H.V);
  console.log(`    the ring: ${ring.length} entries, ${named} naming Orin's window; Vela's stamp ${st && st.sevenDay} (Orin's ${H.RO})`);
  ok('B-6a92 the guard\'s verdict reaches the ring: each archived reading NAMES the account whose window it carries (≥ K of them)', named >= 3, ring);
  ok('2.369.422 RESTATED (r560\'s scene): six readings of Orin\'s window on a conversation billed to Vela RE-ANCHOR Vela there at K, as before 6d6e4d3e7 (through 2.369.417) — nothing held, nothing «unknown», the pool reads Vela with no mark', !!st && st.sevenDay === H.RO && !f && !hU && !(hPool && hPool.held), { st, f, hU, hPool });
  const esrc = read(ENG);   // r6: the mutants below are made from the engine as it is
  // THE STANDING IDENTITY REPAIR OVER THAT SCENE: it counts none of the readings the guard found to name Orin as Vela's evidence;
  // after it and a restart nothing is held or «unknown»
  const RP = require(path.join(REPO, 'src/reading-repair.js'));
  const repairOver = (W, mod = RP) => quiet(() => mod.repairSidecarsByApiPhase({ dataDir: path.join(W.root, 'data'), accounts: W.am.list().accounts }));
  const G = held();
  await run6(G);
  const gRep = repairOver(G);
  const gRow = ((gRep && gRep.identities) || []).find((r) => r.key === G.V) || {};
  const G2 = held(realEng, { again: G });
  quiet(() => G2.eng.repairIdentityAnchors('boot'));
  ok('B-6a92 THE REPAIR (the must): the standing identity repair counts NONE of the readings the guard found to name Orin as Vela\'s evidence', !!gRow.sources && gRow.sources.named >= 3 && gRow.sources.archived === 0, gRow);
  ok('2.369.422 RESTATED (the repair over r560\'s scene): after the standing repair and a restart nothing is held or «unknown»', !sideOf((await G.usage()), G.V) && !sideOf((await G2.usage()), G2.V) && !(G2.eng.apiDerivedWindow(G2.V, { witness: true }) || {}).foreign, gRow);
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
  const wordsOf = (W) => String((W.api.panelVerdictFor(W.V) || {}).why);
  const noId = (w) => !/mail-|org-[a-z]+-0001/.test(w);   // no identity value in any sentence
  const THIRD = { email: 'mail-third-0001', org: 'org-third-0001' };   // invented
  const TEAMV = { email: 'mail-vela-0001', org: 'org-team-0001' }, TEAMO = { email: 'mail-orin-0001', org: 'org-team-0001' };   // invented
  const GLOBAL = { email: 'mail-cli-0001', org: 'org-cli-0001' };   // invented
  const withHome = async (who, fn) => {
    const h0 = process.env.HOME, home = fs.mkdtempSync(path.join(binDir, 'home-'));
    if (who) fs.writeFileSync(path.join(home, '.claude.json'), J({ oauthAccount: { emailAddress: who.email, organizationUuid: who.org } }), { mode: 0o600 });
    process.env.HOME = home;
    try { return await fn(); } finally { process.env.HOME = h0; }
  };
  const ONE = "loginOf: (n) => probeLog.loginOfAccount(n, { accounts })";
  const FOLDER = "loginOf: (n) => probeLog.machineOauthAccount(accounts.subDir(n))";
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
  // 2.369.422: the restarted world holds no row (no clock hold); the poll's law stands — no file read on a poll
  // NO FILE IS READ ON A POLL (ruled in 2; r6 ruled 3 and 4): a RESTARTED hub — a fresh engine over the held scene, warmed by its
  // start's identity repair — then ten polls, each its own run, the clock carried past the window list's 5 s memo halfway, each
  // poll followed by the window list (as the guard asks it): no poll reads a stamp or a witness sidecar, and the stamp-only
  // member's stamp (Vela: no cache file) is never read again. PREMISES: the counter sees the sidecar's own road; the memo WAS crossed
  const T0 = held(realEng, { ownReading: false });
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
  ok('B-6a92 NO FILE READ ON A POLL: after a restart warmed at its start, ten polls read no stamp and no witness sidecar, the stamp-only member\'s stamp is never re-read across the 5 s memo, and nothing is «unknown» (2.369.422: no hold) (premises: the counter sees a sidecar read; the memo was crossed — a cache-file member\'s stamp re-read)', premise > 0 && crossed > 0 && pollReads.length === 0 && vReads.length === 0 && !tWu, { premise, crossed, pollReads: pollReads.slice(0, 6), vReads: vReads.length, tWu });
  // ═══ 2.369.422 HOTFIX (主开发 r5407 / r5410): B-6a92's «row that ARRIVES on another account's instant» (r2540 / r2543 / r2561) RESTATED ═══
  // The standing check is gone (the vendor states weekly resets on the hour): every scene below holds NOBODY; the r2855 label rule
  // (the ring's own) and the pool's held mark for a file that cannot be read (r3630) stand as they were
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
      A.saidHeld = said.filter((l) => /window held|window hold released/.test(l));   // (A): a hold formed OR released at the start is said — none here
      return A;
    };
    const witO = (X) => { try { return JSON.parse(fs.readFileSync(path.join(X.cacheDir, readingLag.apiWindowSidecarName(X.O)), 'utf8')); } catch { return null; } };
    const heldOn = async (X) => { const u = await X.usage(); return { v: (X.wit() || {}).foreign || null, o: (witO(X) || {}).foreign || null, vu: sideOf(u, X.V), ou: sideOf(u, X.O) }; };
    const placedR = (r) => !!(r && typeof r === 'object' && !r.held && r.sevenDay && Number.isFinite(r.sevenDay.utilization));
    // (1) HONEST NEIGHBOURS — seconds apart, and inside the reading-match tolerance: nobody held
    const N1 = arrive(realEng, { v: roP + 7 }), N2 = arrive(realEng, { v: roP + 90 });
    const n1 = await heldOn(N1), n2 = await heldOn(N2);
    ok('B-6a92 r2543 HONEST NEIGHBOURS: two accounts\' weekly windows 7 s apart, and 90 s apart (inside the 120 s a reading is matched with), hold NOBODY at the start — nearness is not the fault', !n1.v && !n1.o && !n1.vu && !n1.ou && !n2.v && !n2.o && !n2.vu && !n2.ou, { n1, n2 });
    // (2) THE SAME INSTANT, NEITHER PROVEN: nobody held at the start, the start says no hold, it asks no read
    const P2 = arrive(realEng, { v: roP }), p2 = await heldOn(P2);
    ok('2.369.422 RESTATED (r2561\'s scene): two rows on ONE instant, neither proven — at the start NOBODY is held, nothing «unknown», the start says no hold and asks no read', !p2.v && !p2.o && !p2.vu && !p2.ou && P2.saidHeld.length === 0 && asked() === 0, { p2, said: P2.saidHeld, asked: asked() });
    // (3) a proven row and an unproven one on one instant: nobody held — and the readings on it FILE
    const Q1 = arrive(realEng, { v: roP, oProven: true }), q1 = await heldOn(Q1);
    ok('2.369.422 RESTATED (r2543\'s scene): a proven row and an unproven one on one instant — nobody is held', !q1.v && !q1.o && !q1.vu && !q1.ou, q1);
    await run6(Q1);
    const q1b = await heldOn(Q1), q1own = Q1.own();
    ok('2.369.422 RESTATED (r2543\'s agreeing readings): six readings on the shared instant FILE on Vela (its own window) and nothing is held', !q1b.v && !q1b.vu && !!q1own && !!q1own.sevenDay && q1own.sevenDay.utilization === 0.81 && q1own.sevenDay.resetsAt === Q1.RO, { q1b, own: q1own && q1own.sevenDay });
    // (4) an anchor the ring writes onto another account's instant: not held
    const W5 = arrive(realEng, { vNone: true, oProven: true });
    await run6(W5); await sleep(5);
    const w5 = await heldOn(W5), w5st = W5.stamp();
    ok('2.369.422 RESTATED (r2543\'s anchor written): the ring stamps Vela (no window of its own) on Orin\'s instant and NOTHING holds it', !!w5st && w5st.sevenDay === roP && !w5.v && !w5.vu, { w5, st: w5st });
    // (5) THE PANEL ROUNDS: two honest rows anchored by panel reads on one hour — nobody held
    const PH = arrive(realEng, { vStampJ: panelStampOf(roP, 60e3), vWitJ: witOf(roP + 10, 60e3), oStampJ: panelStampOf(roP, 3600e3), oWitJ: witOf(roP + 40, 3600e3) });
    const ph = await heldOn(PH);
    ok('B-6a92 r2688 THE PANEL ROUNDS: two honest rows anchored by panel reads on one hour (their events 30 s apart) hold NOBODY', !ph.v && !ph.o && !ph.vu && !ph.ou, ph);
    // (6) THE POOL: both rows of a pair on one instant read WITH their numbers, no held mark
    const PP = arrive(realEng, { v: roP }), ppV = PP.eng.poolReadCache(null)(PP.V), ppO = PP.eng.poolReadCache(null)(PP.O);
    ok('2.369.422 RESTATED (r2688\'s pool): both rows of a pair on one instant read WITH their numbers — no held mark, the pool may place on both', placedR(ppV) && placedR(ppO), { ppV, ppO });
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
    // r3630 (the pool's held mark for a file that cannot be read, not a clock): the notice names the cause it has
    {
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
        quiet(() => eng.repairIdentityAnchors('boot'));   // the start's warm (2.369.422: no clock hold — Hale is held only by its own unread file)
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
      if (!poolWorld(realEng, { wall: false })) ok('B-6a92 r3630 — SKIP: pools unsupported on this platform', true);
      else {
        // r3630 (round wnv7929nx's must): the escape rides EVERY held cause (the chooser's one predicate), so the notice names the cause it
        // HAS — a member held only because its usage file cannot be read is never said to be on another account's instant (the wrong fix)
        const PU = poolWorld(realEng, { unread: 'after' }), PS = poolWorld(realEng, { unread: 'before' });
        const engAlways = require(MUT.write(ENG, anchored(esrc, "heldWhy: ds.escape === 'held-walled' ? heldWallWhy(curFor, readCache) : null", "heldWhy: ds.escape === 'held-walled' ? \"held on another account's weekly instant\" : null", 'b6a92-r3630-cause-always'), 'b6a92-r3630-cause-always'));   // stale-pins: kept (the red control puts the unconditional clause back; B-9369: through the move's builder, its `heldWhy`)
        const PUx = poolWorld(engAlways, { unread: 'after' });
        const noteOf = (w) => (w && w.notices.find((t) => /answered it with a limit while its own numbers are unknown/.test(t))) || null;
        const unreadNote = noteOf(PU), startedNote = noteOf(PS), unreadNoteX = noteOf(PUx);
        const SAME = /another account's weekly instant/;
        ok('B-6a92 r3630 THE NOTICE NAMES THE CAUSE IT HAS (a file that cannot be read): Hale, held only because its usage file is torn AFTER its wall, moves the conversation to Mira, and the notice says its usage reading could not be read, never «another account\'s weekly instant»',
          !!PU && PU.heldAtMove && PU.walledH && PU.on === PU.M && !!unreadNote && /its usage reading could not be read/.test(unreadNote) && !SAME.test(unreadNote), {  notices: PU && PU.notices.slice(-3) });
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
      const rmU = rmWorld(realEng, { unread: true });
      const engRmSame = require(MUT.write(ENG, anchored(esrc, "if (heldForPool(m.id)) return false; const r = rcH(m.id); return !!(r && typeof r === 'object' && typeof r.held === 'string');", 'return false;', 'b6a92-r3630-rm-unread'), 'b6a92-r3630-rm-unread'));
      const rmUx = rmWorld(engRmSame, { unread: true });
      if (rmU) {
        ok('B-6a92 r3630 THE REMOVAL\'S JOURNAL COUNTS ANY HELD MARK: the only other listed member\'s usage file cannot be read — the default stays and the line says so in its own words (1 whose usage reading could not be read), never «another account\'s weekly instant» nor «signed in and active»',
          !!rmU && rmU.length === 1 && /stays — no member the pool lists can take it: 1 whose usage reading could not be read/.test(rmU[0]) && !/weekly instant|is signed in and active/.test(rmU[0]), rmU);
        ok('B-6a92 RED CONTROL (r3630: only the same-instant hold counted, in a copy): the line gives the untrue reason — the leg above can fail', !!rmUx && rmUx.length === 1 && /is signed in and active/.test(rmUx[0]), rmUx);
      }
    }
    // (7) THE REPAIR seeds and confirms as at 2.369.418: Vela's written readings name Orin's instant — the repair SEEDS Vela from them
    // and CONFIRMS an unproven anchor there (no «others on this instant» skip any more); the report's same-instant count stays 0
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
      ok('2.369.422 RESTATED (r2543\'s repair): Vela\'s written readings name Orin\'s instant — the repair SEEDS Vela from them, as at 2.369.418', !!s1 && s1.sevenDay === S1.WO && !!row1 && row1.sidecar === 'stamped' && !('sameInstant' in r1.counts), { s1, row: row1 && row1.sidecar, counts: r1.counts });
      const S2 = plant({ velaStamp: (WO, nowMs) => ({ sevenDay: WO, fiveHour: null, scoped: {}, at: nowMs - 600e3, source: 'on-demand' }) });
      const r2 = repOf(RRm, S2), row2 = r2.identities.find((x) => x.key === 'acct-vela');
      ok('2.369.422 RESTATED (r2543\'s confirm): Vela\'s unproven anchor on Orin\'s instant is CONFIRMED from its own readings, as at 2.369.418', !!row2 && row2.sidecar === 'confirmed' && !('sameInstant' in r2.counts), { row: row2 && row2.sidecar, counts: r2.counts });
    }
  }
  // A MOVE ONTO A PHASE NO KNOWN ACCOUNT HOLDS is as today: K readings re-anchor it
  const X = held();
  for (let i = 0; i < 4; i++) { X.reading(0.33, X.RX); await sleep(3); }
  const xSt = X.stamp(), xF = (X.eng.apiDerivedWindow(X.V, { witness: true }) || {}).foreign;
  ok('B-6a92 a move onto a phase NO known account holds re-anchors at K, as today (a genuine plan change), and nothing is unknown', xSt && xSt.sevenDay === X.RX && !xF, { xSt, xF });
  // ═══ 2.369.422 HOTFIX (主开发 r5407 / r5410, the owner's hub) — NO ROW IS HELD BECAUSE TWO ACCOUNTS' WEEKLY RESETS COINCIDE ═══
  // The vendor states a weekly reset ON THE HOUR (measured on a real hub: every weekly reset instant the event stream stated there was on a whole hour),
  // so honest accounts share one. Three scenes on a WHOLE HOUR, each with its red: the release's rule planted back in a copy.
  const HOUR = (Math.floor(Date.now() / 3600e3) + 2 * 24 + 7) * 3600;   // a whole hour of the week, two days ahead
  const NEXT_HOUR = HOUR + 3 * 3600;                                    // a phase move: both move onto one new hour
  const foreignOf = (W, id) => (W.eng.apiDerivedWindow(id, { witness: true }) || {}).foreign || null;
  const poolOf = (W, id) => { try { return W.eng.poolReadCache(null)(id); } catch { return null; } };
  const placed = (r) => !!(r && typeof r === 'object' && !r.held && r.sevenDay && Number.isFinite(r.sevenDay.utilization));
  // THE RED IS THE RELEASE ITSELF where the clone holds it (主开发 r5442's should — no paraphrase): 1a4abf716's own engine, reading-lag and
  // repair, read from git and loaded as copies (the engine's two requires pointed at the release's two files); every other module is the
  // tree's, which the hotfix did not touch. A SHALLOW CLONE (the hosted runner's: a checkout with no history, 主开发 r5481 (1)) holds no
  // 1a4abf716: the release-read reds are then a NAMED SKIP the gate counts (as test-billing-pick), and the release's three rules stand in
  // as small IN-TREE PLANTS in a copy of this tree's engine — so a shallow clone still holds three reds that can fail; the run says which
  let relWhy = null;
  const relOf = (f) => { try { return execFileSync('git', ['show', '1a4abf716:' + f], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { relWhy = relWhy || String((e && (e.stderr || e.message)) || e).split('\n').filter(Boolean)[0] || 'unknown'; return null; } };
  const relRL = relOf('src/reading-lag.js'), relRR = relOf('src/reading-repair.js'), relENG = relOf(ENG);
  const rlRelPath = relRL ? MUT.write('src/reading-lag.js', relRL, 'rel421-reading-lag') : null, rrRelPath = relRR ? MUT.write('src/reading-repair.js', relRR, 'rel421-reading-repair') : null;
  const mRelease = relENG && rlRelPath && rrRelPath ? require(MUT.write(ENG, relENG.split("require('../reading-lag.js')").join(`require(${J(rlRelPath)})`).split("require('../reading-repair.js')").join(`require(${J(rrRelPath)})`), 'rel421-engine')) : null;
  // the release's three rules as the in-tree plants (each in a copy of this tree's engine): the standing check at the start's warm,
  // the ring's hold at a move, a start that keeps a hold on disk
  const esrcH = read(ENG);
  const WARM_END = "  try { _ownWin = null; _ownWinAt = 0; establishedWindows(); } catch { }\n  return keys.size;";
  const STANDING_PLANT = "  try { _ownWin = null; _ownWinAt = 0; establishedWindows(); } catch { }\n  try { const ws = establishedWindows(); for (const a of Object.keys(ws)) for (const b of Object.keys(ws)) { if (a === b || ownGroupOf(a).has(b) || !(Number(ws[a].sevenDay) > 0) || !(Number(ws[b].sevenDay) > 0) || ws[a].verifiedBy === 'own-panel' || readingLag.weeklyPhase(ws[a].sevenDay) !== readingLag.weeklyPhase(ws[b].sevenDay)) continue; const raw = readApiWitnessFile(a) || {}; const foreign = { names: [b], phase: Number(ws[a].sevenDay), at: Date.now(), n: 0, by: 'same-instant' }; if (usageWrite.writeSidecar(USAGE_CACHE_DIR, readingLag.apiWindowSidecarName(a), { ...raw, foreign })) noteHeldWindow(a, foreign); } } catch { }\n  return keys.size;";
  const MOVE_AT = "      // about whose readings these are (B-6a92 r560's hold here held an honest row until a press — no longer)\n";
  const MOVE_PLANT = MOVE_AT + "      { const heldBy0 = moved ? othersOf(key, [...new Set(agreeing.flatMap((e) => (Array.isArray(e.names) ? e.names : [])))]) : []; if (heldBy0.length) { next.foreign = { names: heldBy0.slice(0, 4), phase: entry.resetsAt, at: entry.at, n: run }; const ok0 = usageWrite.writeSidecar(USAGE_CACHE_DIR, readingLag.apiWindowSidecarName(key), next); if (ok0) noteHeldWindow(key, next.foreign); return ok0 ? res : null; } }\n";
  const WARM_LOOP = "releaseClockHold(k, readApiWitnessFile(k)); noteHeldWindow(k, null);";
  let skipped = 0;
  if (!mRelease) {
    // r5516 (4): «shallow» only when git says so; any other cause by its own first line
    let shallow = null; try { shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { shallow = null; }
    skipped++; globalThis.__rtSkipped = skipped;
    console.log(`  - SKIP the three reds read from the release itself (${shallow === 'true' ? 'this clone is shallow: the release 1a4abf716 is not in its history' : `git could not read the release 1a4abf716: ${relWhy}`}) — its three rules stand in as in-tree plants in a copy of this engine`);
  }
  const mStanding = mRelease || (esrcH.includes(WARM_END) ? require(MUT.write(ENG, esrcH.split(WARM_END).join(STANDING_PLANT), 'hot422-standing-check-planted')) : null);
  const mMove = mRelease || (esrcH.includes(MOVE_AT) ? require(MUT.write(ENG, esrcH.split(MOVE_AT).join(MOVE_PLANT), 'hot422-move-hold-planted')) : null);
  const mKeep = mRelease || (esrcH.includes(WARM_LOOP) ? require(MUT.write(ENG, esrcH.split(WARM_LOOP).join('const w = readApiWitnessFile(k); noteHeldWindow(k, w && w.foreign);'), 'hot422-start-keeps-holds')) : null);
  console.log(`    the three reds below read ${mRelease ? 'the release 1a4abf716 itself' : 'the in-tree plants (no release in this clone)'}`);
  console.log('2.369.422 HOTFIX — two honest accounts on ONE WHOLE HOUR of the week: nobody held, every reading filed, the pool places on both');
  // ① THE MEASURED SCENE: two honest rows (each folder its own login), their anchors and their event-precise witnesses on one whole
  // hour, Vela's anchor unproven (a panel's), Orin's proven (its own read) — the owner's shape. Then the start, one reading each
  const measured = async (engMod) => {
    const W = held(engMod, { rv: HOUR, ro: HOUR, logins: { V: VELA, O: ORIN }, oStamp: { verifiedBy: 'own-panel' } });
    quiet(() => W.eng.repairIdentityAnchors('boot'));
    const heldV = foreignOf(W, W.V), heldO = foreignOf(W, W.O), poolV0 = poolOf(W, W.V), poolO0 = poolOf(W, W.O);
    W.reading(0.37, HOUR); await sleep(3); W.readingO(0.53, HOUR); await sleep(3);
    const v = W.own() || {}, o = W.ownO() || {}, u = await W.usage();
    return { O: W.O, heldV, heldO, unknownV: sideOf(u, W.V), unknownO: sideOf(u, W.O), filedV: !!(v.sevenDay && v.sevenDay.utilization === 0.37), filedO: !!(o.sevenDay && o.sevenDay.utilization === 0.53), placedV: placed(poolOf(W, W.V)), placedO: placed(poolOf(W, W.O)), poolV0: !!(poolV0 && poolV0.held), poolO0: !!(poolO0 && poolO0.held) };
  };
  const m1 = await measured(realEng);
  console.log(`    the measured scene: ${J(m1)}`);
  ok('2.369.422 THE MEASURED SCENE — two honest rows on one whole hour (Vela unproven, Orin proven): after the start NEITHER is held, nothing is «unknown», each files its own reading, the pool places on both',
    !m1.heldV && !m1.heldO && !m1.unknownV && !m1.unknownO && m1.filedV && m1.filedO && m1.placedV && m1.placedO && !m1.poolV0 && !m1.poolO0, m1);
  const m1r = mStanding ? await measured(mStanding) : null;
  ok('2.369.422 RED CONTROL (the release\'s standing check planted back, in a copy): Vela is held on Orin\'s hour and the pool reads it held — the leg above can fail', !!m1r && !!m1r.heldV && Array.isArray(m1r.heldV.names) && m1r.heldV.names.includes(m1r.O) && (m1r.poolV0 || !m1r.placedV), m1r);
  // ② A PHASE MOVE ONTO ONE NEW WHOLE HOUR (a plan change, the vendor re-binning): both rows move onto it — Orin's ring first (nobody holds it), then Vela's (now Orin's hour)
  const turned = async (engMod) => {
    const W = held(engMod, { rv: HOUR, ro: HOUR, logins: { V: VELA, O: ORIN }, oStamp: { verifiedBy: 'own-panel' } });
    quiet(() => W.eng.repairIdentityAnchors('boot'));
    for (let i = 0; i < 4; i++) { W.readingO(0.11, NEXT_HOUR); await sleep(3); }
    const went = [];
    for (let i = 0; i < 4; i++) { const u = 0.21 + i / 100; W.reading(u, NEXT_HOUR); await sleep(3); const v = (W.own() || {}).sevenDay || {}, o = (W.ownO() || {}).sevenDay || {}; went.push(v.utilization === u ? 'Vela' : o.utilization === u ? 'Orin' : 'archived'); }
    W.reading(0.29, NEXT_HOUR); await sleep(3);
    const st = W.stamp() || {}, stO = W.stampO() || {}, v = W.own() || {}, u = await W.usage();
    return { O: W.O, went, heldV: foreignOf(W, W.V), heldO: foreignOf(W, W.O), stampV: st.sevenDay === NEXT_HOUR, stampO: stO.sevenDay === NEXT_HOUR, unknownV: sideOf(u, W.V), filedV: !!(v.sevenDay && v.sevenDay.utilization === 0.29), placedV: placed(poolOf(W, W.V)) };
  };
  const m2 = await turned(realEng);
  console.log(`    the move onto one new hour: ${J(m2)}`);
  ok('2.369.422 A PHASE MOVE — both rings move onto one new whole hour: NEITHER is held, both re-anchor there, Vela\'s next reading is filed on Vela and the pool places on it',
    !m2.heldV && !m2.heldO && m2.stampV && m2.stampO && !m2.unknownV && m2.filedV && m2.placedV && !m2.went.includes('Orin'), m2);
  console.log(`    the move's first readings of the new hour (a request known): ${m2.went.join(' · ')} — none under Orin; the window guard's re-file road (no request known) is the train's (B)`);
  const m2r = mMove ? await turned(mMove) : null;
  ok('2.369.422 RED CONTROL (the release\'s hold at a move planted back, in a copy): Vela, moving onto Orin\'s new hour, is held naming Orin — the leg above can fail', !!m2r && !!m2r.heldV && Array.isArray(m2r.heldV.names) && m2r.heldV.names.includes(m2r.O) && !m2r.stampV, m2r);
  // ③ A HUB THAT STARTS WITH A HOLD ON DISK, of each kind (written by 2.369.419–2.369.421): Vela held by the standing check, Orin by the
  // ring at a move — a FRESH engine over that folder: both are free at the start, no press; the start says it once a row
  const started = async (engMod) => {
    const W0 = held(realEng, { rv: HOUR, ro: HOUR, logins: { V: VELA, O: ORIN } });
    const put = (id, foreign) => { const f = path.join(W0.cacheDir, readingLag.apiWindowSidecarName(id)), w = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, J({ ...w, foreign })); };
    put(W0.V, { names: [W0.O], phase: HOUR, at: Date.now() - 3600e3, n: 0, by: 'same-instant' });
    put(W0.O, { names: [W0.V], phase: HOUR, at: Date.now() - 3600e3, n: 6 });
    const W = held(engMod, { again: W0 });
    const said = (await hush(() => W.eng.repairIdentityAnchors('boot'))).said;
    const u = await W.usage(), wv = W.wit() || {}, wo = W.witO() || {};
    return { heldV: foreignOf(W, W.V), heldO: foreignOf(W, W.O), fileV: !!wv.foreign, fileO: !!wo.foreign, unknownV: sideOf(u, W.V), unknownO: sideOf(u, W.O), placedV: placed(poolOf(W, W.V)), placedO: placed(poolOf(W, W.O)), lines: said.filter((l) => /window hold released/.test(l)).length };
  };
  const m3 = await started(realEng);
  console.log(`    a start with both hold kinds on disk: ${J(m3)}`);
  ok('2.369.422 A START WITH A HOLD ON DISK (each kind: the standing check\'s, the ring\'s at a move): both rows are free at once — no hold in memory or on file, nothing «unknown», the pool places on both, and the start says it once a row',
    !m3.heldV && !m3.heldO && !m3.fileV && !m3.fileO && !m3.unknownV && !m3.unknownO && m3.placedV && m3.placedO && m3.lines === 2, m3);
  const m3r = mKeep ? await started(mKeep) : null;
  ok('2.369.422 RED CONTROL (a start that keeps a hold on disk, as the release\'s did): both rows stay held — the leg above can fail', !!m3r && !!m3r.heldV && !!m3r.heldO, m3r);

  // ═══ 2.369.423 (主开发 r5410 (A)) — IDENTITY, NEVER A CLOCK: the door's refusal at EVERY press, on the one notion (rowOwnAccountIds) ═══
  console.log('2.369.423 (A) — the press of a row whose own read answers as ANOTHER known row\'s login is refused, held or not');
  // the r6 world: Vela's own organisation on file, its folder signed in as Orin; six readings of Orin's window re-anchor it (no hold
  // any more), so the panel answering in that window agrees — the gap row B-6a92 set out to close: the press must not write
  const pressScene = async (engMod, opts, { land = false, home = null } = {}) => {
    const W = held(engMod, { ro: roP, cli: binHeld, ...opts });
    if (land) await W.am.signinFactsSettled();
    await run6(W);
    const press = () => hush(() => W.api.refreshViaCliPanel(W.V));
    const r = home ? await withHome(home, press) : await press();
    const own = W.own() || {};
    return { v: r.v, why: wordsOf(W), ownU: own.sevenDay ? own.sevenDay.utilization : null, stamp: (W.stamp() || {}).verifiedBy || null };
  };
  const SIGNED = /sign-in folder is signed in as/;
  const a1 = await pressScene(realEng, { logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org }, { land: true });
  console.log(`    the r6 press, no hold: ${J(a1)}`);
  ok('2.369.423 (A) THE r6 PRESS WITH NO HOLD: Vela (its own organisation on file, its folder signed in as Orin) — refused «signed in as Orin», NOTHING written (its file not the panel\'s 12 %, its stamp not the own read\'s)', a1.v === false && /Vela's sign-in folder is signed in as Orin/.test(a1.why) && a1.ownU !== 0.12 && a1.stamp !== 'own-panel', a1);
  const WIDEN = "    if (!h) {\n      const answer = answeringLogin(idv);";
  const mNoWiden = esrc.includes(WIDEN) ? require(MUT.write(ENG, esrc.split(WIDEN).join("    if (!h) { return false;\n      const answer = answeringLogin(idv);"), 'a423-no-widening')) : null;
  const a1r = mNoWiden ? await pressScene(mNoWiden, { logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org }, { land: true }) : null;
  ok('2.369.423 (A) RED CONTROL (the door at a held row only, as the hotfix left it, in a copy): the same press WRITES the other login\'s numbers on Vela as verified — the leg above can fail', !!a1r && a1r.v === true && !SIGNED.test(a1r.why), a1r);
  const a2 = await pressScene(realEng, { logins: { V: ORIN, O: ORIN } }, { land: true });   // BOUND 1: no organisation of Vela's own
  ok('2.369.423 (A) A TWIN OF THE ROW\'S OWN ACCOUNT (BOUND 1: no organisation of Vela\'s own, its folder Orin\'s login — one account by the group) is NEVER refused by it', !SIGNED.test(a2.why) && a2.v === true, a2);
  const a3 = await pressScene(realEng, {});   // nothing on file names which account Vela is
  ok('2.369.423 (A) A ROW WITH NO IDENTITY ON FILE (no organisation, no login, no address) is NEVER refused by it', !SIGNED.test(a3.why), a3);
  const a4 = await pressScene(realEng, { logins: { V: TEAMV, O: TEAMO } });   // two seats of one Team organisation, Vela's folder its own seat
  ok('2.369.423 (A) TWO SEATS OF ONE ORGANISATION: Vela\'s own read (its own address) is NEVER refused as Orin\'s', !SIGNED.test(a4.why), a4);
  const a5 = await pressScene(realEng, { logins: { V: GLOBAL, O: ORIN }, withGlobal: true, rowOrg: VELA.org }, { home: GLOBAL });
  ok('2.369.423 (A) THE HUB\'S OWN LOGIN (r7): Vela\'s folder holds the hub\'s login — refused «signed in as» the hub\'s label, nothing written', a5.v === false && SIGNED.test(a5.why), a5);
  // r5481 — THE TRUE TWIN: both rows the same organisation on file, both folders that login — one account: never refused, written
  const a6 = await pressScene(realEng, { logins: { V: ORIN, O: ORIN }, rowOrg: ORIN.org, oExtra: { orgUuid: ORIN.org } }, { land: true });
  ok('2.369.423 (A) A TRUE TWIN (both rows Orin\'s organisation on file, both folders Orin\'s login): NEVER refused by it, the read written', !SIGNED.test(a6.why) && a6.v === true, a6);
  // r5481 (2) — THE DOOR TOUCHES NO FILE: every synchronous file call made INSIDE the door, counted on the r6 press (refused) and on an
  // honest press (written) — the release made none there (with no hold it returned at once); the red reads each login from its folder
  // (dcffa2828's reader: probeLog.loginOfAccount, one file per known account and the home's), in a copy
  const SYNC = ['readFileSync', 'statSync', 'lstatSync', 'existsSync', 'openSync', 'readdirSync', 'accessSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'mkdirSync', 'readSync'];
  const doorCalls = async (engMod, opts) => {
    const W = held(engMod, { ro: roP, cli: binHeld, ...opts });
    await W.am.signinFactsSettled();
    await run6(W);
    const L = W.app.locals, real = L.liftHeldWindow, saved = {};
    let n = 0, inDoor = false, called = 0;
    for (const k of SYNC) { saved[k] = fs[k]; fs[k] = function (...a) { if (inDoor) n++; return saved[k].apply(this, a); }; }
    L.liftHeldWindow = (...a) => { called++; inDoor = true; try { return real(...a); } finally { inDoor = false; } };
    let r = null;
    try { r = await hush(() => W.api.refreshViaCliPanel(W.V)); } finally { for (const k of SYNC) fs[k] = saved[k]; L.liftHeldWindow = real; }
    return { n, called, v: r && r.v, why: wordsOf(W) };
  };
  const KEPT = '      const keptLogin = (n) => {\n';
  const mFileReader = esrc.includes(KEPT) ? require(MUT.write(ENG, esrc.split(KEPT).join('      const keptLogin = (n) => probeLog.loginOfAccount(n, { accounts });\n      const keptLogin0 = (n) => {\n'), 'a423-door-reads-folders')) : null;
  const R6 = { logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org }, HONEST = { logins: { V: VELA, O: ORIN }, rowOrg: VELA.org, rv: roP };   // honest: Vela's folder its own login, its own window the panel's
  const c1 = await doorCalls(realEng, R6), c2 = await doorCalls(realEng, HONEST), c1r = mFileReader ? await doorCalls(mFileReader, R6) : null;
  console.log(`    the door's synchronous file calls: the r6 press ${c1.n}, an honest press ${c2.n}; the folder reader's (red) ${c1r && c1r.n}`);
  ok('2.369.423 (A) r5481 (2) THE DOOR TOUCHES NO FILE: inside the door, the r6 press (refused) and an honest press (written) make NO synchronous file call — every login it compares is in memory', c1.called >= 1 && c2.called >= 1 && c1.n === 0 && c2.n === 0 && c1.v === false && SIGNED.test(c1.why) && c2.v === true, { c1, c2 });
  ok('2.369.423 (A) r5481 (2) RED CONTROL (each login read from its folder, as dcffa2828 did, in a copy): the same press makes one synchronous read per known account — the leg above can fail', !!c1r && c1r.n >= 2 && c1r.v === false, c1r);
  // r5481 (4) — A PERSON's OWN SIGN-IN ON A ROW IS THE ROW's EDIT DOOR. Vela (its own organisation on file, its folder its own login,
  // signed in through the product: a proven tie) is signed in AGAIN by its own door into Orin's account — the door's landing
  // (finalizeSubscription: every door outcome that keeps the sign-in in the row ends there) ties the login just made: from that act
  // Vela IS that account (a twin of Orin), never refused. The same login COPIED into Vela's folder with no such act is refused
  const CREDS2 = (tag) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + tag, refreshToken: 'r-' + tag, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3 + 3600e3, subscriptionType: 'max' } });
  const putLogin = (W, id, tag, who) => { const d = W.am.subDir(id); fs.writeFileSync(path.join(d, '.credentials.json'), CREDS2(tag), { mode: 0o600 }); fs.writeFileSync(path.join(d, '.claude.json'), J({ oauthAccount: { emailAddress: who.email, organizationUuid: who.org } }), { mode: 0o600 }); };
  const editDoor = async (engMod, { act }) => {
    const W = held(engMod, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN }, rowOrg: VELA.org });
    W.am.finalizeSubscription(W.V);            // Vela's own sign-in through the product (its tie proven)
    await W.am.signinFactsSettled();
    if (act) { putLogin(W, W.V, 'vela-again', ORIN); W.am.finalizeSubscription(W.V); }   // the person signs Vela in again — into Orin's account
    else putLogin(W, W.V, 'orin-copy', ORIN);   // a copied folder: Orin's login put in Vela's folder, no act of the product's sign-in
    await W.am.signinFactsNow([W.V]);          // the keeper reads the folder as it is NOW (a read that starts after the change)
    const rec = W.am.identityRecordOf(W.V, { since: 0 }) || {};
    await run6(W);
    const r = await hush(() => W.api.refreshViaCliPanel(W.V));
    const own = W.own() || {};
    return { tie: rec.tie || null, recOrg: rec.org === ORIN.org ? 'orin' : rec.org ? 'other' : null, v: r.v, why: wordsOf(W), ownU: own.sevenDay ? own.sevenDay.utilization : null };
  };
  const e1 = await editDoor(realEng, { act: true }), e2 = await editDoor(realEng, { act: false });
  console.log(`    the edit door: re-signed ${J(e1)}; copied ${J(e2)}`);
  ok('2.369.423 (A) r5481 (4) A PERSON\'s OWN SIGN-IN IS THE ROW\'s EDIT DOOR: Vela signed in again by its own door into Orin\'s account (its tie proven, its record Orin\'s) is from that act that account — its read WRITTEN, never refused', e1.tie === 'proven' && e1.recOrg === 'orin' && e1.v === true && !SIGNED.test(e1.why), e1);
  ok('2.369.423 (A) r5481 (4) …A COPIED FOLDER (Orin\'s login put in Vela\'s folder with no such act: untied, its record names no organisation) is REFUSED «signed in as Orin», nothing written', e2.recOrg === null && e2.v === false && /Vela's sign-in folder is signed in as Orin/.test(e2.why) && e2.ownU !== 0.12, e2);
  const EDIT1 = "  if (rec && rec.tie === 'proven' && typeof rec.org === 'string' && rec.org) return 'org:' + rec.org.toLowerCase();\n", EDIT2 = "return (r && m.rec.tie === 'proven') ? r : (c || r || null); };";
  const mNoEdit = esrc.includes(EDIT1) && esrc.includes(EDIT2) ? require(MUT.write(ENG, esrc.split(EDIT1).join('').split(EDIT2).join('return c || r || null; };'), 'a423-no-edit-door')) : null;   // stale-pins: kept (the red puts dcffa2828's rule back)
  const e1r = mNoEdit ? await editDoor(mNoEdit, { act: true }) : null;
  ok('2.369.423 (A) r5481 (4) RED CONTROL (the row\'s identity its file\'s alone, as dcffa2828 read it, in a copy): the person\'s own re-sign is refused at every press — the leg above can fail', !!e1r && e1r.v === false && SIGNED.test(e1r.why), e1r);
  // r5516 (4) — THE RE-SIGN THROUGH THE REAL ROAD: a sign-in a person finished on Vela whose BEFORE is lost (a start between the press and
  // the sign-in, or one another process wrote) — the door ASKS (reloginResolve «ask»), the person answers «same» (reloginAnswer): from
  // that act Vela is that account, its read written; red: the row's identity its file's alone (the same copy as above)
  const realRoad = async (engMod) => {
    const W = held(engMod, { ro: roP, cli: binHeld, logins: { V: VELA, O: ORIN }, rowOrg: VELA.org });
    W.am.finalizeSubscription(W.V);            // Vela's own sign-in through the product
    await W.am.signinFactsSettled();
    putLogin(W, W.V, 'vela-asked', ORIN);       // the person signed Vela in again — into Orin's account
    let asked = null, answered = null;
    try { asked = quiet(() => W.am.reloginResolve(W.V)); } catch (e) { asked = { outcome: 'threw: ' + e.message }; }
    if (asked && asked.outcome === 'ask') { try { answered = quiet(() => W.am.reloginAnswer(W.V, 'same')); } catch (e) { answered = { outcome: 'threw: ' + e.message }; } }
    await W.am.signinFactsNow([W.V]);
    const rec = W.am.identityRecordOf(W.V, { since: 0 }) || {};
    await run6(W);
    const r = await hush(() => W.api.refreshViaCliPanel(W.V));
    return { asked: asked && asked.outcome, answered: answered && answered.outcome, tie: rec.tie || null, recOrg: rec.org === ORIN.org ? 'orin' : rec.org ? 'other' : null, v: r.v, why: wordsOf(W) };
  };
  const rr1 = await realRoad(realEng), rr1r = mNoEdit ? await realRoad(mNoEdit) : null;
  console.log(`    the real road: ${J(rr1)}`);
  ok('2.369.423 (A) r5516 (4) THE RE-SIGN THROUGH THE REAL ROAD (a lost before: the door asks, the person answers «same»): from that act Vela is Orin\'s account — its tie proven, its record Orin\'s, its read WRITTEN, never refused', rr1.asked === 'ask' && rr1.answered === 'same' && rr1.tie === 'proven' && rr1.recOrg === 'orin' && rr1.v === true && !SIGNED.test(rr1.why), rr1);
  ok('2.369.423 (A) r5516 (4) RED CONTROL (the same road, the row\'s identity its file\'s alone, in a copy): refused — the leg above can fail', !!rr1r && rr1r.asked === 'ask' && rr1r.v === false && SIGNED.test(rr1r.why), rr1r);
  // r5516 (3) — THE REFUSAL NEVER NAMES A ROW OF ANOTHER HARNESS: Vela (its own organisation on file) holds a login no row has; a row of
  // ANOTHER harness (Cora: its kept record a codex one) carries that login's address — never «the other account»; red: every row compared
  const ELSE = { email: 'mail-else-0001', org: 'org-else-0001' };   // invented
  const harnessScene = async (engMod) => {
    const W = held(engMod, { ro: roP, cli: binHeld, logins: { V: ELSE, O: ORIN }, rowOrg: VELA.org });
    const C = W.am.createSubscription({ name: 'Cora' }).id;
    const real = W.am.identityRecordOf.bind(W.am);
    W.am.identityRecordOf = (id, o) => (id === C ? { harness: 'codex', seat: null, address: ELSE.email, org: 'ws-cora-0001', conflict: false, tie: null } : real(id, o));   // the kept record of another harness's row (a stand-in)
    await W.am.signinFactsSettled();
    await run6(W);
    const r = await hush(() => W.api.refreshViaCliPanel(W.V));
    return { v: r.v, why: wordsOf(W) };
  };
  const HARN = "        if (!r || r.harness !== ownHarness) return null;\n";
  const mAnyHarness = esrc.includes(HARN) ? require(MUT.write(ENG, esrc.split(HARN).join('        if (!r) return null;\n'), 'a423-any-harness')) : null;
  const hs1 = await harnessScene(realEng), hs1r = mAnyHarness ? await harnessScene(mAnyHarness) : null;
  console.log(`    another harness's row: ${J(hs1)}; every row compared (red): ${J(hs1r)}`);
  ok('2.369.423 (A) r5516 (3) ANOTHER HARNESS\'s ROW sharing the address is NEVER named: Vela\'s read is not refused «signed in as Cora»', !SIGNED.test(hs1.why), hs1);
  ok('2.369.423 (A) r5516 (3) RED CONTROL (every row compared, its harness unasked, in a copy): the refusal names Cora — the leg above can fail', !!hs1r && hs1r.v === false && /signed in as Cora/.test(hs1r.why), hs1r);
  // THE CAPTURE's AND THE BANNER's IDENTITY (the door unit's (B) must, r5302 / r5326): a row's file never takes another account's
  // organisation through a sibling's base — judged on the files (no hold any more), each with its red
  const freshV = (W) => { const vf = path.join(W.cacheDir, W.V + '.json'), o = JSON.parse(fs.readFileSync(vf, 'utf8')); fs.writeFileSync(vf, J({ ...o, fetchedAt: Date.now() })); const of = path.join(W.cacheDir, W.O + '.json'), oo = JSON.parse(fs.readFileSync(of, 'utf8')); fs.writeFileSync(of, J({ ...oo, fetchedAt: Date.now() - 3600e3 })); };
  const idScene = async (engMod, road) => {
    const W = held(engMod, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org });
    await W.am.signinFactsSettled();
    if (road === 'capture' || road === 'banner') freshV(W);
    if (road === 'capture') W.readingO(0.85, W.RO);
    if (road === 'banner') W.bannerO();
    if (road === 'mirror') W.bannerV();
    await sleep(3);
    return { orinOrg: (W.ownO() || {}).orgUuid || null, velaOrg: (W.own() || {}).orgUuid || null };
  };
  const CAPF = 'src/rate-limit-capture.js', capSrc = read(CAPF), CAPCALL = '    keepOwnIdentity(cache, { ownFile, ownHad, base, baseId, ownIds, ids });\n', CAPREQ = "require('../rate-limit-capture.js');";
  const capCopy = capSrc.includes(CAPCALL) ? MUT.write(CAPF, capSrc.split(CAPCALL).join(''), 'a423-capture-as-was') : null;
  const mCap = capCopy && esrc.includes(CAPREQ) ? require(MUT.write(ENG, esrc.split(CAPREQ).join(`require(${J(capCopy)});`), 'a423-engine-capture-as-was')) : null;
  const BANCALL = '    keepOwnIdentity(cache, { ownFile, ownHad, base, baseId, ownIds: rowOwnAccountIds(key), ids });\n';
  const mBan = esrc.includes(BANCALL) ? require(MUT.write(ENG, esrc.split(BANCALL).join(''), 'a423-banner-as-was')) : null;
  for (const [road, mod, red] of [['capture', mCap, 'the capture as it was'], ['banner', mBan, 'the banner\'s write as it was'], ['mirror', mBan, 'the banner\'s mirror as it was']]) {
    const g = await idScene(realEng, road), r = mod ? await idScene(mod, road) : null;
    const goodOk = road === 'mirror' ? g.velaOrg === VELA.org : g.orinOrg !== VELA.org && g.velaOrg === VELA.org;
    const redOk = !!r && (road === 'mirror' ? !r.velaOrg : r.orinOrg === VELA.org);
    ok(`2.369.423 (A) THE ${road.toUpperCase()}'s IDENTITY: a row's file never takes another account's organisation through a sibling's base (each file names only its own)`, goodOk, g);
    ok(`2.369.423 (A) RED CONTROL (${red}, in a copy): the organisation moves between the two files — the leg above can fail`, redOk, r);
  }
  // …and the org-less machine login as the freshest base, the group split (the should of r5326): Vela keeps its organisation
  const machine = async (engMod) => {
    const W = held(engMod, { ro: roP, cli: binHeld, logins: { V: ORIN, O: ORIN }, rowOrg: VELA.org, oExtra: { orgEmail: ORIN.email },
      globalCache: ({ RO }) => ({ fetchedAt: Date.now(), source: 'cli-usage', sevenDay: { utilization: 0.81, resetsAt: RO }, email: ORIN.email, orgEmail: ORIN.email }) });
    await W.am.signinFactsSettled();
    const g = W.eng.usageIdentityGroupsCached(), ownV = [...((g.ownOf && g.ownOf.get(W.V)) || [])], grp = W.eng.usageIdentityAccountIds(W.V);
    W.reading(0.3, W.RV); await sleep(3);
    return { formed: grp.includes('__global__') && ownV.includes('__global__') && !ownV.includes(W.O), grp, ownV, velaOrg: (W.own() || {}).orgUuid || null };
  };
  const CLS = '  if (!outside && !(split && !!ownFile.orgUuid && !base.orgUuid)) return false;';
  const capCopyB = capSrc.includes(CLS) ? MUT.write(CAPF, capSrc.split(CLS).join('  if (!outside) return false;'), 'a423-capture-orgless') : null;
  const mCapB = capCopyB && esrc.includes(CAPREQ) ? require(MUT.write(ENG, esrc.split(CAPREQ).join(`require(${J(capCopyB)});`), 'a423-engine-capture-orgless')) : null;
  const mg = await machine(realEng), mgr = mCapB ? await machine(mCapB) : null;
  ok('2.369.423 (A) THE ORG-LESS MACHINE LOGIN (the scene formed: it joined the group and stands in Vela\'s own set, Orin does not): a reading filed on Vela keeps Vela\'s OWN organisation', mg.formed && mg.velaOrg === VELA.org, mg);
  ok('2.369.423 (A) RED CONTROL (the rule without the split clause, in a copy; the scene formed): the machine login\'s base takes Vela\'s organisation off its file', !!mgr && mgr.formed && !mgr.velaOrg, mgr);
  // THE POOL's HELD MARK, restated on the mark that still stands (主开发 r5442's should): a member whose usage file cannot be read
  {
    const AP = require(path.join(REPO, 'src/account-pool-auto.js'));
    const nowS = Math.floor(Date.now() / 1000);
    const measuredR = { fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 3 * 86400 } };
    const MARK = { held: 'unread' };   // the engine's reading of a member whose usage file cannot be read
    const decide = (members, heldIds, marked = true) => { const r = (id) => (heldIds.includes(id) ? (marked ? MARK : null) : id === 'm' ? measuredR : null); return AP.decidePoolSwitch({ currentId: members[0].id, members, readCache: r, readReading: r, nowSec: nowS, placing: true, proving: new Map(), explain: true }); };
    const mem3 = [{ id: 'torn', name: 'Vela' }, { id: 'orin', name: 'Orin' }, { id: 'm', name: 'Mira' }];
    const dStart = decide(mem3, ['torn', 'orin']), dAll = decide(mem3.slice(0, 2), ['torn', 'orin']), dRel = decide(mem3, ['torn', 'orin'], false);
    ok('2.369.423 (A) A START NEVER RANKS AN UNREAD MEMBER ABOVE A MEASURED ONE: the pool\'s default unread, a measured member beside it — the start goes to the measured member; every member unread ⇒ it stays on its first', !!dStart && dStart.to === 'm' && dStart.reason === 'held-unread' && !!dAll && dAll.to == null, { dStart, dAll });
    ok('2.369.423 (A) RED CONTROL (the unread rows read as plain none, no mark): the start lands on the unread default', !!dRel && dRel.to !== 'm', dRel);
    const busy = { fetchedAt: Date.now() - 60e3, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.6, resetsAt: nowS + 3 * 86400 } };
    const rW = (id) => (id === 'torn' || id === 'orin' ? MARK : id === 'm' ? busy : null);
    const walled = (Mod) => Mod.decidePoolSwitch({ currentId: 'torn', members: mem3, readCache: rW, readReading: rW, nowSec: nowS, exclude: ['torn'], explain: true });
    const dWall = walled(AP), dQuiet = AP.decidePoolSwitch({ currentId: 'torn', members: mem3, readCache: rW, readReading: rW, nowSec: nowS, explain: true });
    ok('2.369.423 (A) A WALL IS A FACT ABOUT THE MEMBER: a conversation on an unread member that walled it moves to the measured member; with no wall it stays', !!dWall && dWall.to === 'm' && dWall.reason === 'exhausted' && !!dQuiet && dQuiet.to == null, { dWall, dQuiet });
    const APF = 'src/account-pool-auto.js', apsrc = read(APF);
    const APnoWall = require(MUT.write(APF, anchored(apsrc, '  const curHeldWalled = !!excluded && excluded.has(currentId) && isHeld(currentId);\n', '  const curHeldWalled = false;\n', 'a423-mark-masks-wall'), 'a423-mark-masks-wall'));
    const dWallX = walled(APnoWall);
    ok('2.369.423 (A) RED CONTROL (the mark masks the wall, in a copy): the walled conversation stays on the unread member', !!dWallX && dWallX.to == null, dWallX);
    const park = (Mod, ids) => Mod.soonestUsableMember({ members: ids.map((id) => ({ id })), readCache: rW, nowSec: nowS });
    const APpark = require(MUT.write(APF, anchored(apsrc, "    if (rd && typeof rd === 'object' && typeof rd.held === 'string') return;", '    if (false) return;', 'a423-park-held'), 'a423-park-held'));
    const pk = park(AP, ['torn', 'orin', 'm']), pkAll = park(AP, ['torn', 'orin']), pkX = park(APpark, ['torn', 'orin', 'm']);
    ok('2.369.423 (A) THE PARKING DEFAULT NEVER FALLS ON AN UNREAD MEMBER: listed first, they are passed over for the measured one; every member unread ⇒ none', pk === 'm' && pkAll == null, { pk, pkAll });
    ok('2.369.423 (A) RED CONTROL (parking reads no mark, in a copy): the unread member listed first is the parking pick', pkX === 'torn', pkX);
  }
  // A RELEASE WHOSE WRITE IS REFUSED (主开发 r5442's should): the start says it, the row is free in memory at once, and its next
  // ring write drops the hold from the file (the ring carries none)
  {
    const REL = "  if (!usageWrite.writeSidecar(USAGE_CACHE_DIR, readingLag.apiWindowSidecarName(key), rest)) {";
    const mNoRel = esrc.includes(REL) ? require(MUT.write(ENG, esrc.split(REL).join('  if (true) {'), 'a423-release-refused')) : null;
    const W0 = held(realEng, { rv: HOUR, ro: HOUR, logins: { V: VELA, O: ORIN } });
    const f0 = path.join(W0.cacheDir, readingLag.apiWindowSidecarName(W0.V)), w0 = JSON.parse(fs.readFileSync(f0, 'utf8'));
    fs.writeFileSync(f0, J({ ...w0, foreign: { names: [W0.O], phase: HOUR, at: Date.now() - 3600e3, n: 0, by: 'same-instant' } }));
    const W = mNoRel ? held(mNoRel, { again: W0 }) : null;
    const said = [];   // the release's failure is a warning: both streams are read here (hush keeps the log only)
    if (W) { const o = console.log, w = console.warn; console.log = (...x) => said.push(x.join(' ')); console.warn = (...x) => said.push(x.join(' ')); try { W.eng.repairIdentityAnchors('boot'); } finally { console.log = o; console.warn = w; } }
    const fileHeld0 = !!(W && (W.wit() || {}).foreign), memHeld = W ? foreignOf(W, W.V) : 'none', u = W ? await W.usage() : null;
    if (W) { W.reading(0.37, HOUR); await sleep(3); }
    const fileHeld1 = !!(W && (W.wit() || {}).foreign);
    ok('2.369.423 (A) A RELEASE WHOSE WRITE IS REFUSED: the start says so by name, the row is free in memory at once (nothing «unknown», the lazy loader reads no hold from disk), and its next reading\'s ring write drops the hold from the file',
      !!W && said.some((l) => /could not be released at this start/.test(l)) && fileHeld0 && !memHeld && !sideOf(u, W.V) && !fileHeld1, { said: said.filter((l) => /hold/.test(l)), fileHeld0, memHeld, fileHeld1 });
  // ═══ 2.369.423 (B) (主开发 r5471 / r5534): A RE-FILE IS AN ARCHIVE, NEVER ANOTHER ROW; THE GUARD JUDGES ONE HARNESS ═══
  // Vela's phase TRULY moves onto the one hour Orin stands on; eight readings on each road. The red is the release's rule planted
  // back in a copy of this engine (no history needed): the guard over every harness's stamps, a re-file to the window's owner and
  // the turn re-pinned onto it
  {
    console.log('2.369.423 (B) — a reading is filed under the row whose sign-in produced it, or under none; one harness judged');
    const HB = (Math.floor(Date.now() / 3600e3) + 2 * 24 + 7) * 3600, NB = HB + 3 * 3600;
    const esrcB = read(ENG);
    const RELB = [
      ["  const hk = windowHarnessOf(key);\n  if (!windowStampsWritten(hk)) return key;   // (B) r5534: no guard for a harness whose stamps nothing writes\n", "  const hk = null;\n"],
      ["windows: establishedWindowsOf(hk), groupOf: windowGroupOf", "windows: establishedWindows(), groupOf: windowGroupOf"],   // stale-pins: kept (the release's table put back in the red)
      ["  if (d.action === 'refile') d = { ...d, action: 'archive', reason: noRefile ?", "  if (d.action === 'refile' && noRefile) d = { ...d, action: 'archive', reason: noRefile ?"],
      ["  const sid = session?._webuiId || session?.claudeSessionId || '-';\n", "  if (d.action === 'refile') return d.key;\n  const sid = session?._webuiId || session?.claudeSessionId || '-';\n"],
      ["      // (B) r5534: the guard never answers another row — no re-file, so no re-pin of the turn onto another account\n", "      if (target !== key) { key = target; refiled = true; if (witness && witness.ok) noteApiDerivedWindow(slotKey, witnessEv, session, { outcome: 'refiled', producer: producer(), names }); try { session._turnReadingSlot = { key, slotOk: !!validateBillingSlot(session?._accountId || null, key).ok, at: Date.now() }; } catch { } }\n"],
    ];
    const relSrc = RELB.every(([a]) => esrcB.split(a).length === 2) ? RELB.reduce((t, [a, b]) => t.split(a).join(b), esrcB) : null;
    const mRelB = relSrc ? require(MUT.write(ENG, relSrc, 'b423-release-refile')) : null;
    ok('2.369.423 (B) SETUP: the release\'s rule plants back whole (five anchors, each once) — the reds below can fail', !!mRelB);
    const mkB = (engMod) => { const W = held(engMod, { rv: HB, ro: NB, logins: { V: VELA, O: ORIN }, oStamp: { verifiedBy: 'own-panel' } }); quiet(() => W.eng.repairIdentityAnchors('boot')); return W; };
    const convB = (W, id, extra = {}) => { const c = { backend: 'claude', mode: 'chat', host: null, _webuiId: id, claudeSessionId: 'cid-' + id, _accountId: W.V, pty: { write() { } }, name: id, ...extra }; W.sessions.set(id, c); return c; };
    const evB = (W, sess) => (u) => quiet(() => W.eng.recordRateLimitEvent(sess, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resetsAt: NB } }));
    const filedB = async (W, push, n = 8, base = 0.40) => {
      const rows = []; let reAt = null;
      for (let i = 1; i <= n; i++) {
        const u = Math.round((base + i / 100) * 100) / 100;
        push(u); await sleep(3);
        const v = (W.own() || {}).sevenDay || {}, o = (W.ownO() || {}).sevenDay || {};
        rows.push(v.utilization === u ? 'V' : o.utilization === u ? 'O' : 'a');
        if (reAt == null && (W.stamp() || {}).sevenDay === NB) reAt = i;
      }
      return { rows: rows.join(''), underOrin: rows.filter((x) => x === 'O').length, reAt };
    };
    const ROADS_A = {
      'no pool (the slot\'s reason null)': (W) => evB(W, convB(W, 'b-a2')),
      'turn-pinned, slot validated': (W) => { const c = convB(W, 'b-a3'); c._turnReadingSlot = { key: W.V, slotOk: true, at: Date.now() }; return evB(W, c); },
    };
    for (const [road, mk] of Object.entries(ROADS_A)) {
      const W = mkB(realEng), r = await filedB(W, mk(W));
      const Wr = mRelB ? mkB(mRelB) : null, rr = Wr ? await filedB(Wr, mk(Wr)) : null;
      console.log(`    road (a), ${road}: ${r.rows} (re-anchored at ${r.reAt}); the release: ${rr && rr.rows}`);
      ok(`2.369.423 (B) ROAD (a), ${road}: Vela's phase moved onto Orin's hour — NONE of eight readings under Orin; the first three archived, Vela re-anchors at the third by its own ring, the rest Vela's (no person's press)`, r.underOrin === 0 && r.reAt === 3 && r.rows === 'aaaVVVVV', r);
      ok(`2.369.423 (B) RED CONTROL (the release's rule, in a copy), road (a), ${road}: eight of eight filed under Orin — the leg above can fail`, !!rr && rr.underOrin === 8, rr);
    }
    {
      const W = mkB(realEng), c = convB(W, 'b-a4'); c._turnReadingSlot = { key: W.V, slotOk: false, at: Date.now() };
      const r = await filedB(W, evB(W, c));
      const r2 = await filedB(W, evB(W, convB(W, 'b-a4v')), 4, 0.60);   // then a conversation of Vela's own with a validated slot
      const Wr = mRelB ? mkB(mRelB) : null; let rr = null;
      if (Wr) { const cr = convB(Wr, 'b-a4'); cr._turnReadingSlot = { key: Wr.V, slotOk: false, at: Date.now() }; rr = await filedB(Wr, evB(Wr, cr)); }
      console.log(`    road (a), a slot NOT validated: ${r.rows}, then a validated one: ${r2.rows} (re-anchored at ${r2.reAt}); the release: ${rr && rr.rows}`);
      ok('2.369.423 (B) ROAD (a), a slot NOT validated: none under Orin, all archived (no ring candidate), and the row re-anchors at its first validated readings of its own — the release\'s rule for such a slot', r.underOrin === 0 && r.rows === 'aaaaaaaa' && r2.underOrin === 0 && r2.reAt === 3, { r, r2 });
      ok('2.369.423 (B) RED CONTROL (the release\'s rule, in a copy), an unvalidated slot: eight of eight under Orin', !!rr && rr.underOrin === 8, rr);
    }
    // ROAD (b): the ⟳'s first rung asks Vela's live conversation (control:get_usage); its answer names Orin's hour
    const roadB = async (engMod) => {
      const W = mkB(engMod), wrote = []; W.s.pty = { write: (x) => wrote.push(x) };
      const got = [];
      for (let i = 1; i <= 3; i++) {
        const u = 0.70 + i / 100, p = W.eng.probeUsageForAccountKey(W.V, { detailed: true });
        await sleep(3);
        let id = null; try { id = JSON.parse(String(wrote[wrote.length - 1] || '{}')).request_id; } catch { id = null; }
        const pend = id && W.eng._vsuPending && W.eng._vsuPending.get(id);
        if (pend) { clearTimeout(pend.timer); W.eng._vsuPending.delete(id); pend.raw = null; quiet(() => pend.resolve({ sevenDay: { utilization: u, resetsAt: NB }, fiveHour: null })); }
        await quiet(() => p);
        const v = (W.own() || {}).sevenDay || {}, o = (W.ownO() || {}).sevenDay || {};
        got.push(v.utilization === u ? 'V' : o.utilization === u ? 'O' : 'a');
      }
      const then = await filedB(W, evB(W, W.s), 4, 0.85);   // 0.86–0.89: no fixture file reads one of them (Orin's own reads 0.81)
      return { answers: got.join(''), underOrin: got.filter((x) => x === 'O').length + then.underOrin, then: then.rows, reAt: then.reAt };
    };
    const b1 = await roadB(realEng), b1r = mRelB ? await roadB(mRelB) : null;
    console.log(`    road (b): the answers ${b1.answers}, then Vela's own events ${b1.then} (re-anchored at ${b1.reAt}); the release: ${b1r && b1r.answers}`);
    ok('2.369.423 (B) ROAD (b), control:get_usage: three answers naming Orin\'s hour are archived (none under Orin, none under Vela), and Vela\'s own conversation\'s events re-anchor it at the third', b1.answers === 'aaa' && b1.underOrin === 0 && b1.reAt === 3, b1);
    ok('2.369.423 (B) RED CONTROL (the release\'s rule, in a copy), road (b): the answers are filed under Orin', !!b1r && /O/.test(b1r.answers), b1r);
    // ROAD (c) — your scene six: a codex row whose leftover stamp stands on the hour Vela's claude row moved off, its readings on Orin's
    // hour: a harness whose stamps nothing writes has no guard — every reading filed under the codex row, none elsewhere, none archived
    const roadC = async (engMod) => {
      const W = mkB(engMod);
      const cx = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'b-cx', claudeSessionId: null, _accountId: null, pty: { write() { } }, name: 'cx' };
      W.sessions.set('b-cx', cx);
      fs.writeFileSync(path.join(W.cacheDir, '__global_codex__.json'), J({ fetchedAt: Date.now() - 3600e3, source: 'codex', sevenDay: { utilization: 0.1, resetsAt: HB } }));
      fs.writeFileSync(path.join(W.cacheDir, readingLag.windowSidecarName('__global_codex__')), J({ at: Date.now(), source: 'on-demand', sevenDay: HB }));
      quiet(() => W.eng.repairIdentityAnchors('hourly'));   // the established-window memo dropped: the guard reads the folder as it is now
      const arch = path.join(W.root, 'data', 'archive', 'readings-window-mismatch.ndjson');
      const archN = () => { try { return fs.readFileSync(arch, 'utf8').split('\n').filter((l) => /codex:/.test(l)).length; } catch { return 0; } };
      const rows = [];
      for (let i = 1; i <= 8; i++) {
        const pct = 40 + i;
        quiet(() => W.eng.recordCodexQuotaSignal(cx, { type: 'rate_limits_updated', rateLimits: { primary: { used_percent: 5, window_minutes: 300, resets_at: Math.floor(Date.now() / 1000) + 3600 }, secondary: { used_percent: pct, window_minutes: 10080, resets_at: NB } } }));
        await sleep(3);
        const c7 = (W.readJ('__global_codex__.json') || {}).sevenDay || {}, o7 = (W.ownO() || {}).sevenDay || {};
        const near = (x) => x != null && (Math.abs(Number(x) - pct / 100) < 1e-9 || Number(x) === pct);
        rows.push(near(c7.utilization) ? 'C' : near(o7.utilization) ? 'O' : 'a');
      }
      return { rows: rows.join(''), underOrin: rows.filter((x) => x === 'O').length, archived: archN() };
    };
    const c1 = await roadC(realEng), c1r = mRelB ? await roadC(mRelB) : null;
    console.log(`    road (c), a codex row with a leftover stamp: ${J(c1)}; the release: ${J(c1r)}`);
    ok('2.369.423 (B) ROAD (c), a codex row with a stamp nothing writes (a leftover), its readings on a claude row\'s hour: all eight filed under the codex row, none under the claude row, none archived — no guard for that harness', c1.rows === 'CCCCCCCC' && c1.underOrin === 0 && c1.archived === 0, c1);
    ok('2.369.423 (B) RED CONTROL (the release\'s guard over every harness, in a copy), road (c): the codex readings are filed under the claude row', !!c1r && c1r.underOrin >= 1, c1r);
    // THE STATUSLINE MIRROR (data/bin/vibespace-usage, its own guard): a render of Vela's carrying Orin's hour is refused, never re-filed
    const tool = read('data/bin/vibespace-usage'), TOOL_LINE = "    if (d.action !== 'write') return;   // (B) r5471 / r5534: a re-file is an ARCHIVE, never another row (the server's guard, the same law)\n";
    const statusScene = (toolText) => {
      const dir = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX + 'rtruth-sl-'))), cdir = path.join(dir, 'usage-cache'); fs.mkdirSync(cdir, { recursive: true });
      const old = (Date.now() - 3600e3) / 1000;
      for (const [k, r] of [['sub-vela', HB], ['sub-orin', NB]]) {
        const f = path.join(cdir, k + '.json'); fs.writeFileSync(f, J({ fetchedAt: Date.now() - 3600e3, source: 'cli-usage', sevenDay: { utilization: 0.2, resetsAt: r } })); fs.utimesSync(f, old, old);
        fs.writeFileSync(path.join(cdir, readingLag.windowSidecarName(k)), J({ at: Date.now(), source: 'on-demand', sevenDay: r }));
      }
      const tp = path.join(dir, 'vibespace-usage'); fs.writeFileSync(tp, toolText);
      try { execFileSync(process.execPath, [tp], { input: J({ model: { id: 'claude-opus-5' }, rate_limits: { five_hour: { used_percentage: 20, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 47, resets_at: NB } } }), env: { ...process.env, VIBESPACE_USAGE_CACHE: cdir, VIBESPACE_ACCOUNT_KEY: 'sub-vela' }, stdio: ['pipe', 'ignore', 'ignore'] }); } catch { }
      const u = (k) => ((JSON.parse(fs.readFileSync(path.join(cdir, k + '.json'), 'utf8')).sevenDay || {}).utilization);
      return { vela: u('sub-vela'), orin: u('sub-orin'), refused: fs.existsSync(path.join(cdir, '.window-refused.ndjson')) };
    };
    const TOOL_ARCH = "    const d = d0.action === 'refile' ? { ...d0, action: 'archive', reason: `its window names ${d0.key}'s account, not ${key}'s — never filed under another row (${d0.reason})` } : d0;\n";
    const relTool = tool.includes(TOOL_LINE) && tool.includes(TOOL_ARCH) ? tool.split(TOOL_ARCH).join("    const d = d0;\n").split(TOOL_LINE).join("    if (d.action === 'archive') return;\n    if (d.action === 'refile') key = d.key;\n") : null;   // stale-pins: kept (the release statusline rule put back in the red)
    const sl = statusScene(tool), slr = relTool ? statusScene(relTool) : null;   // stale-pins: kept (the release's statusline rule put back in the red)
    console.log(`    the statusline: ${J(sl)}; the release's: ${J(slr)}`);
    ok('2.369.423 (B) THE STATUSLINE MIRROR: a render of Vela\'s carrying Orin\'s hour is REFUSED (written down), Orin\'s file untouched and Vela\'s too', sl.orin === 0.2 && sl.vela === 0.2 && sl.refused, sl);
    ok('2.369.423 (B) RED CONTROL (the release\'s statusline rule, in a copy): the render lands on Orin\'s file', !!slr && slr.orin === 0.47, slr);
  }
  }}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass}${typeof globalThis.__rtSkipped === 'number' && globalThis.__rtSkipped ? `, ${globalThis.__rtSkipped} skipped — the release's history is not in this clone` : ''})`);
process.exit(fail ? 1 : 0);
