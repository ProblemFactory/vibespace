#!/usr/bin/env node
// THE CHANNELS INGEST ENGINE (docs/design-communication-panel.zh.md §5.1,
// §6.1, §6.2; gate row `test-channels-engine`).
//
// Everything here drives the REAL engine over the REAL store with the REAL
// registry — the fake adapter talks to nothing, so a pass is a pass. The legs
// are the four r2 defects that only exist at this seam:
//
//   ① a transient append failure must cost a RE-READ, never a skipped batch
//      (the store remembers a vendorId only once its bytes are durable, and
//      the engine advances an anchor only for a pass that completed)
//   ② two overlapping passes must BOTH keep their adapter row's health —
//      `adapters.json` had the read-modify-write shape this design's index
//      owner exists to eliminate, and the row it clobbered is the ONE honesty
//      signal that compensates for a static freshness chip
//   ③ `markRead` must not broadcast a no-op, and its default instant is the
//      NEWEST RECORD's — with `now()` a future-dated vendor record keeps
//      `unread` above zero for ever and nothing watching it can settle
//   ④ a route may not MINT an index row for an id nobody has: the track
//      route's own 404 was unreachable dead code
//   ⑤ (P1a) a BURST DAY pages to the anchor NEWEST-FIRST over the real ingest
//      loop — 340 then 320 records land whole with zero duplicates, the anchor
//      moves only after a complete walk, a quiet pass costs one page, and a
//      walk the budget cuts short never advances the anchor (fence 9)
//
// Per-pid scratch dirs (scripts/scratch.mjs), no machine-global name.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const routes = require(path.join(REPO, 'src/routes/channels.js'));

const ROOT = scratch('chan-engine');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });

// ── PATCHED-COPY HYGIENE ──────────────────────────────────────────────────
// Each negative control writes a patched copy of a real module BESIDE it (it
// must be a SIBLING or the module's relative requires do not resolve). The
// `finally` blocks unlink them, but a SIGKILL runs no cleanup — and a dirty
// tree is what the release gate REFUSES on. So: gitignored (asserted below)
// AND swept at start by PID LIVENESS, never by age — this suite can
// legitimately run twice in one worktree, and deleting a copy a LIVE run is
// importing is worse than litter.
for (const [dir, re] of [['src', /^\.channel-store\.prefix-(\d+)-\d+\.js$/], ['src/server', /^\.channels-engine\.prefix-(\d+)-\d+\.js$/], ['src/channels', /^\.(?:index|fake)\.prefix-(\d+)-\d+\.js$/]]) {
  let swept = 0, spared = 0;
  for (const f of fs.readdirSync(path.join(REPO, dir))) {
    const m = f.match(re);
    if (!m) continue;
    let alive = false;
    try { process.kill(Number(m[1]), 0); alive = true; } catch (e) { alive = e && e.code === 'EPERM'; }
    if (alive) { spared++; continue; }
    try { fs.unlinkSync(path.join(REPO, dir, f)); swept++; } catch {}
  }
  if (swept || spared) console.log(`  … ${dir}: swept ${swept} stranded patched copies, spared ${spared} live`);
}
{
  const gi = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf-8');
  ok(/^src\/\.channel-store\.prefix-\*\.js$/m.test(gi) && /^src\/server\/\.channels-engine\.prefix-\*\.js$/m.test(gi)
     && /^src\/channels\/\.index\.prefix-\*\.js$/m.test(gi) && /^src\/channels\/\.fake\.prefix-\*\.js$/m.test(gi),
    'ALL FOUR patched-copy families this suite writes are GITIGNORED — a SIGKILL strands one, and a dirty tree is what the release gate refuses on');
}

let seq = 0, patchSeq = 0;
const engines = [];
// A patched copy must be a SIBLING of the module it replaces (relative
// requires) and must have its OWN name: node caches by resolved path, so two
// controls sharing one filename silently drive the FIRST patch twice.
const patchPath = (dir, base) => path.join(REPO, dir, `.${base}.prefix-${process.pid}-${++patchSeq}.js`);
function mkEngine(opts = {}) {
  const dataDir = path.join(ROOT, opts.name || `e${++seq}`);
  const events = [];
  const e = ENG.create({
    dataDir,
    env: opts.env === undefined ? { VIBESPACE_CHANNELS_FAKE: '1' } : opts.env,
    registry: opts.registry,
    broadcast: (m) => events.push(m),
    ...(opts.now ? { now: opts.now } : {}),   // an injected clock; `now: undefined` would override the engine's default
  });
  engines.push(e);
  return { eng: e, events, dataDir };
}
// A clock that starts at the beginning of TODAY (UTC) and advances normally.
// The fake adapter spreads a day's records over the whole current UTC day of
// the clock it is handed, so a leg that needs a record stamped AHEAD of the
// clock must not depend on the wall-clock minute: measured 2026-09-14, the
// leg below was green at 21:05Z and red at 21:36Z, 21:42Z, 21:55Z — after the
// last slot of the day no future record exists — on an untouched tree.
function dayStartClock() {
  const t0 = Date.now();
  const day0 = Math.floor(t0 / 86400e3) * 86400e3 + 60e3;
  return () => day0 + (Date.now() - t0);
}

// ── ① A TRANSIENT APPEND FAILURE COSTS A RE-READ, NEVER A SKIP ────────────
// The reproduction, end to end: mark a conversation tracked, make its log
// un-appendable for exactly one pass, heal the disk, and let the engine run
// again. Before the fix the second pass reported `appended:0` (the dedup set
// had been poisoned by the FAILED write), the engine read that as a complete
// pass, the anchor advanced PAST all nine messages and the panel drew 0
// unread — silently, permanently, with no crash and no error.
{
  const { eng } = mkEngine({ name: 'append-fail' });
  const A = 'fake-poll', C = 'fake-poll-ops';
  await eng.store.index.update(() => { eng.store.index.entry(A, C).tracked = true; });

  const lp = eng.store.logPath(A, C);
  fs.mkdirSync(path.dirname(lp), { recursive: true });
  fs.mkdirSync(lp, { recursive: true });     // EISDIR — the shape ENOSPC/EIO/EDQUOT produce
  const p1 = await eng.pass(A, { force: true });
  ok(p1.ok === false, 'a pass whose append failed reports FAILURE', JSON.stringify(p1));
  const after1 = eng.store.index.snapshot().conversations[`${A}/${C}`] || {};
  ok(!after1.anchor, '…and the cursor did NOT move', JSON.stringify(after1.anchor));

  fs.rmdirSync(lp);
  const p2 = await eng.pass(A, { force: true });
  const held = fake.worldFor('fake-poll', {}).get(C).records.length;
  // A MUTANT MUST GO RED, NOT CRASH: with the fix reverted nothing is written
  // at all, and `readFileSync` would take the whole suite down instead of
  // failing the one assert whose job this is.
  const lines = fs.existsSync(lp) && fs.statSync(lp).isFile() ? fs.readFileSync(lp, 'utf-8').trim().split('\n').filter(Boolean).length : 0;
  const after2 = eng.store.index.snapshot().conversations[`${A}/${C}`] || {};
  ok(p2.ok === true && lines === held,
    `THE NEXT PASS WRITES EVERY MESSAGE the failed one was carrying (${lines}/${held})`, JSON.stringify(p2));
  ok(after2.unread === held, '…and the panel draws them as unread', String(after2.unread));
  ok(after2.anchor, '…and only NOW does the cursor advance', String(after2.anchor));
}

