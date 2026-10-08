#!/usr/bin/env node
// THE CHANNELS INDEX AT SCALE (lane channel-index-copy, B-f32b, 2026-10-03; gate row `test-channels-index-scale`).
// userW inc-muro2wt1-e8lu: 49 977 Gmail threads + 207 Lark chats + 90 agent groups, index.json 45 MB. Opening ONE
// Channel window deep-copied the WHOLE index up to five times (known() / convFor() → store.index.snapshot(),
// 0.51–0.55 s each on the server's one thread), the index write stringified all of it every 2 s while anything
// changed, and every partial broadcast summed `unread` over every row. 19 opens in 20 s queued ~40 s of work; the 9th
// window still read "Channel" 55 s later. A complexity claim is counted in WORK (scripts/work-meter.mjs: V8 block
// counts + the natives' element work, JSON.stringify/parse by the byte), never the clock:
//   ① ONE WINDOW OPEN (watch → messages → mark-read → the broadcast's re-read) over a generated index of 50 274 rows,
//      then of 100 548: the same work (bounded) — linear in that conversation, not in the index. Its two broadcasts
//      read the account's clock census inside its 5 s window (r2, the coordinator's ruling: walked at most once per
//      5 s per account — that walk and its trailing edge are test-channels-census-pace's): 0 walks in the opens.
//      CONTROL: the base's known() (a lookup through the whole-index copy) reads ×2 — red.
//      CONTROL: an update that reached the whole map just before (the kept unread total re-sums) reads ×2 — red.
//      CONTROL: the base's mark-read broadcast named a bare id — notify then scans every key of the index — red.
//   ② THE INDEX WRITE after one row changed: bounded at 50 274 vs 100 548 rows. CONTROL: the whole-file write.
//   ③ THE BYTES: the incremental write equals `JSON.stringify(ix, RUNTIME_KEYS, 1)` byte for byte through a walk (a row
//      through entry(), rows born, top-level tables only, a whole-map delete, mixed); close() writes the whole
//      serialization; a restart reads every row back.
//   ④ THE SWEEP: a row changed OUTSIDE update() is found within chunks / SWEEP_CHUNKS ticks, written, said by key.
//   ⑤ THE CENSUS'S OWN CONTROL: VIBESPACE_CHANNELS_INDEX_VERIFY=<file> catches an incremental write that drifted
//      (the line lands in <file>) and writes the whole serialization instead.
//   ⑥ THE KEPT UNREAD TOTAL equals the old whole-index sum through a walk (mark-read, rows touched, a row unlisted, a
//      whole-map update, a row written past the door healed by the store's sweep — its drifted chunk fires the rows'
//      touch; the minute's re-sum is gone since lane scheduler-census-index: the door's touch is the one signal).
//   ⑦ SOURCE CENSUS: src/server/channels-engine.js calls store.index.snapshot() nowhere.
//   ⑧ THE ENGINE'S OWN WRITERS ARE INCREMENTAL: real passes (discovery complete → the unlisting scan, ingest), a refresh,
//      a mark-read and a refresh override each leave an incremental write — a pass whose discovery walk ends leaves TWO
//      (lane discovery-cursor-persist's keepDisc flushes the listed rows BEFORE the walk's cursor reaches the record, then
//      the pass's own). CONTROL: the pre-fix unlisting scan shape (an update reaching `ix.conversations`) makes the write a
//      whole one.
//   ⑨ THE FIRST READ (design 008, B-3cf8 — userW's GET /api/channels: 77.5 MB, 1.49 s to first byte at ≈ 50 000 rows),
//      at 50 274 and 100 548 rows: its bytes (< 1 MB at both, printed), its rowViews (≤ 300 + 30 per account), its work
//      against the old whole list (< 2 %); every tag kind buried at position ≈ 49 000 by lastAt is on it after a first
//      read, a reconnect and a non-partial broadcast; a page of 60 and a search (bytes; work linear per row scanned);
//      the client half in node (JSON.parse + applyFirst + groupListRows + firstScreen < 20 ms, printed; its work bounded).
//      CONTROL: the old whole list on the route reads ×N and > 50 MB — red. CONTROL: a non-partial broadcast that still
//      carries every row — red.
//   ⑩ A QUIET MINUTE (design 011 lane 2 — the poll stamps left the row): 50 274 rows on the real account, the engine's
//      timer passes every 5 s for 60 s bringing nothing: ZERO index writes (the count printed), the same file. CONTROL: the
//      stamp back in the row (the engine writes it there, the serializer keeps it) — a write per polling pass — red.
// The store's 2 s tick is captured, never scheduled (a tick inside a measured window would be counted); the
// clock is injected and frozen; per-pid scratch dirs (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { startWorkMeter, measure, measureAsync, BOUNDED_RATIO } from './work-meter.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
startWorkMeter({ scan: 'whole' });   // ⑨'s bounds were calibrated on the pre-.209 whole-receiver scan charges (work-meter.mjs WHOLE_SCAN); BEFORE the modules load (a function compiled before coverage has no block counters)
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const S = require(path.join(REPO, 'src/channel-store.js'));
const { makeRecord } = require(path.join(REPO, 'src/channel-record.js'));
const FO = require(path.join(REPO, 'src/channel-focus.js'));
const RS = await import(new URL(`file://${path.join(REPO, 'src/lib/channel-rows.js')}`).href);
const V = await import(new URL(`file://${path.join(REPO, 'src/lib/channel-groups-view.js')}`).href);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const ROOT = scratch('chan-index-scale');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// every module of the server is measured (block counts); the natives are counted wherever they are called
const FILES = [];
(function walk(d) { for (const f of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${f.name}`; if (f.isDirectory()) walk(r); else if (f.name.endsWith('.js')) FILES.push(r); } })('src');
const N = 50274;                 // userW's row count
const SLACK = 4096;
const RUNTIME_KEYS = (k, v) => (k.startsWith('_') ? undefined : v);
const quiet = { log() {}, warn() {}, error() {} };
const T = Date.UTC(2026, 9, 2, 0, 40, 0);
let offset = 0;
const now = () => T + offset;
const bounded = (w1, w2) => w2 <= BOUNDED_RATIO * w1 + SLACK;

// ── the engine, its store ticks captured ─────────────────────────────────────
const ticks = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn) => { ticks.push(fn); return { unref() {}, ref() {}, [Symbol.toPrimitive]: () => 0 }; };
const events = [];
// the paced census's trailing timer captured, never fired (a walk inside a measured window would be counted)
const eng = ENG.create({ dataDir: path.join(ROOT, 'eng'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => events.push(m), now, log: quiet, censusTimer: () => ({ cancel() {} }) });
globalThis.setInterval = realSetInterval;
const ix = eng.store.index;
const A = 'fake-poll';
ok(eng.adapterRecords().adapters.some((r) => r.id === A), `fixture: the seeded ${A} account`);

// a target conversation: 40 messages in its log, all unread, polled now, its capabilities fresh (no vendor call)
async function target(cid) {
  const recs = [];
  for (let i = 0; i < 40; i++) recs.push(makeRecord({ adapterId: A, convId: cid, vendorId: `${cid}-m${i}`, at: T - (40 - i) * 60e3, text: `message ${i} of ${cid}`, author: { id: 'ou_ada', name: 'Ada' } }));
  eng.store.appendRecords(A, cid, recs);
  await ix.update(() => {
    const en = ix.entry(A, cid);
    Object.assign(en, { title: `Target ${cid}`, kind: 'group', lastAt: T - 60e3, unread: 40, readAt: 0, anchor: recs[39].vendorId, convCaps: { read: 'yes', sendAs: [], why: null, at: T } });
    en.lane = { ...en.lane, lastPollAt: T };
  });
}
// filler rows of a Gmail thread's size (~1.2 KB each on disk), on the real account (they count in every total)
async function fill(from, to) {
  await ix.update(() => {
    for (let i = from; i < to; i++) {
      const en = ix.entry(A, `thr_${i.toString(16).padStart(12, '0')}`);
      Object.assign(en, {
        title: `Re: [ops-${i % 997}] quarterly vendor review and the follow-up on invoice #${100000 + i}`, kind: 'group',
        participants: `Alice Example <alice.${i % 311}@example.com>, Bob Sample <bob.${i % 173}@example.org>, ops-team@example.net`,
        lastAt: T - 86400e3 - i * 1000, unread: i % 7, readAt: T - 86400e3 * 2, anchor: `msg_${i.toString(36)}`,
        stats: { hits7d: i % 5, msgs7d: i % 11 }, convCaps: { at: T, read: 'yes', sendAs: [], why: null },
        lane: { via: 'poll', lastPushAt: null, lastPollAt: T - 3600e3, lastScanAt: null, firstSeenByPoll: 1, firstSeenTotal: 1 },
        lastText: `Thanks — I looked at the numbers again and the ${i % 13} items on page ${i % 29} still do not add up`,
      });
    }
  });
  ix.flush();
}
async function open(cid) {
  const w = await eng.watch(A, cid);
  const m1 = eng.messages(A, cid, { limit: 50 });
  const r = await eng.markRead(A, cid);
  const m2 = eng.messages(A, cid, { limit: 50 });   // the window's patch re-reads after the broadcast
  return w && w.ok && m1 && m1.length === 40 && r === true && m2 && m2.length === 40;
}
// the base's known(): `!!store.index.snapshot().conversations[key]` — the whole index copied per lookup
function baseKnown(on) {
  if (on) { ix._has = ix.has; ix.has = (k) => !!ix.snapshot().conversations[k]; } else { ix.has = ix._has; delete ix._has; }
}
// the account census's walks (the paced census: a broadcast inside the 5 s window reads the last walk)
const walks = () => Object.values(eng.censusStats()).reduce((s, n) => s + n, 0);
// a broadcast naming `cid` bare (the base's mark-read) vs by its key (the head's)
const notifyWork = (name) => { measure(() => eng.notify([name]), FILES); return measure(() => eng.notify([name]), FILES).total; };
async function measureOpen(cid) { let good = false; const w0 = walks(); const m = await measureAsync(async () => { good = await open(cid); }, FILES); return { ...m, good, walks: walks() - w0 }; }
function oneRowWrite(full) {
  // one row changed through the door, then the write measured (sync — no timer can land inside)
  return ix.update(() => { const en = ix.entry(A, 'thr_000000000007', { create: false }); en.unread = (Number(en.unread) || 0) + 1; })
    .then(() => measure(() => ix.flush(full ? { full: true } : {}), FILES));
}


