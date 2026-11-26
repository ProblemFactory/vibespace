#!/usr/bin/env node
// B-360d FOUND HOLDER 4 (lane bl-loop-b, 主开发 r4997): THE INDEX's WRITE AFTER BIRTHS lays them out in slices, never in one turn.
// The probe (r4987, never lined: the stand-in's 198 043 rows born in pages of 500, each in its own turn) placed it: every whole write
// laid out EVERY new row since the last in one call (296 / 679 / 1 344 ms at 28 000 / 55 000 / 115 043 births) — the produce's sliced
// road counted only the layout's touched chunks, and a new row is in none. Now the slice test counts births too (sliceDue: one pass,
// stopped at whichever bound is passed first — r5065), the sliced road takes the touched Set whole and each birth's place in slices of
// its own ('layout-keys') before the chunks ('layout'), and a job taken over puts its own Set FIRST (r5065: the map's order). The store's own check of
// every incremental write against a whole build (VIBESPACE_CHANNELS_INDEX_VERIFY, suites only) is on for every store here.
//   ① THE TEST: births past the bound into a small index on disk — the produce answers LATER and the births are laid out in slices
//      (one chunk a slice at sliceMs 0), the landed file the live map whole; RED the release's test (no births counted): one call
//   ② (a) THE BYTES: a birth, a change and a removal each placed by a hold BETWEEN TWO SLICES — while the slices run the file is the
//      old one byte for byte (never half); the landed file is the live map whole, in its order, the store's own check silent;
//      RED a copy that forgets what was touched during the slices
//   ③ (b) THE STOP: the close's whole write and the exit's synchronous write, met between two slices, write everything whole in
//      their own call; RED a copy whose synchronous write does not take the slices' rows back (the exit's file lacks births)
//   ④ (c) LANDED STAYS HONEST: a birth reads unlanded while its slices run and landed once the write that carries it is on disk
//   ⑤ (d) IN WORK (the meter, never a clock, in a child): the produce that decides — the same work at N and 2N births; the produce
//      that answers bytes — under a unit a born row (the layout's chunks only); RED the release's test: twice the work at 2N
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
import { BOUNDED_RATIO } from './work-meter.mjs';
process.env.VIBESPACE_CHANNELS_INDEX_VERIFY = '1';   // the store's own check (read when a store is made): every incremental write against a whole build
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const CS = require(path.join(REPO, 'src/channel-store.js'));
const M = mutantCopies('index-births', REPO);
const { ok, report } = checker();
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'index-births-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const BOUND_MS = 15000;
const waitFor = async (f, ms = BOUND_MS) => { const t0 = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) return v; await pause(5); } };
const T0 = 1_700_000_000_000, SYNC = 64, BIRTHS = 1500;   // 1 500 births: six chunks past a 10-row index, far past the bound (64)
const ixFile = (dir) => path.join(dir, 'index.json');
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const plain = (row) => JSON.stringify(row, (k, v) => (k.startsWith('_') ? undefined : v));
let sectionAt = Date.now(), sectionN = 0;
const sectionTime = () => { const t = Date.now(); if (sectionN++) console.log(`  (the section above took ${t - sectionAt} ms — printed, never judged)`); sectionAt = t; };
/** does the file on disk hold the live map, whole and in its order? */
function wholeOf(dir, live) {
  const t = readText(ixFile(dir)); let file = null; try { file = t ? JSON.parse(t).conversations || {} : null; } catch { file = null; }
  if (!file) return { whole: false, why: 'no readable index' };
  const fk = Object.keys(file), lk = Object.keys(live);
  if (fk.join('\n') !== lk.join('\n')) return { whole: false, why: `keys ${fk.length} vs ${lk.length}`, missing: lk.filter((k) => !(k in file)).slice(0, 5), extra: fk.filter((k) => !(k in live)).slice(0, 5) };
  const bad = lk.filter((k) => plain(file[k]) !== plain(live[k]));
  return bad.length ? { whole: false, why: `${bad.length} rows differ`, first: bad[0] } : { whole: true, rows: lk.length };
}
/** one store over the real writer, a small index on disk, BIRTHS born in one update (journaled), then the index's write asked.
 *  `seam` / `at`: the seam ('layout': chunks laid out so far; 'layout-keys': births' places taken so far) where `hold(o)` runs,
 *  awaited — a hold between two slices */