// ① NEGATIVE CONTROL — the same scenario against a PRE-FIX copy of the store
// (the remember moved back inside the selection loop) must lose them all.
// SINCE THE STORE's r4 the copy must revert TWO layers: r4 drops the cached
// set whenever the write throws (a prefix may be durable), and on this
// fixture — a throw INSIDE the write that lands zero bytes — that alone
// discards the polluted set and the retry writes everything, so reverting
// r2's ORDER by itself reproduces nothing here. The per-layer arms (r2's own
// pre-write shape, r4's belt) live in test-channel-store ⑤b/⑤i; this leg is
// about what the ENGINE does over the r1 store, so it takes the r1 bytes.
// SINCE r5 a THIRD layer stands one step earlier — the strict dedup REBUILD
// refuses an unreadable log, and a directory where the log must be is one —
// so the r1 bytes must have r5 stripped as well (r5's own control is
// test-channel-store ⑤j).
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  const PRE = src
    .replace("      inBatch.add(r.vendorId);\n      fresh.push(r);",
             "      rememberVendorId(set, r.vendorId);\n      fresh.push(r);")
    .replace("    // DURABLE NOW — and only now may the set claim to hold them.\n    for (const r of fresh) rememberVendorId(set, r.vendorId);\n", "")
    .replace("      dedup.delete(`${adapterId}/${convId}`);   // r4: the log is the only witness now\n", "")
    .replace("if (strict && e.code !== 'ENOENT') throw e; ", "").replace("if (strict) throw e; ", "");
  ok(PRE !== src && !/DURABLE NOW/.test(PRE) && !/only witness now/.test(PRE) && (PRE.match(/throw e/g) || []).length === (src.match(/throw e/g) || []).length - 2,
    'NEGATIVE CONTROL setup: the pre-fix store (the r2 order, the r4 invalidation AND the r5 strict rebuild reverted) was reconstructed from the shipped bytes (a control that cannot be built proves nothing)');
  const storeCopy = patchPath('src', 'channel-store');
  const engCopy = patchPath('src/server', 'channels-engine');
  fs.writeFileSync(storeCopy, PRE);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  fs.writeFileSync(engCopy, esrc.replace("require('../channel-store.js')", `require('../${path.basename(storeCopy)}')`));
  try {
    const PE = require(engCopy);
    const eng = PE.create({ dataDir: path.join(ROOT, 'append-fail-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
    engines.push(eng);
    const A = 'fake-poll', C = 'fake-poll-ops';
    await eng.store.index.update(() => { eng.store.index.entry(A, C).tracked = true; });
    const lp = eng.store.logPath(A, C);
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.mkdirSync(lp, { recursive: true });
    await eng.pass(A, { force: true });
    fs.rmdirSync(lp);
    const p2 = await eng.pass(A, { force: true });
    const lines = fs.existsSync(lp) ? fs.readFileSync(lp, 'utf-8').trim().split('\n').filter(Boolean).length : 0;
    const en = eng.store.index.snapshot().conversations[`${A}/${C}`] || {};
    ok(p2.ok === true && lines === 0 && en.unread === 0 && !!en.anchor,
      'NEGATIVE CONTROL: the pre-fix store reports a COMPLETE pass, writes nothing, draws 0 unread and advances the anchor past every message — silent, permanent loss',
      JSON.stringify({ ok: p2.ok, lines, unread: en.unread, anchor: en.anchor }));
    const p3 = await eng.pass(A, { force: true });
    ok(p3.ok === true && (fs.existsSync(lp) ? fs.readFileSync(lp, 'utf-8').trim().length : 0) === 0,
      'NEGATIVE CONTROL: …and it never recovers — the cursor is past them');
  } finally { for (const f of [storeCopy, engCopy]) { try { fs.unlinkSync(f); } catch {} } }
}

// ── ② A FAILING ADAPTER'S HEALTH SURVIVES A HEALTHY NEIGHBOUR'S PASS ──────
// `adapterRecords()` used to re-parse adapters.json on EVERY call and `pass()`
// wrote its own private array back from OUTSIDE any serialized door, so the
// amber "{n} failed passes ({code})" row — the ONE honesty signal that
// compensates for a static freshness chip — was wiped by whichever pass
// landed second. In P1 the same file holds `push.demotedAt` / `push.missRate`
// / `scan.hostFacts`, and a clobbered demotion is §6.4's "a lane that lies
// about being active turns the fallback OFF".
{
  const mkMod = (kind, { fails = false, delayMs = 0 } = {}) => {
    const m = fake.makeFakeAdapter({ kind, receive: 'poll', sendAs: ['user'] });
    const inner = m.create;
    return { kind, caps: m.caps, create(rec, deps) {
      const impl = inner(rec, deps);
      const lc = impl.listConversations;
      impl.listConversations = async (...a) => {
        if (delayMs) await sleep(delayMs);
        if (fails) throw new CH.ChannelError('auth-expired', 'token expired', { retryable: false });
        return lc(...a);
      };
      return impl;
    } };
  };
  const seed = (dataDir, kinds) => {
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: kinds.map((k) => ({
      id: k, kind: k, label: k, enabled: true,
      auth: { tokenEnc: null, expiresAt: null, scopes: [] },
      lastPass: null, consecutiveFailures: 0,
      push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null,
    })) }, null, 1));
  };
  const build = (name, kinds) => {
    const dataDir = path.join(ROOT, name);
    seed(dataDir, kinds);
    const registry = CH.createChannelRegistry();
    registry.register(mkMod('broken', { fails: true, delayMs: 40 }));
    registry.register(mkMod('slow', { delayMs: 60 }));
    const e = ENG.create({ dataDir, registry, env: {}, broadcast: () => {} });
    engines.push(e);
    return { eng: e, dataDir };
  };
  const rowOf = (dataDir, id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'adapters.json'), 'utf-8')).adapters.find((a) => a.id === id) || {};

  // CONTROL — the failing adapter alone reaches the amber threshold.
  {
    const { eng, dataDir } = build('health-alone', ['broken']);
    for (let i = 0; i < 5; i++) await eng.pass('broken', { force: true });
    const r = rowOf(dataDir, 'broken');
    ok(r.consecutiveFailures === 5 && r.lastPass && r.lastPass.code === 'auth-expired',
      'CONTROL: five failing passes alone persist 5 consecutive failures and the vendor\'s own code', JSON.stringify(r.lastPass));
    ok(r.consecutiveFailures >= 3, '…which is what the panel draws amber on');
  }
  // The defect: a healthy neighbour passing CONCURRENTLY.
  {
    const { eng, dataDir } = build('health-neighbour', ['broken', 'slow']);
    for (let i = 0; i < 5; i++) await Promise.all([eng.pass('broken', { force: true }), eng.pass('slow', { force: true })]);
    const b = rowOf(dataDir, 'broken'), s = rowOf(dataDir, 'slow');
    ok(b.consecutiveFailures === 5 && b.lastPass && b.lastPass.code === 'auth-expired',
      'the SAME five failures survive a healthy neighbour passing beside them — the panel still says why', JSON.stringify({ fails: b.consecutiveFailures, code: b.lastPass && b.lastPass.code }));
    ok(s.lastPass && s.lastPass.ok === true, '…and the healthy row kept its own lastPass too (neither clobbers the other)', JSON.stringify(s.lastPass));
    ok(eng.digest().adapters.find((a) => a.id === 'broken')?.consecutiveFailures === 5,
      'and the DIGEST the panel reads carries it', JSON.stringify(eng.digest().adapters.map((a) => ({ id: a.id, f: a.consecutiveFailures }))));
  }
}

// ② NEGATIVE CONTROL — a patched engine whose `adapterRecords()` re-parses
// from disk on every call, writing its own private copy back (the retired
// shape), loses the failing row to the neighbour.
{
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const PRE = esrc
    .replace('    const a = store.adapters.live();', '    const a = JSON.parse(JSON.stringify(store.adapters.live()));')
    .replace("await store.adapters.update(() => { rec.lastPass = { at: now(), ok: true, code: null }; rec.consecutiveFailures = 0; });",
             "rec.lastPass = { at: now(), ok: true, code: null }; rec.consecutiveFailures = 0; await store.adapters.update((live) => { live.adapters = recs.adapters; });")
    .replace("await store.adapters.update(() => { rec.lastPass = { at: now(), ok: false, code }; rec.consecutiveFailures = e.failures; });",
             "rec.lastPass = { at: now(), ok: false, code }; rec.consecutiveFailures = e.failures; await store.adapters.update((live) => { live.adapters = recs.adapters; });");
  ok(PRE !== esrc && /JSON.parse\(JSON.stringify\(store.adapters.live\(\)\)\)/.test(PRE),
    'NEGATIVE CONTROL setup: the pre-fix engine (a private re-parsed copy per call, written whole back) was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  fs.writeFileSync(engCopy, PRE);
  try {
    const PE = require(engCopy);
    const mkMod = (kind, { fails = false, delayMs = 0 } = {}) => {
      const m = fake.makeFakeAdapter({ kind, receive: 'poll', sendAs: ['user'] });
      const inner = m.create;
      return { kind, caps: m.caps, create(rec, deps) {
        const impl = inner(rec, deps);
        const lc = impl.listConversations;
        impl.listConversations = async (...a) => { if (delayMs) await sleep(delayMs); if (fails) throw new CH.ChannelError('auth-expired', 'x', { retryable: false }); return lc(...a); };
        return impl;
      } };
    };
    const dataDir = path.join(ROOT, 'health-pre');
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: ['broken', 'slow'].map((k) => ({
      id: k, kind: k, label: k, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] },
      lastPass: null, consecutiveFailures: 0,
      push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null,
    })) }, null, 1));
    const registry = CH.createChannelRegistry();
    registry.register(mkMod('broken', { fails: true, delayMs: 40 }));
    registry.register(mkMod('slow', { delayMs: 60 }));
    const eng = PE.create({ dataDir, registry, env: {}, broadcast: () => {} });
    engines.push(eng);
    for (let i = 0; i < 5; i++) await Promise.all([eng.pass('broken', { force: true }), eng.pass('slow', { force: true })]);
    const b = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'adapters.json'), 'utf-8')).adapters.find((a) => a.id === 'broken') || {};
    ok(b.consecutiveFailures === 0 && !b.lastPass,
      'NEGATIVE CONTROL: the pre-fix engine persists ZERO failures for a token-expired adapter — the panel draws it as healthy', JSON.stringify(b.lastPass));
  } finally { try { fs.unlinkSync(engCopy); } catch {} }
}

// ── ③ markRead: NO-OP MEANS NO BROADCAST, AND "READ" MEANS THE NEWEST ─────
// Each broadcast recomputes the digest (deep-cloning the index), re-renders
// every panel and re-reads every open window's tail. Notifying when nothing
// moved is what turned one open window into a self-feeding loop at ~490
// requests a second, rewriting `readAt` ~500 times a second in the process.
{
  const clock = dayStartClock();
  const { eng, events } = mkEngine({ name: 'markread', now: clock });
  const A = 'fake-poll', C = 'fake-poll-ops';
  await eng.pass(A, { force: true });          // discovery ANNOUNCES it; ④ refuses a row nobody has
  ok(await eng.setTracked(A, C, true) === true, 'a discovered conversation tracks');
  await sleep(400);
  const key = `${A}/${C}`;
  const before = eng.store.index.snapshot().conversations[key] || {};
  ok(before.unread > 0, 'the conversation starts with unread records', String(before.unread));

  // The fake adapter spreads a day over the WHOLE current UTC day OF THE
  // ENGINE'S CLOCK, so with the clock pinned to that day's start a future-dated
  // record is always present — exactly the shape a vendor's clock skew
  // produces — whatever the wall-clock minute this suite runs at.
  // STANDING CENSUS (2026-09-14): the guarantee holds at EVERY minute of the
  // UTC day, not just at the minute this suite happens to run — a one-span
  // spread was red for the last 2.4 h of each day and green everywhere else.
  {
    const day = 86400e3, base = Math.floor(Date.now() / day) * day;
    let holes = 0, samples = 0;
    for (let m = 0; m < 1440; m += 5) {
      const t = base + m * 60e3; samples++;
      const w = fake.worldFor('fake-poll', { now: t }).get(C).records;
      if (!w.some((r) => r.at > t)) holes++;
    }
    ok(holes === 0, `the fake world holds a future-dated record at every sampled minute of the UTC day (${samples} samples, ${holes} holes)`);
    const one = (t) => { const c = 9; return Array.from({ length: c }, (_, i) => base + Math.floor((i + 1) * (day / (c + 1)))).some((at) => at > t); };
    ok(!one(base + 23 * 3600e3), 'POSITIVE CONTROL: the retired one-span spread has NO future record at 23:00Z (the shape that reddened the gate)');
  }
  const newest = eng.store.readTail(A, C, { limit: 1 })[0] || {};
  ok(Number(newest.at) > clock(), 'the newest record is stamped AHEAD of our clock (the shape that made `unread` un-clearable)', `${newest.at} vs ${clock()}`);

  events.length = 0;
  ok(await eng.markRead(A, C) === true, 'the first markRead succeeds');
  const after = eng.store.index.snapshot().conversations[key] || {};
  ok(after.unread === 0, 'AND IT REACHES ZERO — the default instant is the newest record\'s, not `now()`', String(after.unread));
  ok(events.length === 1, 'a mark that CHANGED something broadcasts exactly once', String(events.length));

  events.length = 0;
  for (let i = 0; i < 5; i++) await eng.markRead(A, C);
  ok(events.length === 0, 'FIVE repeats broadcast NOTHING — an unchanged value is not a dirty signal', String(events.length));
  ok(eng.store.index.snapshot().conversations[key]?.readAt === after.readAt, '…and the mark itself is untouched');

  // A record arriving between the newest one and now stays UNREAD: the mark
  // is "I have seen everything this conversation holds", never "everything up
  // to this instant".
  eng.store.appendRecords(A, C, [{ adapterId: A, convId: C, vendorId: 'later-1', at: (Number(newest.at) || Date.now()) + 1000, author: { id: 'u', name: 'U' }, text: 'x', mentions: [], attachments: [], raw: {} }]);
  await eng.markRead(A, C, null);
  ok(eng.store.index.snapshot().conversations[key]?.unread === 0, 'a LATER record is read once the user marks read again');
}

