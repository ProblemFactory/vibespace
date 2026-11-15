#!/usr/bin/env node
// ONE USAGE READ AFTER A STRETCH OF WORK (lane usage-predict, 2026-11-15; the owner's ruling «A» 2026-11-14: «一个 agy 账号上的
// 对话结束一轮、且该账号 5 分钟内没有新一轮时，读一次 agy 的 /usage；每账号每 30 分钟最多一次；轮次进行中不读；闲置账号不读»).
// The road (src/server/after-turn-read.js) over the REAL door (src/server/cli-usage-door.js) and the REAL accounts store; the
// CLI is an in-process stand-in that records each spawn (argv, HOME, cwd) and answers agy's recorded envelope; the clock and
// the quiet wait's timer are the suite's own — no real agy, no vendor, no wall clock.
//   ① the read count on disk (src/door-reads.js): by caller, per local day, the last run; never a `.json` the scanners read;
//   ② THE EVENT: a turn's end + 5 quiet minutes ⇒ ONE spawn of the on-demand argv in the account's HOME root, counted;
//   ③ a turn START within the 5 minutes cancels it; the next end arms again;
//   ④ two conversations of one account: no read while either turn runs;
//   ⑤ THE CEILING: none within 30 minutes of the account's last read; 31 minutes after ⇒ one;
//   ⑥ AN IDLE ACCOUNT: read since the stretch ended (a press) ⇒ nothing; an account with no turn is never armed;
//   ⑦ A RESTART: a turn end stamped before the hub started arms nothing; the ceiling survives (it is on disk);
//   ⑧ nothing to arm: the machine's own login, claude / codex, a harness that does not declare `onDemand.afterTurn`;
//      the door refuses an after-turn read the descriptor does not declare (400) and a caller it does not know (403);
//   ⑨ the judge's STOP disarms the account until the hub restarts; ⑩ `accounts.onDemandQuotaRefresh = off` refuses it;
//   ⑪ THE WALL'S RESTART RE-READ (the research's finding): a wall replayed after a restart reads nothing more — the rule
//      on disk; its RED control is stream-wall without that line;
//   ⑫ RED CONTROLS: the road without its replay guard, its ceiling, its idle check or its busy check, each driven;
//   ⑬ the account row's words: «usage read N× today» as text on the identity line (the split by caller its title), in en /
//      zh / ja, for every account the door serves — one with no reading too;
//   ⑭ LAW A (the look of 06:16Z): a turn running across a restart is seen (A1); the ceiling on the steady clock (A2); the count
//      written first and a failed write refusing the read (A3); one stop for every automatic caller; a paired machine's
//      conversation; a wait whose conversation is gone; the ruling's arithmetic; each with the scene only its rule decides.
// Run: node scripts/test-agy-after-turn-read.mjs
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }

const DR = require(path.join(REPO, 'src/door-reads.js'));
const ATR = require(path.join(REPO, 'src/server/after-turn-read.js'));
const SW = require(path.join(REPO, 'src/server/stream-wall.js'));
const DOOR = require(path.join(REPO, 'src/server/cli-usage-door.js'));
const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
const W = require(path.join(REPO, 'src/usage-cache-write.js'));
const harnesses = require(path.join(REPO, 'src/harnesses'));
/** an in-memory copy of a src module with `from` replaced (every occurrence) — its own requires resolve beside the original */
function mutant(rel, from, to) {
  const file = path.join(REPO, rel), src = read(rel);
  if (!src.includes(from)) throw new Error(`mutant: ${rel} no longer holds ${JSON.stringify(from.slice(0, 60))}`);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src.split(from).join(to), file);
  return m.exports;
}

