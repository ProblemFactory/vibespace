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
//      resume, the writer's writes).
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
const fixedRep = (h) => ({ kind: 'hour', hour: h, toMs: T0 + 3600000, busy: 0.3725,
  engines: { busyTicks: 812, shares: [{ family: 'channels', share: 0.41 }, { family: 'page', share: 0.2 }, { family: 'parse', share: 0.12 }, { family: 'rest', share: 0.27 }] },
  mem: { heapUsed: 312 * 1048576, heapLimit: 4096 * 1048576, rss: 640 * 1048576, kids: { cli: { n: 2, rss: 1200 * 1048576 }, browser: { n: 3, rss: 900 * 1048576 }, agentd: { n: 1, rss: 80 * 1048576 }, other: { n: 4, rss: 40 * 1048576 } } },
  sizes: { conversations: 12, pageSockets: 3, deviceLinks: 1, wsIn: 1203, wsOut: 5402, parsedChars: 12345678, creates: 2, resumes: 1, writes: 350, writeMaxMs: 1234 } });
const LINE = '[loop-hour] hour=2026-11-16T20Z span=3600s held=9.2s holds=4 longest=4.0s busy=37.3% top="src/channel-store.js:275 5.5s; src/normalizers.js:812 2.5s; waiting for a CPU 1.2s" engines="channels 41%; pool 0%; parse 12%; browser 0%; jobs 0%; page 20%; hook 0%; rest 27%" sampled=812 hub-heap=312MB/4096MB hub-rss=640MB cli=2/1200MB browser=3/900MB agentd=1/80MB other=4/40MB conversations=12 page-sockets=3 device-links=1 ws-in=1203 ws-out=5402 parsed=12.3M creates=2 resumes=1 writes=350 write-max=1.2s';
const got = L.line(fixedRep(fixedHour()));
ok(got === LINE, '① the fixed hour prints the fixed line (held 9.2 s over 4 holds, the top three by cause, the longest, busy, the engines in their order, memory by kind, the sizes)', { got, want: LINE });
ok(L.LINE_RE.test(got) && L.causesOk(got), '① the line passes its own shape check (LINE_RE) and names only causes it may');
const unread = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 3600000, busy: null, engines: null, mem: null, sizes: {} });
ok(L.LINE_RE.test(unread) && /engines="\?" sampled=\? /.test(unread) && /cli=\?\/\? /.test(unread) && / top="none" /.test(unread) && / writes=\? /.test(unread), '① a value never read prints «?», never 0 (an hour whose census and process table did not answer)', unread);

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
  const odd = L.line({ kind: 'hour', hour: L.newHour(T0), toMs: T0 + 1, busy: 0, engines: { busyTicks: 10, shares: [{ family: 'conv-of-alice', share: 1 }] }, mem: null, sizes: {} });
  ok(!odd.includes('alice') && /engines="channels 0%; pool 0%; parse 0%; browser 0%; jobs 0%; page 0%; hook 0%; rest 0%"/.test(odd), '② engines="…" prints the eight family ids in their fixed order — a word the fold carried that is not one of them never prints', odd);
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
  ok(now0.holds === 5002 && r1.hour.holds === 5002 && Object.keys(r1.hour.by).length === 2 && !Object.values(r1.hour).some(Array.isArray), '④ 5 002 holds folded AS THEY CAME into one entry per cause (2 entries — never a list of rows); a hold of the boot is not the hour\'s', { holds: r1.hour.holds, by: r1.hour.by });
  ok(/^\[loop-hour\] hour=2026-11-16T20Z span=3300s held=5005\.5s holds=5002 longest=4\.0s busy=25\.0% top="src\/normalizers\.js:812 5000\.0s; src\/channel-store\.js:275 5\.5s" engines="channels 41%;/.test(r1.line) && / ws-in=7 ws-out=9 parsed=0\.0M creates=1 resumes=0 writes=0 write-max=0\.8s$/.test(r1.line) && lines[0] === r1.line,
    '④ the cut prints ONE line: the hour from the start (20:05Z, 3300 s), the counts taken, the census folded, the busy share between the two cuts', r1.line);
  ok(R.hours().now.holds === 1 && R.hours().now.heldMs === 3000 && LC.peek().wsIn === 0, '④ the cut swapped the hour FIRST: a hold booked while the cut read the census counts in the NEXT hour, and the counts were taken', R.hours().now);
  R.onHold({ ms: 2000, verdict: 'waiting for a CPU', frame: null });
  wall = T0 + 2 * 3600000;
  const r2 = await R.tick();
  ok(/ engines="\?" sampled=\? /.test(r2.line) && / held=5\.0s holds=2 /.test(r2.line), '④ a census that did not answer prints «?» — never a guess', r2.line);
  const ex = R.exitLine(); const ex2 = R.exitLine();
  ok(ex && ex.line.startsWith('[loop-exit] hour=2026-11-16T22Z span=0s held=0.0s holds=0 ') && ex2 === null && lines.length === 3, '④ the exit line: the same shape over the hour so far, said ONCE', ex && ex.line);
  const hs = R.hours();
  ok(hs.hours.length === 2 && hs.hours[0].from === T0 + 3600000 && hs.day.hours === 2 && hs.day.holds === 5004 && hs.day.longestMs === 4000 && hs.day.top[0].cause === 'src/normalizers.js:812', '④ ⚙ Diagnostics reads the hours kept (newest first) and their day', { n: hs.hours.length, day: hs.day });
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
  ok(/ws\.send = \(d, \.\.\.rest\) => \{ LC\.inc\('wsOut'\); return send0\(d, \.\.\.rest\); \};/.test(ws) && /ws\.on\('message', async \(raw\) => \{\n\s*require\('\.\/server\/loop-counts\.js'\)\.inc\('wsIn'\);/.test(ws), '⑥ page-socket messages: in at the handler, out at the socket\'s own send');
  ok((sw.match(/LC\.inc\('writes'\);/g) || []).length === 2 && /if \(!onMain\) LC\.max\('writeMaxMs', ms\);/.test(sw), '⑥ store writes: counted at both posts to the writer thread, the longest at its finish');
  ok(/ptyProcess\.onData\(\(o\) => LC\.inc\('parsedChars'/.test(so) && /inc\(data && \(data\.resumeId \|\| data\.resume\) \? 'resumes' : 'creates'\)/.test(wc), '⑥ conversation output handed to a parser (the registry\'s attach) and creates / resumes (the create handler)');
  ok(/for \(const f of each\) \{ try \{ f\(\{ ms: h\.ms, verdict: h\.fold\.verdict, frame: h\.fold\.frame, boot: !!h\.boot \}\); \} catch \{ \} \}/.test(lh) && /hourly: hourly \?/.test(lh) && /loop-day-report\.js'\)\.wire\(\{ witness: syncFs, sizes: /.test(sv) && /book\.onEach\(\(h\) => r\.onHold\(h\)\); book\.setHourly\(\(\) => r\.hours\(\)\);/.test(src('src/server/loop-day-report.js')), '⑥ the hold book hands each hold to the hour; server.js starts the report and Diagnostics reads its hours');
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
