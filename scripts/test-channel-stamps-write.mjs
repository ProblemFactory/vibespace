#!/usr/bin/env node
// test-channel-stamps-write — B-360d (lane bl-chat-a; the coordinator's r1294 / r1319 / r1556): THE POLL STAMPS' SIDE FILE IS THE JOURNAL'S COMPACTION — quiet is free, one compaction past the bound,
// made in slices, a close mid-compaction writes it whole, a failed journal line asks it at once, and 2.369.414's own reader
// (a frozen copy) reads what it leaves. Each with its RED control. The rounds' laws: test-channel-stamps-rounds.
// FAST, in process — the real channel store; a stand-in store-writer thread (scripts/fixtures/store-stand-writer.cjs) that
// holds or fails a file's write; every writer runs on a SHORT STATED PACE (PACED.floorMs) and every store states the stamps'
// debounce (DEB) — each wait below is one of those constants × a stated slack, never a bare wall-clock number.
// Run: node scripts/test-channel-stamps-write.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import Module from 'node:module';
import './scratch.mjs';   // the build's §113 order: the scratch home first, after node's own
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const PACE = require(path.join(REPO, 'src/store-pace.js'));

let pass = 0, fail = 0;
const T0 = performance.now(), at = () => `[${((performance.now() - T0) / 1000).toFixed(1)} s]`;   // each leg's place in the suite's time (printed, never judged)
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n + ' ' + at()); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const ROOT = scratch('test-channel-stamps-write');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TICK_MS = 10;
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const STAND = SAND.path, failOn = SAND.failOn;
const DEB = 25;                      // the stamps' debounce every store here states (the hub's: the writer's 0.5 s)
const PACED = { floorMs: DEB };    // the writers' gap floor here (the hub's: store-pace's MIN_GAP_FLOOR_MS)
const AFTER_PACE_MS = DEB * 12;      // past a debounce and a gap: a write the sets asked has begun or landed
// (m) B-360d — THE POLL STAMPS' SIDE FILE IS THE JOURNAL'S COMPACTION (the coordinator's r1319; measured at the order of
//     200 000 stamped keys: the whole side file every 120 s held the loop 265 ms p50 / 299 ms max for a few dozen moved keys):
//     (m1) QUIET IS FREE — a quiet hour's stamps append their journal lines and write nothing else (the side file's bytes
//          unchanged, nothing owed). CONTROL: a bound of 0 — every set asks the side file — red.
//     (m2) THE BOUND — the journal grows to half the side file's bytes (at least 64 KB) with no write; one more line past it
//          asks ONE compaction; it lands, the journal is folded, and what a kill leaves reads every newest stamp.
//     (m3) SLICES — the compaction's bytes are made at most `stampsSlice` keys a turn (a sampler on every turn sees the
//          count rise by one). CONTROL: one slice for every key — red.
//     (m4) A CLOSE MID-COMPACTION writes the whole side file in its own turn (the journal folded). CONTROL: the close drops
//          the compaction being made and writes nothing — red.
//     (m3b) THE SLICE WINDOW (主开发 r4642 must 1) — a compaction of two slices HELD between them by the leg (the store's own
//          next-slice callback taken from setImmediate, run only when the leg lets it go: a placed hold, never a clock); in that
//          gap a key of the slice made is set again, a key of the slice to come is set, a key of the made slice is deleted; the
//          landing waited on as a fact; a store made again (the first never closed — no whole write hides a loss) reads the newest
//          of all three and nothing of the deleted one. CONTROLS: the made mark moved to the last slice; the «set since» note
//          dropped from a set — red.
//     (m3c) A ROW BORN AGAIN UNDER A KEY THAT LEFT (r4642 (3)) is a change of that key for the window: the compaction's write
//          held in flight on the stand-in thread, the row leaves and is born again during it; a store made again gives the new
//          row no stamp. CONTROL: the release's line (its removal journaled, the key not marked set since the bytes) — red.
//     (m5) A JOURNAL LINE THAT CANNOT BE WRITTEN asks the compaction at once (the side file carries the change). CONTROL:
//          the failed append asks nothing — red.
//     (m6) ROLLBACK — 2.369.414's own reader (scripts/fixtures/stamps-reader-414.cjs, its lines copied verbatim) reads every
//          newest stamp from what the compaction leaves: mid-life (the side file + the journal past it) and after a close.
//          CONTROL: a side file in a shape the release cannot read (v 2) — red.
//     (m7)–(m9), the rounds' laws (a write never schedules the next one, the purge, the retry): test-channel-stamps-rounds;
//     (m8b)–(m8e), a purge's ONE door (r4642): test-channel-stamps-purge.
console.log('(m) B-360d: quiet is free — the side file is the journal\'s compaction, made in slices; a rollback reads it');
{
  const CS_FILE = path.join(REPO, 'src/channel-store.js');
  const SRC = fs.readFileSync(CS_FILE, 'utf8');
  const loadCut = (cut) => {
    if (!cut) return CS;
    const cuts = Array.isArray(cut[0]) ? cut : [cut];
    let src = SRC;
    for (const c of cuts) { if (src.split(c[0]).length !== 2) throw new Error(`(m) a CONTROL's anchor is not in src/channel-store.js once: ${c[0].slice(0, 90)}`); src = src.replace(c[0], c[1]); }
    const m = new Module(CS_FILE, null); m.filename = CS_FILE; m.paths = Module._nodeModulePaths(path.dirname(CS_FILE)); m._compile(src, CS_FILE); return m.exports;
  };
  const BOUND0 = ['  function stampsBoundBytes() { return stampsSideBytes < 0 ? 0 :', '  function stampsBoundBytes() { return 0; return stampsSideBytes < 0 ? 0 :'];
  const ONESLICE = ['end = Math.min(b.keys.length, b.i + stampsSlice);', 'end = b.keys.length;'];
  const CLOSEDROP = ['      if (stampsBuild) { stampsBuild = null; stampsDirty = true; }', '      if (stampsBuild) { stampsBuild = null; }'];
  const NOFAILASK = ['      stampsCompactNow = true;   // B-360d', '      // B-360d'];
  const SIDEV2 = ['`{"v":1,"fields":${JSON.stringify(STAMP_KEYS)},"stamps":{${lines.length', '`{"v":2,"fields":${JSON.stringify(STAMP_KEYS)},"stamps":{${lines.length'];
  const FR = require(path.join(REPO, 'scripts/fixtures/stamps-reader-414.cjs'));
  const T = Date.UTC(2026, 10, 21, 6, 0, 0), N = 1000;   // a side file of N keys: under the 64 KB floor of the bound (the journal reaches it in (m2))
  const keyOf = (i) => `acct/t${i}`;
  const jLines = (st) => { try { return fs.readFileSync(st.stamps.log, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const logBytes = (st) => { try { return fs.statSync(st.stamps.log).size; } catch { return 0; } };
  const turn = () => new Promise((r) => setImmediate(r));
  // a folder of N rows and a side file of N stamps (a first store's close wrote it whole and folded its journal)
  const seedDir = async (tag) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = CS.createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    await st.index.update(() => { for (let i = 0; i < N; i++) st.index.entry('acct', `t${i}`, { create: true }); });
    for (let i = 0; i < N; i++) st.stamps.set(keyOf(i), { lastPollAt: T - 3600e3 + i });
    st.close(); w.stop();
    return dir;
  };
  const open = (M, dir, o = {}) => { const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED }); return { w, st: M.createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB, ...o }) }; };
  const settle = async (w, st, ms = 4000) => { const end = performance.now() + ms; while (performance.now() < end && w.pending(st.stamps.file)) await sleep(25); };

  // (m1) quiet is free
  const quietRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const side0 = fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8');
    const { w, st } = open(loadCut(cut), dir);
    const w0 = st.stamps.stats().writes;
    for (let n = 0; n < 200; n++) { st.stamps.set(keyOf((n * 37) % N), { lastPollAt: T + n * 1000 }); if (n % 20 === 19) await sleep(TICK_MS); }   // a quiet hour's polls, spread over the loop
    await sleep(AFTER_PACE_MS);   // past the writer's paced floor (0.5 s): a write the sets asked has begun or landed
    await settle(w, st);
    const r = { writes: st.stamps.stats().writes - w0, owed: w.pending(st.stamps.file), journal: jLines(st), same: fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8') === side0 };
    w.stop();
    return r;
  };
  const q = await quietRun('quiet', null);
  ok(q.writes === 0 && !q.owed && q.journal === 200 && q.same, `(m1) QUIET IS FREE: 200 polls' stamps over a side file of ${N} — ${q.writes} side-file write(s), nothing owed, the journal holds their ${q.journal} lines, the side file's bytes unchanged`, q);
  const qc = await quietRun('quiet-c', BOUND0);
  ok(qc.writes >= 1 && !qc.same, `(m1) CONTROL: a bound of 0 — the quiet hour's stamps rewrite the whole side file (${qc.writes} write(s)) — red`, qc);

  // (m2) the bound
  {
    const dir = await seedDir('bound');
    const { w, st } = open(CS, dir);
    const bound = Math.max(64 * 1024, Math.floor(fs.statSync(path.join(dir, 'poll-stamps.json')).size / 2));
    const last = {}; let n = 0;
    const set1 = () => { const k = keyOf((n * 7) % N); st.stamps.set(k, { lastPollAt: T + n }); last[k] = T + n; n++; };
    while (logBytes(st) < bound - 80) set1();   // up to one line under the bound: nothing asked
    await sleep(AFTER_PACE_MS); await settle(w, st);
    const under = { bytes: logBytes(st), writes: st.stamps.stats().writes, owed: w.pending(st.stamps.file) };
    while (logBytes(st) < bound) set1();   // the line that passes it
    const end = performance.now() + 15000;
    while (performance.now() < end && st.stamps.stats().compactions < 1) await sleep(25);
    await settle(w, st);
    const after = { compactions: st.stamps.stats().compactions, journal: jLines(st) };
    const reborn = CS.createChannelStore({ dir, log: quiet, writer: SW.create({ log: quiet, workerPath: STAND, pace: PACED }) });   // what a kill leaves now
    const wrong = Object.entries(last).filter(([k, v]) => (reborn.stamps.get(k) || {}).lastPollAt !== v).length;
    ok(under.writes === 0 && !under.owed && under.bytes >= bound - 200 && after.compactions === 1 && after.journal === 0 && wrong === 0,
      `(m2) THE BOUND: the journal grew to ${under.bytes} B (bound ${bound} B: half the side file, at least 64 KB) with no write; the line past it asked ONE compaction (${after.compactions}), the journal folded to ${after.journal} lines, and what a kill leaves reads every newest stamp (${Object.keys(last).length} keys, ${wrong} wrong)`, { under, after, bound, wrong });
    w.stop();
  }

  // (m3) slices
  const sliceRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir, { stampsBound: { min: 1024, max: 1024 }, stampsSlice: 500 });
    const s0 = st.stamps.stats().slices, seen = [];
    let on = true; const sample = () => { seen.push(st.stamps.stats().slices); if (on) setImmediate(sample); }; setImmediate(sample);
    for (let n = 0; logBytes(st) < 1024; n++) st.stamps.set(keyOf(n % N), { lastPollAt: T + n });
    const end = performance.now() + 15000;
    while (performance.now() < end && st.stamps.stats().compactions < 1) await sleep(10);
    on = false; await settle(w, st);
    let jump = 0; for (let i = 1; i < seen.length; i++) jump = Math.max(jump, seen[i] - seen[i - 1]);
    const r = { slices: st.stamps.stats().slices - s0, jump, compactions: st.stamps.stats().compactions };
    w.stop();
    return r;
  };
  const sl = await sliceRun('slices', null);
  ok(sl.compactions === 1 && sl.slices === Math.ceil(N / 500) && sl.jump <= 1, `(m3) SLICES: a compaction of ${N} keys made in ${sl.slices} slices of at most 500 (each its own turn: a sampler on every turn saw the count rise by at most ${sl.jump})`, sl);
  const slc = await sliceRun('slices-c', ONESLICE);
  ok(slc.slices === 1, `(m3) CONTROL: one slice for every key — ${slc.slices} slice(s) — red`, slc);

  // (m4) a close mid-compaction
  const closeRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir, { stampsBound: { min: 1024, max: 1024 }, stampsSlice: 1 });
    const last = {};
    for (let n = 0; logBytes(st) < 1024; n++) { const k = keyOf(n % N); st.stamps.set(k, { lastPollAt: T + 5e6 + n }); last[k] = T + 5e6 + n; }
    const end = performance.now() + 15000;
    while (performance.now() < end && st.stamps.stats().slices < 1) await turn();
    const mid = st.stamps.stats().slices > 0 && st.stamps.stats().slices < N && st.stamps.stats().compactions === 0;
    st.close();
    let side = {}; try { side = JSON.parse(fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8')).stamps; } catch { }
    const wrong = Object.entries(last).filter(([k, v]) => !Array.isArray(side[k]) || side[k][0] !== v).length;
    const r = { mid, wrong, keys: Object.keys(side).length, journal: logBytes(st) };
    w.stop();
    return r;
  };
  const cl = await closeRun('close', null);
  ok(cl.mid && cl.wrong === 0 && cl.keys === N && cl.journal === 0, `(m4) A CLOSE MID-COMPACTION (one slice a turn, ${N} keys): the close wrote the whole side file in its own turn — ${cl.keys} keys, ${cl.wrong} not the newest, the journal folded (${cl.journal} B)`, cl);
  const clc = await closeRun('close-c', CLOSEDROP);
  ok(clc.mid && clc.wrong > 0, `(m4) CONTROL: the close drops the compaction being made and writes nothing — ${clc.wrong} key(s) not the newest in the side file — red`, clc);

  // (m3b) THE SLICE WINDOW (主开发 r4642 must 1) — a placed hold between two slices of one compaction
  const LASTMARK = [['    stampsMadeNow();\n    stampsBuild = { keys: [...stampMap.keys()], i: 0, lines: [], ready: null, inProduce: true };', '    stampsBuild = { keys: [...stampMap.keys()], i: 0, lines: [], ready: null, inProduce: true };'], ['    b.ready = sideTextOf(b.lines); b.lines = null;', '    stampsMadeNow(); b.ready = sideTextOf(b.lines); b.lines = null;']];
  const NOSINCE = ['    stampsDirty = true; stampSeq++; stampsSince.add(k);', '    stampsDirty = true; stampSeq++;'];
  const IMM = globalThis.setImmediate;
  const HOLD_BOUND_MS = 10000;   // a fact not seen within it is a HARNESS line (the leg below then judges red), never a pass
  const windowRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir, { stampsBound: { min: 1024, max: 1024 }, stampsSlice: 500 });
    const A = keyOf(10), B = keyOf(700), D = keyOf(20);   // slice 1 = keys 0–499 (the side file's order), slice 2 = keys 500–999
    let held = null, r = null;
    // THE HOLD: the store's next slice is the one setImmediate whose callback runs stampsBuildSlice — taken, not run, until let go
    globalThis.setImmediate = (fn, ...a) => {
      if (!held && typeof fn === 'function' && String(fn).includes('stampsBuildSlice')) { held = fn; return { ref() { return this; }, unref() { return this; }, hasRef: () => false }; }
      return IMM(fn, ...a);
    };
    try {
      for (let n = 0; logBytes(st) < 1024; n++) st.stamps.set(keyOf(900 + (n % 100)), { lastPollAt: T + n });   // past the bound: the compaction owed
      const end = performance.now() + HOLD_BOUND_MS;
      while (!held && performance.now() < end) await sleep(TICK_MS);
      if (!held) console.error(`  HARNESS (m3b ${tag}): no second slice was held within ${HOLD_BOUND_MS} ms — the compaction never began`);
      const gap = { slices: st.stamps.stats().slices, compactions: st.stamps.stats().compactions };
      st.stamps.set(A, { lastPollAt: T + 9e6 + 1 });   // a key of the slice already made, set again
      st.stamps.set(B, { lastPollAt: T + 9e6 + 2 });   // a key of the slice to come
      st.stamps.set(D, { lastPollAt: 0 });             // a key of the made slice, deleted (its only stamp removed)
      globalThis.setImmediate = IMM;
      if (held) IMM(held);   // let it go: the second slice, then the bytes to the writer
      const end2 = performance.now() + HOLD_BOUND_MS;
      while (st.stamps.stats().compactions < 1 && performance.now() < end2) await sleep(TICK_MS);
      if (st.stamps.stats().compactions < 1) console.error(`  HARNESS (m3b ${tag}): the compaction did not land within ${HOLD_BOUND_MS} ms`);
      await settle(w, st);
      const w2 = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
      const reborn = CS.createChannelStore({ dir, log: quiet, writer: w2 });   // what a kill leaves (the first store never closed)
      r = { held: !!held, gap, landed: st.stamps.stats().compactions, a: (reborn.stamps.get(A) || {}).lastPollAt || null, b: (reborn.stamps.get(B) || {}).lastPollAt || null, d: (reborn.stamps.get(D) || {}).lastPollAt || null };   // stamps.get answers {} for a key with none
      w2.stop();
    } finally { globalThis.setImmediate = IMM; }
    w.stop();
    return r;
  };
  const wn = await windowRun('window', null);
  ok(wn.held && wn.gap.slices === 1 && wn.gap.compactions === 0 && wn.landed === 1 && wn.a === T + 9e6 + 1 && wn.b === T + 9e6 + 2 && wn.d === null,
    `(m3b) THE SLICE WINDOW: a compaction of 2 slices held after its first (${wn.gap.slices} made, ${wn.gap.compactions} landed); in the gap a made key set again, a key to come set, a made key deleted; landed (${wn.landed}) — a store made again reads the newest of both (${wn.a === T + 9e6 + 1}, ${wn.b === T + 9e6 + 2}) and nothing of the deleted one (${wn.d})`, wn);
  const wnm = await windowRun('window-cm', LASTMARK);
  ok(wnm.held && (wnm.a !== T + 9e6 + 1 || wnm.d !== null), `(m3b) CONTROL: the made mark moved to the last slice — the reborn store reads the made key's older stamp (${wnm.a}) or the deleted one back (${wnm.d}) — red`, wnm);
  const wns = await windowRun('window-cs', NOSINCE);
  ok(wns.held && (wns.a !== T + 9e6 + 1 || wns.d !== null), `(m3b) CONTROL: the «set since» note dropped from a set — the reborn store reads the made key's older stamp (${wns.a}) or the deleted one back (${wns.d}) — red`, wns);

  // (m3c) A ROW BORN AGAIN UNDER A KEY THAT LEFT (r4642 (3))
  const NOREBORN = ['      if (stampMap.delete(key)) { stampsDirty = true; stampSeq++; stampsSince.add(key); journal(key); }', '      if (stampMap.delete(key)) { stampsDirty = true; journal(key); }'];   // stale-pins: kept (the RED control restores the release's line)
  const HOLD_MS = 400;   // the stand-in thread holds the side file's (or the index's) write this long; the leg's changes inside it take a few ms
  const flying = (w, f) => !!(w.stats().find((s) => s.file === f) || {}).inflight;   // the writer's own fact: that file's write on its thread now
  const rebornRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir, { stampsBound: { min: 1024, max: 1024 } });
    const K = keyOf(5), old = T - 3600e3 + 5;
    let r = null;
    SAND.hold('poll-stamps.json', HOLD_MS);
    try {
      for (let n = 0; logBytes(st) < 1024; n++) st.stamps.set(keyOf(600 + (n % 300)), { lastPollAt: T + n });   // past the bound: its bytes carry K's stamp
      const end = performance.now() + HOLD_BOUND_MS;
      while (!flying(w, st.stamps.file) && performance.now() < end) await sleep(TICK_MS);
      const inFlight0 = flying(w, st.stamps.file);
      if (!inFlight0) console.error(`  HARNESS (m3c ${tag}): the side file's write was never seen on the thread within ${HOLD_BOUND_MS} ms`);
      await st.index.update((ix) => { delete ix.conversations[K]; });   // the row leaves …
      await st.index.update(() => { st.index.entry('acct', 't5', { create: true }); });   // … and is born again under its key
      const inFlight1 = flying(w, st.stamps.file);   // the scene held: both inside the write's flight
      const end2 = performance.now() + HOLD_BOUND_MS;
      while (st.stamps.stats().compactions < 1 && performance.now() < end2) await sleep(TICK_MS);
      await settle(w, st);
      const w2 = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
      const reborn = CS.createChannelStore({ dir, log: quiet, writer: w2 });   // the first never closed
      r = { inFlight0, inFlight1, landed: st.stamps.stats().compactions, k: (reborn.stamps.get(K) || {}).lastPollAt || null, old };   // stamps.get answers {} for a key with none
      w2.stop();
    } finally { SAND.unhold('poll-stamps.json'); }
    w.stop();
    return r;
  };
  const rbn = await rebornRun('reborn', null);
  ok(rbn.inFlight0 && rbn.inFlight1 && rbn.landed === 1 && rbn.k === null, `(m3c) A ROW BORN AGAIN UNDER A KEY THAT LEFT, during the compaction's flight (${rbn.inFlight0}, ${rbn.inFlight1}): landed (${rbn.landed}) — a store made again gives the new row no stamp (${rbn.k})`, rbn);
  const rbnc = await rebornRun('reborn-c', NOREBORN);
  ok(rbnc.inFlight1 && rbnc.k === rbnc.old, `(m3c) CONTROL: the release's line — the new row carries the old row's poll time after a restart (${rbnc.k}) — red`, rbnc);

  // (m5) a journal line that cannot be written
  const failRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir);
    // the journal cannot be opened — broken AFTER the open: at 2.369.419 a journal the open cannot read HOLDS the family (B-f276 1c:
    // nothing of it written), so the failed line is its first append's (the store opens it lazily)
    fs.rmSync(path.join(dir, 'poll-stamps.log'), { force: true }); fs.mkdirSync(path.join(dir, 'poll-stamps.log'));
    st.stamps.set(keyOf(5), { lastPollAt: T + 9e6 });
    await sleep(AFTER_PACE_MS);
    const end = performance.now() + 15000;
    while (performance.now() < end && st.stamps.stats().compactions < 1 && (w.pending(st.stamps.file) || st.stamps.stats().slices > 0)) await sleep(25);
    await settle(w, st);
    let side = {}; try { side = JSON.parse(fs.readFileSync(path.join(dir, 'poll-stamps.json'), 'utf8')).stamps; } catch { }
    const r = { compactions: st.stamps.stats().compactions, carried: Array.isArray(side[keyOf(5)]) && side[keyOf(5)][0] === T + 9e6 };
    w.stop();
    return r;
  };
  const fl = await failRun('jfail', null);
  ok(fl.compactions === 1 && fl.carried, `(m5) A JOURNAL LINE THAT CANNOT BE WRITTEN asks the compaction at once: the side file carries the stamp (${fl.compactions} compaction)`, fl);
  const flc = await failRun('jfail-c', NOFAILASK);
  ok(flc.compactions === 0 && !flc.carried, `(m5) CONTROL: the failed append asks nothing — the stamp lives in memory only (${flc.compactions} compaction) — red`, flc);

  // (m6) rollback: 2.369.414's reader
  const rollRun = async (tag, cut) => {
    const dir = await seedDir(tag);
    const { w, st } = open(loadCut(cut), dir, { stampsBound: { min: 4096, max: 4096 } });
    const last = {};
    for (let i = 0; i < N; i++) last[keyOf(i)] = T - 3600e3 + i;
    for (let n = 0; n < 1500; n++) { const k = keyOf((n * 13) % N); st.stamps.set(k, { lastPollAt: T + 7e6 + n }); last[k] = T + 7e6 + n; if (n % 100 === 99) await sleep(TICK_MS); }
    await sleep(AFTER_PACE_MS); await settle(w, st);
    for (let n = 0; n < 20; n++) { const k = keyOf((n * 101) % N); st.stamps.set(k, { lastPollAt: T + 8e6 + n }); last[k] = T + 8e6 + n; }   // under the bound: lines past the side file
    const diff = (m) => Object.entries(last).filter(([k, v]) => ((m.get(k) || {}).lastPollAt || null) !== v).length;
    const midRead = FR.readStamps(dir);
    const mid = { compactions: st.stamps.stats().compactions, journal: jLines(st), wrong: diff(midRead.map), aside: midRead.side.aside || null };
    st.close();
    const endRead = FR.readStamps(dir);
    const r = { mid, end: { wrong: diff(endRead.map), journal: logBytes(st), aside: endRead.side.aside || null } };
    w.stop();
    return r;
  };
  const rb = await rollRun('rollback', null);
  ok(rb.mid.compactions >= 1 && rb.mid.journal > 0 && rb.mid.wrong === 0 && !rb.mid.aside && rb.end.wrong === 0 && rb.end.journal === 0 && !rb.end.aside,
    `(m6) ROLLBACK: ${FR.RELEASE}'s own reader (${FR.SHA}, copied verbatim) reads every newest stamp of ${N} keys from what the compaction leaves — mid-life (${rb.mid.compactions} compaction(s) landed, ${rb.mid.journal} journal lines past the side file: ${rb.mid.wrong} wrong) and after a close (${rb.end.wrong} wrong, the journal folded)`, rb);
  const rbc = await rollRun('rollback-c', SIDEV2);
  ok(rbc.end.wrong > 0 && rbc.end.aside, `(m6) CONTROL: a side file in a shape the release cannot read (v 2) — its reader sets it aside and ${rbc.end.wrong} key(s) read wrong — red`, rbc);

}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
