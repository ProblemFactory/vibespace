#!/usr/bin/env node
// THE PROCESS TABLE'S CPU SAMPLE READS OFF THE LOOP (B-360d, lane bl-keys-misc — the coordinator's r1072: «the per-process CPU
// sample read synchronously for the whole table; the panel's redraw cadence: measure first; the larger is your next unit»). Measured
// on the test machine: at the owner's 2 400 processes the sample's /proc/<pid>/stat reads took 32–35 ms SYNCHRONOUSLY on the hub's
// loop, against the table's parse 2–7 ms and the cap 0.5–6 ms — every 5 s while the System panel is open (its cadence, the
// multiplier). THE LAW: the sample reads through fs.promises, in slices of SAMPLE_SLICE, each slice's answers parsed in one short
// turn; the parse of a stat line is the PURE statTicks; one instant for the whole table; the whole table sampled BEFORE the cap.
//   ① PARITY: statTicks reads a stat line as the release's inline parse did (a comm with spaces and parens; this process's own)
//   ② OFF THE LOOP at 2 400 rows over this machine's real pids (cycled): the loop's longest gap while the sample runs, against the
//      release's synchronous sample in a copy measured in the same run (RED: the copy holds the loop); both sample the same rows
//   ③ listProcs samples the WHOLE table before it caps, and answers `sampled`
//   ⑤ (r1316) ONE SAMPLE IN FLIGHT: two asks at once read each stat file ONCE (the second joins); RED: a copy without the join reads
//      twice
//   ⑥ (r1316) THE BOUND: a pool that never answers — the ask answers «not sampled» at its bound, a second ask joins that flight (no
//      new reads); RED: a copy without the bound never answers
//   ④ CENSUS: no synchronous read left in the sample
// r5360 (2.369.422's first proof, run 45914950208: ② red then green on Node 24 — «4.9 ms … under a third of the release's 13.5 ms», placed by
// r4212's own printed facts as ONE stray stall: 1 of 67 gaps over the bound, none at a slice's start, no read started inside it): ② JUDGES A
// HOLD BY WHAT A HOLD IS. «Over» is the law's bound, unmoved (a third of the release's hold measured in this run); a gap over it that HELD A
// SLICE's START (a stat read started inside it: the tree's own turn) is a HOLD, and so are gaps over it at half the slices or more — RED; a gap
// over it with no read started inside it is a STRAY STALL of the machine: printed, counted by name, judged nothing — more than STRAY_MAX of
// them in one run is NO READING (a skip the gate counts, never a green). The old single number (the longest gap alone) is gone, and with it the
// second clause «under half its own wall» (a stray stall crossed both). RED (new): a copy whose slices read SYNCHRONOUSLY, 1200 a slice (r5412: half the scene's rows) —
// a hold at each slice's start — is a hold by the rule, so the leg did not become blind
// r5412 (the coordinator's ruling on that rule's two reds on the first test machine — the tree's own slice turn of ~3 ms against a third of
// a 9 ms release hold: the law ILL-CONDITIONED on a fast machine, the product holding nothing): neither the product's slice nor the law's numbers
// move (a third of the release's hold; under half its own time) — THE SCENE IS SIZED BY ITS OWN YARDSTICK: the rows double from 2 400, the
// release copy measured again at each size, until its hold is at least FLOOR_MS (a third of it then three times a slice's own turn), up to
// ROWS_MAX; a run that cannot reach the floor at the ceiling is a named NO READING (a skip the gate counts). The RED control's synchronous
// slice is HALF THE ROWS reached, a hold at every size; and r5360's dropped second clause comes back as the hold rule's third arm: a gap of
// half the sample's own time or more in which a read started is a HOLD (the law's second number, unmoved; a stray stall still judges nothing)
// r4212 (the 2.369.419 candidate's hosted run 45584145109: ② red on BOTH tries in the Node 24 fast job, one of four parallel lanes
// at load 6.1 on a four-core runner; green in the Node 22 job): ② judges two clocks, so the suite runs in the fast tier's SERIAL
// lane (scripts/ci.mjs FAST_SERIAL: after the parallel lanes drain, alone); its number is unchanged; and ② PRINTS what tells a
// hold from a stray stall (they judge nothing): the slice out when the longest gap closed and the stat reads started inside it
// (a slice starts its 128 reads in ONE turn, the turn that parsed the slice before it), how many gaps passed the bound and how
// many of those held a slice's start, and the collector's pauses inside the timed window (perf_hooks «gc» entries)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0, skipped = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return c; }
const WD = armWatchdog({ capMs: 30e3 });
const SI = require(path.join(ROOT, 'src/sysinfo.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'src/sysinfo.js'), 'utf8');
const LINUX = process.platform === 'linux';
// the release's inline parse of one stat line (src/sysinfo.js before this unit), the parity's other side
const releaseParse = (st) => { const close = st.lastIndexOf(')'); if (close < 0) return null; const rest = st.slice(close + 2).split(' '); return { ticks: (parseInt(rest[11], 10) || 0) + (parseInt(rest[12], 10) || 0), start: rest[19] }; };

say('① PARITY — statTicks reads a stat line as the release did');
WD.section('①');
{
  const odd = '4242 (we (ird) name) S 1 4242 4242 0 -1 4194304 100 0 0 0 1234 567 0 0 20 0 8 0 987654 1000000 200 18446744073709551615';
  ok(JSON.stringify(SI.statTicks(odd)) === JSON.stringify(releaseParse(odd)) && SI.statTicks(odd).ticks === 1801 && SI.statTicks(odd).start === '987654', 'a comm with spaces and parens: utime + stime and the start time read after the LAST «)»', SI.statTicks(odd));
  ok(SI.statTicks('no paren here') === null && releaseParse('no paren here') === null, 'a line with no «)» is no stat line on both');
  if (LINUX) { const self = fs.readFileSync('/proc/self/stat', 'utf8'); ok(JSON.stringify(SI.statTicks(self)) === JSON.stringify(releaseParse(self)), 'this process\'s own /proc/self/stat, read alike'); }
}

// THE RELEASE'S SAMPLE, in a copy: the synchronous loop over the whole table (its body before this unit)
const ASYNC_A = SRC.indexOf('async function sampleRun(pids) {'), ASYNC_B = SRC.indexOf('\n  return any;\n}', SRC.indexOf('async function sampleProcCpu(rows, ', ASYNC_A));
const ASYNC_FN = ASYNC_A > 0 && ASYNC_B > ASYNC_A ? SRC.slice(ASYNC_A, ASYNC_B + '\n  return any;\n}'.length) : '';
const RELEASE_FN = `function sampleProcCpu(rows) {
  if (process.platform !== 'linux') return false;
  const now = Date.now();
  const seen = new Set();
  let any = false;
  for (const r of rows) {
    try {
      const st = fs.readFileSync('/proc/' + r.pid + '/stat', 'utf8');
      const t = statTicks(st);
      if (!t) continue;
      const key = r.pid + ':' + t.start;
      seen.add(key);
      const prev = _procCpu.get(key);
      _procCpu.set(key, { ticks: t.ticks, at: now });
      if (prev && now > prev.at) { r.pcpuNow = Math.max(0, Math.round(((t.ticks - prev.ticks) / 100) / ((now - prev.at) / 1000) * 1000) / 10); any = true; }
    } catch { }
  }
  if (_procCpu.size > 2000) for (const k of _procCpu.keys()) if (!seen.has(k)) _procCpu.delete(k);
  return any;
}   /* MUTANT: the release's synchronous sample */`;

say('② OFF THE LOOP — from the owner\'s 2 400 processes up (r5412: the scene sized by the release\'s hold)');
WD.section('②');
if (!LINUX) { skipped++; say('  · SKIP ②: no /proc on this platform — COUNTED, not passed'); }
else {
  ok(ASYNC_FN.length > 300, 'control setup: the sample is one function in the module');
  const M = mutantCopies('sysinfo-sample', ROOT);
  const REL = require(M.write('src/sysinfo.js', anchored(SRC, ASYNC_FN, RELEASE_FN, 'release-sample'), 'release-sample'));
  const pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
  const ROWS0 = 2400, FLOOR_MS = 30, ROWS_MAX = ROWS0 * 32;   // r5412: the scene's start, the release hold's floor, the rows' ceiling
  let ROWS = ROWS0;
  const rowsOf = () => Array.from({ length: ROWS }, (_, i) => ({ pid: pids[i % pids.length], rss: i, pcpu: 0 }));
  // r4212's prints: every stat read counted on the shared fs.promises.readFile (as ⑤ does; the product reads through it), every
  // gap the meter takes kept with the reads started when it closed, the collector's pauses observed over this tree's run
  let statReads = 0;
  const rfm = fs.promises.readFile, rfs = fs.readFileSync;
  const countSync = (on) => { fs.readFileSync = on ? function (p, ...a) { if (typeof p === 'string' && p.startsWith('/proc/') && p.endsWith('/stat')) statReads++; return rfs.call(this, p, ...a); } : rfs; };
  fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && p.startsWith('/proc/') && p.endsWith('/stat')) statReads++; return rfm.call(this, p, ...a); };
  const gcs = [], gcObs = new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push({ start: e.startTime, end: e.startTime + e.duration }); });
  const gapOf = async (fn) => { const r0 = statReads, gaps = []; let last = performance.now(), max = 0; const t = setInterval(() => { const n = performance.now(); gaps.push({ ms: n - last, reads: statReads - r0, at: n }); max = Math.max(max, n - last); last = n; }, 1); const t0 = performance.now(); let out; try { out = await fn(); } finally { clearInterval(t); } const tail = performance.now(); gaps.push({ ms: tail - last, reads: statReads - r0, at: tail }); max = Math.max(max, tail - last); return { max: +max.toFixed(1), took: +(performance.now() - t0).toFixed(1), out, gaps, from: t0 }; };
  const run = async (Mod) => { const a = rowsOf(); await Mod.sampleProcCpu(a); await new Promise((r) => setTimeout(r, 30)); const b = rowsOf(); const g = await gapOf(() => Promise.resolve(Mod.sampleProcCpu(b))); return { max: g.max, took: g.took, sampled: g.out, live: b.filter((r) => typeof r.pcpuNow === 'number').length, gaps: g.gaps, from: g.from }; };
  let rel, mine; const sizes = [];
  try {
    // r5412: THE SCENE's SIZE — the release copy's hold measured at each size, doubling from ROWS0 until it reaches FLOOR_MS or ROWS_MAX
    for (;;) { rel = await run(REL); sizes.push(`${ROWS} rows: ${rel.max} ms`); if (rel.max >= FLOOR_MS || ROWS >= ROWS_MAX) break; ROWS *= 2; }
    gcObs.observe({ entryTypes: ['gc'] });
    mine = await run(SI);
    await new Promise((r) => setTimeout(r, 20));   // a pause's entry reaches the observer a turn or two after it (the prints only)
    for (const e of (typeof gcObs.takeRecords === 'function' ? gcObs.takeRecords() : [])) gcs.push({ start: e.startTime, end: e.startTime + e.duration });
  } finally { gcObs.disconnect(); }
  ok(rel.max >= rel.took * 0.8, `CONTROL (the release's synchronous sample, in a copy): the loop is HELD for the whole sample — its longest gap ${rel.max} ms of its ${rel.took} ms (one turn) over ${ROWS} stat files`);
  say(`    the scene (r5412): ${ROWS} rows — the release's hold ${rel.max} ms against the floor ${FLOOR_MS} ms (sizes read: ${sizes.join(' · ')}; ceiling ${ROWS_MAX})`);
  say(`    the sample's wall time at ${ROWS} rows (slices of ${SI.SAMPLE_SLICE}): ${mine.took} ms off the loop; the release's ${rel.took} ms in one turn`);
  const yardstick = rel.max >= FLOOR_MS;   // r5412: the law is judged only where its yardstick is long enough to mean something
  // r5360: THE HOLD RULE — «over» = the law's bound (a third of the release's hold in this run); a hold = a gap over it in which a stat read
  // started (a slice's start: the tree's own turn held the loop), or gaps over it at half the slices or more; any other gap over it is a stray
  // stall of the machine (counted, said, judged nothing); more than STRAY_MAX strays in one run is NO READING
  const STRAY_MAX = 3, bound = rel.max / 3;
  const judge = (r, slice) => {
    const slices = Math.ceil(ROWS / slice), gaps = r.gaps.map((g, i) => ({ ms: g.ms, started: g.reads - (i ? r.gaps[i - 1].reads : 0), slice: Math.ceil(g.reads / slice) }));
    const over = gaps.filter((g) => g.ms > bound), atStart = over.filter((g) => g.started > 0), stray = over.filter((g) => g.started === 0), many = over.length >= Math.ceil(slices / 2);
    // the law's second number (r5412: it stays): a gap of half the sample's own time in which a read started (the tree's own turn) is a hold;
    // a stray stall still judges nothing (the rule as built)
    const half = gaps.filter((g) => g.started > 0 && g.ms >= r.took / 2).length;
    return { slices, gaps: gaps.length, over: over.length, atStart: atStart.length, stray, many, half, verdict: atStart.length || many || half ? 'hold' : stray.length > STRAY_MAX ? 'no-reading' : 'pass' };
  };
  const facts = (j) => `${j.over} of ${j.gaps} gaps over the bound ${bound.toFixed(1)} ms: ${j.atStart} at a slice's start (a read started inside it), ${j.stray.length} stray; ${j.half} of half its own time at a slice's start; ${j.slices} slices`;
  const J = judge(mine, SI.SAMPLE_SLICE);
  if (!yardstick) { skipped++; say(`  · NO READING ②: the release's hold reached ${rel.max} ms at the ceiling of ${ROWS} rows, short of the floor ${FLOOR_MS} ms — the yardstick is too short to judge a hold here; COUNTED, not passed — ${facts(J)}`); }
  else if (J.verdict === 'no-reading') { skipped++; say(`  · NO READING ②: ${J.stray.length} stray stalls in one run (more than ${STRAY_MAX}) — the machine was too noisy to judge a hold; COUNTED, not passed — ${facts(J)}`); }
  else ok(J.verdict === 'pass', `this tree: the reads off the loop, in slices of ${SI.SAMPLE_SLICE} — no gap over a third of the release's ${rel.max} ms held a slice's start, not half the slices had one, and no gap held half its own time (${facts(J)}; the longest gap ${mine.max} ms of its ${mine.took} ms, ${ROWS} rows)`, { verdict: J.verdict, atStart: J.atStart, many: J.many, half: J.half });
  if (J.stray.length) say(`    stray stalls of the machine (judged nothing, counted: ${J.stray.length} of at most ${STRAY_MAX}): ${J.stray.map((g) => `${g.ms.toFixed(1)} ms while slice ${g.slice} was out`).join(' · ')}`);
  {   // r4212: what tells a hold from a stray stall (they judge nothing): a hold shows at EVERY slice's start, a stray stall in one gap
    const slices = Math.ceil(ROWS / SI.SAMPLE_SLICE), bound = rel.max / 3;
    const gaps = mine.gaps.map((g, i) => ({ ms: g.ms, at: g.at, started: g.reads - (i ? mine.gaps[i - 1].reads : 0), slice: Math.ceil(g.reads / SI.SAMPLE_SLICE) }));
    const top = gaps.reduce((a, b) => (b.ms > a.ms ? b : a)), over = gaps.filter((g) => g.ms > bound);
    const inside = (e, from, to) => Math.max(0, Math.min(to, e.end) - Math.max(from, e.start));
    const gcIn = gcs.map((e) => inside(e, mine.from, mine.from + mine.took)).filter(Boolean), gcTop = gcs.reduce((s, e) => s + inside(e, top.at - top.ms, top.at), 0);
    say(`    what tells a hold from a stray stall (r4212, ${process.version}): the longest gap ${top.ms.toFixed(1)} ms closed while slice ${top.slice} of ${slices} was out, ${top.started} stat reads started inside it (${top.started ? (top.slice > 1 ? `the turn that parsed slice ${top.slice - 1} and started slice ${top.slice}` : 'the call that started slice 1') : 'no slice started in it'}); ${over.length} of ${gaps.length} gaps over the bound ${bound.toFixed(1)} ms, ${over.filter((g) => g.started).length} of them at a slice\'s start; the collector inside the timed window: ${gcIn.length} pause(s), ${gcIn.reduce((s, x) => s + x, 0).toFixed(1)} ms, ${gcTop.toFixed(1)} ms of them inside the longest gap`);
  }
  {   // r5360 (5) RED: a copy whose slices read SYNCHRONOUSLY, half the scene's rows a slice (r5412) — each slice's start holds the loop — is a hold by the rule
    const SYNC_SRC = anchored(anchored(SRC, 'const SAMPLE_SLICE = 128;', `const SAMPLE_SLICE = ${ROWS / 2};   /* MUTANT: big slices — half the scene's rows (r5412) */`, 'sync-slices size'),
      "    const texts = await Promise.all(slice.map((pid) => fs.promises.readFile('/proc/' + pid + '/stat', 'utf8').catch(() => null)));",
      "    const texts = slice.map((pid) => { try { return fs.readFileSync('/proc/' + pid + '/stat', 'utf8'); } catch { return null; } }); await null;   /* MUTANT: the slice read synchronously */", 'sync-slices read');
    const SYNC = require(M.write('src/sysinfo.js', SYNC_SRC, 'sync-slices'));
    countSync(true);
    let sy; try { sy = await run(SYNC); } finally { countSync(false); fs.promises.readFile = rfm; }
    const JS = judge(sy, SYNC.SAMPLE_SLICE);
    ok(SYNC.SAMPLE_SLICE === ROWS / 2 && JS.verdict === 'hold' && JS.atStart > 0, `RED (a copy whose slices read synchronously, ${SYNC.SAMPLE_SLICE} a slice — half the scene's ${ROWS} rows): a HOLD by the rule — ${facts(JS)}; the longest gap ${sy.max} ms (the old single number: ${sy.max < bound ? 'under' : 'over'} the bound)`, JS);
  }
  ok(mine.sampled === true && rel.sampled === true && mine.live > 0 && rel.live > 0, `both sample the table (${mine.live} / ${rel.live} rows carry a live CPU %: a pid's FIRST row of a run reads the last run's — the rows cycle ${pids.length} pids, and a process may end between the runs)`);
  for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 2, label: 'B-360d sample ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

