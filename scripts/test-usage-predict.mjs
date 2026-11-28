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
//   ⑥ THE HOLD (主开发's look, law B): the walk over fixed boundaries — the 29/30 edge, the dwell, a near tie, the bands, a hub's
//      first day;  ⑦ ONE VERDICT FROM ONE PAIR SET: pruning, a meta grown by its tail, a restart;  ⑧ the pool's reads of the
//      estimator, each a row;  ⑨ mutant copies — each weakened rule turns its named rows red;  ⑩ the adapters (pick 3);
//   ⑪ THE SURFACES: the real meter — a PROVISIONAL lane only in the popup, the taskbar's rings and the phone's chip draw the reading
import { scratch } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const UP = require(path.join(REPO, 'src/usage-predict.js'));
// THE BUILD GUARD (the closure check's P3-3): the popup and surface legs import the client, which needs the build's file —
// an unbuilt checkout is refused by name, never a row green with nothing judged
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
let pass = 0, fail = 0;
function ok(cond, name, detail) { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
}
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
// made pairs: n of them, the stale reading off by `s` points and the projection by `p` (a small spread so a p90 / p99 exists)
const mk = (n, s, p, { tailS = null, tailP = null, t0 = 1000, dt = 1 } = {}) => Array.from({ length: n }, (_, i) => ({ lane: 'sevenDay', t: t0 + i * dt, stale: s + (i % 3) * 0.1 + (i === n - 1 && tailS != null ? tailS : 0), proj: p + (i % 3) * 0.1 + (i === n - 1 && tailP != null ? tailP : 0) }));
const C = UP.PREDICT, HOUR = 3600e3, DAY = 24 * HOUR;
const T0 = 4102444800000;   // 2100-01-01T00:00Z — a boundary; made times far ahead, this suite reads no clock

console.log('— ① THE RULE, one boundary judged alone (from learning, before the hold)');
const RULE_ROWS = [
  ['fewer than PROV_ENTER_N pairs is LEARNING, whatever they say', mk(C.PROV_ENTER_N - 1, 2, 0.1), 'learning'],
  ['PROV_ENTER_N pairs, clearly better, is PROVISIONAL', mk(C.PROV_ENTER_N, 2, 0.5), 'provisional'],
  ['one pair short of ON_ENTER_N, clearly better, is still PROVISIONAL', mk(C.ON_ENTER_N - 1, 2, 0.5), 'provisional'],
  ['ON_ENTER_N pairs, better at the p90 and the p99 and ≤ 90 % at the mean, is ON', mk(C.ON_ENTER_N, 2, 0.5), 'on'],
  ['better at all three but NOT by 10 % at the mean is OFF (no band without the margin)', mk(40, 1, 0.93), 'off'],
  ['worse at the p90 alone is OFF', mk(40, 0.5, 0.8), 'off'],
  ['better at p90 and mean but worse at the p99 (a tail the stale reading does not have) is OFF', mk(40, 1, 0.5, { tailP: 9 }), 'off'],
  // better at the p90 and the p99, the mean EXACTLY equal (sums of halves and units, exact in floating point): both means 1.04
  ['equal at the mean is OFF (better means LOWER, by the margin)', Array.from({ length: 100 }, (_, i) => ({ lane: 'sevenDay', t: 1000 + i, stale: i >= 98 ? 3 : 1, proj: i === 99 ? 54.5 : 0.5 })), 'off'],
];
const ruleTable = (mod) => RULE_ROWS.map(([name, pairs, want]) => { const v = mod.verdictOf(pairs); return { name: `rule: ${name}`, good: v.state === want && v.n === pairs.length, v }; });
for (const r of ruleTable(UP)) ok(verdictOf(r.good), r.name, r.v);
{
  const src = fs.readFileSync(path.join(REPO, 'src/usage-predict.js'), 'utf8');
  const KEYS = ['STEP_MS', 'WINDOW_MS', 'WALK_MS', 'KEEP_MS', 'ON_ENTER_N', 'ON_STAY_N', 'PROV_ENTER_N', 'PROV_STAY_N', 'ENTER_MEAN', 'WORSE_P90', 'WORSE_P99', 'DWELL_STEPS', 'RING_MAX'];
  ok(gateOf(Object.isFrozen(C)) && JSON.stringify(Object.keys(C)) === JSON.stringify(KEYS) && verdictOf(KEYS.every((k) => new RegExp(`${k}: [^,]+, +// .{20,}`).test(src))),
    `ONE TABLE of the constants (${KEYS.length}), frozen, each with its reason beside it — and nothing more`, Object.keys(C));
  ok(C.KEEP_MS === C.WALK_MS + C.WINDOW_MS && C.ON_STAY_N < C.ON_ENTER_N && C.PROV_STAY_N < C.PROV_ENTER_N && C.ENTER_MEAN < 1 && C.WORSE_P90 > 1 && C.WORSE_P99 > 1 && C.DWELL_STEPS * C.STEP_MS === DAY,
    'the walk keeps exactly what it reads (42 d = 28 d walked + a 14-d window); 30 in / 20 out; 5 in / 4 out; the margins on both sides; the dwell a day');
}

