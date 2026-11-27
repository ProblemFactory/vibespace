#!/usr/bin/env node
// test-store-writer-lanes — the writer unit (lane lg-store-writes, 主开发 r1323 / r1328; its round wyjiekiey's cure, r1388). FAST, in
// process: stand-in threads running the REAL writeJob / pieceJob, and the REAL thread through a recorded postMessage. TWO LANES (a
// whole-write thread, an append thread), THE FENCE A FILE, A WHOLE WRITE BY REFERENCE IN PIECES (one a turn): (a) law 2, (b) the
// fence, (c) law 1, (d) a flush / the exit mid-pieces, (e) a second write mid-pieces, (f) EBYREF, (g) the append thread's
// failures, (h) unit 1 on the pieces road, (i) the producer census, (j) a post that throws mid-pieces at the exit, (k) a detached
// handed buffer, (l) a buffer spanning pieces, (m) the exit's rank-0 pass and a parked job, (n) both isolates in the memory
// census, (p) the own numbers of an own-only store's file across the lanes — each with its RED where one exists. Split out of test-store-writer-r4 (its fast seconds).
// Run: node scripts/test-store-writer-lanes.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // the build's own order (§113, r1845): the scratch import first, after node's own
import { checker } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();

// ── ⑫ THE WRITER UNIT (lane lg-store-writes, 主开发 r1323 / r1328): TWO LANES, THE FENCE A FILE, A WHOLE WRITE IN PIECES ───────
// (a) LAW 2: an append to ANOTHER file lands, its durable() answering true, while a whole write is held by its storage — RED:
//     one lane for every job (the single queue): the append waits behind it. (b) THE FENCE IS A FILE: an append of F asked while
//     F's own whole write is held begins only after it (RED: no fence — it runs beside it, and the rename would drop it); the
//     reverse too. (c) LAW 1: a whole write handed BY REFERENCE goes to the REAL thread in pieces of PIECE_BYTES or less, one a
//     turn, the bytes on disk the whole — RED: a plain list, one message of every byte in one turn. (d) a synchronous flush and
//     the exit mid-pieces send the rest IN THEIR CALL; (e) a second whole write of the file mid-pieces waits and writes the
//     NEWER snapshot — never two temps of one file; (f) a handed buffer WRITTEN INTO before its piece fails the write (EBYREF,
//     verifyByRef), the previous version kept — its control lands; (g) THE APPEND THREAD's FAILURES: a thread lost after an
//     append's bytes left the main thread — answered false (ETHREAD), its store told, restarted and said, written again; past
//     its restarts every append on the main thread, said; (h) B-9275 unit 1 on the pieces road (open, write, fsync, close,
//     rename) — RED: no sync; an abort renames nothing.
console.log('⑫ the writer unit — two lanes, the fence a file, a whole write in pieces');
await (async () => {
  const { anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const { Worker } = require('worker_threads');
  const SW = require(path.join(REPO, 'src/store-writer.js')), WK = require(path.join(REPO, 'src/store-writer-worker.js'));
  const T12 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-r4-lanes-'));
  const quiet = { warn: () => { }, log: () => { }, error: () => { } };
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const timerTurns = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setImmediate(r)); } };   // PLACED: the writer's timer turns, no wall-clock window
  const until = async (cond, what, ms = 8000) => { for (let k = 0; !cond(); k++) { if (k * 5 > ms) throw new Error(`waited ${ms} ms for ${what}`); await sl(5); } };
  const scene = (name, cfg) => { const dir = path.join(T12, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(cfg)); return dir; };
  const evs = (dir) => { try { return fs.readFileSync(path.join(dir, 'events.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  try {
    // the stand-in thread: the product's handler over the REAL writeJob / pieceJob, with a scene's HOLD (a job of a kind held at
    // its end until <dir>/release stands), a DEATH (the thread exits at a job of a kind while <dir>/die stands) and its events
    const STAND = path.join(T12, 'lanes-worker.cjs');
    fs.writeFileSync(STAND, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'), P = require('path');
const { writeJob, pieceJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab), nap = new Int32Array(new SharedArrayBuffer(4));
let cur = null;
const cfgOf = (f) => { try { return JSON.parse(fs.readFileSync(P.join(P.dirname(f), 'scene.json'), 'utf8')); } catch { return {}; } };
const note = (f, o) => fs.appendFileSync(P.join(P.dirname(f), 'events.ndjson'), JSON.stringify(o) + '\\n');
const end = (m, err, ms, own = null) => {
  const B = new BigUint64Array(S.buffer, 48, 2); B[0] = own ? BigInt(own.dev) : 0n; B[1] = own ? BigInt(own.ino) : 0n;   // the own numbers, as the product's cells
  if (err) { const c = Buffer.from(String(err.code || 'EWRITE').slice(0, 32), 'latin1'); new Uint8Array(S.buffer, 16, 32).set(c); Atomics.store(S, 3, c.length); } else Atomics.store(S, 3, 0);
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 1);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err, file: m.file, own });
};
parentPort.on('message', (m) => {
  if (!m || !['write', 'unlink', 'piece'].includes(m.ev)) return;
  const kind = m.ev === 'unlink' ? 'unlink' : m.append ? 'append' : 'whole', name = P.basename(m.file), dir = P.dirname(m.file), c = cfgOf(m.file);
  if (m.ev !== 'piece' || m.first) { Atomics.store(S, 0, m.id); note(m.file, { ev: 'begin', kind, name }); }
  if (c.die === kind && fs.existsSync(P.join(dir, 'die'))) { fs.unlinkSync(P.join(dir, 'die')); process.exit(3); }
  if ((m.ev !== 'piece' || m.last) && c.hold === kind && (!c.holdName || c.holdName === name) && !fs.existsSync(P.join(dir, 'release'))) {
    fs.writeFileSync(P.join(dir, 'held'), name);
    for (let k = 0; k < (c.holdTurns || 2000) && !fs.existsSync(P.join(dir, 'release')); k++) Atomics.wait(nap, 0, 0, 5);
  }
  let err = null, own = null;
  if (m.ev === 'piece') { const r = pieceJob(m, cur, fs); cur = r.cur; if (!r.done) return; err = r.done.err ? { code: r.done.err.code || null, message: r.done.err.message } : null; note(m.file, { ev: 'end', kind, name }); end(m, err, r.done.ms, r.done.own || null); return; }
  if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } }
  else { try { own = (writeJob(m, fs) || {}).own || null; } catch (e) { err = { code: e.code || null, message: e.message }; if (!m.append) { try { fs.unlinkSync(m.tmp); } catch { } } } }
  note(m.file, { ev: 'end', kind, name });
  end(m, err, 0, own);
});
`);
    const srcW = fs.readFileSync(path.join(REPO, 'src/store-writer.js'), 'utf8');
    const M12 = mutantCopies('store-r4-lanes', REPO);
    const ONE_LANE = M12.load('src/store-writer.js', anchored(srcW, 'const laneOf = (p) => (p && p.append ? LA : LW);', 'const laneOf = () => LW;', 'the single queue: every job on one lane'), 'one-lane');
    const NO_CHECK = M12.load('src/store-writer.js', anchored(srcW, "    if (!l.inflight) return true;   // the drain's post threw: the job is over, its failure said (fail) — the flush and the EXIT go on (r1388 (2))\n", '', 'the settle reads its job after a drain that ended it'), 'no-check');
    const ALL_PARKED = M12.load('src/store-writer.js', anchored(srcW, '(!names || names.includes(x.s.file)) && (!only || only(x.s))', '(!names || names.includes(x.s.file))', 'the exit\'s rank-0 pass writes every parked job'), 'all-parked');
    const NO_FENCE = M12.load('src/store-writer.js', anchored(srcW, 'const holder = (file) => LANES.find((l) => (l.inflight && l.inflight.name === file) || l.parked.some((j) => j.s.file === file)) || null;', 'const holder = () => null;', 'no fence: a file\'s jobs on both lanes at once'), 'no-fence');

    // (a) LAW 2
    const lawTwo = async (SWx, tag) => {
      const dir = scene(`a-${tag}`, { hold: 'whole' }), big = path.join(dir, 'big.json'), acts = path.join(dir, 'acts.ndjson');
      const w = SWx.create({ log: quiet, workerPath: STAND });
      try {
        w.dirty(big, { name: 'big.write', produce: () => '{"big":1}', debounceMs: 0 });
        await until(() => fs.existsSync(path.join(dir, 'held')), 'the whole write held');
        w.dirty(acts, { name: 'acts.write', produce: () => ({ append: 'line\n' }), debounceMs: 0, urgent: true });
        let answered = null;
        const d = w.durable(acts, { timeoutMs: 8000 }); d.then((v) => { answered = v; });
        if (tag === 'lanes') await d;   // the lanes answer while the whole write is held
        else { await timerTurns(4); await until(() => { const r = w.stats().find((x) => x.file === acts); return !!(r && r.inflight && !r.dirty); }, 'the append made and waiting behind the held write'); }   // the single queue: made, WAITING (never a sleep)
        const out = { answered, heldStill: !fs.existsSync(path.join(dir, 'release')), acts: fs.existsSync(acts) ? fs.readFileSync(acts, 'utf8') : null, actsBegun: evs(dir).some((e) => e.ev === 'begin' && e.name === 'acts.ndjson') };
        fs.writeFileSync(path.join(dir, 'release'), '1');
        out.bigLanded = await w.durable(big, { timeoutMs: 8000 }); out.actsLanded = await d;
        out.order = evs(dir).map((e) => `${e.ev} ${e.name}`).join(' · ');
        return out;
      } finally { try { w.stop(); } catch { } }
    };
    // (b) THE FENCE: an append of F while F's whole write is held (then the reverse)
    const fence = async (SWx, tag, hold) => {
      const dir = scene(`b-${tag}-${hold}`, { hold }), f = path.join(dir, 'journal.ndjson');
      let phase = 0;
      const produce = () => (phase === (hold === 'whole' ? 1 : 2) ? 'compacted\n' : { append: `line ${phase}\n` });
      const w = SWx.create({ log: quiet, workerPath: STAND });
      try {
        if (hold === 'whole') { w.dirty(f, { name: 'journal.write', produce, debounceMs: 0, urgent: true }); await w.durable(f, { timeoutMs: 8000 }); }   // an append store
        phase = 1; w.dirty(f, { name: 'journal.write', produce, debounceMs: 0, urgent: true });   // held at its end: the compaction (or the append)
        await until(() => fs.existsSync(path.join(dir, 'held')), 'the first job held');
        phase = 2; w.dirty(f, { name: 'journal.write', produce, debounceMs: 0, urgent: true });   // the OTHER kind of job of THAT file
        await timerTurns(4);   // the writer's timer has run for the dirty store: FENCED it stays dirty; with no fence it was taken
        const st = w.stats().find((x) => x.file === f), taken = !!(st && !st.dirty);
        if (taken) await until(() => evs(dir).filter((e) => e.ev === 'begin').length >= 3, 'the unfenced job to begin');   // a positive wait (RED road)
        const begun = evs(dir).filter((e) => e.ev === 'begin').length;
        fs.writeFileSync(path.join(dir, 'release'), '1');
        await until(() => !w.pending(f), 'the journal landed');
        return { begun, order: evs(dir).map((e) => `${e.ev} ${e.kind}`).join(' · '), bytes: fs.readFileSync(f, 'utf8') };
      } finally { try { w.stop(); } catch { } }
    };
    // (g) THE APPEND THREAD's FAILURES
    const death = async (restartsMax, tag) => {
      const dir = scene(`g-${tag}`, { die: 'append' }), f = path.join(dir, 'audit.ndjson'), lines = [], told = [];
      fs.writeFileSync(path.join(dir, 'die'), '1');
      const w = SW.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } }, workerPath: STAND, restartsMax });
      try {
        w.dirty(f, { name: 'audit.write', produce: () => ({ append: 'one line\n' }), debounceMs: 0, urgent: true, onWritten: (okW, e) => told.push(`${okW}${e && e.code ? ' ' + e.code : ''}`) });
        const first = await w.durable(f, { timeoutMs: 8000 });
        await until(() => !w.pending(f), 'the append written again', 8000);
        return { first, told: told.join(','), bytes: fs.readFileSync(f, 'utf8'), lines, modes: w.modes() };
      } finally { try { w.stop(); } catch { } }
    };
    // (c)–(f) through the REAL thread: every message to a thread is recorded (its kind, its bytes, the loop's turn it went in)
    const withRecord = async (fn) => {
      const seen = [], orig = Worker.prototype.postMessage;
      let turn = 0, ticking = true;
      const spin = () => { if (!ticking) return; turn++; setImmediate(spin); }; setImmediate(spin);
      const hooks = [], failOnce = new Set();
      Worker.prototype.postMessage = function (msg, tr) {
        if (msg && msg.ev === 'piece' && !msg.first && failOnce.has(msg.file)) { failOnce.delete(msg.file); throw new Error('the post failed (planted)'); }
        const bytes = msg && (msg.ev === 'write' || msg.ev === 'piece') ? (msg.parts || []).reduce((n, b) => n + (b.byteLength || 0), 0) : 0;   // BEFORE the post: a transferred buffer reads 0 after it
        const r = orig.call(this, msg, tr);
        if (msg && (msg.ev === 'write' || msg.ev === 'piece')) {
          seen.push({ ev: msg.ev, file: path.basename(msg.file), bytes, turn, first: !!msg.first, last: !!msg.last, abort: !!msg.abort });
          if (msg.ev === 'piece' && msg.first) for (const h of hooks.filter((x) => x.file === msg.file)) { hooks.splice(hooks.indexOf(h), 1); queueMicrotask(h.fn); }   // ITS file's first piece only: mid-pieces by construction
        }
        return r;
      };
      try { return await fn({ seen, onPost: (file, h) => hooks.push({ file, fn: h }), failNextPiece: (file) => failOnce.add(file) }); } finally { Worker.prototype.postMessage = orig; ticking = false; }
    };
    const rowsOf = (n, tag) => Array.from({ length: n }, (_, i) => Buffer.from(`  "${tag}${i}": ${JSON.stringify({ i, t: 'x'.repeat(3000) })}${i < n - 1 ? ',' : ''}\n`));
    const PB = SW.PIECE_BYTES;
    const pieceScenes = async () => withRecord(async ({ seen, onPost, failNextPiece }) => {
      const out = {};
      // (c) by reference vs a plain list
      for (const [tag, hand] of [['byref', (r) => SW.byRef(r)], ['list', (r) => r]]) {
        const dir = path.join(T12, `c-${tag}`); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), rows = rowsOf(6000, tag), all = Buffer.concat(rows);
        const w = SW.create({ log: quiet });
        try { const from = seen.length; w.dirty(f, { name: 'index.write', produce: () => hand(rows), debounceMs: 0 }); const landed = await w.durable(f, { timeoutMs: 20000 }); out[tag] = { landed, same: fs.readFileSync(f).equals(all), size: all.length, msgs: seen.slice(from).filter((x) => x.file === 'index.json') }; }
        finally { try { w.stop(); } catch { } }
      }
      // (d) a synchronous flush, and the exit, mid-pieces: the rest in their call
      for (const road of ['flushSync', 'exitFlush']) {
        const dir = path.join(T12, `d-${road}`); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), rows = rowsOf(6000, road), all = Buffer.concat(rows);
        const w = SW.create({ log: quiet });
        try {
          const from = seen.length; let inCall = null;
          onPost(f, () => { const r = road === 'flushSync' ? w.flushSync([f]) : w.exitFlush(); inCall = { whole: fs.existsSync(f) && fs.readFileSync(f).equals(all), left: (r.left || []).length }; });
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          await until(() => inCall !== null, `the ${road} mid-pieces`);
          const msgs = seen.slice(from).filter((x) => x.file === 'index.json');
          out[road] = { ...inCall, msgs: msgs.length, oneTurn: msgs.every((x) => x.turn === msgs[0].turn), lastSent: msgs.length > 1 && msgs[msgs.length - 1].last };
        } finally { try { w.stop(); } catch { } }
      }
      // (e) a second whole write of the file mid-pieces: it waits, then writes the NEWER snapshot
      {
        const dir = path.join(T12, 'e-again'); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), one = rowsOf(6000, 'one'), two = rowsOf(6000, 'two');
        const w = SW.create({ log: quiet });
        try {
          const from = seen.length; let rows = one;
          onPost(f, () => { rows = two; w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0, urgent: true }); });   // urgent: a waiter's write (a large store's pace would hold it ~9 s)
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          await until(() => !w.pending(f) && fs.existsSync(f) && fs.readFileSync(f).equals(Buffer.concat(two)), 'the newer snapshot on disk');
          const msgs = seen.slice(from).filter((x) => x.file === 'index.json'), firsts = msgs.map((x, i) => (x.first ? i : -1)).filter((i) => i >= 0), lastOne = msgs.findIndex((x) => x.last);
          out.again = { writes: firsts.length, apart: firsts.length === 2 && firsts[1] > lastOne };
        } finally { try { w.stop(); } catch { } }
      }
      // (f) a handed buffer written into before its piece (verifyByRef): EBYREF, the previous version kept; its control lands
      for (const tag of ['written-into', 'kept']) {
        const dir = path.join(T12, `f-${tag}`); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), rows = rowsOf(4000, tag), lines = [];
        fs.writeFileSync(f, '{"old":1}');
        const w = SW.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } }, verifyByRef: true });
        try {
          if (tag === 'written-into') onPost(f, () => { rows[rows.length - 1][0] ^= 1; });
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          const landed = await w.durable(f, { timeoutMs: 20000 });
          out[tag] = { landed, disk: fs.readFileSync(f, 'utf8').slice(0, 12), said: lines.find((l) => /index\.write/.test(l)) || '' };
        } finally { try { w.stop(); } catch { } }
      }
      // (j) a post that THROWS mid-pieces while the exit's flush drains it: nothing escapes the flush, every other store lands
      const postThrows = async (SWx, tag) => {
        const dir = path.join(T12, `j-${tag}`); fs.mkdirSync(dir); const big = path.join(dir, 'index.json'), small = path.join(dir, 'small.json'), rows = rowsOf(6000, tag), lines = [];
        const w = SWx.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } } });
        try {
          let r = null, threw = null;
          w.dirty(small, { name: 'small.write', produce: () => '{"s":1}', debounceMs: 60000 });
          onPost(big, () => { failNextPiece(big); try { r = w.exitFlush(); } catch (e) { threw = (e && e.message) || String(e); } });
          w.dirty(big, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          await until(() => r !== null || threw !== null, `the exit mid-pieces (${tag})`);
          return { threw, small: fs.existsSync(small) ? fs.readFileSync(small, 'utf8') : null, said: lines.find((l) => /index\.write not written/.test(l)) || '' };
        } finally { try { w.stop(); } catch { } }
      };
      out.throwLive = await postThrows(SW, 'live');
      out.throwRed = await postThrows(NO_CHECK, 'no-check');
      // (k) a handed buffer DETACHED before its piece (a producer's mistake): the write fails by name, the hub lives, a later write lands
      {
        const dir = path.join(T12, 'k-detached'); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), lines = [];
        const rows = Array.from({ length: 80 }, (_, i) => Buffer.alloc(65536, 97 + (i % 20)));   // each its own memory (alloc never pools)
        fs.writeFileSync(f, '{"old":1}');
        const w = SW.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } } });
        try {
          onPost(f, () => { const ab = rows[rows.length - 1].buffer; structuredClone(ab, { transfer: [ab] }); });   // detached under the writer
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          const landed = await w.durable(f, { timeoutMs: 20000 });
          const keptNow = fs.readFileSync(f, 'utf8');   // read NOW: the next write lands below
          const good = Array.from({ length: 80 }, () => Buffer.alloc(65536, 98));
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(good), debounceMs: 0 });
          const again = w.flushSync([f]);
          out.detached = { landed, kept: landed === false ? keptNow : null, said: lines.find((l) => /index\.write not written/.test(l)) || '', againLeft: (again.left || []).length, again: fs.readFileSync(f).equals(Buffer.concat(good)) };
        } finally { try { w.stop(); } catch { } }
      }
      // (l) a buffer SPANNING pieces written into after its first slice was copied (verifyByRef): caught at its last slice
      {
        const dir = path.join(T12, 'l-span'); fs.mkdirSync(dir); const f = path.join(dir, 'index.json'), lines = [];
        const rows = [Buffer.alloc(6 * 1048576, 120)];
        fs.writeFileSync(f, '{"old":1}');
        const w = SW.create({ log: { warn: (l) => lines.push(String(l)), log: () => { }, error: () => { } }, verifyByRef: true });
        try {
          onPost(f, () => { rows[0][5 * 1048576] = 122; });   // its later part, after its first slice went
          w.dirty(f, { name: 'index.write', produce: () => SW.byRef(rows), debounceMs: 0 });
          out.span = { landed: await w.durable(f, { timeoutMs: 20000 }), disk: fs.readFileSync(f, 'utf8').slice(0, 12), said: lines.find((l) => /index\.write not written/.test(l)) || '' };
        } finally { try { w.stop(); } catch { } }
      }
      return out;
    });
    // (m) THE EXIT's FIRST PASS (a person's acts first) honours its own list: a parked whole write of another store waits for the rest pass
    const rankZero = async (SWx, tag) => {
      const dir = scene(`m-${tag}`, { hold: 'whole', holdName: 'a.json', holdTurns: 40 }), a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json'), c = path.join(dir, 'c.json');
      const w = SWx.create({ log: quiet, workerPath: STAND });
      try {
        w.dirty(a, { name: 'a.write', produce: () => '{"a":1}', debounceMs: 0 });
        await until(() => fs.existsSync(path.join(dir, 'held')), 'a.json held');
        w.dirty(b, { name: 'b.write', produce: () => '{"b":1}', debounceMs: 0 });   // made by the append lane while W is busy: PARKED on W
        await until(() => { const r = w.stats().find((x) => x.file === b); return !!(r && r.inflight && !r.dirty); }, 'b.json made and waiting');
        w.dirty(c, { name: 'c.write', produce: () => '{"c":1}', debounceMs: 60000, rank: 0 });   // a person's act
        w.beginExit(); w.exitFlush({ only: 'rank0' });
        const afterRank0 = evs(dir).filter((e) => e.ev === 'begin').map((e) => e.name).join(',');
        w.exitFlush();
        return { afterRank0, order: evs(dir).filter((e) => e.ev === 'begin').map((e) => e.name).join(',') };
      } finally { try { w.stop(); } catch { } }
    };
    // (n) both writer isolates answer the memory census by name
    const census = async () => {
      const WM = require(path.join(REPO, 'src/worker-memory.js')), dir = path.join(T12, 'n-census'); fs.mkdirSync(dir);
      const before = new Set(WM.trackedWorkers().map((x) => x.worker));   // this writer's own isolates only (others may still be leaving)
      const w = SW.create({ log: quiet });
      try {
        const whole = path.join(dir, 'w.json'), app = path.join(dir, 'a.ndjson');
        w.dirty(whole, { name: 'n.whole', produce: () => '{}', debounceMs: 0 }); await w.durable(whole, { timeoutMs: 8000 });
        w.dirty(app, { name: 'n.append', produce: () => ({ append: 'x\n' }), debounceMs: 0, urgent: true }); await w.durable(app, { timeoutMs: 8000 });
        const mine = WM.trackedWorkers().filter((x) => !before.has(x.worker) && (x.name === 'store-writer' || x.name === 'store-writer-append'));
        const hold = setInterval(() => { }, 1000);   // the census's own timer and the writer's threads are unref'd: this leg keeps the loop up (an empty loop ends the run with exit 13)
        let answers; try { answers = await WM.askMemory(mine, { timeoutMs: 4000 }); } finally { clearInterval(hold); }
        return answers.map((x) => `${x.name}:${x.mem ? Math.round(x.mem.heapTotal / 1048576) + 'MB' : 'none'}`).sort();
      } finally { try { w.stop(); } catch { } }
    };
    const [a1, a0, b1, b0, br, g1, g0, pc] = await Promise.all([lawTwo(SW, 'lanes'), lawTwo(ONE_LANE, 'one-lane'), fence(SW, 'fence', 'whole'), fence(NO_FENCE, 'no-fence', 'whole'), fence(SW, 'fence', 'append'), death(3, 'restart'), death(0, 'main'), pieceScenes()]);
    const [m1, m0, n1] = [await rankZero(SW, 'live'), await rankZero(ALL_PARKED, 'all-parked'), await census()];
    ok(!pc.throwLive.threw && pc.throwLive.small === '{"s":1}' && /index\.write not written/.test(pc.throwLive.said), `⑫ (j) a post that threw mid-pieces while the exit drained it: nothing escaped the flush, every other store landed («${pc.throwLive.said.slice(0, 100)}»)`, pc.throwLive);
    ok(!!pc.throwRed.threw && pc.throwRed.small === null, `⑫ (j) RED (the settle reads its job after the drain ended it): «${String(pc.throwRed.threw).slice(0, 80)}» out of the exit's flush — the other store never written`, pc.throwRed);
    ok(pc.detached.landed === false && pc.detached.kept === '{"old":1}' && /EBYREF/.test(pc.detached.said) && pc.detached.againLeft === 0 && pc.detached.again, `⑫ (k) a handed buffer detached before its piece: the write failed BY NAME («${pc.detached.said.slice(0, 110)}»), the previous version kept, the hub alive; the next write landed`, pc.detached);
    ok(pc.span.landed === false && pc.span.disk === '{"old":1}' && /EBYREF/.test(pc.span.said), `⑫ (l) a buffer spanning pieces, written into after its first slice: caught at its last slice (EBYREF), the previous version kept`, pc.span);
    ok(m1.afterRank0 === 'a.json,c.json' && m1.order === 'a.json,c.json,b.json', `⑫ (m) the exit's rank-0 pass wrote the person's act and left the parked whole write of another store for the rest pass (${m1.order})`, m1);
    ok(m0.afterRank0 !== 'a.json,c.json' && /b\.json.*c\.json/.test(m0.order), `⑫ (m) RED (the parked loop without the pass's list): the parked write went ahead of the person's act (${m0.order})`, m0);
    ok(n1.length === 2 && n1.every((x) => !/none$/.test(x)), `⑫ (n) both writer isolates answer the memory census by name (${n1.join(', ')})`, n1);
    ok(a1.answered === true && a1.heldStill && a1.acts === 'line\n' && a1.bigLanded === true && /begin big\.json · begin acts\.ndjson · end acts\.ndjson · end big\.json/.test(a1.order), `⑫ (a) LAW 2: an append to another file landed and was answered WHILE the whole write was held (${a1.order})`, a1);
    ok(a0.answered === null && a0.acts === null && !a0.actsBegun && a0.actsLanded === true && /end big\.json.*begin acts\.ndjson/.test(a0.order), `⑫ (a) RED (one lane for every job): the append was made and WAITED behind the held whole write — not begun while it was held (${a0.order})`, a0);
    ok(b1.begun === 2 && b1.bytes === 'compacted\nline 2\n' && /begin append · end append · begin whole · end whole · begin append · end append/.test(b1.order), `⑫ (b) THE FENCE: an append of the file asked while its own whole write was held began only after it (${b1.order})`, b1);
    ok(b0.begun === 3 && b0.bytes !== 'compacted\nline 2\n', `⑫ (b) RED (no fence): the append ran beside its own file's whole write — ${JSON.stringify(b0.bytes)} on disk (${b0.order})`, b0);
    ok(br.begun === 1 && br.bytes === 'compacted\n' && /begin append · end append · begin whole · end whole/.test(br.order), `⑫ (b) the reverse: a whole write of the file asked while its append was held began only after it (${br.order})`, br);
    const c1 = pc.byref, c0 = pc.list, n = Math.ceil(c1.size / PB);
    ok(c1.landed && c1.same && c1.msgs.length === n && c1.msgs.every((x) => x.ev === 'piece' && x.bytes > 0 && x.bytes <= PB) && c1.msgs.reduce((k, x) => k + x.bytes, 0) === c1.size && c1.msgs[0].first && c1.msgs[n - 1].last && c1.msgs.every((x, i) => !i || x.turn > c1.msgs[i - 1].turn),
      `⑫ (c) LAW 1: ${(c1.size / 1048576).toFixed(1)} MB handed by reference went to the real thread in ${c1.msgs.length} pieces of ≤ ${PB / 1048576} MB, ONE A TURN (turns ${c1.msgs.map((x) => x.turn).join(',')}), the bytes on disk the whole`, c1.msgs);
    ok(c0.landed && c0.same && c0.msgs.length === 1 && c0.msgs[0].ev === 'write' && c0.msgs[0].bytes === c0.size, `⑫ (c) RED (a plain list, the road before): ONE message of every byte (${c0.msgs.map((x) => `${x.ev} ${x.bytes}`).join(', ')}) in one turn`, c0.msgs);
    ok(pc.flushSync.whole && pc.flushSync.left === 0 && pc.flushSync.oneTurn && pc.flushSync.lastSent && pc.exitFlush.whole && pc.exitFlush.oneTurn && pc.exitFlush.lastSent, `⑫ (d) a synchronous flush and the exit mid-pieces sent the rest in their call, in order: the whole on disk when they returned (${pc.flushSync.msgs} / ${pc.exitFlush.msgs} pieces in one turn)`, { flushSync: pc.flushSync, exitFlush: pc.exitFlush });
    ok(pc.again.writes === 2 && pc.again.apart, '⑫ (e) a second whole write asked mid-pieces waited for the first to end, then wrote the NEWER snapshot — never two temps of one file', pc.again);
    ok(pc['written-into'].landed === false && pc['written-into'].disk === '{"old":1}' && /EBYREF/.test(pc['written-into'].said) && pc.kept.landed === true && pc.kept.disk !== '{"old":1}', `⑫ (f) a handed buffer written into before its piece: the write failed by name («${pc['written-into'].said.slice(0, 120)}»), the previous version kept; its control landed`, { into: pc['written-into'], kept: pc.kept });
    ok(g1.first === false && /^false ETHREAD,true$/.test(g1.told) && g1.bytes === 'one line\n' && g1.lines.some((l) => /the append thread stopped \(it exited \(3\)\) — restarted \(1 of 3 this hour\)/.test(l)) && g1.lines.some((l) => /audit\.write not written \(ETHREAD; attempt 1\)/.test(l)),
      `⑫ (g) the append thread lost after the bytes left: answered false (ETHREAD), its store told (${g1.told}), restarted and said, written again once`, g1);
    ok(g0.first === false && g0.bytes === 'one line\n' && g0.modes.append === 'main' && g0.lines.some((l) => /the append thread stopped 1 times within an hour \(it exited \(3\)\) — from now on every append is written ON THE MAIN THREAD/.test(l)),
      `⑫ (g) past its restarts (0 here): every append on the main thread, said — the whole lane untouched (${JSON.stringify(g0.modes)})`, g0);
    // (i) THE SNAPSHOT IS NEVER WRITTEN INTO (r1328 (1)): every producer that hands a list BY REFERENCE is a row here, with the
    // reason its buffers are never written into after the hand-over (a store's chunks REPLACED, never written into); a new
    // caller of byRef( without its row is red by name. A producer that cannot promise it hands a plain list (copied, as before).
    const BYREF_PRODUCERS = [   // [file, why]
      ['src/channel-store.js', 'B-360d found holder 1 (lane bl-loop-b): produceIndex hands the index\'s parts — the layout\'s chunk buffers, with the top and the separators assemble() makes fresh each write — and none is written into after the hand-over: serializeChunk is the ONE place a chunk\'s buffer is made, and it REPLACES it (c.buf = Buffer.from(…)), never writes into it; no Buffer-writing call touches a part (test-channel-index-burst ① censuses the store\'s text for it, a planted writer its red)'],
      ['src/hosts.js', 'B-0248 unit 4 (lane bl-loop-b): _landCacheWhole hands a remote transcript\'s fetched buffer — the fetch\'s own, never written into after the hand-over (its copy goes to disk, the buffer is dropped)'],
    ];
    const { trackedFiles } = await import('./tracked-files.mjs');
    // a call ON THE WRITER (a member call `….byRef(`), never a bare name anywhere: src/lib's own byRef functions are not the writer's
    const byRefCallers = (texts) => Object.entries(texts).filter(([f, t]) => f !== 'src/store-writer.js' && /\.byRef\(/.test(t)).map(([f]) => f).sort();
    const callers = byRefCallers(Object.fromEntries(trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f)).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')])));
    const planted = byRefCallers({ 'src/zz-store.js': "const W = () => require('./store-writer.js');\nW().dirty(f, { produce: () => W().byRef(chunks) });", 'src/lib/zz-pick.js': 'function byRef(ref) { return ref; }\nconst x = byRef(1);' });
    ok(JSON.stringify(planted) === JSON.stringify(['src/zz-store.js']), `⑫ (i) CONTROL: a planted producer handing to the writer is found (${planted.join(', ')}); a bare byRef of src/lib is not the writer's`, planted);
    ok(JSON.stringify(callers) === JSON.stringify(BYREF_PRODUCERS.map((r) => r[0]).sort()), `⑫ (i) every producer handing a list by reference is a row with its promise (${callers.length ? callers.join(', ') : 'none yet'})`, { callers, rows: BYREF_PRODUCERS });
    // (h) unit 1 on the pieces road, with a recording file system — RED: the sync removed
    const recOf = (file, tmp) => {
      const order = [], fds = new Map(), role = (x) => (String(x) === tmp ? 'temp' : String(x) === file ? 'file' : path.basename(String(x)));
      return { order, fs: { ...fs,
        openSync: (q, ...a) => { const fd = fs.openSync(q, ...a); fds.set(fd, role(q)); order.push('open ' + role(q)); return fd; },
        writeSync: (fd, ...a) => { const k = fs.writeSync(fd, ...a); if (order[order.length - 1] !== 'write ' + fds.get(fd)) order.push('write ' + fds.get(fd)); return k; },
        fsyncSync: (fd) => { order.push('fsync ' + fds.get(fd)); return fs.fsyncSync(fd); },
        closeSync: (fd) => { order.push('close ' + fds.get(fd)); return fs.closeSync(fd); },
        renameSync: (x, y) => { order.push(`rename ${role(x)} > ${role(y)}`); return fs.renameSync(x, y); } } };
    };
    const ab = (t) => { const b = Buffer.from(t); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
    const byPieces = (W, tag, abort = false) => {
      const dir = path.join(T12, `h-${tag}`); fs.mkdirSync(dir); const file = path.join(dir, 's.json'), tmp = file + '.tmp-h'; fs.writeFileSync(file, 'old');
      const r = recOf(file, tmp), base = { id: 7, file, tmp, mode: 0o600 };
      let cur = null, done = null;
      for (const m of [{ ...base, ev: 'piece', first: true, parts: [ab('{"a":')] }, { ...base, ev: 'piece', parts: [ab('1')] }, { ...base, ev: 'piece', last: true, abort, parts: [ab('}')] }]) { const x = W.pieceJob(m, cur, r.fs); cur = x.cur; done = x.done; }
      return { order: r.order.join(' → '), disk: fs.readFileSync(file, 'utf8'), err: done && done.err ? done.err.code : null, tempLeft: fs.existsSync(tmp) };
    };
    const srcK = fs.readFileSync(path.join(REPO, 'src/store-writer-worker.js'), 'utf8');
    const NO_SYNC = M12.load('src/store-writer-worker.js', anchored(srcK, 'try { writeAll(fs, cur.fd, m.parts); if (m.last) { try { fs.fsyncSync(cur.fd); } catch (e) { cur.noSync = unsynced(e); } } } catch (e) { cur.err = e; }', 'try { writeAll(fs, cur.fd, m.parts); } catch (e) { cur.err = e; }', 'a write in pieces renamed with no sync'), 'pieces-no-sync');
    const h1 = byPieces(WK, 'real'), h0 = byPieces(NO_SYNC, 'no-sync'), hA = byPieces(WK, 'abort', true);
    ok(h1.order === 'open temp → write temp → fsync temp → close temp → rename temp > file' && h1.disk === '{"a":1}' && !h1.err && !h1.tempLeft, `⑫ (h) the pieces road: ${h1.order}`, h1);
    ok(!/fsync/.test(h0.order) && /rename temp > file/.test(h0.order), `⑫ (h) RED (the sync removed): ${h0.order}`, h0);
    ok(!!hA.err && !/rename/.test(hA.order) && hA.disk === 'old' && !hA.tempLeft, `⑫ (h) an ABORT at the last piece renames nothing, removes the temp, keeps the previous version (${hA.err})`, hA);

    // (o) THE CHAIN'S MOVE, ITS MEETINGS (round wgxur2rci (1)–(3)): line 42's REWRITE of an append store between two appends of THAT
    // store across the two lanes — the fence keeps it in order (RED: no fence — the second append runs beside the held rewrite, and
    // the rewrite carries it ahead of its own line); a thread LOST during a rewrite takes the base's road, the store dirty again
    // (RED: the lost-append road, «ETHREAD» — the trim told FAILED though its rename may have landed); the PIECE ROAD under B-f276
    // 1b's two laws, as the plain road: a store read missing lands by its EXCLUSIVE link, a file that appeared kept (RED: a plain
    // rename writes over it), and a temp still a second name of the store is never written through (RED: no check)
    const RW = { rewrite: { ranges: new Float64Array([0, 7]), size: 7 }, then: 'R\n' };   // keep «line 0\n» (7 bytes), then its own line
    const rewriteBetween = async (SWx, tag) => {
      const dir = scene(`o-${tag}`, { hold: 'whole' }), f = path.join(dir, 'stash.ndjson');
      let phase = 0;
      const produce = () => (phase === 1 ? { ...RW, rewrite: { ranges: RW.rewrite.ranges.slice(), size: 7 } } : { append: `line ${phase}\n` });
      const w = SWx.create({ log: quiet, workerPath: STAND });
      try {
        w.dirty(f, { name: 'stash.write', produce, debounceMs: 0, urgent: true }); await w.durable(f, { timeoutMs: 8000 });   // an append store
        phase = 1; w.dirty(f, { name: 'stash.write', produce, debounceMs: 0, urgent: true });   // the REWRITE (a whole job to the stand-in), held
        await until(() => fs.existsSync(path.join(dir, 'held')), 'the rewrite held');
        phase = 2; w.dirty(f, { name: 'stash.write', produce, debounceMs: 0, urgent: true });   // an append of THAT store
        await timerTurns(4);
        const st = w.stats().find((x) => x.file === f), taken = !!(st && !st.dirty);
        if (taken) await until(() => evs(dir).filter((e) => e.ev === 'begin').length >= 3, 'the unfenced append to begin');
        const begun = evs(dir).filter((e) => e.ev === 'begin').length;
        fs.writeFileSync(path.join(dir, 'release'), '1');
        await until(() => !w.pending(f), 'the stash landed');
        return { begun, order: evs(dir).map((e) => `${e.ev} ${e.kind}`).join(' · '), bytes: fs.readFileSync(f, 'utf8') };
      } finally { try { w.stop(); } catch { } }
    };
    const rewriteLost = async (SWx, tag) => {
      const dir = scene(`o-d-${tag}`, { die: 'whole' }), f = path.join(dir, 'stash.ndjson'), told = [];
      let phase = 0;
      const produce = () => (phase === 1 ? { ...RW, rewrite: { ranges: RW.rewrite.ranges.slice(), size: 7 } } : { append: `line ${phase}\n` });
      const onWritten = (okW, e) => told.push(`${okW}${e && e.code ? ' ' + e.code : ''}`);
      const w = SWx.create({ log: quiet, workerPath: STAND });
      try {
        w.dirty(f, { name: 'stash.write', produce, debounceMs: 0, urgent: true, onWritten }); await w.durable(f, { timeoutMs: 8000 });
        fs.writeFileSync(path.join(dir, 'die'), '1');   // the whole lane's thread exits at the rewrite
        phase = 1; w.dirty(f, { name: 'stash.write', produce, debounceMs: 0, urgent: true, onWritten });
        await until(() => !w.pending(f) && told.length >= 2 && told[told.length - 1] === 'true', 'the rewrite written again by the restarted thread');
        return { told: told.join(', '), bytes: fs.readFileSync(f, 'utf8') };
      } finally { try { w.stop(); } catch { } }
    };
    const NO_REWRITE_ROAD = M12.load('src/store-writer.js', anchored(srcW, 'if (s && f.append && !f.rewrite && !f.unlink && !s.forgotten) fail(', 'if (s && f.append && !f.unlink && !s.forgotten) fail(', 'a lost rewrite takes the base\'s road'), 'no-rewrite-road');   // stale-pins: kept (the old requeue's line: the RED)
    const [o1, o0, d1, d0] = await Promise.all([rewriteBetween(SW, 'fence'), rewriteBetween(NO_FENCE, 'no-fence'), rewriteLost(SW, 'road'), rewriteLost(NO_REWRITE_ROAD, 'append-road')]);
    ok(o1.begun === 2 && o1.bytes === 'line 0\nR\nline 2\n' && o1.order === 'begin append · end append · begin whole · end whole · begin append · end append', `⑫ (o) a REWRITE between two appends of ONE store on the two lanes: the second append began only after the rewrite landed, the file in order (${JSON.stringify(o1.bytes)}; ${o1.order})`, o1);
    ok(o0.bytes !== 'line 0\nR\nline 2\n', `⑫ (o) RED (no fence): the append ran beside the held rewrite — ${JSON.stringify(o0.bytes)} on disk (${o0.order})`, o0);
    ok(!/ETHREAD/.test(d1.told) && d1.bytes === 'line 0\nR\n', `⑫ (o) a thread LOST during a rewrite: the store dirty again (the base's road — its producer says «not confirmed»), written again by the restarted thread, never told ETHREAD (${d1.told})`, d1);
    ok(/false ETHREAD/.test(d0.told), `⑫ (o) RED (the lost-append road for a rewrite): the trim was told FAILED by ETHREAD though its rename may have landed (${d0.told})`, d0);
    // the piece road, B-f276 1b's two laws (a recording fs, as (h)) — the link and an unlink the storage refuses
    const recX = (file, tmp, { unlinkFails = false } = {}) => {
      const order = [], fds = new Map(), role = (x) => (String(x) === tmp ? 'temp' : String(x) === file ? 'file' : path.basename(String(x)));
      return { order, fs: { ...fs,
        openSync: (q, ...a) => { const fd = fs.openSync(q, ...a); fds.set(fd, role(q)); order.push('open ' + role(q)); return fd; },
        writeSync: (fd, ...a) => { const k = fs.writeSync(fd, ...a); if (order[order.length - 1] !== 'write ' + fds.get(fd)) order.push('write ' + fds.get(fd)); return k; },
        linkSync: (x, y) => { order.push(`link ${role(x)} > ${role(y)}`); return fs.linkSync(x, y); },
        unlinkSync: (x) => { if (unlinkFails && String(x) === tmp) { order.push('unlink temp REFUSED'); throw Object.assign(new Error('the storage refused the removal'), { code: 'EBUSY' }); } order.push('unlink ' + role(x)); return fs.unlinkSync(x); },
        renameSync: (x, y) => { order.push(`rename ${role(x)} > ${role(y)}`); return fs.renameSync(x, y); } } };
    };
    const piecesOf = (W, r, file, tmp, extra) => {
      const base = { id: 11, file, tmp, mode: 0o600, ...extra };
      let cur = null, done = null;
      for (const m of [{ ...base, ev: 'piece', first: true, parts: [ab('{"x":')] }, { ...base, ev: 'piece', last: true, parts: [ab('1}')] }]) { const x = W.pieceJob(m, cur, r.fs); cur = x.cur; done = x.done; }
      return { order: r.order.join(' → '), disk: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, err: done && done.err ? done.err.code : null };
    };
    const exclusive = (W, tag, appeared) => {
      const dir = path.join(T12, `o-x-${tag}`); fs.mkdirSync(dir); const file = path.join(dir, 's.json'), tmp = file + '.tmp-x';
      if (appeared) fs.writeFileSync(file, 'appeared');
      const x = piecesOf(W, recX(file, tmp), file, tmp, { exclusive: true });
      return { ...x, tempLeft: fs.existsSync(tmp) };
    };
    const linkedTemp = (W, tag) => {
      const dir = path.join(T12, `o-l-${tag}`); fs.mkdirSync(dir); const file = path.join(dir, 's.json'), tmp = file + '.tmp-l';
      fs.writeFileSync(file, 'old'); fs.writeFileSync(tmp, 'a temp that is a second name');
      W.linkedHere(recX(path.join(dir, 'other.json'), tmp, { unlinkFails: true }).fs, tmp, path.join(dir, 'other.json'));   // its removal refused: THIS module's temp is still linked
      return piecesOf(W, recX(file, tmp, { unlinkFails: true }), file, tmp, {});
    };
    const NO_XLINK = M12.load('src/store-writer-worker.js', anchored(srcK, '        if (m.exclusive && linkedHere(fs, m.tmp, m.file)) { if (m.ownOnly) { cur.own = made1; OWN.set(m.file, made1); } }', '        if (false) { }', 'the piece road\'s exclusive landing'), 'no-xlink');   // the piece road's own commit lines (as writeJob's, since the move onto the train)
    const NO_LCHECK = M12.load('src/store-writer-worker.js', anchored(srcK, '    if (LINKED.has(m.tmp) && !dropTemp(fs, m.tmp)) cur.err = ', '    if (false) cur.err = ', 'the piece road\'s linked-temp check'), 'no-lcheck');
    const x1 = exclusive(WK, 'missing', false), x2 = exclusive(WK, 'appeared', true), x0 = exclusive(NO_XLINK, 'red', true);
    ok(!x1.err && x1.disk === '{"x":1}' && /link temp > file/.test(x1.order) && !/rename/.test(x1.order) && !x1.tempLeft, `⑫ (o) the piece road lands a store read MISSING by its exclusive link, as writeJob does (${x1.order})`, x1);
    ok(x2.err === 'EEXIST' && x2.disk === 'appeared' && !x2.tempLeft, `⑫ (o) …and a file that APPEARED is kept: the write fails EEXIST (its store's «appeared» road), the temp removed (${x2.order})`, x2);
    ok(x0.disk === '{"x":1}', `⑫ (o) RED (the piece road with no exclusive link: a plain rename at the last piece): the file that appeared was written over (${x0.order})`, x0);
    const l1 = linkedTemp(WK, 'check'), l0 = linkedTemp(NO_LCHECK, 'red');
    ok(l1.err === 'ETEMPLINKED' && !/(open|write) temp/.test(l1.order) && l1.disk === 'old', `⑫ (o) a temp still a SECOND NAME of a store is never written through on the piece road: refused ETEMPLINKED, the store as it was (${l1.order})`, l1);
    ok(/write temp/.test(l0.order) || l0.err !== 'ETEMPLINKED', `⑫ (o) RED (no check): the piece road wrote through a temp that is still a second name (${l0.order}; ${l0.err})`, l0);
    // round w7skcarva (r2248): a rewrite's lines handed BY REFERENCE are refused by name (EBADBYTES), the file as it was
    { const dir = path.join(T12, 'o-byref'); fs.mkdirSync(dir); const f = path.join(dir, 's.ndjson'); fs.writeFileSync(f, 'kept\n'); const told = [], w = SW.create({ log: quiet });
      try { w.dirty(f, { name: 's.write', produce: () => ({ rewrite: { ranges: new Float64Array([0, 5]), size: 5 }, then: SW.byRef([Buffer.from('x\n')]) }), debounceMs: 0, urgent: true, onWritten: (okW, e) => told.push(`${okW} ${e && e.code}`) }); await until(() => told.length > 0, 'the refusal said'); } finally { try { w.stop(); } catch { } }
      ok(told[0] === 'false EBADBYTES' && fs.readFileSync(f, 'utf8') === 'kept\n', `⑫ (o) a rewrite's lines handed BY REFERENCE are refused by name (${told[0]}), the file as it was`, told); }
    // (p) THE OWN NUMBERS ACROSS THE LANES (B-f276 1c × the lanes): an own-only store's file that ONE thread made is its store's own
    // on the OTHER thread too (each thread's map is its own) — (p1) through the SHARED CELLS: its first append settled by a
    // synchronous flush (the answer not read yet), the compaction flushed IN THE SAME CALL on the whole-write thread lands; RED: a
    // settle that reads no numbers from the cells — refused as a file that appeared. (p2) through the ANSWER: a first append that
    // CREATED the file and then failed, then the compaction, lands; RED: an answer that carries only a job's own result — refused.
    const ownCells = async (SWx, tag) => {
      const dir = path.join(T12, `p-cells-${tag}`); fs.mkdirSync(dir); const f = path.join(dir, 'acts.ndjson'), said = [];
      const w = SWx.create({ log: { warn: (l) => said.push(String(l)), log: () => { }, error: () => { } } });
      try {
        const wa = path.join(dir, 'warm.ndjson'), ww = path.join(dir, 'warm.json');
        w.dirty(wa, { name: 'warm.append', produce: () => ({ append: 'w\n' }), debounceMs: 0, urgent: true });
        w.dirty(ww, { name: 'warm.write', produce: () => '{"w":1}', debounceMs: 0, urgent: true });
        await Promise.all([w.durable(wa, { timeoutMs: 8000 }), w.durable(ww, { timeoutMs: 8000 })]);   // both threads up: the flushes below wait on writes only
        let whole = false;
        const produce = () => (whole ? 'compacted\n' : { append: 'line 1\n' });
        w.dirty(f, { name: 'acts.write', produce, debounceMs: 0, ownOnly: true });
        const a = w.flushSync([f]);   // the append thread: its file made ('ax'), the job settled through the cells
        whole = true; w.dirty(f, { name: 'acts.write', produce, debounceMs: 0, ownOnly: true });
        const b = w.flushSync([f]);   // the SAME turn: the whole-write thread, the append's answer still unread
        return { a: a.written.length, b: b.written.length, disk: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null, refused: said.some((l) => /appeared since/.test(l)) };
      } finally { try { w.stop(); } catch { } }
    };
    const srcK0 = fs.readFileSync(path.join(REPO, 'src/store-writer-worker.js'), 'utf8');
    const asThread = (src) => anchored(src, 'if (parentPort && require.main === module) serve(parentPort, S);', 'if (parentPort) serve(parentPort, S);', 'the copy is the thread\'s own script');
    const plantFail = (src) => anchored(src, '      writeAll(fs, fd, m.parts);\n      try { fs.fsyncSync(fd); }', "      if (FS.existsSync(m.file + '.fail')) { FS.unlinkSync(m.file + '.fail'); throw Object.assign(new Error('a planted failure after the create'), { code: 'EIO' }); }\n      writeAll(fs, fd, m.parts);\n      try { fs.fsyncSync(fd); }", 'an append that fails after its create');
    const ANSWER = M12.write('src/store-writer-worker.js', plantFail(asThread(srcK0)), 'answer');
    const ANSWER_RED = M12.write('src/store-writer-worker.js', anchored(plantFail(asThread(srcK0)), '  const ownNow = (m, own, was) => own || (m.ownOnly && m.file && OWN.get(m.file) !== was ? OWN.get(m.file) || null : null);', '  const ownNow = (m, own, was) => own || null;', 'an answer that carries only a job\'s own result'), 'answer-red');
    const ownAnswer = async (workerPath, tag) => {
      const dir = path.join(T12, `p-answer-${tag}`); fs.mkdirSync(dir); const f = path.join(dir, 'acts.ndjson'), said = [];
      const w = SW.create({ log: { warn: (l) => said.push(String(l)), log: () => { }, error: () => { } }, workerPath });
      try {
        let whole = false;
        const produce = () => (whole ? 'compacted\n' : { append: 'line 1\n' });
        fs.writeFileSync(f + '.fail', '1');   // the FIRST append makes the file, then fails (planted after the create)
        w.dirty(f, { name: 'acts.write', produce, debounceMs: 0, ownOnly: true, urgent: true });
        const first = await w.durable(f, { timeoutMs: 8000 });   // false: its answer read (the failure said), the store owed again
        const made = fs.existsSync(f);
        whole = true;
        const b = w.flushSync([f]);   // the compaction, on the whole-write thread, before the append's retry
        return { first, made, b: b.written.length, disk: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null, refused: said.some((l) => /appeared since/.test(l)) };
      } finally { try { w.stop(); } catch { } }
    };
    const NO_CELLS_OWN = M12.load('src/store-writer.js', anchored(srcW, '    if (s) { const o = jobOwn(l); if (o) s.own = o; }', '    void 0;', 'a settle that reads no own numbers from the cells'), 'no-cells-own');
    const [p1, p0, q1, q0] = await Promise.all([ownCells(SW, 'cells'), ownCells(NO_CELLS_OWN, 'no-cells'), ownAnswer(ANSWER, 'answer'), ownAnswer(ANSWER_RED, 'answer-red')]);
    ok(p1.disk === 'compacted\n' && !p1.refused && p1.a === 1, `⑫ (p1) an own-only store's first append settled by a synchronous flush, its compaction flushed in the same call on the OTHER thread: written (${JSON.stringify(p1.disk)}), never refused as a file that appeared — the cells carried its own numbers`, p1);
    ok(p0.refused && p0.disk === 'line 1\n', `⑫ (p1) RED (a settle that reads no numbers from the cells): the compaction refused its store's own file (${JSON.stringify(p0.disk)})`, p0);
    ok(q1.first === false && q1.made && q1.disk === 'compacted\n' && !q1.refused, `⑫ (p2) an own-only store's FIRST append made the file and then failed: the answer carried the numbers — the compaction on the other thread landed (${JSON.stringify(q1.disk)})`, q1);
    ok(q0.refused && q0.disk === '', `⑫ (p2) RED (an answer that carries only a job's own result): the compaction refused the file its own failed append made (${JSON.stringify(q0.disk)})`, q0);
    // (p3) r2593 (1): A STALE MAP ENTRY IS NEVER HANDED BACK — the append thread made X, a compaction on the whole-write thread
    // renamed Y over it, an append on the append thread fails at its open (before its own numbers): the append retried THERE
    // lands over Y. RED: the thread hands back its map entry whatever the job's end — the old pair X over the store's Y, the
    // retried append refused as a file that appeared, for good
    const plantOpen = (src) => anchored(src, '    try { fd = openA(); } catch (e) {', "    if (FS.existsSync(m.file + '.failopen')) { FS.unlinkSync(m.file + '.failopen'); throw Object.assign(new Error('a planted open failure'), { code: 'EMFILE' }); }\n    try { fd = openA(); } catch (e) {", 'an append that fails at its open');
    const STALE = M12.write('src/store-writer-worker.js', plantOpen(asThread(srcK0)), 'stale');
    const STALE_RED = M12.write('src/store-writer-worker.js', anchored(plantOpen(asThread(srcK0)), '  const ownNow = (m, own, was) => own || (m.ownOnly && m.file && OWN.get(m.file) !== was ? OWN.get(m.file) || null : null);', '  const ownNow = (m, own) => own || (m.ownOnly && m.file ? OWN.get(m.file) || null : null);', 'the map entry handed back whatever the job\'s end'), 'stale-red');   // stale-pins: kept (the line before r2593, the RED copy)
    const staleScene = async (workerPath, tag) => {
      const dir = path.join(T12, `p-stale-${tag}`); fs.mkdirSync(dir); const f = path.join(dir, 'acts.ndjson'), said = [];
      const w = SW.create({ log: { warn: (l) => said.push(String(l)), log: () => { }, error: () => { } }, workerPath });
      try {
        let phase = 0;
        const produce = () => (phase === 1 ? 'compacted\n' : { append: phase === 0 ? 'line 1\n' : 'line 2\n' });
        const step = () => { w.dirty(f, { name: 'acts.write', produce, debounceMs: 0, ownOnly: true, urgent: true }); return w.durable(f, { timeoutMs: 8000 }); };
        const made = await step();                     // the append thread makes X
        phase = 1; const compacted = await step();     // the whole-write thread renames Y over it
        phase = 2; fs.writeFileSync(f + '.failopen', '1');
        const failed = await step();                   // the append thread fails at its open: false, its answer read
        const b = w.flushSync([f]);                    // the append retried on the append thread, before the writer's backoff
        return { made, compacted, failed, b: b.written.length, disk: fs.readFileSync(f, 'utf8'), refused: said.some((l) => /appeared since/.test(l)) };
      } finally { try { w.stop(); } catch { } }
    };
    // (p4) r2593 (2): THE MAIN-THREAD ROAD ON A FAILURE — the append lane past its restarts (main-only): a FIRST own-only append
    // that made the file there and then failed hands its numbers to the store's cell off its error, and the owed compaction on
    // the whole-write thread lands. RED: writeHere's catch records no numbers — the compaction refused for good
    const mainScene = async (SWx, tag) => {
      const dir = scene(`p-main-${tag}`, { die: 'append' }), f = path.join(dir, 'acts.ndjson'), said = [], told = [];
      fs.writeFileSync(path.join(dir, 'die'), '1');   // the append thread exits at its first append: past restartsMax 0, appends go to the main thread
      fs.writeFileSync(f + '.mfail', '1');            // the main thread's write of it then fails after its create
      const mfs = { ...fs, writeSync: (fd, ...a) => { if (fs.existsSync(f + '.mfail')) { fs.unlinkSync(f + '.mfail'); throw Object.assign(new Error('a planted failure after the create (the main thread)'), { code: 'EIO' }); } return fs.writeSync(fd, ...a); } };
      const w = SWx.create({ log: { warn: (l) => said.push(String(l)), log: () => { }, error: () => { } }, workerPath: STAND, restartsMax: 0, fs: mfs });
      try {
        let whole = false;
        const produce = () => (whole ? 'compacted\n' : { append: 'line 1\n' });
        w.dirty(f, { name: 'acts.write', produce, debounceMs: 0, ownOnly: true, urgent: true, onWritten: (okW, e) => told.push(`${okW}${e && e.code ? ' ' + e.code : ''}`) });
        await until(() => told.some((x) => /EIO/.test(x)), 'the main thread\'s append failed after its create');
        const mode = w.modes().append, made = fs.existsSync(f);
        whole = true;
        const b = w.flushSync([f]);   // the owed compaction, on the whole-write lane's own thread
        return { mode, made, told: told.join(','), b: b.written.length, disk: fs.readFileSync(f, 'utf8'), refused: said.some((l) => /appeared since/.test(l)) };
      } finally { try { w.stop(); } catch { } }
    };
    const NO_MAIN_OWN = M12.load('src/store-writer.js', anchored(srcW, '    } catch (e) { if (e && e.own) s.own = e.own; if (!p.append)', '    } catch (e) { if (!p.append)', 'writeHere\'s catch that records no numbers'), 'no-main-own');   // stale-pins: kept (the line before r2593, the RED copy)
    const [staleOk, staleRed, mainOk, mainRed] = await Promise.all([staleScene(STALE, 'stale'), staleScene(STALE_RED, 'stale-red'), mainScene(SW, 'main'), mainScene(NO_MAIN_OWN, 'main-red')]);
    ok(staleOk.made && staleOk.compacted && staleOk.failed === false && staleOk.disk === 'compacted\nline 2\n' && !staleOk.refused, `⑫ (p3) a compaction on the whole-write thread, an append failing at its open on the append thread: the append retried THERE lands (${JSON.stringify(staleOk.disk)}) — no stale pair handed back`, staleOk);
    ok(staleRed.refused && staleRed.disk === 'compacted\n', `⑫ (p3) RED (the map entry handed back whatever the job's end): the retried append refused its store's own file for good (${JSON.stringify(staleRed.disk)})`, staleRed);
    ok(mainOk.mode === 'main' && mainOk.made && /EIO/.test(mainOk.told) && mainOk.disk === 'compacted\n' && !mainOk.refused, `⑫ (p4) a FIRST own-only append on the main-only append lane made the file and failed: its numbers reached the store's cell — the compaction on the other lane's thread landed (${JSON.stringify(mainOk.disk)}, the append lane ${mainOk.mode})`, mainOk);
    ok(mainRed.refused && mainRed.disk === '', `⑫ (p4) RED (writeHere's catch records no numbers): the compaction refused the file the failed main-thread append made (${JSON.stringify(mainRed.disk)})`, mainRed);
  } finally { fs.rmSync(T12, { recursive: true, force: true }); }
})();

report();
