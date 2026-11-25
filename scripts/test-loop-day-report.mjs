#!/usr/bin/env node
// test-loop-day-report — lane hub-loop-stalls «loop-day-report» (the owner's measurement release, 2026-11-16): the main
// loop's hour in ONE journal line (PURE src/loop-day-report.js) and its ORCH half (src/server/loop-day-report.js). FAST:
//   ① a fixed hour of synthetic holds, census, memory and sizes ⇒ a fixed line (the exact text);
//   ② the line's SHAPE is stable and NAMES NOTHING: every field in its order (LINE_RE); a hold whose frame carries a path
//      under a data directory, an account or a conversation's name prints a code location or a fixed verdict, never them;
//   ③ the verdict words are the hold book's own (src/loop-hold.js V);
//   ④ the ORCH: holds folded as they come (one entry per cause — never a walk over rows), the cut swaps the hour FIRST,
//      the counts are taken, an unanswered census prints «?»; the exit line; the day fold; the 24 kept;
//   ⑤ THE REPORT HOLDS NOTHING: a real cut (the real process table read) makes ZERO synchronous fs calls;
//   ⑥ the processes by kind (kindOf) and the hot paths' counts are wired where they leave (ws in / out, parse, create /
//      resume, the writer's writes);
//   CURE r1 (the coordinator's eight laws): ⑦ R1 / R4 the census's paid cost printed, the engines + native add to 100 % of the
//      busy ticks, each census field counts what its name says; ⑧ R3 an hour no watchdog watched prints «?»; ⑨ R5 the day
//      (Telemetry.heldDays over the rows) and its hours reconcile, one cause key, the boot apart in both; ⑩ R7 / R8 the hub's
//      processes told apart by stand-in /proc and cgroup files — a service unit, a login shell's scope, a container; ⑪ M6 the
//      conversations by turn and idle age, the keeper's ready browsers; ⑫ R2 the counter bound once.
//   CURE r3: ⑯ T2 the age pass ONE at a time, ended at its time-out — the ages «?» with how many were read, never the last hour's;
//      ⑭ a keeper browser counts only while its start time is still the record's, a CLI launcher and its native CLI are ONE;
//      ⑤ the zero-sync cut also over stand-in trees of all three group shapes (the command-line and start-time reads);
//      ⑰ a split file's own bucket in the line, and ⚙ Diagnostics' table: busy ticks, split buckets, unwatched hours, a short age read.
//      ⑱ a hold with NO FRAME OF OURS (主开发 2026-11-18 12:20Z) is counted apart (no-ours-holds / no-ours-held) and booked in top
//        under «(no frame of ours)», never under a verdict's word — in the line and in the day; RED: the release's cause.
// Run: node scripts/test-loop-day-report.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const L = require(path.join(REPO, 'src/loop-day-report.js'));
const O = require(path.join(REPO, 'src/server/loop-day-report.js'));
const LC = require(path.join(REPO, 'src/server/loop-counts.js'));
const LH = require(path.join(REPO, 'src/loop-hold.js'));
const CEN = require(path.join(REPO, 'src/loop-census.js'));
const TEL = require(path.join(REPO, 'src/telemetry.js'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const T0 = Date.UTC(2026, 10, 16, 20, 0, 0);   // 2026-11-16T20:00Z
const quietLog = (lines) => ({ log: (x) => lines.push(String(x)), warn() { }, error() { } });

/** STAND-IN /proc + cgroup trees (⑤, ⑩, ⑭): each process's status (Name, PPid — from its parent's `kids` — VmRSS), cmdline, children
 *  and, when `start` is given, a stat whose field 22 is that start time */
function standIn(ROOT) {
  const mk = (root, pid, { name, kb = 1000, cmd = [name], kids = [], start = null }, ppid = 0) => {
    const d = path.join(root, String(pid)); fs.mkdirSync(path.join(d, 'task', String(pid)), { recursive: true });
    fs.writeFileSync(path.join(d, 'status'), `Name:\t${name}\nPPid:\t${ppid}\nVmRSS:\t${kb} kB\n`);
    fs.writeFileSync(path.join(d, 'cmdline'), cmd.join('\0') + '\0');
    fs.writeFileSync(path.join(d, 'task', String(pid), 'children'), kids.join(' '));
    if (start != null) fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name}) S ${ppid} ${Array(17).fill(0).join(' ')} ${start} 0 0\n`);
  };
  const world = (tag, cg, procs) => {
    const p = path.join(ROOT, tag, 'proc'), c = path.join(ROOT, tag, 'cg'); fs.mkdirSync(path.join(p, 'self'), { recursive: true }); fs.writeFileSync(path.join(p, 'self', 'cgroup'), `0::${cg}\n`);
    const parent = new Map(); for (const [pid, o] of procs) for (const k of o.kids || []) parent.set(k, pid);
    for (const [pid, o] of procs) mk(p, pid, o, parent.get(pid) || 0);
    return { procRoot: p, cgroupRoot: c };
  };
  return { world };
}

console.log('① a fixed hour ⇒ a fixed line');
const fixedHour = () => {
  const h = L.newHour(T0);
  L.holdAdd(h, { ms: 4000, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' });
  L.holdAdd(h, { ms: 2500, verdict: 'JavaScript', frame: 'rebuild (src/normalizers.js:812)' });
  L.holdAdd(h, { ms: 1500, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' });
  L.holdAdd(h, { ms: 1200, verdict: 'waiting for a CPU', frame: "(not the hub's own code)" });
  return h;
};
const TAKE = { fromM: 0, toM: 3600000, everyMs: 1000, ticks: { idle: 2000, held: 10, stopped: 0, notSampled: 30, paused: 0 }, families: { interface: 200, channels: 410, money: 100, conversation: 120, outside: 120, native: 50 }, asks: 812, askOwnMs: 121.8, askMaxMs: 0.35, halved: null };
const fixedRep = (h) => ({ kind: 'hour', hour: h, toMs: T0 + 3600000, busy: 0.3725,
  engines: { busyTicks: 1000, sampledTicks: 3010, shares: [{ family: 'interface', share: 0.2 }, { family: 'channels', share: 0.41 }, { family: 'conversation', share: 0.12 }, { family: 'money', share: 0.1 }], native: { ticks: 50, share: 0.05 }, outside: { ticks: 120, share: 0.12 }, held: { ticks: 10 }, idle: { ticks: 2000 }, stopped: { ticks: 0 }, notSampled: { ticks: 30, paused: 0 }, viaHelper: { ticks: 140 }, deep: { ticks: 7 }, cost: { asks: 812, paidMs: 365.4 } },
  mem: { heapUsed: 312 * 1048576, heapLimit: 4096 * 1048576, rss: 640 * 1048576, kids: { how: 'service', cli: { n: 2, rss: 1200 * 1048576 }, wrapper: { n: 2, rss: 160 * 1048576 }, browser: { n: 3, rss: 900 * 1048576 }, agentd: { n: 1, rss: 80 * 1048576 }, other: { n: 4, rss: 40 * 1048576 } } },
  upMs: 26.5 * 3600000, agesRead: { read: 12, total: 12 }, turns: { 'turn-running': 2, 'turn-waiting': 1, 'idle-under-1h': 3, 'idle-1-2h': 1, 'idle-2-4h': 2, 'idle-over-4h': 4, 'turn-unknown': 1 }, browsers: { ready: 3, idle1h: 2 },
  sizes: { conversations: 12, pageSockets: 3, deviceLinks: 1, wsIn: 1203, wsOut: 5402, parsedChars: 12345678, creates: 2, resumes: 1, writes: 350, writeMaxMs: 1234 } });
const LINE = '[loop-hour] hour=2026-11-16T20Z span=3600s held=9.2s holds=4 longest=4.0s boot-held=0.0s boot-holds=0 lost-holds=0 no-ours-holds=0 no-ours-held=0.0s busy=37.3% top="src/channel-store.js:275 5.5s; src/normalizers.js:812 2.5s; waiting for a CPU 1.2s" engines="interface 20%; vault 0%; channels 41%; money 10%; workspace 0%; machines 0%; conversation 12%; native 5%; outside 12%" census-ticks=3040 busy-ticks=1000 held-ticks=10 idle-ticks=2000 stopped-ticks=0 not-sampled=30 via-helper=140 deep=7 census-asks=812 census-paid=0.37s hub-up=26.5h hub-heap=312MB/4096MB hub-rss=640MB cli=2/1200MB wrapper=2/160MB browser=3/900MB agentd=1/80MB other=4/40MB procs-by=service conversations=12 turn-running=2 turn-waiting=1 idle-under-1h=3 idle-1-2h=1 idle-2-4h=2 idle-over-4h=4 turn-unknown=1 ages-read=12/12 browsers-ready=3 browsers-idle-1h=2 page-sockets=3 device-links=1 ws-in=1203 ws-out=5402 parsed=12.3M creates=2 resumes=1 writes=350 write-max=1.2s vault-direct-starts=? program-starts=?';
const got = L.line(fixedRep(Object.assign(fixedHour(), { lost: 0 })));
ok(got === LINE, '① the fixed hour prints the fixed line (held 9.2 s over 4 holds, the top three by cause, the longest, busy, the engines in their order, memory by kind, the sizes)', { got, want: LINE });
ok(L.LINE_RE.test(got) && L.causesOk(got) && (typeof L.enginesOk === 'function' && L.enginesOk(got)), '① the line passes its own shape check (LINE_RE) and names only causes and engines it may');
{ // B-91aa: the timer sites' programs — the small starter, or the old road in force since when (said every hour, not once in a day's journal)
  const withS = (st) => L.line(Object.assign(fixedRep(Object.assign(fixedHour(), { lost: 0 })), { starter: st }));
  const dS = withS({ direct: true, directSince: Date.UTC(2026, 10, 16, 19, 42) }), sS = withS({ direct: false }), uS = withS(null);
  ok(L.LINE_RE.test(dS) && dS.endsWith(' program-starts=direct-since-2026-11-16T19:42Z') && L.LINE_RE.test(sS) && sS.endsWith(' program-starts=starter') && uS.endsWith(' program-starts=?'),
    'the line names the timer sites\' starts: «starter», «direct-since-<minute>Z» while the old road is in force, «?» when not told — each passes LINE_RE', { dS: dS.slice(-60), sS: sS.slice(-40) });
  // B-91aa's remainder (r4591 (A)): the hour's vault jobs started on the hub's own road, by number — «?» when the starter told none
  const vS = L.line(Object.assign(fixedRep(Object.assign(fixedHour(), { lost: 0 })), { starter: { direct: false }, vaultDirect: 3 }));
  ok(L.LINE_RE.test(vS) && vS.endsWith(' vault-direct-starts=3 program-starts=starter') && uS.includes(' vault-direct-starts=? '), 'the line counts the hour\'s VAULT job starts on the hub\'s own road (vault-direct-starts=3) before program-starts; «?» untold — each passes LINE_RE', { vS: vS.slice(-70) });
}
const unread = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: null, engines: null, mem: null, sizes: {} });
ok(L.LINE_RE.test(unread) && /engines="\?" census-ticks=\? busy-ticks=\? held-ticks=\? idle-ticks=\? stopped-ticks=\? not-sampled=\? via-helper=\? deep=\? census-asks=\? census-paid=\? hub-up=\? /.test(unread) && /cli=\?\/\? /.test(unread) && / top="none" /.test(unread) && / writes=\? /.test(unread) && / turn-running=\? /.test(unread) && / lost-holds=\? /.test(unread) && / browsers-ready=\? /.test(unread), '① a value never read prints «?», never 0 (an hour whose census and process table did not answer)', unread);

console.log('② the shape is stable and names nothing');
{
  const nasty = [
    { ms: 3000, verdict: 'in the kernel (blocked)', frame: 'openSync (/home/someone/.vibespace/data/channels/acct-9/people.json)' },
    { ms: 2000, verdict: "Alice's conversation «quarterly plan»", frame: 'chat «quarterly plan» of alice@example.com' },
    { ms: 1000, verdict: 'JavaScript', frame: 'x (src/../data/secret.js:1)' },
    { ms: 500, verdict: null, frame: null },
    { ms: 700, verdict: 'garbage collection', frame: 'gc "quoted" name' },
  ];
  const h = L.newHour(T0); for (const x of nasty) L.holdAdd(h, x);
  const line = L.line({ kind: 'exit', hour: h, toMs: T0 + 900000, busy: 0.5, engines: null, mem: null, sizes: {} });
  const bad = ['/home', 'data/', '.vibespace', 'acct-9', 'people.json', 'Alice', 'alice', 'quarterly', '@', 'secret', '..', 'quoted'].filter((w) => line.includes(w));
  ok(L.LINE_RE.test(line) && L.causesOk(line) && !bad.length && line.startsWith('[loop-exit] '), '② a hold whose frame or verdict carries a data path, an account, a name or a quote prints a fixed verdict / «(other)» / «(no cause recorded)» — nothing of them', { line, bad });
  ok(L.causeOf({ verdict: 'JavaScript', frame: 'fold (src/server/channels-engine.js:2580)' }) === 'src/server/channels-engine.js:2580' && L.causeOf({ verdict: 'JavaScript', frame: 'tick (server.js:973)' }) === 'server.js:973', '② a frame of the hub\'s own code is its code location (src/…:line, server.js:line)');
  // the census's family ids are the only words in engines="…": a fold that carried another word is not printed
  const odd = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 1, busy: 0, engines: { busyTicks: 10, sampledTicks: 10, notSampled: { ticks: 0 }, cost: {}, shares: [{ family: 'conv-of-alice', share: 1 }] }, mem: null, sizes: {} });
  ok(!odd.includes('alice') && /engines="interface 0%; vault 0%; channels 0%; money 0%; workspace 0%; machines 0%; conversation 0%; native 0%; outside 0%"/.test(odd), '② engines="…" prints the seven owners + native + outside in their fixed order — a word the fold carried that is not one of them never prints', odd);
}

console.log('③ the verdict words are the hold book\'s own');
{
  const V = Object.values(LH.V || {});
  ok(V.length > 0 && V.length === L.VERDICTS.length && V.every((w) => L.VERDICTS.includes(w)), `③ src/loop-day-report.js VERDICTS = src/loop-hold.js V (${V.length} words) — a new verdict there is red here until it is copied`, { V, mine: L.VERDICTS });
}

console.log('④ the ORCH: fold as they come, cut first, counts taken, census «?», exit line, day');
{
  let wall = T0 + 5 * 60000;   // the hub started at 20:05Z
  const lines = [];
  let takes = 0;
  const eluVals = [{ idle: 0, active: 0, utilization: 0 }];
  let R = null;
  // the first census answer books a hold DURING the cut's reads (it must count in the next hour)
  R = O.create({ log: quietLog(lines), wallNow: () => wall, census: async () => { takes++; if (takes === 1) R.onHold({ ms: 3000, verdict: 'waiting for a CPU', frame: null }); return takes === 1 ? { t: 1 } : null; }, foldCensus: () => fixedRep(L.newHour(T0)).engines,
    elu: (a, b) => (a && b ? { utilization: 0.25 } : eluVals[0]), kids: async () => fixedRep(L.newHour(T0)).mem.kids, heap: () => ({ heapUsed: 312 * 1048576, heapLimit: 4096 * 1048576 }), rss: () => 640 * 1048576,
    sizes: () => ({ conversations: 12, pageSockets: 3, deviceLinks: 1 }) });
  LC.take();
  for (const x of [{ ms: 4000, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' }, { ms: 1500, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' }, { ms: 9000, verdict: 'JavaScript', frame: 'boot (server.js:1)', boot: true }]) R.onHold(x);
  for (let i = 0; i < 5000; i++) R.onHold({ ms: 1000, verdict: 'JavaScript', frame: 'rebuild (src/normalizers.js:812)' });
  LC.inc('wsIn', 7); LC.inc('wsOut', 9); LC.inc('creates'); LC.max('writeMaxMs', 800);
  const now0 = R.hours().now;
  wall = T0 + 3600000;
  const r1 = await R.tick();
  ok(now0.holds === 5002 && r1.hour.holds === 5002 && Object.keys(r1.hour.by).length === 2 && !Object.values(r1.hour).some(Array.isArray), '④ 5 002 holds folded AS THEY CAME into one entry per cause (2 entries — never a list of rows); a hold of the boot is apart (boot-held)', { holds: r1.hour.holds, by: r1.hour.by });
  ok(/^\[loop-hour\] hour=2026-11-16T20Z span=3300s held=5005\.5s holds=5002 longest=4\.0s boot-held=9\.0s boot-holds=1 lost-holds=\? no-ours-holds=0 no-ours-held=0\.0s busy=25\.0% top="src\/normalizers\.js:812 5000\.0s; src\/channel-store\.js:275 5\.5s" engines="interface 20%;/.test(r1.line) && / ws-in=7 ws-out=9 parsed=0\.0M creates=1 resumes=0 writes=0 write-max=0\.8s vault-direct-starts=(\d+|\?) program-starts=(starter|\?)$/.test(r1.line) && lines[0] === r1.line,
    '④ the cut prints ONE line: the hour from the start (20:05Z, 3300 s), the counts taken, the census folded, the busy share between the two cuts', r1.line);
  ok(R.hours().now.holds === 1 && R.hours().now.heldMs === 3000 && LC.peek().wsIn === 0, '④ the cut swapped the hour FIRST: a hold booked while the cut read the census counts in the NEXT hour, and the counts were taken', R.hours().now);
  R.onHold({ ms: 2000, verdict: 'waiting for a CPU', frame: null });
  wall = T0 + 2 * 3600000;
  const r2 = await R.tick();
  ok(/ engines="\?" census-ticks=\? /.test(r2.line) && / held=5\.0s holds=2 /.test(r2.line), '④ a census that did not answer prints «?» — never a guess', r2.line);
  const ex = R.exitLine(); const ex2 = R.exitLine();
  ok(ex && ex.line.startsWith('[loop-exit] hour=2026-11-16T22Z span=0s held=0.0s holds=0 longest=0.0s boot-held=0.0s boot-holds=0 lost-holds=? ') && ex2 === null && lines.length === 3, '④ the exit line: the same shape over the hour so far, said ONCE', ex && ex.line);
  const hs = R.hours();
  ok(hs.hours.length === 2 && hs.hours[0].from === T0 + 3600000 && hs.day.hours === 2 && hs.day.holds === 5004 && !!hs.day.boot && hs.day.boot.holds === 1 && hs.day.longestMs === 4000 && hs.day.top[0].cause === 'src/normalizers.js:812', '④ ⚙ Diagnostics reads the hours kept (newest first) and their day', { n: hs.hours.length, day: hs.day });
  const many = O.create({ log: quietLog([]), wallNow: () => wall, kids: async () => null, census: async () => null, keepHours: 24 });
  for (let i = 0; i < 30; i++) { wall += 3600000; await many.tick(); }
  ok(many.hours().hours.length === 24, '④ the hours kept are bounded: 24');
  ok(L.nextHourAt(T0 + 1) === T0 + 3600000 && L.nextHourAt(T0) === T0 + 3600000, '④ the cut is at each UTC hour');
}

console.log('⑤ the report holds nothing: a REAL cut makes zero synchronous fs calls');
{
  const names = Object.keys(fs).filter((k) => /Sync$/.test(k) && typeof fs[k] === 'function');
  const orig = {}; let calls = 0; const seen = [];
  let rep = null, kids = null, shapes = null;
  // the three group shapes as stand-in trees (built BEFORE the counter): a service unit with a keeper browser (its start-time read),
  // a login shell's scope (the tree + the dtach masters' command lines), a container (the root group + its marker file)
  const SROOT = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ldr-sync-'));
  const { world } = standIn(SROOT), SOCK5 = '/srv/hub/data/sockets';
  const SA = world('service', '/user.slice/x.service', [[1000, { name: 'node' }], [101, { name: 'claude' }], [102, { name: 'kernel-x', start: 4242, kids: [103] }], [103, { name: 'kernel-x-gpu' }]]);
  fs.mkdirSync(path.join(SA.cgroupRoot, 'user.slice/x.service'), { recursive: true }); fs.writeFileSync(path.join(SA.cgroupRoot, 'user.slice/x.service/cgroup.procs'), '1000\n101\n102\n103\n');
  const SB = world('login', '/user.slice/user-1000.slice/session-3.scope', [[2000, { name: 'node', kids: [2001] }], [2001, { name: 'node', cmd: ['node', '/srv/hub/data/bin/chat-wrapper.js'], kids: [2002] }], [2002, { name: 'claude' }],
    [2100, { name: 'dtach', cmd: ['dtach', '-c', `${SOCK5}/cw-abc`, 'node', 'w.js'], kids: [2101] }], [2101, { name: 'claude' }]]);
  const SC = world('container', '/', [[1, { name: 'tini' }], [7, { name: 'node' }], [30, { name: 'claude' }]]); fs.writeFileSync(path.join(SROOT, 'container', '.dockerenv'), '');
  try {
    shapes = [];
    for (const [o, self] of [[{ ...SA, browserPids: [{ pid: 102, starttime: 4242 }] }, 1000], [SB, 2000], [{ ...SC, rootFs: path.join(SROOT, 'container'), env: {} }, 7]]) {
      // the counter wraps ONLY the walks (the trees are written above)
      for (const k of names) { orig[k] = fs[k]; fs[k] = function (...a) { calls++; if (seen.length < 5) seen.push(k); return orig[k].apply(this, a); }; }
      try { shapes.push(await O.procKids({ self, ...o, socketsDir: SOCK5 })); } finally { for (const k of names) fs[k] = orig[k]; }
    }
  } finally { fs.rmSync(SROOT, { recursive: true, force: true }); }
  for (const k of names) { orig[k] = fs[k]; fs[k] = function (...a) { calls++; if (seen.length < 5) seen.push(k); return orig[k].apply(this, a); }; }
  try {
    const R = O.create({ log: quietLog([]), census: async () => null, kids: (signal) => O.procKids({ signal, socketsDir: '/srv/no-such-hub/data/sockets' }) });   // the REAL process table WITH the sockets folder given (the dtach scan's command-line reads under the counter), the real heap, the real loop
    R.onHold({ ms: 1200, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
    rep = await R.tick();
    kids = rep.mem && rep.mem.kids;
  } finally { for (const k of names) fs[k] = orig[k]; }
  const shp = (shapes || []).map((k) => k && `${k.how}: ${L.KIDS.map((n) => `${n} ${k[n].n}`).join(', ')}`);
  ok(calls === 0 && shp.length === 3 && shapes.every(Boolean) && shapes[0].how === 'service' && shapes[0].browser.n === 2 && shapes[1].how === 'tree' && shapes[1].cli.n === 2 && shapes[2].how === 'container',
    `⑤ a real cut — the census asked, the process table read (${kids ? kids.how : 'none'}: ${kids ? L.KIDS.map((k) => `${k} ${kids[k].n}`).join(', ') : '—'}), the line made — AND the walk over stand-in trees of the three group shapes (${shp.join(' · ')}: the keeper browser's start time, the dtach masters' command lines, the container's marker) made ZERO synchronous fs calls (${calls})`, { seen, shp });
  ok(rep && L.LINE_RE.test(rep.line) && kids && Number.isFinite(rep.mem.rss), '⑤ …and its line is whole: memory read, the processes counted by kind', rep && rep.line);
}

console.log('⑥ processes by kind; the counts wired where they leave');
{
  ok(O.kindOf('claude') === 'cli' && O.kindOf('codex') === 'cli' && O.kindOf('chrome') === 'browser' && O.kindOf('headless_shell') === 'browser' && O.kindOf('node', 'node /x/data/bin/vibespace-agentd.js') === 'agentd' && O.kindOf('vibespace-devic') === 'agentd'
    && O.kindOf('node', 'node /usr/lib/node_modules/@openai/codex/bin/codex.js') === 'cli' && O.kindOf('node', 'node /x/chat-wrapper.js') === 'wrapper' && O.kindOf('dtach') === 'other', '⑥ a process\'s kind: agent CLIs, browsers, the device agent, the rest (a node process told apart by its command line — never kept)');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const ws = src('src/ws-handler.js'), sw = src('src/store-writer.js'), so = src('src/server/stdout/index.js'), wc = src('src/ws-create.js'), lh = src('src/server/loop-holds.js'), sv = src('server.js');
  ok(/ws\.send = \(d, o, cb\) => \{ LC\.inc\('wsOut'\); return send0\(d, o, cb\); \};/.test(ws) && /ws\.on\('message', async \(raw\) => \{\n\s*LC\.inc\('wsIn'\);/.test(ws), '⑥ page-socket messages: in at the handler, out at the socket\'s own send');
  ok(/^const LC = require\('\.\/server\/loop-counts\.js'\);/m.test(ws) && (ws.match(/loop-counts\.js/g) || []).length === 1, '⑫ R2: a bump on the hot path is an ADD — ws-handler binds the counter module ONCE at load (no require per message)');
  ok((sw.match(/LC\.inc\('writes'\);/g) || []).length === 1 && /function post\(l, s, p, since\) \{[^]*?LC\.inc\('writes'\);/.test(sw) && /if \(!onMain\) LC\.max\('writeMaxMs', ms\);/.test(sw), '⑥ store writes: counted at the ONE post to a lane\'s thread (the writer unit: the timer\'s road and the synchronous road both post through post()), the longest at its finish');
  ok(/ptyProcess\.onData\(\(o\) => LC\.inc\('parsedChars'/.test(so) && /inc\(data && \(data\.resumeId \|\| data\.resume\) \? 'resumes' : 'creates'\)/.test(wc), '⑥ conversation output handed to a parser (the registry\'s attach) and creates / resumes (the create handler)');
  ok(/for \(const f of each\) \{ try \{ f\(\{ ms: h\.ms, verdict: h\.fold\.verdict, frame: h\.fold\.frame, boot: !!h\.boot, noOurs: !!h\.fold\.noOurs \}\); \} catch \{ \} \}/.test(lh) && /hourly: hourly \?/.test(lh) && /loop-day-report\.js'\)\.wire\(\{ witness: syncFs, sessions: \(\) => activeSessions\.entries\(\), socketsDir: SOCKETS_DIR, buffersDir: BUFFERS_DIR, sizes: /.test(sv) && /book\.onEach\(\(h\) => r\.onHold\(h\)\); book\.setHourly\(\(\) => r\.hours\(\)\);/.test(src('src/server/loop-day-report.js')), '⑥ the hold book hands each hold to the hour; server.js starts the report and Diagnostics reads its hours');
}

console.log('⑦ R1 / R4: the census\'s paid cost printed; the engines and native add to 100 % of the busy ticks; each field counts what it says');
{
try {
  const F = CEN.censusFold(TAKE);
  const sum = [...F.shares.map((x) => x.share), F.native.share].reduce((a, b) => a + b, 0);
  const pcts = (/engines="([^"]*)"/.exec(LINE)[1]).split('; ').map((p) => Number(p.split(' ')[1].replace('%', '')));
  ok(CEN.DISPATCH_MS === 0.3 && F.cost.paidMs === 121.8 + 812 * 0.3 && / census-asks=812 census-paid=0\.37s /.test(LINE),
    '⑦ R1: census-paid = each ask\'s own run, measured live (121.8 ms over 812 asks), + the inspector\'s dispatch of each ask at the MEASURED 0.3 ms ⇒ 0.37 s — the price the main thread pays, never the in-sample part alone', F.cost);
  ok(Math.abs(sum - 1) < 1e-12 && pcts.length === 9 && Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) <= 4 && / census-ticks=3040 busy-ticks=1000 held-ticks=10 idle-ticks=2000 stopped-ticks=0 not-sampled=30 /.test(LINE),
    `⑦ R4: the nine engine fields (seven owners + native + outside) are shares of the busy ticks and add to 100 % (printed ${pcts.join('+')}); census-ticks = every tick (3 040 = 1 000 busy + 2 000 idle + 10 held + 30 not sampled), busy-ticks = booked on a family or native, not-sampled = not asked`, { sum, pcts });
} catch (e) { ok(false, '⑦ R1 / R4: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑧ R3: an hour no watchdog watched prints «?» — never a clean hour');
{
try {
  const h = L.newHour(T0, { watched: false }); L.holdAdd(h, { ms: 3000, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
  const ln = L.line({ kind: 'hour', hour: h, toMs: T0 + 3600000, busy: 0.2, engines: null, mem: null, sizes: {} });
  ok(L.LINE_RE.test(ln) && / held=\? holds=\? longest=\? boot-held=\? boot-holds=\? lost-holds=\? no-ours-holds=\? no-ours-held=\? busy=20\.0% top="\?" /.test(ln), '⑧ an unwatched hour: held, holds, longest, the boot\'s and top print «?» (busy is the loop\'s own reading and stays)', ln);
  let alive = true;
  const R = O.create({ log: quietLog([]), wallNow: () => T0 + 7200000, census: async () => null, kids: async () => null, watched: () => alive });
  R.onHold({ ms: 1500, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
  alive = false;   // the watchdog gone before the cut: the hour was not wholly watched
  const r = await R.tick();
  const R0 = O.create({ log: quietLog([]), wallNow: () => T0 + 7200000, census: async () => null, kids: async () => null });
  const r0 = await R0.tick();
  ok(/ held=\? holds=\? /.test(r.line) && / held=0\.0s holds=0 /.test(r0.line), '⑧ the ORCH: a watchdog gone at the cut ⇒ «?»; a watched hour with no hold ⇒ 0 (a clean hour is only ever a watched one)', { r: r.line.slice(0, 120), r0: r0.line.slice(0, 120) });
} catch (e) { ok(false, '⑧ R3: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑨ R5: the day and its hours reconcile — one cause key, the boot apart in both');
{
try {
  const holds = [
    { at: T0 + 10 * 60000, ms: 9000, verdict: 'JavaScript', frame: 'boot (server.js:1)', boot: true },
    { at: T0 + 20 * 60000, ms: 4000, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' },
    { at: T0 + 70 * 60000, ms: 2500, verdict: 'JavaScript', frame: 'rebuild (src/normalizers.js:812)' },
    { at: T0 + 80 * 60000, ms: 1500, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' },
    { at: T0 + 130 * 60000, ms: 1200, verdict: 'waiting for a CPU', frame: "(not the hub's own code)" },
    { at: T0 + 140 * 60000, ms: 1100, verdict: 'garbage collection', frame: null },
  ];
  // the rows the hold book writes (src/server/loop-holds.js: «verdict · frame», « · (the boot)» after a boot's own)
  const rows = holds.map((x) => ({ kind: 'metric', name: 'srv-loop-hold-ms', ts: x.at, value: x.ms, detail: `${x.verdict} · ${x.frame}${x.boot ? ' · (the boot)' : ''}` }));
  const Tel = TEL.Telemetry || TEL;
  const day = Tel.heldDays(rows, T0 + 3 * 3600000).today;
  let wall = T0; const R = O.create({ log: quietLog([]), wallNow: () => wall, census: async () => null, kids: async () => null });
  for (const cut of [1, 2, 3]) { for (const x of holds.filter((y) => y.at < T0 + cut * 3600000 && y.at >= T0 + (cut - 1) * 3600000)) R.onHold(x); wall = T0 + cut * 3600000; await R.tick(); }
  const d = R.hours().day;
  const dayBy = Object.fromEntries(day.causes.map((c) => [c.cause, c.ms]));
  ok(JSON.stringify(dayBy) === JSON.stringify(Object.fromEntries(L.topOf(d.by, 99).map((c) => [c.cause, c.ms]))) && day.ms === d.heldMs && day.count === d.holds && day.boot.ms === d.boot.heldMs && day.boot.count === d.boot.holds && d.boot.holds === 1 && day.ms === 10300,
    '⑨ the day (Telemetry.heldDays over the rows) and the sum of its three hours agree cause by cause (the same key: a code location of the hub\'s own, else the verdict), in seconds and holds, and the boot\'s 9 s is apart in BOTH', { day, hours: d });
} catch (e) { ok(false, '⑨ R5: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑩ R7 / R8: the hub\'s processes, told apart by stand-in /proc and cgroup files');
{
try {
  const ROOT = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ldr-proc-'));
  try {
    const SOCK = '/srv/hub/data/sockets';
    const { world } = standIn(ROOT);
    // (a) A SERVICE UNIT: the unit's members are the hub's (a dtach'd CLI stays there); the person's browser outside it is not
    const A = world('service', '/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service', [[1000, { name: 'node' }], [101, { name: 'claude' }], [102, { name: 'chrome' }], [103, { name: 'dtach' }], [104, { name: 'firefox' }]]);
    fs.mkdirSync(path.join(A.cgroupRoot, 'user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service'), { recursive: true });
    fs.writeFileSync(path.join(A.cgroupRoot, 'user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service/cgroup.procs'), '1000\n101\n102\n103\n');
    const a = await O.procKids({ self: 1000, ...A, socketsDir: SOCK });
    // (b) A LOGIN SHELL'S SCOPE: the scope holds the person's programs too — only the hub's own: its tree + the dtach masters of ITS sockets folder
    const B = world('login', '/user.slice/user-1000.slice/session-3.scope', [
      [2000, { name: 'node', kids: [2001] }], [2001, { name: 'node', cmd: ['node', '/srv/hub/data/bin/chat-wrapper.js', '--cli', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js'], kids: [2002] }], [2002, { name: 'claude' }],
      [2100, { name: 'dtach', cmd: ['dtach', '-c', `${SOCK}/cw-abc`, 'node', 'w.js'], kids: [2101] }], [2101, { name: 'claude' }],
      [2200, { name: 'firefox' }], [2300, { name: 'dtach', cmd: ['dtach', '-c', '/home/someone/other/sockets/cw-x', 'sh'], kids: [2301] }], [2301, { name: 'claude' }]]);
    const b = await O.procKids({ self: 2000, ...B, socketsDir: SOCK });
    // (c) A CONTAINER: the cgroup reads as the root — the WHOLE container is the hub's (the conversations' masters left the tree by design)
    const C = world('container', '/', [[1, { name: 'tini' }], [7, { name: 'node' }], [30, { name: 'claude' }], [31, { name: 'dtach' }], [40, { name: 'chrome' }]]);
    fs.writeFileSync(path.join(ROOT, 'container', '.dockerenv'), '');   // the SECOND fact: a container's own marker file
    const c = await O.procKids({ self: 7, ...C, rootFs: path.join(ROOT, 'container'), env: {}, socketsDir: SOCK });
    // the root group on a machine with NO container (no marker, no orchestrator): the tree — fewer, never the person's own programs
    const D = world('bare-root', '/', [[1, { name: 'systemd' }], [7, { name: 'node', kids: [70] }], [70, { name: 'claude' }], [80, { name: 'firefox' }], [81, { name: 'claude' }]]);
    const d = await O.procKids({ self: 7, ...D, rootFs: path.join(ROOT, 'bare-root'), env: {}, socketsDir: SOCK });
    const sum = (k) => ({ how: k.how, cli: k.cli.n, wrapper: k.wrapper.n, browser: k.browser.n, agentd: k.agentd.n, other: k.other.n });
    ok(JSON.stringify(sum(a)) === '{"how":"service","cli":1,"wrapper":0,"browser":1,"agentd":0,"other":1}', '⑩ (a) a service unit: its members — the CLI, the browser, the dtach master — never the person\'s browser outside it', sum(a));
    ok(JSON.stringify(sum(b)) === '{"how":"tree","cli":2,"wrapper":1,"browser":0,"agentd":0,"other":1}', '⑩ (b) R7 a login shell\'s scope: ONLY the hub\'s own — its tree (a WRAPPER whose arguments name the CLI is a wrapper, the CLI under it the CLI — S3) and the dtach master of ITS sockets folder with its CLI; never the person\'s browser nor another folder\'s dtach', sum(b));
    ok(JSON.stringify(sum(c)) === '{"how":"container","cli":1,"wrapper":0,"browser":1,"agentd":0,"other":2}', '⑩ (c) R8 a container (the root group AND its marker file): every process of it but the hub — the CLI whose master left the hub\'s tree is counted', sum(c));
    ok(JSON.stringify(sum(d)) === '{"how":"tree","cli":1,"wrapper":0,"browser":0,"agentd":0,"other":0}', '⑩ (d) the root group with NO second fact (a machine with no container) is NOT a container: the hub\'s tree only — never the person\'s browser or another CLI', sum(d));
    ok(O.howOf('0::/\n') === 'tree' && O.howOf('0::/\n', { inContainer: true }) === 'container' && O.howOf('0::/kubepods/burstable/pod1/abc\n') === 'container' && O.howOf('0::/system.slice/docker-0123456789abcdef.scope\n') === 'container' && O.howOf('0::/user.slice/user-1000.slice/user@1000.service/app.slice/run-p1-i2.scope\n') === 'tree' && O.howOf('') === 'tree',
      '⑩ howOf: a container runtime\'s cgroup is a container; a run / app scope is the tree (a scope holds more than the hub); no v2 line is the tree');
  } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }
} catch (e) { ok(false, '⑩ R7 / R8: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑪ M6 + S4: the conversations by turn and idle age — the age read off the output file, so it survives a restart');
{ try {
  const t = Date.now(), H = 3600000;
  const BUF = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ldr-buf-'));
  try {
    const S = [['run', { mode: 'chat', _isStreaming: true }], ['wait', { mode: 'chat', _turnState: 'requires_action' }], ['a', { mode: 'chat' }], ['b', { mode: 'chat' }],
      ['c', { mode: 'chat' }], ['d', { mode: 'chat' }], ['e', { mode: 'chat' }], ['term', { mode: 'terminal' }], ['nofile', { mode: 'chat', _lastPtyDataAt: t }]];
    const ages = { a: 0.5, b: 1.5, c: 3, d: 5, e: 9 };
    for (const [id, h] of Object.entries(ages)) { const f = path.join(BUF, `${id}.buf`); fs.writeFileSync(f, 'x'); fs.utimesSync(f, (t - h * H) / 1000, (t - h * H) / 1000); }
    const times = await O.outputTimes(S, BUF);
    const tu = O.turnsOf(S, t, times);
    ok(JSON.stringify(tu) === '{"turn-running":1,"turn-waiting":1,"idle-under-1h":1,"idle-1-2h":1,"idle-2-4h":1,"idle-over-4h":2,"turn-unknown":2}', '⑪ by turn and idle age: running, waiting on the person, idle under 1 h / 1–2 h / 2–4 h / over 4 h — the age = the OUTPUT FILE\'s time; a terminal (no turn facts) and a chat with no output file are «turn-unknown» (an in-memory last-output time is never read)', tu);
    // S4: a RESTART of the hub — a new report, the same files: the ages are the same (the in-memory time is gone)
    const mk = () => O.create({ log: quietLog([]), wallNow: () => t, census: async () => null, kids: async () => null, sessions: () => S, buffersDir: BUF, upMs: () => 0.2 * H, browsers: () => ({ ready: 3, idle1h: 2 }) });
    const r1 = await mk().tick(), r2 = await mk().tick();
    const want = / turn-running=1 turn-waiting=1 idle-under-1h=1 idle-1-2h=1 idle-2-4h=1 idle-over-4h=2 turn-unknown=2 ages-read=9\/9 browsers-ready=3 browsers-idle-1h=2 /;
    ok(want.test(r1.line) && want.test(r2.line) && / hub-up=0\.2h /.test(r2.line) && L.LINE_RE.test(r2.line), '⑪ S4: a hub restarted 12 minutes ago still reads «idle over 4 h» = 2 (the files\' times survive it), and prints its own uptime (hub-up) beside them', r2.line.slice(0, 400));
  } finally { fs.rmSync(BUF, { recursive: true, force: true }); }
} catch (e) { ok(false, '⑪ M6: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑫b S2: the line\'s engines from the REAL census fold — the future owners, native and outside, adding to 100 %');
{ try {
  const F = CEN.censusFold({ ...TAKE, families: { interface: 200, channels: 410, money: 100, conversation: 120, outside: 120, native: 50 }, viaHelper: 140, deep: 7 });
  const ln = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: 0.3, engines: F, mem: null, sizes: {} });
  const SPL = (CEN.SPLIT || []).map((x) => `${x.short}* 0%; `).join('');
  ok(SPL.length > 0 && new RegExp(` engines="interface 20%; vault 0%; channels 41%; money 10%; workspace 0%; machines 0%; conversation 12%; ${SPL.replace(/\*/g, '\\*')}native 5%; outside 12%" `).test(ln) && / busy-ticks=1000 held-ticks=10 idle-ticks=2000 stopped-ticks=0 not-sampled=30 via-helper=140 deep=7 /.test(ln) && L.LINE_RE.test(ln) && L.enginesOk(ln),
    '⑫b the real fold (src/loop-census.js) prints the seven OWNERS in their order, then EVERY split file\'s own bucket in the census\'s list order (none booked here: 0 %), native and outside, and its helper / deep counts', ln.slice(0, 700));
  // cure r3 (T1): a sample booked on a split file's bucket by the REAL fold prints under that file's short name, never on an owner
  const F2 = CEN.censusFold({ ...TAKE, families: { interface: 100, 'split:ws-handler': 100, channels: 410, money: 100, conversation: 120, outside: 120, native: 50 } });
  const ln2 = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: 0.3, engines: F2, mem: null, sizes: {} });
  const pcts = (/engines="([^"]*)"/.exec(ln2)[1]).split('; ').map((p) => Number(p.split(' ')[1].replace('%', '')));
  ok(/ engines="interface 10%; vault 0%; channels 41%; money 10%; workspace 0%; machines 0%; conversation 12%; ws-handler\* 10%; server\* 0%; /.test(ln2) && L.enginesOk(ln2) && Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) <= pcts.length / 2,
    '⑫b cure r3: the real fold\'s split bucket (a tick inside the page handler\'s own body) prints as «ws-handler* 10%» after the seven owners — the interface keeps only its own 10 %; the fields add to 100 % up to rounding', ln2.slice(0, 700));
} catch (e) { ok(false, '⑫b S2: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑬ S1: the census\'s ticks add up and say where held time went; a paused census prints «?»');
{ try {
  const k = (n) => Number(new RegExp(` ${n}=(\\d+)`).exec(LINE)[1]);
  ok(k('busy-ticks') + k('held-ticks') + k('idle-ticks') + k('stopped-ticks') + k('not-sampled') === k('census-ticks') && /the shares|SHARES/.test(fs.readFileSync(path.join(REPO, 'src/loop-day-report.js'), 'utf8')) && /THEY LEAVE OUT\s*\n?\s*\*?\s*HELD TIME/.test(fs.readFileSync(path.join(REPO, 'src/loop-day-report.js'), 'utf8')),
    '⑬ busy + held + idle + stopped + not-sampled = census-ticks (1 000 + 10 + 2 000 + 0 + 30 = 3 040); the words say the shares leave out held time and that the holds name it', { busy: k('busy-ticks'), held: k('held-ticks'), idle: k('idle-ticks'), total: k('census-ticks') });
  const paused = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: 0.1, engines: { busyTicks: 0, sampledTicks: 3000, shares: [], native: { ticks: 0, share: null }, held: { ticks: 0 }, idle: { ticks: 0 }, stopped: { ticks: 0 }, notSampled: { ticks: 3600, paused: 3600 }, cost: { asks: 0, paidMs: 0 } }, mem: null, sizes: {} });
  ok(/ engines="\?" /.test(paused) && L.LINE_RE.test(paused), '⑬ an hour whose census was PAUSED prints engines «?» — never «none»', paused.slice(0, 260));
} catch (e) { ok(false, '⑬ S1: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑭ S3: a process is counted once, under its own kind — by its program and its script');
{ try {
  const K = O.kindOf;
  const cases = [
    ['node', ['node', '/srv/hub/data/bin/chat-wrapper.js', '--cli', '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'], 'wrapper', 'a wrapper whose ARGUMENTS name the CLI is a wrapper'],
    ['claude', ['/usr/local/bin/claude', '--print-nothing'], 'cli', 'the native CLI under it is the CLI'],
    ['node', ['node', '--max-old-space-size=4096', '/usr/lib/node_modules/@openai/codex/bin/codex.js', 'proto'], 'cli', 'a node CLI is told by the SCRIPT it runs (node\'s options skipped)'],
    ['node', ['node', '-r', '/srv/hub/x.js', '/srv/hub/tools/report.js', '--about', '/usr/bin/claude'], 'other', 'a CLI path among the arguments of another script is not a CLI'],
    ['vibespace-devic', ['vibespace-device'], 'agentd', 'the device agent by its own title'],
    ['node', ['node', '/home/u/.vibespace/agentd/current/agentd.js'], 'agentd', 'the device agent by its script'],
    ['chrome', ['/opt/x/chrome'], 'browser', 'a browser by its program'],
    ['dtach', ['dtach', '-c', '/srv/hub/data/sockets/cw-a', 'node', 'w.js'], 'other', 'a dtach master is the rest'],
  ];
  const bad = cases.filter(([n, a, want]) => K(n, a) !== want).map(([n, a, want, why]) => ({ why, want, got: K(n, a) }));
  ok(!bad.length, `⑭ ${cases.map((c) => c[3]).join('; ')}`, bad);
  // a keeper browser of ANY engine — its program named however the engine calls it — and the processes under it are browsers
  const ROOT = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ldr-br-'));
  try {
    const P = path.join(ROOT, 'proc'); fs.mkdirSync(path.join(P, 'self'), { recursive: true }); fs.writeFileSync(path.join(P, 'self', 'cgroup'), '0::/user.slice/x.service\n');
    const cgp = path.join(ROOT, 'cg', 'user.slice', 'x.service'); fs.mkdirSync(cgp, { recursive: true }); fs.writeFileSync(path.join(cgp, 'cgroup.procs'), '500\n600\n601\n602\n700\n701\n');
    const mk = (pid, name, ppid, start) => { const d = path.join(P, String(pid)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'status'), `Name:\t${name}\nPPid:\t${ppid}\nVmRSS:\t1024 kB\n`); fs.writeFileSync(path.join(d, 'cmdline'), name + '\0'); if (start != null) fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name}) S ${ppid} ${Array(17).fill(0).join(' ')} ${start} 0 0\n`); };
    mk(600, 'kernel-x', 500, 1111); mk(601, 'kernel-x-gpu', 600); mk(602, 'zygote', 601);
    mk(700, 'kernel-y', 500, 3333); mk(701, 'kernel-y-gpu', 700);   // the record says 700 started at 2222: the pid now names ANOTHER process
    const k = await O.procKids({ self: 500, procRoot: P, cgroupRoot: path.join(ROOT, 'cg'), browserPids: [{ pid: 600, starttime: 1111 }, { pid: 700, starttime: 2222 }] });
    ok(k && k.browser.n === 3 && k.other.n === 2, '⑭ a browser the keeper runs (its {pid, start time} from the keeper\'s records — any engine, whatever its program is called) and every process under it are browsers; cure r3: a recorded pid whose start time is NOT the record\'s (a reused pid) is not that browser — it and its child are the rest', k && { browser: k.browser.n, other: k.other.n });
    // the keeper hands both the daemon's and the browser's identity (src/server/browser-keeper.js browserPids)
    const kp = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    ok(/browserPids: \(\) => \{[^\n]*out\.push\(\{ pid: x\.pid, starttime: Number\(x\.starttime\) \}\)[^\n]*add\(r\); add\(r\.browser\);/.test(kp), '⑭ the keeper\'s browserPids hands {pid, starttime} for the daemon AND its browser, as its records hold them — never a bare pid');
  } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }
  // cure r3: a CLI is counted ONCE — a launcher (a node shim running the CLI's script) and the native CLI it starts are one CLI
  const R2 = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ldr-cli-'));
  try {
    const { world } = standIn(R2);
    const E = world('tree', '/user.slice/user-1000.slice/session-3.scope', [[3000, { name: 'node', kids: [3001, 3003] }],
      [3001, { name: 'node', kb: 100, cmd: ['node', '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'], kids: [3002] }], [3002, { name: 'claude', kb: 2000 }], [3003, { name: 'codex', kb: 500 }]]);
    const k = await O.procKids({ self: 3000, ...E, socketsDir: '/srv/hub/data/sockets' });
    ok(k && k.how === 'tree' && k.cli.n === 2 && k.cli.rss === (100 + 2000 + 500) * 1024, '⑭ cure r3: a launcher CLI and the native CLI it starts count as ONE CLI (its child adds memory, not a count) — two CLIs here, never three', k && { cli: k.cli });
  } finally { fs.rmSync(R2, { recursive: true, force: true }); }
} catch (e) { ok(false, '⑭ S3: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑮ the smalls: the day leaves out an unwatched hour; lost holds; the walk one at a time; the boot mark by the real writer');
{ try {
  const hw = L.newHour(T0); L.holdAdd(hw, { ms: 2000, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
  const hu = L.newHour(T0 + 3600000, { watched: false }); L.holdAdd(hu, { ms: 7000, verdict: 'JavaScript', frame: 'y (src/b.js:2)' });
  const day = L.dayFold([{ hour: hw, toMs: T0 + 3600000 }, { hour: hu, toMs: T0 + 7200000 }]);
  ok(day.hours === 2 && day.unwatched === 1 && day.heldMs === 2000 && day.holds === 1 && !day.by['src/b.js:2'], '⑮ an hour nobody watched is LEFT OUT of the day\'s sums, and the day says how many hours that was (1)', day);
  let lost = 5; const RL = O.create({ log: quietLog([]), wallNow: () => T0 + 3600000, census: async () => null, kids: async () => null, lost: () => lost });
  lost = 8; const rl = await RL.tick();
  ok(/ lost-holds=3 /.test(rl.line), '⑮ the holds the watchdog\'s ring dropped in the hour are said (lost-holds = 8 − 5)', rl.line.slice(0, 200));
  // the walk: ONE at a time; its time-out ends it (cancelled) and no second walk starts while one runs
  let calls = 0, sig = null, release = null;
  const RW = O.create({ log: quietLog([]), wallNow: () => T0 + 3600000, census: async () => null, walkWaitMs: 60, kids: (signal) => { calls++; sig = signal; return new Promise((r) => { release = r; }); } });
  const keep = setInterval(() => { }, 1000);   // the walk's time-out timer is unref'd (in the hub the loop is held by the server) — hold it here
  const w1 = await RW.tick(); const w2 = await RW.tick();
  clearInterval(keep);
  ok(calls === 1 && sig && sig.cancelled === true && /procs-by=\?/.test(w1.line) && /procs-by=\?/.test(w2.line), '⑮ the process walk is ONE at a time: its time-out CANCELS it, and a cut while it still runs starts no second walk (both print «?»)', { calls, cancelled: sig && sig.cancelled });
  if (release) release(null);
  // THE BOOT MARK by the REAL hold book's writer (src/server/loop-holds.js), read back by the day
  const LB = require(path.join(REPO, 'src/server/loop-holds.js')); const recs = [];
  const book = LB.create({ log: { warn() { }, log() { } }, record: (r) => recs.push({ ...r, ts: T0 + 60000 }), samplingState: () => ({ known: true, on: true }), heap: () => ({ heapUsed: 1, heapLimit: 100, external: 0 }), eluEveryMs: 1e9 });
  book.onHold({ ms: 2500, boot: true, fromM: 0, toM: 2500, samples: [] }); book.onHold({ ms: 1500, fromM: 3000, toM: 4500, samples: [] });
  try { book.stop?.(); } catch { }
  const Tel = TEL.Telemetry || TEL;
  const dd = Tel.heldDays(recs.map((r) => ({ ...r, kind: 'metric', name: 'srv-loop-hold-ms' })), T0 + 3600000).today;
  ok(recs.length === 2 && /· \(the boot\)$/.test(recs[0].detail) && !/\(the boot\)/.test(recs[1].detail) && dd.boot.count === 1 && dd.boot.ms === 2500 && dd.count === 1 && dd.ms === 1500,
    '⑮ the boot mark is written by the REAL hold book (its row ends « · (the boot)») and the day reads it apart', { details: recs.map((r) => r.detail), today: dd });
} catch (e) { ok(false, '⑮ the smalls: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑯ T2: the age pass — ONE at a time, ended at its time-out; the ages «?» with how many were read, never the last hour\'s');
{ try {
  const t = T0 + 3600000, H = 3600000;
  const S = [['a', { mode: 'chat' }], ['b', { mode: 'chat' }], ['c', { mode: 'chat' }], ['d', { mode: 'chat' }], ['run', { mode: 'chat', _isStreaming: true }]];
  let calls = 0, sig = null; const hang = [];
  // pass 1 answers at once (all five read: a,b idle under 1 h, c,d over 4 h); pass 2 reads TWO and then hangs (a slow storage)
  const outputs = (entries, dir, { signal }) => {
    calls++; sig = signal;
    if (calls === 1) { signal.read = entries.length; return Promise.resolve(new Map([['a', t - 0.5 * H], ['b', t - 0.5 * H], ['c', t - 5 * H], ['d', t - 5 * H], ['run', t]])); }
    signal.read = 2; return new Promise((r) => hang.push(r));
  };
  let wall = t; const lines = [];
  const R = O.create({ log: quietLog(lines), wallNow: () => wall, census: async () => null, kids: async () => null, sessions: () => S, buffersDir: '/srv/no-such/buffers', outputs, walkWaitMs: 20 });
  const keep = setInterval(() => { }, 1000);   // the time-out timer is unref'd (the hub's server holds the loop) — hold it here
  const r1 = await R.tick(); wall += H; const r2 = await R.tick(); wall += H; const r3 = await R.tick();
  clearInterval(keep);
  ok(/ idle-under-1h=2 idle-1-2h=0 idle-2-4h=0 idle-over-4h=2 turn-unknown=0 ages-read=5\/5 /.test(r1.line) && L.LINE_RE.test(r1.line), '⑯ a pass that finished: the ages, and ages-read = 5 of 5', r1.line.slice(300, 560));
  ok(/ turn-running=1 turn-waiting=0 idle-under-1h=\? idle-1-2h=\? idle-2-4h=\? idle-over-4h=\? turn-unknown=0 ages-read=2\/5 /.test(r2.line) && sig && sig.cancelled === true && L.LINE_RE.test(r2.line),
    '⑯ a pass that ran out of time is CANCELLED and the hour prints the idle ages «?» with how many it read (2 of 5) — never the previous hour\'s times (2 / 0 / 0 / 2)', { line: r2.line.slice(300, 560), cancelled: sig && sig.cancelled });
  ok(calls === 2 && / idle-under-1h=\? .* ages-read=0\/5 /.test(r3.line), '⑯ while that pass is still ending, the next hour starts NO second pass beside it: «?» and 0 read', { calls, line: r3.line.slice(300, 560) });
  for (const r of hang) r(null);
  const ex = R.exitLine();
  ok(ex && / idle-under-1h=\? idle-1-2h=\? idle-2-4h=\? idle-over-4h=\? turn-unknown=0 ages-read=0\/5 /.test(ex.line) && L.LINE_RE.test(ex.line), '⑯ the exit line reads nothing: its idle ages are «?» (0 read)', ex && ex.line.slice(300, 560));
  const real = await O.outputTimes([['x', {}], ['y', {}]], '/srv/no-such/buffers', { signal: { cancelled: true } });
  ok(real === null, '⑯ the real pass, cancelled, answers null (it says it ran out) — never a partial map', real);
} catch (e) { ok(false, '⑯ T2: the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑰ cure r3: a split file\'s own bucket in the line; ⚙ Diagnostics draws the busy ticks, the split buckets, the day\'s unwatched hours, a short age read');
{ try {
  const fold = { busyTicks: 1000, sampledTicks: 3010, shares: [{ family: 'interface', share: 0.2 }, { family: 'split:ws-handler', share: 0.3, order: 0 }, { family: 'split:server', share: 0.1, order: 1 }, { family: 'split:Not A Name', share: 0 }, { family: 'outside', share: 0.3 }],
    native: { ticks: 100, share: 0.1 }, held: { ticks: 10 }, idle: { ticks: 2000 }, stopped: { ticks: 0 }, notSampled: { ticks: 30, paused: 0 }, viaHelper: { ticks: 0 }, deep: { ticks: 0 }, cost: { asks: 9, paidMs: 5 } };
  const ln = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: 0.3, engines: fold, mem: null, sizes: {} });
  ok(/ engines="interface 20%; vault 0%; channels 0%; money 0%; workspace 0%; machines 0%; conversation 0%; ws-handler\* 30%; server\* 10%; native 10%; outside 30%" /.test(ln) && L.enginesOk(ln) && L.LINE_RE.test(ln) && !/Not A Name/.test(ln),
    '⑰ a split file is a bucket of its own after the seven owners, by its short name marked «*», in the census\'s list order; a name not of the plain shape never prints', ln.slice(200, 480));
  ok(!L.enginesOk('engines="interface 20%; vault 0%; channels 0%; money 0%; workspace 0%; machines 0%; ws-handler* 30%; conversation 0%; native 10%; outside 30%"') && !L.enginesOk('engines="interface 20%; vault 0%; channels 0%; money 0%; workspace 0%; machines 0%; conversation 0%; a b* 3%; native 10%; outside 30%"'),
    '⑰ enginesOk: a split bucket only AFTER the seven owners, and only a plain short name');
  // the Diagnostics table (src/lib/setup-flows.js hourlyTable, extracted) over a real report's hours
  const S = [['a', { mode: 'chat' }], ['b', { mode: 'chat' }], ['c', { mode: 'chat' }], ['d', { mode: 'chat' }], ['e', { mode: 'chat' }]];
  let wall = T0, alive = true; const hang = [];
  const R = O.create({ log: quietLog([]), wallNow: () => wall, watched: () => alive, census: async () => ({ t: 1 }), foldCensus: () => fold, kids: async () => null, sessions: () => S, buffersDir: '/srv/no-such/buffers',
    outputs: (entries, dir, { signal }) => { signal.read = 2; return new Promise((r) => hang.push(r)); }, walkWaitMs: 20 });
  const keep = setInterval(() => { }, 1000);
  R.onHold({ ms: 2000, verdict: 'JavaScript', frame: 'x (src/a.js:1)' }); wall += 3600000; await R.tick();
  alive = false; wall += 3600000; await R.tick();
  clearInterval(keep); for (const r of hang) r(null);
  const SF = fs.readFileSync(path.join(REPO, 'src/lib/setup-flows.js'), 'utf8');
  const a = SF.indexOf('function hourlyTable('), b = SF.indexOf('// end hourlyTable');
  const draw = a > 0 && b > a ? new Function(SF.slice(a, b) + '\nreturn hourlyTable;')() : () => '';
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tOf = (dict) => (k, p) => { let x = dict && Object.prototype.hasOwnProperty.call(dict, k) ? dict[k] : k; if (p) x = x.replace(/\{(\w+)\}/g, (m, y) => (p[y] !== undefined ? String(p[y]) : m)); return x; };
  const words = (html) => html.replace(/<\/(td|p|h3)>/g, ' | ').replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const en = words(draw(R.hours(), { t: tOf(null), esc }));
  const has = ['busy 1000 · held 10 · idle 2000 ticks', 'ws-handler* 30 %', 'outside 30 %', '0 · 0 · ? · ? · ? · ? · 0 (read 2 of 5)', '0 · 0 · ? · ? · ? · ? · 0 (read 0 of 5)', 'The hours above: 2.0 s held in 1 holds; 1 of 2 hours not watched, left out of these sums.', 'not watched'];
  const miss = has.filter((w) => !en.includes(w));
  ok(!miss.length, '⑰ ⚙ Diagnostics draws the busy-tick count beside the shares, a split bucket by its short name «*», an age read that ran out of time («?» and how many it read), and the day\'s unwatched hours', { miss, en: en.slice(0, 1600) });
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const keys = [...SF.slice(a, b).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const noZh = keys.filter((k) => !Object.prototype.hasOwnProperty.call(zh, k)), noJa = keys.filter((k) => !Object.prototype.hasOwnProperty.call(ja, k));
  ok(keys.length >= 15 && !noZh.length && !noJa.length, `⑰ every one of the table's ${keys.length} words has its zh and ja`, { noZh, noJa });
} catch (e) { ok(false, '⑰ the leg threw on this tree', (e && e.message) || String(e)); } }

console.log('⑱ a hold with NO FRAME OF OURS is counted apart — booked under «(no frame of ours)», never a verdict\'s word');
{
  const book = (LDR) => {
    const h = LDR.newHour(T0);
    LDR.holdAdd(h, { ms: 1500, verdict: 'JavaScript', frame: '(node’s own code — fs)', noOurs: true });
    LDR.holdAdd(h, { ms: 2500, verdict: 'JavaScript', frame: 'storePath (src/agy-store-fs.js:24)' });
    LDR.holdAdd(h, { ms: 1200, verdict: 'JavaScript', frame: '(node’s own code — undici)', noOurs: true });
    LDR.holdAdd(h, { ms: 9000, verdict: 'JavaScript', frame: '(node’s own code — fs)', noOurs: true, boot: true });   // the boot's own: apart from both
    return { h, line: LDR.line(fixedRep(h)), day: LDR.dayFold([{ hour: h, toMs: T0 + 3600000, busy: 0.1 }]) };
  };
  const r = book(L);
  ok(L.LINE_RE.test(r.line) && L.causesOk(r.line) && / holds=3 /.test(r.line) && / no-ours-holds=2 no-ours-held=2\.7s /.test(r.line) && / boot-holds=1 /.test(r.line)
    && /top="\(no frame of ours\) 2\.7s; src\/agy-store-fs\.js:24 2\.5s"/.test(r.line) && r.day.noOurs.holds === 2 && r.day.noOurs.heldMs === 2700 && r.day.by[L.NO_OURS] === 2700 && !r.day.by.JavaScript,
    '⑱ two holds with no frame of ours: no-ours-holds=2 no-ours-held=2.7s, booked in top under «(no frame of ours)» and in the day the same — never under «JavaScript»; the boot\'s own stays apart', { line: r.line.slice(0, 260), day: r.day.noOurs, by: r.day.by });
  { // …and THE DAY TABLE (Telemetry.heldDays, ⚙ Diagnostics) books it the same: the hold book's record carries the mark
    const Tel = TEL.Telemetry || TEL;
    const rows = [{ ms: 1500, frame: '(node’s own code — fs)', no: true }, { ms: 2500, frame: 'storePath (src/agy-store-fs.js:24)' }, { ms: 1200, frame: '(node’s own code — undici)', no: true }]
      .map((x, i) => ({ kind: 'metric', name: 'srv-loop-hold-ms', ts: T0 + (i + 1) * 60000, value: x.ms, detail: `JavaScript · ${x.frame}${x.no ? ' · (no frame of ours)' : ''}` }));
    const dd = Tel.heldDays(rows, T0 + 3600000).today, by = Object.fromEntries(dd.causes.map((c) => [c.cause, c.ms]));
    ok(by[L.NO_OURS] === 2700 && by['src/agy-store-fs.js:24'] === 2500 && !by.JavaScript && dd.count === 3,
      '⑱ the day table (heldDays over the hold book\'s rows) books the marked holds under «(no frame of ours)» as the hour does — one key in both', by);
  }
  const SRC = fs.readFileSync(path.join(REPO, 'src/loop-day-report.js'), 'utf8'), CUT = '  if (noOurs === true) return NO_OURS;\n';
  const m = { exports: {} };
  if (SRC.split(CUT).length === 2) vm.compileFunction(editAnchor(SRC, CUT, '', "src/loop-day-report.js"), ['module', 'exports', 'require'], { filename: 'loop-day-report-no-mark.js' })(m, m.exports, require);
  const red = m.exports.newHour ? book(m.exports) : null;
  ok(red && /top="JavaScript 2\.7s; src\/agy-store-fs\.js:24 2\.5s"/.test(red.line) && !red.line.includes('(no frame of ours)'),
    '⑱ RED CONTROL: the release\'s cause (no mark) books those holds under the verdict «JavaScript» — mixed with every JavaScript hold of the hour', red && red.line.slice(0, 260));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
