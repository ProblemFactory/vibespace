#!/usr/bin/env node
// test-index-journal-failures — the HEAVY TWIN of test-index-journal (主开发 r3921, row B-7e49's form; lane bl-mail): the legs whose
// seconds are WAITS or a CPU-bound mutant, moved VERBATIM by the tier rule (a fast suite reads under 10 s alone; the fast file read
// 18.0 / 19.3 s alone with them, 957af4cd5-20261124224011-UTC / -224212-box):
//   ⑨ LAW 6 — THE TAIL IS A WHOLE LINE: the failed-append scenes run with a PACED line — the next journal write is the compaction;
//      a tail with no newline at load — the same. RED: a failed append that owes no compaction. (Each failed append waits the
//      writer's 1 s failure backoff, src/store-pace.js RETRY_FLOOR_MS.)
//   ⑮ (2) / (2b) A BORN ROW WHOSE APPEND FAILED lands only with the retry's compaction, the failure's answer and the landing waited
//      for as facts; (2b) the failed append's answer placed late. REDs: the release's fixed 50 ms; a row said landed on any answer.
//      (The same backoff.)
//   ⑯ THE INDEX APPEARS MID-LIFE: the older life's journal stays byte for byte. RED: the compaction's road deaf to the hold.
//      (Fixed waits past the journal's 500 ms pace.)
//   ⑬ (c) the RED CONTROL for ②'s second half: the print taken at the touch loses a row changed before its touch. (A mutant
//      that prints a row at each of 2000 touches.)
// test-index-journal pins (§T) that this file holds them and runs none of them. The helpers here (the stand-in thread, open /
// shut / kill / seed, ②'s lawThree) are the same text as there.
// Run: node scripts/test-index-journal-failures.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const { releaseLoad } = require(path.join(REPO, 'scripts/fixtures/release-index-replay.cjs'));
const M = mutantCopies('index-journal-failures', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'index-journal-failures-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const open = (mod, dir, opts = {}) => { const w = SW.create({ log: quiet }); const st = mod.createChannelStore({ dir, log: quiet, writer: w, ...opts }); return { w, st }; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
// THE KILL: the folder as it stands, copied with the store open, read by a second store (as the next boot reads it)
// (file by file: a file the writer renames or removes while the copy runs is left as a kill would leave it — gone; in NAME
// order — index-acts.ndjson before index.json — so the journal is always the older of the pair, a state a real kill can make:
// r1542 (5))
function kill(dir, tag) {
  const k = path.join(ROOT, `${tag}-kill-${n++}`);
  const copy = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) { const f = path.join(from, e.name), t = path.join(to, e.name); try { if (e.isDirectory()) copy(f, t); else fs.copyFileSync(f, t); } catch (err) { if (!err || err.code !== 'ENOENT') throw err; } } };
  copy(dir, k);
  return k;
}
const mapOf = (st) => JSON.parse(JSON.stringify(st.index.rows()));
const seed = async (st, rows = 200) => { await st.index.update(() => { for (let i = 0; i < rows; i++) Object.assign(st.index.entry('a', `c${i}`), { title: `t${i}`, unread: 0 }); }); st.index.flush(); };

// ═══ ② LAW 3's scene — test-index-journal's own text: ⑬ (c)'s red control runs it ═══
async function lawThree(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await seed(o.st);
  await o.st.index.update(() => { o.st.index.entry('a', 'c3').title = 'once'; });   // a journaled change first (its fingerprint)
  await o.st.index.durable();
  const j0 = o.st.index.flushStats().journaled || 0, b0 = read(path.join(dir, 'index-acts.ndjson')).length;
  for (let i = 0; i < 2000; i++) await o.st.index.update(() => { o.st.index.entry('a', `c${i % 200}`); });   // touched, unchanged
  await o.st.index.durable();
  const quietJ = (o.st.index.flushStats().journaled || 0) - j0, quietB = read(path.join(dir, 'index-acts.ndjson')).length - b0;
  // THE HAZARD: a row changed through rows() and touched AFTER (a scan's road) — it must reach the journal
  await o.st.index.update(() => { const r = o.st.index.rows()['a/c7']; r.title = 'changed-before-its-touch'; o.st.index.touch('a/c7'); });
  await o.st.index.durable();
  const k = kill(dir, tag);
  const o2 = open(CS, k); const back = mapOf(o2.st); shut(o2); shut(o);
  return { quietJ, quietB, hazard: !!back['a/c7'] && back['a/c7'].title === 'changed-before-its-touch' };
}

