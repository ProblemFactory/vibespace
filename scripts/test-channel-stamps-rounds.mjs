#!/usr/bin/env node
// test-channel-stamps-rounds — B-360d (lane bl-chat-a; the coordinator's r1505 / r1556 rounds wkovlam1t and w5ymfrq4i): THE
// ROUNDS' LAWS on the poll stamps' compaction — a write never schedules the next write (a writer proxy counts the store's own
// asks; a stray ask writes nothing), a purge's stamps leave the disk before its «done» (the writer's durable()), a failed
// write keeps its retry, and the fail-behind bound tied to store-pace. Each with its RED control (one per half where two
// halves make the law).
// FAST, in process — the real channel store; a stand-in store-writer thread (scripts/fixtures/store-stand-writer.cjs) that
// holds or fails a file's write; every writer runs on a SHORT STATED PACE (PACED.floorMs) and every store states the stamps'
// debounce (DEB) — each wait below is one of those constants × a stated slack, never a bare wall-clock number.
// Run: node scripts/test-channel-stamps-rounds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import Module from 'node:module';
import './scratch.mjs';   // the build's §113 order: the scratch home first, after node's own
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const PACE = require(path.join(REPO, 'src/store-pace.js'));

let pass = 0, fail = 0;
const T0 = performance.now(), at = () => `[${((performance.now() - T0) / 1000).toFixed(1)} s]`;   // each leg's place in the suite's time (printed, never judged)
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n + ' ' + at()); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const ROOT = scratch('test-channel-stamps-rounds');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const STAND = SAND.path, failOn = SAND.failOn;
const DEB = 25;                      // the stamps' debounce every store here states (the hub's: the writer's 0.5 s)
const PACED = { floorMs: DEB };    // the writers' gap floor here (the hub's: store-pace's MIN_GAP_FLOOR_MS)
const AFTER_PACE_MS = DEB * 12;      // past a debounce and a gap: a write the sets asked has begun or landed
const ONE_PACE_MS = DEB * 6;         // one debounce + one gap of this suite's stated pace, with slack: a paced ask is due within it
// (m) B-360d — THE POLL STAMPS' SIDE FILE IS THE JOURNAL'S COMPACTION (the coordinator's r1319; measured at the order of
//     200 000 stamped keys: the whole side file every 120 s held the loop 265 ms p50 / 299 ms max for a few dozen moved keys):
//     (m1)–(m6), the compaction's own legs: test-channel-stamps-write.
//     (m7) A WRITE NEVER SCHEDULES THE NEXT WRITE (round wkovlam1t's MUST): steady polls over a small account write the side
//          file once, the store asks the writer once, a stray ask writes nothing. CONTROLS: one per half — red.
//     (m8) A PURGE's «done» waits for its compaction (r1556's MUST): no byte of the account's names left on disk; a failed
//          landing answers false. CONTROL: a purge that owes nothing — red.
//     (m8b)–(m8e), a purge's ONE door and «Try again» (主开发 r4642): test-channel-stamps-purge.
//     (m9) a failed flush that was never owed keeps its retry (round w5ymfrq4i). CONTROL: the owed mark dropped — red.
console.log('(m) B-360d: quiet is free — the side file is the journal\'s compaction, made in slices; a rollback reads it');
{
  const CS_FILE = path.join(REPO, 'src/channel-store.js');
  const SRC = fs.readFileSync(CS_FILE, 'utf8');
  const loadCut = (cut) => {
    if (!cut) return CS;
    const cuts = Array.isArray(cut[0]) ? cut : [cut];
    let src = SRC;
    for (const c of cuts) { if (src.split(c[0]).length !== 2) throw new Error(`(m) a CONTROL's anchor is not in src/channel-store.js once: ${c[0].slice(0, 90)}`); src = src.replace(c[0], c[1]); }
    const m = new Module(CS_FILE, null); m.filename = CS_FILE; m.paths = Module._nodeModulePaths(path.dirname(CS_FILE)); m._compile(src, CS_FILE); return m.exports;
  };
  // round wkovlam1t's MUST, the tip that was sent back: the one-slice compaction re-dirtied the writer from its own produce, and
  // produce began a compaction whenever the writer asked
  const HALF_A = ['    if (!b.inProduce) W().dirty(stampsFile', '    if (true) W().dirty(stampsFile'], HALF_B = ['    if (!stampsCompactOwed) return null;', '    if (false) return null;'];
  const NOPURGEOWE = ["    owe(stampsFile, { name: 'channels-stamps.write', produce: produceStamps, onWritten: stampsWritten, ...stampsPaceOpt() });\n    return ask;", '    return ask;'];
  const NORETRY = ['    if (!ok) { stampsDirty = true; stampsCompactOwed = true;', '    if (!ok) { stampsDirty = true;'];
  const T = Date.UTC(2026, 10, 21, 6, 0, 0);
  const jLines = (st) => { try { return fs.readFileSync(st.stamps.log, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const logBytes = (st) => { try { return fs.statSync(st.stamps.log).size; } catch { return 0; } };
  const settle = async (w, st, ms = 4000) => { const end = performance.now() + ms; while (performance.now() < end && w.pending(st.stamps.file)) await sleep(25); };

  // (m7) round wkovlam1t's MUST — A WRITE NEVER SCHEDULES THE NEXT WRITE: a small account (40 keys: its compaction is ONE slice)
  //      polled steadily for 3 s from its first stamp — the side file is written ONCE (the first compaction: there was none), the
  //      store asks the writer ONCE (a writer proxy counts the store's own asks), the journal then stays under its bound; and a
  //      writer that asks again ON ITS OWN (a stray ask with the store's own produce) writes nothing — no compaction is owed.
  //      CONTROLS, one per half (round w5ymfrq4i): (A) the one-slice compaction asks the writer again from its produce — two
  //      asks; (B) produce compacts whenever asked — the stray ask writes (more than one write).
  const steadyRun = async (tag, cut, { stray = false } = {}) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    let asks = 0, opts = null;
    const pw = new Proxy(w, { get(t, k) {
      if (k === 'dirty') return (file, o) => { if (path.basename(file) === 'poll-stamps.json') { asks++; opts = o; } return t.dirty(file, o); };
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: pw, stampsDebounceMs: DEB });
    await st.index.update(() => { for (let i = 0; i < 40; i++) st.index.entry('acct', `s${i}`, { create: true }); });
    // the first stamp asks the first compaction (there is no side file); the steady polls start once it LANDED, so every one of
    // them is a change made after it (the journal holds them, the store is dirty when the stray ask comes)
    st.stamps.set('acct/s0', { lastPollAt: T - 1 });
    for (let k = 0; k < 200 && (st.stamps.stats().writes || 0) < 1; k++) await sleep(DEB);
    const end = performance.now() + DEB * 12; let n = 0;   // sixteen stated paces: the sent-back tip writes again within each few
    while (performance.now() < end) { st.stamps.set(`acct/s${n % 40}`, { lastPollAt: T + n }); n++; await sleep(10); }
    await sleep(ONE_PACE_MS); await settle(w, st);
    if (stray && opts) { w.dirty(st.stamps.file, { ...opts, exclusive: false }); await sleep(ONE_PACE_MS); await settle(w, st); }   // a writer asking on its own, with the store's own produce (the first ask's exclusive create — B-f276 1b, the side file missing then — is not the stray's: the file is there now)
    const r = { polls: n, writes: st.stamps.stats().writes, asks, journal: jLines(st) };
    w.stop();
    return r;
  };
  const sw = await steadyRun('steady', null, { stray: true });
  ok(sw.writes === 1 && sw.asks === 1 && sw.journal > 0, `(m7) A WRITE NEVER SCHEDULES THE NEXT WRITE: ${sw.polls} polls over 40 keys in twelve stated paces after the first compaction and a stray ask of the writer — the side file written ${sw.writes} time (its first compaction), the store asked the writer ${sw.asks} time, the journal holding the rest (${sw.journal} lines under its bound)`, sw);
  const swa = await steadyRun('steady-ca', HALF_A);
  ok(swa.asks > 1, `(m7) CONTROL (A): the one-slice compaction asks the writer again from its own produce — ${swa.asks} asks — red`, swa);
  const swb = await steadyRun('steady-cb', HALF_B, { stray: true });
  ok(swb.writes > 1, `(m7) CONTROL (B): produce compacts whenever the writer asks — the stray ask writes (${swb.writes} writes) — red`, swb);

  // (m8) THE COORDINATOR'S MUST (r1556): A PURGED ACCOUNT's STAMPS LEAVE THE DISK BEFORE ITS REMOVAL SAYS DONE — purgeAccount owes
  //      the compaction at once and answers `stamps`, resolved when one made after it lands: then no byte of the account's names
  //      is in the side file or its journal, the other account's stamps kept; a failed landing answers false (said, never done).
  //      CONTROL: a purge that owes nothing — the names stay on the disk until the next bound — red.
  const purgeRun = async (tag, cut, { fail = false } = {}) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    await st.index.update(() => { for (let i = 0; i < 30; i++) { st.index.entry('gone', `g${i}`, { create: true }); st.index.entry('keep', `k${i}`, { create: true }); } });
    for (let i = 0; i < 30; i++) { st.stamps.set(`gone/g${i}`, { lastPollAt: T + i }); st.stamps.set(`keep/k${i}`, { lastPollAt: T + i }); }
    st.stamps.flush();   // a side file that holds both accounts
    for (let i = 0; i < 5; i++) st.stamps.set(`gone/g${i}`, { lastPollAt: T + 100 + i });   // and journal lines of the account
    if (fail) failOn('poll-stamps.json', true);
    const pr = await st.purgeAccount('gone');   // the release's purge is async (B-92fc): its answer carries `stamps`
    const landed = await Promise.race([pr.stamps, sleep(DEB * 40).then(() => 'timeout')]);   // forty stated paces: a purge's write is urgent and lands in the first
    if (fail) failOn('poll-stamps.json', false);
    await settle(w, st);
    const text = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    const side = text(st.stamps.file), jl = text(st.stamps.log);
    const r = { landed, inSide: side.includes('"gone/'), inJournal: jl.includes('"gone/'), keepOnDisk: side.includes('"keep/k3"'), keep: (st.stamps.get('keep/k3') || {}).lastPollAt === T + 3 };
    w.stop();
    return r;
  };
  const pg = await purgeRun('purge', null);
  ok(pg.landed === true && !pg.inSide && !pg.inJournal && pg.keepOnDisk && pg.keep, `(m8) A PURGE's «done» waits for its compaction: it landed (${pg.landed}) — no byte of the purged account's names in the side file (${pg.inSide}) or its journal (${pg.inJournal}); the other account kept on disk`, pg);
  const pgf = await purgeRun('purge-fail', null, { fail: true });
  ok(pgf.landed === false, `(m8) a purge whose compaction's write FAILS answers false (${pgf.landed}): the caller says it and never «done»`, pgf);
  const pgc = await purgeRun('purge-c', NOPURGEOWE);
  ok(pgc.inSide, `(m8) CONTROL: a purge that owes nothing — «done» at once (${pgc.landed}) with the names still in the side file (${pgc.inSide}) — red`, pgc);
  { const CHA = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
    ok(/try \{ if \(r && r\.stamps\) stampsClean = \(await r\.stamps\) !== false; \} catch \{ stampsClean = false; \}/.test(CHA) && /journalClean = journalClean && stampsClean;/.test(CHA), '(m8) the removal awaits the stamps\' landing before its «done» (src/server/channels-auth.js purgeIfDeclared: beside the index journal\'s; one that could not land is said and answered as journalClean)'); }

  ok(CS.STAMPS_FAIL_BEHIND_MS === PACE.MIN_GAP_CEIL_MS, `(m9) STAMPS_FAIL_BEHIND_MS (${CS.STAMPS_FAIL_BEHIND_MS}) IS the writer's longest paced gap, store-pace's MIN_GAP_CEIL_MS (${PACE.MIN_GAP_CEIL_MS}) — one number in two files (the SHARED store imports no pace module)`);

  // (m9) ROUND w5ymfrq4i: A FAILED WRITE THAT WAS NEVER OWED (a close's flush, a suite's flush) KEEPS ITS RETRY — the landing's failure
  //      branch keeps the compaction owed: the writer's paced retry writes the side file once the storage heals. CONTROL: the
  //      failure branch leaves it unowed — the retry settles «equal to the disk», the side file stays behind — red.
  const retryRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    await st.index.update(() => { for (let i = 0; i < 10; i++) st.index.entry('acct', `r${i}`, { create: true }); });
    for (let i = 0; i < 10; i++) st.stamps.set(`acct/r${i}`, { lastPollAt: T + i });
    await sleep(AFTER_PACE_MS); await settle(w, st);   // the first compaction (there was no side file)
    for (let i = 0; i < 10; i++) st.stamps.set(`acct/r${i}`, { lastPollAt: T + 500 + i });
    failOn('poll-stamps.json', true);
    const flushed = st.stamps.flush();   // a synchronous flush that was never owed — it FAILS
    failOn('poll-stamps.json', false);
    // the writer retries a failed write after its retry floor (1 s): wait until that retry has RUN — nothing of the file pending
    // any more (it wrote, or it settled «equal to the disk») — bounded by two floors; then read what the disk holds
    const end = performance.now() + PACE.RETRY_FLOOR_MS * 2;
    await sleep(PACE.RETRY_FLOOR_MS / 2);
    while (performance.now() < end && w.pending(st.stamps.file)) await sleep(DEB);
    let side = {};
    try { side = JSON.parse(fs.readFileSync(st.stamps.file, 'utf8')).stamps; } catch { side = {}; }
    const r = { flushed, carried: Array.isArray(side['acct/r9']) && side['acct/r9'][0] === T + 509 };
    w.stop();
    return r;
  };
  const rt = await retryRun('retry', null);
  ok(rt.flushed === false && rt.carried, `(m9) a failed flush that was never owed keeps its retry: the writer's retry wrote the side file with the newest stamps once the storage healed (${rt.carried})`, rt);
  const rtc = await retryRun('retry-c', NORETRY);
  ok(rtc.flushed === false && !rtc.carried, '(m9) CONTROL: the failure branch leaves the compaction unowed — the retry settles «equal to the disk», the side file stays behind — red', rtc);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
