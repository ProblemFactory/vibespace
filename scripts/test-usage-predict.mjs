#!/usr/bin/env node
// usage-predict pick 2 (lane cli-update-needs-nothing, 2026-11-15) — WHETHER A SOURCE'S PROJECTION MAY BE DRAWN, AND READ BY THE
// POOL (fast; in-process). The verdict is THIS instance's own, from the pairs its anchors record (the estimate made just before
// each new reading, against that reading): src/usage-predict.js holds the RULE; every number below is MADE — no person's data,
// no account id, ever (this repository is public).
//   ① the rule on made pairs: learning (< 5) → provisional (5–29, better at all three measures) → on (≥ 30) · off (worse at any)
//   ② the source of an identity; the pairs one anchor line gives
//   ③ the gate: a pool keeps on lanes only; a screen keeps on and provisional
//   ④ the estimator over a made anchors folder: its verdict per source and lane, and the pool's estimate held to on lanes
//   ⑤ the wiring: the pool's one decision door reads poolEstimateFor; /api/usage draws a lane only where on or provisional;
//      the band's words in the popup, in three languages
//   ⑥ mutant copies of src/usage-predict.js — each weakened rule turns its named rows red
import { scratch } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const UP = require(path.join(REPO, 'src/usage-predict.js'));
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
}
// made pairs: n of them, the stale reading off by `s` points and the projection by `p` (a small spread so a p90 / p99 exists)
const mk = (n, s, p, { tailS = null, tailP = null } = {}) => Array.from({ length: n }, (_, i) => ({ lane: 'sevenDay', t: 1000 + i, stale: s + (i % 3) * 0.1 + (i === n - 1 && tailS != null ? tailS : 0), proj: p + (i % 3) * 0.1 + (i === n - 1 && tailP != null ? tailP : 0) }));

console.log('— ① THE RULE on made pairs');
const RULE_ROWS = [
  ['fewer than PROVISIONAL_MIN pairs is LEARNING, whatever they say', mk(UP.PREDICT.PROVISIONAL_MIN - 1, 2, 0.1), 'learning'],
  ['PROVISIONAL_MIN pairs, better at all three, is PROVISIONAL', mk(UP.PREDICT.PROVISIONAL_MIN, 2, 0.5), 'provisional'],
  ['one pair short of ON_MIN, better, is still PROVISIONAL', mk(UP.PREDICT.ON_MIN - 1, 2, 0.5), 'provisional'],
  ['ON_MIN pairs, better at the p90, the p99 and the mean, is ON', mk(UP.PREDICT.ON_MIN, 2, 0.5), 'on'],
  ['worse at the p90 alone is OFF', mk(40, 0.5, 0.8), 'off'],
  ['better at p90 and mean but worse at the p99 (a tail the stale reading does not have) is OFF', mk(40, 1, 0.5, { tailP: 9 }), 'off'],
  // better at the p90 and the p99, the mean EXACTLY equal (sums of halves and units, exact in floating point): 100 pairs, the stale
  // reading 1 point off at 98 and 3 at two; the projection 0.5 off at 99 and 54.5 at one — both means 1.04
  ['equal at the mean is OFF (better means LOWER)', Array.from({ length: 100 }, (_, i) => ({ lane: 'sevenDay', t: 1000 + i, stale: i >= 98 ? 3 : 1, proj: i === 99 ? 54.5 : 0.5 })), 'off'],
  ['a PROVISIONAL band that turns out worse goes back to the plain line: OFF', mk(UP.PREDICT.PROVISIONAL_MIN + 2, 0.5, 1), 'off'],
];
const ruleTable = (mod) => RULE_ROWS.map(([name, pairs, want]) => { const v = mod.verdictOf(pairs); return { name: `rule: ${name}`, good: v.state === want && v.n === pairs.length, v }; });
for (const r of ruleTable(UP)) ok(r.good, r.name, r.v);
ok(Object.isFrozen(UP.PREDICT) && UP.PREDICT.PROVISIONAL_MIN < UP.PREDICT.ON_MIN && UP.PREDICT.WINDOW_MS > 0 && UP.PREDICT.RING_MAX > UP.PREDICT.ON_MIN,
  `the thresholds are named constants (provisional from ${UP.PREDICT.PROVISIONAL_MIN}, on from ${UP.PREDICT.ON_MIN}, a window of ${UP.PREDICT.WINDOW_MS / 864e5} days) — and each carries its reason in the source`);
{
  const src = fs.readFileSync(path.join(REPO, 'src/usage-predict.js'), 'utf8');
  ok(['PROVISIONAL_MIN', 'ON_MIN', 'WINDOW_MS', 'RING_MAX'].every((k) => new RegExp(`${k}: [^,]+, +// .{20,}`).test(src)), 'every threshold has its reason beside it (a comment of its own)');
}