// ── the world: a real accounts store, the real door, a recorded CLI, the suite's clocks (wall + steady), timers and count writer ──
const ROOT = scratch('agy-after-turn');
fs.rmSync(ROOT, { recursive: true, force: true });
const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data'), CACHE = path.join(DATA, 'usage-cache');
for (const d of [MACHINE, CACHE]) fs.mkdirSync(d, { recursive: true });
process.env.HOME = MACHINE;
const AGY = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const mkAcct = (name) => { const a = am.createHomeSubscription('antigravity', { name }); fs.writeFileSync(path.join(a.dir, AGY.TOKEN_REL), 'LOGIN', { mode: 0o600 }); am.finalizeHomeSubscription(a.id); return a; };
const NAMES = ['Work', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Mut one', 'Mut two', 'Mut three', 'Mut four', 'Mut five', 'Mut six', 'Mut seven'];
const [A, B, Cc, D, E5, F6, G7, H8, I9, J10, M1, M2, M3, M4, M5, M6, M7] = NAMES.map(mkAcct);
const FIX = JSON.parse(read('scripts/fixtures/antigravity-usage-1.4.3.json'));
const ANSWERS = {
  reading: { code: 0, out: JSON.stringify(FIX.envelope) + '\n' },
  turn: { code: 0, out: JSON.stringify({ conversation_id: 'c-1', status: 'SUCCESS', response: 'stand-in', duration_seconds: 1.2, num_turns: 1, usage: { input_tokens: 100 } }) + '\n' },
  auth: { code: 1, out: JSON.stringify({ conversation_id: '', status: 'ERROR', response: '', error: 'authentication required' }) + '\n', err: "Error: authentication required. Run 'agy' to log in, then retry.\n" },
};
const T0 = Date.parse('2026-11-14T10:00:00.000Z');
const clock = { t: T0, m: 1e6 };   // the wall clock and the steady clock — the suite's own; a «step» moves only the wall
const iso = (ms) => new Date(ms).toISOString();
let usageMode = 'reading', setting = 'manual';
const spawned = [];
const fakeSpawn = (cmd, argv, opts) => {
  spawned.push({ cmd, argv, home: opts.env.HOME, bus: opts.env.DBUS_SESSION_BUS_ADDRESS, cwd: opts.cwd, at: clock.t });
  const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { end() { } }; c.kill = () => { };
  const a = ANSWERS[usageMode];
  setImmediate(() => { if (a.out) c.stdout.emit('data', a.out); if (a.err) c.stderr.emit('data', a.err); c.emit('close', a.code, null); });
  return c;
};
// THE COUNT'S WRITER: the store writer's two verbs (dirty / durable) over the real file — and a switch that makes a write fail
let failWrites = false;
const owed = new Map();
const writer = { dirty(f, o) { owed.set(f, o); }, durable(f) { const o = owed.get(f); if (failWrites || !o) return Promise.resolve(false); fs.writeFileSync(f, o.produce()); return Promise.resolve(true); } };
const logs = [];
const mkDoor = (harnessOf = (id) => harnesses.get(id)) => DOOR.createCliUsageDoor({
  accounts: am, harnessOf, cacheDir: CACHE, spawnImpl: fakeSpawn, countWriter: () => writer, mono: () => clock.m,
  cliCmds: { check: async (be, o) => (be === 'antigravity' && o && o.force === true ? '/stand-in/agy' : null) },
  agentEnv: () => ({ PATH: '/usr/bin' }), setting: () => setting, now: () => clock.t, log: (l) => logs.push(l),
});
let door = mkDoor();
const timers = [];
const setTimer = (fn, ms) => { const h = { fn, ms, at: clock.m, live: true }; timers.push(h); return h; };
const clearTimer = (h) => { if (h) h.live = false; };
/** `ms` pass on BOTH clocks: every quiet wait that ran out (by the steady clock) fires, its read awaited */
async function pass_(ms) {
  clock.t += ms; clock.m += ms;
  for (const h of timers.filter((x) => x.live && x.at + x.ms <= clock.m)) { h.live = false; await h.fn(); }
}
const QUIET = ATR.QUIET_MS, PACE = ATR.PACE_MS;
// THE HUB'S CONVERSATIONS: every one it holds (restored ones too) — the road reads «a turn runs» from these
const convs = new Set();
const conversationsOf = (key) => [...convs].filter((s) => String(s._accountId || '') === key);
const mkRoad = (o = {}, mod = ATR) => mod.createAfterTurnRead({ harnessOf: (id) => harnesses.get(id), door, cacheDir: CACHE, now: () => clock.t, bootAt: T0 - 3600e3, setTimer, clearTimer, log: (l) => logs.push(l), conversationsOf, ...o });
const sess = (acct, backend = 'antigravity', more = {}) => { const s = { backend, _accountId: acct ? acct.id : null, _isStreaming: false, ...more }; convs.add(s); return s; };
const start = (road, s) => { s._isStreaming = true; return road.onTurnStart(s, { ts: iso(clock.t), type: 'acp', kind: 'prompt_start', promptId: 'p' }); };
const end = (road, s, at = clock.t) => { s._isStreaming = false; return road.onTurnEnd(s, { ts: iso(at), type: 'acp', kind: 'prompt_end', promptId: 'p', stopReason: 'end_turn', error: null }); };
const runsOf = (acct) => spawned.filter((x) => x.home === acct.dir).length;
const disk = (acct) => W.readCacheObject(CACHE, acct.id);
const today = (acct) => DR.todayOf(DR.readDoorReads(CACHE, acct.id), clock.t);
const stretch = async (road, s, before = 60e3) => { start(road, s); await pass_(before); const r = end(road, s); await pass_(QUIET); return r; };

console.log('① the read count on disk (src/door-reads.js)');
{
  const dir = path.join(ROOT, 'count');
  fs.mkdirSync(dir, { recursive: true });
  const name = DR.doorReadsSidecarName('agy-1/x');
  ok('the sidecar is `.door-reads-<key>` (unsafe characters folded) and NOT a `.json` the usage-cache scanners read', name === '.door-reads-agy-1_x' && !W.isCacheFileName(name));
  const w1 = await DR.bumpDoorRead(dir, 'k', 'person', T0, { writer }), w2 = await DR.bumpDoorRead(dir, 'k', 'person', T0 + 60e3, { writer }), w3 = await DR.bumpDoorRead(dir, 'k', 'wall', T0 + 120e3, { writer });
  const t = DR.todayOf(DR.readDoorReads(dir, 'k'), T0 + 180e3);
  ok('three runs the same day, each answered DURABLE → by caller (person 2, wall 1, after a stretch 0), total 3, the last run kept', w1 && w2 && w3 && t.person === 2 && t.wall === 1 && t.afterTurn === 0 && t.total === 3 && t.lastAt === T0 + 120e3, JSON.stringify(t));
  DR._forget();
  const t1 = DR.todayOf(DR.readDoorReads(dir, 'k'), T0 + 180e3);
  ok('…memory forgotten (a restart): the FILE says the same — written through the writer, on its own turn', t1.total === 3 && t1.lastAt === T0 + 120e3, JSON.stringify(t1));
  const next = T0 + 86400e3;
  const t2 = DR.todayOf(DR.readDoorReads(dir, 'k'), next);
  ok('…read the NEXT day → zeros (the count is the day\'s), the last run still known', t2.total === 0 && t2.person === 0 && t2.lastAt === T0 + 120e3 && t2.day === DR.dayOf(next) && t2.day !== DR.dayOf(T0), JSON.stringify(t2));
  failWrites = true;
  const bad = await DR.bumpDoorRead(dir, 'k', 'afterTurn', next, { writer });
  failWrites = false;
  ok('a write that FAILS answers false (the door refuses on it)', bad === false);
  let threw = null; try { await DR.bumpDoorRead(dir, 'k', 'timer', next, { writer }); } catch (e) { threw = e.message; }
  ok('an unknown caller is refused by name (a fourth caller has no row)', /unknown caller "timer"/.test(String(threw)), threw);
  W.writeReading({ cacheDir: dir, key: 'k', set: { ...U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(FIX.envelope), measuredAt: next + 5e3 }).reading, identity: 'k' }, extras: { backend: 'antigravity' }, source: 'cli-usage', backend: 'antigravity' });
  ok('the account\'s last read = the later of its recorded reading (fetchedAt) and the door\'s last run', DR.lastReadAt(dir, 'k') === next + 5e3 && DR.lastReadAt(dir, 'nobody') === 0);
  const others = harnesses.harnessIds().filter((id) => id !== 'antigravity');   // derived from the registry: a new harness is judged too
  ok(`the descriptor declares it: antigravity's onDemand.afterTurn is true; every other harness (${others.join(', ')}) declares no after-turn read`, harnesses.get('antigravity').quota.onDemand.afterTurn === true && others.length >= 1 && others.every((id) => { const h = harnesses.get(id); return !h || !(h.quota && h.quota.onDemand && h.quota.onDemand.afterTurn); }));
}

