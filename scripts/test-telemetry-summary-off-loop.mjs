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
//      turning, the ask ends at its deadline (503), a second ask meanwhile rides the same one
//   ③ RED CONTROL — this tree's summary read on the loop (a copy): the same FIFO, answered by a writer after 400 ms, holds the loop
//   ④ CENSUS: no synchronous file call in the two summary methods; the worker is the shards' one reader; both routes await
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
const fifos = [];
process.on('exit', () => { for (const f of fifos) freeFifo(f); try { fs.rmSync(ROOTDIR, { recursive: true, force: true }); } catch { } });
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
  const BASE = '944de13f9';
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
    for (const days of [1, 14, 90]) { const t = Date.now(), mine = await T.centralSummary({ days, now: t }), rel = RT.centralSummary({ days }); for (const k of new Set([...Object.keys(mine), ...Object.keys(rel)])) if (J(mine[k]) !== J(rel[k])) cdiffs.push(`days ${days} · ${k}`); }
    ok(cdiffs.length === 0, 'the release\'s fleet summary likewise, field for field (the release reads its own clock: the worker is handed the same one)', cdiffs);
    for (const r of copiesCensus(MB.files, MB.dir, ROOT, { minCopies: 1, label: 'B-360d tele ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
}

// ② the hold: the deadline is the one handed to the product (SUMMARY_MS), so the bound is the mechanism's own constant
const SUMMARY_MS = 400, WRITER_MS = 400;
say('② THE HOLD PLACED, NEVER ANSWERED (a FIFO no one writes, as an events shard)');
{
  const { dataDir, td } = fixtureDir('hold');
  const fifo = path.join(td, `events-${month(NOW + 31 * D)}.ndjson`); mkfifo(fifo);   // the NEWEST shard: the worker opens it
  const T = new TEL.Telemetry({ dataDir, version: 't', summaryTimeoutMs: SUMMARY_MS });
  let second = null;
  const g = await loopGap(async () => {
    const first = T.summary({ days: 14, now: NOW });
    await new Promise((r) => setTimeout(r, 20));
    const inFlight = T._asks.size;
    second = T.summary({ days: 14, now: NOW });
    const out = await Promise.allSettled([first, second]);
    return { inFlight, out };
  });
  const [a, b] = g.out ? g.out.out : [];
  ok(g.max < SUMMARY_MS, `the loop keeps turning while the worker's open never returns: its longest gap ${g.max} ms, under the ask's whole deadline (${SUMMARY_MS} ms — a held loop would wait at least that)`);
  ok(!!a && a.status === 'rejected' && a.reason && a.reason.status === 503, `the ask ends at its deadline, a 503 (${a && a.reason ? a.reason.message : a && a.status})`);
  ok(!!(g.out && g.out.inFlight === 1 && b && b.status === 'rejected' && b.reason === a.reason), 'a second ask meanwhile rides the SAME one (one in flight a window; the same answer — here the same refusal)');
  freeFifo(fifo);
  // the pool ended its worker at the deadline and respawns it after its backoff (src/safe-fs.js): an ask meanwhile is REFUSED BY
  // NAME (503 no-worker, never run on the loop) — the suite waits for the worker, on the pool's own answer
  let again = null, refused = 0, other = null;
  for (let i = 0; i < 200 && !again && !other; i++) {
    try { again = await T.summary({ days: 14, now: NOW }); }
    catch (e) { if (e && e.code === 'no-worker' && e.status === 503) { refused++; await new Promise((r) => setTimeout(r, 20)); } else other = e; }
  }
  ok(!other && !!again && again.total > 0, `once the storage answers and the pool has its worker again (${refused} ask(s) refused by name meanwhile: 503, no-worker), the next ask is read again (total ${again && again.total})`, other && other.message);
}

say('③ RED CONTROL — this tree\'s summary read on the loop (a copy), the same FIFO answered after 400 ms');
{
  const TSRC = fs.readFileSync(path.join(ROOT, 'src/telemetry.js'), 'utf-8');
  const ANCHOR = "    return this._offLoop('telemetrySummary', { dir: this.dir, days, now }).then((r) => ({ ...r, instance: this._instanceId() }));\n";
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
  ok(/T\.summarizeEvents\(shardsOf\(dir, T\.SHARD_RE\.events\)/.test(WK) && /T\.summarizeCentral\(shardsOf\(dir, T\.SHARD_RE\.central\)/.test(WK), 'the worker reads the shards and sums them through the same PURE functions');
  ok(/app\.get\('\/api\/telemetry\/summary', async \(req, res\) =>/.test(SRV) && /res\.json\(\{ \.\.\.\(await telemetry\.summary\(/.test(SRV) && /app\.get\('\/api\/telemetry\/central-summary', async \(req, res\) =>/.test(AU) && /\.\.\.\(await telemetry\.centralSummary\(/.test(AU),
    'both routes await the worker\'s answer (the report\'s `?drift=1` fields ride beside it, pinned by test-spend-paths)');
}
say(`\n${failed ? `${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `ALL PASS (${passed}${skipped ? `; ${skipped} SKIPPED — the base not in this clone` : ''})`}`);
process.exit(failed ? 1 : 0);