// ③b NEGATIVE CONTROL — a patched engine with `now()` as the default instant
// and an unconditional notify reproduces both halves of the loop.
{
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const PRE = esrc
    .replace("      const newest = store.readTail(adapterId, convId, { limit: 1 })[0];\n      const stamp = Number.isFinite(at) ? at : (newest ? (Number(newest.at) || 0) : (en.readAt || 0));",
             "      const stamp = Number.isFinite(at) ? at : now();")
    .replace("    if (changed) notify([convId]);", "    notify([convId]);");
  ok(PRE !== esrc && !/const newest = store.readTail/.test(PRE) && /\n    notify\(\[convId\]\);/.test(PRE),
    'NEGATIVE CONTROL setup: the pre-fix markRead (now() + an unconditional notify) was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  fs.writeFileSync(engCopy, PRE);
  try {
    const PE = require(engCopy);
    const events = [];
    const eng = PE.create({ dataDir: path.join(ROOT, 'markread-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => events.push(m), now: dayStartClock() });
    engines.push(eng);
    const A = 'fake-poll', C = 'fake-poll-ops';
    await eng.pass(A, { force: true });
    await eng.setTracked(A, C, true);
    await sleep(400);
    events.length = 0;
    for (let i = 0; i < 6; i++) await eng.markRead(A, C);
    const en = eng.store.index.snapshot().conversations[`${A}/${C}`] || {};
    ok(en.unread > 0,
      'NEGATIVE CONTROL: with `now()` the unread count NEVER reaches zero — the condition an open window re-POSTs on, for ever', String(en.unread));
    ok(events.length === 6,
      'NEGATIVE CONTROL: …and every one of the six no-ops broadcasts, which is the other half of the ~490/s loop', String(events.length));
  } finally { try { fs.unlinkSync(engCopy); } catch {} }
}

// ── ④ A ROUTE MAY NOT MINT AN INDEX ROW ───────────────────────────────────
// `store.index.entry()` creates on first touch — right for the ingest pass,
// wrong for a route. `POST /track` and `POST /read` on ANY id used to write a
// permanent, invisible row into index.json (read on every render, deep-cloned
// by digest() on every broadcast), and the track route's `404 No such
// conversation` was unreachable because setTracked always answered true.
{
  const { eng, dataDir } = mkEngine({ name: 'no-mint' });
  // seeds the fake adapter rows — asserted, because a mutant that publishes
  // NO adapters would make every refusal below vacuously true.
  ok(eng.digest().adapters.length === 3, 'the fake adapter rows exist for this leg (a refusal about an empty roster proves nothing)', String(eng.digest().adapters.length));
  ok(await eng.setTracked('no-such-adapter', 'made-up-0', true) === false,
    'setTracked on an unknown ADAPTER answers false — the route\'s 404 is reachable code');
  ok(await eng.setTracked('fake-poll', 'made-up-1', true) === false,
    '…and so does an unknown CONVERSATION on a real adapter');
  ok(await eng.markRead('no-such-adapter', 'made-up-2') === false, 'markRead answers false too');
  ok(await eng.markRead('fake-poll', 'made-up-3') === false, '…on both halves of the key');
  eng.store.index.flush();
  const ixFile = path.join(dataDir, 'channels', 'index.json');
  // Nothing made the index dirty, so the file may legitimately not exist yet
  // — which is the strongest form of this assertion, not a reason to skip it.
  const ix = fs.existsSync(ixFile) ? JSON.parse(fs.readFileSync(ixFile, 'utf-8')) : { conversations: {} };
  const mem = Object.keys(eng.store.index.snapshot().conversations);
  const minted = [...new Set([...Object.keys(ix.conversations), ...mem])].filter((k) => /made-up|no-such/.test(k));
  ok(!minted.length, 'NOT ONE invisible row was minted — in memory or on disk', minted.join(','));

  // POSITIVE CONTROL: a real pair still works, or the refusal above would be
  // a feature nobody can use.
  await eng.pass('fake-poll', { force: true });
  ok(await eng.setTracked('fake-poll', 'fake-poll-ops', true) === true, 'POSITIVE CONTROL: a REAL conversation still tracks');
  ok(await eng.markRead('fake-poll', 'fake-poll-ops') === true, 'POSITIVE CONTROL: …and still marks read');
  ok(eng.store.index.snapshot().conversations['fake-poll/fake-poll-ops']?.tracked === true, '…and the row is the ingest pass\'s, not a route\'s');
}

// ── ④b THE ROUTES ANSWER 404 ──────────────────────────────────────────────
{
  const { eng } = mkEngine({ name: 'routes' });
  await eng.pass('fake-poll', { force: true });
  routes.setup({ getEngine: () => eng });
  const call = (method, url, body) => new Promise((resolve) => {
    const req = { method, url, params: {}, query: {}, body: body || {} };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
    };
    const layer = routes.router.stack.find((l) => l.route && l.route.path === url.path && l.route.methods[method.toLowerCase()]);
    if (!layer) return resolve({ status: 0, body: { error: 'no such route' } });
    req.params = url.params;
    Promise.resolve(layer.route.stack[0].handle(req, res, () => {})).catch((e) => resolve({ status: 500, body: { error: String(e && e.message) } }));
  });
  ok(eng.digest().conversations.some((c) => c.id === 'fake-poll-ops'), 'the discovery pass announced a real conversation for the positive control below');
  const track = await call('POST', { path: '/api/channels/:adapterId/:convId/track', params: { adapterId: 'nope', convId: 'nope' } }, { tracked: true });
  ok(track.status === 404 && /No such conversation/.test(track.body.error), 'POST /track on an unknown id is a 404 — the branch that was dead code', JSON.stringify(track));
  const read = await call('POST', { path: '/api/channels/:adapterId/:convId/read', params: { adapterId: 'nope', convId: 'nope' } }, {});
  ok(read.status === 404 && /No such conversation/.test(read.body.error), 'POST /read answers the same rather than 200-with-a-mint', JSON.stringify(read));
  const good = await call('POST', { path: '/api/channels/:adapterId/:convId/track', params: { adapterId: 'fake-poll', convId: 'fake-poll-ops' } }, { tracked: true });
  ok(good.status === 200 && good.body.ok === true, 'POSITIVE CONTROL: a real conversation still answers 200');
  // The messages route forwards BOTH halves of the page boundary.
  const msrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/beforeId/.test(msrc) && /messages\(req\.params\.adapterId, req\.params\.convId, \{ before, beforeId, limit \}\)/.test(msrc),
    'the messages route forwards `beforeId` — dropping it would put the paging loss straight back');
}

// ── ⑤ THE DIGEST DOES NOT ASSERT WHAT IT CANNOT CHECK ─────────────────────
{
  const { eng } = mkEngine({ name: 'digest-auth' });
  await eng.pass('fake-poll', { force: true });   // discovery, or the census below walks nothing
  const d = eng.digest();
  ok(d.adapters.length === 3, 'the three fake adapters are in the digest', String(d.adapters.length));
  ok(d.adapters.every((a) => a.auth.state === 'unknown'),
    'an adapter that has never authenticated is published as `unknown`, NEVER as `connected` (the digest used to carry a ternary whose two branches were the same string)',
    JSON.stringify(d.adapters.map((a) => a.auth)));
  ok(d.adapters.every((a) => a.auth.why === 'never-authenticated'), '…and it says which rung answered', JSON.stringify(d.adapters.map((a) => a.auth.why)));
  ok(d.conversations.length > 0, 'the digest carries conversations for the claims below (a census over nothing proves nothing)', String(d.conversations.length));
  ok(d.conversations.every((c) => c.freshness && !('text' in c.freshness)),
    'no conversation carries a server-composed SENTENCE — the language is per DEVICE and this payload is broadcast to every client',
    JSON.stringify(d.conversations[0] && d.conversations[0].freshness));
  ok(d.conversations.every((c) => c.identityWarning && !('text' in c.identityWarning)), '…and neither does the identity warning', JSON.stringify(d.conversations[0] && d.conversations[0].identityWarning));
  ok(d.conversations.every((c) => c.freshness.state), 'every claim NAMES its state, so the client knows which sentence to render');
}

// ── ⑥ THE SCAN LANE INGESTS ONLY THROUGH A SOURCE THE RESOLVER GAVE IT (r3) ──
// r2 asked `scanState()` for the CHIP and then called `adapter.history()`
// regardless, while `scan.hostFacts` had NO producer in the product (the seed
// wrote `hostFacts: null` and nothing replaced it) — so the resolver could only
// ever answer `host-facts-stale`, and the fake adapter re-derived its own
// source from `caps.scanSources[process.platform]`. Measured on the shipped
// seam: 11 records ingested, anchor advanced, unread badged, chip "not
// scanning". Now the pass PRODUCES the facts (trigger ③), `ingest()` refuses
// a lane with no source, the source is HANDED to history(), and the chip and
// the log agree in both directions.
{
  const { eng } = mkEngine({ name: 'scan-gate' });
  const A = 'fake-scan', C = 'fake-scan-ops';
  const p0 = await eng.pass(A, { force: true });
  const row0 = eng.adapterRecords().adapters.find((r) => r.id === A);
  ok(p0.ok === true && row0.scan && row0.scan.hostFacts && row0.scan.hostFacts.platform === process.platform && Number.isFinite(row0.scan.hostFacts.at),
    'TRIGGER ③: a scan pass PRODUCES `scan.hostFacts` (platform + a fresh stamp) — the field had no producer anywhere in the product', JSON.stringify(row0.scan));
  ok(await eng.setTracked(A, C, true) === true, 'the scan conversation tracks');
  await sleep(500);
  const d = eng.digest();
  const row = d.conversations.find((c) => c.id === C);
  const n = eng.store.readTail(A, C, { limit: 99 }).length;
  const en = eng.store.index.snapshot().conversations[`${A}/${C}`];
  ok(row.lane.via === 'scan' && row.lane.source !== null && row.lane.why !== 'host-facts-stale',
    `the resolver has a SOURCE on this platform (${row.lane.source}, ${row.lane.why}) — facts fresh, platform declared, client present`, JSON.stringify(row.lane));
  ok(n > 0 && !!en.anchor && row.freshness.state === 'aged',
    `THE CHIP AND THE LOG AGREE: ${n} records ingested, the anchor advanced, and the chip says "scanned … ago"`, JSON.stringify({ n, anchor: en.anchor, freshness: row.freshness }));
  // A MUTANT MUST GO RED, NOT CRASH: with the trigger removed nothing is
  // ingested and there is no first record to read `raw` off.
  const first = eng.store.readTail(A, C, { limit: 1 })[0];
  const synthetic = first && first.raw ? first.raw.synthetic : null;
  ok(first && synthetic === (row.lane.source === 'ui'), 'the records carry the provenance of the source the RESOLVER chose (synthetic keys iff `ui`) — handed down, not re-derived', JSON.stringify({ synthetic, source: row.lane.source }));

  // Stale facts are refreshed by the next pass (the TTL is what makes them a
  // cache; the trigger is what keeps a stale record from being read around).
  await eng.store.adapters.update(() => { row0.scan.hostFacts = { ...row0.scan.hostFacts, at: Date.now() - 7 * 3600e3 }; });
  ok(eng.digest().conversations.find((c) => c.id === C).lane.why === 'host-facts-stale', 'FIXTURE: with the facts aged past the TTL the resolver answers host-facts-stale');
  await eng.pass(A, { force: true });
  ok(Date.now() - row0.scan.hostFacts.at < 60e3 && eng.digest().conversations.find((c) => c.id === C).lane.source !== null,
    'the next pass REFRESHES them unconditionally and the lane is back', JSON.stringify(row0.scan.hostFacts));

  // THE REFUSING DIRECTION: a machine the adapter reports NO CLIENT on.
  const absent = { kind: 'fake-scan-absent', caps: { ...fake.fakeScan.caps }, create(rec, deps) { const impl = fake.fakeScan.create(rec, deps); impl.scanHost = async (hostId) => ({ hostId, platform: process.platform, clientInstalled: false, storePath: null, grant: null, why: null, at: Date.now() }); return impl; } };
  const registry = CH.createChannelRegistry(); registry.register(absent);
  const dataDir = path.join(ROOT, 'scan-gate-absent');
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'fake-scan-absent', kind: 'fake-scan-absent', label: 'absent', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: { hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null } }] }));
  const ab = ENG.create({ dataDir, registry, env: {}, broadcast: () => {} }); engines.push(ab);
  // (the wrapped module's world is keyed by the `fake-scan` kind, so its
  // conversation ids are still `fake-scan-ops` / `fake-scan-announce`)
  await ab.pass('fake-scan-absent', { force: true });
  ok(await ab.setTracked('fake-scan-absent', 'fake-scan-ops', true) === true, 'the no-client adapter\'s conversation tracks');
  await sleep(500);
  const ar = ab.digest().conversations.find((c) => c.adapterId === 'fake-scan-absent' && c.id === 'fake-scan-ops');
  const an = ab.store.readTail('fake-scan-absent', 'fake-scan-ops', { limit: 99 }).length;
  const aen = ab.store.index.snapshot().conversations['fake-scan-absent/fake-scan-ops'];
  ok(ar.lane.why === 'client-not-installed' && ar.lane.source === null && ar.freshness.state === 'off' && ar.freshness.why === 'client-not-installed',
    'a machine with no client is a NAMED refusal on the chip', JSON.stringify({ lane: ar.lane, freshness: ar.freshness }));
  ok(an === 0 && !aen.anchor, '…and NOTHING is ingested through it — the log agrees with the chip in the refusing direction too', JSON.stringify({ an, anchor: aen.anchor }));
  const arow = ab.adapterRecords().adapters[0];
  ok(arow.lastPass && arow.lastPass.ok === true && arow.consecutiveFailures === 0,
    'a refused lane is NOT a failed pass (with the gate removed the registry refuses the page and the row goes amber instead — this assert is what tells the two apart)', JSON.stringify(arow.lastPass));

  // THE LANE DECISION READS NO `caps.receive` — it is asked of the resolver.
  // Scoped to the two functions that DECIDE (`laneOrScan`, `ingest`); the
  // seed shapes a record off the declaration and the digest publishes it,
  // which is what a declaration is for.
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const between = (a, b) => { const i = esrc.indexOf(a), j = esrc.indexOf(b, i); return i >= 0 && j > i ? esrc.slice(i, j) : null; };
  const laneFn = between('function laneOrScan(', 'async function pass('), ingestFn = between('async function ingest(', 'function digest(');
  ok(laneFn && ingestFn && !/\.receive\b/.test(laneFn) && !/\.receive\b/.test(ingestFn),
    '`laneOrScan` and `ingest` read `caps.receive` NOWHERE — the lane is asked of `laneState` and its `via` is followed (r2 read it in both, once to label a lane it had just been told was unavailable)');
  ok(/\.receive === 'scan' \? scanFor\(rec\) : laneFor\(rec, entry\)/.test("    return c.receive === 'scan' ? scanFor(rec) : laneFor(rec, entry);"), 'POSITIVE CONTROL: the pin matches the retired r2 `laneOrScan`');
  ok(/opts\.source = lane\.source/.test(esrc) && /await e\.adapter\.scanHost\(/.test(esrc), 'the resolved source is handed to history() and scanHost() has a caller');
}