// ═══ ⑨ LAW 6 ═══
console.log('⑨ a failed append of a PACED line — the next journal write is the compaction, no glued line');
// the writer laws' failed-append scenes (test-store-writer-laws ⑧, round 3's law 4) run with a PACED line: a stand-in thread
// runs the REAL writeJob and, on the FIRST append while a marker exists, hands it a file system that fails as asked —
// enospc (4 KB written, then ENOSPC) · short (4 KB, then a write of 0) · fsync (EIO at fsync); trunc 'eio' makes the
// truncate-back fail too (the fragment stays). Every job on the journal is noted (append / whole) in the folder's jobs.log.
const STANDJ = path.join(ROOT, 'standj.cjs');
fs.writeFileSync(STANDJ, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const path = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null, own = null; const was = m.ev === 'write' && fs.existsSync(m.file);
  const dirOf = path.dirname(m.file), marker = path.join(dirOf, 'fault'), faulty = m.append && fs.existsSync(marker);
  let f = fs, cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dirOf, 'fault.json'), 'utf8')); } catch { }
  if (m.ev === 'write' && /index-acts\\.ndjson$/.test(m.file)) fs.appendFileSync(path.join(dirOf, 'jobs.log'), (m.append ? 'append' : 'whole') + (faulty ? ' FAULT' : '') + '\\n');
  { const mk = m.ev !== 'write' ? null : /index-acts\\.ndjson$/.test(m.file) ? 'stall' : /index\\.json$/.test(m.file) ? 'stallix' : null;   // ⑮ ⑰: a journal (or index) write held between its start and its sync; a 'pass' file lets ONE through
    if (mk && fs.existsSync(path.join(dirOf, mk))) { const t0 = Date.now(), z = new Int32Array(new SharedArrayBuffer(4)); while (fs.existsSync(path.join(dirOf, mk)) && Date.now() - t0 < 10000) { const pf = path.join(dirOf, mk + '.pass'); if (fs.existsSync(pf)) { try { fs.unlinkSync(pf); } catch { } break; } Atomics.wait(z, 0, 0, 10); } } }   // ⑮: the journal's write held between its start and its sync
  if (faulty) { fs.unlinkSync(marker); let n = 0; const fault = cfg.fault;
    f = { ...fs,
      writeSync: (fd, b, o = 0, l) => { const len = l == null ? b.length - o : l; if (fault === 'fsync') return fs.writeSync(fd, b, o, len); if (n >= 4096) { if (fault === 'short') return 0; throw Object.assign(new Error('no space left'), { code: 'ENOSPC' }); } const k = fs.writeSync(fd, b, o, Math.min(len, 4096 - n)); n += k; return k; },
      fsyncSync: (fd) => { if (fault === 'fsync') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.fsyncSync(fd); },
      ftruncateSync: (fd, len) => { if (cfg.trunc === 'eio') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.ftruncateSync(fd, len); } }; }
  const blockIx = m.ev === 'write' && /index\\.json$/.test(m.file) && fs.existsSync(path.join(dirOf, 'blockix'));   // the index unwritable: the journal is the change's only record
  if (blockIx) err = { code: 'EIO', message: 'the index is unwritable in this scene' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { own = (writeJob(m, f) || {}).own || null; } catch (e) { err = { code: e.code || null, message: e.message }; try { if (m.tmp) fs.unlinkSync(m.tmp); } catch { } } }
  if (faulty && cfg.late) { const z = new Int32Array(new SharedArrayBuffer(4)), t1 = Date.now(), pf = path.join(dirOf, 'late.pass'); while (!fs.existsSync(pf) && Date.now() - t1 < 10000) Atomics.wait(z, 0, 0, 10); try { fs.unlinkSync(pf); } catch { } }   // ⑮ (2b) r3905: the failed append's ANSWER held (a loaded machine's late answer, placed) until the leg writes late.pass
  if (m.ev === 'write' && m.ownOnly && !own && !was) { try { const st = fs.statSync(m.file, { bigint: true }); own = { dev: st.dev, ino: st.ino }; } catch { } }   // as the real thread answers: a job's own result, else the numbers of a file THIS job made and then failed on (never an older job's: r2593 (1)); these stand-ins write no cell numbers, so the cells' road is proven only in test-store-writer-lanes ⑫ (p1)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err, file: m.file, own });   // own: as the real thread's answer (B-f276 1c: the store's other lane knows the file it made)
});
`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parses = (t) => t.split('\n').filter(Boolean).every((l) => { try { JSON.parse(l); return true; } catch { return false; } });
async function lawSix(mod, fault, trunc, tag) {
  const dir = tmp(tag), acts = path.join(dir, 'index-acts.ndjson'), marker = path.join(dir, 'fault');
  fs.writeFileSync(path.join(dir, 'fault.json'), JSON.stringify({ fault, trunc }));
  const w = SW.create({ log: quiet, workerPath: STANDJ });
  let after = '', back = null, said = [], fired = false;
  try {
    const st = mod.createChannelStore({ dir, log: quiet, writer: w });
    await seed(st, 4);
    fs.writeFileSync(path.join(dir, 'blockix'), '1');   // from here the index cannot be written: the journal alone holds the changes
    await st.index.update(() => { st.index.entry('a', 'c0').readAt = 101; });   // a PACED line, appended whole
    await st.index.journalDurable();
    fs.writeFileSync(marker, '1');                                               // the NEXT append fails as asked
    await st.index.update(() => { st.index.entry('a', 'c1').note = 'x'.repeat(9000); });   // a PACED line: its append fails
    for (let k = 0; k < 100 && (fs.existsSync(marker) || w.pending(acts)); k++) await sleep(50);   // the writer's own retry (its backoff)
    fired = !fs.existsSync(marker); after = read(acts);
    try { st.close(); } catch { }
    fs.unlinkSync(path.join(dir, 'blockix'));
    const st2 = mod.createChannelStore({ dir, log: { ...quiet, warn: (l) => said.push(String(l)) }, writer: w });   // a restart over the same folder
    back = st2.index.peek('a/c1'); try { st2.close(); } catch { }
  } finally { w.stop(); }
  const jobs = read(path.join(dir, 'jobs.log')).split('\n').filter(Boolean), at = jobs.findIndex((j) => / FAULT$/.test(j));
  return { fault, trunc, fired, next: at >= 0 ? jobs[at + 1] || null : null, whole: parses(after) && after.endsWith('\n'), back: !!(back && back.note && back.note.length === 9000), dropped: said.some((l) => /not readable dropped/.test(l)) };
}
// law 6's other half: a tail with no newline at load (a kill cut a paced line's newline) — the next journal write is the compaction
async function lawSixTail(tag) {
  const dir = tmp(tag), acts = path.join(dir, 'index-acts.ndjson');
  { const o = open(CS, dir); await seed(o.st, 4); shut(o); }
  const held = JSON.parse(read(path.join(dir, 'index.json'))).actsSeq || 0;
  fs.writeFileSync(acts, JSON.stringify({ seq: held + 1, rows: { 'a/c2': { title: 'cut-tail' } } }));   // a whole line, its newline never landed
  const w = SW.create({ log: quiet, workerPath: STANDJ });
  let after = '', back = null;
  try {
    const st = CS.createChannelStore({ dir, log: quiet, writer: w });
    await st.index.update(() => { st.index.entry('a', 'c3').readAt = 7; });   // a PACED line after the open tail
    await st.index.journalDurable();
    after = read(acts); try { st.close(); } catch { }
    const st2 = CS.createChannelStore({ dir, log: quiet, writer: w }); back = [(st2.index.peek('a/c2') || {}).title, (st2.index.peek('a/c3') || {}).readAt]; try { st2.close(); } catch { }
  } finally { w.stop(); }
  return { first: read(path.join(dir, 'jobs.log')).split('\n')[0], whole: parses(after) && after.endsWith('\n'), back };
}
{
  const R = await Promise.all([['enospc', 'eio'], ['short', 'eio'], ['fsync', 'eio'], ['enospc', 'ok']].map(([f, t]) => lawSix(CS, f, t, `six-${f}-${t}`)).concat([lawSixTail('six-tail')]));
  const tail = R.pop();
  ok(R.every((r) => r.fired && r.next === 'whole' && r.whole && r.back && !r.dropped),
    `⑨ LAW 6: a PACED line's append failed (${R.map((r) => `${r.fault}${r.trunc === 'eio' ? ' + its truncate EIO' : ''}`).join(' · ')}) — the next journal write was the compaction (${R.map((r) => r.next).join(' · ')}), every line parses, nothing dropped, and after a restart the change is THERE`, R);
  ok(tail.first === 'whole' && tail.whole && tail.back[0] === 'cut-tail' && tail.back[1] === 7, `⑨ LAW 6: a journal whose last line had no newline at load — the next journal write (a paced line's) was the compaction (${tail.first}), and both changes are read after a restart`, tail);
  const EM = M.load('src/channel-store.js', anchored(SRC, 'if (!ok) { if (w && !w.compact) compactOwed = true; return; }', 'if (!ok) { return; }', 'a failed append owes no compaction'), 'six-no-compact');
  const red = await lawSix(EM, 'enospc', 'eio', 'six-red');
  ok(red.fired && (red.next !== 'whole' || !red.whole || !red.back), `⑨ RED CONTROL: a failed append that owes no compaction — the retry was ${red.next === 'append' ? 'an APPEND' : red.next}, glued to the fragment: lines parse ${red.whole}, the change after a restart ${red.back}, a line dropped ${red.dropped} — the leg above would go red`, red);
}

