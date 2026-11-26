#!/usr/bin/env node
// test-store-writer-r4 — lane hub-loop-stalls commit 2, ROUND 4 (the acceptance of af1f5e137, 07:24Z): FAST, in process,
// stand-in threads running the REAL writeJob (test-store-writer-laws keeps rounds 2–3; this file keeps round 4 apart so each
// stays inside the tier rule's seconds):
//   ⑧ MUST 1 — THE TAIL IS UNKNOWN UNTIL IT ENDS IN A NEWLINE, ALSO AT THE LOAD: an append cut AT its newline with the
//      truncate-back failing, a kill before the retry, a NEW process — the next act lands whole, another restart reads every
//      act (three pairs here; VS_R4_PAIRS=all — the heavy test-store-writer ⑧ — runs the 2 × 4 matrix); a journal edited by
//      hand to end without its newline
//   ⑧ true words 4 — an act still QUEUED at durable()'s bound is said as waiting, never «its write failed»
//   ⑧ true words 5 — the journal-bound line after the index LANDED; the load SAYS a partial row and a wrong-type table
//   ROUND 6's AMEND — a wait for a write ends when the write ends (20 runtime flushSync: no wait ended by its poll — counted);
//      the exit's last pass writes what its callbacks dirtied and names a store that keeps changing; the exit's words
//   ⑨ lane lg-store-writes, the U4/U5 cure — durable()'s `answer` is called inside the writer's settle (the exit's flush too):
//      an answer waiting on its write goes out before the process leaves (in process, and a real HTTP child); every waiter
//      left by the exit's last pass is answered (false); whenDurable answers once for several files; RED: the microtask copy
//   ⑩ lane lg-store-writes, the moved2 cure 2 — afterLanding (THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING): a landing held past
//      the reply's bound, then landed ⇒ the step runs once, after it; a REAL kill before the landing ⇒ no step, a start reads the old
//      record; RED: the step at the act, the bound dropping the step
//   ⑪ lane lg-store-writes, B-9275 unit 1 — A STORE'S NEW BYTES ARE ON DISK BEFORE ITS NAME POINTS AT THEM: the temp synced before
//      the close and the rename (a recording stand-in: writeJob, the exit's road, the main-only road); a failed sync a failed
//      write (the previous version kept, the change retried); the sync off the hub's loop (a gate only the loop releases, and its
//      control on the main-only road); RED: today's writeJob
//   ⑫ 主开发 r5002 / r5010 — A SYNC THE FILE SYSTEM DOES NOT DO AT ALL LANDS, said once a writer (one set for both doors: src/fd-close.js
//      SYNC_UNSUPPORTED): every road over a placed refusal, the cells' and the message's; a placed EIO / EROFS and a write's own EINVAL
//      still fail; REDS: the base's law, the flag cut, the cells cut, every code through, the write's error judged
// Run: node scripts/test-store-writer-r4.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

