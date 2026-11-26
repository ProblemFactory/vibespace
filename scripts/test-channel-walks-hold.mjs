#!/usr/bin/env node
// test-channel-walks-hold — B-360d item 4, LAW (a) (主开发 r4317 / r4325): AT THE OWNER's SIZE NO CHANNEL WALK HOLDS THE LOOP OVER
// 50 ms A TURN. HEAVY: a stand-in of the owner's shape built in-process (198 043 conversations over 7 fake accounts + the Agents
// account: 173 306 · 20 674 · 1 887 · 933 · 747 · 234 · 146 · 116 — 主开发's counts of the owner's hub, 2026-11-16; 8 account rows
// and 2 conversation rows naming the roots of a Task Group tree, 10 rules), the real channels engine over FAKE accounts (no
// vendor), the real grants store. No profiler in the measured run: each road's longest turn by a loop-gap meter (a setImmediate
// beat and the event loop's delay histogram), three runs, the MEDIAN judged, every run printed.
//   ① the per-account map's SLICED build after a whole-map touch (the roads start it; they never build it whole): ≤ 50 ms a turn
//   ② the roads by account — the reach count (the prompt hook), the list, the list with the directory, the search, the dead
//      sign-ins — for an asker no row names, one the biggest account is granted to through its lineage, one a smaller account is,
//      one a conversation row of its own names: each ≤ 50 ms a turn
//   RED: the release's walk (src/server/channels-access.js with the by-account entries cut, in a copy over the same engine): its
//   list and its list with the directory hold a turn over the bound for the asker no row names — the meter sees what it is about
//   PRINTED: the kept copy's size (主开发 r4526 (2): bytes a kept row; a slot = place, lastAt, single chat — nothing else of a row)
//   PRINTED, never judged (the found holders, named in the line — not this unit's): the index's write after a burst over every
//   row; the per-account map rebuilt WHOLE in one turn (keysOf after a void); a rule whose row applies to the asker (its account
//   judged per row); the store's own search over a logged account (its wanted set over the ids it is handed)
//   THE CLOCK IS THE BOX's (主开发 r4850, the tree's form of scripts/test-boot-resume-shape.mjs): on the hosted runner every leg that
//   judges a time prints its reading and is a named skip; what is not a clock is judged everywhere (below, at HOSTED)
// Run: node scripts/test-channel-walks-hold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { anchored, scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
// THE CLOCK IS THE BOX's (主开发 r4850; the form of scripts/test-boot-resume-shape.mjs, 主开发 r965 / r2955): the bound is read on the
// box and the test machines. On the hosted runner (its own mark: GITHUB_ACTIONS=true — never a guess from speed) every leg still
// runs; a leg that judges a TIME (the bound legs, and the red controls that must read over the bound) prints its reading and says
// by name that it is not judged there — a SKIP line (counted as a skip, never a green); everything that is not a clock (the sliced
// build's structure, the kept flags, the errors, the census) is judged everywhere. The closing line there names how many legs were
// printed, not judged. The box's run is the law's proof.
const HOSTED = process.env.GITHUB_ACTIONS === 'true';
const CLOCKS = { n: 0 };
const { ok, report } = checker({ log: (l) => console.log(HOSTED && /^\n(?:ALL PASS|\d+ FAILED)/.test(l) ? `${l} · ${CLOCKS.n} leg(s) that judge a clock printed, not judged on the hosted runner (each said above)` : l) });
const LAW_WHY = 'the clock law is judged on the box only (主开发 r4850); its reading is printed';
const RED_WHY = 'a red control\'s clock is judged on the box only, as its law (主开发 r4850); its plant is judged by its structure checks';
/** a leg that judges a TIME: a leg on the box and the test machines; on the hosted runner its words (its reading in them) and the skip */
function clock(cond, words, why, detail) {
  if (!HOSTED) return ok(cond, words, detail);
  CLOCKS.n++;
  console.log(`  ⊘ SKIP: ${words} — NOT JUDGED on the hosted runner (GITHUB_ACTIONS=true): ${why}`);
  return cond;
}
const ROOT = scratch('channel-walks-hold');
const T = Date.parse('2026-11-25T12:00:00Z');
const BOUND_MS = 50;   // 主开发 r4325: under 50 ms a turn at the stand-in's size
const quiet = { info() { }, warn() { }, error() { }, log() { }, debug() { } };
const CA = require(path.join(REPO, 'src/server/channels-access.js'));
let lastCtx = null;
{ const c0 = CA.create; CA.create = (c) => { lastCtx = c; return c0(c); }; }
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const MB = mutantCopies('channel-walks-hold', REPO);
let RSRC = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
RSRC = anchored(RSRC, "    const byAccount = ctx && ctx.kind === 'agent' ? reachCountByAccount(ctx, recs) : undefined;   // B-360d item 4\n", "    const byAccount = undefined;   // THE RELEASE's walk\n", 'release: the count');
RSRC = anchored(RSRC, "    let sel = ctx && ctx.kind === 'agent' ? newestSelector(LIST_FOR_MAX, placeBefore) : null;\n", "    let sel = null;   // THE RELEASE's walk\n", 'release: the list');
RSRC = anchored(RSRC, '  const WALK_STEP = 5000;\n', '  const WALK_STEP = 50000;\n', 'release: the step');
const REL = MB.load('src/server/channels-access.js', RSRC, 'release');

