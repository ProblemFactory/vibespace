#!/usr/bin/env node
// test-channel-push-trim — B-0248 row 8 (主开发 r3322; lane bl-loop-b's page, its ranking's row 8): THE PUSH ROAD's RETENTION TRIM.
// The push road trimmed every changed conversation at EVERY push batch, with no gate (the poll road gates the same trim to once in
// TRIM_EVERY_MS), and each trim READ THE WHOLE LOG synchronously on the hub's loop, even under its bounds. Now the push road is
// gated as the poll road is, and both roads ask the store's trimAsync: the log is read on the thread pool, and the rewrite (past a
// bound, or a place patch to fold) is still trim's. In-process: a real engine with its webhook path (the push door, as
// test-channels-engine drives it); each push is its own batch through the engine's own debounce timer (its delay shortened in the
// leg, the timer kept). Made-up values only.
//   ① A HUNDRED PUSH BATCHES for one conversation, inside TRIM_EVERY_MS: ONE trim. RED: a push road with no gate (100).
//   ② A PLACED SLOW READ of the conversation's log, the tree's own hold (src/loop-hold.js HOLD_MS) on both the loop's read and the
//      thread pool's: a batch's trim keeps the loop turning, its longest gap under HOLD_MS. RED: a trim that reads the log on the
//      loop holds it at least that long.
//   ③ THE DOOR: under both bounds nothing is rewritten (the log byte for byte, every record kept); past the count bound the oldest
//      go, as trim drops them. RED: a door that never hands the rewrite to trim (nothing dropped past the bound).
// Run: node scripts/test-channel-push-trim.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order: the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CS = require(path.join(REPO, 'src/channel-store.js'));   // ③ the door, on its own store
const WH = require(path.join(REPO, 'src/channels/webhook.js'));
const WR = require(path.join(REPO, 'src/webhook-record.js'));
const LH = require(path.join(REPO, 'src/loop-hold.js'));
const ESRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const SSRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');   // the door's red control
const M = mutantCopies('push-trim', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'push-trim-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const turns = (ms) => new Promise((z) => setTimeout(z, ms));
const redOf = (src, from, run) => (src.includes(from) ? run() : (ok(false, `RED CONTROL: its anchor is not in this tree (${from.slice(0, 60)}…)`), null));
const T0 = Date.parse('2026-11-24T10:00:00Z');
// THE BOUNDS ARE THE MECHANISM'S OWN (scripts/wall-clock-census.mjs): the tree's hold (HOLD_MS), placed as the slow read and judged
// against; the engine's own debounce (PUSH_NOTIFY_DEBOUNCE_MS) is the one delay the leg shortens
const HOLD = LH.HOLD_MS;
// the engine's debounce timer, fired at once (the timer kept: each push is still its own batch through flushPushBatch)
function quickDebounce(ms) {
  const T = globalThis.setTimeout;
  globalThis.setTimeout = function (fn, d, ...a) { return T.call(this, fn, d === ms ? 0 : d, ...a); };
  return () => { globalThis.setTimeout = T; };
}
// the loop's turns while `fn` runs: the longest gap between two 5 ms ticks (test-jobs-gc-off-loop's probe)
async function loopGap(fn) {
  let last = Date.now(), max = 0;
  const t = setInterval(() => { const x = Date.now(); max = Math.max(max, x - last); last = x; }, 5);
  try { await fn(); } finally { clearInterval(t); }
  max = Math.max(max, Date.now() - last);
  return max;
}
// THE PLACED SLOW READ of one file: the loop's read waits HOLD on the thread (Atomics.wait: asleep, no spin), the pool's read answers
// HOLD later — the tree's own hold on either road
function slowRead(file) {
  const R0 = fs.readFileSync, P0 = fs.promises.readFile, I = new Int32Array(new SharedArrayBuffer(4));
  let sync = 0, pool = 0;
  fs.readFileSync = function (q, ...x) { if (path.resolve(String(q)) === file) { sync++; Atomics.wait(I, 0, 0, HOLD); } return R0.call(this, q, ...x); };
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === file) { pool++; await new Promise((z) => setTimeout(z, HOLD)); } return P0.call(this, q, ...x); };
  return { counts: () => ({ sync, pool }), restore: () => { fs.readFileSync = R0; fs.promises.readFile = P0; } };
}

