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
//   ⑨ the judge's STOP disarms the account until the hub restarts; ⑩ ONE ROW PER VENDOR: Claude's row Off stops no Antigravity
//      read, Antigravity's own row Off refuses its automatic reads (⑭: the door asks the row of the vendor whose account it is);
//   ⑪ THE WALL'S RESTART RE-READ (the research's finding): a wall replayed after a restart reads nothing more — the rule
//      on disk; its RED control is stream-wall without that line;
//   ⑫ RED CONTROLS: the road without its replay guard, its ceiling, its idle check or its busy check, each driven;
//   ⑬ the account row's words: «usage read N× today» as text on the identity line (the split by caller its title), in en /
//      zh / ja, for every account the door serves — one with no reading too;
//   ⑭ LAW A (the look of 06:16Z): a turn running across a restart is seen (A1); the ceiling on the steady clock (A2); the count
//      written first and a failed write refusing the read (A3); one stop for every automatic caller; a paired machine's
//      conversation; a wait whose conversation is gone; the ruling's arithmetic; each with the scene only its rule decides.
//   ⑮ THE SPLIT'S TWO LAWS (主开发's bounded check, 2026-11-16): U1 a press on an instance migrated from the shared row's Off
//      READS — once, counted, paced; U2 an Off the person chose survives every road that can drop the key (a tab from before
//      the restart saving its whole settings; the import of an older config): a row holding no value reads Off while Claude's
//      row is Off, at the hub's read and in the Settings window; a person's own «Automatically» is kept as a value. Each leg
//      with its RED (the door, readRow or the settings store without the rule).
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
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  m._compile(editAnchor(src, from, to, rel, 'join'), file);
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
const NAMES = ['Work', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Mut one', 'Mut two', 'Mut three', 'Mut four', 'Mut five', 'Mut six', 'Mut seven', 'Mut eight'];
const [A, B, Cc, D, E5, F6, G7, H8, I9, J10, M1, M2, M3, M4, M5, M6, M7, M8] = NAMES.map(mkAcct);
const FIX = JSON.parse(read('scripts/fixtures/antigravity-usage-1.4.3.json'));
const ANSWERS = {
  reading: { code: 0, out: JSON.stringify(FIX.envelope) + '\n' },
  turn: { code: 0, out: JSON.stringify({ conversation_id: 'c-1', status: 'SUCCESS', response: 'stand-in', duration_seconds: 1.2, num_turns: 1, usage: { input_tokens: 100 } }) + '\n' },
  auth: { code: 1, out: JSON.stringify({ conversation_id: '', status: 'ERROR', response: '', error: 'authentication required' }) + '\n', err: "Error: authentication required. Run 'agy' to log in, then retry.\n" },
};
const T0 = Date.parse('2026-11-14T10:00:00.000Z');
const clock = { t: T0, m: 1e6 };   // the wall clock and the steady clock — the suite's own; a «step» moves only the wall
const iso = (ms) => new Date(ms).toISOString();
let usageMode = 'reading', setting = 'manual', agyRow = 'on';   // Claude's row (accounts.onDemandQuotaRefresh) and Antigravity's own (antigravity.autoUsageReads)
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
  agentEnv: () => ({ PATH: '/usr/bin' }), setting: (k) => (k === 'antigravity.autoUsageReads' ? agyRow : setting), now: () => clock.t, log: (l) => logs.push(l),
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
  ok('three runs the same day, each answered DURABLE → by caller (person 2, wall 1, after a stretch 0), total 3, the last run kept', gateOf(w1) && gateOf(w2) && gateOf(w3) && t.person === 2 && t.wall === 1 && t.afterTurn === 0 && t.total === 3 && t.lastAt === T0 + 120e3, JSON.stringify(t));
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
  const before = DR.todayOf(DR.readDoorReads(dir, 'k'), next).total;
  const thrown = await DR.bumpDoorRead(dir, 'k', 'afterTurn', next, { writer: { dirty() { throw new Error('made: the writer is gone'); }, durable() { return Promise.resolve(true); } }, log: () => { } });
  ok('a writer that THROWS at dirty() is a failed write too: false, and the count rolled back (nothing counted in memory)', thrown === false && DR.todayOf(DR.readDoorReads(dir, 'k'), next).total === before);
  let threw = null; try { await DR.bumpDoorRead(dir, 'k', 'timer', next, { writer }); } catch (e) { threw = e.message; }
  ok('an unknown caller is refused by name (a fourth caller has no row)', verdictOf(/unknown caller "timer"/.test(String(threw))), threw);
  W.writeReading({ cacheDir: dir, key: 'k', set: { ...U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(FIX.envelope), measuredAt: next + 5e3 }).reading, identity: 'k' }, extras: { backend: 'antigravity' }, source: 'cli-usage', backend: 'antigravity' });
  ok('the account\'s last read = the later of its recorded reading (fetchedAt) and the door\'s last run', DR.lastReadAt(dir, 'k') === next + 5e3 && DR.lastReadAt(dir, 'nobody') === 0);
  const others = harnesses.harnessIds().filter((id) => id !== 'antigravity');   // derived from the registry: a new harness is judged too
  ok(`the descriptor declares it: antigravity's onDemand.afterTurn is true; every other harness (${others.join(', ')}) declares no after-turn read`, harnesses.get('antigravity').quota.onDemand.afterTurn === true && others.length >= 1 && verdictOf(others.every((id) => { const h = harnesses.get(id); return !h || !(h.quota && h.quota.onDemand && h.quota.onDemand.afterTurn); })));
}