// ── ⑨ design 008: the first read, measured where it is built ─────────────────
// every tag kind, one row each, buried at ≈ 49 000 by lastAt (the fill's rows are T − 1 d − i s)
const BURIED = { awaiting: 'b-awaiting', assigned: 'b-assigned', read: 'b-read', held: 'b-held', replied: 'b-replied', unknown: 'b-unknown' };
let planted = false;
async function plant() {
  if (planted) return;
  planted = true;
  const deep = T - 86400e3 - 49000 * 1000;
  await ix.update(() => {
    for (const id of Object.values(BURIED)) Object.assign(ix.entry(A, id), { title: `Buried ${id}`, kind: 'group', lastAt: deep, unread: 0, lastText: 'quiet for weeks' });
    Object.assign(ix.entry(A, BURIED.assigned), { access: [{ principal: { kind: 'agent', id: 'cid-b', name: 'Bee' }, authority: 'draft' }], watchers: [{ principal: { kind: 'agent', id: 'cid-b', name: 'Bee' }, notify: 'each', mode: 'all' }] });
    ix.entry(A, BURIED.read).agentReads = [{ id: 'cid-r', name: 'Reader', at: T - 3600e3, upTo: deep }];
    ix.entry(A, BURIED.held).stats = { wakes: [{ at: T - 7200e3, ok: false, lane: 'none', n: 1 }] };
    ix.entry(A, BURIED.replied).selfAt = T - 600e3;
  });
  await eng.store.outbox.update((ob) => {
    ob.proposals = ob.proposals || {};
    ob.proposals['p-b1'] = { id: 'p-b1', key: `${A}/${BURIED.awaiting}`, adapterId: A, convId: BURIED.awaiting, state: 'awaiting-approval', text: 'draft', draftedBy: { kind: 'agent', id: 'cid-a' }, at: T - 60e3, updatedAt: T - 60e3 };
    ob.proposals['p-b2'] = { id: 'p-b2', key: `${A}/${BURIED.unknown}`, adapterId: A, convId: BURIED.unknown, state: 'unknown', text: 'draft', draftedBy: { kind: 'agent', id: 'cid-a' }, at: T - 60e3, updatedAt: T - 60e3 };
  });
  ix.flush();
}
const allKeys = () => Object.keys(ix.live());
const deepAt = (d, id) => { const c = (d.conversations || []).find((x) => x.key === `${A}/${id}`); return !!(c && FO.statusTag(c, now())); };
const clientHalf = (body) => { const d = JSON.parse(body); const st = RS.createRowStore(); RS.applyFirst(st, d, now()); const { rows } = V.groupListRows({ groups: [], conversations: RS.loadedRows(st), adapters: st.meta.adapters }); return V.firstScreen(rows, { now: now() }); };
async function firstReadAt(rowsN) {
  await plant();
  const route = () => JSON.stringify(eng.digest({ scope: 'first' }));   // what GET /api/channels sends
  const old = () => JSON.stringify(eng.digest({ keys: allKeys() }));     // the base's whole list (every rowView)
  route();                                                               // the meter's first take is discarded
  const v0 = eng.digestStats().rowViews;
  let body = '';
  const m = measure(() => { body = route(); }, FILES);
  const views = eng.digestStats().rowViews - v0;
  let oldBody = '';
  old();
  const mo = measure(() => { oldBody = old(); }, FILES);
  const d = JSON.parse(body);
  // a reconnect re-reads the same first read; an account-level change broadcasts its shape
  const reconnect = JSON.parse(route());
  events.length = 0;
  eng.notify([]);
  const bc = events.find((e) => e && e.type === 'channels-updated');
  const bcBytes = bc ? Buffer.byteLength(JSON.stringify(bc)) : -1;
  const oldBcBytes = Buffer.byteLength(JSON.stringify({ type: 'channels-updated', changed: [], changedKeys: [], partial: false, digest: JSON.parse(oldBody) }));
  // a page of 60 (the All view's "Show more" from the middle) and a search over every row
  const mid = FO.selectPage(Object.values(ix.live()), { limit: 1, before: { lastAt: T - 86400e3 - 25000 * 1000, key: '' } }).items[0];
  eng.rows({ limit: 60 });
  let page = null;
  const mp = measure(() => { page = eng.rows({ limit: 60, before: FO.pageCursor(mid) }); }, FILES);
  let hits = null;
  eng.rows({ q: 'invoice #1049' });
  const ms = measure(() => { hits = eng.rows({ q: 'invoice #1049', limit: 60 }); }, FILES);
  let searchMs = Infinity;
  for (let i = 0; i < 3; i++) { const a = performance.now(); eng.rows({ q: 'invoice #1049', limit: 60 }); searchMs = Math.min(searchMs, performance.now() - a); }
  // the client half: parse + applyFirst + groupListRows + firstScreen (wall: the best of 5; work: the meter)
  clientHalf(body);
  const mc = measure(() => clientHalf(body), FILES);
  let wall = Infinity;
  for (let i = 0; i < 5; i++) { const a = performance.now(); clientHalf(body); wall = Math.min(wall, performance.now() - a); }
  const accounts = eng.adapterRecords().adapters.length;
  return {
    rows: rowsN, bytes: Buffer.byteLength(body), views, accounts, work: m.total, oldWork: mo.total, oldBytes: Buffer.byteLength(oldBody),
    attention: d.attention, n: d.conversations.length, buried: Object.fromEntries(Object.entries(BURIED).map(([k, id]) => [k, [deepAt(d, id), deepAt(reconnect, id), !!(bc && bc.digest && deepAt(bc.digest, id))]])),
    bcBytes, bcScope: bc && bc.digest && bc.digest.scope, oldBcBytes, pageBytes: Buffer.byteLength(JSON.stringify(page)), pageOk: !!(page && page.ok && page.rows.length === 60), pageWork: mp.total,
    searchWork: ms.total, searchMs, searchHits: hits && hits.total, clientWall: wall, clientWork: mc.total,
  };
}
console.log(`① one window open over ${N} rows, then ${2 * N} (work, never the clock)`);
for (const c of ['t-warm', 't-h1', 't-cwarm', 't-c1', 't-rwarm', 't-r1', 't-warm2', 't-h2', 't-cwarm2', 't-c2', 't-rwarm2', 't-r2']) await target(c);
await fill(0, N);
const rows1 = Object.keys(ix.live()).length;
ok((await measureOpen('t-warm')).good, `fixture: a window opens on a ${rows1}-row index (watch ok, 40 messages, marked read) — measured once and discarded (the meter's first take of a function reads a constant more)`);
const h1 = await measureOpen('t-h1');
baseKnown(true); await measureOpen('t-cwarm'); const c1 = await measureOpen('t-c1'); baseKnown(false);
await ix.update((x) => { void x.conversations; }); ix.flush(); await measureOpen('t-rwarm');
await ix.update((x) => { void x.conversations; }); ix.flush(); const r1 = await measureOpen('t-r1');
const nb1 = notifyWork('t-h1'), nk1 = notifyWork(`${A}/t-h1`);
const fr1 = await firstReadAt(rows1);
console.log('② the index write after one row changed');
const f1 = await oneRowWrite(false), ff1 = await oneRowWrite(true);
await fill(N, 2 * N);
const rows2 = Object.keys(ix.live()).length;
ok((await measureOpen('t-warm2')).good, `fixture: a window opens on the ${rows2}-row index`);
const h2 = await measureOpen('t-h2');
baseKnown(true); await measureOpen('t-cwarm2'); const c2 = await measureOpen('t-c2'); baseKnown(false);
await ix.update((x) => { void x.conversations; }); ix.flush(); await measureOpen('t-rwarm2');
await ix.update((x) => { void x.conversations; }); ix.flush(); const r2 = await measureOpen('t-r2');
const f2 = await oneRowWrite(false), ff2 = await oneRowWrite(true);
const nb2 = notifyWork('t-h1'), nk2 = notifyWork(`${A}/t-h1`);
const fr2 = await firstReadAt(rows2);
const row = (m) => `${m.total} (blocks ${m.blocks} + natives ${m.native})`;
ok(h1.good && h2.good && bounded(h1.total, h2.total), `① a window open: ${row(h1)} at ${rows1} rows, ${row(h2)} at ${rows2}: ×${(h2.total / h1.total).toFixed(3)} ≤ ${BOUNDED_RATIO} — the index's size is not in it`);
ok(h1.walks === 0 && h2.walks === 0, `① its two broadcasts read the account census inside its 5 s window: ${h1.walks + h2.walks} walks of the rows (the paced walk itself: test-channels-census-pace)`);
ok(c1.good && c2.good && !bounded(c1.total, c2.total) && c1.total > 20 * h1.total, `① CONTROL: the base's known() (the whole index copied per lookup) reads ${row(c1)} → ${row(c2)}: ×${(c2.total / c1.total).toFixed(2)}, ${Math.round(c1.total / h1.total)}× the head — red`);
ok(r1.good && r2.good && !bounded(r1.total, r2.total), `① CONTROL: an update that reached the whole map just before (the kept row facts re-sum) reads ${row(r1)} → ${row(r2)}: ×${(r2.total / r1.total).toFixed(2)} — red`);
ok(bounded(nk1, nk2) && !bounded(nb1, nb2), `① CONTROL: a broadcast naming the conversation by its key reads ${nk1} → ${nk2} (×${(nk2 / nk1).toFixed(3)}); by a bare id (the base's mark-read) ${nb1} → ${nb2} (×${(nb2 / nb1).toFixed(2)}) — red`);
ok(bounded(f1.total, f2.total), `② the write after one row changed: ${row(f1)} at ${rows1} rows, ${row(f2)} at ${rows2}: ×${(f2.total / f1.total).toFixed(3)} (a ${S.INDEX_CHUNK}-row chunk re-serialized, the rest copied from cache)`);
ok(!bounded(ff1.total, ff2.total) && ff1.total > 20 * f1.total, `② CONTROL: the whole-file write (the base's every 2 s) reads ${row(ff1)} → ${row(ff2)}: ×${(ff2.total / ff1.total).toFixed(2)}, ${Math.round(ff1.total / f1.total)}× the incremental one — red`);
{
  const disk = fs.readFileSync(eng.store.indexFile, 'utf8');
  ok(disk === JSON.stringify(ix.snapshot(), RUNTIME_KEYS, 1), `② …and the ${(disk.length / 1e6).toFixed(1)} MB on disk equals the whole-file serialization byte for byte`);
}

