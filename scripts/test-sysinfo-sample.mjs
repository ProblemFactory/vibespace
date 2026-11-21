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
//   ④ CENSUS: no synchronous read left in the sample
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
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
const ASYNC_A = SRC.indexOf('async function sampleProcCpu(rows) {'), ASYNC_B = SRC.indexOf('\n  return any;\n}', ASYNC_A);
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

say('② OFF THE LOOP — at the owner\'s 2 400 processes');
WD.section('②');
if (!LINUX) { skipped++; say('  · SKIP ②: no /proc on this platform — COUNTED, not passed'); }
else {
  ok(ASYNC_FN.length > 300, 'control setup: the sample is one function in the module');
  const M = mutantCopies('sysinfo-sample', ROOT);
  const REL = require(M.write('src/sysinfo.js', anchored(SRC, ASYNC_FN, RELEASE_FN, 'release-sample'), 'release-sample'));
  const pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
  const ROWS = 2400;
  const rowsOf = () => Array.from({ length: ROWS }, (_, i) => ({ pid: pids[i % pids.length], rss: i, pcpu: 0 }));
  const gapOf = async (fn) => { let last = performance.now(), max = 0; const t = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last); last = n; }, 1); const t0 = performance.now(); let out; try { out = await fn(); } finally { clearInterval(t); } max = Math.max(max, performance.now() - last); return { max: +max.toFixed(1), took: +(performance.now() - t0).toFixed(1), out }; };
  const run = async (Mod) => { const a = rowsOf(); await Mod.sampleProcCpu(a); await new Promise((r) => setTimeout(r, 30)); const b = rowsOf(); const g = await gapOf(() => Promise.resolve(Mod.sampleProcCpu(b))); return { max: g.max, took: g.took, sampled: g.out, live: b.filter((r) => typeof r.pcpuNow === 'number').length }; };
  const rel = await run(REL), mine = await run(SI);
  ok(rel.max >= rel.took * 0.8, `CONTROL (the release's synchronous sample, in a copy): the loop is HELD for the whole sample — its longest gap ${rel.max} ms of its ${rel.took} ms (one turn) over ${ROWS} stat files`);
  ok(mine.max < rel.max / 3 && mine.max < mine.took / 2, `this tree: the reads off the loop, in slices of ${SI.SAMPLE_SLICE} — the longest gap ${mine.max} ms of its ${mine.took} ms, under a third of the release's ${rel.max} ms measured in this run`);
  ok(mine.sampled === true && rel.sampled === true && mine.live > 0 && rel.live > 0, `both sample the table (${mine.live} / ${rel.live} rows carry a live CPU %: a pid's FIRST row of a run reads the last run's — the rows cycle ${pids.length} pids, and a process may end between the runs)`);
  for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 1, label: 'B-360d sample ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
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
  ok(ASYNC_FN.length > 0 && !/readFileSync|statSync|openSync/.test(ASYNC_FN) && /fs\.promises\.readFile\('\/proc\/' \+ r\.pid \+ '\/stat'/.test(ASYNC_FN), 'no synchronous read left in the sample: /proc/<pid>/stat through fs.promises');
  const PURE = SRC.slice(SRC.indexOf('function statTicks(st) {'), SRC.indexOf('\n}', SRC.indexOf('function statTicks(st) {')) + 2);
  ok(PURE.length > 50 && !/\bfs\.|require\(/.test(PURE), 'statTicks is PURE (no file, no module)');
}
say(`\n${failed ? `${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `ALL PASS (${passed}${skipped ? `; ${skipped} SKIPPED` : ''})`}`);
process.exit(failed ? 1 : 0);