console.log('— ② the source of an identity, and the pairs of one anchor line');
const srcTable = (mod) => [
  ['a codex identity', mod.sourceOf('codex:acct-made-1') === 'codex'],
  ['an Antigravity identity', mod.sourceOf('antigravity:acct-made-2') === 'antigravity'],
  ['any other identity is Claude\'s', mod.sourceOf('org_made-3') === 'claude' && mod.sourceOf(null) === 'claude'],
].map(([name, good]) => ({ name: `source: ${name}`, good }));
for (const r of srcTable(UP)) ok(r.good, r.name);
{
  const line = { fetchedAt: 5000, calib: { sevenDay: { pred: 0.42, act: 0.4, u0: 0.35 }, fiveHour: { pred: 0.1, act: 0.12, u0: 0.12 }, 'scoped:made': { act: 0.5 } } };
  const ps = UP.pairsOf(line);
  const seven = ps.find((p) => p.lane === 'sevenDay'), five = ps.find((p) => p.lane === 'fiveHour');
  ok(ps.length === 2 && Math.abs(seven.stale - 5) < 1e-9 && Math.abs(seven.proj - 2) < 1e-9 && five.stale === 0 && Math.abs(five.proj - 2) < 1e-9 && seven.t === 5000,
    "a calib line gives, per bucket, the stale reading's |error| (|act − u0|) and the projection's (|act − pred|) in points; a bucket missing its prediction gives none", ps);
  ok(UP.pairsOf(line, 6000).length === 0 && UP.pairsOf({ fetchedAt: 1 }).length === 0 && UP.pairsOf(null).length === 0, 'a line older than the window, a line with no calib, and no line give none');
}

console.log('— ③ the gate: the pool keeps ON lanes only; the screen keeps ON and PROVISIONAL');
{
  const est = { estimated: true, fiveHour: { utilization: 0.2 }, sevenDay: { utilization: 0.5 }, scopedWeekly: [{ name: 'Made', utilization: 0.7 }] };
  const states = { fiveHour: 'off', sevenDay: 'provisional', 'scoped:made': 'on' };
  const pool = UP.gateEstimate(est, (k) => states[k], (s) => s === 'on'), screen = UP.gateEstimate(est, (k) => states[k], (s) => s === 'on' || s === 'provisional');
  ok(pool && pool.fiveHour === null && pool.sevenDay === null && pool.scopedWeekly.length === 1, 'the pool reads the estimate of an ON lane only — an off or provisional lane is its raw reading', pool);
  ok(screen && screen.fiveHour === null && screen.sevenDay && screen.scopedWeekly.length === 1, 'the screen draws ON and PROVISIONAL lanes, never an off or learning one', screen);
  ok(UP.gateEstimate(est, () => 'learning', (s) => s === 'on') === null && UP.gateEstimate(null, () => 'on', () => true) === null && est.sevenDay.utilization === 0.5, 'nothing left is no estimate at all; the estimate given is not changed');
}

