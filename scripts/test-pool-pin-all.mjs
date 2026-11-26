#!/usr/bin/env node
// test-pool-pin-all — B-2083 unit B (lane lg-recovery, 主开发 r5166 / r5177): THE MEMBER ROW's ONE PRESS «Move every conversation of this
// pool here now», over the REAL pool engine (src/server/usage-pool-engine.js) with an in-process hot pool of three members — stand-in
// subscriptions with made-up credentials and readings: no real account, no vendor program, nothing asked of any vendor.
//   ① THE PLAN SAYS WHAT THE PRESS DOES: the same counts (now · at the next restart · waiting and why · pinned elsewhere · here ·
//      remote); every conversation through the ONE writer, its record on disk; a warm conversation and a running one moved by the
//      pin's own road (its link re-pointed, nothing killed); ONE notice for the press; the pool's default and order untouched
//   ② A MEMBER THAT CANNOT SERVE: every pin kept and waiting, said by its why, nothing moved
//   ③ ONE PRESS BACK: only the pins to THIS member are cleared; ONE notice
//   ④ THE PERSON's PRESS: the tree's one verdict refuses an agent's, a job's and an automation key's sign-in; the routes ask it first
//   (r5294) ⑤ THE MONEY: the plan carries the target's paying facts (paid overage in use · usage credits · not known yet), read by the
//      readers the writer hands the pin's verdict; ⑥ ONE RULE: on a cold pool and for a follower the press counts by the plan's own road
//      (never «at their next restart» for a member that cannot serve); ⑦ THE LOOP: one pin a turn of the loop under a placed stall in
//      the record's write, and a second press refused by name while one runs
// Each law carries a red copy of the engine (ONE anchored edit) or of the check it replaces. In-process, no server.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ENG_REL = 'src/server/usage-pool-engine.js';
const engMod = require(path.join(REPO, ENG_REL));
const SRC = fs.readFileSync(path.join(REPO, ENG_REL), 'utf8');
const M = mutantCopies('pool-pin-all', REPO);
const copyOf = (tag, from, to) => M.load(ENG_REL, anchored(SRC, from, to, tag), tag);   // a red copy of the engine: ONE anchored edit (every section's own)
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const PR = require(path.join(REPO, 'src/pool-pin-record.js'));
const scr = scratch('pool-pin-all'); fs.mkdirSync(scr, { recursive: true });
const J = (x) => JSON.stringify(x);
const CREDS = (id) => J({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
const quietA = async (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };   // the press is async (r5294 MUST 3)

/** a hot pool of three members — A (the default, usable), B (usable), C (out of quota) — and its conversations */
function world(Mod, { hot = true, readingOf = null } = {}) {
  const root = fs.mkdtempSync(path.join(scr, 'w-'));
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const A = am.createSubscription({ name: 'Member A' }).id, B = am.createSubscription({ name: 'Member B' }).id, C = am.createSubscription({ name: 'Member C' }).id;
  for (const x of [A, B, C]) fs.writeFileSync(path.join(am.subDir(x), '.credentials.json'), CREDS(x), { mode: 0o600 });
  const P = am.createPool({ name: 'Team' }).id;
  am.setPoolTarget(P, A); am.updatePool(P, { auto: true, hot });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000), wk = nowS + 3 * 86400;
  const reading = (five) => J({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: five, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: wk } });
  // B's record STATES a refusal of overage (the vendor's «rejected»): the one positive fact that it bills nothing past its quota (r5333)
  const own = { [A]: reading(0.2), [B]: J({ ...JSON.parse(reading(0.1)), overage: { inUse: false, status: 'rejected', asOf: Date.now() } }), [C]: reading(1.0) };
  for (const [id, who] of [[A, 'A'], [B, 'B'], [C, 'C']]) { const txt = readingOf ? readingOf(who, own[id], nowS) : own[id]; if (txt != null) fs.writeFileSync(path.join(cacheDir, id + '.json'), txt); }
  const sessions = new Map(), notices = [];
  const eng = Mod.create({
    app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(String(t)), serverSetting: () => undefined, getAccounts: () => am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
    getQuotaProbe: () => null, getSessionMetaStore: () => null,
  });
  const writes = [];
  /** a live conversation of the pool: `link` its own member link (null: a follower of the default), `pin` an earlier person's pin */
  const mk = (sid, { link = A, pin = null, host = null, agoMs = 60e3, running = false } = {}) => {
    const s = { backend: 'claude', mode: 'chat', host, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(),
      pty: { write: (d) => writes.push([sid, String(d)]), kill: () => writes.push([sid, 'KILL']) }, _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - agoMs, _lastRequestAt: Date.now() - agoMs,
      _isStreaming: running, _turnState: running ? 'running' : 'idle', ...(pin ? { _poolPin: { memberId: pin, at: Date.now() - 3600e3, by: 'user' } } : {}) };
    sessions.set(sid, s);
    if (link && !host) am.ensureSessionPoolLink(P, sid, link, { why: 'spawn' });
    return s;
  };
  const placedOf = (sid) => { try { return am.poolCurrentFor(P, sid); } catch { return null; } };
  const recOf = (sid) => { try { return (PR.read(dataDir, P, 'cw-' + sid) || {}).rec || null; } catch { return null; } };
  const poolFacts = () => { const a = am.get(P) || {}; let cur = null; try { cur = am.poolCurrent(P); } catch { cur = null; } return J({ current: cur, priority: a.priority || null, members: a.members || null, auto: !!a.auto, hot: !!a.hot }); };
  return { eng, am, A, B, C, P, sessions, notices, writes, mk, placedOf, recOf, poolFacts, dataDir };
}
const counts = (r) => J({ now: r.now, restart: r.restart, waits: r.waits, here: r.here, provider: r.provider, remote: r.remote, unread: r.unread, elsewhere: r.elsewhere });
/** §1's world: six conversations in the states the sentence counts */
function scene1(Mod) {
  const w = world(Mod); if (!w) return null;
  w.mk('s-warm', { agoMs: 30e3 });                  // warm, idle between turns (the pool's own move would hold it)
  w.mk('s-run', { agoMs: 5e3, running: true });     // a turn running now
  w.mk('s-follower', { link: null });               // a follower of the pool's default: no link of its own
  w.mk('s-here', { pin: w.B });                     // already pinned to B by an earlier press of the person
  w.mk('s-else', { pin: w.A });                     // pinned to A earlier: re-pinned to B, counted apart
  w.mk('s-remote', { host: 'h-far' });              // on another machine
  return w;
}

