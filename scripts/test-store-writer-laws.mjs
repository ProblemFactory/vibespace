#!/usr/bin/env node
// test-store-writer-laws — lane hub-loop-stalls commit 2, «NO STORE WRITE HOLDS THE MAIN THREAD». FAST, in process: the
// STORE WRITER's own laws (src/store-writer.js + its thread src/store-writer-worker.js + PURE src/store-pace.js), each
// RED on an older tree by itself — split out of test-store-write-census (round 3, smaller 6e: the census's row stated 3 s
// and measured ~12 s; the census keeps the scans, this suite the writer driven on a stand-in thread):
//   ⑥ round 2's laws — (A) every byte or nothing on every road · (C i–iv) the order, the pace floor, an act's own bytes, a
//      no-op act · (E i–v) the thread's death, forget, bad bytes, the temp sweep, an outage · (F) a failed act said ·
//      (smaller 3) the journal's load says what it dropped · (D) the exit calls, by an AST walk
//   ⑧ round 3 — law 1: THE QUEUE HAS TWO STATED BOUNDS (a seeded walk of the pure scheduler); law 2: THE EXIT never
//      writes a moved store on the main thread and always ends; law 4: the journal's tail is whole before the next append
// Run: node scripts/test-store-writer-laws.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { walk } from './sync-fs-census.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };

