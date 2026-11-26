#!/usr/bin/env node
// B-360d FOUND HOLDER 1 (lane bl-loop-b, 主开发 r4582 / r4598 / r4690): THE INDEX's WRITE AFTER A FILL holds no turn over every row.
// The probe (414b9c2a3, never lined: 198 043 rows born at once, then the index's write) placed four pieces, each a pass over every
// row in one turn: the writer's join of the whole index after the produce returned (about 160 ms on the kit), the produce's copy of
// the born set (80 ms), the landing's walk of it (41 ms), two Object.keys of the map while the layout was void (109 / 55 ms). Now:
//   ① HOLD 1, BY REFERENCE ONLY WHERE NOTHING WRITES INTO A PART: a census of the store's text (one place makes a part's buffer and
//      it REPLACES, never writes into; no Buffer-writing call on a part), RED its planted writer; the produce answers by reference;
//      a write in pieces with births and touches placed between its pieces lands the bytes as handed (the writer's own sums), RED a
//      copy that writes into the old buffer
//   ② HOLD 2, WHOLE OR OLD: a refused landing (placed) leaves the old index readable, the next writes every row once; a stop placed
//      while the write is in flight leaves the old index; at three sizes with a birth placed in every gap the landed rows are the produce's
//   ③ HOLD 3, THE BIRTH GENERATION: a birth during a landing in flight is in the next produce, RED a landing that marks to the newest
//      birth; a failed landing merges nothing and the next lands each row once, RED a landing that marks on a failure; a row gone
//      meanwhile is harmless and counted; the sweep drops what a landing covered (counted)
//   ④ 主开发 r4690: a store made again from disk after a failed and after a successful landing reads the rows the release would
//      (the release's own replay, scripts/fixtures/release-index-replay.cjs)
//   ⑤ PIECE FOUR: one snapshot of the map for the size test and the build (the release took two), counted, RED the second put back
//   ⑥ IN WORK (the meter, never a clock, in a child): the landing's work the same at N and 2N rows, RED the release's walk; the produce's
//      work grows by the layout's chunks only (under a unit a row), RED the release's copy of the born set
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
import { BOUNDED_RATIO } from './work-meter.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const CS = require(path.join(REPO, 'src/channel-store.js'));
const { releaseLoad } = require(path.join(REPO, 'scripts/fixtures/release-index-replay.cjs'));
const M = mutantCopies('index-burst', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'index-burst-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const turn = () => new Promise((r) => setImmediate(r));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const BOUND_MS = 15000;
const waitFor = async (f, ms = BOUND_MS) => { const t0 = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) return v; await pause(5); } };
const T0 = 1_700_000_000_000;
let sectionAt = Date.now(), sectionN = 0;
const sectionTime = () => { const t = Date.now(); if (sectionN++) console.log(`  (the section above took ${t - sectionAt} ms — printed, never judged)`); sectionAt = t; };
const ixFile = (dir) => path.join(dir, 'index.json'), actsFile = (dir) => path.join(dir, 'index-acts.ndjson');
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const fill = (st, from, to, title = 40) => st.index.update(() => { for (let i = from; i < to; i++) { const e = st.index.entry('acct', `c${i}`); e.title = `t${i} ` + 'x'.repeat(title); e.lastAt = T0 + i; } });
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
const ixStat = (w) => w.stats().find((s) => /index\.json$/.test(String(s.file))) || { writes: 0, failures: 0 };
// a stand-in writer thread (the tree's pattern, scripts/fixtures/store-stand-writer.cjs): the REAL writeJob, an index write HELD while
// <dir>/stallix exists (a placed hold, its own bound) and REFUSED while <dir>/failix exists (EIO); a write under one piece only
const STAND = path.join(ROOT, 'stand.cjs');
fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const path = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4));
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const ix = m.ev === 'write' && /index\\.json$/.test(m.file), dirOf = path.dirname(m.file);
  if (ix) { const t1 = Date.now(); while (fs.existsSync(path.join(dirOf, 'stallix')) && Date.now() - t1 < ${BOUND_MS}) Atomics.wait(Z, 0, 0, 5); if (fs.existsSync(path.join(dirOf, 'stallix-then'))) { try { fs.renameSync(path.join(dirOf, 'stallix-then'), path.join(dirOf, 'stallix')); } catch { } } }   // a CHAINED hold: «stallix-then» holds the NEXT index write
  if (ix && fs.existsSync(path.join(dirOf, 'failix'))) err = { code: 'EIO', message: 'the storage refused (a placed refusal)' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } }
  else { try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; try { fs.unlinkSync(m.tmp); } catch { } } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (err && S.byteLength >= 48) { const c = Buffer.from(String(err.code || 'EWRITE').slice(0, 32), 'latin1'); new Uint8Array(S.buffer, 16, 32).set(c); Atomics.store(S, 3, c.length); } else Atomics.store(S, 3, 0);
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 1);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
const open = (mod, dir, { stand = false, verify = false, walk = null } = {}) => {
  const w = SW.create({ log: quiet, ...(stand ? { workerPath: STAND } : {}), ...(verify ? { verifyByRef: true } : {}) });
  return { w, dir, st: mod.createChannelStore({ dir, log: quiet, writer: w, ...(walk ? { walk } : {}) }) };
};
// the index's produce, watched where the writer calls it (nothing else of the writer changes): did it answer by reference, and when
const watchProduce = (w) => {
  const seen = { produced: 0, byRef: null }, d0 = w.dirty;
  w.dirty = (file, o) => {
    if (o && typeof o.produce === 'function' && /index\.json$/.test(String(file))) {
      const p0 = o.produce;
      o = { ...o, produce: (...a) => { const r = p0(...a); if (r && typeof r === 'object') { seen.produced++; seen.byRef = !Array.isArray(r) && !Buffer.isBuffer(r) && !!r[Symbol.for('vibespace.store-writer.byRef')]; } return r; } };
    }
    return d0(file, o);
  };
  return seen;
};
const rowsOfFile = (dir) => { const t = readText(ixFile(dir)); try { return t ? JSON.parse(t).conversations || {} : null; } catch { return null; } };