// a real engine with its webhook path «ci» and one caller (test-channels-engine's road); every push its own batch
async function world(EM, tag) {
  const dataDir = tmp(tag);
  let clock = T0;
  const e = EM.create({ dataDir, env: {}, broadcast: () => {}, log: quiet, deliver: { deliverToConversation: async () => ({ ok: true, lane: 'message' }), stashFor() {} }, serverSetting: () => undefined, liveSessions: () => [], now: () => clock, httpInbound: true });
  const st = WH.callersStore(path.join(dataDir, 'channels', 'webhook'), { secrets: e.secrets, now: () => clock });
  st.putPath('ci', { title: 'CI' });
  await e.store.index.update(() => { const en = e.store.index.entry('webhook', 'ci'); en.title = 'CI'; en.kind = 'dm'; en.readAt = clock; });
  const c = st.register('ci', { name: 'deploy-bot', auth: 'bearer', delivery: { mode: 'poll' } }).caller;
  const calls = { trim: 0, trimAsync: 0 };
  for (const k of Object.keys(calls)) { const f = e.store[k]; if (typeof f === 'function') e.store[k] = function (...a) { calls[k]++; const p = f.apply(this, a); if (k === 'trimAsync') calls.pending = p; return p; }; }
  let k = 0;
  const lastPush = () => Number(((e.store.index.peek('webhook/ci') || {}).lane || {}).lastPushAt) || 0;
  // one push = one batch: the record stored, the batch flushed (its index half landed at this clock), its trim (if any) ended
  const push = async () => {
    clock += 1000; k++;
    const rec = WR.toRecord({ adapterId: 'webhook', slug: 'ci', caller: { id: c.id, name: c.name }, value: { text: `deploy ${k}` }, bodyText: JSON.stringify({ text: `deploy ${k}` }), eventId: `${c.id}:k${k}`, at: clock, mapping: { textPath: 'text' } });
    const r = await e.pushInbound('webhook', { kind: 'record', convId: 'ci', eventId: rec.vendorId, record: rec });
    for (let i = 0; i < 400 && lastPush() !== clock; i++) await turns(2);
    await turns(5);
    return r;
  };
  // the conversation's message log (the store's own path: the one log in its account's folder once a record landed)
  const logFile = () => { const d = path.join(dataDir, 'channels', 'msgs', 'webhook'); const l = fs.readdirSync(d).filter((x) => x.endsWith('.ndjson')); return l.length === 1 ? path.join(d, l[0]) : null; };
  return { e, push, calls, logFile, stop: () => { try { e.stop(); } catch { } } };
}

// ═══ ① A HUNDRED PUSH BATCHES ═══
console.log('① a hundred push batches for one conversation inside TRIM_EVERY_MS: one trim');
async function batchesLeg(EM, tag) {
  const w = await world(EM, tag);
  const off = quickDebounce(w.e.PUSH_NOTIFY_DEBOUNCE_MS);
  let r;
  try {
    let stored = 0;
    for (let i = 0; i < 100; i++) { const p = await w.push(); if (p && p.persisted) stored++; }
    r = { stored, trims: w.calls.trim + w.calls.trimAsync, calls: { ...w.calls }, records: w.e.store.readTail('webhook', 'ci', { limit: 500 }).length };
  } finally { off(); w.stop(); }
  return r;
}
{
  const r = await batchesLeg(ENG, 'batches');
  ok(r.stored === 100 && r.records === 100 && r.trims === 1, `① a hundred push batches for one conversation (${r.stored} stored, ${r.records} in its log): ${r.trims} trim (the gate: once in TRIM_EVERY_MS, as the poll road)`, r);
  const GATE = '        if (b.appended && (!en.trimmedAt || now() - en.trimmedAt >= TRIM_EVERY_MS)) { en.trimmedAt = now(); trims.push(convId); }';
  await redOf(ESRC, GATE, async () => {
    const rn = await batchesLeg(M.load('src/server/channels-engine.js', anchored(ESRC, GATE, '        trims.push(convId);', 'a push road with no gate (the release\'s)'), 'no-gate'), 'batches-red');
    ok(rn.trims === 100, `① RED CONTROL: a push road with no gate — ${rn.trims} trims for a hundred batches, a whole read of the log each — the leg above would go red`, rn);
  });
}

