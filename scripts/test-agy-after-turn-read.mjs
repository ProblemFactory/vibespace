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
//   ⑬ the account row's words: «Usage read N× today: …» in en / zh / ja, carried by /api/usage and the roster's cell.
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

// ── the world: a real accounts store, the real door, a recorded CLI, the suite's clock and timers ──
const ROOT = scratch('agy-after-turn');
fs.rmSync(ROOT, { recursive: true, force: true });
const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data'), CACHE = path.join(DATA, 'usage-cache');
for (const d of [MACHINE, CACHE]) fs.mkdirSync(d, { recursive: true });
process.env.HOME = MACHINE;
const AGY = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const mkAcct = (name) => { const a = am.createHomeSubscription('antigravity', { name }); fs.writeFileSync(path.join(a.dir, AGY.TOKEN_REL), 'LOGIN', { mode: 0o600 }); am.finalizeHomeSubscription(a.id); return a; };
const [A, B, Cc, D, M1, M2, M3, M4] = ['Work', 'Second', 'Third', 'Fourth', 'Mut one', 'Mut two', 'Mut three', 'Mut four'].map(mkAcct);
const FIX = JSON.parse(read('scripts/fixtures/antigravity-usage-1.4.3.json'));
const ANSWERS = {
  reading: { code: 0, out: JSON.stringify(FIX.envelope) + '\n' },
  turn: { code: 0, out: JSON.stringify({ conversation_id: 'c-1', status: 'SUCCESS', response: 'stand-in', duration_seconds: 1.2, num_turns: 1, usage: { input_tokens: 100 } }) + '\n' },
  auth: { code: 1, out: JSON.stringify({ conversation_id: '', status: 'ERROR', response: '', error: 'authentication required' }) + '\n', err: "Error: authentication required. Run 'agy' to log in, then retry.\n" },
};
const T0 = Date.parse('2026-11-14T10:00:00.000Z');
const clock = { t: T0 };
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
const logs = [];
const mkDoor = (harnessOf = (id) => harnesses.get(id)) => DOOR.createCliUsageDoor({
  accounts: am, harnessOf, cacheDir: CACHE, spawnImpl: fakeSpawn,
  cliCmds: { check: async (be, o) => (be === 'antigravity' && o && o.force === true ? '/stand-in/agy' : null) },
  agentEnv: () => ({ PATH: '/usr/bin' }), setting: () => setting, now: () => clock.t, log: (l) => logs.push(l),
});
const door = mkDoor();
const timers = [];
const setTimer = (fn, ms) => { const h = { fn, ms, at: clock.t, live: true }; timers.push(h); return h; };
const clearTimer = (h) => { if (h) h.live = false; };
/** `ms` pass on the suite's clock: every quiet wait that ran out fires (its read awaited) */
async function pass_(ms) {
  clock.t += ms;
  for (const h of timers.filter((x) => x.live && x.at + x.ms <= clock.t)) { h.live = false; await h.fn(); }
}
const QUIET = ATR.QUIET_MS, PACE = ATR.PACE_MS;
const mkRoad = (o = {}, mod = ATR) => mod.createAfterTurnRead({ harnessOf: (id) => harnesses.get(id), door, cacheDir: CACHE, now: () => clock.t, bootAt: T0 - 3600e3, setTimer, clearTimer, log: (l) => logs.push(l), ...o });
const sess = (acct, backend = 'antigravity') => ({ backend, _accountId: acct ? acct.id : null, _isStreaming: false });
const start = (road, s) => { s._isStreaming = true; return road.onTurnStart(s, { ts: iso(clock.t), type: 'acp', kind: 'prompt_start', promptId: 'p' }); };
const end = (road, s, at = clock.t) => { s._isStreaming = false; return road.onTurnEnd(s, { ts: iso(at), type: 'acp', kind: 'prompt_end', promptId: 'p', stopReason: 'end_turn', error: null }); };
const runsOf = (acct) => spawned.filter((x) => x.home === acct.dir).length;
const disk = (acct) => W.readCacheObject(CACHE, acct.id);
const today = (acct) => DR.todayOf(DR.readDoorReads(CACHE, acct.id), clock.t);

