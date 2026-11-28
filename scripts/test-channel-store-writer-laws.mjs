#!/usr/bin/env node
// test-channel-store-writer-laws — channel-store-off-loop, CURE ROUND 1 (the coordinator's three must-fixes, each a LAW;
// the shapes of commit 1 stay in test-channel-store-loop-free). FAST, in process — the real store, the real engine, the
// real writer thread or a stand-in thread (scripts/fixtures/store-stand-writer.cjs) that holds or fails a file's write:
//   (g) C1 — a warning that a sign-in did not reach the disk is withdrawn ONLY by a write that landed: a rotated sign-in's
//       durable write fails (the storage refusing) ⇒ the For-you item; a TIMER pass then succeeds on the in-memory token
//       (its one update is paced): the item stays while adapters.json lacks the sign-in, and is withdrawn once it holds it.
//   (h) C2 — the poll-stamps journal stays BOUNDED: steady stamps across several snapshots, each snapshot's write in
//       flight while stamps keep coming — after a snapshot lands the journal holds at most the stamps set since its bytes
//       were made; a kill keeps every newest stamp.
//   (i) C3 — the gate sees a door that WAITS: the WRITER stalled, the doors driven — the main loop stays on time (a door
//       given a synchronous wait is red here; census ② of test-store-write-census is red on it by name).
//   (j) the writer makes a missing parent directory ONLY for a write that asks (the people door) — any other store whose
//       directory is gone fails ENOENT, never a silently re-created directory.
//   (k) test-channel-store ⑭'s two ORDER laws on the writer's thread: a healed stamp is in the journal before the index
//       that drops it (a SIGKILL right after the writer's index write keeps all 300); the journal folds only on a side-file
//       write that LANDED (a failed one keeps every line). Each with its control.
// Run: node scripts/test-channel-store-writer-laws.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import Module from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const ROOT = scratch('csol-writer-laws');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const TICK_MS = 10;
/** the worst lateness of a TICK_MS interval timer between start and stop */
function lateMeter() { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; }
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const STAND = SAND.path, hold = SAND.hold, unhold = SAND.unhold, failOn = SAND.failOn;
const hasRec = (file, id, field, v) => { const j = readJson(file); return !!(j && (j.adapters || []).some((x) => x.id === id && x[field] === v)); };