// ═══ ② A PLACED SLOW READ ═══
console.log('② a placed slow read of the log (the tree\'s hold): the batch\'s trim keeps the loop turning');
async function slowLeg(EM, tag) {
  const w = await world(EM, tag);
  const off = quickDebounce(w.e.PUSH_NOTIFY_DEBOUNCE_MS);
  let r;
  try {
    await w.push();   // the log exists (its first batch trimmed it once, at local speed)
    if (w.calls.pending) await w.calls.pending;
    await w.e.store.index.update(() => { const en = w.e.store.index.entry('webhook', 'ci', { create: false }); if (en) en.trimmedAt = 0; });   // its gate open again
    const file = w.logFile();
    const slow = slowRead(file);
    let gap;
    try { gap = await loopGap(async () => { w.calls.pending = null; await w.push(); if (w.calls.pending) await w.calls.pending; }); } finally { slow.restore(); }
    r = { file: !!file, gap, reads: slow.counts(), trims: w.calls.trim + w.calls.trimAsync };
  } finally { off(); w.stop(); }
  return r;
}
{
  if (typeof ENG.create !== 'function') ok(false, 'the engine has no create');
  const r = await slowLeg(ENG, 'slow');
  ok(r.file && r.reads.pool === 1 && r.reads.sync === 0 && r.trims === 2 && r.gap < HOLD, `② the log's read placed slow by the tree's hold (${HOLD} ms): the batch's trim read it on the thread pool (pool ${r.reads.pool}, loop ${r.reads.sync}) and the loop kept turning — its longest gap ${r.gap} ms, under the hold`, r);
  const ROAD = "    for (const c of trims) { if (stopped) break; try { await store.trimAsync(rec.id, c); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }   // one read at a time, off the loop";
  await redOf(ESRC, ROAD, async () => {
    const rn = await slowLeg(M.load('src/server/channels-engine.js', anchored(ESRC, ROAD, "    for (const c of trims) { try { store.trim(rec.id, c); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }", 'the trim read on the loop (the release\'s)'), 'read-on-loop'), 'slow-red');
    ok(rn.reads.sync === 1 && rn.gap >= HOLD * 0.8 && rn.gap > r.gap, `② RED CONTROL: a push road whose trim reads the log on the loop — the loop held ${rn.gap} ms by the same placed read (this tree's: ${r.gap} ms) — the leg above would go red`, rn);
  });
}

// ═══ ③ THE DOOR ═══
console.log('③ the door: under the bounds the log is not rewritten; past the count bound the oldest go, as trim drops them');
const DAY = 86400e3;
const rec = (i, at) => ({ id: `a:c:v${i}`, adapterId: 'a', convId: 'c', vendorId: `v${i}`, at, author: { id: 'u', name: 'U', isSelf: false, isBot: false }, text: `m${i}`, mentions: [], attachments: [], replyTo: null, threadKey: null, raw: {} });
async function doorLeg(SM, tag) {
  const dir = tmp(tag);
  const st = SM.createChannelStore({ dir, log: quiet, now: () => T0 });
  let r;
  try {
    st.appendRecords('a', 'c', Array.from({ length: 10 }, (_, i) => rec(i, T0 - (30 - i) * DAY)));
    const md = path.join(dir, 'msgs', 'a'), fl = fs.readdirSync(md).filter((x) => x.endsWith('.ndjson'));
    const fp = path.join(md, fl[0]);
    const before = fs.readFileSync(fp, 'utf8');
    const under = await st.trimAsync('a', 'c', { maxRecords: 20, floorDays: 0 });
    const same = fs.readFileSync(fp, 'utf8') === before;
    const past = await st.trimAsync('a', 'c', { maxRecords: 4, floorDays: 0 });
    const left = st.readTail('a', 'c', { limit: 50 }).map((x) => x.vendorId).join(',');
    r = { logs: fl.length, under: under && under.removed, same, past: past && past.removed, left };
  } finally { try { st.close(); } catch { } }
  return r;
}
{
  const r = await doorLeg(CS, 'door');
  ok(r.logs === 1 && r.under === 0 && r.same && r.past === 6 && r.left === 'v6,v7,v8,v9', `③ under both bounds nothing is rewritten (the log byte for byte: ${r.same}); past the count bound (4 of 10) the six oldest go (${r.past} removed, left ${r.left}), as trim drops them`, r);
  const HAND = '    if (placesOf(adapterId, convId).size || lines.some((l) => recAtKept(l) < cutoff)) return trim(adapterId, convId, { days, maxRecords, floorDays });';   // B-f276 s1126: the ask reads recAtKept (a line that does not parse asks no trim)
  await redOf(SSRC, HAND, async () => {
    const rn = await doorLeg(M.load('src/channel-store.js', anchored(SSRC, HAND, '', 'a door that never hands the rewrite to trim'), 'no-handoff'), 'door-red');
    ok(rn.past === 0 && rn.left.split(',').length === 10, `③ RED CONTROL: a door that never hands the rewrite to trim — past the count bound nothing dropped (${rn.left.split(',').length} left) — the leg above would go red`, rn);
  });
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
