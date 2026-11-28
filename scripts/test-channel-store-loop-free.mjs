#!/usr/bin/env node
// test-channel-store-loop-free — channel-store-off-loop, commit 1 (the owner's root ask: the hub's main process stops
// being held). On the owner's hub, 24 h of the witness's own lines: 562 holds and 2221 s at src/channel-store.js's
// writeJsonAtomic (adapters.json 549, groups.json 12), 19 holds / 75 s at peopleWrite's account-directory mkdir, 15 holds /
// 51 s at the poll-stamps snapshot's open — a data directory on a mount where a create costs ~4 s. Those doors and their
// same-bytes twins (the outbox, the aliases) now hand their bytes to the store writer's thread. FAST, in process:
//   (a) THE PLACED STALL: the real store, the real writer thread, a scratch dir; scripts/fixtures/fs-stall.cjs holds the
//       main thread STALL_MS in EVERY synchronous write-family fs call under the store's dir (the doors this unit LISTS,
//       not moves, are counted by name and not stalled; the poll-stamps journal is the named exception). The drive is one
//       real pass of the fake adapter (append, stamp, journal) plus the doors' own calls (a group verb, an alias, an
//       outbox attempt, a new account's people, wake pace, dispatch, audit, the stamps' flush — wake pace and dispatch MOVED
//       doors since lg-store-writes U3). The measure: a 10 ms
//       timer's lateness and the stalled calls by name. RED on d7f42cc21 (2.369.404): the moved doors' calls stall it.
//   (b) A SLOW WRITER (a stand-in thread that holds a write): a PACED stamp resolves at once (its bytes not on disk yet);
//       a DURABLE act resolves only when its bytes are on disk; «queued» at the writer's bound never rejects; a FAILED
//       write rejects with its code; five sequential paced stamps are at most two writes.
//   (c) THE OUTBOX'S WRITE-AHEAD: a child kills itself right after outbox.update's promise resolved — the attempt is in
//       the file.
//   (d) WHAT CAN STILL HOLD: a synchronous flush (close(), the stamps' flush()) behind a write in flight waits for it —
//       measured; at the writer's synchronous bound it returns with the store named as held (bounded). (d3) the
//       poll-stamps journal keeps every stamp set after the side file's bytes were made (folded down to them — cure r1;
//       the bound across many snapshots is test-channel-store-writer-laws (h)).
//   (e) close() writes every moved file through the writer; (f) the key-mint check reads the store's live records.
//   (g) lane lg-store-writes U3 (B-0248): a dispatch-ledger set is an ACT (rank 0, durable() asked — urgent), a wake-pace
//       set is PACED; a handover that THROWS while open is said and asks no durable(); RED: mutant copies without the
//       durable() line, without `act: true`, without the catch's return.
// Run: node scripts/test-channel-store-loop-free.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const P = require(path.join(REPO, 'src/store-pace.js'));
const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const info = (l) => console.log('  · ' + l);
const ROOT = scratch('csol-loop-free');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const STALL_MS = 400, TICK_MS = 10;
/** the worst lateness of a TICK_MS interval timer between start and stop */
function lateMeter() { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; }
// THE ROWS THIS UNIT LISTS (not moved — scripts/test-store-write-census.mjs names each) and the named exception, by path
const LISTED = [[/^msgs\//, 'message logs'], [/^audit\.ndjson$|^archive\//, 'audit'],
  [/^attachments\//, 'lru / attachment metas'], [/\/search-memo\.json/, 'search memo'], [/\/feed-misses\.json/, 'feed miss'], [/^outbox-files\//, 'outbox files'], [/^poll-stamps\.log$/, 'THE JOURNAL (the named exception)']];
const rowOf = (dir) => (p) => { const r = path.relative(dir, p); const hit = LISTED.find(([re]) => re.test(r)); return hit ? hit[1] : null; };

// ═══ (a) THE PLACED STALL over one real pass of the fake adapter and the doors' own calls ═══
console.log('(a) a stall placed in every main-thread synchronous write under the store\'s dir — one real pass of the fake adapter + the doors');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
{
  const dataDir = path.join(ROOT, 'a'), dir = path.join(dataDir, 'channels');
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, log: quiet });
  const st = eng.store;
  await eng.pass('fake-poll', { force: true });   // the accounts and their rows exist (unmeasured)
  const S = STALL.install({ under: dir, ms: STALL_MS, exempt: rowOf(dir) });
  const meter = lateMeter();
  let r = {};
  try {
    await eng.pass('fake-poll', { force: true });   // THE PASS: its appends, its stamps (journal), its pass stamp (adapters, paced)
    await st.groups.update((g) => { g.groups['g-loop'] = { id: 'g-loop', name: 'loop', members: [], at: 1 }; });
    r.groupsOnResolve = readJson(st.groupsFile);
    await st.aliases.update((a) => { a.aliases['fake-poll'] = { u1: { alias: 'One', at: 1 } }; });
    await st.outbox.update((o) => { o.proposals['p-loop-1'] = { id: 'p-loop-1', state: 'sending', attemptAt: 77, adapterId: 'fake-poll' }; });
    r.outboxOnResolve = readJson(st.outboxFile);
    await st.adapters.update((a) => { const x = a.adapters.find((y) => y.id === 'fake-poll'); if (x) x.label = 'loop-free'; });
    r.adaptersOnResolve = readJson(st.adaptersFile);
    st.peopleWrite('fake-new-acct', { self: 'me', people: { u1: { name: 'One' } } });
    st.pace.set({ v: 1, pairs: { a: 1 }, senders: {} }); st.pace.flush();
    st.dispatch.set({ v: 1, entries: { d: { at: 1 } } }); st.dispatch.flush();
    // lane lg-store-writes (B-0248 U3): the wake-pace and dispatch ledgers are MOVED doors now (no longer listed): their
    // flush lands through the writer's thread — the stall above would see any main-thread call of theirs
    r.paceOnFlush = readJson(path.join(dir, 'wake-pace.json')); r.dispatchOnFlush = readJson(path.join(dir, 'dispatch-ledger.json'));
    st.audit({ at: Date.now(), kind: 'loop-free', who: 'suite' });
    st.stamps.set('fake-poll/fake-poll-ops', { lastPollAt: 1234 }); st.stamps.flush();
    await sleep(300);   // the writer's paced writes (people, the pass stamp) land on its thread while the meter runs
  } finally { r.late = meter.stop(); S.restore(); }
  const stalled = S.calls.filter((c) => c.stalled), listed = S.calls.filter((c) => c.row);
  const byRow = {}; for (const c of listed) byRow[c.row] = (byRow[c.row] || 0) + 1;
  const names = [...new Set(stalled.map((c) => `${c.fn} ${c.path}`))];
  info(`the timer's worst lateness ${r.late} ms (a stall is ${STALL_MS} ms); ${S.calls.filter((c) => c.kind === 'write').length} write-family calls under the dir — stalled ${stalled.length}, listed ${listed.length} ${JSON.stringify(byRow)}; ${S.calls.filter((c) => c.kind === 'read').length} reads counted`);
  ok(stalled.length === 0, `(a) NO main-thread synchronous call of a moved door under the store's dir (adapters, groups, the outbox, the aliases, a new account's people + its directory, the poll-stamps snapshot)${stalled.length ? ` — STALLED: ${names.slice(0, 12).join(' · ')}` : ''}`, names);
  ok(r.late < STALL_MS, `(a) the timer was never held a stall's length: worst lateness ${r.late} ms < ${STALL_MS} ms (one stall)`, { late: r.late });
  ok(byRow['message logs'] > 0 && byRow['THE JOURNAL (the named exception)'] > 0 && byRow.audit > 0, '(a) the drive was real: the pass appended records, its stamps reached the journal, wake pace / dispatch / audit wrote — each a LISTED row, counted by name', byRow);
  ok(!!(r.paceOnFlush && r.paceOnFlush.pairs && r.paceOnFlush.pairs.a === 1 && r.dispatchOnFlush && r.dispatchOnFlush.entries && r.dispatchOnFlush.entries.d),
    '(a) U3 (B-0248): the wake-pace and dispatch ledgers are MOVED doors — no main-thread call of theirs under the stall, and each file holds its bytes once its flush() returns (through the writer)', { pace: r.paceOnFlush, dispatch: r.dispatchOnFlush });
  const gOk = r.groupsOnResolve && r.groupsOnResolve.groups && r.groupsOnResolve.groups['g-loop'], oOk = r.outboxOnResolve && r.outboxOnResolve.proposals && r.outboxOnResolve.proposals['p-loop-1'] && r.outboxOnResolve.proposals['p-loop-1'].attemptAt === 77;
  const aOk = r.adaptersOnResolve && (r.adaptersOnResolve.adapters || []).some((x) => x.id === 'fake-poll' && x.label === 'loop-free');
  ok(!!(gOk && oOk && aOk), '(a) each awaited DURABLE update\'s file holds its change when its promise resolves (a group verb, an outbox attempt, an adapter record)', { gOk: !!gOk, oOk: !!oOk, aOk: !!aOk });
  let people = null; for (let k = 0; k < 100 && !people; k++) { people = readJson(path.join(dir, 'fake-new-acct', 'people.json')); if (!people) await sleep(20); }
  const dmode = (() => { try { return fs.statSync(path.join(dir, 'fake-new-acct')).mode & 0o777; } catch { return null; } })();
  ok(!!(people && people.self === 'me') && dmode === 0o700, `(a) a new account's people.json lands with its directory made by the WRITER's thread (0${dmode != null ? dmode.toString(8) : '?'})`, { people, dmode });
  eng.stop();
}

// ── a stand-in writer thread (scripts/fixtures/store-stand-writer.cjs): the REAL writeJob, after the ms in
//    `<dir>/hold-<basename>` (if any); `<dir>/fail-<basename>` = that file's write fails (EIO) ──
const T = path.join(ROOT, 'stand');
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(T);
const STAND = SAND.path, hold = SAND.hold, unhold = SAND.unhold, failOn = SAND.failOn;
const hasRec = (file, id, field, v) => { const j = readJson(file); return !!(j && (j.adapters || []).some((x) => x.id === id && x[field] === v)); };

// ═══ (b) A SLOW WRITER: the two columns ═══
console.log('(b) a slow writer: paced resolves at once, durable only on disk, «queued» never rejects, a failed write rejects');
{
  const DURABLE_MS = 80, HOLD = 600;
  const dir = path.join(ROOT, 'b'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND, durableMs: DURABLE_MS });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake', lastPass: null }); });
  hold('adapters.json', HOLD);
  // b1 — PACED: resolves after the change in memory; its bytes are not on disk yet
  await st.adapters.update((a) => { a.adapters[0].lastPass = { at: 1 }; }, { paced: true });
  const b1Disk = (readJson(st.adaptersFile).adapters[0] || {}).lastPass;
  ok(gateOf(st.adapters.live().adapters[0].lastPass) && st.adapters.live().adapters[0].lastPass.at === 1 && !b1Disk && verdictOf(w.pending(st.adaptersFile)), '(b1) a PACED stamp resolves after the change in memory — its bytes not on disk when it resolves (the writer still owes them)', { disk: b1Disk });
  // b2 + b3 — DURABLE behind a write that outlasts durable()'s bound (×7): «queued» is still owed, never a rejection
  let rejected = null; const t0 = performance.now();
  try { await st.adapters.update((a) => { a.adapters[0].label = 'durable'; }); } catch (e) { rejected = (e && e.code) || String(e); }
  const waited = Math.round(performance.now() - t0), b2Disk = hasRec(st.adaptersFile, 'acct', 'label', 'durable');
  ok(rejected === null && verdictOf(b2Disk), `(b2) a DURABLE act resolves only when its bytes are on disk — the file holds it at the resolve (waited ${waited} ms)`, { rejected, b2Disk });
  ok(rejected === null && waited >= DURABLE_MS, `(b3) «queued» at the writer's bound (${DURABLE_MS} ms) is STILL OWED: the promise waited on (${waited} ms) and resolved — never a rejection`, { rejected, waited });
  unhold('adapters.json');
  // b4 — a FAILED write rejects with its code (a durable act); a PACED one resolves (memory holds it; the writer retries)
  failOn('adapters.json', true);
  let code = null; try { await st.adapters.update((a) => { a.adapters[0].label = 'refused'; }); } catch (e) { code = (e && e.code) || 'threw'; }
  let pacedThrew = null; try { await st.adapters.update((a) => { a.adapters[0].lastPass = { at: 2 }; }, { paced: true }); } catch (e) { pacedThrew = (e && e.code) || 'threw'; }
  ok(code === 'EIO' && st.adapters.live().adapters[0].label === 'refused' && pacedThrew === null, `(b4) a FAILED write rejects a durable act with its own code (${code}) — the change stays in memory, owed; a paced stamp resolves`, { code, pacedThrew });
  failOn('adapters.json', false);
  for (let k = 0; k < 400 && w.pending(st.adaptersFile); k++) await sleep(10);
  // b5 — five sequential paced stamps: at most two writes
  hold('adapters.json', 200);
  const before = (w.stats().find((x) => x.file === st.adaptersFile) || {}).writes || 0;
  for (let i = 0; i < 5; i++) await st.adapters.update((a) => { a.adapters[0].lastPass = { at: 10 + i }; }, { paced: true });
  for (let k = 0; k < 600 && w.pending(st.adaptersFile); k++) await sleep(10);
  const writes = ((w.stats().find((x) => x.file === st.adaptersFile) || {}).writes || 0) - before;
  ok(writes >= 1 && writes <= 2 && (readJson(st.adaptersFile).adapters[0].lastPass || {}).at === 14, `(b5) five sequential PACED stamps coalesce: ${writes} write(s), the last stamp on disk`, { writes });
  unhold('adapters.json');
  w.stop();
}

