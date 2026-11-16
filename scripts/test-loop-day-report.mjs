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
// Run: node scripts/test-loop-day-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
const T0 = Date.UTC(2026, 10, 16, 20, 0, 0);   // 2026-11-16T20:00Z
const quietLog = (lines) => ({ log: (x) => lines.push(String(x)), warn() { }, error() { } });

console.log('① a fixed hour ⇒ a fixed line');
const fixedHour = () => {
  const h = L.newHour(T0);
  L.holdAdd(h, { ms: 4000, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' });
  L.holdAdd(h, { ms: 2500, verdict: 'JavaScript', frame: 'rebuild (src/normalizers.js:812)' });
  L.holdAdd(h, { ms: 1500, verdict: 'in the kernel (blocked)', frame: 'writeJsonAtomic (src/channel-store.js:275)' });
  L.holdAdd(h, { ms: 1200, verdict: 'waiting for a CPU', frame: "(not the hub's own code)" });
  return h;
};
const TAKE = { fromM: 0, toM: 3600000, everyMs: 1000, ticks: { idle: 2000, held: 10, stopped: 0, notSampled: 30, paused: 0 }, families: { channels: 410, page: 200, parse: 120, rest: 220, native: 50 }, asks: 812, askOwnMs: 121.8, askMaxMs: 0.35, halved: null };
const fixedRep = (h) => ({ kind: 'hour', hour: h, toMs: T0 + 3600000, busy: 0.3725,
  engines: CEN.censusFold(TAKE),
  mem: { heapUsed: 312 * 1048576, heapLimit: 4096 * 1048576, rss: 640 * 1048576, kids: { how: 'service', cli: { n: 2, rss: 1200 * 1048576 }, browser: { n: 3, rss: 900 * 1048576 }, agentd: { n: 1, rss: 80 * 1048576 }, other: { n: 4, rss: 40 * 1048576 } } },
  turns: { running: 2, waiting: 1, 'idle-under-1h': 3, 'idle-1-2h': 1, 'idle-2-4h': 2, 'idle-over-4h': 4, 'turn-unknown': 1 }, browsers: { ready: 3, idle1h: 2 },
  sizes: { conversations: 12, pageSockets: 3, deviceLinks: 1, wsIn: 1203, wsOut: 5402, parsedChars: 12345678, creates: 2, resumes: 1, writes: 350, writeMaxMs: 1234 } });
const LINE = '[loop-hour] hour=2026-11-16T20Z span=3600s held=9.2s holds=4 longest=4.0s boot-held=0.0s boot-holds=0 busy=37.3% top="src/channel-store.js:275 5.5s; src/normalizers.js:812 2.5s; waiting for a CPU 1.2s" engines="channels 41%; pool 0%; parse 12%; browser 0%; jobs 0%; page 20%; hook 0%; rest 22%; native 5%" census-ticks=3040 busy-ticks=1000 not-sampled=30 census-asks=812 census-paid=0.37s hub-heap=312MB/4096MB hub-rss=640MB cli=2/1200MB browser=3/900MB agentd=1/80MB other=4/40MB procs-by=service conversations=12 running=2 waiting=1 idle-under-1h=3 idle-1-2h=1 idle-2-4h=2 idle-over-4h=4 turn-unknown=1 browsers-ready=3 browsers-idle-1h=2 page-sockets=3 device-links=1 ws-in=1203 ws-out=5402 parsed=12.3M creates=2 resumes=1 writes=350 write-max=1.2s';
const got = L.line(fixedRep(fixedHour()));
ok(got === LINE, '① the fixed hour prints the fixed line (held 9.2 s over 4 holds, the top three by cause, the longest, busy, the engines in their order, memory by kind, the sizes)', { got, want: LINE });
ok(L.LINE_RE.test(got) && L.causesOk(got) && (typeof L.enginesOk === 'function' && L.enginesOk(got)), '① the line passes its own shape check (LINE_RE) and names only causes and engines it may');
const unread = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: null, engines: null, mem: null, sizes: {} });
ok(L.LINE_RE.test(unread) && /engines="\?" census-ticks=\? busy-ticks=\? not-sampled=\? census-asks=\? census-paid=\? /.test(unread) && /cli=\?\/\? /.test(unread) && / top="none" /.test(unread) && / writes=\? /.test(unread) && / running=\? /.test(unread) && / browsers-ready=\? /.test(unread), '① a value never read prints «?», never 0 (an hour whose census and process table did not answer)', unread);

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
  ok(!odd.includes('alice') && /engines="channels 0%; pool 0%; parse 0%; browser 0%; jobs 0%; page 0%; hook 0%; rest 0%; native 0%"/.test(odd), '② engines="…" prints the nine fixed fields in their order — a word the fold carried that is not one of them never prints', odd);
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
  ok(/^\[loop-hour\] hour=2026-11-16T20Z span=3300s held=5005\.5s holds=5002 longest=4\.0s boot-held=9\.0s boot-holds=1 busy=25\.0% top="src\/normalizers\.js:812 5000\.0s; src\/channel-store\.js:275 5\.5s" engines="channels 41%;/.test(r1.line) && / ws-in=7 ws-out=9 parsed=0\.0M creates=1 resumes=0 writes=0 write-max=0\.8s$/.test(r1.line) && lines[0] === r1.line,
    '④ the cut prints ONE line: the hour from the start (20:05Z, 3300 s), the counts taken, the census folded, the busy share between the two cuts', r1.line);
  ok(R.hours().now.holds === 1 && R.hours().now.heldMs === 3000 && LC.peek().wsIn === 0, '④ the cut swapped the hour FIRST: a hold booked while the cut read the census counts in the NEXT hour, and the counts were taken', R.hours().now);
  R.onHold({ ms: 2000, verdict: 'waiting for a CPU', frame: null });
  wall = T0 + 2 * 3600000;
  const r2 = await R.tick();
  ok(/ engines="\?" census-ticks=\? /.test(r2.line) && / held=5\.0s holds=2 /.test(r2.line), '④ a census that did not answer prints «?» — never a guess', r2.line);
  const ex = R.exitLine(); const ex2 = R.exitLine();
  ok(ex && ex.line.startsWith('[loop-exit] hour=2026-11-16T22Z span=0s held=0.0s holds=0 longest=0.0s boot-held=0.0s boot-holds=0 ') && ex2 === null && lines.length === 3, '④ the exit line: the same shape over the hour so far, said ONCE', ex && ex.line);
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
  for (const k of names) { orig[k] = fs[k]; fs[k] = function (...a) { calls++; if (seen.length < 5) seen.push(k); return orig[k].apply(this, a); }; }
  let rep = null, kids = null;
  try {
    const R = O.create({ log: quietLog([]), census: async () => null });   // the REAL process table (cgroup or tree), the real heap, the real loop
    R.onHold({ ms: 1200, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
    rep = await R.tick();
    kids = rep.mem && rep.mem.kids;
  } finally { for (const k of names) fs[k] = orig[k]; }
  ok(calls === 0, `⑤ a real cut — the census asked, the process table read (${kids ? kids.how : 'none'}: ${kids ? L.KIDS.map((k) => `${k} ${kids[k].n}`).join(', ') : '—'}), the line made — made ZERO synchronous fs calls (${calls})`, seen);
  ok(rep && L.LINE_RE.test(rep.line) && kids && Number.isFinite(rep.mem.rss), '⑤ …and its line is whole: memory read, the processes counted by kind', rep && rep.line);
}

console.log('⑥ processes by kind; the counts wired where they leave');
{
  ok(O.kindOf('claude') === 'cli' && O.kindOf('codex') === 'cli' && O.kindOf('chrome') === 'browser' && O.kindOf('headless_shell') === 'browser' && O.kindOf('node', 'node /x/data/bin/vibespace-agentd.js') === 'agentd' && O.kindOf('vibespace-devic') === 'agentd'
    && O.kindOf('node', 'node /usr/lib/node_modules/@openai/codex/bin/codex.js') === 'cli' && O.kindOf('node', 'node /x/chat-wrapper.js') === 'other' && O.kindOf('dtach') === 'other', '⑥ a process\'s kind: agent CLIs, browsers, the device agent, the rest (a node process told apart by its command line — never kept)');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const ws = src('src/ws-handler.js'), sw = src('src/store-writer.js'), so = src('src/server/stdout/index.js'), wc = src('src/ws-create.js'), lh = src('src/server/loop-holds.js'), sv = src('server.js');
  ok(/ws\.send = \(d, \.\.\.rest\) => \{ LC\.inc\('wsOut'\); return send0\(d, \.\.\.rest\); \};/.test(ws) && /ws\.on\('message', async \(raw\) => \{\n\s*LC\.inc\('wsIn'\);/.test(ws), '⑥ page-socket messages: in at the handler, out at the socket\'s own send');
  ok(/^const LC = require\('\.\/server\/loop-counts\.js'\);/m.test(ws) && (ws.match(/loop-counts\.js/g) || []).length === 1, '⑫ R2: a bump on the hot path is an ADD — ws-handler binds the counter module ONCE at load (no require per message)');
  ok((sw.match(/LC\.inc\('writes'\);/g) || []).length === 2 && /if \(!onMain\) LC\.max\('writeMaxMs', ms\);/.test(sw), '⑥ store writes: counted at both posts to the writer thread, the longest at its finish');
  ok(/ptyProcess\.onData\(\(o\) => LC\.inc\('parsedChars'/.test(so) && /inc\(data && \(data\.resumeId \|\| data\.resume\) \? 'resumes' : 'creates'\)/.test(wc), '⑥ conversation output handed to a parser (the registry\'s attach) and creates / resumes (the create handler)');
  ok(/for \(const f of each\) \{ try \{ f\(\{ ms: h\.ms, verdict: h\.fold\.verdict, frame: h\.fold\.frame, boot: !!h\.boot \}\); \} catch \{ \} \}/.test(lh) && /hourly: hourly \?/.test(lh) && /loop-day-report\.js'\)\.wire\(\{ witness: syncFs, sessions: \(\) => activeSessions\.values\(\), socketsDir: SOCKETS_DIR, sizes: /.test(sv) && /book\.onEach\(\(h\) => r\.onHold\(h\)\); book\.setHourly\(\(\) => r\.hours\(\)\);/.test(src('src/server/loop-day-report.js')), '⑥ the hold book hands each hold to the hour; server.js starts the report and Diagnostics reads its hours');
}

console.log('⑦ R1 / R4: the census\'s paid cost printed; the engines and native add to 100 % of the busy ticks; each field counts what it says');
{
try {
  const F = CEN.censusFold(TAKE);
  const sum = [...F.shares.map((x) => x.share), F.native.share].reduce((a, b) => a + b, 0);
  const pcts = (/engines="([^"]*)"/.exec(LINE)[1]).split('; ').map((p) => Number(p.split(' ')[1].replace('%', '')));
  ok(CEN.DISPATCH_MS === 0.3 && F.cost.paidMs === 121.8 + 812 * 0.3 && / census-asks=812 census-paid=0\.37s /.test(LINE),
    '⑦ R1: census-paid = each ask\'s own run, measured live (121.8 ms over 812 asks), + the inspector\'s dispatch of each ask at the MEASURED 0.3 ms ⇒ 0.37 s — the price the main thread pays, never the in-sample part alone', F.cost);
  ok(Math.abs(sum - 1) < 1e-12 && pcts.length === 9 && Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) <= 4 && / census-ticks=3040 busy-ticks=1000 not-sampled=30 /.test(LINE),
    `⑦ R4: the nine engine fields (eight families + native) are shares of the busy ticks and add to 100 % (printed ${pcts.join('+')}); census-ticks = every tick (3 040 = 1 000 busy + 2 000 idle + 10 held + 30 not sampled), busy-ticks = booked on a family or native, not-sampled = not asked`, { sum, pcts });
} catch (e) { ok(false, '⑦ R1 / R4: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑧ R3: an hour no watchdog watched prints «?» — never a clean hour');
{
try {
  const h = L.newHour(T0, { watched: false }); L.holdAdd(h, { ms: 3000, verdict: 'JavaScript', frame: 'x (src/a.js:1)' });
  const ln = L.line({ kind: 'hour', hour: h, toMs: T0 + 3600000, busy: 0.2, engines: null, mem: null, sizes: {} });
  ok(L.LINE_RE.test(ln) && / held=\? holds=\? longest=\? boot-held=\? boot-holds=\? busy=20\.0% top="\?" /.test(ln), '⑧ an unwatched hour: held, holds, longest, the boot\'s and top print «?» (busy is the loop\'s own reading and stays)', ln);
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
    const mk = (root, pid, { name, kb = 1000, cmd = [name], kids = [] }) => {
      const d = path.join(root, String(pid)); fs.mkdirSync(path.join(d, 'task', String(pid)), { recursive: true });
      fs.writeFileSync(path.join(d, 'status'), `Name:\t${name}\nVmRSS:\t${kb} kB\n`);
      fs.writeFileSync(path.join(d, 'cmdline'), cmd.join('\0') + '\0');
      fs.writeFileSync(path.join(d, 'task', String(pid), 'children'), kids.join(' '));
    };
    const world = (tag, cg, procs) => { const p = path.join(ROOT, tag, 'proc'), c = path.join(ROOT, tag, 'cg'); fs.mkdirSync(path.join(p, 'self'), { recursive: true }); fs.writeFileSync(path.join(p, 'self', 'cgroup'), `0::${cg}\n`); for (const [pid, o] of procs) mk(p, pid, o); return { procRoot: p, cgroupRoot: c }; };
    // (a) A SERVICE UNIT: the unit's members are the hub's (a dtach'd CLI stays there); the person's browser outside it is not
    const A = world('service', '/user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service', [[1000, { name: 'node' }], [101, { name: 'claude' }], [102, { name: 'chrome' }], [103, { name: 'dtach' }], [104, { name: 'firefox' }]]);
    fs.mkdirSync(path.join(A.cgroupRoot, 'user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service'), { recursive: true });
    fs.writeFileSync(path.join(A.cgroupRoot, 'user.slice/user-1000.slice/user@1000.service/app.slice/vibespace.service/cgroup.procs'), '1000\n101\n102\n103\n');
    const a = await O.procKids({ self: 1000, ...A, socketsDir: SOCK });
    // (b) A LOGIN SHELL'S SCOPE: the scope holds the person's programs too — only the hub's own: its tree + the dtach masters of ITS sockets folder
    const B = world('login', '/user.slice/user-1000.slice/session-3.scope', [
      [2000, { name: 'node', kids: [2001] }], [2001, { name: 'node', cmd: ['node', '/srv/hub/data/bin/chat-wrapper.js'], kids: [2002] }], [2002, { name: 'claude' }],
      [2100, { name: 'dtach', cmd: ['dtach', '-c', `${SOCK}/cw-abc`, 'node', 'w.js'], kids: [2101] }], [2101, { name: 'claude' }],
      [2200, { name: 'firefox' }], [2300, { name: 'dtach', cmd: ['dtach', '-c', '/home/someone/other/sockets/cw-x', 'sh'], kids: [2301] }], [2301, { name: 'claude' }]]);
    const b = await O.procKids({ self: 2000, ...B, socketsDir: SOCK });
    // (c) A CONTAINER: the cgroup reads as the root — the WHOLE container is the hub's (the conversations' masters left the tree by design)
    const C = world('container', '/', [[1, { name: 'tini' }], [7, { name: 'node' }], [30, { name: 'claude' }], [31, { name: 'dtach' }], [40, { name: 'chrome' }]]);
    const c = await O.procKids({ self: 7, ...C, socketsDir: SOCK });
    const sum = (k) => ({ how: k.how, cli: k.cli.n, browser: k.browser.n, agentd: k.agentd.n, other: k.other.n });
    ok(JSON.stringify(sum(a)) === '{"how":"service","cli":1,"browser":1,"agentd":0,"other":1}', '⑩ (a) a service unit: its members — the CLI, the browser, the dtach master — never the person\'s browser outside it', sum(a));
    ok(JSON.stringify(sum(b)) === '{"how":"tree","cli":2,"browser":0,"agentd":0,"other":2}', '⑩ (b) R7 a login shell\'s scope: ONLY the hub\'s own — its tree (a wrapper and its CLI) and the dtach master of ITS sockets folder with its CLI; never the person\'s browser nor another folder\'s dtach', sum(b));
    ok(JSON.stringify(sum(c)) === '{"how":"container","cli":1,"browser":1,"agentd":0,"other":2}', '⑩ (c) R8 a container: every process of it but the hub — the CLI whose master left the hub\'s tree is counted', sum(c));
    ok(O.howOf('0::/kubepods/burstable/pod1/abc\n') === 'container' && O.howOf('0::/system.slice/docker-0123456789abcdef.scope\n') === 'container' && O.howOf('0::/user.slice/user-1000.slice/user@1000.service/app.slice/run-p1-i2.scope\n') === 'tree' && O.howOf('') === 'tree',
      '⑩ howOf: a container runtime\'s cgroup is a container; a run / app scope is the tree (a scope holds more than the hub); no v2 line is the tree');
  } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }
} catch (e) { ok(false, '⑩ R7 / R8: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log('⑪ M6: the conversations by turn and idle age; the keeper\'s ready browsers');
{
try {
  const t = T0 + 10 * 3600000, H = 3600000;
  const S = [{ mode: 'chat', _isStreaming: true }, { mode: 'chat', _turnState: 'requires_action' }, { mode: 'chat', _lastPtyDataAt: t - H / 2 }, { mode: 'chat', _lastPtyDataAt: t - 1.5 * H },
    { mode: 'chat', _lastPtyDataAt: t - 3 * H }, { mode: 'chat', _lastPtyDataAt: t - 5 * H }, { mode: 'chat', _lastPtyDataAt: t - 9 * H }, { mode: 'terminal', _lastPtyDataAt: t }, { mode: 'chat' }];
  const tu = O.turnsOf(S, t);
  ok(JSON.stringify(tu) === '{"running":1,"waiting":1,"idle-under-1h":1,"idle-1-2h":1,"idle-2-4h":1,"idle-over-4h":2,"turn-unknown":2}', '⑪ by turn and idle age: running, waiting on the person, idle under 1 h / 1–2 h / 2–4 h / over 4 h (its last output); a terminal (no turn facts) and a chat with no output time are «turn-unknown»', tu);
  const R = O.create({ log: quietLog([]), wallNow: () => t, census: async () => null, kids: async () => null, sessions: () => S, browsers: () => ({ ready: 3, idle1h: 2 }) });
  const r = await R.tick();
  ok(/ running=1 waiting=1 idle-under-1h=1 idle-1-2h=1 idle-2-4h=1 idle-over-4h=2 turn-unknown=2 browsers-ready=3 browsers-idle-1h=2 /.test(r.line) && L.LINE_RE.test(r.line), '⑪ the hourly line prints them, and the keeper\'s ready browsers with those idle over an hour', r.line.slice(0, 400));
} catch (e) { ok(false, '⑪ M6: the leg threw on this tree', (e && e.message) || String(e)); }
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