// ── ⑧ ROUND 4 — MUST 1: THE TAIL IS UNKNOWN UNTIL IT ENDS IN A NEWLINE — ALSO AT THE LOAD ────────────────────────────────
console.log('⑧ round 4 — MUST 1: a journal whose last byte is not a newline is a tail of unknown state at the load');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r4t-'));
  // the stand-in: on the FIRST append while a marker exists, every byte of the line but its NEWLINE lands, then ENOSPC
  // ('cutnl') or a write of 0 ('shortnl'); the truncate-back fails as asked (eio · enospc · eperm) or works ('ok')
  const STAND = path.join(T, 'stand-nl.cjs');
  fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const P = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const dirOf = P.dirname(m.file), marker = P.join(dirOf, 'fault'), faulty = m.append && fs.existsSync(marker);
  let f = fs, cfg = {}; try { cfg = JSON.parse(fs.readFileSync(P.join(dirOf, 'fault.json'), 'utf8')); } catch { }
  if (faulty) { fs.unlinkSync(marker); let cut = false;
    const code = { eio: 'EIO', enospc: 'ENOSPC', eperm: 'EPERM' };
    f = { ...fs,
      writeSync: (fd, b, o = 0, l) => { const len = l == null ? b.length - o : l; if (cut) { if (cfg.fault === 'shortnl') return 0; throw Object.assign(new Error('no space left'), { code: 'ENOSPC' }); } if (len > 1) { cut = true; return fs.writeSync(fd, b, o, len - 1); } return fs.writeSync(fd, b, o, len); },
      ftruncateSync: (fd, len) => { if (code[cfg.trunc]) throw Object.assign(new Error(cfg.trunc), { code: code[cfg.trunc] }); return fs.ftruncateSync(fd, len); } }; }
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { writeJob(m, f); } catch (e) { err = { code: e.code || null, message: e.message }; try { if (m.tmp) fs.unlinkSync(m.tmp); } catch { } } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const settled = async (w, f) => { for (let k = 0; k < 60 && w.pending(f); k++) await sl(50); };
  const journalOf = (dir) => { try { return fs.readFileSync(path.join(dir, 'index-acts.ndjson'), 'utf8'); } catch { return ''; } };
  const readable = (t) => t.split('\n').filter(Boolean).every((l) => { try { JSON.parse(l); return true; } catch { return false; } });
  // THE SCENE: act 1 whole; act 2's append cut AT ITS NEWLINE; the process «killed» before the writer's retry (its thread
  // stopped, the store abandoned — nothing more written); a NEW process loads, act 3; another restart reads every act
  const scene = async (fault, trunc) => {
    const dir = path.join(T, `nl-${fault}-${trunc}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'fault.json'), JSON.stringify({ fault, trunc }));
    const acts = path.join(dir, 'index-acts.ndjson');
    const w1 = SW.create({ log: { warn() {} }, workerPath: STAND });
    let told = null, cutTail = null;
    const st = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w1 });
    await st.index.update(() => { for (let i = 0; i < 3; i++) st.index.entry('a', 'c' + i).title = 't' + i; });
    st.index.flush(); await settled(w1, path.join(dir, 'index.json'));
    await st.index.update(() => { st.index.entry('a', 'c0').readAt = 101; }, { durable: true });   // act 1: appended whole
    fs.writeFileSync(path.join(dir, 'fault'), '1');
    try { await st.index.update(() => { st.index.entry('a', 'c1').readAt = 202; }, { durable: true }); } catch (e) { told = e.code; }   // act 2: its append cut at the newline
    w1.stop();   // THE KILL: before the writer's retry — the journal stays as the failure left it
    cutTail = journalOf(dir);
    const said = [];
    const w2 = SW.create({ log: { warn() {} } });   // A NEW PROCESS: the real thread, nothing failing
    const st2 = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w2 });
    await st2.index.update(() => { st2.index.entry('a', 'c2').readAt = 303; }, { durable: true });   // act 3
    await settled(w2, acts);
    const after = journalOf(dir);
    const w3 = SW.create({ log: { warn() {} } });
    const said3 = [];
    const st3 = CS.createChannelStore({ dir, log: { warn: (l) => said3.push(String(l)), log() {} }, writer: w3 });   // ANOTHER restart
    const a2 = st3.index.peek('a/c1'), a3 = st3.index.peek('a/c2');
    try { st2.close(); st3.close(); } catch { }
    w2.stop(); w3.stop();
    return { fault, trunc, told, cutOpen: cutTail.length > 0 && !cutTail.endsWith('\n'), saidOpen: said.some((l) => /its last line had no newline/.test(l)),
      whole: after.endsWith('\n') && readable(after), act2: !!(a2 && a2.readAt === 202), act3: !!(a3 && a3.readAt === 303), unreadable3: said3.some((l) => /not readable/.test(l)) };
  };
  // FAST: three pairs — a cut write + its truncate EIO, a write of 0 + its truncate EPERM, a cut write with the truncate
  // WORKING (nothing left open); the whole matrix (2 × 4) runs in the heavy test-store-writer ⑧ (VS_R4_PAIRS=all here)
  const ALL = [['cutnl', 'eio'], ['cutnl', 'enospc'], ['cutnl', 'eperm'], ['cutnl', 'ok'], ['shortnl', 'eio'], ['shortnl', 'enospc'], ['shortnl', 'eperm'], ['shortnl', 'ok']];
  const pairs = process.env.VS_R4_PAIRS === 'all' ? ALL : [['cutnl', 'eio'], ['shortnl', 'eperm'], ['cutnl', 'ok']];
  const R = await Promise.all(pairs.map(([f, t]) => scene(f, t)));
  const bad = R.filter((r) => !(r.told === 'not-durable' && r.whole && r.act3 && !r.unreadable3 && (r.trunc === 'ok' ? !r.cutOpen : r.cutOpen && r.saidOpen && r.act2)));
  ok(!bad.length, `MUST 1: an append cut AT ITS NEWLINE (ENOSPC / a write of 0) with its truncate-back failing (EIO / ENOSPC / EPERM), then a kill before the retry — a NEW process owes a whole tail: the next act lands whole, another restart reads every act (act 2 — whose JSON had landed — and act 3), every line parses, the load said so; with the truncate working nothing is left open (${R.length} pairs)`, bad.length ? bad : undefined);
  // a journal EDITED BY HAND to end without its newline (a person, a copy tool)
  { const dir = path.join(T, 'hand'); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: { warn() {} } });
    const st = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w });
    await st.index.update(() => { st.index.entry('a', 'h0').title = 'h'; }); st.index.flush(); await settled(w, path.join(dir, 'index.json'));
    try { st.close(); } catch { } w.stop();
    const ixSeq = (() => { try { return Number(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).actsSeq) || 0; } catch { return 0; } })();
    fs.writeFileSync(path.join(dir, 'index-acts.ndjson'), JSON.stringify({ seq: ixSeq + 1, rows: { 'a/h1': { title: 'by hand' } } }));   // NO trailing newline
    const said = [], w2 = SW.create({ log: { warn() {} } });
    const st2 = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w2 });
    await st2.index.update(() => { st2.index.entry('a', 'h2').title = 'next'; }, { durable: true }); await settled(w2, path.join(dir, 'index-acts.ndjson'));
    try { st2.close(); } catch { } w2.stop();
    const w3 = SW.create({ log: { warn() {} } }), st3 = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w3 });
    const h1 = st3.index.peek('a/h1'), h2 = st3.index.peek('a/h2'); try { st3.close(); } catch { } w3.stop();
    const t = journalOf(dir);
    ok(h1 && h1.title === 'by hand' && h2 && h2.title === 'next' && (!t || (t.endsWith('\n') && readable(t))) && said.some((l) => /its last line had no newline/.test(l)),
      'MUST 1: a journal edited by hand to end without its newline — the load says so, the next act never glues to it, a restart reads both', { h1, h2, said: said.slice(0, 2), tail: t.slice(-120) });
  }
  fs.rmSync(T, { recursive: true, force: true });
}
// ── ⑧ ROUND 4 — true words 4: AN ACT STILL QUEUED AT durable()'s BOUND IS WAITING, NEVER «ITS WRITE FAILED» ──────────────
console.log('⑧ round 4 — true words 4: a queued act at the bound is said as waiting; a failed one as failed');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r4q-'));
  const SLOW = path.join(T, 'slow.cjs');   // every write takes 150 ms (a slow storage that answers); a marker makes them fail
  fs.writeFileSync(SLOW, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const P = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), nap = new Int32Array(new SharedArrayBuffer(4));
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); let err = null;
  Atomics.wait(nap, 0, 0, 150);
  const failing = fs.existsSync(P.join(P.dirname(m.file), 'failing'));
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else if (failing) err = { code: 'EIO', message: 'i/o error' }; else { try { writeJob(m, fs); } catch (e) { err = { code: e.code || null, message: e.message }; } }
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms: 150, err });
});
`);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async (failing) => {
    const dir = path.join(T, failing ? 'failing' : 'queued'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: 1, conversations: {} }));   // B-f276 1b: an index that LANDED — one never written journals nothing (its acts write the index itself)
    if (failing) fs.writeFileSync(path.join(dir, 'failing'), '1');
    const w = SW.create({ log: { warn() {} }, workerPath: SLOW, durableMs: failing ? 3000 : 100 });   // failing: a bound longer than the writes ahead, so the act's own write fails first
    const said = [];
    const st = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w });
    let code = null, why = null;
    try {
      for (let i = 0; i < 3; i++) w.dirty(path.join(dir, `other${i}.json`), { name: `other${i}.write`, produce: () => '{"o":1}', debounceMs: 0 });
      w.durable(path.join(dir, 'other0.json'));   // urgent: the writes ahead of the act
      await sl(20);
      try { await st.index.update(() => { st.index.entry('a', 'q').readAt = 1; }, { durable: true }); } catch (e) { code = e.code; }
      why = w.whyNotDurable(path.join(dir, 'index-acts.ndjson'));
    } finally { try { st.close(); } catch { } w.stop(); }
    return { code, why, line: said.find((l) => /not on disk yet/.test(l)) || '' };
  };
  const [q, f] = await Promise.all([run(false), run(true)]);   // side by side: each its own dir, writer and thread
  ok(q.code === 'not-durable' && q.why && q.why.why === 'queued' && q.why.ahead >= 1 && /its write is still queued behind at least \d+ other writes? — the storage is slow/.test(q.line) && !/failed/.test(q.line),
    `true words 4: an act still QUEUED at durable()'s bound (here 100 ms; 150 ms a write, ${q.why ? q.why.ahead : '?'} ahead) is said as waiting: «${q.line.slice(0, 220)}»`, q);
  ok(f.code === 'not-durable' && f.why && f.why.why === 'failed' && /its write failed — kept, retried/.test(f.line), `true words 4: an act whose write FAILED is said as failed: «${f.line.slice(0, 160)}»`, f);
  fs.rmSync(T, { recursive: true, force: true });
}
// ── ⑧ ROUND 4 — true words 5: the bound line after the index LANDED; the load says a partial row and a wrong-type table ──
console.log('⑧ round 4 — true words 5: «not landed since» only while it has not; the load says what it did with odd lines');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r4b-'));
  const STAND = path.join(T, 'stand-ix.cjs');   // the real writeJob; the index unwritable while a «blockix» marker exists
  fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const P = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); let err = null, own = null; const was = m.ev === 'write' && fs.existsSync(m.file);
  if (m.ev === 'write' && /index\\.json$/.test(m.file) && fs.existsSync(P.join(P.dirname(m.file), 'blockix'))) err = { code: 'EIO', message: 'the index is unwritable in this scene' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { own = (writeJob(m, fs) || {}).own || null; } catch (e) { err = { code: e.code || null, message: e.message }; } }
  if (m.ev === 'write' && m.ownOnly && !own && !was) { try { const st = fs.statSync(m.file, { bigint: true }); own = { dev: st.dev, ino: st.ino }; } catch { } }   // as the real thread answers: a job's own result, else the numbers of a file THIS job made and then failed on (never an older job's: r2593 (1)); these stand-ins write no cell numbers, so the cells' road is proven only in test-store-writer-lanes ⑫ (p1)
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms: 0, err, file: m.file, own });   // own: as the real thread's answer (B-f276 1c: the store's other lane knows the file it made)
});
`);
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  { const dir = path.join(T, 'bound'); fs.mkdirSync(dir, { recursive: true });
    const said = [], w = SW.create({ log: { warn() {} }, workerPath: STAND });
    const st = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w, actsMaxBytes: 1500 });
    try {
      await st.index.update(() => { st.index.entry('a', 'b0').title = 'b'; }); st.index.flush();
      fs.writeFileSync(path.join(dir, 'blockix'), '1');
      for (let i = 0; i < 6; i++) { try { await st.index.update(() => { st.index.entry('a', 'b0').note = 'n' + i + 'x'.repeat(400); }, { durable: true }); } catch { } }
      const before = said.filter((l) => /past its bound/.test(l)).length;
      fs.unlinkSync(path.join(dir, 'blockix'));
      st.index.flush();   // the index LANDS now (its own flush — not its 1 s retry backoff)
      for (let k = 0; k < 40 && !fs.readFileSync(path.join(dir, 'index.json'), 'utf8').includes('n5'); k++) await sl(25);
      const landedAt = said.length;
      for (let i = 0; i < 6; i++) { try { await st.index.update(() => { st.index.entry('a', 'b0').note = 'm' + i + 'y'.repeat(400); }, { durable: true }); } catch { } }
      const after = said.slice(landedAt).filter((l) => /past its bound/.test(l));
      ok(before >= 1 && after.length >= 1 && after.every((l) => !/has not landed since/.test(l)), `true words 5: past the journal's bound after the index LANDED, the line is a new episode's — never «the index has not landed since» (${after.length} said after the landing)`, { before, after: after.map((l) => l.slice(0, 160)) });
    } finally { try { st.close(); } catch { } w.stop(); }
  }
  { const dir = path.join(T, 'odd'); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: { warn() {} } });
    const st = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w });
    await st.index.update(() => { st.index.entry('a', 'w0').title = 'whole'; }); st.index.flush();
    for (let k = 0; k < 40 && !fs.existsSync(path.join(dir, 'index.json')); k++) await sl(25);
    try { st.close(); } catch { } w.stop();
    const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), seq = Number(ix.actsSeq) || 0;
    fs.writeFileSync(path.join(dir, 'index-acts.ndjson'), JSON.stringify({ seq: seq + 1, rows: { 'a/w0': { title: 'partial' } } }) + '\n' + JSON.stringify({ seq: seq + 2, rows: {}, top: { updatedAt: { not: 'a number' } } }) + '\n');
    const said = [], w2 = SW.create({ log: { warn() {} } });
    const st2 = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w2 });
    const row = st2.index.peek('a/w0'); try { st2.close(); } catch { } w2.stop();
    const line = said.find((l) => /index-acts\.ndjson:/.test(l)) || '';
    ok(/1 row not a whole conversation row \(no key of its own\) applied as written/.test(line) && /1 top-level table of another type than the index's own not applied \(the index's kept\)/.test(line) && row && row.title === 'partial',
      `true words 5: the load SAYS a partial row over a whole one and a top-level table of the wrong type: «${line.slice(0, 260)}»`, { line, row });
  }
  fs.rmSync(T, { recursive: true, force: true });
}

// ── ⑧ ROUND 4 — true words 2: THE EXIT WRITES NO MOVED STORE ON THE MAIN THREAD — a FAST pin (round 3 had only the heavy ⑧)
console.log('⑧ round 4 — true words 2: the exit hands every moved store to the thread (the main thread\'s own fs sees none)');
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-exit-'));
  // the writer's MAIN-thread fs is a spy (create({fs})): its writes are the main thread's; the thread has its own fs
  const run = (SWm) => {
    const calls = [];
    const spy = new Proxy(fs, { get: (t, k) => (typeof t[k] === 'function' && /^(write|writeFile|rename|fsync|open|append)/.test(String(k)) && /Sync$/.test(String(k)) ? (...a) => { calls.push(`${String(k)}(${path.basename(String(a[0]))})`); return t[k](...a); } : t[k]) });
    const w = SWm.create({ log: { warn() {} }, fs: spy, exitBudgetMs: 3000 });
    try {
      for (const n of ['a', 'b', 'c']) w.dirty(path.join(T, `${n}-${calls.length}-${Math.random().toString(36).slice(2)}.json`), { name: `${n}.write`, produce: () => '{"x":1}', debounceMs: 60000, rank: n === 'a' ? 0 : 1 });
      w.beginExit(); w.exitFlush({ only: 'rank0' }); const r = w.exitFlush();
      return { calls, written: r.all ? r.all.written : r.written };
    } finally { w.stop(); }
  };
  const live = run(require(path.join(REPO, 'src/store-writer.js')));
  // the MUTANT: the exit writes on the main thread again (round 2's road) — a copy of the writer with that one swap
  const src = fs.readFileSync(path.join(REPO, 'src/store-writer.js'), 'utf8'), FROM = 'const r = writeWaiting(s, p, since, deadline, waitedBy);';
  const mp = path.join(T, 'store-writer-mutant.js');   // outside the tree (a census scanning src/ never sees it): its requires and __dirname made absolute
  let mut = null;
  try {
    if (src.split(FROM).length === 2) { fs.writeFileSync(mp, editAnchor(editAnchor(src, FROM, "const r = writeHere(s, p, since) ? 'ok' : 'failed';", "src/store-writer.js").replace(/require\('\.\//g, `require('${path.join(REPO, 'src')}/`), /__dirname/g, JSON.stringify(path.join(REPO, 'src')), "src/store-writer.js")); mut = run(require(mp)); }
  } finally { }
  ok(live.written.length === 3 && !live.calls.length && mut && mut.calls.some((c) => /^(writeSync|renameSync|openSync)/.test(c)),
    `true words 2: at the exit the three moved stores were written by the THREAD — the main thread's fs saw ${live.calls.length} write calls; the MUTANT that writes them on the main thread is red by name (${mut ? mut.calls.slice(0, 4).join(', ') : 'its anchor is gone'})`, { live, mut });
  fs.rmSync(T, { recursive: true, force: true });
}