console.log('② THE EVENT: a turn ends, 5 quiet minutes pass ⇒ ONE read');
{
  const road = mkRoad(), s = sess(A);
  start(road, s);
  await pass_(2 * 60e3);
  const r = end(road, s);
  ok('the turn\'s end ARMS the account\'s quiet wait (and reads nothing yet)', r && r.armed === true && r.key === A.id && runsOf(A) === 0 && road.waiting().includes(A.id));
  await pass_(QUIET - 1000);
  ok('…4 min 59 s later: still nothing', runsOf(A) === 0);
  await pass_(1000);
  const run = spawned.filter((x) => x.home === A.dir);
  ok('…5 minutes with no new turn ⇒ EXACTLY ONE spawn of the on-demand argv, in the account\'s own HOME root, its bus disabled', run.length === 1 && JSON.stringify(run[0].argv) === JSON.stringify(U.USAGE_ARGV) && run[0].bus === 'disabled:', JSON.stringify(run));
  ok('…the reading is written for the account (measured at the read) and counted FIRST: after a stretch 1', disk(A)?.fetchedAt === clock.t && disk(A)?.source === 'cli-usage' && today(A).afterTurn === 1 && today(A).total === 1, JSON.stringify(today(A)));
  ok('…and the quiet wait is gone (one read per stretch)', !road.waiting().includes(A.id));
}

