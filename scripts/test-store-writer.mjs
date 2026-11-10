#!/usr/bin/env node
// test-store-writer — lane hub-loop-stalls commit 2, «NO STORE WRITE HOLDS THE MAIN THREAD». FAST: PURE src/store-pace.js
// and the writer (src/store-writer.js) in process with its REAL thread — a slow storage is a stand-in thread that
// sleeps before each write (Atomics.wait), never a delay on this box's disk.
//   ① THE PACE (PURE): the gap stated for the size (½ s per MB, 0.5 … 30 s), when a dirty store is due (its debounce, its
//      gap after the last write, its backoff after a failure), which store goes next, the exit line's words
//   ② COALESCE: a burst of 50 changes is ONE write of the latest state; a store's own order: every write a later state
//   ③ THE PACE, run: a store changing every 20 ms is written at its gap, never back to back
//   ④ ONE WRITE IN FLIGHT ACROSS ALL STORES, on the writer's thread — and THE THREADPOOL LAW: 20 stores dirty on a slow
//      storage (300 ms a write) ⇒ an unrelated fs.promises.stat and a dns lookup still answer in milliseconds, and the
//      main loop never waits (its largest gap stays small)
//   ⑤ A FAILED WRITE never throws: said («… not written (EISDIR; attempt 1) — kept in memory, retrying in 1 s»), the
//      previous file intact, retried until it lands
//   ⑥ THE EXIT: beginExit defers a store's own flush; exitFlush waits for the write in flight (no bound of ours — round
//      6), writes every dirty store once, oldest change first, and its ONE line names what it wrote; forget() drops a
//      pending write and lets one in flight land before the unlink
//   ⑦ THE USAGE CURSOR FOLLOWS ITS APPEND (round 2, smaller 1): the real ledger walk on a 500 ms-a-write storage with four
//      other stores due — a «kill» 1.75 s after the walk's commit leaves NO duplicate row at the re-walk (the cursors were
//      the writer's next write); the same walk with the cursors paced (a mutant) leaves the walk's rows twice
//   ⑧ ROUND 6 — NO BOUND OF OURS CUTS AN EXIT THAT IS STILL WRITING (主开发's law), judged by the STORES ON DISK against
//      MASTER'S ROAD by the same driver (a child running server.js's exit roads with the writer, or 05082bbd0's — the
//      moved stores written synchronously): E1 a stop with moved stores OWED at the signal — a pod's shape, systemd's,
//      moved-only slow writes, the real pod numbers once — every store on disk, code 0; E2 a crash with no stop asked:
//      slow but inside the grace ⇒ it finishes; hung ⇒ ended at the crash + the grace with «after the crash»; a crash
//      after a stop ⇒ the keeper ends nothing; a stop after a crash ⇒ the crash's deadline, one line; a stop hang: the
//      line at the grace less its slack, the process alive until the manager's kill, the keeper ASLEEP after its line
//      (E3 b, CPU ticks); the install tree + the data dir hanging; MUTANT «the keeper kills after a stop» red by name; a
//      process that is not the server has no keeper (E3 c); the crash road's order; round 4's whole matrix
// Run: node scripts/test-store-writer.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns';
import { createRequire } from 'node:module';
import { spawnSync, spawn, execFileSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const P = require(path.join(REPO, 'src/store-pace.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-store-writer-'));
const MB = 1024 * 1024;
// the slow storage: the writer's own thread script, sleeping `delayMs` before each write and recording how many run at once
const SLOW = path.join(ROOT, 'slow-worker.cjs');
fs.writeFileSync(SLOW, `'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4));
const delay = Number(process.env.VS_SLOW_MS || 0);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id);
  const t0 = process.hrtime.bigint(); let err = null;
  if (delay) Atomics.wait(Z, 0, 0, delay);   // the storage takes its time — on THIS thread
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.add(S, 1, 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
const loopWatch = () => { let last = performance.now(), max = 0; const iv = setInterval(() => { const t = performance.now(); max = Math.max(max, t - last); last = t; }, 5); return () => { clearInterval(iv); return Math.round(max); }; };

try {
  // ── ① THE PACE ────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('① the pace, stated for the size (PURE)');
  {
    const g = [1024, 2 * MB, 22.3 * MB, 100 * MB, 0, NaN].map((b) => P.minGapMs(b));
    ok(JSON.stringify(g) === JSON.stringify([500, 1000, 11150, 30000, 500, 500]), 'the minimum gap: 1 KB 0.5 s · 2 MB 1 s · the measured 22.3 MB index 11.2 s · 100 MB 30 s (the ceiling) · unknown the floor', g);
    ok(P.maxAgeMs(22.3 * MB, 1300) === 12450 && P.maxAgeMs(1024, 0) === 500, 'the oldest unwritten change\'s age: the gap + the write in flight (the 22.3 MB index whose rename takes 1.3 s: 12.5 s)');
    ok(P.dueAt({ dirtySince: 1000, debounceMs: 100 }) === 1100 && P.dueAt({ dirtySince: 1000, lastEndAt: 900, bytes: 22.3 * MB, debounceMs: 100 }) === 900 + 11150 && P.dueAt({ dirtySince: 1000, lastEndAt: 0, bytes: 1024, debounceMs: 500 }) === 1500,
      'due: never before its own debounce from the first unwritten change, never sooner than its gap after the last write ended');
    ok(P.dueAt({ dirtySince: 0, debounceMs: 0, failures: 3, failedAt: 5000 }) === 9000 && P.retryMs(1) === 1000 && P.retryMs(7) === 60000 && P.retryMs(30) === 60000, 'after a failure, its backoff: 1, 2, 4 … 60 s');
    const nx = P.nextOf([{ name: 'a', due: 50, dirtySince: 10 }, { name: 'b', due: 20, dirtySince: 15 }, { name: 'c', due: 20, dirtySince: 5 }, { name: 'd', due: 999, dirtySince: 0 }], 100);
    ok(nx.name === 'c' && P.nextOf([{ name: 'x', due: 101, dirtySince: 0 }], 100) === null, 'the next store: the most overdue, then the oldest change; none due ⇒ none');
    ok(P.exitLine({ written: ['a', 'b'], left: [], ms: 12.4 }) === '[store-write] exit: 2 stores written in 12 ms (a, b)'
      && P.exitLine({ written: ['a'], left: [{ name: 'channels-index.write', why: 'the write failed (1 attempt)' }], ms: 2003 }) === '[store-write] exit: 1 store written in 2003 ms (a); NOT written: channels-index.write — the write failed (1 attempt) — their last changes are lost; the files hold their previous whole version',
      'the exit line: what was written, and BY NAME a store whose write FAILED (the files keep their previous WHOLE version) — round 6: no bound of ours leaves one');
  }
  // ── ② COALESCE, ORDER ─────────────────────────────────────────────────────────────────────────────────────────────
  console.log('② a burst is one write of the latest state; each write a later state');
  {
    const w = SW.create({ log: { warn() {} } }), f = path.join(ROOT, 'burst.json');
    let state = 0, produced = 0;
    for (let i = 1; i <= 50; i++) { state = i; w.dirty(f, { name: 'burst', produce: () => { produced++; return JSON.stringify({ state }); }, debounceMs: 50 }); }
    await sleep(400);
    const on = JSON.parse(fs.readFileSync(f, 'utf8')).state, st = w.stats().find((x) => x.file === f);
    ok(on === 50 && produced === 1 && st.writes === 1, `50 changes in one burst ⇒ ONE write of the latest state (on disk ${on}; produced ${produced}×)`);
    const seen = [];
    for (let i = 51; i <= 56; i++) { state = i; w.dirty(f, { produce: () => JSON.stringify({ state }), debounceMs: 0 }); await sleep(120); seen.push(JSON.parse(fs.readFileSync(f, 'utf8')).state); }
    await sleep(700); seen.push(JSON.parse(fs.readFileSync(f, 'utf8')).state);
    ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]) && seen[seen.length - 1] === 56, `the store's own order: every version on disk is the same or later (${seen.join(', ')})`);
    w.stop();
  }
  // ── ③ THE PACE, run ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('③ a store changing every 20 ms is written at its gap, never back to back');
  {
    const w = SW.create({ log: { warn() {} }, pace: { perMbMs: 500, floorMs: 300 } }), f = path.join(ROOT, 'busy.json');
    const pad = 'x'.repeat(2 * MB);   // a 2 MB store: its gap 1 s
    let n = 0; const iv = setInterval(() => { n++; w.dirty(f, { name: 'busy', produce: () => JSON.stringify({ n, pad }), debounceMs: 50 }); }, 20);
    await sleep(3200); clearInterval(iv); await sleep(50);
    const st = w.stats().find((x) => x.file === f);
    ok(st.writes >= 2 && st.writes <= 4 && st.gapMs === 1000, `a 2 MB store dirtied ${n} times in 3.2 s ⇒ ${st.writes} writes (its gap ${st.gapMs} ms) — before this commit a busy store was rewritten every ~0.5 s`, st);
    w.stop();
  }
  // ── ④ ONE IN FLIGHT, THE THREADPOOL LAW ───────────────────────────────────────────────────────────────────────────
  console.log('④ one write in flight across all stores, on its own thread — the fs threadpool, DNS and the loop untouched');
  {
    process.env.VS_SLOW_MS = '300';
    const w = SW.create({ log: { warn() {} }, workerPath: SLOW });
    const files = [...Array(20)].map((_, i) => path.join(ROOT, `s${i}.json`));
    const stop = loopWatch();
    for (const f of files) w.dirty(f, { name: path.basename(f), produce: () => JSON.stringify({ f }), debounceMs: 0 });
    await sleep(100);   // the first slow write is in flight
    const t1 = performance.now(); await fs.promises.stat(path.join(ROOT, 'burst.json')); const statMs = performance.now() - t1;
    const t2 = performance.now(); let dnsMs = null; try { await dns.promises.lookup('localhost'); dnsMs = performance.now() - t2; } catch { dnsMs = performance.now() - t2; }
    const busy = w.stats().filter((x) => x.inflight).length;
    await sleep(20 * 300 + 900);
    const gap = stop(), done = w.stats().filter((x) => x.writes === 1).length;
    ok(busy === 1 && done === 20, `20 dirty stores on a 300 ms-a-write storage: ONE in flight at a time (${busy}), all ${done} written one after another`);
    ok(statMs < 50 && dnsMs < 200, `meanwhile an unrelated fs.promises.stat answered in ${statMs.toFixed(1)} ms and a dns lookup in ${dnsMs.toFixed(1)} ms — the writer takes no fs threadpool thread`);
    ok(gap < 100, `…and the main loop's largest gap over the 6 s was ${gap} ms (each write held only the writer's thread)`);
    w.stop(); delete process.env.VS_SLOW_MS;
  }
  // ── ⑤ A FAILED WRITE ──────────────────────────────────────────────────────────────────────────────────────────────
  console.log('⑤ a failed write is said, kept, retried — never a throw');
  {
    const warns = [], w = SW.create({ log: { warn: (l) => warns.push(l) } }), f = path.join(ROOT, 'fails.json');
    fs.writeFileSync(f, JSON.stringify({ v: 'old' }));
    fs.mkdirSync(`${f}.tmp-${process.pid}-w`);   // its temp path is a directory: the write fails (EISDIR)
    w.dirty(f, { name: 'fails.write', produce: () => JSON.stringify({ v: 'new' }), debounceMs: 0 });
    await sleep(300);
    ok(warns.some((l) => l === '[store-write] fails.write not written (EISDIR; attempt 1) — kept in memory, retrying in 1 s') && JSON.parse(fs.readFileSync(f, 'utf8')).v === 'old' && w.pending(f),
      'a failed write: said in plain words, the previous WHOLE file intact, the store still owed', warns);
    fs.rmdirSync(`${f}.tmp-${process.pid}-w`);
    await sleep(1300);
    ok(JSON.parse(fs.readFileSync(f, 'utf8')).v === 'new' && !w.pending(f), 'its retry (1 s later) wrote it');
    w.stop();
  }
  // ── ⑦ A PERSON'S ACT IS DURABLE BEFORE THE ANSWER ────────────────────────────────────────────────────────────────
  console.log('⑦ durable(): a person\'s act on disk before the answer — its pace set aside for that one write, the loop free');
  {
    const w = SW.create({ log: { warn() {} } }), f = path.join(ROOT, 'acts.json');
    const pad = 'x'.repeat(2 * MB);   // its gap 1 s
    let v = 1; const prod = () => JSON.stringify({ v, pad });
    w.dirty(f, { name: 'acts.write', produce: prod, debounceMs: 0 });
    await sleep(150);   // written once; its next write would wait its 1 s gap
    v = 2; w.dirty(f, { produce: prod });
    const stop = loopWatch(), t0 = performance.now(), ok1 = await w.durable(f), took = performance.now() - t0, gap = stop();
    ok(ok1 === true && took < 400 && JSON.parse(fs.readFileSync(f, 'utf8')).v === 2 && gap < 100, `durable() resolved in ${took.toFixed(0)} ms (its 1 s gap set aside for the act), the file already holds it; the loop's largest gap ${gap} ms`);
    ok((await w.durable(f)) === true, 'nothing owed ⇒ durable() resolves at once');
    w.stop();
  }
  // ── ⑥ THE EXIT ────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('⑥ the exit flush: bounded, oldest first, what it left named; forget()');
  {
    process.env.VS_SLOW_MS = '600';
    const warns = [], w = SW.create({ log: { warn: (l) => warns.push(l) }, workerPath: SLOW, graceMs: 1500 });
    const stuck = path.join(ROOT, 'stuck.json'), a = path.join(ROOT, 'a.json'), b = path.join(ROOT, 'b.json');
    w.dirty(stuck, { name: 'stuck.write', produce: () => '{"s":1}', debounceMs: 0 });
    await sleep(80);   // its 600 ms write is in flight on the writer's thread
    w.dirty(a, { name: 'a.write', produce: () => '{"a":1}', debounceMs: 10000 });
    w.dirty(b, { name: 'b.write', produce: () => '{"b":1}', debounceMs: 10000 });
    w.beginExit();
    const own = w.flushSync([a]);
    ok(own.deferred === true && !fs.existsSync(a), 'during the exit a store\'s own flush is deferred (only the exit flush writes, once)');
    const t0 = performance.now(), r = w.exitFlush({}), took = performance.now() - t0;
    // round 6 (E1): no bound of ours — the exit waits for the write in flight and then writes the other two, ON THE THREAD
    // (round 3: never on the main thread), however long the storage takes: 1.7 s here, past a third of its 1.5 s grace
    ok(took >= 1200 && r.all.written.join() === 'a.write,b.write' && !r.all.left.length && fs.existsSync(stuck) && fs.existsSync(a) && fs.existsSync(b),
      `the exit flush waited for the write in flight, then wrote the other two on the thread — ${took.toFixed(0)} ms, past rounds 3–5's bound (a third of the grace, 500 ms here): nothing left`, r.all);
    ok(warns.some((l) => /^\[store-write\] exit: 2 stores written in \d+ ms \(a\.write, b\.write\)$/.test(l)) && !warns.some((l) => /NOT written|bound/.test(l)), 'ONE journal line names what it wrote — no «NOT written», no bound', warns);
    w.stop();
    // forget(): the file's owner unlinks it — its pending write dropped, one in flight settled first
    process.env.VS_SLOW_MS = '400';
    const w2 = SW.create({ log: { warn() {} }, workerPath: SLOW }), g = path.join(ROOT, 'gone.json'), h = path.join(ROOT, 'gone2.json');
    w2.dirty(g, { name: 'gone.write', produce: () => '{"g":1}', debounceMs: 0 });
    await sleep(60);
    w2.forget(g); fs.rmSync(g, { force: true });
    w2.dirty(h, { name: 'gone2.write', produce: () => '{"h":1}', debounceMs: 300 });
    w2.forget(h);
    await sleep(900);
    ok(!fs.existsSync(g) && !fs.existsSync(h), 'forget(): a write in flight lands BEFORE its owner\'s unlink (never resurrected after it); a pending one is dropped');
    w2.stop(); delete process.env.VS_SLOW_MS;
  }
  // ── ⑦ THE USAGE CURSOR FOLLOWS ITS APPEND ───────────────────────────────────────────────────────────────────────────
  console.log('⑦ the usage cursor follows its append: a kill after the walk\'s commit re-appends nothing');
  {
    const tline = (k) => JSON.stringify({ type: 'assistant', uuid: 'u' + k, parentUuid: null, sessionId: '33333333-4444-4555-8666-77777777777' + (k % 10), timestamp: new Date(Date.UTC(2026, 9, 1, 10, k)).toISOString(), requestId: 'req_cf' + k, cwd: '/w/s', message: { id: 'msg_cf' + k, model: 'claude-opus-5-5', role: 'assistant', type: 'message', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5 + k, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
    const SRC = path.join(REPO, 'src/usage-history.js'), FIX = 'if (this._writeCursors(deadFacts) && appendedNow) { try { require(\'./store-writer.js\').storeWriter().durable(this.cursorsFile).catch(() => { }); } catch { } }';
    let usrc = fs.readFileSync(SRC, 'utf8');
    ok(usrc.split(FIX).length === 2, 'premise: the walk\'s commit makes the cursors the writer\'s next write (one line of the module)');
    usrc = usrc.split(FIX).join('this._writeCursors(deadFacts);');   // THE MUTANT: the cursors at their pace (the swap first — the anchor holds a relative require)
    usrc = usrc.replace(/require\('(\.\.?\/[^']+)'\)/g, (m, q) => `require(${JSON.stringify(path.resolve(path.dirname(SRC), q))})`).split('__dirname').join(JSON.stringify(path.dirname(SRC)));
    const MUT = path.join(ROOT, 'mut-usage-history.js'); fs.writeFileSync(MUT, usrc);
    // round 4 (true words 6): THE MUTANT without the cold ledger's tail read (the walk's commit asks only a warm ledger)
    const TAIL = 'const knows = this._evCache && !(typeof this.ledgerLoading === \'function\' && this.ledgerLoading()) ? (id) => this.ledgerKnowsId(id) : tailRids ? (id) => tailRids.has(id) : null;';
    let usrc2 = fs.readFileSync(SRC, 'utf8');
    ok(usrc2.split(TAIL).length === 2, 'premise: the walk\'s commit asks the warm ledger, else the shards\' tails (one line of the module)');
    usrc2 = usrc2.split(TAIL).join(TAIL.replace(' : tailRids ? (id) => tailRids.has(id) : null;', ' : null;')).replace(/require\('(\.\.?\/[^']+)'\)/g, (m, q) => `require(${JSON.stringify(path.resolve(path.dirname(SRC), q))})`).split('__dirname').join(JSON.stringify(path.dirname(SRC)));
    const MUT2 = path.join(ROOT, 'mut-usage-history-notail.js'); fs.writeFileSync(MUT2, usrc2);
    const realSW = SW.storeWriter;
    const run = async (modPath, tag, { snapMs = 1750, warm = false } = {}) => {
      const { UsageHistory } = require(modPath);
      const w0 = path.join(ROOT, 'cf-' + tag), home = path.join(w0, 'home'), slug = path.join(home, '.claude', 'projects', '-w-s'), data = path.join(w0, 'data');
      fs.mkdirSync(slug, { recursive: true }); fs.mkdirSync(path.join(data, 'usage-history'), { recursive: true });
      const t0 = path.join(slug, 't0.jsonl'); fs.writeFileSync(t0, [0, 1, 2].map(tline).join('\n') + '\n');
      process.env.VS_SLOW_MS = '500';
      const w = SW.create({ log: { warn() {} }, workerPath: SLOW }); SW.storeWriter = () => w;
      try {
        const uh = new UsageHistory({ dataDir: data, homeDir: home });
        const r1 = await uh.scan(true); await w.durable(uh.cursorsFile, { timeoutMs: 5000 });
        // four other stores due now (each a 500 ms write), then the walk's second commit
        for (let k = 0; k < 4; k++) w.dirty(path.join(w0, `other-${k}.json`), { name: `other-${k}`, produce: () => `{"k":${k}}`, debounceMs: 0 });
        await sleep(30);
        fs.appendFileSync(t0, [3, 4, 5, 6].map(tline).join('\n') + '\n');
        const r2 = await uh.scan(true); const tCommit = performance.now();
        await sleep(snapMs - (performance.now() - tCommit));
        // THE KILL: what the disk holds now is all a next process gets
        const snap = path.join(w0, 'after-kill'); fs.mkdirSync(snap, { recursive: true });
        fs.cpSync(path.join(data, 'usage-history'), path.join(snap, 'usage-history'), { recursive: true });
        const atKill = w.stats().map((x) => `${x.name}:${x.writes}${x.dirty ? ' dirty' : ''}${x.inflight ? ' inflight' : ''}`).join(', ');
        w.stop();
        const w2 = SW.create({ log: { warn() {} } }); SW.storeWriter = () => w2;
        const uh2 = new UsageHistory({ dataDir: snap, homeDir: home });
        if (warm) uh2._loadEvents();   // the next boot's ledger warm (the hub warms it at boot) — the re-walk's commit can ask it
        const r3 = await uh2.scan(true); uh2.flushCursors(); w2.stop();
        const rows = fs.readdirSync(path.join(snap, 'usage-history')).filter((f) => /^events-/.test(f)).flatMap((f) => fs.readFileSync(path.join(snap, 'usage-history', f), 'utf8').split('\n').filter(Boolean));
        const rids = new Set(rows.map((l) => { try { return JSON.parse(l).rid; } catch { return null; } }));
        return { added1: r1.added, added2: r2.added, readded: r3.added, met: r3.reWalked || 0, rows: rows.length, rids: rids.size, atKill };
      } finally { SW.storeWriter = realSW; delete process.env.VS_SLOW_MS; }
    };
    const fixed = await run(SRC, 'fix'), paced = await run(MUT, 'mut');
    ok(fixed.added1 === 3 && fixed.added2 === 4 && fixed.readded === 0 && fixed.rows === 7 && fixed.rids === 7,
      `a kill 1.75 s after the walk's commit (500 ms a write, four other stores due): the re-walk appends ${fixed.readded} rows — ${fixed.rows} rows for ${fixed.rids} request ids (the cursors were the next write after the one in flight)`, fixed);
    // round 3 (smaller 5): THE RE-WALK RE-APPENDS NOTHING IT ALREADY APPENDED — a kill 100 ms after the commit (no cursor write
    // landed yet), the next process's ledger warm: the commit skips every row the ledger holds; cold, the same kill doubles them
    const early = await run(SRC, 'early', { snapMs: 100, warm: true }), earlyCold = await run(MUT2, 'early-cold', { snapMs: 100, warm: false });
    // ROUND 4 (true words 6): THE BOOT'S OWN ORDER — the walk runs before the warm: the ledger COLD, the shards' tails read
    const coldNow = await run(SRC, 'early-cold-r4', { snapMs: 100, warm: false });
    ok(coldNow.readded === 0 && coldNow.met === 4 && coldNow.rows === 7 && coldNow.rids === 7 && earlyCold.readded === 4 && earlyCold.rows === 11,
      `true words 6: the same kill with the next process's ledger COLD (the boot's own order — the walk before the warm): the walk met ${coldNow.met} rows again and appended ${coldNow.readded} — ${coldNow.rows} rows for ${coldNow.rids} request ids (the shards' tails read); the MUTANT without the tail read appends ${earlyCold.readded} again (${earlyCold.rows} rows)`, { coldNow, earlyCold });
    ok(early.readded === 0 && early.rows === 7 && early.rids === 7 && earlyCold.readded === 4 && earlyCold.rows === 11,
      `smaller 5: a kill 100 ms after the commit (before the cursors reached the disk): with the next process's ledger warm the re-walk appends ${early.readded} rows — ${early.rows} rows for ${early.rids} request ids; CONTROL, the MUTANT without the cold ledger's tail read: ${earlyCold.readded} again (${earlyCold.rows} rows for ${earlyCold.rids} ids)`, { early, earlyCold });
    // ROUND 4 (true words 6): TWENTY KILLS IN A ROW, each 100 ms after the walk's commit (before its cursors), each next
    // process on a COLD ledger — round 3: 240 rows for 160 request ids (bounded, not compounding); now: one row an id
    { const { UsageHistory } = require(SRC);
      const w0 = path.join(ROOT, 'cf-20'), home = path.join(w0, 'home'), slug = path.join(home, '.claude', 'projects', '-w-s');
      fs.mkdirSync(slug, { recursive: true }); let data = path.join(w0, 'data-0'); fs.mkdirSync(path.join(data, 'usage-history'), { recursive: true });
      const t0 = path.join(slug, 't0.jsonl'); fs.writeFileSync(t0, '');
      process.env.VS_SLOW_MS = '500';
      try {
        for (let k = 0; k < 20; k++) {
          fs.appendFileSync(t0, Array.from({ length: 8 }, (_, i) => tline(1000 + 8 * k + i)).join('\n') + '\n');
          const w = SW.create({ log: { warn() {} }, workerPath: SLOW }); SW.storeWriter = () => w;
          const uh = new UsageHistory({ dataDir: data, homeDir: home });
          await uh.scan(true); await sleep(100);
          const next = path.join(w0, 'data-' + (k + 1)); fs.mkdirSync(next, { recursive: true });
          fs.cpSync(path.join(data, 'usage-history'), path.join(next, 'usage-history'), { recursive: true });   // THE KILL: what the disk held
          w.stop(); data = next;
        }
        const w = SW.create({ log: { warn() {} } }); SW.storeWriter = () => w;
        const uh = new UsageHistory({ dataDir: data, homeDir: home }); await uh.scan(true); uh.flushCursors(); w.stop();
        const rows = fs.readdirSync(path.join(data, 'usage-history')).filter((f) => /^events-/.test(f)).flatMap((f) => fs.readFileSync(path.join(data, 'usage-history', f), 'utf8').split('\n').filter(Boolean));
        const rids = new Set(rows.map((l) => { try { return JSON.parse(l).rid; } catch { return null; } }));
        ok(rids.size === 160 && rows.length === 160, `true words 6: twenty kills in a row (each before the cursors landed), the ledger COLD at every next process — ${rows.length} rows for ${rids.size} request ids (round 3: 240 for 160)`, { rows: rows.length, rids: rids.size });
      } finally { SW.storeWriter = realSW; delete process.env.VS_SLOW_MS; }
    }
    ok(paced.met === 4 && paced.readded === 0 && paced.rows === 7 && paced.rids === 7,
      `the CONTROL — the same walk with the cursors at their pace (behind the four due stores): the re-walk met the walk's ${paced.met} rows again (the cursor write lost) — the cold ledger's tail read kept them out: ${paced.rows} rows for ${paced.rids} request ids`, paced);
  }
  // ── ⑧ ROUND 6: NO BOUND OF OURS CUTS AN EXIT THAT IS STILL WRITING ────────────────────────────────────────────────
  console.log('⑧ round 6: no bound of ours cuts an exit that is still writing — judged by the STORES ON DISK against master\'s road, by the same driver');
  {
    const FIFO = path.join(ROOT, 'never.fifo'); execFileSync('mkfifo', [FIFO]);
    const HUNG = path.join(ROOT, 'hung-worker.cjs');
    fs.writeFileSync(HUNG, `'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || m.ev !== 'write') return;
  Atomics.store(S, 0, m.id);
  fs.openSync(${JSON.stringify(FIFO)}, 'r');   // asleep in the kernel: no writer ever opens it (wait_for_partner)
});
`);
    // THE SCENE CHILD: server.js's two exit roads with the writer (side «tree») or MASTER'S road (side «master» — no writer:
    // the moved stores written synchronously on the main thread after the unmoved ones, as 05082bbd0's shutdown did), the
    // same stores, the same slowness: the moved stores (session-meta rank 0, session-status, the channels index) OWED at
    // the signal, written by the writer's thread at VS_SLOW_MS a write (the slow stand-in) or by master's main thread
    // at the same; the road's own unmoved stores at `unmovedMs` each (a synchronous write + its wait). The DRIVER plays
    // the service manager (its kill at the stop + the grace); after a crash with no stop asked there is no manager.
    const CHILD = path.join(ROOT, 'exit-child.cjs');
    fs.writeFileSync(CHILD, `'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const dir = process.argv[2], mode = process.argv[3];
const out = (s) => process.stdout.write(s + '\\n');
const log = { warn: out, error: out };
const f = (n) => path.join(dir, n + '.json');
const nap = new Int32Array(new SharedArrayBuffer(4)), sleepSync = (ms) => { if (ms > 0) Atomics.wait(nap, 0, 0, ms); };
if (mode === 'scene') {
  const sc = JSON.parse(process.env.VS_SCENE);
  const SRC = process.env.VS_SRC || ${JSON.stringify(path.join(REPO, 'src'))};
  const tree = sc.side !== 'master';
  // graceMs (round 6) and exitBudgetMs (rounds 3–5: a third of it) both given — the same scene runs on an older tree
  const g = sc.grace ? { graceMs: sc.grace, exitBudgetMs: Math.round(sc.grace / 3) } : {};
  const w = tree ? require(SRC + '/store-writer.js').create({ log, workerPath: sc.hungWriter ? ${JSON.stringify(HUNG)} : ${JSON.stringify(SLOW)}, keeper: sc.keeper !== false, ...g, ...(process.env.VS_KEEPER_PATH ? { keeperPath: process.env.VS_KEEPER_PATH } : {}) }) : null;
  const MOVED = [['meta', 'session-meta.write', 0], ['status', 'session-status.write', 1], ['index', 'channels-index.write', 1]].slice(0, sc.moved == null ? 3 : sc.moved);
  if (tree) for (const [n, name, rank] of MOVED) w.dirty(f(n), { name, produce: () => JSON.stringify({ [n]: 1 }), debounceMs: 600000, ...(rank === 0 ? { rank: 0 } : {}) });
  if (sc.hang) cp.execFileSync('mkfifo', [f('spend-budget') + '.tmp']);
  const unmoved = () => { for (let k = 0; k < (sc.unmoved || 0); k++) { const p = f('unmoved-' + k); fs.writeFileSync(p + '.tmp', '{"u":' + k + '}'); sleepSync(sc.unmovedMs || 0); fs.renameSync(p + '.tmp', p); } };
  const movedOnMain = () => { for (const [n] of MOVED) { const p = f(n); fs.writeFileSync(p + '.tmp', JSON.stringify({ [n]: 1 })); sleepSync(Number(process.env.VS_SLOW_MS || 0)); fs.renameSync(p + '.tmp', p); } };
  const hang = () => { if (sc.hang) { out('hanging ' + Date.now()); fs.writeFileSync(f('spend-budget') + '.tmp', '{"b":1}'); } };   // asleep in the kernel: openat on a FIFO, for ever
  const road = (crash) => {   // server.js shutdownNow / its uncaughtException handler, in their order
    if (tree) { w.beginExit({ crash }); w.exitFlush({ only: 'rank0' }); }
    const td = Date.now(); unmoved(); hang(); if (!tree) movedOnMain();
    if (tree) w.exitFlush({ debtMs: Date.now() - td });
    out('exited ' + Date.now()); process.exit(crash ? 1 : 0);
  };
  let stopped = false;
  process.on('SIGTERM', () => { out('sigterm ' + Date.now()); if (stopped) return; stopped = true; if (tree) w.noteSignal(); road(false); });   // a stop asked by the driver
  setTimeout(() => {   // the keeper started at the writer's creation (the server's boot) — its code in memory before anything hangs
    if (sc.installHang) for (const n of ['store-exit-keeper.js', 'store-pace.js']) { fs.renameSync(SRC + '/' + n, SRC + '/' + n + '.away'); cp.execFileSync('mkfifo', [SRC + '/' + n]); }
    out('ready ' + Date.now());
    if (sc.road === 'stop') { stopped = true; if (tree) w.noteSignal(); road(false); }
    else if (sc.road === 'crash') road(true);
    else if (sc.road === 'stopThenCrash') { stopped = true; if (tree) w.noteSignal(); setTimeout(() => { out('crash ' + Date.now()); road(true); }, sc.crashAfterMs); }   // the loop free between (the hand-over settle)
  }, 600);
} else if (mode === 'bootRace') {
  // round 6's amend (item 5): the server's boot starts the keeper (bootKeeper), and IN THE SAME TICK the install tree hangs —
  // the keeper's own file and store-pace become FIFOs before its thread has run — then a crash and a hang: the keeper still
  // says the line and ends it at the crash + the grace (its code came as TEXT, read by the boot)
  const SRC = process.env.VS_SRC;
  const w = require(SRC + '/store-writer.js').bootKeeper({ log });
  for (const n of ['store-exit-keeper.js', 'store-pace.js']) fs.renameSync(SRC + '/' + n, SRC + '/' + n + '.away');
  for (const n of ['store-exit-keeper.js', 'store-pace.js']) cp.execFileSync('mkfifo', [SRC + '/' + n]);
  cp.execFileSync('mkfifo', [f('spend-budget') + '.tmp']);
  w.dirty(f('meta'), { name: 'session-meta.write', produce: () => '{"m":1}', debounceMs: 600000, rank: 0 });
  out('ready ' + Date.now());
  w.beginExit({ crash: true }); w.exitFlush({ only: 'rank0' });
  fs.writeFileSync(f('spend-budget') + '.tmp', '{"b":1}');   // asleep in the kernel, for ever
} else if (mode === 'crashOrder') {
  // round 3 (law 2): the crash path's ORDER on a slow storage (300 ms a write): a session-status write in flight, then a
  // person's act owed (rank 0) and a paced index — rank 0 is on disk BEFORE the unmoved stores
  const SW = require(${JSON.stringify(path.join(REPO, 'src/store-writer.js'))});
  const order = [], t0 = Date.now();
  const w = SW.create({ log, workerPath: ${JSON.stringify(SLOW)} });
  const on = (n) => () => order.push(n + '@' + (Date.now() - t0));
  w.dirty(f('status'), { name: 'session-status.write', produce: () => '{"s":1}', debounceMs: 0, onWritten: on('status') });
  setTimeout(() => {
    w.dirty(f('index'), { name: 'channels-index.write', produce: () => '{"i":1}', debounceMs: 10000, onWritten: on('index') });
    w.dirty(f('meta'), { name: 'session-meta.write', produce: () => '{"m":1}', debounceMs: 10000, rank: 0, onWritten: on('meta') });
    const tc = Date.now();
    w.beginExit({ crash: true });
    w.exitFlush({ only: 'rank0' });
    const td = Date.now(); order.push('debt@' + (td - t0)); cp.execFileSync('sleep', ['0.2']);   // the road's unmoved stores' own synchronous flushes
    const r = w.exitFlush({ debtMs: Date.now() - td });
    out('order ' + JSON.stringify({ order, crashMs: Date.now() - tc, left: r.all.left.map((x) => x.name), line: '' }));
    process.exit(1);
  }, 120);
} else if (mode === 'keeperThreads') {
  // round 6 (E3 c): a process that uses the stores (not the server) — which threads does it start? Every Worker named
  const WT = require('worker_threads'), Real = WT.Worker, made = [];
  WT.Worker = class extends Real { constructor(file, o) { made.push(o && o.eval ? (/THE WRITER'S EXIT KEEPER/.test(String(file)) ? 'store-exit-keeper.js (its text)' : 'an eval worker') : path.basename(String(file))); super(file, o); } };   // round 6's amend: the keeper starts from its TEXT
  const SW = require(${JSON.stringify(path.join(REPO, 'src/store-writer.js'))});
  const w = SW.storeWriter();
  w.dirty(f('s'), { name: 's.write', produce: () => '{"s":1}', debounceMs: 0, onWritten: () => {
    const before = made.slice(); SW.bootKeeper({ log });
    out('threads ' + JSON.stringify({ before, after: made.slice(), onDisk: fs.existsSync(f('s')) })); process.exit(0); } });
  setTimeout(() => out('threads-timeout ' + JSON.stringify(made)), 15000);   // the writer's thread and timer are unref'd: this keeps the process until the write lands
}
`);
    const ticks = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const a = t.slice(t.lastIndexOf(')') + 2).split(' '); return Number(a[11]) + Number(a[12]); } catch { return null; } };
    // the DRIVER: one child at a time; `killAt` = the manager's kill (ms after «ready»), `termAt` = a stop asked by signal
    const runScene = (sc, { killAt = null, termAt = null, env = {}, tag = '', cpuAfterLine = false } = {}) => new Promise((resolve) => {
      const dir = path.join(ROOT, 'scene-' + (tag || `${sc.road}-${sc.side || 'tree'}-${Math.random().toString(36).slice(2, 7)}`)); fs.mkdirSync(dir, { recursive: true });
      const ch = spawn(process.execPath, [CHILD, dir, 'scene'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VS_SLOW_MS: String(sc.movedMs || 0), ...env, VS_SCENE: JSON.stringify(sc) } });
      let buf = '', readyAt = null, lineAt = null, cpu = null, killedByDriver = false; const timers = [];
      const onData = (b) => {
        buf += b; const now = performance.now();
        if (readyAt == null && /\bready \d+/.test(buf)) {
          readyAt = now;
          if (killAt != null) timers.push(setTimeout(() => { killedByDriver = true; try { ch.kill('SIGKILL'); } catch { } }, killAt));
          if (termAt != null) timers.push(setTimeout(() => { try { ch.kill('SIGTERM'); } catch { } }, termAt));
        }
        if (lineAt == null && /\[store-write\] exit(?: after the crash)?: [\d.]+ s after/.test(buf)) {
          lineAt = now;
          if (cpuAfterLine) { timers.push(setTimeout(() => { const a = ticks(ch.pid); timers.push(setTimeout(() => { cpu = { at100: a, at1100: ticks(ch.pid) }; }, 1000)); }, 100)); }
        }
      };
      ch.stdout.on('data', onData); ch.stderr.on('data', onData);
      const safety = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 120000);
      ch.on('exit', (code, sig) => {
        const endAt = performance.now(); clearTimeout(safety); for (const t of timers) clearTimeout(t);
        const names = fs.readdirSync(dir).filter((x) => x.endsWith('.json'));
        resolve({ code, sig, killedByDriver, ms: readyAt == null ? null : Math.round(endAt - readyAt), lineMs: lineAt == null || readyAt == null ? null : Math.round(lineAt - readyAt), cpu,
          moved: ['meta', 'status', 'index'].filter((n) => names.includes(n + '.json')), unmoved: names.filter((x) => /^unmoved-\d+\.json$/.test(x)).length,
          lines: (buf.match(/\[store-write\] exit[^\n]*/g) || []), out: buf.slice(-1500) });
      });
    });
    const keeperLines = (r) => r.lines.filter((l) => /^\[store-write\] exit(?: after the crash)?: [\d.]+ s after/.test(l));
    const eq = (a, b) => a.moved.join() === b.moved.join() && a.unmoved === b.unmoved && a.code === b.code && !a.sig && !b.sig;
    const say = (s) => console.log('    · ' + s);
    const brief = (r) => `code ${r.code}${r.sig ? ' ' + r.sig : ''} at ${r.ms} ms, moved ${r.moved.length}/3 [${r.moved}], unmoved ${r.unmoved}`;
    // E1 — AFTER A STOP, THE ONLY BOUND IS THE MANAGER'S: moved stores OWED at the signal + the shutdown's unmoved stores,
    // each shape its own grace; the driver's manager-kill at the grace
    const E1 = [
      ['a pod\'s shape (grace 9 s, 20 unmoved stores at 300 ms, 3 moved owed at 300 ms)', { grace: 9000, unmoved: 20, unmovedMs: 300, movedMs: 300 }, {}],
      ['systemd\'s shape (grace 15 s, 13 unmoved at 800 ms, 3 moved owed at 800 ms)', { grace: 15000, unmoved: 13, unmovedMs: 800, movedMs: 800 }, {}],
      ['moved stores only, each write slow (grace 9 s, 3 moved at 1.2 s)', { grace: 9000, unmoved: 0, movedMs: 1200 }, {}],
      ['THE REAL POD NUMBERS (KUBERNETES_SERVICE_HOST: grace 30 s learned; 20 unmoved at 1.2 s, 3 moved owed at 1.2 s)', { unmoved: 20, unmovedMs: 1200, movedMs: 1200 }, { KUBERNETES_SERVICE_HOST: '10.0.0.1', VIBESPACE_STOP_GRACE_S: '' }],
    ];
    for (const [what, sc, env] of (process.env.VS_SW_FAST_E1 ? E1.slice(0, 1) : E1)) {
      const grace = sc.grace || 30000;
      const t = await runScene({ ...sc, road: 'stop' }, { killAt: grace, env }), m = await runScene({ ...sc, road: 'stop', side: 'master' }, { killAt: grace, env });
      say(`${what}: the tree ${brief(t)}; master ${brief(m)}`);
      ok(eq(t, m) && t.code === 0 && t.moved.length === 3 && t.unmoved === (sc.unmoved || 0) && !t.lines.some((l) => /NOT written|bound/.test(l)),
        `E1: ${what} — EVERY store on disk and code 0, equal to master by the same driver (the tree ${t.ms} ms, master ${m.ms} ms; nothing «NOT written»)`, { t: { ...t, out: t.out.slice(-600) }, m: { ...m, out: '' } });
    }
    // E2 — AFTER A CRASH WITH NO STOP ASKED, THE KEEPER IS THE MANAGER: one full grace from the crash, never sooner
    { const sc = { grace: 9000, unmoved: 3, unmovedMs: 1000, movedMs: 1000 };
      const t = await runScene({ ...sc, road: 'crash' }), m = await runScene({ ...sc, road: 'crash', side: 'master' });
      say(`a slow crash exit (6 s of stores, grace 9 s): the tree ${brief(t)}; master ${brief(m)}`);
      ok(eq(t, m) && t.code === 1 && t.moved.length === 3 && t.unmoved === 3 && !keeperLines(t).length, `E2: a crash, the exit slow but shorter than the grace (6 s of stores, grace 9 s) FINISHES by itself — every store on disk, code 1, equal to master (the tree ${t.ms} ms, master ${m.ms} ms)`, { t, m: { ...m, out: '' } }); }
    { const t = await runScene({ grace: 3000, road: 'crash', moved: 2, unmoved: 1, hang: true, movedMs: 50 }, { tag: 'crash-hung' });
      const l = keeperLines(t)[0] || '';
      ok(t.sig === 'SIGKILL' && !t.killedByDriver && t.ms >= 3000 && t.ms < 3000 + 1500 && keeperLines(t).length === 1
        && /^\[store-write\] exit after the crash: 3\.\d s after the crash — the grace a service manager gives a stop \(3\.0 s, stated to this writer\) is spent and no manager ends a crashed process — the writer's stores: written session-meta\.write; still owed session-status\.write; the main thread's own stores: not counted here — the main thread is still in openat on [^ ]*spend-budget\.json\.tmp \(the kernel: \w+\) — the writer's exit keeper ends the process now$/.test(l) && !/signal|shutdown's/.test(l),
        `E2: a crash, the exit HUNG — ended by the keeper at the crash + the grace (${t.ms} ms after the crash, grace 3 s), never before: «${l.slice(0, 260)}…»`, { sig: t.sig, ms: t.ms, lines: t.lines, out: t.out.slice(-500) }); }
    { const sc = { grace: 9000, road: 'stopThenCrash', crashAfterMs: 3500, unmoved: 10, unmovedMs: 150, movedMs: 150 };
      const t = await runScene(sc, { killAt: 9000 }), m = await runScene({ ...sc, side: 'master' }, { killAt: 9000 });
      say(`a crash 3.5 s after a stop, still writing: the tree ${brief(t)}; master ${brief(m)}`);
      ok(eq(t, m) && t.code === 1 && t.moved.length === 3 && t.unmoved === 10 && !keeperLines(t).length, `E2: a crash AFTER a stop (3.5 s in — past rounds 3–5's third of the grace), still writing — the keeper ends NOTHING: it finishes, every store on disk, code 1, equal to master (the tree ${t.ms} ms)`, { t, m: { ...m, out: '' } }); }
    { const t = await runScene({ grace: 3000, road: 'stopThenCrash', crashAfterMs: 1000, moved: 1, unmoved: 0, hang: true, movedMs: 50 }, { killAt: 3000 + 300, tag: 'stop-crash-hung' });
      const l = keeperLines(t)[0] || '';
      ok(t.killedByDriver && t.sig === 'SIGKILL' && keeperLines(t).length === 1 && t.lineMs >= 2600 && t.lineMs < 3000 && /^\[store-write\] exit: 2\.\d s after the stop signal \(a crash came 1\.0 s after it\), 0\.3 s before the service manager's grace of 3\.0 s ends — .* — said before the manager's own kill — the keeper ends nothing$/.test(l),
        `E2: a crash after a stop, then a hang — the keeper SPOKE at the stop's moment (${t.lineMs} ms, the crash named in its words) and ended nothing: the manager's kill (the driver's, at ${t.ms} ms)`, { lines: t.lines, killed: t.killedByDriver, ms: t.ms, lineMs: t.lineMs }); }
    { const t = await runScene({ grace: 3000, road: 'crash', moved: 1, unmoved: 0, hang: true, movedMs: 50 }, { termAt: 1000, killAt: 1000 + 3000, tag: 'crash-stop-hung' });
      ok(t.sig === 'SIGKILL' && !t.killedByDriver && t.ms >= 3000 && t.ms < 1000 + 3000 && keeperLines(t).length === 1 && /after the crash/.test(keeperLines(t)[0] || '') && !/sigterm/.test(t.out),
        `E2: a STOP asked 1 s after a crash, the exit hung — ended at the crash + the grace (${t.ms} ms), before the manager's kill at the stop + the grace (4 s); one line («after the crash»); the stop's handler never ran (the main thread asleep in the kernel)`, { sig: t.sig, ms: t.ms, lines: t.lines, killed: t.killedByDriver }); }
    // A HANG AFTER A STOP: the line at the grace less the slack, the process ALIVE until the manager's kill — and the keeper
    // ASLEEP after its line (E3 b: its CPU ticks one second after the line ≈ 0; round 5's keeper spun a whole core)
    { const t = await runScene({ grace: 3000, road: 'stop', moved: 3, unmoved: 1, unmovedMs: 10, hang: true, movedMs: 50 }, { killAt: 3000 + 1500, cpuAfterLine: true, tag: 'stop-hung' });
      const l = keeperLines(t)[0] || '', dcpu = t.cpu && t.cpu.at100 != null && t.cpu.at1100 != null ? t.cpu.at1100 - t.cpu.at100 : null;
      ok(t.killedByDriver && t.sig === 'SIGKILL' && keeperLines(t).length === 1 && t.lineMs >= 2600 && t.lineMs < 3000
        && /^\[store-write\] exit: 2\.\d s after the stop signal, 0\.3 s before the service manager's grace of 3\.0 s ends — the writer's stores: written session-meta\.write; still owed session-status\.write, channels-index\.write; the main thread's own stores: not counted here — the main thread is still in openat on [^ ]*spend-budget\.json\.tmp \(the kernel: \w+\) — said before the manager's own kill — the keeper ends nothing$/.test(l),
        `a hang after a STOP — the keeper SPOKE at the grace less its slack (${t.lineMs} ms) and the process LIVED until the manager's kill (${t.ms} ms); one line`, { lines: t.lines, ms: t.ms, lineMs: t.lineMs, killed: t.killedByDriver });
      ok(dcpu != null && dcpu <= 5, `E3 (b): after its line the keeper SLEEPS — the process's CPU from 0.1 s to 1.1 s after the line: ${dcpu} ticks (round 5: ~100 — a core)`, t.cpu); }
    // round 6's amend (item 3): a hang IN THE WRITER'S THREAD (its exit write asleep in the kernel) — the keeper's line names
    // that write as IN FLIGHT, never «still owed»
    { const t = await runScene({ grace: 3000, road: 'stop', moved: 1, unmoved: 0, hungWriter: true }, { killAt: 3000 + 600, tag: 'stop-hung-writer' });
      const l = keeperLines(t)[0] || '';
      ok(t.killedByDriver && /^\[store-write\] exit: 2\.\d s after the stop signal, .* — the writer's stores: none written yet; none owed; in flight session-meta\.write; the main thread's own stores: not counted here — the main thread is still in futex/.test(l),
        `the writer's THREAD hung on the exit's write — the keeper's line names it IN FLIGHT («${l.slice(l.indexOf('the writer\'s stores'), l.indexOf('the writer\'s stores') + 90)}…»), the manager's kill`, { lines: t.lines, killed: t.killedByDriver }); }
    // round 6's amend (item 5): the install tree hangs IN THE SAME TICK as the boot's bootKeeper() — before the keeper's thread
    // has run a line — then a crash and a hang: the line and the end at the crash + the grace (its code came as text)
    { const INSTB = path.join(ROOT, 'inst-boot'); fs.cpSync(path.join(REPO, 'src'), path.join(INSTB, 'src'), { recursive: true });
      const dir = path.join(ROOT, 'scene-boot-race'); fs.mkdirSync(dir, { recursive: true });
      const r = await new Promise((resolve) => {
        const ch = spawn(process.execPath, [CHILD, dir, 'bootRace'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VS_SRC: path.join(INSTB, 'src'), VIBESPACE_STOP_GRACE_S: '3' } });
        let buf = '', readyAt = null; const on = (b) => { buf += b; if (readyAt == null && /\bready \d+/.test(buf)) readyAt = performance.now(); };
        ch.stdout.on('data', on); ch.stderr.on('data', on);
        const safety = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 12000);
        ch.on('exit', (code, sig) => { clearTimeout(safety); resolve({ code, sig, ms: readyAt == null ? null : Math.round(performance.now() - readyAt), safetyKill: readyAt != null && performance.now() - readyAt >= 11500, line: (buf.match(/\[store-write\] exit after the crash: [\d.]+ s after the crash[^\n]*/) || [''])[0], out: buf.slice(-600) }); });
      });
      for (const n of ['store-exit-keeper.js', 'store-pace.js']) { try { fs.unlinkSync(path.join(INSTB, 'src', n)); fs.renameSync(path.join(INSTB, 'src', n + '.away'), path.join(INSTB, 'src', n)); } catch { } }
      ok(r.sig === 'SIGKILL' && !r.safetyKill && r.ms >= 3000 && r.ms < 3000 + 2000 && /^\[store-write\] exit after the crash: 3\.\d s after the crash — the grace a service manager gives a stop \(3\.0 s, VIBESPACE_STOP_GRACE_S\) is spent/.test(r.line),
        `ITEM 5: the install tree hung in the SAME TICK as bootKeeper() (the keeper's file and store-pace FIFOs before its thread ran), then a crash and a hang — the line «${r.line.slice(0, 120)}…» and the end ${r.ms} ms after the crash`, r); }
    { const t = await runScene({ grace: 3000, road: 'stop', moved: 1, unmoved: 0, hang: true, movedMs: 50, keeper: false }, { killAt: 3000 + 900, tag: 'stop-hung-bare' });
      ok(t.killedByDriver && !keeperLines(t).length, 'the CONTROL with no keeper: the same hang after a stop says nothing until the manager\'s kill (master\'s road)', { lines: t.lines, killed: t.killedByDriver }); }
    // THE KEEPER NEEDS NOTHING FROM THE STORAGE WHEN IT IS NEEDED: the install tree (its own file + store-pace as FIFOs from
    // the signal) AND the data directory hanging — after a stop the line still comes; after a crash the process still ends
    { const INST = path.join(ROOT, 'inst'); fs.cpSync(path.join(REPO, 'src'), path.join(INST, 'src'), { recursive: true });
      const back = () => { for (const n of ['store-exit-keeper.js', 'store-pace.js']) { try { fs.unlinkSync(path.join(INST, 'src', n)); fs.renameSync(path.join(INST, 'src', n + '.away'), path.join(INST, 'src', n)); } catch { } } };
      const ih = await runScene({ grace: 3000, road: 'stop', moved: 1, unmoved: 0, hang: true, installHang: true, movedMs: 50 }, { killAt: 3000 + 600, env: { VS_SRC: path.join(INST, 'src') }, tag: 'inst-stop' }); back();
      const ihc = await runScene({ grace: 3000, road: 'crash', moved: 1, unmoved: 0, hang: true, installHang: true, movedMs: 50 }, { env: { VS_SRC: path.join(INST, 'src') }, tag: 'inst-crash' }); back();
      ok(/exit: 2\.\d s after the stop signal/.test(keeperLines(ih)[0] || '') && ih.killedByDriver && ihc.sig === 'SIGKILL' && !ihc.killedByDriver && ihc.ms >= 3000 && /exit after the crash/.test(keeperLines(ihc)[0] || ''),
        `the install tree AND the data directory hanging from the signal — the line still came after the stop (${ih.lineMs} ms; the manager's kill); after the crash the keeper still ENDED it at the grace (${ihc.ms} ms)`, { ih: ih.lines, ihc: { sig: ihc.sig, ms: ihc.ms, lines: ihc.lines } }); }
    // THE MUTANT: a keeper that KILLS after a stop signal (round 4's law) — red by name: it cuts the manager's time short
    { const KM = path.join(ROOT, 'keeper-kills.js');
      fs.writeFileSync(KM, fs.readFileSync(path.join(REPO, 'src/store-exit-keeper.js'), 'utf8').replace("if (kind === 'crash') process.kill(process.pid, 'SIGKILL');", "process.kill(process.pid, 'SIGKILL');").replace("require('./store-pace.js')", `require(${JSON.stringify(path.join(REPO, 'src/store-pace.js'))})`));
      const km = await runScene({ grace: 3000, road: 'stop', moved: 1, unmoved: 0, hang: true, movedMs: 50 }, { killAt: 3000 + 900, env: { VS_KEEPER_PATH: KM }, tag: 'mutant-kills' });
      ok(!km.killedByDriver && km.sig === 'SIGKILL' && km.ms < 3000, `MUTANT «the keeper kills after a stop signal» is RED by name: the process died ${km.ms} ms after the stop — before the manager's grace (the driver kills at 3.9 s)`, { sig: km.sig, ms: km.ms, killed: km.killedByDriver }); }
    // E3 (c): A PROCESS THAT USES THE STORES IS NOT THE SERVER — no keeper thread (the server's boot starts it by name)
    { const dir = path.join(ROOT, 'threads'); fs.mkdirSync(dir);
      const r = spawnSync(process.execPath, [CHILD, dir, 'keeperThreads'], { encoding: 'utf8', timeout: 20000 });
      const m = /threads (\{.*\})/.exec(r.stdout || ''), o = m ? JSON.parse(m[1]) : null;
      ok(o && o.onDisk && o.before.includes('store-writer-worker.js') && !o.before.some((x) => /^store-exit-keeper\.js/.test(x)) && o.after.filter((x) => /^store-exit-keeper\.js/.test(x)).length === 1,
        `E3 (c): a process that writes a store through storeWriter() starts the writer's thread only (${o ? o.before.join(', ') : '?'}) — no keeper; bootKeeper() (the server's boot) starts ONE`, o || r.stdout + r.stderr); }
    // round 3 (law 2): the crash path's ORDER on a slow storage — rank 0 on disk BEFORE the unmoved stores, nothing left
    { const dir = path.join(ROOT, 'order'); fs.mkdirSync(dir);
      const co = spawnSync(process.execPath, [CHILD, dir, 'crashOrder'], { encoding: 'utf8', timeout: 20000, env: { ...process.env, VS_SLOW_MS: '300' } });
      const om = /order (\{.*\})/.exec(co.stdout || ''), o = om ? JSON.parse(om[1]) : null;
      const at = (n) => (o ? +((o.order.find((x) => x.startsWith(n + '@')) || '').split('@')[1] || NaN) : NaN);
      ok(o && at('meta') <= at('debt') && at('status') <= at('meta') && at('index') > at('debt') && !o.left.length,
        `law 2: the crash path with a status write in flight (300 ms a write) — rank 0 on disk BEFORE the unmoved stores (status ${at('status')} ms → meta ${at('meta')} ms → the debt at ${at('debt')} ms → the index ${at('index')} ms), nothing left`, o || co.stdout); }
    // ROUND 4 (MUST 1), THE WHOLE MATRIX: a cut at the newline (ENOSPC · a write of 0) × the truncate-back (EIO · ENOSPC ·
    // EPERM · working), a kill before the retry, a new process — the fast suite runs three of the eight pairs
    { const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/test-store-writer-r4.mjs')], { env: { ...process.env, VS_R4_PAIRS: 'all' }, encoding: 'utf8', timeout: 120000 });
      ok(r.status === 0 && /✓ MUST 1: an append cut AT ITS NEWLINE[^\n]*\(8 pairs\)/.test(r.stdout || ''), 'MUST 1, the whole matrix (2 cuts × 4 truncate outcomes, a kill before the retry, a new process): every pair green — test-store-writer-r4 with VS_R4_PAIRS=all', { status: r.status, tail: String(r.stdout || '').slice(-600) + String(r.stderr || '').slice(-300) }); }
  }
} finally {
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