/** THE METER: the loop's longest turn while `fn` runs (its own awaits included) — the gap between two beats of a setImmediate
 *  chain, and the delay histogram's max; a synchronous `fn` is one turn */
async function holdOf(fn) {
  const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
  let last = process.hrtime.bigint(), worst = 0, run = true;
  const beat = () => { const n = process.hrtime.bigint(), g = Number(n - last) / 1e6; if (g > worst) worst = g; last = n; if (run) setImmediate(beat); };
  await new Promise((r) => setImmediate(r));
  last = process.hrtime.bigint(); setImmediate(beat);
  const t0 = process.hrtime.bigint(); let out, err = null;
  try { out = await fn(); } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  const end = process.hrtime.bigint(); { const g = Number(end - last) / 1e6; if (g > worst) worst = g; }
  run = false; h.disable();
  return { turn: Math.round(worst * 10) / 10, total: Math.round(Number(end - t0) / 1e5) / 10, hist: Math.round(h.max / 1e5) / 10, out, err };
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// ═══ THE STAND-IN ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const SIZES = [173306, 20674, 1887, 747, 234, 146, 116], AGENTS_N = 933, RULES = 10;
const dataDir = path.join(ROOT, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const si = globalThis.setInterval;
globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
let eng;
try { eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => [] }); }
finally { globalThis.setInterval = si; }
const ectx = lastCtx, ix = eng.store.index;
await eng.store.adapters.update(() => {
  const live = eng.store.adapters.live().adapters, base = live.find((r) => r.kind === 'fake-poll');
  for (let i = live.filter((r) => r.kind === 'fake-poll').length; i < SIZES.length; i++) live.push({ ...JSON.parse(JSON.stringify(base)), id: `fake-poll-${i}`, label: `scratch ${i}` });
});
const recs = eng.adapterRecords().adapters.filter((r) => r.kind === 'fake-poll' && r.enabled !== false).slice(0, SIZES.length);
const agentsRec = eng.adapterRecords().adapters.find((r) => r.kind === 'agents') || null;
const A = recs.map((r) => r.id);
await ix.update((x) => {
  const fill = (id, n) => { for (let i = 0; i < n; i++) Object.assign(ix.entry(id, `c${String(i).padStart(6, '0')}`), { title: `[ops-${i % 97}] thread ${i}`, kind: i % 3 ? 'group' : 'dm', lastAt: T - i * 1000, unread: i % 5, listedAt: T - i * 1000 }); };
  recs.forEach((rec, ai) => fill(rec.id, SIZES[ai]));
  if (agentsRec) fill(agentsRec.id, AGENTS_N);
  const pa = x.patternAssignments || (x.patternAssignments = {});
  for (let r = 0; r < RULES; r++) pa[`pat${r}`] = { id: `pat${r}`, adapterId: A[r % A.length], pattern: { match: 'any', rules: [{ kind: 'title', value: `ops-${r}` }] } };
});
const N = Object.keys(ix.live()).length;
console.log(`the stand-in: ${N} conversations (${SIZES.join(' · ')} + ${agentsRec ? AGENTS_N : 0} in the Agents account), ${RULES} rules`);
const burst = await holdOf(() => ix.durable());
console.log(`  · PRINTED (found holder 1, not this unit's): the index's own write after the fill (one burst over every row): its longest turn ${burst.turn} ms of ${burst.total} ms`);
const G = GS.forDir(dataDir);
const set = (res, lists) => { const w = G.set('channel-reach', res, lists, 'user'); if (!w || w.ok === false) throw new Error(`seed refused (${res}): ${JSON.stringify(w).slice(0, 200)}`); };
const ROOTS = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'];
const NAMED = 'cccccccc-0000-4000-8000-000000000002';
A.forEach((id, ai) => set(`account:${id}`, { to: [{ kind: 'group', id: ROOTS[(ai + 1) % ROOTS.length], name: `Team ${ai}` }, ...(ai % 2 ? [{ kind: 'conversation', key: `cccccccc-0000-4000-8000-0000000000${String(10 + ai)}`, name: `agent ${ai}` }] : [])] }));
set(`account:${A[0]}#user`, { to: [{ kind: 'group', id: 'G-m1', name: 'Team m' }] });   // the eighth account row
set(`conversation:${A[0]}/c000007`, { to: [{ kind: 'conversation', key: NAMED, name: 'agent 2' }, { kind: 'group', id: 'G-m1', name: 'Team m' }] });
set(`conversation:${A[1]}/c000011`, { to: [{ kind: 'group', id: 'G-m2', name: 'Team n' }] });
await eng.store.adapters.update(() => { eng.store.adapters.live().adapters.find((r) => r.id === A[1]).signinDead = { cause: 'expired', at: T }; });
await ix.durable();
const agent = (id, groups, inherited = []) => () => ({ kind: 'agent', id, name: null, groups: [...groups], inheritedGroups: [...inherited], msgLevelFor: () => 'none' });
const ASKERS = {
  'no row names it': agent('dddddddd-0000-4000-8000-000000000099', ['T-none']),
  'the biggest account through its lineage': agent('dddddddd-0000-4000-8000-000000000098', ['G-leaf1'], ['G-mid1', 'R1']),
  'a smaller account through its lineage': agent('dddddddd-0000-4000-8000-000000000097', ['G-leaf2'], ['G-mid2', 'R2']),
  'a conversation row of its own': agent(NAMED, ['T-none']),
};
const ROADS = {
  'the reach count (the prompt hook)': (R, c) => R.reachCountFor(c),
  'the list': (R, c) => R.listFor(c),
  'the list with the directory': (R, c) => R.listFor(c, { all: true }),
  'the search': (R, c) => R.searchFor(c, 'thread', { limit: 50 }),
  'the dead sign-ins': (R, c) => R.signinExpiredFor(c),
};