console.log('§1 THE PLAN SAYS WHAT THE PRESS DOES — one pin each, through the one writer');
const w1 = scene1(engMod);
if (!w1) ok(true, 'SKIP — pools are not supported on this platform');
else {
  const facts0 = w1.poolFacts(), nPlan = w1.notices.length;
  const plan = quiet(() => w1.eng.pinAllPlan(w1.P, w1.B));
  ok(plan.ok === true && counts(plan) === J({ now: 3, restart: 1, waits: {}, here: 1, provider: 0, remote: 1, unread: 0, elsewhere: 1 }) && plan.pays === null,
    'THE PLAN (nothing written): 3 move now (warm, running, re-pinned), 1 at its next restart (a follower), 1 already here, 1 on another machine, 1 of them pinned elsewhere; B bills nothing past its quota — its record states overage refused (pays null)', plan);
  ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => w1.recOf(sid) === null) && w1.notices.length === nPlan, 'the plan wrote nothing and said nothing', w1.notices.slice(nPlan));
  const n0 = w1.notices.length;
  const r = await quietA(() => w1.eng.pinAll(w1.P, w1.B, { by: 'user' }));
  ok(r.ok === true && counts(r) === counts(plan), 'THE PRESS did what the plan said, count for count', { plan: counts(plan), press: counts(r) });
  ok(['s-warm', 's-run', 's-follower', 's-else', 's-here'].every((sid) => (w1.sessions.get(sid)._poolPin || {}).memberId === w1.B) && !w1.sessions.get('s-remote')._poolPin,
    'every conversation of the pool is pinned to B; the remote one is untouched');
  ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => (w1.recOf(sid) || {}).memberId === w1.B), 'THE ONE WRITER: each new pin is on disk in its own record (the person\'s pin outlives a restart)', ['s-warm', 's-run', 's-follower', 's-else'].map((sid) => [sid, w1.recOf(sid)]));
  ok(w1.placedOf('s-warm') === w1.B && w1.placedOf('s-run') === w1.B && w1.placedOf('s-else') === w1.B && w1.placedOf('s-follower') !== w1.B,
    'THE PIN\'s OWN ROAD: the warm and the running conversations are re-pointed now (a manual choice is never held by a warm cache); the follower waits for its restart', ['s-warm', 's-run', 's-else', 's-follower'].map((sid) => [sid, w1.placedOf(sid)]));
  ok(w1.writes.length === 0 && w1.sessions.size === 6, 'NOTHING IS CUT: no conversation was written to, killed or removed (the running turn goes on, on its new link)', w1.writes);
  ok(w1.notices.length - n0 === 1 && /4 conversation\(s\) pinned to Member B by one press — 3 now, 1 at their next restart, 0 waiting\./.test(w1.notices[w1.notices.length - 1]), 'ONE notice for the press (never one a conversation), with the split the toast says (r5294 should)', w1.notices);
  ok(w1.poolFacts() === facts0, 'NO DEFAULT CHANGES: the pool\'s default, order, members and mode are as they were', { before: facts0, after: w1.poolFacts() });
  const stranger = quiet(() => w1.eng.pinAllPlan(w1.P, 'sub-not-a-member'));
  ok(stranger.ok === false && stranger.code === 'not_member', 'a member outside the pool is refused by name', stranger);
}