console.log('③ the bytes: incremental = the whole-file serialization');
const warns = [];
const wlog = { log() {}, warn: (...a) => warns.push(a.join(' ')), error() {} };
const sdir = path.join(ROOT, 'bytes');
fs.mkdirSync(sdir, { recursive: true });
const st = S.createChannelStore({ dir: sdir, log: wlog });
const same = (s) => { s.index.flush(); return fs.readFileSync(s.indexFile, 'utf8') === JSON.stringify(s.index.snapshot(), RUNTIME_KEYS, 1); };
const mk = (s, a, c, i) => Object.assign(s.index.entry(a, c), { title: `t${i}`, unread: i % 5, lastAt: T - i, participants: 'Ada, Brook', lane: { via: 'poll', lastPollAt: T - i } });
await st.index.update(() => { for (let i = 0; i < 2000; i++) mk(st, 'gmail', `thr_${i}`, i); });
ok(same(st) && st.index.flushStats().full === 1, `the first write is a whole one (${st.index.flushStats().chunks} chunks of ${S.INDEX_CHUNK})`);
const steps = [
  ['one row through entry() (a runtime _key, CJK, U+2028, a quote and a newline in its title)', () => st.index.update(() => { const e = st.index.entry('gmail', 'thr_77', { create: false }); e.unread = 0; e._runtime = { x: 1 }; e.title = 'ünï 中文   "q"\n end'; })],
  ['two rows born (they join the last chunk, in the map\'s own order)', () => st.index.update(() => { mk(st, 'lark', 'oc_new1', 1); mk(st, 'lark', 'oc_new2', 2); })],
  ['top-level tables only (filters, rotations)', () => st.index.update((x) => { x.filters = { f1: { kind: 'keywords', words: ['gpu'] } }; x.rotations = { g1: 2 }; })],
  ['a whole-map delete (a whole write)', () => st.index.update((x) => { delete x.conversations['gmail/thr_5']; })],
  ['mixed: a row changed + a row born after the delete', () => st.index.update(() => { st.index.entry('gmail', 'thr_1999', { create: false }).lastAt = 1; mk(st, 'lark', 'oc_new3', 3); })],
];
for (const [what, run] of steps) { const before = st.index.flushStats(); await run(); const okBytes = same(st); const after = st.index.flushStats(); ok(okBytes, `${what}: the same bytes (${after.full > before.full ? 'whole' : 'incremental'} write)`); }
ok(st.index.flushStats().incremental >= 4, `four of the five writes were incremental (${JSON.stringify(st.index.flushStats())})`);