console.log('① the read count on disk (src/door-reads.js)');
{
  const dir = path.join(ROOT, 'count');
  fs.mkdirSync(dir, { recursive: true });
  const name = DR.doorReadsSidecarName('agy-1/x');
  ok('the sidecar is `.door-reads-<key>` (unsafe characters folded) and NOT a `.json` the usage-cache scanners read', name === '.door-reads-agy-1_x' && !W.isCacheFileName(name));
  DR.bumpDoorRead(dir, 'k', 'person', T0); DR.bumpDoorRead(dir, 'k', 'person', T0 + 60e3); DR.bumpDoorRead(dir, 'k', 'wall', T0 + 120e3);
  const t = DR.todayOf(DR.readDoorReads(dir, 'k'), T0 + 180e3);
  ok('three runs the same day → by caller (person 2, wall 1, after a stretch 0), total 3, the last run kept', t.person === 2 && t.wall === 1 && t.afterTurn === 0 && t.total === 3 && t.lastAt === T0 + 120e3, JSON.stringify(t));
  const next = T0 + 86400e3;
  const t2 = DR.todayOf(DR.readDoorReads(dir, 'k'), next);
  ok('…read the NEXT day → zeros (the count is the day\'s), the last run still known', t2.total === 0 && t2.person === 0 && t2.lastAt === T0 + 120e3 && t2.day === DR.dayOf(next) && t2.day !== DR.dayOf(T0), JSON.stringify(t2));
  DR.bumpDoorRead(dir, 'k', 'afterTurn', next);
  const t3 = DR.todayOf(DR.readDoorReads(dir, 'k'), next);
  ok('…a run on the next day starts that day\'s count (after a stretch 1, the rest 0)', t3.afterTurn === 1 && t3.total === 1, JSON.stringify(t3));
  let threw = null; try { DR.bumpDoorRead(dir, 'k', 'timer', next); } catch (e) { threw = e.message; }
  ok('an unknown caller is refused by name (a fourth caller has no row)', /unknown caller "timer"/.test(String(threw)), threw);
  W.writeReading({ cacheDir: dir, key: 'k', set: { ...U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(FIX.envelope), measuredAt: next + 5e3 }).reading, identity: 'k' }, extras: { backend: 'antigravity' }, source: 'cli-usage', backend: 'antigravity' });
  ok('the account\'s last read = the later of its recorded reading (fetchedAt) and the door\'s last run', DR.lastReadAt(dir, 'k') === next + 5e3 && DR.lastReadAt(dir, 'nobody') === 0);
  const others = harnesses.harnessIds().filter((id) => id !== 'antigravity');   // derived from the registry: a new harness is judged too
  ok(`the descriptor declares it: antigravity\'s onDemand.afterTurn is true; every other harness (${others.join(', ')}) declares no after-turn read`, harnesses.get('antigravity').quota.onDemand.afterTurn === true && others.length >= 1 && others.every((id) => { const h = harnesses.get(id); return !h || !(h.quota && h.quota.onDemand && h.quota.onDemand.afterTurn); }));
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
  ok('…the reading is written for the account (measured at the read) and counted: after a stretch 1', disk(A)?.fetchedAt === clock.t && disk(A)?.source === 'cli-usage' && today(A).afterTurn === 1 && today(A).total === 1, JSON.stringify(today(A)));
  ok('…and the quiet wait is gone (one read per stretch)', !road.waiting().includes(A.id));
}