// (g) C1 — A WARNING THAT A SIGN-IN DID NOT REACH THE DISK IS WITHDRAWN ONLY BY A WRITE THAT LANDED. The real engine and
//     the real writer thread; adapters.json's write made to FAIL by a directory standing at the writer's temp path
//     (`<file>.tmp-<pid>-w` — EISDIR, the storage refusing). A rotated sign-in's durable write fails ⇒ the For-you item is
//     filed; a pass then SUCCEEDS on the in-memory token (its update is paced): the item must stay while the file has not
//     landed; once the storage takes writes again, the item is withdrawn only when adapters.json holds the token.
console.log('(g) C1: the unsaved-sign-in warning is withdrawn only by a write that landed (the writer failing, then healed)');
{
  const dataDir = path.join(ROOT, 'g'), dir = path.join(dataDir, 'channels'), ROT = path.join(ROOT, 'g-rotate');
  const todos = new Map(); let seq = 0;
  const userTodos = { add(key, it) { const id = 'g' + (++seq); todos.set(id, { ...it, id, sessionKey: key, status: 'open' }); return { id }; }, get(id) { return todos.get(id) || null; }, setStatus(id, status) { const t = todos.get(id); if (t) t.status = status; return t || null; } };
  process.env.VIBESPACE_CHANNELS_FAKE_ROTATE = ROT;   // src/channels/fake.js: a vendor that rotates its sign-in at a pass
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, log: quiet, userTodos });
  await eng.pass('fake-poll', { force: true });
  const unsaved = () => [...todos.values()].find((t) => /could not be saved to disk/.test(t.text || ''));
  const block = path.join(dir, `adapters.json.tmp-${process.pid}-w`);
  fs.mkdirSync(block);   // THE STORAGE FAILS: every write of adapters.json is refused (EISDIR) until it is removed
  fs.writeFileSync(ROT, 'rotated-g');   // the vendor rotates the refresh token at the next pass
  const p1 = await eng.pass('fake-poll');   // a TIMER pass: its sign-in check rotates the token
  const filed = unsaved();
  const liveEnc = (eng.store.adapters.live().adapters.find((x) => x.id === 'fake-poll').auth || {}).tokenEnc;
  ok(!!filed && filed.status === 'open' && !!liveEnc, `(g1) the rotated sign-in's durable write FAILED ⇒ the For-you item is filed (the process keeps the new token in memory; the pass ${p1 && p1.ok ? 'went on' : 'failed'})`, { p1: p1 && { ok: p1.ok, why: p1.why }, filed: !!filed, liveEnc: !!liveEnc });
  const p2 = await eng.pass('fake-poll');   // a TIMER pass (no discovery due) that SUCCEEDS on the in-memory token — its one update is the PACED stamp
  await sleep(300);
  const diskEnc1 = (((readJson(path.join(dir, 'adapters.json')) || {}).adapters || []).find((x) => x.id === 'fake-poll') || {}).auth;
  const g2open = !!filed && filed.status === 'open', g2disk = !!(diskEnc1 && diskEnc1.tokenEnc === liveEnc);
  ok(!!(p2 && p2.ok) && gateOf(g2open) && !g2disk, `(g2) a pass that SUCCEEDED on the in-memory token (ok ${!!(p2 && p2.ok)}) does NOT withdraw it while adapters.json still lacks the sign-in (item ${filed ? filed.status : 'none'}; the file holds the new token: ${g2disk})`, { p2: p2 && { ok: p2.ok, why: p2.why }, status: filed && filed.status, g2disk });
  fs.rmdirSync(block);   // the storage takes writes again
  await eng.pass('fake-poll');
  let landedAt = null, doneAt = null; const t0 = performance.now();
  for (let k = 0; k < 400 && !(landedAt !== null && doneAt !== null); k++) {
    const d = (((readJson(path.join(dir, 'adapters.json')) || {}).adapters || []).find((x) => x.id === 'fake-poll') || {}).auth;
    if (landedAt === null && d && d.tokenEnc === liveEnc) landedAt = Math.round(performance.now() - t0);
    if (doneAt === null && filed && filed.status === 'done') doneAt = Math.round(performance.now() - t0);
    await sleep(25);
  }
  ok(landedAt !== null && doneAt !== null && doneAt >= landedAt, `(g3) once the storage heals, the item is withdrawn — and only once adapters.json holds the sign-in (on disk at +${landedAt} ms, withdrawn at +${doneAt} ms)`, { landedAt, doneAt });
  eng.stop(); delete process.env.VIBESPACE_CHANNELS_FAKE_ROTATE;
}

