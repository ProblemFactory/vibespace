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
//   ⑩ (hotfix 2026-09-26, the owner's toast "请求被拒绝: mode 'filtered' needs
//      a filterId") the ACCOUNT and PATTERN grains save a FILTERED assignment
//      whose filter rides INLINE — the engine mints `f-<kind>-<id>` BEFORE the
//      validator runs; every refusal on these routes answers a closed code the
//      client words (zh), never the validator's English sentence; a patched
//      copy with the old validate-first order reproduces the toast
//
// Per-pid scratch dirs (scripts/scratch.mjs), no machine-global name.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let BYPASS_COPY = null;   // ⑫: the (h) control copy — a receipt started outside the ONE door
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
// Each negative control loads a patched copy of a real module. They used to be
// gitignored SIBLINGS (src/.channel-store.prefix-*, src/server/.channels-engine.prefix-*,
// src/channels/.{index,fake}.prefix-*) — a SIGKILL stranded them and every src/
// scanner running beside this suite read them as source. They are written
// outside the tree now (MUTE below); this only removes what a pre-fix run left.
for (const [dir, re] of [['src', /^\.channel-store\.prefix-(\d+)-\d+\.js$/], ['src/server', /^\.channels-engine\.prefix-(\d+)-\d+\.js$/], ['src/channels', /^\.(?:index|fake)\.prefix-(\d+)-\d+\.js$/]]) sweepLegacy(REPO, [dir], re);   // what a pre-fix run stranded (dead PIDs only)

let seq = 0, patchSeq = 0;