async function scene(mod, tag, { at = 2, hold = null, seam = 'layout' } = {}) {
  const dir = tmp(tag), warns = [], seen = { keys: 0, layout: 0, maxStep: 0, lastI: 0, placed: false, oldMid: null, landedMid: null };
  const w = SW.create({ log: { log() {}, info() {}, warn() {}, error() {} } });
  let o = null, old = null;
  const onSlice = async (i, what) => {
    if (what === 'layout-keys') seen.keys++;
    if (what === 'layout') { seen.layout++; if (i - seen.lastI > seen.maxStep) seen.maxStep = i - seen.lastI; seen.lastI = i; }
    if (what === seam && i >= at && !seen.placed && hold) { seen.placed = true; seen.oldMid = readText(ixFile(dir)) === old; seen.landedMid = o.st.index.landed('acct/b100'); await hold(o); }
  };
  const st = mod.createChannelStore({ dir, log: { log() {}, warn: (...a) => warns.push(a.join(' ')), error() {} }, writer: w, walk: { syncRows: SYNC, sliceMs: 0, onSlice } });
  o = { dir, w, st, warns, seen };
  await st.index.update(() => { for (let i = 0; i < 10; i++) { const e = st.index.entry('acct', `a${i}`); e.title = `t${i}`; e.lastAt = T0 + i; } });
  await st.index.fold();
  old = readText(ixFile(dir));
  await st.index.update(() => { for (let i = 0; i < BIRTHS; i++) { const e = st.index.entry('acct', `b${i}`); e.title = `t${i} ` + 'x'.repeat(40); e.lastAt = T0 + 100 + i; } });
  o.asked = st.index.fold().then((v) => v !== false, () => false);
  return o;
}
/** a RED copy's store is made with the store's own check OFF (production's condition): the check repairs a drift into a whole
 *  write, so with it on a red would read green — the store is made synchronously at the scene's start */