console.log('③ a turn START within the 5 minutes cancels the read');
{
  const road = mkRoad(), s = sess(A);
  await pass_(PACE + 60e3);
  start(road, s); end(road, s);
  await pass_(QUIET - 1000);
  start(road, s);
  ok('a new turn of the account at 4 min 59 s: the wait is cancelled', !road.waiting().includes(A.id));
  await pass_(QUIET);
  ok('…the 5 minutes pass during that turn: NO read', runsOf(A) === 1);
  end(road, s);
  await pass_(QUIET);
  ok('…its own end arms again, and 5 quiet minutes later ONE read', runsOf(A) === 2 && today(A).afterTurn === 2);
}

console.log('④ two conversations of one account: no read while either turn runs');
{
  const road = mkRoad(), s1 = sess(B), s2 = sess(B);
  start(road, s1); start(road, s2);
  await pass_(60e3);
  ok('the first ends while the second runs: nothing armed', end(road, s1) === null && !road.waiting().includes(B.id));
  await pass_(QUIET + 60e3);
  ok('…5 minutes later: no read (a turn of the account runs)', runsOf(B) === 0);
  const r = end(road, s2);
  await pass_(QUIET);
  ok('…the second ends ⇒ armed, and ONE read 5 quiet minutes later', r && r.armed && runsOf(B) === 1);
}

console.log('⑤ THE CEILING: at most one read per account per 30 minutes, counted from its last read');
{
  const road = mkRoad(), s = sess(A);
  const last = DR.lastReadAt(CACHE, A.id);
  clock.t = last + 5 * 60e3; clock.m += 5 * 60e3;
  start(road, s); end(road, s);
  const n0 = logs.length;
  await pass_(QUIET);
  ok('a stretch ending 5 min after the last read: 10 min since it ⇒ NO read, said by name', runsOf(A) === 2 && logs.slice(n0).some((l) => /read 10 min ago — under the 30-minute ceiling, not read now/.test(l)), logs.slice(n0).join(' | '));
  clock.t = last + 26 * 60e3; clock.m += 16 * 60e3;
  start(road, s); end(road, s);
  await pass_(QUIET);
  ok('…a stretch ending 26 min after it: the read comes 31 min after the last ⇒ ONE read', runsOf(A) === 3);
  const n = spawned.length;
  for (let h = 0; h < 24; h++) await pass_(3600e3);
  ok('…nothing is read because time passed: 24 h on the clock with no turn ⇒ no read', spawned.length === n);
  // turns ending every minute for an hour: no read inside the hour (each new turn cancels the wait), one after it
  const s2 = sess(E5), n1 = runsOf(E5);
  for (let i = 0; i < 60; i++) { start(road, s2); await pass_(30e3); end(road, s2); await pass_(30e3); }
  const inHour = runsOf(E5) - n1;
  await pass_(QUIET);
  ok('turns ending every minute for an hour: NO read in the hour, ONE after it', inHour === 0 && runsOf(E5) - n1 === 1, `${inHour} / ${runsOf(E5) - n1}`);
}

console.log('⑥ AN IDLE ACCOUNT is never read — the scene where only the idle rule decides');
{
  // a road whose ceiling is shorter than its quiet wait: then only «read since the stretch ended» can stop the read
  const road = mkRoad({ paceMs: 60e3 }), s = sess(F6);
  start(road, s); end(road, s);
  await pass_(2 * 60e3);
  const pr = await door.read(F6.id, { person: true });
  ok('a person\'s Re-check 2 min after the stretch ended reads (counted: by you 1)', pr && pr.ok && runsOf(F6) === 1 && today(F6).person === 1, JSON.stringify(pr));
  await pass_(QUIET);
  ok('…the wait runs out 3 min after that press — past this road\'s 1-minute ceiling on both clocks — and the account had no turn since: NO read', runsOf(F6) === 1);
  const road2 = mkRoad(), x = sess(G7);
  ok('an account with no turn at all is never armed (no wait, no read)', !road2.waiting().includes(G7.id) && runsOf(G7) === 0);
}