// ═══ ① THE MAP's SLICED BUILD ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('① the per-account map after a whole-map touch: built in slices, started by a road');
{
  await ix.update((x) => { delete x.conversations[`${A[0]}/c${String(SIZES[0] - 1).padStart(6, '0')}`]; });
  await ix.durable();
  const st0 = ix.keysStats();
  const first = await holdOf(() => eng.reachCountFor(ASKERS['no row names it']()));
  const stA = ix.keysStats();
  console.log(`  · PRINTED: while the map is void the road answers by the release's walk (slow and right, 主开发 r4325): ${first.turn} ms, «${first.out}»`);
  const h = await holdOf(() => ix.keysReady());
  const st1 = ix.keysStats();
  ok(!st0.kept && stA.warming && !stA.kept && st1.kept && first.err === null && h.err === null, `① the first road after the touch started the SLICED build (never the whole map in its turn): void before it, warming and not kept after the road's turn, kept at the build's landing — no error`, { st0, stA, st1, errs: [first.err, h.err].filter(Boolean) });
  clock(h.turn <= BOUND_MS, `① …to its landing the loop's longest turn ${h.turn} ms (histogram ${h.hist} ms) of ${h.total} ms — ≤ ${BOUND_MS} ms`, LAW_WHY, { h: { turn: h.turn, total: h.total } });
  // PRINTED: the same map rebuilt WHOLE in one turn (a keysOf after a void — B-dfa4's own road, found holder 2)
  await ix.update((x) => { delete x.conversations[`${A[0]}/c${String(SIZES[0] - 2).padStart(6, '0')}`]; });
  await ix.durable();
  const w = await holdOf(() => ix.keysOf(A[0]).length);
  console.log(`  · PRINTED (found holder 2, not this unit's): the per-account map rebuilt WHOLE by keysOf after a whole-map touch: one turn of ${w.turn} ms`);
}
// PRINTED (主开发 r4526 (2)): THE KEPT COPY's SIZE — the per-account map at the stand-in, the heap read after a full collection
// before and after its whole build; beside it a slot alone and a map of the same keys holding a number (what the place cost)
{
  require('node:v8').setFlagsFromString('--expose-gc');
  const gc = require('node:vm').runInNewContext('gc');
  const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
  const MB = (b) => Math.round(b / 1048576 * 10) / 10;
  await ix.update((x) => { delete x.conversations[`${A[0]}/c${String(SIZES[0] - 3).padStart(6, '0')}`]; });
  await ix.durable();
  const keys = Object.keys(ix.live()), n = keys.length;
  const h0 = heap();
  ix.keysOf(A[0]);   // the map whole, every key's slot with it
  const h1 = heap();
  const plain = new Map(); for (const k of keys) plain.set(k, 1);
  const h2 = heap();
  const slots = new Array(n); for (let i = 0; i < n; i++) slots[i] = { place: i + 1, at: T - i * 1000, dm: i % 3 === 0 };
  const h3 = heap();
  console.log(`  · PRINTED (r4526 (2)): the per-account map at ${n} rows: ${MB(h1 - h0)} MB, ${Math.round((h1 - h0) / n)} B a kept row (its key in its account's map and in the key → account map, and its slot) — a slot alone ${Math.round((h3 - h2) / n)} B ({ place, at, dm }: no other field of a row is copied); a map of the same keys holding a number ${Math.round((h2 - h1) / n)} B a key`);
  slots.length = 0; plain.clear();
}

