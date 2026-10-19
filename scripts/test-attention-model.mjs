#!/usr/bin/env node
// test-attention-model — FAST, PURE (lane foryou-folds, design q-044 decisions 1 2 3 6 8; the owner accepted them on
// 2026-10-19). src/attention-model.js is THE attention list the tray, its badges, the toasts, the decision model and the
// For-you judge's pass read: five bands by FACTS, a fixed first screen, the rest folded BY BAND, 搁置 at the tail,
// notices out of the list, the judge a tie-breaker inside band 5 only.
//   ① the constants (CAP 6, PARK_DAYS 7, PLUGIN_FOLD_DAYS 3) and the band table's order
//   ② THE PRODUCTION SHAPE (design §1.1: 30 open — 25 asks + 5 notices — in 11 conversations, 17 older than 7 days;
//      by SHAPE, the words invented): the first screen ≤ 6, the folds' sum = the rest, the notices a grey count only
//   ③ THE BAND TABLE: every rule (urgent · a plugin's reminder · a blocked board · a held permission ask · a person
//      waiting · a date inside 48 h · deadline/money · options · a producer's button / card · the rest) → its fixture
//   ④ the order inside each band
//   ⑤ band 1 never folds (7 urgent ⇒ the screen is 7)
//   ⑥ 搁置: 7 days ⇒ parked, a re-ask returns it; a plugin's reminder after 3 days; band 1 and a live date never park
//   ⑦ THE JUDGE IS A TIE-BREAKER: a verdict never moves a row between bands (a generated property) + the MUTANT that
//      lets the judge's p rank across bands ⇒ RED
//   ⑧ the MUTANT without the CAP ⇒ RED
//   ⑨ the judge's candidates (band-5 ties only) · the badge rows (bands 1–4) · the toast rule (bands 1–2)
//   ⑩ DECISION 8: a signed forward agent upgrade is a NOTICE (out of the list), a bad signature / a downgrade urgent
//   ⑪ the policy seam lanes ② and ③ read (cap, expanded bands)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const A = require(path.join(ROOT, 'src/attention-model.js'));
const DA = require(path.join(ROOT, 'src/server/device-alerts.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const M = mutantCopies('attention-model', ROOT);
const SRC = fs.readFileSync(path.join(ROOT, 'src/attention-model.js'), 'utf8');

const NOW = Date.UTC(2026, 9, 19, 12, 0), MIN = 60e3, H = 60 * MIN, D = 24 * H;
let seq = 0;
/** A For-you item by SHAPE (the words are invented; ids are generated). */
const item = (o = {}) => ({ id: o.id || 'ut-' + (++seq), sessionKey: o.sk || 'claude:s1', status: 'open', kind: 'action', origin: 'agent', urgency: 'normal', text: 'An invented question', createdAt: NOW - H, ...o });
const facts = (o = {}) => ({ judged: { group: null, p: null, v: 0, facts: { state: 'unknown', dated: null, due: null, reasks: 0, askedAt: 0, ...o } } });
const rows = (items, now = NOW) => items.map((i) => A.rowOf(i, now));
const ids = (list) => list.map((r) => r.id);

console.log('① the constants and the band table');
{
  ok(A.CAP === 6 && A.PARK_DAYS === 7 && A.PLUGIN_FOLD_DAYS === 3 && A.DUE_WINDOW_MS === 48 * H && A.TIE_MS === MIN, 'CAP 6 (decision 1) · PARK_DAYS 7 · PLUGIN_FOLD_DAYS 3 (decision 6) · a date window of 48 h · a tie = the same minute', { CAP: A.CAP, PARK_DAYS: A.PARK_DAYS, PLUGIN_FOLD_DAYS: A.PLUGIN_FOLD_DAYS });
  eq(A.BANDS.map((b) => `${b.band}:${b.code}`), ['1:urgent', '2:waiting', '3:dated', '4:decide', '5:ask', '6:parked'], 'five bands in order, then 搁置 (PARKED = 6)');
  ok(A.PARKED === 6 && JSON.stringify(A.BADGE_BANDS) === '[1,2,3,4]' && JSON.stringify(A.TOAST_BANDS) === '[1,2]' && A.FOLD_HEAD === '{n} more — expand', 'the badge counts bands 1–4, a toast is bands 1–2, the fold head is ONE English key (zh 还有 {n} 条 — 展开)');
  ok(Object.isFrozen(A.BANDS) && Object.isFrozen(A.POLICY) && A.POLICY.cap === A.CAP, 'the tables are frozen; POLICY = the defaults lanes ② and ③ start from');
}

console.log('② THE PRODUCTION SHAPE (design §1.1, 2026-10-19: 30 open = 25 asks + 5 notices in 11 conversations; 10 younger than a day, 3 of 1–7 days, 17 of 7–30 days)');
const SHAPE = (() => {
  const out = [];
  const conv = (k) => 'claude:conv' + (k % 11);   // 11 conversations; the first three hold most (the shape's 75 %)
  // asks younger than a day: 8 (two carry options), then 2 of 1–7 days, then 15 of 7–30 days
  for (let k = 0; k < 8; k++) out.push(item({ sk: conv(k % 3), createdAt: NOW - (k + 1) * 2 * H, ...(k < 2 ? { options: ['Yes', 'No'] } : {}) }));
  for (let k = 0; k < 2; k++) out.push(item({ sk: conv(3 + k), createdAt: NOW - (2 + k * 3) * D }));
  for (let k = 0; k < 15; k++) out.push(item({ sk: conv(k < 9 ? k % 3 : 5 + k % 6), createdAt: NOW - (8 + k) * D }));
  // notices: 2 younger than a day, 1 of 1–7 days, 2 of 7–30 days (none ever opened by the owner)
  for (const [k, age] of [[0, 3 * H], [1, 9 * H], [2, 4 * D], [3, 9 * D], [4, 12 * D]]) out.push(item({ sk: k % 2 ? 'browser' : conv(7 + k), kind: 'notice', origin: k % 2 ? 'browser' : 'agent', createdAt: NOW - age }));
  return out;
})();
{
  const open = SHAPE;
  ok(open.length === 30 && open.filter((i) => i.kind === 'notice').length === 5 && new Set(open.filter((i) => i.kind !== 'notice').map((i) => i.sessionKey)).size === 11
    && open.filter((i) => NOW - i.createdAt < D).length === 10 && open.filter((i) => NOW - i.createdAt >= 7 * D).length === 17, 'the fixture IS the shape: 30 open, 5 notices, 11 conversations, 10 < 1 day, 17 ≥ 7 days');
  const r = A.needsMe(rows(open), NOW);
  ok(r.screen.length <= 6 && r.screen.length === 6, `the first screen: 30 open ⇒ ${r.screen.length} rows (≤ 6)`);
  const folded = r.folds.reduce((a, f) => a + f.n, 0);
  ok(folded === r.list.length - r.screen.length && r.list.length === 25, `the folds' sum = the rest: ${folded} folded + ${r.screen.length} shown = the ${r.list.length} action rows — nothing dropped`, r.folds.map((f) => [f.code, f.n]));
  eq(r.folds.map((f) => [f.band, f.n, f.head]), [[5, 4, { key: '{n} more — expand', n: 4 }], [6, 15, { key: '{n} more — expand', n: 15 }]], 'folded BY BAND (never by conversation): band 5 holds 4 back, 搁置 its 15 — each ONE head with its count');
  ok(!r.list.some((x) => x.notice) && r.counts.notices === 5, 'notices never enter the list — a grey count of 5');
  eq([r.counts[1], r.counts[2], r.counts[3], r.counts[4], r.counts[5], r.counts.parked, r.counts.needsMe, r.counts.open], [0, 0, 0, 2, 8, 15, 2, 25], 'the counts: the two decisions in band 4, 8 asks in band 5, 15 in 搁置 — the badge counts 2 (bands 1–4), not 25');
  eq(ids(r.screen), ids(r.list.slice(0, 6)), 'the screen IS the head of the one list (two decisions, then the four newest asks)');
  const byConv = new Set(r.screen.map((x) => x.key)).size;
  ok(byConv <= 3, `the first screen is the newest work, whichever conversation filed it (${byConv} conversations on it, not 11 group heads)`);
}

console.log('③ THE BAND TABLE — rule → fixture (facts only; the words are never read)');
{
  const T = [
    ['urgent (a login ending, a hub card, a device alert)', item({ urgency: 'urgent' }), 1],
    ['an urgent PLUGIN reminder: urgent first, whoever filed it', item({ urgency: 'urgent', origin: 'plugin', plugin: 'zz' }), 1],
    ['a plugin\'s reminder (the owner\'s pin: 「urgent 之下」)', item({ origin: 'plugin', plugin: 'zz', urgency: 'low' }), 2],
    ['an agent BLOCKED on the board for this ask (the facts)', item(facts({ state: 'blocked', askedAt: NOW - H })), 2],
    ['a main conversation\'s ask held 60 s (main-ask)', item({ urgency: 'high', action: { type: 'main-ask', requestId: 'r' } }), 2],
    ['a helper\'s permission ask held 60 s (helper-ask)', item({ urgency: 'high', action: { type: 'helper-ask', requestId: 'r' } }), 2],
    ['an exit\'s "ask me each time" (exit-run-ask)', item({ urgency: 'high', origin: 'machines', action: { type: 'exit-run-ask', askId: 'a' } }), 2],
    ['a person waiting (lane ②: a Channels direct / @-you row)', { ...item(), waitedBy: 'person' }, 2],
    ['a date 30 h ahead', item(facts({ due: NOW + 30 * H })), 3],
    ['a date passed 47 h ago (still inside the window)', item(facts({ due: NOW - 47 * H })), 3],
    ['a date passed 49 h ago ⇒ no longer a date', item(facts({ due: NOW - 49 * H })), 5],
    ['a date 3 days ahead ⇒ not yet', item(facts({ due: NOW + 72 * H })), 5],
    ['the attention judge\'s deadline_money clause (lane ②)', { ...item(), deadlineMoney: true }, 3],
    ['a date beats a decision (band 3 before 4)', item({ options: ['A', 'B'], ...facts({ due: NOW + 5 * H }) }), 3],
    ['option chips', item({ options: ['A', 'B'] }), 4],
    ['a producer\'s button (open-channel)', item({ origin: 'channels', action: { type: 'open-channel', key: 'k' } }), 4],
    ['an app card (install)', item({ origin: 'apps', card: { kind: 'app' }, action: { type: 'app-install' } }), 4],
    ['a plain normal ask', item(), 5],
    ['a HIGH ask without options (design: 其余的 normal / high)', item({ urgency: 'high' }), 5],
    ['a low ask', item({ urgency: 'low' }), 5],
    ['the judge\'s `blocked` WITHOUT the board\'s fact', item({ judged: { group: 'now', why: 'blocked', p: 1, v: 2, facts: { state: 'unknown', dated: null, due: null, reasks: 0, askedAt: 0 } } }), 5],
    ['the judge\'s `dated` with no date fact', item({ judged: { group: 'now', why: 'dated', p: 0.99, v: 2 } }), 5],
    ['a notice ⇒ not in the list (band 0)', item({ kind: 'notice' }), 0],
  ];
  const bad = T.filter(([, i, want]) => A.rowOf(i, NOW).band !== want).map(([n, i]) => [n, A.rowOf(i, NOW).band]);
  ok(!bad.length, `${T.length} rules, one fixture each: the band is a FACT, never the judge's word`, bad);
  ok(A.rowOf(null) === null && A.rowOf({}) === null && A.rowOf({ id: 'x' }, NOW).band === 5, 'garbage ⇒ null; a bare id ⇒ band 5 (an ask)');
  const r = A.rowOf(item({ id: 'k', sessionKey: 'claude:z', reasks: 2, reaskedAt: NOW - 5 * MIN, createdAt: NOW - 3 * D }), NOW);
  ok(r.at === NOW - 5 * MIN && r.reasks === 2 && r.key === 'claude:z' && r.source === 'foryou', 'the row: `at` = the LAST ask (a re-ask), key = the conversation, source = foryou (lane ② adds channels rows)', r);
}

console.log('④ the order inside each band');
{
  const b1 = [item({ id: 'u-old', urgency: 'urgent', createdAt: NOW - 3 * H }), item({ id: 'u-new', urgency: 'urgent', createdAt: NOW - H })];
  const b2 = [item({ id: 'w-long', ...facts({ state: 'blocked' }), createdAt: NOW - 5 * H }), item({ id: 'w-short', action: { type: 'helper-ask' }, createdAt: NOW - H }), item({ id: 'pl-old', origin: 'plugin', plugin: 'a', createdAt: NOW - 4 * H }), item({ id: 'pl-new', origin: 'plugin', plugin: 'b', createdAt: NOW - 2 * H })];
  const b3 = [item({ id: 'd-far', ...facts({ due: NOW + 40 * H }) }), item({ id: 'd-near', ...facts({ due: NOW + 2 * H }) })];
  const b4 = [item({ id: 'o-old', options: ['A'], createdAt: NOW - 3 * H }), item({ id: 'o-new', options: ['A'], createdAt: NOW - H })];
  const b5 = [item({ id: 'a-old', createdAt: NOW - 3 * H }), item({ id: 'a-answered', createdAt: NOW - 10 * MIN, reply: { text: 'done', at: NOW } }), item({ id: 'a-new', createdAt: NOW - H })];
  const r = A.needsMe(rows([...b5, ...b4, ...b3, ...b2, ...b1]), NOW, { cap: 99 });
  eq(ids(r.list), ['u-new', 'u-old', 'pl-new', 'pl-old', 'w-long', 'w-short', 'd-near', 'd-far', 'o-new', 'o-old', 'a-new', 'a-old', 'a-answered'],
    'band 1 newest first · band 2 the plugins\' reminders first (newest first), then the LONGEST waiting first · band 3 the nearest date first · band 4 newest first · band 5 newest first, an answered ask at its tail');
}

console.log('⑤ band 1 never folds');
{
  const urgent = Array.from({ length: 7 }, (_, k) => item({ id: 'u' + k, urgency: 'urgent', createdAt: NOW - k * MIN * 7 }));
  const r = A.needsMe(rows([...urgent, ...SHAPE]), NOW);
  ok(r.screen.length === 7 && r.screen.every((x) => x.band === 1), `7 urgent rows ⇒ the screen is 7 (an incident pushes it open), all urgent`, r.screen.length);
  ok(!r.folds.some((f) => f.band === 1) && r.folds.find((f) => f.band === 4).n === 2 && r.folds.find((f) => f.band === 5).n === 8, 'band 1 has no fold; every other band folds whole behind its head (band 4: 2, band 5: 8)', r.folds.map((f) => [f.band, f.n]));
  const one = A.needsMe(rows([urgent[0], ...SHAPE]), NOW);
  ok(one.screen.length === 6 && one.screen[0].band === 1, 'one urgent row ⇒ still 6: it leads the screen');
}

console.log('⑥ 搁置 — folded, never deleted; a re-ask returns it');
{
  const ask = item({ id: 'p', createdAt: NOW - 7 * D - MIN });
  const rp = A.needsMe(rows([ask, item({ id: 'fresh' })]), NOW);
  ok(rp.parked.length === 1 && rp.parked[0].id === 'p' && !rp.screen.some((x) => x.id === 'p') && rp.counts.parked === 1 && rp.folds.find((f) => f.band === 6).n === 1, 'an ask 7 days unanswered ⇒ 搁置: off the screen, its count shown (a fold with its number), still in the list');
  ok(A.placeOf(A.rowOf({ ...ask, createdAt: NOW - 7 * D + MIN }, NOW), NOW) === 5, '…a minute short of 7 days it is still band 5');
  const back = A.rowOf({ ...ask, reasks: 1, reaskedAt: NOW - MIN }, NOW);
  ok(A.placeOf(back, NOW) === 5 && A.needsMe([back], NOW).screen[0].id === 'p', 'a re-ask ⇒ back in band 5, at its top (the newest ask)');
  const plugin = A.rowOf(item({ origin: 'plugin', plugin: 'zz', createdAt: NOW - 3 * D - MIN }), NOW);
  ok(A.placeOf(plugin, NOW) === A.PARKED && A.placeOf(A.rowOf(item({ origin: 'plugin', plugin: 'zz', createdAt: NOW - 3 * D + MIN }), NOW), NOW) === 2, 'a plugin\'s reminder unclicked 3 days ⇒ 搁置 (a day younger: band 2)');
  ok(A.placeOf(A.rowOf(item({ urgency: 'urgent', createdAt: NOW - 30 * D }), NOW), NOW) === 1, 'band 1 never parks (30 days old)');
  ok(A.placeOf(A.rowOf(item({ createdAt: NOW - 20 * D, ...facts({ due: NOW + 5 * H }) }), NOW), NOW) === 3, 'a live date never parks (20 days old, due in 5 h)');
  ok(A.placeOf(A.rowOf(item({ createdAt: NOW - 14 * D, ...facts({ state: 'blocked', askedAt: NOW - 14 * D }) }), NOW), NOW) === A.PARKED, 'a blocked board nobody refreshed for 14 days parks like any ask (the owner\'s 2026-10-13 complaint: a 14-day-old ask at the top)');
  ok(A.placeOf(A.rowOf(item({ createdAt: NOW - 8 * D, options: ['A'] }), NOW), NOW) === A.PARKED, 'a decision 8 days unanswered parks too');
}

console.log('⑦ THE JUDGE IS A TIE-BREAKER — a verdict never moves a row between bands');
{
  // a generated pile: every band, judged at random (seeded); the bands of the list must not change with the verdicts
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pile = [];
  const kinds = [{ urgency: 'urgent' }, facts({ state: 'blocked' }), facts({ due: NOW + 3 * H }), { options: ['A'] }, {}, {}, {}];
  for (let k = 0; k < 120; k++) pile.push(item({ id: 'g' + k, createdAt: NOW - Math.floor(rnd() * 6 * D), ...kinds[k % kinds.length] }));
  const judgedPile = pile.map((i) => ({ ...i, judged: { ...(i.judged || {}), group: rnd() < 0.5 ? 'now' : 'later', p: Math.round(rnd() * 100) / 100, v: 2 } }));
  const r0 = A.needsMe(rows(pile), NOW, { cap: 999 }), r1 = A.needsMe(rows(judgedPile), NOW, { cap: 999 });
  const bandOf = (r) => Object.fromEntries(r.list.map((x) => [x.id, A.placeOf(x, NOW)]));
  eq(bandOf(r1), bandOf(r0), '120 rows of every band, judged at random: every row keeps its band');
  const seq = r1.list.map((x) => A.placeOf(x, NOW));
  ok(seq.every((b, k) => !k || seq[k - 1] <= b), 'the judged list is still ordered band by band (non-decreasing)');
  const outside = r1.list.filter((x) => A.placeOf(x, NOW) !== 5).map((x) => x.id), outside0 = r0.list.filter((x) => A.placeOf(x, NOW) !== 5).map((x) => x.id);
  eq(outside, outside0, 'outside band 5 the order does not see the verdicts at all');
  const bucket = (x) => Math.floor(x.at / A.TIE_MS);
  const b5 = r1.list.filter((x) => A.placeOf(x, NOW) === 5);
  ok(b5.every((x, k) => !k || bucket(b5[k - 1]) >= bucket(x)), 'inside band 5 the minutes stay newest first — a verdict only reorders the asks of ONE minute');
  // the two-row proof: an older ask judged `now` at p 1.0 stays under a newer unjudged one
  const older = item({ id: 'old', createdAt: NOW - 2 * H, judged: { group: 'now', p: 1, v: 2 } }), newer = item({ id: 'new', createdAt: NOW - H });
  eq(ids(A.needsMe(rows([older, newer]), NOW).list), ['new', 'old'], 'an older ask judged now (p 1.0) stays UNDER a newer unjudged one');
  const twinA = item({ id: 'ta', createdAt: NOW - H, judged: { group: 'later', p: 0.9, v: 2 } }), twinB = item({ id: 'tb', createdAt: NOW - H + 10e3, judged: { group: 'now', p: 0.7, v: 2 } });
  eq(ids(A.needsMe(rows([twinA, twinB]), NOW).list), ['tb', 'ta'], 'in ONE minute the verdict breaks the tie: `now` above `later`');
  // THE MUTANT: the judge's p ranks ACROSS bands ⇒ RED
  const needle = '  const active = [1, 2, 3, 4, 5].flatMap((b) => by.get(b));\n';
  ok(SRC.split(needle).length === 2, 'ANCHOR: the list is the bands in order');
  const Mut = M.load('src/attention-model.js', SRC.replace(needle, '  const active = [1, 2, 3, 4, 5].flatMap((b) => by.get(b)).sort((a, b) => tieScore(b) - tieScore(a));\n'), 'p-across-bands');
  const rm = Mut.needsMe(judgedPile.map((i) => Mut.rowOf(i, NOW)), NOW, { cap: 999 });
  const seqM = rm.list.map((x) => Mut.placeOf(x, NOW));
  ok(!seqM.every((b, k) => !k || seqM[k - 1] <= b), 'MUTANT RED: a judge whose p ranks across bands lifts band-5 asks over bands 1–4 — the order leg above fails on it', seqM.slice(0, 12));
}

console.log('⑧ the CAP is what keeps the first screen');
{
  const needle = '  const room = Math.max(p.cap, by.get(1).length);';
  ok(SRC.split(needle).length === 2, 'ANCHOR: the screen\'s room = the cap (or every urgent row)');
  const NoCap = M.load('src/attention-model.js', SRC.replace(needle, '  const room = Infinity;'), 'no-cap');
  const r = NoCap.needsMe(SHAPE.map((i) => NoCap.rowOf(i, NOW)), NOW);
  ok(r.screen.length === 10 && !r.folds.some((f) => f.band <= 5), `MUTANT RED: without the cap the production shape draws ${r.screen.length} rows on the first screen (② says ≤ 6) and folds nothing but 搁置`, r.screen.length);
}

console.log('⑨ the judge\'s candidates · the badge rows · the toast rule');
{
  const p = [item({ id: 'a', createdAt: NOW - H }), item({ id: 'b', createdAt: NOW - H + 30e3 }), item({ id: 'c', createdAt: NOW - 2 * H }), item({ id: 'd', options: ['A'], createdAt: NOW - H }),
    item({ id: 'e', urgency: 'urgent', createdAt: NOW - H }), item({ id: 'f', createdAt: NOW - H, reply: { text: 'x', at: NOW } }), item({ id: 'g', createdAt: NOW - 8 * D }), item({ id: 'h', createdAt: NOW - 8 * D + 1e3 })];
  eq([...A.tieCandidates(rows(p), NOW)].sort(), ['a', 'b'], 'tieCandidates = the band-5 asks of one minute (a, b) — not a lone ask, a decision, urgent, an answered ask, nor two in 搁置');
  eq(ids(A.badgeRows(rows([...p, item({ id: 'n', kind: 'notice' })]), NOW)).sort(), ['d', 'e'], 'badgeRows = bands 1–4 only (the decision, the urgent row) — never band 5, 搁置 or a notice');
  const tw = [[item({ urgency: 'urgent' }), true], [item({ action: { type: 'helper-ask' } }), true], [item({ origin: 'plugin', plugin: 'z' }), true], [item({ options: ['A'] }), false], [item(), false], [item({ kind: 'notice' }), false], [item({ urgency: 'high' }), false]];
  const badT = tw.filter(([i, want]) => A.toastWorthy(A.rowOf(i, NOW)) !== want).map(([i]) => i);
  ok(!badT.length, 'toastWorthy: an arrival in band 1 or 2 raises a toast; a decision, an ask, a notice moves a number only', badT);
}

console.log('⑩ DECISION 8 — a signed forward agent upgrade is a NOTICE; a bad signature or a downgrade stays urgent');
{
  const filed = [];
  const da = DA.create({ userTodos: { add: (k, o) => { filed.push(o); return { id: 'x' + filed.length }; } } });
  da.file('upgrade-pushed', { hostKey: 'h1', machine: 'M1', from: '2.369.316', to: '2.369.317', by: 'system:device-upgrade' });
  da.file('upgrade-pushed', { hostKey: 'h1', machine: 'M1', from: '2.369.316', to: '2.369.318', by: 'system:device-upgrade', code: 'bad-signature' });
  da.file('upgrade-pushed', { hostKey: 'h2', machine: 'M2', from: '2.369.317', to: '2.369.300', by: 'system:device-upgrade' });
  da.file('upgrade-pushed', { hostKey: 'h3', machine: 'M3', from: '?', to: '2.369.317', by: 'system:device-upgrade' });
  const placed = filed.map((o) => [o.kind || 'action', o.urgency, A.rowOf({ id: 'i', ...o }, NOW).band]);
  eq(placed, [['notice', 'normal', 0], ['action', 'urgent', 1], ['action', 'urgent', 1], ['action', 'urgent', 1]], 'signed + forward ⇒ a notice (out of the list: a grey count) · a bad signature, a DOWNGRADE, an unreadable version ⇒ urgent, band 1');
  const r = A.needsMe(filed.map((o, k) => A.rowOf({ id: 'i' + k, ...o }, NOW)), NOW);
  ok(r.counts.notices === 1 && r.counts[1] === 3, 'a fleet roll of signed upgrades moves the grey count, never the urgent band');
}

console.log('⑪ the policy seam (lanes ② and ③)');
{
  const r8 = A.needsMe(rows(SHAPE), NOW, { cap: 8 });
  ok(r8.screen.length === 8, 'policy.cap moves the screen (lane ②\'s attention.cap row; lane ③ measures 5–8)');
  const rx = A.needsMe(rows(SHAPE), NOW, { expanded: [5] });
  ok(rx.bands.find((b) => b.band === 5).hidden.length === 0 && rx.bands.find((b) => b.band === 5).shown.length === 8 && rx.folds.every((f) => f.band !== 5), 'policy.expanded opens a band in place (its fold gone, every row shown)');
  const pol = A.policyOf({ cap: 'x', parkDays: -1, expanded: new Set([2]) });
  ok(pol.cap === 6 && pol.parkDays === 7 && pol.expanded.has(2), 'policyOf: garbage falls back to the defaults; a Set of expanded bands is read');
  const ch = { id: 'ch1', key: 'slack:c1', source: 'channels', at: NOW - MIN, waitedBy: 'person', urgency: 'normal' };
  ok(A.needsMe([ch, ...rows(SHAPE)], NOW).screen[0].id === 'ch1', 'a lane-② Channels row with no `band` is placed by the same rule (a person waiting ⇒ band 2, ahead of the decisions)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