console.log("— ④ the estimator over a made anchors folder: this instance's verdict per source and lane");
{
  const { UsageEstimator } = require(path.join(REPO, 'src/usage-estimator.js'));
  const dir = scratch('usage-predict'); fs.mkdirSync(path.join(dir, 'anchors'), { recursive: true });
  // made times far AHEAD (2100-01-01): the estimator keeps pairs from its own clock's window, so a fixed past instant would age
  // out of it — this suite reads no clock
  const T0 = 4102444800000, slug = (k) => k.replace(/[^\w.@-]/g, '_').slice(0, 80);
  // a Claude identity whose projection is BETTER on its week lane (40 pairs) and WORSE on its 5h lane; a codex identity with 3 pairs
  const write = (key, lines) => fs.writeFileSync(path.join(dir, 'anchors', 'anchors-' + slug(key) + '.ndjson'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const claude = Array.from({ length: 40 }, (_, i) => ({ fetchedAt: T0 + i * 60e3, ts: T0 + i * 60e3, calib: { sevenDay: { u0: 0.3, act: 0.32 + (i % 3) * 0.001, pred: 0.318 + (i % 3) * 0.001 }, fiveHour: { u0: 0.1, act: 0.1, pred: 0.13 } } }));
  const codex = Array.from({ length: 3 }, (_, i) => ({ fetchedAt: T0 + i * 3600e3, ts: T0 + i * 3600e3, calib: { sevenDay: { u0: 0.2, act: 0.25, pred: 0.21 } } }));
  write('org_made-claude', claude); write('codex:made-codex', codex);
  const est = new UsageEstimator({ anchorsDir: path.join(dir, 'anchors'), usageHistory: null, resolveIdentity: (id) => ({ identityKey: id === 'acct-c' ? 'org_made-claude' : id === 'acct-x' ? 'codex:made-codex' : 'org_made-claude' }), priorsFor: () => null });
  const now = T0 + 41 * 60e3;
  est.lines('org_made-claude'); est.lines('codex:made-codex');   // as the estimator reads them for its learning
  const vC7 = est.predictVerdict('claude', 'sevenDay', now), vC5 = est.predictVerdict('claude', 'fiveHour', now), vX7 = est.predictVerdict('codex', 'sevenDay', now), vA = est.predictVerdict('antigravity', 'sevenDay', now);
  ok(vC7.state === 'on' && vC7.n === 40, "a source whose projection beat the stale reading at its 40 recorded pairs is ON — this instance's own record decides", vC7);
  ok(vC5.state === 'off' && vX7.state === 'learning' && vX7.n === 3 && vA.state === 'learning' && vA.n === 0, 'a lane whose projection was worse is OFF; a source with 3 pairs is LEARNING; a source with none is LEARNING', { vC5, vX7, vA });
  ok(est.predictVerdict('claude', 'sevenDay', now + UP.PREDICT.WINDOW_MS + 3600e3).state === 'learning', 'pairs older than the window no longer count: the verdict moves with the record');
  const made = { estimated: true, fiveHour: { utilization: 0.4 }, sevenDay: { utilization: 0.6 }, scopedWeekly: [] };
  est.estimateFor = () => made;   // the estimate as the estimator would make it; the gate is what is proven here
  const pc = est.poolEstimateFor('acct-c', null, now), px = est.poolEstimateFor('acct-x', null, now);
  ok(pc && pc.sevenDay && pc.fiveHour === null && px === null, "the POOL's estimate keeps the ON lane only — Claude's week (on) is overlaid, its 5h (off) and codex's (learning) are read raw", { pc, px });
  const st = est.predictStatesFor('acct-x', made, now);
  ok(st.sevenDay && st.sevenDay.state === 'learning' && st.sevenDay.n === 3 && st.fiveHour.state === 'learning', 'each lane of an account says its state and its count (the screen shows the count of readings)', st);
}

console.log('— ⑤ the wiring: the pool door, the route, the band\'s words');
{
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const door = eng.slice(eng.indexOf('function poolReadCache('), eng.indexOf('\n}\n', eng.indexOf('function poolReadCache(')));
  ok(/usageEstimator\.poolEstimateFor\(id, raw, now\)/.test(door) && !/usageEstimator\.estimateFor\(/.test(door) && !/usageEstimator\.estimateFor\(/.test(eng),
    "the pool's ONE decision door (poolReadCache) overlays poolEstimateFor — the estimate held to ON lanes — and the engine reads no other estimate");
  const routes = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  const block = routes.slice(routes.indexOf('estimates: (() => {'), routes.indexOf('})(),', routes.indexOf('estimates: (() => {')));
  ok(/const screen = \(id, est\) =>/.test(block) && (block.match(/screen\([^)]*e\.estimateFor\(/g) || []).length === 3 && /x === 'on' \|\| x === 'provisional'/.test(block) && /predict: st/.test(block) && /sinceRequests/.test(block),
    '/api/usage: every estimate passes the screen gate (Claude accounts, the global login, codex) — a lane is drawn only where on or provisional, each says its state, and how much was used here since');
  const meter = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  const stat = meter.slice(meter.indexOf('const estStat = '), meter.indexOf('\n    };\n', meter.indexOf('const estStat = ')));
  ok(/t\('up to \{pct\}% · from \{n\} readings'/.test(stat) && /t\('up to \{pct\}%'/.test(stat) && /t\('\{n\} requests here since'/.test(stat) && !/est \{pct\}%/.test(stat),
    "the popup's words: «up to Y%» (the reading is the floor), a provisional band «· from N readings», a lane that draws nothing «N requests here since» — no «est N%» chip");
  const dict = (f) => fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8');
  const WORDS = ['up to {pct}%', 'up to {pct}% · from {n} readings', "Between the last reading (a floor) and the projection: the reading plus this hub's use since, at this account's learned rate.", '{n} requests here since'];
  ok(['i18n-zh.js', 'i18n-ja.js'].every((f) => WORDS.every((w) => dict(f).includes(JSON.stringify(w) + ':'))), 'the four new strings are in the Chinese and the Japanese dictionaries');
}

console.log('— ⑥ mutant copies of src/usage-predict.js (a weakened rule must turn named rows red)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/usage-predict.js'), 'utf8');
  const M = mutantCopies('usage-predict', REPO);
  const all = (mod) => [...ruleTable(mod), ...srcTable(mod)];
  const CONTROLS = [
    { what: 'the p99 dropped from the rule', needle: ' && proj.p99 <= stale.p99', repl: '', reds: ['rule: better at p90 and mean but worse at the p99 (a tail the stale reading does not have) is OFF'] },
    { what: 'a mean that is equal counts as better', needle: ' && proj.mean < stale.mean', repl: ' && proj.mean <= stale.mean', reds: ['rule: equal at the mean is OFF (better means LOWER)'] },
    { what: 'no ON floor (on from the first pair that is better)', needle: "n >= consts.ON_MIN ? 'on'", repl: "n >= 1 ? 'on'", reds: ['rule: PROVISIONAL_MIN pairs, better at all three, is PROVISIONAL', 'rule: one pair short of ON_MIN, better, is still PROVISIONAL'] },
    { what: 'no learning floor', needle: "if (n < consts.PROVISIONAL_MIN) return { state: 'learning', n };", repl: "if (n < 1) return { state: 'learning', n };", reds: ['rule: fewer than PROVISIONAL_MIN pairs is LEARNING, whatever they say'] },
    { what: 'a worse projection kept on (no fall back to the plain line)', needle: "state: !better ? 'off' :", repl: "state: false ? 'off' :", reds: ['rule: worse at the p90 alone is OFF', 'rule: a PROVISIONAL band that turns out worse goes back to the plain line: OFF'] },
    { what: 'every source read as Claude', needle: "k.startsWith('codex:') ? 'codex' :", repl: "false ? 'codex' :", reds: ['source: a codex identity'] },
  ];
  for (const c of CONTROLS) {
    ok(src.split(c.needle).length === 2, `control "${c.what}": the needle is in the shipped source once`);
    const mod = M.load('src/usage-predict.js', src.replace(c.needle, c.repl), c.what.replace(/\W+/g, '-').slice(0, 24));
    const red = all(mod).filter((r) => !r.good).map((r) => r.name);
    ok(c.reds.every((n) => red.includes(n)), `control "${c.what}": the named rows go RED on the weakened copy (${red.length} red)`, red);
  }
  for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: CONTROLS.length })) ok(row.pass, row.name, row.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