// ── ROUND 6's AMEND (the acceptance of d468bf5b1, 15:53Z) — the writer's REAL thread, in process ─────────────────────
console.log('round 6\'s amend: a wait for a write ends when the write ends; the exit\'s last pass until nothing is dirty; true words');
{
  const SW = require(path.join(REPO, 'src/store-writer.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r6a-'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // THE ONE FIX — the main thread waits on the cell the writer thread NOTIFIES: N runtime flushSync of fast writes (a few
  // hundred bytes to the temp dir), and NO wait ends by its 50 ms poll (COUNTED: Atomics.wait's own answers on this thread —
  // no wall clock). d468bf5b1 waited on [1] and was notified on [0]: 20 of 20 ended by the poll. (The writer's own time
  // for a waited write is not the judge — it is measured to the main thread's wake, the poll included.)
  {
    const w = SW.create({ log: { warn() {} } });
    const warm = path.join(T, 'warm.json'); w.dirty(warm, { name: 'warm.write', produce: () => '{}', debounceMs: 0 });
    for (let k = 0; k < 200 && !fs.existsSync(warm); k++) await sleep(10);   // the thread is up (its own start is not a write's time)
    const realWait = Atomics.wait, rows = [];
    let answers = [];
    Atomics.wait = function (...a) { const r = realWait.apply(Atomics, a); answers.push(r); return r; };
    try {
      for (let i = 0; i < 20; i++) {
        const f = path.join(T, `n${i}.json`); answers = [];
        w.dirty(f, { name: `n${i}.write`, produce: () => `{"n":${i}}`, debounceMs: 600000 });
        w.flushSync([f]);
        const st = w.stats().find((x) => x.file === f);
        rows.push({ i, onDisk: fs.existsSync(f), waits: answers.length, timedOut: answers.filter((x) => x === 'timed-out').length, writeMs: st ? st.lastMs : null });
      }
    } finally { Atomics.wait = realWait; }
    // r2226 (2): THE LAW BY WHAT THE WRITER REPORTS, not a wall-clock poll under load: a wait may end by its 50 ms poll only for each
    // 50 ms the thread's OWN write took (a 56 ms write on a loaded machine: one) — the red (the notify on the wrong cell) still ends
    // EVERY fast write's wait by its poll
    const bad = rows.filter((r) => r.timedOut > Math.floor((Number(r.writeMs) || 0) / 50)), waits = rows.reduce((n, r) => n + r.waits, 0);
    ok(rows.every((r) => r.onDisk) && !bad.length, `THE ONE FIX: 20 runtime flushSync of fast writes on the writer's real thread — ${waits} waits, ${bad.length} of the 20 flushes had a wait end by its 50 ms poll beyond its own write's time (a wait per 50 ms the thread's write took; d468bf5b1: 20 of 20)`, { bad: bad.slice(0, 5), rows: rows.slice(0, 3) });
    w.stop();
  }
  // ITEM 2 — a store a write's own callback dirties DURING the exit's last pass is written; one that keeps changing is named
  {
    const said = [], w = SW.create({ log: { warn: (l) => said.push(l) } });
    const a = path.join(T, 'a.json'), b = path.join(T, 'b.json'), c = path.join(T, 'c.json');
    let bOnce = false, cN = 0;
    w.dirty(a, { name: 'a.write', produce: () => '{"a":1}', debounceMs: 600000, onWritten: (ok2) => { if (ok2 && !bOnce) { bOnce = true; w.dirty(b, { name: 'b.write', produce: () => '{"b":1}', debounceMs: 600000 }); } } });
    w.dirty(c, { name: 'c.write', produce: () => `{"c":${++cN}}`, debounceMs: 600000, onWritten: (ok2) => { if (ok2) w.dirty(c, { name: 'c.write' }); } });   // changes again at every write of it
    w.beginExit(); w.exitFlush({ only: 'rank0' });
    const r = w.exitFlush({});
    const line = said.find((l) => /^\[store-write\] exit: /.test(l)) || '';
    ok(fs.existsSync(b) && r.all.written.includes('b.write') && /NOT written: c\.write — it changed again during the exit's last pass 5 times — its last change is not written/.test(line),
      `ITEM 2: a store the index-like callback dirtied during the last pass is WRITTEN (b.write on disk, in the line); a store that changes at its every write is NAMED after 5 rounds («${line.slice(0, 160)}…»)`, { written: r.all.written, left: r.all.left, line });
    w.stop();
  }
  // ITEM 3 — the words: a slow exit write says no bound; a failed exit write says ITS OWN code (EISDIR, not «EWRITE»), and
  // never «retrying in 1 s» one line before the exit's line names it lost
  {
    const said = [], w = SW.create({ log: { warn: (l) => said.push(l) }, slowMs: 0 });
    const ok1 = path.join(T, 'slow.json'), dirAt = path.join(T, 'is-a-dir.json'); fs.mkdirSync(dirAt); fs.writeFileSync(path.join(dirAt, 'x'), '1');
    w.dirty(ok1, { name: 'slow.write', produce: () => '{"s":1}', debounceMs: 600000 });
    w.dirty(dirAt, { name: 'dir.write', produce: () => '{"d":1}', debounceMs: 600000 });
    w.beginExit(); w.exitFlush({ only: 'rank0' }); w.exitFlush({});
    const slowLine = said.find((l) => /slow\.write took/.test(l)) || '', failLine = said.find((l) => /dir\.write not written/.test(l)) || '', exitLine = said.find((l) => /^\[store-write\] exit: /.test(l)) || '';
    ok(/the exit waited for it \(the main thread blocked\)$/.test(slowLine) && !/bound/.test(slowLine), `ITEM 3: a slow exit write — «${slowLine.slice(slowLine.indexOf(' — ') + 3)}» (no bound: there is none)`, said);
    ok(/dir\.write not written \((EISDIR|ENOTEMPTY|EEXIST); attempt 1\) — not retried at the exit — named in its exit line$/.test(failLine) && /NOT written: dir\.write — the write failed \((EISDIR|ENOTEMPTY|EEXIST); 1 attempt\)/.test(exitLine) && !said.some((l) => /retrying in/.test(l)),
      `ITEM 3: a failed exit write says its OWN code in both lines — «${failLine.slice(failLine.indexOf('('))}» · «${exitLine.slice(exitLine.indexOf('NOT written'), exitLine.indexOf('NOT written') + 70)}» — and nothing promises a retry`, said);
    w.stop();
  }
  fs.rmSync(T, { recursive: true, force: true });
}

// ── ⑨ THE U4/U5 CURE (lane lg-store-writes, 主开发's as-if-must 2): AN ACT ANSWERED IS AN ACT ANSWERED AT THE STOP ─────────────
// The hub's exit runs exitFlush and process.exit in ONE synchronous run (server.js shutdownNow): an answer waiting on its
// write through a promise's .then never ran there — the agent's command saw a reset and repeated the act (a second job).
// durable()'s `answer` is called INSIDE the writer's settle; the exit's last pass answers every waiter left; a durable()
// asked after it answers at once. RED: a mutant copy whose answer rides a microtask (the promise road).
console.log('⑨ the U4/U5 cure — an answer waiting on its write goes out inside the exit\'s flush (the process leaves in that run)');
await (async () => {
  const Module = require('module'), http = require('http'), { spawn } = require('child_process');
  const SWF = path.join(REPO, 'src/store-writer.js');
  const real = fs.readFileSync(SWF, 'utf8');
  const loadAs = (src) => { const m = new Module(SWF, null); m.filename = SWF; m.paths = Module._nodeModulePaths(path.dirname(SWF)); m._compile(src, SWF); return m.exports; };
  const aSync = 'const done = (ok) => { if (said) return; said = true; clearTimeout(t); resolve(ok); if (answer) { try { answer(ok); } catch (e) { answerThrew(s.name, e); } } };';
  const aLate = 'const done = (ok) => { if (said) return; said = true; clearTimeout(t); resolve(ok); if (answer) Promise.resolve().then(() => answer(ok)); };';
  ok(real.split(aSync).length === 2, '⑨ ANCHOR: durable()\'s one settle line (its answer called in place)');
  const T9 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-cure-'));
  const quiet = { warn: () => { }, log: () => { } };
  // (a) an act handed over, its answer waiting; THE STOP (beginExit, the rank-0 pass, the rest) in ONE synchronous run
  const scene = (SW, tag) => {
    const w = SW.create({ log: quiet });
    const f = path.join(T9, `act-${tag}.json`);
    w.dirty(f, { name: 'act.write', rank: 0, produce: () => '{"act":1}' });
    let answered = null; w.durable(f, { answer: (v) => { answered = v; } });
    w.beginExit(); w.exitFlush({ only: 'rank0' }); w.exitFlush({});
    const atExit = answered;   // read in the exit's own run — where server.js calls process.exit
    w.stop();
    return { atExit, onDisk: fs.existsSync(f) };
  };
  const a = scene(require(SWF), 'cure');
  ok(a.atExit === true && a.onDisk, '⑨ (a) an act\'s answer waiting on its write is answered (true) INSIDE the exit\'s flush — before the run that calls process.exit ends', a);
  const aRed = scene(loadAs(real.replace(aSync, aLate)), 'red');
  ok(aRed.atExit === null && aRed.onDisk, '⑨ (a) CONTROL: the answer on a microtask (the promise road, a mutant copy) ⇒ written, but NOT answered when the process leaves', aRed);
  // (b) a waiter whose version never lands (a store that changes again at every write of it, asked again each time): the
  // exit's last pass answers EVERY waiter before it returns — the last one false; a durable() asked after it answers at once
  {
    const w = require(SWF).create({ log: quiet });
    const c = path.join(T9, 'again.json'); let n = 0; const answers = [];
    w.dirty(c, { name: 'again.write', rank: 0, produce: () => `{"n":${++n}}`, onWritten: (ok2) => { if (ok2) { w.dirty(c, { name: 'again.write' }); w.durable(c, { answer: (v) => answers.push(v) }); } } });
    w.beginExit(); w.exitFlush({ only: 'rank0' }); w.exitFlush({});
    const atExit = answers.slice();
    let after = null; w.durable(c, { answer: (v) => { after = v; } });
    let clean = null; w.durable(path.join(T9, 'never-handed.json'), { answer: (v) => { clean = v; } });
    w.stop();
    ok(atExit.length >= 2 && atExit.length === n && atExit.slice(0, -1).every((v) => v === true) && atExit[atExit.length - 1] === false,
      `⑨ (b) every waiter is answered before exitFlush returns — ${atExit.length} asked, each landed one true, the change left by the last pass FALSE`, { atExit, writes: n });
    ok(after === false && clean === true, '⑨ (b) a durable() asked AFTER the exit\'s last pass answers at once — false for a change still owed (nothing writes it now), true for a file owing nothing', { after, clean });
  }
  // (c) whenDurable: ONE answer for several files — false when any failed (a directory where the file goes), true once all land
  {
    const w = require(SWF).create({ log: quiet });
    const f1 = path.join(T9, 'one.json'), f2 = path.join(T9, 'is-a-dir.json'); fs.mkdirSync(f2); fs.writeFileSync(path.join(f2, 'x'), '1');
    w.dirty(f1, { name: 'one.write', produce: () => '{"one":1}' }); w.dirty(f2, { name: 'dir.write', produce: () => '{"dir":1}' });
    const calls = []; const v1 = await w.whenDurable([f1, f2], { timeoutMs: 5000 }, (v) => calls.push(v));
    w.dirty(f1, { name: 'one.write', produce: () => '{"one":2}' });
    const calls2 = []; const v2 = await w.whenDurable([f1], { timeoutMs: 5000 }, (v) => calls2.push(v));
    w.stop();
    ok(v1 === false && calls.length === 1 && calls[0] === false && v2 === true && calls2.length === 1 && calls2[0] === true && fs.readFileSync(f1, 'utf8') === '{"one":2}',
      '⑨ (c) whenDurable answers ONCE for several files — false when one write failed, true once every file holds its state', { v1, calls, v2, calls2 });
  }
  // (e) THE REAL STOP, end to end: a child process answers an HTTP request from the writer's answer and, in the same run,
  // exits as server.js does — the client READS the answer; RED (the microtask copy): the connection ends with no answer
  const CHILD = path.join(T9, 'exit-answer.cjs');
  fs.writeFileSync(CHILD, `'use strict';   // stale-pins: kept — the child program this leg writes (its own writer calls), no pin on a product file
const Module = require('module'), path = require('path'), fs = require('fs'), http = require('http');
const [SWF, mode, dir] = process.argv.slice(2);
let src = fs.readFileSync(SWF, 'utf8');
if (mode === 'late') src = src.replace(${JSON.stringify(aSync)}, ${JSON.stringify(aLate)});
const m = new Module(SWF, null); m.filename = SWF; m.paths = Module._nodeModulePaths(path.dirname(SWF)); m._compile(src, SWF);
const SW = m.exports, W = SW.storeWriter();   // the process's shared writer (identityAtExit reads its exit)
const f = path.join(dir, 'job-' + mode + '.json');
if (mode === 'failed') { fs.mkdirSync(f); fs.writeFileSync(path.join(f, 'x'), '1'); }   // a directory where the store goes: its write FAILS
const route = (req, res) => {
  W.dirty(f, { name: 'act.write', rank: 0, produce: () => '{"act":1}' });
  W.durable(f, { answer: (saved) => { try {
    if (mode === 'gzip') SW.identityAtExit(res);
    // a body over compression()'s 1 KB threshold (a job record, a Task Group)
    res.json ? res.json({ success: true, saved, ...(mode.startsWith('gzip') ? { pad: 'x'.repeat(4096) } : {}) }) : (res.setHeader('content-type', 'application/json'), res.end(JSON.stringify({ success: true, saved })));
  } catch { } } });
  // THE STOP, as server.js's shutdownNow: beginExit, the rank-0 pass, the rest, process.exit — ONE synchronous run
  W.beginExit(); W.exitFlush({ only: 'rank0' }); W.exitFlush({}); process.exit(0);
};
let srv;
if (mode.startsWith('gzip')) {   // the hub's own stack: express + compression() (server.js mounts it before every route)
  const rq = Module.createRequire(SWF), express = rq('express'), compression = rq('compression');
  const app = express(); app.use(compression()); app.get('/act', route); srv = http.createServer(app);
} else srv = http.createServer(route);
srv.listen(0, '127.0.0.1', () => process.stdout.write(srv.address().port + '\\n'));
`);
  const ask = (mode) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [CHILD, SWF, mode, T9], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', asked = false, over = false;
    ch.stderr.on('data', (d) => { err += d; });
    const end = (v) => { if (over) return; over = true; clearTimeout(timer); try { ch.kill('SIGKILL'); } catch { } resolve(err ? { ...v, stderr: err.slice(0, 400) } : v); };
    const timer = setTimeout(() => end({ error: 'no answer and no end in 10 s' }), 10000);
    ch.stdout.on('data', (d) => {
      out += d; if (asked || !out.includes('\n')) return; asked = true;
      const rq = http.request({ host: '127.0.0.1', port: Number(out.trim()), method: 'GET', path: '/act', headers: { 'accept-encoding': 'gzip' } }, (rs) => { let b = ''; rs.on('data', (x) => { b += x; }); rs.on('end', () => end({ status: rs.statusCode, enc: rs.headers['content-encoding'] || null, body: b })); rs.on('aborted', () => end({ error: 'aborted mid-answer', status: rs.statusCode })); rs.on('error', (e) => end({ error: e.code || e.message })); });
      rq.on('error', (e) => end({ error: e.code || e.message }));
      rq.end();
    });
  });
  const e1 = await ask('cure');
  ok(e1.status === 200 && e1.body === '{"success":true,"saved":true}', '⑨ (e) a real HTTP answer waiting on its write REACHES the client when the process stops in the answer\'s own run (beginExit → exitFlush → process.exit)', e1);
  const e2 = await ask('late');
  ok(!e2.status && !!e2.error, '⑨ (e) CONTROL: the answer on a microtask (a mutant copy) ⇒ the client sees the connection end with NO answer — the reset an agent\'s command repeated', e2);
  // 主开发 (11:16Z): the answer that goes out at the exit says the TRUTH — a write that did not land answers «not on disk»
  const e3 = await ask('failed');
  ok(e3.status === 200 && e3.body === '{"success":true,"saved":false}', '⑨ (e) the answer at the stop says the TRUTH: a write that FAILED at the exit answers saved:false (the routes say notOnDisk) — never a plain success', e3);
  // (f) the hub's own stack (express + compression()) with a client that accepts gzip and a body over 1 KB: compression's zlib
  // is asynchronous, so an answer made inside the exit's flush must go out unencoded (identityAtExit) — RED: without it, lost
  const full = (r) => { try { const o = JSON.parse(r.body); return r.status === 200 && o.saved === true && o.pad.length === 4096; } catch { return false; } };
  const f1 = await ask('gzip');
  ok(full(f1) && !f1.enc, '⑨ (f) through express + compression() with gzip accepted: the answer made at the stop goes out UNENCODED and WHOLE (identityAtExit)', { status: f1.status, enc: f1.enc, len: (f1.body || '').length, error: f1.error });
  const f2 = await ask('gzip-red');
  ok(!full(f2), '⑨ (f) CONTROL: the same answer without identityAtExit ⇒ compression\'s asynchronous zlib loses it when the process leaves', { status: f2.status, enc: f2.enc, len: (f2.body || '').length, error: f2.error });
  fs.rmSync(T9, { recursive: true, force: true });
})();