// ═══ ① HOLD 1: BY REFERENCE ONLY WHERE NOTHING WRITES INTO A PART ═══
sectionTime();
console.log('① by reference: one place makes a part, it replaces and never writes into; the bytes land as handed');
const WRITES_INTO = /(\.buf|\bold|\bparts\[[^\]]*\])\.(write\w*|fill|copy|set|swap16|swap32|swap64)\(/g;
const partCensus = (text) => ({ assigns: (text.match(/\.buf\s*=(?!=)/g) || []).length, made: (text.match(/\.buf\s*=\s*Buffer\.from\(/g) || []).length, writes: (text.match(WRITES_INTO) || []).length });
const PLANT_AT = "        full.forEach((c, i) => { if (i) parts.push(Buffer.from(',\\n')); parts.push(c.buf); });";
const PLANTED = "        full.forEach((c, i) => { if (i) parts.push(Buffer.from(',\\n')); parts.push(c.buf); if (i === full.length - 1) setImmediate(() => { if (c.buf) c.buf.fill(c.buf[0] ^ 1, 0, 1); }); });";
{
  const c = partCensus(SRC);
  ok(c.assigns === 1 && c.made === 1 && c.writes === 0, `HOLD 1 BY CONSTRUCTION: the store's text makes a part's buffer in ONE place (serializeChunk), and it REPLACES it (= Buffer.from); no Buffer-writing call on a part, a chunk's old buffer or a list of parts (assemble() makes the top and the separators fresh each write)`, c);
  const planted = partCensus(anchored(SRC, PLANT_AT, PLANTED, 'a part written into'));
  ok(planted.writes === 1, 'RED (the census): a planted write into a handed part (the last chunk, one turn after its handoff) is counted — the census sees a writer', planted);
}
async function piecesLeg(mod, tag, rows, title) {
  const dir = tmp(tag), o = open(mod, dir, { verify: true }), seen = watchProduce(o.w);
  await fill(o.st, 0, rows, title);
  const before = new Set(Object.keys(o.st.index.live()));
  let births = 0, running = true;
  const fold = o.st.index.fold();
  const placing = (async () => { await waitFor(() => seen.produced > 0); while (running && births < 12) { await turn(); if (!running) break; await o.st.index.update(() => { const e = o.st.index.entry('acct', `late${births}`); e.title = 'late'; e.lastAt = T0 - 1; o.st.index.entry('acct', 'c1').title = `touched ${births}`; births++; }); } })();
  const landed = await fold.then((v) => v !== false, () => false);
  running = false; await placing;
  const file = rowsOfFile(dir), keys = file ? Object.keys(file) : [];
  const r = { landed, failures: ixStat(o.w).failures, births, byRef: seen.byRef, rows: keys.length, want: before.size, same: keys.length === before.size && keys.every((k) => before.has(k)), c1: file && file['acct/c1'] ? file['acct/c1'].title.slice(0, 12) : null, bytes: (readText(ixFile(dir)) || '').length };
  shut(o);
  return r;
}
{
  const r = await piecesLeg(CS, 'pieces', 2000, 4000);
  ok(r.byRef === true && r.bytes > 2 * SW.PIECE_BYTES, `the produce answers BY REFERENCE (the writer's own road) for an index of ${r.bytes} bytes (${Math.ceil(r.bytes / SW.PIECE_BYTES)} pieces of ${SW.PIECE_BYTES})`, r);
  ok(r.landed && r.failures === 0 && r.births >= 2 && r.same && r.c1 === 't1 xxxxxxxxx', `HOLD 1, THE LEG: a write in pieces with ${r.births} births and touches PLACED between its pieces lands the bytes AS HANDED — the writer's own sums held (verifyByRef), the file holds exactly the produce's ${r.want} rows (none of the births after it; the touched row as it was produced)`, r);
  const MW = M.load('src/channel-store.js', anchored(SRC, PLANT_AT, PLANTED, 'a part written into after its handoff'), 'part-written-into');
  const rr = await piecesLeg(MW, 'pieces-red', 1100, 4000);
  ok(!rr.landed || rr.failures > 0, 'RED: a copy that writes into its last chunk\'s handed buffer one turn after the handoff — the part changed before its piece was copied, and the write FAILS by name (the sums) — the leg above would go red', rr);
}

// ═══ ② HOLD 2: THE WRITTEN INDEX IS WHOLE OR OLD ═══
sectionTime();
console.log('② whole or old: a refused landing, a stop in flight, three sizes with a birth in every gap');
{
  const dir = tmp('refused'), o = open(CS, dir, { stand: true });
  await fill(o.st, 0, 200);
  const first = await o.st.index.fold().then(() => true, () => false);
  const old = readText(ixFile(dir));
  await fill(o.st, 200, 260);
  fs.writeFileSync(path.join(dir, 'failix'), '1');
  const refused = await o.st.index.fold().then((v) => v !== false, () => false);
  const afterRefusal = readText(ixFile(dir));
  fs.unlinkSync(path.join(dir, 'failix'));
  const next = await o.st.index.fold().then((v) => v !== false, () => false);
  const file = rowsOfFile(dir), live = Object.keys(o.st.index.live());
  ok(first && !refused && afterRefusal === old && next && file && Object.keys(file).length === live.length && live.every((k) => file[k]), `a REFUSED landing (placed: the storage refuses) leaves the OLD index on disk byte for byte (${old ? old.length : 0} bytes), and the next landing writes every row once (${file ? Object.keys(file).length : 0} = the map's ${live.length})`, { first, refused, same: afterRefusal === old, next });
  // r4690's leg, after the failed and after the successful landing: the store made again reads the rows the release would
  shut(o);
  const again = open(CS, dir, { stand: true });
  const mine = Object.keys(again.st.index.live()).sort();
  shut(again);
  const rel = releaseLoad(readText(ixFile(dir)), readText(actsFile(dir)));
  const relKeys = Object.keys((rel && (rel.ix || rel).conversations) || {}).sort();
  ok(mine.length === 260 && mine.join() === relKeys.join(), `④ (主开发 r4690) the store made again from disk after a refused and a landed write reads the ${mine.length} rows the RELEASE's own replay reads (${relKeys.length})`, { mine: mine.length, release: relKeys.length });
}
{
  const dir = tmp('stopped'), o = open(CS, dir, { stand: true });
  await fill(o.st, 0, 150);
  await o.st.index.fold().catch(() => false);
  const old = readText(ixFile(dir));
  await fill(o.st, 150, 220);
  fs.writeFileSync(path.join(dir, 'stallix'), '1');
  const fold = o.st.index.fold().catch(() => false);
  const inFlight = await waitFor(() => ixStat(o.w).inflight);
  o.w.stop();   // THE STOP, placed while the index's write is in flight (held in its thread): the writer's threads killed, as a hub that dies
  const after = readText(ixFile(dir));
  fs.unlinkSync(path.join(dir, 'stallix'));
  void fold.catch(() => false);   // (that store is left as the kill left it: a close would flush through threads that are gone)
  const again = open(CS, dir, { stand: true });
  const mine = Object.keys(again.st.index.live()).sort();
  shut(again);
  const rel = releaseLoad(after, readText(actsFile(dir)));
  const relKeys = Object.keys((rel && (rel.ix || rel).conversations) || {}).sort();
  ok(!!inFlight && after === old && mine.join() === relKeys.join(), `a STOP (the writer's threads killed, as a hub that dies) placed while the index's write is in flight leaves the OLD index readable byte for byte; made again from disk the store reads the rows the release's replay reads (${mine.length} / ${relKeys.length})`, { inFlight: !!inFlight, same: after === old, mine: mine.length, release: relKeys.length });
}
for (const [rows, label] of [[300, 'under one piece'], [1100, 'two pieces']]) {   // the third size: ①'s leg (three pieces)
  const r = await piecesLeg(CS, `size-${rows}`, rows, 4000);
  ok(r.landed && r.failures === 0 && r.same, `at ${label} (${r.bytes} bytes, ${r.births} births placed one a gap) the landed index holds exactly the produce's ${r.want} rows — the parity the store's own check gives only in the suites (VIBESPACE_CHANNELS_INDEX_VERIFY is never set in production)`, r);
}

// ═══ ③ HOLD 3: THE BIRTH GENERATION ═══
sectionTime();
console.log('③ the birth generation: a birth in flight, a failed landing, a row gone, the sweep');
async function inFlightLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { stand: true });
  await fill(o.st, 0, 100);
  await o.st.index.fold().catch(() => false);
  await o.st.index.update(() => { o.st.index.entry('acct', 'carried').title = 'carried'; o.st.index.entry('acct', 'gone').title = 'gone'; });
  fs.writeFileSync(path.join(dir, 'stallix'), '1');
  const fold = o.st.index.fold().then((v) => v !== false, () => false);
  await waitFor(() => ixStat(o.w).inflight);
  await o.st.index.update((x) => { o.st.index.entry('acct', 'late').title = 'late'; delete x.conversations['acct/gone']; });   // a birth and a removal while the landing is in flight
  fs.unlinkSync(path.join(dir, 'stallix'));
  const landedOk = await fold;
  const r = { landedOk, carried: o.st.index.landed('acct/carried'), late: o.st.index.landed('acct/late'), gone: o.st.index.landed('acct/gone') };
  await o.st.index.fold().catch(() => false);
  r.lateAfter = o.st.index.landed('acct/late');
  await waitFor(() => { const s = o.st.index.landedStats(); return s && !s.sweeping && s.entries === 0; });
  r.stats = o.st.index.landedStats();
  shut(o);
  return r;
}
{
  const MN = M.load('src/channel-store.js', anchored(SRC, '{ landedGen = carriedGen; sweepLanded(); }', '{ landedGen = bornGen; sweepLanded(); }', 'a landing that marks to the newest birth'), 'landing-marks-newest');
  const [r, rr] = await Promise.all([inFlightLeg(CS, 'inflight'), inFlightLeg(MN, 'inflight-red')]);   // side by side: each its own folder and writer
  ok(r.landedOk && r.carried === true && r.late === false && r.lateAfter === true, `a birth DURING a landing in flight is not said landed by it (${r.late}) and the next landing carries it (${r.lateAfter}); the row the write carried is landed (${r.carried})`, r);
  ok(r.gone === false, 'a row GONE meanwhile (removed while the landing was in flight) is harmless: never said landed, nothing thrown', r);
  ok(r.stats && r.stats.owed === 0 && r.stats.entries === 0 && r.stats.dropped >= 103 && r.stats.sweeps >= 2, `the sweep drops what each landing covered, COUNTED: ${r.stats && r.stats.dropped} entries dropped in ${r.stats && r.stats.sweeps} sweeps (the 100 filled, the carried, the gone, the late), none owed, none kept`, r.stats);
  ok(rr.late === true, 'RED: a landing that marks every birth up to the NEWEST (not the one its produce carried) says the birth during its flight landed — the leg above would go red', rr);
}
async function failedLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { stand: true });
  await fill(o.st, 0, 80);
  await o.st.index.fold().catch(() => false);
  await fill(o.st, 80, 120);
  fs.writeFileSync(path.join(dir, 'failix'), '1');
  const failed = await o.st.index.fold().then((v) => v !== false, () => false);
  const after = o.st.index.landed('acct/c100');
  fs.unlinkSync(path.join(dir, 'failix'));
  const next = await o.st.index.fold().then((v) => v !== false, () => false);
  const file = rowsOfFile(dir);
  const r = { failed, after, next, landedNext: o.st.index.landed('acct/c100'), rows: file ? Object.keys(file).length : 0, live: Object.keys(o.st.index.live()).length };
  shut(o);
  return r;
}
{
  const MF = M.load('src/channel-store.js', anchored(SRC, 'if (ok && carriedGen !== null && carriedGen > landedGen)', 'if (carriedGen !== null && carriedGen > landedGen)', 'a landing that marks on a failure'), 'landing-marks-failed');
  const [r, rr] = await Promise.all([failedLeg(CS, 'failed'), failedLeg(MF, 'failed-red')]);
  ok(!r.failed && r.after === false && r.next && r.landedNext === true && r.rows === r.live, `a FAILED landing merges nothing (nothing to merge: the landed mark did not move — c100 still unlanded: ${!r.after}); the next landing lands it and writes every row once (${r.rows} = ${r.live})`, r);
  ok(rr.after === true, 'RED: a landing that moves the mark on a FAILED write says the rows it never wrote landed — the leg above would go red', rr);
}