console.log('② THE EVENT: a turn ends, 5 quiet minutes pass ⇒ ONE read');
{
  const road = mkRoad(), s = sess(A);
  start(road, s);
  await pass_(2 * 60e3);
  const r = end(road, s);
  ok('the turn\'s end ARMS the account\'s quiet wait (and reads nothing yet)', gateOf(r) && r.armed === true && r.key === A.id && runsOf(A) === 0 && verdictOf(road.waiting().includes(A.id)));
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
  ok('…the second ends ⇒ armed, and ONE read 5 quiet minutes later', gateOf(r) && gateOf(r.armed) && runsOf(B) === 1);
}

console.log('⑤ THE CEILING: at most one read per account per 30 minutes, counted from its last read');
{
  const road = mkRoad(), s = sess(A);
  const last = DR.lastReadAt(CACHE, A.id);
  clock.t = last + 5 * 60e3; clock.m += 5 * 60e3;
  start(road, s); end(road, s);
  const n0 = logs.length;
  await pass_(QUIET);
  ok('a stretch ending 5 min after the last read: 10 min since it ⇒ NO read, said by name', runsOf(A) === 2 && verdictOf(logs.slice(n0).some((l) => /read 10 min ago — under the 30-minute ceiling, not read now/.test(l))), logs.slice(n0).join(' | '));
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
  ok('a person\'s Re-check 2 min after the stretch ended reads (counted: by you 1)', gateOf(pr) && gateOf(pr.ok) && runsOf(F6) === 1 && today(F6).person === 1, JSON.stringify(pr));
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
  ok('…the restored turn ends live ⇒ armed, and ONE read 5 quiet minutes later', gateOf(live) && gateOf(live.armed) && runsOf(H8) === 1);
  // THE BUSY CHECK AT THE MOMENT OF THE READ (the closure check's S3): armed while nothing ran; then a conversation of the account
  // is running when the wait runs out though the road never heard its start (a turn begun through a road it does not see)
  await pass_(PACE + 60e3);
  const r4 = mkRoad(), s4 = sess(H8), unseen = sess(H8);
  start(r4, s4); const armed4 = end(r4, s4);
  await pass_(60e3); unseen._isStreaming = true;   // no onTurnStart: only the conversation's own state says it runs
  await pass_(QUIET);
  ok('the wait runs out while ANOTHER conversation of the account runs (its start never heard): NO read — «a turn runs» is read at the moment of the read', gateOf(armed4) && gateOf(armed4.armed) && runsOf(H8) === 1);
  unseen._isStreaming = false;
}