console.log('④ the sweep: a row changed outside update()');
st.index.live()['gmail/thr_300'].title = 'changed past the door';
const chunks = st.index.flushStats().chunks;
let found = 0, sweeps = 0;
while (!found && sweeps < Math.ceil(chunks / S.SWEEP_CHUNKS) + 1) { found += st.index.sweep(); sweeps++; }
ok(found === 1 && sweeps <= Math.ceil(chunks / S.SWEEP_CHUNKS), `found within ${sweeps} tick(s) (bound ${Math.ceil(chunks / S.SWEEP_CHUNKS)} = ${chunks} chunks / ${S.SWEEP_CHUNKS})`);
ok(warns.some((w) => /changed outside update\(\) \(first: gmail\/thr_300;/.test(w)), 'said, with the row\'s key', warns.join(' | '));
ok(st.index.isDirty() && same(st) && JSON.parse(fs.readFileSync(st.indexFile, 'utf8')).conversations['gmail/thr_300'].title === 'changed past the door', 'and written (the sweep marked the index dirty)');
st.close();
ok(fs.readFileSync(st.indexFile, 'utf8') === JSON.stringify(st.index.snapshot(), RUNTIME_KEYS, 1), 'close() writes the whole serialization');
{
  const re = S.createChannelStore({ dir: sdir, log: quiet });
  ok(Object.keys(re.index.live()).length === 2002 && re.index.live()['lark/oc_new3'] && !re.index.live()['gmail/thr_5'], 'a restart reads every row back (2002: 2000 − 1 deleted + 3 born)');
  re.close();
}

console.log('⑤ the census\'s own control: VIBESPACE_CHANNELS_INDEX_VERIFY');
{
  const vdir = path.join(ROOT, 'verify');
  fs.mkdirSync(vdir, { recursive: true });
  const vfile = path.join(ROOT, 'verify-drift.log');
  process.env.VIBESPACE_CHANNELS_INDEX_VERIFY = vfile;
  const vw = [];
  const vs = S.createChannelStore({ dir: vdir, log: { log() {}, warn: (...a) => vw.push(a.join(' ')), error() {} } });
  delete process.env.VIBESPACE_CHANNELS_INDEX_VERIFY;
  await vs.index.update(() => { for (let i = 0; i < 600; i++) mk(vs, 'gmail', `v_${i}`, i); });
  vs.index.flush();
  vs.index.live()['gmail/v_10'].unread = 99;                                            // past the door…
  await vs.index.update(() => { vs.index.entry('gmail', 'v_500', { create: false }).unread = 1; });   // …then a tracked write
  vs.index.flush();
  const line = fs.existsSync(vfile) ? fs.readFileSync(vfile, 'utf8') : '';
  ok(/DRIFTED/.test(line) && vw.some((w) => /DRIFTED/.test(w)), 'the drifted incremental write is said and lands in the census file', line.slice(0, 300));
  ok(JSON.parse(fs.readFileSync(vs.indexFile, 'utf8')).conversations['gmail/v_10'].unread === 99, '…and the whole serialization is written instead');
  vs.close();
}

console.log('⑥ the kept unread total = the old whole-index sum');
{
  const want = () => { const ids = new Set(eng.adapterRecords().adapters.map((r) => r.id)); let s = 0; for (const en of Object.values(ix.live())) if (en && ids.has(en.adapterId) && !en.unlistedAt) s += Number(en.unread) || 0; return s; };
  const kept = () => eng.digest({ keys: [`${A}/t-h1`] }).unreadTotal;
  const walk = [
    ['a window\'s mark-read', async () => { await target('t-u1'); await eng.markRead(A, 't-u1'); }],
    ['rows touched through entry()', () => ix.update(() => { for (let i = 0; i < 50; i++) ix.entry(A, `thr_${(i * 997).toString(16).padStart(12, '0')}`, { create: false }).unread = i; })],
    ['a row unlisted', () => ix.update(() => { ix.entry(A, 'thr_000000000003', { create: false }).unlistedAt = T; })],
    ['a whole-map update (every 1000th row +1)', () => ix.update((x) => { let n = 0; for (const en of Object.values(x.conversations)) if (n++ % 1000 === 0) en.unread = (Number(en.unread) || 0) + 1; })],
  ];
  for (const [what, run] of walk) { await run(); const k = kept(), w = want(); ok(k === w, `${what}: kept ${k} = summed ${w}`); }
  ix.flush();                                               // the walk's writes on disk: each cached chunk holds its rows as they are
  ix.live()['fake-poll/thr_000000000009'].unread = 1000;   // past the door: the kept total cannot know…
  const stale = kept();
  offset += 61e3;                                           // …a minute later either (lane scheduler-census-index: no clock re-sum)
  const still = kept();
  offset -= 61e3;
  const bound = Math.ceil(ix.flushStats().chunks / S.SWEEP_CHUNKS) + 1;
  let sweeps = 0;                                           // …until the store's sweep finds the drifted chunk and fires its rows' touch
  while (kept() === stale && sweeps < bound) { ix.sweep(); sweeps++; }
  const healed = kept();
  ok(stale !== want() && healed === want(), `a row written past the door: ${stale} (a minute later ${still}), healed by the store's sweep in ${sweeps} tick(s) (bound ${bound}): ${healed} = ${want()}`);
}

console.log('⑦ source census');
{
  const src = engineSource(REPO);
  const n = (src.match(/index\.snapshot\(\)/g) || []).length;
  ok(n === 0, `src/server/channels-engine.js calls store.index.snapshot() ${n} times (a read of one conversation is has/peek, a scan reads live())`);
}

console.log('⑧ the engine\'s own writers are incremental');
{
  const e8 = ENG.create({ dataDir: path.join(ROOT, 'writers'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now, log: quiet });
  const x8 = e8.store.index;
  const step = async (what, run) => { x8.flush(); const a = x8.flushStats(); await run(); x8.flush(); const b = x8.flushStats(); return { what, full: b.full - a.full, incremental: b.incremental - a.incremental, why: b.lastFull }; };
  const first = await step('the first pass', () => e8.pass(A, { force: true }));
  const rows = [];
  for (const k of [1, 2]) { offset += 61e3; rows.push(await step(`steady pass ${k} (discovery complete, ingest)`, () => e8.pass(A, { force: true }))); }
  rows.push(await step('a second account\'s first pass', () => e8.pass('fake-push', { force: true })));
  rows.push(await step('a refresh', () => e8.refresh(A, 'fake-poll-ops')));
  rows.push(await step('a mark-read', () => e8.markRead(A, 'fake-poll-ops')));
  rows.push(await step('a refresh override', () => e8.setRefresh(A, 'fake-poll-ops', 60)));
  offset -= 122e3;
  ok(first.full === 1, 'fixture: the boot\'s first write is a whole one');
  // a pass walks the listing: its rows are flushed before the walk's cursor is recorded (keepDisc), then the pass's own write
  for (const r of rows) { const want = /\bpass\b/.test(r.what) ? 2 : 1; ok(r.full === 0 && r.incremental === want, `${r.what}: ${want === 2 ? 'two incremental writes (the listed rows before the walk\'s cursor — keepDisc — then the pass\'s own), never a whole one' : 'an incremental write'}`, JSON.stringify(r)); }
  const ctl = await step('the pre-fix unlisting scan', () => x8.update((x) => { for (const en of Object.values(x.conversations)) if (en && en.adapterId === 'nobody') en.unlistedAt = 1; }));
  ok(ctl.full === 1 && /ix\.conversations/.test(ctl.why), `CONTROL: an update reaching ix.conversations (the pre-fix unlisting scan) makes the write a whole one (${ctl.why})`);
  try { e8.stop && e8.stop(); } catch {}
}


console.log('⑨ the first read (design 008): bytes, rowViews, work — at both sizes');
{
  const MB = 1e6, pct = (a, b) => (100 * a / b).toFixed(2) + ' %';
  for (const f of [fr1, fr2]) {
    ok(f.bytes < MB, `⑨ the first read at ${f.rows} rows: ${(f.bytes / 1024).toFixed(1)} KB (< 1 MB; the old list ${(f.oldBytes / MB).toFixed(1)} MB), ${f.n} rows (attention ${JSON.stringify(f.attention)})`);
    ok(f.views <= FO.ATTENTION_MAX + FO.HEAD_ROWS * f.accounts, `⑨ …${f.views} rowViews (≤ ${FO.ATTENTION_MAX} + ${FO.HEAD_ROWS}·${f.accounts} accounts)`);
    ok(f.work < 0.02 * f.oldWork, `⑨ …its work ${f.work} = ${pct(f.work, f.oldWork)} of the old whole list's ${f.oldWork} (< 2 %)`);
    ok(Object.values(f.buried).every((x) => x.every(Boolean)), `⑨ V1: every tag kind buried at ≈ 49 000 by lastAt is on the first screen after a first read, a reconnect and a non-partial broadcast (${Object.keys(f.buried).join(', ')})`, f.buried);
    ok(f.bcScope === 'first' && f.bcBytes < MB, `⑨ an account-level change broadcasts the first read's shape: ${(f.bcBytes / 1024).toFixed(1)} KB (< 1 MB)`);
    ok(!(f.oldBcBytes < MB), `⑨ CONTROL: a non-partial broadcast that still carries every row is ${(f.oldBcBytes / MB).toFixed(1)} MB — red against the same 1 MB bound`);
    ok(f.pageOk && f.pageBytes < 100 * 1024 && f.searchHits >= 1, `⑨ a page of 60 from the middle: ${(f.pageBytes / 1024).toFixed(1)} KB; a search over every row finds ${f.searchHits}`);
    ok(f.clientWall < 20, `⑨ the client half (JSON.parse + applyFirst + groupListRows + firstScreen) at ${f.rows} rows: ${f.clientWall.toFixed(2)} ms (< 20 ms; work ${f.clientWork})`);
  }
  ok(bounded(fr1.clientWork, fr2.clientWork), `⑨ the client half's work does not grow with the index: ${fr1.clientWork} → ${fr2.clientWork} (×${(fr2.clientWork / fr1.clientWork).toFixed(3)})`);
  ok(fr2.pageWork <= 2.2 * fr1.pageWork + SLACK && fr2.searchWork <= 2.2 * fr1.searchWork + SLACK, `⑨ a page and a search are linear in the rows scanned: page ${fr1.pageWork} → ${fr2.pageWork} (×${(fr2.pageWork / fr1.pageWork).toFixed(2)}), search ${fr1.searchWork} → ${fr2.searchWork} (×${(fr2.searchWork / fr1.searchWork).toFixed(2)}) (≤ 2.2)`);
  ok(fr1.searchWork / fr1.rows < fr1.oldWork / fr1.rows / 3, `⑨ …a search reads ${(fr1.searchWork / fr1.rows).toFixed(1)} per row scanned — the shown strings' bytes, under a third of the old list's ${(fr1.oldWork / fr1.rows).toFixed(1)} per row (one search: ${fr1.searchMs.toFixed(1)} ms at ${fr1.rows} rows, ${fr2.searchMs.toFixed(1)} ms at ${fr2.rows}, printed)`);
  ok(!bounded(fr1.oldWork, fr2.oldWork) && fr2.oldBytes > 50 * MB, `⑨ CONTROL: the old whole list on the route reads ${fr1.oldWork} → ${fr2.oldWork} (×${(fr2.oldWork / fr1.oldWork).toFixed(2)}) — ${(fr1.oldBytes / MB).toFixed(1)} MB at ${fr1.rows} rows (these rows are lighter than userW's 1 542 bytes), ${(fr2.oldBytes / MB).toFixed(1)} MB at ${fr2.rows} — red`);
}
try { eng.stop && eng.stop(); } catch {}

console.log(`⑩ design 011 lane 2: a quiet minute over ${N} rows`);
{
  const MC = mutantCopies('chan-index-scale', REPO);
  const ssrc = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const esrc = engineSource(REPO);
  // the pre-lane row: the engine's pass stamps the ROW, the serializer keeps the stamps, nothing heals them
  const KEEP = ['  const s = JSON.stringify(value, INDEX_KEYS, 1);', '  const s = JSON.stringify(value, RUNTIME_KEYS, 1);'];
  const HEAL = ['      healRow(k, conv[k]);\n', ''];
  const WRITER = ["      store.stamps.set(en.key, { [lane.via === 'scan' ? 'lastScanAt' : 'lastPollAt']: now(), ...(complete ? { walkStartedAt } : {}) });", "      Object.assign(en.lane, { [lane.via === 'scan' ? 'lastScanAt' : 'lastPollAt']: now(), ...(complete ? { walkStartedAt } : {}) });"];
  ok([KEEP, HEAL].every(([f]) => ssrc.split(f).length === 2) && esrc.split(WRITER[0]).length === 2, '⑩ CONTROL setup: the omission, the heal and the engine\'s stamp writer are where the control cuts them');
  const minute = async (M, tag) => {
    const e = M.create({ dataDir: path.join(ROOT, `quiet-${tag}`), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now, log: quiet, censusTimer: () => ({ cancel() {} }) });
    const x = e.store.index;
    const qid = (i) => `q_${i.toString(16).padStart(12, '0')}`;
    await x.update(() => {
      for (let i = 0; i < N; i++) {
        Object.assign(x.entry(A, qid(i)), {
          title: `Re: [ops-${i % 997}] quarterly vendor review and the follow-up on invoice #${100000 + i}`, kind: 'group',
          participants: `Alice Example <alice.${i % 311}@example.com>, Bob Sample <bob.${i % 173}@example.org>, ops-team@example.net`,
          lastAt: T - 86400e3 - i * 1000, unread: i % 7, readAt: T - 86400e3 * 2, anchor: `msg_${i.toString(36)}`,
          stats: { hits7d: i % 5, msgs7d: i % 11 }, convCaps: { at: T, read: 'yes', sendAs: [], why: null },
          lastText: `Thanks — I looked at the numbers again and the ${i % 13} items on page ${i % 29} still do not add up`,
        });
      }
    });
    for (let i = 0; i < N; i++) e.store.stamps.set(`${A}/${qid(i)}`, { lastPollAt: now() });   // polled a moment ago
    // the warm-up, the timer's passes: the account's first (discovery complete — the rows it does not list are marked,
    // its own conversations' first ingest) and a steady one; the filler rows were polled a moment ago, none is due
    await e.pass(A); x.flush();
    offset += 61e3; await e.pass(A); x.flush();
    const own = () => Object.values(x.live()).filter((en) => en.adapterId === A && !en.key.includes('/q_'));
    const lastPolls = () => own().map((en) => Number(e.store.stamps.lane(en).lastPollAt) || 0).join();
    const t0 = now();
    const f0 = x.flushStats(), ino0 = fs.statSync(e.store.indexFile).ino, size = fs.statSync(e.store.indexFile).size, bytes0 = fs.readFileSync(e.store.indexFile);
    const j0 = (e.store.stamps.stats().journal || {}).bytes || 0;
    // the TIMER's passes (what the engine runs every 5 s): the account's rows polled as they come due; discovery is
    // not due inside the minute (its own cycle is coldSec, printed below)
    let pollSteps = 0;
    for (let k = 0; k < 12; k++) { offset += 5e3; const b = lastPolls(); await e.pass(A); if (lastPolls() !== b) pollSteps++; x.sweep(); x.flush(); }
    const f1 = x.flushStats();
    const r = { rows: Object.keys(x.live()).length, mb: +(size / 1e6).toFixed(1), writes: f1.writes - f0.writes, skipped: f1.skipped - f0.skipped, sameFile: fs.statSync(e.store.indexFile).ino === ino0, moved: !fs.readFileSync(e.store.indexFile).equals(bytes0), pollSteps, polled: own().filter((en) => Number(e.store.stamps.lane(en).lastPollAt) > t0).length, own: own().length, stampsOwed: e.store.stamps.isDirty(), journalBytes: ((e.store.stamps.stats().journal || {}).bytes || 0) - j0 };
    // discovery's cycle (coldSec): it stamps `listedAt` on every row the vendor lists — outside this lane's three stamps
    offset += 900e3; const d0 = x.flushStats().writes; await e.pass(A); x.flush(); r.discoveryWrites = x.flushStats().writes - d0;
    offset -= 61e3 + 60e3 + 900e3;
    try { e.stop(); } catch {}
    return r;
  };
  const q = await minute(ENG, 'head');
  ok(q.rows >= N && q.pollSteps > 0 && q.polled === q.own && q.writes === 0 && q.sameFile, `⑩ a quiet minute at ${q.rows} rows (${q.mb} MB on disk): the timer's 12 passes polled the account's ${q.polled} conversations in ${q.pollSteps} of them and brought nothing — ${q.writes} index writes, ${q.skipped} flushes skipped, the same file; the stamps wait in memory for the side file (owed ${q.stampsOwed}), each appended to its journal (${q.journalBytes} bytes in the minute)`, JSON.stringify(q));
  console.log(`  · printed, not judged: discovery's own cycle (every coldSec = 900 s) stamps listedAt on every listed row — ${q.discoveryWrites} index write(s) per cycle (outside this lane's three stamps)`);
  const sc = MC.write('src/channel-store.js', ssrc.replace(KEEP[0], KEEP[1]).replace(HEAL[0], HEAL[1]), 'quiet-inrow');
  const ec = MC.write('src/server/channels-engine.js', esrc.replace(WRITER[0], WRITER[1]).replace("require('../channel-store.js')", `require(${JSON.stringify(sc)})`), 'quiet-inrow');
  const qc = await minute(require(ec), 'inrow');
  // lane mirror-green-channels (2.369.204): a rewrite is witnessed by the file's BYTES, never its inode number — an ext4
  // /tmp (the Actions runner's) hands the freed inode to the next tmp + rename, so an EVEN number of writes ends on the
  // first inode again (test-channel-store ⑭'s control went red there for exactly that; this one held only while odd)
  ok(qc.pollSteps > 0 && qc.writes >= qc.pollSteps && qc.moved, `⑩ CONTROL: the stamp back in the row — the same quiet minute writes the ${qc.mb} MB index ${qc.writes} times (once per pass that polled: ${qc.pollSteps}) — red`, JSON.stringify(qc));
  for (const c of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 2 })) ok(c.pass, '⑩ ' + c.name + (c.pass ? '' : ' — ' + c.detail));
}
console.log(`\ntest-channels-index-scale: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