console.log('③ a turn START within the 5 minutes cancels the read');
{
  const road = mkRoad(), s = sess(A);
  await pass_(PACE + 60e3);   // past the ceiling
  start(road, s); end(road, s);
  await pass_(3 * 60e3);
  start(road, s);
  ok('a new turn of the account 3 min after the end: the wait is cancelled', !road.waiting().includes(A.id));
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
  clock.t = last + 5 * 60e3;
  start(road, s); end(road, s);
  const n0 = logs.length;
  await pass_(QUIET);
  ok('a stretch ending 5 min after the last read: 10 min since it ⇒ NO read, said by name', runsOf(A) === 2 && logs.slice(n0).some((l) => /read 10 min ago — under the 30-minute ceiling, not read now/.test(l)), logs.slice(n0).join(' | '));
  clock.t = last + 26 * 60e3;
  start(road, s); end(road, s);
  await pass_(QUIET);
  ok('…a stretch ending 26 min after it: the read comes 31 min after the last ⇒ ONE read', runsOf(A) === 3);
  ok('…nothing is read because time passed: 24 h on the clock with no turn ⇒ no read', await (async () => { const n = spawned.length; for (let h = 0; h < 24; h++) await pass_(3600e3); return spawned.length === n; })());
}

console.log('⑥ AN IDLE ACCOUNT is never read');
{
  const road = mkRoad(), s = sess(A);
  start(road, s); end(road, s);
  const e0 = clock.t;
  await pass_(2 * 60e3);
  const pr = await door.read(A.id, { person: true });
  ok('a person\'s Re-check 2 min after the stretch ended reads (the door counts it: by you 1)', pr && pr.ok && runsOf(A) === 4 && today(A).person === 1, JSON.stringify(pr));
  await pass_(QUIET);
  ok('…so when the wait runs out the account has had no turn since its last read ⇒ NO read', runsOf(A) === 4 && DR.lastReadAt(CACHE, A.id) > e0);
  ok('an account with no turn at all is never armed (no wait, no read)', !road.waiting().includes(Cc.id) && runsOf(Cc) === 0);
}

console.log('⑦ A RESTART: nothing is caught up, the ceiling stands');
{
  await pass_(PACE + 60e3);
  const boot = clock.t;
  const road = mkRoad({ bootAt: boot }), s = sess(A);
  ok('the new hub is fed a turn end stamped 1 min BEFORE it started (a replayed record): nothing armed', end(road, s, boot - 60e3) === null && !road.waiting().includes(A.id));
  await pass_(QUIET);
  ok('…5 minutes later: no read', runsOf(A) === 4);
  const r0 = mkRoad({ bootAt: clock.t }), sA = sess(A);
  start(r0, sA); end(r0, sA);
  await pass_(QUIET);
  ok('a LIVE stretch after the restart reads once (the last read was 36 min before)', runsOf(A) === 5);
  const boot2 = clock.t + 60e3;
  clock.t = boot2;
  const r2 = mkRoad({ bootAt: boot2 }), sB = sess(A);
  start(r2, sB); end(r2, sB);
  await pass_(QUIET);
  ok('…the hub restarts at once and a stretch ends: 6 min after the last read ⇒ NO read (the ceiling is on disk, not in the road)', runsOf(A) === 5);
}

console.log('⑧ nothing to arm, and the door\'s own refusals');
{
  const road = mkRoad();
  ok('a conversation on the machine\'s own login (no named account): nothing armed', end(road, sess(null)) === null);
  ok('a claude or codex conversation with an account: nothing armed (no after-turn read declared)', ['claude', 'codex'].every((be) => end(road, { backend: be, _accountId: 'acct-' + be, _isStreaming: false }) === null));
  const fake = { id: 'fake-agy', quota: { ...harnesses.get('antigravity').quota, onDemand: { ...harnesses.get('antigravity').quota.onDemand, afterTurn: undefined } } };
  const roadF = mkRoad({ harnessOf: (id) => (id === 'fake-agy' ? fake : harnesses.get(id)) });
  ok('a harness whose onDemand does NOT declare afterTurn: nothing armed (the capability row, never a name)', end(roadF, { backend: 'fake-agy', _accountId: A.id, _isStreaming: false }) === null);
  const n = spawned.length;
  const dn = await mkDoor((id) => (id === 'antigravity' ? fake : harnesses.get(id))).read(B.id, { afterTurn: true });
  ok('…and the DOOR refuses an after-turn read the descriptor does not declare (400 no-after-turn-read), nothing spawned', dn.status === 400 && dn.code === 'no-after-turn-read' && spawned.length === n, JSON.stringify(dn));
  const d0 = await door.read(B.id, {}), d1 = await door.read(B.id, { afterTurn: 'yes' });
  ok('…a call that is no known caller is refused 403 (only `afterTurn: true` counts)', d0.status === 403 && d1.status === 403 && spawned.length === n);
}

