#!/usr/bin/env node
// THE OAT SWEEP NEVER BLOCKS THE LOOP — test-oat-materialize's F13, split into this HEAVY twin (B-e601 r2, lane bl-ci, 2026-11-18,
// the coordinator's ruling: the fast tier keeps a count of at most 12 rows over 10 s, and F13 was ~16 s of the fast suite's 18.4 s
// alone on the test machine). The legs and their three RED controls moved here VERBATIM; only what they read came with them
// (the store, the token shapes, nv, mutantStore). Why it is slow: 200 rows swept twice, each row an archive, a write and an fsync,
// one row per loop turn, beside a control loop as long as the sweeps — about 5 s a block on a busy disk, three blocks.
//   F13: 200 fake rows — the first sweep materializes every one, the next finds every one written; ONE row per loop turn (a WORK
//        count); the loop's longest stall across both sweeps ≤ 3 × a control loop's as long as the sweeps (RELATIVE — never an
//        absolute ms bound); not one synchronous fs call on a member path from the sweep's acts.
//   RED controls: a writer that goes synchronous on the member path (the spy sees it); a sweep that starts every row in one turn
//        (the work count reads N); the r1 sweep with every act on the loop (the stall passes 3 × the control, the count 2 × N).
// In-process, no network, no real CLI. The checker is scripts/lib/check.mjs (a swapped ok() throws).
// r4340 (the 2.369.419 mirror, run 45633627765, heavy 7/7 on Node 24: F13 read 29.04 ms against 3 × 8.33 on a four-core runner beside
// the other heavy lane, no list save in either window, green on its retry): F13 judges two small clocks, so the suite runs in the
// heavy tier's SERIAL lane (scripts/ci.mjs SERIAL: after the parallel lanes drain, alone); its number is unchanged; and F13 PRINTS
// what tells a hold from a stray stall (they judge nothing): what the longest gap held (the rows the sweep started in it, a roster
// broadcast, the collector's pauses), how many gaps passed the leg's bound and what those held, and the Node version
// THE BROADCAST TURN's LAW IS NOT PINNED YET (r4585): F13 prints the turn that held the sweep's roster build against 3 × the
// control's broadcast turn and judges nothing of it, because its control does not do the sweep's own file work, so that figure
// moved about two and a half times from run to run (2.53 of its bound alone on machine 1). Row B-ed9e built its control (a
// scratch store's own sweep in a window of its own, the pair on each build's own span); the pair stays printed until three alone
// readings on machine 1 and three box rows read it at half its bound or less.
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { PerformanceObserver } from 'node:perf_hooks';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const Module = require('node:module');
const { ok, report } = checker();
const T0 = Date.now(), NOW = T0;
const H = 3600e3, DAY = 24 * H;
// token shapes built at runtime, never a literal
const OAT = ['sk', '-ant-oat01-'].join('') + 'MATfake_' + 'q7R2'.repeat(12) + '-zz';
const SHAPE = { scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' };
const login = (now, { dead = false, wiped = false } = {}) => ({ claudeAiOauth: wiped
  ? { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: now - DAY, ...SHAPE }
  : { accessToken: 'acc-' + crypto.randomBytes(4).toString('hex'), refreshToken: 'ref-' + crypto.randomBytes(4).toString('hex'), expiresAt: now + (dead ? -2 * H : H), refreshTokenExpiresAt: now + (dead ? -H : 20 * DAY), ...SHAPE } });
const nv = async (am, v) => { const c = am.noteCliVersion(v); await am.oatFileSettled(); return c; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-sweep-'));
// a mutant STORE: accounts.js compiled with text replaced, its account-material / login-expiry swapped for
// mutated copies (scratch files) — null when an anchor is missing. `tmp` exists by the first call (§2).
const mutantStore = ({ acc = [], mat = [], le = [] } = {}) => {
  const patch = (rel, reps) => { let src = fs.readFileSync(path.join(REPO, rel), 'utf8'); for (const [a, b] of reps) { if (!src.includes(a)) return null; src = src.replace(a, b); } return src; };
  const accSrc = patch('src/accounts.js', acc), matSrc = patch('src/account-material.js', mat), leSrc = patch('src/login-expiry.js', le);
  if (accSrc == null || matSrc == null || leSrc == null) return null;
  const dir = fs.mkdtempSync(path.join(tmp, 'mut-'));
  const matP = path.join(dir, 'account-material.js'), leP = path.join(dir, 'login-expiry.js');
  fs.writeFileSync(matP, matSrc); fs.writeFileSync(leP, leSrc);
  const src = accSrc.split("require('./account-material.js')").join(`require(${JSON.stringify(matP)})`).split("require('./login-expiry.js')").join(`require(${JSON.stringify(leP)})`);
  const file = path.join(REPO, 'src/accounts.js');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file); return m.exports;
};
const credsOf = (am, id) => path.join(am.subDir(id), '.credentials.json');
const put = (am, id, o) => fs.writeFileSync(credsOf(am, id), JSON.stringify(o), { mode: 0o600 });

console.log('F13 — the oat sweep never blocks the loop (moved from test-oat-materialize §7, B-e601 r2)');
{
  let k7 = 0;
  const mk = (M = { AccountManager }, o = {}) => new M.AccountManager({ dataDir: path.join(tmp, 'sw-' + (++k7), 'data'), ...o });
  // ── F13: the sweep never blocks the loop — fs.promises, one row per loop turn, no sync fs on a member path ──
  // (lane oat-loop-gap-bound, .270: the old `maxGap < 50` read 59.4 ms on ubuntu-latest — an absolute wall-clock bound
  // judges the runner, never the sweep.) ONE ROW PER LOOP TURN is a WORK count: the rows the sweep STARTS between two
  // turns of a ticker loop (≤ 1 — a sweep that starts them together reads N). The stall is RELATIVE: a CONTROL loop of
  // the same length in this process — as long as the two sweeps took, turns that do nothing but `await setImmediate`,
  // each half ending in the store's own roster broadcast (_notify → list(): the ONE synchronous O(rows) read a sweep
  // that moved something makes, ~2.5 ms at 200 written rows here against ~0.5 ms for the longest act turn) — and the
  // sweep's longest stall ≤ 3 × the control's (r4384: now as two pairs, below — the turns of the acts, and the broadcasts' turns,
  // each ≤ 3 × the control's own). It runs right AFTER the sweeps, under the same spy, so its broadcast reads
  // the same written rows at the same cost, and a loaded runner's preemption gets the same window to land in (a control
  // of N turns is ~1 % of the sweeps' wall: 2 hogs on one CPU read the sweep 3.2 × it). A do-nothing control alone reads
  // ~0.1 ms — no K holds against it. A slower runner scales both.
  // r4384: each gap is classed as it closes: a gap that held a roster build (`built()` moved: list() is synchronous, so a build
  // sits inside ONE gap) is the broadcast's turn; every other gap is a turn of the acts (or of nothing, in the control). r4585:
  // a broadcast turn counts for the acts too WITHOUT its build's own time (`builtMs()`), so a sweep whose acts share that turn
  // (the r1 shape: every act and the broadcast in ONE turn) is seen by the judged leg
  const loopMeter = (built = () => 0, builtMs = () => 0) => {
    let maxGap = 0, maxRest = 0, maxCast = 0, restKind = 'none', restBuild = 0, seen = built(), seenMs = builtMs(), turns = 0, last = performance.now(), on = true;
    const long = [];   // r4340's prints only (they judge nothing): each gap of a millisecond or more, its length, its end and its turn
    const mark = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); const b = built(); if (b !== seen) { const bm = builtMs(), own = bm - seenMs; maxCast = Math.max(maxCast, t - last); if (t - last - own > maxRest) { maxRest = t - last - own; restKind = 'cast'; restBuild = own; } seen = b; seenMs = bm; } else if (t - last > maxRest) { maxRest = t - last; restKind = 'act'; restBuild = 0; } if (t - last >= 1) long.push({ ms: t - last, end: t, turn: turns }); last = t; };
    const tick = () => { mark(); turns++; if (on) setImmediate(tick); };
    setImmediate(tick);
    // stop() closes the open turn: a sweep that never yields reads its whole length
    return { turn: () => turns, stop: () => { on = false; mark(); return { maxGap, maxRest, maxCast, restKind, restBuild, turns, long }; } };
  };
  // r4340: WHAT A GAP HELD (the prints; they judge nothing): the rows the sweep started inside it (a hold of the sweep's own acts
  // shows at its row starts, gap after gap), a roster broadcast (list()) inside it, and the collector's pauses inside it (perf_hooks
  // «gc»). A stray stall (the runner taking the CPU away) is one gap that held none of them
  const heldBy = (g, starts, lists, gcs) => {
    const from = g.end - g.ms, inside = ([s, e]) => e > from && s < g.end;
    const gcMs = gcs.filter(inside).reduce((x, [s, e]) => x + Math.min(e, g.end) - Math.max(s, from), 0);
    return { ms: +g.ms.toFixed(2), turn: g.turn, rows: starts.filter((k) => k === g.turn).length, broadcast: lists.some(inside), gcMs: +gcMs.toFixed(2) };
  };
  const longestOf = (gaps) => gaps.reduce((p, g) => (g.ms > p.ms ? g : p), { ms: 0, end: 0, turn: -1 });
  // B-ed9e (the coordinator's r4870 GO): `scratch` adds THE SCRATCH CONTROL — a second store over its own scratch folder, its 200
  // stand-in rows (the token and the logins built at run time, never a literal), whose own sweep runs in a window of its own after
  // the control: the same archive, write and fsync on fs.promises and the same keeper re-read off the loop, in this process. The
  // measured store's roster builds there are made one turn after a scratch act started (its file work in flight), over the same
  // 200 written rows. `place` holds ONE roster build 40 ms (the second of that phase) — the placed red, its witness kept
  const f13 = async (M, N = 200, o = {}, { scratch = false, place = null } = {}) => {
    const am13 = mk(M, o); await nv(am13, '2.1.296');
    const ids = [];
    for (let i = 0; i < N; i++) { const m = am13.createSubscription({ name: 'C' + i }).id; put(am13, m, login(NOW, { dead: true })); ids.push(m); }
    for (const m of ids) { const a = am13.get(m); a.oatEnc = am13._enc(OAT); a.oatMintedAt = Date.now(); a.oatShape = SHAPE; }
    am13._save();
    // LIKE WITH LIKE (hosted run 45584145109, 主开发 r4209): each new row's FIRST display landing seeds its tie and saves the list
    // (B-87fd identity unit 4's _seedTieAt — a whole accounts.json write); those landings answer off the loop on LATER turns, so
    // unsettled they fell inside the timed sweep window and never inside the control's. They are settled HERE, before either window;
    // the saves each window still holds are counted and printed with the stall figure (the law's number does not move)
    await am13.displaySettled();
    let amS = null;   // B-ed9e: the scratch control's store, made AFTER the control's window (its heap and its landings never in the judged windows)
    let phase = 'before', actsOpen = 0, scratchOpen = 0;
    const spans = [], placed = { n: 0, done: false, phase: null };   // B-ed9e: each roster build's own span, its phase, and the file work in flight
    let saves = 0;
    am13._save = function (...a) { saves++; return Object.getPrototypeOf(this)._save.apply(this, a); };
    const subs = path.join(am13.dataDir, 'subs') + path.sep;
    const syncHits = [];
    const SYNC = ['readFileSync', 'writeFileSync', 'openSync', 'renameSync', 'unlinkSync', 'fsyncSync', 'statSync', 'lstatSync', 'existsSync', 'chmodSync', 'mkdirSync', 'readdirSync'];
    const keep = {};
    // (the ONE roster rebuild a sweep that moved something broadcasts — list(), the store's existing _notify path for
    // every change — reads the rows synchronously; it is outside the sweep's acts, and inside both stall figures)
    let inList = 0, builds = 0, buildMs = 0;
    const lists = [], gcs = [];   // r4340's prints: each roster broadcast's span, each pause of the collector
    am13.list = function (...a) {
      inList++; const from = performance.now(), open = phase === 'scratch' ? scratchOpen : actsOpen;
      if (place && phase === place && !placed.done && ++placed.n === 2) { while (performance.now() - from < 40) { } placed.done = true; placed.phase = phase; }   // THE PLACED HOLD, read inside its phase (the witness)
      try { return Object.getPrototypeOf(this).list.apply(this, a); } finally { const end = performance.now(); inList--; builds++; buildMs += end - from; lists.push([from, end]); spans.push({ phase, ms: end - from, open }); }
    };
    for (const k of SYNC) { keep[k] = fs[k]; fs[k] = function (p, ...r) { if (!inList && String(p).startsWith(subs)) syncHits.push(k); return keep[k].call(this, p, ...r); }; }
    const gcObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push([e.startTime, e.startTime + e.duration]); });
    gcObs.observe({ entryTypes: ['gc'] });
    const meter = loopMeter(() => builds, () => buildMs), starts = [];
    am13.syncOatFile = function (...a) { starts.push(meter.turn()); const pr = Object.getPrototypeOf(this).syncOatFile.apply(this, a); actsOpen++; pr.then(() => actsOpen--, () => actsOpen--); return pr; };
    let scratchFirst = null, scratchGone = null;
    let first, steady, run, ctl, savesSweep = 0, savesCtl = 0;
    try {
      const t0 = performance.now(); phase = 'sweep';
      first = await am13.syncOatFiles(); steady = await am13.syncOatFiles(); run = meter.stop(); savesSweep = saves;
      const took = performance.now() - t0;
      // the CONTROL: as long as the sweeps, their one broadcast each, not one act — over the rows they wrote
      phase = 'control';
      const c = loopMeter(() => builds, () => buildMs);
      for (let k = 0; k < 2; k++) { const until = performance.now() + took / 2; do await new Promise((res) => setImmediate(res)); while (performance.now() < until); am13._notify(); }
      ctl = c.stop(); savesCtl = saves - savesSweep;
      if (scratch) {   // B-ed9e: THE SCRATCH CONTROL — its store made here, after the judged windows; then its window: its own sweep in flight, the measured store's builds one turn after each 8th of its acts starts
        phase = 'scratch-setup'; amS = mk(M, o); await nv(amS, '2.1.296');
        const sids = [];
        for (let i = 0; i < N; i++) { const m = amS.createSubscription({ name: 'S' + i }).id; put(amS, m, login(NOW, { dead: true })); sids.push(m); }
        for (const m of sids) { const a = amS.get(m); a.oatEnc = amS._enc(OAT); a.oatMintedAt = Date.now(); a.oatShape = SHAPE; }
        amS._save(); await amS.displaySettled();
        phase = 'scratch'; let k = 0; const every = Math.max(1, Math.floor(N / 8));
        amS.syncOatFile = function (...a) { const pr = Object.getPrototypeOf(this).syncOatFile.apply(this, a); scratchOpen++; pr.then(() => scratchOpen--, () => scratchOpen--); if (++k % every === 0) setImmediate(() => am13._notify()); return pr; };
        scratchFirst = await amS.syncOatFiles(); await amS.oatFileSettled(); delete amS.syncOatFile;
        await new Promise((res) => setImmediate(res));   // the last scheduled build lands inside the window
      }
      phase = 'after';
      await new Promise((res) => setTimeout(res, 20));   // a pause's entry reaches the observer a turn or two after it (the prints only)
      for (const e of (typeof gcObs.takeRecords === 'function' ? gcObs.takeRecords() : [])) gcs.push([e.startTime, e.startTime + e.duration]);
    } finally {
      gcObs.disconnect(); if (!run) meter.stop(); delete am13.syncOatFile; delete am13.list; delete am13._save; for (const k of SYNC) fs[k] = keep[k];
      if (amS) { try { fs.rmSync(path.dirname(amS.dataDir), { recursive: true, force: true }); } catch { } scratchGone = !fs.existsSync(path.dirname(amS.dataDir)); }   // the scratch control's folders: removed here, read by its leg
    }
    const top = (ph) => spans.filter((x) => x.phase === ph).reduce((m, x) => Math.max(m, x.ms), 0);
    const pair = amS ? { sweep: +top('sweep').toFixed(2), ctl: +top('scratch').toFixed(2), nSweep: spans.filter((x) => x.phase === 'sweep').length, sweepOpen: spans.filter((x) => x.phase === 'sweep' && x.open > 0).length, nCtl: spans.filter((x) => x.phase === 'scratch').length, ctlOpen: spans.filter((x) => x.phase === 'scratch' && x.open > 0).length } : null;
    const scratchCounts = {}; if (scratchFirst) for (const v of Object.values(scratchFirst)) scratchCounts[v] = (scratchCounts[v] || 0) + 1;
    const counts = {}; for (const v of Object.values(first)) counts[v] = (counts[v] || 0) + 1;
    const perTurn = {}; for (const t of starts) perTurn[t] = (perTurn[t] || 0) + 1;
    const over = run.long.filter((g) => g.ms > 3 * ctl.maxGap).map((g) => heldBy(g, starts, lists, gcs));
    const held = { sweep: heldBy(longestOf(run.long), starts, lists, gcs), control: heldBy(longestOf(ctl.long), [], lists, gcs), over: { n: over.length, rows: over.filter((x) => x.rows > 0).length, broadcast: over.filter((x) => x.broadcast).length, gc: over.filter((x) => x.gcMs > 0).length, top: [...over].sort((x, y) => y.ms - x.ms).slice(0, 5) }, node: process.version };
    return { N, maxGap: +run.maxGap.toFixed(2), ctlGap: +ctl.maxGap.toFixed(2), rest: +run.maxRest.toFixed(2), restKind: run.restKind, restBuild: +run.restBuild.toFixed(2), ctlRest: +ctl.maxRest.toFixed(2), cast: +run.maxCast.toFixed(2), ctlCast: +ctl.maxCast.toFixed(2), saves: { sweep: savesSweep, control: savesCtl }, turns: run.turns, starts: starts.length, rowsPerTurn: Math.max(0, ...Object.values(perTurn)), counts, steady: [...new Set(Object.values(steady))], syncHits: [...new Set(syncHits)], held, pair, scratch: amS ? { counts: scratchCounts, gone: scratchGone } : null, placed: { done: placed.done, phase: placed.phase } };
  };
  const r13 = await f13(undefined, undefined, undefined, { scratch: true });
  ok(r13.counts.materialize === 200 && r13.steady.join() === 'written', 'F13: 200 fake rows — the first sweep materializes every one (archive + write), the next finds every one written', r13.counts);
  ok(r13.starts === 400 && r13.rowsPerTurn === 1, `F13: ONE row per loop turn — the two sweeps start ${r13.starts} row acts over ${r13.turns} turns of the loop, never more than ${r13.rowsPerTurn} between two turns`, r13);
  // r4384 / r4420 / r4585 THE LEG's FORM, LIKE AGAINST LIKE, the factor 3 unchanged: THE JUDGED LEG is the acts. The sweep's
  // longest turn outside its roster builds (a broadcast's turn counted without its build's own time) against the control's
  // broadcast turn (one synchronous read of the same rows: today's bound for an act turn; the control's empty turns, ~0.4 ms,
  // are no like for an act turn of ~1.2 ms: machine 1 read 1.26 against 3 × 0.40). The sweep's broadcast turns against the
  // control's are PRINTED below, never judged (the mirror's 29.04 against 3 × 8.33 was that figure). A ratio of two clocks
  // stays in this leg only because its subject IS a hold of the loop: a sweep that holds it leaves no work count to read; it is
  // read where nothing runs beside it (the heavy SERIAL lane, scripts/ci.mjs SERIAL)
  ok(r13.rest <= 3 * r13.ctlCast, `F13 (the acts): the event loop's longest stall across both sweeps outside their roster builds (a broadcast's turn counted without its build's own time) is ${r13.rest} ms ≤ 3 × the control's broadcast turn ${r13.ctlCast} ms — one synchronous read of the same 200 rows, today's bound for an act turn (the control's empty turns, ${r13.ctlRest} ms, are no like for an act; as long as the sweeps, no act; measured right after, in this process; the display landings settled before both windows — list saves in the sweep window ${r13.saves.sweep}, in the control ${r13.saves.control}; the longest stall overall ${r13.maxGap} ms, the control's ${r13.ctlGap} ms)`, r13);
  // THE BROADCAST PAIR IS PRINTED, NEVER JUDGED (r4585; the header's two sentences, row B-ed9e). Its reason (r4420; probes
  // 6cb57ff0d and a08855fca, never lined): the control's broadcast cannot be made a first build like the sweep's without the
  // product's own file work — the sweep's builds made while its writes and the keeper's off-loop reads are in flight read up to
  // ~3.9 × a warm one, a stand-in change of every row's oat facts builds warm, no method is compiled for the first time in any
  // build — so on machine 1 alone it stood at 1.67 / 1.08 / 2.53 of its control: a pair at 84 % of its bound is not judged
  console.log(`    F13 (the broadcast, PRINTED, never judged; row B-ed9e): the longest turn that held a roster build in the sweeps' window ${r13.cast} ms against 3 × the control's broadcast turn ${r13.ctlCast} ms = ${+(3 * r13.ctlCast).toFixed(2)} ms — ${r13.ctlCast > 0 ? +(r13.cast / r13.ctlCast).toFixed(2) : 'n/a'} × its control`);
  console.log(`    F13 (the acts' longest turn, what it was): ${r13.rest} ms — ${r13.restKind === 'cast' ? `a broadcast's turn counted without its build's own ${r13.restBuild} ms` : r13.restKind === 'act' ? 'a turn that held no roster build' : 'no turn'}`);
  // B-ed9e: THE BROADCAST PAIR LIKE AGAINST LIKE IN ITS FILE WORK TOO — the sweep's longest roster build (its own span) against 3 ×
  // the scratch control's longest build, the factor unchanged; PRINTED (beside the old figure above) until three alone readings on
  // machine 1 and three box rows read it at half its bound or less (r4585). A control build made with no scratch act in flight is
  // a scratch control whose file work was not in force: said by name, never a figure
  { const p = r13.pair;
    if (!(p && p.nCtl > 0 && p.ctlOpen > 0)) console.log(`  ⊘ SKIP (named): F13's broadcast pair (B-ed9e) — the scratch control made ${p ? p.nCtl : 0} roster builds, ${p ? p.ctlOpen : 0} of them with a scratch act in flight: its file work was not in force`);
    else console.log(`    F13 (the broadcast, B-ed9e's form, PRINTED until its proof law): the sweep's longest roster build ${p.sweep} ms against 3 × the scratch control's longest build ${p.ctl} ms = ${+(3 * p.ctl).toFixed(2)} ms — ${+(p.sweep / p.ctl).toFixed(2)} × its control (${p.nSweep} builds in the sweep, ${p.sweepOpen} with a row's act in flight; ${p.nCtl} in the scratch control, ${p.ctlOpen} with a scratch act in flight)`); }
  ok(!!r13.scratch && r13.scratch.counts.materialize === 200 && r13.scratch.gone === true, 'F13 (B-ed9e): the scratch control\'s store materialized its 200 stand-in rows (the token and the logins built at run time) in its own window, and its folders are removed at the end', r13.scratch);
  // THE PLACED RED (B-ed9e, law 1 of r5135: a control is judged on the fact that its plant was in force): one roster build of the
  // sweep held 40 ms, read inside the sweep's window (the witness), reads the pair red; the same hold in a build of the scratch
  // control raises the control's own figure and the pair reads green. A hold not read inside its window is a named skip
  const rP = await f13(undefined, undefined, undefined, { scratch: true, place: 'sweep' });
  if (!(rP.placed.done && rP.placed.phase === 'sweep' && rP.pair)) console.log('  ⊘ SKIP (named): RED control (F13, B-ed9e) — the placed 40 ms hold was not read inside the sweep\'s window: its plant was not in force');
  else ok(rP.pair.sweep > 3 * rP.pair.ctl, `RED control (F13, B-ed9e): one roster build of the sweep held 40 ms (read inside the sweep's window) reads the pair red at will — the sweep's longest build ${rP.pair.sweep} ms against 3 × the scratch control's ${rP.pair.ctl} ms`, rP.pair);
  const rQ = await f13(undefined, undefined, undefined, { scratch: true, place: 'scratch' });
  if (!(rQ.placed.done && rQ.placed.phase === 'scratch' && rQ.pair)) console.log('  ⊘ SKIP (named): CONTROL (F13, B-ed9e) — the placed 40 ms hold was not read inside the scratch control\'s window: its plant was not in force');
  else ok(rQ.pair.sweep <= 3 * rQ.pair.ctl, `CONTROL (F13, B-ed9e): the same 40 ms hold in a build of the scratch control (read inside its window) raises the control's own figure, and the pair reads green — the sweep's ${rQ.pair.sweep} ms against 3 × ${rQ.pair.ctl} ms`, rQ.pair);
  { const h = r13.held;   // r4340: what tells a hold from a stray stall (judges nothing)
    console.log(`    F13's longest gap ${h.sweep.ms} ms at turn ${h.sweep.turn}: rows started in it ${h.sweep.rows}, a roster broadcast ${h.sweep.broadcast ? 'inside' : 'not inside'}, the collector ${h.sweep.gcMs} ms inside; the control's ${h.control.ms} ms: a broadcast ${h.control.broadcast ? 'inside' : 'not inside'}, the collector ${h.control.gcMs} ms; gaps past 3 × the control's ${h.over.n} (with a row start ${h.over.rows}, a broadcast ${h.over.broadcast}, a pause ${h.over.gc}); node ${h.node}`);
    for (const x of h.over.top) console.log(`      a gap past the bound: ${x.ms} ms at turn ${x.turn}: rows started ${x.rows}, a broadcast ${x.broadcast ? 'inside' : 'not inside'}, the collector ${x.gcMs} ms inside`); }
  ok(r13.syncHits.length === 0, 'F13: not one synchronous fs call on a member path from the sweep\'s acts (every read / write / rename / fsync is fs.promises; the one roster broadcast after it is the store\'s existing list())', r13.syncHits);
  const mF13 = mutantStore({ mat: [['    await fh.sync();\n', '    require(\'fs\').fsyncSync(fh.fd);\n    require(\'fs\').statSync(dest + \'.never\', { throwIfNoEntry: false });\n']] });
  const r13m = mF13 ? await f13(mF13, 20) : null;
  ok(!!r13m && r13m.syncHits.length > 0, 'RED control (F13): a writer that goes synchronous on the member path is seen by the spy', r13m && r13m.syncHits);
  // a sweep that starts every row in one turn (no queue): the work count reads N — the stall cannot see it (each row's
  // start is a few µs; the longest turn is still the broadcast)
  const mF13b = mutantStore({ acc: [['      for (const id of ids) {\n        let r = null;\n', '      await Promise.all(ids.map(async (id) => {\n        let r = null;\n'], ['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '        await new Promise((res) => setImmediate(res));\n      }));\n      if (moved) this._notify();\n']] });
  const r13b = mF13b ? await f13(mF13b) : null;
  ok(!!r13b && r13b.counts.materialize === 200 && r13b.rowsPerTurn === 200, `RED control (F13): a sweep that starts all ${r13b && r13b.N} rows in one turn reads ${r13b && r13b.rowsPerTurn} rows between two turns of the loop`, r13b);
  // the r1 shape (pool-oat-verify F13): every act ON the loop — account-material's fs.promises answered by the sync
  // calls, no turn between rows — both sweeps run in ONE turn: the stall passes 3 × the control, the count reads 2 × N
  const R1_FSP = "const fsp = (() => { const h = (fd) => ({ fd, chmod: async (m) => fs.fchmodSync(fd, m), close: async () => fs.closeSync(fd), readFile: async (o) => fs.readFileSync(fd, o), stat: async () => fs.fstatSync(fd), sync: async () => fs.fsyncSync(fd), writeFile: async (b) => fs.writeFileSync(fd, b) }); return { open: async (...a) => h(fs.openSync(...a)), chmod: async (...a) => fs.chmodSync(...a), link: async (...a) => fs.linkSync(...a), lstat: async (...a) => fs.lstatSync(...a), mkdir: async (...a) => fs.mkdirSync(...a), rename: async (...a) => fs.renameSync(...a), unlink: async (...a) => fs.unlinkSync(...a), readFile: async (...a) => fs.readFileSync(...a), copyFile: async (...a) => fs.copyFileSync(...a) }; })();\n";   // r2697: + readFile (the guards' content compare) and copyFile (no hard links) — every member account-material calls, answered by the sync call
  // …and THE DOOR OF THE r1 SHAPE (主开发 r2068 / r2097): since B-360d (d229032f4, the accounts list reads no file on the loop) the
  // store reads its sign-in facts OFF the loop through its own SafeFs worker, whose answers land on LATER turns (the hosted run read
  // «20 rows in one turn» under this mutant); the r1 shape — every act on the loop — reads them in the SAME turn, as the release did:
  // a door whose stat / realpath / read are synchronous, each answered as a resolved promise. Only this mutant takes it.
  const SYNC_DOOR = { call: async (op, a) => {
    if (op === 'stat') { const st = fs.statSync(a.path); return { isFile: st.isFile(), mtimeMs: st.mtimeMs, size: st.size }; }
    if (op === 'realpath') return fs.realpathSync(a.path);
    if (op === 'readText') return fs.readFileSync(a.path, 'utf8');
    throw Object.assign(new Error(`the r1 door has no ${op}`), { code: 'ENOSYS' });
  } };
  const mF13c = mutantStore({ mat: [['const fsp = fs.promises;\n', R1_FSP]], acc: [['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '      }\n      if (moved) this._notify();\n']] });
  const r13c = mF13c ? await f13(mF13c, undefined, { safeFs: SYNC_DOOR }) : null;
  ok(!!r13c && r13c.counts.materialize === 200 && !(r13c.rest <= 3 * r13c.ctlCast) && r13c.rowsPerTurn === 400, `RED control (F13): the r1 sweep (every act on the loop) turns the judged leg red — its acts outside the roster builds ${r13c && r13c.rest} ms against 3 × the control's broadcast turn ${r13c && r13c.ctlCast} ms (the broadcast's turn ${r13c && r13c.cast} ms, printed; the longest stall ${r13c && r13c.maxGap} ms); ${r13c && r13c.rowsPerTurn} rows in one turn`, r13c);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\ntest-oat-materialize-sweep: ${Date.now() - T0} ms`);
report();