console.log('— ② the source of an identity, and the pairs of one anchor line');
const srcTable = (mod) => [
  ['a codex identity', mod.sourceOf('codex:acct-made-1') === 'codex'],
  ['an Antigravity identity', mod.sourceOf('antigravity:acct-made-2') === 'antigravity'],
  ["Claude's own kinds are Claude's", ['org:made', 'email:a@b.invalid', 'acct:__global__', 'org_made-3'].every((k) => mod.sourceOf(k) === 'claude') && mod.sourceOf(null) === 'claude'],
  ['a harness the estimator does not learn is ITS source, and not a known one', mod.sourceOf('made-acp:email:a@b.invalid') === 'made-acp' && !mod.knownSource('made-acp') && mod.knownSource('claude') && mod.knownSource('codex') && mod.knownSource('antigravity')],
].map(([name, good]) => ({ name: `source: ${name}`, good }));
for (const r of srcTable(UP)) ok(verdictOf(r.good), r.name);
{
  const line = { fetchedAt: 5000, calib: { sevenDay: { pred: 0.42, act: 0.4, u0: 0.35 }, fiveHour: { pred: 0.1, act: 0.12, u0: 0.12 }, 'scoped:made': { act: 0.5 } } };
  const ps = UP.pairsOf(line);
  const seven = ps.find((p) => p.lane === 'sevenDay'), five = ps.find((p) => p.lane === 'fiveHour');
  ok(ps.length === 2 && Math.abs(seven.stale - 5) < 1e-9 && Math.abs(seven.proj - 2) < 1e-9 && five.stale === 0 && Math.abs(five.proj - 2) < 1e-9 && seven.t === 5000,
    "a calib line gives, per bucket, the stale reading's |error| (|act − u0|) and the projection's (|act − pred|) in points; a bucket missing its prediction gives none", ps);
  ok(UP.pairsOf(line, 6000).length === 0 && UP.pairsOf({ fetchedAt: 1 }).length === 0 && UP.pairsOf(null).length === 0, 'a line older than the kept span, a line with no calib, and no line give none');
}

console.log('— ③ the gate: the pool and every surface keep ON lanes; a PROVISIONAL lane only in its own field');
{
  const est = { estimated: true, fiveHour: { utilization: 0.2 }, sevenDay: { utilization: 0.5 }, scopedWeekly: [{ name: 'Made', utilization: 0.7 }] };
  const states = { fiveHour: 'off', sevenDay: 'provisional', 'scoped:made': 'on' };
  const on = UP.gateEstimate(est, (k) => states[k], (s) => s === 'on'), prov = UP.gateEstimate(est, (k) => states[k], (s) => s === 'provisional');
  ok(gateOf(on) && on.fiveHour === null && on.sevenDay === null && on.scopedWeekly.length === 1, 'the ON view (the pool, the rings, the menu, the chip) keeps the ON lane only', on);
  ok(gateOf(prov) && gateOf(prov.sevenDay) && prov.fiveHour === null && prov.scopedWeekly.length === 0, 'the PROVISIONAL view (the popup alone) keeps the provisional lane only', prov);
  ok(UP.gateEstimate(est, () => 'learning', (s) => s === 'on') === null && UP.gateEstimate(null, () => 'on', () => true) === null && est.sevenDay.utilization === 0.5, 'nothing left is no estimate at all; the estimate given is not changed');
}