// ── ⑩ THE MOVED2 CURE 2 (lane lg-store-writes, 主开发's ruling): THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING ──────────────
// ONE helper beside the writer (afterLanding): the act changes memory and marks its store; its irreversible part runs when, and
// only when, the store's state owed at the call has LANDED; a process that dies first leaves the old record and the step never
// ran. (a) a landing HELD past the reply's bound, then landed: the reply says not yet at the bound, the step runs ONCE, after
// the landing (the disk holds the act when it runs) — a held write is not a failed one, nothing is undone; (b) a REAL kill
// (SIGKILL) before the landing: the step never ran and a start finds the old record. RED (each plant asserted by anchored()):
// a copy that runs the step at the act; a copy whose bound drops the step (a held write treated as a failed one).
console.log('⑩ the moved2 cure 2 — afterLanding: a held landing runs its step once, after it lands; a kill before it leaves the old record and no step');
await (async () => {
  const Module = require('module'), { spawn } = require('child_process');
  const { anchored } = await import('./scratch.mjs');
  const SWF = path.join(REPO, 'src/store-writer.js');
  const real = fs.readFileSync(SWF, 'utf8');
  const loadAs = (src) => { const m = new Module(SWF, null); m.filename = SWF; m.paths = Module._nodeModulePaths(path.dirname(SWF)); m._compile(src, SWF); return m.exports; };
  const T10 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-ride-'));
  const quiet = { warn: () => { }, log: () => { } };
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  // the stand-in storage: a write is HELD while a `hold` marker stands in its folder (the real writeJob once it goes)
  const HOLD = path.join(T10, 'hold-worker.cjs');
  fs.writeFileSync(HOLD, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const P = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4));
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const hold = P.join(P.dirname(m.file), 'hold');
  while (fs.existsSync(hold)) Atomics.wait(Z, 0, 0, 10);
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  const AT_ONCE = '(s.afterLanded || (s.afterLanded = [])).push({ version: s.version, go, end: () => reply(false) });';
  const BOUND = "t = setTimeout(() => { t = null; if (!replied) s.notDurable = { why: 'queued', ahead: aheadOf(s), lastMs: s.lastMs || null }; reply(false); }, timeoutMs);";
  const atOnce = anchored(real, AT_ONCE, 'go(); return p;   // MUTANT: the step runs at the act, before its record lands', 'the step rides the landing');
  const dropAtBound = anchored(real, BOUND, BOUND.replace('reply(false); }', 'reply(false); s.afterLanded = (s.afterLanded || []).filter((x) => x.go !== go); }') + '   // MUTANT: a held write at the bound treated as a failed one — its step dropped', 'the bound ends only the reply');
  // (a) HELD, THEN LANDED
  const held = async (SW, tag) => {
    const d = path.join(T10, 'a-' + tag); fs.mkdirSync(d, { recursive: true });
    const f = path.join(d, 'rec.json'); fs.writeFileSync(f, '{"v":0}');
    fs.writeFileSync(path.join(d, 'hold'), '1');
    const w = SW.create({ log: quiet, workerPath: HOLD });
    let v = 1; w.dirty(f, { name: 'rec.write', produce: () => `{"v":${v}}` });
    const seen = [], answered = [];
    const p = w.afterLanding(f, () => { seen.push(fs.readFileSync(f, 'utf8')); return 'stepped'; }, { timeoutMs: 150, answer: (landed, val) => answered.push([landed, val === undefined ? null : val]) });
    await sl(300);   // past the reply's bound — the write still held
    const atBound = { seen: seen.slice(), answered: answered.slice(), r: await p };
    v = 2; w.dirty(f, { produce: () => `{"v":${v}}` });   // a later change while it is held
    fs.unlinkSync(path.join(d, 'hold'));   // the storage answers
    for (let k = 0; k < 80 && w.pending(f); k++) await sl(25);
    await sl(50);
    w.stop();
    return { atBound, seen, answered, disk: fs.readFileSync(f, 'utf8') };
  };
  const a = await held(require(SWF), 'live');
  ok(a.atBound.seen.length === 0 && a.atBound.answered.length === 1 && a.atBound.answered[0][0] === false && a.atBound.r.landed === false,
    '⑩ (a) a landing HELD past the reply\'s bound: the reply says NOT YET (false) at the bound — the step has not run, nothing was undone', a.atBound);
  ok(a.seen.length === 1 && a.seen[0] === '{"v":1}' && a.answered.length === 1 && a.disk === '{"v":2}',
    '⑩ (a) …then the storage answers: the step runs ONCE, after the act\'s record LANDED (the disk held it when the step ran); a later write runs nothing again', a);
  const a1 = await held(loadAs(atOnce), 'at-once');
  ok(a1.atBound.seen.length === 1 && a1.atBound.seen[0] === '{"v":0}', '⑩ (a) CONTROL (a copy running the step at the act): the step ran while the disk still held the OLD record — red', a1.atBound);
  const a2 = await held(loadAs(dropAtBound), 'dropped');
  ok(a2.seen.length === 0, '⑩ (a) CONTROL (a copy whose bound drops the step — a held write treated as a failed one): the record landed and the step NEVER ran — red', { seen: a2.seen, disk: a2.disk });
  // (b) A REAL KILL BEFORE THE LANDING
  const CHILD = path.join(T10, 'ride-child.cjs');
  fs.writeFileSync(CHILD, `'use strict';   // stale-pins: kept — the child program this leg writes (its own writer calls), no pin on a product file
const Module = require('module'), path = require('path'), fs = require('fs');
const [SWF, srcFile, dir, HOLD] = process.argv.slice(2);
const m = new Module(SWF, null); m.filename = SWF; m.paths = Module._nodeModulePaths(path.dirname(SWF)); m._compile(fs.readFileSync(srcFile, 'utf8'), SWF);
const w = m.exports.create({ log: { warn() {}, log() {} }, workerPath: HOLD });
const f = path.join(dir, 'rec.json');
w.dirty(f, { name: 'rec.write', produce: () => '{"v":"new"}' });
w.afterLanding(f, () => fs.writeFileSync(path.join(dir, 'stepped'), '1'), { timeoutMs: null });   // stale-pins: kept — the child's own call, no pin on a product file
process.stdout.write('armed\\n');
setInterval(() => { }, 1000);
`);
  const killed = (src, tag) => new Promise((resolve) => {
    const d = path.join(T10, 'b-' + tag); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'rec.json'), '{"v":"old"}'); fs.writeFileSync(path.join(d, 'hold'), '1');
    const sf = path.join(T10, 'src-' + tag + '.js'); fs.writeFileSync(sf, src);
    const ch = spawn(process.execPath, [CHILD, SWF, sf, d, HOLD], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    ch.stderr.on('data', (x) => { err += x; });
    const safety = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 10000);
    ch.stdout.on('data', (x) => { out += x; if (out.includes('armed')) setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 150); });
    ch.on('exit', (code, sig) => {
      clearTimeout(safety);
      try { fs.unlinkSync(path.join(d, 'hold')); } catch { }
      const w2 = require(SWF).create({ log: quiet });   // A START: a new process's writer reads what the disk holds
      const disk = fs.readFileSync(path.join(d, 'rec.json'), 'utf8'), owed = w2.pending(path.join(d, 'rec.json')); w2.stop();
      resolve({ sig, disk, owed, stepped: fs.existsSync(path.join(d, 'stepped')), ...(err ? { stderr: err.slice(0, 300) } : {}) });
    });
  });
  const b = await killed(real, 'live');
  ok(b.sig === 'SIGKILL' && b.disk === '{"v":"old"}' && !b.stepped && !b.owed,
    '⑩ (b) a REAL kill (SIGKILL) before the landing: the step NEVER ran and a start finds the OLD record — the act simply did not happen', b);
  const b1 = await killed(atOnce, 'at-once');
  ok(b1.sig === 'SIGKILL' && b1.disk === '{"v":"old"}' && b1.stepped, '⑩ (b) CONTROL (a copy running the step at the act): after the same kill the step HAD run over the old record — red', b1);
  fs.rmSync(T10, { recursive: true, force: true });
})();