const noCheck = (f) => { const v = process.env.VIBESPACE_CHANNELS_INDEX_VERIFY; process.env.VIBESPACE_CHANNELS_INDEX_VERIFY = ''; try { return f(); } finally { process.env.VIBESPACE_CHANNELS_INDEX_VERIFY = v; } };
const settle = async (o) => { const r = await Promise.race([o.asked, pause(BOUND_MS).then(() => 'bound')]); await waitFor(() => !o.st.index.isDirty()); return r; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
const drifted = (o) => o.warns.filter((x) => /DRIFTED/.test(x));

// ═══ ① THE TEST ═══
sectionTime();
console.log('① the test: births past the bound are laid out in slices — the produce answers LATER, one chunk a slice');
const RELEASE_CHUNKS = "(layout.chunks.length * INDEX_CHUNK > LAYOUT_SYNC_ROWS && ((seen) => { for (const k of dirtyKeys) { seen.add(layout.chunkOf.get(k) || null); if (seen.size > APPLY_SYNC_CHUNKS) return true; } return false; })(new Set()))";   // the release's touchedChunksOver, inline
const RELEASE_TEST = anchored(SRC, 'warm || sliceDue()', 'warm || ' + RELEASE_CHUNKS, 'the release\'s slice test (births never counted)');
const MR = M.load('src/channel-store.js', RELEASE_TEST, 'release-slice-test');
{
  const [o, oo] = await Promise.all([scene(CS, 'test'), noCheck(() => scene(MR, 'test-red'))]);
  const [r1, r2] = await Promise.all([settle(o), settle(oo)]);
  const live = o.st.index.rows(), w1 = wholeOf(o.dir, live), w2 = wholeOf(oo.dir, oo.st.index.rows());
  ok(r1 === true && o.seen.keys > 1 && o.seen.layout >= 5 && o.seen.maxStep === 1 && w1.whole && !drifted(o).length, `births past the bound (${BIRTHS} into a 10-row index on disk, the bound ${SYNC}) are laid out in SLICES: ${o.seen.keys} slices of their places, ${o.seen.layout} of their chunks, one chunk a slice; the landed file is the live map whole (${w1.rows} rows), the store's own check silent`, JSON.stringify({ r1, seen: o.seen, w1, drift: drifted(o) }));
  ok(r2 === true && oo.seen.layout === 0 && oo.seen.keys === 0 && w2.whole, `RED: the release's slice test (births never counted) lays the same births out in ONE call — no slice at all (${oo.seen.layout} chunk slices) — the leg above would go red`, JSON.stringify({ r2, seen: oo.seen }));
  shut(o); shut(oo);
}

// ═══ ② (a) THE BYTES ═══
sectionTime();
console.log('② the bytes: a birth, a change and a removal each placed between two slices — never half, never lost');
const PLACE = {
  'birth at a key slice': (o) => o.st.index.update(() => { const e = o.st.index.entry('acct', 'born-at-keys'); e.title = 'born between two key slices'; e.lastAt = T0 + 99998; }),
  birth: (o) => o.st.index.update(() => { const e = o.st.index.entry('acct', 'born-mid'); e.title = 'born between two slices'; e.lastAt = T0 + 99999; }),
  change: (o) => o.st.index.update(() => { o.st.index.entry('acct', 'b5').title = 'changed between two slices'; }),
  removal: (o) => o.st.index.update(() => { o.st.index.touch('acct/b7'); delete o.st.index.rows()['acct/b7']; }),
};
const MF = M.load('src/channel-store.js', anchored(SRC, '      flushStats.incremental++; flushStats.applySliced++;\n', '      flushStats.incremental++; flushStats.applySliced++; dirtyKeys.clear();   // CONTROL: what was touched during the slices forgotten\n', 'forget the slices\' touches'), 'forgets-touched-during');
{
  const runs = await Promise.all(Object.entries(PLACE).flatMap(([what, hold]) => [scene(CS, `bytes-${what}`, { hold, ...(/key/.test(what) ? { seam: 'layout-keys', at: 64 } : {}) }).then((o) => ({ what, o, red: false })), noCheck(() => scene(MF, `bytes-${what}-red`, { hold, ...(/key/.test(what) ? { seam: 'layout-keys', at: 64 } : {}) })).then((o) => ({ what, o, red: true }))]));
  await Promise.all(runs.map((x) => settle(x.o)));
  const facts = runs.map(({ what, o, red }) => ({ what, red, placed: o.seen.placed, oldMid: o.seen.oldMid, whole: wholeOf(o.dir, o.st.index.rows()), drift: drifted(o).length, mid: what === 'birth at a key slice' ? 'acct/born-at-keys' in (JSON.parse(readText(ixFile(o.dir))).conversations || {}) : what === 'birth' ? 'acct/born-mid' in (JSON.parse(readText(ixFile(o.dir))).conversations || {}) : what === 'change' ? /changed between/.test(readText(ixFile(o.dir))) : !('acct/b7' in (JSON.parse(readText(ixFile(o.dir))).conversations || {})) }));
  for (const f of facts.filter((x) => !x.red)) ok(f.placed && f.oldMid === true && f.whole.whole && f.mid && !f.drift, `a ${f.what.toUpperCase()} placed between two slices: while they ran the file on disk was the old one byte for byte (never half); the landed file holds it and is the live map whole (${f.whole.rows} rows, in order), the store's own check silent`, JSON.stringify(f));
  const reds = facts.filter((x) => x.red);
  ok(reds.every((f) => f.placed) && reds.some((f) => !f.mid || !f.whole.whole), `RED: a copy that forgets what was touched during the slices loses it (${reds.filter((f) => !f.mid || !f.whole.whole).map((f) => f.what).join(', ')} not on disk as the live map holds it) — the legs above would go red`, JSON.stringify(reds));
  for (const x of runs) shut(x.o);
}

// ②b (the round wf_a59eab00's should): a birth NOT placed yet, removed and born again between two KEY slices — the map now holds it
// LAST; entry()'s guard knows the job's Set too, so the layout starts again (a whole touch) and the file keeps the map's order
{
  const MG = M.load('src/channel-store.js', anchored(SRC, '(layout.chunkOf.has(key) || (warm && warm.keys && warm.keys.has(key)))', 'layout.chunkOf.has(key)', 'a guard that knows the chunks only'), 'guard-chunks-only');
  const reborn = (o) => o.st.index.update(() => { o.st.index.touch('acct/b900'); delete o.st.index.rows()['acct/b900']; }).then(() => o.st.index.update(() => { const e = o.st.index.entry('acct', 'b900'); e.title = 'born again'; e.lastAt = T0 + 99997; }));
  const [o, oo] = await Promise.all([scene(CS, 'reborn', { hold: reborn, seam: 'layout-keys', at: 64 }), noCheck(() => scene(MG, 'reborn-red', { hold: reborn, seam: 'layout-keys', at: 64 }))]);
  await Promise.all([settle(o), settle(oo)]);
  const w1 = wholeOf(o.dir, o.st.index.rows()), w2 = wholeOf(oo.dir, oo.st.index.rows());
  const lastOf = (x) => { const k = Object.keys(x.st.index.rows()); return k[k.length - 1]; };
  ok(o.seen.placed && lastOf(o) === 'acct/b900' && w1.whole && !drifted(o).length, `a birth not placed yet, REMOVED AND BORN AGAIN between two key slices (now LAST in the map): the landed file is the live map whole, in its order (${w1.rows} rows), the store's own check silent`, JSON.stringify({ seen: o.seen, w1, drift: drifted(o) }));
  ok(oo.seen.placed && !w2.whole, `RED: a guard that knows the chunks only lets the job place it at its OLD place — the file is not the map in its order (${w2.why}) — the leg above would go red`, JSON.stringify(w2));
  shut(o); shut(oo);
}

// ═══ ③ (b) THE STOP ═══
sectionTime();
console.log('③ the stop: the close\'s and the exit\'s synchronous writes, met between two slices, write everything whole in their own call');
const MT = M.load('src/channel-store.js', anchored(SRC, 'if (sync && warm) { if (warm.keys) takeBack(warm.keys); warm.stale = true; warm = null; }', 'if (sync && warm) { warm.stale = true; warm = null; }', 'a synchronous write that does not take the slices\' rows back'), 'sync-keeps-not');
{
  const ROADS = {
    close: (o) => { o.liveAtStop = { ...o.st.index.rows() }; o.st.close(); o.closed = true; },
    exit: (o) => { o.liveAtStop = { ...o.st.index.rows() }; o.w.exitFlush(); },
  };
  // r5065 (1): THE ORDER AT A TAKE-OVER — a birth made between two KEY slices, then the exit: the job's own Set goes back FIRST, so the
  // births not placed yet keep their place before it; RED the unit's first form (the job's keys appended after the later birth)
  const MO = M.load('src/channel-store.js', anchored(SRC, 'function takeBack(keys) { const later = dirtyKeys; dirtyKeys = keys; for (const k of later) dirtyKeys.add(k); }', 'function takeBack(keys) { for (const k of keys) dirtyKeys.add(k); }', 'the job\'s keys appended after the later touches'), 'takeback-appends');
  const atKeys = (o) => o.st.index.update(() => { const e = o.st.index.entry('acct', 'born-before-exit'); e.title = 'born between two key slices, then the exit'; e.lastAt = T0 + 99996; }).then(() => { o.liveAtStop = { ...o.st.index.rows() }; o.w.exitFlush(); });
  const ordered = await Promise.all([scene(CS, 'stop-order', { hold: atKeys, seam: 'layout-keys', at: 64 }), noCheck(() => scene(MO, 'stop-order-red', { hold: atKeys, seam: 'layout-keys', at: 64 })), scene(MO, 'stop-order-red-checked', { hold: atKeys, seam: 'layout-keys', at: 64 })]);   // the third: the first form WITH the store's check on (r5111)
  await waitFor(() => ordered.every((o) => o.seen.placed && o.liveAtStop));
  const wo = wholeOf(ordered[0].dir, ordered[0].liveAtStop || {}), wr = wholeOf(ordered[1].dir, ordered[1].liveAtStop || {});
  ok(ordered[0].seen.placed && wo.whole && !drifted(ordered[0]).length, `THE ORDER AT A TAKE-OVER (r5065): a birth made between two KEY slices, then the exit — the exit's file is the live map whole IN ITS ORDER (${wo.rows} rows): the job's own Set went back first, and the store's own check SILENT (it would have repaired a drift into a whole write: r5111)`, JSON.stringify({ wo, drift: drifted(ordered[0]) }));
  ok(ordered[1].seen.placed && !wr.whole, `RED: the unit's first form (the job's keys appended after the later birth) writes the births not placed yet BEHIND it — not the map in its order (${wr.why}) — the leg above would go red`, JSON.stringify(wr));
  const rc = ordered[2], wc = wholeOf(rc.dir, rc.liveAtStop || {});
  ok(rc.seen.placed && !(wc.whole && !drifted(rc).length), `RED WITH THE STORE's CHECK ON (r5111): the first form in a copy run as the green leg runs — the check repairs the file (${wc.whole ? 'whole' : wc.why}) but says the drift (${drifted(rc).length} warning(s)): the leg above, which now reads the check too, would go red`, JSON.stringify({ wc, drift: drifted(rc).map((x) => x.slice(0, 160)) }));
  for (const o of ordered) { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } }
  const runs = await Promise.all(Object.entries(ROADS).flatMap(([road, hold]) => [scene(CS, `stop-${road}`, { hold }).then((o) => ({ road, o, red: false })), noCheck(() => scene(MT, `stop-${road}-red`, { hold })).then((o) => ({ road, o, red: true }))]));
  await waitFor(() => runs.every((x) => x.o.seen.placed));
  const facts = runs.map(({ road, o, red }) => ({ road, red, placed: o.seen.placed, whole: wholeOf(o.dir, o.liveAtStop || {}), drift: drifted(o).map((x) => x.slice(0, 160)) }));
  for (const f of facts.filter((x) => !x.red)) ok(f.placed && f.whole.whole && !f.drift.length, `the ${f.road.toUpperCase()}'s synchronous write between two slices writes EVERYTHING whole in its own call (${f.whole.rows} rows: the births laid out or not yet), never a half layout, never waiting on the slices, the store's own check silent`, JSON.stringify(f));
  const redExit = facts.find((x) => x.red && x.road === 'exit');
  ok(redExit && redExit.placed && !redExit.whole.whole, `RED: a synchronous write that does not take the slices' rows back writes the exit's file without the births not yet laid out (${redExit && redExit.whole.why}) — the exit leg above would go red (the close's road cannot go red here: its write lays the map out whole whatever the job holds)`, JSON.stringify(redExit));
  for (const x of runs) { if (!x.o.closed) { try { x.o.st.close(); } catch { } } try { x.o.w.stop(); } catch { } }
}