// ═══ ⑮ (2) / (2b) A BORN ROW WHOSE APPEND FAILED (主开发 r1765, r3905) — test-index-journal's ⑮ (2) and (2b), moved ═══
console.log('⑮ (2) / (2b) a born row whose append FAILED lands only with the retry\'s compaction');
// r3905: the leg waits on FACTS — the failure ANSWERED (the store's own word: the compaction owed) before landed is read, then
// durable() until the row has landed (its answers kept). The release's leg waited a TIME (the fault marker gone — the thread
// deletes it when the faulty append STARTS — plus a fixed 50 ms) and read ONE durable() blind: a failure answered after those
// 50 ms (a loaded machine) made that durable() hear the failing append itself (false: the writer answers every waiter at a
// failure) and landed was read before the retry's compaction ran. place.late holds the failed append's answer in the stand-in
// thread until the leg releases it 300 ms after the marker went; place.fixedWait is the release's own wait (the red control).
async function failLandLeg(mod, tag, place = {}) {
  const dir = tmp(tag), w = SW.create({ log: quiet, workerPath: STANDJ });
  fs.writeFileSync(path.join(dir, 'fault.json'), JSON.stringify({ fault: 'enospc', trunc: 'eio', late: !!place.late }));
  const st = mod.createChannelStore({ dir, log: quiet, writer: w });
  await seed(st, 20);
  fs.writeFileSync(path.join(dir, 'fault'), '1');   // the next append fails as asked (4 KB, then ENOSPC; the truncate-back fails too)
  await st.index.update(() => { st.index.entry('a', 'born-2').note = 'z'.repeat(9000); });
  for (let k = 0; k < 100 && fs.existsSync(path.join(dir, 'fault')); k++) await new Promise((z) => setTimeout(z, 20));
  const pass = path.join(dir, 'late.pass'), release = place.late ? setTimeout(() => fs.writeFileSync(pass, '1'), 300) : null;
  const answers = [];
  let afterFail, afterRetry, owed = false;
  if (place.fixedWait) {   // the release's own wait: a fixed 50 ms, then ONE durable() read blind
    await new Promise((z) => setTimeout(z, 50));
    afterFail = st.index.landed('a/born-2');
    answers.push(await st.index.journalDurable());   // the «retry»
    afterRetry = st.index.landed('a/born-2');
  } else {
    for (let k = 0; k < 250 && !(owed = st.index.journalStats().compactOwed === true); k++) await new Promise((z) => setTimeout(z, 20));   // the failure answered
    afterFail = st.index.landed('a/born-2');
    while (!st.index.landed('a/born-2') && answers.length < 5) answers.push(await st.index.journalDurable());   // the retry: the compaction, as a fact
    afterRetry = st.index.landed('a/born-2');
  }
  if (release) { clearTimeout(release); try { fs.writeFileSync(pass, '1'); } catch { } }   // a thread still holding is let go before the stop
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { afterFail, afterRetry, owed, answers };
}
{
  const f = await failLandLeg(CS, 'land-fail');
  ok(f.owed === true && f.afterFail === false && f.afterRetry === true, `⑮ (2) a born row whose append FAILED: landed ${f.afterFail} once the failure was answered (the compaction owed: ${f.owed}); after the retry's compaction landed: ${f.afterRetry} (durable answered ${f.answers.join(', ')})`, f);
  const fl = await failLandLeg(CS, 'land-fail-late', { late: true });
  ok(fl.owed === true && fl.afterFail === false && fl.afterRetry === true, `⑮ (2b) the failed append's ANSWER placed late (held until 300 ms after its job began, a loaded machine's answer): landed ${fl.afterFail} once the failure was answered; after the retry's compaction landed: ${fl.afterRetry} (durable answered ${fl.answers.join(', ')})`, fl);
  const fr = await failLandLeg(CS, 'land-fail-late-red', { late: true, fixedWait: true });
  ok(fr.afterRetry === false && fr.answers[0] === false, `⑮ (2b) RED CONTROL: the release's own wait (the marker gone + a fixed 50 ms, ONE durable() read blind) under the same late answer — durable heard the failing append itself (${fr.answers[0]}) and landed was read before the retry: ${fr.afterRetry} — the leg above would go red`, fr);
  const MF = M.load('src/channel-store.js', anchored(SRC, "    if (!ok) { if (w && !w.compact) compactOwed = true; return; }", "    if (w) for (const [k, sq] of bornSeq) if (sq <= w.upTo) { unlanded.delete(k); bornSeq.delete(k); }\n    if (!ok) { if (w && !w.compact) compactOwed = true; return; }", 'landed on any answer'), 'land-any');
  const rf = await failLandLeg(MF, 'land-fail-red');
  ok(rf.afterFail === true, `⑮ (2) RED CONTROL: a row said landed on the writer's answer whatever it was — landed after a FAILED append (${rf.afterFail}) — the leg above would go red`, rf);
}