console.log('⑦ A RESTART: nothing is caught up; the ceiling stands; a turn running across it is SEEN (law A1)');
{
  await pass_(PACE + 60e3);
  const boot = clock.t;
  const road = mkRoad({ bootAt: boot }), s = sess(A);
  ok('the new hub is fed a turn end stamped 1 min BEFORE it started (a replayed record): nothing armed', end(road, s, boot - 60e3) === null && !road.waiting().includes(A.id));
  await pass_(QUIET);
  ok('…5 minutes later: no read', runsOf(A) === 3);
  const r0 = mkRoad({ bootAt: clock.t }), sA = sess(A);
  await stretch(r0, sA);
  ok('a LIVE stretch after the restart reads once', runsOf(A) === 4);
  const boot2 = clock.t + 60e3;
  clock.t = boot2; clock.m = 5e5;   // a new life: its steady clock starts anew
  door = mkDoor();
  const r2 = mkRoad({ bootAt: boot2 }), sB = sess(A);
  await stretch(r2, sB);
  ok('…the hub restarts at once and a stretch ends: minutes after the last read ⇒ NO read (the ceiling is on disk, not in the road)', runsOf(A) === 4);
  // A1: a turn that was running when the hub restarted is restored running; the new road never saw its start
  await pass_(PACE + 60e3);
  door = mkDoor();
  const r3 = mkRoad({ bootAt: clock.t });
  const restored = sess(H8, 'antigravity', { _isStreaming: true });   // boot-restore rebuilt it from the wrapper's sidecar: running
  const other = sess(H8);
  const armed = await stretch(r3, other);
  ok('A1: a conversation restored RUNNING (its start never seen by this road) — another of the account ends its turn: nothing armed, NO read', armed === null && runsOf(H8) === 0 && restored._isStreaming === true);
  restored._isStreaming = false;
  const live = r3.onTurnEnd(restored, { ts: iso(clock.t), kind: 'prompt_end' });
  await pass_(QUIET);
  ok('…the restored turn ends live ⇒ armed, and ONE read 5 quiet minutes later', live && live.armed && runsOf(H8) === 1);
}

console.log('⑧ nothing to arm, and the door\'s own refusals');
{
  const road = mkRoad();
  ok('a conversation on the machine\'s own login (no named account): nothing armed', end(road, sess(null)) === null);
  ok('a PAIRED MACHINE\'s conversation, even naming an account: nothing armed (the road\'s own fence)', end(road, sess(B, 'antigravity', { host: 'h-paired' })) === null && !road.waiting().includes(B.id));
  ok('a claude or codex conversation with an account: nothing armed (no after-turn read declared)', ['claude', 'codex'].every((be) => end(road, { backend: be, _accountId: 'acct-' + be, _isStreaming: false }) === null));
  const fake = { id: 'fake-agy', quota: { ...harnesses.get('antigravity').quota, onDemand: { ...harnesses.get('antigravity').quota.onDemand, afterTurn: undefined } } };
  const roadF = mkRoad({ harnessOf: (id) => (id === 'fake-agy' ? fake : harnesses.get(id)) });
  ok('a harness whose onDemand does NOT declare afterTurn: nothing armed (the capability row, never a name)', end(roadF, { backend: 'fake-agy', _accountId: A.id, _isStreaming: false }) === null);
  const n = spawned.length;
  const dn = await mkDoor((id) => (id === 'antigravity' ? fake : harnesses.get(id))).read(B.id, { afterTurn: true });
  ok('…and the DOOR refuses an after-turn read the descriptor does not declare (400 no-after-turn-read), nothing spawned', dn.status === 400 && dn.code === 'no-after-turn-read' && spawned.length === n, JSON.stringify(dn));
  const d0 = await door.read(B.id, {}), d1 = await door.read(B.id, { afterTurn: 'yes' });
  ok('…a call that is no known caller is refused 403 (only `afterTurn: true` counts)', d0.status === 403 && d1.status === 403 && spawned.length === n);
  const roadN = mkRoad({ conversationsOf: null }), sN = sess(I9);
  const armedN = await stretch(roadN, sN);
  ok('a hub that hands NO conversation list: no turn can be proven over — nothing armed, nothing read', armedN === null && runsOf(I9) === 0);
  const roadK = mkRoad(), sK = sess(J10);
  start(roadK, sK); end(roadK, sK);
  await pass_(60e3);
  convs.delete(sK);   // the conversation is killed (or archived): it leaves the hub's list
  await pass_(QUIET);
  ok('a wait whose conversation is killed or archived is CLEARED: no read', runsOf(J10) === 0 && !roadK.waiting().includes(J10.id));
}