// ═══ (c) THE OUTBOX'S WRITE-AHEAD survives a kill right after the resolve ═══
console.log('(c) the outbox: a kill right after outbox.update resolved finds the attempt in the file');
{
  const dir = path.join(ROOT, 'c'); fs.mkdirSync(dir, { recursive: true });
  const child = `const CS = require(${JSON.stringify(path.join(REPO, 'src/channel-store.js'))});
const st = CS.createChannelStore({ dir: ${JSON.stringify(dir)}, log: { log() {}, warn() {}, error() {} } });
st.outbox.update((o) => { o.proposals['p-kill-1'] = { id: 'p-kill-1', state: 'sending', attemptAt: 4242, adapterId: 'acct' }; })
  .then(() => process.kill(process.pid, 'SIGKILL'), (e) => { console.error('REJECTED', e && e.code); process.exit(3); });`;
  const r = spawnSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 60000 });
  const ob = readJson(path.join(dir, 'outbox.json'));
  const att = ob && ob.proposals && ob.proposals['p-kill-1'] ? ob.proposals['p-kill-1'].attemptAt : null;
  ok(r.signal === 'SIGKILL' && att === 4242, `(c) the attempt is ON DISK when outbox.update resolves — the child killed itself right after; the file holds attemptAt ${att} (the send's write-ahead keeps its order)`, { signal: r.signal, status: r.status, err: (r.stderr || '').slice(0, 300), att });
}

