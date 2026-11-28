#!/usr/bin/env node
// test-remote-copy-writer — lane bl-loop-b, B-0248 step 2 unit 4 (主开发 r3320 / r3883): A REMOTE TRANSCRIPT's WHOLE COPY IS THE
// STORE WRITER's. src/hosts.js wrote a remote transcript's whole cached copy (up to the 64 MB fetch cap) by writeFileSync + rename
// ON THE LOOP after a mkdir of its folder; now _landCacheWhole hands the fetched buffer to the store writer by reference and the
// copy's record (.meta) follows it once it is on disk. FAST, in-process: a real HostManager over a scratch data folder, a dial
// host whose device data plane is a stand-in (the remote file's bytes in memory), the real store writer's thread.
//   ① a placed stall in every main-thread write under the data folder (scripts/fixtures/fs-stall.cjs): a ~1 MB whole refetch holds
//     nothing on the loop, the copy whole on disk and its record after it. RED: the instance's copy written at the call (the
//     release's mkdir + temp + rename on the loop) holds the loop a stall's length or more.
//   r4006 (主开发, the round wf_c13df757-2b2 on line 888) — THE CURE'S LAWS, each with its RED, over a writer of the suite's own
//   (the seam hm._writer; the stand-in thread scripts/fixtures/store-stand-writer.cjs where a write must fail or be held):
//   ② laws A + F: after a whole fetch the writer's own stats() hold NO row of the copy nor of its record. RED: _letCacheGo a no-op.
//   ③ law B: a whole write REFUSED (ECACHEWRITE), then a delta, then past the writer's real 1 s retry: the copy and its record
//     agree. RED: the landing before r4006 (the bytes kept, nothing forgotten) — its owed old copy lands over the delta.
//   ③b (line 888's follow, r4154 (1)) THE ONE PLACE LAW B IS NOT LITERAL: a write IN FLIGHT when the fetch's bound passes still renames,
//     then goes (forgotten: unlinked) — a delta landed between is lost with it, the next poll fetches whole, no wrong bytes stay. RED:
//     nothing forgotten — the late rename's bytes stay beside a record that names others.
//   ④ law D: a stop between a whole copy's landing and its record, then the remote past a small fetch cap: the next poll heals and
//     grows the slot, never «too large». RED: the old exact record kept (_landCacheNotExact a no-op).
//   ⑤ law E: a removed machine's owed copy, (a) queued and (b) in flight: no bytes in its folder after the removal. RED: the
//     removal forgets nothing (_letCacheGo a no-op); and (b) the removal waiting on ONE durable() answer (the writer seen without
//     pending()): the fetch's own forget answers it while the copy still flies — its landing makes the folder again. (c) (r4154 (3)) a row
//     whose only job in flight is the UNLINK after a forgotten landing: the removal does not wait for it. RED: the wait that asks
//     before it looks (its end settles no waiter: answered by the timer, here a placed 1.2 s).
//     (r5586) Every scene is judged where the removal LOOKS (its first stats() after hosts.json landed on the process's writer):
//     one whose order did not form there while hosts.json's landing outlasted its placed hold is a named skip. PLACEMENT (c), kept
//     as a control: hosts.json held 1.5 s at will reads the old judgment's red with the product unchanged, and the cured one's named skip.
//   ⑥ the ssh rung (its whole `cat`) under ①'s placed stall: no main-thread write. RED: the release's write on that rung.
//   ⑦ the record only after its bytes, on both rungs: a copy whose write FAILS leaves no record. RED: the failure swallowed.
//   ⑧ a ~9 MB copy (above PIECE_BYTES, 4 MB) handed by reference in pieces, verifyByRef on: byte-equal on disk (no red control).
// (Its own suite, not a leg of test-codex-zst: that suite's time is its own — lane bl-loop-b, the unit's line.)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { scratchDir } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const home = scratchDir('remote-copy-writer');
const rec = (o) => JSON.stringify(o) + '\n';
const rollout = (tid, cwd, firstUser) => [
  rec({ timestamp: '2026-11-24T00:00:00.000Z', type: 'session_meta', payload: { id: tid, cwd, timestamp: '2026-11-24T00:00:00.000Z', cli_version: '0.153.4' } }),
  rec({ timestamp: '2026-11-24T00:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: firstUser }] } }),
  rec({ timestamp: '2026-11-24T00:00:02.000Z', type: 'turn_context', payload: { model: 'gpt-6-astra', cwd } }),
].join('');
// ── B-0248 step 2, unit 4 (lane bl-loop-b, 主开发 r3320 / r3883): A WHOLE REFETCH IS WRITTEN BY THE STORE WRITER ──────────────
// The release wrote a remote transcript's whole copy (up to the 64 MB fetch cap) by writeFileSync + rename ON THE LOOP, after a
// mkdir of its folder: on the tree's slow-storage road that held the loop for the rename's whole delay (the page
// bl-loop-b/b0248-page.md, row 7). A placed 300 ms stall in every main-thread write under the hub's data folder
// (scripts/fixtures/fs-stall.cjs; the writer's thread loads its own fs, never held): a ~1 MB whole fetch (a stall is per call, not per byte)
console.log('① B-0248 unit 4: a remote transcript\'s WHOLE refetch is the store writer\'s — the loop never waits for its write');
{
  const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
  const STALL_MS = 300, TICK_MS = 10;   // three stalled calls in the red (its mkdir, write, rename): the suite's time
  const lateMeter = () => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; };
  const TIDW = '77777777-6666-4555-8444-333333333333';
  const filler = Array.from({ length: 500 }, (_, i) => rec({ timestamp: '2026-11-24T00:00:10.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `turn ${i} ` + 'w'.repeat(2000) }] } })).join('');
  const big = Buffer.from(rollout(TIDW, '/work/whole', 'a long remote thread') + filler);
  let nW = 0;
  const wholeScene = async (HMc, { release = false } = {}) => {
    const dataDir = path.join(home, 'hostdata-b0248-' + (++nW)); fs.mkdirSync(dataDir, { recursive: true });
    const hm = new HMc({ dataDir });
    hm._state.hosts.push({ id: 'hw', name: 'W', transport: 'dial' });
    hm._ssh = async () => { throw new Error('the legacy ssh rung must not be needed here'); };
    // the RED copy: this instance's whole copy written AT THE CALL, the release's mkdir + temp + rename on the loop
    if (release) hm._landCacheWhole = async (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); };
    const rp = `/home/u/.codex/sessions/2026/11/24/rollout-2026-11-24T00-00-00-${TIDW}.jsonl`;
    hm.deviceBounded = async () => ({
      runCmd: async () => ({ stdout: rp + '\n', stderr: '', code: 0 }),
      fsStat: async () => ({ stat: { size: big.length, mtimeMs: 1000 * 1000 } }),
      fsReadRange: async (p, off, len) => ({ data: big.subarray(off, off + len) }),
    });
    const S = STALL.install({ under: dataDir, ms: STALL_MS }), meter = lateMeter();
    let got = null, err = null, late = null;
    try { got = await hm.fetchTranscript('hw', 'codex', TIDW); } catch (e) { err = e && e.message; } finally { late = meter.stop(); S.restore(); }
    let same = false, meta = null; try { same = fs.readFileSync(got).equals(big); meta = JSON.parse(fs.readFileSync(got + '.meta', 'utf8')); } catch { }
    const st = S.calls.filter((c) => c.kind === 'write' && c.stalled);
    return { late, err, same, metaSize: meta && meta.size, stalled: st.length, fns: [...new Set(st.map((c) => c.fn))] };
  };
  const { HostManager: HMW } = require(path.join(REPO, 'src/hosts.js'));
  const A = await wholeScene(HMW);
  ok(A.late < STALL_MS && A.stalled === 0 && A.same && A.metaSize === big.length && !A.err, `① THE PLACED STALL (${STALL_MS} ms in every main-thread write under the data folder): a ${(big.length / 1048576).toFixed(1)} MB whole refetch, the loop's worst lateness ${A.late} ms < one stall, NO main-thread write stalled, the copy whole on disk and its record after it`, A);
  const AX = await wholeScene(HMW, { release: true });
  ok(AX.late >= STALL_MS && AX.stalled > 0, `① RED control (the release's whole write: mkdir + temp + rename on the loop): the loop is held a stall's length or more (${AX.late} ms; ${AX.stalled} main-thread writes stalled: ${AX.fns.join(', ')}) (red)`, AX);
}

// ── r4006 (主开发, the round wf_c13df757-2b2 on line 888): THE CURE'S LAWS, each leg with its RED ──────────────────────────────────
// A writer of the suite's own through the seam hm._writer (src/hosts.js _W), the stand-in thread where a write must fail or be
// held. The remote file is a stand-in in memory (R: its path, bytes and mtime), served by the dial data plane (hm.deviceBounded)
// and, where a scene needs the ssh rung, by a stand-in hm._ssh answering the rung's four commands (its probe, `tail -c +N | head
// -c LEN`, `tail -c +N`, `cat`) — or nothing (an empty answer: the rung found no file, and serves what the slot holds).
process.setMaxListeners(64);   // every HostManager's conversation index hooks the process exit (src/conversation-index.js) — ~20 here
const SW = require(path.join(REPO, 'src/store-writer.js'));
const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs'));
const { HostManager: HMR } = require(path.join(REPO, 'src/hosts.js'));
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) return false; await sleep(5); } return true; };
const TIDR = '88888888-7777-4666-8555-444444444444';
const lawHead = Buffer.from(rollout(TIDR, '/work/laws', 'a remote thread under the writer laws'));
const turns = (from, n, w) => Buffer.from(Array.from({ length: n }, (_, i) => rec({ timestamp: '2026-11-24T00:00:10.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `turn ${from + i} ` + 'r'.repeat(w) }] } })).join(''));
const remote = (bytes, mtimeS) => ({ path: `/home/u/.codex/sessions/2026/11/24/rollout-2026-11-24T00-00-00-${TIDR}.jsonl`, bytes, mtimeS });
const dialPlane = (R) => async () => ({
  runCmd: async () => ({ stdout: R.path + '\n', stderr: '', code: 0 }),
  fsStat: async () => ({ stat: { size: R.bytes.length, mtimeMs: R.mtimeS * 1000 } }),
  fsReadRange: async (p, off, len) => ({ data: R.bytes.subarray(off, off + len) }),
});
const sshStand = (R, up = () => true) => async (h, cmd) => {
  if (!up()) return Buffer.alloc(0);
  const b = R.bytes;
  let m;
  if (cmd.includes("stat -c '%s %Y'")) return Buffer.from(`${b.length} ${R.mtimeS}\n${R.path}\n`);
  if ((m = /^tail -c \+(\d+) "[^"]+" \| head -c (\d+)$/.exec(cmd))) return b.subarray(Number(m[1]) - 1, Number(m[1]) - 1 + Number(m[2]));
  if ((m = /^tail -c \+(\d+) "[^"]+"$/.exec(cmd))) return b.subarray(Number(m[1]) - 1);
  if (/^cat "[^"]+"$/.test(cmd)) return b;
  throw new Error(`the stand-in ssh knows no such command (${cmd.slice(0, 60)})`);
};
let nR = 0, nS = 0;
const lawScene = (HMc, { transport = 'dial', R, writer = null, ssh = null }) => {
  const dataDir = path.join(home, 'hostdata-r4006-' + (++nR)); fs.mkdirSync(dataDir, { recursive: true });
  const hm = new HMc({ dataDir });
  hm._state.hosts.push({ id: 'hw', name: 'W', transport });
  if (writer) hm._writer = writer;
  if (transport === 'dial') hm.deviceBounded = dialPlane(R);
  hm._ssh = ssh || (async () => { throw new Error('the legacy ssh rung must not be needed here'); });
  const copy = path.join(dataDir, 'remote-jsonl', 'hw', 'codex', TIDR + '.jsonl');
  return { hm, dataDir, copy, meta: copy + '.meta', base: path.basename(copy) };
};
const standWriter = () => { const ctl = path.join(home, 'stand-r4006-' + (++nS)); const S = STAND.make(ctl); return { S, ctl, W: SW.create({ log: quiet, workerPath: S.path }) }; };
const readBytes = (f) => { try { return fs.readFileSync(f); } catch { return null; } };
const readMeta = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const rowOf = (W, f) => W.stats().find((r) => r.file === f) || null;
const rowsFor = (W, files) => W.stats().filter((r) => files.includes(r.file)).map((r) => ({ file: path.basename(r.file), dirty: r.dirty, inflight: r.inflight, writes: r.writes }));
const fetchR = (hm, opts) => hm.fetchTranscript('hw', 'codex', TIDR, opts).then((p) => ({ p, e: null }), (e) => ({ p: null, e }));
const answerOf = (r, copy) => (r.e ? String(r.e.code || r.e.message) : r.p === copy ? 'the copy' : String(r.p));

console.log('② r4006 laws A + F: once a whole copy and its record are on disk, the writer keeps NO entry of either (its own stats)');
{
  const R2b = Buffer.concat([lawHead, turns(0, 20, 400)]);
  const scene = async ({ keep = false } = {}) => {
    const W = SW.create({ log: quiet });
    try {
      const { hm, copy, meta } = lawScene(HMR, { R: remote(R2b, 2000), writer: W });
      if (keep) hm._letCacheGo = () => { };   // the RED: the file's entry never leaves the writer
      const r = await fetchR(hm);
      const b = readBytes(copy), m = readMeta(meta);
      return { answer: answerOf(r, copy), same: !!b && b.equals(R2b), metaSize: m && m.size, rows: rowsFor(W, [copy, meta]) };
    } finally { W.stop(); }
  };
  const A = await scene();
  ok(A.answer === 'the copy' && A.same && A.metaSize === R2b.length && A.rows.length === 0, `② LAWS A + F: a whole fetch landed (the copy byte-equal, its record ${R2b.length} bytes) and the writer's own stats() hold NO row of the copy nor of its record — the fetched bytes are reachable from nowhere in the writer`, A);
  const AX = await scene({ keep: true });
  ok(AX.same && AX.rows.length === 2, `② RED control (the entry kept: _letCacheGo a no-op): the writer still holds ${AX.rows.length} rows (the copy and its record) after the answer (red)`, AX);
}

console.log('③ r4006 law B: a whole write REFUSED (ECACHEWRITE) never lands later — past the writer\'s retry time, the copy and its record agree');
{
  // THE ROADS (src/hosts.js _fetchRemoteByFindOnce, the slab rung): fetch 1 — no record ⇒ WHOLE (R1 lands, its record exact);
  // fetch 2 — the remote ROTATED SMALLER (R2, its first two records): localSize > size ⇒ no delta (deltaSlab) ⇒ WHOLE, the old
  // record first written without its exact claim (law D), then the copy's write FAILING on the stand-in thread (ECACHEWRITE);
  // fetch 3 — the remote back at R1 and grown (R3): the old copy R1 is no longer than the record's size (_prefixIsOurs) ⇒ the
  // DELTA (_appendDeltaAt grows the copy on the loop) and a record of R3's size. Then past the writer's first retry (store-pace
  // retryMs: 1 s, a REAL timer — a placed clock does not shorten it).
  // NOTE: on a dial host the slab rung's ECACHEWRITE is not the fetch's answer — its catch (not terminal: _isTerminalFetchError)
  // degrades it to the ssh rung, which here finds nothing (an empty probe answer) and serves the copy the slot holds. So the leg
  // reads ECACHEWRITE where it is said: at the instance's _landCacheWhole.
  const R1 = Buffer.concat([lawHead, turns(0, 6, 300)]);
  const R2 = lawHead.subarray(0, lawHead.indexOf(0x0a, lawHead.indexOf(0x0a) + 1) + 1);
  const R3 = Buffer.concat([R1, turns(6, 6, 300)]);
  const RETRY_WAIT_MS = 1500;
  // the unit's landing BEFORE r4006 (c93e9ea6d's shape): the producer keeps the bytes, nothing is forgotten
  const preCure = (hm) => async (file, bytes, id, what, hand) => {
    const W = hm._W();
    hand(W, () => bytes);
    if (!(await W.durable(file, { timeoutMs: 120000 }))) throw Object.assign(new Error(`${what} ${path.basename(file)} could not be written (the store writer did not land it)`), { code: 'ECACHEWRITE' });
  };
  const scene = async ({ red = false } = {}) => {
    const { S, W } = standWriter();
    try {
      const R = remote(R1, 3000);
      const { hm, copy, meta, base } = lawScene(HMR, { R, writer: W, ssh: sshStand(R, () => false) });
      if (red) hm._landCacheBytes = preCure(hm);
      const said = [], whole = hm._landCacheWhole;
      hm._landCacheWhole = async function (...a) { try { return await whole.apply(this, a); } catch (e) { said.push(String(e && e.code)); throw e; } };
      const f1 = await fetchR(hm);
      R.bytes = R2; R.mtimeS = 3001;
      S.failOn(base, true);
      const f2 = await fetchR(hm);
      const t2 = performance.now();
      S.failOn(base, false);
      R.bytes = R3; R.mtimeS = 3002;
      const f3 = await fetchR(hm);
      const b3 = readBytes(copy);
      await sleep(Math.max(0, t2 + RETRY_WAIT_MS - performance.now()));
      const b = readBytes(copy), m = readMeta(meta);
      return { f1: answerOf(f1, copy), f2: answerOf(f2, copy), said, f3: answerOf(f3, copy), afterDelta: b3 && b3.length, copySize: b && b.length, metaSize: m && m.size, sameAsR3: !!b && b.equals(R3), rows: rowsFor(W, [copy, meta]), sizes: { R1: R1.length, R2: R2.length, R3: R3.length } };
    } finally { W.stop(); }
  };
  // ③b (line 888's follow, r4154 (1)): THE ONE PLACE LAW B IS NOT LITERAL — a write IN FLIGHT when the fetch's bound passes still renames,
  // then goes (forgotten: unlinked). Its scenes run beside ③'s (the suite's time).
  // fetch 1 — WHOLE, R1 and its exact record; fetch 2 — the remote rotated (R2, WHOLE): its old record written without its exact claim,
  // then the copy's write HELD on the stand-in thread past THE FETCH's BOUND, PLACED (a view of the writer whose durable() of the copy
  // answers false after BOUND_MS, as CACHE_LAND_MS does at 120 s): ECACHEWRITE said, the entry forgotten while its write flies; fetch 3
  // — the remote back at R1 and grown (R3): its DELTA appends on the loop into the old copy at once, and its record waits on the writer's
  // thread behind the held write AND its unlink (the hold is read per job: the unlink is held as long). So the late rename lands R2 over
  // the delta, the unlink removes it, then the record of R3 lands: no copy, never R2's bytes under R3's record; fetch 4 fetches whole
  const BOUND_MS = 100, HOLD_IN = 700;
  const sceneLate = async ({ red = false } = {}) => {
    const { S, W } = standWriter();
    try {
      const R = remote(R1, 3000);
      const { hm, copy, meta, base } = lawScene(HMR, { R, writer: W, ssh: sshStand(R, () => false) });
      let bounded = false;
      hm._writer = new Proxy(W, { get: (t, k) => (k === 'durable' ? (f, o) => (bounded && f === copy ? new Promise((r) => setTimeout(() => r(false), BOUND_MS)) : t.durable(f, o)) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
      if (red) hm._letCacheGo = () => { };   // the RED: nothing forgotten — the late rename's bytes stay
      const said = [], whole = hm._landCacheWhole;
      hm._landCacheWhole = async function (...a) { try { return await whole.apply(this, a); } catch (e) { said.push(String(e && e.code)); throw e; } };
      const f1 = await fetchR(hm);
      R.bytes = R2; R.mtimeS = 3001;
      S.hold(base, HOLD_IN); bounded = true;
      const f2 = await fetchR(hm);
      bounded = false;
      R.bytes = R3; R.mtimeS = 3002;
      const f3 = await fetchR(hm);
      const settled = await until(() => { const r = rowOf(W, copy); return !r || (!r.inflight && !r.dirty); }, 3 * HOLD_IN + 3000);
      S.unhold(base);
      const b3 = readBytes(copy), m3 = readMeta(meta);
      const f4 = await fetchR(hm);
      const b = readBytes(copy), m = readMeta(meta);
      return { f1: answerOf(f1, copy), f2: answerOf(f2, copy), said, f3: answerOf(f3, copy), settled, afterLate: b3 && b3.length, afterLateIsR2: !!b3 && b3.equals(R2), recordAfterLate: m3 && m3.size, f4: answerOf(f4, copy), sameAsR3: !!b && b.equals(R3), metaSize: m && m.size, metaExact: !!m && m.sizeExact === true, sizes: { R1: R1.length, R2: R2.length, R3: R3.length } };
    } finally { W.stop(); }
  };
  const [B, BX, G, GX] = await Promise.all([scene(), scene({ red: true }), sceneLate(), sceneLate({ red: true })]);
  ok(B.f1 === 'the copy' && B.said.includes('ECACHEWRITE') && B.f3 === 'the copy' && B.afterDelta === R3.length && B.copySize === B.metaSize && B.sameAsR3 && B.rows.length === 0, `③ LAW B: fetch 2's whole write refused (ECACHEWRITE), fetch 3's delta grew the old copy to ${R3.length} bytes with its record — and ${RETRY_WAIT_MS} ms on (past the writer's 1 s retry) the copy still holds what its record says (${B.copySize} = ${B.metaSize}), byte-equal to the remote; the writer holds no row of either`, B);
  ok(BX.said.includes('ECACHEWRITE') && BX.afterDelta === R3.length && BX.copySize === R2.length && BX.copySize !== BX.metaSize, `③ RED control (the landing before r4006: the bytes kept, nothing forgotten): the refused copy's retry landed AFTER the delta — the copy ${BX.copySize} bytes, its record ${BX.metaSize} (red)`, BX);
  ok(G.f1 === 'the copy' && G.said.includes('ECACHEWRITE') && G.settled && G.afterLate == null && G.recordAfterLate === R3.length && G.f4 === 'the copy' && G.sameAsR3 && G.metaSize === R3.length && G.metaExact, `③b THE WRITE IN FLIGHT PAST THE FETCH's BOUND: fetch 2 said ECACHEWRITE at the placed bound; its late rename landed and went (forgotten), the delta of fetch 3 with it — no copy beside the record of ${R3.length}, never R2's bytes; the next poll fetched whole (byte-equal, its record exact)`, G);
  ok(GX.said.includes('ECACHEWRITE') && GX.afterLateIsR2 && GX.recordAfterLate === R3.length, `③b RED control (nothing forgotten): the late rename's ${GX.afterLate} bytes (R2) stayed beside a record of ${GX.recordAfterLate} (red)`, GX);
}

console.log('④ r4006 law D: a stop between a whole copy\'s landing and its record never leaves the slot «too large» for good above the fetch cap');
{
  // THE ROADS: fetch 1 — WHOLE, R1 and an EXACT record (sizeExact); fetch 2 — the remote grown (R2), its delta refused as «the slot
  // moved» (the product's own seam _appendDeltaAt answering false ⇒ under the cap, a whole refetch): the old record written without
  // its exact claim (_landCacheNotExact), the copy R2 lands, and its FINAL record's write throws once (THE STOP) — the slab rung's
  // catch degrades to the ssh rung, which finds nothing (the stand-in is down) and serves the slot; fetch 3 — the remote grown past
  // a CAP of 6 KB (R3): the copy holds more than the record names. With no exact claim the over-stamp heal (healOverStamp: the bytes
  // past the record checked against the remote's own) re-stamps it and the delta grows it. With the old EXACT record
  // (_overStampedLegacySlot false, _prefixIsOurs false) the slab rung says «too large», degrades, and the ssh rung (up now) says
  // it again: the fetch's answer.
  const R1 = Buffer.concat([lawHead, turns(0, 1, 200)]);
  const R2 = Buffer.concat([R1, turns(1, 4, 1000)]);
  const R3 = Buffer.concat([R2, turns(5, 4, 1000)]);
  const CAP = 6 * 1024;
  const scene = async ({ oldRecord = false } = {}) => {
    const W = SW.create({ log: quiet });
    try {
      const R = remote(R1, 4000);
      let sshUp = false;
      const { hm, copy, meta } = lawScene(HMR, { R, writer: W, ssh: sshStand(R, () => sshUp) });
      if (oldRecord) hm._landCacheNotExact = async () => { };   // the RED: the old exact record stays while the new copy lands
      let armed = false, wholeLanded = false, stops = 0;
      const whole = hm._landCacheWhole, record = hm._landCacheMeta;
      hm._landCacheWhole = async function (...a) { await whole.apply(this, a); if (armed) wholeLanded = true; };
      hm._landCacheMeta = async function (...a) {
        if (armed && wholeLanded && stops === 0) { stops++; throw Object.assign(new Error('stopped'), { code: 'ECACHEWRITE' }); }   // THE STOP: the record after the copy never lands
        return record.apply(this, a);
      };
      const f1 = await fetchR(hm);
      const m1 = readMeta(meta);
      R.bytes = R2; R.mtimeS = 4001;
      armed = true; hm._appendDeltaAt = () => false;
      const f2 = await fetchR(hm);
      armed = false; delete hm._appendDeltaAt;
      const b2 = readBytes(copy), m2 = readMeta(meta);
      R.bytes = R3; R.mtimeS = 4002; sshUp = true;
      const f3 = await fetchR(hm, { maxBytes: CAP });
      const b = readBytes(copy), m = readMeta(meta);
      return {
        f1: answerOf(f1, copy), firstExact: !!m1 && m1.sizeExact === true && m1.size === R1.length, f2: answerOf(f2, copy), stops,
        atStop: { copy: b2 && b2.length, record: m2 && m2.size, exact: !!m2 && m2.sizeExact === true },
        f3: answerOf(f3, copy), tooLarge: !!f3.e && /too large/.test(String(f3.e.message)), same: !!b && b.equals(R3), metaSize: m && m.size, metaExact: !!m && m.sizeExact === true, healed: !!m && !!m.healedStampAt,
        sizes: { R1: R1.length, R2: R2.length, R3: R3.length, CAP },
      };
    } finally { W.stop(); }
  };
  const sizesOk = R3.length > CAP && R2.length - R1.length <= CAP && R3.length - R2.length <= CAP;
  const D = await scene();
  ok(sizesOk && D.firstExact && D.stops === 1 && D.atStop.copy === R2.length && D.atStop.record === R1.length && !D.atStop.exact && D.f3 === 'the copy' && D.same && D.metaSize === R3.length && D.metaExact, `④ LAW D: the stop left the new copy (${D.atStop.copy} bytes) beside a record of ${D.atStop.record} that claims NO exact size — the next poll, the remote ${R3.length} bytes past a ${CAP}-byte cap, healed and grew the slot (a path, the copy byte-equal, its record exact at ${D.metaSize}), never «too large»`, D);
  const DX = await scene({ oldRecord: true });
  ok(DX.stops === 1 && DX.atStop.copy === R2.length && DX.atStop.exact && DX.tooLarge, `④ RED control (the old EXACT record kept: _landCacheNotExact a no-op): the same poll ends «${String(DX.f3).slice(0, 60)}» (red)`, DX);
}

console.log('⑤ r4006 law E: a REMOVED machine\'s owed copy never lands its bytes in the machine\'s folder after the removal');
{
  // remove('hw') (src/hosts.js remove): hosts.json saved (the process's writer — its own thread, never held here), then, once it
  // landed, every writer row under remote-jsonl/hw/ forgotten (_letCacheGo) and the folder removed. Two shapes of «owed»:
  //  (a) QUEUED: the copy dirty behind other stores' writes on the stand-in thread (blocker 1 in flight and held, blocker 2 made
  //      and waiting for the whole-write lane — src/store-writer.js dueRows: a new store is not taken while that lane has a job
  //      waiting), so at the removal it is neither in flight nor waiting: forget drops it, it is never written;
  //  (b) IN FLIGHT: the copy's own write held on the stand-in thread at the removal: forget lets it land, then unlinks it again
  //      (the hold is read per job, so the unlink after it is held as long: no unhold race with the thread's start).
  // (b) the copy IN FLIGHT at the removal: the writer's thread makes a missing folder for the write it runs, so remove() forgets the
  // machine's entries FIRST and then waits (bounded) for every in-flight write of the folder to land before it removes the folder —
  // asking durable() again while the writer still owes the file a write (pending()): forget() answers every waiter at once, the
  // fetch's own forget (its finally) among them, so one answer is not a landing
  const HOLD_MS = 500;
  const R0 = Buffer.concat([lawHead, turns(0, 4, 300)]);
  const filesUnder = (dir) => { const out = []; const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const q = path.join(d, e.name); if (e.isDirectory()) walk(q); else out.push(path.relative(dir, q)); } }; walk(dir); return out; };
  // r5586 (lane bl-loop-b): WHERE THE REMOVAL LOOKS. remove() tears the machine's files down only once hosts.json LANDED on the
  // process's own store writer (a real fsync'd write: the kit's load can hold it past a scene's placed holds), and that teardown
  // runs in one chain of microtasks (its stats() read, the forget, the landing waits that return at once, the folder's rm): no
  // message of the writer's thread is read inside it. So each scene is judged where the removal LOOKS: its first stats() after
  // hosts.json landed notes each named row as the writer holds it then (in flight, dirty, owed), the durable() waits it asks for
  // them are counted, and hosts.json's landing is timed (only calls made after the scene arms the removal)
  const COPY_BASE = TIDR + '.jsonl';
  const watchRemoval = (hm, W, files) => {
    const seen = { at: null, asks: 0, saveMs: null }, inner = hm._writer;
    let armed = false, saved = false;
    hm._writer = new Proxy(inner, { get: (t, k) => {
      if (k === 'stats') return () => { const rows = t.stats(); if (armed && saved && !seen.at) seen.at = Object.fromEntries(files.map((f) => { const r = rowOf(W, f); return [path.basename(f), { inflight: !!r && !!r.inflight, dirty: !!r && !!r.dirty, owed: !!W.pending(f) }]; })); return rows; };
      if (k === 'durable') return (f, o) => { if (armed && files.includes(f)) seen.asks++; return t.durable(f, o); };
      const x = t[k]; return typeof x === 'function' ? x.bind(t) : x;
    } });
    const persisted = hm.persisted.bind(hm);
    hm.persisted = async () => { if (!armed) return persisted(); const a = performance.now(); try { return await persisted(); } finally { if (seen.saveMs === null) seen.saveMs = Math.round(performance.now() - a); saved = true; } };
    return { seen, arm: () => { armed = true; } };
  };
  const removedScene = async ({ shape, red = false, oneAnswer = false }) => {
    const { S, W, ctl } = standWriter();
    try {
      const R = remote(R0, 5000);
      const { hm, dataDir, copy, meta, base } = lawScene(HMR, { R, writer: W, ssh: async () => { throw new Error('the machine is removed'); } });
      // the RED: the release's removal — it neither forgets the machine's owed writes nor waits for one in flight (the writer seen
      // through a view whose stats() lists nothing: the removal finds no entry of the folder; every other call is the writer's own)
      if (red) { hm._letCacheGo = () => { }; const W0 = hm._writer; hm._writer = new Proxy(W0, { get: (t, k) => (k === 'stats' ? () => [] : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); }
      // the RED of the wait itself (this cure's first gate): the removal reads ONE durable() answer as the landing — the writer seen
      // without pending(), so src/hosts.js _cacheLanded asks once; the fetch's own forget (its finally) answers that ask at once
      if (oneAnswer) { const W0 = hm._writer; hm._writer = new Proxy(W0, { get: (t, k) => (k === 'pending' ? undefined : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); }
      const said = [], bytesLand = hm._landCacheBytes;
      hm._landCacheBytes = async function (...a) { try { return await bytesLand.apply(this, a); } catch (e) { said.push(`${path.basename(a[0])}: ${(e && (e.code || e.message)) || e}`); throw e; } };
      const b1 = path.join(ctl, 'blocker-1.json'), b2 = path.join(ctl, 'blocker-2.json');
      const watch = watchRemoval(hm, W, shape === 'queued' ? [copy, b1] : [copy]);   // r5586: read where the removal looks
      const v = {};
      let fp;
      if (shape === 'queued') {
        S.hold('blocker-1.json', HOLD_MS);
        W.dirty(b1, { name: 'blocker-1.write', urgent: true, produce: () => '{"b":1}' });
        v.b1 = await until(() => { const r = rowOf(W, b1); return !!r && r.inflight; });
        W.dirty(b2, { name: 'blocker-2.write', urgent: true, produce: () => '{"b":2}' });
        v.b2 = await until(() => { const r = rowOf(W, b2); return !!r && r.inflight; });
        fp = fetchR(hm);
        v.owed = await until(() => { const r = rowOf(W, copy); return !!r && r.dirty && !r.inflight; });
        watch.arm(); v.removed = await hm.remove('hw');
        v.inside = (() => { const r = rowOf(W, b1); return !!r && r.inflight; })();   // blocker 1 still held: the copy was never taken
        v.ended = await until(() => { const r = rowOf(W, b2); return !!r && r.writes >= 1 && !r.inflight; }, HOLD_MS + 3000);
      } else {
        S.hold(base, HOLD_MS);
        fp = fetchR(hm);
        v.flying = await until(() => { const r = rowOf(W, copy); return !!r && r.inflight; });
        watch.arm(); v.removed = await hm.remove('hw');
        v.inside = (() => { const r = rowOf(W, copy); return !!r && r.inflight; })();   // the removal ran while the copy's write was held
        v.ended = await until(() => { const r = rowOf(W, copy); return !r || (!r.inflight && r.writes >= 1); }, 2 * HOLD_MS + 3000);
      }
      const f = await Promise.race([fp, sleep(3000).then(() => ({ p: null, e: new Error('no answer in 3 s') }))]);
      await sleep(50);
      const folder = path.join(dataDir, 'remote-jsonl', 'hw');
      return { ...v, answer: answerOf(f, copy), said, folderBack: fs.existsSync(folder), files: filesUnder(folder), rows: rowsFor(W, [copy, meta]), at: watch.seen.at, asks: watch.seen.asks, saveMs: watch.seen.saveMs };
    } finally { W.stop(); }
  };
  // (c) r4154 (3): a copy's write handed to the writer (its own row, no fetch: no record follows it), forgotten IN FLIGHT by the suite
  // (as when a fetch's bound passes), lands, then its UNLINK is held as long; the removal comes while only that unlink flies: stats()
  // shows the row in flight, but nothing is owed — the removal does not wait
  // r5586: `holdU` the copy's write and unlink holds; `slowSave` = THE PLACEMENT's plant (hosts.json through a stand-in writer that
  // holds it that long: the kit's load, made at will)
  const unlinkScene = async ({ red = false, holdU = 600, slowSave = 0 } = {}) => {
    const { S, W } = standWriter();
    const save = slowSave ? standWriter() : null;
    try {
      const R = remote(R0, 5000), HOLD_U = holdU;
      const { hm, copy, base } = lawScene(HMR, { R, writer: W, ssh: async () => { throw new Error('the machine is removed'); } });
      if (save) { hm._storeWriter = save.W; save.S.hold('hosts.json', slowSave); }
      // the RED: the cure's first wait (it asks durable() before it looks at pending()), its bound placed at 1.2 s for the suite's time
      if (red) hm._cacheLanded = async function (W2, file, until0) { const u = Math.min(until0, Date.now() + 1200); for (let k = 0; k < 8 && Date.now() < u; k++) { try { await W2.durable(file, { timeoutMs: Math.max(1, u - Date.now()) }); } catch { return; } if (typeof W2.pending !== 'function' || !W2.pending(file)) return; } };
      const watch = watchRemoval(hm, W, [copy]);   // r5586: read where the removal looks
      S.hold(base, HOLD_U);
      W.dirty(copy, { name: 'remote-jsonl.write', urgent: true, makeDir: true, produce: () => R0 });
      const flying = await until(() => { const r = rowOf(W, copy); return !!r && r.inflight; });
      W.forget(copy);
      const unlinking = await until(() => { const r = rowOf(W, copy); return !!r && r.inflight && !W.pending(copy); }, HOLD_U + 3000);
      watch.arm();
      const t0 = performance.now(); const removed = await hm.remove('hw'); const ms = Math.round(performance.now() - t0);
      const inside = (() => { const r = rowOf(W, copy); return !!r && r.inflight; })();   // the unlink still flying: the removal ran beside it
      // the unlink's OWN landing, a fact: its row leaves the writer, waited under a stated ceiling (its hold + 5 s), red by name
      const landed = await until(() => !rowOf(W, copy), HOLD_U + 5000);
      return { flying, unlinking, removed, ms, inside, landed, holdU: HOLD_U, at: watch.seen.at, asks: watch.seen.asks, saveMs: watch.seen.saveMs, plant: save ? save.S.applied('hosts.json') : null };
    } finally { W.stop(); if (save) save.W.stop(); }
  };
  const [Ea, EaX, Eb, EbX, EbY, Ec, EcX, Pc] = await Promise.all([removedScene({ shape: 'queued' }), removedScene({ shape: 'queued', red: true }), removedScene({ shape: 'flying' }), removedScene({ shape: 'flying', red: true }), removedScene({ shape: 'flying', oneAnswer: true }), unlinkScene(), unlinkScene({ red: true }), unlinkScene({ holdU: 200, slowSave: 1500 })]);
  // r5586: EACH SCENE IS JUDGED WHERE ITS ORDER FORMED, at the removal's look (watchRemoval). One that did not form while hosts.json's
  // landing outlasted the scene's placed hold is a named skip (the kit's load ran the clock past the scene: never a red, never a
  // green); one that did not form with hosts.json landed inside that hold is RED (the order failed, not the load)
  const look = (e, f) => (e.at && e.at[f]) || { inflight: false, dirty: false, owed: false };
  const FORMED = {
    queued: (e) => { const c = look(e, COPY_BASE), b = look(e, 'blocker-1.json'); return c.dirty && !c.inflight && b.inflight; },   // the copy owed behind blocker 1, still held
    flying: (e) => { const c = look(e, COPY_BASE); return c.inflight && c.owed; },   // the copy's own write still flying
    unlink: (e) => { const c = look(e, COPY_BASE); return c.inflight && !c.owed; },   // only its unlink flying: nothing owed
  };
  const WHAT = { queued: 'blocker 1 had landed (the copy no longer queued behind it)', flying: 'the copy\'s write had landed', unlink: 'the copy\'s unlink was over' };
  const formOf = (e, shape, hold) => (FORMED[shape](e) ? 'formed' : e.saveMs !== null && e.saveMs >= hold ? 'skip' : 'red');
  const judged = (e, shape, hold, label, setup, cond, name) => {
    if (!setup) return ok(false, `${label}: the scene's own setup did not hold (its placed holds never showed the rows they hold)`, e);
    const f = formOf(e, shape, hold);
    if (f === 'formed') return ok(cond, name, e);
    if (f === 'skip') { console.log(`  ⊘ SKIP ${label}: the scene did not form where the removal looks — hosts.json landed in ${e.saveMs} ms, past the scene's placed ${hold} ms hold, so its teardown read the writer after ${WHAT[shape]} (${JSON.stringify(e.at)})`); return null; }
    return ok(false, `${label}: the scene did not form where the removal looks, though hosts.json landed in ${e.saveMs} ms, inside the scene's placed ${hold} ms hold — the order failed, not the load (${JSON.stringify(e.at)})`, e);
  };
  judged(Ea, 'queued', HOLD_MS, '⑤ LAW E (a)', Ea.b1 && Ea.b2 && Ea.owed, Ea.removed === true && Ea.inside && Ea.ended && !Ea.folderBack && Ea.rows.length === 0, `⑤ LAW E (a), the copy QUEUED at the removal: forgotten, never written — remote-jsonl/hw does not exist after the writer's queue ran`);
  judged(EaX, 'queued', HOLD_MS, '⑤ RED control (a)', EaX.owed, EaX.inside && EaX.folderBack && EaX.files.length > 0, `⑤ RED control (a) (the release's removal: it forgets nothing and waits for nothing): the queued copy landed after the removal — the folder is back with ${EaX.files.join(', ')} (red)`);
  judged(Eb, 'flying', HOLD_MS, '⑤ LAW E (b)', Eb.flying, Eb.removed === true && Eb.inside && Eb.ended && Eb.files.length === 0 && !Eb.folderBack && Eb.rows.length === 0, `⑤ LAW E (b), the copy IN FLIGHT at the removal: the removal waits for its landing (bounded), then the folder goes — remote-jsonl/hw does not exist`);
  judged(EbX, 'flying', HOLD_MS, '⑤ RED control (b)', EbX.flying, EbX.inside && EbX.files.length > 0, `⑤ RED control (b) (the release's removal: it forgets nothing and waits for nothing): the in-flight copy stays — ${EbX.files.join(', ')} (red)`);
  judged(EbY, 'flying', HOLD_MS, '⑤ RED control (b), one answer', EbY.flying, EbY.removed === true && EbY.inside && EbY.folderBack, `⑤ RED control (b) (the removal waiting on ONE durable() answer: the fetch's own forget answers it while the copy flies): the landing made remote-jsonl/hw again (red)`);
  judged(Ec, 'unlink', Ec.holdU, '⑤ LAW E (c)', Ec.flying && Ec.unlinking, Ec.removed === true && Ec.asks === 0 && Ec.inside && Ec.landed, `⑤ LAW E (c), only the UNLINK in flight at the removal: nothing owed — its teardown met the unlink in flight, asked no wait of it (${Ec.asks}), and the removal ENDED WITH THE UNLINK STILL FLYING (${Ec.ms} ms, ${Ec.saveMs} ms of them hosts.json's landing); the unlink then landed by itself (its stated ceiling: its hold + 5 s)`);
  judged(EcX, 'unlink', EcX.holdU, '⑤ RED control (c)', EcX.flying && EcX.unlinking, EcX.removed === true && EcX.asks >= 1 && !EcX.inside, `⑤ RED control (c) (the wait that asks before it looks): its teardown met the unlink in flight and asked ${EcX.asks} wait(s) of it; the removal ended only AFTER the unlink was over (${EcX.ms} ms), waiting to its placed bound (red)`);
  // THE PLACEMENT, made at will and kept as a control (r5586): a952ac17a-20261128013515-both's red («the removal ENDED WITH THE UNLINK
  // STILL FLYING» false at 1325 ms, box zone, load 33 to 37) is hosts.json's landing on the process's writer outlasting the scene's
  // holds. Here hosts.json lands through a stand-in writer that holds it 1 500 ms, the copy's write and unlink held 200 ms each: the
  // removal's teardown reads the writer after the unlink is over. The judgment before r5586 reads that red, the product unchanged;
  // the judgment above names it a skip
  const oldC = (e) => e.flying && e.unlinking && e.removed === true && e.inside;
  const plantRead = Array.isArray(Pc.plant) && Pc.plant.includes('hold');
  if (plantRead && FORMED.unlink(Pc)) console.log(`  ⊘ SKIP ⑤ PLACEMENT (c): the plant did not take — the copy's unlink was still in flight after hosts.json's planted 1 500 ms (${JSON.stringify(Pc.at)})`);
  else ok(plantRead && Pc.flying && Pc.unlinking && Pc.removed === true && !oldC(Pc) && formOf(Pc, 'unlink', Pc.holdU) === 'skip' && Pc.asks === 0, `⑤ PLACEMENT (c), made at will: hosts.json held 1 500 ms on a stand-in writer (its applied: ${(Pc.plant || []).join(' ') || 'nothing'}), the copy's write and unlink 200 ms each — the removal's teardown read the writer after the unlink was over (hosts.json landed in ${Pc.saveMs} ms), so the judgment before r5586 reads it red («ended with the unlink still flying» false, ${Pc.ms} ms) while the removal asked no wait (${Pc.asks}); the judgment above names it a skip`, Pc);
}

console.log('⑥ B-0248 unit 4 on THE SSH RUNG: its whole `cat` copy is the store writer\'s too — no main-thread write under the placed stall');
{
  const STALL6 = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
  const STALL6_MS = 200;   // three stalled calls in the red (its mkdir, write, rename)
  const big6 = Buffer.concat([lawHead, turns(0, 30, 2000)]);
  const sshScene = async ({ release = false } = {}) => {
    const R = remote(big6, 6000);
    const { hm, dataDir, copy, meta } = lawScene(HMR, { transport: 'ssh', R, ssh: sshStand(R) });   // the process's writer, as ①
    if (release) hm._landCacheWhole = async (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); };
    const S = STALL6.install({ under: dataDir, ms: STALL6_MS });
    let r;
    try { r = await fetchR(hm); } finally { S.restore(); }
    const b = readBytes(copy), m = readMeta(meta);
    const st = S.calls.filter((c) => c.kind === 'write' && c.stalled);
    return { answer: answerOf(r, copy), same: !!b && b.equals(big6), metaSize: m && m.size, stalled: st.length, fns: [...new Set(st.map((c) => c.fn))] };
  };
  const F = await sshScene();
  ok(F.answer === 'the copy' && F.same && F.metaSize === big6.length && F.stalled === 0, `⑥ THE SSH RUNG under the placed stall (${STALL6_MS} ms in every main-thread write under the data folder): a whole \`cat\` of ${big6.length} bytes, NO main-thread write stalled, the copy whole on disk and its record after it`, F);
  const FX = await sshScene({ release: true });
  ok(FX.stalled > 0, `⑥ RED control (the release's whole write on that rung: mkdir + temp + rename on the loop): ${FX.stalled} main-thread writes stalled (${FX.fns.join(', ')}) (red)`, FX);
}

console.log('⑦ B-0248 unit 4: THE RECORD ONLY AFTER ITS BYTES — a copy whose write FAILED leaves NO record (both rungs)');
{
  // the copy's write fails on the stand-in thread (EIO) at a FIRST fetch. The dial rung's ECACHEWRITE is degraded to the ssh rung
  // (here it finds nothing and there is no copy to serve ⇒ null — the NOTE of ③); the ssh rung's own throws out of the fetch.
  const R0 = Buffer.concat([lawHead, turns(0, 4, 300)]);
  const scene = async ({ transport, swallow = false }) => {
    const { S, W } = standWriter();
    try {
      const R = remote(R0, 7000);
      const { hm, copy, meta, base } = lawScene(HMR, { transport, R, writer: W, ssh: sshStand(R, () => transport === 'ssh') });
      const said = [], whole = hm._landCacheWhole;
      hm._landCacheWhole = async function (...a) { try { return await whole.apply(this, a); } catch (e) { said.push(String(e && e.code)); if (!swallow) throw e; } };   // the RED: the failure swallowed
      S.failOn(base, true);
      const r = await fetchR(hm);
      return { said, answer: answerOf(r, copy), copy: fs.existsSync(copy), record: fs.existsSync(meta), rows: rowsFor(W, [copy, meta]) };
    } finally { W.stop(); }
  };
  for (const transport of ['dial', 'ssh']) {
    const G = await scene({ transport });
    const want = transport === 'ssh' ? 'ECACHEWRITE' : 'null';
    ok(G.said.includes('ECACHEWRITE') && G.answer === want && !G.copy && !G.record && G.rows.length === 0, `⑦ THE RECORD ONLY AFTER ITS BYTES (${transport} rung): the copy's write failed (ECACHEWRITE), the fetch answers ${want}, and NO record exists`, G);
    const GX = await scene({ transport, swallow: true });
    ok(GX.said.includes('ECACHEWRITE') && GX.record, `⑦ RED control (${transport} rung, the failure swallowed): a record was written for a copy that is not on disk (red)`, GX);
  }
}

console.log('⑧ B-0248 unit 4: a copy ABOVE PIECE_BYTES (4 MB) goes by reference in PIECES, verifyByRef on — byte-equal on disk');
{
  const big8 = Buffer.concat([lawHead, turns(0, 4400, 2000)]);
  const W = SW.create({ log: quiet, verifyByRef: true });
  let dataDir8 = null;
  try {
    const sc = lawScene(HMR, { R: remote(big8, 8000), writer: W });
    dataDir8 = sc.dataDir;
    const r = await fetchR(sc.hm);
    const b = readBytes(sc.copy), m = readMeta(sc.meta);
    const H = { bytes: big8.length, pieces: Math.ceil(big8.length / SW.PIECE_BYTES), answer: answerOf(r, sc.copy), same: !!b && b.equals(big8), metaSize: m && m.size, rows: rowsFor(W, [sc.copy, sc.meta]) };
    ok(big8.length > 2 * SW.PIECE_BYTES && H.answer === 'the copy' && H.same && H.metaSize === big8.length && H.rows.length === 0, `⑧ THE PIECES ROAD: a ${(big8.length / 1048576).toFixed(1)} MB whole fetch (${H.pieces} pieces of ${SW.PIECE_BYTES / 1048576} MB, the handed buffer's sum checked) lands byte-equal with its record, the writer keeping no row (no red control: the byte-equal copy is the verdict)`, H);
  } finally { W.stop(); if (dataDir8) { try { fs.rmSync(dataDir8, { recursive: true, force: true }); } catch { } } }   // ~19 MB on the scratch folder's tmpfs: gone at once
}

report();