// ── ⑥ ROUND 2 — THE WRITER'S LAWS, in process (each RED on f4d75cd22 by itself) ──────────────────────────────────────
console.log('⑥ round 2 — every byte or nothing, the order of acts, the pace floor, the journal\'s own bytes, the writer\'s own failures, a failed act');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), WK = require(path.join(REPO, 'src/store-writer-worker.js')), P = require(path.join(REPO, 'src/store-pace.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-census-r2-'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // a stand-in thread: the REAL writeJob (or unlink), after VS_R2_DELAY ms; VS_R2_FAIL = every write fails; VS_R2_DIE_IF = a
  // marker file: the thread exits on its first job while that file exists (and removes it)
  const STAND = path.join(T, 'stand.cjs');
  fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4));
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  const die = process.env.VS_R2_DIE_IF; if (die && fs.existsSync(die)) { fs.unlinkSync(die); process.exit(3); }
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const d = Number(process.env.VS_R2_DELAY || 0); if (d) Atomics.wait(Z, 0, 0, d);
  if (process.env.VS_R2_FAIL) err = { code: 'EIO', message: 'the storage failed' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } }
  else { try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; try { fs.unlinkSync(m.tmp); } catch { } } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  const env0 = { ...process.env };
  const withEnv = (o) => { for (const k of ['VS_R2_DELAY', 'VS_R2_FAIL', 'VS_R2_DIE_IF']) delete process.env[k]; Object.assign(process.env, o); };
  const lines = []; const log = { warn: (l) => lines.push(String(l)) };
  try {
    // (A) EVERY BYTE OR NOTHING, on every road: a storage that writes 7 bytes a call writes the whole file; one that stops
    // (returns 0) leaves the store's previous whole version — nothing renamed, the temp removed by the caller
    const short = { ...fs, writeSync: (fd, b, o = 0, len) => fs.writeSync(fd, typeof b === 'string' ? Buffer.from(b) : b, o, Math.min(len == null ? (typeof b === 'string' ? Buffer.byteLength(b) : b.length) - o : len, 7)) };
    let stopAt = 0; const stuck = { ...fs, writeSync: (fd, b, o = 0, len) => { if ((stopAt += 7) > 40) return 0; return fs.writeSync(fd, b, o, Math.min(len, 7)); } };
    const big = 'x'.repeat(3000) + '{"end":true}';
    const fA = path.join(T, 'a.json'), fB = path.join(T, 'b.json'), fJ = path.join(T, 'j.ndjson');
    WK.writeJob({ file: fA, tmp: fA + '.t', parts: [big] }, short);
    WK.writeJob({ file: fB, tmp: fB + '.t', parts: [Uint8Array.from(Buffer.from(big)).buffer] }, short);   // an exact ArrayBuffer, as partsOf hands the thread
    fs.writeFileSync(fJ, 'line0\n'); WK.writeJob({ file: fJ, parts: [Uint8Array.from(Buffer.from('line1\n')).buffer], append: true }, short);
    fs.writeFileSync(path.join(T, 'keep.json'), '{"old":1}'); let threw = null;
    try { WK.writeJob({ file: path.join(T, 'keep.json'), tmp: path.join(T, 'keep.json.t'), parts: [big] }, stuck); } catch (e) { threw = e.code; }
    ok(fs.readFileSync(fA, 'utf8') === big && fs.readFileSync(fB, 'utf8') === big && fs.readFileSync(fJ, 'utf8') === 'line0\nline1\n' && threw === 'ESHORT' && fs.readFileSync(path.join(T, 'keep.json'), 'utf8') === '{"old":1}',
      '(A) WHOLE OR NOT AT ALL on every byte road — a string, a Buffer, an append: 7 bytes a call write the whole file; a storage that stops leaves the previous whole version (ESHORT, nothing renamed)', { threw });
    // (E iii) a store's BAD bytes are its own failed write, said — never an exception out of the writer's timer
    let uncaught = 0; const onU = () => { uncaught++; }; process.on('uncaughtException', onU);
    const w1 = SW.create({ log });
    const bad = path.join(T, 'bad.json'); fs.writeFileSync(bad, '{"old":2}');
    w1.dirty(bad, { name: 'bad.write', produce: () => 42, debounceMs: 0 });
    const okBad = await w1.durable(bad, { timeoutMs: 3000 });
    w1.dirty(path.join(T, 'empty.json'), { name: 'empty.write', produce: () => [], debounceMs: 0 });
    const okEmpty = await w1.durable(path.join(T, 'empty.json'), { timeoutMs: 3000 });
    await sleep(50); process.off('uncaughtException', onU); w1.stop();
    ok(uncaught === 0 && okBad === false && okEmpty === false && fs.readFileSync(bad, 'utf8') === '{"old":2}' && !fs.existsSync(path.join(T, 'empty.json')) && lines.some((l) => /bad\.write not written \(its bytes are not a string or a Buffer/.test(l)) && lines.some((l) => /empty\.write not written \(its bytes are empty/.test(l)),
      '(E iii) a produce() that returns a number or [] is THAT store\'s failed write — said, durable() false, the file untouched; nothing thrown out of the timer', { uncaught, okBad, okEmpty });
    // (C i) A PERSON'S ACT IS THE NEXT WRITE: with one write in flight (300 ms) and four small stores due, a durable act goes next
    withEnv({ VS_R2_DELAY: '300' });
    const order = []; const w2 = SW.create({ log, workerPath: STAND });
    const mk = (n) => { const f = path.join(T, n + '.json'); w2.dirty(f, { name: n, produce: () => `{"n":"${n}"}`, debounceMs: 0, onWritten: () => order.push(n) }); return f; };
    mk('first'); await sleep(50);
    for (const n of ['s1', 's2', 's3', 's4']) mk(n);
    const actF = mk('act'); const tAct = performance.now(); const actOk = await w2.durable(actF, { timeoutMs: 5000 }); const actMs = performance.now() - tAct;
    for (let k = 0; k < 40 && order.length < 2; k++) await sleep(50);   // the order of the first two writes is the law; the rest need not land
    w2.stop();
    // the law is the ORDER (the fast tier holds no wall-clock bound — test-ci-gate's ratchet): the answer's time is said, not judged
    ok(actOk && order[0] === 'first' && order[1] === 'act', `(C i) a durable act is the NEXT write after the one in flight — order ${order.join(' → ')}; answered in ${Math.round(actMs)} ms (the write in flight + its own)`, order);
    // (C ii) THE PACE NEVER ASKS SOONER THAN THE LAST WRITE TOOK
    ok(P.dueAt({ dirtySince: 0, lastEndAt: 1000, bytes: 1024, debounceMs: 100, lastMs: 1200 }) === 2200 && P.dueAt({ dirtySince: 0, lastEndAt: 1000, bytes: 1024, debounceMs: 100, lastMs: 0 }) === 1500,
      '(C ii) a small store\'s next write: never sooner than its last write TOOK (1.2 s ⇒ due at +1.2 s, not the 0.5 s floor)');
    // (E ii) FORGET NEVER WAITS AND NEVER STOPS THE QUEUE: its write in flight lands, then the file goes again
    withEnv({ VS_R2_DELAY: '300' });
    const w3 = SW.create({ log, workerPath: STAND });
    const gone = path.join(T, 'gone.json'), other = path.join(T, 'other.json');
    w3.dirty(gone, { name: 'gone', produce: () => '{"g":1}', debounceMs: 0 }); await sleep(60);
    const tF = performance.now(); w3.forget(gone); const forgetMs = performance.now() - tF, stillFlying = w3.pending(gone);   // by MECHANISM: forget returned while the write still flew
    w3.dirty(other, { name: 'other', produce: () => '{"o":1}', debounceMs: 0 });
    const otherOk = await w3.durable(other, { timeoutMs: 5000 }); await sleep(400); w3.stop();
    ok(stillFlying && otherOk && !fs.existsSync(gone) && fs.existsSync(other), `(E ii) forget() with the file's write in flight returns at once (${forgetMs.toFixed(1)} ms) — the write lands, the file is unlinked after it, and the queue goes on (the next store written)`, { forgetMs, gone: fs.existsSync(gone), otherOk });
    // (E i) THE THREAD DIES ⇒ RESTARTED, bounded; past the bound the main thread — SAID ONCE, and a write there never claims
    // the loop did not wait
    const die = path.join(T, 'die');
    withEnv({ VS_R2_DIE_IF: die }); fs.writeFileSync(die, '1'); lines.length = 0;
    const w4 = SW.create({ log, workerPath: STAND, restartsMax: 1, slowMs: 0 });
    const r1 = path.join(T, 'r1.json'); w4.dirty(r1, { name: 'r1', produce: () => '{"r":1}', debounceMs: 0 });
    const r1ok = await w4.durable(r1, { timeoutMs: 5000 });
    fs.writeFileSync(die, '1'); const r2 = path.join(T, 'r2.json'); w4.dirty(r2, { name: 'r2', produce: () => '{"r":2}', debounceMs: 0 });
    const r2ok = await w4.durable(r2, { timeoutMs: 5000 }); const mode4 = w4.mode(); w4.stop();
    ok(r1ok && r2ok && lines.some((l) => /restarted \(1 of 1 this hour\)/.test(l)) && lines.filter((l) => /from now on every store is written ON THE MAIN THREAD/.test(l)).length === 1 && mode4 === 'main' && lines.some((l) => /r2 took [\d.]+ s to reach the disk .* ON THE MAIN THREAD: the main loop was held/.test(l)) && !lines.some((l) => /r2 took .* the main loop did not wait/.test(l)),
      '(E i) the thread that died is restarted (once here); the second death: the main thread, said ONCE — and its write says it HELD the loop, never «did not wait»', lines.slice(0, 6));
    // (E iv) a killed process's temp files are swept by the next process's first write of that file
    withEnv({});
    const sw = path.join(T, 'sw.json'); for (const t0 of ['.tmp-99999990-w', '.tmp-99999991']) fs.writeFileSync(sw + t0, 'torn');
    const mine = sw + `.tmp-${process.pid}-x`; fs.writeFileSync(mine, 'mine');
    const w5 = SW.create({ log }); w5.dirty(sw, { name: 'sw', produce: () => '{"s":1}', debounceMs: 0 }); await w5.durable(sw); w5.stop();
    ok(!fs.existsSync(sw + '.tmp-99999990-w') && !fs.existsSync(sw + '.tmp-99999991') && fs.existsSync(mine), '(E iv) the temp files a killed process left (another pid\'s) are swept at the first write of the file — never this process\'s');
    // (E v) AN OUTAGE IS NO WRITE PER ACT: a failing store keeps its backoff even when acts wait on it
    withEnv({ VS_R2_FAIL: '1' });
    const w6 = SW.create({ log: { warn() {} }, workerPath: STAND }); let tries = 0;
    const out = path.join(T, 'out.json');
    for (let i = 0; i < 20; i++) { w6.dirty(out, { name: 'out', produce: () => { tries++; return '{"o":1}'; }, debounceMs: 0 }); w6.durable(out, { timeoutMs: 100 }).catch(() => { }); await sleep(50); }
    w6.stop();
    ok(tries <= 3, `(E v) 20 acts in 1 s on a failing storage: ${tries} write attempts (the 1 s / 2 s backoff kept — never one per act)`, { tries });
    // (C iii / iv) THE JOURNAL: an act appends its own bytes (never the whole journal again); an act that changes nothing
    // writes nothing; past its bound it is said and the index is written to fold it
    withEnv({});
    const jd = path.join(T, 'jx'); fs.mkdirSync(jd);
    const w7 = SW.create({ log: { warn() {} } }), jl = [];
    const st = CS.createChannelStore({ dir: jd, log: { warn: (l) => jl.push(String(l)), log() {} }, writer: w7, actsMaxBytes: 40 * 1024 });
    await st.index.update(() => { for (let i = 0; i < 20; i++) st.index.entry('a', 'c' + i).title = 'x'.repeat(2000); });
    st.index.flush();
    const actsStat = () => (w7.stats().find((x) => x.name === 'channels-acts.write') || { bytesWritten: 0, writes: 0 });
    for (let i = 0; i < 30; i++) await st.index.update(() => { st.index.entry('a', 'c' + (i % 20)).readAt = 1000 + i; }, { durable: true });
    const a30 = actsStat();
    await st.index.update(() => { st.index.entry('a', 'c1').readAt = 1000 + 21; }, { durable: true });   // the same value again: nothing changed
    const a31 = actsStat();
    const perAct = a30.bytesWritten / 30;
    ok(perAct < 4096 && a30.bytesWritten < 120 * 1024 && a31.writes === a30.writes && a31.bytesWritten === a30.bytesWritten, `(C iii) 30 acts on ~2 KB rows: ${Math.round(a30.bytesWritten / 1024)} KB written to the journal in all (${Math.round(perAct)} B an act — its OWN bytes, never the whole journal again); (C iv) an act that changes nothing writes nothing`, { a30, a31 });
    for (let i = 0; i < 40; i++) await st.index.update(() => { st.index.entry('a', 'c' + (i % 20)).readAt = 2000 + i; }, { durable: true });
    ok(jl.some((l) => /index-acts\.ndjson is past its bound/.test(l)), '(C iii) the journal past its stated bound is SAID — and the index is written to fold it', jl.slice(-2));
    try { st.close(); } catch { } w7.stop();
    // (smaller 3) THE JOURNAL'S LOAD SAYS WHAT IT DROPPED: a torn line, an out-of-order seq and a line the index holds —
    // never applied, each COUNTED in the load's one line (round 1 dropped a torn line in silence and applied a backwards seq)
    {
      const ld = path.join(T, 'jload'); fs.mkdirSync(ld);
      const w9 = SW.create({ log: { warn() {} } }), ll = [];
      const s0 = CS.createChannelStore({ dir: ld, log: { warn() {}, log() {} }, writer: w9 });
      await s0.index.update(() => { s0.index.entry('a', 'k1').title = 'one'; s0.index.entry('a', 'k2').title = 'two'; });
      s0.index.flush(); try { s0.close(); } catch { }
      const held = JSON.parse(fs.readFileSync(path.join(ld, 'index.json'), 'utf8')).actsSeq || 0;
      fs.writeFileSync(path.join(ld, 'index-acts.ndjson'), [JSON.stringify({ seq: held, rows: { 'a/k1': { title: 'held-old' } } }), JSON.stringify({ seq: held + 2, rows: { 'a/k1': { title: 'act-two' } } }), '{"seq":' + (held + 3) + ',"rows":{"a/k2"', JSON.stringify({ seq: held + 1, rows: { 'a/k2': { title: 'backwards' } } })].join('\n') + '\n');
      const s1 = CS.createChannelStore({ dir: ld, log: { warn: (l) => ll.push(String(l)), log() {} }, writer: w9 });
      const k1 = s1.index.peek('a/k1'), k2 = s1.index.peek('a/k2'); try { s1.close(); } catch { } w9.stop();
      const said = ll.find((l) => /index-acts\.ndjson: 1 act the index did not hold yet replayed/.test(l)) || '';
      ok(k1 && k1.title === 'act-two' && k2 && k2.title === 'two' && /1 line not readable dropped/.test(said) && /1 out of order dropped/.test(said) && /1 the index already holds skipped/.test(said),
        `(smaller 3) the journal's load says what it dropped — one torn line, one out of order, one held — and applies only the act past the index (${said.slice(0, 200)})`, { k1, k2, ll });
    }
    // (F) A FAILED ACT REACHES THE CALLER: the store's write fails ⇒ update() rejects «not-durable» — applied in memory, said so
    withEnv({ VS_R2_FAIL: '1' });
    const fd2 = path.join(T, 'fx'); fs.mkdirSync(fd2);
    const w8 = SW.create({ log: { warn() {} }, workerPath: STAND });
    const st2 = CS.createChannelStore({ dir: fd2, log: { warn() {}, log() {} }, writer: w8 });
    let fErr = null; try { await st2.index.update(() => { st2.index.entry('a', 'z').title = 'act'; }, { durable: true }); } catch (e) { fErr = e; }
    const inMem = st2.index.peek('a/z');
    try { st2.close(); } catch { } w8.stop();
    ok(fErr && fErr.code === 'not-durable' && fErr.status === 503 && fErr.applied === true && /not on disk yet/.test(fErr.message) && inMem && inMem.title === 'act', '(F) an act whose write failed REJECTS «not-durable» (503) — the person is told it is in memory, not on disk; never {ok: true}', fErr && { code: fErr.code, message: fErr.message });
  } finally { for (const k of ['VS_R2_DELAY', 'VS_R2_FAIL', 'VS_R2_DIE_IF']) { if (env0[k] === undefined) delete process.env[k]; else process.env[k] = env0[k]; } fs.rmSync(T, { recursive: true, force: true }); }
  // (D) THE EXIT LAW IS A CALL — an AST walk of server.js (round 1's beginExit() sat inside a `//` comment and a text match
  // passed it): the shutdown and the crash path each CALL beginExit(); round 6 (E1): NO judge at the exit hook's join (no
  // bound of ours ends an exit — the re-raised signal is gone); E3 (a): the BOOT calls bootKeeper() by name, at the top
  // level (never inside a road that runs at the exit); the behaviour is pinned live (test-store-writer ⑧)
  {
    const ACd = require(path.join(REPO, 'node_modules/acorn'));
    const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    const callsIn = (src) => { const ast = ACd.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, sourceType: 'script' }); const got = { beginExit: 0, atJoinWriter: 0, bootKeeperTop: 0 };
      walk(ast, (n, parents) => { if (n.type !== 'CallExpression') return; const nm = n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : n.callee.type === 'Identifier' ? n.callee.name : null;
        if (nm === 'beginExit') got.beginExit++; if (nm === 'atJoin' && n.arguments[0] && n.arguments[0].type === 'Literal' && n.arguments[0].value === 'store-writer') got.atJoinWriter++;
        if (nm === 'bootKeeper' && !(parents || []).some((q) => /Function/.test(q.type))) got.bootKeeperTop++; }); return got; };
    const live = callsIn(srv), commented = callsIn(srv.split('SW0.beginExit(); ').join('// SW0.beginExit(); \n').split("try { require('./src/store-writer.js').bootKeeper(); } catch {}").join('// bootKeeper();'));
    ok(live.beginExit === 2 && live.atJoinWriter === 0 && live.bootKeeperTop === 1 && commented.beginExit === 1 && commented.bootKeeperTop === 0, `(D) server.js CALLS beginExit() in the shutdown and the crash path, registers NO judge at the join (round 6), and its BOOT calls bootKeeper() at the top level (an AST walk: ${JSON.stringify(live)}); CONTROL: the calls behind a comment count ${commented.beginExit} / ${commented.bootKeeperTop}`, { live, commented });
  }
}