// ═══ (d) WHAT CAN STILL HOLD: a synchronous flush behind a write in flight ═══
console.log('(d) a synchronous flush behind a flying write: it waits — measured — and returns at the writer\'s bound');
{
  const GRACE = 1500, BOUND = P.syncBoundMs(GRACE);
  const dir = path.join(ROOT, 'd'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND, graceMs: GRACE });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake' }); });
  await st.index.update(() => { st.index.entry('acct', 'c1', { create: true }); });   // the stamp's row (a key whose row left the index is dropped)
  // d1: the write in flight ends inside the bound — the flush waits for it, then its own bytes land
  hold('adapters.json', Math.round(BOUND / 2));
  st.adapters.update((a) => { a.adapters[0].lastPass = { at: 1 }; }, { paced: true });
  for (let k = 0; k < 300 && !(w.stats().find((x) => x.file === st.adaptersFile) || {}).inflight; k++) await sleep(5);
  st.stamps.set('acct/c1', { lastPollAt: 99 });
  let t0 = performance.now(); const d1 = st.stamps.flush(); const d1Ms = Math.round(performance.now() - t0);
  // r3301 (B-3dbd unit 2): d1's case is a flying write that ENDS inside the bound. Whether it did is a FACT of the writer, read in
  // the same tick the flush returned (its stats: the write still in flight or not); a run where the hold's remainder (the
  // stand-in's own write on a loaded machine) ran past the bound is SAID, not judged as d1 — (d2) judges the past-the-bound case
  const d1Flying = !!(w.stats().find((x) => x.file === st.adaptersFile) || {}).inflight;
  const d1Disk = readJson(st.stamps.file);
  // r3446 (主开发's must): «not this run's case» ONLY when the flush HELD ITS WHOLE BOUND (its time at or past the bound, a 5 % margin,
  // by this suite's own measure). A false BEFORE the bound with the write in flight is the fault d1 exists for: RED by name
  const judgeD1 = (x) => (x.d1 === true && x.disk ? 'green' : (!x.d1 && x.flying && x.ms >= x.bound * 0.95 ? 'not-this-case' : 'red'));
  const v1 = judgeD1({ d1, flying: d1Flying, ms: d1Ms, bound: BOUND, disk: !!(d1Disk && JSON.stringify(d1Disk).includes('99')) });
  if (v1 === 'not-this-case') console.log(`  · (d1) NOT THIS RUN'S CASE: the flying write was still in flight when the flush held its WHOLE bound (${d1Ms} ms of ${BOUND} ms; it returned false, as the bound says) — the case «it ends inside the bound» did not happen here, so (d1) is not judged on it`);
  else ok(v1 === 'green', `(d1) a flush behind a flying write WAITS for it, then writes (the main thread held ${d1Ms} ms — the write in flight's remainder; the bound is ${BOUND} ms)${!d1 && d1Flying ? ` — the flush GAVE UP BEFORE its bound (${d1Ms} of ${BOUND} ms) with the write in flight` : ''}`, { d1, d1Ms, d1Flying });
  unhold('adapters.json');
  // RED CONTROL (r3446): a writer copy whose flush gives up AT ONCE while a write is in flight — d1's verdict on it is RED, never «not this case»
  // r3558: the lane writer (the writer chain) waits for the flush's OWN lane in writeWaiting — d1's stamps flush takes that road (the
  // stamps and adapters are rewrites, one lane); the copy returns «held» there at once, the write still in flight
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const swSrc = fs.readFileSync(path.join(REPO, 'src/store-writer.js'), 'utf8'), ANCH = 'if (l.inflight && !settleInflight(l, deadline, waitedBy)) return';
    let SWg = null; try { SWg = mutantCopies('loop-free-d1', REPO).load('src/store-writer.js', anchored(swSrc, ANCH, 'if (l.inflight) return', 'd1-gives-up-at-once'), 'gives-up-at-once'); } catch { SWg = null; }   // anchored(): the anchor present ONCE, else no copy (said below)
    let vr = null, rMs = null, rFlying = null;
    if (SWg) {
      const dirR = path.join(ROOT, 'd1r'); fs.mkdirSync(dirR, { recursive: true });
      const w2 = SWg.create({ log: quiet, workerPath: STAND, graceMs: GRACE }), st2 = CS.createChannelStore({ dir: dirR, log: quiet, writer: w2 });
      await st2.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake' }); });
      await st2.index.update(() => { st2.index.entry('acct', 'c1', { create: true }); });
      hold('adapters.json', Math.round(BOUND / 2));
      st2.adapters.update((a) => { a.adapters[0].lastPass = { at: 1 }; }, { paced: true });
      for (let k = 0; k < 300 && !(w2.stats().find((x) => x.file === st2.adaptersFile) || {}).inflight; k++) await sleep(5);
      st2.stamps.set('acct/c1', { lastPollAt: 99 });
      const tR = performance.now(); const r2 = st2.stamps.flush(); rMs = Math.round(performance.now() - tR);
      rFlying = !!(w2.stats().find((x) => x.file === st2.adaptersFile) || {}).inflight;
      vr = judgeD1({ d1: r2, flying: rFlying, ms: rMs, bound: BOUND, disk: false });
      unhold('adapters.json'); w2.stop();
    }
    ok(!!SWg && vr === 'red', `RED CONTROL (r3446): a writer whose flush gives up AT ONCE with the write in flight (${rMs} ms of ${BOUND}; in flight ${rFlying}) is judged RED by d1, never «not this run's case»${SWg ? '' : ' — ANCHOR gone: the copy is not the control it says'}`, { vr, rMs, rFlying });
  }
  for (let k = 0; k < 400 && w.pending(st.adaptersFile); k++) await sleep(10);
  // d2: the write in flight outlasts the bound — the flush returns AT the bound, the store named as held (bounded)
  hold('adapters.json', BOUND * 3);
  st.adapters.update((a) => { a.adapters[0].lastPass = { at: 2 }; }, { paced: true });
  for (let k = 0; k < 300 && !(w.stats().find((x) => x.file === st.adaptersFile) || {}).inflight; k++) await sleep(5);
  st.stamps.set('acct/c1', { lastPollAt: 100 });
  t0 = performance.now(); const d2 = st.stamps.flush(); const d2Ms = Math.round(performance.now() - t0);
  const stillFlying = !!(w.stats().find((x) => x.file === st.adaptersFile) || {}).inflight;
  ok(d2 === false && gateOf(stillFlying) && d2Ms >= BOUND, `(d2) a flush behind a write that outlasts the writer's synchronous bound returns AT the bound (${d2Ms} ms ≥ ${BOUND} ms, the write still in flight) — not written, kept, retried; THIS is what can still hold the loop: up to the bound (a third of the stop grace)`, { d2, d2Ms, stillFlying });
  unhold('adapters.json');
  for (let k = 0; k < 600 && (w.pending(st.adaptersFile) || w.pending(st.stamps.file)); k++) await sleep(10);
  // d3: THE JOURNAL'S FOLD — the side file's own write in flight (held past the bound), a stamp set meanwhile: when that
  // write lands the journal is folded DOWN to the line set since (cure r1 — it holds a line the file does not) — a kill
  // then keeps the newer stamp
  hold('poll-stamps.json', BOUND * 2);
  st.stamps.set('acct/c1', { lastPollAt: 200 });
  const d3 = st.stamps.flush();   // returns at the bound, its write still in flight
  st.stamps.set('acct/c1', { lastPollAt: 201 });   // after the side file's bytes were made: the journal's line only
  for (let k = 0; k < 600 && (w.stats().find((x) => x.file === st.stamps.file) || {}).inflight; k++) await sleep(10);
  unhold('poll-stamps.json');
  const onDisk = readJson(st.stamps.file), journal = (() => { try { return fs.readFileSync(st.stamps.log, 'utf8'); } catch { return ''; } })();
  const reborn = CS.createChannelStore({ dir: path.join(ROOT, 'd'), log: quiet, writer: SW.create({ log: quiet, workerPath: STAND }) });   // the store a kill leaves (no close)
  const seen = (reborn.stamps.get('acct/c1') || {}).lastPollAt;
  ok(d3 === false && gateOf(JSON.stringify(onDisk).includes('200')) && gateOf(journal.includes('201')) && seen === 201, `(d3) the side file landed holding 200 while 201 was set after its bytes were made: the journal keeps 201 (cure r1: folded DOWN to the stamps set since the bytes were made — never emptied of them) — the store a kill leaves reads ${seen}`, { d3, journal: journal.slice(-120), seen });
  w.stop();
}

