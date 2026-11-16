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
const readingLag = require(path.join(REPO, 'src/reading-lag.js'));
const MUT = mutantCopies('reading-truth', REPO);
const FX = JSON.parse(read('scripts/fixtures/reading-truth-episode.json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });

/** A real pool: MA and MB share ONE weekly reset instant (two members can), MC has its own. The session runs
 *  on MA. Auto is OFF: the suite drives the move the pool made (accounts.ensureSessionPoolLink — the ledger row included). */
function mkWorld(engMod = realEng) {
  const root = endScratchAtExit(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rtruth-')));
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
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
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
  ok('LAW 2: a Fable cap on a turn that asked this account for no Fable request ⇒ the cap lane archived by name («a fable model cap on a turn that asked … for no fable request»), the plan week written',
    W.capOf(W.MA) === null && W.u7(W.MA) === 0.902 && a.some((x) => /a fable model cap on a turn that asked .* for no fable request/.test(x.reason)), J({ cap: W.capOf(W.MA), u7: W.u7(W.MA), a: a.map((x) => x.reason) }));
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
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