// ── ⑪ B-9275 UNIT 1 (lane lg-store-writes, 主开发's r1153): A STORE'S NEW BYTES ARE ON DISK BEFORE ITS NAME POINTS AT THEM ────
// A whole write's temp is SYNCED before its close and the rename (src/store-writer-worker.js writeJob — the thread's road, the
// exit's (it waits for the thread) and the writer's main-only road all run it). (a) THE ORDER by a recording stand-in file
// system: open the temp, every byte, fsync the temp, close, rename — RED: today's writeJob (the sync removed, by anchored());
// (b) the exit's flush through the thread, (c) the main-only road, the same order; (d) A SYNC THAT FAILS IS A FAILED WRITE: no
// rename, the temp removed, the store's previous whole version kept, the change still owed (said) and landed by its next write;
// (e) THE SYNC IS OFF THE HUB'S LOOP: the thread's sync waits for a file only a turn of THIS thread's loop writes —
// it is released (the loop turned while the sync ran); CONTROL: the same gate on the main-only road is never released (a sync on
// the main thread holds the loop — the leg can tell). Its cost is the line's measurement (a probe of the real writer, not a leg).
console.log('⑪ B-9275 — a whole write syncs its temp before the rename (every road); a failed sync is a failed write; the sync runs off the loop');
await (async () => {
  const { anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const SW = require(path.join(REPO, 'src/store-writer.js')), WK = require(path.join(REPO, 'src/store-writer-worker.js'));
  const T11 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-sync-'));
  const quiet = { warn: () => { }, log: () => { }, error: () => { } };
  try {
    // THE SCENE'S FILE SYSTEM (one module: the stand-in thread and this thread require it): the real fs, recording a whole write's
    // calls by role (temp / file); <dir>/scene.json asks a FAULT (the sync fails once while <dir>/fault stands) or a GATE (the sync
    // waits — at most gateTurns × 5 ms — until <dir>/release stands: only a turn of the main loop writes it)
    const SCENE = path.join(T11, 'scene-fs.cjs');
    fs.writeFileSync(SCENE, `'use strict';
const fs = require('fs'), P = require('path');
const nap = new Int32Array(new SharedArrayBuffer(4));
module.exports = function sceneFs(m) {
  const dir = P.dirname(m.file); let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(P.join(dir, 'scene.json'), 'utf8')); } catch { return { fs, end() { } }; }
  const order = [], fds = new Map(), role = (p) => (String(p) === m.tmp ? 'temp' : String(p) === m.file ? 'file' : P.basename(String(p)));
  const f = { ...fs,
    openSync: (p, ...a) => { const fd = fs.openSync(p, ...a); fds.set(fd, role(p)); order.push('open ' + role(p)); return fd; },
    writeSync: (fd, ...a) => { const n = fs.writeSync(fd, ...a); if (order[order.length - 1] !== 'write ' + fds.get(fd)) order.push('write ' + fds.get(fd)); return n; },
    fsyncSync: (fd) => {
      order.push('fsync ' + fds.get(fd));
      if (cfg.fault === 'fsync' && fs.existsSync(P.join(dir, 'fault'))) { fs.unlinkSync(P.join(dir, 'fault')); throw Object.assign(new Error('i/o error at the sync'), { code: 'EIO' }); }
      if (cfg.gateTurns) { fs.writeFileSync(P.join(dir, 'in-sync'), '1'); for (let k = 0; k < cfg.gateTurns && !fs.existsSync(P.join(dir, 'release')); k++) Atomics.wait(nap, 0, 0, 5); order.push(fs.existsSync(P.join(dir, 'release')) ? 'released by the main loop' : 'never released'); }
      return fs.fsyncSync(fd);
    },
    closeSync: (fd) => { order.push('close ' + fds.get(fd)); return fs.closeSync(fd); },
    renameSync: (a, b) => { order.push('rename ' + role(a) + ' > ' + role(b)); return fs.renameSync(a, b); },
  };
  return { fs: f, end(err) { fs.appendFileSync(P.join(dir, 'order.ndjson'), JSON.stringify({ order, err: err ? err.code || err.message : null, fileAfter: fs.existsSync(m.file) ? fs.readFileSync(m.file, 'utf8') : null, tempLeft: fs.existsSync(m.tmp) }) + '\\n'); } };
};
`);
    // the stand-in thread: the product's handler — the REAL writeJob over the scene's fs
    const STAND = path.join(T11, 'sync-worker.cjs');
    fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const sceneFs = require(${JSON.stringify(SCENE)});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); let err = null, ms = 0;
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } }
  else {
    const sc = sceneFs(m), t0 = process.hrtime.bigint();
    try { writeJob(m, sc.fs); } catch (e) { err = { code: e.code || null, message: e.message }; if (!m.append) { try { fs.unlinkSync(m.tmp); } catch { } } }
    ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (!m.append) sc.end(err);
  }
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 1);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
    const DIE = path.join(T11, 'die-worker.cjs');   // a thread that dies at its first message: the writer's main-only road (restartsMax 0)
    fs.writeFileSync(DIE, `require('worker_threads').parentPort.on('message', () => process.exit(3));\n`);
    const sceneFs = require(SCENE);
    const orders = (dir) => { try { return fs.readFileSync(path.join(dir, 'order.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    const scene = (name, cfg) => { const dir = path.join(T11, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(cfg)); const file = path.join(dir, 'store.json'); fs.writeFileSync(file, '{"v":1}'); return { dir, file }; };
    const syncedFirst = (o) => { const ix = (s) => (o ? o.order.indexOf(s) : -1); return ix('open temp') >= 0 && ix('write temp') > ix('open temp') && ix('fsync temp') > ix('write temp') && ix('close temp') > ix('fsync temp') && ix('rename temp > file') > ix('close temp'); };
    const said = (o) => (o ? o.order.join(' → ') : 'no write recorded');
    // a main-loop poller: when the scene's sync stands in its gate, release it (this callback runs only when the loop turns)
    const releaser = (dir) => { let done = false; const iv = setInterval(() => { if (!done && fs.existsSync(path.join(dir, 'in-sync'))) { done = true; fs.writeFileSync(path.join(dir, 'release'), '1'); } }, 2); return () => clearInterval(iv); };

    // (a) THE ORDER — the real writeJob, and today's (the sync removed) as the RED copy
    const srcW = fs.readFileSync(path.join(REPO, 'src/store-writer-worker.js'), 'utf8');
    const M11 = mutantCopies('store-r4-sync', REPO);
    const todayPath = M11.write('src/store-writer-worker.js', anchored(srcW, 'try { writeAll(fs, fd, m.parts); try { fs.fsyncSync(fd); } catch (e) { noSync = unsynced(e); } } catch (e) { err = e; }', 'try { writeAll(fs, fd, m.parts); } catch (e) { err = e; }', 'today: a whole write renamed with no sync'), 'no-sync');   // stale-pins: kept (today's line, the RED copy)
    const direct = (W, name) => { const sc0 = scene(name, {}), m = { file: sc0.file, tmp: sc0.file + '.tmp-a', parts: ['{"v":2}'], mode: 0o600 }; const sc = sceneFs(m); let err = null; try { W.writeJob(m, sc.fs); } catch (e) { err = e; } sc.end(err); return orders(sc0.dir)[0]; };
    const a = direct(WK, 'a-real'), aRed = direct(require(todayPath), 'a-today');
    ok(syncedFirst(a) && a.err === null && a.fileAfter === '{"v":2}' && !a.tempLeft, `⑪ (a) THE ORDER (a recording stand-in): a whole write syncs its temp before the close and the rename — ${said(a)}`, a);
    ok(aRed && !aRed.order.includes('fsync temp') && aRed.fileAfter === '{"v":2}' && !syncedFirst(aRed), `⑪ (a) RED (today's writeJob): the store's name pointed at bytes never synced — ${said(aRed)}`, aRed);

    // (b) the exit's flush (through the thread) · (c) the main-only road + the loop CONTROL · (d) a failed sync · (e) the loop leg —
    // side by side, each its own folder, writer and thread
    const exitRoad = async () => {
      const s = scene('b-exit', {}), warm = path.join(T11, 'b-warm.json');
      const w = SW.create({ log: quiet, workerPath: STAND });
      try {
        w.dirty(warm, { name: 'warm.write', produce: () => '{"w":1}', debounceMs: 0 }); await w.durable(warm, { timeoutMs: 8000 });   // the thread up
        w.dirty(s.file, { name: 'exit.write', produce: () => '{"v":2}', debounceMs: 60000 });
        const r = w.exitFlush();
        return { o: orders(s.dir)[0], written: (r && r.written) || [] };
      } finally { try { w.stop(); } catch { } }
    };
    const mainRoad = async () => {
      const s = scene('c-main', { gateTurns: 20 }), sc = sceneFs({ file: s.file, tmp: `${s.file}.tmp-${process.pid}` });
      const w = SW.create({ log: quiet, fs: sc.fs, workerPath: DIE, restartsMax: 0 }), stop = releaser(s.dir);
      try {
        w.dirty(s.file, { name: 'main.write', produce: () => '{"v":2}', debounceMs: 0 });
        const landed = await w.durable(s.file, { timeoutMs: 8000 }); sc.end(null);
        return { o: orders(s.dir)[0], landed, mode: w.mode ? w.mode() : null };
      } finally { stop(); try { w.stop(); } catch { } }
    };
    const failedSync = async () => {
      const s = scene('d-fail', { fault: 'fsync' }); fs.writeFileSync(path.join(s.dir, 'fault'), '1');
      const lines = [], w = SW.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } }, workerPath: STAND });
      try {
        w.dirty(s.file, { name: 'fail.write', produce: () => '{"v":2}', debounceMs: 0 });
        const first = await w.durable(s.file, { timeoutMs: 8000 });
        const owed = w.pending(s.file), between = fs.readFileSync(s.file, 'utf8');
        const again = w.flushSync([s.file]);   // the NEXT write of the owed change (a store's close, the exit, the 1 s retry: one road)
        return { first, owed, between, again: (again && again.written) || [], after: w.pending(s.file), os: orders(s.dir), bytes: fs.readFileSync(s.file, 'utf8'), lines };
      } finally { try { w.stop(); } catch { } }
    };
    const loopLeg = async () => {
      const s = scene('e-loop', { gateTurns: 1000 });
      const w = SW.create({ log: quiet, workerPath: STAND }), stop = releaser(s.dir);
      try {
        w.dirty(s.file, { name: 'loop.write', produce: () => '{"v":2}', debounceMs: 0 });
        const landed = await w.durable(s.file, { timeoutMs: 10000 });
        return { o: orders(s.dir)[0], landed };
      } finally { stop(); try { w.stop(); } catch { } }
    };
    const [b, c, d, e] = await Promise.all([exitRoad(), mainRoad(), failedSync(), loopLeg()]);
    ok(syncedFirst(b.o) && b.o.fileAfter === '{"v":2}' && b.written.includes('exit.write'), `⑪ (b) the exit's flush (through the thread): ${said(b.o)}`, b);
    ok(syncedFirst(c.o) && c.o.fileAfter === '{"v":2}' && c.landed === true && c.mode === 'main', `⑪ (c) the writer's main-only road (its thread gone): ${said(c.o)}`, c);
    const [d1, d2] = d.os;
    ok(d.os.length === 2 && d1.err === 'EIO' && d1.order.includes('fsync temp') && !d1.order.some((x) => /^rename/.test(x)) && d1.fileAfter === '{"v":1}' && !d1.tempLeft
      && d.first === false && d.owed === true && d.between === '{"v":1}' && d.again.includes('fail.write') && d.lines.some((l) => /fail\.write not written \(EIO; attempt 1\) — kept in memory, retrying in 1 s/.test(l))
      && syncedFirst(d2) && d2.err === null && d.after === false && d.bytes === '{"v":2}',
      `⑪ (d) A SYNC THAT FAILS IS A FAILED WRITE: nothing renamed (${said(d1)}), the temp removed, the store still its previous whole version (${d1 && d1.fileAfter}); its waiter told «not landed» (${d.first}), the change still owed (${d.owed}) and said («${(d.lines.find((l) => /fail\.write/.test(l)) || '').slice(0, 110)}»); its next write landed it (${d.bytes})`, d);
    ok(e.landed === true && e.o && e.o.order.includes('released by the main loop') && syncedFirst(e.o), `⑪ (e) THE SYNC IS OFF THE HUB'S LOOP: the thread's sync waited for a file only a turn of the main loop writes, and was released — the loop turned while it synced (${said(e.o)})`, e);
    ok(c.o && c.o.order.includes('never released'), `⑪ (e) CONTROL: the same gate on the main-only road was never released in its 100 ms — a sync on the main thread holds the loop, the leg above can tell (${said(c.o)})`, c.o);
  } finally { fs.rmSync(T11, { recursive: true, force: true }); }
})();

