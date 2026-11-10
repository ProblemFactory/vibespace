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
// Run: node scripts/test-store-writer-r4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };

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
  Atomics.store(S, 0, m.id); let err = null;
  if (m.ev === 'write' && /index\\.json$/.test(m.file) && fs.existsSync(P.join(P.dirname(m.file), 'blockix'))) err = { code: 'EIO', message: 'the index is unwritable in this scene' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { writeJob(m, fs); } catch (e) { err = { code: e.code || null, message: e.message }; } }
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms: 0, err });
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
    if (src.split(FROM).length === 2) { fs.writeFileSync(mp, src.replace(FROM, "const r = writeHere(s, p, since) ? 'ok' : 'failed';").replace(/require\('\.\//g, `require('${path.join(REPO, 'src')}/`).replace(/__dirname/g, JSON.stringify(path.join(REPO, 'src')))); mut = run(require(mp)); }
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
    const bad = rows.filter((r) => r.timedOut > 0), waits = rows.reduce((n, r) => n + r.waits, 0);
    ok(rows.every((r) => r.onDisk) && !bad.length, `THE ONE FIX: 20 runtime flushSync of fast writes on the writer's real thread — ${waits} waits, ${bad.length} of the 20 flushes had a wait end by its 50 ms poll (d468bf5b1: 20 of 20)`, { bad: bad.slice(0, 5), rows: rows.slice(0, 3) });
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