console.log('§2 A MEMBER THAT CANNOT SERVE — every pin kept and waiting, said by its why, nothing moved');
const w2 = world(engMod);
if (w2) {
  w2.mk('t-1'); w2.mk('t-2', { agoMs: 30e3 });
  const plan = quiet(() => w2.eng.pinAllPlan(w2.P, w2.C));
  const waiting = Object.values(plan.waits || {}).reduce((x, y) => x + y, 0);
  const r = await quietA(() => w2.eng.pinAll(w2.P, w2.C, { by: 'user' }));
  ok(plan.ok === true && plan.now === 0 && waiting === 2 && counts(r) === counts(plan), 'the plan and the press: both wait, by the pin verdict\'s own why', { plan, press: r });
  ok(['t-1', 't-2'].every((sid) => (w2.sessions.get(sid)._poolPin || {}).memberId === w2.C && w2.placedOf(sid) === w2.A),
    'the pins are kept (they move when C can serve) and nothing moved — a pin that cannot serve is no pin for the placing');
}

console.log('§3 ONE PRESS BACK — only the pins to THIS member');
if (w1) {
  w1.mk('s-c', { pin: w1.C });
  const n0 = w1.notices.length;
  const r = await quietA(() => w1.eng.clearPinsTo(w1.P, w1.B, { by: 'user' }));
  ok(r.ok === true && r.cleared === 5 && ['s-warm', 's-run', 's-follower', 's-else', 's-here'].every((sid) => !w1.sessions.get(sid)._poolPin) && (w1.sessions.get('s-c')._poolPin || {}).memberId === w1.C,
    'every conversation pinned to B is placed automatically again; the one pinned to C keeps its pin', r);
  ok(w1.notices.length - n0 === 1 && /5 conversation\(s\) pinned to Member B are placed automatically again/.test(w1.notices[w1.notices.length - 1]), 'ONE notice for the clear', w1.notices.slice(n0));
}

