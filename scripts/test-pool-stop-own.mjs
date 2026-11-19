#!/usr/bin/env node
// test-pool-stop-own — B-f4a1 (lane bl-accounts; the owner's word 2026-11-18 14:48 PT, on the coordinator's recommendation):
// A STOP RE-DECIDES ONLY ITS OWN CONVERSATION, never the whole pool. Before it, every stop of a pooled conversation
// (noteTurnEnd / noteTurnStopped → maybePoolAutoSwitch {stop}) ran the WHOLE pass, so S conversations' stops cost S² decisions,
// each a full one (B-403e's first line, from the production hub's witness). The decision itself is unchanged: the stop's one
// decision reads through the same decision door as the pass (one ask per file per run, src/run-reads.js) — 主开发 01:20Z (a).
//   ① THE COUNT — S conversations with their own links (plan C), S stops ⇒ S decisions of their own and NO pool-default
//      decision. RED control: the release's form (a stop passes no `only`, a copy built through scratch.mjs anchored()) ⇒ S².
//   ② A FOLLOWER OF THE POOL DEFAULT (no link of its own): its stop IS the default's one decision — as the release.
//   ③ EVERY OTHER ROAD KEEPS THE WHOLE POOL — the forced pass (the new-member wake, a login, a released reset hold, a basis
//      flip, the pre-fire re-decision, a member removed), the 30 s tick, a kick: S decisions + the default's one.
//   ④ A STOP STILL MOVES ITS OWN CONVERSATION when its member is walled; another walled conversation waits for its own stop
//      or the tick — and the tick moves it.
//   ⑥ A BASIS FLIP FOUND BY A STOP'S RUN is decided for the WHOLE pool in the next turn (round wpch21jqz's MUST): a flip planted
//      between two runs, one stop ⇒ the next turn decides all S and the default. RED: a copy whose stop run decides the flip itself.
//   ⑦ A STOP'S RUN DOES NOT CLOSE THE POOL'S KICK GATE: a kick right after it decides the whole pool. RED: a copy that stamps it.
//   ⑧ THE PRE-FIRE GATE'S FORCED CALL (maybePoolAutoSwitch with no stop) decides the whole pool. RED: a copy whose `only` drops
//      the stop condition.
//   ⑤ THE MONEY GATES ARE NOT LOOSENED — one stand-in day (invented members, invented readings; never the owner's data) run
//      through the release's decision and this one: every hour each conversation stops, then the 30 s tick passes. What it proves:
//      the SAME STATE AFTER EACH HOUR'S WHOLE RUN — the same placements, the same refusals (conversation, reason) in that hour,
//      the same blocked notices — and that the day reaches its walls (refusals and notices, both non-empty). Not a per-event
//      equality: between whole runs another conversation moves at its own stop, a wall, a kick or the tick.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const turn = () => new Promise((r) => setImmediate(r));
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };

const ENG_REL = 'src/server/usage-pool-engine.js';
const ENG_SRC = fs.readFileSync(path.join(REPO, ENG_REL), 'utf8');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const MINE = require(path.join(REPO, ENG_REL));
const MU = mutantCopies('pool-stop-own', REPO);
// THE RELEASE'S FORM: a stop passes no `only` — the whole pass, as before this unit (the control of ① and the other side of ⑤)
const ANCH = (from, to, what) => MU.load(ENG_REL, anchored(ENG_SRC, from, to, what), what.replace(/[^a-z0-9]+/gi, '-').slice(0, 40));
const RELEASE = MU.load(ENG_REL, anchored(ENG_SRC, '    const only = stop && session._webuiId ? session._webuiId : null;\n', '    const only = null;\n', 'the release: a stop passes the whole pool'), 'release-whole-pool');

const tok = (k) => ['tok', k, 'x'.repeat(8)].join('-');
const loginBody = (k) => JSON.stringify({ claudeAiOauth: { accessToken: tok('a' + k), refreshToken: tok('r' + k), expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } });

/** THE STAND-IN POOL: S conversations over M members (invented names, fake tokens built here), a HOT auto pool */
function world({ S, M, own = true, engMod = MINE, tag = 'w' }) {
  const root = scratchDir('pool-stop-own-' + tag);
  const dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const ids = [];
  for (let i = 0; i < M; i++) {
    const id = am.createSubscription({ name: `Member ${String.fromCharCode(65 + i)}` }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), loginBody(i), { mode: 0o600 });
    ids.push(id);
  }
  const P = am.createPool({ name: 'stand-in' }).id;
  am.setPoolTarget(P, ids[0]);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const said = { refusals: new Set(), notices: new Set() };
  const sessions = new Map();
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice(key) { if (/^pool-blocked-/.test(String(key))) said.notices.add(String(key).replace(/-\d+$/, '').split(P).join('P')); },   // the pool's id is each world's own: said as P
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => ({ noteNoPoolTarget(sid, n, reason) { said.refusals.add(`${sid}:${reason}`); }, fireNow() { return false; }, fireNowOnClaim() { return false; } }),
    getQuotaProbe: () => null, getUserTodos: () => null,
  });
  for (let k = 0; k < S; k++) {
    const sid = 'conv-' + k;
    sessions.set(sid, { backend: 'claude', mode: 'chat', _webuiId: sid, claudeSessionId: 'cid-' + k, _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), _isStreaming: false, _turnState: 'idle', pty: { write() { } }, name: sid });
    if (typeof own === 'function' ? own(k) : own) am.ensureSessionPoolLink(P, sid, ids[k % M]);
  }
  /** the readings this hour: utilization per member (0..1), five-hour window */
  const readings = (util) => { const nowS = Math.floor(Date.now() / 1000); ids.forEach((id, i) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 30e3, source: 'on-demand', fiveHour: { utilization: util[i], resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 5 * 86400 } }))); };
  readings(ids.map((_, i) => 0.1 + 0.05 * i));
  // the gates and the dwell belt are WALL-CLOCK: wound back between events instead of slept through (the engine's own seams)
  const wind = () => { eng._poolAutoLast.clear(); eng._poolSwitchAt.clear(); eng._poolEvalAt.clear(); };
  const tally = () => ({ ...(eng._poolDecisions.get(P) || { session: 0, pool: 0 }) });
  const placements = () => [...sessions.keys()].map((sid) => `${sid}=${ids.indexOf(am.poolCurrentFor(P, sid))}`).join(' ');
  return { root, am, eng, P, ids, sessions, said, readings, wind, tally, placements };
}
const stopAll = async (w) => { for (const s of w.sessions.values()) { await turn(); w.wind(); quiet(() => w.eng.noteTurnStopped(s)); } };

console.log('① THE COUNT — S conversations with their own links, S stops ⇒ S decisions (the release: S²)');
for (const [S, M] of [[6, 3], [12, 4]]) {
  const w = world({ S, M, tag: `count-${S}` }), r = world({ S, M, engMod: RELEASE, tag: `count-rel-${S}` });
  if (!w || !r) { ok(false, 'the pool is supported here (AccountManager.poolSupported)'); break; }
  await stopAll(w); await stopAll(r);
  const a = w.tally(), b = r.tally();
  ok(a.session === S && a.pool === 0, `S=${S}: ${S} stops ⇒ ${S} decisions of their own conversations and no pool-default decision (${JSON.stringify(a)})`, a);
  ok(b.session === S * S && b.pool === S, `CONTROL S=${S}: the release's whole pass on every stop ⇒ S² = ${S * S} conversation decisions + ${S} default ones (${JSON.stringify(b)})`, b);
}

console.log('② A POOL OF FOLLOWERS of the pool default: each stop IS the default\'s one decision (as the release); a MIXED pool');
{
  const S = 5, w = world({ S, M: 3, own: false, tag: 'follow' }), r = world({ S, M: 3, own: false, engMod: RELEASE, tag: 'follow-rel' });
  await stopAll(w); await stopAll(r);
  const a = w.tally(), b = r.tally();
  ok(a.session === 0 && a.pool === S && b.session === 0 && b.pool === S, `${S} followers' stops ⇒ ${S} default decisions, none per conversation — the same count as the release (${JSON.stringify(a)} / ${JSON.stringify(b)})`, { a, b });
  // a MIXED pool: even conversations carry their own link, odd ones follow the default — a follower's stop decides the default
  // only, an own-link stop its own conversation only
  const X = 6, mx = world({ S: X, M: 3, own: (k) => k % 2 === 0, tag: 'mixed' });
  await stopAll(mx);
  const c = mx.tally();
  ok(c.session === X / 2 && c.pool === X / 2, `a mixed pool of ${X} (${X / 2} with their own link, ${X / 2} following the default): ${X} stops ⇒ ${X / 2} own decisions + ${X / 2} default decisions (${JSON.stringify(c)})`, c);
}