// ═══ ④ (c) LANDED STAYS HONEST ═══
sectionTime();
console.log('④ landed stays honest: a birth is unlanded while its slices run, landed once its write is on disk');
{
  const o = await scene(CS, 'landed', { hold: async () => { } });
  const r = await settle(o);
  const after = o.st.index.landed('acct/b100');
  ok(o.seen.placed && o.seen.landedMid === false && r === true && after === true, `a birth reads UNLANDED while the slices run (${o.seen.landedMid}) and LANDED once the write that carries it is on disk (${after}) — slicing makes it later, never earlier`, JSON.stringify({ seen: o.seen, r, after }));
  shut(o);
}

// ═══ ⑤ (d) IN WORK: the meter, in a child (it starts before the store is loaded) ═══
sectionTime();
console.log('⑤ in work: the produce that decides, and the one that answers bytes, at N and 2N births');
{
  const FIX = path.join(REPO, 'scripts/fixtures/channel-index-births-work.mjs');
  const child = (mod, tag, mode = 'births', n = '3000') => new Promise((res) => { const env = { ...process.env }; delete env.VIBESPACE_CHANNELS_INDEX_VERIFY;   // the child runs as production does: the store's own check (a whole stringify a write) would be the meter's reading
    const p = spawn(process.execPath, [FIX, mod, path.join(ROOT, tag), n, mode], { stdio: ['ignore', 'pipe', 'pipe'], env }); let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; }); const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } }, 120000); p.on('close', (code) => { clearTimeout(t); try { res(JSON.parse(out.trim().split('\n').pop())); } catch { res({ err: `the child: exit ${code} ${err.slice(-300)}` }); } }); });
  const relPath = M.write('src/channel-store.js', RELEASE_TEST, 'release-slice-test-work');
  // r5065 (2): the unit's first form — the births counted FIRST, walking every touched row before the chunk test could stop
  const BORN_FIRST = "((n) => { for (const k of dirtyKeys) { if (!layout.chunkOf.has(k) && hasOwn(ix.conversations, k) && ++n > LAYOUT_SYNC_ROWS) return true; } return false; })(0)";
  const bornFirstPath = M.write('src/channel-store.js', anchored(SRC, 'warm || sliceDue()', 'warm || ' + BORN_FIRST + ' || ' + RELEASE_CHUNKS, 'the births counted first'), 'born-first-work');
  // the round's should (H6): the release's COPY of the touched Set in the caller's turn, put back
  const copyPath = M.write('src/channel-store.js', anchored(anchored(SRC, 'const job = { stale: false, promise: null, keys: dirtyKeys };', 'const job = { stale: false, promise: null, keys: [...dirtyKeys] };', 'the Set copied (the release\'s own form)'), '    dirtyKeys = new Set(); warm = job; laterJobs++;\n', '    dirtyKeys.clear(); warm = job; laterJobs++;\n', 'the old Set cleared'), 'set-copied-work');
  const SRCP = path.join(REPO, 'src/channel-store.js');
  const [cur, rel, curT, bornT, copied] = await Promise.all([child(SRCP, 'work'), child(relPath, 'work-release'), child(SRCP, 'work-touched', 'touched', '750'), child(bornFirstPath, 'work-touched-born-first', 'touched', '750'), child(copyPath, 'work-copied', 'births', '1500')]);
  const perRow = (x) => (x && x.f1 > 0 && x.f2 > 0 ? (x.f2 - x.f1) / 3000 : null);
  ok(cur.later1 === true && cur.later2 === true && cur.d1 > 0 && cur.d2 / cur.d1 <= BOUNDED_RATIO, `THE PRODUCE THAT DECIDES answers LATER at 3 000 and 6 000 births and does the same work (${cur.d1} / ${cur.d2}, ≤ ×${BOUNDED_RATIO}) — the births go to the slices`, JSON.stringify(cur));
  ok(perRow(cur) !== null && perRow(cur) < 1, `THE PRODUCE THAT ANSWERS BYTES grows by the layout's chunks only — under one unit a born row (${perRow(cur) && perRow(cur).toFixed(3)}: ${cur.f1} / ${cur.f2})`, JSON.stringify(cur));
  ok(curT.later1 === true && curT.later2 === true && curT.d1 > 0 && curT.d2 / curT.d1 <= BOUNDED_RATIO, `r5065 (2) A MASS TOUCH, NO BIRTHS (750 and 1 500 existing rows of a laid-out 12 000, 32 a chunk): the produce that decides stops at the chunks' bound — the same work (${curT.d1} / ${curT.d2}, ≤ ×${BOUNDED_RATIO})`, JSON.stringify(curT));
  ok(bornT.d1 > 0 && bornT.d2 / bornT.d1 > BOUNDED_RATIO, `RED: the unit's first form (the births counted first) walks every touched row before the chunk test — ×${bornT.d1 ? (bornT.d2 / bornT.d1).toFixed(2) : '?'} the work for twice the touches (${bornT.d1} / ${bornT.d2})`, JSON.stringify(bornT));
  ok(copied.d1 > 0 && copied.d2 / copied.d1 > BOUNDED_RATIO, `RED (the round's should): the release's COPY of the touched Set put back in the caller's turn — ×${copied.d1 ? (copied.d2 / copied.d1).toFixed(2) : '?'} the work for twice the births (${copied.d1} / ${copied.d2})`, JSON.stringify(copied));
  ok(rel.d1 > 0 && rel.later1 === false && rel.d2 / rel.d1 > BOUNDED_RATIO, `RED: the release's slice test lays the births out in the produce that decides — ×${rel.d1 ? (rel.d2 / rel.d1).toFixed(2) : '?'} the work for twice the births (${rel.d1} / ${rel.d2})`, JSON.stringify(rel));
}
sectionTime();
report();