console.log('§4 THE RED COPIES — each law, its fault placed in a copy of the engine');
{
  const copy = (tag, from, to) => M.load(ENG_REL, anchored(SRC, from, to, tag), tag);
  // (a) the press that writes the pin in memory, past the one writer
  const MEM = copy('pin-in-memory', '    const r = setConversationPin(sid, memberId, { by, now, quiet: true });\n',
    '    s._poolPin = { memberId, at: now, by }; const r = { ok: true, placed: false, reason: \'applies-at-restart\' };\n');
  const m1 = scene1(MEM);
  if (m1) { await quietA(() => m1.eng.pinAll(m1.P, m1.B)); ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => m1.recOf(sid) === null), 'RED: a press past the one writer — no record on disk, no link re-pointed (the pin dies with the hub)'); }
  // (b) the plan blind to the member's own verdict
  const BLIND = copy('plan-blind', "  if (!v.ok) return { kind: 'waits', why: v.why || 'pin-member-unknown', elsewhere };\n", '');
  const m2 = world(BLIND);
  if (m2) { m2.mk('t-1'); m2.mk('t-2'); const p = quiet(() => m2.eng.pinAllPlan(m2.P, m2.C)), r = await quietA(() => m2.eng.pinAll(m2.P, m2.C)); ok(counts(p) !== counts(r) && p.now === 2, 'RED: a plan blind to the member\'s verdict says «2 move now» while the press makes them wait', { plan: counts(p), press: counts(r) }); }
  // (c) the clear that clears every pin of the pool
  const ALL = copy('clear-all', '    if (!pin || pin.memberId !== memberId) continue;\n', '    if (!pin) continue;\n');
  const m3 = scene1(ALL);
  if (m3) { await quietA(() => m3.eng.pinAll(m3.P, m3.B)); m3.mk('s-c', { pin: m3.C }); await quietA(() => m3.eng.clearPinsTo(m3.P, m3.B)); ok(!m3.sessions.get('s-c')._poolPin, 'RED: a clear of every pin — the pin to C is gone too'); }
  // (d) the press that also moves the pool's default
  const DEF = copy('moves-default', "    const out = { ok: true, member: memberId, pays: pinAllPaysOf(memberId), ...pinAllTally() };\n    let pinned = 0;\n",
    "    const out = { ok: true, member: memberId, pays: pinAllPaysOf(memberId), ...pinAllTally() };\n    let pinned = 0; accounts.setPoolTarget(poolId, memberId);\n");
  const m4 = scene1(DEF);
  if (m4) { const f0 = m4.poolFacts(); await quietA(() => m4.eng.pinAll(m4.P, m4.B)); ok(m4.poolFacts() !== f0, 'RED: a press that also sets the pool\'s default — the facts differ'); }
}