// ═══ ⑯ THE INDEX APPEARS MID-LIFE (主开发 r1763 (3)): the older life's journal stays byte for byte ═══
console.log('⑯ an index read missing, its journal replayed, then the index appears — no journal write after');
async function appearLeg(mod, tag) {
  const dir = tmp(tag), af = path.join(dir, 'index-acts.ndjson'), ixf = path.join(dir, 'index.json');
  // a journal of an older life and NO index.json (a mount that came late): its lines replayed at the load; one line cut short ⇒
  // a compaction owed — a journal write that must never run once the index is held
  fs.writeFileSync(af, [JSON.stringify({ seq: 1, rows: { 'a/old-1': { title: 'older life 1' } } }), JSON.stringify({ seq: 2, rows: { 'a/old-2': { title: 'older life 2' } } }), '{"seq":3,"rows":{"a/old-3"'].join('\n') + '\n');
  const af0 = fs.readFileSync(af);
  const o = open(mod, dir);
  const replayed = !!o.st.index.peek('a/old-1');
  fs.writeFileSync(ixf, JSON.stringify({ v: 1, conversations: { 'a/late': { title: 'the late mount' } } }));   // the index APPEARS
  const first = await o.st.index.update(() => { o.st.index.entry('a', 'n-1').title = 'new'; }, { durable: true }).then(() => 'applied', (e) => (e && e.code) || 'refused');   // its exclusive create meets the file
  const held = !!o.st.index.blocked();
  const jd = await o.st.index.journalDurable().then(() => 'landed', (e) => (e && e.code) || 'refused');
  await o.st.index.durable().catch(() => false);
  try { o.st.index.entry('a', 'n-2').title = 'outside an update'; } catch { }
  await new Promise((z) => setTimeout(z, 700));   // past the pace: a journal write asked would have run
  try { o.st.index.flush(); } catch { }
  shut(o);
  let ixKept = false; try { ixKept = !!JSON.parse(read(ixf)).conversations['a/late']; } catch { }
  return { replayed, first, held, jd, afSame: fs.readFileSync(af).equals(af0), ixKept };
}
{
  const r = await appearLeg(CS, 'appear');
  ok(r.replayed && r.first !== 'applied' && r.held && r.jd === 'store-blocked' && r.afSame && r.ixKept, `⑯ THE INDEX APPEARED mid-life (read missing, its journal replayed: ${r.replayed}): the act refused at its exclusive write (${r.first}), the family held (${r.held}), journalDurable() ${r.jd}; after durable(), a change outside an update and the stop, the older life's journal is byte for byte (${r.afSame}) and the appeared index kept (${r.ixKept})`, r);
  // the moved form (B-f276 1c on the train): produceActs holds an APPEARED index by 1c's own answer (EEXIST, by name) before
  // the held road's LATER — this scene IS the appeared case, so the deaf copy cuts both
  const DM = M.load('src/channel-store.js', anchored(anchored(anchored(anchored(SRC, 'if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); askActs(); return W().durable(actsFile); },', 'askActs(); return W().durable(actsFile); },', 'jd deaf'), '  function askActs() { if (closed || ixLoad.blocked) return;', '  function askActs() { if (closed) return;', 'askActs deaf'), '    if (ixLoad.blocked) { sayHeldOnce(); return (LATER); }', '    void 0;', 'produceActs deaf'), "    if (ixLoad.blocked && ixLoad.q && ixLoad.q.kind === 'appeared') throw Object.assign(new Error('index-acts.ndjson held: ' + ixLoad.blocked), { code: 'EEXIST', familyHeld: true });", '    void 0;', 'produceActs deaf to an appeared index (1c\'s answer)'), 'appear-deaf');
  const rd = await appearLeg(DM, 'appear-red');
  ok(!rd.afSame, `⑯ RED CONTROL: the compaction's road deaf to the hold (the journal's wait, askActs and produceActs' two guards: 1c's answer for an appeared index and the held road) — the older life's journal rewritten (${!rd.afSame}) — the leg above would go red`, rd);
}

// ═══ ⑬ (c) THE RED CONTROL FOR ②'s SECOND HALF (主开发 r1542 (2)) — test-index-journal's ⑬ (c), moved ═══
console.log('⑬ (c) the red control for ②\'s second half — the print taken at the touch');
{
  const TOUCH_LINE = SRC.split('\n').find((l) => l.startsWith('    if (curTouch) { curTouch.add(key); }'));
  const TM = M.load('src/channel-store.js', anchored(SRC, TOUCH_LINE, TOUCH_LINE.replace('curTouch.add(key); }', 'curTouch.add(key); { const v0 = ix.conversations[key]; const l0 = v0 ? rowLine(key, v0) : null; if (l0 !== null) rowFp.set(key, fpOf(l0)); } }'), 'the print taken at the touch (the release\'s before)'), 'before-at-touch');
  const tr3 = await lawThree(TM, 'three-red');
  ok(!tr3.hazard, `⑬ (c) RED CONTROL for ②'s second half: the print taken at the TOUCH (the release's «before») — the row changed before its touch is lost (${tr3.hazard}) — ② would go red`, tr3);
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
