#!/usr/bin/env node
// THE TELEMETRY SUMMARIES RUN OFF THE LOOP (B-360d unit 2, lane bl-keys-misc — the coordinator's r707 / r710). On the owner's hub
// (2.369.413, the data folder on a network mount) the journal named ONE loop hold of 5.7 s at the Diagnostics report's read: the
// telemetry folder listed and up to three monthly event files read and parsed line by line, synchronously, on the loop. THE LAW:
// the read and the summing run in the «telemetry-summary» worker (a pool of one, a deadline); ONE in flight a window — a second ask
// meanwhile waits for the same answer; the route replies when the worker does (503 when it does not, said); THE ANSWER IS THE SAME
// NUMBERS AS BEFORE for the same files, field for field; the route's `?drift=1` fields (the drift ledger, the turns a person
// pressed) ride unchanged (test-spend-paths pins them).
//   ① PARITY: a fixture of event shards (four months, the three newest read; errors, a browser note, metrics, drift, held rows, old
//      and malformed lines) — the worker's summary == the PURE summarizeEvents == the release's own summary (a copy of the base's
//      src/telemetry.js, when the base is in this clone: a COUNTED skip otherwise), field for field; the fleet's likewise
//   ② THE HOLD PLACED, NEVER ANSWERED: an events shard that is a FIFO no one writes blocks the WORKER, never the loop — the loop keeps
//      turning, each ask ends at its REPLY deadline (503 still-reading), a second ask rides the same read; the READ's own deadline
//      ends the worker and the folder is then refused BY NAME for its bounded time (no new worker); after it, the next ask reads
//   ③ RED CONTROL — this tree's summary read on the loop (a copy): the same FIFO, answered by a writer after 400 ms, holds the loop
//   ④ CENSUS: no synchronous file call in the two summary methods; the worker is the shards' one reader; both routes await
//   ⑤ (r887) A SLOW DISK THAT IS ALIVE: the read outlives its ask's reply and is KEPT — the next ask gets the report with no read of
//      its own; RED: a copy that throws the late answer away (the next ask reads again and never gets it)
//   ⑥ (r887) DIFFERENT ASKS TOGETHER (days 1 and 14; the report's and the fleet's) each get their own reply; RED: a key without days
//   ⑦ (r887, THE MUST) THE PAGE: an answer that is no report (the route's refusal, nothing at all) is SAID, never drawn; the fleet's
//      refusal says one line; RED: today's check (nothing at all only); the words in zh and ja; the routes map a 503 to a 503
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0, skipped = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return c; }
// THE SHARED WATCHDOG (scripts/suite-watchdog.mjs): before the gate's budget (capped at 40 s), it names the leg (its header) and ends
// the suite; every FIFO is answered and removed before the end (a thread parked in an open holds the process's exit)
const WD = armWatchdog({ capMs: 40e3 });
const ROOTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tele-offloop-'));
const fifos = [], writers = new Set();
process.on('exit', () => { for (const w of writers) { try { w.kill('SIGKILL'); } catch { } } for (const f of fifos) freeFifo(f); try { fs.rmSync(ROOTDIR, { recursive: true, force: true }); } catch { } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkfifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const r = spawnSync('mkfifo', [f]); if (r.status !== 0) throw new Error(`mkfifo ${f}: ${String(r.stderr || r.error || '').trim()}`); fifos.push(f); };
function freeFifo(f) { try { const fd = fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); } catch { } try { fs.unlinkSync(f); } catch { } }
async function loopGap(fn) {
  let last = Date.now(), max = 0;
  const t = setInterval(() => { const n = Date.now(); max = Math.max(max, n - last); last = n; }, 5);
  const t0 = Date.now(); let out, err = null;
  try { out = await fn(); } catch (e) { err = e; } finally { clearInterval(t); }
  max = Math.max(max, Date.now() - last);
  return { max, took: Date.now() - t0, out, err };
}
const TEL = require(path.join(ROOT, 'src/telemetry.js'));
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0), D = 86400000;
const month = (ms) => new Date(ms).toISOString().slice(0, 7);
let seq = 0;
function fixtureDir(tag) {
  const dataDir = path.join(ROOTDIR, tag + '-' + (++seq)), td = path.join(dataDir, 'telemetry'); fs.mkdirSync(td, { recursive: true });
  const rows = (ts, extra = []) => [
    { ts, kind: 'event', name: 'boot', version: '2.369.413' },
    { ts: ts + 1, kind: 'error', name: 'x is not a function', detail: 'bundle.js:1', stack: 'at a\nat b', version: '2.369.413' },
    { ts: ts + 2, kind: 'error', name: 'x is not a function', detail: 'bundle.js:1', stack: 'at a\nat b', version: '2.369.414' },
    { ts: ts + 3, kind: 'server-error', name: 'EIO', detail: 'read', version: '2.369.413' },
    { ts: ts + 4, kind: 'error', name: 'ResizeObserver loop completed with undelivered notifications.', detail: ':0', version: '2.369.413' },
    { ts: ts + 5, kind: 'metric', name: 'srv-loop-hold-ms', value: 5700, detail: 'JavaScript · telemetry.js:205', version: '2.369.413' },
    { ts: ts + 6, kind: 'metric', name: 'srv-loop-hold-ms', value: 1200, detail: 'blocked · jobs.js:1768 · (the boot)', version: '2.369.413' },
    { ts: ts + 7, kind: 'metric', name: 'api-ms', value: 12, version: '2.369.413' },
    { ts: ts + 8, kind: 'event', name: 'harness-shape-drift', detail: { field: 'x' }, version: '2.369.413' },
    { ts: ts + 9, kind: 'event', name: 'cli-unknown-record', detail: 'type=foo', version: '2.369.414' },
    ...extra,
  ].map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n\n';
  // four months: the oldest is never read (the three newest); old rows outside the window still feed the held week
  for (const [ms, extra] of [[NOW - 100 * D, []], [NOW - 70 * D, []], [NOW - 40 * D, []], [NOW - 2 * D, [{ ts: NOW - 30 * 60e3, kind: 'event', name: 'late', version: '2.369.414' }]]]) {
    fs.appendFileSync(path.join(td, `events-${month(ms)}.ndjson`), rows(ms, extra));
    fs.appendFileSync(path.join(td, `central-${month(ms)}.ndjson`), rows(ms, extra).split('\n').filter(Boolean).map((l) => { try { return JSON.stringify({ ...JSON.parse(l), inst: 'vs-' + (ms % 3) }); } catch { return l; } }).join('\n') + '\n');
  }
  fs.writeFileSync(path.join(td, '.instance-id'), 'vs-fixture');
  return { dataDir, td };
}
const shardTexts = (td, re) => fs.readdirSync(td).filter((f) => re.test(f)).sort().slice(-3).map((f) => fs.readFileSync(path.join(td, f), 'utf-8'));
const J = (x) => JSON.stringify(x);