console.log('⑨ the judge\'s STOP, ⑩ the setting');
{
  usageMode = 'turn';
  const road = mkRoad(), s = sess(Cc);
  start(road, s); end(road, s);
  const before = fs.existsSync(W.cacheFileFor(CACHE, Cc.id));
  await pass_(QUIET);
  ok('a turn-shaped answer ⇒ nothing written and the road says STOP / DISARMED', runsOf(Cc) === 1 && fs.existsSync(W.cacheFileFor(CACHE, Cc.id)) === before && logs.some((l) => new RegExp(`\\[after-turn-read\\] ${Cc.id}: STOP — DISARMED until the hub restarts`).test(l)));
  usageMode = 'reading';
  await pass_(PACE + 60e3);
  start(road, s); end(road, s);
  const n0 = logs.length;
  await pass_(QUIET);
  ok('…a later stretch of that account reads NOTHING (disarmed for the hub\'s life), said once', runsOf(Cc) === 1 && logs.slice(n0).filter((l) => /stays disarmed/.test(l)).length === 1);
  setting = 'off';
  await pass_(PACE + 60e3);
  const r2 = mkRoad(), sB = sess(B);
  start(r2, sB); end(r2, sB);
  const n1 = logs.length;
  await pass_(QUIET);
  ok('`accounts.onDemandQuotaRefresh = off` ⇒ the door refuses the after-turn read (nothing spawned, said)', runsOf(B) === 1 && logs.slice(n1).some((l) => /read nothing \(refresh-off/.test(l)), logs.slice(n1).join(' | '));
  setting = 'manual';
}

console.log('⑪ THE WALL\'S RESTART RE-READ (the research\'s finding), closed by the rule on disk');
{
  const TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 90h39m34s.';
  const wallAt = clock.t;
  const NOTICE = { ts: iso(wallAt), type: 'acp', kind: 'notice', level: 'error', text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): ' + TEXT, noticeKind: 'agy-error' };
  const wsess = () => ({ backend: 'antigravity', _accountId: D.id, _spawnModel: 'gemini-4-argon-high' });
  const mkWall = (mod = SW) => mod.createStreamWallRoad({ harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, door, now: () => clock.t, log: (l) => logs.push(l) });
  usageMode = 'auth';   // the one-shot reads NOTHING (not signed in) — so no newer reading beats the replayed wall
  clock.t = wallAt + 50;
  const r1 = mkWall().onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r1 && r1.oneShot);
  ok('a wall ⇒ its ONE re-check (it read nothing: not signed in), counted on disk (after a usage wall 1)', runsOf(D) === 1 && today(D).wall === 1, JSON.stringify(today(D)));
  clock.t = wallAt + 2 * 60e3;   // the hub restarts; the wall is replayed at attach, still LIVE (≤ 5 min)
  const r2 = mkWall().onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r2 && r2.oneShot);
  ok('…the hub restarts (a new road: its ledger forgotten) and the wall is replayed 2 min later ⇒ NO second read', runsOf(D) === 1 && (!r2 || r2.oneShot === null), JSON.stringify(r2 && { oneShot: r2.oneShot }));
  const SWm = mutant('src/server/stream-wall.js', '    if (doorReads.lastReadAt(cacheDir, key, usageWrite) >= sig.measuredAt) return null;\n', '');
  clock.t = wallAt + 3 * 60e3;
  const r3 = mkWall(SWm).onRecord(wsess(), NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  await (r3 && r3.oneShot);
  ok('CONTROL ⑪: stream-wall WITHOUT the rule on disk, restarted the same way ⇒ a SECOND read (the double read is real; the line closes it)', runsOf(D) === 2, String(runsOf(D)));
  usageMode = 'reading';
}

