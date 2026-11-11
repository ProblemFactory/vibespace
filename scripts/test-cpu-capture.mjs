#!/usr/bin/env node
// test-cpu-capture — lane hub-loop-stalls commit 3: THE SATURATED LOOP NAMES ITS TOP FUNCTIONS (FAST, PURE + the book's
// doors with fakes; the live legs are test-cpu-capture-live). Each leg is red on commit 1 by itself (no src/cpu-capture.js,
// no capture in src/server/loop-holds.js), and two MUTANTS of the pure module are red by name:
//   ① THE TABLE from a RECORDED V8 profile (scripts/fixtures/cpu-capture/recorded-v8.cpuprofile): self time by function
//      summed over its call paths, a built-in's time (JSON.parse) on its JavaScript caller, a node_modules package grouped
//      with the install's function it ran through, Node's internals grouped, paths relative to the install, (idle) /
//      (garbage collector) / (program) classed, every share of the whole window
//   ② THE BLOCK: ≤ 15 lines, each «[cpu-profile] …»; rows under 3 % not listed and counted; rows cut to fit; «(anonymous)
//      file:line»; the native-caller note, the floor, the asks' cost, the halved rate, an early stop, the file
//   ③ IDLE IS NEVER WORK: the kernel state classes a tick before any ask (tickOf); a 10 %-busy capture's ticks →
//      profileOf → aggregate say 10 % work and 90 % idle — MUTANT «idle counted as work» red by name
//   ④ THE .cpuprofile of a capture: call paths, hit counts, time deltas, the «sampled every 50 ms» header, the node cap
//   ⑤ THE TRIGGER: the levels, the hold rate, the switch, the debugger, the heap, the interval (a door's capture too),
//      the day — MUTANT «the interval removed» red by name
//   ⑥ THE COLLECTOR from the record (gcSplit), the files (names, the newest 10), a REAL sample answer parsed (rawFramesOf)
//   ⑦ THE BOOK (src/server/loop-holds.js with fakes): refusals by name at the press, the door ignores the switch, ONE
//      block + ONE telemetry row + report().capture, a failure said ONCE, the trigger's one capture per interval, the
//      switch off ⇒ nothing automatic while the door works
//   ⑧ THE ROUTES: owner only (a bearer 403), the door answers the table, 409 / 503 by name; a kept file by its NAME only
// Run: node scripts/test-cpu-capture.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const C = require(path.join(REPO, 'src/cpu-capture.js'));
const LH = require(path.join(REPO, 'src/loop-hold.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1200) : '')); } };
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cpu-capture-'));
/** a MUTANT of the pure module: one text swap, loaded from a scratch copy (its own require of loop-hold.js made absolute) */
function mutant(from, to) {
  const src = fs.readFileSync(path.join(REPO, 'src/cpu-capture.js'), 'utf8');
  if (!src.includes(from)) throw new Error('mutant anchor missing: ' + from.slice(0, 60));
  const p = path.join(TMP, `mut-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(p, src.replace(from, to).replace("require('./loop-hold.js')", `require(${JSON.stringify(path.join(REPO, 'src/loop-hold.js'))})`));
  return require(p);
}

try {
// ── ① THE TABLE from a recorded V8 profile ─────────────────────────────────────────────────────────────────────────
console.log('① the table, read off a RECORDED V8 profile');
const REC = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/cpu-capture/recorded-v8.cpuprofile'), 'utf8'));
const A = C.aggregate(REC, { root: '/srv/vibespace' });
const row = (fn) => A.rows.find((r) => r.fn === fn);
const hits = (fn, url) => REC.nodes.filter((n) => n.callFrame.functionName === fn && n.callFrame.url.endsWith(url)).reduce((a, n) => a + n.hitCount, 0);
// THE PROFILE'S OWN TIME, computed here apart (as DevTools does): a sample lasts until the next one, the last until endTime
const recTs = []; { let t = REC.startTime; for (const d of REC.timeDeltas) { t += d; recTs.push(t); } }
const recDur = (i) => ((i + 1 < recTs.length ? recTs[i + 1] : REC.endTime) - recTs[i]);
const recWin = recTs.reduce((a, _, i) => a + recDur(i), 0);
const timeOf = (pred) => REC.samples.reduce((a, id, i) => a + (pred(REC.nodes.find((n) => n.id === id)) ? recDur(i) : 0), 0) / recWin;
ok(REC.nodes.filter((n) => n.callFrame.functionName === 'busyLoop').length === 2 && row('busyLoop') && A.rows[0].fn === 'busyLoop' && row('busyLoop').loc === 'src/app.js:3' && row('busyLoop').functions === 1,
  'a function on TWO call paths is ONE row, summed (busyLoop — the profile\'s own two nodes), first, at its own line', A.rows.slice(0, 3));
const busyT = timeOf((n) => n.callFrame.functionName === 'busyLoop');
ok(near(row('busyLoop').share, busyT, 1e-9), `its share is the profile's own number: ${(100 * row('busyLoop').share).toFixed(1)} % = the time of its ${hits('busyLoop', 'src/app.js')} samples of ${REC.samples.length} (each lasts until the next — not their count, ${(100 * hits('busyLoop', 'src/app.js') / REC.samples.length).toFixed(1)} %)`);
ok(row('jsonCaller') && row('jsonCaller').share > 0.2 && !A.rows.some((r) => /parse/i.test(r.fn)), 'time inside a native call (JSON.parse) is on its JavaScript caller (jsonCaller) — no row of its own', row('jsonCaller'));
const pkg = A.rows.find((r) => r.kind === 'package');
ok(pkg && pkg.fn === 'fakepkg' && pkg.loc === 'node_modules/fakepkg' && /all through usesPkg · src\/app\.js:5$/.test(C.rowWords(pkg)), `a node_modules package is ONE row with the install's function it ran through: «${pkg && C.rowWords(pkg).trim()}»`);
const nint = A.rows.find((r) => r.kind === 'internals');
ok(nint && nint.fn === 'Node.js internals' && /node:/.test(nint.loc) && nint.functions >= 2, `Node's internals are ONE row, its modules named: «${nint && C.rowWords(nint).trim()}»`);
ok(A.rows.every((r) => !r.loc.includes('/srv/vibespace') && !r.loc.startsWith('/') && !/^file:/.test(r.loc)) && A.rows.some((r) => r.loc.startsWith('src/')), 'every path is relative to the install (no root, no file://)');
ok(near(A.share.idle, timeOf((n) => n.callFrame.functionName === '(idle)'), 1e-9) && near(A.share.gc, timeOf((n) => n.callFrame.functionName === '(garbage collector)'), 1e-9) && A.share.gc > 0.03 && A.share.idle > 0.2, `(idle) and (garbage collector) are classed, never work: idle ${(100 * A.share.idle).toFixed(1)} %, the collector ${(100 * A.share.gc).toFixed(1)} %`);
ok(near(Object.values(A.share).reduce((a, b) => a + b, 0), 1, 1e-9) && near(A.share.js, A.rows.reduce((a, r) => a + r.share, 0), 1e-9), 'the shares are of the WHOLE window (they sum to 100 %), the rows sum to the JavaScript share');
ok(near(A.totalMs, recWin / 1000, 1e-6), `the window is the profile's own (${A.totalMs.toFixed(0)} ms: its first sample to its end)`);

// ── ② THE BLOCK ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② the block — at most 15 lines');
const synth = (fns, extra = {}) => {   // a profile: fns [{name, url, line, n}] each a leaf under (root), + special leaves
  const nodes = [{ id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1, columnNumber: -1, scriptId: '0' }, hitCount: 0, children: [] }];
  const samples = [];
  const add = (cf, n) => { const id = nodes.length + 1; nodes.push({ id, callFrame: { scriptId: '1', columnNumber: 0, ...cf }, hitCount: n, children: [] }); nodes[0].children.push(id); for (let i = 0; i < n; i++) samples.push(id); };
  for (const f of fns) add({ functionName: f.name, url: f.url, lineNumber: f.line - 1 }, f.n);
  for (const [name, n] of Object.entries(extra)) add({ functionName: name, url: '', lineNumber: -1 }, n);
  return { nodes, startTime: 0, endTime: samples.length * 50000, samples, timeDeltas: samples.map(() => 50000) };
};
const many = synth(Array.from({ length: 30 }, (_, i) => ({ name: 'f' + i, url: `src/m${i}.js`, line: 10 + i, n: 13 })), { '(idle)': 10 });
const AM = C.aggregate(many);
const lines = C.blockLines({ cause: 'lag', causeWords: C.causeWords('lag', { lag: { level: 1, medianMs: 520 } }), agg: AM, windowMs: AM.totalMs, everyMs: 50, costMs: 180, gc: C.gcSplit([{ at: 100, ms: 40, kind: 1 }], 0, AM.totalMs), file: '2026-11-11T05-00-00-000Z-auto.cpuprofile' });
ok(lines.length === 15 && lines.every((l) => l.startsWith('[cpu-profile] ')), `30 functions over the floor: the block is 15 lines, every one «[cpu-profile] …» (${lines.length})`, lines);
ok(/JavaScript not listed: 20 more rows/.test(lines.join('\n')) && lines.filter((l) => / · f\d+ · src\/m\d+\.js:\d+$/.test(l)).length === 10, 'the rows are cut to fit and the rest are counted in the split line', lines);
ok(/^\[cpu-profile\] the loop is degraded — the lag watch's level 1 \(median lag 520 ms over 3 min\) — the main thread for \d+\.\d s, 400 samples every 50 ms: where its time went, by function \(self time\)$/.test(lines[0]), `the head: the cause, the window, the samples: «${lines[0]}»`);
const tail = lines.slice(-4);
ok(/^\[cpu-profile\]   the split: JavaScript \d+\.\d % · on the CPU outside JavaScript \d+\.\d % · idle \d+\.\d % \(asleep in its own loop\)/.test(tail[0]) && /^\[cpu-profile\]   GC: \d+\.\d % of the window \(scavenge \d+\.\d %\) — the collector's own record/.test(tail[1]) &&
  tail[2] === '[cpu-profile]   time inside native calls is counted on the JavaScript caller; functions under 3 % are not listed' && /400 samples, the asks themselves took 180 ms of the main thread \(0\.9 %\); kept as data\/cpu-profiles\/2026-11-11T05-00-00-000Z-auto\.cpuprofile$/.test(tail[3]),
  'the split, the collector from its record, the two notes, the asks\' cost and the file', tail);
const few = C.aggregate(synth([{ name: 'hot', url: 'src/a.js', line: 7, n: 300 }, { name: '', url: 'src/b.js', line: 12, n: 60 }, { name: 'cold', url: 'src/c.js', line: 3, n: 8 }], { '(idle)': 32 }));
const fl = C.blockLines({ cause: 'door', agg: few, windowMs: few.totalMs, everyMs: 50, finalEveryMs: 100, halved: { askMs: 6.24, everyMs: 100 }, stopped: 'cost', costMs: 401, gc: { split: false, why: 'the collector’s record could not be read here' } });
ok(fl.some((l) => / · hot · src\/a\.js:7$/.test(l)) && fl.some((l) => / 15\.0 % · \(anonymous\) · src\/b\.js:12$/.test(l)) && !fl.some((l) => / · cold · /.test(l)) && /JavaScript not listed: 1 more row, 2\.0 % together/.test(fl.join('\n')),
  'a function it cannot name is «(anonymous) · file:line»; a 2 % function is not listed and counted', fl);
ok(/the rate halved to every 100 ms — an ask took 6\.24 ms of the main thread \(the bound 4 ms\)/.test(fl.join('\n')) && /it stopped early at \d+\.\d s: the asks had taken their bound of the main thread/.test(fl.join('\n')) && /GC not split — the collector’s record could not be read here/.test(fl.join('\n')) && /^\[cpu-profile\] captured on request/.test(fl[0]),
  'a halved rate, an early stop and «GC not split» are said', fl);

// ── ③ IDLE IS NEVER WORK ──────────────────────────────────────────────────────────────────────────────────────────
console.log('③ idle is never work');
const fresh = 550;
ok(C.tickOf({ state: 'asleep', wchan: 'ep_poll', sys: '232 0x3 0x7ffd 0x400 0xffffffff 0x0 0x0 0x7ffd 0x7f', beatAgeMs: 100, freshMs: fresh, mine: true }) === 'idle' &&
  C.tickOf({ state: 'asleep', wchan: 'ep_poll', sys: '232 0x3', beatAgeMs: 100, freshMs: fresh }) === 'idle', 'asleep in its own loop\'s poll with the beat fresh ⇒ idle — never asked, never booked on an ask in flight');
ok(C.tickOf({ state: 'asleep', wchan: 'ep_poll', sys: '232 0x9', beatAgeMs: 900, freshMs: fresh }) === 'ask' && C.tickOf({ state: 'asleep', wchan: 'do_sys_poll', sys: '7 0x1', beatAgeMs: 100, freshMs: fresh }) === 'ask' &&
  C.tickOf({ state: 'running', wchan: '0', sys: 'running', beatAgeMs: 100, freshMs: fresh }) === 'ask' && C.tickOf({ state: 'running', sys: 'running', mine: true }) === 'booked' && C.tickOf({ state: 'running', sys: 'running', other: true }) === 'unsampled' &&
  C.tickOf({ state: 'running', sys: 'running', holdOpen: true, mine: true }) === 'held' && C.tickOf({ state: 'stopped', wchan: 'do_signal_stop' }) === 'stopped',
  'an epoll wait with the beat stale (a synchronous child\'s loop), any other wait, the CPU ⇒ asked (on its JavaScript caller); one in flight ⇒ booked; a hold open ⇒ held; stopped ⇒ not running');
const tenPct = (CM) => {   // 400 ticks: one in ten a stack in tenBusy, nine in ten idle
  const ticks = []; for (let i = 0; i < 400; i++) ticks.push({ t: i * 50, k: i % 10 === 0 ? 0 : 'idle' });
  const prof = CM.profileOf({ ticks, stacks: [[0, 1]], frames: [{ functionName: 'tenBusy', url: 'src/ten.js', lineNumber: 4, columnNumber: -1 }, { functionName: 'onTimer', url: 'src/ten.js', lineNumber: 1, columnNumber: -1 }], startedM: 0, endedM: 20000, everyMs: 50 });
  const a = CM.aggregate(prof), top = a.rows[0];
  return { a, ok: near(a.share.js, 0.1, 0.005) && near(a.share.idle, 0.9, 0.005) && top && top.fn === 'tenBusy' && near(top.share, 0.1, 0.005) };
};
const T10 = tenPct(C);
ok(T10.ok, `a capture busy one tick in ten: work ${(100 * T10.a.share.js).toFixed(1)} %, idle ${(100 * T10.a.share.idle).toFixed(1)} %, tenBusy ${(100 * T10.a.rows[0].share).toFixed(1)} % — never that callback at 100 %`);
const MIDLE = mutant("[N.idle, 'idle']", "[N.idle, 'js']");
const TM = (() => { try { return tenPct(MIDLE); } catch (e) { return { ok: false, err: e.message }; } })();
ok(!TM.ok, `MUTANT «idle counted as work» (the (idle) node classed as JavaScript) is RED by name: work ${TM.a ? (100 * TM.a.share.js).toFixed(1) : '?'} % — ${TM.a ? 'not 10 %' : TM.err}`);
const MTICK = mutant("if (s !== 'running' && w === 'ep_poll' && beatAgeMs <= freshMs) return 'idle';", '');
ok(MTICK.tickOf({ state: 'asleep', wchan: 'ep_poll', sys: '232 0x3', beatAgeMs: 100, freshMs: fresh, mine: true }) !== 'idle', 'MUTANT «the kernel state not read first» (tickOf without its idle rule) is RED by name: an idle tick is booked on the ask in flight');

// ── ④ THE .cpuprofile of a capture ─────────────────────────────────────────────────────────────────────────────────
console.log('④ the .cpuprofile of a capture');
const frames = [{ functionName: 'leafA', url: 'src/a.js', lineNumber: 9, columnNumber: -1 }, { functionName: 'mid', url: 'src/m.js', lineNumber: 1, columnNumber: -1 }, { functionName: 'leafB', url: 'src/b.js', lineNumber: 4, columnNumber: -1 }, { functionName: '', url: '', lineNumber: -1, columnNumber: -1 }];
const ticks = [{ t: 0, k: 0 }, { t: 50, k: 1 }, { t: 100, k: 0 }, { t: 150, k: 'idle' }, { t: 200, k: 'native' }, { t: 250, k: 'held' }, { t: 300, k: 2 }, { t: 350, k: 'unsampled' }];
const P = C.profileOf({ ticks, stacks: [[0, 1], [2, 1], [3, 0, 1]], frames, startedM: 0, endedM: 400, everyMs: 50 });
const nodeOf = (fn) => P.nodes.filter((n) => n.callFrame.functionName === fn);
ok(nodeOf('mid').length === 1 && nodeOf('leafA').length === 1 && nodeOf('leafA')[0].hitCount === 2 && nodeOf('mid')[0].children.length === 2 && P.samples.length === 8 && P.timeDeltas.every((d, i) => d === (i ? 50000 : 0)),
  'call paths share their nodes (mid under (root), leafA and leafB under it), hit counts, samples, time deltas in µs');
ok(P.$vibespace && P.$vibespace.sampledEveryMs === 50 && /^sampled every 50 ms on average \(each interval drawn between 25 and 75 ms\) from the watchdog thread, no V8 profiler/.test(P.$vibespace.how) && ['(idle)', '(program)', '(held a second or more)', '(not sampled)'].every((n) => nodeOf(n).length === 1),
  'its header says it was sampled every 50 ms (each interval drawn between 25 and 75 ms); idle / outside JavaScript / held / not sampled are their own nodes');
const PA = C.aggregate(P);
// THE TIME OF A SYNC FS CALL ON THE CALL (the owner's .393 boot capture: «12.4 % · Node.js internals … — 72 % through hr ·
// src/server/loop-blame.js:51», read as the instrument's cost): a sample answered at the wrapper's first line after a call
// that slept is booked «asleep in <the call>» (the watchdog read the call from the live slot at its post) under its caller
{ const ROOT = '/srv/hub', at = (fn, f, line) => ({ fn, file: f.startsWith('node:') ? f : `${ROOT}/${f}`, line, encl: line, evalish: false });
  const owner = [at('hrtimeBigInt', 'node:internal/bootstrap/node', 436), at('hr', 'src/server/loop-blame.js', 51), at('wrapped', 'src/server/loop-blame.js', 58), at('_loadArchive', 'src/jobs.js', 291), at('listOnTimeout', 'node:internal/timers', 594)];
  const asWorker = (raw, sync) => { const t = typeof LH.instrumentTrim === 'function' ? LH.instrumentTrim(raw, ROOT) : raw; return t !== raw && sync && LH.SYNC_FS_URL ? [{ fn: sync, file: LH.SYNC_FS_URL, line: 0, encl: 0, evalish: false }, ...t] : t; };
  const tableOf = (raw) => { const fr = raw.map((x) => C.callFrameOf(LH.frameOf(x, ROOT, () => true, null, () => true), x)); const tk = [...Array(10)].map((_, i) => ({ t: i * 50, k: 0 }));
    return C.aggregate(C.profileOf({ ticks: tk, stacks: [fr.map((_, i) => i)], frames: fr, startedM: 0, endedM: 500, everyMs: 50 }), { root: ROOT }); };
  const wA = C.rowWords(tableOf(asWorker(owner, 'readFileSync')).rows[0]).trim(), wB = C.rowWords(tableOf(owner).rows[0]).trim();
  ok(/· asleep in readFileSync — all through _loadArchive · src\/jobs\.js:291$/.test(wA) && !/loop-blame/.test(wA) && /through hr · src\/server\/loop-blame\.js:51$/.test(wB),
    `a sample asleep in a wrapped readFileSync is booked on the call: «${wA}» — the CONTROL, the frames as they came: «${wB}»`, { wA, wB });
  const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
  ok(/sync: asker && asker\.kind === 'capture' \? syncNow\(\) : null/.test(WK) && /const t = LH\.instrumentTrim\(r\.frames, rootDir\);/.test(WK) && /\{ fn: sync, file: LH\.SYNC_FS_URL/.test(WK) && /stackOf\(c, q\.text, q\.sync\)/.test(WK),
    'the watchdog: a capture ask reads the live slot\'s call at its post (syncNow), and its answer\'s stack drops the instrument\'s frames and names that call'); }
ok(near(PA.share.js, 4 / 8) && PA.rows.find((r) => r.fn === 'leafA').share === 3 / 8 && near(PA.share.held, 1 / 8) && near(PA.share.idle, 1 / 8), 'a built-in leaf (no script) books its tick on its caller (leafA 3 of 8); the classes keep their shares', PA.rows);
const capped = C.profileOf({ ticks: Array.from({ length: 50 }, (_, i) => ({ t: i * 50, k: i })), stacks: Array.from({ length: 50 }, (_, i) => [i]), frames: Array.from({ length: 50 }, (_, i) => ({ functionName: 'g' + i, url: 'src/g.js', lineNumber: i, columnNumber: -1 })), startedM: 0, everyMs: 50, nodesMax: 20 });
ok(capped.nodes.length === 21 && capped.nodes.some((n) => n.callFrame.functionName === '(past the node cap)') && capped.samples.length === 50, `the node cap (here 20): the rest of the paths are ONE «(past the node cap)» node, no sample dropped (${capped.nodes.length} nodes)`);

// ── ⑤ THE TRIGGER ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ the trigger — one verdict');
const now = Date.parse('2026-11-11T06:00:00Z'), on = { known: true, on: true };
const V = (o, CM = C) => CM.triggerVerdict({ now, sampling: on, ...o });
ok(V({}).why === 'healthy' && V({ lag: { level: 0, medianMs: 120 } }).go === false && V({ lag: { level: 1, medianMs: 520 } }).go === true && V({ lag: { level: 1 } }).cause === 'lag' && V({ lag: { level: 2 } }).go === true,
  'the lag watch\'s level 1 or 2 ⇒ a capture; level 0 ⇒ none');
ok(V({ holdsRecent: 5 }).cause === 'holds' && V({ holdsRecent: 4 }).go === false && C.HOLDS_RATE.n === 5 && C.HOLDS_RATE.windowMs === 600000, 'the hold watchdog\'s holds: 5 in the last 10 min ⇒ a capture, 4 ⇒ none');
ok(V({ lag: { level: 1 }, sampling: { known: true, on: false } }).why === 'off' && V({ lag: { level: 1 }, sampling: { known: false } }).why === 'unknown' && V({ lag: { level: 1 }, debuggerOpen: true }).why === 'debugger' &&
  V({ lag: { level: 1 }, sampling: { ...on, debugger: true } }).why === 'debugger' && V({ lag: { level: 1 }, heapHigh: true }).why === 'heap' && V({ lag: { level: 1 }, running: true }).why === 'running',
  'the switch off, the setting unknown, a debugger port open, the heap near its limit, one running ⇒ none, each by name');
const ago = (min, auto = true) => ({ at: now - min * 60000, auto });
const iv = V({ lag: { level: 1 }, captures: [ago(10)] });
ok(iv.go === false && iv.why === 'interval' && iv.nextAt === now + 20 * 60000 && V({ lag: { level: 1 }, captures: [ago(10, false)] }).why === 'interval' && V({ lag: { level: 1 }, captures: [ago(31)] }).go === true,
  'one capture per 30 min — a door\'s capture counts too; 31 min later a capture again');
ok(V({ lag: { level: 1 }, captures: [ago(40), ago(80), ago(120), ago(300), ago(600), ago(900)] }).why === 'day' && V({ lag: { level: 1 }, captures: [ago(40, false), ago(80), ago(120), ago(300), ago(600), ago(900)] }).go === true &&
  V({ lag: { level: 1 }, captures: [ago(1500), ago(1600), ago(1700), ago(1800), ago(1900), ago(2000)] }).go === true, 'six automatic captures in a rolling day, at most (the door\'s are not counted there)');
const MIV = mutant('if (last != null && now - last < intervalMs) return', 'if (false) return');
ok(MIV.triggerVerdict({ now, sampling: on, lag: { level: 1 }, captures: [ago(10)] }).go === true, 'MUTANT «the interval removed» is RED by name: a second capture 10 min after the first');

// ── ⑥ THE COLLECTOR, THE FILES, A REAL ANSWER ──────────────────────────────────────────────────────────────────────
console.log('⑥ the collector from its record, the files, a real sample answer');
const g = C.gcSplit([{ at: -50, ms: 100, kind: 1 }, { at: 500, ms: 200, kind: 4 }, { at: 950, ms: 100, kind: 1 }, { at: 2000, ms: 5, kind: 1 }], 0, 1000);
ok(g.split && near(g.ms, 50 + 200 + 50, 1e-9) && near(g.share, 0.3) && near(g.by.scavenge, 100) && near(g.by['mark-compact'], 200) && /^GC: 30\.0 % of the window \(mark-compact 20\.0 %, scavenge 10\.0 %\)/.test(C.gcWords(g)),
  `the record's entries clipped to the window, by kind: «${C.gcWords(g)}»`);
ok(C.gcSplit(null, 0, 1000, 'why').split === false && C.gcWords(C.gcSplit(null, 0, 1000, 'why')) === 'GC not split — why', 'no record ⇒ «GC not split — why», never a guess');
const fname = C.fileName(Date.parse('2026-11-11T05:42:01.123Z'), true);
ok(fname === '2026-11-11T05-42-01-123Z-auto.cpuprofile' && C.fileOf(fname).at === Date.parse('2026-11-11T05:42:01.123Z') && C.fileOf(fname).auto && C.fileOf('../x.cpuprofile') === null && C.fileOf('a/2026-11-11T05-42-01-123Z-door.cpuprofile') === null,
  'a capture\'s file name carries its start and its road; anything else is no file of ours (no path)');
const names = [...Array.from({ length: 13 }, (_, i) => C.fileName(now - i * 3600000, i % 2 === 0)), 'notes.txt', '.tmp'];
const kf = C.keptFiles(names);
ok(kf.keep.length === 10 && kf.drop.length === 3 && kf.keep[0].at === now && kf.drop.every((d) => d.at < kf.keep[9].at) && ![...kf.keep, ...kf.drop].some((f) => /notes|tmp/.test(f.name)), 'the newest 10 kept, the 3 oldest removed, nothing else in the directory touched');
let answer = null;
globalThis[LH.HOOK_KEY] = { dbg: () => false, note: (out) => { answer = out; }, now: () => 0, z: new Int32Array(2), b: new Int32Array(8) };
function realCaller() { return (0, eval)(LH.SAMPLE_EXPR); }   // eslint-disable-line no-eval
realCaller();
delete globalThis[LH.HOOK_KEY];
const RF = C.rawFramesOf(answer);
ok(RF.form === 'calls' && RF.frames.some((f) => f.fn === 'realCaller' && f.file.endsWith('scripts/test-cpu-capture.mjs') && f.line > 0 && f.encl > 0), 'a REAL sample answer (SAMPLE_EXPR evaluated here) parses to raw frames — the caller by name, file, line and its own line', RF.frames.slice(0, 2));
ok(C.rawFramesOf('D').form === 'debugger' && C.rawFramesOf('A').form === 'accessor' && C.rawFramesOf('C').frames.length === 0 && C.rawFramesOf('Cjunk').frames.length === 0, 'a stand-down, an accessor, an empty or damaged answer: no frame invented');
const cf = C.callFrameOf(LH.frameOf({ fn: 'x', file: '/opt/elsewhere/y.js', line: 3, encl: 2 }, '/srv/vibespace'), { fn: 'x', file: '/opt/elsewhere/y.js', line: 3, encl: 2 });
ok(cf.url === C.OUTSIDE_URL && cf.functionName === '' && C.callFrameOf(LH.frameOf({ fn: 'loadAll', file: '/srv/vibespace/src/s.js', line: 40, encl: 31 }, '/srv/vibespace'), { line: 40, encl: 31 }).lineNumber === 30,
  'a frame outside the install keeps no path and no name; an install frame its own line (0-based)');

// ── ⑦ THE BOOK with fakes ─────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ the book — the doors, the block, the row, said once');
const LHS = require(path.join(REPO, 'src/server/loop-holds.js'));
const mk = (o = {}) => {
  const said = [], recs = [], asked = [];
  let st = { known: true, on: true, debugger: false, heapHigh: false, watchdog: true, ...(o.st || {}) };
  const b = LHS.create({ log: { warn: (l) => said.push(l) }, record: (e) => recs.push(e), samplingState: () => st, askCapture: (m) => asked.push(m), autoCapture: false, captureMs: 1000,
    heap: () => ({ heapUsed: o.heapUsed || 10, heapLimit: 100, external: 0 }), heapFill: () => ({ used: 1, limit: 100, high: false }), lagNow: () => o.lag || null, ...(o.opts || {}) });
  return { b, said, recs, asked, set: (x) => { st = { ...st, ...x }; } };
};
const fakeResult = (m, over = {}) => ({ id: m.id, auto: m.auto, cause: m.cause, startedM: 0, endedM: 1000, startedAt: Date.now() - 1000, endedAt: Date.now(), windowMs: 1000, everyMs: 50, finalEveryMs: 50, costMs: 12, asks: 18,
  agg: { samples: 20, totalMs: 1000, share: { js: 0.8, native: 0.05, idle: 0.15, gc: 0, held: 0, stopped: 0, unsampled: 0 }, listed: [{ kind: 'fn', key: 'fn:a', fn: 'hotFn', loc: 'src/hot.js:12', share: 0.8, functions: 1 }], under: { rows: 0, share: 0 }, floor: 0.03 }, file: '2026-11-11T06-00-00-000Z-door.cpuprofile', ...over });
{
  const f = mk();
  const r = f.b.startCapture({ auto: false });
  ok(r.ok && f.asked.length === 1 && f.asked[0].ev === undefined && f.asked[0].auto === false && f.asked[0].ms === 1000 && f.asked[0].everyMs === 50, 'the door: ONE capture asked of the watchdog thread (window and rate stated)', f.asked);
  ok(f.b.startCapture({ auto: false }).error === 'capture_running', 'a second press while one runs is refused by name');
  const last = f.b.onCaptured(fakeResult(f.asked[0]));
  ok(f.said.length === 1 && f.said[0].split('\n').length <= 15 && f.said[0].split('\n').every((l) => l.startsWith('[cpu-profile] ')) && /80\.0 % · hotFn · src\/hot\.js:12/.test(f.said[0]), 'its result: ONE journal write — the block, ≤ 15 lines', f.said);
  ok(f.recs.length === 1 && f.recs[0].name === 'srv-cpu-profile' && f.recs[0].value === 85 && /^door · 80\.0 % · hotFn · src\/hot\.js:12$/.test(f.recs[0].detail), 'ONE telemetry row: the window\'s work share and its top function', f.recs);
  const rc = f.b.report().capture;
  ok(last && rc.last && rc.last.rows[0].fn === 'hotFn' && rc.last.lines.length === f.said[0].split('\n').length && rc.files[0] === '2026-11-11T06-00-00-000Z-door.cpuprofile' && rc.law.everyMs === 50 && rc.law.intervalMs === 1800000,
    'report().capture (the Diagnostics report, the incident bundle): the last capture, its lines, the kept files, the law', rc);
  ok(f.b.onCaptured(fakeResult(f.asked[0])) === null && f.said.length === 1, 'a second answer for the same capture says nothing twice');
}
{
  const f = mk({ st: { on: false } });
  ok(f.b.startCapture({ auto: true, cause: 'lag' }).error === 'sampling_off' && f.b.startCapture({ auto: false }).ok === true, 'the switch off: no automatic capture — the door still works');
  const g2 = mk({ st: { known: false } });
  ok(g2.b.startCapture({ auto: true, cause: 'lag' }).error === 'setting_unknown' && g2.b.startCapture({ auto: false }).ok, 'the setting not read yet: no automatic capture; the door works');
  const d = mk({ opts: { debuggerNow: () => true } });
  ok(d.b.startCapture({ auto: false }).error === 'debugger_attached' && d.asked.length === 0, 'a debugger port open AT THE PRESS ⇒ refused by name, nothing asked');
  const h = mk({ heapUsed: 90 });
  ok(h.b.startCapture({ auto: false }).error === 'heap_near_limit' && h.asked.length === 0, 'the heap near its limit ⇒ refused by name');
  const w = mk({ st: { watchdog: false } });
  ok(w.b.startCapture({ auto: false }).error === 'no_watchdog', 'no watchdog thread ⇒ refused by name');
}
{
  const f = mk({ lag: { level: 1, medianMs: 640, at: Date.now() } });
  f.b.checkTrigger();
  ok(f.asked.length === 1 && f.asked[0].auto === true && f.asked[0].cause === 'lag', 'the trigger: the lag watch at level 1 ⇒ ONE automatic capture', f.asked);
  f.b.onCaptured(fakeResult(f.asked[0]));
  f.b.checkTrigger(); f.b.checkTrigger();
  ok(f.asked.length === 1 && f.b.report().capture.verdict.why === 'interval' && /the loop is degraded — the lag watch's level 1 \(median lag 640 ms over 3 min\)/.test(f.said[0]), 'a second trigger inside the interval captures nothing (the verdict says «interval»)', f.b.report().capture.verdict);
  const r = mk({ lag: { level: 1, medianMs: 640, at: Date.now() } });
  r.b.checkTrigger(); r.b.onCaptured({ id: r.asked[0].id, refused: 'heap', auto: true });
  r.b.checkTrigger(); r.b.onCaptured({ id: r.asked[1].id, refused: 'heap', auto: true });
  r.set({ heapHigh: true }); r.b.checkTrigger(); r.b.checkTrigger();
  ok(r.said.length === 1 && /^\[cpu-profile\] a CPU capture was due \(the loop is degraded — the lag watch's level 1 \(median lag 640 ms over 3 min\)\) and did not run — the server’s memory is near its limit/.test(r.said[0]) && r.asked.length === 2,
    'a due capture that did not run is said ONCE (the watchdog\'s refusal twice, the verdict\'s twice: one line)', r.said);
  const off = mk({ lag: { level: 2, medianMs: 900, at: Date.now() }, st: { on: false } });
  off.b.checkTrigger(); off.b.checkTrigger();
  ok(off.asked.length === 0 && off.said.length === 0 && off.b.report().capture.verdict.why === 'off' && off.b.startCapture({ auto: false }).ok, 'the switch off: the trigger captures nothing and says nothing; the door works');
  const old = mk({ lag: { level: 1, medianMs: 640, at: Date.now() - 120000 } });
  old.b.checkTrigger();
  ok(old.asked.length === 0, 'a lag reading a minute old is no reading');
  const hz = mk({ opts: { holdsRate: { n: 2, windowMs: 600000 } } });
  hz.b.onHold({ ms: 1500, fromM: 1 }); hz.b.checkTrigger();
  ok(hz.asked.length === 0, 'one hold (the rate here 2) ⇒ none');
  hz.b.onHold({ ms: 1200, fromM: 2 }); hz.b.checkTrigger();
  ok(hz.asked.length === 1 && hz.asked[0].cause === 'holds', 'the hold watchdog\'s holds past their rate ⇒ ONE capture (cause «holds»)', hz.asked);
}

// ── ⑧ THE ROUTES ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑧ the routes — the owner\'s cookie only');
{
  const routes = {}; const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } };
  const dir = path.join(TMP, 'cpu-profiles'); fs.mkdirSync(dir, { recursive: true });
  const kept = '2026-11-11T06-00-00-000Z-door.cpuprofile'; fs.writeFileSync(path.join(dir, kept), '{"nodes":[]}'); fs.writeFileSync(path.join(TMP, 'secret.json'), '{"no":1}');
  const f = mk({ opts: { profileDir: dir } }); f.b.register(app);
  const res = () => { const r = { code: 200, headers: {}, body: null, chunks: [], headersSent: false }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; r.headersSent = true; r.done && r.done(); return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.write = (c) => { r.chunks.push(String(c)); return true; }; r.end = (c) => { if (c) r.chunks.push(String(c)); r.headersSent = true; r.done && r.done(); }; r.on = () => r; r.once = () => r; r.emit = () => true; r.removeListener = () => r; return r; };
  const bearer = { headers: { authorization: 'Bearer vsst_' + 'x'.repeat(24) } }, owner = { headers: {} };
  const rb = res(); routes['POST /api/loop-holds/capture'](bearer, rb);
  ok(rb.code === 403 && f.asked.length === 0, 'the door with an agent\'s bearer ⇒ 403, nothing asked', rb);
  const ro = res(); const answered = new Promise((r) => { ro.done = r; }); routes['POST /api/loop-holds/capture'](owner, ro);
  const r2 = res(); routes['POST /api/loop-holds/capture'](owner, r2);
  ok(f.asked.length === 1 && r2.code === 409 && r2.body.error === 'capture_running', 'the owner\'s press asks ONE capture; a second press ⇒ 409 «capture_running»', r2.body);
  f.b.onCaptured(fakeResult(f.asked[0])); await answered;
  ok(ro.code === 200 && ro.body.ok && ro.body.capture.rows[0].fn === 'hotFn' && ro.body.capture.lines.length >= 5, 'the door ANSWERS THE TABLE when the capture ends', ro.body);
  const d = mk({ opts: { profileDir: dir, debuggerNow: () => true } }); const appD = { get() {}, post: (p, h) => { if (p === '/api/loop-holds/capture') appD.h = h; } }; d.b.register(appD);
  const rd = res(); appD.h(owner, rd);
  ok(rd.code === 503 && rd.body.error === 'debugger_attached', 'a refusal ⇒ 503 by name', rd.body);
  const get = (name, req = owner) => new Promise((resolve) => { const r = res(); r.done = () => resolve(r); const pipeTo = r; routes['GET /api/loop-holds/cpu-profiles/:name']({ ...req, params: { name } }, Object.assign(pipeTo, { write: (c) => { r.chunks.push(String(c)); return true; } })); setTimeout(() => resolve(r), 500); });
  const g1 = await get(kept);
  ok(g1.code === 200 && g1.headers['content-disposition'] === require(path.join(REPO, 'src/file-disposition.js')).contentDisposition(kept, 'attachment') && g1.headers['content-disposition'].startsWith(`attachment; filename="${kept}"`) && g1.chunks.join('') === '{"nodes":[]}', 'a kept file downloads by its name, as an attachment — the header is contentDisposition()\'s (THE one spelling)', { code: g1.code, h: g1.headers, body: g1.chunks.join('') });
  const g2 = await get('../secret.json'), g3 = await get('2026-11-11T06-00-01-000Z-door.cpuprofile'), g4 = await get(kept, bearer);
  ok(g2.code === 404 && !g2.chunks.join('').includes('"no"') && g3.code === 404 && g4.code === 403, 'a path or another name ⇒ 404 (nothing outside the directory is read); a bearer ⇒ 403');
}
} finally { fs.rmSync(TMP, { recursive: true, force: true }); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