// (h) C2 — THE STAMPS JOURNAL STAYS BOUNDED: steady stamps across several snapshots, each snapshot's write in flight
//     (a stand-in writer holds it): after a snapshot lands the journal holds at most the stamps set since its bytes
//     were made — so it stays bounded by one period's stamps; a kill keeps every newest stamp.
console.log('(h) C2: steady stamps across several snapshots — the journal stays bounded by one period\'s stamps');
{
  const dir = path.join(ROOT, 'h'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND });
  // B-360d: the side file is the journal's COMPACTION — a 200-byte bound here makes one every few stamps (was a 50 ms timer)
  const st = CS.createChannelStore({ dir, log: quiet, writer: w, stampsBound: { min: 200, max: 200 } });
  const KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  await st.index.update(() => { for (const c of KEYS) st.index.entry('acct', c, { create: true }); });
  hold('poll-stamps.json', 150);   // each snapshot's write in flight 150 ms: stamps keep coming during it
  const lines = () => { try { return fs.readFileSync(st.stamps.log, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const last = {}; let n = 0, worst = 0;
  const writes = () => (st.stamps.stats() || {}).writes || 0, writes0 = writes(), atLanding = [];
  const tEnd = performance.now() + 2400;
  while (performance.now() < tEnd) {
    const w0 = writes();
    const k = `acct/${KEYS[n % KEYS.length]}`; st.stamps.set(k, { lastPollAt: 1000 + n }); last[k] = 1000 + n; n++;
    worst = Math.max(worst, lines()); await sleep(12);
    if (writes() > w0) atLanding.push(lines());   // a snapshot landed during this sleep: what the journal holds now
  }
  const snaps = writes() - writes0, atEnd = lines();
  // THE LAW, per landing: at most the keys set since the snapshot's bytes were made (≤ the ${KEYS.length} keys) + the
  // few stamps appended between the landing and this read
  ok(snaps >= 2 && atLanding.length >= 2 && gateOf(atLanding.every((x) => x <= KEYS.length + 4)) && atEnd < n / 2, `(h1) ${n} stamps across ${snaps} snapshot(s), each written while stamps kept coming: right after each landing the journal held ${JSON.stringify(atLanding)} line(s) (≤ ${KEYS.length} keys + the stamps since) — bounded by one period's stamps (worst ${worst}, at the end ${atEnd}), never all ${n}`, { n, snaps, atLanding, worst, atEnd });
  unhold('poll-stamps.json');
  for (let k = 0; k < 400 && w.pending(st.stamps.file); k++) await sleep(25);   // a compaction in flight lands
  st.stamps.flush();   // B-360d: the journal under its bound stays the record — the suite's synchronous flush writes the last snapshot
  for (let k = 0; k < 40 && lines() > 0; k++) await sleep(25);
  ok(lines() === 0, `(h2) a snapshot that lands with no stamp set after its bytes leaves the journal EMPTY (${lines()} line(s))`, { left: lines() });
  const reborn = CS.createChannelStore({ dir, log: quiet, writer: SW.create({ log: quiet, workerPath: STAND }) });   // what a kill leaves
  const wrong = Object.entries(last).filter(([k, v]) => (reborn.stamps.get(k) || {}).lastPollAt !== v);
  ok(!wrong.length, `(h3) the store a kill leaves reads every key's NEWEST stamp (the side file + the folded journal; ${Object.keys(last).length} keys)`, wrong);
  w.stop();
}

// (i) C3 — THE GATE SEES A DOOR THAT WAITS: the WRITER stalled (a stand-in thread holds every write of adapters.json and
//     groups.json 600 ms — a create on the field's mount is ~4 s), the doors driven (paced, durable, a group verb): the main loop
//     stays on time. A door given a synchronous wait (writeNow / flushSync «for durability») holds it for the write —
//     red here, as census ② is red by name.
console.log('(i) C3: the writer stalled — the doors leave the loop on time (a door that WAITS is red here and in census ②)');
{
  const HOLD = 600;
  const dir = path.join(ROOT, 'i'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND, durableMs: HOLD * 4 });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake' }); });
  hold('adapters.json', HOLD); hold('groups.json', HOLD);
  const meter = lateMeter(); let late = null; const t0 = performance.now();
  try {
    await st.adapters.update((a) => { a.adapters[0].lastPass = { at: 1 }; }, { paced: true });
    const pacedMs = Math.round(performance.now() - t0);
    const durable = st.adapters.update((a) => { a.adapters[0].label = 'acted'; });   // awaited below: the loop runs meanwhile
    const grp = st.groups.update((g) => { g.groups['g-i'] = { id: 'g-i', name: 'i', members: [], at: 1 }; });
    await Promise.all([durable, grp]);
    const doneMs = Math.round(performance.now() - t0);
    late = meter.stop();
    ok(late < HOLD / 3 && pacedMs < HOLD / 3 && doneMs >= HOLD && verdictOf(hasRec(st.adaptersFile, 'acct', 'label', 'acted')), `(i) the writer held every write ${HOLD} ms: a paced update resolved in ${pacedMs} ms, the durable act and a group verb waited ${doneMs} ms — ASYNCHRONOUSLY: the main loop's worst lateness ${late} ms`, { late, pacedMs, doneMs });
  } finally { if (late === null) meter.stop(); unhold('adapters.json'); unhold('groups.json'); }
  for (let k = 0; k < 400 && (w.pending(st.adaptersFile) || w.pending(st.groupsFile)); k++) await sleep(10);
  w.stop();
}

// (j) THE WRITER MAKES A MISSING DIRECTORY ONLY FOR A WRITE THAT ASKS (cure r1, a small: bound, not every store): a new
//     account's people.json gets its directory; any other store whose directory is gone fails its write ENOENT, said —
//     never a silently re-created directory
console.log('(j) the writer\'s mkdir is bounded to the people door');
{
  const dir = path.join(ROOT, 'j'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake' }); });
  fs.rmSync(dir, { recursive: true, force: true });   // the store's directory is gone
  let code = null; try { await st.adapters.update((a) => { a.adapters[0].label = 'after-gone'; }); } catch (e) { code = (e && e.code) || 'threw'; }
  const remade = fs.existsSync(dir);
  ok(code === 'ENOENT' && !remade, `(j1) a store whose directory is gone: its durable write fails ENOENT (${code}) and the directory is NOT re-created (${remade})`, { code, remade });
  fs.mkdirSync(dir, { recursive: true });
  st.peopleWrite('acct-j', { self: 'me', people: {} });
  let people = null; for (let k = 0; k < 200 && !people; k++) { people = readJson(path.join(dir, 'acct-j', 'people.json')); if (!people) await sleep(10); }
  ok(!!(people && people.self === 'me'), '(j2) a new account\'s people.json still gets its directory, made by the writer\'s thread (the door asks: makeDir)');
  failOn('adapters.json', false);
  w.stop();
}

try { SW.storeWriter().stop(); } catch { }
// (k) THE TWO ORDER LAWS OF test-channel-store ⑭, ON THE WRITER'S THREAD (the .407 prep mirror: that suite's controls cut
//     the store at two marks this unit moved). Both laws stand; one carrier changed:
//     (k1) OWED — a healed (legacy) stamp is on disk BEFORE the index that drops it: in the JOURNAL now (one synchronous
//          append on the main thread, at the heal), and the index written after it by the WRITER's thread (durable(), never
//          the suite's flush); a child SIGKILLed right after that write — the next start reads every stamp back.
//          CONTROL: the heal's append cut — the same kill loses them.
//     (k2) FOLD — the journal is folded only by a side-file write that LANDED: the writer's write of poll-stamps.json fails
//          (the stand-in thread) — the journal keeps every line and a store started then reads every stamp; once the
//          storage heals, the landing folds it. CONTROL: a fold on the failed write too — the journal emptied, no side
//          file, the stamps gone.
console.log('(k) the two ORDER laws of test-channel-store ⑭ on the writer\'s thread');
{
  const CS_FILE = path.join(REPO, 'src/channel-store.js');
  const SRC = fs.readFileSync(CS_FILE, 'utf8');
  const HEAL_J = ['    if (took.length) journal(took);', '    if (took.length && false) journal(took);'];
  const FOLD_OK = ['    if (!ok) { stampsDirty = true; stampsCompactOwed = true; return; }', '    if (!ok) { stampsDirty = true; stampsCompactOwed = true; foldJournal(null); return; }'];   // B-360d: the failed write keeps the compaction owed
  ok(SRC.split(HEAL_J[0]).length === 2 && SRC.split(FOLD_OK[0]).length === 2, '(k0) CONTROL setup: the heal\'s journal append and the failed side-file write\'s branch are each spelled once');
  const T = Date.UTC(2026, 9, 3, 2, 0, 0);
  const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  // (k1) a legacy index (300 rows carrying their stamps), healed at the load; one real change; the WRITER writes the index
  const k1 = (tag, cut) => {
    const dir = path.join(ROOT, `k1-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const legacy = { v: 1, updatedAt: T, conversations: {} };
    for (let i = 0; i < 300; i++) legacy.conversations[`a/l${i}`] = { key: `a/l${i}`, id: `l${i}`, adapterId: 'a', title: 'l' + i, lane: { via: 'poll', lastPushAt: null, lastPollAt: T - i * 1000, lastScanAt: null, walkStartedAt: T - i * 1000 - 5, firstSeenByPoll: 0, firstSeenTotal: 0 } };
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(legacy, null, 1));
    const child = `(async () => {
      const Module = require('module'), fs = require('fs'), path = require('path');
      const file = ${JSON.stringify(CS_FILE)};
      let src = fs.readFileSync(file, 'utf8');
      ${cut ? `src = src.replace(${JSON.stringify(cut[0])}, ${JSON.stringify(cut[1])});` : ''}
      const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file);
      const st = m.exports.createChannelStore({ dir: ${JSON.stringify(dir)}, log: { log() {}, info() {}, warn() {}, error() {} } });
      let jl = 0; try { jl = fs.readFileSync(st.stamps.log, 'utf8').split('\\n').filter(Boolean).length; } catch { }
      await st.index.update(() => { st.index.entry('a', 'l1').title = 'changed'; });
      const landed = await st.index.fold();   // B-360d unit 1: a change rides the journal — the FOLD is the writer's whole write of the index
      process.stdout.write(JSON.stringify({ jl, landed, side: fs.existsSync(st.stamps.file) }) + '\\n');
      process.kill(process.pid, 'SIGKILL');
    })()`;
    const k = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 30e3 });
    let said = {}; try { said = JSON.parse(String(k.stdout).trim().split('\n').pop()); } catch { }
    const disk = fs.readFileSync(path.join(dir, 'index.json'), 'utf8');
    const re = CS.createChannelStore({ dir, log: quiet });
    let back = 0; for (let i = 0; i < 300; i++) { const l = re.stamps.lane(re.index.peek(`a/l${i}`)); if (l.lastPollAt === T - i * 1000 && l.walkStartedAt === T - i * 1000 - 5) back++; }
    re.close();
    return { signal: k.signal, ...said, written: disk.includes('"changed"'), stripped: !/lastPollAt|walkStartedAt|lastScanAt/.test(disk), back };
  };
  const r1 = k1('real', null);
  ok(r1.signal === 'SIGKILL' && r1.jl === 300 && r1.landed === true && gateOf(r1.written) && gateOf(r1.stripped) && r1.side === false && r1.back === 300,
    `(k1) OWED on the writer's thread: the journal held all ${r1.jl} healed stamps BEFORE any index write; the writer's write of the index landed (${r1.landed}) without a stamp in it (side file ${r1.side ? 'present' : 'absent'}); SIGKILLed right after — the next start reads ${r1.back} of 300 back`, r1);
  const c1 = k1('cut', HEAL_J);
  ok(c1.signal === 'SIGKILL' && c1.jl === 0 && gateOf(c1.written) && gateOf(c1.stripped) && c1.back === 0,
    `(k1) CONTROL: the heal not journaled — the same index write and kill leave ${c1.back} of 300 stamps (each row «never polled») — red`, c1);
  // (k2) the side file's write fails on the (stand-in) writer's thread — the journal is not folded until a write LANDS
  const KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const load = (cut) => { if (!cut) return CS; const m = new Module(CS_FILE, null); m.filename = CS_FILE; m.paths = Module._nodeModulePaths(path.dirname(CS_FILE)); m._compile(SRC.replace(cut[0], cut[1]), CS_FILE); return m.exports; };
  const k2 = async (tag, cut, { heal = true } = {}) => {
    const dir = path.join(ROOT, `k2-${tag}`); fs.mkdirSync(dir, { recursive: true });
    const w = SW.create({ log: quiet, workerPath: STAND });
    const st = load(cut).createChannelStore({ dir, log: quiet, writer: w });   // B-360d: no side file yet ⇒ the first stamp asks the compaction
    await st.index.update(() => { for (const c of KEYS) st.index.entry('acct', c, { create: true }); });
    failOn('poll-stamps.json', true);
    KEYS.forEach((c, i) => st.stamps.set(`acct/${c}`, { lastPollAt: T + i }));
    const j0 = lines(st.stamps.log);
    for (let k = 0; k < 160 && !((w.whyNotDurable(st.stamps.file) || {}).why === 'failed'); k++) await sleep(25);
    const r = { j0, failed: (w.whyNotDurable(st.stamps.file) || {}).why === 'failed', jFailed: lines(st.stamps.log), side: fs.existsSync(st.stamps.file) };
    const reborn = CS.createChannelStore({ dir, log: quiet, writer: SW.create({ log: quiet, workerPath: STAND }) });   // what a kill leaves now
    r.back = KEYS.filter((c, i) => (reborn.stamps.get(`acct/${c}`) || {}).lastPollAt === T + i).length;
    failOn('poll-stamps.json', false);   // the storage heals: the writer's retry lands the side file, and only then the fold
    if (heal) for (let k = 0; k < 400 && !(((st.stamps.stats() || {}).writes || 0) >= 1 && lines(st.stamps.log) === 0); k++) await sleep(25);
    r.writes = (st.stamps.stats() || {}).writes || 0; r.jHealed = lines(st.stamps.log); r.sideHealed = fs.existsSync(st.stamps.file);
    w.stop();
    return r;
  };
  const r2 = await k2('real', null);
  ok(r2.j0 === 6 && gateOf(r2.failed) && r2.jFailed === 6 && !r2.side && r2.back === 6 && r2.writes >= 1 && r2.jHealed === 0 && verdictOf(r2.sideHealed),
    `(k2) FOLD on the writer's thread: the side file's write FAILED — the journal kept ${r2.jFailed} of ${r2.j0} lines and a store started then reads ${r2.back} of 6 stamps; once the storage healed, the landing (${r2.writes} write) folded it to ${r2.jHealed} lines`, r2);
  const c2 = await k2('cut', FOLD_OK, { heal: false });
  ok(gateOf(c2.failed) && c2.jFailed === 0 && !c2.side && c2.back === 0,
    `(k2) CONTROL: a fold on the failed write too — the journal emptied (${c2.jFailed} lines) with no side file, a store started then reads ${c2.back} of 6 stamps — red`, c2);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