say('③ listProcs samples the whole table before the cap');
WD.section('③');
{
  const lp = await SI.listProcs({ max: 25 });   // capProcs keeps at least 20 (a hostile max clamped — test-sysinfo-op)
  ok(Array.isArray(lp.procs) && lp.procs.length <= 25 && lp.total >= lp.procs.length && typeof lp.sampled === 'boolean', `the table answers (${lp.total} rows, ${lp.procs.length} kept, sampled ${lp.sampled})`, lp.error);
  const a = SRC.indexOf('sampled = await sampleProcCpu(all)'), b = SRC.indexOf('capProcs(all, max)');
  ok(a > 0 && b > a, 'the whole table is sampled (awaited) BEFORE the cap');
}

say('④ CENSUS');
WD.section('④');
{
  ok(ASYNC_FN.length > 0 && !/readFileSync|statSync|openSync/.test(ASYNC_FN) && /fs\.promises\.readFile\('\/proc\/' \+ pid \+ '\/stat'/.test(ASYNC_FN) && /const now = Date\.now\(\);   \/\/ THE SLICE'S instant/.test(ASYNC_FN), 'no synchronous read left in the sample: /proc/<pid>/stat through fs.promises; the instant is each slice\'s (r1316)');
  const PURE = SRC.slice(SRC.indexOf('function statTicks(st) {'), SRC.indexOf('\n}', SRC.indexOf('function statTicks(st) {')) + 2);
  ok(PURE.length > 50 && !/\bfs\.|require\(/.test(PURE), 'statTicks is PURE (no file, no module)');
}
say('⑤ ONE SAMPLE IN FLIGHT (r1316): a second ask joins the one that is out');
WD.section('⑤');
if (!LINUX) { skipped++; say('  · SKIP ⑤ ⑥: no /proc — COUNTED, not passed'); }
else {
  const M2 = mutantCopies('sysinfo-sample-flight', ROOT);
  const JOIN = '  const flight = _sampleFlight || (_sampleFlight = sampleRun(rows.map((r) => r.pid)).finally(() => { _sampleFlight = null; }));\n';
  ok(SRC.split(JOIN).length === 2, 'control setup: the join is one line');
  const NOJOIN = require(M2.write('src/sysinfo.js', anchored(SRC, JOIN, '  const flight = sampleRun(rows.map((r) => r.pid));   // MUTANT: no join\n', 'no-join'), 'no-join'));
  const BOUND = '  const live = await Promise.race([flight, new Promise((resolve) => { timer = setTimeout(() => resolve(null), boundMs); if (timer.unref) timer.unref(); })]).finally(() => clearTimeout(timer));\n';
  ok(SRC.split(BOUND).length === 2, 'control setup: the bound is one line');
  const NOBOUND = require(M2.write('src/sysinfo.js', anchored(SRC, BOUND, '  const live = await flight;   // MUTANT: no bound\n', 'no-bound'), 'no-bound'));
  const pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).slice(0, 200);
  const rowsN = () => pids.map((pid) => ({ pid, rss: 0, pcpu: 0 }));
  // every /proc stat read counted (the product reads through fs.promises.readFile on the shared fs module)
  const rf0 = fs.promises.readFile; let reads = 0, hang = false; const held = [];
  fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && p.startsWith('/proc/') && p.endsWith('/stat')) { reads++; if (hang) return new Promise((r) => held.push(r)); } return rf0.call(this, p, ...a); };
  let keepAlive = null;   // ⑥'s (below)
  try {
    const twoAsks = async (Mod) => { await Mod.sampleProcCpu(rowsN()); await new Promise((r) => setTimeout(r, 30)); reads = 0; const a = rowsN(), b = rowsN(); const [ra, rb] = await Promise.all([Mod.sampleProcCpu(a), Mod.sampleProcCpu(b)]); return { reads, ra, rb, la: a.filter((r) => typeof r.pcpuNow === 'number').length, lb: b.filter((r) => typeof r.pcpuNow === 'number').length }; };
    const mine = await twoAsks(SI), rel = await twoAsks(NOJOIN);
    ok(mine.reads === pids.length && mine.ra === true && mine.rb === true && mine.la > 0 && mine.la === mine.lb, `two asks at once: ${mine.reads} stat reads for ${pids.length} rows (ONE flight), and both tables carry the same shares (${mine.la} / ${mine.lb} rows)`, mine);
    ok(rel.reads === 2 * pids.length, `RED CONTROL (a copy without the join): ${rel.reads} reads — two samples interleave over the one baseline map`, rel);
    say('⑥ THE BOUND (r1316): a pool that never answers');
    WD.section('⑥');
    const B = 150;   // the bound handed to the product (its own is SAMPLE_BOUND_MS)
    // the product's bound timer is unref'd (it never holds the hub open); in this lone process, with every read held, nothing else
    // would keep the loop alive — a ref'd keep-alive while the leg waits (the first gate exited 13: «unsettled top-level await»)
    keepAlive = setInterval(() => { }, 1000);
    hang = true; reads = 0;
    const t0 = performance.now();
    const r1 = await SI.sampleProcCpu(rowsN(), { boundMs: B });
    const firstReads = reads;
    const r2 = await SI.sampleProcCpu(rowsN(), { boundMs: B });
    ok(r1 === false && r2 === false && firstReads === Math.min(pids.length, SI.SAMPLE_SLICE) && reads === firstReads,   // the first slice's reads hang: the next slice never starts
 `past its bound the table goes out «not sampled» (${r1}, ${r2}); the second ask JOINS the flight that is out — ${reads} reads in all, never one more pending table`);
    say(`    the two bounded asks answered in ${(performance.now() - t0).toFixed(0)} ms (the bound handed: ${B} ms each)`);
    let settled = false;
    NOBOUND.sampleProcCpu(rowsN(), { boundMs: B }).then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 3 * B));
    ok(settled === false, `RED CONTROL (a copy without the bound): after three bounds it has not answered — a poll would pile one more table every 5 s`);
  } finally {
    clearInterval(keepAlive);
    hang = false;
    for (const r of held.splice(0)) r(null);   // the hung reads answer «not there»: every flight ends
    fs.promises.readFile = rf0;
  }
  await new Promise((r) => setTimeout(r, 50));
  for (const r of copiesCensus(M2.files, M2.dir, ROOT, { minCopies: 2, label: 'B-360d sample flight ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}
say(`\n${failed ? `${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `ALL PASS (${passed}${skipped ? `; ${skipped} SKIPPED` : ''})`}`);
process.exit(failed ? 1 : 0);