console.log('③ EVERY OTHER ROAD KEEPS THE WHOLE POOL');
{
  const S = 6, w = world({ S, M: 3, tag: 'whole' });
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  const f = w.tally();
  ok(f.session === S && f.pool === 1, `the forced pass (the new-member wake, a login, a released reset hold, a basis flip, the pre-fire re-decision, a member removed) decides all ${S} and the default (${JSON.stringify(f)})`, f);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P));
  const t = w.tally();
  ok(t.session === 2 * S && t.pool === 2, `the 30 s tick's pass (no force, no kick) decides all ${S} and the default again (${JSON.stringify(t)})`, t);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { kick: true }));
  const k = w.tally();
  ok(k.session === 3 * S && k.pool === 3, `a per-record kick with its gate open decides all ${S} and the default (${JSON.stringify(k)})`, k);
}

console.log('④ A STOP STILL MOVES ITS OWN CONVERSATION; another walled one waits for its own stop or the tick');
{
  const w = world({ S: 2, M: 3, tag: 'move' });
  const [s0, s1] = [...w.sessions.values()];
  w.am.ensureSessionPoolLink(w.P, 'conv-1', w.ids[0]);   // both on member A
  await turn(); w.readings([1.0, 0.1, 0.2]);   // A is walled
  await turn(); w.wind(); quiet(() => w.eng.noteTurnStopped(s0));
  const after0 = w.placements();
  ok(w.am.poolCurrentFor(w.P, 'conv-0') !== w.ids[0] && w.am.poolCurrentFor(w.P, 'conv-1') === w.ids[0], `conv-0's stop moved conv-0 off the walled member; conv-1 (walled too, not stopped) waits (${after0})`, after0);
  await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  ok(w.am.poolCurrentFor(w.P, 'conv-1') !== w.ids[0], `the whole pass then moves conv-1 too (${w.placements()})`, w.placements());
  void s1;
}

console.log('⑤ THE MONEY GATES ARE NOT LOOSENED — one stand-in day through the release\'s decision and this one');
{
  // members A, B, C over 12 «hours»: each spends, all three are walled a while, the five-hour window resets
  const DAY = [
    [0.10, 0.20, 0.30], [0.55, 0.20, 0.30], [0.97, 0.40, 0.30], [1.00, 0.80, 0.35], [1.00, 1.00, 0.60], [1.00, 1.00, 1.00],
    [1.00, 1.00, 1.00], [0.05, 1.00, 1.00], [0.10, 0.05, 1.00], [0.30, 0.10, 0.05], [0.96, 0.98, 0.99], [0.20, 0.20, 0.20],
  ];
  const S = 5, w = world({ S, M: 3, tag: 'day' }), r = world({ S, M: 3, engMod: RELEASE, tag: 'day-rel' });
  const hours = [], all = { mine: new Set(), release: new Set() };
  for (const util of DAY) {
    for (const x of [w, r]) { x.said.refusals.clear(); await turn(); x.readings(util); }
    for (const x of [w, r]) await stopAll(x);
    for (const x of [w, r]) { await turn(); x.wind(); quiet(() => x.eng.maybePoolAutoSwitchForPool(x.P)); }   // the 30 s tick
    hours.push({ util: util.join('/'), mine: w.placements(), release: r.placements(), rm: [...w.said.refusals].sort().join(','), rr: [...r.said.refusals].sort().join(',') });
    for (const x of w.said.refusals) all.mine.add(x); for (const x of r.said.refusals) all.release.add(x);
  }
  const differ = hours.filter((h) => h.mine !== h.release);
  ok(differ.length === 0, `every hour of the day ends on the SAME placements in both (${hours.length} hours)`, differ.slice(0, 3));
  const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  ok(all.mine.size > 0 && [...all.mine].some((x) => /:(?:all-rejected|stuck|no-members|all-logins-expired|all-lapsed)$/.test(x)) && w.said.notices.size > 0, `CONTROL: the day reaches its walls — conversations are refused (${all.mine.size}: ${[...all.mine].slice(0, 3).join(', ')}) and the pool's blocked notice is said (${[...w.said.notices].join(', ')})`, { refusals: [...all.mine], notices: [...w.said.notices] });
  const hd = hours.filter((h) => h.rm !== h.rr);
  ok(hd.length === 0, `the SAME refusals for the same reasons, HOUR BY HOUR — (conversation, reason) in each hour (${hours.filter((h) => h.rm).length} hours refuse)`, hd.slice(0, 3));
  ok(eq(w.said.notices, r.said.notices) && w.said.notices.size > 0, `the pool's blocked notices are the same NON-EMPTY set (${[...w.said.notices].join(', ')})`, { mine: [...w.said.notices], release: [...r.said.notices] });
}

