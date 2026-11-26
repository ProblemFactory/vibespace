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
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const PR = require(path.join(REPO, 'src/pool-pin-record.js'));
const scr = scratch('pool-pin-all'); fs.mkdirSync(scr, { recursive: true });
const J = (x) => JSON.stringify(x);
const CREDS = (id) => J({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };

/** a hot pool of three members — A (the default, usable), B (usable), C (out of quota) — and its conversations */
function world(Mod) {
  const root = fs.mkdtempSync(path.join(scr, 'w-'));
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const A = am.createSubscription({ name: 'Member A' }).id, B = am.createSubscription({ name: 'Member B' }).id, C = am.createSubscription({ name: 'Member C' }).id;
  for (const x of [A, B, C]) fs.writeFileSync(path.join(am.subDir(x), '.credentials.json'), CREDS(x), { mode: 0o600 });
  const P = am.createPool({ name: 'Team' }).id;
  am.setPoolTarget(P, A); am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000), wk = nowS + 3 * 86400;
  const reading = (five) => J({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: five, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: wk } });
  fs.writeFileSync(path.join(cacheDir, A + '.json'), reading(0.2));
  fs.writeFileSync(path.join(cacheDir, B + '.json'), reading(0.1));
  fs.writeFileSync(path.join(cacheDir, C + '.json'), reading(1.0));
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
const counts = (r) => J({ now: r.now, restart: r.restart, waits: r.waits, here: r.here, provider: r.provider, remote: r.remote, elsewhere: r.elsewhere });
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
  ok(plan.ok === true && counts(plan) === J({ now: 3, restart: 1, waits: {}, here: 1, provider: 0, remote: 1, elsewhere: 1 }),
    'THE PLAN (nothing written): 3 move now (warm, running, re-pinned), 1 at its next restart (a follower), 1 already here, 1 on another machine, 1 of them pinned elsewhere', plan);
  ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => w1.recOf(sid) === null) && w1.notices.length === nPlan, 'the plan wrote nothing and said nothing', w1.notices.slice(nPlan));
  const n0 = w1.notices.length;
  const r = quiet(() => w1.eng.pinAll(w1.P, w1.B, { by: 'user' }));
  ok(r.ok === true && counts(r) === counts(plan), 'THE PRESS did what the plan said, count for count', { plan: counts(plan), press: counts(r) });
  ok(['s-warm', 's-run', 's-follower', 's-else', 's-here'].every((sid) => (w1.sessions.get(sid)._poolPin || {}).memberId === w1.B) && !w1.sessions.get('s-remote')._poolPin,
    'every conversation of the pool is pinned to B; the remote one is untouched');
  ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => (w1.recOf(sid) || {}).memberId === w1.B), 'THE ONE WRITER: each new pin is on disk in its own record (the person\'s pin outlives a restart)', ['s-warm', 's-run', 's-follower', 's-else'].map((sid) => [sid, w1.recOf(sid)]));
  ok(w1.placedOf('s-warm') === w1.B && w1.placedOf('s-run') === w1.B && w1.placedOf('s-else') === w1.B && w1.placedOf('s-follower') !== w1.B,
    'THE PIN\'s OWN ROAD: the warm and the running conversations are re-pointed now (a manual choice is never held by a warm cache); the follower waits for its restart', ['s-warm', 's-run', 's-else', 's-follower'].map((sid) => [sid, w1.placedOf(sid)]));
  ok(w1.writes.length === 0 && w1.sessions.size === 6, 'NOTHING IS CUT: no conversation was written to, killed or removed (the running turn goes on, on its new link)', w1.writes);
  ok(w1.notices.length - n0 === 1 && /4 conversation\(s\) pinned to Member B by one press/.test(w1.notices[w1.notices.length - 1]), 'ONE notice for the press (never one a conversation)', w1.notices);
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
  const r = quiet(() => w2.eng.pinAll(w2.P, w2.C, { by: 'user' }));
  ok(plan.ok === true && plan.now === 0 && waiting === 2 && counts(r) === counts(plan), 'the plan and the press: both wait, by the pin verdict\'s own why', { plan, press: r });
  ok(['t-1', 't-2'].every((sid) => (w2.sessions.get(sid)._poolPin || {}).memberId === w2.C && w2.placedOf(sid) === w2.A),
    'the pins are kept (they move when C can serve) and nothing moved — a pin that cannot serve is no pin for the placing');
}

console.log('§3 ONE PRESS BACK — only the pins to THIS member');
if (w1) {
  w1.mk('s-c', { pin: w1.C });
  const n0 = w1.notices.length;
  const r = quiet(() => w1.eng.clearPinsTo(w1.P, w1.B, { by: 'user' }));
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
  if (m1) { quiet(() => m1.eng.pinAll(m1.P, m1.B)); ok(['s-warm', 's-run', 's-follower', 's-else'].every((sid) => m1.recOf(sid) === null), 'RED: a press past the one writer — no record on disk, no link re-pointed (the pin dies with the hub)'); }
  // (b) the plan blind to the member's own verdict
  const BLIND = copy('plan-blind', "  if (!v.ok) return { kind: 'waits', why: v.why || 'pin-member-unknown', elsewhere };\n", '');
  const m2 = world(BLIND);
  if (m2) { m2.mk('t-1'); m2.mk('t-2'); const p = quiet(() => m2.eng.pinAllPlan(m2.P, m2.C)), r = quiet(() => m2.eng.pinAll(m2.P, m2.C)); ok(counts(p) !== counts(r) && p.now === 2, 'RED: a plan blind to the member\'s verdict says «2 move now» while the press makes them wait', { plan: counts(p), press: counts(r) }); }
  // (c) the clear that clears every pin of the pool
  const ALL = copy('clear-all', '    if (!pin || pin.memberId !== memberId) continue;\n', '    if (!pin) continue;\n');
  const m3 = scene1(ALL);
  if (m3) { quiet(() => m3.eng.pinAll(m3.P, m3.B)); m3.mk('s-c', { pin: m3.C }); quiet(() => m3.eng.clearPinsTo(m3.P, m3.B)); ok(!m3.sessions.get('s-c')._poolPin, 'RED: a clear of every pin — the pin to C is gone too'); }
  // (d) the press that also moves the pool's default
  const DEF = copy('moves-default', "  const no = pinAllRefusal(poolId, memberId); if (no) return no;\n  const a = accounts.get(poolId);\n  const out = { ok: true, member: memberId, ...pinAllTally() };\n  let pinned = 0;\n",
    "  const no = pinAllRefusal(poolId, memberId); if (no) return no;\n  const a = accounts.get(poolId);\n  const out = { ok: true, member: memberId, ...pinAllTally() };\n  let pinned = 0; accounts.setPoolTarget(poolId, memberId);\n");
  const m4 = scene1(DEF);
  if (m4) { const f0 = m4.poolFacts(); quiet(() => m4.eng.pinAll(m4.P, m4.B)); ok(m4.poolFacts() !== f0, 'RED: a press that also sets the pool\'s default — the facts differ'); }
}

console.log('§5 THE PERSON\'s PRESS — the tree\'s one verdict, asked first by both routes');
{
  const { personVerdict } = require(path.join(REPO, 'src/routes/vault.js'));
  const page = { host: '127.0.0.1:3456', 'sec-fetch-site': 'same-origin' };
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