const engines = [];
// A patched copy is written OUTSIDE the tree (scripts/mutant-copy.mjs: this
// process's scratch dir, `require` re-bound on line 1 to the real module's
// path, so its relative requires resolve as a sibling's) and must have its OWN
// name: node caches by resolved path, so two controls sharing one filename
// silently drive the FIRST patch twice. `patchPath` names the copy before it
// exists (a copy that requires ANOTHER copy is re-pointed at that path);
// `writeCopy` writes it. The tree census at the end measures the placement.
const MUTE = mutantCopies('chan-engine', REPO);
const copyOrig = new Map();
const patchPath = (dir, base) => { const p = MUTE.pathFor(`${base}-${++patchSeq}`); copyOrig.set(p, `${dir}/${base}.js`); return p; };
const writeCopy = (p, src) => MUTE.write(copyOrig.get(p), src, null, { esm: false, name: path.basename(p, '.cjs') });
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
  // 2026-09-26: no track step — the forced pass discovers AND ingests

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
  // unread counts what arrived after the account was LINKED (§5 invariant 6 as rewritten)
  ok(after2.unread > 0 && after2.unread === eng.store.countSince(A, C, after2.readAt), '…and the panel draws the ones after the link as unread', String(after2.unread));
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
  writeCopy(storeCopy, PRE);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  writeCopy(engCopy, esrc.replace("require('../channel-store.js')", `require(${JSON.stringify(storeCopy)})`));
  try {
    const PE = require(engCopy);
    const eng = PE.create({ dataDir: path.join(ROOT, 'append-fail-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
    engines.push(eng);
    const A = 'fake-poll', C = 'fake-poll-ops';
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
  } finally { /* MUTE's scratch dir is removed at exit */ }
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
  writeCopy(engCopy, PRE);
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
  } finally { /* MUTE's scratch dir is removed at exit */ }
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
  await eng.pass(A, { force: true });          // discovery ANNOUNCES it AND ingests it (2026-09-26: no track step)
  ok(!!(eng.store.index.snapshot().conversations[`${A}/${C}`] || {}).anchor, 'the forced pass discovered and INGESTED the conversation');
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
  writeCopy(engCopy, PRE);
  try {
    const PE = require(engCopy);
    const events = [];
    const eng = PE.create({ dataDir: path.join(ROOT, 'markread-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => events.push(m), now: dayStartClock() });
    engines.push(eng);
    const A = 'fake-poll', C = 'fake-poll-ops';
    await eng.pass(A, { force: true });
    events.length = 0;
    for (let i = 0; i < 6; i++) await eng.markRead(A, C);
    const en = eng.store.index.snapshot().conversations[`${A}/${C}`] || {};
    ok(en.unread > 0,
      'NEGATIVE CONTROL: with `now()` the unread count NEVER reaches zero — the condition an open window re-POSTs on, for ever', String(en.unread));
    ok(events.length === 6,
      'NEGATIVE CONTROL: …and every one of the six no-ops broadcasts, which is the other half of the ~490/s loop', String(events.length));
  } finally { /* MUTE's scratch dir is removed at exit */ }
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
  ok((await eng.setRefresh('no-such-adapter', 'made-up-0', 60)).code === 'not-found',
    'setRefresh on an unknown ADAPTER answers not-found — the route\'s 404 is reachable code');
  ok((await eng.setRefresh('fake-poll', 'made-up-1', 60)).code === 'not-found' && (await eng.refresh('fake-poll', 'made-up-1b')).code === 'not-found' && (await eng.watch('fake-poll', 'made-up-1c')).code === 'not-found',
    '…and so do an unknown CONVERSATION\'s refresh, override and watch on a real adapter');
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
  ok((await eng.setRefresh('fake-poll', 'fake-poll-ops', 60)).ok === true, 'POSITIVE CONTROL: a REAL conversation takes an override');
  ok(await eng.markRead('fake-poll', 'fake-poll-ops') === true, 'POSITIVE CONTROL: …and still marks read');
  ok(eng.store.index.snapshot().conversations['fake-poll/fake-poll-ops']?.refresh?.every === 60, '…and the row is the ingest pass\'s, not a route\'s');
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
  const track = await call('PUT', { path: '/api/channels/:adapterId/:convId/refresh', params: { adapterId: 'nope', convId: 'nope' } }, { every: 60 });
  ok(track.status === 404 && /No such conversation/.test(track.body.error), 'PUT /refresh on an unknown id is a 404 (2026-09-26: the /track route is gone)', JSON.stringify(track));
  ok(!routes.router.stack.some((l) => l.route && /\/track$/.test(l.route.path)), 'there is NO /track route any more — a linked account is fetched whole');
  const read = await call('POST', { path: '/api/channels/:adapterId/:convId/read', params: { adapterId: 'nope', convId: 'nope' } }, {});
  ok(read.status === 404 && /No such conversation/.test(read.body.error), 'POST /read answers the same rather than 200-with-a-mint', JSON.stringify(read));
  const good = await call('PUT', { path: '/api/channels/:adapterId/:convId/refresh', params: { adapterId: 'fake-poll', convId: 'fake-poll-ops' } }, { every: 'paused' });
  ok(good.status === 200 && good.body.ok === true && good.body.refresh.every === 'paused', 'POSITIVE CONTROL: a real conversation still answers 200');
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
  // 2026-09-26: the identity warning rides the FULL view (the composer's), not the slim list row
  const fulls = d.conversations.map((c) => eng.conversationView(c.adapterId, c.id));
  ok(fulls.every((c) => c && c.identityWarning && !('text' in c.identityWarning)), '…and neither does the identity warning (on the full view)', JSON.stringify(fulls[0] && fulls[0].identityWarning));
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
  ok(/opts\.source = lane\.source/.test(esrc) && /e\.adapter\.scanHost\(/.test(esrc), 'the resolved source is handed to history() and scanHost() has a caller');
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
    // r9: the host-facts round trip is the PURE drain's `scanHost` action (src/channel-drain.js rule 14) — the r2 shape has none: the fact off and the performer gone
    .replace('e.dq = Drain.open(e.dq, { origin, force, backoff, timerDue: e.timerDue, hostScan: scanLane });', 'e.dq = Drain.open(e.dq, { origin, force, backoff, timerDue: e.timerDue, hostScan: false });')
    .replace(/            else if \(act\.type === 'scanHost'\) \{[\s\S]*?\n            \} else throw/, '            else throw')
    .replace("      if (lane.via === 'scan') opts.source = lane.source;   // HANDED DOWN, never re-derived by the adapter\n", '')
    .replace("require('../channels/index.js')", `require(${JSON.stringify(idxCopy)})`)
    .replace("require('../channels/fake.js')", `require(${JSON.stringify(fakeCopy)})`);
  ok(IPRE !== isrc && FPRE !== fsrc && !/opts\.source = lane\.source/.test(EPRE) && !/scanHost\(/.test(EPRE.replace(/^\s*\/\/.*$/gm, '')) && !/!lane\.source\) return/.test(EPRE),
    'NEGATIVE CONTROL setup: all three pre-fix pieces were reconstructed from the shipped bytes');
  writeCopy(idxCopy, IPRE); writeCopy(fakeCopy, FPRE); writeCopy(engCopy, EPRE);
  try {
    const PE = require(engCopy);
    const eng = PE.create({ dataDir: path.join(ROOT, 'scan-gate-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
    engines.push(eng);
    const A = 'fake-scan', C = 'fake-scan-ops';
    await eng.pass(A, { force: true });
    const row = eng.digest().conversations.find((c) => c.id === C);
    const n = eng.store.readTail(A, C, { limit: 99 }).length;
    const en = eng.store.index.snapshot().conversations[`${A}/${C}`];
    ok(n > 0 && !!en.anchor && row.lane.why === 'host-facts-stale' && row.lane.source === null && row.freshness.state === 'off',
      `NEGATIVE CONTROL: the r2 engine ingests ${n} records and advances the anchor while the chip says "not scanning" (why host-facts-stale, source null) — the honesty contract publishing the opposite of what happened`,
      JSON.stringify({ n, anchor: en.anchor, lane: row.lane, freshness: row.freshness }));
    ok(eng.adapterRecords().adapters.find((r) => r.id === A).scan.hostFacts === null, 'NEGATIVE CONTROL: …and `scan.hostFacts` is still null after the pass — nothing ever produced it');
  } finally { /* MUTE's scratch dir is removed at exit */ }
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
  writeCopy(engCopy, PRE);
  try {
    const p = await drive(require(engCopy), 'markread-past-pre');
    ok(p.readAt !== p.newestAt && p.readAt >= Date.now() - 60e3, 'NEGATIVE CONTROL: the r2 stamp is now(), not the newest record\'s', `${p.readAt} vs newest ${p.newestAt}`);
    ok(p.b1 === 1 && p.b2 === 1, 'NEGATIVE CONTROL: …so an identical second mark broadcasts AGAIN (the no-op rule was inert)', `${p.b1},${p.b2}`);
    ok(p.unread === 0, 'NEGATIVE CONTROL: …and the backdated arrival is SILENTLY marked read — never badged', String(p.unread));
  } finally { /* MUTE's scratch dir is removed at exit */ }
}

// ── ⑧ A PERSISTED CHANGE BROADCASTS WHETHER OR NOT A PASS IS AFFORDABLE ──
// (r3, re-aimed 2026-09-26: the track step is gone — the owner's per-
// conversation REFRESH OVERRIDE is the persisted per-row choice now.) The r3
// lesson stands: `setTracked(true)`'s only notification was the pass it
// kicked, and a pass the budget refused returned before `notify()` — 26 of 30
// changes silent. The override notifies itself, with no pass at all, even
// with the account's vendor budget spent.
{
  const many = {
    kind: 'many-poll', caps: { ...fake.fakePoll.caps, budget: { unit: 'request', default: 5, settingKey: null, metered: false } },
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
    const budgetHit = (await eng.pass('many-poll', { force: true })).why === 'budget';
    let silent = 0, said = 0;
    for (let i = 0; i < 30; i++) {
      events.length = 0;
      const r = await eng.setRefresh('many-poll', `c${i}`, 300);
      if (!r || !r.ok) continue;
      const told = events.some((m) => m.digest && m.digest.conversations.some((c) => c.id === `c${i}` && c.refresh && c.refresh.every === 300));
      if (told) said++; else silent++;
    }
    eng.store.index.flush();
    const onDisk = Object.values(JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'index.json'), 'utf-8')).conversations).filter((c) => c.refresh && c.refresh.every === 300).length;
    return { silent, said, onDisk, budgetHit };
  };
  const r = await drive(ENG, 'override-budget');
  ok(r.budgetHit, 'FIXTURE: the account\'s vendor budget really was exhausted before the overrides (a zero below would otherwise be vacuous)');
  ok(r.onDisk === 30, 'FIXTURE: all 30 overrides are persisted', String(r.onDisk));
  ok(r.silent === 0 && r.said === 30, 'EVERY override broadcast a digest showing the row\'s new period — a persisted change never depends on whether a pass was affordable', JSON.stringify(r));
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const PRE = esrc.replace("    notify([`${adapterId}/${convId}`]);\n    const en = store.index.peek(`${adapterId}/${convId}`);", "    const en = store.index.peek(`${adapterId}/${convId}`);");
  ok(PRE !== esrc, 'NEGATIVE CONTROL setup: an override with no notify of its own was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  writeCopy(engCopy, PRE);
  try {
    const p = await drive(require(engCopy), 'override-budget-pre');
    ok(p.silent === 30 && p.onDisk === 30, `NEGATIVE CONTROL: without its own notify the override persists all 30 and NO client learns (${p.silent} silent)`, JSON.stringify(p));
  } finally { /* MUTE's scratch dir is removed at exit */ }
}

// ── ⑨ EVERY ROW CLAIMS ITS OWN CADENCE; A DISABLED ACCOUNT'S ROWS ARE `off` ──
// The PURE rules are in test-channel-caps; this is the WIRING (2026-09-26):
// there is no `untracked` state — a row claims the cadence the scheduler
// resolves for it (the same `cadenceFor` the tick reads), and a disabled
// account's rows answer `off` / adapter-disabled.
{
  const { eng } = mkEngine({ name: 'digest-off' });
  await eng.pass('fake-poll', { force: true });
  const u = eng.digest().conversations.find((c) => c.id === 'fake-poll-ops');
  ok(!('tracked' in u) && u.freshness.state === 'bound' && u.freshness.seconds === eng.cadenceOf('fake-poll', 'fake-poll-ops').seconds && u.cadence.seconds === u.freshness.seconds,
    'a discovered row claims the cadence the scheduler keeps for it (no tracked flag, no "not polling")', JSON.stringify({ freshness: u.freshness, cadence: u.cadence }));
  await eng.setRefresh('fake-poll', 'fake-poll-ops', 'paused');
  const pz = eng.digest().conversations.find((c) => c.id === 'fake-poll-ops');
  ok(pz.freshness.state === 'paused' && pz.cadence.paused, 'a PAUSED override says "paused" on the chip', JSON.stringify(pz.freshness));
  const rec = eng.adapterRecords().adapters.find((r) => r.id === 'fake-poll');
  await eng.store.adapters.update(() => { rec.enabled = false; });
  const dd = eng.digest();
  const dis = dd.conversations.find((c) => c.id === 'fake-poll-ops');
  ok(dd.adapters.find((a) => a.id === 'fake-poll').enabled === false && dis.freshness.state === 'off' && dis.freshness.why === 'adapter-disabled',
    'a DISABLED adapter\'s row is `off` / adapter-disabled, and the adapter row says enabled:false beside it', JSON.stringify(dis.freshness));
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
  // relative to now — no calendar date, no time-of-day dependence; AHEAD of the
  // clock (2026-09-26): a burst that arrives after the account was linked is
  // news (unread), the pre-link backlog is not
  const base = Date.now() + 60e3;
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

  // Day 0 (2026-09-26): ONE record — the first ingest anchors the
  // conversation (the backlog before the link counts read), so the burst
  // below is a walk TO THAT ANCHOR, which is the shape this leg is about.
  world.records.push({ vendorId: 'b-m-0', at: Date.now() - 86400e3, author: { id: 'u-ada', name: 'Ada' }, text: 'before the burst' });
  await eng.pass('burst', { force: true });
  ok(anchorOf() === 'b-m-0' && logCount() === 1, 'the forced pass discovered AND ingested the conversation (no track step)', String(anchorOf()));
  // Day 1: 340 messages (the recorded 300+ day) on top.
  for (let i = 0; i < 340; i++) world.records.push(mkRec(i));
  clock += 61e3; world.calls = 0; world.walks = 0;
  await eng.pass('burst', { force: true });
  ok(logCount() === 341 && distinctIds() === 341, `every record of the 340-message day landed in the durable log (${logCount()} lines, ${distinctIds()} distinct)`);
  ok(anchorOf() === 'b-m00339', `the anchor is the NEWEST id after the walk completed (${anchorOf()})`);
  ok(world.calls === Math.ceil(341 / PAGE) && world.walks === 1, `the walk took ${Math.ceil(341 / PAGE)} vendor pages of ${PAGE} in ONE continuation (calls ${world.calls}, walks ${world.walks}) — the fake's oldest-first shape never exercises this`);
  const unread1 = eng.store.index.snapshot().conversations['burst/burst-ops'].unread;
  ok(unread1 === 340, `unread is derived from the log: ${unread1}`);

  // A quiet pass: the newest page carries the anchor, so it costs ONE vendor page.
  clock += 61e3; world.calls = 0; world.walks = 0;
  await eng.pass('burst', { force: true });
  ok(world.calls === 1 && logCount() === 341 && anchorOf() === 'b-m00339', `nothing new ⇒ ONE vendor page, no append, the anchor stays (calls ${world.calls}, log ${logCount()})`);

  // Day 2: another 320 arrive on top. The walk pages newest-first until it
  // MEETS day 1's anchor on the seventh page, appends all 320, and re-anchors.
  for (let i = 340; i < 660; i++) world.records.push(mkRec(i));
  clock += 61e3; world.calls = 0; world.walks = 0;
  const r2 = await eng.pass('burst', { force: true });
  ok(r2.ok === true && r2.changed.includes('burst/burst-ops'), 'the pass completed and named the conversation that grew');
  ok(logCount() === 661 && distinctIds() === 661, `day 2's 320 landed whole on top of day 1 — 661 lines, 661 distinct, ZERO duplicates (${logCount()}/${distinctIds()})`);
  ok(anchorOf() === 'b-m00659', `the anchor moved to day 2's newest (${anchorOf()})`);
  ok(world.calls === 7 && world.walks === 1, `320 new + the anchor on the 7th page ⇒ 7 vendor pages, one continuation (calls ${world.calls}, walks ${world.walks})`);
  ok(eng.store.index.snapshot().conversations['burst/burst-ops'].unread === 660, 'unread counts both days');

  // A burst WIDER than one pass can walk: 1100 new records. MAX_PAGES (20)
  // binds after 1000 records — the pass reports INCOMPLETE, everything it
  // read is durable, the anchor does NOT move.
  for (let i = 660; i < 1760; i++) world.records.push(mkRec(i));
  clock += 61e3; world.calls = 0; world.walks = 0;
  const before = anchorOf();
  const r3 = await eng.pass('burst', { force: true });
  ok(r3.ok === true, 'a pass cut short by the budget is still a passing pass (the adapter answered every page)');
  ok(anchorOf() === before, `an INCOMPLETE walk never advances the anchor (fence 9): still ${anchorOf()}`);
  ok(logCount() >= 661 + 900 && distinctIds() === logCount(), `what the walk read is durable and deduplicated (${logCount()} lines, ${distinctIds()} distinct)`);
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
  ok(en().reachEntries.length === 2 && en().reachEntries.filter((g) => g.origin === 'access').length === 1 && en().reachEntries[1].level === 'visible', 'the compatibility write (R4: one access row + one watcher row) IMPLIES reach: exactly one grant with origin:access beside the user\'s own');
  await eng.setAssignment(A, CID, null);
  ok(en().access.length === 0 && en().watchers.length === 0 && en().reachEntries.length === 1 && JSON.stringify(en().reachEntries[0]) === userGrant, 'unassign (null: both lists emptied) removes ONLY the origin:access row — the user\'s grant is byte-identical');

  // (b) authority:'send' is capped by BOTH caps, and clamped at read time
  await eng.refreshConvCaps(A, CID);
  const byPolicy = await eng.setAssignment(A, CID, { ...agent, authority: 'send' });
  ok(!byPolicy.ok && byPolicy.code === 'authority-capped' && /review/.test(byPolicy.error), 'authority:send refused while the channel requires review (decision 9 default)');
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = { mode: 'direct' }; });
  const okSend = await eng.setAssignment(A, CID, { ...agent, authority: 'send' });
  ok(okSend.ok && okSend.assignment.authority === 'send' && !okSend.assignment.authorityClamped, 'authority:send accepted once policy is direct AND the conversation offers send');
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = { mode: 'review' }; });
  const view = eng.digest().conversations.find((c) => c.key === `${A}/${CID}`);
  ok(view.assignment.authority === 'draft' && view.assignment.authorityClamped && /review/.test(view.assignment.authorityWhy) && view.assignment.authorityStored === 'send' && en().access[0].authority === 'send', 'READ-TIME CLAMP: the stored send reads as draft with the reason once policy tightens; the bytes are untouched');
  const fullView = eng.conversationView(A, CID);
  ok(fullView.authorityCaps.policyRequiresReview === true && fullView.authorityCaps.offersSend === true && fullView.wakeLatency.lane === 'poll' && fullView.wakeLatency.seconds === eng.cadenceOf(A, CID).seconds, 'the FULL view publishes both caps and the honest poll-lane latency (the row\'s own cadence)', JSON.stringify(fullView.wakeLatency));
  await eng.store.index.update(() => { eng.store.index.entry(A, CID, { create: false }).policy = null; });
  await eng.setAssignment(A, CID, null);                 // (c)'s ingest must wake nobody

  // (c) filter validation + the server-side estimate over the stored log
  ok((await eng.setFilter(A, CID, { rules: [{ kind: 'regex', value: 'x' }] })).code === 'bad-filter', 'a filter with an unknown rule kind is refused by name');
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

// ── ⑩ THE INLINE FILTER AT THE ACCOUNT AND PATTERN GRAINS (hotfix 2026-09-26) ──
// The owner handed a Lark account to the Task Group "工作", 开 = 匹配过滤器的消息
// with two time-window rules, 投递 = 每个窗口一份摘要 (window 9999), cap 9999,
// 起草 — and 保存 answered `请求被拒绝: mode 'filtered' needs a filterId`. The
// scope editor sends its filter INSIDE the assignment; the engine validated the
// assignment FIRST (the PURE validator refuses 'filtered' without a filterId)
// and only then minted the id it stores the filter under. Driven here through
// the REAL routes with the owner's exact body, at both grains.
console.log('⑩ the inline filter at the account and pattern grains (the owner\'s toast)');
{
  const F = require(path.join(REPO, 'src/channel-filter.js'));
  // the client's words, in the owner's language (i18n picks its dictionary at import)
  globalThis.localStorage = { getItem: () => 'zh', setItem() {}, removeItem() {} };
  const Wd = await import(path.join(REPO, 'src/lib/channel-words.js'));
  const A = 'fake-poll';
  const WORK = { kind: 'group', id: 'tg-work', name: '工作' };
  const TWO_WINDOWS = { match: 'any', rules: [{ kind: 'time-window', from: '09:00', to: '12:00' }, { kind: 'time-window', from: '14:00', to: '18:00' }] };
  // exactly what showScopeAssignDialog's Save sends: form.read().assignment + `filter` inline, estimateAtSet beside it
  const ownerBody = (extra = {}) => ({ assignment: { principal: WORK, mode: 'filtered', notify: 'digest', digestMinutes: 9999, authority: 'draft', dailyWakeCap: 9999, receiptWake: false, filter: TWO_WINDOWS, ...extra }, estimateAtSet: { matchedPerDay: 3.4, totalPerDay: 12, windowDays: 7, sampled: false, truncated: false, conversations: 2 } });
  const { eng } = mkEngine({ name: 'inline-filter' });
  await eng.pass(A, { force: true });
  routes.setup({ getEngine: () => eng });
  const call = (method, url, body) => new Promise((resolve) => {
    const req = { method, url, params: url.params, query: {}, body: body || {} };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); return this; } };
    const layer = routes.router.stack.find((l) => l.route && l.route.path === url.path && l.route.methods[method.toLowerCase()]);
    if (!layer) return resolve({ status: 0, body: { error: 'no such route' } });
    Promise.resolve(layer.route.stack[0].handle(req, res, () => {})).catch((e) => resolve({ status: 500, body: { error: String(e && e.message) } }));
  });
  const ACCT = { path: '/api/channels/adapters/:id/assignment', params: { id: A } };
  const PATS = { path: '/api/channels/adapters/:id/patterns', params: { id: A } };
  const PAT = (pid) => ({ path: '/api/channels/adapters/:id/patterns/:pid', params: { id: A, pid } });
  const ix = () => eng.store.index.snapshot();

  // (a) THE OWNER'S SAVE, at the account grain
  const r1 = await call('PUT', ACCT, ownerBody());
  ok(r1.status === 200 && r1.body.ok === true, 'the owner\'s exact save (组 · 工作, filtered by two time windows, digest 9999, cap 9999, draft) is ACCEPTED at the account grain', JSON.stringify(r1.body));
  const a1 = r1.body.assignment || {};
  // R4: the compatibility write = ONE access row + ONE watcher row; the inline
  // filter is minted per (grain, principal) BEFORE the validator runs
  const FID = `f-account-${A}|group:tg-work`;
  ok(a1.filterId === FID && a1.filter && a1.filter.rules.length === 2 && a1.filter.rules.every((r) => r.kind === 'time-window'), `the filter is stored under the id the engine minted (${FID}) and the answer carries its two rules`, JSON.stringify({ filterId: a1.filterId, filter: a1.filter }));
  const st1 = (ix().accountAssignments || {})[A] || {};
  const w1 = (st1.watchers || [])[0] || {};
  const fs1 = (ix().filters || {})[FID] || null;
  ok(w1.filterId === FID && w1.mode === 'filtered' && w1.principal && w1.principal.kind === 'group' && w1.principal.id === 'tg-work' && w1.principal.name === '工作' && w1.notify === 'digest' && (st1.access || [])[0] && st1.access[0].authority === 'draft' && !('principal' in st1), 'the STORED account grain holds ONE access row (the group, draft) and ONE watcher (filtered, digest) carrying that filterId — no pre-split fields', JSON.stringify(st1));
  ok(fs1 && fs1.rules.length === 2 && fs1.rules[0].from === '09:00' && fs1.rules[1].to === '18:00' && fs1.estimateAtSet && fs1.estimateAtSet.matchedPerDay === 3.4, 'the filter RECORD is in the filters table with both windows and the estimate the user saw', JSON.stringify(fs1));
  ok(w1.estimateAtSet && w1.estimateAtSet.matchedPerDay === 3.4 && w1.estimateAtSet.conversations === 2, 'the watcher keeps estimateAtSet (the measurement is compared against it later)', JSON.stringify(w1.estimateAtSet));
  ok(w1.digestMinutes === F.MAX_DIGEST_MINUTES && w1.dailyWakeCap === F.MAX_DAILY_WAKE_CAP, `9999 is held to the validator's bounds (window ${F.MAX_DIGEST_MINUTES} min, cap ${F.MAX_DAILY_WAKE_CAP}) — the Notify dialog says so before saving (R4)`, JSON.stringify([w1.digestMinutes, w1.dailyWakeCap]));
  ok((ix().accountGrants || []).filter((g) => g && g.origin === 'access' && g.scope && g.scope.id === A).length === 1, 'the account grain wrote its ONE access grant');
  const dg = eng.digest();
  const acctView = (dg.adapters || []).find((x) => x.id === A);
  ok(acctView && acctView.accountGrain && acctView.accountGrain.watchers[0].filterId === FID && acctView.accountGrain.watchers[0].filter && acctView.accountGrain.watchers[0].filter.rules.length === 2 && acctView.assignment && acctView.assignment.filterId === FID, 'the digest the panel draws carries the account grain with its watcher\'s filter (what the Notify dialog prefills on the next open)', JSON.stringify(acctView && acctView.accountGrain));
  // (b) the EDIT: the dialog re-opens prefilled and re-sends the inline filter
  const r2 = await call('PUT', ACCT, ownerBody({ filter: { match: 'every', rules: [{ kind: 'time-window', from: '10:00', to: '11:00' }] } }));
  const fs2 = (ix().filters || {})[FID] || {};
  ok(r2.status === 200 && r2.body.assignment.filterId === FID && fs2.match === 'every' && fs2.rules.length === 1 && fs2.createdAt === fs1.createdAt, 're-saving the account REPLACES its filter under the same id (createdAt kept)', JSON.stringify({ b: r2.body.assignment && r2.body.assignment.filterId, fs2 }));

  // (c) THE PATTERN GRAIN — create, then edit
  const p1 = await call('POST', PATS, ownerBody({ pattern: { match: 'any', rules: [{ kind: 'title', value: 'announce' }] } }));
  const pid = p1.body.assignment && p1.body.assignment.scope && p1.body.assignment.scope.id;
  ok(p1.status === 200 && p1.body.ok === true && /^pa-/.test(pid || ''), 'the same save at the PATTERN grain is accepted', JSON.stringify(p1.body));
  const PFID = `f-pattern-${pid}|group:tg-work`;
  ok(p1.body.assignment.filterId === PFID && ((ix().filters || {})[PFID] || { rules: [] }).rules.length === 2 && ((((ix().patternAssignments || {})[pid] || {}).watchers || [])[0] || {}).filterId === PFID, `its filter is stored as f-pattern-<id>|<principal> and the stored rule's watcher carries that filterId (${pid})`, JSON.stringify(p1.body.assignment));
  const p2 = await call('PUT', PAT(pid), ownerBody({ pattern: { match: 'any', rules: [{ kind: 'title', value: 'announce' }] }, filter: { match: 'any', rules: [{ kind: 'keyword', value: 'gpu' }] } }));
  ok(p2.status === 200 && p2.body.assignment.filterId === PFID && (ix().filters || {})[PFID].rules[0].kind === 'keyword', 'editing the rule re-sends its filter inline and replaces it under the same id');
  const pa = await call('POST', PATS, { assignment: { principal: WORK, mode: 'all', pattern: { match: 'any', rules: [{ kind: 'title', value: 'ops' }] } } });
  ok(pa.status === 200 && pa.body.assignment.filterId === null && pa.body.assignment.mode === 'all', 'POSITIVE CONTROL: an unfiltered rule still saves with no filter id');

  // (d) EVERY REFUSAL ON THESE ROUTES IS WORDED BY ITS CODE — never the validator's sentence
  const refusals = [
    ['a filtered save with no filter at all', 'PUT', ACCT, { assignment: { principal: WORK, mode: 'filtered' } }, 'bad-assignment', 'filter-missing'],
    ['an empty inline filter', 'PUT', ACCT, ownerBody({ filter: { match: 'any', rules: [] } }), 'bad-filter', 'no-rules'],
    ['a time window typed as "9"', 'PUT', ACCT, ownerBody({ filter: { match: 'any', rules: [{ kind: 'time-window', from: '9', to: '18:00' }] } }), 'bad-filter', 'time-format'],
    ['a keyword rule left empty', 'PUT', ACCT, ownerBody({ filter: { match: 'any', rules: [{ kind: 'keyword', value: '  ' }] } }), 'bad-filter', 'value-required'],
    ['a negative daily cap', 'PUT', ACCT, ownerBody({ dailyWakeCap: -5 }), 'bad-assignment', 'wake-cap'],
    ['no principal', 'PUT', ACCT, ownerBody({ principal: null }), 'bad-assignment', 'principal'],
    ['a pattern rule left empty', 'POST', PATS, ownerBody({ pattern: { match: 'any', rules: [{ kind: 'title', value: '' }] } }), 'bad-pattern', 'value-required'],
    ['a notify mode no control offers (a stale client)', 'PUT', ACCT, ownerBody({ notify: 'carrier-pigeon' }), 'bad-assignment', 'notify'],
  ];
  const leaks = [];
  for (const [what, m, url, body, code, why] of refusals) {
    const r = await call(m, url, body);
    const words = Wd.routeErrorText(r.body);
    const good = r.status === 400 && r.body.code === code && r.body.why === why && r.body.error && !words.includes(r.body.error) && !/[a-zA-Z]{4,} must be|needs a filterId|filterId/.test(words);
    if (!good) leaks.push({ what, status: r.status, body: r.body, words });
  }
  ok(leaks.length === 0, `each of ${refusals.length} refusals on these routes answers 400 + its closed code and the toast words the CODE (zh), never the validator's English sentence`, JSON.stringify(leaks));
  const ownerToast = Wd.routeErrorText({ code: 'bad-assignment', error: "mode 'filtered' needs a filterId", why: 'filter-missing' });
  ok(ownerToast === '过滤器还没保存 — 请先添加规则，再保存', `the owner's refusal, should it ever happen again, reads "${ownerToast}"`);
  // THE CENSUS: the validator's refusal codes are a CLOSED set and every one has words
  const probes = [null, {}, { principal: WORK, mode: 'x' }, { principal: WORK, mode: 'filtered' }, { principal: WORK, notify: 'x' }, { principal: WORK, digestMinutes: 'abc' }, { principal: WORK, authority: 'x' }, { principal: WORK, dailyWakeCap: -1 }, { principal: WORK, scope: { kind: 'x', id: 'y' } }, { principal: WORK, notify: 'digest', dailyWakeCap: 0 }];
  const seen = new Set(probes.map((x) => F.validateAssignment(x, {}).why));
  ok([...seen].sort().join() === [...F.ASSIGN_REFUSALS].sort().join(), `every validateAssignment refusal carries a why from the closed ASSIGN_REFUSALS (${F.ASSIGN_REFUSALS.length}) and the probes reach all of them`, JSON.stringify([...seen]));
  const unworded = F.ASSIGN_REFUSALS.filter((w) => { const s = Wd.assignmentRefusalText(w); return !s || /[a-z]+\.[a-z]+|must be [a-z]+\|/.test(s); });
  ok(unworded.length === 0, 'every ASSIGN_REFUSALS code has words in channel-words (assignmentRefusalText)', unworded.join());
  const FSRC = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
  const ruleCodes = [...new Set([...FSRC.matchAll(/refuse\('([a-z-]+)'/g)].map((m) => m[1]))];
  const rawBack = Wd.RULE_PROBLEM_CODES.filter((c) => !ruleCodes.includes(c) || F.filterProblemText({ ok: false, code: c, error: 'RAW-SENTENCE' }) === 'RAW-SENTENCE');
  ok(ruleCodes.length >= 10 && rawBack.length === 0, `every rule code the dialog's typing can cause (${Wd.RULE_PROBLEM_CODES.length} of the ${ruleCodes.length} refuse codes) is one filterProblemText words; the rest answer the stale-client sentence`, rawBack.join());
  ok(ruleCodes.every((c) => !Wd.ruleRefusalText({ why: c, rule: 'keyword', error: 'RAW-SENTENCE' }, 'filter').includes('RAW-SENTENCE')), 'no rule code in channel-filter.js makes the toast print the contract sentence');
  // CONTROL (the words half): a route that DROPPED the code would print the sentence — what the owner saw
  ok(Wd.routeErrorText({ code: 'bad-assignment', error: "mode 'filtered' needs a filterId" }).includes("mode 'filtered' needs a filterId"), 'CONTROL: without its code the refusal still falls back to the English sentence — the census above would see it');

  // (e) NEGATIVE CONTROL — the pre-fix engine (validate FIRST, mint after) reproduces the toast
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const FIX = "    const v = F.validateAssignment({ ...b, ...(inlineFilterId ? { filterId: inlineFilterId } : {}), scope: { kind, id: site.id } }, site.caps);";
  const PRE = esrc.replace(FIX, '    const v = F.validateAssignment({ ...b, scope: { kind, id: site.id } }, site.caps);');
  ok(PRE !== esrc && esrc.split(FIX).length === 2, 'NEGATIVE CONTROL setup: the pre-fix validate-first order was reconstructed from the shipped bytes');
  const engCopy = patchPath('src/server', 'channels-engine');
  writeCopy(engCopy, PRE);
  const PE = require(engCopy);
  const pe = PE.create({ dataDir: path.join(ROOT, 'inline-filter-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
  engines.push(pe);
  await pe.pass(A, { force: true });
  const b0 = ownerBody();
  const pr1 = await pe.setScopeAssignment(A, { kind: 'account' }, { ...b0.assignment, estimateAtSet: b0.estimateAtSet });
  const pr2 = await pe.setScopeAssignment(A, { kind: 'pattern' }, { ...b0.assignment, pattern: { match: 'any', rules: [{ kind: 'title', value: 'announce' }] }, estimateAtSet: b0.estimateAtSet });
  ok(!pr1.ok && pr1.code === 'bad-assignment' && pr1.error === "mode 'filtered' needs a filterId" && !pr2.ok && pr2.error === "mode 'filtered' needs a filterId", 'NEGATIVE CONTROL: the pre-fix engine refuses the owner\'s save at BOTH grains with exactly the owner\'s sentence', JSON.stringify([pr1, pr2]));
}

// ── ⑪ R4 (2026-09-27): ACCESS AND NOTIFICATION — TWO OPERATIONS, ACCESS FIRST ──
// The owner: "你之前的交互的问题是把'让agent能访问对话'和'让agent会被通知'耦合
// 在一起了" / "这实际上应该是两种不同的操作，前者是后者的前提". Every grain holds
// an ACCESS list and a WATCHERS list. Pinned over the REAL engine + store + a
// ladder stub: a watcher without access is refused BY NAME and removing access
// removes its watcher (control: a copy that keeps it); a wake watcher and a
// digest watcher on ONE conversation keep independent windows and pending
// hits; access alone is never delivered; one batch never bills one session
// twice (a named agent + a group whose round-robin lands on it); the receipt
// wakes only the drafter whose OWN watcher opted in; the compose verb
// (B-6acc) rides the outbox; the agent's search is filtered by reach.
console.log('⑪ R4 access and notification (two operations), compose, search');
{
  const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
  const A = 'r4', OPS = 'ops', LOUNGE = 'lounge';
  let seqNo = 0;
  const world = { [OPS]: [], [LOUNGE]: [] };
  const mint = (conv, text) => makeRecord({ adapterId: A, convId: conv, vendorId: `r4-${++seqNo}`, at: Date.now() + seqNo, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: conv, raw: {} });
  const composed = [];
  const flags = { noScope: false, sendOnly: false };
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata', compose: true },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        async listConversations() { return { conversations: [OPS, LOUNGE].map((id) => makeConversation({ id, vendorId: id, title: id === OPS ? 'Ops room' : 'Lounge', kind: 'group', participants: 'Ada', lastAt: null })), cursor: null, complete: true }; },
        async convCaps() { return flags.sendOnly ? { read: 'yes', sendAs: [], why: 'send-scope-not-granted', at: Date.now() } : { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          const all = world[convId] || [];
          let idx = 0;
          if (anchor) { const at = all.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = all.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        async send(convId, { idemKey }) { return { ok: true, vendorMessageId: `s-${idemKey}`, at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
        async composeCaps() { return flags.noScope ? { sendAs: [], why: 'send-scope-not-granted', at: Date.now() } : { sendAs: ['user'], why: null, at: Date.now() }; },
        async compose(o) { composed.push(o); return { ok: true, vendorMessageId: `m-${o.idemKey}`, threadId: `t-${o.idemKey}`, at: Date.now(), sentAs: 'user' }; },
      };
    },
  };
  const ladder = { calls: [], stash: [], hang: null,
    async deliverToConversation(cid, text, opts) { if (ladder.hang) await ladder.hang; ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; },
    stashFor(cid, env) { ladder.stash.push({ cid, ...env }); } };
  const live = [{ cid: 'agent-A', name: 'Alpha', groups: ['tg-ops'] }, { cid: 'agent-B', name: 'Beta', groups: [] }, { cid: 'agent-W', name: 'Worker', groups: ['tg-work'] }];
  const todos = [];
  const userTodos = { add(key, it) { const x = { id: `todo-${todos.length + 1}`, status: 'open', sessionKey: key, ...it }; todos.push(x); return x; }, get(id) { return todos.find((x) => x.id === id) || null; }, setStatus(id, st) { const x = todos.find((y) => y.id === id); if (x) x.status = st; } };
  const base = Date.now(); let offset = 0;
  const mk = (ENGmod = ENG, name = 'r4') => {
    const dataDir = path.join(ROOT, name);
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    if (!fs.existsSync(path.join(dataDir, 'channels', 'adapters.json'))) fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'R4 mail', enabled: true, linkedAt: 1, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
    const registry = CH.createChannelRegistry(); registry.register(mod);
    const e = ENGmod.create({ dataDir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos, serverSetting: () => undefined, liveSessions: () => live, now: () => base + offset });
    engines.push(e);
    return e;
  };
  const eng = mk();
  const ingest = async (e, conv, ...texts) => { offset += 61e3; for (const t of texts) world[conv].push(mint(conv, t)); await e.pass(A, { force: true }); await e.settleWakes(); };
  await eng.pass(A, { force: true });
  const en = (c = OPS) => eng.store.index.snapshot().conversations[`${A}/${c}`];
  const AL = { kind: 'agent', id: 'agent-A', name: 'Alpha' }, BE = { kind: 'agent', id: 'agent-B', name: 'Beta' }, WORK = { kind: 'group', id: 'tg-work', name: '工作' }, OPSG = { kind: 'group', id: 'tg-ops', name: 'Ops' };
  const OPSC = { kind: 'conversation', convId: OPS };

  // (a) NOTIFICATION NEEDS ACCESS — refused by name; removing access removes the watcher
  const w0 = await eng.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake' }]);
  ok(!w0.ok && w0.code === 'watcher-needs-access' && w0.principal.id === 'agent-A' && /grant access first/.test(w0.error) && !(en().watchers || []).length, 'a notification for an agent with NO access here is refused BY NAME (watcher-needs-access) and nothing is written', JSON.stringify(w0));
  const a1 = await eng.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }, { principal: BE }, { principal: WORK }]);
  ok(a1.ok && a1.access.length === 3 && a1.watchers.length === 0 && en().reachEntries.filter((g) => g.origin === 'access').length === 3, 'GRANT ACCESS (the first operation): three rows, three origin:access grants, no watcher');
  const w1 = await eng.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake' }, { principal: BE, notify: 'digest', digestMinutes: 30 }]);
  ok(w1.ok && w1.watchers.map((w) => `${w.principal.id}:${w.notify}`).join() === 'agent-A:wake,agent-B:digest', 'NOTIFY (the second operation): Alpha wake, Beta digest — both hold access, so both are accepted');
  // (b) ONE conversation, TWO watchers: independent windows, tagged pending, access-only never delivered
  await ingest(eng, OPS, 'GPU one', 'GPU two');
  const toA = ladder.calls.filter((c) => c.cid === 'agent-A');
  ok(toA.length === 1 && /GPU one/.test(toA[0].text) && /also on this conversation: .*Beta \(digest, drafts\)/.test(toA[0].text) && /工作 \(access only, drafts\)/.test(toA[0].text), 'Alpha (wake) is woken ONCE for the batch, and its block names the others on the conversation — Beta watching by digest, 工作 with access only', toA[0] && toA[0].text.split('\n').slice(0, 3).join(' | '));
  ok(ladder.calls.filter((c) => c.cid !== 'agent-A').length === 0 && (en().pending || []).filter((p) => p.for === 'agent:agent-B').length === 2 && eng.pendingWindows().some((w) => w.key === `${A}/${OPS}` && w.principal === 'agent:agent-B' && w.kind === 'digest'), 'Beta (digest) holds its 2 hits PENDING under its OWN window (tagged agent:agent-B), nothing delivered to it yet');
  const fB = await eng.flushPending(A, OPS, { kind: 'digest', pk: 'agent:agent-B' });
  ok(fB.ok && ladder.calls.filter((c) => c.cid === 'agent-B').length === 1 && /^### Channel digest/.test(ladder.calls.find((c) => c.cid === 'agent-B').text) && !(en().pending || []).some((p) => p.for === 'agent:agent-B'), 'Beta\'s window flushes ONE digest for Beta and clears ONLY Beta\'s pending');
  ok(ladder.calls.every((c) => c.cid !== 'agent-W') && !(en().watchers || []).some((w) => w.principal.id === 'tg-work') && !(en().pending || []).some((p) => p.for === 'group:tg-work'), 'group 工作 (ACCESS ONLY) was never delivered, holds no watcher, no ledger, no pending hit');
  const wA = (en().watchers || []).find((w) => w.principal.id === 'agent-A'), wB = (en().watchers || []).find((w) => w.principal.id === 'agent-B');
  ok(wA.stats.wakes.length === 1 && wB.stats.wakes.length === 1 && wA.stats.wakes[0].p === 'agent:agent-A', 'each watcher carries ITS OWN pace ledger (one wake each), the conversation history names the watcher of each wake');
  // (c) REMOVING ACCESS REMOVES THE WATCHER (same write)
  const a2 = await eng.setAccess(A, OPSC, [{ principal: AL }, { principal: WORK }]);
  ok(a2.ok && !(en().watchers || []).some((w) => w.principal.id === 'agent-B') && !en().reachEntries.some((g) => g.principal.id === 'agent-B') && eng.listFor({ kind: 'agent', id: 'agent-B', groups: [] }).conversations.length === 0, 'removing Beta\'s ACCESS removes its notification and its grant in the same write — Beta sees nothing any more');
  // CONTROL: a copy that keeps the watcher when its access goes
  {
    const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
    const LINE = '      watchers = cur.watchers.filter((w) => granted.has(pkOf(w.principal)));';
    const keep = esrc.replace(LINE, '      watchers = cur.watchers;');
    ok(keep !== esrc && esrc.split(LINE).length === 2, 'CONTROL setup: a copy whose access removal keeps the watcher is reconstructed from the shipped bytes');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, keep);
    const ek = mk(require(cp), 'r4-keep');
    await ek.pass(A, { force: true });
    await ek.setAccess(A, OPSC, [{ principal: AL }, { principal: BE }]);
    await ek.setWatchers(A, OPSC, [{ principal: BE, notify: 'wake' }]);
    await ek.setAccess(A, OPSC, [{ principal: AL }]);
    ok((ek.store.index.snapshot().conversations[`${A}/${OPS}`].watchers || []).some((w) => w.principal.id === 'agent-B'), 'CONTROL: that copy leaves a watcher with NO access (Beta would still be woken on a conversation it cannot see) — the leg above would go red');
    ek.stop();
  }
  // (d) ONE BATCH NEVER BILLS ONE SESSION TWICE: Alpha named directly + group Ops whose only live member is Alpha
  await eng.setAccess(A, OPSC, [{ principal: AL }, { principal: OPSG }, { principal: WORK }]);
  await eng.setWatchers(A, OPSC, [{ principal: OPSG, notify: 'wake' }, { principal: AL, notify: 'wake' }]);
  const c0 = ladder.calls.length;
  await ingest(eng, OPS, 'GPU three');
  const batch = ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A');
  ok(batch.length === 1 && /GPU three/.test(batch[0].text) && !(en().pending || []).some((p) => p.for === 'group:tg-ops'), `Alpha named directly AND the Ops group (Alpha its only live member): ONE wake for the batch (${batch.length}), the group's copy counted delivered — never two billed turns`);
  // (e) RECEIPTS (2026-09-27, owner ruling "收件箱里的 approve 动作需要在账号-level 的通知配置里控制行为有点反直觉"):
  // how the drafter hears of a decision is the DECIDER's choice AT the Approve / Reject — the per-watcher
  // `receiptWake` opt-in is DEPRECATED and IGNORED (a stored true no longer wakes anybody)
  await eng.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', receiptWake: true }]);
  ok(eng.deprecatedReceiptWakes().some((d) => d.principal === 'agent:agent-A' && d.grain === 'conversation'), 'the boot census names the watcher that still carries receiptWake:true (one boot line says it is ignored)');
  const pr = await eng.propose({ kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] }, A, OPS, { text: 'on it' });
  ok(pr.ok && pr.proposal.state === 'awaiting-approval', 'Alpha (draft authority) proposes — awaiting approval');
  const c1 = ladder.calls.length;
  await eng.approve(pr.proposal.id, {});
  const rcA = ladder.calls.slice(c1).find((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
  ok(rcA && rcA.opts.noWake === true, 'Alpha\'s watcher still carries receiptWake:true — IGNORED: a plain approve (no choice ⇒ next-turn) rides its next turn (noWake true)');
  const pr2 = await eng.propose({ kind: 'agent', id: 'agent-W', name: 'Worker', groups: ['tg-work'] }, A, OPS, { text: 'noted' });
  const c2 = ladder.calls.length;
  await eng.approve(pr2.proposal.id, { deliver: 'wake-now' });
  const rcW = ladder.calls.slice(c2).find((c) => c.cid === 'agent-W' && c.opts.spendReason === 'channel-receipt');
  const q2 = eng.store.outbox.snapshot().proposals[pr2.proposal.id];
  ok(rcW && rcW.opts.noWake === false && q2.receiptChoice === 'wake-now' && q2.receiptWake && q2.receiptWake.ok === true && q2.receiptWake.reserved === false, 'Worker has NO watcher at all — the decider chose "wake it now" ⇒ its receipt WAKES it (noWake false), the proposal holds its ONE wake row', JSON.stringify(q2.receiptWake));
  const pr3 = await eng.propose({ kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] }, A, OPS, { text: 'again' });
  const c3 = ladder.calls.length;
  await eng.approve(pr3.proposal.id, { deliver: 'next-turn' });
  const rcG = ladder.calls.slice(c3).find((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
  ok(rcG && rcG.opts.noWake === true && !eng.store.outbox.snapshot().proposals[pr3.proposal.id].receiptWake, '"tell it with its next message" ⇒ noWake, no wake row — whatever the watcher config says');
  // (f) the AUTHORITY is the access row's, per principal, finest grain
  const capped = await eng.setAccess(A, { kind: 'account' }, [{ principal: BE, authority: 'send' }]);
  ok(!capped.ok && capped.code === 'authority-capped' && capped.principal.id === 'agent-B', '`send` on the account is refused while the account policy is review (the cap is the ACCESS row\'s), naming the row');
  const fa = await eng.setAccess(A, { kind: 'account' }, [{ principal: BE, authority: 'draft' }]);
  const listB = eng.listFor({ kind: 'agent', id: 'agent-B', groups: [] }).conversations;
  ok(fa.ok && listB.length === 2 && listB.every((c) => c.access && c.access.via === 'account' && c.access.authority === 'draft' && !c.watched), 'Beta has ACCESS to the WHOLE account — every row says so (drafts), watched by nothing', JSON.stringify(listB.map((c) => [c.key, c.access, c.watched])));
  // (g) THE AGENT'S SEARCH — filtered by reach
  await ingest(eng, LOUNGE, 'secret lounge gossip');
  const sA = await eng.searchFor({ kind: 'agent', id: 'agent-W', groups: ['tg-work'] }, 'gossip');
  const sB = await eng.searchFor({ kind: 'agent', id: 'agent-B', groups: [] }, 'gossip');
  ok(sA.ok && sA.results.length === 0 && sB.ok && sB.results.length === 1 && sB.results[0].convId === LOUNGE, 'search: Worker (access to Ops only) finds nothing in the Lounge; Beta (the whole account) finds it — a hit you cannot see is simply absent', JSON.stringify([sA.results.length, sB.results.map((r) => r.key), eng.store.readTail(A, LOUNGE, { limit: 5 }).map((r) => r.text), eng.listFor({ kind: 'agent', id: 'agent-B', groups: [] }).conversations.map((c) => c.key)]));
  ok((await eng.searchFor({ kind: 'agent', id: 'agent-B', groups: [] }, 'x')).code === 'bad-request', 'a one-letter search is refused by name');
  // (h) COMPOSE (B-6acc)
  const W = { kind: 'agent', id: 'agent-W', name: 'Worker', groups: ['tg-work'] };
  const nf = await eng.compose(W, A, { to: 'a@example.com', subject: 'Hi', text: 'hello' });
  ok(!nf.ok && nf.code === 'not-found' && /no access to the whole account/.test(nf.error), 'compose: an agent WITHOUT access to the whole account gets the uniform not-found');
  const Bc = { kind: 'agent', id: 'agent-B', name: 'Beta', groups: [] };
  const badTo = await eng.compose(Bc, A, { to: 'Bob <b@example.com>', subject: 'Hi', text: 'hello' });
  ok(!badTo.ok && badTo.code === 'bad-proposal' && badTo.why === 'address', 'compose: a recipient that is not a plain address is refused by name (a header injection never reaches the MIME)', JSON.stringify(badTo));
  flags.noScope = true;
  const ns = await eng.compose(Bc, A, { to: 'a@example.com', subject: 'Hi', text: 'hello' });
  ok(!ns.ok && ns.code === 'send-not-available' && ns.why === 'send-scope-not-granted' && !Object.values(eng.store.outbox.snapshot().proposals).some((p) => p.compose), 'compose: an account without the send permission answers send-not-available (send-scope-not-granted) and creates NOTHING');
  flags.noScope = false;
  const cm = await eng.compose(Bc, A, { to: 'a@example.com, c@example.com', cc: 'd@example.com', subject: 'Weekly report', text: 'numbers inside' });
  ok(cm.ok && cm.proposal.state === 'awaiting-approval' && cm.proposal.compose.to.join() === 'a@example.com,c@example.com' && cm.proposal.convId === null && cm.proposal.policy.reasons.includes('channel-policy'), 'compose: a NEW message is a PROPOSAL awaiting approval (the account policy is review by default)', JSON.stringify(cm.proposal && cm.proposal.policy));
  ok(todos.some((x) => x.status === 'open' && /New messages awaiting approval on R4 mail/.test(x.text)), 'compose: ONE For-you pointer for the account names the new message');
  ok(composed.length === 0, 'nothing reached the adapter before the approval');
  const ap = await eng.approve(cm.proposal.id, {});
  const sent = eng.store.outbox.snapshot().proposals[cm.proposal.id];
  ok(ap.ok && sent.state === 'sent' && composed.length === 1 && composed[0].to.join() === 'a@example.com,c@example.com' && composed[0].cc.join() === 'd@example.com' && composed[0].subject === 'Weekly report' && sent.convId === `t-${cm.proposal.id}` && sent.result.threadId === `t-${cm.proposal.id}`, 'approve ⇒ the adapter\'s compose (to / cc / subject / the idempotency key) and the proposal adopts the NEW thread id', JSON.stringify(sent.result));
  ok(todos.filter((x) => /New messages awaiting approval/.test(x.text)).every((x) => x.status === 'done'), 'the pointer is retracted by the engine when nothing awaits');
  const audit = eng.store.auditTail().filter((l) => l.kind === 'outbox' && l.proposalId === cm.proposal.id).map((l) => l.op).join();
  ok(audit === 'propose,approve,attempt,outcome', `the audit carries propose → approve → attempt → outcome (${audit})`);
  const rcB = ladder.calls.find((c) => c.cid === 'agent-B' && c.opts.spendReason === 'channel-receipt');
  ok(rcB && /Channel receipt — R4 mail · Weekly report/.test(rcB.text), 'the receipt reaches the drafter, named by its subject');
  // direct: the account policy says direct AND Beta's access holds send AND no guard fires
  await eng.setAccountPolicy(A, 'direct');
  const dr0 = await eng.compose(Bc, A, { to: 'a@example.com', subject: 'Draft only', text: 'plain words' });
  ok(dr0.ok && dr0.proposal.state === 'awaiting-approval' && dr0.proposal.policy.reasons.join() === 'authority', 'compose: a direct account policy with DRAFT authority still waits for the user (reason: authority)');
  const fs2 = await eng.setAccess(A, { kind: 'account' }, [{ principal: BE, authority: 'send' }]);
  ok(fs2.ok, 'with the account policy direct, `send` on Beta\'s account access is accepted');
  const dr = await eng.compose(Bc, A, { to: 'a@example.com', subject: 'Direct', text: 'plain words' });
  ok(dr.ok && dr.proposal.state === 'sent' && composed.length === 2, 'compose: account policy direct + Beta\'s send authority + no guard ⇒ sent at once');
  const lk = await eng.compose(Bc, A, { to: 'a@example.com', subject: 'Link', text: 'see https://example.com/x' });
  ok(lk.ok && lk.proposal.state === 'awaiting-approval' && lk.proposal.policy.reasons.includes('links'), 'compose: a link in the text forces the approval whatever the policy (the guard applies)');
  const wd = await eng.compose(W, A, { to: 'a@example.com', subject: 'x', text: 'y' });
  ok(!wd.ok && wd.code === 'not-found', 'compose: Worker still has no access to the whole account — the direct policy changes nothing about reach');
  // R4 verify (2026-09-27): THE FIRST DIRECT SEND ON A CONVERSATION WHOSE CAPS WERE NEVER RESOLVED —
  // propose resolves them once and must judge the authority against the RESOLVED caps (it read the
  // pre-refresh snapshot: the first send-authority proposal was downgraded to review, reason
  // `authority`, and only the second went direct)
  await eng.store.index.update((ix) => { ix.conversations[`${A}/${LOUNGE}`].convCaps = null; });
  const first = await eng.propose(Bc, A, LOUNGE, { text: 'plain words', why: 'x' });
  ok(first.ok && first.proposal.state === 'sent' && first.proposal.authority === 'send', 'the FIRST direct-policy proposal on a conversation with no cached caps resolves them and goes DIRECT (send authority judged on the resolved caps)', JSON.stringify(first.proposal && { state: first.proposal.state, authority: first.proposal.authority, policy: first.proposal.policy }));
  // A P4-ERA GMAIL TOKEN (readonly + gmail.send): the reply path needs the drafts scope the token
  // lacks ⇒ refused BY NAME before anything is created, while compose (messages.send) still proposes
  flags.sendOnly = true;
  await eng.store.index.update((ix) => { ix.conversations[`${A}/${LOUNGE}`].convCaps = null; });
  const so = await eng.propose(Bc, A, LOUNGE, { text: 'a reply', why: 'x' });
  ok(!so.ok && so.code === 'send-not-available' && so.why === 'send-scope-not-granted' && !Object.values(eng.store.outbox.snapshot().proposals).some((p) => p.text === 'a reply'), 'a token that holds only gmail.send: a REPLY answers send-not-available (send-scope-not-granted) and creates nothing', JSON.stringify(so));
  const soC = await eng.compose(Bc, A, { to: 'a@example.com', subject: 'still composes', text: 'plain words' });
  ok(soC.ok && soC.proposal.state === 'sent', '…and the same account still COMPOSES a new message (messages.send accepts gmail.send)', JSON.stringify(soC.proposal && soC.proposal.state));
  flags.sendOnly = false;
  await eng.setAccountPolicy(A, null);
  // an adapter that declares no compose (the read-only fake-push; Lark declares none either) refuses BY NAME
  const { eng: ef } = mkEngine({ name: 'r4-nocompose' });
  await ef.pass('fake-poll', { force: true });
  const lk2 = require(path.join(REPO, 'src/channels/lark.js'));
  const nc = await ef.compose({ kind: 'user' }, 'fake-push', { to: 'a@example.com', subject: 's', text: 't' });
  ok(!nc.ok && nc.code === 'compose-not-available' && /declares no compose/.test(nc.error) && lk2.caps.compose !== true && require(path.join(REPO, 'src/channels/gmail.js')).caps.compose === true, 'compose on an adapter that declares no compose answers compose-not-available BY NAME (fake-push; Lark declares none, Gmail declares it)', JSON.stringify(nc));
  // ── (f) R4 verify r2 (2026-09-27): THE LADDER IS AN AWAIT. The owner removes Alpha's access while
  // Alpha's wake sits inside the ladder (a spend hold, a remote peer-post); the ladder then REFUSES.
  // The refused block used to be filed into Alpha's durable stash — drained into a session that no
  // longer held access. Now: re-asked after the await, dropped by name, nothing held for Alpha.
const esrc2 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  async function midFlight(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL }]);
    await e.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake' }]);
    let release; const gate = new Promise((r) => { release = r; });
    const orig = ladder.deliverToConversation;
    let inside = 0;
    ladder.deliverToConversation = async () => { inside++; await gate; return { ok: false, reason: 'spend budget: hour-cap', refused: 'spend' }; };
    const s0 = ladder.stash.length;
    offset += 61e3; world[OPS].push(mint(OPS, 'in flight'));
    const pp = e.pass(A, { force: true });
    for (let i = 0; i < 300 && !inside; i++) await sleep(10);
    const rm = await e.setAccess(A, OPSC, []);   // Alpha loses access NOW, the wake still inside the ladder
    release(); await pp; await e.settleWakes();
    ladder.deliverToConversation = orig;
    const en2 = e.store.index.snapshot().conversations[`${A}/${OPS}`];
    return { inside, rmOk: rm.ok, stashedForA: ladder.stash.slice(s0).filter((x) => x.cid === 'agent-A').length, lastWake: (en2.stats.wakes || []).slice(-1)[0] || null, pendingA: (en2.pending || []).filter((x) => x.for === 'agent:agent-A').length };
  }
  const mf = await midFlight(ENG, 'r4-midflight');
  ok(mf.inside === 1 && mf.rmOk && mf.stashedForA === 0, `access removed while the wake is INSIDE the ladder, the ladder refuses ⇒ NOTHING is stashed for Alpha (stashed ${mf.stashedForA})`, JSON.stringify(mf));
  ok(mf.lastWake && mf.lastWake.ok === false && mf.lastWake.refused === 'access-removed' && mf.pendingA === 0, `the ledger says why (refused: ${mf.lastWake && mf.lastWake.refused}) and nothing stays pending for Alpha (${mf.pendingA})`, JSON.stringify(mf.lastWake));
  {
    const LINE = 'const still = ok ? IN_EFFECT : stillInEffect(rec, convId, pk, target);';
    ok(esrc2.split(LINE).length === 2, 'the re-ask line is present once (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, 'const still = IN_EFFECT;'));
    const mfc = await midFlight(require(cp), 'r4-midflight-ctl');
    ok(mfc.stashedForA === 1, `CONTROL: a copy that never re-asks stashes the refused block for the revoked Alpha (${mfc.stashedForA}) — the leg above would go red`);
  }
  // ── (g) 2026-09-27 (money): A RECEIPT WAKE IS THE DECIDER'S CHOICE, ONE PER PROPOSAL. Five rejects,
  // each "wake it now" ⇒ five receipts, five billed turns (each one the owner's own act, the spend ceiling
  // inside the ladder), each on its proposal's ONE row; the SAME proposal's receipt asked again (a
  // reconcile, a retry) never wakes twice; "tell it with its next message" never wakes; a session that is
  // not live is never woken (the stash keeps it); the ceiling's refusal is named and the stash keeps it.
  const Actx = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] };
  async function receiptChoice(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    const c0 = ladder.calls.length;
    const ids = [];
    for (let i = 0; i < 5; i++) { const r = await e.propose(Actx, A, OPS, { text: `draft ${i}`, why: 'x' }); ids.push(r.proposal.id); }
    for (const id of ids) await e.reject(id, { by: 'user', reason: 'no', deliver: 'wake-now' });
    const again = await Promise.all([e.receipt(ids[0]), e.receipt(ids[0]), e.receipt(ids[1])]);   // the same receipts asked again, concurrently
    const rc = ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
    const rows = ids.map((id) => e.store.outbox.snapshot().proposals[id].receiptWake);
    // a next-turn reject never wakes
    const pn = await e.propose(Actx, A, OPS, { text: 'quiet', why: 'x' });
    const cN = ladder.calls.length;
    await e.reject(pn.proposal.id, { by: 'user', reason: 'no', deliver: 'next-turn' });
    const quiet = ladder.calls.slice(cN).filter((c) => c.opts.noWake === false).length;
    // a drafter whose session is not live: never woken, the stash keeps the receipt, the fate says gone
    const gctx = { kind: 'agent', id: 'agent-gone', name: 'Gone', groups: [] };
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }, { principal: { kind: 'agent', id: 'agent-gone', name: 'Gone' }, authority: 'draft' }]);
    const pg = await e.propose(gctx, A, OPS, { text: 'from a dead session', why: 'x' });
    const cG = ladder.calls.length, sG = ladder.stash.length;
    // the real ladder finds no lane to a session that is not live — the fake says so for this one
    const origL = ladder.deliverToConversation;
    ladder.deliverToConversation = async (cid, text, opts) => (cid === 'agent-gone' ? (ladder.calls.push({ cid, text, opts }), { ok: false, reason: 'no live session for this conversation', refused: 'unreachable' }) : origL.call(ladder, cid, text, opts));
    await e.reject(pg.proposal.id, { by: 'user', reason: 'no', deliver: 'wake-now' });
    ladder.deliverToConversation = origL;
    const gp = e.store.outbox.snapshot().proposals[pg.proposal.id];
    const goneCalls = ladder.calls.slice(cG).filter((c) => c.cid === 'agent-gone' && c.opts.noWake === false).length;
    return { receipts: rc.length, billed: rc.filter((c) => c.opts.noWake === false).length, rows: rows.filter((r) => r && r.ok).length, again: again.filter(Boolean).length, quiet, goneCalls, goneStash: ladder.stash.slice(sG).filter((x) => x.cid === 'agent-gone' && x.ref === pg.proposal.id).length, goneFate: P.receiptFateOf(gp), goneWake: gp.receiptWake || null };
  }
  const P = require(path.join(REPO, 'src/channel-policy.js'));
  const rcp = await receiptChoice(ENG, 'r4-receiptchoice');
  ok(rcp.billed === 5 && rcp.rows === 5, `five rejects, each "wake it now" ⇒ five billed receipt wakes, each on its proposal's ONE row (billed ${rcp.billed}, rows ${rcp.rows})`, JSON.stringify(rcp));
  ok(rcp.receipts === 8 && rcp.again === 3, `the SAME receipts asked again (twice for one, once for another, concurrently) are delivered (${rcp.receipts - 5} more) and NEVER wake twice (still ${rcp.billed} billed)`, JSON.stringify(rcp));
  ok(rcp.quiet === 0, '"tell it with its next message" never wakes (noWake on every ladder call)');
  ok(rcp.goneCalls === 0 && rcp.goneStash === 1 && rcp.goneFate && rcp.goneFate.kind === 'gone' && !rcp.goneWake, `a drafter whose session is not live is NEVER woken: the stash keeps the receipt (ref = the proposal), the fate reads "gone" (${rcp.goneFate && rcp.goneFate.kind}), no wake row`, JSON.stringify(rcp));
  {
    // CONTROL: a copy whose wake row is not checked (a second receipt re-reserves) wakes the same proposal again
    const LINE = "      try { await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q && !q.receiptWake) { q.receiptWake = { at: tR, reserved: true, bootId: BOOT_ID, pid: process.pid }; took = true; } }); got = took; }";
    ok(esrc2.split(LINE).length === 2, 'the ONE-row reservation line is present once (the control patches exactly it)');
    const VERD = '    let verdict = P.receiptDeliveryVerdict(cur.receiptChoice, cur, { live });';
    ok(esrc2.split(VERD).length === 2, 'the verdict line is present once (the control strips its row read)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, LINE.replace('if (q && !q.receiptWake)', 'if (q)')).replace(VERD, '    let verdict = P.receiptDeliveryVerdict(cur.receiptChoice, { ...cur, receiptWake: null }, { live });'));
    const rcc = await receiptChoice(require(cp), 'r4-receiptchoice-ctl');
    ok(rcc.billed > 5, `CONTROL: a copy that never reads the proposal's wake row bills the repeated receipts again (${rcc.billed} > 5) — the leg above would go red`);
  }
  // THE CEILING: the ladder refuses the wake by name ⇒ the stash keeps the receipt, the fate names the refusal
  {
    const e = mk(ENG, 'r4-receiptceiling');
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    const pc = await e.propose(Actx, A, OPS, { text: 'over the ceiling', why: 'x' });
    const orig = ladder.deliverToConversation;
    ladder.deliverToConversation = async (cid, text, opts) => { ladder.calls.push({ cid, text, opts }); return opts.noWake === false ? { ok: false, reason: 'the spend ceiling holds — 12 of 12 unattended turns in the last hour', refused: 'spend' } : { ok: true, lane: 'message' }; };
    const s0 = ladder.stash.length;
    await e.approve(pc.proposal.id, { deliver: 'wake-now' });
    ladder.deliverToConversation = orig;
    const q = e.store.outbox.snapshot().proposals[pc.proposal.id];
    const fate = P.receiptFateOf(q);
    ok(q.receiptDelivery && q.receiptDelivery.stashed && q.receiptDelivery.refused === 'spend' && ladder.stash.slice(s0).some((x) => x.ref === pc.proposal.id) && fate.kind === 'waiting' && fate.wakeRefused === 'spend' && /spend ceiling/.test(fate.why), `the ceiling refuses the wake BY NAME (${q.receiptDelivery && q.receiptDelivery.refused}) and the stash keeps the receipt — the fate line: "${P.receiptFateText(fate)}"`, JSON.stringify(q.receiptDelivery));
    ok(q.receiptWake && q.receiptWake.ok === false && q.receiptWake.refused === 'spend', 'the proposal\'s ONE wake row records the refusal (never re-tried as a second wake)');
    e.stop();
  }
  // THE ROUTE (verify 2026-09-27): `deliver` is refused BY NAME, a wake-now needs the `expectWakes` echo (409,
  // nothing billed, the proposal still awaits), a missing field is next-turn; the user-facing router has no withdraw
  {
    const e = mk(ENG, 'r4-receiptroute');
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    routes.setup({ getEngine: () => e, authEnabled: () => true });
    const call = (method, url, body) => new Promise((resolve) => {
      const req = { method, url, params: url.params, query: {}, body: body || {} };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }, setHeader() {} };
      const layer = routes.router.stack.find((l) => l.route && l.route.path === url.path && l.route.methods[method.toLowerCase()]);
      if (!layer) return resolve({ status: 0, body: { error: 'no such route' } });
      Promise.resolve(layer.route.stack[0].handle(req, res, () => {})).catch((err) => resolve({ status: 500, body: { error: String(err && err.message) } }));
    });
    const billedN = () => ladder.calls.filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt' && c.opts.noWake === false).length;
    const pr = await e.propose(Actx, A, OPS, { text: 'route', why: 'x' });
    const st = () => e.store.outbox.snapshot().proposals[pr.proposal.id].state;
    const b0 = billedN();
    const bad = await call('POST', { path: '/api/channels/outbox/:id/approve', params: { id: pr.proposal.id } }, { deliver: 'wake' });
    const badR = await call('POST', { path: '/api/channels/outbox/:id/reject', params: { id: pr.proposal.id } }, { deliver: 'WAKE-NOW' });
    ok(bad.status === 400 && bad.body.code === 'bad-request' && /deliver must be next-turn \| wake-now/.test(bad.body.error) && badR.status === 400 && st() === 'awaiting-approval', 'approve / reject with a `deliver` that is neither word ⇒ 400 by name, the proposal untouched', JSON.stringify(bad.body));
    const noEcho = await call('POST', { path: '/api/channels/outbox/:id/approve', params: { id: pr.proposal.id } }, { deliver: 'wake-now' });
    ok(noEcho.status === 409 && noEcho.body.code === 'wake-count-mismatch' && noEcho.body.wakes === 1 && billedN() === b0 && st() === 'awaiting-approval', 'approve wake-now WITHOUT the expectWakes echo ⇒ 409 wake-count-mismatch (wakes: 1), nothing billed, still awaiting');
    const okA = await call('POST', { path: '/api/channels/outbox/:id/approve', params: { id: pr.proposal.id } }, { deliver: 'wake-now', expectWakes: 1 });
    ok(okA.status === 200 && billedN() === b0 + 1 && st() === 'sent', 'with the echo ⇒ sent, ONE billed receipt wake');
    const pr2 = await e.propose(Actx, A, OPS, { text: 'route 2', why: 'x' });
    const rj = await call('POST', { path: '/api/channels/outbox/:id/reject', params: { id: pr2.proposal.id } }, { reason: 'no', deliver: 'wake-now' });
    const rj2 = await call('POST', { path: '/api/channels/outbox/:id/reject', params: { id: pr2.proposal.id } }, { reason: 'no', deliver: 'wake-now', expectWakes: 1 });
    ok(rj.status === 409 && rj.body.code === 'wake-count-mismatch' && rj2.status === 200 && billedN() === b0 + 2, 'reject wake-now: 409 without the echo (still awaiting), rejected + ONE billed with it');
    const pr3 = await e.propose(Actx, A, OPS, { text: 'route 3', why: 'x' });
    const plain = await call('POST', { path: '/api/channels/outbox/:id/approve', params: { id: pr3.proposal.id } }, {});
    ok(plain.status === 200 && billedN() === b0 + 2 && e.store.outbox.snapshot().proposals[pr3.proposal.id].receiptChoice === 'next-turn', 'no `deliver` at all ⇒ next-turn (the remembered per-device choice never rides the wire as a server default), nothing billed');
    ok(!routes.router.stack.some((l) => l.route && /withdraw/.test(l.route.path)), 'the user-facing router has NO withdraw route — the user rejects; withdraw is the agent route behind msgCaller (a browser there is 403 by name)');
    e.stop();
  }
  // (g2) THE REAL AGENT ROUTES (verify r2, 2026-09-27): a session with no conversation id yet may not draft
  // (`channelPrincipal`'s `webui:` fallback stamped a drafter no drain ever asks for — its receipt stashed under
  // a key the hook never drains, the live session read as "gone", its own later withdraw `not-yours`) — reply /
  // compose / withdraw answer 409 `bad-member` with msg send's sentence and create NOTHING; a browser on the
  // withdraw route (a cookie, no agent token) is 403 `not-yours` by name, never "missing token"
  async function agentRouteLeg(ARmod, name) {
    const e = mk(ENG, name);
    await e.pass(A, { force: true });
    // Alpha by its own id; the Ops Task Group too — a newborn session spawned INTO that group holds the group's
    // access with no conversation id at all (the real-world path to a `webui:` drafter)
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }, { principal: OPSG, authority: 'draft' }]);
    await e.setAccess(A, { kind: 'account' }, [{ principal: AL, authority: 'draft' }]).catch(() => null);
    const sessions = new Map([
      ['w-A', { agentToken: 'vsst_A', claudeSessionId: 'agent-A', name: 'Alpha', cwd: '/tmp', _toolsIntroSeen: true, _mgrIntroSeen: true }],
      ['w-N', { agentToken: 'vsst_N', name: 'Newborn', cwd: '/tmp', _initialGroupId: 'tg-ops', _toolsIntroSeen: true, _mgrIntroSeen: true }],   // no conversation id yet, in the Ops group
      // verify r3: a PENDING fork of Alpha — it still carries Alpha's conversation id (`_forkRequested`, nothing adopted yet)
      ['w-F', { agentToken: 'vsst_F', claudeSessionId: 'agent-A', name: 'Alpha (fork)', cwd: '/tmp', _forkRequested: true, _toolsIntroSeen: true, _mgrIntroSeen: true }],
      // …and a codex-shaped ADOPTED fork: its flag is never cleared, its adoption is read off `forkedFrom` (its own id differs from the source)
      ['w-C', { agentToken: 'vsst_C', backendSessionId: 'thread-C', name: 'Codex fork', cwd: '/tmp', _initialGroupId: 'tg-ops', _forkRequested: true, forkedFrom: ['thread-P'], _toolsIntroSeen: true, _mgrIntroSeen: true }],
    ]);
    const handlers = {};
    const app = { get: (p, h) => { handlers['GET ' + p] = h; }, post: (p, h) => { handlers['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
    ARmod.setupAgentRoutes({
      app, activeSessions: sessions,
      tasks: { groupsForSession: ({ initialGroupId }) => (initialGroupId ? [{ id: initialGroupId }] : []), _persistRescueLine: () => '', backlogNudgeFor: () => '' },
      sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
      userTodos: {}, sessionStatusKey: (s) => 'claude:' + (s.claudeSessionId || 'none'), serverSetting: () => undefined,
      integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: null,
      getChannels: () => e, getGroups: () => null,
    });
    const call = (key, { token = null, headers = {}, body = {}, params = {} } = {}) => new Promise((resolve) => {
      const req = { headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body, params, query: {} };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); return this; }, setHeader() {} };
      const h = handlers[key];
      if (!h) return resolve({ status: 0, body: { error: 'no such route ' + key } });
      Promise.resolve(h(req, res)).catch((err) => resolve({ status: 500, body: { error: String(err && err.message) } }));
    });
    const n0 = Object.keys(e.store.outbox.snapshot().proposals).length;
    const own = await call('POST /api/agent/channels/reply', { token: 'vsst_A', body: { conv: `${A}/${OPS}`, text: 'from Alpha' } });
    const noCidReply = await call('POST /api/agent/channels/reply', { token: 'vsst_N', body: { conv: `${A}/${OPS}`, text: 'from a newborn' } });
    const noCidCompose = await call('POST /api/agent/channels/compose', { token: 'vsst_N', body: { account: A, to: ['x@example.com'], subject: 's', text: 'from a newborn' } });
    const noCidWithdraw = await call('POST /api/agent/channels/proposals/:id/withdraw', { token: 'vsst_N', params: { id: own.body && own.body.proposal ? own.body.proposal.id : 'p-none' } });
    const browser = await call('POST /api/agent/channels/proposals/:id/withdraw', { headers: { cookie: 'vs_token=deadbeef', 'sec-fetch-site': 'same-origin' }, params: { id: own.body && own.body.proposal ? own.body.proposal.id : 'p-none' } });
    const bare = await call('POST /api/agent/channels/proposals/:id/withdraw', { params: { id: 'p-none' } });
    // verify r3: the pending fork may neither take Alpha's draft back nor draft as Alpha; the adopted codex fork drafts as itself
    const ownId = own.body && own.body.proposal ? own.body.proposal.id : 'p-none';
    const forkWithdraw = await call('POST /api/agent/channels/proposals/:id/withdraw', { token: 'vsst_F', params: { id: ownId }, body: { why: 'I am the fork' } });
    const forkReply = await call('POST /api/agent/channels/reply', { token: 'vsst_F', body: { conv: `${A}/${OPS}`, text: 'from the pending fork' } });
    const forkCompose = await call('POST /api/agent/channels/compose', { token: 'vsst_F', body: { account: A, to: ['x@example.com'], subject: 's', text: 'from the pending fork' } });
    const forkArray = await call('POST /api/agent/channels/reply', { token: 'vsst_A', body: { conv: `${A}/${OPS}`, text: 'v2', replaces: [ownId] } });
    const stateAfterFork = e.store.outbox.snapshot().proposals[ownId] ? e.store.outbox.snapshot().proposals[ownId].state : null;
    const madeBeforeCodex = Object.keys(e.store.outbox.snapshot().proposals).length - n0;
    const codex = await call('POST /api/agent/channels/reply', { token: 'vsst_C', body: { conv: `${A}/${OPS}`, text: 'from the adopted codex fork' } });
    // verify r4 (2026-09-27): the FOURTH verb that RECORDS a principal — a reach REQUEST. The lounge is requestable
    // for Alpha (and the Ops group); the pending fork asked AS Alpha (the owner's approval widened Alpha's reach; the
    // fork had nothing once it announced its own id), the newborn as a `webui:` placeholder nobody ever matches
    await e.setAccess(A, { kind: 'account' }, []).catch(() => null);   // Alpha's account-wide access off: the lounge is only REQUESTABLE for it
    await e.setReach(A, LOUNGE, { principal: AL, level: 'requestable' });
    await e.setReach(A, LOUNGE, { principal: OPSG, level: 'requestable' });
    const forkRequest = await call('POST /api/agent/channels/request', { token: 'vsst_F', body: { conv: `${A}/${LOUNGE}`, why: 'the fork wants in' } });
    const noCidRequest = await call('POST /api/agent/channels/request', { token: 'vsst_N', body: { conv: `${A}/${LOUNGE}`, why: 'the newborn wants in' } });
    const ownRequest = await call('POST /api/agent/channels/request', { token: 'vsst_A', body: { conv: `${A}/${LOUNGE}`, why: 'Alpha wants in' } });
    const requests = ((e.store.index.snapshot().conversations[`${A}/${LOUNGE}`] || {}).reachRequests || []).map((r) => `${r.principal.id}:${r.principal.name}`);
    const ownWithdraw = await call('POST /api/agent/channels/proposals/:id/withdraw', { token: 'vsst_A', params: { id: ownId } });
    const made = Object.keys(e.store.outbox.snapshot().proposals).length - n0;
    const drafters = Object.values(e.store.outbox.snapshot().proposals).map((p) => p.draftedBy && p.draftedBy.id);
    e.stop();
    return { own: own.status, ownState: own.body && own.body.proposal && own.body.proposal.state, noCid: [noCidReply, noCidCompose, noCidWithdraw].map((r) => `${r.status}:${r.body.code}`), sentence: noCidReply.body.error, browser: `${browser.status}:${browser.body.code}`, browserText: browser.body.error, bare: bare.status, ownWithdraw: ownWithdraw.status, made, drafters,
      fork: [forkWithdraw, forkReply, forkCompose].map((r) => `${r.status}:${r.body.code}`), forkSentence: forkWithdraw.body.error, stateAfterFork, madeBeforeCodex, forkArray: `${forkArray.status}:${forkArray.body.code}`, codex: `${codex.status}:${codex.body.code || (codex.body.proposal && codex.body.proposal.state)}`,
      request: [forkRequest, noCidRequest, ownRequest].map((r) => `${r.status}:${r.body.code || 'ok'}`), requestSentence: forkRequest.body.error, requests };
  }
  {
    const AR = require(path.join(REPO, 'src/agent-routes.js'));
    const g2 = await agentRouteLeg(AR, 'r4-agentroutes');
    ok(g2.own === 200 && g2.ownState === 'awaiting-approval' && g2.made === 2 && g2.drafters.every((d) => d === 'agent-A' || d === 'thread-C'), 'the REAL reply route: a session WITH its conversation id proposes (drafter = the id; r3: the adopted codex fork\'s draft is the second)', JSON.stringify(g2));
    ok(g2.noCid.every((x) => x === '409:bad-member') && /no conversation id yet — try again after its first turn/.test(g2.sentence), `reply / compose / withdraw from a session with NO conversation id yet ⇒ 409 bad-member by name (${g2.noCid.join(', ')}), nothing created, never a "webui:" drafter`, JSON.stringify(g2));
    ok(g2.browser === '403:not-yours' && /reject it from the card/.test(g2.browserText) && g2.bare === 401, `a BROWSER on the withdraw route (a cookie, no agent token) is 403 not-yours by name — "${g2.browserText}"; a bare call stays 401`);
    ok(g2.ownWithdraw === 200, 'the drafter\'s own withdraw through the real route still answers 200');
    // verify r3 (2026-09-27): A PENDING FORK CARRIES ITS PARENT'S ID — it withdrew the parent's draft (200), drafted AS the
    // parent (the receipt and a "wake now" turn landed on the parent), until the harness announced its own id
    ok(g2.fork.every((x) => x === '409:bad-member') && /a fork that has not announced its own conversation id yet/.test(g2.forkSentence) && g2.stateAfterFork === 'awaiting-approval' && g2.madeBeforeCodex === 1, `a PENDING fork (its parent's conversation id): withdraw / reply / compose ⇒ 409 bad-member by name (${g2.fork.join(', ')}), the parent's draft stands, nothing created`, JSON.stringify(g2));
    ok(g2.codex === '200:awaiting-approval' && g2.drafters.includes('thread-C'), `an ADOPTED codex fork (flag never cleared, adoption in forkedFrom) still drafts, as itself (${g2.codex})`, JSON.stringify(g2.drafters));
    ok(g2.forkArray === '400:bad-request', `\`replaces\` that is not a string (an array naming the id) ⇒ 400 by name (${g2.forkArray})`);
    // verify r4 (2026-09-27): a reach REQUEST records its principal — the pending fork (its parent's id) and the
    // newborn (a `webui:` placeholder) are refused by the same name; Alpha's own request is the ONLY row recorded
    ok(g2.request[0] === '409:bad-member' && g2.request[1] === '409:bad-member' && /a fork that has not announced its own conversation id yet/.test(g2.requestSentence) && g2.request[2] === '200:ok' && g2.requests.length === 1 && g2.requests[0] === 'agent-A:Alpha', `a reach request from a PENDING fork / a session with NO id ⇒ 409 bad-member by name (${g2.request.join(', ')}); the recorded requests are Alpha's own only (${g2.requests.join(', ')})`, JSON.stringify(g2));
    const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
    const G1 = "  const ownR = ownConversationIdOf(s);\n  if (!ownR.cid) return res.status(409).json({ error: ownR.why, code: 'bad-member' });\n  const cidR = ownR.cid;";
    const G2 = "  const ownC = ownConversationIdOf(s);\n  if (!ownC.cid) return res.status(409).json({ error: ownC.why, code: 'bad-member' });   // verify r2: no `webui:` drafter; r3: no borrowed (pending fork) id";
    const G3 = "  if (who.s && !who.job) { const ownW = ownConversationIdOf(who.s); if (!ownW.cid) return res.status(409).json({ error: ownW.why, code: 'bad-member' }); }";
    const G4 = "  const ownQ = ownConversationIdOf(s);\n  if (!ownQ.cid) return res.status(409).json({ error: ownQ.why, code: 'bad-member' });";
    ok([G1, G2, G3, G4].every((g) => asrc.split(g).length === 2), 'the four own-conversation-id guards (reply / compose / withdraw / request) are present once each (the control removes exactly them)');
    const cp = patchPath('src', 'agent-routes'); writeCopy(cp, asrc.replace(G1, "  const cidR = s.claudeSessionId || s.backendSessionId || null;").replace(G2, '').replace(G3, '').replace(G4, ''));
    const g2c = await agentRouteLeg(require(cp), 'r4-agentroutes-ctl');
    ok(g2c.noCid[0] === '200:undefined' && g2c.drafters.some((d) => /^webui:/.test(d)), `CONTROL: the routes without the guards create a draft whose drafter is "webui:<id>" (${g2c.drafters.find((d) => /^webui:/.test(d))}) — the leg would go red`, JSON.stringify(g2c));
    ok(g2c.fork[0] === '200:undefined' && g2c.stateAfterFork === 'withdrawn' && g2c.fork[1] === '200:undefined', `CONTROL: without the guard the pending fork withdraws its parent's draft and drafts as the parent (${g2c.fork.join(', ')}) — the leg would go red`);
    ok(g2c.request[0] === '200:ok' && g2c.requests.some((r) => r === 'agent-A:Alpha (fork)') && g2c.requests.some((r) => /^webui:/.test(r)), `CONTROL: without the request guard the pending fork asks AS Alpha under the fork's name and the newborn as webui:<id> (${g2c.requests.join(', ')}) — the leg would go red`);
  }
  // ── (h) THE DOOR: the receipt still enters only through `billedWake` (the census ⑫ below reads the shipped
  // bytes); this copy starts it OUTSIDE the door — ⑫'s bypass control reddens on it
  {
    const LINE = '    return billedWake({ conv: key || `proposal:${id}`, scopeOf: null }, () => receiptNow(id, p, rc, cid, rec, key));';
    ok(esrc2.split(LINE).length === 2, 'the receipt door line is present once (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, '    return receiptNow(id, p, rc, cid, rec, key);'));
    BYPASS_COPY = cp;
    const e = mk(require(cp), 'r4-receipt-bypass');
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    const pb = await e.propose(Actx, A, OPS, { text: 'bypass', why: 'x' });
    const r = await e.reject(pb.proposal.id, { by: 'user', reason: 'no' });
    ok(r.ok, 'the bypass copy still runs (the census, not a behaviour change, is what catches it)');
    e.stop();
  }
  // ── (i) R4 verify r3: A DEAD GROUP MEMBER IS NOT A REMOVED NOTIFICATION. The member a group wake
  // was sent to dies while the wake sits in the ladder; the group (other members live) still
  // watches ⇒ the hits are HELD for its next wake (refused: member-gone), never stashed for the dead
  // session and never dropped as access-removed; the next record wakes another member with both.
  async function memberGone(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: WORK }]);
    await e.setWatchers(A, OPSC, [{ principal: WORK, notify: 'wake' }]);
    live.push({ cid: 'agent-W2', name: 'Worker2', groups: ['tg-work'] });
    let release; const gate = new Promise((r) => { release = r; });
    const orig = ladder.deliverToConversation;
    let inside = null;
    ladder.deliverToConversation = async (cid) => { inside = cid; await gate; return { ok: false, reason: `session ${cid} is gone`, refused: 'unreachable' }; };
    const s0 = ladder.stash.length;
    offset += 61e3; world[OPS].push(mint(OPS, 'member dies'));
    const pp = e.pass(A, { force: true });
    for (let i = 0; i < 300 && !inside; i++) await sleep(10);
    const gone = inside;
    const k = live.findIndex((x) => x.cid === gone); if (k >= 0) live.splice(k, 1);   // the woken member dies NOW
    release(); await pp; await e.settleWakes();
    ladder.deliverToConversation = orig;
    const en2 = e.store.index.snapshot().conversations[`${A}/${OPS}`];
    const last = (en2.stats.wakes || []).slice(-1)[0] || null;
    const held = (en2.pending || []).filter((x) => x.for === 'group:tg-work').length;
    const c0 = ladder.calls.length;
    offset += 61e3; world[OPS].push(mint(OPS, 'after the death'));
    await e.pass(A, { force: true }); await e.settleWakes();
    const next = ladder.calls.slice(c0).filter((c) => c.opts.spendReason === 'channel-message');
    const other = live.find((x) => x.groups.includes('tg-work'));
    for (const x of live.splice(0)) if (x.cid !== 'agent-W2') live.push(x);   // restore the fixture's roster
    if (!live.some((x) => x.cid === 'agent-W')) live.push({ cid: 'agent-W', name: 'Worker', groups: ['tg-work'] });
    return { gone, stashedForGone: ladder.stash.slice(s0).filter((x) => x.cid === gone).length, refused: last && last.refused, held, nextTo: next[0] && next[0].cid, nextN: next.length, nextCard: next[0] && next[0].opts.cardText, other: other && other.cid };
  }
  const mg = await memberGone(ENG, 'r4-membergone');
  ok(mg.gone && mg.stashedForGone === 0 && mg.held === 1 && mg.refused === 'member-gone', `the member woken (${mg.gone}) died mid-wake ⇒ nothing stashed for it, the hit HELD for the group (pending ${mg.held}), the ledger says member-gone (${mg.refused})`, JSON.stringify(mg));
  ok(mg.nextN === 1 && mg.nextTo && mg.nextTo !== mg.gone && /2 messages/.test(mg.nextCard || ''), `the next record wakes a live member (${mg.nextTo}) once, carrying both hits (${mg.nextCard})`, JSON.stringify(mg));
  {
    const LINE = 'return { watched: true, targetGone: !!(target && target.via === \'group\' && !groupStillHas(item.watcher, target.cid)) };';
    ok(esrc2.split(LINE).length === 2, 'the two-answer line is present once (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, "return { watched: !(target && target.via === 'group' && !groupStillHas(item.watcher, target.cid)), targetGone: false };"));
    const mgc = await memberGone(require(cp), 'r4-membergone-ctl');
    ok(mgc.held === 0 && mgc.refused === 'access-removed', `CONTROL: the r2 one-answer copy drops the group's hit as access-removed (held ${mgc.held}, refused ${mgc.refused}) — the legs above would go red`);
  }
  // ── (j) R4 verify r4 (money): A WAKE QUEUED BEHIND ONE IN FLIGHT IS NOT STARTED AFTER stop().
  // Two conversations of one account queue on ONE scope chain; the first wake sits inside the ladder
  // when the engine stops. The queued one used to run to completion — a billed turn started into a
  // process on its way out — and, because the store had closed, the hold a stopped wake writes never
  // reached the disk (markDirty dropped a change after close()). Now: the queued wake HOLDS its fresh
  // hits (`why:'stopped'`), the in-flight one's outcome row and that hold are on disk when settle returns.
  async function stopMidChain(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, { kind: 'account' }, [{ principal: AL }]);
    await e.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'wake', dailyWakeCap: 50 }]);
    let release; const gate = new Promise((r) => { release = r; });
    const orig = ladder.deliverToConversation;
    let inside = 0;
    ladder.deliverToConversation = async (cid, text, opts) => { inside++; await gate; ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; };
    const c0 = ladder.calls.length;
    offset += 61e3; world[OPS].push(mint(OPS, 'in flight at stop')); world[LOUNGE].push(mint(LOUNGE, 'queued behind at stop'));
    const pp = e.pass(A, { force: true });
    for (let i = 0; i < 300 && !inside; i++) await sleep(10);
    e.stop();   // one wake inside the ladder, one queued on the account's scope chain
    release(); await pp; await e.settleWakes();
    ladder.deliverToConversation = orig;
    const disk = JSON.parse(fs.readFileSync(path.join(ROOT, name, 'channels', 'index.json'), 'utf-8'));
    const held = Object.values(disk.conversations).filter((x) => x.adapterId === A).reduce((n, x) => n + (x.pending || []).filter((p) => p.for === 'agent:agent-A').length, 0);
    const rows = ((((disk.accountAssignments || {})[A] || {}).watchers || [])[0] || { stats: { wakes: [] } }).stats.wakes || [];
    return { inside, calls: ladder.calls.slice(c0).filter((c) => c.opts.spendReason === 'channel-message').length, held, rows: rows.length, final: rows.filter((r) => r.ok === true && r.lane === 'message' && !r.reserved).length };
  }
  const sm = await stopMidChain(ENG, 'r4-stopmid');
  ok(sm.inside === 1 && sm.calls === 1, `stop() with one wake inside the ladder and one queued ⇒ only the in-flight one reaches the ladder (${sm.calls} call; the queued one is NOT a billed turn after stop)`, JSON.stringify(sm));
  ok(sm.held === 1 && sm.rows === 1 && sm.final === 1, `ON DISK after settle: the queued wake's hit is held for the next boot (${sm.held}) and the in-flight wake's outcome row is final (${sm.final} of ${sm.rows}) — both written after close()`, JSON.stringify(sm));
  {
    const LINE = "    if (stopped) { if (!fromPending) await keepPending(rec, convId, freshHits, elided, pk); return { ok: false, why: 'stopped', held: true }; }";
    ok(esrc2.split(LINE).length === 2, 'the stop guard line is present once in wakeNow (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, ''));
    const smc = await stopMidChain(require(cp), 'r4-stopmid-ctl');
    ok(smc.calls === 2 && smc.held === 0, `CONTROL: a copy without the stop guard starts the queued wake after stop() (${smc.calls} calls, ${smc.held} held) — the legs above would go red`);
    // the store half: the pre-fix markDirty dropped a change after close() (the debounce was gone) — the hold never reached the disk
    const ssrc = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
    const SLINE = "    if (closed) { try { flush(); } catch (e) { warn('[channels] index.json not written after close:', (e && e.message) || e); } return; }\n    if (debounce) return;";
    ok(ssrc.split(SLINE).length === 2, 'the post-close flush lines are present once in the store (the control patches exactly them)');
    const sc = patchPath('src', 'channel-store'); writeCopy(sc, ssrc.replace(SLINE, '    if (debounce || closed) return;'));
    const ec = patchPath('src/server', 'channels-engine'); writeCopy(ec, esrc2.replace("require('../channel-store.js')", `require(${JSON.stringify(sc)})`));
    const smc2 = await stopMidChain(require(ec), 'r4-stopmid-storectl');
    ok(smc2.calls === 1 && smc2.held === 0, `CONTROL: the engine over the pre-fix store holds the queued hit in memory only — nothing on disk after close() (${smc2.held} held, ${smc2.final} final rows) — the on-disk leg would go red`);
  }
  // ── (k) R4 verify r4 (money): THE LEDGER ROW IS RESERVED BEFORE THE BILL. A store that could not take
  // the wake's row used to be billed WITHOUT BOUND: the row was written after the ladder, so a failing
  // write left the cap at zero forever (fifty wakes under a cap of 3 on the r3 tree). Now the row is
  // reserved inside the section before the ladder is asked — no row ⇒ no ladder call ⇒ the hits are
  // HELD — and a finalize that fails leaves the reservation COUNTED (one slot burnt, never one turn uncounted).
  async function ledgerUnwritable(ENGmod2, name, where, { once = false } = {}) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, { kind: 'account' }, [{ principal: AL }]);
    await e.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'wake', dailyWakeCap: 2 }]);
    const origU = e.store.index.update;
    let trips = 0;
    e.store.index.update = (fn) => { if ((!once || trips < 1) && where.test(String(fn))) { trips++; return Promise.reject(new Error('disk full')); } return origU(fn); };
    const c0 = ladder.calls.length;
    for (let k = 0; k < 5; k++) { offset += 61e3; world[OPS].push(mint(OPS, `unwritable ${k}`)); await e.pass(A, { force: true }); await e.settleWakes(); }
    e.store.index.update = origU;
    const en2 = e.store.index.snapshot().conversations[`${A}/${OPS}`];
    const rows = ((((e.store.index.snapshot().accountAssignments || {})[A] || {}).watchers || [])[0] || { stats: { wakes: [] } }).stats.wakes || [];
    return { trips, billed: ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-message').length, pending: (en2.pending || []).filter((x) => x.for === 'agent:agent-A').length, reserved: rows.filter((r) => r.reserved === true).length, counted: rows.filter((r) => r.ok !== false).length };
  }
  const lu = await ledgerUnwritable(ENG, 'r4-ledger-unwritable', /stats\.wakes/);
  ok(lu.trips >= 5 && lu.billed === 0 && lu.pending === 5, `a ledger that cannot take the row ⇒ NO wake is billed (${lu.billed} of 5), every hit is HELD (${lu.pending}) — the reservation refused before the ladder`, JSON.stringify(lu));
  const lf = await ledgerUnwritable(ENG, 'r4-ledger-finalize', /finalizeRow\(/, { once: true });
  ok(lf.trips === 1 && lf.billed === 2 && lf.reserved === 1 && lf.counted === 2, `a finalize that fails once ⇒ the reservation stays COUNTED: under a cap of 2, exactly 2 billed (1 stuck reservation + 1 final), the rest held (billed ${lf.billed}, reserved ${lf.reserved}, counted ${lf.counted})`, JSON.stringify(lf));
  {
    const LINE = '    const resId = await reserveWake(rec, convId, item, wk0);';
    ok(esrc2.split(LINE).length === 2, 'the reservation line is present once in wakeNow (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, "    const resId = 'late';"));
    const luc = await ledgerUnwritable(require(cp), 'r4-ledger-unwritable-ctl', /stats\.wakes/);
    ok(luc.billed === 5, `CONTROL: a copy that writes the row AFTER the ladder bills every wake under a cap of 2 when the write fails (${luc.billed} of 5) — the leg above would go red`);
  }
  // ── (l) R4 verify r5: ONE BAD RECORD DOES NOT DROP A CONVERSATION'S BATCH. onFresh is tracked per
  // conversation, so a throw in it never ends the pass or reaches another conversation (the r4 note's
  // "remaining conversations" was already bounded by `track`); the residual was that a single record the
  // matcher could not handle rejected the WHOLE conversation's batch — the good records lost with it. A
  // mutant channel-filter whose matchRecord throws on a POISON record, fed to the engine: the poison is
  // skipped and the good record still wakes; a second conversation wakes regardless. Control: the
  // per-record guard reverted loses the poisoned conversation's good record too.
  {
    const cfsrc = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    const CFA = 'function matchRecord(filter, record, ctx = {}) {';
    ok(cfsrc.split(CFA).length === 2, 'the matchRecord anchor is present once (the poison mutant patches it)');
    const cfp = patchPath('src', 'channel-filter');
    writeCopy(cfp, cfsrc.replace(CFA, CFA + "\n  if (record && typeof record.text === 'string' && record.text.indexOf('POISON') >= 0) throw new Error('poison: matchRecord cannot handle this record');"));
    const engPoison = esrc2.replace("require('../channel-filter.js')", `require(${JSON.stringify(cfp)})`);
    const CATCH = "} catch (err) { log.warn(`[channels] ${rec.id}/${convId}: a record could not be matched for ${pkOf(w.principal)} — skipped: ${(err && err.message) || err}`); }";
    ok(esrc2.split(CATCH).length === 2, 'the per-record match guard is present once (the control reverts exactly it)');
    async function onFreshThrow(engSrc, name) {
      const ep = patchPath('src/server', 'channels-engine'); writeCopy(ep, engSrc);
      const e = mk(require(ep), name);
      await e.pass(A, { force: true });
      const fr = await e.setFilter(A, OPS, { rules: [{ kind: 'keyword', value: 'gpu' }] });
      await e.setAccess(A, OPSC, [{ principal: AL }]);
      await e.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', mode: 'filtered', filterId: fr.filter.id }]);
      await e.setAccess(A, { kind: 'conversation', convId: LOUNGE }, [{ principal: BE }]);
      await e.setWatchers(A, { kind: 'conversation', convId: LOUNGE }, [{ principal: BE, notify: 'wake' }]);
      const c0 = ladder.calls.length;
      offset += 61e3;
      world[OPS].push(mint(OPS, 'gpu good record'), mint(OPS, 'POISON gpu record'));
      world[LOUNGE].push(mint(LOUNGE, 'gpu lounge news'));
      const p = await e.pass(A, { force: true }); await e.settleWakes();
      const calls = ladder.calls.slice(c0).filter((c) => c.opts.spendReason === 'channel-message');
      return { passOk: p.ok === true, ops: calls.filter((c) => c.cid === 'agent-A').length, lounge: calls.filter((c) => c.cid === 'agent-B').length };
    }
    const of = await onFreshThrow(engPoison, 'r4-onfresh');
    ok(of.passOk && of.ops === 1 && of.lounge === 1, `a poison record is skipped: the good record still wakes Alpha (${of.ops}), the pass completes, and a second conversation wakes Beta regardless (${of.lounge})`, JSON.stringify(of));
    const ofc = await onFreshThrow(engPoison.replace(CATCH, '} catch (err) { throw err; }'), 'r4-onfresh-ctl');
    ok(ofc.passOk && ofc.ops === 0 && ofc.lounge === 1, `CONTROL: the per-record guard reverted loses the poisoned conversation's GOOD record too (Alpha ${ofc.ops}); the pass still completes and the other conversation still wakes (${ofc.lounge}) — the leg above would go red`);
  }
  // ── (m) R4 verify r5 (money): A CRASH'S STUCK WAKE RESERVATION IS RELEASED AT THE NEXT BOOT. A wake
  // reserves its ledger row before the ladder; if the process dies between the reservation and the
  // finalize, the row stays reserved (counting against the cap) for 24 h with no live process. A fresh
  // boot releases a PREVIOUS boot's stuck reservations (bootId mismatch), so the cap is freed; a
  // reservation from THIS boot (an in-flight wake) is never released.
  {
    async function crashRelease(ENGmod2, name) {
      const e1 = mk(ENGmod2, name);
      await e1.pass(A, { force: true });
      await e1.setAccess(A, { kind: 'account' }, [{ principal: AL }]);
      await e1.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'wake', dailyWakeCap: 3 }]);
      const t = base + offset;
      await e1.store.index.update((ix) => { const w = ix.accountAssignments[A].watchers[0]; if (!w.stats) w.stats = { wakes: [], hits: [] }; for (let i = 0; i < 3; i++) w.stats.wakes.push({ at: t, n: 1, cid: 'agent-A', ok: true, lane: 'reserved', reserved: true, bootId: 'dead-boot', pid: 999999, id: `ghost-${i}` }); });
      e1.stop();   // the process is gone; the reserved rows are flushed to disk
      const diskRows = (n) => ((((JSON.parse(fs.readFileSync(path.join(ROOT, n, 'channels', 'index.json'), 'utf-8')).accountAssignments || {})[A] || {}).watchers || [])[0] || { stats: { wakes: [] } }).stats.wakes;
      const before = diskRows(name).filter((r) => r.reserved).length;
      const e2 = mk(ENGmod2, name);   // a fresh boot (new BOOT_ID) over the same store
      e2.start(); await e2.settleWakes();
      const rows = ((((e2.store.index.snapshot().accountAssignments || {})[A] || {}).watchers || [])[0] || { stats: { wakes: [] } }).stats.wakes;
      const c0 = ladder.calls.length;
      offset += 61e3; world[OPS].push(mint(OPS, 'after the release'));
      await e2.pass(A, { force: true }); await e2.settleWakes();
      return { before, stillReserved: rows.filter((r) => r.reserved).length, billed: ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-message').length };
    }
    const cr = await crashRelease(ENG, 'r4-resv-crash');
    ok(cr.before === 3 && cr.stillReserved === 0 && cr.billed === 1, `three stuck reservations from a dead boot ⇒ the fresh boot releases them (${cr.stillReserved} left of ${cr.before}) and the freed cap wakes again (${cr.billed})`, JSON.stringify(cr));
    async function sameBootSurvives(ENGmod2, name) {
      const e = mk(ENGmod2, name);
      await e.pass(A, { force: true });
      await e.setAccess(A, { kind: 'account' }, [{ principal: AL }]);
      await e.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'wake', dailyWakeCap: 3 }]);
      let release; const gate = new Promise((r) => { release = r; });
      const orig = ladder.deliverToConversation;
      let inside = 0;
      ladder.deliverToConversation = async (cid, text, opts) => { inside++; await gate; ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; };
      offset += 61e3; world[OPS].push(mint(OPS, 'in flight during a sweep'));
      const pp = e.pass(A, { force: true });
      for (let i = 0; i < 300 && !inside; i++) await sleep(10);
      const reservedNow = () => (((e.store.index.snapshot().accountAssignments[A] || {}).watchers || [])[0] || { stats: { wakes: [] } }).stats.wakes.filter((r) => r.reserved).length;
      const before = reservedNow();
      const releasedN = await e.releaseStaleReservations();   // a sweep WHILE the wake is in flight
      const after = reservedNow();
      release(); ladder.deliverToConversation = orig; await pp; await e.settleWakes();
      return { before, releasedN, after };
    }
    const sb = await sameBootSurvives(ENG, 'r4-resv-sameboot');
    ok(sb.before === 1 && sb.releasedN === 0 && sb.after === 1, `a reservation from THIS boot (an in-flight wake) survives a release sweep (${sb.after} of ${sb.before}, released ${sb.releasedN})`, JSON.stringify(sb));
    {
      const LINE = 'w.stats.wakes = w.stats.wakes.filter((r) => !(r && r.reserved === true && r.bootId !== BOOT_ID));';
      ok(esrc2.split(LINE).length === 2, 'the boot-scoped release line is present once (the control patches exactly it)');
      const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, 'w.stats.wakes = w.stats.wakes.filter((r) => !(r && r.reserved === true));'));
      const sbc = await sameBootSurvives(require(cp), 'r4-resv-sameboot-ctl');
      ok(sbc.releasedN === 1 && sbc.after === 0, `CONTROL: a copy that releases EVERY reservation drops the in-flight one too (released ${sbc.releasedN}, ${sbc.after} left) — the same-boot leg would go red`);
    }
  }
  // ── (n) R4 verify r5: A DIGEST WATCHER CANNOT BE SET WITH dailyWakeCap 0 (it would never deliver);
  // a legacy one stored before the refusal is READ AS CAP 1 (delivers once per window) and named at boot.
  {
    const e = mk(ENG, 'r4-digest0');
    await e.pass(A, { force: true });
    await e.setAccess(A, { kind: 'account' }, [{ principal: AL }]);
    const bad = await e.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'digest', digestMinutes: 30, dailyWakeCap: 0 }]);
    ok(!bad.ok && bad.code === 'bad-watcher' && bad.why === 'digest-cap-zero' && /at least 1/.test(bad.error), 'a NEW digest watcher with dailyWakeCap 0 is refused BY NAME (digest-cap-zero)', JSON.stringify(bad));
    const okWake = await e.setWatchers(A, { kind: 'account' }, [{ principal: AL, notify: 'wake', dailyWakeCap: 0 }]);
    ok(okWake.ok, 'a WAKE watcher with cap 0 is still accepted (it simply never opens a turn)');
    // a legacy cap-0 DIGEST stored directly (bypassing the validator) is read as cap 1 and named at boot
    await e.store.index.update((ix) => { const w = ix.accountAssignments[A].watchers[0]; w.notify = 'digest'; w.digestMinutes = 30; w.dailyWakeCap = 0; });
    const CF = require(path.join(REPO, 'src/channel-filter.js'));
    ok(CF.digestCap({ notify: 'digest', dailyWakeCap: 0 }) === 1 && CF.digestCap({ notify: 'wake', dailyWakeCap: 0 }) === 0 && CF.digestCap({ notify: 'digest', dailyWakeCap: 5 }) === 5, 'F.digestCap reads a stored cap-0 DIGEST as 1, leaves a cap-0 wake at 0 and any real cap unchanged');
    const z = e.capZeroDigests();
    ok(z.length === 1 && z[0].principal === 'agent:agent-A' && z[0].grain === 'account', 'the boot census names the stored cap-0 digest watcher once', JSON.stringify(z));
    const cfsrc = fs.readFileSync(path.join(REPO, 'src/channel-filter.js'), 'utf-8');
    const DL = "  return (w && w.notify === 'digest' && cap === 0) ? 1 : cap;";
    ok(cfsrc.split(DL).length === 2, 'the digestCap coercion line is present once (the control reverts it)');
    const cfp = patchPath('src', 'channel-filter'); writeCopy(cfp, cfsrc.replace(DL, '  return cap;'));
    ok(require(cfp).digestCap({ notify: 'digest', dailyWakeCap: 0 }) === 0, 'CONTROL: without the coercion a stored cap-0 digest reads as 0 (never delivers) — the leg above would go red');
  }
}