// ⑥ NEGATIVE CONTROL — the r2 shape needs all three pre-fix pieces back:
// the engine (no facts produced, no gate, no source handed down), the
// registry (no refusal of a source-less scan page) and the fake (re-deriving
// its own source). Each is the SHIPPED module minus one named region, wired
// to each other by rewriting the engine copy's two requires.
{
  const isrc = fs.readFileSync(path.join(REPO, 'src/channels/index.js'), 'utf-8');
  const IPRE = isrc.replace(/        if \(caps\.receive === 'scan'\) \{\n          const src = opts\.source;[\s\S]*?\n        \}\n/, '');
  const fsrc = fs.readFileSync(path.join(REPO, 'src/channels/fake.js'), 'utf-8');
  const FPRE = fsrc.replace("        const synthetic = receive === 'scan' && source === 'ui';",
    "        const synthetic = receive === 'scan' && (((record.scan && record.scan.chosenSource) || (caps.scanSources && caps.scanSources[process.platform]) || 'ui') === 'ui');");
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const idxCopy = patchPath('src/channels', 'index');
  const fakeCopy = patchPath('src/channels', 'fake');
  const engCopy = patchPath('src/server', 'channels-engine');
  const EPRE = esrc
    .replace("    if (lane.via === 'scan' && !lane.source) return { appended: 0, duplicates: 0, anchorMoved: false, complete: false, why: lane.why };\n", '')
    .replace(/        let mayIngest = true;\n        if \(laneOrScan\(rec, \{\}\)\.via === 'scan'\) \{[\s\S]*?\n        \}\n/, '        let mayIngest = true;\n')
    .replace("      if (lane.via === 'scan') opts.source = lane.source;   // HANDED DOWN, never re-derived by the adapter\n", '')
    .replace("require('../channels/index.js')", `require('../channels/${path.basename(idxCopy)}')`)
    .replace("require('../channels/fake.js')", `require('../channels/${path.basename(fakeCopy)}')`);
  ok(IPRE !== isrc && FPRE !== fsrc && !/opts\.source = lane\.source/.test(EPRE) && !/scanHost\(/.test(EPRE.replace(/^\s*\/\/.*$/gm, '')) && !/!lane\.source\) return/.test(EPRE),
    'NEGATIVE CONTROL setup: all three pre-fix pieces were reconstructed from the shipped bytes');
  fs.writeFileSync(idxCopy, IPRE); fs.writeFileSync(fakeCopy, FPRE); fs.writeFileSync(engCopy, EPRE);
  try {
    const PE = require(engCopy);
    const eng = PE.create({ dataDir: path.join(ROOT, 'scan-gate-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
    engines.push(eng);
    const A = 'fake-scan', C = 'fake-scan-ops';
    await eng.pass(A, { force: true });
    await eng.setTracked(A, C, true);
    await sleep(500);
    const row = eng.digest().conversations.find((c) => c.id === C);
    const n = eng.store.readTail(A, C, { limit: 99 }).length;
    const en = eng.store.index.snapshot().conversations[`${A}/${C}`];
    ok(n > 0 && !!en.anchor && row.lane.why === 'host-facts-stale' && row.lane.source === null && row.freshness.state === 'off',
      `NEGATIVE CONTROL: the r2 engine ingests ${n} records and advances the anchor while the chip says "not scanning" (why host-facts-stale, source null) — the honesty contract publishing the opposite of what happened`,
      JSON.stringify({ n, anchor: en.anchor, lane: row.lane, freshness: row.freshness }));
    ok(eng.adapterRecords().adapters.find((r) => r.id === A).scan.hostFacts === null, 'NEGATIVE CONTROL: …and `scan.hostFacts` is still null after the pass — nothing ever produced it');
  } finally { for (const f of [idxCopy, fakeCopy, engCopy]) { try { fs.unlinkSync(f); } catch {} } }
}

// ── ⑦ "READ" IS THE NEWEST RECORD'S — FOR RECORDS STAMPED IN THE PAST TOO (r3) ──
// ③ proved it on the fake adapter, whose records are ALWAYS future-dated (it
// asserts so), and on that shape `Math.max(now(), newest.at)` IS the newest
// record's. Every real adapter stamps in the past — and there the r2 spelling
// was `now()`: a message stamped before the mark but fetched after it (the
// routine shape, the poll interval is 30-300 s) was silently marked read, and
// `changed` was true on every call, so the no-op rule was structurally inert.
{
  const recs = [];
  const base = Date.now() - 2 * 86400e3;
  for (let i = 0; i < 5; i++) recs.push({ vendorId: `p${i}`, at: base + i * 60e3, author: { id: 'u', name: 'U' }, text: `past ${i}` });
  const past = {
    kind: 'past-poll', caps: { ...fake.fakePoll.caps },
    create(record, deps) {
      const impl = fake.fakePoll.create(record, deps);
      impl.listConversations = async () => ({ conversations: [{ id: 'c', vendorId: 'c', title: 'Past', kind: 'group', participants: 'U', lastAt: recs[recs.length - 1].at }], cursor: null, complete: true });
      impl.history = async (convId, { anchor = null, limit = 50 } = {}) => {
        const all = recs.map((m) => fake.toRecord('past-poll', 'c', m));
        let idx = 0; if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
        const found = !anchor || idx > 0; const pending = all.slice(idx); const page = pending.slice(0, limit); const drained = page.length === pending.length;
        return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: found && drained, complete: found && drained };
      };
      return impl;
    },
  };
  const seedPast = (dataDir) => {
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'past-poll', kind: 'past-poll', label: 'past', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  };
  const drive = async (ENGINE, name) => {
    const dataDir = path.join(ROOT, name);
    seedPast(dataDir);
    const registry = CH.createChannelRegistry(); registry.register(past);
    const events = [];
    const eng = ENGINE.create({ dataDir, registry, env: {}, broadcast: (m) => events.push(m) });
    engines.push(eng);
    await eng.pass('past-poll', { force: true });
    await eng.setTracked('past-poll', 'c', true); await sleep(300);
    const newest = eng.store.readTail('past-poll', 'c', { limit: 1 })[0];
    events.length = 0;
    await eng.markRead('past-poll', 'c'); const b1 = events.length;
    await sleep(2);   // a `now()` stamp needs the clock to have MOVED for the control to show its repeat
    await eng.markRead('past-poll', 'c'); const b2 = events.length - b1;
    const readAt = eng.store.index.snapshot().conversations['past-poll/c'].readAt;
    // a BACKDATED arrival: stamped before the mark, fetched after it
    recs.push({ vendorId: `late-${name}`, at: Number(newest.at) + 30e3, author: { id: 'u', name: 'U' }, text: 'arrived late' });
    await eng.pass('past-poll', { force: true });
    const unread = eng.store.index.snapshot().conversations['past-poll/c'].unread;
    recs.pop();
    return { newestAt: Number(newest.at), readAt, b1, b2, unread };
  };
  const r = await drive(ENG, 'markread-past');
  ok(r.newestAt < Date.now() - 86400e3, 'FIXTURE: the records are stamped in the PAST (the mirror of ③\'s future-dated assert — the shape every real adapter has)', String(r.newestAt));
  ok(r.readAt === r.newestAt, 'the mark IS the newest record\'s instant, not now()', `${r.readAt} vs newest ${r.newestAt}`);
  ok(r.b1 === 1 && r.b2 === 0, 'the first mark broadcasts once and an identical second mark broadcasts NOTHING — the no-op rule is live on past-stamped records', `${r.b1},${r.b2}`);
  ok(r.unread === 1, 'a message stamped before the mark but FETCHED after it stays UNREAD and badges (the direction the docs promised)', String(r.unread));

  // ⑦b NEGATIVE CONTROL — the r2 spelling `Math.max(now(), newest.at)`.
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const PRE = esrc.replace("      const stamp = Number.isFinite(at) ? at : (newest ? (Number(newest.at) || 0) : (en.readAt || 0));",
                           "      const stamp = Number.isFinite(at) ? at : Math.max(now(), Number(newest && newest.at) || 0);");
  ok(PRE !== esrc, 'NEGATIVE CONTROL setup: the r2 stamp was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  fs.writeFileSync(engCopy, PRE);
  try {
    const p = await drive(require(engCopy), 'markread-past-pre');
    ok(p.readAt !== p.newestAt && p.readAt >= Date.now() - 60e3, 'NEGATIVE CONTROL: the r2 stamp is now(), not the newest record\'s', `${p.readAt} vs newest ${p.newestAt}`);
    ok(p.b1 === 1 && p.b2 === 1, 'NEGATIVE CONTROL: …so an identical second mark broadcasts AGAIN (the no-op rule was inert)', `${p.b1},${p.b2}`);
    ok(p.unread === 0, 'NEGATIVE CONTROL: …and the backdated arrival is SILENTLY marked read — never badged', String(p.unread));
  } finally { try { fs.unlinkSync(engCopy); } catch {} }
}

// ── ⑧ TRACKING BROADCASTS EVEN WHEN THE PASS IT KICKS CANNOT BE AFFORDED (r3) ──
// `setTracked(true)`'s only notification was the pass it kicked, and a pass
// the request budget refused returned before `notify()` — so the flag was on
// disk, the route had answered `{ok:true}`, and NO client learned (the panel
// repaints only on the broadcast). Measured: 26 of 30 tracks silent under the
// 20/min budget with a 30-conversation adapter (the design measures ~50 for a
// real account).
{
  const many = {
    kind: 'many-poll', caps: { ...fake.fakePoll.caps },
    create(record, deps) {
      const impl = fake.fakePoll.create(record, deps);
      impl.listConversations = async () => { const convs = []; for (let i = 0; i < 30; i++) convs.push({ id: `c${i}`, vendorId: `c${i}`, title: `Chat ${i}`, kind: 'group', participants: 'U', lastAt: Date.now() - 1000 }); return { conversations: convs, cursor: null, complete: true }; };
      impl.history = async () => ({ records: [], anchor: null, reachedAnchor: true, complete: true });
      impl.convCaps = async () => ({ read: 'yes', sendAs: ['user'], why: null, at: Date.now() });
      return impl;
    },
  };
  const drive = async (ENGINE, name) => {
    const dataDir = path.join(ROOT, name);
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'many-poll', kind: 'many-poll', label: 'many', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
    const registry = CH.createChannelRegistry(); registry.register(many);
    const events = [];
    const eng = ENGINE.create({ dataDir, registry, env: {}, broadcast: (m) => events.push(m) });
    engines.push(eng);
    await eng.pass('many-poll', { force: true });
    let silent = 0, said = 0, budgetHit = false;
    for (let i = 0; i < 30; i++) {
      events.length = 0;
      const r = await eng.setTracked('many-poll', `c${i}`, true);
      await sleep(30);
      if (r !== true) continue;
      const told = events.some((m) => m.digest && m.digest.conversations.some((c) => c.id === `c${i}` && c.tracked));
      if (told) said++; else silent++;
      if (!budgetHit) { const p = await eng.pass('many-poll', { force: true }); if (p.why === 'budget') budgetHit = true; }
    }
    eng.store.index.flush();
    const onDisk = Object.values(JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'index.json'), 'utf-8')).conversations).filter((c) => c.tracked).length;
    return { silent, said, onDisk, budgetHit };
  };
  const r = await drive(ENG, 'track-budget');
  ok(r.budgetHit, 'FIXTURE: the per-minute request budget really was exhausted during the run (a zero below would otherwise be vacuous)');
  ok(r.onDisk === 30, 'FIXTURE: all 30 tracked flags are persisted', String(r.onDisk));
  ok(r.silent === 0 && r.said === 30, 'EVERY track broadcast a digest showing the row tracked — a persisted change never depends on whether a pass was affordable', JSON.stringify(r));

  // ⑧ NEGATIVE CONTROL — the r2 shape: notify only on the untrack branch.
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const PRE = esrc.replace("    notify([convId]);\n    if (tracked) pass(adapterId, { force: true }).catch(() => {});",
                           "    if (tracked) pass(adapterId, { force: true }).catch(() => {}); else notify([convId]);");
  ok(PRE !== esrc, 'NEGATIVE CONTROL setup: the r2 setTracked was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  fs.writeFileSync(engCopy, PRE);
  try {
    const p = await drive(require(engCopy), 'track-budget-pre');
    ok(p.silent > 0 && p.onDisk === 30, `NEGATIVE CONTROL: the r2 engine persists all 30 and broadcasts NOTHING for ${p.silent} of them — the route said ok and no client learned`, JSON.stringify(p));
  } finally { try { fs.unlinkSync(engCopy); } catch {} }
}

// ── ⑨ THE DIGEST'S FRESHNESS CLAIM IS `off` FOR ROWS NOTHING FETCHES (r3) ──
// The PURE rule is in test-channel-caps; this is the WIRING: the engine hands
// `enabled` and the entry's `tracked` to the claim at digest time.
{
  const { eng } = mkEngine({ name: 'digest-off' });
  await eng.pass('fake-poll', { force: true });
  const u = eng.digest().conversations.find((c) => c.id === 'fake-poll-ops');
  ok(u.tracked === false && u.freshness.state === 'off' && u.freshness.why === 'untracked',
    'an UNTRACKED row is published as `off` / untracked — not "within 5m" about a fetch that will never happen', JSON.stringify(u.freshness));
  await eng.setTracked('fake-poll', 'fake-poll-ops', true); await sleep(400);
  const t = eng.digest().conversations.find((c) => c.id === 'fake-poll-ops');
  ok(t.tracked === true && t.freshness.state === 'bound' && t.freshness.seconds > 0, 'POSITIVE CONTROL: once tracked the same row claims its cadence', JSON.stringify(t.freshness));
  const rec = eng.adapterRecords().adapters.find((r) => r.id === 'fake-poll');
  await eng.store.adapters.update(() => { rec.enabled = false; });
  const dd = eng.digest();
  const dis = dd.conversations.find((c) => c.id === 'fake-poll-ops');
  ok(dd.adapters.find((a) => a.id === 'fake-poll').enabled === false && dis.freshness.state === 'off' && dis.freshness.why === 'adapter-disabled',
    'a DISABLED adapter\'s tracked row is `off` / adapter-disabled, and the adapter row says enabled:false beside it', JSON.stringify(dis.freshness));
}

// ── ⑤ THE BURST DAY: PAGING TO THE ANCHOR, NEWEST-FIRST (design §3.1 fence 9,
// §6.3; P1a's exit "correct on a burst day") ────────────────────────────────
// The ops notes record a real room producing 300+ messages in ONE day, and a
// fixed-size fetch window silently lost messages on exactly that day. The
// real Lark adapter walks `im/v1/messages` NEWEST-FIRST with a page token and
// keeps walking until it meets the stored anchor — several `history()` calls
// of ONE pass, each answering `reachedAnchor:false, complete:false` until the
// anchor is met. This leg drives the REAL engine's ingest loop over an
// adapter with exactly that shape (the fake pages oldest-first, so it could
// never exercise the newest-first continuation) and measures the CONSEQUENCE:
// every record of a 340-message day lands, the anchor is the NEWEST id and
// moves only after the walk completed, a quiet pass costs ONE vendor page, a
// second 320-message day lands whole on top of the first with zero
// duplicates, and a burst wider than one pass can walk (the 20/min request
// budget binds before MAX_PAGES: 1 discovery + 1 loop gate + 18 page
// continuations = 19 pages = 950 records) leaves the anchor WHERE IT WAS —
// fence 9's "an incomplete pass never advances" — with everything it read
// durable in the log and the dedup absorbing the re-read. BOUNDARY STATED:
// a newest-first walk restarts from the newest on every pass, so a single
// conversation that gains more than one pass's worth between two passes
// cannot reach its anchor until the burst subsides (at the 30 s hot cadence
// that is ~950 messages per 30 s — two orders of magnitude above the
// recorded day); the suite pins the honest half (no false advance, no loss of
// what was read, no duplicates), not a completion it cannot have.
console.log('⑤ a burst day pages to the anchor newest-first; the anchor moves only after a complete walk');
{
  const { makeRecord } = require(path.join(REPO, 'src/channel-record.js'));
  const PAGE = ENG.PAGE;
  const base = Date.now() - 86400e3 * 2;   // relative to now — no calendar date, no time-of-day dependence
  const world = { records: [], calls: 0, walks: 0 };
  const mkRec = (i) => ({ vendorId: `b-m${String(i).padStart(5, '0')}`, at: base + i * 250, author: { id: 'u-ada', name: 'Ada' }, text: `burst ${i}` });
  const burstMod = {
    kind: 'burst',
    caps: { ...fake.fakePoll.caps, sendAs: [], identityMarking: 'none' },   // READ-ONLY: no send/reconcile to implement
    create(rec, deps) {
      const walks = new Map();
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['burst'], why: null }; } },
        async listConversations() { return { conversations: [{ id: 'burst-ops', vendorId: 'burst-ops', title: 'Ops room', kind: 'group', participants: 'Ada', lastAt: null }], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: null, at: Date.now() }; },
        // Lark's shape, verbatim in spirit: newest-first pages, a walk keyed
        // by the anchor the previous call returned, `reachedAnchor` only when
        // the stored anchor was MET, and the returned anchor is always the
        // NEWEST id seen so a completed walk leaves the cursor at the top.
        async history(convId, { anchor = null, limit = 50 } = {}) {
          world.calls++;
          const all = world.records;   // oldest-first
          let w = walks.get(convId);
          const continuing = !!(w && w.newest && anchor === w.newest);
          if (!continuing) { w = { stopAt: anchor || null, cursor: all.length, newest: null }; walks.set(convId, w); world.walks++; }
          const lo = Math.max(0, w.cursor - limit);
          const pageDesc = all.slice(lo, w.cursor).reverse();   // newest-first within the vendor page
          const fresh = [];
          let reached = false;
          for (const m of pageDesc) {
            if (w.stopAt && m.vendorId === w.stopAt) { reached = true; break; }
            fresh.push(m);
          }
          if (!w.newest && fresh.length) w.newest = fresh[0].vendorId;
          w.cursor = lo;
          const exhausted = lo === 0;
          const done = reached || exhausted;
          if (done) walks.delete(convId);
          const records = fresh.reverse().map((m) => makeRecord({ adapterId: rec.id, convId, vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, mentions: [], attachments: [], replyTo: null, threadKey: null, raw: {} }));
          return { records, anchor: w.newest || w.stopAt || null, reachedAnchor: done, complete: done };
        },
      };
    },
  };
  const dataDir = path.join(ROOT, 'burst');
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{
    id: 'burst', kind: 'burst', label: 'burst', enabled: true,
    auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0,
    push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null,
  }] }, null, 1));
  const registry = CH.createChannelRegistry(); registry.register(burstMod);
  // An injected clock: each pass gets its own request-budget minute.
  let clock = Date.now();
  const engRec = mkEngine({ name: 'burst', env: {}, registry, now: () => clock });
  const eng = engRec.eng;
  const logCount = () => { try { return fs.readFileSync(path.join(dataDir, 'channels', 'msgs', 'burst', 'burst-ops.ndjson'), 'utf-8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const distinctIds = () => { try { return new Set(fs.readFileSync(path.join(dataDir, 'channels', 'msgs', 'burst', 'burst-ops.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l).vendorId)).size; } catch { return 0; } };
  const anchorOf = () => (eng.store.index.snapshot().conversations['burst/burst-ops'] || {}).anchor || null;

  // Day 1: 340 messages (the recorded 300+ day) in one conversation, tracked.
  for (let i = 0; i < 340; i++) world.records.push(mkRec(i));
  await eng.pass('burst', { force: true });                  // discovery only — nothing is tracked yet
  ok(anchorOf() === null && world.calls === 0, 'discovery announces the conversation and fetches NOTHING while it is untracked');
  clock += 61e3;
  await eng.setTracked('burst', 'burst-ops', true);           // kicks a pass
  await sleep(200);
  ok(logCount() === 340 && distinctIds() === 340, `every record of the 340-message day landed in the durable log (${logCount()} lines, ${distinctIds()} distinct)`);
  ok(anchorOf() === 'b-m00339', `the anchor is the NEWEST id after the walk completed (${anchorOf()})`);
  ok(world.calls === Math.ceil(340 / PAGE) && world.walks === 1, `the walk took ${Math.ceil(340 / PAGE)} vendor pages of ${PAGE} in ONE continuation (calls ${world.calls}, walks ${world.walks}) — the fake's oldest-first shape never exercises this`);
  const unread1 = eng.store.index.snapshot().conversations['burst/burst-ops'].unread;
  ok(unread1 === 340, `unread is derived from the log: ${unread1}`);

  // A quiet pass: the newest page carries the anchor, so it costs ONE vendor page.
  clock += 61e3; world.calls = 0; world.walks = 0;
  await eng.pass('burst', { force: true });
  ok(world.calls === 1 && logCount() === 340 && anchorOf() === 'b-m00339', `nothing new ⇒ ONE vendor page, no append, the anchor stays (calls ${world.calls}, log ${logCount()})`);

  // Day 2: another 320 arrive on top. The walk pages newest-first until it
  // MEETS day 1's anchor on the seventh page, appends all 320, and re-anchors.
  for (let i = 340; i < 660; i++) world.records.push(mkRec(i));
  clock += 61e3; world.calls = 0; world.walks = 0;
  const r2 = await eng.pass('burst', { force: true });
  ok(r2.ok === true && r2.changed.includes('burst-ops'), 'the pass completed and named the conversation that grew');
  ok(logCount() === 660 && distinctIds() === 660, `day 2's 320 landed whole on top of day 1 — 660 lines, 660 distinct, ZERO duplicates (${logCount()}/${distinctIds()})`);
  ok(anchorOf() === 'b-m00659', `the anchor moved to day 2's newest (${anchorOf()})`);
  ok(world.calls === 7 && world.walks === 1, `320 new + the anchor on the 7th page ⇒ 7 vendor pages, one continuation (calls ${world.calls}, walks ${world.walks})`);
  ok(eng.store.index.snapshot().conversations['burst/burst-ops'].unread === 660, 'unread counts both days');

  // A burst WIDER than one pass can walk: 1100 new records. The request
  // budget (20/min) binds after 19 pages (950 records) — the pass reports
  // INCOMPLETE, everything it read is durable, the anchor does NOT move.
  for (let i = 660; i < 1760; i++) world.records.push(mkRec(i));
  clock += 61e3; world.calls = 0; world.walks = 0;
  const before = anchorOf();
  const r3 = await eng.pass('burst', { force: true });
  ok(r3.ok === true, 'a pass cut short by the budget is still a passing pass (the adapter answered every page)');
  ok(anchorOf() === before, `an INCOMPLETE walk never advances the anchor (fence 9): still ${anchorOf()}`);
  ok(logCount() >= 660 + 900 && distinctIds() === logCount(), `what the walk read is durable and deduplicated (${logCount()} lines, ${distinctIds()} distinct)`);
  ok(world.calls >= 18 && world.calls <= ENG.MAX_PAGES, `the walk was bounded by the budget/MAX_PAGES (${world.calls} pages)`);
  // The next pass re-walks from the newest: the dedup absorbs every re-read
  // and the log never doubles — the honest half of a bound the walk cannot
  // complete (the boundary is stated at the head of this leg).
  clock += 61e3; world.calls = 0;
  const n3 = logCount();
  await eng.pass('burst', { force: true });
  ok(logCount() === n3 && distinctIds() === n3 && anchorOf() === before, `a re-walk of the same burst appends nothing new and moves nothing (${logCount()} lines)`);
}

