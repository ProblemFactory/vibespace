#!/usr/bin/env node
// test-channel-stamps-purge — B-360d (主开发 r4642 / r4646, line 1046's FULL store round): A PURGE's ONE DOOR on the poll stamps.
// A removal's «done» for the stamps is true ONLY once bytes MADE after its purge's ask have LANDED; a purge owes its compaction
// whenever a stamps file is on disk (the side file or the journal), not only when the account's keys are still in memory.
// While the storage stays broken the purge never answers true: the removal says its owed words (journalOwed) and the store
// writer retries the compaction on its own ladder (the release's — no clock of this unit's). Each leg with its RED control.
// FAST, in process — the real channel store; a stand-in store-writer thread (scripts/fixtures/store-stand-writer.cjs) that
// holds or fails a file's write; every writer runs on a SHORT STATED PACE (PACED.floorMs) and every store states the stamps'
// debounce (DEB) — each wait below is on a FACT (the writer's own stats: a write on its thread, a failure, a landing), bounded
// by BOUND_MS with a named HARNESS line at its expiry, never a bare wall-clock judgment.
//   (m8b) MUST 2: the removal's rows out of the index FIRST, a compaction begun before the purge drops the account's keys from
//         memory and its write FAILS (placed): the purge never answers true while the names are on disk; once the storage
//         heals its own compaction lands with none of them. CONTROL: a purge that found no key owes nothing (the tip's) — red.
//   (m8c) its in-flight half: a compaction IN FLIGHT at the purge (its bytes made with the account's rows: they hold its names)
//         lands, and the purge's OWN compaction still follows it; only that landing answers true. CONTROL: the purge that does
//         not ask its compaction at once (stampsCompactNow) — the landing before it clears the owed mark, nothing follows — red.
//   (m8d) (2) A FAMILY HELD BETWEEN A PURGE's ASK AND THE WRITER's TURN answers the purge false: the index's first write held
//         on the stand-in thread, the purge's compaction asked behind it, an index.json APPEARS meanwhile (its exclusive create
//         meets it, the index family held) — the side file's turn writes nothing. CONTROL: the writer's settle alone as the
//         answer (the tip's) — true with nothing written — red.
//   (m8f) (r4676; r4666: the compaction STAYS owed) THE WRITER's THREAD LOST IN FLIGHT with the purge's compaction: its requeue
//         asks the store again with no answer for the handed bytes — they are made again and land on the restarted thread; the
//         side file holds none of the names and the purge answers true. CONTROL: the release's line — produce answers «equal to
//         the disk» (nothing set since), the compaction no longer owed: the names stay and the purge answers false — red.
//   (m8g) (r4892 (3)) THE OTHER LOSS: the thread renamed the purge's side file and died before its answer — the bytes are made again and
//         land, the purge answers true. CONTROL: the release's line — the purge never hears its landing (false) — red.
//   (m8e) (r4646 (2)) THE COST: for an account with NO stamps the purge's compaction is one write more than the tip's — its
//         bytes and its time on the writer's thread printed over the largest stand-in these suites build (1000 stamped keys);
//         ONE write a removal, never one a row.
//   (1) «Try again» waits for the stamps as the first press does (the first press's own pin: test-channel-stamps-rounds (m8)) —
//       pinned, with its red.
// Run: node scripts/test-channel-stamps-purge.mjs
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