// ── ⑫ THE ONE DOOR (R4 verify r4, 2026-09-27): every billed channel turn starts inside `billedWake` ──
// Four rounds of this lane each found a NEW billed-wake writer outside the one serialized section
// (R2's wake cap, S2's credit count, R5's token bucket, R4's receipt). The engine now has ONE entry —
// `billedWake(keys, fn)` — and three SECTION BODIES (`wakeNow`, `flushScopeNow`, `receiptNow`) that read
// the cap, RESERVE the ledger row before the ladder and finalize it after. This census is grep-derived
// over the shipped bytes: a new bypass (a section body called outside the door, a ladder call with a
// channel reason outside a section, a ledger write outside, a hand-rolled chain) reddens it; the
// concurrency pins (⑪(h), aggregate ⑨c) guard what the door DOES.
console.log('\n⑫ the ONE door: the chain census over the shipped engine');
const esrc12 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
const SECTIONS = ['wakeNow', 'flushScopeNow', 'receiptNow'];
const LEDGER_HELPERS = ['reserveWake', 'finalizeRow'];   // the two writers a section calls; their own bodies write
function chainCensus(src) {
  // comments cannot hide code (feedback: a `$`-anchored pin proves nothing past a `//`): block comments
  // and whole-line `//` lines are blanked; an INLINE comment is cut only at ` // ` (a URL has `://`)
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/ \/\/ .*$/, ''))).join('\n');
  const lines = code.split('\n');
  const rangeOf = (name) => {
    const a = lines.findIndex((l) => new RegExp(`^  (async )?function ${name}\\(`).test(l));
    if (a < 0) return null;
    const b = lines.findIndex((l, i) => i > a && /^  }\s*$/.test(l));
    return b < 0 ? null : [a, b];
  };
  const ranges = {};
  for (const n of [...SECTIONS, ...LEDGER_HELPERS, 'billedWake', 'serialWake']) ranges[n] = rangeOf(n);
  const within = (i, names) => names.find((n) => ranges[n] && i >= ranges[n][0] && i <= ranges[n][1]) || null;
  const rows = [], violations = [];
  lines.forEach((l, i) => {
    const ln = i + 1;
    // 1. a ladder call with a channel reason ⇒ inside a section body
    if (/deliverToConversation\(/.test(l) && /spendReason: '(channel-[a-z-]+)'/.test(l)) { const s = within(i, SECTIONS); rows.push({ kind: 'ladder', line: ln, reason: l.match(/spendReason: '([a-z-]+)'/)[1], section: s }); if (!s) violations.push(`ladder call with a channel reason outside a section body at line ${ln}`); }
    // 2. a ledger write ⇒ inside a section body or one of the two helpers
    if (/stats\.wakes\s*=\s*F\.pruneLedger|stats\.wakes\.push\(/.test(l)) { const s = within(i, [...SECTIONS, ...LEDGER_HELPERS]); rows.push({ kind: 'ledger-write', line: ln, section: s }); if (!s) violations.push(`ledger write outside a section body at line ${ln}`); }
    // 3. the helpers are called from section bodies only
    for (const h of LEDGER_HELPERS) if (new RegExp(`\\b${h}\\(`).test(l) && !(ranges[h] && i === ranges[h][0])) { const s = within(i, SECTIONS); rows.push({ kind: 'helper-call', name: h, line: ln, section: s }); if (!s) violations.push(`${h}() called outside a section body at line ${ln}`); }
    // 4. a section body is entered ONLY as billedWake's fn — on the same line
    for (const n of SECTIONS) if (new RegExp(`\\b${n}\\(`).test(l) && !(ranges[n] && i === ranges[n][0])) { const door = /billedWake\(/.test(l); rows.push({ kind: 'section-call', name: n, line: ln, door }); if (!door) violations.push(`${n}() called outside billedWake at line ${ln}`); }
    // 5. the chain primitive is private to the door; the map private to the primitive
    if (/\bserialWake\(/.test(l) && !(ranges.serialWake && i === ranges.serialWake[0]) && within(i, ['billedWake']) !== 'billedWake') violations.push(`serialWake() taken by hand at line ${ln}`);
    if (/\bwakeChains\b/.test(l) && within(i, ['serialWake']) !== 'serialWake' && !/^\s*const wakeChains = new Map\(\)/.test(l)) violations.push(`wakeChains touched outside serialWake at line ${ln}`);
    // 6. a section body never opens a CONVERSATION door (a nested conversation chain would wait on itself)
    if (/billedWake\(\{ conv:/.test(l) && within(i, SECTIONS)) violations.push(`a conversation door opened inside a section body at line ${ln}`);
  });
  return { ranges, rows, violations, sections: SECTIONS.filter((n) => ranges[n]) };
}
{
  const c = chainCensus(esrc12);
  ok(c.sections.length === 3 && c.ranges.billedWake && c.ranges.serialWake && LEDGER_HELPERS.every((h) => c.ranges[h]), `the three section bodies, the door, the primitive and the two ledger helpers are found (${c.sections.join(', ')})`, JSON.stringify(c.ranges));
  const ladder = c.rows.filter((r) => r.kind === 'ladder');
  ok(ladder.length === 3 && ladder.every((r) => r.section) && new Set(ladder.map((r) => r.section)).size === 3, `exactly three ladder calls carry a channel reason, one per section body (${ladder.map((r) => `${r.section}:${r.reason}@${r.line}`).join(' · ')})`);
  const writes = c.rows.filter((r) => r.kind === 'ledger-write');
  ok(writes.length >= 6 && writes.every((r) => r.section), `every ledger write (${writes.length}) is inside a section body or a ledger helper`, JSON.stringify(writes));
  const calls = c.rows.filter((r) => r.kind === 'section-call');
  ok(calls.length >= 4 && calls.every((r) => r.door) && SECTIONS.every((n) => calls.some((r) => r.name === n)), `every section-body call (${calls.length}) is billedWake's fn, on its line (${calls.map((r) => `${r.name}@${r.line}`).join(' · ')})`, JSON.stringify(calls));
  const helpers = c.rows.filter((r) => r.kind === 'helper-call');
  // (2026-09-27: the receipt's wake row lives on the PROPOSAL — receiptNow no longer calls the watcher-ledger helpers)
  ok(helpers.length >= 4 && helpers.every((r) => r.section), `the ledger helpers are called from section bodies only (${helpers.length} calls)`, JSON.stringify(helpers));
  ok(c.violations.length === 0, 'THE CENSUS: no billed-wake writer outside the ONE door', JSON.stringify(c.violations));
  console.log('    chain census rows: ' + c.rows.map((r) => `${r.kind}${r.name ? ':' + r.name : ''}${r.reason ? ':' + r.reason : ''}@${r.line}${r.section ? '→' + r.section : ''}`).join(' · '));
  // CONTROLS: each bypass the census exists to catch, planted in the shipped bytes (text-level; the (h) copy is also loaded above)
  const bypass = BYPASS_COPY ? fs.readFileSync(BYPASS_COPY, 'utf-8') : null;
  const cb = bypass ? chainCensus(bypass) : null;
  ok(cb && cb.violations.some((v) => /receiptNow\(\) called outside billedWake/.test(v)), `CONTROL: the (h) copy — a receipt started outside the door — reddens the census (${cb && cb.violations.join('; ')})`);
  const ANCHOR = '    if (!per.length) return;';   // inside onFresh, outside every section
  ok(esrc12.split(ANCHOR).length === 2, 'the onFresh anchor line is present once (the controls plant after it)');
  const plant = (line) => chainCensus(esrc12.replace(ANCHOR, `${ANCHOR}\n${line}`));
  const c2 = plant("    if (!per.length) await deliver.deliverToConversation('x', 'y', { kind: 'notification', spendReason: 'channel-message' });");
  ok(c2.violations.some((v) => /ladder call with a channel reason outside a section/.test(v)), `CONTROL: a second ladder site with a channel reason outside a section body reddens (${c2.violations.join('; ')})`);
  const c3 = plant("    const mine = serialWake('mine', () => null);");
  ok(c3.violations.some((v) => /serialWake\(\) taken by hand/.test(v)), `CONTROL: a hand-rolled chain outside the door reddens (${c3.violations.join('; ')})`);
  const c4 = plant("    if (!per.length) en.stats.wakes.push({ at: t, ok: true });");
  ok(c4.violations.some((v) => /ledger write outside a section/.test(v)), `CONTROL: a ledger write outside a section body reddens (${c4.violations.join('; ')})`);
  const c5 = plant("    if (!per.length) track(wakeNow(rec, convId, [], {}));");
  ok(c5.violations.some((v) => /wakeNow\(\) called outside billedWake/.test(v)), `CONTROL: a section body called outside the door reddens (${c5.violations.join('; ')})`);
  const c6 = plant("    if (!per.length) await reserveWake(rec, convId, null, {});");
  ok(c6.violations.some((v) => /reserveWake\(\) called outside a section/.test(v)), `CONTROL: a reservation outside a section body reddens (${c6.violations.join('; ')})`);
  const c7 = chainCensus(esrc12.replace('    let r = null;\n    if (!deliver || typeof deliver.deliverToConversation !== \'function\') {\n      r = { ok: false, reason: \'no delivery ladder wired\', refused: \'unwired\' };', '    let r = null; // if (!per.length) await deliver.deliverToConversation(\'x\', \'y\', { spendReason: \'channel-message\' });\n    if (!deliver || typeof deliver.deliverToConversation !== \'function\') {\n      r = { ok: false, reason: \'no delivery ladder wired\', refused: \'unwired\' };'));
  ok(c7.violations.length === 0 && c7.rows.filter((r) => r.kind === 'ladder').length === 3, 'CONTROL (comment hygiene): a ladder call spelled inside an inline comment is not counted, and the real three still are');
}

// ── ⑮ A STORAGE MOUNT'S OWN OAUTH CLIENT, BORROWED BY AN ACCOUNT (2.369.195) ──
// The owner: "帮我把 mounts 里（某个存储挂载）那个 gmail 在 channels 里也配置一份吧，至少 oauth
// 信息转移进去 … 我没办法在界面里看到 oauth client 和 secret". A REAL MountManager in
// a scratch dir holds a custom Google client (sealed under ITS `.mounts-key`); the
// REAL engine borrows it through `mountClients` (`fromMount`): the list carries no
// secret and only the id's prefix; the consent runs under the mount's id; the
// account holds `custom` + the secret RE-SEALED under `.channels-key` (never the
// mounts' ciphertext, never the plaintext on disk); refusals are named; the copy
// is an audit line; no route body / frame / log line ever carries the secret; an
// agent bearer is 403. CONTROLS: a copy that skips the seal is SEEN by the disk
// check; a copy that echoes the copied client in the start answer is SEEN by the
// body check; a route copy without the agent refusal is SEEN by the 403 check.
// verify r2: EVERY refusal that needs no key is judged before the key (the
// options, the registry's id rule, another mount at Connect compared by ID —
// `mountClients.head`, the key-less read), a refused Connect never takes the
// finished flow, a malformed fromMount is 400 by name (never the default
// client), the owner-only config refuses an agent bearer, names are bounded;
// controls (6)–(10) each re-open one of those doors.
console.log('\n⑮ a storage mount\'s own OAuth client, borrowed by a Gmail account');
{
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const SB = require(path.join(REPO, 'src/secret-box.js'));
  const gmailMod = require(path.join(REPO, 'src/channels/gmail.js'));
  const express = require(path.join(REPO, 'node_modules/express'));
  const http = require('node:http');
  const mdir = path.join(ROOT, 'cfm-mounts'); fs.mkdirSync(mdir, { recursive: true });
  const mm = new MountManager({ dataDir: mdir });
  const CID = '111122223333-mailfake.apps.googleusercontent.com', CSEC = 'GOCSPX-mail-MOUNT-s3cret-Q9zZ';   // unmistakable in any byte stream (fake)
  const DID = '444455556666-drivefake.apps.googleusercontent.com', DSEC = 'GOCSPX-drive-MOUNT-s3cret-7fX';
  const tok = '{"access_token":"fake-at","refresh_token":"fake-rt"}';
  const P = mm.add({ type: 'gmail', name: 'mail archive', token: tok, clientId: CID, clientSecret: CSEC, email: 'archive.owner@example.com' });
  const D = mm.add({ type: 'drive', name: 'work drive', token: tok, clientId: DID, clientSecret: DSEC });
  const PR = mm.add({ type: 'drive', name: 'preset drive', token: tok, clientPreset: 'org1' });
  const NS = mm.add({ type: 'gmail', name: 'id only', token: tok, clientId: '777788889999-nosecret.apps.googleusercontent.com' });
  const MSEC = 'ms-fake-000000';   // another vendor's (fake) client
  const OD = mm.add({ type: 'onedrive', name: 'one drive', token: tok, clientId: 'ms-fake-client-id', clientSecret: MSEC });
  // verify r1: an other-vendor mount whose secret CANNOT be opened (sealed under another key) — the order
  // probe: a vendor judged before the decrypt answers `mount-client-vendor`; a decrypt first answered
  // `mount-secret-undecryptable` (the key state of a mount the body may not even borrow)
  const UNOD = mm.add({ type: 'onedrive', name: 'stale one drive', token: tok, clientId: 'ms-stale', clientSecret: 'placeholder' });
  mm._state.mounts.find((m) => m.id === UNOD).clientSecretEnc = SB.secretBox(path.join(ROOT, 'cfm-other-key')).enc('ms-stale-secret');
  mm._save();
  let mountDecs = 0;   // every opening of a mount's ciphertext with .mounts-key
  { const realDec = mm._box.dec.bind(mm._box); mm._box.dec = (b) => { mountDecs++; return realDec(b); }; }
  const mRaw = fs.readFileSync(path.join(mdir, 'mounts.json'), 'utf-8');
  const mountCipher = JSON.parse(mRaw).mounts.find((m) => m.id === P).clientSecretEnc;
  ok(!mRaw.includes(CSEC) && typeof mountCipher === 'string' && SB.secretBox(path.join(mdir, '.mounts-key')).dec(mountCipher) === CSEC, 'FIXTURE: the mount holds the custom client with its secret sealed under .mounts-key');

  // (a) the read-only list: exactly the top-level records holding their OWN client of the vendor
  const lg = mm.oauthClientsFor('google');
  ok(JSON.stringify(lg.map((x) => x.name).sort()) === JSON.stringify(['mail archive', 'work drive']) && mm.oauthClientsFor('microsoft').length === 2 && mm.oauthClientsFor('').length === 0,
    `oauthClientsFor('google') lists the Gmail + Drive mounts that hold a custom client — never a preset one, never an id without its secret, never another vendor's (${JSON.stringify(lg.map((x) => x.name))})`);
  ok(lg.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(['clientIdPrefix', 'email', 'mountId', 'name', 'type'])) && !JSON.stringify(lg).includes(CSEC) && !JSON.stringify(lg).includes(mountCipher) && !JSON.stringify(lg).includes(CID) && lg.find((x) => x.mountId === P).clientIdPrefix === CID.slice(0, 12),
    'each row is {mountId, name, type, email, clientIdPrefix} — no secret, no ciphertext, not even the whole client id');
  const got = mm.oauthClientOf(P);
  ok(got.clientId === CID && got.clientSecret === CSEC && got.vendor === 'google', 'oauthClientOf (server-only) decrypts the mount\'s client with .mounts-key');
  const refusal = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  const rs = [[PR, 'mount-no-client'], [NS, 'mount-no-client'], ['mnt-nope', 'mount-gone']].map(([id, code]) => { const e = refusal(() => mm.oauthClientOf(id)); return !!e && e.code === code && !String(e.message).includes(CSEC); });
  ok(rs.every(Boolean), 'oauthClientOf refuses BY CODE: a preset record / an id without its secret = mount-no-client, an unknown id = mount-gone (no value in any message)', JSON.stringify(rs));

  // the fake Google: every token call records the client it received
  const calls = [];
  let n = 0;
  const byAt = new Map();
  let echoSecret = false;   // verify r4: a vendor (or a gateway) that ECHOES the request's client_secret in its refusal
  const fetchG = async (url, init = {}) => {
    const u = new URL(String(url));
    const raw = init.body == null ? '' : String(init.body);
    const form = raw && !raw.startsWith('{') ? Object.fromEntries(new URLSearchParams(raw)) : null;
    calls.push({ host: u.hostname, path: u.pathname, form });
    const J = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.hostname === 'oauth2.googleapis.com') {
      if (echoSecret) return J({ error: 'invalid_client', error_description: `the secret ${form.client_secret} was rejected (fake vendor echo)` }, 401);
      const at = `ya29.fake.${++n}`; byAt.set(at, form.code || 'refresh');
      return J({ access_token: at, expires_in: 3600, refresh_token: `1//fake-${form.code || 'r'}`, scope: `${gmailMod.SCOPE} https://www.googleapis.com/auth/gmail.compose`, token_type: 'Bearer' });
    }
    const who = byAt.get(String((init.headers || {}).Authorization || '').replace(/^Bearer /, ''));
    if (!who) return J({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
    const p = u.pathname.replace('/gmail/v1/users/me', '');
    if (p === '/profile') return J({ emailAddress: who === 'code-d' ? 'drive.owner@example.com' : 'archive.owner@example.com', historyId: '100' });
    if (p === '/threads') return J({ threads: [] });
    if (p === '/history') return J({ historyId: '100' });
    return J({ error: { code: 404, message: `unrouted ${p}` } }, 404);
  };
  const logs = [];
  const capLog = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
  const mountClients = { list: (v) => mm.oauthClientsFor(v), head: (id, opts) => mm.oauthClientIdOf(id, opts), of: (id, opts) => mm.oauthClientOf(id, opts) };   // the wiring's shape: the vendor rides down; verify r2: `head` = the key-less read
  const edir = path.join(ROOT, 'cfm-eng');
  const frames = [];
  const mkCfm = (E, dir) => { const e = E.create({ dataDir: dir, env: {}, broadcast: (m) => frames.push(m), fetch: fetchG, log: capLog, mountClients }); engines.push(e); return e; };
  const eng = mkCfm(ENG, edir);
  const chBox = SB.secretBox(path.join(edir, ENG.KEY_FILE));
  const disk = (dir) => { try { return fs.readFileSync(path.join(dir, 'channels', 'adapters.json'), 'utf-8'); } catch { return ''; } };
  const land = async (flow, code) => {
    const cu = new URL(flow.consentUrl);
    await new Promise((resolve) => http.get(`${flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve));
    for (let i = 0; i < 40; i++) { const st = eng.oauthStatus(flow.flowId); if (st.done) return st; await sleep(10); }
    return eng.oauthStatus(flow.flowId);
  };
  // (b) the engine's list, per TYPE (Gmail borrows Google clients; Lark borrows none)
  const lm = eng.mountClientsFor('gmail');
  ok(lm.vendor === 'google' && lm.clients.length === 2 && lm.clients.every((x) => !('clientId' in x) && !('clientSecret' in x)) && !JSON.stringify(lm).includes(CSEC), 'mountClientsFor(gmail): vendor google, the two mounts, re-whitelisted (no id, no secret)');
  const ll = eng.mountClientsFor('lark');
  ok(ll.vendor === null && ll.clients.length === 0, 'mountClientsFor(lark): no storage mount holds a Lark app — none offered');

  // (c) the consent under the mount's client; the account holds a RE-SEALED copy
  const st = await eng.startOAuth({ kind: 'gmail', fromMount: P });
  ok(st.credentialKey === 'custom' && new URL(st.url).searchParams.get('client_id') === CID && !JSON.stringify(st).includes(CSEC), `start {fromMount} begins the consent under the MOUNT's client id (${new URL(st.url).searchParams.get('client_id')}) — the answer carries no secret`);
  ok(!disk(edir).includes(CID), 'and NO record exists yet (the transient flow: Connect creates it)');
  const s1 = await land(st.flow, 'code-p');
  ok(s1.done && s1.ok && s1.token === st.flowId, 'the redirect lands; the sign-in finished', JSON.stringify(s1));
  const ex = calls.find((c) => c.form && c.form.grant_type === 'authorization_code' && c.form.code === 'code-p');
  ok(ex && ex.form.client_id === CID && ex.form.client_secret === CSEC, 'the code exchange carried the mount\'s id AND secret — the one place the secret leaves: the vendor call itself');
  const c1 = await eng.connect('gmail', { flowId: st.flowId, name: 'borrowed mail', fromMount: P });
  const recOf = (dir, id) => JSON.parse(disk(dir)).adapters.find((r) => r.id === id);
  const rec = recOf(edir, c1.adapter.id);
  const sealedOk = (dir, r) => { try { return !!r && r.credentialKey === 'custom' && !!r.credential && r.credential.appId === CID && SB.secretBox(path.join(dir, ENG.KEY_FILE)).dec(r.credential.appSecretEnc) === CSEC; } catch { return false; } };
  const opensWithMounts = (() => { try { return SB.secretBox(path.join(mdir, '.mounts-key')).dec(rec.credential.appSecretEnc) === CSEC; } catch { return false; } })();
  ok(sealedOk(edir, rec) && rec.credential.appSecretEnc !== mountCipher && !opensWithMounts, 'Connect {flowId, fromMount} creates the account: `custom` + {appId: the mount\'s id, appSecretEnc} RE-SEALED under .channels-key (a new blob — the mounts ciphertext is NOT copied and does not open with .mounts-key)');
  const plainOnDisk = (dir) => disk(dir).includes(CSEC);
  ok(!plainOnDisk(edir) && !disk(edir).includes(mountCipher), 'the plaintext secret (and the mounts ciphertext) appear nowhere in adapters.json');
  ok(c1.adapter.auth.tokenHeld && c1.adapter.credentialKey === 'custom' && c1.adapter.customClient.appId === CID && c1.adapter.customClient.secretMasked === '••••' + CSEC.slice(-4), 'the account is connected — an ordinary Custom client (the card masks the secret)');
  const au = eng.store.auditTail().filter((l) => l.kind === 'auth' && l.op === 'client-from-mount');
  ok(au.length === 1 && au[0].mountId === P && au[0].by === 'user' && au[0].adapterKind === 'gmail' && au[0].clientIdPrefix === CID.slice(0, 12) && !JSON.stringify(au).includes(CSEC), `ONE audit line {kind:'auth', op:'client-from-mount', mountId, by:'user'} for the copy (Connect's re-check of the same mount is not a second copy) (${JSON.stringify(au)})`);
  // (d) re-authorize under ANOTHER mount's client = a rebind (the mount semantics)
  const ra = await eng.reauthorize(c1.adapter.id, { fromMount: D });
  ok(ra.rebind === true && new URL(ra.flow.consentUrl).searchParams.get('client_id') === DID && recOf(edir, c1.adapter.id).credential.appId === CID, 're-authorize {fromMount: another mount} is a REBIND under that mount\'s client — the account keeps its own until the consent lands');
  await eng.cancelAuth(c1.adapter.id).catch(() => {});
  ok(eng.store.auditTail().filter((l) => l.op === 'client-from-mount').length === 2, 'the rebind\'s copy is audited too');
  // (e) refusals BY NAME, nothing begun, no value in any message
  const refs = [];
  const decsBefore = mountDecs;
  for (const [what, body, status, code] of [
    ['a preset-backed mount', { kind: 'gmail', fromMount: PR }, 409, 'mount-no-client'],
    ['an id without its secret', { kind: 'gmail', fromMount: NS }, 409, 'mount-no-client'],
    ['another vendor\'s client', { kind: 'gmail', fromMount: OD }, 400, 'mount-client-vendor'],
    ['a gone mount', { kind: 'gmail', fromMount: 'mnt-gone' }, 404, 'mount-gone'],
    ['a Lark account', { kind: 'lark', fromMount: P }, 400, 'mount-client-unsupported'],
    ['two clients at once', { kind: 'gmail', fromMount: P, clientPreset: 'custom', clientId: CID, clientSecret: 'x-other-secret' }, 400, 'ambiguous-client'],
  ]) {
    const e = await (async () => { try { await eng.startOAuth(body); return null; } catch (err) { return err; } })();
    if (!(e && e.status === status && e.code === code && !String(e.message).includes(CSEC))) refs.push({ what, status: e && e.status, code: e && e.code });
  }
  ok(refs.length === 0, 'each refused choice answers its status + closed code (409 mount-no-client ×2, 400 mount-client-vendor, 404 mount-gone, 400 mount-client-unsupported, 400 ambiguous-client) with no value in the message', JSON.stringify(refs));
  ok(mountDecs === decsBefore, `verify r1: NONE of those refusals opened a mount's secret (${mountDecs - decsBefore} decrypts) — the vendor, the ambiguity and the lendability are judged before .mounts-key is used`);
  const eUnod = await (async () => { try { await eng.startOAuth({ kind: 'gmail', fromMount: UNOD }); return null; } catch (err) { return err; } })();
  ok(eUnod && eUnod.status === 400 && eUnod.code === 'mount-client-vendor' && mountDecs === decsBefore, `verify r1: an UNDECRYPTABLE other-vendor mount in a Gmail body is 400 mount-client-vendor with no decrypt (${eUnod && eUnod.code}, ${mountDecs - decsBefore} decrypts) — the refusal names the vendor, never the key state`);
  // verify r1: Connect's own body obeys the ONE-client rule — the sign-in's mount beside a stale preset is refused, the flow stays pending
  const st5 = await eng.startOAuth({ kind: 'gmail', fromMount: P });
  await land(st5.flow, 'code-p5');
  const eAmb = await (async () => { try { await eng.connect('gmail', { flowId: st5.flowId, fromMount: P, credentialKey: 'cluster:org1' }); return null; } catch (err) { return err; } })();
  ok(eAmb && eAmb.status === 400 && eAmb.code === 'ambiguous-client', `verify r1: Connect {flowId, fromMount: the sign-in's mount, credentialKey} is 400 ambiguous-client (${eAmb && eAmb.code}) — never accepted with the extra field ignored`);
  const c5 = await eng.connect('gmail', { flowId: st5.flowId, fromMount: P, name: 'after the refusal' });
  ok(c5.adapter && c5.adapter.credentialKey === 'custom' && c5.adapter.customClient.appId === CID, 'and the flow was not taken by the refusal: Connect naming the mount alone lands');
  const bare = ENG.create({ dataDir: path.join(ROOT, 'cfm-bare'), env: {}, broadcast: () => {}, fetch: fetchG, log: capLog });
  engines.push(bare);
  const nb = await (async () => { try { await bare.startOAuth({ kind: 'gmail', fromMount: P }); return null; } catch (err) { return err; } })();
  ok(nb && nb.status === 503 && nb.code === 'no-mounts' && bare.mountClientsFor('gmail').clients.length === 0, 'an engine with no mounts wired refuses `fromMount` 503 no-mounts and lists none');
  const Wd = await import(path.join(REPO, 'src/lib/channel-words.js'));
  const unworded = ['mount-gone', 'mount-no-client', 'mount-client-vendor', 'mount-client-unsupported', 'mount-secret-undecryptable', 'no-mounts', 'ambiguous-client', 'agent-forbidden'].filter((c) => { const w = Wd.routeErrorText({ code: c, error: 'RAW-SENTENCE' }); return !w || w.includes('RAW-SENTENCE') || w === Wd.routeErrorText({ code: 'zz-unknown', error: 'RAW-SENTENCE' }); });
  ok(unworded.length === 0, 'every new refusal code has its own words in channel-words (the toast never prints the English contract sentence)', unworded.join());

  // (f) the routes: the list, the start, the agent refusal; no body carries the secret
  const serveWith = async (routesMod, engine) => {
    routesMod.setup({ getEngine: () => engine });
    const app = express(); app.use(express.json()); app.use(routesMod.router);
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const bodies = [];
    const call = (method, p, body, headers = {}) => new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { bodies.push(b); let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, body: j, raw: b }); }); });
      req.on('error', (e) => resolve({ status: 0, body: null, raw: String(e.message) }));
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    return { call, bodies, close: () => new Promise((r) => server.close(r)) };
  };
  const R1 = await serveWith(routes, eng);
  const gl = await R1.call('GET', '/api/channels/oauth/mount-clients?kind=gmail');
  ok(gl.status === 200 && gl.body.clients.length === 2 && gl.body.clients.some((x) => x.mountId === P && x.name === 'mail archive' && x.email === 'archive.owner@example.com' && x.clientIdPrefix === CID.slice(0, 12)), 'GET /api/channels/oauth/mount-clients?kind=gmail → the list (declared before the conversation route)', gl.raw.slice(0, 300));
  const glk = await R1.call('GET', '/api/channels/oauth/mount-clients?kind=lark');
  ok(glk.status === 200 && glk.body.vendor === null && glk.body.clients.length === 0, '…?kind=lark → vendor null, none');
  const AG = { Authorization: 'Bearer vsst_fake-agent-token' };
  const ga = await R1.call('GET', '/api/channels/oauth/mount-clients?kind=gmail', undefined, AG);
  const sa = await R1.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: P }, AG);
  const raA = await R1.call('POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/reauthorize`, { fromMount: P }, { Authorization: 'Bearer jbt_fake-job-token' });
  ok(ga.status === 403 && ga.body.code === 'agent-forbidden' && sa.status === 403 && sa.body.code === 'agent-forbidden' && raA.status === 403, 'an agent\'s session / job bearer is 403 agent-forbidden on the list, on a start and on a re-authorize that borrows a mount\'s client');
  const sr = await R1.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: P });
  ok(sr.status === 200 && new URL(sr.body.url).searchParams.get('client_id') === CID, 'POST /api/channels/oauth/start {kind, fromMount} (the owner) → the consent under the mount\'s client');
  const sg = await R1.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: 'mnt-gone' });
  ok(sg.status === 404 && sg.body.code === 'mount-gone', 'a gone mount → 404 mount-gone on the wire');
  const bodyLeak = (bodies) => bodies.some((b) => b.includes(CSEC) || b.includes(mountCipher));
  ok(!bodyLeak(R1.bodies), `NO route answer carries the mount's secret or its ciphertext (${R1.bodies.length} bodies checked)`);
  ok(!frames.some((f) => JSON.stringify(f).includes(CSEC)) && !logs.some((l) => l.includes(CSEC)), 'no broadcast frame and no log line carried it either');
  await R1.close();

  // CONTROLS — each check above is not decorative
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const SEAL = '    const credential = sealCustom(mod, { appId: c.clientId, appSecret: c.clientSecret });';
  const READ = '    try { secret = box.dec(c.appSecretEnc); }\n';
  ok(esrc.split(SEAL).length === 2 && esrc.split(READ).length === 2, 'CONTROL setup: the seal and the read-back lines are present once');
  // (1) a copy that SKIPS THE SEAL (and reads the value back unopened, so it runs end to end)
  const p1 = patchPath('src/server', 'channels-engine');
  writeCopy(p1, esrc.replace(SEAL, '    const credential = { appId: c.clientId, appSecretEnc: c.clientSecret };').replace(READ, '    try { secret = c.appSecretEnc; }\n'));
  const d1 = path.join(ROOT, 'cfm-ctl1');
  const e1 = mkCfm(require(p1), d1);
  const s1c = await e1.startOAuth({ kind: 'gmail', fromMount: P });
  const cu1 = new URL(s1c.flow.consentUrl);
  await new Promise((resolve) => http.get(`${s1c.flow.redirectUri}/?state=${cu1.searchParams.get('state')}&code=code-c1`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve));
  for (let i = 0; i < 40 && !e1.oauthStatus(s1c.flowId).done; i++) await sleep(10);
  const k1 = await e1.connect('gmail', { flowId: s1c.flowId, fromMount: P });
  ok(plainOnDisk(d1) && !sealedOk(d1, recOf(d1, k1.adapter.id)), 'CONTROL: a copy that skips the seal writes the plaintext — the disk check above would be red');
  // (2) a copy that echoes the copied client in the start answer
  const START = '    auditMountCopy(choice, mod);\n    return withMount({ ...r, url: r.flow && r.flow.consentUrl }, choice);';
  ok(esrc.split(START).length === 2, 'CONTROL setup: the start answer line is present once');
  const p2 = patchPath('src/server', 'channels-engine');
  writeCopy(p2, esrc.replace(START, '    auditMountCopy(choice, mod);\n    return withMount({ ...r, url: r.flow && r.flow.consentUrl, copied: input.fromMount ? mountClients.of(input.fromMount) : null }, choice);'));
  const e2 = mkCfm(require(p2), path.join(ROOT, 'cfm-ctl2'));
  const R2 = await serveWith(routes, e2);
  await R2.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: P });
  ok(bodyLeak(R2.bodies), 'CONTROL: a copy whose start answer echoes the copied client leaks it — the body check above would be red');
  await R2.close();
  // (3) a routes copy without the agent refusal
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const GUARD = "    if (refuseAgentMountChoice(req, res)) return;\n    res.json(engine().mountClientsFor(";
  ok(rsrc.split(GUARD).length === 2, 'CONTROL setup: the list route\'s agent refusal is present once');
  const p3 = patchPath('src/routes', 'channels');
  writeCopy(p3, rsrc.replace(GUARD, '    res.json(engine().mountClientsFor('));
  const R3 = await serveWith(require(p3), eng);
  const ga3 = await R3.call('GET', '/api/channels/oauth/mount-clients?kind=gmail', undefined, AG);
  ok(ga3.status === 200, 'CONTROL: a route copy without the refusal answers an agent bearer 200 — the 403 check above would be red');
  await R3.close();
  // (4) a mounts copy that OPENS THE SECRET BEFORE judging the vendor (the pre-verify order). verify r2: the
  // engine asks the KEY-LESS head first, so this order is judged on the mounts module itself — the door the
  // r1 pin (`oauthClientOf(UNOD, {vendor})` → mount-client-vendor, 0 decrypts) holds on its own
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  const VENDOR_FIRST = "    const { _rec: m, ...head } = this.oauthClientIdOf(mountId, { vendor });\n    let clientSecret;\n    try { clientSecret = this._dec(m.clientSecretEnc); }\n";
  ok(msrc.split(VENDOR_FIRST).length === 2, 'CONTROL setup: the head-before-decrypt lines are present once');
  const p4 = patchPath('src', 'mounts');
  writeCopy(p4, msrc.replace(VENDOR_FIRST, "    const m0 = this._state.mounts.find((x) => x.id === String(mountId || ''));\n    let clientSecret;\n    try { clientSecret = this._dec(m0 && m0.clientSecretEnc); }\n    catch (e) { throw refuse('mount-secret-undecryptable', `the storage mount's client secret cannot be decrypted with .mounts-key (${(e && e.code) || 'decrypt-failed'})`); }\n    const { _rec: m, ...head } = this.oauthClientIdOf(mountId, { vendor });\n    try { clientSecret = this._dec(m.clientSecretEnc); }\n"));
  const mm4 = new (require(p4).MountManager)({ dataDir: mdir });   // the same store, the same key
  let decs4 = 0; { const rd = mm4._box.dec.bind(mm4._box); mm4._box.dec = (b) => { decs4++; return rd(b); }; }
  const dReal = mountDecs;
  const eReal = (() => { try { mm.oauthClientOf(UNOD, { vendor: 'google' }); return null; } catch (err) { return err; } })();
  ok(eReal && eReal.code === 'mount-client-vendor' && mountDecs === dReal, `the REAL oauthClientOf(UNOD, {vendor:'google'}) refuses mount-client-vendor with no decrypt (${eReal && eReal.code}, ${mountDecs - dReal})`);
  const eU4 = (() => { try { mm4.oauthClientOf(UNOD, { vendor: 'google' }); return null; } catch (err) { return err; } })();
  ok(eU4 && eU4.code === 'mount-secret-undecryptable' && decs4 === 1, `CONTROL: a mounts copy that decrypts before judging the vendor answers mount-secret-undecryptable after 1 decrypt — the order checks above would be red (${eU4 && eU4.code}, ${decs4})`);
  // (5) an engine copy whose Connect skips the ONE-client rule (the pre-verify line)
  const ONE = '    const sameMount = namesMount(b) && !!p.choice.fromMount && p.choice.fromMount.mountId === b.fromMount;';
  ok(esrc.split(ONE).length === 2, 'CONTROL setup: Connect\'s one-client line is present once');
  const p5 = patchPath('src/server', 'channels-engine');
  writeCopy(p5, esrc.replace(ONE, "    const sameMount = typeof b.fromMount === 'string' && !!p.choice.fromMount && p.choice.fromMount.mountId === b.fromMount;"));
  const e5 = mkCfm(require(p5), path.join(ROOT, 'cfm-ctl5'));
  const s5c = await e5.startOAuth({ kind: 'gmail', fromMount: P });
  { const cu5 = new URL(s5c.flow.consentUrl); await new Promise((resolve) => http.get(`${s5c.flow.redirectUri}/?state=${cu5.searchParams.get('state')}&code=code-c5`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve)); }
  for (let i = 0; i < 40 && !e5.oauthStatus(s5c.flowId).done; i++) await sleep(10);
  const k5 = await (async () => { try { return await e5.connect('gmail', { flowId: s5c.flowId, fromMount: P, credentialKey: 'cluster:org1' }); } catch (err) { return { err }; } })();
  ok(k5.adapter && k5.adapter.credentialKey === 'custom', 'CONTROL: an engine copy whose Connect skips the one-client rule accepts the mount beside a stale preset — the ambiguity check above would be red');

  // ── verify r2: EVERY refusal that needs no key comes before the key; a refusal never takes the flow ──
  // a google mount whose stored id the registry's rule refuses (the storage side never validated it), an
  // undecryptable GOOGLE mount (the r1 UNOD probe's same-vendor twin), a name with a newline, a 2 000-char name
  const BAD = mm.add({ type: 'drive', name: 'odd id drive', token: tok, clientId: 'not-a-google-client-id', clientSecret: 'GOCSPX-odd-MOUNT-s3cret-0dd' });
  const UNG = mm.add({ type: 'gmail', name: 'stale key mail', token: tok, clientId: 'stale.apps.googleusercontent.com', clientSecret: 'placeholder' });
  mm._state.mounts.find((m) => m.id === UNG).clientSecretEnc = SB.secretBox(path.join(ROOT, 'cfm-other-key')).enc('GOCSPX-stale-MOUNT-s3cret');
  const HN = mm.add({ type: 'gmail', name: 'x\n[channels] gmail: connected as root (FORGED)', token: tok, clientId: 'hn.apps.googleusercontent.com', clientSecret: 'GOCSPX-hn-MOUNT-s3cret-00' });
  const LONG = mm.add({ type: 'gmail', name: 'long', token: tok, clientId: 'long.apps.googleusercontent.com', clientSecret: 'GOCSPX-long-MOUNT-s3cret-0' });
  mm._state.mounts.find((m) => m.id === LONG).name = 'L'.repeat(2000);
  mm._save();
  const R4 = await serveWith(routes, eng);
  const st6 = await eng.startOAuth({ kind: 'gmail', fromMount: P });
  await land(st6.flow, 'code-p6');
  const refs2 = [];
  const d2 = mountDecs;
  for (const [what, method, p, body, status, code] of [
    ['start + an unknown option', 'POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: P, options: { bogus: 'x' } }, 400, 'unknown-option'],
    ['start + non-object options', 'POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: P, options: 'x' }, 400, 'bad-request'],
    ['start + a mount whose id the row refuses', 'POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: BAD }, 400, 'invalid-client'],
    ['connect newAccount + that mount', 'POST', '/api/channels/adapters/gmail/connect', { newAccount: true, fromMount: BAD }, 400, 'invalid-client'],
    ['connect newAccount + an unknown option', 'POST', '/api/channels/adapters/gmail/connect', { newAccount: true, fromMount: P, options: { bogus: 'x' } }, 400, 'unknown-option'],
    ['re-authorize + that mount', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/reauthorize`, { fromMount: BAD }, 400, 'invalid-client'],
    ['Connect {flowId} + ANOTHER mount (another id)', 'POST', '/api/channels/adapters/gmail/connect', { flowId: st6.flowId, fromMount: D }, 400, 'flow-client-mismatch'],
    ['Connect {flowId} + an UNDECRYPTABLE other mount', 'POST', '/api/channels/adapters/gmail/connect', { flowId: st6.flowId, fromMount: UNG }, 400, 'flow-client-mismatch'],
    ['Connect {flowId} + the sign-in\'s mount + an unknown option', 'POST', '/api/channels/adapters/gmail/connect', { flowId: st6.flowId, fromMount: P, options: { bogus: 'x' } }, 400, 'unknown-option'],
    ['start + a numeric fromMount', 'POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: 123 }, 400, 'bad-request'],
    ['start + an empty fromMount', 'POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: '' }, 400, 'bad-request'],
    ['Connect {flowId} + an object fromMount', 'POST', '/api/channels/adapters/gmail/connect', { flowId: st6.flowId, fromMount: { id: P } }, 400, 'bad-request'],
    ['re-authorize + an array fromMount', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/reauthorize`, { fromMount: [P] }, 400, 'bad-request'],
  ]) {
    const dd = mountDecs;
    const r = await R4.call(method, p, body);
    if (!(r.status === status && r.body && r.body.code === code && mountDecs === dd)) refs2.push({ what, status: r.status, code: r.body && r.body.code, decrypts: mountDecs - dd });
  }
  ok(refs2.length === 0 && mountDecs === d2, 'verify r2: a body refused on its OPTIONS, on a mount id the row refuses, on ANOTHER mount at Connect (compared by id — an undecryptable one answers flow-client-mismatch, never its key state), or on a malformed fromMount (400 bad-request, never the default client) opens NO mount secret', JSON.stringify(refs2));
  const stAfter = await R4.call('GET', `/api/channels/oauth/status?flowId=${encodeURIComponent(st6.flowId)}`);
  ok(stAfter.status === 200 && stAfter.body.done && stAfter.body.ok, 'verify r2: the finished sign-in SURVIVED every refused Connect (a refusal never takes the flow — the options are judged before it is taken)', stAfter.raw.slice(0, 160));
  const c6 = await R4.call('POST', '/api/channels/adapters/gmail/connect', { flowId: st6.flowId, fromMount: P, name: 'after r2 refusals' });
  ok(c6.status === 200 && c6.body.adapter.credentialKey === 'custom', 'and Connect naming the mount alone still lands it');
  const cfgA = await R4.call('GET', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/config`, undefined, AG);
  ok(cfgA.status === 403 && cfgA.body.code === 'agent-forbidden' && !cfgA.raw.includes(CSEC), 'verify r2: the owner-only config refuses a self-identifying agent bearer 403 agent-forbidden (the plaintext prefill is the owner\'s)');
  const cfgO = await R4.call('GET', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/config`);
  ok(cfgO.status === 200 && cfgO.body.config.client && cfgO.body.config.client.appSecret === CSEC, '…and the owner (no bearer) still reads the Edit prefill (D3)');
  R4.bodies.pop();   // the owner's config read is the D3 door — excluded from the leak census by design
  const gl2 = await R4.call('GET', '/api/channels/oauth/mount-clients?kind=gmail');
  const rowL = gl2.body.clients.find((x) => x.mountId === LONG), rowH = gl2.body.clients.find((x) => x.mountId === HN);
  ok(rowL && rowL.name.length <= 60 && rowH && !rowH.name.includes('\n'), `verify r2: a stored 2 000-char name is bounded on the list (${rowL && rowL.name.length}) and a newline in a name is a space`);
  const st7 = await eng.startOAuth({ kind: 'gmail', fromMount: HN });
  const forged = logs.filter((l) => l.includes('storage mount') && l.includes('\n'));
  ok(forged.length === 0 && logs.some((l) => l.includes('(FORGED)') && !l.includes('\n')), 'verify r2: the copy\'s log line carries the name on ONE line (a newline in a name forged a second journal line)');
  await eng.cancelAuth(c1.adapter.id).catch(() => {}); void st7;
  const nsl = await R4.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: (() => { const id = mm.add({ type: 'gmail', name: 'n', token: tok, clientId: 'nsl.apps.googleusercontent.com' }); mm._state.mounts.find((m) => m.id === id).name = 'N'.repeat(2000); return id; })() });
  ok(nsl.status === 409 && nsl.body.code === 'mount-no-client' && nsl.raw.length < 400, `verify r2: a refusal naming a 2 000-char mount is bounded on the wire (${nsl.raw.length} bytes)`);
  ok(!bodyLeak(R4.bodies), `verify r2: no route answer of this leg carries the secret (${R4.bodies.length} bodies)`);
  await R4.close();
  // CONTROLS for the r2 pins
  // (6) an engine copy that TAKES the flow before judging the options (the pre-r2 order)
  const OPT_FIRST = '    const options = normalizeOptions(mod, b.options, p.rec.options);\n';
  const OPT_USE = '    rec.options = options;\n';
  ok(esrc.split(OPT_FIRST).length === 2 && esrc.split(OPT_USE).length === 2, 'CONTROL setup: Connect judges the options once, before the take');
  const p6 = patchPath('src/server', 'channels-engine');
  writeCopy(p6, esrc.replace(OPT_FIRST, '').replace(OPT_USE, '    rec.options = normalizeOptions(mod, b.options, p.rec.options);\n'));
  const e6 = mkCfm(require(p6), path.join(ROOT, 'cfm-ctl6'));
  const s6 = await e6.startOAuth({ kind: 'gmail', fromMount: P });
  { const cu = new URL(s6.flow.consentUrl); await new Promise((resolve) => http.get(`${s6.flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=code-c6`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve)); }
  for (let i = 0; i < 40 && !e6.oauthStatus(s6.flowId).done; i++) await sleep(10);
  const k6 = await (async () => { try { await e6.connect('gmail', { flowId: s6.flowId, fromMount: P, options: { bogus: 'x' } }); return null; } catch (err) { return err; } })();
  const k6b = await (async () => { try { e6.oauthStatus(s6.flowId); return null; } catch (err) { return err; } })();
  ok(k6 && k6.code === 'unknown-option' && k6b && k6b.code === 'no-flow', 'CONTROL: an engine copy that takes the flow first loses the finished sign-in on a refused option — the survival check above would be red');
  // (7) an engine copy whose Connect resolves ANOTHER mount through the DECRYPTING read (the pre-r2 line)
  const HEAD_CMP = "      const h = mountHead(mod, b.fromMount);\n      if (p.choice.credentialKey !== CUSTOM_KEY || String(h.clientId) !== String(p.choice.credential.appId)) throw mismatch(`the client of storage mount \"${h.name}\"`);\n      named = clientFromMount(mod, b.fromMount);   // the same id: the secrets are compared (needs the key)\n";
  ok(esrc.split(HEAD_CMP).length === 2, 'CONTROL setup: Connect\'s id-first comparison is present once');
  const p7 = patchPath('src/server', 'channels-engine');
  writeCopy(p7, esrc.replace(HEAD_CMP, '      named = clientFromMount(mod, b.fromMount);\n'));
  const e7 = mkCfm(require(p7), path.join(ROOT, 'cfm-ctl7'));
  const s7 = await e7.startOAuth({ kind: 'gmail', fromMount: P });
  { const cu = new URL(s7.flow.consentUrl); await new Promise((resolve) => http.get(`${s7.flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=code-c7`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve)); }
  for (let i = 0; i < 40 && !e7.oauthStatus(s7.flowId).done; i++) await sleep(10);
  const d7 = mountDecs;
  const k7 = await (async () => { try { await e7.connect('gmail', { flowId: s7.flowId, fromMount: UNG }); return null; } catch (err) { return err; } })();
  ok(k7 && k7.code === 'mount-secret-undecryptable' && mountDecs - d7 === 1, `CONTROL: an engine copy that resolves the other mount through the decrypting read answers mount-secret-undecryptable after 1 decrypt — the r2 table would be red (${k7 && k7.code}, ${mountDecs - d7})`);
  // (8) an engine copy whose head skips the registry's id rule
  const ID_RULE = "    if (!v.ok) throw httpErr(400, 'invalid-client', `the storage mount \"${h.name}\"'s client is not one ${row.label} can use — ${Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ')}`, { errors: v.errors });\n";
  ok(esrc.split(ID_RULE).length === 2, 'CONTROL setup: the head\'s id rule is present once');
  const p8 = patchPath('src/server', 'channels-engine');
  writeCopy(p8, esrc.replace(ID_RULE, ''));
  const e8 = mkCfm(require(p8), path.join(ROOT, 'cfm-ctl8'));
  const d8 = mountDecs;
  const k8 = await (async () => { try { await e8.startOAuth({ kind: 'gmail', fromMount: BAD }); return null; } catch (err) { return err; } })();
  ok(k8 && k8.code === 'invalid-client' && mountDecs - d8 === 1, `CONTROL: an engine copy without the head's id rule still refuses (the seal's belt) but only AFTER 1 decrypt — the r2 table would be red (${k8 && k8.code}, ${mountDecs - d8})`);
  // (9) a routes copy without the config refusal / (10) without the malformed-fromMount refusal
  const CFG = "  try { forHost(req); if (refuseAgentBearer(req, res)) return; res.json({ config: engine().adapterConfig(req.params.id) }); } catch (e) { fail(res, e); }";
  const MAL = "    if (refuseMalformedMount(req, res)) return;\n    const b = req.body || {};\n    res.json({ ok: true, ...(await engine().startOAuth(";
  ok(rsrc.split(CFG).length === 2 && rsrc.split(MAL).length === 2, 'CONTROL setup: the config refusal and start\'s malformed-fromMount refusal are present once');
  const p9 = patchPath('src/routes', 'channels');
  writeCopy(p9, rsrc.replace(CFG, "  try { forHost(req); res.json({ config: engine().adapterConfig(req.params.id) }); } catch (e) { fail(res, e); }").replace(MAL, "    const b = req.body || {};\n    res.json({ ok: true, ...(await engine().startOAuth("));
  const R9 = await serveWith(require(p9), eng);
  const cfg9 = await R9.call('GET', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/config`, undefined, AG);
  const num9 = await R9.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: 123 });
  ok(cfg9.status === 200 && !(num9.status === 400 && num9.body && num9.body.code === 'bad-request'), `CONTROL: a routes copy without the two refusals answers an agent bearer's config read 200 and a numeric fromMount ${num9.status} ${num9.body && num9.body.code} — the r2 checks above would be red`);
  R9.bodies.length = 0;
  await R9.close();

  // ── verify r3: WHAT WAS COPIED IS SAID BACK; the list's prefix is a hint, the copy is the mount's client at START; the bounds ──
  const s10 = await eng.startOAuth({ kind: 'gmail', fromMount: P });
  ok(s10.fromMount && s10.fromMount.mountId === P && s10.fromMount.name === 'mail archive' && s10.fromMount.clientIdPrefix === CID.slice(0, 12) && JSON.stringify(Object.keys(s10.fromMount).sort()) === JSON.stringify(['clientIdPrefix', 'mountId', 'name']) && !JSON.stringify(s10).includes(CSEC), 'verify r3: the start answer names the client copied — fromMount {mountId, name, clientIdPrefix}, never a secret');
  await land(s10.flow, 'code-p10');
  const c10 = await eng.connect('gmail', { flowId: s10.flowId, fromMount: P, name: 'said back' });
  ok(c10.fromMount && c10.fromMount.mountId === P && c10.fromMount.clientIdPrefix === CID.slice(0, 12), 'Connect from the flow says which mount the account was minted under');
  const ra10 = await eng.reauthorize(c10.adapter.id, { fromMount: D });
  ok(ra10.rebind === true && ra10.fromMount && ra10.fromMount.mountId === D && ra10.fromMount.clientIdPrefix === DID.slice(0, 12), 'a rebind re-authorize names the mount it will sign in under');
  await eng.cancelAuth(c10.adapter.id).catch(() => {});
  // TOCTOU: the Drive mount's client is EDITED between the list and the pick — the consent runs under the CURRENT
  // client, the answer + the audit line name THAT prefix (not the list's); Connect naming the same mount lands the flow's copy
  const listed = eng.mountClientsFor('gmail').clients.find((x) => x.mountId === D).clientIdPrefix;
  const NEWID = '999900001111-edited.apps.googleusercontent.com';
  await mm.update(D, { clientId: NEWID, clientSecret: 'GOCSPX-edited-MOUNT-s3cret-9', token: tok });
  const R10 = await serveWith(routes, eng);
  const s11 = await R10.call('POST', '/api/channels/oauth/start', { kind: 'gmail', fromMount: D });
  const auLast = eng.store.auditTail().filter((l) => l.op === 'client-from-mount').pop();
  ok(s11.status === 200 && new URL(s11.body.url).searchParams.get('client_id') === NEWID && s11.body.fromMount && s11.body.fromMount.clientIdPrefix === NEWID.slice(0, 12) && listed === DID.slice(0, 12) && auLast && auLast.clientIdPrefix === NEWID.slice(0, 12), `verify r3 (list freshness): a mount edited between the list (${listed}…) and the pick signs in under its CURRENT client — the answer and the audit line say ${NEWID.slice(0, 12)}…`);
  await mm.update(D, { clientId: '888800001111-third.apps.googleusercontent.com', clientSecret: 'GOCSPX-third-MOUNT-s3cret-8', token: tok });
  await land(s11.body.flow, 'code-p11');
  const c11 = await R10.call('POST', '/api/channels/adapters/gmail/connect', { flowId: s11.body.flowId, fromMount: D, name: 'toctou' });
  ok(c11.status === 200 && c11.body.adapter.customClient.appId === NEWID && c11.body.fromMount.clientIdPrefix === NEWID.slice(0, 12), 'Connect naming the same mount lands the flow\'s copy (the id the consent ran under), never the mount\'s newer one — and says so');
  ok(!R10.bodies.some((b) => b.includes(CSEC) || b.includes('GOCSPX-edited') || b.includes('GOCSPX-third')), 'verify r3: no route body carried a secret');
  await R10.close();
  // THE BOUND: the (MAX_RUNNING_FLOWS + 1)th pending begin supersedes the OLDEST running flow by name — a caller
  // cannot pin more listeners or held clients than that (the loopback's own rule; its suite pins the closure release)
  const OLMOD = require(path.join(REPO, 'src/oauth-loopback.js'));
  const eCap = mkCfm(ENG, path.join(ROOT, 'cfm-cap'));
  const capFlows = [];
  for (let i = 0; i < OLMOD.MAX_RUNNING_FLOWS + 1; i++) capFlows.push(await eCap.startOAuth({ kind: 'gmail', fromMount: P }));
  const capFirst = eCap.oauthStatus(capFlows[0].flowId), capLast = eCap.oauthStatus(capFlows[capFlows.length - 1].flowId);
  const capRunning = capFlows.filter((f) => eCap.oauthStatus(f.flowId).running).length;
  ok(capFirst.running === false && /ended to keep the number of open sign-ins at 32/.test(capFirst.error || '') && capLast.running === true && capRunning === OLMOD.MAX_RUNNING_FLOWS, `verify r3 (bounds): ${OLMOD.MAX_RUNNING_FLOWS + 1} pending fromMount begins ⇒ the first is ended by name (r4: the cap's own words — "${capFirst.error}"), ${capRunning} running`);
  // (11) CONTROL: an engine copy whose answers omit the copied client (the pre-r3 shape)
  const SAID = '  const withMount = (answer, choice) => { const m = mountNamed(choice); return m ? { ...answer, fromMount: m } : answer; };';
  ok(esrc.split(SAID).length === 2, 'CONTROL setup: the said-back helper is present once');
  const p11 = patchPath('src/server', 'channels-engine');
  writeCopy(p11, esrc.replace(SAID, '  const withMount = (answer) => answer;'));
  const e11 = mkCfm(require(p11), path.join(ROOT, 'cfm-ctl11'));
  const s11c = await e11.startOAuth({ kind: 'gmail', fromMount: P });
  ok(!('fromMount' in s11c), 'CONTROL: an engine copy that does not say the copied client back answers without fromMount — the r3 checks above would be red');

  // ── verify r4: THE CAP'S END IS SAID ON THE ACCOUNT; A VENDOR ECHO OF THE SECRET REACHES NO FRAME, FILE OR ITEM; A SIGN-IN IS THE OWNER'S ──
  // (12) a RECORD-LEVEL re-authorize (the account's own flow, watched through the broadcast) ended by the cap: the
  // record says so (lastAuthError + lastAuthAt move, a frame goes out) — r3 ended it by name in the machine and told
  // nobody: the Re-authorize dialog's watcher waited its whole 10 min, the card just stopped saying "Signing in…"
  const landOn = async (e, flow, code) => {   // `land` above polls the main engine; these legs have their own
    const cu = new URL(flow.consentUrl);
    await new Promise((resolve) => http.get(`${flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve));
    for (let i = 0; i < 60; i++) { let st_ = null; try { st_ = e.oauthStatus(flow.flowId); } catch { return null; } if (st_.done) return st_; await sleep(10); }
    return null;
  };
  const eSaid = mkCfm(ENG, path.join(ROOT, 'cfm-said'));
  const sS = await eSaid.startOAuth({ kind: 'gmail', fromMount: P }); await landOn(eSaid, sS.flow, 'code-said');
  const kS = (await eSaid.connect('gmail', { flowId: sS.flowId, fromMount: P, name: 'said' })).adapter.id;
  await sleep(40);
  const raS = await eSaid.reauthorize(kS, {});
  const baseAt = recOf(path.join(ROOT, 'cfm-said'), kS).lastAuthAt; const fr0 = frames.length;
  for (let i = 0; i < OLMOD.MAX_RUNNING_FLOWS; i++) await eSaid.startOAuth({ kind: 'gmail', fromMount: D });
  await sleep(40);
  const recS = recOf(path.join(ROOT, 'cfm-said'), kS); const cardS = eSaid.digest().adapters.find((a) => a.id === kS);
  ok(eSaid.oauth.status(raS.flow.flowId).cancelled === OLMOD.CAUSE_OVER_LIMIT && /ended to keep the number of open sign-ins/.test(recS.lastAuthError || '') && recS.lastAuthAt !== baseAt && cardS.flow === null && frames.length > fr0 && !!(recS.auth && recS.auth.tokenEnc), `verify r4: a re-authorize ended by the cap is SAID on the account (lastAuthError "${recS.lastAuthError}", lastAuthAt moved, ${frames.length - fr0} frame(s)), its token kept`);
  // (13) a vendor error that ECHOES the secret we sent — through the rebind (pending) path, the record's own flow and the
  // token refresh: the string reaches no broadcast frame, no file under the engine dir, no For-you item, no log line;
  // the vendor's other words are kept
  const todosR4 = []; const inboxR4 = { add: (k, it) => { const x = { id: `ut-${todosR4.length + 1}`, sessionKey: k, status: 'open', ...it }; todosR4.push(x); return x; }, get: (id) => todosR4.find((x) => x.id === id) || null, setStatus: (id, st_) => { const x = todosR4.find((y) => y.id === id); if (x) x.status = st_; } };
  const eEcho = ENG.create({ dataDir: path.join(ROOT, 'cfm-echo'), env: {}, broadcast: (m) => frames.push(m), fetch: fetchG, log: capLog, mountClients, userTodos: inboxR4 }); engines.push(eEcho);
  const sE = await eEcho.startOAuth({ kind: 'gmail', fromMount: P }); await landOn(eEcho, sE.flow, 'code-echo');
  const kE = (await eEcho.connect('gmail', { flowId: sE.flowId, fromMount: P, name: 'echo' })).adapter.id;
  await sleep(40);
  const whereIs = (sec) => ({ frames: frames.filter((f) => JSON.stringify(f).includes(sec)).length, disk: (() => { const hits = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, f.name); if (f.isDirectory()) walk(q); else if (fs.readFileSync(q, 'latin1').includes(sec)) hits.push(path.relative(ROOT, q)); } }; walk(path.join(ROOT, 'cfm-echo')); return hits; })(), logs: logs.filter((l) => l.includes(sec)).length, inbox: todosR4.filter((x) => JSON.stringify(x).includes(sec)).length });
  frames.length = 0; logs.length = 0; echoSecret = true;
  const rbE = await eEcho.reauthorize(kE, { fromMount: D });   // the rebind: its consent under D's client, refused with an echo of D's secret
  await landOn(eEcho, rbE.flow, 'code-echo-d'); await sleep(60);
  const wD = whereIs(DSEC); const recE1 = recOf(path.join(ROOT, 'cfm-echo'), kE);
  ok(wD.frames === 0 && wD.disk.length === 0 && wD.logs === 0 && wD.inbox === 0 && /\[client_secret withheld\] was rejected \(fake vendor echo\)/.test(recE1.lastAuthError || ''), `verify r4 (rebind): the vendor's echo of the borrowed secret is WITHHELD by value — no frame, no file, no log line carries it; the vendor's other words stay ("${recE1.lastAuthError}")`, JSON.stringify(wD));
  const rsE = await eEcho.reauthorize(kE, { fromMount: P });   // the record's own flow (same id: the secret re-copied in place)
  await landOn(eEcho, rsE.flow, 'code-echo-p'); await sleep(60);
  const wP = whereIs(CSEC);
  ok(wP.frames === 0 && wP.disk.length === 0 && wP.logs === 0 && /\[client_secret withheld\]/.test(recOf(path.join(ROOT, 'cfm-echo'), kE).lastAuthError || ''), 'verify r4 (the record\'s own flow): the same — withheld everywhere', JSON.stringify(wP));
  echoSecret = false;
  ok(!frames.some((f) => JSON.stringify(f).includes(CSEC) || JSON.stringify(f).includes(DSEC)), 'verify r4: no broadcast frame of this leg carried either secret');
  // (14) a SIGN-IN IS THE OWNER'S: a self-identifying agent bearer is 403 on every verb that begins or completes a consent,
  // whatever the body names (r2 refused only a body naming a mount — a bearer that could begin 33 sign-ins could end the
  // owner's through the cap); the config route's refusal is r2's
  const Ra = await serveWith(routes, eng);
  const agentRows = [
    ['start, own client', 'POST', '/api/channels/oauth/start', { kind: 'gmail', clientId: '777788889999-agent.apps.googleusercontent.com', clientSecret: 'GOCSPX-agent-own-secret-x' }],
    ['start, preset', 'POST', '/api/channels/oauth/start', { kind: 'gmail', clientPreset: 'org1' }],
    ['connect, new account', 'POST', '/api/channels/adapters/gmail/connect', { newAccount: true, clientPreset: 'org1' }],
    ['re-authorize, no client', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/reauthorize`, {}],
    ['paste-back (pending)', 'POST', '/api/channels/oauth/callback', { url: 'http://127.0.0.1:1/?state=x&code=y' }],
    ['paste-back (account)', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/auth/finish`, { url: 'http://127.0.0.1:1/?state=x&code=y' }],
    // verify r5: the verbs that FOLLOW or END a sign-in or touch an account's credential / standing (the status poll carries
    // the running consent URL — its state — a forged landing ends the owner's sign-in; cancel; the Edit dialog's PUT = a
    // secret rewrite or a policy flip; duplicate; disconnect; remove) — the same courtesy, refused before anything is read
    ['status (r5)', 'GET', '/api/channels/oauth/status'],
    ['cancel (r5)', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/auth/cancel`, {}],
    ['PUT {credential} (r5)', 'PUT', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}`, { credential: { appId: CID, appSecret: 'GOCSPX-agent-rewrote-it-000' } }],
    ['PUT {policy} (r5)', 'PUT', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}`, { policy: 'direct' }],
    ['duplicate (r5)', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/duplicate`, { name: 'dup' }],
    ['disconnect (r5)', 'POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/disconnect`, {}],
    ['DELETE (r5)', 'DELETE', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}`],
  ];
  const agentGot = [];
  for (const [what, m, p_, body] of agentRows) { const r = await Ra.call(m, p_, body, AG); agentGot.push([what, r.status, r.body && r.body.code]); }
  ok(agentGot.every((r) => r[1] === 403 && r[2] === 'agent-forbidden'), `verify r4 + r5: an agent bearer is 403 agent-forbidden on every consent verb and every account verb, whatever the body names (${agentGot.map((r) => r[0]).join('; ')})`, JSON.stringify(agentGot));
  ok(!!recOf(path.join(ROOT, 'cfm-eng'), c1.adapter.id) && !!recOf(path.join(ROOT, 'cfm-eng'), c1.adapter.id).auth.tokenEnc && !JSON.parse(disk(path.join(ROOT, 'cfm-eng'))).adapters.some((r) => r.label === 'dup'), 'verify r5: the refused verbs changed nothing — the account still holds its token, no duplicate was minted');
  const ownerStart = await Ra.call('POST', '/api/channels/oauth/start', { kind: 'gmail', clientId: '777788889999-agent.apps.googleusercontent.com', clientSecret: 'GOCSPX-agent-own-secret-x' });
  ok(ownerStart.status === 200 && ownerStart.body.flowId, 'the same body without a bearer (the owner\'s cookie) begins');
  ok(!Ra.bodies.some((b) => b.includes(CSEC) || b.includes(DSEC) || b.includes('GOCSPX-agent-own-secret-x')), 'no route body of this leg carried a secret');
  await Ra.close();
  // CONTROL: a routes copy without r4's line on start answers the agent's own-client begin 200
  const SIGN = "    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4\n";
  ok(rsrc.split(SIGN).length === 6, 'CONTROL setup: the r4 refusal is present on the five consent verbs');
  const p14 = patchPath('src/routes', 'channels');
  writeCopy(p14, rsrc.split(SIGN).join(''));
  const R14 = await serveWith(require(p14), eng);
  const a14 = await R14.call('POST', '/api/channels/oauth/start', { kind: 'gmail', clientId: '777788889999-agent.apps.googleusercontent.com', clientSecret: 'GOCSPX-agent-own-secret-x' }, AG);
  ok(a14.status === 200 && !!a14.body.flowId, `CONTROL: a routes copy without the r4 refusal begins a consent for an agent bearer (${a14.status}) — the check above would be red`);
  R14.bodies.length = 0;
  await R14.close();
  // CONTROL (r5): a routes copy without the account-verb courtesy answers the agent's cancel 200 (and its status poll)
  const ACCT = "if (refuseAgentBearer(req, res, ACCOUNT_IS_OWNERS)) return;";
  const CANCEL = "if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return; res.json(await engine().cancelAuth(req.params.id));";
  const STATUS = "    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r5: the consent URL (its state) is the owner's\n";
  ok(rsrc.split(ACCT).length === 5 && rsrc.split(CANCEL).length === 2 && rsrc.split(STATUS).length === 2, 'CONTROL setup: the r5 courtesy is present on the four account verbs, cancel and status');
  const p15 = patchPath('src/routes', 'channels');
  writeCopy(p15, rsrc.split(ACCT).join('').replace(CANCEL, 'res.json(await engine().cancelAuth(req.params.id));').replace(STATUS, ''));
  const R15 = await serveWith(require(p15), eng);
  const a15 = await R15.call('POST', `/api/channels/adapters/${encodeURIComponent(c1.adapter.id)}/auth/cancel`, {}, AG);
  const a15s = await R15.call('GET', '/api/channels/oauth/status', undefined, AG);
  ok(a15.status === 200 && a15.body && a15.body.ok === true && a15s.status !== 403, `CONTROL (r5): a routes copy without the courtesy lets an agent bearer cancel (${a15.status}) and poll the status (${a15s.status}) — the check above would be red`);
  R15.bodies.length = 0;
  await R15.close();
  // (15) THE STORAGE SIDE THAT LENDS THE CLIENT (verify r5): its own consent routes (gdrive-auth/*, gmail-auth/*), the
  // token write and the config read that prefills the client secret in the clear carry the same courtesy — the r2 essay
  // said "the mount routes refuse it" and they did not: the secret the channels side refused on mount-clients was one
  // GET away on the storage side. A source census (the wiring is a whole-server composition, not a router) + a control.
  const LENDING = ['/api/mounts/:id/config', '/api/mounts/gdrive-auth/start', '/api/mounts/gdrive-auth/status', '/api/mounts/gdrive-auth/callback', '/api/mounts/gdrive-auth/cancel', '/api/mounts/gmail-auth/start', '/api/mounts/gmail-auth/status', '/api/mounts/gmail-auth/callback', '/api/mounts/gmail-auth/cancel', '/api/mounts/:id/drive-token'];
  const lendingCensus = (src) => LENDING.map((route) => { const i = src.indexOf(`'${route}'`); const head = i < 0 ? '' : src.slice(i, src.indexOf('\n', src.indexOf('\n', i) + 1) + 1); return [route, i >= 0 && /refuseAgentBearer\(req, res\)\) return;/.test(head)]; });
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
  const lc = lendingCensus(wsrc);
  ok(lc.every((r) => r[1]) && /code: 'agent-forbidden'/.test(wsrc), `verify r5: every storage route that lends or reveals the client refuses an agent bearer by name in its first line (${lc.map((r) => r[0].replace('/api/mounts/', '')).join(', ')})`, JSON.stringify(lc.filter((r) => !r[1])));
  const lcm = lendingCensus(wsrc.replace(/^\s*if \(refuseAgentBearer\(req, res\)\) return;.*\n/gm, '').split('{ if (refuseAgentBearer(req, res)) return; ').join('{ '));
  ok(lcm.filter((r) => !r[1]).length === LENDING.length, `CONTROL: the wiring's text without the guards fails the census on all ${lcm.filter((r) => !r[1]).length} routes — the check above would be red`);
  // (16) THE HEAP AT EVERY STAGE (verify r5): over the REAL engine + machine + Gmail adapter and a fake Google that
  // RETAINS NOTHING (its tokens are minted by shape at answer time and dropped), the borrowed client secret — minted by
  // a CHILD process, only ever reaching the engine's process through the mounts key — and the refresh token are searched
  // for by SHAPE in a heap snapshot after each end: the exchange returned, Connect, a refresh, a refresh the vendor
  // refused with an echo, a cancelled re-borrow, disconnect, remove. r4 gated the cancel; these are the stages it did not
  // reach. The stages run in a SMALL child process (a snapshot of this suite's process costs 0.5 s; of the child 0.1 s).
  // Positive control: the secret IS in the heap while a sign-in runs. Negative controls, one per holder class: an
  // adapter that keeps the resolved client (a gmail copy — the copy an engine copy loads) and an engine that memoizes
  // the decrypted client per record — each holds the secret at every later stage, the removed record's included.
  {
    const { execFileSync } = require('node:child_process');
    const CHILD = String.raw`
import fs from 'node:fs'; import path from 'node:path'; import v8 from 'node:v8'; import http from 'node:http'; import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const [REPO, ENGINE, MDIR, ONLY] = process.argv.slice(2);
const require = createRequire(path.join(REPO, 'package.json'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const gmailMod = require(path.join(REPO, 'src/channels/gmail.js'));
const ENG = require(ENGINE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHAPES = { secret: /GOCSPX-R5HEAP-[0-9a-f]{24}/g, rt: /1\/\/R5RT-[0-9a-f]{24}/g, rtEnc: /1%2F%2FR5RT-[0-9a-f]{24}/g };
const only = ONLY ? new Set(ONLY.split(',')) : null;
let n = 0;
async function snap(tag) {
  if (only && !only.has(tag)) return null;
  for (let i = 0; i < 4; i++) { global.gc(); await sleep(10); }
  const f = path.join(MDIR, 'snap-' + (++n) + '.heapsnapshot'); v8.writeHeapSnapshot(f);
  const txt = fs.readFileSync(f, 'latin1'); fs.rmSync(f);
  const out = {}; for (const [k, re] of Object.entries(SHAPES)) out[k] = (txt.match(re) || []).length; return out;
}
const mm = new MountManager({ dataDir: MDIR });
const MID = mm.add({ type: 'drive', name: 'heap drive', token: '{"access_token":"x","refresh_token":"y"}', clientId: '123412341234-heapprobe.apps.googleusercontent.com', clientSecret: 'GOCSPX-R5HEAP-' + crypto.randomBytes(12).toString('hex') });
const mountClients = { list: (v) => mm.oauthClientsFor(v), head: (id, o) => mm.oauthClientIdOf(id, o), of: (id, o) => mm.oauthClientOf(id, o) };
const mintAt = () => 'ya29.R5AT-' + crypto.randomBytes(12).toString('hex');
const mintRt = () => '1//R5RT-' + crypto.randomBytes(12).toString('hex');
const J = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
let echo = false;
const fetchH = async (url, init = {}) => {   // keeps nothing: no call log, no token map, no regex over the bearer
  const u = new URL(String(url));
  if (u.hostname === 'oauth2.googleapis.com') {
    const form = Object.fromEntries(new URLSearchParams(String(init.body || '')));
    if (echo) return J({ error: 'invalid_client', error_description: 'secret ' + form.client_secret + ' rt ' + (form.refresh_token || '-') + ' refused (echo)' }, 401);
    if (form.grant_type === 'refresh_token') return J({ access_token: mintAt(), expires_in: 3600, token_type: 'Bearer' });
    return J({ access_token: mintAt(), expires_in: 3600, refresh_token: mintRt(), scope: gmailMod.SCOPE, token_type: 'Bearer' });
  }
  const auth = String((init.headers || {}).Authorization || '');
  if (!(auth.startsWith('Bearer ya29.R5AT-') && auth.length === 41)) return J({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
  const p = u.pathname.replace('/gmail/v1/users/me', '');
  if (p === '/profile') return J({ emailAddress: 'heap@example.test', historyId: '100' });
  if (p === '/threads') return J({ threads: [] });
  return J({ historyId: '100' });
};
const quiet = { log() {}, warn() {}, error() {} };
let T = Date.now(); const now = () => T;
const ol = OL.createOAuthLoopback({ log: quiet, now });
const eng = ENG.create({ dataDir: path.join(MDIR, 'eng'), env: {}, now, broadcast: () => {}, fetch: fetchH, log: quiet, mountClients, oauth: ol, paceClock: () => performance.now(), sleep: async () => {} });
const get = (url) => new Promise((resolve) => { http.get(url, { agent: false }, (res) => { res.resume(); res.on('end', resolve); }).on('error', resolve); });
const land = async (flow, code) => { const cu = new URL(flow.consentUrl); await get(flow.redirectUri + '/?state=' + cu.searchParams.get('state') + '&code=' + code); for (let i = 0; i < 100; i++) { const st = ol.status(flow.flowId); if (!st || st.done || st.cancelled) break; await sleep(10); } await sleep(30); };
const out = {};
const s0 = await eng.startOAuth({ kind: 'gmail', fromMount: MID });
out.running = await snap('running');
await land(s0.flow, 'c1');
out.exchanged = await snap('exchanged');
const A = (await eng.connect('gmail', { flowId: s0.flowId, fromMount: MID, name: 'heap' })).adapter.id; await sleep(80);
out.connected = await snap('connected');
T += 2 * 3600 * 1000; await eng.pass(A, { force: true }).catch(() => {}); await sleep(40);
out.refreshed = await snap('refreshed');
echo = true; T += 2 * 3600 * 1000; await eng.pass(A, { force: true }).catch(() => {}); await sleep(40); echo = false;
out.echoed = await snap('echoed');
await eng.reauthorize(A, { fromMount: MID }); await eng.cancelAuth(A); await sleep(20);
out.reborrowCancelled = await snap('reborrowCancelled');
await eng.disconnect(A); await sleep(20);
out.disconnected = await snap('disconnected');
await eng.remove(A); await sleep(20);
out.removed = await snap('removed');
ol.stopAll(); eng.stop();
process.stdout.write(JSON.stringify(out));
process.exit(0);
`;
    const childPath = path.join(MUTE.dir, 'heap-stages-child.mjs');
    fs.writeFileSync(childPath, CHILD);
    const runStages = (enginePath, tag, only = null) => {
      const mdir16 = path.join(ROOT, `cfm-heap-${tag}`); fs.mkdirSync(mdir16, { recursive: true });
      const raw = execFileSync(process.execPath, ['--expose-gc', childPath, REPO, enginePath, mdir16, only ? only.join(',') : ''], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      return JSON.parse(raw);
    };
    const held = (o) => !!o && Object.values(o).some((n) => n > 0);
    const after = ['exchanged', 'connected', 'refreshed', 'echoed', 'reborrowCancelled', 'disconnected', 'removed'];
    const real = runStages(path.join(REPO, 'src/server/channels-engine.js'), 'real');
    ok(real.running.secret >= 1 && after.every((k) => !held(real[k])), `verify r5 (16): the borrowed secret is in the heap while the sign-in runs (${real.running.secret}) and neither it nor the refresh token is held after ANY later stage — ${after.map((k) => `${k}=${JSON.stringify(real[k])}`).join(' ')}`);
    // CONTROL 1 (adapter-held): a gmail copy that keeps every client it resolved, loaded by an engine copy
    const srcG16 = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
    const RES = "    return { values: r.values, why: null, missing: [], source: r.source, clusterLabel: r.clusterLabel || null, clusterKey: r.clusterKey || null, credentialKey };";
    ok(srcG16.split(RES).length === 2 && esrc.split("const gmail = require('../channels/gmail.js');").length === 2, 'CONTROL setup (16): the resolver\'s return and the engine\'s gmail require are present once');
    const gKeep = MUTE.write('src/channels/gmail.js', srcG16.replace(RES, "    HELD16.push(r.values); return { values: r.values, why: null, missing: [], source: r.source, clusterLabel: r.clusterLabel || null, clusterKey: r.clusterKey || null, credentialKey };").replace("'use strict';", "'use strict'; const HELD16 = [];"), 'keeps-client', { esm: false });
    const p16a = patchPath('src/server', 'channels-engine');
    writeCopy(p16a, esrc.replace("const gmail = require('../channels/gmail.js');", `const gmail = require(${JSON.stringify(gKeep)});`));
    const c1h = runStages(p16a, 'ctl1', ['refreshed', 'removed']);
    ok(c1h.refreshed.secret >= 1 && c1h.removed.secret >= 1, `CONTROL 1 (16): an adapter that keeps the client it resolved holds the secret after a refresh (${c1h.refreshed.secret}) and after the account is removed (${c1h.removed.secret}) — the check above would be red`);
    // CONTROL 2 (engine-held): an engine copy that memoizes the decrypted client per record
    const CC = "    return { ...base, source: 'custom', values, missing: [], why: null, whyCode: null, whyParams: null };";
    ok(esrc.split(CC).length === 2, 'CONTROL setup (16): customClientOf\'s return is present once');
    const p16b = patchPath('src/server', 'channels-engine');
    writeCopy(p16b, esrc.replace(CC, "    { const memo16 = { ...base, source: 'custom', values, missing: [], why: null, whyCode: null, whyParams: null }; MEMO16.set(rec, memo16); return memo16; }").replace("'use strict';", "'use strict'; const MEMO16 = new Map();"));
    const c2h = runStages(p16b, 'ctl2', ['exchanged', 'removed']);
    ok(c2h.exchanged.secret >= 1 && c2h.removed.secret >= 1, `CONTROL 2 (16): an engine that memoizes the decrypted client holds the secret once the exchange returned (${c2h.exchanged.secret}) and after the record is removed (${c2h.removed.secret}) — the check above would be red`);
  }
  routes.setup({ getEngine: () => null });
  for (const e of [eng, e1, e2, e5, e6, e7, e8, e11, eCap, eSaid, eEcho, bare]) { try { e.oauth.stopAll(); } catch {} }
}

for (const e of engines) { try { e.stop(); } catch {} }

// ── ⑬ mirror-193: A WHOLE-LIST WRITE FROM A STALE COPY IS REFUSED BY NAME ──
// The 2.369.193 mirror (test-channels-aggregate-ui, attempt 1): the agent Xi was granted the account through the
// route; the Grant access… dialog opened on the panel's broadcast-fed copy, which had not heard of Xi yet (empty ⇒
// the dialog's default row = the first live agent), and its Save — the grain's WHOLE access list — replaced Xi with
// [reader, 工作]: Xi's access was revoked by a write nobody meant as a revocation. A dialog's write now carries the
// STAMP of the lists it drew (`base`, PURE F.grainStamp); a grain that moved since is refused `grain-changed` (409)
// and nothing is written; the dialogs draw from a fresh read (`GET …/adapters/:id/view`).
console.log('⑬ mirror-193: a whole-list write from a stale copy is refused by name (grain-changed), nothing written');
{
  const F = require(path.join(REPO, 'src/channel-filter.js'));
  const A = 'fake-poll', ACC = { kind: 'account' };
  const XI = { kind: 'agent', id: 'agent-xi', name: 'Xi' }, READER = { kind: 'agent', id: 'a99e0001-reader', name: 'reader' }, WORK = { kind: 'group', id: 'tg-work', name: '工作' };
  const call = (eng, method, url, body) => new Promise((resolve) => {
    routes.setup({ getEngine: () => eng });
    const req = { method, url, params: url.params, query: {}, body: body || {} };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); return this; } };
    const layer = routes.router.stack.find((l) => l.route && l.route.path === url.path && l.route.methods[method.toLowerCase()]);
    if (!layer) return resolve({ status: 0, body: { error: 'no such route' } });
    Promise.resolve(layer.route.stack[0].handle(req, res, () => {})).catch((e) => resolve({ status: 500, body: { error: String(e && e.message) } }));
  });
  const VIEW = { path: '/api/channels/adapters/:id/view', params: { id: A } };
  const ACCESS = { path: '/api/channels/adapters/:id/access', params: { id: A } };
  const WATCH = { path: '/api/channels/adapters/:id/watchers', params: { id: A } };
  const { eng } = mkEngine({ name: 'grain-stamp' });
  await eng.pass(A, { force: true });
  const stored = () => F.grainOf(eng.store.index.table('accountAssignments')[A] || {});
  const names = () => stored().access.map((r) => r.principal.name).sort().join();
  const STALE = F.grainStamp({ access: [], watchers: [] });   // the copy that had not heard of Xi
  const seed = await eng.setAccess(A, ACC, [{ principal: XI, authority: 'draft' }]);   // the route seed: no base = unconditional
  ok(seed.ok && names() === 'Xi', 'FIXTURE: Xi holds access to the account (a write that states no base is unconditional, as before)', JSON.stringify(seed));
  const r1 = await call(eng, 'PUT', ACCESS, { access: [{ principal: READER, authority: 'draft' }, { principal: WORK, authority: 'draft' }], base: STALE });
  ok(r1.status === 409 && r1.body.code === 'grain-changed' && names() === 'Xi', `THE MIRROR'S WRITE (the dialog's whole list [reader, 工作] from the copy that had not heard of Xi) is refused 409 grain-changed and NOTHING is written — Xi keeps access (stored: ${names()})`, JSON.stringify(r1));
  const vr = F.grainBaseVerdict(stored(), STALE);
  ok(!vr.ok && vr.added.join() === 'agent:agent-xi' && vr.removed.length === 0, 'the refusal names who arrived since the read (agent:agent-xi)', JSON.stringify(vr));
  const v1 = await call(eng, 'GET', VIEW);
  ok(v1.status === 200 && v1.body.adapter && v1.body.adapter.id === A && v1.body.adapter.accountGrain && v1.body.adapter.accountGrain.access.map((r) => r.principal.name).join() === 'Xi', 'GET …/adapters/:id/view: the account as it stands NOW (the view the digest carries), Xi in its access', JSON.stringify(v1.body.adapter && v1.body.adapter.accountGrain));
  const fresh = F.grainStamp(v1.body.adapter.accountGrain);
  ok(fresh === F.grainStamp(stored()), 'the stamp of the VIEW the dialog draws equals the stamp of the STORED lists the engine judges (one function, both sides)');
  const r2 = await call(eng, 'PUT', ACCESS, { access: [{ principal: XI, authority: 'draft' }, { principal: WORK, authority: 'draft' }], base: fresh });
  ok(r2.status === 200 && r2.body.ok && names() === 'Xi,工作', 'a write whose base is the fresh read is accepted: Xi + 工作', JSON.stringify(r2.body));
  const r3 = await call(eng, 'PUT', WATCH, { watchers: [{ principal: WORK, notify: 'wake' }], base: fresh });
  ok(r3.status === 409 && r3.body.code === 'grain-changed' && stored().watchers.length === 0, 'the NOTIFY write from the pre-grant read (工作 was added since) is refused the same way — nothing written', JSON.stringify(r3.body));
  const fresh2 = F.grainStamp((await call(eng, 'GET', VIEW)).body.adapter.accountGrain);
  const r4 = await call(eng, 'PUT', WATCH, { watchers: [{ principal: XI, notify: 'wake' }], base: fresh2 });
  ok(r4.status === 200 && stored().watchers.map((w) => w.principal.name).join() === 'Xi', '…and from a fresh read it lands (Xi woken)', JSON.stringify(r4.body));
  const wakeBefore = F.grainStamp(stored());
  await eng.store.index.update((ix) => { const h = ix.accountAssignments[A]; h.watchers[0].stats = { wakes: [Date.now()], hits: [Date.now()] }; });
  ok(F.grainStamp(stored()) === wakeBefore, 'a WAKE (the pace ledger moving) is not an edit: the stamp stays, an open Notify… still saves');
  const vNo = await call(eng, 'GET', { path: '/api/channels/adapters/:id/view', params: { id: 'no-such' } });
  ok(vNo.status === 404 && vNo.body.code === 'no-such-adapter', 'the view of an account that does not exist is 404 no-such-adapter (the dialog says "That account no longer exists")', JSON.stringify(vNo));
  // the conversation grain: the same rule on its own route
  const C = 'fake-poll-ops', CONV = { path: '/api/channels/:adapterId/:convId/access', params: { adapterId: A, convId: C } };
  const cv0 = F.grainStamp(eng.conversationView(A, C).own);
  await eng.setAccess(A, { kind: 'conversation', convId: C }, [{ principal: XI }]);
  const rc = await call(eng, 'PUT', CONV, { access: [{ principal: READER }], base: cv0 });
  ok(rc.status === 409 && rc.body.code === 'grain-changed' && eng.conversationView(A, C).own.access.map((r) => r.principal.name).join() === 'Xi', 'the CONVERSATION grain: a stale write is refused 409 and Xi keeps its access', JSON.stringify(rc.body));
  ok(F.grainStamp(eng.conversationView(A, C).own) === F.grainStamp(F.grainOf(eng.store.index.peek(`${A}/${C}`))), '…and its view (rows clamped by the caps carry authorityStored) stamps like the stored lists');
  // NEGATIVE CONTROL: the engine without the verdict line writes the mirror's outcome
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const LINE = '    const bv = F.grainBaseVerdict(cur, p.base);\n    if (!bv.ok) return bv;\n';
  ok(esrc.split(LINE).length === 2, 'the verdict line is present once (the control removes exactly it)');
  const engCopy = patchPath('src/server', 'channels-engine');
  writeCopy(engCopy, esrc.replace(LINE, ''));
  const PE = require(engCopy);
  const pre = PE.create({ dataDir: path.join(ROOT, 'grain-stamp-pre'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {} });
  engines.push(pre);
  await pre.pass(A, { force: true });
  await pre.setAccess(A, ACC, [{ principal: XI, authority: 'draft' }]);
  const rp = await call(pre, 'PUT', ACCESS, { access: [{ principal: READER, authority: 'draft' }, { principal: WORK, authority: 'draft' }], base: STALE });
  const preNames = F.grainOf(pre.store.index.table('accountAssignments')[A] || {}).access.map((r) => r.principal.name).sort().join();
  ok(rp.status === 200 && preNames === 'reader,工作', `NEGATIVE CONTROL: without the verdict the stale write REPLACES Xi — the mirror's wire exactly (${preNames}) — the refusal leg above would go red`, JSON.stringify(rp.body));
  routes.setup({ getEngine: () => eng });
}

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
// ── ⑯ A RE-AUTHORIZATION RE-JUDGES EVERY CONVERSATION (inc-muk9jj0j-rel3, 2026-09-27) ──
// The owner: "已经重新授权过 但还是有个邮件提示没有发送权限". convCaps is cached PER
// conversation with its `at`; the re-authorization wrote the new scopes and
// invalidated NONE of them — only the threads the next pass visited got a
// fresh verdict, an untouched thread kept "sending needs the send permission"
// indefinitely. A scoped fake whose send verdict is a PURE function of the
// held scopes (like Gmail's / Lark's `sendCapsOf`), a DISABLED account (no pass
// ever touches its conversations), two conversations judged read-only BEFORE
// the consent: after it — with no pass — both are writable, on read AND on
// disk, carried by ONE whole digest. Control: the engine copy that skips the
// invalidation keeps both read-only (the incident).
console.log('\n⑯ a re-authorization re-judges every conversation of the account (inc-muk9jj0j-rel3)');
async function reauthLeg(E, name, { pure = true } = {}) {
  let clock = Date.UTC(2026, 8, 27, 18, 0, 0);
  const cap = {};
  const kind = pure ? 'fake-scoped' : 'fake-unscoped';
  const mod = {
    kind, caps: { ...fake.fakePoll.caps, compose: false },
    ...(pure ? { sendCapsOf: (scopes) => (scopes.includes('send') ? { sendAs: ['user'], why: null } : { sendAs: [], why: 'send-scope-not-granted' }) } : {}),
    create(record, deps) {
      cap.deps = deps;
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: [], why: null }; } },
        async listConversations() { return { conversations: [], cursor: null, complete: true }; },
        async convCaps() { cap.vendorAsked = (cap.vendorAsked || 0) + 1; return { read: 'yes', sendAs: [], why: 'send-scope-not-granted', at: clock }; },
        async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
        async older() { return { records: [], exhausted: true }; },
        async fetchAttachment() { throw new CH.ChannelError('not-found', 'x'); },
        async send() { return { ok: true, vendorMessageId: 'v', at: clock, sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const registry = CH.createChannelRegistry();
  registry.register(mod);
  const dataDir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  const T0 = clock - 3600e3;
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'sc', kind, label: 'Scoped', enabled: false, auth: { tokenEnc: null, expiresAt: null, scopes: ['read'], user: null, updatedAt: T0, scopesAt: T0 }, lastAuthAt: T0, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
  const events = [];
  const eng = E.create({ dataDir, registry, env: {}, now: () => clock, broadcast: (m) => events.push(m), log: { log() {}, warn() {}, error() {} } });
  engines.push(eng);
  await eng.store.index.update(() => {
    for (const c of ['c1', 'c2']) { const en = eng.store.index.entry('sc', c); en.title = c; en.convCaps = { read: 'yes', sendAs: [], why: 'send-scope-not-granted', at: clock - 1800e3 }; }
  });
  const offered = (c) => { const v = eng.conversationView('sc', c); return { offered: v.offers.sendAsUser.offered, why: v.offers.sendAsUser.why }; };
  const before = [offered('c1'), offered('c2')];
  eng.kick('sc');   // the adapter instance (its deps = the engine's own token door + consent hook); a disabled account never passes
  clock += 60e3;
  const w = await cap.deps.tokens.write({ access_token: 'a1', refresh_token: 'r1', email: 'owner@example.com' }, { scopes: ['read', 'send'], user: 'owner@example.com', consent: { cancelled: () => null } });
  const onRead = [offered('c1'), offered('c2')];
  events.length = 0;
  await cap.deps.onAuthDone('sc', { ok: true });
  const whole = events.filter((m) => m.type === 'channels-updated' && m.partial === false);
  const rows = whole.length ? (whole[whole.length - 1].digest.conversations || []).filter((r) => r.adapterId === 'sc') : [];
  const disk = ['c1', 'c2'].map((c) => eng.store.index.peek(`sc/${c}`).convCaps);
  // a REFRESH re-writing the SAME scopes is not a credential change
  const stampBefore = eng.adapterRecords().adapters.find((a) => a.id === 'sc').auth.scopesAt;
  clock += 60e3;
  await cap.deps.tokens.write({ access_token: 'a2', refresh_token: 'r2', email: 'owner@example.com' }, { scopes: ['send', 'read'], supersedes: 'r1' });
  const stampAfter = eng.adapterRecords().adapters.find((a) => a.id === 'sc').auth.scopesAt;
  return { before, w, onRead, whole: whole.length, rows: rows.map((r) => [r.id, r.offers && r.offers.sendAsUser && r.offers.sendAsUser.offered]), disk, stampBefore, stampAfter, vendorAsked: cap.vendorAsked || 0 };
}
{
  const r = await reauthLeg(ENG, 'reauth');
  ok(r.before.every((x) => !x.offered && x.why === 'send-scope-not-granted'), 'FIXTURE: both conversations were judged read-only (send-scope-not-granted) BEFORE the re-authorization', JSON.stringify(r.before));
  ok(r.w && r.w.written === true, 'FIXTURE: the consent landed through the engine\'s own token door (scopes read + send)', JSON.stringify(r.w));
  ok(r.onRead.every((x) => x.offered), 'STALE-ON-READ: right after the write — no pass, no consent hook yet — the conversation READ is writable for BOTH threads (a verdict older than the credential is re-judged on the way out)', JSON.stringify(r.onRead));
  ok(r.whole === 1 && r.rows.length === 2 && r.rows.every(([, o]) => o === true), 'the consent hook broadcasts ONE whole digest, and its rows already carry the fresh verdicts', JSON.stringify([r.whole, r.rows]));
  ok(r.disk.every((cc) => cc && cc.read === 'yes' && JSON.stringify(cc.sendAs) === '["user"]' && cc.why === null && cc.rejudged === 'scopes'), 'AT THE WRITE: both verdicts are re-judged and PERSISTED from the held scopes — the untouched thread too', JSON.stringify(r.disk));
  ok(r.vendorAsked === 0, `zero vendor calls — the send verdict is a pure function of the held scopes (${r.vendorAsked})`);
  ok(r.stampAfter === r.stampBefore, 'a refresh re-writing the SAME scopes does not move `scopesAt` (no re-judge churn every hour)', JSON.stringify([r.stampBefore, r.stampAfter]));
  const u = await reauthLeg(ENG, 'reauth-unscoped', { pure: false });
  ok(u.onRead.every((x) => !x.offered && x.why === 'stale') && u.disk.every((cc) => cc && cc.rejudged === 'stale'), 'an adapter with NO pure rule: the old verdict is marked STALE (the next open / pass re-asks the vendor) — never the pre-consent "read-only" kept', JSON.stringify([u.onRead, u.disk]));
  // CONTROL: the engine that skips the invalidation — the incident, reproduced
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const GATE = '    const cc = en && en.convCaps;\n    if (!cc || !rec) return cc || null;\n';
  ok(esrc.includes(GATE), 'CONTROL setup: the re-judge gate is spelled once');
  const engCopy = patchPath('src/server', 'channels-engine');
  writeCopy(engCopy, esrc.replace(GATE, GATE + '    return cc;   // CONTROL: the pre-fix cache — nothing re-judges\n'));
  const c = await reauthLeg(require(engCopy), 'reauth-control');
  ok(c.onRead.every((x) => !x.offered) && c.rows.every(([, o]) => o === false) && c.disk.every((cc) => cc.why === 'send-scope-not-granted'), 'CONTROL: the engine without the invalidation keeps BOTH threads read-only after the re-authorization — on read, in the digest and on disk (the owner\'s incident); the legs above would redden on it', JSON.stringify([c.onRead, c.rows]));
  // wiring pins
  ok(/if \(r && r\.ok\) await rejudgeConvCaps\(rec, 'connected'\);\s*\n\s*if \(!stopped\) notify\(\[\]\);/.test(esrc) && /await rejudgeConvCaps\(rec, 're-authorized'\);/.test(esrc) && /await rejudgeConvCaps\(rec, 'disconnected'\);/.test(esrc) && /rejudgeConvCaps\(rec, 'boot'\)/.test(esrc), 'PIN: the consent hook, the switched-client rebind, the disconnect and the boot all re-judge BEFORE their one whole digest');
  ok(!/caps\.offers\(c, en(?: && en)?\.convCaps/.test(esrc) && !/convCapsState\(en\.convCaps/.test(esrc), 'PIN: no reader of a cached verdict bypasses `effectiveConvCaps` (views AND send decisions)');
  // THE CONVERSE (verify round, 2026-09-27): a DISCONNECT drops the credential — every conversation of the account flips to
  // read-only on read AND on disk, and a send the composer would have offered a moment earlier is REFUSED BY NAME
  {
    let clock = Date.UTC(2026, 8, 27, 19, 0, 0);
    const kind = 'fake-scoped-2';
    const registry = CH.createChannelRegistry();
    registry.register({
      kind, caps: { ...fake.fakePoll.caps, compose: false },
      sendCapsOf: (scopes) => (scopes.includes('send') ? { sendAs: ['user'], why: null } : { sendAs: [], why: 'send-scope-not-granted' }),
      create() {
        return {
          auth: { async state() { return { state: 'connected', expiresAt: null, scopes: [], why: null }; } },
          async listConversations() { return { conversations: [], cursor: null, complete: true }; },
          async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: clock }; },
          async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
          async older() { return { records: [], exhausted: true }; },
          async fetchAttachment() { throw new CH.ChannelError('not-found', 'x'); },
          async send() { return { ok: true, vendorMessageId: 'v', at: clock, sentAs: 'user' }; },
          async reconcile() { return { unknown: true }; },
        };
      },
    });
    const dataDir = path.join(ROOT, 'disconnect-refuses');
    fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
    const T0 = clock - 3600e3;
    fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'sd', kind, label: 'Scoped', enabled: true, auth: { tokenEnc: 'x', expiresAt: null, scopes: ['read', 'send'], user: null, updatedAt: T0, scopesAt: T0 }, lastAuthAt: T0, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
    const events = [];
    const eng = ENG.create({ dataDir, registry, env: {}, now: () => clock, broadcast: (m) => events.push(m), log: { log() {}, warn() {}, error() {} } });
    engines.push(eng);
    await eng.store.index.update(() => { for (const c of ['d1', 'd2']) { const en = eng.store.index.entry('sd', c); en.title = c; en.convCaps = { read: 'yes', sendAs: ['user'], why: null, at: clock - 60e3 }; } });
    const offered = (c) => { const v = eng.conversationView('sd', c); return { offered: v.offers.sendAsUser.offered, why: v.offers.sendAsUser.why }; };
    const before = [offered('d1'), offered('d2')];
    clock += 60e3;
    events.length = 0;
    const dis = await eng.disconnect('sd');
    const after = [offered('d1'), offered('d2')];
    const disk = ['d1', 'd2'].map((c) => eng.store.index.peek(`sd/${c}`).convCaps);
    const send = await eng.propose({ kind: 'user' }, 'sd', 'd1', { text: 'the reply typed before the disconnect', direct: true });
    ok(before.every((x) => x.offered) && dis && dis.ok, 'FIXTURE: both conversations offered sending as you; the account is then DISCONNECTED', JSON.stringify([before, dis]));
    ok(after.every((x) => !x.offered && x.why === 'send-scope-not-granted') && disk.every((cc) => cc && JSON.stringify(cc.sendAs) === '[]' && cc.why === 'send-scope-not-granted' && cc.rejudged === 'scopes'), 'THE CONVERSE: after the disconnect every conversation of the account is read-only — on read AND persisted — with the reason by name', JSON.stringify([after, disk]));
    ok(send && send.ok === false && send.code === 'send-not-available' && send.why === 'send-scope-not-granted', 'a send of the reply typed a moment earlier is REFUSED BY NAME (send-not-available · send-scope-not-granted) — never sent on the old verdict', JSON.stringify(send));
    ok(events.some((m) => m.type === 'channels-updated' && m.partial === false), 'the disconnect broadcasts ONE whole digest (the open windows flip their footer on it)');
  }
}

// ═══ ⑭ THE SERVER BELT UNDER /older (lane channel-render verify r6, 2026-09-27; drain rule 19) ═══════════
// Reproduced on this engine before the belt: 20 concurrent /older for ONE conversation reached the adapter 20
// times (the same page fetched 20 times); 20 in 2 s after the vendor said `exhausted` reached it 16 more times
// answering nothing; the account's minute budget was the only bound (546 calls before the first refusal). The
// window's five verify rounds each found one more way a client asks without a person paging — the belt bounds
// the METERED call whatever the client does: one flight per conversation (joiners read the log it filled), the
// floor (OLDER_FLOOR_MS, refused by name with the wait, the local page still answered), the remembered end (no
// call until a record is appended / the owner's Refresh / the entry is rebuilt). Through the REAL route. CONTROLS
// = the engine over a patched copy of the PURE drain, each clause reverted (a closed world, like the aggregate suite).
console.log('\n⑭ the server belt under /older: one flight, the floor, the remembered end; controls');
{
  const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
  const DRAIN_SRC = fs.readFileSync(path.join(REPO, 'src/channel-drain.js'), 'utf-8');
  const ENGINE_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  const DRAIN_REQUIRE = "const Drain = require('../channel-drain.js');";
  const worldOf = () => { const convs = new Map(); const at0 = Date.now() - 3600e3; const add = (id, count) => { const recs = []; for (let i = 0; i < count; i++) recs.push({ vendorId: `${id}-m${String(i).padStart(4, '0')}`, at: at0 - (count - 1 - i) * 60e3, author: { id: `u-${i % 3}`, name: ['Ada', 'Brook', 'Cass'][i % 3] }, text: `message ${i} in ${id}` }); convs.set(id, { id, recs }); }; add('deep', 260); add('flat', 3); return { convs, older: 0, log: [], delayMs: 0, failNext: null }; };
  const modFor = (world, receive = 'poll') => ({
    kind: 'belt',
    caps: { ...(receive === 'push' ? fake.fakePush.caps : fake.fakePoll.caps), receive, attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: 600, settingKey: null, metered: true } },
    create(record, deps) {
      const adapterId = record.id; const meter = deps.meter || (() => {});
      const rec = (id, m) => makeRecord({ adapterId, convId: id, vendorId: m.vendorId, at: m.at, author: { ...m.author, isSelf: false, isBot: false }, text: m.text, mentions: [], attachments: [], replyTo: null, threadKey: id, raw: {} });
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { meter(1); return { conversations: [...world.convs.values()].map((x) => makeConversation({ id: x.id, vendorId: x.id, title: x.id, kind: 'group', participants: 'Ada', lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null, limit = 50, initialMax = null } = {}) {
          meter(1);
          const x = world.convs.get(id); if (!x) return { records: [], anchor, reachedAnchor: true, complete: true };
          let idx = 0;
          if (anchor) { const at = x.recs.findIndex((m) => m.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; } else if (Number(initialMax) > 0) idx = Math.max(0, x.recs.length - Number(initialMax));
          const pending = x.recs.slice(idx); const page = pending.slice(0, limit); const drained = page.length === pending.length;
          return { records: page.map((m) => rec(id, m)), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older(id, { before = null, limit = 50 } = {}) {
          meter(1); world.older++; world.log.push({ id, before: before && before.vendorId });
          if (world.delayMs) await sleep(world.delayMs);
          if (world.failNext) { const code = world.failNext; world.failNext = null; throw new CH.ChannelError(code, 'HTTP 503 Service Unavailable', { retryable: true }); }
          const x = world.convs.get(id); const all = x ? x.recs : [];
          const olderOnes = before ? all.filter((m) => m.at < before.at || (m.at === before.at && m.vendorId < before.vendorId)) : all;
          const page = olderOnes.slice(-limit);
          return { records: page.map((m) => rec(id, m)), exhausted: page.length === olderOnes.length };
        },
        async fetchAttachment() { throw new CH.ChannelError('not-found', 'none'); },
        // r7: a push adapter — the lane's callbacks are the WORLD's (a vendor push is `world.onEvent({kind:'record', …})`)
        live: receive === 'push' ? { start({ onEvent, onState } = {}) { world.onEvent = onEvent; world.onState = onState; onState && onState({ state: 'live', at: Date.now() }); return { stop() {} }; } } : undefined,
      };
    },
  });
  const seed = (dataDir) => { fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true }); fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'sc', kind: 'belt', label: 'sc', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] })); };
  /** An engine (the shipped one, or one over a patched drain) + the real routes on a port; `clock` is the engine's clock (advanced by hand). */
  async function belt(name, { drainEdits = null, engineEdits = null, receive = 'poll' } = {}) {
    const world = worldOf();
    const registry = CH.createChannelRegistry(); registry.register(modFor(world, receive));
    const dataDir = path.join(ROOT, name); seed(dataDir);
    let mod = ENG, setup = true;
    if (drainEdits || engineEdits) {
      let e = ENGINE_SRC;
      if (drainEdits) {
        let d = DRAIN_SRC;
        for (const [a, b] of drainEdits) { if (!d.includes(a)) setup = false; d = d.replace(a, b); }
        const dPath = MUTE.write('src/channel-drain.js', d, null, { esm: false, name: `drain-${name}` });
        e = e.replace(DRAIN_REQUIRE, `const Drain = require(${JSON.stringify(dPath)});`);
        if (!ENGINE_SRC.includes(DRAIN_REQUIRE)) setup = false;
      }
      // r7: an ENGINE edit (a copy of the engine with one named line changed — the drain untouched)
      for (const [a, b] of engineEdits || []) { if (!e.includes(a)) setup = false; e = e.replace(a, b); }
      mod = MUTE.load('src/server/channels-engine.js', e, `belt-${name}`);
    }
    let clock = Date.now();
    const events = [];
    const eng = mod.create({ dataDir, registry, env: {}, now: () => clock, broadcast: (m) => events.push(m), serverSetting: () => undefined, liveSessions: () => [], deliver: { async deliverToConversation() { return { ok: true, lane: 'message' }; }, stashFor() {} }, log: { log() {}, warn() {}, error() {} } });
    engines.push(eng);
    for (let i = 0; i < 5; i++) { await eng.pass('sc', { force: true }); if (Object.values(eng.store.index.live()).filter((e) => e.adapterId === 'sc').every((e) => e.anchor)) break; }
    const express = require(path.join(REPO, 'node_modules/express'));
    const app = express(); app.use(express.json()); routes.setup({ getEngine: () => eng }); app.use(routes.router);
    const server = await new Promise((resolve) => { const s0 = app.listen(0, '127.0.0.1', () => resolve(s0)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (conv, body) => { const r = await fetch(`${base}/api/channels/sc/${conv}/older`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
    const boundary = (conv) => { const l = eng.store.readTail('sc', conv, { limit: 1000 }); return { before: l[0].at, beforeId: l[0].vendorId, limit: 50 }; };
    const localCount = (conv) => eng.store.readTail('sc', conv, { limit: 1000 }).length;
    return { eng, world, post, boundary, localCount, tick: (ms) => { clock += ms; }, close: () => server.close(), setup, events };
  }
  const B = await belt('belt');
  ok(B.localCount('deep') === 50 && B.world.older === 0, 'FIXTURE: the first ingest took the newest 50 of 260; the vendor\'s older() untouched');
  // ① ONE FLIGHT: 20 concurrent /older at one boundary — one vendor call, nineteen joiners carrying the page it landed
  B.world.delayMs = 30;
  const b1 = B.boundary('deep');
  const rs = await Promise.all(Array.from({ length: 20 }, () => B.post('deep', b1)));
  const srcs = rs.map((r) => r.json.source);
  ok(B.world.older === 1 && rs.every((r) => r.status === 200 && r.json.ok && (r.json.records || []).length === 50 && !r.json.refused) && srcs.filter((x) => x === 'vendor').length === 1 && srcs.filter((x) => x === 'joined').length === 19 && B.localCount('deep') === 100, `① 20 concurrent /older at one boundary: the vendor asked ONCE (${B.world.older}), one answer \`vendor\`, nineteen \`joined\` — every one carries the 50-row page (100 local)`, JSON.stringify({ older: B.world.older, srcs, n: rs.map((r) => (r.json.records || []).length) }));
  // ② THE FLOOR: the next ask inside OLDER_FLOOR_MS is refused by name with the wait, the local page still answered; past it the vendor is asked
  B.world.delayMs = 0;
  B.tick(300);
  const f1 = await B.post('deep', B.boundary('deep'));
  ok(f1.status === 200 && f1.json.ok && f1.json.refused === 'older-floor' && f1.json.code === 'older-floor' && f1.json.retryAfterMs > 0 && f1.json.retryAfterMs <= 1500 && f1.json.exhausted === false && Array.isArray(f1.json.records) && B.world.older === 1, `② an ask 300 ms after the flight is refused \`older-floor\` with the wait (${f1.json.retryAfterMs} ms), no vendor call, exhausted:false`, JSON.stringify(f1.json).slice(0, 300));
  B.tick(1300);
  const f2 = await B.post('deep', B.boundary('deep'));
  ok(f2.json.source === 'vendor' && !f2.json.refused && B.world.older === 2 && B.localCount('deep') === 150, `② …and past the floor the vendor is asked again (${B.world.older} calls, 150 local)`, JSON.stringify(f2.json).slice(0, 200));
  // ③ A HELD WHEEL: 20 serial asks over 2 s of engine time (100 ms apart) = at most 2 vendor calls (the floor), each a page
  { let calls0 = B.world.older; const seen = []; for (let i = 0; i < 20; i++) { B.tick(100); const r = await B.post('deep', B.boundary('deep')); seen.push(r.json.refused || r.json.source); } const made = B.world.older - calls0;
    ok(made <= 2 && made >= 1 && seen.filter((x) => x === 'older-floor').length >= 18, `③ 20 serial asks over 2 s of engine time: ${made} vendor call(s), the rest \`older-floor\` (${seen.join(' ')})`); }
  // ④ THE REMEMBERED END: page to the dawn, then every further ask answers `exhausted` from memory — no vendor call, no floor wait
  { for (let i = 0; i < 6; i++) { B.tick(1600); const r = await B.post('deep', B.boundary('deep')); if (r.json.exhausted) break; }
    ok(B.localCount('deep') === 260, `④ FIXTURE: paged to the dawn (${B.localCount('deep')} local)`);
    const calls0 = B.world.older; const rs2 = [];
    for (let i = 0; i < 5; i++) { B.tick(i % 2 ? 50 : 2000); rs2.push(await B.post('deep', B.boundary('deep'))); }
    ok(B.world.older === calls0 && rs2.every((r) => r.json.ok && r.json.exhausted === true && r.json.source === 'memory' && !r.json.refused && r.json.vendorHasNoOlder === false), `④ five more asks at the dawn (inside and past the floor): ZERO vendor calls, each \`exhausted\` from memory (before the belt: 5 vendor calls answering nothing)`, JSON.stringify(rs2.map((r) => [r.json.source, r.json.exhausted, r.json.refused]))); }
  // ⑤ THE MEMORY IS FORGOTTEN by a record appended (an ingest), by the owner's Refresh, and by a rebuilt entry — the vendor asked once again each time
  { const calls0 = B.world.older;
    B.world.convs.get('deep').recs.push({ vendorId: 'deep-new-1', at: Date.now() + 1000, author: { id: 'u-0', name: 'Ada' }, text: 'a new record' });
    B.tick(2000); await B.eng.pass('sc', { force: true });
    B.tick(2000); const a1 = await B.post('deep', B.boundary('deep'));
    ok(a1.json.source === 'vendor' && a1.json.exhausted === true && B.world.older === calls0 + 1, `⑤ a record APPENDED by an ingest forgets the end: the next ask reaches the vendor once (${B.world.older - calls0}), which says exhausted again`, JSON.stringify(a1.json).slice(0, 200));
    B.tick(2000); const a2 = await B.post('deep', B.boundary('deep'));
    ok(a2.json.source === 'memory' && B.world.older === calls0 + 1, '⑤ …and it is remembered again');
    B.tick(2000); const rf = await B.eng.refresh('sc', 'deep', { origin: 'refresh' }); await B.eng.settleWakes?.();
    B.tick(2000); const a3 = await B.post('deep', B.boundary('deep'));
    ok(rf && rf.ok !== undefined && a3.json.source === 'vendor' && B.world.older === calls0 + 2, `⑤ the owner\'s Refresh forgets it: one vendor call (${B.world.older - calls0} in all)`, JSON.stringify([rf, a3.json.source]));
    B.tick(2000); const dis = await B.eng.setEnabled?.('sc', false); const en = await B.eng.setEnabled?.('sc', true);
    B.tick(2000); const a4 = await B.post('deep', B.boundary('deep'));
    ok((dis === undefined || dis) && a4.json.source === 'vendor' && B.world.older === calls0 + 3, `⑤ a REBUILT entry (disable + enable) starts with no memory: one vendor call (${B.world.older - calls0} in all)`, JSON.stringify([dis, en, a4.json.source])); }
  // ⑥ A FAILED FLIGHT remembers nothing: the joiners get the local page, the next ask past the floor reaches the vendor
  { const calls0 = B.world.older; B.world.failNext = 'vendor-error'; B.tick(2000); B.world.delayMs = 20;
    const b = B.boundary('flat');
    const [x1, x2] = await Promise.all([B.post('flat', b), B.post('flat', b)]);
    B.world.delayMs = 0;
    ok(x1.status === 502 && x1.json.ok === false && x1.json.code === 'vendor-error' && x2.json.ok && x2.json.refused === 'older-floor' && Array.isArray(x2.json.records) && B.world.older === calls0 + 1, `⑥ a flight that failed: the asker gets the error, the joiner (whose local page is still short) the floor's refusal — no second call (${B.world.older - calls0})`, JSON.stringify({ x1: x1.json, x2: { ok: x2.json.ok, refused: x2.json.refused, recs: Array.isArray(x2.json.records) ? x2.json.records.length : x2.json.records }, calls: B.world.older - calls0 }));
    B.tick(2000); const x3 = await B.post('flat', b);
    ok(x3.json.source === 'vendor' && x3.json.exhausted === true && B.world.older === calls0 + 2, '⑥ …nothing was remembered: the next ask past the floor reaches the vendor'); }
  // ⑦ RULE 9 STAYS THE OUTER CAP: the budget is judged after the belt — a joined / remembered answer costs no unit
  { const view = B.eng.accountView ? null : null; const cardBefore = (B.eng.status?.() || {}); ok(true, `⑦ (the budget leg is test-channels-aggregate ⑦: rule 9 after rule 19 — a remembered answer is metered nothing: ${B.world.older} vendor calls in all, every one a page or the dawn)`); void view; void cardBefore; }
  B.close();
  // ⑧ (verify r7) A RECORD THE PUSH LANE APPENDED forgets the end too — the poll ingest and the push lane are the two
  //    writers of one log (a twin-set): r6 wired the poll's append and not the push's, so on a Lark account (the push
  //    lane IS its live lane) a pushed message left "nothing older" remembered until the owner's Refresh / a rebuilt
  //    entry / 6 h. The memory was money-safe in that direction (no call) and wrong in the other (the essay said a
  //    record appended forgets it); one line, one census, one control.
  {
    const P = await belt('belt-push', { receive: 'push' });
    await P.eng.setPush('sc', { claimedExclusive: 'exclusive', enabled: true });
    ok(typeof P.world.onEvent === 'function', 'FIXTURE (⑧): the push lane is armed — the vendor\'s onEvent is in hand');
    for (let i = 0; i < 4; i++) { P.tick(2000); const r = await P.post('flat', P.boundary('flat')); if (r.json.exhausted) break; }
    P.tick(2000); const m0 = await P.post('flat', P.boundary('flat'));
    ok(m0.json.source === 'memory' && m0.json.exhausted === true, '⑧ FIXTURE: the flat conversation is at its remembered end', JSON.stringify(m0.json).slice(0, 160));
    const c0 = P.world.older;
    P.world.onState && P.world.onState({ state: 'live', at: Date.now() });   // the lane is live NOW (the injected clock moved past the heartbeat window)
    const pushed = await P.world.onEvent({ kind: 'record', eventId: 'ev-r7-1', convId: 'flat', record: makeRecord({ adapterId: 'sc', convId: 'flat', vendorId: 'flat-pushed-1', at: Date.now() + 5, author: { id: 'u-1', name: 'Brook', isSelf: false, isBot: false }, text: 'pushed', mentions: [], attachments: [], replyTo: null, threadKey: 'flat', raw: {} }), at: Date.now() });
    P.tick(2000); const m1 = await P.post('flat', P.boundary('flat'));
    ok(pushed && pushed.persisted && pushed.appended === 1 && m1.json.source === 'vendor' && P.world.older === c0 + 1, `⑧ a record the PUSH lane appended (persisted, +1) forgets the end: the next ask reaches the vendor once (${P.world.older - c0}) — r6 answered it from memory`, JSON.stringify([pushed, m1.json.source, P.localCount('flat')]));
    P.close();
    const PC = await belt('belt-push-nochange', { receive: 'push', engineEdits: [["        if (w.appended) olderChanged(e, convId);   // rule 19 (verify r7): a record the PUSH lane appended forgets the \"nothing older\" memory, like the poll's\n", '']] });
    ok(PC.setup, 'CONTROL setup · push-nochange: the push site\'s forget is spelled once');
    if (PC.setup) {
      await PC.eng.setPush('sc', { claimedExclusive: 'exclusive', enabled: true });
      for (let i = 0; i < 4; i++) { PC.tick(2000); const r = await PC.post('flat', PC.boundary('flat')); if (r.json.exhausted) break; }
      const c1 = PC.world.older;
      PC.world.onState && PC.world.onState({ state: 'live', at: Date.now() });
      const pushed2 = await PC.world.onEvent({ kind: 'record', eventId: 'ev-r7-2', convId: 'flat', record: makeRecord({ adapterId: 'sc', convId: 'flat', vendorId: 'flat-pushed-2', at: Date.now() + 5, author: { id: 'u-1', name: 'Brook', isSelf: false, isBot: false }, text: 'pushed', mentions: [], attachments: [], replyTo: null, threadKey: 'flat', raw: {} }), at: Date.now() });
      PC.tick(2000); const m2 = await PC.post('flat', PC.boundary('flat'));
      ok(pushed2 && pushed2.persisted && m2.json.source === 'memory' && PC.world.older === c1, 'CONTROL push-nochange: with the push site\'s forget removed the pushed record leaves the end remembered — ⑧ would redden', JSON.stringify([pushed2, m2.json.source]));
    }
    PC.close();
  }
  // ⑨ (verify r7) THE PRODUCER CENSUS: every vendor `older()` call in src/ is THE ONE in loadOlder, textually after the
  //    verdict; a copy of the engine that bypasses the verdict (`{act:'vendor'}`) lets 20 concurrent asks reach the vendor 20 times
  {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : (/\.(c|m)?js$/.test(x.name) ? [path.join(d, x.name)] : [])));
    const sites = [];
    for (const f of walk(path.join(REPO, 'src'))) { const src = fs.readFileSync(f, 'utf-8'); let m; const re = /\.older\(/g; while ((m = re.exec(src))) sites.push(path.relative(REPO, f) + ':' + (src.slice(0, m.index).split('\n').length)); }
    const at = ENGINE_SRC.indexOf('e.adapter.older(');
    const verdictAt = ENGINE_SRC.indexOf('Drain.olderVerdict(olderMemOf(e, convId), now())');
    const fnAt = ENGINE_SRC.indexOf('async function loadOlder(');
    ok(sites.length === 1 && /^src\/server\/channels-engine\.js:/.test(sites[0]) && at > 0 && verdictAt > fnAt && at > verdictAt, `⑨ CENSUS: the vendor's older() has ONE caller in src/ (${sites.join(', ')}), inside loadOlder after the rule-19 verdict`, JSON.stringify({ sites, at, verdictAt, fnAt }));
    const BY = await belt('belt-bypass', { engineEdits: [['      let v = Drain.olderVerdict(olderMemOf(e, convId), now());\n', "      let v = { act: 'vendor' }; olderMemOf(e, convId);\n"]] });   // (the memory still minted: the verdict alone is skipped)
    ok(BY.setup, 'CONTROL setup · bypass: the verdict is asked on one line');
    if (BY.setup) { BY.world.delayMs = 30; const rs = await Promise.all(Array.from({ length: 20 }, () => BY.post('deep', BY.boundary('deep')))); ok(BY.world.older >= 19 && rs.every((r) => r.status === 200), `CONTROL bypass: an engine that skips the verdict lets 20 concurrent asks reach the vendor ${BY.world.older} times — ① would redden`, JSON.stringify(rs.map((r) => [r.status, r.json.source || r.json.code, r.json.error]).slice(0, 3))); }
    BY.close();
  }
  // CONTROLS: the engine over a patched drain, each clause reverted — the reproduction returns
  const CTL = [
    // (the join is the COURTESY: without it the floor still holds the money — one vendor call — but nineteen callers get a
    //  refusal with an empty page instead of the page the flight landed; the floor and the memory are the money clauses)
    { name: 'nojoin', edits: [["  if (m.inflight) return { act: 'join' };\n", '']], leg: async (C) => { C.world.delayMs = 30; const rs = await Promise.all(Array.from({ length: 20 }, () => C.post('deep', C.boundary('deep')))); return { calls: C.world.older, joined: rs.filter((r) => r.json.source === 'joined').length, refused: rs.filter((r) => r.json.refused === 'older-floor' && (r.json.records || []).length === 0).length }; }, red: (n) => n.calls === 1 && n.joined === 0 && n.refused === 19, say: (n) => `20 concurrent asks: ${n.calls} vendor call (the floor holds the money), but ${n.refused} callers refused with an EMPTY page and ${n.joined} joined (the shipped belt: 19 joined, each carrying the page)` },
    { name: 'nomemory', edits: [["  if (ex > 0 && t - ex < OLDER_MEMORY_MS) return { act: 'exhausted' };\n", '']], leg: async (C) => { for (let i = 0; i < 8; i++) { C.tick(2000); const r = await C.post('deep', C.boundary('deep')); if (r.json.exhausted && r.json.source === 'vendor') break; } const c0 = C.world.older; for (let i = 0; i < 3; i++) { C.tick(2000); await C.post('deep', C.boundary('deep')); } return C.world.older - c0; }, red: (n) => n >= 3, say: (n) => `three asks at the dawn reached the vendor ${n} times` },
    { name: 'nofloor', edits: [["  if (asked > 0 && t - asked < OLDER_FLOOR_MS) return { act: 'floor', retryAfterMs: Math.min(OLDER_FLOOR_MS, Math.max(1, OLDER_FLOOR_MS - (t - asked))) };   // never longer than the floor (a clock that went backwards)\n", '']], leg: async (C) => { const c0 = C.world.older; for (let i = 0; i < 4; i++) { C.tick(100); await C.post('deep', C.boundary('deep')); } return C.world.older - c0; }, red: (n) => n >= 4, say: (n) => `four asks 100 ms apart reached the vendor ${n} times` },
  ];
  for (const c of CTL) {
    const C = await belt(`belt-${c.name}`, { drainEdits: c.edits });
    ok(C.setup, `CONTROL setup · ${c.name}: the clause is spelled once in the shipped drain`);
    if (!C.setup) { C.close(); continue; }
    const n = await c.leg(C);
    ok(c.red(n), `CONTROL ${c.name}: with that clause reverted the reproduction returns — ${c.say(n)}${c.name === 'nojoin' ? '' : ` (the shipped belt: ${c.name === 'nomemory' ? 0 : 1})`}`);
    C.close();
  }
}

console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTE.files, MUTE.dir, REPO, { minCopies: 26 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