console.log('⑫ RED CONTROLS: the road without each of its rules, driven');
{
  const F = 'src/server/after-turn-read.js';
  // the replay guard: a turn end stamped before the hub started arms the read
  {
    const mod = mutant(F, '    if (!(endAt >= born)) return null;\n', '');
    const boot = clock.t, road = mkRoad({ bootAt: boot }, mod);
    end(road, sess(M1), boot - 60e3);
    await pass_(QUIET);
    ok('CONTROL ⑫a: without the replay guard a replayed turn end is CAUGHT UP (a read)', runsOf(M1) === 1, String(runsOf(M1)));
  }
  // the ceiling: a stretch 10 min after a read is read again
  {
    const mod = mutant(F, '    if (now() - last < paceMs) {', '    if (false) {');
    const road = mkRoad({}, mod), s = sess(M2);
    start(road, s); end(road, s); await pass_(QUIET);
    clock.t += 5 * 60e3; start(road, s); end(road, s); await pass_(QUIET);
    ok('CONTROL ⑫b: without the ceiling two reads land 10 min apart', runsOf(M2) === 2, String(runsOf(M2)));
  }
  // the idle check: a press after the stretch, then the wait runs out ⇒ a read of an account with no turn since its last read
  {
    const mod = mutant(F, '    if (last >= endAt) return null;   // read since the stretch ended (a press, a wall): nothing new to read\n', '');
    const road = mkRoad({}, mod), s = sess(M3);
    start(road, s); end(road, s);
    await pass_(60e3); await door.read(M3.id, { person: true });
    clock.t += PACE;   // past the ceiling, so only the idle rule can stop it
    await pass_(QUIET);
    ok('CONTROL ⑫c: without the idle check an account read since its stretch is read AGAIN', runsOf(M3) === 2, String(runsOf(M3)));
  }
  // the busy check: one conversation's end arms while another turn of the account runs
  {
    const mod = mutant(F, '    if (busy(key)) return null;\n', '');
    const road = mkRoad({}, mod), s1 = sess(M4), s2 = sess(M4);
    start(road, s1); start(road, s2); end(road, s1);
    await pass_(QUIET);
    ok('CONTROL ⑫d: without the busy check the account is read WHILE a turn of it runs', runsOf(M4) === 1 && s2._isStreaming === true, String(runsOf(M4)));
  }
}

console.log('⑬ the account row says the day\'s reads');
{
  const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  const KEY = 'Usage read {n}× today: {person} by you · {wall} after a usage wall · {after} after a stretch of work';
  ok('three reads today ⇒ «Usage read 3× today: 1 by you · 0 after a usage wall · 2 after a stretch of work»', MA.doorReadsLine({ total: 3, person: 1, wall: 0, afterTurn: 2 }) === 'Usage read 3× today: 1 by you · 0 after a usage wall · 2 after a stretch of work', MA.doorReadsLine({ total: 3, person: 1, wall: 0, afterTurn: 2 }));
  ok('…none today, or no count ⇒ no words (the title stays empty)', MA.doorReadsLine({ total: 0 }) === '' && MA.doorReadsLine(null) === '' && MA.doorReadsLine(undefined) === '');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  ok('…zh and ja say it, every placeholder kept', [zh[KEY], ja[KEY]].every((s) => typeof s === 'string' && ['{n}', '{person}', '{wall}', '{after}'].every((p) => s.includes(p))), JSON.stringify([zh[KEY], ja[KEY]]));
  const UR = read('src/usage-routes.js'), MAs = read('src/lib/manage-agents.js');
  ok('/api/usage carries each on-demand account\'s count beside its reading (homeAccounts[id].reads)', /reads: doorReads\.todayOf\(doorReads\.readDoorReads\(USAGE_CACHE_DIR, a\.id\), Date\.now\(\)\)/.test(UR));
  ok('…the roster\'s cell says it as its title, at paint and at every poll\'s patch', MAs.includes('title="${escHtml(doorReadsLine(this._homeAccountUsage?.[a.id]?.reads))}"') && /if \(cell\.dataset\.usageSrc === 'home' && typeof cell\.setAttribute === 'function'\) \{ const tl = doorReadsLine\(maps\.home\?\.\[cell\.dataset\.usageKey\]\?\.reads\);/.test(MAs));
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
