#!/usr/bin/env node
// B-360d FOUND HOLDER 4 (lane bl-loop-b, 主开发 r4997): THE INDEX's WRITE AFTER BIRTHS lays them out in slices, never in one turn.
// The probe (r4987, never lined: the stand-in's 198 043 rows born in pages of 500, each in its own turn) placed it: every whole write
// laid out EVERY new row since the last in one call (296 / 679 / 1 344 ms at 28 000 / 55 000 / 115 043 births) — the produce's sliced
// road counted only the layout's touched chunks, and a new row is in none. Now the slice test counts births too (bornOver), and the
// sliced road takes each birth's place in slices of its own ('layout-keys') before the chunks ('layout'). The store's own check of
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
 *  `at`: the 'layout' seam (chunks laid out so far) where `hold(o)` runs, awaited — a hold between two slices */
async function scene(mod, tag, { at = 2, hold = null } = {}) {
  const dir = tmp(tag), warns = [], seen = { keys: 0, layout: 0, maxStep: 0, lastI: 0, placed: false, oldMid: null, landedMid: null };
  const w = SW.create({ log: { log() {}, info() {}, warn() {}, error() {} } });
  let o = null, old = null;
  const onSlice = async (i, what) => {
    if (what === 'layout-keys') seen.keys++;
    if (what !== 'layout') return;
    seen.layout++; if (i - seen.lastI > seen.maxStep) seen.maxStep = i - seen.lastI; seen.lastI = i;
    if (i === at && !seen.placed && hold) { seen.placed = true; seen.oldMid = readText(ixFile(dir)) === old; seen.landedMid = o.st.index.landed('acct/b100'); await hold(o); }
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
const RELEASE_TEST = anchored(SRC, 'warm || bornOver(LAYOUT_SYNC_ROWS) || (layout.chunks.length', 'warm || (layout.chunks.length', 'the release\'s slice test (births never counted)');
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
  birth: (o) => o.st.index.update(() => { const e = o.st.index.entry('acct', 'born-mid'); e.title = 'born between two slices'; e.lastAt = T0 + 99999; }),
  change: (o) => o.st.index.update(() => { o.st.index.entry('acct', 'b5').title = 'changed between two slices'; }),
  removal: (o) => o.st.index.update(() => { o.st.index.touch('acct/b7'); delete o.st.index.rows()['acct/b7']; }),
};
const MF = M.load('src/channel-store.js', anchored(SRC, '      flushStats.incremental++; flushStats.applySliced++;\n', '      flushStats.incremental++; flushStats.applySliced++; dirtyKeys.clear();   // CONTROL: what was touched during the slices forgotten\n', 'forget the slices\' touches'), 'forgets-touched-during');
{
  const runs = await Promise.all(Object.entries(PLACE).flatMap(([what, hold]) => [scene(CS, `bytes-${what}`, { hold }).then((o) => ({ what, o, red: false })), noCheck(() => scene(MF, `bytes-${what}-red`, { hold })).then((o) => ({ what, o, red: true }))]));
  await Promise.all(runs.map((x) => settle(x.o)));
  const facts = runs.map(({ what, o, red }) => ({ what, red, placed: o.seen.placed, oldMid: o.seen.oldMid, whole: wholeOf(o.dir, o.st.index.rows()), drift: drifted(o).length, mid: what === 'birth' ? 'acct/born-mid' in (JSON.parse(readText(ixFile(o.dir))).conversations || {}) : what === 'change' ? /changed between/.test(readText(ixFile(o.dir))) : !('acct/b7' in (JSON.parse(readText(ixFile(o.dir))).conversations || {})) }));
  for (const f of facts.filter((x) => !x.red)) ok(f.placed && f.oldMid === true && f.whole.whole && f.mid && !f.drift, `a ${f.what.toUpperCase()} placed between two slices: while they ran the file on disk was the old one byte for byte (never half); the landed file holds it and is the live map whole (${f.whole.rows} rows, in order), the store's own check silent`, JSON.stringify(f));
  const reds = facts.filter((x) => x.red);
  ok(reds.every((f) => f.placed) && reds.some((f) => !f.mid || !f.whole.whole), `RED: a copy that forgets what was touched during the slices loses it (${reds.filter((f) => !f.mid || !f.whole.whole).map((f) => f.what).join(', ')} not on disk as the live map holds it) — the legs above would go red`, JSON.stringify(reds));
  for (const x of runs) shut(x.o);
}

// ═══ ③ (b) THE STOP ═══
sectionTime();
console.log('③ the stop: the close\'s and the exit\'s synchronous writes, met between two slices, write everything whole in their own call');
const MT = M.load('src/channel-store.js', anchored(SRC, 'if (sync && warm) { if (warm.keys) for (const k of warm.keys) dirtyKeys.add(k); warm.stale = true; warm = null; }', 'if (sync && warm) { warm.stale = true; warm = null; }', 'a synchronous write that does not take the slices\' rows back'), 'sync-keeps-not');
{
  const ROADS = {
    close: (o) => { o.liveAtStop = { ...o.st.index.rows() }; o.st.close(); o.closed = true; },
    exit: (o) => { o.liveAtStop = { ...o.st.index.rows() }; o.w.exitFlush(); },
  };
  const runs = await Promise.all(Object.entries(ROADS).flatMap(([road, hold]) => [scene(CS, `stop-${road}`, { hold }).then((o) => ({ road, o, red: false })), noCheck(() => scene(MT, `stop-${road}-red`, { hold })).then((o) => ({ road, o, red: true }))]));
  await waitFor(() => runs.every((x) => x.o.seen.placed));
  const facts = runs.map(({ road, o, red }) => ({ road, red, placed: o.seen.placed, whole: wholeOf(o.dir, o.liveAtStop || {}) }));
  for (const f of facts.filter((x) => !x.red)) ok(f.placed && f.whole.whole, `the ${f.road.toUpperCase()}'s synchronous write between two slices writes EVERYTHING whole in its own call (${f.whole.rows} rows: the births laid out or not yet), never a half layout, never waiting on the slices`, JSON.stringify(f));
  const redExit = facts.find((x) => x.red && x.road === 'exit');
  ok(redExit && redExit.placed && !redExit.whole.whole, `RED: a synchronous write that does not take the slices' rows back writes the exit's file without the births not yet laid out (${redExit && redExit.whole.why}) — the exit leg above would go red`, JSON.stringify(redExit));
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
  const child = (mod, tag) => new Promise((res) => { const env = { ...process.env }; delete env.VIBESPACE_CHANNELS_INDEX_VERIFY;   // the child runs as production does: the store's own check (a whole stringify a write) would be the meter's reading
    const p = spawn(process.execPath, [FIX, mod, path.join(ROOT, tag), '3000'], { stdio: ['ignore', 'pipe', 'pipe'], env }); let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; }); const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } }, 120000); p.on('close', (code) => { clearTimeout(t); try { res(JSON.parse(out.trim().split('\n').pop())); } catch { res({ err: `the child: exit ${code} ${err.slice(-300)}` }); } }); });
  const relPath = M.write('src/channel-store.js', RELEASE_TEST, 'release-slice-test-work');
  const [cur, rel] = await Promise.all([child(path.join(REPO, 'src/channel-store.js'), 'work'), child(relPath, 'work-release')]);
  const perRow = (x) => (x && x.f1 > 0 && x.f2 > 0 ? (x.f2 - x.f1) / 3000 : null);
  ok(cur.later1 === true && cur.later2 === true && cur.d1 > 0 && cur.d2 / cur.d1 <= BOUNDED_RATIO, `THE PRODUCE THAT DECIDES answers LATER at 3 000 and 6 000 births and does the same work (${cur.d1} / ${cur.d2}, ≤ ×${BOUNDED_RATIO}) — the births go to the slices`, JSON.stringify(cur));
  ok(perRow(cur) !== null && perRow(cur) < 1, `THE PRODUCE THAT ANSWERS BYTES grows by the layout's chunks only — under one unit a born row (${perRow(cur) && perRow(cur).toFixed(3)}: ${cur.f1} / ${cur.f2})`, JSON.stringify(cur));
  ok(rel.d1 > 0 && rel.later1 === false && rel.d2 / rel.d1 > BOUNDED_RATIO, `RED: the release's slice test lays the births out in the produce that decides — ×${rel.d1 ? (rel.d2 / rel.d1).toFixed(2) : '?'} the work for twice the births (${rel.d1} / ${rel.d2})`, JSON.stringify(rel));
}
sectionTime();
report();