// r4885 (the full round's should): a SECOND landing while the sweep runs starts the sweep again at its end — the entries that landing
// covered which the running sweep had already passed are dropped without waiting for a third landing. THE PLACEMENT, every window by a
// hold: a fill past BURST_ROWS (one whole write, no journal line) whose write is HELD in flight; 100 of its rows removed and born again
// in ONE update that reaches the whole map (their keys keep their place in the generations' map, their generations newer than the
// write's); the first write lets go and the second is held at once (the stand's chained hold); the sweep's FIRST slice runs and its
// SECOND is held (the sweep's own step, matched by its text, nothing else of the loop); then the second write lands; then the slice
// goes. A placement that did not meet is a HARNESS line alone.
const SWEEP_STEP_TEXT = 'sweepIt.next()';
function holdSweepFromSecondSlice() {
  const real = global.setImmediate, held = []; let seen = 0;
  global.setImmediate = function (fn, ...a) { if (typeof fn === 'function' && String(fn).includes(SWEEP_STEP_TEXT) && ++seen >= 2) { held.push(() => real(fn, ...a)); return { ref() { return this; }, unref() { return this; }, hasRef() { return false; } }; } return real(fn, ...a); };
  return { held, release() { global.setImmediate = real; for (const f of held.splice(0)) f(); } };
}
async function sweepAgainLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { stand: true }), N = 4200, AGAIN = 100;   // N: past BURST_ROWS (4096) and twice past the sweep's slice
  let H = null;
  try {
    await o.st.index.fold().catch(() => false);   // the empty index on disk first: the next write is the fill's
    await fill(o.st, 0, N, 8);
    fs.writeFileSync(path.join(dir, 'stallix'), '1'); fs.writeFileSync(path.join(dir, 'stallix-then'), '1');
    const w1 = o.st.index.fold().then((v) => v !== false, () => false);
    await waitFor(() => ixStat(o.w).inflight);
    await o.st.index.update((x) => { for (let i = 0; i < AGAIN; i++) delete x.conversations[`acct/c${i}`]; for (let i = 0; i < AGAIN; i++) o.st.index.entry('acct', `c${i}`).title = 'again'; });
    H = holdSweepFromSecondSlice();
    fs.unlinkSync(path.join(dir, 'stallix'));   // the first write lets go; the stand moves «stallix-then» into its place: the second is held
    await waitFor(() => H.held.length > 0);
    const mid = { ...o.st.index.landedStats(), held: H.held.length, secondHeld: fs.existsSync(path.join(dir, 'stallix')) && !fs.existsSync(path.join(dir, 'stallix-then')) };
    fs.unlinkSync(path.join(dir, 'stallix'));   // the second write lets go: it lands DURING the running sweep
    const l1 = await w1, l2 = await o.st.index.fold().then((v) => v !== false, () => false);
    const before = o.st.index.landedStats();
    H.release(); H = null;
    await waitFor(() => !o.st.index.landedStats().sweeping);
    return { N, AGAIN, l1, l2, mid, before, end: o.st.index.landedStats() };
  } finally { if (H) H.release(); for (const f of ['stallix', 'stallix-then']) { try { fs.unlinkSync(path.join(dir, f)); } catch { } } shut(o); }
}
{
  const MA = M.load('src/channel-store.js', anchored(SRC, 'if (r.done) { sweepIt = null; if (sweepAgain) { sweepAgain = false; sweepLanded(); } return; }', 'if (r.done) { sweepIt = null; return; }', 'a sweep that does not start again'), 'sweep-not-again');
  const r = await sweepAgainLeg(CS, 'sweep-again'), rr = await sweepAgainLeg(MA, 'sweep-again-red');   // ONE AFTER THE OTHER: the slice hold is the process's
  const placedOf = (x) => x.l1 && x.l2 && x.mid.sweeping && x.mid.held === 1 && x.mid.secondHeld && x.mid.entries === x.N - 2000 + x.AGAIN && x.before.sweeping;
  const placed = placedOf(r) && placedOf(rr);
  if (!placed) ok(false, `HARNESS (the sweep-again placement): the holds did not all meet — the first slice kept the ${r.AGAIN} newer entries (${r.mid.entries} = ${r.N - 2000 + r.AGAIN}?), the second slice held (${r.mid.held}), the second write held then landed during the sweep (${r.mid.secondHeld}, ${r.l2}) — nothing below is judged`, JSON.stringify({ r, rr }));
  else {
    ok(r.end.entries === 0 && r.end.owed === 0 && r.end.sweeps === r.mid.sweeps + 1, `a SECOND landing during a running sweep starts the sweep again at its end: the ${r.AGAIN} rows born again while the first write flew (newer than its mark, kept by the slice that passed them) are dropped without a third landing (${r.end.entries} kept, ${r.end.sweeps} sweeps)`, JSON.stringify(r));
    ok(rr.end.entries === rr.AGAIN && rr.end.owed === 0, `RED: a sweep that does not start again keeps the ${rr.end.entries} entries the second landing covered (none owed) until a third landing — the leg above would go red`, JSON.stringify(rr));
  }
}
// ═══ ⑤ PIECE FOUR: ONE SNAPSHOT OF THE MAP FOR THE SIZE TEST AND THE BUILD ═══
sectionTime();
console.log('⑤ one snapshot of the map for the size test and the sliced build');
async function snapshotsLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { walk: { syncRows: 64 } }), seen = watchProduce(o.w);
  const k0 = Object.keys;
  let conv = null, snaps = 0;
  Object.keys = function (x) { if (conv && x === conv) snaps++; return k0.call(Object, x); };
  try {
    conv = o.st.index.live();
    await fill(o.st, 0, 900);
    await waitFor(() => seen.produced > 0 && ixStat(o.w).writes > 0);
  } finally { Object.keys = k0; }
  shut(o);
  return { snaps, produced: seen.produced };
}
{
  const r = await snapshotsLeg(CS, 'snap');
  const MS = M.load('src/channel-store.js', anchored(anchored(SRC, "if (!sync && !full && !warmFailed) { const keys0 = Object.keys(conv); if (keys0.length > LAYOUT_SYNC_ROWS) { warmLayout({ keys: keys0 }); return NOT_READY; } }", "if (!sync && !full && !warmFailed && Object.keys(conv).length > LAYOUT_SYNC_ROWS) { warmLayout(); return NOT_READY; }", 'the size test\'s own snapshot'), "const keys = given || Object.keys(conv); given = null;", 'const keys = Object.keys(conv);', 'the build\'s own snapshot'), 'two-snapshots');
  const rr = await snapshotsLeg(MS, 'snap-red');
  ok(r.produced > 0 && rr.produced > 0 && r.snaps >= 1 && rr.snaps === r.snaps + 1, `a fill of 900 rows, the layout built in slices: from the fill to the landing ${r.snaps} pass(es) of Object.keys over the map, ONE FEWER than the release's form (the size test's snapshot IS the build's) — RED the release's two snapshots put back: ${rr.snaps}`, { cure: r, release: rr });
}