// ── ⑧ ROUND 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑧ round 3 — law 1: the queue\'s two stated bounds, a seeded walk of the pure scheduler');
{
  const P = require(path.join(REPO, 'src/store-pace.js'));
  const MB = 1048576;
  // xorshift32, the seed MIXED and its first outputs dropped (a small seed's first draws are tiny: every walk drew one store)
  const rng = (seed) => { let x = (Math.imul(seed >>> 0 || 1, 2654435761) >>> 0) || 1; const nx = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; for (let i = 0; i < 16; i++) nx(); return nx; };
  // ONE walk: Kd durable stores (each takes acts), Pp paced stores (each changes on its own stream), write durations drawn per
  // write; the pure scheduler (`pick`) chooses the next write each time the one in flight ends. Every act counts the writes
  // that COMPLETE from its arrival to its own write (the one in flight at its arrival included); every paced store counts the
  // writes that complete from the moment it is DUE to its own write. `pick` = THE verdict (P.nextOf) or a control.
  function walk1(seed, pick) {
    const R = rng(seed), Kd = 1 + Math.floor(R() * 4), Pp = 1 + Math.floor(R() * 6), baseW = 50 + R() * 2450, END = 120000;
    // ROUND 4 (true words 1): FAILING WRITES too — in 40 % of the walks a durable write fails at 5–20 % (the writer's own
    // backoff, src/store-pace.js retryMs); an act is answered at its own store's next write, landed or failed (durable()
    // resolves false at the failure), and its bound is 2K + 1 with K = the durable stores with ANY unwritten change at its
    // arrival — its own and the one in flight included
    const failP = R() < 0.4 ? 0.05 + R() * 0.15 : 0;
    const stores = [];
    for (let i = 0; i < Kd; i++) stores.push({ name: 'd' + i, durable: true, every: 50 + R() * 2950, next: R() * 1000, dirty: false, dirtySince: null, lastEndAt: null, lastMs: 0, bytes: 4096, debounceMs: 0, ep: null, failures: 0, failedAt: null });
    for (let i = 0; i < Pp; i++) stores.push({ name: 'p' + i, durable: false, every: 20 + R() * 4980, next: R() * 1000, dirty: false, dirtySince: null, lastEndAt: null, lastMs: 0, bytes: R() < 0.3 ? R() * 22 * MB : 1024 + R() * 1e6, debounceMs: R() * 500, ep: null });
    const dueOf = (s) => (s.durable ? Math.max(s.dirtySince, s.failures ? s.failedAt + P.retryMs(s.failures) : -Infinity) : P.dueAt({ dirtySince: s.dirtySince, lastEndAt: s.lastEndAt, bytes: s.bytes, debounceMs: s.debounceMs, lastMs: s.lastMs }));
    let t = 0, inflight = null, last = null, acts = [], answered = 0, maxA = 0, maxP = 0, pacedWrites = 0, guard = 0;
    const bad = [], boundP = P.pacedBoundWrites(Pp);
    let ratioA = 0, failed = 0, ratioOwed = 0;
    while (t < END && guard++ < 1e6) {
      for (const a of acts) if (a.k == null && t >= a.from) a.k = stores.filter((x) => x.durable && (x.dirty || (inflight && inflight.s === x))).length;   // its backoff ended: K now
      if (!inflight) {
        const nx = pick(stores.filter((s) => s.dirty).map((s) => ({ name: s.name, due: dueOf(s), dirtySince: s.dirtySince, urgent: s.durable, failedAt: s.failures ? s.failedAt : null })), t, { last });
        if (nx) {
          const s = stores.find((x) => x.name === nx.name); last = s.durable ? 'urgent' : 'paced';
          const dur = baseW * (0.5 + R());
          inflight = { s, endAt: t + dur, dur, ep: s.ep, mine: acts.filter((a) => a.store === s && !a.by), since: s.dirtySince, fails: s.durable && R() < failP };
          for (const a of inflight.mine) a.by = inflight;
          s.ep = null; s.dirty = false; s.dirtySince = null;
        }
      }
      const nextArr = Math.min(...stores.map((s) => s.next));
      const nextDue = inflight ? Infinity : Math.min(Infinity, ...stores.filter((s) => s.dirty).map(dueOf));
      t = Math.max(t, Math.min(nextArr, inflight ? inflight.endAt : Infinity, nextDue));
      for (const s of stores) if (!s.durable && s.dirty && !s.ep && !(inflight && inflight.s === s) && dueOf(s) <= t) s.ep = { w: 0, at: t };   // DUE from here (a store in flight is not a candidate — the writer's dueRows too)
      if (inflight && inflight.endAt <= t) {
        const f = inflight; inflight = null;
        for (const a of acts) if (a.k != null) a.w++;   // a write counts for an act from its arrival (or its backoff's end)
        for (const s of stores) if (s.ep) s.ep.w++;
        if (f.ep) f.ep.w++;
        f.s.lastEndAt = t; f.s.lastMs = f.dur;
        if (f.fails) { failed++; f.s.failures++; f.s.failedAt = t; if (!f.s.dirty) { f.s.dirty = true; f.s.dirtySince = f.since; } else if (f.since < f.s.dirtySince) f.s.dirtySince = f.since; }   // the writer's fail(): owed again, its oldest change kept
        else if (f.s.durable) f.s.failures = 0;
        if (f.s.ep && dueOf(f.s) > t) f.s.ep = null;   // changed while its own write flew: due again only after its gap from THIS write
        // a FAILED write answers EVERY act waiting on its store (the writer's fail(): each waiter hears false at once — said, owed)
        const heard = f.fails ? acts.filter((a) => a.store === f.s) : f.mine;
        for (const a of heard) { answered++; if (a.k == null) a.k = 1; const bA = P.actBoundWrites(a.k); maxA = Math.max(maxA, a.w); ratioA = Math.max(ratioA, a.w / bA); ratioOwed = Math.max(ratioOwed, a.w / P.actBoundWrites(Math.min(a.kOwed, Kd))); if (a.w > bA && bad.length < 3) bad.push({ seed, kind: 'act', writes: a.w, bound: bA, k: a.k, Kd, Pp, failP: +failP.toFixed(2) }); }
        acts = acts.filter((a) => !heard.includes(a));
        if (!f.s.durable) { pacedWrites++; if (f.ep) { maxP = Math.max(maxP, f.ep.w); if (f.ep.w > boundP && bad.length < 3) bad.push({ seed, kind: 'paced', store: f.s.name, writes: f.ep.w, bound: boundP, Kd, Pp }); } }
      }
      for (const s of stores) if (s.next <= t) {
        if (!s.dirty) { s.dirty = true; s.dirtySince = t; }
        // K AT ITS ARRIVAL — or, its own store in a failure backoff, at that backoff's END (from then it counts: a failing
        // storage is not retried sooner); round 3's sentence: the acts owed
        if (s.durable) { const until = s.failures ? s.failedAt + P.retryMs(s.failures) : -Infinity; acts.push({ store: s, w: 0, at: t, by: null, from: Math.max(t, until), k: until > t ? null : stores.filter((x) => x.durable && (x.dirty || (inflight && inflight.s === x))).length, kOwed: acts.filter((x) => !x.by).length + 1 }); }
        s.next = t + s.every * (0.2 + 1.6 * R());
      }
    }
    // a store still owed at the end: its count so far must also be within the bound (no class waits for ever)
    for (const a of acts) if (a.w > P.actBoundWrites(a.k) && bad.length < 3) bad.push({ seed, kind: 'act still owed', writes: a.w, bound: P.actBoundWrites(a.k), k: a.k, Kd, Pp });
    for (const s of stores) if (s.ep && s.ep.w > boundP && bad.length < 3) bad.push({ seed, kind: 'paced still owed', store: s.name, writes: s.ep.w, bound: boundP, Kd, Pp });
    return { bad, answered, maxA, maxP, pacedWrites, Kd, Pp, ratioA, failed, failing: failP > 0, ratioOwed };
  }
  const SEEDS = [...Array(300)].map((_, i) => 1000 + i);
  const runAll = (pick) => { let bad = [], answered = 0, worstA = 0, worstP = 0, pacedWrites = 0, worstRatioA = 0, worstRatioP = 0, failedWrites = 0, failingWalks = 0, worstOwed = 0, worstPFail = 0, worstPOk = 0; const kds = new Set(), pps = new Set();
    for (const sd of SEEDS) { const r = walk1(sd, pick); kds.add(r.Kd); pps.add(r.Pp); bad = bad.concat(r.bad); answered += r.answered; pacedWrites += r.pacedWrites; worstA = Math.max(worstA, r.maxA); worstP = Math.max(worstP, r.maxP);
      worstRatioA = Math.max(worstRatioA, r.ratioA); worstRatioP = Math.max(worstRatioP, r.maxP / P.pacedBoundWrites(r.Pp)); failedWrites += r.failed; failingWalks += r.failing ? 1 : 0; worstOwed = Math.max(worstOwed, r.ratioOwed); const rp = r.maxP / P.pacedBoundWrites(r.Pp); if (r.failing) worstPFail = Math.max(worstPFail, rp); else worstPOk = Math.max(worstPOk, rp); }
    return { bad, answered, worstA, worstP, pacedWrites, worstRatioA: +worstRatioA.toFixed(2), worstRatioP: +worstRatioP.toFixed(2), kds: kds.size, pps: pps.size, failedWrites, failingWalks, worstOwed: +worstOwed.toFixed(2), worstPFail: +worstPFail.toFixed(2), worstPOk: +worstPOk.toFixed(2) }; };
  const law = runAll(P.nextOf);
  ok(!law.bad.length && law.answered > 10000 && law.pacedWrites > 1000 && law.kds === 4 && law.pps === 6 && law.failingWalks >= 60 && law.failedWrites > 200,
    `law 1 (a)+(b) over ${SEEDS.length} seeded walks (1–4 durable stores × 1–6 paced, 50 ms – 3.7 s a write, 120 s each; ${law.failingWalks} of them with failing durable writes — ${law.failedWrites} failed): ${law.answered} acts, each answered within 2K + 1 writes, K = the durable stores with ANY unwritten change at its arrival (the most any took: ${law.worstA}; ${law.worstRatioA} of its bound at worst), ${law.pacedWrites} paced writes, each within 2P + 1 writes of becoming due (the most: ${law.worstP}; ${law.worstRatioP} of its bound — round 5: ${law.worstPOk} on the walks without failing writes, ${law.worstPFail} on the ${law.failingWalks} with them)`, law.bad);
  // ROUND 4 (true words 1): THE TWO FALSE THINGS round 3 said, measured on the same walks — the old ORDER (a failed store's
  // retry at its FIRST change, ahead of every newer act after each backoff) breaks the bound; the old SENTENCE (K = the acts
  // owed at the arrival) is exceeded by the walk's own acts
  const placeR3 = (rows, now, { last = null } = {}) => { let u = null, p = null;
    for (const r of rows || []) { if (!(r.due <= now)) continue; if (r.urgent) { if (!u || r.dirtySince < u.dirtySince) u = r; } else if (!p || r.due < p.due || (r.due === p.due && r.dirtySince < p.dirtySince)) p = r; }
    if (u && p) return last === 'urgent' ? p : u; return u || p; };
  const r3 = runAll(placeR3);
  ok(r3.bad.some((b) => b.kind === 'act' && b.failP > 0) && law.worstOwed > 1, `true words 1: round 3's ORDER (a failed store's retry back at its first change) breaks bound (a) on the walks with failing writes — an act waited ${Math.max(...r3.bad.filter((b) => b.kind === 'act').map((b) => b.writes), 0)} writes (its bound ${(r3.bad.find((b) => b.kind === 'act') || {}).bound}); round 3's SENTENCE (K = the acts owed at the arrival) is exceeded ${law.worstOwed}× by the walk's own acts — the table now states K as above (${law.worstRatioA} of it at worst)`, { r3bad: r3.bad.slice(0, 2), worstOwed: law.worstOwed });
  // RED CONTROL: round 2's verdict (an act is ALWAYS the next write) — the same walks starve a paced store
  const round2 = (rows, now) => { let best = null; const before = (a, b) => (!!a.urgent !== !!b.urgent ? !!a.urgent : a.urgent ? a.dirtySince < b.dirtySince : a.due < b.due || (a.due === b.due && a.dirtySince < b.dirtySince));
    for (const r of rows) { if (!(r.due <= now)) continue; if (!best || before(r, best)) best = r; } return best; };
  const ctl = runAll(round2);
  ok(ctl.bad.some((b) => /paced/.test(b.kind)), `CONTROL: round 2's «an act is the next write» breaks bound (b) in the same walks — a paced store waited ${Math.max(...ctl.bad.filter((b) => /paced/.test(b.kind)).map((b) => b.writes), 0)} writes past due (bound ${(ctl.bad.find((b) => /paced/.test(b.kind)) || {}).bound})`, ctl.bad.slice(0, 2));
  const tb = P.boundsTable({ writeMs: 1200 });
  ok(tb.acts[0].writes === 3 && tb.acts[0].ms === 3600 && tb.paced[0].writes === 3 && tb.acts[1].writes === 5,
    `the bounds as a person waits them at 1.2 s a write: an act ${tb.acts.map((r) => `${r.durableStoresWithAChange} durable store${r.durableStoresWithAChange > 1 ? 's' : ''} with a change ${(r.ms / 1000).toFixed(1)} s`).join(' · ')}; a paced store past due ${tb.paced.map((r) => `${r.pacedStoresDue} due ${(r.msPastDue / 1000).toFixed(1)} s`).join(' · ')}`);
}
// ── ⑧ ROUND 3 — law 2: the exit's ORDER in server.js, by position (round 2 counted calls, blind to where they stood) ──
console.log('⑧ round 3 — law 2: in the shutdown and the crash path, the exit begins BEFORE any store is flushed');
{
  const ACx = require(path.join(REPO, 'node_modules/acorn'));
  const nameOf = (n) => (n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : n.callee.type === 'Identifier' ? n.callee.name : null);
  // in each exit road: the first beginExit() and the first exitFlush({only:'rank0'}) come BEFORE every other store flush
  // (a call named flush… / persist…: the SyncStores, layouts, session-status, user-todos, telemetry, the spend guard …)
  const orderOf = (src) => {
    const ast = ACx.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, sourceType: 'script' });
    const roads = [];
    walk(ast, (n) => {
      if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'shutdownNow') roads.push({ road: 'shutdownNow', node: n });
      if (n.type === 'CallExpression' && nameOf(n) === 'on' && n.arguments[0] && n.arguments[0].value === 'uncaughtException' && n.arguments[1]) roads.push({ road: 'the crash path', node: n.arguments[1] });
    });
    return roads.map(({ road, node }) => {
      let begin = Infinity, rank0 = Infinity, firstFlush = Infinity, firstFlushName = null;
      walk(node, (c) => { if (c.type !== 'CallExpression') return; const nm = nameOf(c) || '';
        if (nm === 'beginExit') begin = Math.min(begin, c.start);
        else if (nm === 'exitFlush' && c.arguments[0] && c.arguments[0].type === 'ObjectExpression' && c.arguments[0].properties.some((q) => q.key && q.key.name === 'only')) rank0 = Math.min(rank0, c.start);
        else if (/^flush|^persist|Flush/.test(nm) && nm !== 'exitFlush' && c.start < firstFlush) { firstFlush = c.start; firstFlushName = nm; } });
      return { road, ok: begin < rank0 && rank0 < firstFlush, begin, rank0, firstFlush, firstFlushName };
    });
  };
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const live = orderOf(srv);
  ok(live.length === 2 && live.every((r) => r.ok), `law 2: in ${live.map((r) => r.road).join(' and ')}, beginExit() then the rank-0 flush come BEFORE every other store's flush (${live.map((r) => `${r.road}: the first other flush is ${r.firstFlushName}()`).join('; ')})`, live);
  // MUTANTS by name: the writer's line moved after the stores' flushes, in each road
  const crashLine = srv.split('\n').find((l) => /let w0 = null; try \{ w0 = require\('\.\/src\/store-writer\.js'\)\.storeWriter\(\)/.test(l));
  const mutCrash = crashLine ? srv.replace(crashLine + '\n', '').replace("  console.error(e); try { w0.exitFlush(", crashLine + '\n  console.error(e); try { w0.exitFlush(') : null;
  const sdLine = "try { const SW0 = require('./src/store-writer.js').storeWriter(); SW0.beginExit(); SW0.exitFlush({ only: 'rank0' }); } catch {} ";
  const mutSd = srv.includes(sdLine) ? srv.replace(sdLine, '').replace("  try { require('./src/store-writer.js').storeWriter().exitFlush({ debtMs", '  ' + sdLine + "try { require('./src/store-writer.js').storeWriter().exitFlush({ debtMs") : null;
  const rc = mutCrash && orderOf(mutCrash).find((r) => r.road === 'the crash path'), rs = mutSd && orderOf(mutSd).find((r) => r.road === 'shutdownNow');
  ok(!!rc && !rc.ok && !!rs && !rs.ok, `CONTROL by name: the crash path with its writer line moved after the flushes is RED (${rc && rc.firstFlushName}() first); the shutdown likewise (${rs && rs.firstFlushName}() first)`, { rc, rs });
}
// ── ⑧ ROUND 3 — law 3: A FILE'S FIRST VERSION IS A FACT OF THE DISK, NOT OF THIS PROCESS ─────────────────────────────
console.log('⑧ round 3 — law 3: after a restart, an existing meta\'s first update takes the writer; a sync write supersedes, never unlinks');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), SO = require(path.join(REPO, 'src/server/session-stdout.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r3-'));
  const STAND3 = path.join(T, 'stand.cjs');
  fs.writeFileSync(STAND3, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4));
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const d = Number(process.env.VS_R3_DELAY || 0); if (d) Atomics.wait(Z, 0, 0, d);
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  const make = (dir) => SO.create({ rootDir: T, BUFFERS_DIR: path.join(T, 'buf'), META_DIR: dir, DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(T, 'nope'),
    CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions: new Map(), engine: {}, checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { },
    noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h, sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null });
  const realSW = SW.storeWriter, realW = fs.writeFileSync, realR = fs.renameSync, sleep3 = (ms) => new Promise((r) => setTimeout(r, ms));
  let syncWrites = [];
  try {
    // (i) a RESTART over 20 existing metas (this process never wrote them), one update of each, then a socket being born
    const dir = path.join(T, 'meta-a'); fs.mkdirSync(dir, { recursive: true });
    for (let k = 0; k < 20; k++) realW.call(fs, path.join(dir, `cw-${k}.json`), JSON.stringify({ k, v: 0 }));
    const w = SW.create({ log: { warn() {} } }); SW.storeWriter = () => w;
    fs.writeFileSync = function (p, ...a) { if (String(p).startsWith(dir)) syncWrites.push(String(p)); return realW.call(fs, p, ...a); };
    fs.renameSync = function (a, b) { if (String(b).startsWith(dir)) syncWrites.push(String(b)); return realR.call(fs, a, b); };
    const so = make(dir);
    for (let k = 0; k < 20; k++) so.writeSessionMeta(`cw-${k}`, { k, v: 1 });
    const updates = syncWrites.length;
    so.writeSessionMeta('cw-born', { born: true });
    const born = syncWrites.length - updates;
    fs.writeFileSync = realW; fs.renameSync = realR;
    w.flushSync(); w.stop();
    const all = [...Array(20)].every((_, k) => JSON.parse(fs.readFileSync(path.join(dir, `cw-${k}.json`), 'utf8')).v === 1);
    ok(updates === 0 && born === 2 && all, `law 3: a restart over 20 existing metas, one update of each — ${updates} synchronous store writes on the main thread (the directory listed once); a socket being born — its first version written here (${born} calls: the temp and its rename); every update on disk through the writer`, { updates, born });
    // (ii) {sync: true} over an in-flight PACED write of the same meta: the file holds the sync version, and STAYS
    process.env.VS_R3_DELAY = '300';
    const dir2 = path.join(T, 'meta-b'); fs.mkdirSync(dir2, { recursive: true }); realW.call(fs, path.join(dir2, 'cw-x.json'), '{"v":0}');
    const w2 = SW.create({ log: { warn() {} }, workerPath: STAND3 }); SW.storeWriter = () => w2;
    const so2 = make(dir2);
    so2.writeSessionMeta('cw-x', { v: 'paced' });
    await sleep3(180);   // its paced write (100 ms debounce) is in flight on the thread (300 ms)
    const flying = w2.pending(path.join(dir2, 'cw-x.json'));
    so2.writeSessionMeta('cw-x', { v: 'sync' }, { sync: true });
    const rightAfter = fs.readFileSync(path.join(dir2, 'cw-x.json'), 'utf8');
    await sleep3(500);
    const later = fs.existsSync(path.join(dir2, 'cw-x.json')) ? fs.readFileSync(path.join(dir2, 'cw-x.json'), 'utf8') : '(deleted)';
    w2.stop(); delete process.env.VS_R3_DELAY;
    ok(flying && /"sync"/.test(rightAfter) && /"sync"/.test(later), `law 3: {sync: true} over a paced write in flight SUPERSEDES it — the file holds the sync version right after (${rightAfter}) and ${later === '(deleted)' ? 'was DELETED' : `still does 0.5 s later (${later})`} — never unlinked by the forgotten write`, { flying, rightAfter, later });
  } finally { fs.writeFileSync = realW; fs.renameSync = realR; SW.storeWriter = realSW; delete process.env.VS_R3_DELAY; fs.rmSync(T, { recursive: true, force: true }); }
}
// ── ⑧ ROUND 3 — law 4: THE JOURNAL'S TAIL IS ALWAYS A WHOLE LINE BEFORE THE NEXT APPEND ─────────────────────────────────
console.log('⑧ round 3 — law 4: a failed append leaves the journal unknown — the next write re-establishes a whole tail');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r3j-'));
  // a stand-in thread that runs the REAL writeJob, and on the FIRST append job while a fault marker exists hands it a file
  // system that fails as asked: VS_R3J_FAULT = enospc (4 KB written, then ENOSPC) · short (4 KB, then 0) · fsync (EIO at
  // fsync); VS_R3J_TRUNC=eio makes the truncate-back fail too (the fragment stays)
  const STANDJ = path.join(T, 'standj.cjs');
  fs.writeFileSync(STANDJ, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const dirOf = require('path').dirname(m.file), marker = require('path').join(dirOf, 'fault'), faulty = m.append && fs.existsSync(marker);
  let f = fs, cfg = {}; try { cfg = JSON.parse(fs.readFileSync(require('path').join(dirOf, 'fault.json'), 'utf8')); } catch { }   // the scene's own fault (scenes run side by side)
  if (faulty) { fs.unlinkSync(marker); let n = 0; const fault = cfg.fault;
    f = { ...fs,
      writeSync: (fd, b, o = 0, l) => { const len = l == null ? b.length - o : l; if (fault === 'fsync') return fs.writeSync(fd, b, o, len); if (n >= 4096) { if (fault === 'short') return 0; throw Object.assign(new Error('no space left'), { code: 'ENOSPC' }); } const k = fs.writeSync(fd, b, o, Math.min(len, 4096 - n)); n += k; return k; },
      fsyncSync: (fd) => { if (fault === 'fsync') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.fsyncSync(fd); },
      ftruncateSync: (fd, len) => { if (cfg.trunc === 'eio') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.ftruncateSync(fd, len); } }; }
  const blockIx = m.ev === 'write' && /index\\.json$/.test(m.file) && fs.existsSync(require('path').join(require('path').dirname(m.file), 'blockix'));   // the index unwritable: the journal is the act's only record
  if (blockIx) err = { code: 'EIO', message: 'the index is unwritable in this scene' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { writeJob(m, f); } catch (e) { err = { code: e.code || null, message: e.message }; try { if (m.tmp) fs.unlinkSync(m.tmp); } catch { } } }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  const sleepJ = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = async (fault, trunc) => {
    const dir = path.join(T, `j-${fault}-${trunc}`); fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, 'fault'); fs.writeFileSync(path.join(dir, 'fault.json'), JSON.stringify({ fault, trunc }));
    const w = SW.create({ log: { warn() {} }, workerPath: STANDJ });
    let promised = null, after = null, lines = [], replay = null, said = [];
    try {
      const st = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w });
      await st.index.update(() => { for (let i = 0; i < 4; i++) st.index.entry('a', 'c' + i).title = 't' + i; });
      st.index.flush();
      fs.writeFileSync(path.join(dir, 'blockix'), '1');   // from here the index cannot be written: the journal alone holds the acts
      await st.index.update(() => { st.index.entry('a', 'c0').readAt = 101; }, { durable: true });      // act 1: appended whole
      fs.writeFileSync(marker, '1');                                                                     // the NEXT append fails as asked
      try { await st.index.update(() => { st.index.entry('a', 'c1').note = 'x'.repeat(9000); }, { durable: true }); } catch (e) { promised = e.code; }   // act 2: the person told «in memory, written when the storage answers»
      for (let k = 0; k < 40 && w.pending(path.join(dir, 'index-acts.ndjson')); k++) await sleepJ(100);   // the writer's own retry (its 1 s backoff)
      after = fs.readFileSync(path.join(dir, 'index-acts.ndjson'), 'utf8');
      lines = after.split('\n').filter(Boolean);
      try { st.close(); } catch { }
      fs.unlinkSync(path.join(dir, 'blockix'));
      const st2 = CS.createChannelStore({ dir, log: { warn: (l) => said.push(String(l)), log() {} }, writer: w });   // a restart over the same dir
      replay = st2.index.peek('a/c1'); try { st2.close(); } catch { }
    } finally { w.stop(); }
    const whole = lines.length >= 2 && lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }) && after.endsWith('\n');
    return { fault, trunc, promised, whole, lines: lines.length, act2OnDiskAfterRestart: !!(replay && replay.note && replay.note.length === 9000), unreadableSaid: said.some((l) => /not readable/.test(l)) };
  };
  const res = await Promise.all([['enospc', 'eio'], ['short', 'eio'], ['fsync', 'eio'], ['enospc', 'ok']].map(([fault, trunc]) => scene(fault, trunc)));   // side by side: each its own dir, writer and thread
  ok(res.every((r) => r.promised === 'not-durable' && r.whole && r.act2OnDiskAfterRestart && !r.unreadableSaid),
    `law 4: an append that failed (${res.map((r) => `${r.fault}${r.trunc === 'eio' ? ' + its truncate EIO' : ''}`).join(' · ')}) — the act said «not on disk yet», the next good write re-established a WHOLE tail (every line parses), and after a restart the act is THERE`, res);
}
// ── ⑧ ROUND 3 — the smaller items' words: an undefined produce, one line per cause, a wrong-shape line ─────────────────
console.log('⑧ round 3 — smaller 4 and 7');
{
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'store-laws-r3s-'));
  try {
    // (4) a produce() that returns undefined is a failed write, said — never «nothing to write» (durable true, the change dropped)
    const said = []; const w = SW.create({ log: { warn: (l) => said.push(String(l)) } });
    const f = path.join(T, 'u.json'); fs.writeFileSync(f, '{"old":1}');
    w.dirty(f, { name: 'undef.write', produce: () => undefined, debounceMs: 0 });
    const okU = await w.durable(f, { timeoutMs: 3000 }); w.stop();
    ok(okU === false && said.some((l) => /undef\.write not written \(its bytes are not a string or a Buffer \(undefined\)/.test(l)) && fs.readFileSync(f, 'utf8') === '{"old":1}',
      'smaller 4: a produce() that returns undefined is THAT store\'s failed write, said — durable() false, the file untouched (only null says «nothing to write»)', said);
    // (7) an outage: five acts fail — ONE line for the cause, the rest counted and said when a write lands
    const d1 = path.join(T, 'o'); fs.mkdirSync(d1);
    const w1 = SW.create({ log: { warn() {} } }), ll = [];
    const st = CS.createChannelStore({ dir: d1, log: { warn: (l) => ll.push(String(l)), log() {} }, writer: w1 });
    await st.index.update(() => { st.index.entry('a', 'c').title = 't'; }); st.index.flush();
    const realDur = w1.durable; w1.durable = () => Promise.resolve(false);   // the storage failing every act's write
    for (let i = 0; i < 5; i++) { try { await st.index.update(() => { st.index.entry('a', 'c').readAt = 10 + i; }, { durable: true }); } catch { } }
    w1.durable = realDur;
    const outageLines = ll.filter((l) => /an act is in memory but not on disk yet/.test(l)).length;
    try { st.close(); } catch { } w1.stop();
    ok(outageLines === 1, `smaller 7: five acts failed in an outage — ${outageLines} line for the cause (round 2: one line per act)`, ll);
    // (7) the journal's load: valid JSON that is not an act's line is SAID as that, never «not readable»
    const d2 = path.join(T, 'w'); fs.mkdirSync(d2);
    const w2 = SW.create({ log: { warn() {} } }), l2 = [];
    const s0 = CS.createChannelStore({ dir: d2, log: { warn() {}, log() {} }, writer: w2 });
    await s0.index.update(() => { s0.index.entry('a', 'c').title = 't'; }); s0.index.flush(); try { s0.close(); } catch { }
    fs.writeFileSync(path.join(d2, 'index-acts.ndjson'), JSON.stringify({ hello: 'world' }) + '\n' + JSON.stringify({ seq: 99, rows: { 'a/c': 5 } }) + '\n');
    const s1 = CS.createChannelStore({ dir: d2, log: { warn: (l) => l2.push(String(l)), log() {} }, writer: w2 }); try { s1.close(); } catch { } w2.stop();
    const line = l2.find((l) => /index-acts\.ndjson/.test(l)) || '';
    ok(/2 lines of JSON that is not an act's/.test(line) && !/not readable/.test(line), `smaller 7: the load says a line of valid JSON that is not an act's as that (${line.slice(0, 160)})`, l2);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
}
// @@ROUND3@@

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