say('① PARITY — the same numbers as before, field for field');
{
  const { dataDir, td } = fixtureDir('parity');
  const T = new TEL.Telemetry({ dataDir, version: 't' });
  for (const days of [1, 14, 90]) {
    const w = await T.summary({ days, now: NOW }), pure = { ...TEL.summarizeEvents(shardTexts(td, TEL.SHARD_RE.events), { days, now: NOW }), instance: 'vs-fixture' };
    ok(J(w) === J(pure) && w.total > 0, `days=${days}: the worker's summary == the PURE aggregate over the three newest shards (total ${w.total}, ${Object.keys(w.byName).length} names, ${w.errors.length} error groups, held week ${w.loopHeld.week.ms} ms)`);
    const wc = await T.centralSummary({ days, now: NOW }), pc = TEL.summarizeCentral(shardTexts(td, TEL.SHARD_RE.central), { days, now: NOW });
    ok(J(wc) === J(pc) && wc.total > 0, `days=${days}: the fleet's — the worker's == the PURE aggregate (total ${wc.total}, ${Object.keys(wc.instances).length} instances)`);
  }
  // the release's own function: the base's src/telemetry.js (its summary on the loop), a copy — when the base is in this clone
  const BASE = '073cc4a1e';   // the release 2.369.413 (its src/telemetry.js = the train's base 944de13f9's but for one comment)
  let base = '';
  try { if (spawnSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: ROOT }).status === 0) base = execFileSync('git', ['show', `${BASE}:src/telemetry.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { base = ''; }
  if (!base) { skipped += 2; say(`  · SKIP 2: the base ${BASE} is not in this clone (a depth-1 checkout) — COUNTED, not passed`); }
  else {
    const MB = mutantCopies('tele-offloop-release', ROOT);
    const REL = require(MB.write('src/telemetry.js', base, 'release'));
    const RT = new REL.Telemetry({ dataDir, version: 't' });
    const diffs = [];
    for (const days of [1, 14, 90]) {
      const mine = await T.summary({ days, now: NOW }), rel = RT.summary({ days, now: NOW });
      for (const k of new Set([...Object.keys(mine), ...Object.keys(rel)])) if (J(mine[k]) !== J(rel[k])) diffs.push(`days ${days} · ${k}`);
    }
    ok(diffs.length === 0, `the release's own summary (the base ${BASE}, read on the loop, in a copy) gives the same answer, field for field, for days 1 / 14 / 90`, diffs);
    const cdiffs = [];
    // r887 (3): the release reads its own clock — it is handed the SAME instant as the worker (no window edge)
    for (const days of [1, 14, 90]) { const t = Date.now(), mine = await T.centralSummary({ days, now: t }); const real = Date.now; Date.now = () => t; let rel; try { rel = RT.centralSummary({ days }); } finally { Date.now = real; } for (const k of new Set([...Object.keys(mine), ...Object.keys(rel)])) if (J(mine[k]) !== J(rel[k])) cdiffs.push(`days ${days} · ${k}`); }
    ok(cdiffs.length === 0, 'the release\'s fleet summary likewise, field for field (the release\'s own clock held at the instant the worker is handed)', cdiffs);
    for (const r of copiesCensus(MB.files, MB.dir, ROOT, { minCopies: 1, label: 'B-360d tele ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
}

// ② the hold: the deadlines are the ones handed to the product (REPLY_MS an ask's, READ_MS the read's) and the pool is the suite's own
// (the product's worker script, a short hung-path memory HUNG_MS) — every bound is the mechanism's own constant
const { SafeFs } = require(path.join(ROOT, 'src/safe-fs.js'));
const WORKER = path.join(ROOT, 'src/telemetry-summary-worker.js');
const REPLY_MS = 300, READ_MS = 900, HUNG_MS = 600, WRITER_MS = 400, SLOW_MS = 700, SLOW_READ_MS = 3000;
const poolOf = (readMs) => { const P = new SafeFs({ workerPath: WORKER, name: 'telemetry-summary', poolSize: 1, timeouts: { default: readMs }, hungMs: HUNG_MS }); const call0 = P.call.bind(P); P.calls = 0; P.call = (...a) => { P.calls++; return call0(...a); }; return P; };
const until = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await sleep(10); return cond(); };
say('② THE HOLD PLACED, NEVER ANSWERED (a FIFO no one writes, as the newest events shard)');
WD.section('②');
{
  const { dataDir, td } = fixtureDir('hold');
  const fifo = path.join(td, `events-${month(NOW + 31 * D)}.ndjson`); mkfifo(fifo);   // the NEWEST shard: the worker opens it
  const P = poolOf(READ_MS);
  const T = new TEL.Telemetry({ dataDir, version: 't', summaryTimeoutMs: REPLY_MS, summaryReadMs: READ_MS, summaryPool: P });
  const g = await loopGap(async () => {
    const first = T.summary({ days: 14, now: NOW });
    await sleep(20);
    const second = T.summary({ days: 14, now: NOW });
    const out = await Promise.allSettled([first, second]);
    return { out, reads: T._asks.size, calls: P.calls };
  });
  const [a, b] = g.out ? g.out.out : [];
  ok(g.max < REPLY_MS, `the loop keeps turning while the worker's open never returns: its longest gap ${g.max} ms, under an ask's reply deadline (${REPLY_MS} ms)`);
  ok(!!a && a.status === 'rejected' && !!a.reason && a.reason.status === 503 && a.reason.code === 'still-reading' && !!b && b.status === 'rejected' && !!b.reason && b.reason.code === 'still-reading',
    `each ask ends at its REPLY deadline: a 503 that says the files are still being read («${a && a.reason ? a.reason.message : a && a.status}»)`);
  ok(!!g.out && g.out.reads === 1 && g.out.calls === 1, `the second ask rode the SAME read (one read in flight, ${g.out && g.out.calls} call to the pool) — and the read goes on after both replies`);
  const ended = await until(() => T._asks.size === 0);
  const r0 = P._restarts;
  let hung = null; try { await T.summary({ days: 14, now: NOW }); } catch (e) { hung = e; }
  ok(ended && !!hung && hung.status === 503 && hung.code === 'path-hung' && P._restarts === r0 && P.calls === 2,
    `the READ's own deadline (${READ_MS} ms) ended its worker; the next ask is refused BY NAME, the folder not asked again for its bounded time — no new worker, no thread parked (${hung && hung.code}: «${hung && hung.message}»)`);
  freeFifo(fifo);
  let again = null, refused = 0, other = null;
  for (let i = 0; i < 300 && !again && !other; i++) {
    try { again = await T.summary({ days: 14, now: NOW }); }
    catch (e) { if (e && e.status === 503 && (e.code === 'path-hung' || e.code === 'no-worker')) { refused++; await sleep(20); } else other = e; }
  }
  ok(!other && !!again && again.total > 0, `after its bound, once the storage answers and the pool has its worker again, the next ask is read again (${refused} ask(s) refused by name meanwhile; total ${again && again.total})`, other && other.message);
}

say('③ RED CONTROL — this tree\'s summary read on the loop (a copy), the same FIFO answered after 400 ms');
{
  const TSRC = fs.readFileSync(path.join(ROOT, 'src/telemetry.js'), 'utf-8');
  const ANCHOR = "    return this._offLoop('telemetrySummary', { path: this.dir, days, now }).then((r) => ({ ...r, instance: this._instanceId() }));\n";
  ok(TSRC.split(ANCHOR).length === 2, 'control setup: the summary asks its worker on one line');
  const MC = mutantCopies('tele-offloop-onloop', ROOT);
  const ON = require(MC.write('src/telemetry.js', anchored(TSRC, ANCHOR, "    { const texts = fs.readdirSync(this.dir).filter((f) => SHARD_RE.events.test(f)).sort().slice(-3).map((f) => fs.readFileSync(path.join(this.dir, f), 'utf-8')); return Promise.resolve({ ...summarizeEvents(texts, { days, now }), instance: this._instanceId() }); }   // MUTANT: the release's road — read and summed on the loop\n", 'tele-on-loop'), 'on-loop'));
  async function delayed(Mod, tag) {
    const { dataDir, td } = fixtureDir(tag);
    const f = path.join(td, `events-${month(NOW + 31 * D)}.ndjson`); mkfifo(f);
    const writer = spawn(process.execPath, ['-e', `process.stdout.write('ready\\n'); setTimeout(() => { const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(f)}, 'w'); fs.closeSync(fd); }, ${WRITER_MS});`], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((r, j) => { writer.stdout.once('data', r); writer.once('error', j); });
    const T = new Mod.Telemetry({ dataDir, version: 't', summaryTimeoutMs: 10 * WRITER_MS });
    const g = await loopGap(() => T.summary({ days: 14, now: NOW }));
    await new Promise((r) => (writer.exitCode != null ? r() : writer.once('exit', r)));
    return { ...g, total: g.out ? g.out.total : null };
  }
  const rel = await delayed(ON, 'onloop'), mine = await delayed(TEL, 'mine');
  ok(rel.max >= WRITER_MS * 0.8, `CONTROL (the summary read on the loop, in a copy): the loop is HELD while the open waits — its longest gap ${rel.max} ms (the writer answered at ${WRITER_MS} ms)`);
  ok(mine.max < rel.max / 4 && mine.total === rel.total && mine.total > 0, `this tree, the same FIFO: the longest gap ${mine.max} ms, under a quarter of the control's ${rel.max} ms measured in this run; the same total (${mine.total})`);
  for (const r of copiesCensus(MC.files, MC.dir, ROOT, { minCopies: 1, label: 'B-360d tele ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

say('④ CENSUS');
{
  const TSRC = fs.readFileSync(path.join(ROOT, 'src/telemetry.js'), 'utf-8');
  const a = TSRC.indexOf('  summary({ days = 14, now = Date.now() } = {}) {'), b = TSRC.indexOf('\n  _instanceId() {', a);
  const methods = a > 0 && b > a ? TSRC.slice(a, b) : '';
  const sync = methods.match(/\bfs\.[a-zA-Z]+Sync\(/g) || [];
  ok(methods.length > 300 && sync.length === 0 && !/function summarizeEvents[\s\S]*\bfs\./.test(TSRC.slice(TSRC.indexOf('function summarizeEvents('), TSRC.indexOf('function summarizeCentral('))), `the two summary methods hold ${sync.length} synchronous file call(s); the PURE aggregate reads no file`, sync);
  const WK = fs.readFileSync(path.join(ROOT, 'src/telemetry-summary-worker.js'), 'utf-8'), SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf-8'), AU = fs.readFileSync(path.join(ROOT, 'src/server/account-usage-routes.js'), 'utf-8');
  ok(/T\.summarizeEvents\(shardsOf\(dir, T\.SHARD_RE\.events\)/.test(WK) && /T\.summarizeCentral\(shardsOf\(dir, T\.SHARD_RE\.central\)/.test(WK) && WK.includes('const { path: dir, days, now } = payload;'), 'the worker reads the shards and sums them through the same PURE functions; the folder rides as `path` (the pool\'s mount door and hung-path memory read it)');
  ok(/_offLoop\('telemetrySummary', \{ path: this\.dir, days, now \}\)/.test(TSRC) && /_offLoop\('centralSummary', \{ path: this\.dir, days, now \}\)/.test(TSRC) && /timeouts: \{ default: SUMMARY_READ_MS \}/.test(TSRC), 'both summaries hand the folder as `path`; the product pool\'s deadline is the READ\'s (an ask\'s reply has its own)');
  ok(/app\.get\('\/api\/telemetry\/summary', async \(req, res\) =>/.test(SRV) && /res\.json\(\{ \.\.\.\(await telemetry\.summary\(/.test(SRV) && /app\.get\('\/api\/telemetry\/central-summary', async \(req, res\) =>/.test(AU) && /\.\.\.\(await telemetry\.centralSummary\(/.test(AU),
    'both routes await the worker\'s answer (the report\'s `?drift=1` fields ride beside it, pinned by test-spend-paths)');
}
const TSRC5 = fs.readFileSync(path.join(ROOT, 'src/telemetry.js'), 'utf-8');
const M5 = mutantCopies('tele-offloop-r887', ROOT);
const copyOf = (anchor, edit, tag) => { ok(TSRC5.split(anchor).length === 2, `control setup (${tag}): its line is in src/telemetry.js once`); return require(M5.write('src/telemetry.js', anchored(TSRC5, anchor, edit, tag), tag)); };

say('⑤ A SLOW DISK THAT IS ALIVE (r887 5): the read outlives its ask\'s reply and is KEPT for the next ask');
WD.section('⑤');
{
  const KEEP = "      r.p.then((value) => { done(); if (!r.waiting) this._kept.set(k, { at: Date.now(), value }); }, done);   // no ask left to take it: kept\n";
  const NOKEEP = copyOf(KEEP, "      r.p.then(() => done(), done);   // MUTANT: the late answer is thrown away\n", 'tele-no-keep');
  async function slow(Mod, tag) {
    const { dataDir, td } = fixtureDir(tag);
    const f = path.join(td, `events-${month(NOW + 31 * D)}.ndjson`); mkfifo(f);
    const row = JSON.stringify({ ts: NOW - 1000, kind: 'event', name: 'slow-disk', version: '2.369.414' }) + '\n';
    // the disk answers, but after SLOW_MS — past an ask's reply deadline, inside the read's own
    const writer = spawn(process.execPath, ['-e', `process.stdout.write('ready\\n'); setTimeout(() => { const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(f)}, 'w'); fs.writeSync(fd, ${JSON.stringify(row)}); fs.closeSync(fd); }, ${SLOW_MS});`], { stdio: ['ignore', 'pipe', 'inherit'] });
    writers.add(writer); writer.once('exit', () => writers.delete(writer));
    await new Promise((r, j) => { writer.stdout.once('data', r); writer.once('error', j); });
    const P = poolOf(SLOW_READ_MS);
    const T = new Mod.Telemetry({ dataDir, version: 't', summaryTimeoutMs: REPLY_MS, summaryReadMs: SLOW_READ_MS, summaryPool: P });
    let first = null; try { await T.summary({ days: 14, now: NOW }); } catch (e) { first = e; }
    await new Promise((r) => (writer.exitCode != null ? r() : writer.once('exit', r)));
    const settled = await until(() => T._asks.size === 0);
    let second = null, err = null; try { second = await T.summary({ days: 14, now: NOW }); } catch (e) { err = e; }
    return { first, settled, second, err, calls: P.calls };
  }
  const mine = await slow(TEL, 'slow'), rel = await slow(NOKEEP, 'slow-m');
  ok(!!mine.first && mine.first.code === 'still-reading' && mine.settled && !!mine.second && !!mine.second.byName && mine.second.byName['event:slow-disk'] === 1 && mine.calls === 1,
    `the first ask is told «still being read» at its reply deadline; the read finishes (${SLOW_MS} ms) and the NEXT ask gets that report — with no read of its own (${mine.calls} call to the pool)`, { first: mine.first && mine.first.code, settled: mine.settled, slow: mine.second && mine.second.byName ? mine.second.byName['event:slow-disk'] : null, err: mine.err && mine.err.message, calls: mine.calls });
  ok(!rel.second && !!rel.err && rel.err.status === 503 && rel.calls === 2, `RED CONTROL (a copy that throws the late answer away): the next ask reads again and is not answered either (${rel.err && rel.err.code}) — on such a disk the report could never be shown`, { calls: rel.calls, err: rel.err && rel.err.message });
}

say('⑥ DIFFERENT ASKS TOGETHER (r887 2): each its own reply');
WD.section('⑥');
{
  const KEYLINE = "    const k = `${op}|${payload.days}`;\n";
  const NODAYS = copyOf(KEYLINE, "    const k = `${op}`;   // MUTANT: the key drops the days\n", 'tele-key-no-days');
  async function together(Mod, tag) {
    const { dataDir, td } = fixtureDir(tag);
    const T = new Mod.Telemetry({ dataDir, version: 't', summaryPool: poolOf(SLOW_READ_MS) });
    const [s1, s14, c14, c1] = await Promise.all([T.summary({ days: 1, now: NOW }), T.summary({ days: 14, now: NOW }), T.centralSummary({ days: 14, now: NOW }), T.centralSummary({ days: 1, now: NOW })]);
    const ev = shardTexts(td, TEL.SHARD_RE.events), ce = shardTexts(td, TEL.SHARD_RE.central);
    const want = { s1: { ...TEL.summarizeEvents(ev, { days: 1, now: NOW }), instance: 'vs-fixture' }, s14: { ...TEL.summarizeEvents(ev, { days: 14, now: NOW }), instance: 'vs-fixture' }, c14: TEL.summarizeCentral(ce, { days: 14, now: NOW }), c1: TEL.summarizeCentral(ce, { days: 1, now: NOW }) };
    const got = { s1, s14, c14, c1 };
    return Object.keys(want).filter((k) => J(got[k]) !== J(want[k]));
  }
  const mine = await together(TEL, 'together'), rel = await together(NODAYS, 'together-m');
  ok(mine.length === 0, 'the report\'s days 1 and 14 and the fleet\'s days 14 and 1, asked together: each gets its own answer (== the PURE aggregate for its days)', mine);
  ok(rel.length >= 2, `RED CONTROL (a copy whose key drops the days): asks of different days share one answer — wrong: ${rel.join(', ')}`, rel);
}
for (const r of copiesCensus(M5.files, M5.dir, ROOT, { minCopies: 2, label: 'B-360d tele r887 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say('⑦ THE PAGE (r887, THE MUST): an answer that is no report is SAID, never drawn as a clean report');
WD.section('⑦');
{
  const DASRC = fs.readFileSync(path.join(ROOT, 'src/lib/diagnostics-answer.js'), 'utf-8');
  const DA = require(path.join(ROOT, 'src/lib/diagnostics-answer.js'));
  const { dataDir } = fixtureDir('page');
  const T = new TEL.Telemetry({ dataDir, version: 't', summaryPool: poolOf(SLOW_READ_MS) });
  const report = await T.summary({ days: 14, now: NOW }), fleet = { collector: true, ...(await T.centralSummary({ days: 14, now: NOW })) };
  const REFUSED = { error: "the Diagnostics report's files did not answer in time (still being read — more than 20 s so far)" };
  const r1 = DA.reportRefusal(REFUSED), r2 = DA.reportRefusal(null), r3 = DA.reportRefusal({ ok: true });
  ok(!!r1 && r1.why === REFUSED.error && !!r2 && r2.why === null && !!r3 && r3.why === null && DA.reportRefusal(report) === null,
    'the route\'s refusal (with its words), nothing at all, and an answer with no report in it are each REFUSED; a real report is drawn');
  const f1 = DA.fleetRefusal({ collector: true, error: 'x' }), f2 = DA.fleetRefusal({ collector: false, error: 'x' }), f3 = DA.fleetRefusal(null);
  ok(!!f1 && f1.say === true && f1.why === 'x' && !!f2 && f2.say === false && !!f3 && f3.say === true && DA.fleetRefusal(fleet) === null && DA.fleetRefusal({ collector: false, total: 0, instances: {} }) === null,
    'the fleet\'s refusal says one line (on a collector, or when nothing came back); an instance that is no collector stays silent; a real fleet answer is drawn');
  const TODAY = "  if (d.error) return { why: String(d.error) };\n  if (!Number.isFinite(d.total)) return { why: null };   // no report in it: never drawn as one\n";
  ok(DASRC.split(TODAY).length === 2, 'control setup: the refusal lines are in the verdict once');
  const MD = mutantCopies('tele-offloop-page', ROOT);
  const OLD = require(MD.write('src/lib/diagnostics-answer.js', anchored(DASRC, TODAY, '  /* MUTANT: today\'s check — nothing at all only */\n', 'page-today'), 'page-today'));
  ok(OLD.reportRefusal(REFUSED) === null, 'RED CONTROL (today\'s check, `!d` only, in a copy): the route\'s refusal is DRAWN as a report — «No errors recorded — nothing crashed in this window»');
  for (const r of copiesCensus(MD.files, MD.dir, ROOT, { minCopies: 1, label: 'B-360d page ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  const SF = fs.readFileSync(path.join(ROOT, 'src/lib/setup-flows.js'), 'utf-8');
  const at = SF.indexOf('    const refused = reportRefusal(d);'), draw = SF.indexOf('const errs = (d.errors || [])');
  ok(at > 0 && draw > at && /if \(refused\) \{ showToast\([\s\S]{0,400}?\{ type: 'error' \}\); return; \}/.test(SF.slice(at, draw)) && SF.includes('const fr = fleetRefusal(c);'),
    'the Diagnostics window asks the verdict BEFORE drawing anything (a refusal = a toast with what to do, then nothing drawn); its fleet block asks the fleet\'s verdict');
  const KEYS = ['The Diagnostics report could not be read just now.', 'Wait a moment and open it again.', 'The fleet\'s telemetry could not be read just now — open the report again in a moment.'];
  const ZH = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf-8'), JA = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf-8');
  const lit = (k) => JSON.stringify(k) + ':';
  ok(KEYS.every((k) => SF.includes(`t('${k.replace(/'/g, "\\'")}')`) && ZH.includes(lit(k)) && JA.includes(lit(k))), 'its words are t() keys with zh and ja entries');
  const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf-8'), AU = fs.readFileSync(path.join(ROOT, 'src/server/account-usage-routes.js'), 'utf-8');
  ok(/res\.status\(e && e\.status === 503 \? 503 : 500\)\.json\(\{ error: e && e\.status === 503 \? `the Diagnostics report's files did not answer in time/.test(SRV)
    && /res\.status\(e && e\.status === 503 \? 503 : 500\)\.json\(\{ collector: !!TELEMETRY_INGEST_TOKEN, error: e && e\.status === 503 \? `the fleet's telemetry files did not answer in time/.test(AU),
    'both routes answer a 503 as a 503 with their words (the fleet\'s refusal says whether this instance is a collector)');
}
say(`\n${failed ? `${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `ALL PASS (${passed}${skipped ? `; ${skipped} SKIPPED — the base not in this clone` : ''})`}`);
process.exit(failed ? 1 : 0);