console.log('⑨ the judge\'s STOP — one stop for every automatic caller; ⑩ the setting; the count first');
{
  usageMode = 'turn';
  const before = fs.existsSync(W.cacheFileFor(CACHE, Cc.id));
  const pr = await door.read(Cc.id, { person: true });
  ok('a PERSON\'s press answered turn-shaped ⇒ nothing written, the door says STOP', pr && pr.code === 'turn-started' && runsOf(Cc) === 1 && fs.existsSync(W.cacheFileFor(CACHE, Cc.id)) === before && door.stoppedWhy(Cc.id));
  usageMode = 'reading';
  await pass_(PACE + 60e3);
  const road = mkRoad(), s = sess(Cc);
  const n0 = logs.length;
  await stretch(road, s);
  ok('…a later stretch of that account reads NOTHING: the press\'s stop holds every automatic caller, said once', runsOf(Cc) === 1 && logs.slice(n0).filter((l) => /the automatic reads stopped/.test(l)).length === 1, logs.slice(n0).join(' | '));
  const wl = await door.read(Cc.id, { wall: true });
  ok('…and a wall\'s read of it is refused the same (409 stopped); a person may still press', wl.status === 409 && wl.code === 'stopped' && (await door.read(Cc.id, { person: true })).ok === true && runsOf(Cc) === 2);
  setting = 'off';
  await pass_(PACE + 60e3);
  const r2 = mkRoad(), sB = sess(B);
  const n1 = logs.length;
  await stretch(r2, sB);
  ok('`accounts.onDemandQuotaRefresh = off` ⇒ the door refuses the after-turn read (nothing spawned, said)', runsOf(B) === 1 && logs.slice(n1).some((l) => /read nothing \(refresh-off/.test(l)), logs.slice(n1).join(' | '));
  setting = 'manual';
  // THE COUNT FIRST, FAIL CLOSED (law A3 b)
  await pass_(PACE + 60e3);
  failWrites = true;
  const n2 = logs.length, k0 = today(B).total;
  await stretch(mkRoad(), sess(B));
  failWrites = false;
  ok('A3: the count\'s write FAILS ⇒ the read is refused by name (count-failed), NOTHING spawned, a log line', runsOf(B) === 1 && logs.slice(n2).some((l) => /the read count could not be written — not read \(afterTurn\)/.test(l)) && logs.slice(n2).some((l) => /read nothing \(count-failed/.test(l)), logs.slice(n2).join(' | '));
  await stretch(mkRoad(), sess(B));
  ok('…the writer heals: the next stretch reads, counted', runsOf(B) === 2 && today(B).total >= k0 + 1);
}

console.log('⑩b the steady clock (law A2); a failed read, then three hours; the ruling\'s arithmetic');
{
  const road = mkRoad(), s = sess(D);
  await stretch(road, s);
  ok('a read of D', runsOf(D) === 1);
  clock.t += 25 * 60e3;   // the WALL clock steps 25 minutes forward; the steady clock does not
  const n0 = logs.length;
  await stretch(road, s);
  ok('A2: the wall clock steps 25 min forward after a read — 31 min «since» by the wall, 6 by the steady clock ⇒ NO read, said', runsOf(D) === 1 && logs.slice(n0).some((l) => /by the steady clock — under the 30-minute ceiling/.test(l)), logs.slice(n0).join(' | '));
  clock.t -= 3 * 3600e3;   // and back: three hours behind the last read
  await pass_(PACE);
  await stretch(road, s);
  ok('…the wall clock steps 3 h BACK: «since» by the wall is negative ⇒ NO read (never a read on a clock that ran backwards)', runsOf(D) === 1);
  clock.t += 3 * 3600e3;
  // a failed read is counted and not retried; three hours later a stretch reads again
  usageMode = 'auth';
  await pass_(PACE + 60e3);
  await stretch(road, s);
  ok('a read that FAILS (not signed in) is counted (after a stretch +1)', runsOf(D) === 2 && today(D).afterTurn >= 2);
  usageMode = 'reading';
  const n = runsOf(D);
  for (let h = 0; h < 3; h++) await pass_(3600e3);
  ok('…three hours with no stretch: no retry', runsOf(D) === n);
  await stretch(road, s);
  ok('…then a stretch: ONE read', runsOf(D) === n + 1);
  // the ruling's arithmetic: 48 after-turn reads in a day — the 49th is a BUG, refused and said (never a notice)
  const recFile = path.join(CACHE, DR.doorReadsSidecarName(M7.id));
  fs.writeFileSync(recFile, JSON.stringify({ day: DR.dayOf(clock.t), person: 0, wall: 0, afterTurn: DOOR.AFTER_TURN_DAY_MAX, lastAt: clock.t - 2 * 3600e3, lastBy: 'afterTurn' }));
  DR._forget();
  const n1 = logs.length;
  const over = await door.read(M7.id, { afterTurn: true });
  ok(`the ruling's arithmetic: ${DOOR.AFTER_TURN_DAY_MAX} after-turn reads already today ⇒ the next is refused (over-ruling) with a log line naming it a bug, nothing spawned`, over.code === 'over-ruling' && runsOf(M7) === 0 && logs.slice(n1).some((l) => /A BUG — 48 after-turn reads today already, the ruling allows 48/.test(l)), JSON.stringify(over));
}

console.log('⑪ THE WALL\'S RESTART RE-READ (the research\'s finding), closed by the rule on disk');
{
  const TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 90h39m34s.';
  const wallAt = clock.t;
  const NOTICE = { ts: iso(wallAt), type: 'acp', kind: 'notice', level: 'error', text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): ' + TEXT, noticeKind: 'agy-error' };
  const wsess = () => ({ backend: 'antigravity', _accountId: E5.id, _spawnModel: 'gemini-4-argon-high' });
  const mkWall = (mod = SW) => mod.createStreamWallRoad({ harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, door, now: () => clock.t, log: (l) => logs.push(l) });
  usageMode = 'auth';   // the one-shot reads NOTHING (not signed in) — so no newer reading beats the replayed wall
  const w0 = runsOf(E5), c0 = today(E5).wall;
  clock.t = wallAt + 50;
  const r1 = mkWall().onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r1 && r1.oneShot);
  ok('a wall ⇒ its ONE re-check (it read nothing: not signed in), counted on disk (after a usage wall +1)', runsOf(E5) === w0 + 1 && today(E5).wall === c0 + 1, JSON.stringify(today(E5)));
  clock.t = wallAt + 2 * 60e3;
  const r2 = mkWall().onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r2 && r2.oneShot);
  ok('…the hub restarts (a new road: its ledger forgotten) and the wall is replayed 2 min later ⇒ NO second read', runsOf(E5) === w0 + 1 && (!r2 || r2.oneShot === null), JSON.stringify(r2 && { oneShot: r2.oneShot }));
  const SWm = mutant('src/server/stream-wall.js', '    if (doorReads.lastReadAt(cacheDir, key, usageWrite) >= sig.measuredAt) return null;\n', '');
  clock.t = wallAt + 3 * 60e3;
  door = mkDoor();   // a fresh door (its minute's pace is the hub's memory too)
  const r3 = mkWall(SWm).onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r3 && r3.oneShot);
  ok('CONTROL ⑪: stream-wall WITHOUT the rule on disk, restarted the same way ⇒ a SECOND read (the double read is real; the line closes it)', runsOf(E5) === w0 + 2, String(runsOf(E5)));
  usageMode = 'reading';
}