console.log('§8 THE MONEY, SAID BEFORE THE ACT (r5294 MUST 1) — the target member\'s paying facts in the plan');
{
  // B's reading as the producer states it: paid overage IN USE now (a dated, fresh claim) · usage credits allowed (a status the vendor
  // stated that is not a rejection) · no reading at all (a pin then serves)
  const inUse = (who, txt, nowS) => (who !== 'B' ? txt : J({ ...JSON.parse(txt), overage: { inUse: true, asOf: Date.now(), resetsAt: nowS + 86400 } }));
  const credits = (who, txt) => (who !== 'B' ? txt : J({ ...JSON.parse(txt), overage: { inUse: false, status: 'allowed', asOf: Date.now() } }));
  const none = (who, txt) => (who !== 'B' ? txt : null);
  // r5333: a reading that SAYS NOTHING of overage is ignorance, never «bills nothing» — no record at all; in use false with no
  // status (the measured shape of the 14 h credits incident: the vendor leaves the status out of about a third of its events)
  const noRecord = (who, txt) => (who !== 'B' ? txt : J((({ overage, ...rest }) => rest)(JSON.parse(txt))));
  const silent = (who, txt) => (who !== 'B' ? txt : J({ ...JSON.parse(txt), overage: { inUse: false, asOf: Date.now() } }));
  const STATES = [['overage', inUse, 'paid overage in use now'], ['credits', credits, 'usage credits past its quota'], ['unknown', none, 'not known yet: no reading'],
    ['unknown', noRecord, 'not known yet: a reading with no overage record'], ['unknown', silent, 'not known yet: in use false and no status — the 14 h shape']];
  for (const [state, readingOf, said] of STATES) {
    const w = world(engMod, { readingOf }); if (!w) break;
    w.mk('m-1'); w.mk('m-2', { agoMs: 30e3 });
    const plan = quiet(() => w.eng.pinAllPlan(w.P, w.B));
    const r = await quietA(() => w.eng.pinAll(w.P, w.B, { by: 'user' }));
    ok(plan.ok === true && plan.pays === state && plan.now === 2 && r.ok === true && r.pays === state && r.now === 2 && ['m-1', 'm-2'].every((sid) => (w.sessions.get(sid)._poolPin || {}).memberId === w.B),
      `«${state}»: the plan says B's paying state (${said}) — and the press still pins (the person may)`, { plan: { pays: plan.pays, now: plan.now }, press: { pays: r.pays, now: r.now } });
  }
  const OLD = copyOf('silence-is-none', "  return mode === 'disabled' ? null : 'unknown';\n", "  return null;\n");
  const mo = world(OLD, { readingOf: silent });
  if (mo) { mo.mk('m-1'); ok(quiet(() => mo.eng.pinAllPlan(mo.P, mo.B)).pays === null, 'RED: the old rule (a reading that says nothing of overage read as «bills nothing») — the 14 h shape\'s plan is silent'); }
  const PAYS = copyOf('pays-blind', "  const out = { ok: true, member: memberId, pays: pinAllPaysOf(memberId), ...pinAllTally() };\n  for (const [sid, s] of activeSessions) {",
    "  const out = { ok: true, member: memberId, pays: null, ...pinAllTally() };\n  for (const [sid, s] of activeSessions) {");
  const mp = world(PAYS, { readingOf: credits });
  if (mp) { mp.mk('m-1'); ok(quiet(() => mp.eng.pinAllPlan(mp.P, mp.B)).pays === null, 'RED: a plan blind to the money — the credits member\'s plan says nothing (the confirm would read «1 move there now» alone)'); }
}

console.log('§9 ONE RULE FOR THE PLAN AND THE PRESS (r5294 MUST 2) — a cold pool, a follower');
{
  const pair = async (w, member, sids) => {
    const plan = quiet(() => w.eng.pinAllPlan(w.P, member));
    const r = await quietA(() => w.eng.pinAll(w.P, member, { by: 'user' }));
    return { plan, r, kept: sids.every((sid) => (w.sessions.get(sid)._poolPin || {}).memberId === member) };
  };
  const cold = world(engMod, { hot: false });
  if (cold) {
    cold.mk('k-1'); cold.mk('k-2', { agoMs: 30e3 });
    const c = await pair(cold, cold.C, ['k-1', 'k-2']);
    const waiting = Object.values(c.plan.waits || {}).reduce((x, y) => x + y, 0);
    ok(c.plan.ok === true && waiting === 2 && c.plan.restart === 0 && counts(c.r) === counts(c.plan) && c.r.restart === 0 && c.kept,
      'a COLD pool, the press on C (out of quota): the plan says 2 wait, and the press counts the same — never «2 move at their next restart» (at the restart C is still out)', { plan: counts(c.plan), press: counts(c.r) });
    const cold2 = world(engMod, { hot: false });
    cold2.mk('k-1'); cold2.mk('k-2');
    const b = await pair(cold2, cold2.B, ['k-1', 'k-2']);
    ok(b.plan.restart === 2 && counts(b.r) === counts(b.plan), 'control: on the same cold pool a member that CAN serve is counted «at their next restart» by both', { plan: counts(b.plan), press: counts(b.r) });
  }
  const fol = world(engMod);
  if (fol) {
    fol.mk('f-1', { link: null }); fol.mk('f-2', { link: null });
    const f = await pair(fol, fol.C, ['f-1', 'f-2']);
    ok(Object.values(f.plan.waits || {}).reduce((x, y) => x + y, 0) === 2 && counts(f.r) === counts(f.plan) && f.r.restart === 0,
      'a hot pool\'s followers (no link of their own), the press on C: plan and press count the same', { plan: counts(f.plan), press: counts(f.r) });
  }
  const WRITER = copyOf('counts-by-writer', "      if (road.kind === 'waits') out.waits[road.why] = (out.waits[road.why] || 0) + 1;\n      else if (road.kind === 'now' && !r.placed) {",
    "      if (r.placed) out.now++;\n      else if (r.reason === 'applies-at-restart') out.restart++;\n      else if (road.kind === 'now' && !r.placed) {");
  const mw = world(WRITER, { hot: false });
  if (mw) { mw.mk('k-1'); mw.mk('k-2'); const c = await pair(mw, mw.C, ['k-1', 'k-2']); ok(counts(c.r) !== counts(c.plan) && c.r.restart === 2, 'RED: a press counted by the writer\'s cold answer says «2 move at their next restart» where the plan said they wait', { plan: counts(c.plan), press: counts(c.r) }); }
}