// ── ⑥ (P2) ASSIGN, FILTER, WAKE — the engine half of design §7 ───────────
// A mutable poll world (the shipped fake's corpus is fixed, and every leg here
// needs FRESH records after an assignment exists), a ladder STUB with the real
// ladder's contract (a refusal is returned, the engine stashes it), and the
// engine's own verbs. What is pinned: assignment ⇒ ONE `origin:'assignment'`
// reach grant and unassign removes ONLY that row; `authority:'send'` refused
// by both caps and CLAMPED at read time; the estimate over the stored log;
// digest batching (hits pending on the index, ONE delivery per window); the
// per-assignment daily cap HOLDS rather than drops; a refused delivery is
// STASHED through the ladder; a group rotates over its live members and holds
// with no live member; leftovers survive a restart and are delivered as one.
console.log('⑥ (P2) assign, filter, wake');
{
  const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
  const F = require(path.join(REPO, 'src/channel-filter.js'));
  const A = 'fake-poll', CID = 'ops';
  let seqNo = 0;
  const mint = (text, at = Date.now()) => makeRecord({ adapterId: A, convId: CID, vendorId: `p2-${++seqNo}`, at: at + seqNo, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: CID, raw: {} });
  const world = { records: [] };
  function pollAdapter() {
    return {
      kind: A,
      caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'unknown', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata' },
      create() {
        return {
          auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
          async listConversations() { return { conversations: [makeConversation({ id: CID, vendorId: CID, title: 'Ops room', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
          async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
          async history(convId, { anchor = null, limit = 50 } = {}) {
            const all = world.records;
            let idx = 0;
            if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
            const anchorFound = !anchor || idx > 0;
            const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
            return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
          },
          async send() { return { ok: true, vendorMessageId: 'x', at: Date.now(), sentAs: 'user' }; },
          async reconcile() { return { unknown: true }; },
        };
      },
    };
  }
  const ladder = { calls: [], stash: [], refuse: null,
    async deliverToConversation(cid, text, opts) { if (ladder.hang) await ladder.hang; if (ladder.refuse) return { ok: false, reason: ladder.refuse, refused: 'spend' }; ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; },
    stashFor(cid, env) { ladder.stash.push({ cid, ...env }); } };
  let live = [{ cid: 'agent-1', name: 'Worker 1', groups: ['g1'] }, { cid: 'agent-2', name: 'Worker 2', groups: ['g1'] }];
  const p2dir = path.join(ROOT, 'p2');
  // An injected clock: the per-adapter request budget is per MINUTE of the
  // engine's clock and this leg runs a dozen passes, so each pass gets its
  // own minute (the ⑤ idiom).
  const base = Date.now(); let offset = 0;
  const mkP2 = () => {
    const registry = CH.createChannelRegistry();
    registry.register(pollAdapter());
    const e = ENG.create({ dataDir: p2dir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, serverSetting: () => undefined, liveSessions: () => live, now: () => base + offset });
    engines.push(e);
    return e;
  };
  const eng = mkP2();
  const en = () => eng.store.index.snapshot().conversations[`${A}/${CID}`];
  // `setTracked` kicks a fire-and-forget pass; a `pass()` issued while it is
  // in flight JOINS it (single flight per adapter) — so first settle whatever
  // is running, THEN grow the world, THEN pass, or the new records ride a
  // pass that fetched before they existed.
  const ingest = async (...texts) => { await eng.pass(A, { force: true }); offset += 61e3; for (const t of texts) world.records.push(mint(t)); await eng.pass(A, { force: true }); await eng.settleWakes(); };
  await eng.pass(A, { force: true });                      // discovery
  const agent = { principal: { kind: 'agent', id: 'agent-1', name: 'Worker 1' } };

  // (a) not-found + assignment ⇒ reach grant, unassign removes ONLY its own row
  ok((await eng.setAssignment(A, 'nope', agent)).code === 'not-found', 'assigning an undiscovered conversation is a named not-found (no row minted)');
  await eng.store.index.update(() => { const e2 = eng.store.index.entry(A, CID, { create: false }); e2.reachEntries = [{ principal: { kind: 'agent', id: 'agent-1' }, scope: { kind: 'conversation', id: `${A}/${CID}` }, level: 'visible', origin: 'user', at: 1, by: 'user' }]; });
  const userGrant = JSON.stringify(en().reachEntries[0]);
  const a1 = await eng.setAssignment(A, CID, { ...agent, mode: 'all', notify: 'wake', dailyWakeCap: 100 });
  ok(a1.ok && a1.assignment.principal.id === 'agent-1' && a1.assignment.authority === 'draft', 'assign: accepted with defaults (draft)');
  ok(en().reachEntries.length === 2 && en().reachEntries.filter((g) => g.origin === 'assignment').length === 1 && en().reachEntries[1].level === 'visible', 'assignment IMPLIES reach: exactly one grant with origin:assignment beside the user\'s own');
  await eng.setAssignment(A, CID, null);
  ok(en().assignment === null && en().reachEntries.length === 1 && JSON.stringify(en().reachEntries[0]) === userGrant, 'unassign removes ONLY the origin:assignment row — the user\'s grant is byte-identical');

  // (b) authority:'send' is capped by BOTH caps, and clamped at read time
  await eng.refreshConvCaps(A, CID);
  const byPolicy = await eng.setAssignment(A, CID, { ...agent, authority: 'send' });
  ok(!byPolicy.ok && byPolicy.code === 'authority-capped' && /review/.test(byPolicy.error), 'authority:send refused while the channel requires review (decision 9 default)');
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = { mode: 'direct' }; });
  const okSend = await eng.setAssignment(A, CID, { ...agent, authority: 'send' });
  ok(okSend.ok && okSend.assignment.authority === 'send' && !okSend.assignment.authorityClamped, 'authority:send accepted once policy is direct AND the conversation offers send');
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = { mode: 'review' }; });
  const view = eng.digest().conversations.find((c) => c.key === `${A}/${CID}`);
  ok(view.assignment.authority === 'draft' && view.assignment.authorityClamped && /review/.test(view.assignment.authorityWhy) && view.assignment.authorityStored === 'send' && en().assignment.authority === 'send', 'READ-TIME CLAMP: the stored send reads as draft with the reason once policy tightens; the bytes are untouched');
  ok(view.authorityCaps.policyRequiresReview === true && view.authorityCaps.offersSend === true && view.wakeLatency.lane === 'poll' && view.wakeLatency.seconds === 30, 'the digest publishes both caps and the honest poll-lane latency (the hot cadence)');
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = null; });
  await eng.setAssignment(A, CID, null);                 // (c)'s ingest must wake nobody

  // (c) filter validation + the server-side estimate over the stored log
  ok((await eng.setFilter(A, CID, { rules: [{ kind: 'regex', value: 'x' }] })).code === 'bad-filter', 'a filter with an unknown rule kind is refused by name');
  await eng.setTracked(A, CID, true);
  await ingest('GPU down', 'lunch?', 'GPU back', 'ok');
  const est = eng.estimateFilter(A, CID, { rules: [{ kind: 'keyword', value: 'gpu' }] });
  ok(est.ok && est.estimate.total === 4 && est.estimate.matched === 2 && !est.estimate.sampled, `the estimate runs over the stored log (${est.estimate.matched} of ${est.estimate.total})`);
  ok(eng.estimateFilter(A, CID, null).estimate.matched === 4, 'a null filter estimates all messages');
  const fr = await eng.setFilter(A, CID, { rules: [{ kind: 'keyword', value: 'gpu' }] }, { estimate: est.estimate });
  ok(fr.ok && fr.filter.id && fr.filter.estimateAtSet && fr.filter.estimateAtSet.matchedPerDay === est.estimate.matchedPerDay, 'the filter is saved with the estimate it was set on');
  ok((await eng.setAssignment(A, CID, { ...agent, mode: 'filtered', filterId: 'f-nope' })).code === 'no-such-filter', 'a filtered assignment naming a missing filter is refused');

  // (d) digest batching: hits go PENDING on the index, ONE delivery per window
  ladder.calls.length = 0;
  const dg = await eng.setAssignment(A, CID, { ...agent, mode: 'filtered', filterId: fr.filter.id, notify: 'digest', digestMinutes: 5, dailyWakeCap: 100 });
  ok(dg.ok, 'digest assignment accepted');
  await ingest('GPU one', 'noise', 'GPU two');
  ok(ladder.calls.length === 0 && en().pending.length === 2 && eng.pendingWindows().some((w) => w.key === `${A}/${CID}` && w.kind === 'digest'), 'digest mode: 2 hits pending on the index, a digest window armed, nothing delivered yet');
  const before = en().stats.hits7d;
  const flushed = await eng.flushPending(A, CID, { kind: 'digest' });
  ok(flushed.ok && ladder.calls.length === 1 && /^### Channel digest — fake-poll · Ops room — 2 messages in the last 5 min/.test(ladder.calls[0].text) && en().pending.length === 0 && en().stats.wakes.length === 1, 'the window flushes ONE digest delivery listing both hits and clears pending');
  ok(before === 2 && en().stats.hits7d === 2, 'hits are counted at the match, not at the delivery');

  // (e) the pacing cap HOLDS the hits (never drops), and says why — the
  //     digest wake in (d) is already on the ledger, so a cap of 2 leaves
  //     room for exactly one more
  ladder.calls.length = 0;
  const wk = await eng.setAssignment(A, CID, { ...agent, mode: 'filtered', filterId: fr.filter.id, notify: 'wake', dailyWakeCap: 2 });
  ok(wk.ok, 'wake assignment with a daily cap of 2 (one already spent by the digest)');
  await ingest('GPU three');
  ok(ladder.calls.length === 1 && /matched: keyword "gpu"/.test(ladder.calls[0].text), 'first wake delivered and it says why');
  await ingest('GPU four', 'GPU five');
  ok(ladder.calls.length === 1 && en().pending.length === 2 && /daily wake cap reached \(2 of 2/.test(en().stats.lastRefusal.why), `at the cap the hits are HELD (pending 2) and the refusal names the numbers: ${en().stats.lastRefusal.why}`);

  // (f) a refused delivery is stashed through the ladder's own durable stash —
  //     and the two HELD hits ride along with the new one (a hold is a delay)
  await eng.setAssignment(A, CID, { ...agent, mode: 'filtered', filterId: fr.filter.id, notify: 'wake', dailyWakeCap: 100 });
  ladder.refuse = 'spend budget: per-identity-hour';
  await ingest('GPU six');
  ok(ladder.stash.length === 1 && ladder.stash[0].cid === 'agent-1' && ladder.stash[0].source === 'channel' && /GPU six/.test(ladder.stash[0].text) && /GPU four/.test(ladder.stash[0].text) && /GPU five/.test(ladder.stash[0].text) && en().pending.length === 0, 'a refused delivery is stashed for the agent\'s next turn WITH the hits held earlier (nothing is lost) and pending is cleared');
  const last = en().stats.wakes[en().stats.wakes.length - 1];
  ok(last.ok === false && last.lane === 'stash' && /spend budget/.test(last.why) && last.refused === 'spend', 'the ledger records the refused attempt with the ladder\'s reason');
  ladder.refuse = null;

  // (f′) THE DRAIN CARRIES EVERY HIT (the P4 verifier's medium): the only
  //      drain renderer clipped each stash entry to 400 chars, so the agent
  //      got the header plus the first matched message while the engine had
  //      already cleared the rest as "durably stashed". A channel entry is a
  //      producer-budgeted block and is rendered WHOLE; an agent line is still
  //      clipped (control); what does not fit the section is handed BACK.
  {
    const AR = require(path.join(REPO, 'src/agent-routes.js'));
    const six = [];
    for (let i = 0; i < 6; i++) six.push({ record: mint(`hit number ${i} ` + 'y'.repeat(300)), why: ['keyword "gpu"'] });
    const block = F.renderWakeBlock({ adapterLabel: 'fake-poll', title: 'Ops room', convId: CID, hits: six });
    ok(Buffer.byteLength(block) > 1200 && (block.match(/^from Ada at/gm) || []).length === 6, `fixture: a 6-hit block is ${Buffer.byteLength(block)} bytes (the pre-fix clip at 400 chars kept one hit)`);
    const drained = [{ source: 'channel', fromName: 'Channels · fake-poll', text: block, ts: base }, ...ladder.stash.map((s) => ({ ...s, ts: base + 1 }))];
    const r1 = AR.renderMsgStash(drained);
    ok((r1.text.match(/^from Ada at/gm) || []).length === 9 && /GPU four/.test(r1.text) && /GPU five/.test(r1.text) && /GPU six/.test(r1.text) && r1.rest.length === 0 && r1.shown.length === 2, 'ladder refuses ⇒ drainStash ⇒ renderMsgStash: all 6 + 3 hits reach the agent, nothing held back');
    ok(/vibespace-channels reply/.test(r1.text) && !/^\(reply with vibespace-msg/m.test(r1.text), 'the hint names vibespace-channels for a channel entry (the block\'s own reply line rides too)');
    const r2 = AR.renderMsgStash([{ source: 'agent', fromName: 'Peer', text: 'z'.repeat(1000), ts: base }]);
    ok(!/z{401}/.test(r2.text) && new RegExp(`z{${AR.MSG_STASH_LINE_MAX}}`).test(r2.text) && /vibespace-msg send/.test(r2.text) && !/vibespace-channels/.test(r2.text), `CONTROL: an agent message is still one ≤${AR.MSG_STASH_LINE_MAX}-char line with the vibespace-msg hint only`);
    const big = [];
    for (let i = 0; i < 4; i++) big.push({ source: 'channel', fromName: 'Channels · fake-poll', text: F.renderWakeBlock({ adapterLabel: 'fake-poll', title: `room ${i}`, convId: CID, hits: six }), ts: base + i });
    const r3 = AR.renderMsgStash(big);
    ok(r3.shown.length >= 1 && r3.shown.length < 4 && r3.rest.length === 4 - r3.shown.length && r3.rest[0].text === big[0].text && /room 3/.test(r3.text) && !/room 0/.test(r3.text) && new RegExp(`\\(${r3.rest.length} older message\\(s\\) held for your next turn\\)`).test(r3.text), `over the section budget the NEWEST entries render and the oldest ${r3.rest.length} are handed back for the next drain (never dropped), and the block says so`);
    ok(Buffer.byteLength(r3.text) <= AR.MSG_STASH_MAX_BYTES + 256, `the rendered section stays near its budget (${Buffer.byteLength(r3.text)} B ≤ ${AR.MSG_STASH_MAX_BYTES} + head)`);
    const rc = AR.renderMsgStash([{ source: 'channel-receipt', fromName: 'Channels · Outbox', text: 'Channel receipt — x\n' + 'final text:\n' + 'w'.repeat(1500), ts: base }]);
    ok(/w{1500}/.test(rc.text), 'a receipt block (up to 2000 chars of final text) is rendered whole too');
  }

  // (g) a group rotates over its LIVE members, and holds with none
  ladder.calls.length = 0;
  await eng.setAssignment(A, CID, { principal: { kind: 'group', id: 'g1', name: 'On-call' }, mode: 'filtered', filterId: fr.filter.id, notify: 'wake', dailyWakeCap: 100 });
  await ingest('GPU seven');
  await ingest('GPU eight');
  await ingest('GPU nine');
  const targets = ladder.calls.map((c) => c.cid);
  ok(targets.length === 3 && targets[0] !== targets[1] && targets[0] === targets[2], `round-robin over the group's live members: ${targets.join(' → ')}`);
  ok(eng.store.index.snapshot().rotations.g1 === 1, `the rotation cursor lives in the index, wrapped over the member list (${eng.store.index.snapshot().rotations.g1})`);
  live = [];
  await ingest('GPU ten');
  ok(ladder.calls.length === 3 && en().pending.length === 1 && /no live session in group On-call/.test(en().stats.lastRefusal.why), 'no live member ⇒ the hit is HELD for the next turn, never "wake them all"');
  live = [{ cid: 'agent-2', name: 'Worker 2', groups: ['g1'] }];

  // (h) leftovers survive a restart: the new engine schedules a boot flush and delivers ONE digest
  eng.stop();
  const eng2 = mkP2();
  eng2.start();
  ok(eng2.pendingWindows().some((w) => w.key === `${A}/${CID}` && w.kind === 'boot'), 'after a restart the pending hit gets a boot window');
  const boot = await eng2.flushPending(A, CID, { kind: 'boot' });
  const en2 = eng2.store.index.snapshot().conversations[`${A}/${CID}`];
  ok(boot.ok && ladder.calls.length === 4 && ladder.calls[3].cid === 'agent-2' && /^### Channel digest/.test(ladder.calls[3].text) && /GPU ten/.test(ladder.calls[3].text) && en2.pending.length === 0, 'the leftover is delivered as one digest to the now-live member and cleared');

  // (i) THE BOOT RACE (the P4 verifier's low): after a restart the boot flush
  //     and the first tick's pass both fire at 5 s; both read `pending` before
  //     either cleared it, so the same held hit went out TWICE (two billed
  //     turns). Wakes on one conversation are serialized: with the boot flush
  //     held INSIDE the ladder, a fresh hit's direct wake waits, then reads an
  //     index the flush has already cleared. The held hit is delivered once.
  live = [];
  offset += 61e3; world.records.push(mint('GPU eleven')); await eng2.pass(A, { force: true }); await eng2.settleWakes();
  ok(eng2.store.index.snapshot().conversations[`${A}/${CID}`].pending.length === 1, 'fixture: one hit held (no live member)');
  live = [{ cid: 'agent-2', name: 'Worker 2', groups: ['g1'] }];
  eng2.stop();
  const eng3 = mkP2();
  eng3.start();
  const en3 = () => eng3.store.index.snapshot().conversations[`${A}/${CID}`];
  ok(eng3.pendingWindows().some((w) => w.key === `${A}/${CID}` && w.kind === 'boot'), 'the boot window is armed');
  const c0 = ladder.calls.length;
  let release; ladder.hang = new Promise((r) => { release = r; });
  const flushP = eng3.flushPending(A, CID, { kind: 'boot' });       // what the boot timer does
  await sleep(20);                                                     // the flush has read `pending` and sits inside the ladder
  offset += 61e3; world.records.push(mint('GPU twelve'));
  const passP = eng3.pass(A, { force: true });                       // the first tick's pass: a direct wake on the SAME key
  await sleep(30);
  ladder.hang = null; release();
  await flushP; await passP; await eng3.settleWakes();
  const after = ladder.calls.slice(c0);
  ok(after.filter((c) => /GPU eleven/.test(c.text)).length === 1, `the held hit is delivered EXACTLY once (${after.filter((c) => /GPU eleven/.test(c.text)).length}× in ${after.length} deliveries)`);
  ok(after.filter((c) => /GPU twelve/.test(c.text)).length === 1 && en3().pending.length === 0, `the fresh hit is delivered once too and pending is empty (${en3().pending.length})`);

  // (j) A HIT THAT GOES PENDING DURING A WAKE SURVIVES IT: digest mode, one
  //     flush held inside the ladder, a second hit joins the window meanwhile —
  //     the pre-fix `pending = []` dropped it (never delivered, never counted).
  //     A wake clears ONLY what it carried.
  await eng3.setAssignment(A, CID, { principal: { kind: 'agent', id: 'agent-2', name: 'Worker 2' }, mode: 'filtered', filterId: fr.filter.id, notify: 'digest', digestMinutes: 5, dailyWakeCap: 100 });
  offset += 61e3; world.records.push(mint('GPU thirteen')); await eng3.pass(A, { force: true }); await eng3.settleWakes();
  ok(en3().pending.length === 1 && eng3.pendingWindows().some((w) => w.key === `${A}/${CID}` && w.kind === 'digest'), 'fixture: one hit pending under a digest window');
  let release2; ladder.hang = new Promise((r) => { release2 = r; });
  const fp2 = eng3.flushPending(A, CID, { kind: 'digest' });
  await sleep(20);
  offset += 61e3; world.records.push(mint('GPU fourteen')); await eng3.pass(A, { force: true }); await eng3.settleWakes();   // onFresh is tracked; nothing tracked waits on the held flush
  ok(en3().pending.length === 2, `a second hit joined pending while the flush is in flight (${en3().pending.length})`);
  ladder.hang = null; release2();
  await fp2; await eng3.settleWakes();
  ok(en3().pending.length === 1 && /GPU fourteen/.test(en3().pending[0].record.text), 'the wake cleared ONLY the hit it carried — the one that arrived meanwhile is still pending');
  const c1 = ladder.calls.length;
  const fp3 = await eng3.flushPending(A, CID, { kind: 'digest' });
  ok(fp3.ok && ladder.calls.length === c1 + 1 && /GPU fourteen/.test(ladder.calls[c1].text) && !/GPU thirteen/.test(ladder.calls[c1].text) && en3().pending.length === 0, 'the next flush delivers it once, without the one already delivered');
  eng3.stop();
}

for (const e of engines) { try { e.stop(); } catch {} }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