console.log('⑧ nothing to arm, and the door\'s own refusals');
{
  const road = mkRoad();
  ok('a conversation on the machine\'s own login (no named account): nothing armed', end(road, sess(null)) === null);
  ok('a PAIRED MACHINE\'s conversation, even naming an account: nothing armed (the road\'s own fence)', end(road, sess(B, 'antigravity', { host: 'h-paired' })) === null && !road.waiting().includes(B.id));
  ok('a claude or codex conversation with an account: nothing armed (no after-turn read declared)', verdictOf(['claude', 'codex'].every((be) => end(road, { backend: be, _accountId: 'acct-' + be, _isStreaming: false }) === null)));
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
  ok('a PERSON\'s press answered turn-shaped ⇒ nothing written, the door says STOP', gateOf(pr) && pr.code === 'turn-started' && runsOf(Cc) === 1 && fs.existsSync(W.cacheFileFor(CACHE, Cc.id)) === before && verdictOf(door.stoppedWhy(Cc.id)));
  usageMode = 'reading';
  await pass_(PACE + 60e3);
  const road = mkRoad(), s = sess(Cc);
  const n0 = logs.length;
  await stretch(road, s);
  ok('…a later stretch of that account reads NOTHING: the press\'s stop holds every automatic caller, said once', runsOf(Cc) === 1 && logs.slice(n0).filter((l) => /the automatic reads stopped/.test(l)).length === 1, logs.slice(n0).join(' | '));
  const wl = await door.read(Cc.id, { wall: true });
  ok('…and a wall\'s read of it is refused the same (409 stopped); a person may still press', wl.status === 409 && wl.code === 'stopped' && (await door.read(Cc.id, { person: true })).ok === true && runsOf(Cc) === 2);
  // ⑩ ONE ROW PER VENDOR (lane usage-predict, 2026-11-16 — the owner looked at the quota row and asked «fable是antigravity吗？»):
  // Claude's row Off stops no Antigravity read; Antigravity's own row Off refuses its automatic reads (an account of its own here)
  const V0 = mkAcct('Row zero');
  setting = 'off';
  await pass_(PACE + 60e3);
  const r2 = mkRoad(), sV = sess(V0);
  const n1 = logs.length;
  await stretch(r2, sV);
  ok('law 3: Claude\'s row OFF (accounts.onDemandQuotaRefresh = off) stops NO Antigravity read — its after-turn read runs', runsOf(V0) === 1 && !logs.slice(n1).some((l) => /refresh-off/.test(l)), logs.slice(n1).join(' | '));
  setting = 'manual'; agyRow = 'off';
  await pass_(PACE + 60e3);
  const r2b = mkRoad(), sV2 = sess(V0);
  const n1b = logs.length;
  await stretch(r2b, sV2);
  ok('…the other way: Antigravity\'s own row OFF (antigravity.autoUsageReads = off) ⇒ the door refuses its after-turn read by name (auto-reads-off), nothing spawned', runsOf(V0) === 1 && verdictOf(logs.slice(n1b).some((l) => /read nothing \(auto-reads-off/.test(l))), logs.slice(n1b).join(' | '));
  agyRow = 'on';
  // THE COUNT FIRST, FAIL CLOSED (law A3 b)
  await pass_(PACE + 60e3);
  failWrites = true;
  const n2 = logs.length, k0 = today(B).total;
  await stretch(mkRoad(), sess(B));
  failWrites = false;
  ok('A3: the count\'s write FAILS ⇒ the read is refused by name (count-failed), NOTHING spawned, a log line', runsOf(B) === 1 && gateOf(logs.slice(n2).some((l) => /the read count could not be written — not read \(afterTurn\)/.test(l))) && verdictOf(logs.slice(n2).some((l) => /read nothing \(count-failed/.test(l))), logs.slice(n2).join(' | '));
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
  ok('A2: the wall clock steps 25 min forward after a read — 31 min «since» by the wall, 6 by the steady clock ⇒ NO read, said', runsOf(D) === 1 && verdictOf(logs.slice(n0).some((l) => /by the steady clock — under the 30-minute ceiling/.test(l))), logs.slice(n0).join(' | '));
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
  ok(`the ruling's arithmetic: ${DOOR.AFTER_TURN_DAY_MAX} after-turn reads already today ⇒ the next is refused (over-ruling) with a log line naming it a bug, nothing spawned`, over.code === 'over-ruling' && runsOf(M7) === 0 && verdictOf(logs.slice(n1).some((l) => /A BUG — 48 after-turn reads today already, the ruling allows 48/.test(l))), JSON.stringify(over));
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
    const mod = mutant(F, '    if (busy(key)) return null;\n    const stop =', '    const stop =');   // fire()'s check only; onTurnEnd's kept
    await pass_(PACE + 60e3);
    const road = mkRoad({}, mod), a = sess(M8), other = sess(M8);
    start(road, a); end(road, a); await pass_(60e3); other._isStreaming = true; await pass_(QUIET);
    ok('CONTROL ⑫g (S3): without the check at the moment of the read, the account is read while a turn of it runs that the road never heard start', runsOf(M8) === 1, String(runsOf(M8)));
    other._isStreaming = false;
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
    {
      // CONTROL ⑫law3: the door with the SHARED check put back (Claude's row read for every account, before the vendor's row) —
      // an Antigravity wall read under Claude's row Off is refused, the one switch for two vendors the owner could not read
      const DOORs = mutant('src/server/cli-usage-door.js', "      const h = harnessOf(be) || {};\n", "      const h = harnessOf(be) || {}; { let m0 = 'manual'; try { m0 = setting('accounts.onDemandQuotaRefresh') || 'manual'; } catch { } if (m0 === 'off') return { ok: false, status: 403, code: 'refresh-off', error: 'shared' }; }\n");
      const VC = mkAcct('Row control');
      const ds = DOORs.createCliUsageDoor({ accounts: am, harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, spawnImpl: fakeSpawn, countWriter: () => writer, mono: () => clock.m,
        cliCmds: { check: async () => '/stand-in/agy' }, agentEnv: () => ({ PATH: '/usr/bin' }), setting: (k) => (k === 'antigravity.autoUsageReads' ? 'on' : 'off'), now: () => clock.t, log: (l) => logs.push(l) });
      const rs = await ds.read(VC.id, { wall: true });
      ok('CONTROL ⑫law3: with the shared check put back, Claude\'s row Off refuses an Antigravity wall read (refresh-off) — RED as it must; the shipped door reads it (⑭)', rs.code === 'refresh-off' && runsOf(VC) === 0, JSON.stringify(rs).slice(0, 160));
    }
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
  ok('…zh and ja say both, every placeholder kept', gateOf([zh[KEY], ja[KEY]].every((s) => typeof s === 'string' && ['{n}', '{person}', '{wall}', '{after}'].every((p) => s.includes(p)))) && verdictOf([zh[NOTE], ja[NOTE]].every((s) => typeof s === 'string' && s.includes('{n}'))), JSON.stringify([zh[NOTE], ja[NOTE]]));
  const UR = read('src/usage-routes.js'), MAs = read('src/lib/manage-agents.js');
  // THE FAILED-ONLY ACCOUNT, DRIVEN (the closure check's S5): four reads that all fail, through the real door — no reading on disk,
  // the count on disk; the row /api/usage serves (homeAccountEntry, the route's own call) and the row's words
  usageMode = 'auth';
  const dF = mkDoor();
  for (let i = 0; i < 4; i++) { clock.t += 2 * 60e3; clock.m += 2 * 60e3; await dF.read(J10.id, { person: true }); }
  usageMode = 'reading';
  const readsF = DR.todayOf(DR.readDoorReads(CACHE, J10.id), clock.t), rowF = DR.homeAccountEntry(W.readCacheObject(CACHE, J10.id), readsF);
  ok('an account whose four reads all FAILED: no reading on disk, its count is (4), and /api/usage serves it a row — limits [], the count — that says «usage read 4× today»',
    !W.readCacheObject(CACHE, J10.id) && readsF.total === 4 && readsF.person === 4 && gateOf(rowF) && gateOf(Array.isArray(rowF.limits)) && rowF.limits.length === 0 && rowF.reads.total === 4 && MA.doorReadsNote(rowF.reads) === 'usage read 4× today' && verdictOf(/4 by you/.test(MA.doorReadsLine(rowF.reads))), { readsF, rowF });
  ok('…an account neither read nor counted today gets no row; one with a reading gets its limits', DR.homeAccountEntry(null, DR.todayOf(null, clock.t)) === null && DR.homeAccountEntry({ limits: [{ limitId: 'x' }], fetchedAt: 5 }, DR.todayOf(null, clock.t)).limits.length === 1);
  ok('/api/usage builds each on-demand account\'s row through that one helper (doorReads.homeAccountEntry)', gateOf(/const row = doorReads\.homeAccountEntry\(c, reads\);/.test(UR)) && verdictOf(/if \(row\) out\[a\.id\] = row;/.test(UR)));
  ok('…the roster draws the count as TEXT on the identity line (no badge, no colour), its title the split, patched at every poll', gateOf(MAs.includes('<span class="acct-key-tail">${ident}${readsNote(a.id)}</span>')) && gateOf(MAs.includes("document.querySelectorAll('.acct-reads[data-reads-key]')")) && !/acct-reads[^\n]*(badge|color)/.test(MAs));
}

console.log('⑭ ONE ROW PER VENDOR (the owner 2026-11-16: «fable是antigravity吗？») — the door asks the row of the vendor whose account it is');
{
  const tick = (ms) => { clock.t += ms; clock.m += ms; };   // the door's own 60 s pace passes; no road's wait is armed here
  const AGYH = harnesses.get('antigravity');
  const V1 = mkAcct('Row one'), V2 = mkAcct('Row two'), V3 = mkAcct('Row three'), V4 = mkAcct('Row four');
  // (a1) a vendor whose reads answer to an INSTANCE row (quota.readsRow — Claude's accounts.onDemandQuotaRefresh): its Off refuses
  //      at the door, a person's press included («Off (never contact Anthropic)» is a promise; the door is its last fence)
  const claudeRowed = { ...AGYH, label: 'A Claude-row CLI', quota: { ...AGYH.quota, readsRow: 'accounts.onDemandQuotaRefresh' } };
  const dC = mkDoor((id) => (id === 'antigravity' ? claudeRowed : harnesses.get(id)));
  setting = 'off';
  const c1 = await dC.read(V1.id, { person: true }), c2 = await dC.read(V1.id, { wall: true });
  ok('(a) an account whose vendor answers to Claude\'s row: its Off refuses at the door — a person\'s press AND an automatic read (refresh-off), nothing spawned', c1.code === 'refresh-off' && c2.code === 'refresh-off' && runsOf(V1) === 0, JSON.stringify([c1.code, c2.code]));
  setting = 'manual'; agyRow = 'off';
  const c3 = await dC.read(V1.id, { wall: true });
  ok('…law 3 the other way: Antigravity\'s row OFF stops no read of a vendor on Claude\'s row — its wall read runs', c3.ok === true && runsOf(V1) === 1, JSON.stringify(c3).slice(0, 160));
  agyRow = 'on';
  // (a2) an Antigravity account: an automatic read asks antigravity.autoUsageReads; a press asks no row
  setting = 'off';
  const g1 = await door.read(V2.id, { wall: true });
  ok('(a) an Antigravity account under Claude\'s row OFF: its wall read RUNS — Claude\'s row is not its vendor\'s (law 3)', g1.ok === true && runsOf(V2) === 1, JSON.stringify(g1).slice(0, 160));
  setting = 'manual'; agyRow = 'off'; tick(61e3);
  const g2 = await door.read(V2.id, { wall: true }), g3 = await door.read(V2.id, { afterTurn: true });
  ok('…its own row OFF: the wall read and the after-turn read are refused BY NAME (auto-reads-off, the row named), nothing spawned', g2.code === 'auto-reads-off' && g3.code === 'auto-reads-off' && runsOf(V2) === 1 && verdictOf(/antigravity\.autoUsageReads/.test(g2.error || '')), JSON.stringify([g2, g3]).slice(0, 300));
  const g4 = await door.read(V2.id, { person: true });
  ok('…and a PERSON\'s press of it READS (law 5: the ⟳ is the person\'s own act — it asks no row)', g4.ok === true && runsOf(V2) === 2, JSON.stringify(g4).slice(0, 160));
  agyRow = 'on';
  // (a3) a harness that declares an automatic read and has NO row of its own: refused BY NAME — fail closed
  const rowless = { ...AGYH, label: 'A row-less CLI', settings: undefined };
  const dN = mkDoor((id) => (id === 'antigravity' ? rowless : harnesses.get(id)));
  const n1 = await dN.read(V3.id, { wall: true }), n2 = await dN.read(V3.id, { afterTurn: true }), n3 = await dN.read(V3.id, { person: true });
  ok('(a) a harness that declares a wall / after-turn read with NO row of its own: both refused BY NAME (no-auto-reads-row) — no automatic read without a row; a press still reads', n1.code === 'no-auto-reads-row' && n2.code === 'no-auto-reads-row' && gateOf(/A row-less CLI has no row of its own/.test(n1.error || '')) && n3.ok === true && runsOf(V3) === 1, JSON.stringify([n1.code, n2.code, n3.ok]));
  // (a4) the production road: the TYPED accessor asked with the account's own harness id; an accessor that throws reads as off
  const calls = [];
  const dT = DOOR.createCliUsageDoor({ accounts: am, harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, spawnImpl: fakeSpawn, countWriter: () => writer, mono: () => clock.m,
    cliCmds: { check: async () => '/stand-in/agy' }, agentEnv: () => ({ PATH: '/usr/bin' }), setting: () => 'manual', now: () => clock.t, log: (l) => logs.push(l),
    harnessSetting: (id, k) => { calls.push(id + '.' + k); if (calls.length > 1) throw new Error('unreadable'); return 'off'; } });
  const t1 = await dT.read(V4.id, { wall: true }), t2 = await dT.read(V4.id, { afterTurn: true });
  ok('(a) the door asks harnessSetting(<the account\'s harness>, autoUsageReads): off ⇒ refused; an accessor that THROWS reads as off (fail closed)', calls.join() === 'antigravity.autoUsageReads,antigravity.autoUsageReads' && t1.code === 'auto-reads-off' && t2.code === 'auto-reads-off' && runsOf(V4) === 0, JSON.stringify({ calls, t1: t1.code, t2: t2.code }));
  // the rows themselves
  const row = (AGYH.settings.rows || []).find((r) => r.key === 'autoUsageReads');
  ok('the row: antigravity.autoUsageReads in Antigravity\'s own table — on / off, default on, a server row (the door)', AGYH.settings.prefix === 'antigravity' && !!row && row.type === 'enum' && row.default === 'on' && JSON.stringify(row.options.map((o) => o.value)) === '["on","off"]' && row.apply.kind === 'server', JSON.stringify(row));
  ok('…and Claude\'s descriptor names the row its reads answer to (quota.readsRow — the door reads it, never a literal harness id)', harnesses.get('claude').quota.readsRow === 'accounts.onDemandQuotaRefresh' && !AGYH.quota.readsRow);
  // law 3 by census: the door names neither row's key; no reader of Claude's row names Antigravity's
  const DOORSRC = read('src/server/cli-usage-door.js').replace(/\/\/[^\n]*/g, '');
  const CLAUDE_READERS = ['src/lib/usage-meter.js', 'src/lib/manage-agents.js', 'src/usage-routes.js', 'src/server/auto-cli-loop.js', 'src/server/usage-pool-engine.js'];
  ok('law 3 by census: the door\'s code names no row key (it asks the vendor\'s: quota.readsRow, or its own table\'s autoUsageReads) and none of Claude\'s readers names Antigravity\'s row', !/accounts\.onDemandQuotaRefresh/.test(DOORSRC) && gateOf(/h\.quota\.readsRow/.test(DOORSRC)) && verdictOf(CLAUDE_READERS.every((f) => !/autoUsageReads/.test(read(f)))), CLAUDE_READERS.filter((f) => /autoUsageReads/.test(read(f))));
  // law 4: the migration — THROUGH the live settings store (read / patch: src/routes/persistence.js, the one writer of settings.json)
  const MIG = require(path.join(REPO, 'src/server/migrations.js'));
  const store = (doc) => { const st = { doc: { ...doc }, patches: [] }; return { st, read: () => st.doc, patch: (q) => { st.patches.push(q); st.doc = { ...st.doc, ...q }; } }; };
  const s1 = store({ 'accounts.onDemandQuotaRefresh': 'off', 'chat.x': 1 }), r1 = MIG.agyReadsFollowClaudeOff(s1), r1b = MIG.agyReadsFollowClaudeOff(s1);
  const s2 = store({ 'accounts.onDemandQuotaRefresh': 'auto' }), r2 = MIG.agyReadsFollowClaudeOff(s2);
  const s3 = store({ 'accounts.onDemandQuotaRefresh': 'off', 'antigravity.autoUsageReads': 'on' }), r3 = MIG.agyReadsFollowClaudeOff(s3);
  const s5 = store({}), r5 = MIG.agyReadsFollowClaudeOff(s5);
  let r4 = null; try { MIG.agyReadsFollowClaudeOff(null); } catch (e) { r4 = e.message; }
  ok('law 4, the migration: Claude\'s row Off ⇒ ONE patch, antigravity.autoUsageReads = off, nothing else touched; a second run patches nothing', r1.changed === true && JSON.stringify(s1.st.patches) === '[{"antigravity.autoUsageReads":"off"}]' && s1.st.doc['chat.x'] === 1 && r1b.changed === false, JSON.stringify([r1, r1b, s1.st.patches]));
  ok('…Claude\'s row not Off (or never set) ⇒ no patch (the default on stands); a value of its own is never overwritten; no live store ⇒ it FAILS by name (the runner retries at the next boot) — the registry row asks the disk first: nothing to do there ⇒ done, quietly', !r2.changed && !s2.st.patches.length && !r5.changed && !s5.st.patches.length && !r3.changed && !s3.st.patches.length && verdictOf(/no live settings store/.test(String(r4))), JSON.stringify([r2.why, r3.why, r5.why, r4]));
  const MIGSRC = read('src/server/migrations.js'), SRV = read('server.js');
  ok('…it is a row of the instance\'s one-shot registry (run once under the ledger; its note and its report are the journal lines), handed the live settings store by server.js',
    MIG.AGY_READS_MIGRATION_ID === '2026-11-agy-reads-follow-claude-off' && gateOf(/id: AGY_READS_MIGRATION_ID,\s*\n\s*note: "ONE ROW PER VENDOR/.test(MIGSRC)) && gateOf(MIGSRC.includes("const rep = agyReadsFollowClaudeOff(st);")) && gateOf(MIGSRC.includes("if (!st && !peek('settings.json', (d) => d['accounts.onDemandQuotaRefresh'] === 'off' && d['antigravity.autoUsageReads'] === undefined))"))
    && gateOf(/usageHistory = null, settings = null,/.test(MIGSRC)) && verdictOf(SRV.includes('settings: { read: () => persistenceRouter.readSettings(), patch: (p) => persistenceRouter.patchSettings(p) }')));
}

console.log('⑮ THE SPLIT\'S TWO LAWS (主开发\'s bounded check U1 + U2, 2026-11-16) — what a press reads is said; an Off the person chose survives a dropped key');
{
  const tick = (ms) => { clock.t += ms; clock.m += ms; };
  const HCS = require(path.join(REPO, 'src/server/harness-config-sync.js'));
  const MIG = require(path.join(REPO, 'src/server/migrations.js'));
  const HSP = require.resolve(path.join(REPO, 'src/harness-settings.js'));
  const KEY = 'antigravity.autoUsageReads', CLAUDE = 'accounts.onDemandQuotaRefresh';
  // a door over a settings DOCUMENT, read as the hub reads it: serverSetting = the raw stored value (server.js), harnessSetting =
  // the typed accessor over it (harness-config-sync accessorsFor); `typed: false` = the door's own fallback (no accessor handed)
  const docDoor = (getDoc, { doorMod = DOOR, hcs = HCS, typed = true } = {}) => {
    const serverSetting = (k) => (getDoc() || {})[k];
    const { harnessSetting } = hcs.accessorsFor({ serverSetting, harnesses });
    return doorMod.createCliUsageDoor({ accounts: am, harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, spawnImpl: fakeSpawn, countWriter: () => writer, mono: () => clock.m,
      cliCmds: { check: async (be, o) => (be === 'antigravity' && o && o.force === true ? '/stand-in/agy' : null) },
      agentEnv: () => ({ PATH: '/usr/bin' }), setting: serverSetting, ...(typed ? { harnessSetting } : {}), now: () => clock.t, log: (l) => logs.push(l) });
  };
  const store = (doc) => { const st = { doc: { ...doc } }; return { st, read: () => st.doc, patch: (q) => { st.doc = { ...st.doc, ...q }; } }; };
  const countOf = (acct, c) => DR.todayOf(DR.readDoorReads(CACHE, acct.id), clock.t)[c];
  const brief = (x) => JSON.stringify(x, (k, v) => (k === 'error' && typeof v === 'string' ? v.slice(0, 120) : v)).slice(0, 420);

  // ── U1: A CHANGE OF WHAT IS READ IS SAID, AND PINNED. Before the split, a Re-check on an Antigravity account under the shared
  //    row's Off was REFUSED (403 refresh-off); after it, the press READS — the new row governs the automatic reads only
  const s1 = store({ [CLAUDE]: 'off' }); MIG.agyReadsFollowClaudeOff(s1);
  const press = async (acct, doorMod = DOOR) => {
    const d = docDoor(() => s1.st.doc, { doorMod }); const r0 = runsOf(acct), p0 = countOf(acct, 'person');
    const a1 = await d.read(acct.id, { person: true }), a2 = await d.read(acct.id, { person: true });
    tick(61e3); const a3 = await d.read(acct.id, { wall: true });
    return { a1, a2, a3, runs: runsOf(acct) - r0, counted: countOf(acct, 'person') - p0 };
  };
  const law1 = (x) => x.a1.ok === true && x.a2.code === 'throttled' && x.a3.code === 'auto-reads-off' && x.runs === 1 && x.counted === 1;
  const p1 = await press(mkAcct('Press one'));
  ok('U1: an instance migrated from the shared row\'s Off (Claude\'s row Off, antigravity.autoUsageReads = off): a person\'s Re-check on an Antigravity account READS — once (one spawn), counted (today\'s person count +1), paced as any press (a second press in the minute: 429 throttled); the row still refuses the wall read',
    s1.st.doc[KEY] === 'off' && verdictOf(law1(p1)), brief(p1));
  const DOORF = 'src/server/cli-usage-door.js';
  const pm1 = await press(mkAcct('Press two'), mutant(DOORF, "} else if (caller !== 'person') {", '} else {'));
  const pm2 = await press(mkAcct('Press three'), mutant(DOORF, "if (h.quota && typeof h.quota.readsRow === 'string') {\n        let mode = 'manual'; try { mode = setting(h.quota.readsRow) || 'manual'; } catch { }",
    "if (true) {\n        let mode = 'manual'; try { mode = setting('accounts.onDemandQuotaRefresh') || 'manual'; } catch { }"));
  ok('RED (U1): the door whose row governs a press too ⇒ the press is refused (auto-reads-off); the door of the old law (Claude\'s row for every vendor) ⇒ refused (refresh-off) — nothing spawned, nothing counted',
    !law1(pm1) && pm1.a1.code === 'auto-reads-off' && pm1.runs === 0 && pm1.counted === 0 && !law1(pm2) && pm2.a1.code === 'refresh-off' && pm2.runs === 0 && pm2.counted === 0, brief([pm1.a1, pm2.a1]));
  // the words say it: the door's and the after-turn module's header comments, and the three changelogs
  const DOORSRC_ALL = read(DOORF), ATRSRC = read('src/server/after-turn-read.js');
  const CL = ['CHANGELOG.md', 'CHANGELOG.zh.md', 'CHANGELOG.ja.md'].map((f) => { const s = read(f); const i = s.indexOf('\n## 2.369.412'); const j = s.indexOf('\n## ', i + 5); return i < 0 ? '' : s.slice(i, j < 0 ? undefined : j); });
  ok('U1 said: the door\'s header says a Re-check on an Antigravity account READS while Claude\'s row is Off and was refused before the split (403 refresh-off), and that Claude declares no on-demand reading (the readsRow branch a fence); the after-turn header names the vendor\'s own row; no header promises «never under accounts.onDemandQuotaRefresh = off»',
    gateOf(/a Re-check on an Antigravity\n\/\/ account READS while Claude's row is Off — once, counted, paced as any press; before the split that press was refused\n\/\/ \(403 refresh-off\)/.test(DOORSRC_ALL)) && gateOf(/Claude declares no\n\/\/ on-demand reading today, so that branch is a fence for a later one/.test(DOORSRC_ALL))
      && gateOf(/the vendor's own row antigravity\.autoUsageReads — Off refuses\n\/\/ this read and the wall's, never a person's Re-check/.test(ATRSRC)) && ![DOORSRC_ALL, ATRSRC].some((s) => /never under `accounts\.onDemandQuotaRefresh = off`|`accounts\.onDemandQuotaRefresh = off`, the judge/.test(s)));
  ok('U1 said to the person: each of the three changelogs\' 2.369.412 sections says, in the screen\'s words, that Re-check on an Antigravity account now reads even while Claude usage refresh is Off, which refused it before',
    gateOf(/Re-check on an Antigravity account now reads its usage even while Claude usage refresh is Off \(that press was refused before\)/.test(CL[0])) && gateOf(/Antigravity 账号的「重新检查」现在即使在 Claude 用量刷新为「关闭」时也会读取用量（以前这一按会被拒绝）/.test(CL[1]))
      && verdictOf(/Antigravity アカウントの「再チェック」は、Claude の使用量の更新が「オフ」でも読み取ります（以前は拒否されていました）/.test(CL[2])), JSON.stringify(CL.map((s) => s.length)));

  // ── U2: AN OFF THE PERSON CHOSE SURVIVES EVERY ROAD THAT CAN DROP A KEY — the rule holds at the READ
  const reads = async (acct, getDoc, o = {}) => {
    const d = docDoor(getDoc, o); const r0 = runsOf(acct);
    const w = await d.read(acct.id, { wall: true }); tick(61e3); const t = await d.read(acct.id, { afterTurn: true }); tick(61e3);
    return { w, t, runs: runsOf(acct) - r0 };
  };
  const law2 = (x) => x.w.code === 'auto-reads-off' && x.t.code === 'auto-reads-off' && x.runs === 0 && /holds no value of its own, and accounts\.onDemandQuotaRefresh is off/.test(x.w.error);
  // readRow without its follow (src/harness-settings.js) — the door and the typed accessor compiled over it; the cache restored after
  const withoutFollow = async (fn) => {
    const keep = require.cache[HSP].exports;
    require.cache[HSP].exports = mutant('src/harness-settings.js', 'if (raw === null || raw === undefined) { const u = unsetValue(row, read);', 'if (false) { const u = unsetValue(row, read);');
    try { return await fn({ doorMod: mutant(DOORF, "require('../harness-settings.js')", "require('../harness-settings.js')"), hcs: mutant('src/server/harness-config-sync.js', "require('../harness-settings')", "require('../harness-settings')") }); }
    finally { require.cache[HSP].exports = keep; }
  };
  // (a) the key erased after the migration — a tab open from before the restart saves its whole settings, this row not among them
  const s2 = store({ [CLAUDE]: 'off', 'chat.x': 1 }); MIG.agyReadsFollowClaudeOff(s2);
  const tabSave = { ...s2.st.doc }; delete tabSave[KEY]; s2.st.doc = tabSave;
  const e1 = await reads(mkAcct('Erased one'), () => s2.st.doc), e2 = await reads(mkAcct('Erased two'), () => s2.st.doc, { typed: false });
  ok('U2 (a): the key ERASED after the migration with Claude\'s Off stored (a tab from before the restart saved its whole settings): the wall read and the after-turn read are refused — through the typed accessor and through the door\'s own fallback — and the refusal says the row holds no value and follows Claude\'s Off',
    !(KEY in s2.st.doc) && s2.st.doc[CLAUDE] === 'off' && gateOf(law2(e1)) && verdictOf(law2(e2)), brief([e1.w, e2.t]));
  const em = await withoutFollow((o) => reads(mkAcct('Erased three'), () => s2.st.doc, o));
  ok('RED (U2 a): readRow without its follow ⇒ the erased key reads as the default «Automatically» — the wall read and the after-turn read RUN', em.w.ok === true && em.t.ok === true && em.runs === 2, brief(em));
  // (b) the import of a config exported before the split — the real settings store (src/routes/persistence.js) and its import route
  const PDIR = path.join(ROOT, 'persist'); fs.mkdirSync(PDIR, { recursive: true });
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  P.setup({ dataDir: PDIR, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
  const route = (method, p) => P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]).route.stack[0].handle;
  P.router.patchSettings({ [CLAUDE]: 'off' });
  const migr = MIG.agyReadsFollowClaudeOff({ read: () => P.router.readSettings(), patch: (q) => P.router.patchSettings(q) });
  const wasOff = P.router.readSettings()[KEY];
  let impCode = 200, impOut = null; const res = { headersSent: false, status(c) { impCode = c; return res; }, json(o) { impOut = o; return res; }, setHeader() { } };
  route('post', '/api/config/import')({ headers: {}, query: {}, body: { file: { app: 'vibespace-config', sections: { settings: { [CLAUDE]: 'off', 'chat.x': 2 } } }, sections: ['settings'] } }, res);
  const afterImp = P.router.readSettings();
  const i1 = await reads(mkAcct('Import one'), () => P.router.readSettings());
  ok('U2 (b): the import of a config exported before the split replaces the settings whole — the row\'s Off is gone from the file, Claude\'s Off came back with the import — and the wall read and the after-turn read are refused',
    migr.changed === true && wasOff === 'off' && impCode === 200 && !(KEY in afterImp) && afterImp[CLAUDE] === 'off' && afterImp['chat.x'] === 2 && verdictOf(law2(i1)), brief({ impCode, impOut, i1 }));
  const im = await withoutFollow((o) => reads(mkAcct('Import two'), () => P.router.readSettings(), o));
  ok('RED (U2 b): readRow without its follow ⇒ after the import both automatic reads RUN', im.w.ok === true && im.t.ok === true && im.runs === 2, brief(im));
  // (c) a person who chose «Automatically» by hand keeps it: the settings store (src/lib/settings.js — what the Settings window
  //     saves) keeps this row's default as a VALUE (storeDefault), so the hub tells the person's own On from an absent key
  const keepLS = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem() { } };
  const { pathToFileURL } = await import('node:url');
  const esm = async (pairs) => {
    let src = read('src/lib/settings.js');
    for (const [a, b] of [["from './settings-schema.js'", `from '${pathToFileURL(path.join(REPO, 'src/lib/settings-schema.js')).href}'`], ["from '../harness-settings.js'", `from '${pathToFileURL(path.join(REPO, 'src/harness-settings.js')).href}'`], ...pairs]) {
      if (!src.includes(a)) throw new Error(`esm mutant: src/lib/settings.js no longer holds ${JSON.stringify(a.slice(0, 60))}`);
      src = src.split(a).join(b);
    }
    return (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).SettingsManager;
  };
  const pick = async (SM) => {
    const sm = new SM(); sm._values = { [CLAUDE]: 'off', [KEY]: 'off' };   // as loaded after the migration
    const seen = []; sm.on(KEY, (v) => seen.push(v));
    sm.set(KEY, 'on'); clearTimeout(sm._saveTimer); sm._saveTimer = null;
    const saved = sm.toJSON(); const r = await reads(mkAcct('Pick ' + (++pickN)), () => saved);
    const fresh = new SM(); fresh._values = { [CLAUDE]: 'off' };   // a row nobody set: the window shows what the hub reads
    const shownUnset = fresh.get(KEY); const redraw = []; fresh.on(KEY, (v, was) => redraw.push([was, v]));
    fresh.set(CLAUDE, 'manual'); clearTimeout(fresh._saveTimer); fresh._saveTimer = null;
    return { saved: saved[KEY], shown: sm.get(KEY), seen, wall: r.w.ok === true, after: r.t.ok === true, runs: r.runs, shownUnset, shownUnsetAfter: fresh.get(KEY), redraw };
  };
  let pickN = 0;
  const SM0 = (await import(path.join(REPO, 'src/lib/settings.js'))).SettingsManager;
  const k1 = await pick(SM0);
  const law2c = (x) => x.saved === 'on' && x.shown === 'on' && x.wall && x.after && x.runs === 2;
  ok('U2 (c): a person who picks «Automatically» by hand while Claude\'s row is Off keeps it — the store keeps \'on\' as a value (storeDefault), the window shows it, the hub reads on: the wall read and the after-turn read RUN',
    gateOf(law2c(k1)) && JSON.stringify(k1.seen) === '["on"]', brief(k1));
  ok('…and a row nobody set shows what the hub reads: Claude\'s Off ⇒ «Only when I press Re-check»; Claude\'s row turned to Manual ⇒ the row redraws to «Automatically» (its follower notified)',
    k1.shownUnset === 'off' && k1.shownUnsetAfter === 'on' && JSON.stringify(k1.redraw) === '[["off","on"]]', brief(k1));
  const km = await pick(await esm([['(!schema.storeDefault && JSON.stringify(value)', '(JSON.stringify(value)']]));
  ok('RED (U2 c): the store without storeDefault drops the person\'s own «Automatically» as «the default» ⇒ the key is absent, it follows Claude\'s Off, and both automatic reads are refused — the person\'s choice lost',
    !law2c(km) && km.saved === undefined && km.shown === 'off' && !km.wall && !km.after && km.runs === 0, brief(km));
  const kg = await pick(await esm([['const u = schema.unsetFollows ? unsetValue(schema, (p) => this.get(p)) : undefined;', 'const u = undefined;']]));
  ok('RED (U2 c, the window): get() without the follow shows «Automatically» for a row nobody set under Claude\'s Off — a row that says what is not read', kg.shownUnset === 'on' && kg.redraw.length === 0, brief(kg));
  globalThis.localStorage = keepLS;
  // the rule's declaration: a row with unsetFollows must keep its default as a value — checkTable refuses it otherwise, by name
  const HS = require(HSP); const AGYT = harnesses.get('antigravity').settings;
  const rowU = AGYT.rows.find((r) => r.key === 'autoUsageReads');
  const errsOf = (rows) => HS.checkTable({ ...AGYT, rows }).filter((e) => /storeDefault|unsetFollows/.test(e));
  ok('…the row declares both (storeDefault, unsetFollows → Claude\'s row Off ⇒ off), and checkTable refuses an unsetFollows without storeDefault — by name',
    rowU.storeDefault === true && JSON.stringify(rowU.unsetFollows) === JSON.stringify({ setting: CLAUDE, when: 'off', value: 'off' }) && errsOf(AGYT.rows).length === 0
      && verdictOf(errsOf(AGYT.rows.map((r) => (r === rowU ? { ...r, storeDefault: undefined } : r))).some((e) => /needs storeDefault: true/.test(e))), JSON.stringify(errsOf(AGYT.rows.map((r) => (r === rowU ? { ...r, storeDefault: undefined } : r)))));
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