// ═══ ⑥ IN WORK: the meter, in a child (it starts before the store is loaded) ═══
sectionTime();
console.log('⑥ in work: one landing and one produce, at N and 2N rows');
{
  const FIX = path.join(REPO, 'scripts/fixtures/channel-index-work.mjs');
  const workOf = (mod, tag) => new Promise((res) => {   // a child of its own (the meter starts before the store is loaded); the three run at once
    const c = spawn(process.execPath, [FIX, mod, path.join(ROOT, tag), '1500'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 120000);
    c.on('close', (code) => { clearTimeout(t); const line = out.trim().split('\n').pop(); try { res(JSON.parse(line)); } catch { res({ err: `the child: exit ${code} ${err.slice(-300)}` }); } });
  });
  const relLanding = M.write('src/channel-store.js', anchored(SRC, '{ landedGen = carriedGen; sweepLanded(); }', '{ landedGen = carriedGen; for (const [k, g] of unlanded) if (g <= landedGen) { unlanded.delete(k); bornSeq.delete(k); } }', 'the release\'s walk at the landing'), 'release-landing');
  const relProduce = M.write('src/channel-store.js', anchored(SRC, '    carriedGen = bornGen;', '    carriedGen = bornGen; void new Set([...unlanded.keys()].filter((k) => hasOwn(ix.conversations, k)));', 'the release\'s copy of the born set'), 'release-produce');
  const [cur, rl, rp] = await Promise.all([workOf(path.join(REPO, 'src/channel-store.js'), 'work'), workOf(relLanding, 'work-red-landing'), workOf(relProduce, 'work-red-produce')]);
  const perRow = (x) => (x && x.p1 && x.p2 ? (x.p2 - x.p1) / 1500 : null);
  ok(cur.l1 > 0 && cur.l2 / cur.l1 <= BOUNDED_RATIO, `ONE LANDING's work at 1500 and 3000 born rows: the same (${cur.l1} / ${cur.l2}, ≤ ×${BOUNDED_RATIO}) — it moves one mark`, JSON.stringify(cur));
  ok(perRow(cur) !== null && perRow(cur) < 1, `ONE PRODUCE's work grows by the layout's chunks only — under one unit a born row (${perRow(cur) && perRow(cur).toFixed(3)}: ${cur.p1} / ${cur.p2})`, JSON.stringify(cur));
  ok(rl.l1 > 0 && rl.l2 / rl.l1 > BOUNDED_RATIO, `RED: the release's walk at the landing put back — ×${rl.l1 ? (rl.l2 / rl.l1).toFixed(2) : '?'} the work for twice the rows (${rl.l1} / ${rl.l2})`, JSON.stringify(rl));
  ok(perRow(rp) !== null && perRow(rp) >= 2, `RED: the release's copy of the born set put back in the produce — ${perRow(rp) && perRow(rp).toFixed(2)} units a born row (${rp.p1} / ${rp.p2})`, JSON.stringify(rp));
}

sectionTime();
report();
