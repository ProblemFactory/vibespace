#!/usr/bin/env node
// THE TURN'S LIFE, JUDGED (lane turn-never-silent, law L1 — the owner: «agy 动不动就卡住再也不动»): the PURE verdict
// src/turn-liveness.js over every harness's `liveness` row (src/backend-caps.js). In-process, no hub, no CLI, no clock:
// every fact is handed in. RED on 2.369.402 (c167240f2): the module and the rows do not exist.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const MOD = path.join(REPO, 'src/turn-liveness.js');
if (!fs.existsSync(MOD)) { console.error('  ✗ src/turn-liveness.js exists (the verdict of law L1)'); console.log('\n0 passed, 1 failed'); process.exit(1); }
const L = require(MOD);
const { BACKEND_CAPS, capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const MIN = 60 * 1000;

console.log('— ① PURE: the verdict imports nothing');
{
  const src = fs.readFileSync(MOD, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/\brequire\s*\(/.test(src) && !/^\s*import\b/m.test(src), 'src/turn-liveness.js requires / imports nothing');
}

console.log('— ② every harness row declares its witness (a closed vocabulary)');
{
  for (const [id, row] of Object.entries(BACKEND_CAPS)) {
    ok(L.rowProblem(row.liveness, row.turnState) === null, `${id}: a lawful liveness row`, L.rowProblem(row.liveness, row.turnState) || '');
  }
  ok(capsOf('shell').liveness === L.NO_TURN, "shell declares 'no-turn' (a terminal has no turn)");
  ok(capsOf('antigravity').liveness.stop === 'restart' && capsOf('claude').liveness.stop === 'interrupt', 'agy RESTARTS on Stop; claude is interrupted (the CLI keeps running)');
  ok(Object.values(BACKEND_CAPS).every((r) => r.liveness === L.NO_TURN || r.liveness.working === 'tree-below-cli'), "every harness with a turn reads the processes BELOW its CLI — none reads the CLI's own counters");
  ok(capsOf('gemini').liveness === null, 'an unknown backend reads undeclared (null), never a borrowed row');
  const good = { wrote: 'wrapper-stamp', working: 'tree-below-cli', openTool: 'tool-card', stop: 'restart' };
  const bad = [
    [undefined, 'authoritative', 'declares no liveness row'],
    [{ ...good, stop: undefined }, 'authoritative', "'stop' is undefined"],
    [(() => { const r = { ...good }; delete r.openTool; return r; })(), 'authoritative', "no 'openTool'"],
    [{ ...good, selfBytes: 16384 }, 'authoritative', "an unknown key 'selfBytes'"],
    [{ ...good, working: 'cli-own-cpu' }, 'authoritative', "'working' is \"cli-own-cpu\""],
    [L.NO_TURN, 'authoritative', "declares 'no-turn' but its turnState"],
    [good, null, "has no turn (turnState null) but does not declare 'no-turn'"],
  ];
  for (const [row, ts, want] of bad) {
    const why = L.rowProblem(row, ts);
    ok(typeof why === 'string' && why.includes(want), `a row that is wrong is said: «${want}»`, String(why));
  }
}

console.log('— ③ the bound is a setting (minutes), clamped');
{
  ok(L.boundMsOf() === 10 * MIN && L.DEFAULT_BOUND_MIN === 10, 'default ten minutes');
  ok(L.boundMsOf(15) === 15 * MIN && L.boundMsOf('30') === 30 * MIN, 'a number or a numeric string');
  ok(L.boundMsOf(1) === 2 * MIN && L.boundMsOf(0) === 2 * MIN && L.boundMsOf(-5) === 2 * MIN, 'never under two minutes');
  ok(L.boundMsOf(99999) === 24 * 60 * MIN, 'never over a day');
  ok([null, NaN, 'abc', '', {}, Infinity].every((v) => L.boundMsOf(v) === 10 * MIN), 'anything else is the default');
}

console.log('— ④ /proc/<pid>/stat and /proc/<pid>/io, parsed');
{
  const f = (comm) => `4242 (${comm}) S 17 4242 4242 0 -1 4194304 100 0 0 0 31 9 0 0 20 0 1 0 987654 1000 100 18446744073709551615`;
  const p = L.parseStat(f('node (x) y'));
  ok(p && p.pid === 4242 && p.comm === 'node (x) y' && p.ppid === 17 && p.ticks === 40 && p.startTicks === 987654 && p.state === 'S', 'a command name holding spaces and parentheses (fields read after the LAST «)»)', JSON.stringify(p));
  ok(L.parseStat('4242 (x) S 1 2') === null && L.parseStat(null) === null && L.parseStat('garbage') === null, 'a short or broken line is null, never zeros');
  try {
    const self = L.parseStat(fs.readFileSync('/proc/self/stat', 'utf8'));
    ok(self && self.pid === process.pid && self.ppid === process.ppid && self.startTicks > 0, "this process's own stat (the kernel's real shape)", JSON.stringify(self));
  } catch { ok(true, 'no /proc here (the reader says «no-procfs»)'); }
  const io = L.parseIo('rchar: 12345\nwchar: 678\nsyscr: 9\nsyscw: 1\nread_bytes: 0\nwrite_bytes: 0\ncancelled_write_bytes: 0\n');
  ok(io && io.rchar === 12345 && io.wchar === 678, 'rchar + wchar', JSON.stringify(io));
  ok(L.parseIo('rchar: 5\n') === null && L.parseIo('') === null && L.parseIo(undefined) === null, 'an unreadable or partial io file is null, never 0');
}

console.log('— ⑤ work = counters that MOVE below the CLI (never a process that merely exists)');
{
  const R = (at, list, cut) => L.readingOf(at, list, cut);
  const a = { pid: 100, startTicks: 5, ticks: 10, io: { rchar: 1000, wchar: 10 } };
  ok(L.treeWorked(null, R(1, [a])) === null, 'no earlier reading: not known (null), never «still»');
  ok(L.treeWorked(R(1, [a]), R(2, [a])) === false, 'the same process, the same counters: still');
  ok(L.treeWorked(R(1, [a]), R(2, [{ ...a, ticks: 11 }])) === true, 'one CPU tick more: working');
  ok(L.treeWorked(R(1, [a]), R(2, [{ ...a, io: { rchar: 1001, wchar: 10 } }])) === true, 'one byte read more: working (a download waits on the network with no CPU)');
  ok(L.treeWorked(R(1, [a]), R(2, [{ ...a, io: { rchar: 1000, wchar: 11 } }])) === true, 'one byte written more: working');
  ok(L.treeWorked(R(1, [a]), R(2, [{ ...a, io: null }])) === false, 'an io file unreadable on one side, the ticks unchanged: still (no invented bytes)');
  ok(L.treeWorked(R(1, [a]), R(2, [a, { pid: 101, startTicks: 6, ticks: 0 }])) === true, 'a process born: working');
  ok(L.treeWorked(R(1, [a, { pid: 101, startTicks: 6, ticks: 0 }]), R(2, [a])) === true, 'a process ended: working');
  ok(L.treeWorked(R(1, [a]), R(2, [{ ...a, startTicks: 9 }])) === true, 'a reused pid with another birth is another process: working');
  ok(L.treeWorked(R(1, [a], true), R(2, [a], true)) === true && L.treeWorked(R(1, [a]), R(2, [a], true)) === true, 'a CUT reading (over TREE_MAX processes) is never «still»');
  ok(L.treeWorked(R(1, []), R(2, [])) === false, 'nothing below the CLI on either side: still');
  ok(L.TREE_MAX === 256 && L.READ_EVERY_MS === 60000, 'at most 256 processes a reading, a reading a minute');
}

console.log('— ⑥ THE VERDICT, state by state');
{
  const T0 = 1_800_000_000_000, B = 10 * MIN;
  const row = capsOf('antigravity').liveness;
  const base = { row, streaming: true, waitingOnUser: false, openedAt: T0, lastWroteAt: T0 + MIN, keptAt: 0, treeReadable: true, readings: 12, workSeenAt: 0, openTool: { name: 'run_command', since: T0 + MIN }, cliAlive: true, boundMs: B };
  const v = (o) => L.livenessVerdict({ ...base, ...o });
  const at = (m) => T0 + MIN + m * MIN;
  let x = v({ now: at(11) });
  ok(x.state === 'stuck-on-command' && x.tool === 'run_command' && x.cliAlive === true && x.since === T0 + MIN && x.quietMs === 11 * MIN && x.stillSince === T0 + MIN, 'a command open, nothing written, nothing working, 11 min: «stuck on a command», naming the tool', JSON.stringify(x));
  x = v({ now: at(11), openTool: null });
  ok(x.state === 'silent' && x.tool === null, 'no tool step open, nothing written, nothing working: «silent»', JSON.stringify(x));
  ok(v({ now: at(9) }).state === 'none' && v({ now: at(9) }).why === 'not-yet', 'nine minutes: nothing yet');
  ok(v({ now: at(10) }).state === 'stuck-on-command', 'at the bound exactly: judged');
  ok(v({ now: at(600), streaming: false }).state === 'none', 'no turn: nothing, however long');
  x = v({ now: at(600), waitingOnUser: true });
  ok(x.state === 'none' && x.why === 'asks-the-person', 'a turn that waits on the PERSON (the chip\'s fact) is never stuck, after ten hours either', JSON.stringify(x));
  ok(v({ now: at(30), workSeenAt: at(25) }).state === 'busy', 'nothing written for 30 min, a process below worked 5 min ago: «busy» (nothing said)');
  x = v({ now: at(36), workSeenAt: at(25) });
  ok(x.state === 'stuck-on-command' && x.stillSince === at(25) && x.since === T0 + MIN, 'the last work 11 min ago: stuck — still since the last work, quiet since the last line', JSON.stringify(x));
  ok(v({ now: at(11), lastWroteAt: at(5) }).state === 'none', 'a line 6 min ago resets the clock');
  ok(v({ now: at(11), lastWroteAt: 0, openedAt: at(4) }).state === 'none' && v({ now: at(15), lastWroteAt: 0, openedAt: at(4) }).state === 'stuck-on-command', 'a turn opened after the last line counts from its opening');
  x = v({ now: at(60), keptAt: at(55) });
  ok(x.state === 'none' && x.why === 'not-yet', '«Keep waiting» 5 min ago: not judged again yet (the person\'s word restarts the bound)', JSON.stringify(x));
  ok(v({ now: at(66), keptAt: at(55) }).state === 'stuck-on-command', '…and another FULL bound with nothing after it: judged again');
  ok(v({ now: at(66), keptAt: at(55), workSeenAt: at(60) }).state === 'busy', '…unless something worked after the press');
  x = v({ now: at(11), readings: 1 });
  ok(x.state === 'none' && x.why === 'reading', 'one reading only (a hub just started): not judged until the second', JSON.stringify(x));
  ok(v({ now: at(11), readings: 2 }).state === 'stuck-on-command', 'the second reading (about a minute after a restart) judges a turn whose last line is older than the bound');
  x = v({ now: at(11), treeReadable: false });
  ok(x.state === 'unknown' && x.why === 'no-procfs', 'the processes cannot be read here (a paired machine): «unknown», never «stuck», never silent', JSON.stringify(x));
  x = v({ now: at(11), row: null });
  ok(x.state === 'unknown' && x.why === 'undeclared', 'a harness whose row declares nothing: «unknown»', JSON.stringify(x));
  ok(v({ now: at(11), row: L.NO_TURN }).state === 'none', "a 'no-turn' row: nothing to judge");
  ok(v({ now: at(11), lastWroteAt: 0, openedAt: 0 }).why === 'no-clock', 'no clock at all: nothing is invented');
  x = v({ now: at(11), cliAlive: false });
  ok(x.state === 'stuck-on-command' && x.cliAlive === false, 'the CLI gone while the turn is open: said as gone');
  ok(L.SPEAKING.includes('stuck-on-command') && L.SPEAKING.includes('silent') && !L.SPEAKING.includes('busy') && !L.SPEAKING.includes('none'), 'what speaks: stuck on a command, silent, unknown — never busy');
}

console.log('— ⑦ THE MEASURED TURN (2026-11-12, this box: one child at 0 ticks for 27 min; agy itself 22–58 ticks/min)');
{
  // the watch's own loop in small: a reading a minute of the processes BELOW agy (agy's own counters are not in it)
  const T0 = 1_800_000_000_000, B = 10 * MIN;
  const child = { pid: 3705300, startTicks: 182000, ticks: 0, io: { rchar: 4096, wchar: 0 } };
  const run = (worked) => {
    let prev = null, workSeenAt = 0, n = 0, first = null;
    for (let m = 0; m <= 27; m++) {
      const now = T0 + m * MIN, cur = L.readingOf(now, [child]);
      n++; if (worked(prev, cur)) workSeenAt = now; prev = cur;
      const x = L.livenessVerdict({ row: capsOf('antigravity').liveness, streaming: true, openedAt: T0, lastWroteAt: T0, treeReadable: true, readings: n, workSeenAt, openTool: { name: 'run_command', since: T0 }, cliAlive: true, boundMs: B, now });
      if (x.state !== 'none' && !first) first = { m, state: x.state };
    }
    return first;
  };
  const real = run(L.treeWorked);
  ok(real && real.state === 'stuck-on-command' && real.m === 10, 'the measured shape is «stuck on a command» at minute 10', JSON.stringify(real));
  // RED CONTROL: round 3's witness («a child born in the turn exists = life») reads the same turn as alive for ever
  const round3 = run((p, c) => c.procs.size > 0);
  ok(round3 && round3.state === 'busy', "CONTROL: «a child exists» as the witness reads the stuck turn «busy» — this leg kills round 3's witness", JSON.stringify(round3));
  // the limit, said in the kb: a tree that keeps working (a browser left open) is «busy» for as long as it works
  let ticks = 0, prev = null, workSeenAt = 0, last = null;
  for (let m = 0; m <= 120; m++) {
    const now = T0 + m * MIN, cur = L.readingOf(now, [{ ...child, ticks: (ticks += 30) }]);
    if (L.treeWorked(prev, cur)) workSeenAt = now; prev = cur;
    last = L.livenessVerdict({ row: capsOf('antigravity').liveness, streaming: true, openedAt: T0, lastWroteAt: T0, treeReadable: true, readings: m + 1, workSeenAt, openTool: { name: 'run_command', since: T0 }, cliAlive: true, boundMs: B, now });
  }
  ok(last.state === 'busy', 'a child that keeps using CPU for two hours: «busy» the whole time (L2 does not speak; the held by-itself ending is the step for it)');
}

console.log('— ⑧ THE BY-ITSELF ENDING (the owner\'s «可以», 03:02Z): only «stuck on a command» for the second bound is due');
{
  ok(L.endBoundMsOf() === 30 * MIN && L.DEFAULT_END_MIN === 30, 'default thirty minutes');
  ok(L.endBoundMsOf('off') === null && L.endBoundMsOf(false) === null, "'off' = never ended by itself");
  ok(L.endBoundMsOf(5, 10 * MIN) === 10 * MIN, 'never before the turn was told (clamped up to the told bound)');
  ok(L.endBoundMsOf(45) === 45 * MIN && L.endBoundMsOf('60') === 60 * MIN && L.endBoundMsOf(99999) === 24 * 60 * MIN, 'a number, a numeric string, at most a day');
  ok(['abc', null, NaN, {}].every((x) => L.endBoundMsOf(x) === 30 * MIN), 'anything else is the default');
  const T0 = 1_800_000_000_000, B = 10 * MIN, E = 30 * MIN;
  const base = { row: capsOf('antigravity').liveness, streaming: true, openedAt: T0, lastWroteAt: T0, treeReadable: true, readings: 40, workSeenAt: 0, openTool: { name: 'run_command', since: T0 }, cliAlive: true, boundMs: B, endBoundMs: E };
  const v = (o) => L.livenessVerdict({ ...base, ...o });
  const at = (m) => T0 + m * MIN;
  ok(v({ now: at(10) }).state === 'stuck-on-command' && v({ now: at(10) }).endDue === false, 'told at ten minutes, not ended');
  ok(v({ now: at(29) }).endDue === false && v({ now: at(30) }).endDue === true, 'due at thirty minutes exactly, not at twenty-nine');
  ok(v({ now: at(30), endBoundMs: undefined }).endDue === true, 'the default bound when none is handed in is thirty');
  ok(v({ now: at(600), endBoundMs: null }).endDue === false, "'off': never due, after ten hours either");
  let x = v({ now: at(30), keptAt: at(29) });
  ok(x.state === 'none' && x.endDue === false, '«Keep waiting» at minute 29: not due at 30', JSON.stringify(x));
  ok(v({ now: at(39), keptAt: at(29) }).state === 'stuck-on-command' && v({ now: at(39), keptAt: at(29) }).endDue === false, '…told again at 39 (another full bound), not ended');
  ok(v({ now: at(58), keptAt: at(29) }).endDue === false && v({ now: at(59), keptAt: at(29) }).endDue === true, '…due only at 59 — the press restarts the thirty');
  ok(v({ now: at(600), openTool: null }).state === 'silent' && v({ now: at(600), openTool: null }).endDue === false, '«silent» (no tool step open) is NEVER ended by itself');
  ok(v({ now: at(120), workSeenAt: at(119) }).state === 'busy' && v({ now: at(120), workSeenAt: at(119) }).endDue === false, 'a command that is WORKING is never due (two hours, worked a minute ago)');
  ok(v({ now: at(45), workSeenAt: at(20) }).endDue === false && v({ now: at(50), workSeenAt: at(20) }).endDue === true, 'the thirty counts from the LAST work below the CLI');
  ok(v({ now: at(600), waitingOnUser: true }).endDue === false && v({ now: at(600), treeReadable: false }).endDue === false && v({ now: at(600), row: null }).endDue === false, 'asking the person, unreadable processes, an undeclared row: never due');
  // RED CONTROL: an ending judged on the WRITTEN silence alone (no work witness) ends the busy child of ⑦'s limit
  const child = { pid: 3705300, startTicks: 182000, ticks: 0 };
  let prev = null, workSeenAt = 0, real = false, mutant = false;
  for (let m = 0; m <= 120; m++) {
    const now = at(m), cur = L.readingOf(now, [{ ...child, ticks: m * 30 }]);
    if (L.treeWorked(prev, cur)) workSeenAt = now; prev = cur;
    const f = { ...base, readings: m + 1, workSeenAt, now };
    if (L.livenessVerdict(f).endDue) real = true;
    if (f.openTool && now - Math.max(f.lastWroteAt, f.openedAt, f.keptAt || 0) >= E) mutant = true;
  }
  ok(real === false && mutant === true, 'CONTROL: a mutant that ends on the written silence alone ends a WORKING command; the verdict never does');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