let pass = 0, fail = 0;
const T0 = performance.now(), at = () => `[${((performance.now() - T0) / 1000).toFixed(1)} s]`;   // each leg's place in the suite's time (printed, never judged)
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n + ' ' + at()); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const ROOT = scratch('test-channel-stamps-purge');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const STAND = SAND.path, failOn = SAND.failOn;
const DEB = 25;                      // the stamps' debounce every store here states (the hub's: the writer's 0.5 s)
const PACED = { floorMs: DEB };    // the writers' gap floor here (the hub's: store-pace's MIN_GAP_FLOOR_MS)
const ONE_PACE_MS = DEB * 6;         // one debounce + one gap of this suite's stated pace, with slack: a paced ask is due within it
console.log('(m8b–m8e) B-360d: a purge\'s ONE door — «done» only once a compaction made after it has landed');
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
  const T = Date.UTC(2026, 10, 21, 6, 0, 0);
  const logBytes = (st) => { try { return fs.statSync(st.stamps.log).size; } catch { return 0; } };
  const settle = async (w, st, ms = 4000) => { const end = performance.now() + ms; while (performance.now() < end && w.pending(st.stamps.file)) await sleep(25); };
  const TICK_MS = 10;
  const flying = (w, f) => !!(w.stats().find((s) => s.file === f) || {}).inflight;   // the writer's own fact: that file's write on its thread now
  { const CHA = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8'), PANEL = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf8');
    const AGAIN = /async function purgeAgain\(adapterId\) \{[\s\S]{0,1800}?const r = await store\.purgeAccount\(id\);\n\s*if \(r && r\.refused\)[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*let stampsClean = true;\n\s*try \{ if \(r && r\.stamps\) stampsClean = \(await r\.stamps\) !== false; \} catch \{ stampsClean = false; \}[\s\S]{0,1500}?\.\.\.\(stampsClean \? \{\} : r && r\.stampsHeld \? \{ stampsHeld: r\.stampsHeld \} : \{ journalOwed: true \}\)/;
    const pressPin = (a, p) => AGAIN.test(a) && p.includes("else if (r.done && r.journalOwed) showToast(t('Removed \"{name}\" — some of its saved data is not erased from disk yet; it is erased when the disk takes the next write'");
    const cutOnce = (src, a, b) => { const parts = src.split(a); if (parts.length !== 2) throw new Error(`(1) the press's CONTROL anchor is not in src/server/channels-auth.js once: ${a.slice(0, 80)}`); return parts.join(b); };
    ok(pressPin(CHA, PANEL), '(1) r4642 (1): «Try again» (src/server/channels-auth.js purgeAgain) waits for the stamps\' landing as the first press does and answers journalOwed when it could not land; the panel says it in the first removal\'s own words, never «removed from disk»');
    ok(!pressPin(cutOnce(CHA, '    try { if (r && r.stamps) stampsClean = (await r.stamps) !== false; } catch { stampsClean = false; }\n    if (!stampsClean) log.warn(`[channels] ${id}: tried again', '    if (!stampsClean) log.warn(`[channels] ${id}: tried again'), PANEL), '(1) CONTROL: «Try again» without its wait for the stamps — the pin above would go red');
  }

  // (m8b) r4642 MUST 2 — a compaction begun before the purge, its write failed: no «true» while the names are on disk
  const NOKEYNOOWE = ['    const stampsGone = !(purgedStamps || stampsOnDisk) ?', '    const stampsGone = !purgedStamps ?'];   // stale-pins: kept (the RED control restores the tip's purge condition)
  const NOCOMPACTNOW = ['    stampSeq++; stampsDirty = true; stampsCompactNow = true; stampsCompactOwed = true;', '    stampSeq++; stampsDirty = true; stampsCompactOwed = true;'];
  const HOLD_MS = 400, BOUND_MS = 10000;   // the stand-in's hold of the side file's write; a fact not seen within BOUND_MS is a HARNESS line
  const text = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const statOf = (w, f) => w.stats().find((s) => s.file === f) || {};
  const twoAccounts = async (cut) => {
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    return { w, mk: async (dir) => {
      const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB, stampsBound: { min: 200, max: 200 } });
      await st.index.update(() => { for (let i = 0; i < 30; i++) { st.index.entry('gone', `g${i}`, { create: true }); st.index.entry('keep', `k${i}`, { create: true }); } });
      for (let i = 0; i < 30; i++) { st.stamps.set(`gone/g${i}`, { lastPollAt: T + i }); st.stamps.set(`keep/k${i}`, { lastPollAt: T + i }); }
      st.stamps.flush();   // a side file that holds both accounts, the journal folded
      return st;
    } };
  };
  const onDiskOf = (st) => ({ inSide: text(st.stamps.file).includes('"gone/'), inJournal: text(st.stamps.log).includes('"gone/'), keepOnDisk: text(st.stamps.file).includes('"keep/k3"') });
  const dropRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const { w, mk } = await twoAccounts(cut); const st = await mk(dir);
    let r = null;
    await st.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (k.startsWith('gone/')) delete ix.conversations[k]; });   // the removal's road: its rows out FIRST
    failOn('poll-stamps.json', true);   // PLACED: the storage refuses the side file's write
    try {
      for (let n = 0; logBytes(st) <= 200; n++) st.stamps.set(`keep/k${n % 30}`, { lastPollAt: T + 1000 + n });   // the other account's polls pass the bound: a compaction owed
      const end = performance.now() + BOUND_MS;
      while (!(statOf(w, st.stamps.file).failures >= 1) && performance.now() < end) await sleep(DEB);
      const failed = statOf(w, st.stamps.file).failures >= 1;
      if (!failed) console.error(`  HARNESS (m8b ${tag}): the compaction's write was never seen failing within ${BOUND_MS} ms`);
      const dropped = !(st.stamps.get('gone/g0') || {}).lastPollAt, before = text(st.stamps.file).includes('"gone/');   // stamps.get answers {} for a key with none   // its keys left memory with that compaction; its names still on disk
      const c0 = st.stamps.stats().compactions;
      const pr = await st.purgeAccount('gone');
      const first = await Promise.race([pr.stamps, sleep(ONE_PACE_MS).then(() => 'pending')]);
      const namesAtFirst = text(st.stamps.file).includes('"gone/');
      failOn('poll-stamps.json', false);   // the storage heals: the writer's retry lands
      const last = first === 'pending' ? await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]) : first;
      const end2 = performance.now() + BOUND_MS;
      while ((st.stamps.stats().compactions <= c0 || w.pending(st.stamps.file)) && performance.now() < end2) await sleep(DEB);
      if (st.stamps.stats().compactions <= c0) console.error(`  HARNESS (m8b ${tag}): no compaction landed within ${BOUND_MS} ms of the heal`);
      r = { failed, dropped, before, first, namesAtFirst, last, landedAfter: st.stamps.stats().compactions - c0, ...onDiskOf(st) };
    } finally { failOn('poll-stamps.json', false); }
    w.stop();
    return r;
  };
  const dr = await dropRun('drop', null);
  ok(dr.failed && dr.dropped && dr.before && dr.first !== true && dr.landedAfter >= 1 && !dr.inSide && !dr.inJournal && dr.keepOnDisk,
    `(m8b) MUST 2: the rows out first, a compaction before the purge dropped the account's keys (${dr.dropped}) and its write FAILED (${dr.failed}), its names on disk (${dr.before}) — the purge's first answer ${dr.first} (never true), after the heal ${dr.last}; then no byte of the names in the side file (${dr.inSide}) or the journal (${dr.inJournal}), the other account kept`, dr);
  const drc = await dropRun('drop-c', NOKEYNOOWE);
  ok(drc.dropped && drc.first === true && drc.namesAtFirst, `(m8b) CONTROL: a purge that found no key owes nothing — «done» at once (${drc.first}) with the names still in the side file (${drc.namesAtFirst}) — red`, drc);

  // (m8c) its in-flight half — the purge's own compaction follows the landing of bytes made before it
  const flightRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const { w, mk } = await twoAccounts(cut); const st = await mk(dir);
    let r = null;
    const c0 = st.stamps.stats().compactions;   // the flush's
    SAND.hold('poll-stamps.json', HOLD_MS);
    try {
      for (let n = 0; logBytes(st) <= 200; n++) st.stamps.set(`keep/k${n % 30}`, { lastPollAt: T + 1000 + n });   // a compaction owed: its bytes made with both accounts' rows
      const end = performance.now() + BOUND_MS;
      while (!statOf(w, st.stamps.file).inflight && performance.now() < end) await sleep(TICK_MS);
      const p = st.purgeAccount('gone');
      const askedInFlight = !!statOf(w, st.stamps.file).inflight;   // the purge's ask (synchronous at its call) during that write's flight
      if (!askedInFlight) console.error(`  HARNESS (m8c ${tag}): the side file's write was never seen on the thread within ${BOUND_MS} ms`);
      const pr = await p;
      const landed = await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
      await settle(w, st);
      r = { askedInFlight, landed, compactions: st.stamps.stats().compactions - c0, ...onDiskOf(st) };
    } finally { SAND.unhold('poll-stamps.json'); }
    w.stop();
    return r;
  };
  const fl = await flightRun('flight', null);
  ok(fl.askedInFlight && fl.landed === true && fl.compactions === 2 && !fl.inSide && !fl.inJournal && fl.keepOnDisk,
    `(m8c) MUST 2's in-flight half: the purge asked during a compaction's flight (${fl.askedInFlight}); that one landed, the purge's OWN followed (${fl.compactions} compactions) and only then it answered ${fl.landed} — no byte of the names in the side file (${fl.inSide}) or the journal (${fl.inJournal}), the other account kept`, fl);
  const flc = await flightRun('flight-c', NOCOMPACTNOW);
  ok(flc.askedInFlight && flc.inSide && flc.landed !== true, `(m8c) CONTROL: the purge that does not ask its compaction at once — the landing before it clears the owed mark and nothing follows (${flc.compactions} compaction(s)), its names left in the side file (${flc.inSide}), it answered ${flc.landed} — red`, flc);

  // (m8d) A FAMILY HELD BETWEEN A PURGE's ASK AND THE WRITER's TURN (r4642 (2))
  const NOLANDDOOR = ['    return W().durable(stampsFile).then((ok) => ok !== false && stampsLandedAfter >= ask, () => false);', '    return W().durable(stampsFile);'];   // stale-pins: kept (the RED control restores the tip's answer)
  const heldRun = async (tag, cut) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });   // a fresh folder: the index read missing (its first write the exclusive create)
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    const ixFile = path.join(dir, 'index.json');
    let r = null;
    SAND.hold('index.json', HOLD_MS);
    try {
      await st.index.update(() => { for (let i = 0; i < 10; i++) { st.index.entry('gone', `g${i}`, { create: true }); st.index.entry('keep', `k${i}`, { create: true }); } });
      for (let i = 0; i < 10; i++) { st.stamps.set(`gone/g${i}`, { lastPollAt: T + i }); st.stamps.set(`keep/k${i}`, { lastPollAt: T + i }); }
      const end = performance.now() + BOUND_MS;
      while (!flying(w, ixFile) && performance.now() < end) await sleep(TICK_MS);
      const inFlight = flying(w, ixFile);
      if (!inFlight) console.error(`  HARNESS (m8d ${tag}): the index's first write was never seen on the thread within ${BOUND_MS} ms`);
      fs.writeFileSync(ixFile, '{"v":1,"conversations":{}}\n');   // the file that APPEARED (a late mount's) — its exclusive create will meet it
      const p = st.purgeAccount('gone');
      const askedInFlight = flying(w, ixFile);   // the purge's ask (synchronous at its call) inside the index's flight
      const pr = await p;
      const stamps = await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
      const why = w.whyNotDurable(ixFile);
      r = { inFlight, askedInFlight, stamps, appeared: !!(why && why.code === 'EEXIST') };
    } finally { SAND.unhold('index.json'); }
    w.stop();
    return r;
  };
  const hd = await heldRun('held', null);
  ok(hd.inFlight && hd.askedInFlight && hd.appeared && hd.stamps === false, `(m8d) A FAMILY HELD BETWEEN A PURGE's ASK AND THE WRITER's TURN: the purge asked during the index's held first write (${hd.askedInFlight}), the index appeared (${hd.appeared}) and its family is held — the purge answers ${hd.stamps}, never true with nothing written`, hd);
  const hdc = await heldRun('held-c', NOLANDDOOR);
  ok(hdc.askedInFlight && hdc.appeared && hdc.stamps === true, `(m8d) CONTROL: the writer's settle alone as the answer — the purge answers ${hdc.stamps} with nothing written — red`, hdc);


  // (m8f) r4676: the writer's thread lost in flight — the handed bytes are made again
  const NOREMAKE = ['    if (!stampsDirty && !(stampsCompactOwed && stampsHanded)) { stampsCompactOwed = false; return null; }\n    if (!stampsCompactOwed) return null;', '    if (!stampsDirty) { stampsCompactOwed = false; return null; }\n    if (!stampsCompactOwed) return null;'];   // the paced branch (the line after it is its own)   // stale-pins: kept (the RED control restores the release's line)
  const lostRun = async (tag, cut, { after = false } = {}) => {
    const dir = path.join(ROOT, `m-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const said = [];
    const log = { log() { }, info() { }, warn: (m) => said.push(String(m)), error: (m) => said.push(String(m)) };
    { // a first life writes both accounts' rows and stamps and closes: the side file is THERE at the next start (a hub's case — a store
      // that read it missing writes own-only for its life, and the stand-in thread hands back no own numbers to a restarted one)
      const w0 = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
      const s0 = CS.createChannelStore({ dir, log: quiet, writer: w0, stampsDebounceMs: DEB });
      await s0.index.update(() => { for (let i = 0; i < 30; i++) { s0.index.entry('gone', `g${i}`, { create: true }); s0.index.entry('keep', `k${i}`, { create: true }); } });
      for (let i = 0; i < 30; i++) { s0.stamps.set(`gone/g${i}`, { lastPollAt: T + i }); s0.stamps.set(`keep/k${i}`, { lastPollAt: T + i }); }
      s0.close(); w0.stop();
    }
    const w = SW.create({ log, workerPath: STAND, pace: PACED });
    const st = loadCut(cut).createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });   // the side file read at the start
    if (after) SAND.dieAfter('poll-stamps.json'); else SAND.die('poll-stamps.json');   // PLACED: the thread exits as the side file's next write reaches it — or right after it renamed the file, before its answer (once)
    let r = null;
    try {
      const pr = await st.purgeAccount('gone');
      const answer = await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
      const end = performance.now() + BOUND_MS;
      while (w.pending(st.stamps.file) && performance.now() < end) await sleep(DEB);
      const lost = said.some((m) => /stopped \(it exited/.test(m));
      if (!lost) console.error(`  HARNESS (m8f ${tag}): the writer never said its thread stopped — the placed loss did not happen`);
      const sw = statOf(w, st.stamps.file), ss = st.stamps.stats();
      r = { lost, answer, ...onDiskOf(st), writes: sw.writes, failures: sw.failures, why: w.whyNotDurable(st.stamps.file), compactions: ss.compactions, said: said.filter((m) => /store-write/.test(m)).map((m) => m.slice(0, 160)) };
    } finally { for (const f of ['die-poll-stamps.json', 'dieafter-poll-stamps.json']) { try { fs.unlinkSync(path.join(ROOT, 'stand', f)); } catch { } } }
    w.stop();
    return r;
  };
  const ls = await lostRun('lost', null);
  ok(ls.lost && ls.answer === true && !ls.inSide && !ls.inJournal && ls.keepOnDisk, `(m8f) THE WRITER's THREAD LOST IN FLIGHT with the purge's compaction (${ls.lost}): the handed bytes made again and landed on the restarted thread — no byte of the names in the side file (${ls.inSide}) or the journal (${ls.inJournal}), the other account kept; the purge answered ${ls.answer}`, ls);
  const lsc = await lostRun('lost-c', NOREMAKE);
  ok(lsc.lost && lsc.inSide && lsc.answer === false, `(m8f) CONTROL: the release's line — the requeued ask answered «equal to the disk», the compaction no longer owed: the names stay in the side file (${lsc.inSide}) and the purge answers ${lsc.answer} — red`, lsc);

  // (m8g) r4892 (3): the OTHER loss — the thread RENAMED the purge's side file, then died before its answer
  const la = await lostRun('lost-after', null, { after: true });
  ok(la.lost && la.answer === true && !la.inSide && !la.inJournal && la.keepOnDisk, `(m8g) THE THREAD DIED AFTER ITS RENAME, before its answer (${la.lost}): the bytes made again and landed — no byte of the names on disk (${la.inSide}, ${la.inJournal}), the other account kept; the purge answered ${la.answer}`, la);
  const lac = await lostRun('lost-after-c', NOREMAKE, { after: true });
  ok(lac.lost && lac.answer === false, `(m8g) CONTROL: the release's line — the requeued ask answered «equal to the disk»: the purge never hears its landing (${lac.answer}) — red`, lac);

  // (m8e) THE COST (主开发 r4646 (2)) — one write a removal, never one a row
  const costRun = async () => {
    const dir = path.join(ROOT, 'm-cost'); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND, pace: PACED });
    const st = CS.createChannelStore({ dir, log: quiet, writer: w, stampsDebounceMs: DEB });
    await st.index.update(() => { for (let i = 0; i < 1000; i++) st.index.entry('acct', `t${i}`, { create: true }); for (let i = 0; i < 200; i++) st.index.entry('nost', `n${i}`, { create: true }); });
    for (let i = 0; i < 1000; i++) st.stamps.set(`acct/t${i}`, { lastPollAt: T + i });
    st.stamps.flush();   // the largest stand-in these suites build: a side file of 1000 stamped keys; the account 'nost' has 200 rows, no stamp
    const s0 = statOf(w, st.stamps.file), c0 = st.stamps.stats().compactions;
    const pr = await st.purgeAccount('nost');
    const landed = await Promise.race([pr.stamps, sleep(BOUND_MS).then(() => 'timeout')]);
    await settle(w, st);
    const s1 = statOf(w, st.stamps.file);
    const r = { landed, rows: 200, writes: (s1.writes || 0) - (s0.writes || 0), compactions: st.stamps.stats().compactions - c0, bytes: s1.bytes, ms: s1.lastMs, sideBytes: (() => { try { return fs.statSync(st.stamps.file).size; } catch { return -1; } })() };
    w.stop();
    return r;
  };
  const cs = await costRun();
  ok(cs.landed === true && cs.writes === 1 && cs.compactions === 1, `(m8e) THE COST: a removal of an account with NO stamps (${cs.rows} rows) over 1000 stamped keys of another — ONE side-file write more than the tip's (${cs.writes}): ${cs.bytes} B, ${cs.ms} ms on the writer's thread (printed, never judged) — one a removal, never one a row`, cs);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