console.log("— ④ the estimator over a made anchors folder: this instance's verdict per source and lane");
const { UsageEstimator } = require(path.join(REPO, 'src/usage-estimator.js'));
const slug = (k) => k.replace(/[^\w.@-]/g, '_').slice(0, 80);
{
  const dir = scratch('usage-predict'); fs.mkdirSync(path.join(dir, 'anchors'), { recursive: true });
  const write = (key, lines) => fs.writeFileSync(path.join(dir, 'anchors', 'anchors-' + slug(key) + '.ndjson'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // a Claude identity whose projection is BETTER on its week lane (40 pairs, all in the step before the boundary T0) and WORSE on
  // its 5h lane; a codex identity with 3 pairs
  const claude = Array.from({ length: 40 }, (_, i) => ({ fetchedAt: T0 - 5 * HOUR + i * 5 * 60e3, ts: T0 - 5 * HOUR + i * 5 * 60e3, calib: { sevenDay: { u0: 0.3, act: 0.32 + (i % 3) * 0.001, pred: 0.318 + (i % 3) * 0.001 }, fiveHour: { u0: 0.1, act: 0.1, pred: 0.13 } } }));
  const codex = Array.from({ length: 3 }, (_, i) => ({ fetchedAt: T0 - 5 * HOUR + i * HOUR, ts: T0 - 5 * HOUR + i * HOUR, calib: { sevenDay: { u0: 0.2, act: 0.25, pred: 0.21 } } }));
  write('org_made-claude', claude); write('codex:made-codex', codex);
  const est = new UsageEstimator({ anchorsDir: path.join(dir, 'anchors'), usageHistory: null, resolveIdentity: (id) => ({ identityKey: id === 'acct-c' ? 'org_made-claude' : id === 'acct-x' ? 'codex:made-codex' : id === 'acct-u' ? 'made-acp:acct:u' : 'org_made-claude' }), priorsFor: () => null, lagS: 0 });
  const now = T0 + HOUR;
  est.lines('org_made-claude'); est.lines('codex:made-codex');
  const vC7 = est.predictVerdict('claude', 'sevenDay', now), vC5 = est.predictVerdict('claude', 'fiveHour', now), vX7 = est.predictVerdict('codex', 'sevenDay', now), vA = est.predictVerdict('antigravity', 'sevenDay', now);
  ok(vC7.state === 'on' && vC7.n === 40 && vC7.since === T0, "a source whose projection beat the stale reading at its 40 pairs is ON from the boundary that judged it — this instance's own record decides", vC7);
  ok(vC5.state === 'off' && vX7.state === 'learning' && vX7.n === 3 && vA.state === 'learning' && vA.n === 0, 'a lane whose projection was worse is OFF; a source with 3 pairs is LEARNING; a source with none is LEARNING', { vC5, vX7, vA });
  ok(est.predictVerdict('claude', 'sevenDay', T0 - 60e3).state === 'learning', 'BEFORE the boundary the same pairs say nothing yet: the verdict moves only at a boundary');
  ok(est.predictVerdict('claude', 'sevenDay', T0 + C.WINDOW_MS + HOUR).state === 'learning', 'pairs older than the window no longer count: the verdict moves with the record');
  ok(est.predictVerdict('made-acp', 'sevenDay', now).state === 'off' && est.predictVerdict('made-acp', 'sevenDay', now).why === 'unknown-source', 'an UNKNOWN source reads OFF (the said limit) — never Claude\'s verdict, never an unchecked band');
  const made = { estimated: true, fiveHour: { utilization: 0.4 }, sevenDay: { utilization: 0.6 }, scopedWeekly: [] };
  est.estimateFor = () => made;
  const pc = est.poolEstimateFor('acct-c', null, now), px = est.poolEstimateFor('acct-x', null, now);
  ok(gateOf(pc) && gateOf(pc.sevenDay) && pc.fiveHour === null && px === null, "the POOL's estimate keeps the ON lane only — Claude's week (on) is overlaid, its 5h (off) and codex's (learning) are read raw", { pc, px });
  est.burnFor = () => ({ fiveHour: 0.002, sevenDay: 0.0005 });
  const bc = est.poolBurnFor('acct-c', now), bx = est.poolBurnFor('acct-x', now);
  ok(JSON.stringify(bc) === JSON.stringify({ sevenDay: 0.0005 }) && JSON.stringify(bx) === '{}', "law B3: the POOL's burn (the projection's lead) keeps ON lanes only — the learned rate of an off or learning lane moves nothing", { bc, bx });
  // THE POOL ON A PROVISIONAL LANE (the closure check's S2): drawn in the popup, read by the pool NEVER — estimate and burn
  const ep = new UsageEstimator({ anchorsDir: path.join(dir, 'anchors'), usageHistory: null, resolveIdentity: () => ({ identityKey: 'org_made-claude' }), priorsFor: () => null, lagS: 0 });
  ep.predictVerdict = (src, lane) => ({ state: lane === 'sevenDay' ? 'provisional' : 'on', n: 12 });
  ep.estimateFor = () => made; ep.burnFor = () => ({ fiveHour: 0.002, sevenDay: 0.0005 });
  const pp = ep.poolEstimateFor('acct-p', null, now), bp = ep.poolBurnFor('acct-p', now);
  ok(gateOf(pp) && gateOf(pp.fiveHour) && pp.sevenDay === null && JSON.stringify(bp) === JSON.stringify({ fiveHour: 0.002 }), 'a PROVISIONAL lane: the pool reads neither its estimate nor its burn (the ON lane beside it is read)', { pp, bp });
  const st = est.predictStatesFor('acct-x', made, now);
  ok(gateOf(st.sevenDay) && st.sevenDay.state === 'learning' && st.sevenDay.n === 3 && st.fiveHour.state === 'learning', 'each lane of an account says its state and its count (the popup shows the count of readings on this hub)', st);
}

console.log('— ⑤ the wiring: the pool door, the route, the popup\'s words');
{
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const door = eng.slice(eng.indexOf('function poolReadCache('), eng.indexOf('\n}\n', eng.indexOf('function poolReadCache(')));
  ok(verdictOf(/usageEstimator\.poolEstimateFor\(id, raw, now\)/.test(door)), "the pool's ONE decision door (poolReadCache) overlays poolEstimateFor — the estimate held to ON lanes");
  const routes = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  const block = routes.slice(routes.indexOf('estimates: (() => {'), routes.indexOf('})(),', routes.indexOf('estimates: (() => {')));
  ok(gateOf(/const screen = \(id, est\) =>/.test(block)) && (block.match(/screen\([^)]*e\.estimateFor\(/g) || []).length === 3 && gateOf(/const drawn = UP\.gateEstimate\(est, \(k\) => \(st\[k\] \|\| \{\}\)\.state, \(x\) => x === 'on'\);/.test(block))
    && gateOf(/const prov = UP\.gateEstimate\(est, \(k\) => \(st\[k\] \|\| \{\}\)\.state, \(x\) => x === 'provisional'\);/.test(block)) && gateOf(/provisional: prov \?/.test(block)) && verdictOf(/predict: st/.test(block)),
    '/api/usage: every estimate (Claude accounts, the global login, codex) carries its ON lanes — what every surface draws — and its PROVISIONAL lanes apart, in `provisional`');
  const meter = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  const stat = meter.slice(meter.indexOf('const estStat = '), meter.indexOf('\n    };\n', meter.indexOf('const estStat = ')));
  ok(gateOf(/t\('about \{pct\}% · from \{n\} readings on this hub'/.test(stat)) && gateOf(/t\('about \{pct\}%'/.test(stat)) && gateOf(/t\('\{n\} requests here since'/.test(stat)) && !/up to/.test(stat) && !/est \{pct\}%/.test(stat),
    "law B4: the popup's words claim no bound — «about Y%», a provisional band «· from N readings on this hub», a lane that draws nothing «N requests here since»");
  ok(gateOf(/const estPop = popupEst\(estSel\);/.test(meter)) && gateOf(/const cEstPop = popupEst\(cEstSel\);/.test(meter)) && !/(estSel|cEstSel) = popupEst\(/.test(meter) && !/provisional/.test(meter.replace(/export function popupEst[\s\S]*?\n\}\n/, '').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'/g, "''")),
    'only the popup reads the provisional field (popupEst, into estPop / cEstPop beside the ON-only selections); nothing else in the client names it');
  const MU = await import(path.join(REPO, 'src/lib/usage-meter.js'));
  const pe = MU.popupEst({ fiveHour: null, sevenDay: { utilization: 0.5 }, scopedWeekly: [], provisional: { fiveHour: { utilization: 0.2 }, sevenDay: null, scopedWeekly: [{ name: 'Made' }] } });
  ok(pe.fiveHour.utilization === 0.2 && pe.sevenDay.utilization === 0.5 && pe.scopedWeekly.length === 1, 'popupEst merges a provisional lane in beside the ON ones (an ON lane is never replaced)', pe);
  const dict = (f) => fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8');
  const WORDS = ['about {pct}%', 'about {pct}% · from {n} readings on this hub', "An estimate, not a bound: the last reading plus this hub's use since, at this account's learned rate.", '{n} requests here since'];
  ok(verdictOf(['i18n-zh.js', 'i18n-ja.js'].every((f) => WORDS.every((w) => dict(f).includes(JSON.stringify(w) + ':')) && !dict(f).includes('"up to {pct}%'))), 'the words are in the Chinese and the Japanese dictionaries (约 / 約), and «up to» is gone from both');
}

console.log('— ⑥ THE HOLD: a walk over fixed boundaries — the verdict does not flap');
const plainChanges = (pairs, from, to) => { let n = 0, prev = null; for (let b = from; b <= to; b += C.STEP_MS) { const w = pairs.filter((p) => p.t <= b && p.t > b - C.WINDOW_MS); const s = UP.verdictOf(w).state; if (prev !== null && s !== prev) n++; prev = s; } return n; };
const walkChanges = (pairs, now, sinceB) => { const tr = []; UP.walkVerdict(pairs, now, C, null, tr); let n = 0; for (let i = 1; i < tr.length; i++) if (tr[i].b > sinceB && tr[i].state !== tr[i - 1].state) n++; return { n, tr }; };
{
  // THE REFUTER'S EDGE: ~30 pairs in every 14-day window (one pair every 11.2 h), the projection's quality unchanged
  const period = C.WINDOW_MS / 29.5, start = T0 - 30 * DAY, edge = [];
  for (let t = start; t <= T0 + 2 * DAY; t += period) edge.push({ lane: 'sevenDay', t: Math.round(t), stale: 2 + (edge.length % 3) * 0.1, proj: 0.5 + (edge.length % 3) * 0.1 });
  const pc = plainChanges(edge, T0, T0 + 2 * DAY), wc = walkChanges(edge, T0 + 2 * DAY, T0);
  ok(pc >= 3 && wc.n === 0 && wc.tr[wc.tr.length - 1].state === 'on', `the 29/30 edge for 48 h: the plain rule changes ${pc}×, the walk 0× (on, held: 30 in, 20 out)`, { pc, walk: wc.tr.slice(-9) });
  // THE DWELL: on, then clearly worse for a day (off), then clearly better again — held off for its 24 h, then on
  const good = mk(40, 2, 0.5, { t0: T0 - 3 * DAY, dt: 60e3 }), bad = mk(200, 0.5, 2, { t0: T0 - 2 * DAY, dt: 60e3 }), back = mk(4000, 2, 0.2, { t0: T0 - 40 * HOUR, dt: 30e3 });
  const tr = []; UP.walkVerdict([...good, ...bad, ...back].sort((a, b) => a.t - b.t), T0 + 2 * DAY, C, null, tr);
  const at = (b) => (tr.find((x) => x.b === b) || {}).state;
  ok(at(T0 - 66 * HOUR) === 'on' && at(T0 - 42 * HOUR) === 'off' && at(T0 - 36 * HOUR) === 'off' && at(T0 - 18 * HOUR) === 'on',
    'the dwell: on → clearly worse → OFF; clearly better again 2 h later → still OFF until its 24 h are out → ON', tr.filter((x) => x.b >= T0 - 3 * DAY).map((x) => `${(x.b - T0) / HOUR}h:${x.state}`).join(' '));
  // A NEAR TIE does not move a state: neither clearly better (≤ 90 % at the mean) nor clearly worse
  const tie = (prev) => UP.stepState(prev, UP.judge(mk(40, 1, 0.95)));
  ok(tie('on') === 'on' && tie('off') === 'off' && tie('learning') === 'off', 'a near tie keeps the state a lane has: on stays on, off stays off — one pair cannot flip it');
  ok(UP.stepState('on', UP.judge(mk(25, 2, 0.5))) === 'on' && UP.stepState('on', UP.judge(mk(19, 2, 0.5))) === 'provisional' && UP.stepState('provisional', UP.judge(mk(4, 2, 0.5))) === 'provisional' && UP.stepState('provisional', UP.judge(mk(3, 2, 0.5))) === 'learning' && UP.stepState('learning', UP.judge(mk(4, 2, 0.5))) === 'learning',
    'the bands: ON stays at 25 pairs and falls to PROVISIONAL at 19 (20 out); PROVISIONAL stays at 4 and falls to LEARNING at 3 (4 out); LEARNING needs 5 to enter');
  // A HUB'S FIRST DAY AND FIRST WEEK (amendment 1): nothing before the first boundary after its first pairs
  const young = mk(60, 2, 0.5, { t0: T0 + 30 * 60e3, dt: 60e3 });
  ok(UP.walkVerdict(young, T0 + 5 * HOUR).state === 'learning' && UP.walkVerdict(young, T0 + 6 * HOUR).state === 'on',
    "a new hub's first pairs say nothing until the next boundary (≤ 6 h); a lane that earns it is ON there, then held a day");
}

console.log('— ⑦ ONE VERDICT FROM ONE PAIR SET (law B1, amendment 1): whatever road read the file, before and after pruning, after a restart');
{
  // a history that MATTERS: clearly better 28–42 days back (ON), then a near tie for the last 28 days — ON holds through the tie
  const old = mk(400, 2, 0.5, { t0: T0 - 41 * DAY, dt: 45 * 60e3 }), tieP = mk(1200, 1, 0.95, { t0: T0 - 27 * DAY, dt: 30 * 60e3 });
  const all = [...mk(300, 0.5, 2, { t0: T0 - 70 * DAY, dt: HOUR }), ...old, ...tieP].sort((a, b) => a.t - b.t), now = T0 + HOUR;
  const full = UP.walkVerdict(all, now), kept = UP.walkVerdict(all.filter((p) => p.t >= UP.keepSince(now)), now);
  ok(full.state === 'on' && kept.state === 'on' && full.n === kept.n && full.since === kept.since, 'the verdict over every pair ever recorded = over the pairs the estimator keeps (42 d + a step): pruning changes nothing', { full, kept });
  const short = UP.walkVerdict(all.filter((p) => p.t >= now - C.WINDOW_MS), now);
  ok(short.state === 'off', 'CONTROL: kept for one window only (the old keep), the same record reads OFF — the history the walk needs IS what the store keeps', short);
  // through the estimator: read whole, grown by a tail, restarted
  const dir = scratch('usage-predict-road'); fs.mkdirSync(path.join(dir, 'anchors'), { recursive: true });
  const key = 'org_made-road', file = path.join(dir, 'anchors', 'anchors-' + slug(key) + '.ndjson');
  const lineOf = (p) => ({ fetchedAt: p.t, ts: p.t, calib: { sevenDay: { u0: 0.5, act: 0.5 + p.stale / 100, pred: 0.5 + p.stale / 100 - p.proj / 100 } } });
  fs.writeFileSync(file, all.map((p) => JSON.stringify(lineOf(p))).join('\n') + '\n');
  const mkEst = () => new UsageEstimator({ anchorsDir: path.join(dir, 'anchors'), usageHistory: null, resolveIdentity: () => ({ identityKey: key }), priorsFor: () => null, lagS: 0 });
  const e1 = mkEst(); e1.lines(key);
  const v1 = e1.predictVerdict('claude', 'sevenDay', now);
  fs.appendFileSync(file, JSON.stringify(lineOf({ t: now - 60e3, stale: 1, proj: 0.95 })) + '\n');   // an ordinary sweep appends one reading
  e1._metaOf(key);   // the meta grows by its tail (the road the refuter took)
  const v2 = e1.predictVerdict('claude', 'sevenDay', now);
  const e2 = mkEst(); e2.lines(key);   // a restart: the whole file read anew
  const v3 = e2.predictVerdict('claude', 'sevenDay', now);
  ok(v1.state === 'on' && v2.state === v3.state && v2.n === v3.n && v2.since === v3.since && (e1.metaTailReads || 0) >= 1, 'a meta GROWN by its tail and a restart that reads the file whole give ONE verdict', { v1, v2, v3, tail: e1.metaTailReads });
}

console.log('— ⑧ THE POOL\'S READS OF THE ESTIMATOR (law B3): every one a row — gated, or bookkeeping with its reason');
{
  const POOL_FILES = ['src/server/usage-pool-engine.js', 'src/server/auto-cli-loop.js'];
  const ROWS = {
    poolEstimateFor: 'GATED — the estimate held to ON lanes (the one decision door)',
    poolBurnFor: 'GATED — the learned burn held to ON lanes (the projection\'s lead)',
    basisRaw: 'bookkeeping — whether a pool runs on raw readings (no prediction in it)',
    basisGen: 'bookkeeping — the basis generation (a counter)',
    primeIfCold: 'bookkeeping — loads the lines a sweep needs',
    viewFor: 'bookkeeping — reads off the loop what the sweep\'s fresh step will ask of one identity\'s anchors file (B-360d part 3 U1); no prediction read',
    withView: 'bookkeeping — serves the sweep\'s step from that view (B-360d part 3 U1); no prediction read',
    noteLive: 'bookkeeping — hands the estimator a live usage record (its odometer ring); a write INTO it, no prediction read',
    retireRates: 'bookkeeping — a split name\'s rates entry dropped before its anchors file is archived (B-87fd identity unit 4, r3022 (1)); no prediction read',
    estimateFor: 'auto-cli-loop only: the burn-aware CLI rung\'s drift (2.329.0, its own ruling) — when to read, never a placement',
  };
  const codeOf = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const reads = (t) => [...codeOf(t).matchAll(/\b(?:usageEstimator|d\.usageEstimator)\.([A-Za-z_]+)/g)].map((m) => m[1]);
  const census = POOL_FILES.map((f) => [f, [...new Set(reads(fs.readFileSync(path.join(REPO, f), 'utf8')))]]);
  const unrowed = census.flatMap(([f, ms]) => ms.filter((m) => !ROWS[m] || (m === 'estimateFor' && f !== 'src/server/auto-cli-loop.js')).map((m) => f + ': ' + m));
  ok(!unrowed.length, `every read of the estimator in the pool's files is a row (${census.map(([f, ms]) => f.split('/').pop() + ' ' + ms.join(',')).join(' · ')})`, unrowed);
  const planted = fs.readFileSync(path.join(REPO, POOL_FILES[0]), 'utf8').replace('const burn = usageEstimator.poolBurnFor(memberId, nowMs)', 'const burn = usageEstimator.burnFor(memberId, nowMs)');
  ok(gateOf(reads(planted).includes('burnFor')) && !ROWS.burnFor, 'CONTROL: the learned burn read raw (the lead projection before this cure) is a member with no row — RED by the same census');
}

console.log('— ⑨ mutant copies (a weakened rule must turn named rows red)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/usage-predict.js'), 'utf8');
  const M = mutantCopies('usage-predict', REPO);
  const holdRows = (mod) => {
    const period = C.WINDOW_MS / 29.5, edge = [];
    for (let t = T0 - 30 * DAY; t <= T0 + 2 * DAY; t += period) edge.push({ lane: 'sevenDay', t: Math.round(t), stale: 2 + (edge.length % 3) * 0.1, proj: 0.5 + (edge.length % 3) * 0.1 });
    const tr = []; mod.walkVerdict(edge, T0 + 2 * DAY, mod.PREDICT, null, tr);
    let n = 0; for (let i = 1; i < tr.length; i++) if (tr[i].b > T0 && tr[i].state !== tr[i - 1].state) n++;
    const good = mk(40, 2, 0.5, { t0: T0 - 3 * DAY, dt: 60e3 }), bad = mk(200, 0.5, 2, { t0: T0 - 2 * DAY, dt: 60e3 }), back = mk(4000, 2, 0.2, { t0: T0 - 40 * HOUR, dt: 30e3 });
    const t2 = []; mod.walkVerdict([...good, ...bad, ...back].sort((a, b) => a.t - b.t), T0 + 2 * DAY, mod.PREDICT, null, t2);
    const at = (b) => (t2.find((x) => x.b === b) || {}).state;
    return [{ name: 'hold: the 29/30 edge does not flap', good: n === 0 }, { name: 'hold: the dwell holds a day', good: at(T0 - 36 * HOUR) === 'off' && at(T0 - 18 * HOUR) === 'on' },
      { name: 'hold: a worse lane leaves ON', good: at(T0 - 42 * HOUR) === 'off' }];
  };
  const all = (mod) => [...ruleTable(mod), ...srcTable(mod), ...holdRows(mod)];
  const CONTROLS = [
    { what: 'the p99 dropped from the margin', needle: ' && proj.p99 <= stale.p99 && proj.mean', repl: ' && proj.mean', reds: ['rule: better at p90 and mean but worse at the p99 (a tail the stale reading does not have) is OFF'] },
    { what: 'no margin at the mean', needle: 'proj.mean <= C.ENTER_MEAN * stale.mean', repl: 'proj.mean < stale.mean', reds: ['rule: better at all three but NOT by 10 % at the mean is OFF (no band without the margin)'] },
    { what: 'no ON floor', needle: "if (n >= C.ON_ENTER_N && enter) return 'on';", repl: "if (n >= 1 && enter) return 'on';", reds: ['rule: PROV_ENTER_N pairs, clearly better, is PROVISIONAL', 'rule: one pair short of ON_ENTER_N, clearly better, is still PROVISIONAL'] },
    { what: 'no learning floor', needle: "return n < C.PROV_ENTER_N ? 'learning' : 'off';", repl: "return 'off';", reds: ['rule: fewer than PROV_ENTER_N pairs is LEARNING, whatever they say'] },
    { what: 'a worse lane kept on', needle: "if (prev === 'on') return worse ? 'off' :", repl: "if (prev === 'on') return false ? 'off' :", reds: ['hold: a worse lane leaves ON'] },
    { what: 'no stay band (30 in, 30 out)', needle: "n >= C.ON_STAY_N ? 'on'", repl: "n >= C.ON_ENTER_N ? 'on'", reds: ['hold: the 29/30 edge does not flap'] },
    { what: 'no dwell', needle: '(b - changedAt) >= C.DWELL_STEPS * C.STEP_MS', repl: 'true', reds: ['hold: the dwell holds a day'] },
    { what: 'every source read as Claude', needle: "return m && !CLAUDE_KEY_KINDS.has(m[1]) ? m[1] : 'claude';", repl: "return 'claude';", reds: ['source: a codex identity'] },
  ];
  for (const c of CONTROLS) {
    ok(src.split(c.needle).length === 2, `control "${c.what}": the needle is in the shipped source once`);
    const mod = M.load('src/usage-predict.js', editAnchor(src, c.needle, c.repl, "src/usage-predict.js"), c.what.replace(/\W+/g, '-').slice(0, 24));
    const red = all(mod).filter((r) => !r.good).map((r) => r.name);
    ok(verdictOf(c.reds.every((n) => red.includes(n))), `control "${c.what}": the named rows go RED on the weakened copy (${red.length} red)`, red);
  }
  for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: CONTROLS.length })) ok(verdictOf(row.pass), row.name, row.detail);
  // the estimator's own gates, weakened in memory: the pool reading a PROVISIONAL lane; the old keep of one window
  const Module = require('node:module');
  const estMut = (from, to) => { const f = path.join(REPO, 'src/usage-estimator.js'), t = fs.readFileSync(f, 'utf8'); if (!t.includes(from)) throw new Error('needle gone: ' + from.slice(0, 50)); const m = new Module(f, null); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f)); m._compile(t.split(from).join(to), f); return m.exports; };
  {
    const EM = estMut("(st) => st === 'on');", "(st) => st === 'on' || st === 'provisional');");
    const dir = scratch('usage-predict-mut'); fs.mkdirSync(path.join(dir, 'anchors'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'anchors', 'anchors-' + slug('org_made-p') + '.ndjson'), Array.from({ length: 10 }, (_, i) => JSON.stringify({ fetchedAt: T0 - 5 * HOUR + i * 60e3, calib: { sevenDay: { u0: 0.3, act: 0.32, pred: 0.319 } } })).join('\n') + '\n');
    const e = new EM.UsageEstimator({ anchorsDir: path.join(dir, 'anchors'), usageHistory: null, resolveIdentity: () => ({ identityKey: 'org_made-p' }), priorsFor: () => null, lagS: 0 });
    e.lines('org_made-p'); e.estimateFor = () => ({ estimated: true, fiveHour: null, sevenDay: { utilization: 0.6 }, scopedWeekly: [] });
    const v = e.predictVerdict('claude', 'sevenDay', T0 + HOUR), pe = e.poolEstimateFor('x', null, T0 + HOUR);
    ok(v.state === 'provisional' && gateOf(pe) && verdictOf(pe.sevenDay), 'CONTROL: a copy of the estimator whose pool admits PROVISIONAL overlays a 10-pair lane — the shipped gate (④) does not', { v: v.state, pe });
  }
  {
    const EB = estMut(".state === 'on') out[lane] = v;", ".state !== 'off') out[lane] = v;");
    const e = new EB.UsageEstimator({ anchorsDir: scratch('usage-predict-mut-b'), usageHistory: null, resolveIdentity: () => ({ identityKey: 'org_made-b' }), priorsFor: () => null, lagS: 0 });
    e.predictVerdict = (src, lane) => ({ state: lane === 'sevenDay' ? 'provisional' : 'on', n: 12 }); e.burnFor = () => ({ fiveHour: 0.002, sevenDay: 0.0005 });
    ok(JSON.stringify(e.poolBurnFor('x', T0)) !== JSON.stringify({ fiveHour: 0.002 }), 'CONTROL: a copy of the estimator whose pool BURN admits a provisional lane reads its learned rate — RED by ④\'s row');
  }
}