// ── ⑫ 主开发 r5002 / r5010 — A SYNC THE FILE SYSTEM DOES NOT DO AT ALL LANDS, SAID ONCE; EVERY OTHER FAILED SYNC IS A FAILED WRITE ─────
// ONE SET FOR BOTH DOORS: src/fd-close.js SYNC_UNSUPPORTED (the hub door's constant), read by the writer's thread too — the kernel's
// own word for a file system with NO sync operation (fs/sync.c vfs_fsync_range: -EINVAL), plus ENOTSUP / EOPNOTSUPP / ENOSYS. A PLACED
// file system (a folder's place.json: the code, and which call refuses it); a stand-in thread runs the REAL thread's answer (serve())
// over it, so each leg reads the real cells and the real message:
//   (a) for EACH code: TEN writes of one store — the first by a synchronous flush (the cells' road: said before any turn of the loop),
//       nine by durable() — and a second store in another such folder: every write lands (its bytes, no temp left, nothing owed) and
//       ONE line is said over all of them, in the hub door's spelling; (b) ten durable() writes (the message's road alone); (c) the same
//       code at the append, the pieces, the rewrite (its temp; its folder's sync — the let-be codes landed and named, ENOSYS there still
//       ERENAMEDNOSYNC, as before), and the main-thread road (one line); (d) a placed EIO / EROFS at the same sync is still a FAILED
//       write (the old bytes, owed, «not written (EIO; attempt 1)», no no-sync line); (e) a WRITE's own EINVAL is never judged by the set.
//   REDS (anchored copies): the base's law (every refused sync a failed write: nothing lands); the said-once flag cut (said at every
//   write); the cells' reading cut (the waited road says nothing); every code let through (EIO lands); the write's own error judged
//   by the set (the write's EINVAL lands).
console.log('⑫ r5010 — a sync the file system does not do lands, said once a writer; any other failed sync, and a write\'s own error, is a failed write');
await (async () => {
  const { anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const SW = require(path.join(REPO, 'src/store-writer.js')), WK = require(path.join(REPO, 'src/store-writer-worker.js')), FC = require(path.join(REPO, 'src/fd-close.js'));
  const T12 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-nosync-'));
  try {
    const CODES = [...FC.SYNC_UNSUPPORTED].sort(), LET_BE = ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'];   // the folder sync's own let-be codes of the set (unchanged)
    const wsrc = fs.readFileSync(path.join(REPO, 'src/store-writer-worker.js'), 'utf8'), swsrc = fs.readFileSync(path.join(REPO, 'src/store-writer.js'), 'utf8');
    ok(CODES.join() === 'EINVAL,ENOSYS,ENOTSUP,EOPNOTSUPP' && wsrc.includes("const { SYNC_UNSUPPORTED } = require('./fd-close.js');") && typeof WK.serve === 'function',
      `⑫ ONE SET FOR BOTH DOORS: the writer's thread reads the hub door's own constant (${CODES.join(', ')}) — no list of its own; its answer is one exported function`);
    const PLACE = path.join(T12, 'placed-fs.cjs');
    fs.writeFileSync(PLACE, `'use strict';
// a file system whose refusals are PLACED by a folder's place.json {code, at: 'file' | 'dir' | 'write'} — a stand-in, never product code
const fs = require('fs'), P = require('path');
const at = new Map();
const cfgOf = (dir) => { try { return JSON.parse(fs.readFileSync(P.join(dir, 'place.json'), 'utf8')); } catch { return null; } };
const placed = (fd, kind) => { const w = at.get(fd); if (!w) return null; const c = cfgOf(w.dir ? w.p : P.dirname(w.p)); return c && c.at === kind ? c.code : null; };
module.exports = { ...fs,
  openSync(p, ...a) { const fd = fs.openSync(p, ...a); let dir = false; try { dir = fs.fstatSync(fd).isDirectory(); } catch { } at.set(fd, { p: String(p), dir }); return fd; },
  closeSync(fd) { at.delete(fd); return fs.closeSync(fd); },
  writeSync(fd, ...a) { const c = placed(fd, 'write'); if (c) throw Object.assign(new Error('placed: the write refused'), { code: c }); return fs.writeSync(fd, ...a); },
  fsyncSync(fd) { const w = at.get(fd); const c = placed(fd, w && w.dir ? 'dir' : 'file'); if (c) throw Object.assign(new Error('placed: the sync refused'), { code: c }); return fs.fsyncSync(fd); },
};
`);
    const PL = require(PLACE);
    const standIn = (wkPath, tag) => { const f = path.join(T12, `stand-${tag}.cjs`); fs.writeFileSync(f, `'use strict';
const { parentPort, workerData } = require('worker_threads');
require(${JSON.stringify(wkPath)}).serve(parentPort, new Int32Array(workerData.sab), require(${JSON.stringify(PLACE)}));
`); return f; };
    const DIE = path.join(T12, 'die-worker.cjs');   // a thread that dies at its first message: the writer's main-only road (restartsMax 0)
    fs.writeFileSync(DIE, `require('worker_threads').parentPort.on('message', () => process.exit(3));\n`);
    const M = mutantCopies('store-r4-nosync', REPO);
    const UNSYNCED = "const unsynced = (e) => { if (!e || !SYNC_UNSUPPORTED.has(e.code)) throw e; return e.code; };";
    const WHOLE = 'try { writeAll(fs, fd, m.parts); try { fs.fsyncSync(fd); } catch (e) { noSync = unsynced(e); } } catch (e) { err = e; }';
    const STAND = standIn(path.join(REPO, 'src/store-writer-worker.js'), 'real');
    const STAND_BASE = standIn(M.write('src/store-writer-worker.js', anchored(wsrc, UNSYNCED, 'const unsynced = (e) => { throw e; };', 'the base\'s law: every refused sync a failed write'), 'base-law'), 'base-law');
    const STAND_ALL = standIn(M.write('src/store-writer-worker.js', anchored(wsrc, UNSYNCED, 'const unsynced = (e) => { if (!e) throw e; return e.code || \'EIO\'; };', 'every code let through'), 'all-through'), 'all-through');
    const STAND_WRITE = standIn(M.write('src/store-writer-worker.js', anchored(wsrc, WHOLE, 'try { writeAll(fs, fd, m.parts); fs.fsyncSync(fd); } catch (e) { try { noSync = unsynced(e); } catch { err = e; } }', 'the write\'s own error judged by the set'), 'write-judged'), 'write-judged');
    const SW_EVERY = M.load('src/store-writer.js', anchored(swsrc, '    if (!code || noSyncSaid) return;\n', '    if (!code) return;\n', 'the said-once flag cut'), 'every');
    const SW_NOCELL = M.load('src/store-writer.js', anchored(swsrc, "    if (s && Atomics.load(S, 2) !== 2 && Atomics.load(S, 3) > 0) noSyncSeen(s, jobErrorCode(l));   // r5010: a LANDED job's no-sync code rides the same cells\n", '', 'the cells\' reading cut'), 'nocell');
    let nDir = 0;
    const folder = (code, kind = 'file', bytes = '{"v":0}') => { const d = path.join(T12, `d${++nDir}`); fs.mkdirSync(d); if (code) fs.writeFileSync(path.join(d, 'place.json'), JSON.stringify({ code, at: kind })); const f = path.join(d, 'store.json'); fs.writeFileSync(f, bytes); return { d, f }; };
    const sink = () => { const lines = []; return { lines, log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } } }; };
    const noSyncOf = (lines) => lines.filter((l) => / its file system does not do a sync \(/.test(l));
    const wordsOf = (name, code) => `[store-write] ${FC.syncUnsupportedWords(name, code)} (said once: every later write of this writer whose sync is refused so lands the same way)`;
    const temps = (d) => fs.readdirSync(d).filter((n) => n.includes('.tmp-'));
    const tenWrites = async (SWm, stand, code) => {
      const { lines, log } = sink(), w = SWm.create({ log, workerPath: stand }), warm = folder(null), A = folder(code), B = folder(code);
      try {
        w.dirty(warm.f, { name: 'warm.write', produce: () => '{"w":1}', debounceMs: 0 }); const warmed = await w.durable(warm.f, { timeoutMs: 8000 });   // the thread up, nothing placed
        let v = 1;
        w.dirty(A.f, { name: 'a.write', produce: () => JSON.stringify({ v }), debounceMs: 0 });
        const r0 = w.flushSync([A.f]), atOnce = noSyncOf(lines).length, first = fs.readFileSync(A.f, 'utf8');   // the waited road: said from the cells, before a turn of the loop
        const landed = [];
        for (v = 2; v <= 10; v++) { w.dirty(A.f, { name: 'a.write', produce: () => JSON.stringify({ v }), debounceMs: 0 }); landed.push(await w.durable(A.f, { timeoutMs: 8000 })); }
        w.dirty(B.f, { name: 'b.write', produce: () => '{"b":1}', debounceMs: 0 }); const bLanded = await w.durable(B.f, { timeoutMs: 8000 });
        await new Promise((r) => setTimeout(r, 30));   // the flushed job's own message is read too: it says nothing more
        return { warmed, written: (r0 && r0.written) || [], atOnce, first, landed, bLanded, bytes: fs.readFileSync(A.f, 'utf8'), bBytes: fs.readFileSync(B.f, 'utf8'), owed: !!(w.pending(A.f) || w.pending(B.f)), left: temps(A.d).concat(temps(B.d)), said: noSyncOf(lines) };
      } finally { try { w.stop(); } catch { } }
    };
    const tenOk = (r, code) => r.warmed === true && r.written.includes('a.write') && r.first === '{"v":1}' && r.atOnce === 1 && r.landed.length === 9 && r.landed.every((x) => x === true)
      && r.bLanded === true && r.bytes === '{"v":10}' && r.bBytes === '{"b":1}' && !r.owed && !r.left.length && r.said.length === 1 && r.said[0] === wordsOf('a.write', code);
    const msgRoad = async (code) => {
      const { lines, log } = sink(), w = SW.create({ log, workerPath: STAND }), A = folder(code);
      try { const landed = []; for (let v = 1; v <= 10; v++) { w.dirty(A.f, { name: 'm.write', produce: () => JSON.stringify({ v }), debounceMs: 0 }); landed.push(await w.durable(A.f, { timeoutMs: 8000 })); }
        return { landed, bytes: fs.readFileSync(A.f, 'utf8'), owed: !!w.pending(A.f), said: noSyncOf(lines) };
      } finally { try { w.stop(); } catch { } }
    };
    const mainRoad = async (code) => {
      const { lines, log } = sink(), w = SW.create({ log, fs: PL, workerPath: DIE, restartsMax: 0 }), A = folder(code);
      try { const landed = []; for (let v = 1; v <= 3; v++) { w.dirty(A.f, { name: 'main.write', produce: () => JSON.stringify({ v }), debounceMs: 0 }); landed.push(await w.durable(A.f, { timeoutMs: 8000 })); }
        return { landed, bytes: fs.readFileSync(A.f, 'utf8'), said: noSyncOf(lines), mode: w.mode ? w.mode() : null };
      } finally { try { w.stop(); } catch { } }
    };
    const failRoad = async (stand, code, kind = 'file') => {
      const { lines, log } = sink(), w = SW.create({ log, workerPath: stand }), A = folder(code, kind);
      try { w.dirty(A.f, { name: 'f.write', produce: () => '{"v":1}', debounceMs: 0 }); const landed = await w.durable(A.f, { timeoutMs: 8000 });
        return { landed, bytes: fs.readFileSync(A.f, 'utf8'), owed: !!w.pending(A.f), left: temps(A.d), said: noSyncOf(lines), failed: lines.filter((l) => l.startsWith(`[store-write] f.write not written (${code}; attempt 1) — kept in memory`)).length };
      } finally { try { w.stop(); } catch { } }
    };
    const failOk = (r) => r.landed === false && r.bytes === '{"v":0}' && r.owed && !r.left.length && !r.said.length && r.failed === 1;
    // (c) the other roads, called in THIS thread over the placed fs: the append, the pieces, the rewrite's temp and its folder's sync
    const roads = (W0, code) => {
      const run = (f) => { try { return { r: f(), e: null }; } catch (e) { return { r: null, e: e && e.code }; } };
      const ap = folder(code, 'file', 'x\n'), a = run(() => W0.writeJob({ file: ap.f, parts: SW.partsOf({ append: 'y\n' }).parts, append: true }, PL));
      const pc = folder(code), p = run(() => W0.pieceJob({ id: 1, first: true, last: true, file: pc.f, tmp: pc.f + '.tmp-p', parts: ['{"p":1}'] }, null, PL));
      const rwOf = (kind) => { const s = folder(code, kind, 'a1\nb22\n'), pr = SW.partsOf({ rewrite: { ranges: Float64Array.from([0, 3]), size: 7 }, then: 'F6\n' }); return { ...run(() => W0.writeJob({ file: s.f, tmp: s.f + '.tmp-r', parts: pr.parts, append: false, rewrite: pr.rewrite }, PL)), bytes: fs.readFileSync(s.f, 'utf8'), left: temps(s.d) }; };
      return { append: { ...a, bytes: fs.readFileSync(ap.f, 'utf8') }, pieces: { ...p, bytes: fs.readFileSync(pc.f, 'utf8'), left: temps(pc.d) }, rewrite: rwOf('file'), folder: rwOf('dir') };
    };
    const roadsOk = (o, code) => !o.append.e && o.append.r && o.append.r.noSync === code && o.append.bytes === 'x\ny\n'
      && !o.pieces.e && o.pieces.r && o.pieces.r.done && !o.pieces.r.done.err && o.pieces.r.done.noSync === code && o.pieces.bytes === '{"p":1}' && !o.pieces.left.length
      && !o.rewrite.e && o.rewrite.r && o.rewrite.r.noSync === code && o.rewrite.bytes === 'a1\nF6\n' && !o.rewrite.left.length
      && (LET_BE.includes(code) ? !o.folder.e && o.folder.r && o.folder.r.noSync === code : o.folder.e === 'ERENAMEDNOSYNC') && o.folder.bytes === 'a1\nF6\n';
    const per = await Promise.all(CODES.map(async (code) => ({ code, ten: await tenWrites(SW, STAND, code), msg: await msgRoad(code), main: await mainRoad(code), roads: roads(WK, code) })));
    for (const { code, ten, msg, main, roads: o } of per) {
      ok(tenOk(ten, code), `⑫ (a) ${code}: ten writes of a store (the first by a synchronous flush, said from the cells before a turn of the loop: ${ten.atOnce}) and a second store's — every one landed, nothing owed, no temp left, ONE line («${(ten.said[0] || '').slice(0, 120)}»)`, ten);
      ok(msg.landed.length === 10 && msg.landed.every((x) => x === true) && msg.bytes === '{"v":10}' && !msg.owed && msg.said.length === 1 && msg.said[0] === wordsOf('m.write', code), `⑫ (b) ${code}: ten durable() writes — the message's road says it once (${msg.said.length})`, msg);
      ok(roadsOk(o, code), `⑫ (c) ${code}: the append, the pieces and the rewrite's temp land with the code in their answer; the rewrite's folder sync ${LET_BE.includes(code) ? 'lets it be and names it' : 'is ERENAMEDNOSYNC as before (not its let-be code)'}`, o);
      ok(main.mode === 'main' && main.landed.every((x) => x === true) && main.bytes === '{"v":3}' && main.said.length === 1 && main.said[0] === wordsOf('main.write', code), `⑫ (c) ${code}: the main-thread road (its thread gone) lands and says it once`, main);
    }
    const [eio, erofs, wInval] = await Promise.all([failRoad(STAND, 'EIO'), failRoad(STAND, 'EROFS'), failRoad(STAND, 'EINVAL', 'write')]);
    ok(failOk(eio) && failOk(erofs), `⑫ (d) a placed EIO / EROFS at the same sync is still a FAILED write: the old bytes, owed, «not written (code; attempt 1)», no no-sync line`, { eio, erofs });
    ok(failOk(wInval), `⑫ (e) a WRITE's own EINVAL is never judged by the set: a failed write`, wInval);
    // REDS
    const [rBase, rEvery, rNoCell, rAll, rWrite] = await Promise.all([failRoad(STAND_BASE, 'EINVAL'), tenWrites(SW_EVERY, STAND, 'EINVAL'), tenWrites(SW_NOCELL, STAND, 'EINVAL'), failRoad(STAND_ALL, 'EIO'), failRoad(STAND_WRITE, 'EINVAL', 'write')]);
    ok(rBase.landed === false && rBase.owed && rBase.failed === 1, `⑫ RED (the base's law): a sync the file system does not do FAILS the write — nothing lands, it is owed and retried («not written (EINVAL; attempt 1)»)`, rBase);
    ok(!tenOk(rEvery, 'EINVAL') && rEvery.said.length >= 11, `⑫ RED (the said-once flag cut): said at every write — ${rEvery.said.length} lines over 11 writes (the flushed one by its cells and again by its message)`, rEvery.said.length);
    ok(!tenOk(rNoCell, 'EINVAL') && rNoCell.atOnce === 0 && rNoCell.said.length === 1, `⑫ RED (the cells' reading cut): the waited road says nothing at once (${rNoCell.atOnce}) — the line comes only with the message`, { atOnce: rNoCell.atOnce, said: rNoCell.said.length });
    ok(!failOk(rAll) && rAll.landed === true, `⑫ RED (every code let through): a placed EIO lands (${rAll.landed})`, rAll);
    ok(!failOk(rWrite) && rWrite.landed === true, `⑫ RED (the write's own error judged by the set): the write's EINVAL lands (${rWrite.landed}, ${JSON.stringify(rWrite.bytes)})`, rWrite);
  } finally { fs.rmSync(T12, { recursive: true, force: true }); }
})();

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
