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
  // (e) RECEIPTS: only the drafter whose OWN watcher opted in is woken by its receipt
  await eng.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', receiptWake: true }]);
  const pr = await eng.propose({ kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] }, A, OPS, { text: 'on it' });
  ok(pr.ok && pr.proposal.state === 'awaiting-approval', 'Alpha (draft authority) proposes — awaiting approval');
  const c1 = ladder.calls.length;
  await eng.approve(pr.proposal.id, {});
  const rcA = ladder.calls.slice(c1).find((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
  ok(rcA && rcA.opts.noWake === false, 'Alpha\'s OWN watcher opted in (receiptWake) ⇒ its receipt WAKES it (noWake false)');
  await eng.setWatchers(A, OPSC, [{ principal: OPSG, notify: 'wake', receiptWake: true }]);
  const pr2 = await eng.propose({ kind: 'agent', id: 'agent-W', name: 'Worker', groups: ['tg-work'] }, A, OPS, { text: 'noted' });
  const c2 = ladder.calls.length;
  await eng.approve(pr2.proposal.id, {});
  const rcW = ladder.calls.slice(c2).find((c) => c.cid === 'agent-W' && c.opts.spendReason === 'channel-receipt');
  ok(rcW && rcW.opts.noWake === true, 'Worker drafts through 工作\'s ACCESS (no watcher of its own; Ops\' opt-in is not its) ⇒ its receipt rides its next turn (noWake true)');
  const pr3 = await eng.propose({ kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] }, A, OPS, { text: 'again' });
  const c3 = ladder.calls.length;
  await eng.approve(pr3.proposal.id, {});
  const rcG = ladder.calls.slice(c3).find((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
  ok(rcG && rcG.opts.noWake === false, 'Alpha drafts as a member of Ops, whose watcher opted in ⇒ woken (the drafter\'s GROUPS are read — the pre-R4 path passed none)');
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
  // ── (g) R4 verify r2 (money): A RECEIPT WAKE IS A BILLED TURN AND COUNTS AGAINST THE WATCHER'S CAP.
  // Alpha (wake, cap 2, receiptWake) drafts five replies; the owner rejects all five ⇒ five receipts,
  // at most TWO of them wakes (the rest ride the next turn with noWake), both on Alpha's ledger.
  const Actx = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: ['tg-ops'] };
  async function receiptCap(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    await e.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', dailyWakeCap: 2, receiptWake: true }]);
    const c0 = ladder.calls.length;
    const ids = [];
    for (let i = 0; i < 5; i++) { const r = await e.propose(Actx, A, OPS, { text: `draft ${i}`, why: 'x' }); ids.push(r.proposal.id); }
    for (const id of ids) await e.reject(id, { by: 'user', reason: 'no' });
    await e.settleWakes();
    const rc = ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
    const w = (e.store.index.snapshot().conversations[`${A}/${OPS}`].watchers || [])[0];
    // a fresh record after the receipts spent the cap: HELD, not a third billed turn
    offset += 61e3; world[OPS].push(mint(OPS, 'after receipts')); await e.pass(A, { force: true }); await e.settleWakes();
    const fresh = ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-message');
    return { receipts: rc.length, billed: rc.filter((c) => c.opts.noWake === false).length, ledger: ((w && w.stats.wakes) || []).filter((x) => x.ok !== false && x.receipt).length, lastRefusal: (w && w.stats.lastRefusal && w.stats.lastRefusal.why) || null, freshWakes: fresh.length };
  }
  const rcp = await receiptCap(ENG, 'r4-receiptcap');
  ok(rcp.receipts === 5 && rcp.billed === 2, `five rejected proposals ⇒ five receipts, exactly TWO of them wakes under the cap of 2 (billed ${rcp.billed})`, JSON.stringify(rcp));
  ok(rcp.ledger === 2 && /receipt: daily wake cap/.test(rcp.lastRefusal || '') && rcp.freshWakes === 0, `both receipt wakes are on Alpha's ledger (${rcp.ledger}), the third receipt named the cap (${rcp.lastRefusal}), and a fresh record after them is HELD (${rcp.freshWakes} wakes)`, JSON.stringify(rcp));
  {
    const LINE = 'let wake = !!optIn && pace.ok && !stopped;';
    ok(esrc2.split(LINE).length === 2, 'the receipt pace line is present once (the control patches exactly it)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, 'let wake = !!optIn && !stopped;'));
    const rcc = await receiptCap(require(cp), 'r4-receiptcap-ctl');
    ok(rcc.billed === 5, `CONTROL: a copy that never paces a receipt bills all five (${rcc.billed}) — the leg above would go red`);
  }
  // ── (h) R4 verify r3 (money): THE RECEIPT IS PACED INSIDE THE WATCHER'S SERIAL SECTION. Five
  // CONCURRENT rejects (five HTTP requests — the owner clearing an outbox) each read the ledger before
  // the ladder's await and wrote it after: five billed receipt wakes under a cap of 2; a wake in
  // flight beside a receipt made two billed turns under a cap of 1. Now the receipt queues on the
  // conversation's chain (then its scope's, the order every wake takes) and reads the ledger there.
  async function receiptRace(ENGmod2, name) {
    const e = mk(ENGmod2, name);
    await e.pass(A, { force: true });
    await e.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    await e.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', dailyWakeCap: 2, receiptWake: true }]);
    const ids = [];
    for (let i = 0; i < 5; i++) { const r = await e.propose(Actx, A, OPS, { text: `race ${i}`, why: 'x' }); ids.push(r.proposal.id); }
    const c0 = ladder.calls.length;
    let release; ladder.hang = new Promise((r) => { release = r; });
    const all = Promise.all(ids.map((id) => e.reject(id, { by: 'user', reason: 'no' })));   // five requests at once
    await sleep(60);
    release(); ladder.hang = null;
    await all; await e.settleWakes();
    const rc = ladder.calls.slice(c0).filter((c) => c.cid === 'agent-A' && c.opts.spendReason === 'channel-receipt');
    const w = (e.store.index.snapshot().conversations[`${A}/${OPS}`].watchers || [])[0];
    // a wake and a receipt in flight together under a cap of 1
    const e2 = mk(ENGmod2, name + '-straddle');
    await e2.pass(A, { force: true });
    await e2.setAccess(A, OPSC, [{ principal: AL, authority: 'draft' }]);
    await e2.setWatchers(A, OPSC, [{ principal: AL, notify: 'wake', dailyWakeCap: 1, receiptWake: true }]);
    const pr = await e2.propose(Actx, A, OPS, { text: 'straddle', why: 'x' });
    const c1 = ladder.calls.length;
    let release2; ladder.hang = new Promise((r) => { release2 = r; });
    offset += 61e3; world[OPS].push(mint(OPS, 'news beside a receipt'));
    const both = Promise.all([e2.pass(A, { force: true }), e2.reject(pr.proposal.id, { by: 'user', reason: 'no' })]);
    await sleep(60);
    release2(); ladder.hang = null;
    await both; await e2.settleWakes();
    const billed2 = ladder.calls.slice(c1).filter((c) => c.cid === 'agent-A' && c.opts.noWake !== true).length;
    return { receipts: rc.length, billed: rc.filter((c) => c.opts.noWake === false).length, ledger: ((w && w.stats.wakes) || []).filter((x) => x.ok !== false && x.receipt).length, straddleCalls: ladder.calls.slice(c1).length, straddleBilled: billed2 };
  }
  const rr = await receiptRace(ENG, 'r4-receiptrace');
  ok(rr.receipts === 5 && rr.billed === 2 && rr.ledger === 2, `five CONCURRENT rejects under a cap of 2 ⇒ five receipts, exactly TWO billed, two on the ledger (billed ${rr.billed}, ledger ${rr.ledger})`, JSON.stringify(rr));
  ok(rr.straddleCalls >= 1 && rr.straddleBilled === 1, `a wake and a receipt in flight together under a cap of 1 ⇒ ONE billed turn (${rr.straddleBilled}; the other is held or rides the next turn)`, JSON.stringify(rr));
  {
    // R4 verify r4: the control is r3's shape — a receipt started OUTSIDE the ONE door (billedWake) whose row is written
    // AFTER the ladder (no reservation). The same copy is ⑫'s bypass control: its census reddens on the door line.
    const LINE = '    return billedWake({ conv: key, scopeOf }, () => receiptNow(id, p, rc, cid, rec, key, optInOf));';
    const RES = "    const resId = wake ? await reserveWake(rec, en ? p.convId : null, optIn, wk0) : null;";
    ok(esrc2.split(LINE).length === 2 && esrc2.split(RES).length === 2, 'the receipt door line and its reservation line are present once each (the control patches exactly them)');
    const cp = patchPath('src/server', 'channels-engine'); writeCopy(cp, esrc2.replace(LINE, '    return receiptNow(id, p, rc, cid, rec, key, optInOf);').replace(RES, "    const resId = wake ? 'late' : null;"));
    BYPASS_COPY = cp;
    const rrc = await receiptRace(require(cp), 'r4-receiptrace-ctl');
    ok(rrc.billed === 5 && rrc.straddleBilled === 2, `CONTROL: a copy whose receipt skips the chain bills all five concurrent receipts (${rrc.billed}) and both of the straddle (${rrc.straddleBilled}) — the legs above would go red`);
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
  ok(helpers.length >= 6 && helpers.every((r) => r.section), `the ledger helpers are called from section bodies only (${helpers.length} calls)`, JSON.stringify(helpers));
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

for (const e of engines) { try { e.stop(); } catch {} }

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTE.files, MUTE.dir, REPO, { minCopies: 13 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