console.log('— ⑩ THE ADAPTERS (pick 3): a source\'s facts are its adapter\'s; the core holds no Claude constant');
{
  const readT = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const CORE = ['src/usage-estimator.js', 'src/server/usage-pool-engine.js', 'src/ledger-slot-backfill.js', 'src/usage-predict.js'];
  const codeOf = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  // Claude's sizes, its 5h class priors, its family list, a prior chosen by a source's NAME
  const CLAUDE_FACTS = [/\b1730\b/, /\b875\b/, /CLAUDE_MAX_PRIOR/, /PRIOR_5H_/, /\[\s*'fable',\s*'opus'/, /startsWith\('codex:'\)\s*\?\s*null/];
  const hits = (t) => CLAUDE_FACTS.filter((re) => re.test(codeOf(t))).map(String);
  const found = CORE.map((f) => [f, hits(readT(f))]).filter(([, h]) => h.length);
  ok(!found.length, `the core (${CORE.length} files) spells none of six Claude facts: the sizes 1730 / 875, CLAUDE_MAX_PRIOR, PRIOR_5H_, the family-list literal, a by-name codex prior (the ledger's per-family cost split is test-claude-update-needs-nothing's estimator-buckets row; behaviour is test-usage-estimator ①'s)`, JSON.stringify(found));
  const planted = readT('src/usage-estimator.js').replace('const PRIOR_WEIGHT_DU = 0.15;', "const PRIOR_WEIGHT_DU = 0.15;\nconst BACK = { sevenDay: 1730 };");
  ok(gateOf(planted.includes('BACK')) && hits(planted).length === 1, 'CONTROL: a Claude size typed back into the core is RED by the same read');
  const CL = require(path.join(REPO, 'src/harnesses/claude-predict.js'));
  ok(UP.priorsForIdentity('org:made') === CL.prior && UP.priorsForIdentity('email:a@b.invalid') === CL.prior, 'an identity of Claude\'s (org:, email:) reads Claude\'s prior');
  ok(UP.priorsForIdentity('codex:email:a@b.invalid') === null && UP.priorsForIdentity('antigravity:acct:agy-x') === null, 'codex and Antigravity identities read NONE (Antigravity was handed Claude\'s before this pick)');
  ok(UP.sourceOf('made-acp:email:a@b.invalid') === 'made-acp' && UP.priorsForIdentity('made-acp:email:a@b.invalid') === null && verdictOf(['org:x', 'email:a@b.invalid', 'acct:__global__', 'org_made'].every((k) => UP.sourceOf(k) === 'claude')),
    'an identity of a harness the core has no adapter for is ITS source and reads no prior — never Claude\'s; Claude\'s own kinds (org:, email:, acct:) stay Claude\'s');
  const { UsageEstimator } = require(path.join(REPO, 'src/usage-estimator.js'));
  const est = new UsageEstimator({ anchorsDir: scratch('usage-predict-adapters'), usageHistory: { *_events() { }, _cost: () => 0 }, resolveIdentity: () => null, lagS: 0 });
  ok(est.priorsFor('org:made') === CL.prior && est.priorsFor('antigravity:acct:x') === null, 'the estimator\'s default prior is the identity\'s source\'s (no Claude default for every key)');
  const goodBad = [[{ none: 'states no quota' }, 0], [{ unit: 'tokens', prior: { none: 'learn first' } }, 0], [{ unit: 'usd-api', prior: { sevenDay: 10, classes5h: { cw: 1, cr: 2, fresh: 3 } } }, 0],
    [null, 1], [{ none: '  ' }, 1], [{ unit: 'usd', prior: { none: 'x' } }, 1], [{ unit: 'tokens', prior: {} }, 1], [{ unit: 'tokens', prior: { sevenDay: 0 } }, 1], [{ unit: 'tokens', prior: { sevenDay: 5, weekly: 3 } }, 1], [{ unit: 'tokens', prior: { sevenDay: 5, classes5h: { cw: 1 } } }, 1]];
  ok(verdictOf(goodBad.every(([p, bad]) => (UP.checkPredict(p).length > 0) === !!bad)), 'checkPredict: three good shapes pass, seven bad ones are each refused', JSON.stringify(goodBad.map(([p]) => UP.checkPredict(p))));
}

console.log('— ⑪ THE SURFACES (the closure check S1): a PROVISIONAL lane is drawn in the popup alone; the taskbar\'s rings and the phone\'s chip draw the reading');
{
  const MU = await import(path.join(REPO, 'src/lib/usage-meter.js'));
  const els = {}; const soft = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : () => null)) });
  const el = (id) => (els[id] = els[id] || soft({ id, innerHTML: '', classList: { toggle() { }, add() { }, remove() { }, contains: () => false }, style: { setProperty() { }, removeProperty() { } }, dataset: {}, appendChild() { }, remove() { }, closest: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, setAttribute() { }, getAttribute: () => null }));
  const keep = { document: globalThis.document, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame, gcs: globalThis.getComputedStyle, mm: globalThis.matchMedia };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => { }; globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' }); globalThis.matchMedia = () => ({ matches: false, addEventListener() { } });
  globalThis.document = { getElementById: (id) => el(id), querySelectorAll: () => [], querySelector: () => null, addEventListener() { }, createElement: () => el('made-' + Math.random()), body: el('body'), documentElement: el('html') };
  class App { }
  MU.installUsageMeter(App, {});
  const nowS = Math.floor(Date.now() / 1000), r5 = nowS + 2 * 3600, r7 = nowS + 3 * 86400;
  const lanes = { fiveHour: { utilization: 0.55, resetsAt: r5 }, sevenDay: { utilization: 0.65, resetsAt: r7 } };
  // the estimate as /api/usage serves it: ON lanes in their fields, PROVISIONAL ones in `provisional` (src/usage-routes.js screen)
  const served = (state) => ({ estimated: true, anchorAt: Date.now() - 600e3, asOf: Date.now(), scopedWeekly: [], predict: { fiveHour: { state, n: 12 }, sevenDay: { state, n: 12 } },
    ...(state === 'on' ? { ...lanes, provisional: null } : { fiveHour: null, sevenDay: null, provisional: { ...lanes, scopedWeekly: [] } }) });
  const render = (state) => {
    for (const k of Object.keys(els)) delete els[k];
    const app = new App();
    Object.assign(app, { _accounts: { accounts: [], defaultAccountId: null }, _usageGlobal: { loggedIn: true, email: 'made@example.invalid' }, _usageAcctSel: '__global__', _usageAcctSelCodex: 'auto', _accountUsage: {}, _codexAccountUsage: {}, _usageCodexGlobal: {}, _codexRateLimit: null,
      _rateLimit: { fetchedAt: Date.now() - 600e3, fiveHour: { utilization: 0.40, resetsAt: r5 }, sevenDay: { utilization: 0.59, resetsAt: r7 } },
      _usageEstimates: { __global__: served(state) }, _resetClaims: {}, _usageLogins: {}, settings: { get: () => 'manual' }, _usageRowsHtml: null, _usageSecHtml: null, _usageChipHtml: null });
    app._renderUsage();
    const txt = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { taskbar: (els['taskbar-usage'] || {}).innerHTML || '', popup: (els['usage-popup'] || {}).innerHTML || '', chip: txt((els['mobile-nav-usage'] || {}).innerHTML) };
  };
  let prov = null, on = null, err = null;
  try { prov = render('provisional'); on = render('on'); } catch (e) { err = e; }
  for (const [k, v] of Object.entries(keep)) { if (k === 'document') globalThis.document = v; }
  globalThis.requestAnimationFrame = keep.raf; globalThis.cancelAnimationFrame = keep.caf; globalThis.getComputedStyle = keep.gcs; globalThis.matchMedia = keep.mm;
  ok(!err && gateOf(prov) && prov.taskbar.length > 0 && prov.chip.length > 0, 'the real meter renders the taskbar row, the popup and the phone\'s chip over a page stub', err && err.message);
  const has65 = (h) => /\b65\s*%|\b65%/.test(h), has59 = (h) => /\b59\s*%|\b59%/.test(h);
  ok(gateOf(prov) && !has65(prov.taskbar) && gateOf(has59(prov.taskbar)) && !/\b65\b/.test(prov.chip) && verdictOf(/\b59\b/.test(prov.chip)),
    'a PROVISIONAL-only estimate (reading 59 %, estimate 65 % from 12 pairs): the taskbar\'s rings and the phone\'s chip draw the READING, never 65', prov && { taskbar: prov.taskbar.slice(0, 300), chip: prov.chip });
  ok(gateOf(prov) && verdictOf(/about 65% · from 12 readings on this hub/.test(prov.popup)), '…the popup draws it, MARKED «about 65% · from 12 readings on this hub»', prov && prov.popup.slice(0, 200));
  ok(gateOf(on) && (verdictOf(has65(on.taskbar)) || verdictOf(/\b65\b/.test(on.chip))), 'CONTROL: the same estimate ON — the rings or the chip draw it (the leg can see an estimate where one is earned)', on && { chip: on.chip });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