console.log('§10 THE LOOP\'s LAW (r5294 MUST 3) — one pin a turn of the loop; a second press refused while one runs');
{
  const STALL = 60;
  const I32 = new Int32Array(new SharedArrayBuffer(4));
  const SIDS = ['l-1', 'l-2', 'l-3', 'l-4', 'l-5'];
  const press = async (Mod) => {
    const w = world(Mod); if (!w) return null;
    for (const sid of SIDS) w.mk(sid);
    const orig = PR.write; let stalls = 0;
    PR.write = (...a) => { stalls++; Atomics.wait(I32, 0, 0, STALL); return orig(...a); };   // a placed stall in the record's write: a slow data/ drive
    let last = performance.now(), maxGap = 0, beat = true;
    const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; if (beat) setImmediate(tick); };
    try {
      setImmediate(tick); await new Promise((res) => setImmediate(res)); await new Promise((res) => setImmediate(res));
      maxGap = 0; last = performance.now();
      const r = await quietA(() => w.eng.pinAll(w.P, w.B, { by: 'user' }));
      await new Promise((res) => setImmediate(res)); await new Promise((res) => setImmediate(res));   // the heartbeat's next turns read the last hold (a press with no turn resolves before any tick)
      return { r, stalls, maxGap, w };
    } finally { beat = false; PR.write = orig; }
  };
  const real = await press(engMod);
  if (real) {
    ok(real.stalls === SIDS.length && real.r.ok === true && real.r.now === SIDS.length && real.maxGap < STALL * 2,
      `the witness: ${real.stalls} record writes each held ${STALL} ms — and the loop's longest hold during the press was ${Math.round(real.maxGap)} ms: ONE write's, not ${SIDS.length}`, { stalls: real.stalls, maxGapMs: Math.round(real.maxGap) });
  }
  const NOYIELD = copyOf('one-turn', '      if (i) await pinAllLoopTurn();\n', '      if (false) await pinAllLoopTurn();\n');
  const red = await press(NOYIELD);
  if (red) {
    ok(red.stalls === SIDS.length && red.maxGap >= STALL * (SIDS.length - 0.5),
      `RED (witness: ${red.stalls} stalled writes): a press with no turn of the loop between conversations held it ${Math.round(red.maxGap)} ms — all ${SIDS.length} writes in one turn`, { maxGapMs: Math.round(red.maxGap) });
  }
  const w = world(engMod);
  if (w) {
    for (const sid of SIDS) w.mk(sid);
    const first = quietA(() => w.eng.pinAll(w.P, w.B, { by: 'user' }));
    w.sessions.delete('l-5');   // it ends while the press runs (the press took its list at the start)
    const second = await quietA(() => w.eng.pinAll(w.P, w.C, { by: 'user' }));
    const clear = await quietA(() => w.eng.clearPinsTo(w.P, w.B, { by: 'user' }));
    const done = await first;
    const afterP = quietA(() => w.eng.clearPinsTo(w.P, w.B, { by: 'user' }));
    quiet(() => w.eng.setConversationPin('l-3', w.C, { by: 'user' }));   // another page pins l-3 to C while «Back to automatic» runs
    const after = await afterP;
    ok(second.ok === false && second.code === 'press_running' && second.status === 409 && clear.ok === false && clear.code === 'press_running' && done.ok === true && done.now === SIDS.length - 1 && done.ended === 1 && Object.keys(done.refused).length === 0,
      'a second press (and a «Back to automatic») while one runs is refused by name (press_running, 409); the first answers when all are done — the one that ended meanwhile counted apart (ended 1), never a refusal', { second: second.code, clear: clear.code, first: { now: done.now, ended: done.ended, refused: done.refused } });
    ok(after.ok === true && after.cleared === SIDS.length - 2 && (w.sessions.get('l-3')._poolPin || {}).memberId === w.C,
      '«Back to automatic» reads each pin AFTER its turn of the loop: the pin another page made to C meanwhile is the person\'s newest act and stays (r5333)', { cleared: after.cleared, l3: (w.sessions.get('l-3')._poolPin || {}).memberId === w.C });
  }
}