console.log('⑫ RED CONTROLS: the road and the door without each of their rules, driven — each scene decided by that rule alone');
{
  const F = 'src/server/after-turn-read.js';
  await pass_(PACE + 60e3);
  {
    const mod = mutant(F, '    if (!(endAt >= born)) return null;\n', '');
    const boot = clock.t, road = mkRoad({ bootAt: boot }, mod);
    end(road, sess(M1), boot - 60e3);
    await pass_(QUIET);
    ok('CONTROL ⑫a: without the replay guard a replayed turn end is CAUGHT UP (a read)', runsOf(M1) === 1, String(runsOf(M1)));
  }
  {
    const mod = mutant(F, '    if (now() - last < paceMs) {', '    if (false) {');
    const s = sess(M2);
    door = mkDoor();   // no steady memory of an earlier run: only the wall-clock rule stands between the two reads
    await stretch(mkRoad({}, mod), s);
    door = mkDoor();
    await stretch(mkRoad({}, mod), s);
    ok('CONTROL ⑫b: without the wall-clock ceiling (and a restart between) two reads land minutes apart', runsOf(M2) === 2, String(runsOf(M2)));
  }
  {
    const mod = mutant(F, '    if (last >= endAt) return null;   // read since the stretch ended (a press, a wall): nothing new to read\n', '');
    const road = mkRoad({ paceMs: 60e3 }, mod), s = sess(M3);
    start(road, s); end(road, s);
    await pass_(2 * 60e3); await door.read(M3.id, { person: true });
    await pass_(QUIET);
    ok('CONTROL ⑫c: without the idle check (the 1-minute-ceiling scene of ⑥) the account read since its stretch is read AGAIN', runsOf(M3) === 2, String(runsOf(M3)));
  }
  {
    const mod = mutant(F, 'return l === null ? true : l.some((s) => s && s._isStreaming === true);', 'return false;');
    const road = mkRoad({ bootAt: clock.t }, mod);
    sess(M4, 'antigravity', { _isStreaming: true });
    await stretch(road, sess(M4));
    ok('CONTROL ⑫d (A1): with «a turn runs» not read from the conversations, the account is read WHILE its restored turn runs', runsOf(M4) === 1, String(runsOf(M4)));
  }
  {
    const mod = mutant(F, '    if (steady < paceMs) {', '    if (false) {');
    const road = mkRoad({}, mod), s = sess(M5);
    await stretch(road, s);
    clock.t += 25 * 60e3;
    await stretch(road, s);
    ok('CONTROL ⑫e (A2): without the steady clock a 25-minute wall-clock step lets a second read go 6 minutes later', runsOf(M5) === 2, String(runsOf(M5)));
  }
  {
    const DOORm = mutant('src/server/cli-usage-door.js', '    if (!counted) {', '    if (false) {');
    const dm = DOORm.createCliUsageDoor({ accounts: am, harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, spawnImpl: fakeSpawn, countWriter: () => writer, mono: () => clock.m,
      cliCmds: { check: async () => '/stand-in/agy' }, agentEnv: () => ({ PATH: '/usr/bin' }), setting: () => 'manual', now: () => clock.t, log: (l) => logs.push(l) });
    failWrites = true;
    await dm.read(M6.id, { person: true });
    failWrites = false;
    ok('CONTROL ⑫f (A3): without «count first, fail closed» a read whose count could not be written still spawns', runsOf(M6) === 1, String(runsOf(M6)));
  }
}