console.log('⑥ A BASIS FLIP FOUND BY A STOP\'S RUN is decided for the whole pool in the next turn (round wpch21jqz)');
{
  const flipStop = async (engMod, tag) => {
    const S = 6, w = world({ S, M: 3, engMod, tag });
    await turn(); w.wind(); quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));   // the pool's basis held
    const m = w.eng._basisOf.get(w.P);
    if (!m) return { planted: false };
    w.eng._basisOf.set(w.P, { ...m, raw: !m.raw, at: 0, run: null });   // THE PLANT: the stored basis is the other one (a flip waits)
    const t0 = w.tally();
    await turn(); w.wind(); quiet(() => w.eng.noteTurnStopped(w.sessions.get('conv-0')));
    const t1 = w.tally();
    await turn(); await turn();   // the next turn of the loop (redecideOnBasis is queued by setImmediate)
    const t2 = w.tally();
    return { planted: true, S, stop: { session: t1.session - t0.session, pool: t1.pool - t0.pool }, next: { session: t2.session - t1.session, pool: t2.pool - t1.pool } };
  };
  const a = await flipStop(MINE, 'flip');
  ok(a.planted && a.stop.session === 1 && a.stop.pool === 0 && a.next.session === a.S && a.next.pool === 1, `a planted flip, one stop ⇒ the stop decides its own conversation (${JSON.stringify(a.stop)}) and the NEXT turn decides all ${a.S} and the default on the new basis (${JSON.stringify(a.next)})`, a);
  const RED6 = ANCH('    poolBasisRaw(poolId, { pass: !only });', '    poolBasisRaw(poolId, { pass: true });', 'red: a stop run decides the flip itself');   // stale-pins: kept — the release's line, written back by this RED control
  const b = await flipStop(RED6, 'flip-red');
  ok(b.planted && b.stop.session === 1 && b.next.session === 0 && b.next.pool === 0, `CONTROL: a copy whose stop run decides the flip itself ⇒ only that one decision; the rest of the pool stays on the old basis (${JSON.stringify(b)})`, b);
}

console.log('⑦ A STOP\'S RUN DOES NOT CLOSE THE POOL\'S KICK GATE');
{
  const kickAfterStop = async (engMod, tag) => {
    const S = 5, w = world({ S, M: 3, engMod, tag });
    await turn(); w.wind();
    quiet(() => w.eng.noteTurnStopped(w.sessions.get('conv-0')));
    const stamped = w.eng._poolEvalAt.has(w.P), held0 = w.eng._poolGateHeld.get(w.P) || 0, t0 = w.tally();
    w.eng._poolAutoLast.clear();   // only the kick gate is under test
    quiet(() => w.eng.maybePoolAutoSwitchForPool(w.P, { kick: true }));
    const t1 = w.tally();
    return { S, stamped, held: (w.eng._poolGateHeld.get(w.P) || 0) - held0, kick: { session: t1.session - t0.session, pool: t1.pool - t0.pool } };
  };
  const a = await kickAfterStop(MINE, 'kick');
  ok(!a.stamped && a.held === 0 && a.kick.session === a.S && a.kick.pool === 1, `a stop's run leaves the gate open: a kick right after it decides all ${a.S} and the default (${JSON.stringify(a)})`, a);
  const RED7 = ANCH("    if (!only) _poolEvalAt.set(poolId, now);", "    _poolEvalAt.set(poolId, now);", 'red: a stop run stamps the kick gate');   // stale-pins: kept — the release's line, written back by this RED control
  const b = await kickAfterStop(RED7, 'kick-red');
  ok(b.stamped && b.held === 1 && b.kick.session === 0, `CONTROL: a copy whose stop run stamps the gate ⇒ the kick right after it is HELD, nothing decided (${JSON.stringify(b)})`, b);
}

console.log('⑧ THE PRE-FIRE GATE\'S FORCED CALL (no stop) decides the whole pool');
{
  const preFire = async (engMod, tag) => {
    const S = 5, w = world({ S, M: 3, engMod, tag });
    await turn(); w.wind();
    quiet(() => w.eng.maybePoolAutoSwitch(w.sessions.get('conv-0'), { now: Date.now(), force: true }));
    return { S, ...w.tally() };
  };
  const a = await preFire(MINE, 'prefire');
  ok(a.session === a.S && a.pool === 1, `maybePoolAutoSwitch(session, { now, force }) — the pre-fire gate's re-decision — decides all ${a.S} and the default (${JSON.stringify(a)})`, a);
  const RED8 = ANCH('    const only = stop && session._webuiId ? session._webuiId : null;', '    const only = session._webuiId ? session._webuiId : null;', 'red: only without the stop condition');
  const b = await preFire(RED8, 'prefire-red');
  ok(b.session === 1 && b.pool === 0, `CONTROL: a copy whose \`only\` drops the stop condition ⇒ the forced call decides one conversation (${JSON.stringify(b)})`, b);
}

report();
