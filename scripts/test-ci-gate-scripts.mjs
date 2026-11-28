#!/usr/bin/env node
// THE RELEASE GATE'S OWN GATE, PART 9 OF 9 — THE WALL-CLOCK CENSUS (row B-54a9, 主开发 r2572 (6) carried out by r4734, lane bl-ci,
// 2026-11-26; re-formed on the train 2.369.423 by 主开发 r5621, 2026-11-28). r2572 (6) ruled: if the census alone still read over ten seconds after its items (3) and (5), it becomes a fast suite
// of its own, with a pin in test-ci-gate that the suite exists and holds it. §2e is here, keeping its number, so the tree's notes
// «test-ci-gate §2e» find it in this file. Its first form moved THE ONE PASS with all four of its readers (§2e, §2k, §2m, §2p) and
// read 9 730 / 11 142 ms alone on the first machine (run a4b589fdc-20261126231004-both) — the UTC zone over the bound — so r4734's
// fallback holds: §2e alone here, on its own parse of the fast suites (its census's own road), and the pass stays in test-ci-gate
// for the other three. §2e's text is its base copy but for three lines that read the pass (gone: each row is read here on its own
// parse) and one comment, and the pass's guard leg, which stays with the pass. test-ci-gate §1 pins that this file is a fast row
// and holds §2e, and that test-ci-gate holds the pass and §2k / §2m / §2p and not §2e. What the parts share is scripts/ci-gate-kit.mjs.
import fs from 'node:fs';
import path from 'node:path';
import './scratch.mjs';   // THE ORDER (r1857): scratch.mjs is the first import after node's own
import { SUITES } from './ci.mjs';
import { REPO, ok, git, report } from './ci-gate-kit.mjs'; // the shared kit of the gate's parts
// B-54a9 (主开发 r2462): THE SECTION PROFILE — PRINTED, never judged. Each «\n§…» header this file prints opens a section; the
// end prints every section's own milliseconds (the process's start to the first header = the imports), the largest first, so
// the suite's cost is read by section, not guessed.
const PROFILE = [['(start → the first section: the imports)', 0]];
{ const log = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('\n§')) PROFILE.push([a[0].slice(1, 90), performance.now()]); return log(...a); }; }
// (the section profile of test-ci-gate, the same lines: this part prints its own)
const printProfile = () => {
  const marks = [...PROFILE, ['(end)', performance.now()]];
  const rows = marks.slice(0, -1).map(([name, t], k) => [name, Math.round(marks[k + 1][1] - t)]).sort((x, y) => y[1] - x[1]);
  console.log(`\nTHE SECTION PROFILE (B-54a9; printed, never judged): ${rows.length} part(s), ${Math.round(performance.now())} ms from the process's start`);
  for (const [name, ms] of rows) console.log(`  · ${String(ms).padStart(6)} ms  ${name}`);
};