console.log('⑬ the account row says the day\'s reads — as text, for every account the door serves');
{
  const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  const KEY = 'Usage read {n}× today: {person} by you · {wall} after a usage wall · {after} after a stretch of work', NOTE = 'usage read {n}× today';
  ok('three reads today ⇒ the line «usage read 3× today», its title «Usage read 3× today: 1 by you · 0 after a usage wall · 2 after a stretch of work»', MA.doorReadsNote({ total: 3 }) === 'usage read 3× today' && MA.doorReadsLine({ total: 3, person: 1, wall: 0, afterTurn: 2 }) === 'Usage read 3× today: 1 by you · 0 after a usage wall · 2 after a stretch of work');
  ok('…none today, or no count ⇒ no words', MA.doorReadsNote({ total: 0 }) === '' && MA.doorReadsLine(null) === '' && MA.doorReadsNote(undefined) === '');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  ok('…zh and ja say both, every placeholder kept', [zh[KEY], ja[KEY]].every((s) => typeof s === 'string' && ['{n}', '{person}', '{wall}', '{after}'].every((p) => s.includes(p))) && [zh[NOTE], ja[NOTE]].every((s) => typeof s === 'string' && s.includes('{n}')), JSON.stringify([zh[NOTE], ja[NOTE]]));
  const UR = read('src/usage-routes.js'), MAs = read('src/lib/manage-agents.js');
  ok('/api/usage serves every account the door read today — one with NO reading too (limits [], its count)', /if \(!has && !reads\.total\) continue;/.test(UR) && /limits: has \? c\.limits : \[\]/.test(UR));
  ok('…the roster draws the count as TEXT on the identity line (no badge, no colour), its title the split, patched at every poll', MAs.includes('<span class="acct-key-tail">${ident}${readsNote(a.id)}</span>') && MAs.includes("document.querySelectorAll('.acct-reads[data-reads-key]')") && !/acct-reads[^\n]*(badge|color)/.test(MAs));
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