console.log('§5 THE PERSON\'s PRESS — the tree\'s one verdict, asked first by both routes');
{
  const { personVerdict } = require(path.join(REPO, 'src/routes/vault.js'));
  const page = { host: 'hub.test', 'sec-fetch-site': 'same-origin' };   // the page's own same-origin ask (no fixed port: §81)
  const req = (auth, extra = {}) => ({ headers: { ...page, ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: {}, query: {}, socket: {}, ...extra });
  const tok = (p) => [p, 'x'.repeat(24)].join('');   // built at run time: no token-shaped literal in the tree
  const v = { person: personVerdict(req(null)), agent: personVerdict(req(tok('vsst_'))), job: personVerdict(req(tok('jbt_'))), key: personVerdict(req(tok('vsak_'))), body: personVerdict(req(null, { body: { token: tok('vsst_') } })) };
  ok(v.person.ok === true && ['agent', 'job', 'key', 'body'].every((k) => v[k].ok === false && v[k].code === 'human_only'), 'a person on the page passes; an agent\'s, a job\'s and an automation key\'s sign-in (and a token in the body) are refused by name', v);
  const isAgentBearer = (r) => /^Bearer\s+(vsst_|jbt_)/i.test(String((r.headers && r.headers.authorization) || ''));   // the single pin route's own check, as it stands
  ok(isAgentBearer(req(tok('vsak_'))) === false, 'RED: the single pin route\'s own check lets an automation key through — the press asks the tree\'s one verdict instead');
  const routes = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  const get = routes.slice(routes.indexOf("app.get('/api/accounts/:poolId/pin-all'"), routes.indexOf("app.post('/api/accounts/:poolId/pin-all'"));
  const post = routes.slice(routes.indexOf("app.post('/api/accounts/:poolId/pin-all'"), routes.indexOf('// ── Long-lived token (oat01'));
  ok(get.length > 0 && post.length > 0 && /^[^]*?if \(!pinAllPerson\(req, res\)\) return;[^]*?engine\.pinAllPlan\(/.test(get) && /^[^]*?if \(!pinAllPerson\(req, res\)\) return;[^]*?engine\.(pinAll|clearPinsTo)\(/.test(post),
    'both routes (the plan\'s read and the press) ask the person first, before the engine');
}

console.log('§6 NOTHING ASKS THE VENDOR — the press\'s own block');
{
  const block = SRC.slice(SRC.indexOf('// ── B-2083 unit B (lane lg-recovery'), SRC.indexOf("// ── THE OWNER'S DECISION (2026-09-28, \"全B\")"));
  ok(block.length > 1000 && !/\bfetch\(|https?:\/\/|\brequest\(|execFile|spawn\(/.test(block), 'the block calls no network, no program — only the pool\'s own facts and the one writer', block.length);
}
report();