// ═══ (e) close() flushes the moved files through the writer; (f) the key-mint check reads memory ═══
console.log('(e) close() writes every moved file through the writer; (f) the key-mint check reads the live records');
{
  const dir = path.join(ROOT, 'e'); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet, workerPath: STAND });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  await st.adapters.update((a) => { a.adapters.push({ id: 'acct', kind: 'fake' }); });
  await st.adapters.update((a) => { a.adapters[0].lastPass = { at: 31 }; }, { paced: true });   // owed, not on disk
  const before = ((readJson(st.adaptersFile) || {}).adapters || [])[0] || {};
  st.peopleWrite('acct-e', { self: 'me', people: {} });
  st.close();
  const after = ((readJson(st.adaptersFile) || {}).adapters || [])[0] || {};
  ok(!before.lastPass && gateOf(after.lastPass) && after.lastPass.at === 31 && !!readJson(path.join(dir, 'acct-e', 'people.json')), '(e) close() writes every moved file through the writer: a paced stamp and a new account\'s people owed at close are on disk after it', { before: before.lastPass || null, after: after.lastPass || null });
  w.stop();
  const eng = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  ok(gateOf(/const accountsHold = \(\) => \{\n\s+const chan = path\.join\(dataDir, 'channels'\);\n\s+if \(holdsCiphertext\(\{ values: \[store\.adapters\.live\(\)\], files: \[path\.join\(chan, 'adapters\.json'\)\]/.test(eng)) && verdictOf(/secretBox\(path\.join\(dataDir, KEY_FILE\), \{ hasCiphertext: accountsHold \}\)/.test(eng)), '(f) the key-mint check (holdsCiphertext, in accountsHold — B-f276) reads the store\'s LIVE records before adapters.json — the file may lag a token sealed in memory a moment ago');
}


try { SW.storeWriter().stop(); } catch { }
// ═══ (g) lane lg-store-writes U3 (B-0248, reader round 1): the dispatch ledger is the writer's NEXT write ═══
console.log('(g) the dispatch ledger is an ACT — rank 0 and durable() asked at every set (urgent); the wake-pace ledger PACED (no durable())');
{
  const calls = [];
  const real = SW.create({ log: quiet });
  const spy = { ...real,
    dirty: (f, o) => { calls.push({ k: 'dirty', f: path.basename(f), name: o && o.name, rank: o && o.rank }); return real.dirty(f, o); },
    durable: (f, o) => { calls.push({ k: 'durable', f: path.basename(f) }); return real.durable(f, o); } };
  const legOf = (Mod, tag) => {
    calls.length = 0;
    const dir = path.join(ROOT, 'g-' + tag); fs.mkdirSync(dir, { recursive: true });
    const st = Mod.createChannelStore({ dir, log: quiet, writer: spy });
    st.pace.set({ v: 1, pairs: { g: 1 }, senders: {} });
    st.dispatch.set({ v: 1, entries: { g: { at: 1 } } });
    const c = calls.slice();
    st.close();
    return { disp: c.filter((x) => x.f === 'dispatch-ledger.json'), pace: c.filter((x) => x.f === 'wake-pace.json') };
  };
  const g = legOf(CS, 'moved');
  ok(gateOf(g.disp.some((x) => x.k === 'dirty' && x.name === 'channels-dispatch.write' && x.rank === 0)) && gateOf(g.disp.some((x) => x.k === 'durable'))
    && gateOf(g.pace.some((x) => x.k === 'dirty' && x.name === 'channels-wake-pace.write' && x.rank === undefined)) && !g.pace.some((x) => x.k === 'durable'),
    '(g) a dispatch set hands the ledger as channels-dispatch.write, rank 0, and asks durable() (urgent); a wake-pace set is paced — no rank, no durable()', g);
  const csSrc = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const aD = '    if (!closed) W().durable(dispatchFile).catch(() => { });';
  ok(csSrc.split(aD).length === 2, '(g) ANCHOR: the dispatch ledger\'s one durable() line');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const NoUrgent = mutantCopies('loop-free-g', REPO).load('src/channel-store.js', editAnchor(csSrc, aD, '   ', "src/channel-store.js"), 'no-urgent');
  const r = legOf(NoUrgent, 'red');
  ok(!r.disp.some((x) => x.k === 'durable') && verdictOf(r.disp.some((x) => x.k === 'dirty')), '(g) CONTROL: the durable() line removed ⇒ the ledger waits for the pace (no durable() asked) — the check above would be red', r);
  // (g) the HAND-OFF's rank: the ledger handed without `act: true` carries no rank 0 in its dirty() (while the store is open the
  // durable() that follows raises it in the writer anyway — this control pins the hand-off's own word, the exit order's belt)
  const NoRank = mutantCopies('loop-free-g-rank', REPO).load('src/channel-store.js', editAnchor(csSrc, "owe(dispatchFile, { name: 'channels-dispatch.write', act: true,", "owe(dispatchFile, { name: 'channels-dispatch.write',", "src/channel-store.js"), 'no-rank');
  const nr = legOf(NoRank, 'red-rank');
  ok(!nr.disp.some((x) => x.k === 'dirty' && x.rank === 0), '(g) CONTROL: the dispatch ledger handed without `act: true` ⇒ its dirty() carries no rank 0 — the check above would be red (the hand-off\'s word, not the writer\'s behaviour)', nr);
  // (g) a handover that THROWS while the store is open (a stand-in writer whose dirty() throws — the real writer's never does;
  // after close() writeNow can, and `!closed` already skips durable() there): SAID, and no durable() asked for a file never handed over
  const throwLeg = (Mod, tag) => {
    const warns = [], asked = [];
    const thrower = { ...real, dirty: (f, o) => { if (path.basename(f) === 'dispatch-ledger.json') throw new Error('the writer is stopped'); return real.dirty(f, o); },
      durable: (f, o) => { asked.push(path.basename(f)); return real.durable(f, o); } };
    const dir = path.join(ROOT, 'g-throw-' + tag); fs.mkdirSync(dir, { recursive: true });
    const st = Mod.createChannelStore({ dir, log: { log() { }, warn: (...a) => warns.push(a.join(' ')), error() { } }, writer: thrower });
    st.dispatch.set({ v: 1, entries: { h: { at: 1 } } });
    const out = { said: warns.filter((l) => /the writer is stopped/.test(l)).length, asked: asked.filter((f) => f === 'dispatch-ledger.json').length };
    st.close();
    return out;
  };
  const th = throwLeg(CS, 'moved');
  ok(th.said === 1 && th.asked === 0, '(g) a dispatch handover that THROWS while the store is open is SAID once, and no durable() is asked for a file never handed over', th);
  const aR = "warn('[channels]', (e && e.message) || e); return; }   // «dispatch-ledger.json not written";
  ok(csSrc.split(aR).length === 2, '(g) ANCHOR: the dispatch handover\'s catch returns');
  const NoReturn = mutantCopies('loop-free-g-ret', REPO).load('src/channel-store.js', editAnchor(csSrc, aR, "warn('[channels]', (e && e.message) || e); }   // «dispatch-ledger.json not written", "src/channel-store.js"), 'no-return');
  const thr = throwLeg(NoReturn, 'red');
  ok(thr.asked === 1, '(g) CONTROL: the catch without its return ⇒ durable() is asked for the file never handed over — the check above would be red', thr);
  real.stop();
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