// ── §2e NO FAST SUITE ASSERTS A WALL-CLOCK BOUND ON ITS OWN RUN (lane mirror-flake-hardening, 2.369.270) ──
// rel269's mirror (run 38549333465) went red on test-enter-census's `< 3 s` — 4335 ms on ubuntu-latest — and the fast
// tier stopped on it. scripts/wall-clock-census.mjs reads every fast suite with acorn and classifies each comparison of a
// measured span (wait / lower / guard / control / LITERAL): a LITERAL upper bound under 1 s is RED; one of ≥ 1 s is held
// only by the per-suite ratchet scripts/fixtures/wall-clock-baseline.json, which only falls. A cost claim is a census of
// the work or a ratio against a control in the same run (scripts/cost-ratio.mjs — CPU time); a wait is the mechanism's
// constant or the evidence it ended for its reason. Lane wall-clock-ratchet-down (2.369.271): THE RATCHET IS AT 0 — the
// 30 held bounds became evidence / stamps read between two marks / relative bounds, and the census also reads a span
// the PRODUCT (or a child script) measured and returned, through a tuple, a helper's parameter, a Map / Set.
console.log('\n§2e no fast suite asserts a wall-clock bound on its own run');
{
  const WC = await import('./wall-clock-census.mjs');
  // censusOver's own loop over the tier (fast rows, in order; an unreadable file skipped), each row on its own parse (B-54a9, r4734: THE ONE PASS stays in test-ci-gate for §2k / §2m / §2p)
  const suites = [];
  for (const r of SUITES) {
    if (r.tier !== 'fast') continue;
    let src; try { src = fs.readFileSync(path.join(REPO, 'scripts', r.name + '.mjs'), 'utf8'); } catch { continue; }
    suites.push(WC.censusRow(r, src));
  }
  const baseline = JSON.parse(fs.readFileSync(WC.BASELINE, 'utf-8'));
  const v = WC.ratchetVerdict(suites, baseline);
  const by = {};
  for (const x of suites) for (const f of x.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const held = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'LITERAL').map((f) => `${x.name}:${f.line} ${f.text}`));
  console.log(`    ${suites.length} fast suites · ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  for (const h of held) console.log('      held by the ratchet: ' + h);
  const nFast = SUITES.filter((r) => r.tier === 'fast').length;
  ok(suites.length === nFast && nFast > 300, `the census read every fast suite (${suites.length} of ${nFast})`);
  // THE FIXED POINT'S KINDS (主开发 r3135 (1)): every node kind the body of the census's fixed point acts on is one of WC.FLOW_KINDS,
  // and each of those is acted on — read from the module's own text (the body between its loop over `kin` and flow's return), where
  // each kind is spelled `n.type === '<kind>'` (any other spelling of n.type there is red too). A branch on an eighth kind is RED here,
  // never dead; the CONTROL plants one in a copy of the text.
  {
    const kindsActedOn = (src) => {
      const a0 = src.indexOf('for (const n of kin) {'), b0 = a0 < 0 ? -1 : src.indexOf('  return { all, isSpan, spanFields };', a0);
      if (a0 < 0 || b0 < 0) return null;
      const body = src.slice(a0, b0), eq = [...body.matchAll(/\bn\.type === '(\w+)'/g)].map((m) => m[1]);
      return { kinds: [...new Set(eq)], otherSpellings: (body.match(/\bn\.type\b/g) || []).length - eq.length };
    };
    const wcSrc = fs.readFileSync(path.join(REPO, 'scripts', 'wall-clock-census.mjs'), 'utf8');
    const got = kindsActedOn(wcSrc), K = WC.FLOW_KINDS;
    const extra = got ? got.kinds.filter((k) => !K.includes(k)) : null, unused = got ? K.filter((k) => !got.kinds.includes(k)) : null;
    const plantSrc = wcSrc.replace('for (const n of kin) {\n', "for (const n of kin) {\n      if (n.type === 'ForInStatement') spans.add('planted');\n");
    const plant = kindsActedOn(plantSrc);
    ok(!!got && !extra.length && !unused.length && got.otherSpellings === 0 && plantSrc !== wcSrc && !!plant && plant.kinds.includes('ForInStatement') && !K.includes('ForInStatement'),
      `THE FIXED POINT'S KINDS (r3135 (1)): the census's fixed point acts on exactly its ${K.length} listed kinds (${got ? got.kinds.join(', ') : 'the body not found'})${extra && extra.length ? ' — NOT LISTED: ' + extra.join(', ') : ''}${unused && unused.length ? ' — listed, never acted on: ' + unused.join(', ') : ''}${got && got.otherSpellings ? ' — ' + got.otherSpellings + ' other spelling(s) of n.type' : ''}; CONTROL: a branch planted on an eighth kind (ForInStatement) is seen`);
  }
  ok(!v.problems.length, `no literal wall-clock bound under ${WC.LITERAL_FLOOR_MS} ms in a fast suite; the ≥ ${WC.LITERAL_FLOOR_MS} ms ones are the ratchet's (${held.length} in ${Object.keys(baseline).length} suites, only falling)${v.problems.length ? ' — ' + v.problems.join(' | ') : ''}`);
  ok(!held.length && !Object.keys(baseline).length, `THE RATCHET IS AT 0 (lane wall-clock-ratchet-down): no literal wall-clock bound held in any fast suite, the baseline empty — the next one is a NEW one, RED (${held.length} held, ${Object.keys(baseline).length} baseline rows)`);
  // THE RATIO (lane cpu-ratio-controls): no fast suite judges a growth on the clock — one measurement at two input sizes compared
  // through a factor (test-channel-facts' CPU-time growth legs were the last; test-exit-run's hrtime family is heavy, planted below)
  const growthRatios = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'RATIO').map((f) => `${x.name}:${f.line} ${f.text}`));
  ok(!growthRatios.length && (by.RATIO || 0) === 0, `NO GROWTH RATIO ON THE CLOCK in a fast suite (lane cpu-ratio-controls): a complexity claim is a COUNT (scripts/work-meter.mjs; its backtrack charge for a regex) — ${growthRatios.length} found, the next one is RED${growthRatios.length ? ': ' + growthRatios.join(' | ') : ''}`);
  // PLANTS: every spelling of the class is LITERAL; every legitimate form is classified out of it
  const kinds = (src) => WC.wallClockFindings(src).map((f) => f.kind).join(',');
  // two spans measured in the run: a control and the thing judged against it
  const TWO = 'const t = performance.now(); a(); const ctl = performance.now() - t; const u = performance.now(); b(); const fix = performance.now() - u; ';
  const RED = {
    'Date.now() delta': "const t0 = Date.now(); run(); ok('fast', Date.now() - t0 < 3000);",
    'performance.now() span variable': "const t = performance.now(); run(); const ms = performance.now() - t; ok('fast', ms < 500);",
    'hrtime.bigint span': "const t = process.hrtime.bigint(); run(); const ms = Number(process.hrtime.bigint() - t) / 1e6; ok(ms < 100);",
    'an if-test failure (`if (ms > N) bad`)': "const t = performance.now(); run(); const ms = performance.now() - t; if (ms > 1500) bad.push('slow');",
    'a const used only as the bound': "const BUDGET_MS = 250; const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'a const handed only to a watchdog timer': "const BUDGET_MS = 250; setTimeout(kill, BUDGET_MS + 1500); const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'an object field': "const t0 = Date.now(); const r = { ms: Date.now() - t0 }; ok(r.ms < 50);",
    'a helper that returns a span': "const timeIt = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; ok(timeIt(run) < 100);",
    'a negated flag (`!(ms < B)`)': "const t = Date.now(); run(); const over = !(Date.now() - t < 1500); ok(!over);",
    'a .filter of violators': "const t = performance.now(); const times = [performance.now() - t]; const slow = times.filter((ms) => ms > 800); ok(!slow.length);",
    // lane oat-loop-gap-bound (.270): the spellings test-oat-materialize F13's `r13.maxGap < 50` hid behind
    "a helper's coerced field (F13: `maxGap: +maxGap.toFixed(1)`)": "const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); return { maxGap: +maxGap.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap < 50, 'stall');",
    'a sum across a loop (`total += span`)': "let total = 0; for (const x of xs) { const t = performance.now(); run(x); total += performance.now() - t; } ok(total < 500);",
    'the max of spans pushed across a loop (`Math.max(...gaps)`)': "const gaps = []; let last = Date.now(); const iv = setInterval(() => { const now = Date.now(); gaps.push(now - last); last = now; }, 5); await work(); clearInterval(iv); const worst = Math.max(...gaps, 0); ok(worst < 250);",
    'an element of a sorted span array': "const ms = []; for (const x of xs) { const t = Date.now(); run(x); ms.push(Date.now() - t); } ms.sort((a, b) => a - b); ok(ms[ms.length - 1] < 300);",
    'a destructured span field': "const timed = () => { const t = Date.now(); run(); return { ms: Date.now() - t }; }; const { ms } = timed(); ok(ms < 200);",
    "process.hrtime(t0)'s [s, ns]": "const t = process.hrtime(); run(); const [s, ns] = process.hrtime(t); ok(s * 1e3 + ns / 1e6 < 100);",
    // lane wall-clock-ratchet-down (.271): the BLIND spellings the census header named
    'a span inside a tuple (`[n, msOf(fn)]`)': "const msOf = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; const rows = fns.map((fn) => [fn.name, msOf(fn)]); ok(!rows.filter(([, ms]) => ms > 800).length);",
    "a span handed to a helper's parameter": "const fast = (ms, what) => ok(ms < 500, what); const t = Date.now(); run(); fast(Date.now() - t, 'run');",
    'a span in a Map (`m.set(k, span)`, `m.get(k)`)': "const by = new Map(); const t = Date.now(); run(); by.set('run', Date.now() - t); ok(by.get('run') < 300);",
    'a span in a Set, spread': "const s = new Set(); const t = Date.now(); run(); s.add(Date.now() - t); ok(Math.max(...s) < 300);",
    'a clock function (`const now = () => Date.now()`)': "const now = () => Date.now(); const t0 = now(); run(); ok(now() - t0 < 300);",
    'a for-of over an array of spans': "const times = []; for (const x of xs) { const t = Date.now(); run(x); times.push(Date.now() - t); } for (const ms of times) ok(ms < 300);",
    // lane reconnect-storm-band (.272): THE BAND — a bound relative to a control that adds a literal number of ms
    'a control plus a literal band (test-reconnect-storm (d) before .272)': TWO + 'const lband = Math.max(ctl * 0.25, 25); ok(fix <= ctl + lband);',
    'a control plus a bare literal': TWO + 'ok(fix <= ctl + 50);',
    'a literal floor under a scaled control': TWO + 'ok(fix <= Math.max(ctl * 1.25, 50));',
    'the band on the left (`ctl + 25 >= fix`)': TWO + 'ok(ctl + 25 >= fix);',
    'a band in an if-test failure': TWO + "if (fix > ctl + 40) bad.push('slow');",
    'a literal ms × an environment factor': "const slack = process.env.CI ? 4 : 1; const t = Date.now(); run(); ok(Date.now() - t < 250 * slack);",
    'a literal ms per item (× a count)': 'const t = Date.now(); run(rows); ok(Date.now() - t < 50 * rows.length);',
  };
  const OUT = {
    wait: ["const t0 = Date.now(); while (Date.now() - t0 < 5000 && !done()) await sleep(50);", 'wait'],
    'a poll deadline in a timer callback': ["const t0 = Date.now(); const iv = setInterval(() => { if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error('timeout')); } }, 50);", 'wait'],
    'a lower bound': ["const t0 = Date.now(); await hold(); ok(Date.now() - t0 >= 600);", 'lower'],
    "the mechanism's constant × slack": ["const t0 = Date.now(); await probe(); ok(Date.now() - t0 < 2 * DP.DUP_PROBE_MS + 500);", 'control'],
    'a const the suite hands the fake': ["const HOLD = 300; fake.holdMs = HOLD; const t0 = Date.now(); await fake.run(); ok(Date.now() - t0 < 3 * HOLD);", 'control'],
    'a control measured in the run': ["const t = performance.now(); a(); const ta = performance.now() - t; const u = performance.now(); b(); const tb = performance.now() - u; ok(tb < 4 * ta);", 'control'],
    'a noise-floor conjunct': ["const t = performance.now(); a(); const ta = performance.now() - t; if (ta > 10 && other > 2.5) bad.push('x');", 'guard'],
    // lane reconnect-storm-band: the look-alikes of a band — the control scaled (a ratio), a band made of the control
    // itself, the mechanism's constant as the band, a band on a LOWER bound
    'K × the control': [TWO + 'ok(fix <= 2 * ctl);', 'control'],
    'a relative band (`ctl + ctl * 0.25`)': [TWO + 'ok(fix <= ctl + ctl * 0.25);', 'control'],
    "the mechanism's constant as the band": [TWO + 'const SLOT_MS = 250; prod.slotMs = SLOT_MS; ok(fix <= ctl + SLOT_MS);', 'control'],
    'a band on a lower bound': [TWO + 'ok(fix >= ctl + 50);', 'lower'],
    'a timestamp plus a number (a deadline, never a band)': ["const NOW = Date.now(); const T0 = NOW - 3 * 86400e3; const r = { at: Date.now() - 5 }; ok(Number(r.at) < T0 + 1000);", 'control'],
    "F13's form since .270 (a stall against a control loop of the same length)": ["const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); const ctl = performance.now() - last; return { maxGap: +maxGap.toFixed(1), ctlGap: +ctl.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap <= 3 * r13.ctlGap);", 'control'],
  };
  const redWrong = Object.entries(RED).filter(([, src]) => kinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const outWrong = Object.entries(OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want})`);
  ok(!redWrong.length, `PLANTS: ${Object.keys(RED).length} spellings of an absolute wall-clock bound are each LITERAL${redWrong.length ? ' — WRONG: ' + redWrong.join(' | ') : ''}`);
  ok(!outWrong.length, `PLANTS: ${Object.keys(OUT).length} legitimate forms are classified out of it (wait / lower / control / guard)${outWrong.length ? ' — WRONG: ' + outWrong.join(' | ') : ''}`);
  ok(kinds("const t = performance.now(); a(); const x = performance.now() - t; const u = performance.now(); b(); const y = performance.now() - u; ok(y / x <= 2.5);") === '', 'a ratio of two DIFFERENT measurements (a fix against its control) is dimensionless — no finding (relative by construction; one measurement at two sizes is THE RATIO below)');
  // THE RATIO (lane cpu-ratio-controls): every spelling of a growth judged on the clock is RATIO — the bestOf family's
  // `b / a <= 16`, a literal multiplier, a quadratic control's lower bound behind a noise floor, a named ratio, an if-test,
  // cost-ratio.mjs's growth() on CPU time; a ratio of two different measurements, the same call twice, a COUNT are not
  const HR = 'const timeOf = (n, k = 1) => { let b = Infinity; for (let i = 0; i < k; i++) { const t0 = process.hrtime.bigint(); run(n); b = Math.min(b, Number(process.hrtime.bigint() - t0) / 1e6); } return b; }; ';
  const PN = 'const timeOf = (x) => { const t = performance.now(); run(x); return performance.now() - t; }; ';
  const RATIO_RED = {
    "the bestOf family (test-exit-run before .273: `b / a <= 16` at ×8 input)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536, 3); ok(b <= 1e9 || b / a <= 16);',
    'a literal multiplier (`b < 16 * a`)': PN + 'const a = timeOf(1024), b = timeOf(8192); ok(b < 16 * a);',
    "a quadratic CONTROL's lower bound behind a noise floor (`b / Math.max(0.05, a) >= 12`)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536); ok(b / Math.max(0.05, a) >= 12);',
    'a floor and a scale on the small side (test-channel-thread before .209)': HR + 'const a = timeOf(64 * 1024), b = timeOf(512 * 1024); ok(b < Math.max(5, a) * 16);',
    'a ratio bound to a name': PN + 'const small = timeOf(4096), big = timeOf(32768); const r = big / small; ok(r <= 8.5);',
    'a ratio in an if-test failure': PN + "const a = timeOf(4096), b = timeOf(32768); if (b / a > 10) bad.push('superlinear');",
    "cost-ratio.mjs's growth() on CPU time (test-channel-facts before .273)": "import { growth } from './cost-ratio.mjs'; const g = growth((x) => run(x), small, big, { inner: 50 }); ok(g.ratio <= 24);",
    "growth()'s ratio as a quadratic control's lower bound": "import { growth } from './cost-ratio.mjs'; const gQ = growth(q, small, big, { inner: 1 }); ok(gQ.ratio > 24 && other);",
  };
  const RATIO_OUT = {
    'one helper over two DIFFERENT inputs at one size (a hostile text against a plain one)': [PN + 'const a = timeOf(plain), b = timeOf(hostile); ok(b <= 40 * a);', 'control'],
    'the same call twice (a determinism read)': [PN + 'const a = timeOf(8192), b = timeOf(8192); ok(b <= 2 * a);', 'control'],
    'a COUNT at two sizes (the work meter in a child)': ["const v = judgeInChild({ module, run, mk, n: 8192, kind: 'linear', backtracks: true, opts: { factor: 8 } }); ok(v.ok && v.r <= 8.8);", ''],
    "growth()'s other fields (a printed cost)": ["import { growth } from './cost-ratio.mjs'; const g = growth(f, small, big); console.log(g.smallMs, g.bigMs); ok(typeof g.bigMs === 'number');", ''],
  };
  const ratioWrong = Object.entries(RATIO_RED).filter(([, src]) => !kinds(src).split(',').includes('RATIO')).map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const ratioOutWrong = Object.entries(RATIO_OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want || 'no finding'})`);
  ok(!ratioWrong.length, `PLANTS: ${Object.keys(RATIO_RED).length} spellings of a growth judged on the clock are each RATIO${ratioWrong.length ? ' — WRONG: ' + ratioWrong.join(' | ') : ''}`);
  ok(!ratioOutWrong.length, `PLANTS: ${Object.keys(RATIO_OUT).length} look-alikes are not (two different measurements, the same call twice, a count, growth()'s printed fields)${ratioOutWrong.length ? ' — WRONG: ' + ratioOutWrong.join(' | ') : ''}`);
  ok(kinds("const t0 = performance.now(); await sweep(); const took = performance.now() - t0; const until = performance.now() + took; while (performance.now() < until) await tick();") === '', 'a mark plus a span is a DEADLINE (a control loop as long as the sweep), not a span — no finding');
  // THE PRODUCT'S CLOCK (lane wall-clock-ratchet-down): a duration the product module the suite LOADS fills from a clock
  // (`ms: Date.now() - t0`, `{ fsMs, loopMs }` off a worker), or a child script prints (python `time.monotonic()`), is a
  // span on what the suite got back from a call — and only there: a module the suite hands its own `now`, an object the
  // suite built itself (a fake timer's `{ fn, ms }`), a module it reads as TEXT for a pin, are no source
  const MODS = {
    'src/server/tls.js': "function runChild(cmd) { const t0 = Date.now(); return new Promise((r) => r({ code: 0, ms: Date.now() - t0 })); } module.exports = { runChild };",
    'src/server/canary.js': "function create({ now = () => Date.now() } = {}) { return { async tick() { const sentAt = now(); const r = await post(); const gotAt = now(); const fsMs = Math.max(0, r.fsMs); const loopMs = gotAt - r.doneAt; return { fsMs, loopMs }; } }; } const w = 'canary-worker.js';",
    'src/server/canary-worker.js': "const startAt = Date.now(); const doneAt = Date.now(); post({ startAt, doneAt, fsMs: doneAt - startAt });",
    'scripts/fixtures/probe.py': "t = time.monotonic()\nout['ms'] = round((time.monotonic() - t) * 1000)\n",
  };
  const readPlant = (rel) => (rel in MODS ? MODS[rel] : null);
  const pkinds = (src) => WC.wallClockFindings(src, { fields: WC.productSpanFields(src, readPlant) }).map((f) => f.kind).join(',');
  const PRED = {
    "a product-returned field (tls.js runChild's `ms`)": "const TLS = require('../src/server/tls.js'); const t = await TLS.runChild('x'); ok(t.code === 0 && t.ms < 5000);",
    "a product field forwarded off its worker (the canary's `fsMs`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.fsMs < 100);",
    "the product's own clock default (`now = () => Date.now()`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.loopMs < 100);",
    "a child's JSON (secret-probe.py's `ms`)": "const PROBE = path.join(ROOT, 'scripts/fixtures/probe.py'); const r = JSON.parse(spawnSync('python3', [PROBE]).stdout); ok(r.ms < 3000);",
  };
  const POUT = {
    'a module the suite hands its own clock': "const C = require(path.join(REPO, 'src/server/canary.js')); let clock = 0; const r = await C.create({ now: () => clock }).tick(); ok(r.loopMs < 100);",
    "the suite's own object with the field's name (a fake timer)": "const TLS = require('../src/server/tls.js'); const caught = []; global.setTimeout = (fn, ms) => { caught.push({ fn, ms }); }; const t = await TLS.runChild('x'); ok(caught.filter((c) => c.ms > 60e3).length === 0);",
    'a module read as TEXT for a pin': "const src = read('src/server/tls.js'); const t = parse(src); ok(t.ms < 5000);",
  };
  const pWrong = Object.entries(PRED).filter(([, src]) => pkinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${pkinds(src) || 'not seen'}`);
  const poWrong = Object.entries(POUT).filter(([, src]) => pkinds(src) !== '').map(([n, src]) => `${n} → ${pkinds(src)}`);
  ok(!pWrong.length, `PLANTS: ${Object.keys(PRED).length} durations the PRODUCT or a child measured are each LITERAL${pWrong.length ? ' — WRONG: ' + pWrong.join(' | ') : ''}`);
  ok(!poWrong.length, `PLANTS: ${Object.keys(POUT).length} look-alikes are no finding (the suite's own clock handed in, its own fake-timer object, a module read as text)${poWrong.length ? ' — WRONG: ' + poWrong.join(' | ') : ''}`);
  // THE RATCHET AT 0: a ≥ 1 s literal bound anywhere is a NEW one, a sub-second one is RED by the floor, a baseline
  // above the truth and a baseline name that is no fast suite say "lower it" — each RED
  const plantSuite = (name, src) => [...suites.filter((x) => x.name !== name), { name, findings: WC.wallClockFindings(src, { fields: WC.productSpanFields(src) }) }];
  const lazySrc = fs.readFileSync(path.join(REPO, 'scripts', 'test-lazy.mjs'), 'utf-8');
  const pNew = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 4000, 'planted');\n"), baseline).problems;
  const pSub = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 200, 'planted');\n"), baseline).problems;
  const pHigh = WC.ratchetVerdict(suites, { ...baseline, 'test-lazy': 1 }).problems;
  const pGone = WC.ratchetVerdict(suites, { ...baseline, 'test-no-such-suite': 1 }).problems;
  ok(pNew.some((p) => p.startsWith('test-lazy') && /a NEW one/.test(p)) && pSub.some((p) => /test-lazy:\d+ asserts .* under 1000 ms/.test(p)) && pHigh.some((p) => p.startsWith('test-lazy') && /lower it/.test(p)) && pGone.some((p) => /test-no-such-suite/.test(p)),
    'CONTROLS: a 4 s bound planted in test-lazy is a NEW one, a 200 ms one is RED by the floor, a baseline above the truth and a baseline name that is no fast suite say "lower it" — all RED');
  // …and a GROWTH RATIO planted in the same copy is RED by the census (lane cpu-ratio-controls): no baseline holds one
  const pRatio = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tR = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++); return performance.now() - t0; }; const rA = tR(1e5), rB = tR(8e5); ok(rB / rA <= 16, 'planted');\n"), baseline).problems;
  ok(pRatio.some((p) => /^test-lazy:\d+ judges rB \/ rA <= 16 — one measurement at two input sizes/.test(p)), `CONTROL: a growth ratio planted in test-lazy (\`rB / rA <= 16\` over one timer at two sizes) is RED (${pRatio.filter((p) => p.startsWith('test-lazy')).length} problem)`, pRatio);
  // THE 30 THEMSELVES: rel270's copy of every suite the ratchet held reads RED against today's empty baseline (a
  // depth-1 checkout has no 25cd69aef: SKIP, said) — and its fs-canary / tls-pass / app-display-secrets (the product's
  // clock, unseen before) read RED with them
  const HELD270 = ['test-agentd-upgrade-loop', 'test-app-display-secrets', 'test-app-display-session-census', 'test-app-manifest', 'test-auto-resume', 'test-boot-phase', 'test-browser-disk', 'test-browser-display', 'test-browser-passkey', 'test-ci-gate', 'test-codex-0153', 'test-codex-pool', 'test-design-routes', 'test-dial-link-kept', 'test-egress-fence', 'test-key-file-law', 'test-mount-argv', 'test-notify-retry', 'test-opencode-serve', 'test-parked-ask-inbox', 'test-quota-source', 'test-raw-filename', 'test-usage-index-owner', 'test-vfs-cache-place', 'test-window-binding-model'];
  let rel270 = null;
  try { rel270 = Object.fromEntries([...HELD270, 'test-fs-canary', 'test-tls-pass'].map((n) => [n, git(REPO, ['show', `25cd69aef:scripts/${n}.mjs`])])); } catch { rel270 = null; }
  if (rel270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the ratchet-at-0 control needs rel270');
  else {
    const red = (n) => WC.ratchetVerdict(plantSuite(n, rel270[n]), baseline).problems.filter((p) => p.startsWith(n));
    const notRed = HELD270.filter((n) => !red(n).some((p) => /a NEW one/.test(p)));
    const canary = red('test-fs-canary'), tls = red('test-tls-pass');
    ok(!notRed.length && canary.length === 4 && canary.every((p) => /r\.(?:fs|loop)Ms < \d+/.test(p)) && tls.some((p) => /t\.ms < 5000/.test(p)),
      `CONTROL: rel270's copies read RED here — every one of the ${HELD270.length} suites the ratchet held (a NEW one each), test-fs-canary's 4 bounds on the canary's own fsMs / loopMs, test-tls-pass's \`t.ms < 5000\`${notRed.length ? ' — NOT RED: ' + notRed.join(', ') : ''} (${canary.length} + ${tls.length})`);
  }
  // THE INCIDENT ITSELF: rel269's test-enter-census reads RED here (a depth-1 checkout has no d419156bd: SKIP, said)
  let rel269 = null;
  try { rel269 = git(REPO, ['show', 'd419156bd:scripts/test-enter-census.mjs']); } catch { rel269 = null; }
  if (rel269 === null) console.log('    SKIP: d419156bd is not in this checkout (a depth-1 clone) — the incident control needs rel269');
  else {
    const pInc = WC.ratchetVerdict(plantSuite('test-enter-census', rel269), baseline).problems;
    ok(pInc.some((p) => p.startsWith('test-enter-census') && /ms < 3000/.test(p)), `CONTROL: rel269's test-enter-census (\`ms < 3000\`, the mirror's 4335 ms red) reads RED here (${pInc.filter((p) => p.startsWith('test-enter-census')).length} problem)`);
  }
  // THE SECOND INCIDENT (lane oat-loop-gap-bound): .270's candidate (run 38560509611) went red on test-oat-materialize
  // F13's `r13.maxGap < 50` — 59.4 ms on ubuntu-latest — a span this census could not see through the helper's
  // `maxGap: +maxGap.toFixed(1)`; that suite at a7321ff0e reads RED here, today's (a stall against a control) does not.
  // B-874f (lane bl-tests-e): a7321ff0e is a lane commit master never held — the leg ran only where that branch was fetched (the
  // push gate) and SKIPPED everywhere else. The 24 lines it asserts on are FROZEN once in scripts/fixtures/off-master/ and read
  // here on every checkout, the runner's depth-1 clone too.
  const a7321 = fs.readFileSync(path.join(REPO, 'scripts/fixtures/off-master/a7321ff0e-oat-materialize-f13.txt'), 'utf8');
  const pF13 = WC.ratchetVerdict(plantSuite('test-oat-materialize', a7321), baseline).problems.filter((p) => p.startsWith('test-oat-materialize'));
  ok(pF13.length === 1 && /r13\.maxGap < 50/.test(pF13[0]), `CONTROL: a7321ff0e's test-oat-materialize F13 (\`r13.maxGap < 50\`, the 59.4 ms red — frozen) reads RED here (${pF13.length} problem${pF13.length === 1 ? '' : 's'})`);
  // THE THIRD INCIDENT (lane reconnect-storm-band): .271's heavy shard 6/6 went red on test-reconnect-storm (d), `fix ≤
  // control + max(25 %, 25 ms)` on the server's loop delay — 61 vs 31 and 60 vs 25 on ubuntu-latest — a bound relative to
  // a control that ADDS a literal band. That suite is HEAVY (this census reads the fast tier) and its loop figures come
  // off the server's preload log under names that carry no unit (`loopMax`, `gapMax`, `visP95`): planted with those names
  // read as the durations they are, rel270's copy reads RED on (d)'s two banded legs and on (b)'s `+ 50`; today's holds none
  const STORM_FIELDS = ['loopMax', 'gapMax', 'visP95'];
  const stormNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-reconnect-storm.mjs'), 'utf-8'), { fields: STORM_FIELDS });
  ok(!stormNow.some((f) => f.kind === 'LITERAL') && stormNow.some((f) => f.kind === 'control'), `today's test-reconnect-storm, planted the same way, holds no literal band — (b) is a ratio to the control (${stormNow.map((f) => `${f.kind} :${f.line}`).join(' · ')})`);
  let storm270 = null;
  try { storm270 = git(REPO, ['show', '25cd69aef:scripts/test-reconnect-storm.mjs']); } catch { storm270 = null; }
  if (storm270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the reconnect-storm (d) control needs rel270');
  else {
    const pS = WC.ratchetVerdict([...suites, { name: 'test-reconnect-storm', findings: WC.wallClockFindings(storm270, { fields: STORM_FIELDS }) }], baseline).problems.filter((p) => p.startsWith('test-reconnect-storm'));
    ok(pS.length === 3 && [/F\.loopMax <= C\.loopMax \+ lband/, /F\.gapMax <= Math\.max\(C\.gapMax \+ band, 50\)/, /F\.visP95 <= C\.visP95 \+ 50/].every((re) => pS.some((p) => re.test(p) && /under 1000 ms/.test(p))),
      `CONTROL: 25cd69aef's test-reconnect-storm, planted, reads RED on (d)'s loop-delay and srv-loop-gap-ms bands and on (b)'s \`+ 50\` (${pS.length} problems)`);
  }
  // THE FOURTH AND FIFTH (lane cpu-ratio-controls, B-923c + B-e83c): rel271's test-exit-run — HEAVY, so planted — judged the
  // secret-shape regexes by hrtime ratios at ×4 / ×8 input (red 1 in 5 beside 32 spinners), and rel271's test-channel-facts its
  // decoder and V1 by CPU-time growth (its quadratic control read 17 × for 64 × beside a 12-wide fast tier): both read RED on
  // every growth leg here; today's copies hold none (a COUNT each)
  const exitNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-exit-run.mjs'), 'utf-8'));
  ok(!exitNow.some((f) => f.kind === 'RATIO'), `today's test-exit-run, planted, holds no growth ratio — its legs are counts (${exitNow.filter((f) => f.kind === 'RATIO').length} RATIO)`);
  let rel271 = null;
  try { rel271 = { exit: git(REPO, ['show', 'f57d1cbe9:scripts/test-exit-run.mjs']), facts: git(REPO, ['show', 'f57d1cbe9:scripts/test-channel-facts.mjs']) }; } catch { rel271 = null; }
  if (rel271 === null) console.log('    SKIP: f57d1cbe9 is not in this checkout (a depth-1 clone) — the clock-ratio controls need rel271');
  else {
    const pE = WC.ratchetVerdict([...suites, { name: 'test-exit-run', findings: WC.wallClockFindings(rel271.exit) }], baseline).problems.filter((p) => p.startsWith('test-exit-run:') && /a growth ratio/.test(p));
    const pF = WC.ratchetVerdict(plantSuite('test-channel-facts', rel271.facts), baseline).problems.filter((p) => p.startsWith('test-channel-facts:'));
    ok(pE.length === 10 && pE.filter((p) => /b \/ a <= (?:8|16)\b/.test(p)).length === 4 && pE.filter((p) => /b \/ Math\.max\(0\.05, a\) >= 12/.test(p)).length === 6
      && pF.length === 5 && ['gB.ratio <= 4', 'gWalk.ratio > 4', 'gW1.ratio <= 24', 'gW2.ratio <= 24', 'gQ.ratio > 24'].every((t) => pF.some((p) => p.includes(t))),
      `CONTROL: f57d1cbe9's test-exit-run, planted, reads RATIO on its 4 linear legs and 6 quadratic controls (${pE.length}); its test-channel-facts on V1 and the decoder's 5 growth reads (${pF.length})`);
  }
}

printProfile();
report();