// ═══ ② THE ROADS ══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log(`② every road for every asker, three runs each: the median longest turn ≤ ${BOUND_MS} ms`);
const RELI = REL.create(ectx);
const table = {}, roadErrs = [];
for (const [an, mk] of Object.entries(ASKERS)) {
  for (const [rn, f] of Object.entries(ROADS)) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await holdOf(() => f(eng, mk())));
    const med = median(runs.map((r) => r.turn));
    table[`${rn} · ${an}`] = runs.map((r) => r.turn);
    for (const r of runs) if (r.err !== null) roadErrs.push(`${rn} — ${an}: ${r.err}`);
    clock(med <= BOUND_MS, `② ${rn} — ${an}: longest turn ${runs.map((r) => r.turn).join(' / ')} ms (median ${med}; histogram ${runs.map((r) => r.hist).join(' / ')}; whole ask ${runs.map((r) => r.total).join(' / ')} ms)`, LAW_WHY);
  }
}
ok(roadErrs.length === 0, `② every road answered every asker on every run, no error (${Object.keys(ASKERS).length * Object.keys(ROADS).length} asks × 3 runs)`, roadErrs);
// RED: the release's walk for the asker no row names
{
  const rel = [];
  // (the release's COUNT for this asker read 43–48 ms on the test machine, 2026-11-25: under the bound — its red is the list's)
  for (const rn of ['the list', 'the list with the directory']) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await holdOf(() => ROADS[rn](RELI, ASKERS['no row names it']())));
    rel.push(`${rn} ${runs.map((r) => r.turn).join(' / ')} ms`);
    ok(runs.every((r) => r.err === null && !!r.out && r.out.ok === true), `RED's plant: the release's walk in its copy (three anchored edits, each throws unless its line is there once; the copy in the census below) answered ${rn} for the asker no row names on every run — no error`, runs.map((r) => r.err).filter(Boolean));
    // AN ABSOLUTE TIME (r4841 (b)): machine 1 reads the list at 64–73 ms (the directory's 74–89) — a machine about 1.4 times faster reads it under the bound: red falsely
    clock(median(runs.map((r) => r.turn)) > BOUND_MS, `RED: the release's walk (its text in a copy, the same engine) — ${rn} for the asker no row names: ${runs.map((r) => r.turn).join(' / ')} ms, over the bound (the meter sees the walk by conversation)`, RED_WHY);
  }
}

// ═══ PRINTED: the rule variant and the store's own search over a logged account ═══════════════════════════════════════════
console.log('PRINTED, never judged here: a rule whose row applies to the asker; the store\'s search over a logged account');
{
  set('rule:pat0', { to: [{ kind: 'group', id: 'R1', name: 'Rule team' }] });
  for (const [rn, f] of Object.entries(ROADS)) {
    const r = await holdOf(() => f(eng, ASKERS['the biggest account through its lineage']()));
    console.log(`  · a rule's row naming the asker's root (its account, ${SIZES[0]} rows, judged per row): ${rn} — longest turn ${r.turn} ms`);
  }
  G.remove('channel-reach', 'rule:pat0', 'user');
  for (let i = 0; i < 50; i++) { const c = `c${String(i * 7).padStart(6, '0')}`; eng.store.appendRecords(A[0], c, [{ id: `m${i}`, vendorId: `m${i}`, convId: c, at: T - 60e3 - i, text: `thread note ${i}`, author: { id: 'p1', name: 'Pat' } }]); }
  for (const an of ['no row names it', 'the biggest account through its lineage']) {
    const r = await holdOf(() => eng.searchFor(ASKERS[an](), 'thread', { limit: 50 }));
    console.log(`  · found holder 3 (the store's own search, not this unit's): 50 logs in the biggest account — the search for «${an}»: longest turn ${r.turn} ms of ${r.total} ms`);
  }
}
console.log('JSON ' + JSON.stringify({ N, burst: burst.turn, table }));
for (const r of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 1, label: 'B-360d walks hold ' })) ok(r.pass, r.name, r.pass ? undefined : r.detail);
report();
