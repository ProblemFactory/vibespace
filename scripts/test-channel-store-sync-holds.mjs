#!/usr/bin/env node
// test-channel-store-sync-holds — B-360d, 主开发 r1360 (the owner's hub's loop-hold digest, 2026-11-21): two synchronous
// file calls of the Channels store held the hub's loop on the data folder's network share — a mkdir at a vendor search
// (searchMemoWrite ← memoKeep ← vendorSearch: 3 holds) and an open at ingest (attachmentGet ← persistHeldBodies: 2).
// In-process, a real createChannelStore over a temp folder with its own store writer; the main thread's synchronous fs
// calls are COUNTED during each door (the writer's thread is another realm — its mkdir / temp / rename are not counted).
//   ① the vendor-search memo and its twin, the change feed's miss memo: written for an account whose directory does not
//      exist yet — 0 synchronous calls; read back at once (the memo held in memory); on disk through the writer (its thread
//      makes the directory, 0700; the file 0600, the release's bytes). RED: the release's door (mkdir + atomic write).
//   ② a drop while the memo's write is owed: the file is gone after the writer settles, and a new store reads nothing.
//   ③ ingest's question, attachmentGetAsync: the same answer as attachmentGet (a stored body, a missing one), 0
//      synchronous calls (the meta, the bytes' stat, the account's LRU ledger at its first use). RED: a body that asks the
//      synchronous one. ④ the engine's held-bodies road asks the async one.
// Run: node scripts/test-channel-store-sync-holds.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const M = mutantCopies('store-sync-holds', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'store-sync-holds-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });   // its read: a leg that throws leaves no folder
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const ENGSRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
// THE COUNT: every synchronous fs call made on this thread while `fn` runs (its promise included)
const SYNC = Object.keys(fs).filter((k) => /Sync$/.test(k) && typeof fs[k] === 'function');
async function syncCalls(fn) {
  const seen = [], orig = {};
  for (const k of SYNC) { orig[k] = fs[k]; fs[k] = function (...a) { seen.push(`${k}(${typeof a[0] === 'string' ? path.basename(a[0]) : ''})`); return orig[k].apply(this, a); }; }
  let r;
  try { r = await fn(); } finally { for (const k of SYNC) fs[k] = orig[k]; }
  return { r, seen };
}
const mode = (f) => fs.statSync(f).mode & 0o777;

// ═══ ① + ② THE TWO MEMOS ═══
console.log('① the vendor-search memo and the feed-miss memo, owed to the writer · ② a drop with its write owed');
async function memoLeg(mod, tag) {
  const dir = tmp(tag), w = SW.create({ log: quiet });
  const st = mod.createChannelStore({ dir, log: quiet, writer: w });
  const memo = { v: 1, identity: { id: 'u-1' }, entries: [{ q: 'invoice', at: 1 }] }, miss = { v: 1, rows: [{ key: 'k1', at: 2 }] };
  const c = await syncCalls(() => { st.searchMemoWrite('gmail', memo); st.feedMissWrite('gmail', miss); });
  const readNow = JSON.stringify(st.searchMemoRead('gmail')) === JSON.stringify(memo) && JSON.stringify(st.feedMissRead('gmail')) === JSON.stringify(miss);
  const f1 = path.join(dir, 'gmail', 'search-memo.json'), f2 = path.join(dir, 'gmail', 'feed-misses.json');
  await w.durable(f1); await w.durable(f2);
  let onDisk = false, modes = null;
  try { onDisk = JSON.stringify(JSON.parse(fs.readFileSync(f1, 'utf8'))) === JSON.stringify(memo) && JSON.stringify(JSON.parse(fs.readFileSync(f2, 'utf8'))) === JSON.stringify(miss); modes = [mode(path.dirname(f1)), mode(f1), mode(f2)]; } catch { }
  // ② a drop while a newer write is owed: the file is gone and a new store reads nothing
  st.searchMemoWrite('gmail', { ...memo, entries: [] });
  st.searchMemoDrop('gmail');
  await w.durable(f1);
  for (let k = 0; k < 20 && w.pending(f1); k++) await new Promise((z) => setTimeout(z, 25));
  const goneNow = !fs.existsSync(f1) && st.searchMemoRead('gmail') === null;
  try { st.close(); } catch { } try { w.stop(); } catch { }
  const w3 = SW.create({ log: quiet }), st2 = CS.createChannelStore({ dir, log: quiet, writer: w3 }); const after = st2.searchMemoRead('gmail'); try { st2.close(); } catch { } try { w3.stop(); } catch { }
  return { sync: c.seen, readNow, onDisk, modes, gone: goneNow && after === null };
}
{
  const r = await memoLeg(CS, 'memo');
  ok(r.sync.length === 0 && r.readNow && r.onDisk, `① both memos written for an account with no directory yet: ${r.sync.length} synchronous calls on the main thread${r.sync.length ? ' (' + r.sync.join(' ') + ')' : ''}; read back at once (${r.readNow}); on disk through the writer (${r.onDisk})`, r);
  ok(JSON.stringify(r.modes) === JSON.stringify([0o700, 0o600, 0o600]), `① the account's directory made by the writer's thread is 0700, the memos 0600 (${(r.modes || []).map((m) => m.toString(8)).join(' ')})`, r.modes);
  ok(r.gone, '② a memo dropped while its newer write was owed: the file is gone, the store reads nothing, and a new store reads nothing', r);
  // ② IN FLIGHT (its read M6): a write's rename lands AFTER the drop's unlink and before the writer's own unlink — a read then
  // answers null (the drop's tombstone), never the dropped memo; a new memo replaces the tombstone
  const inFlight = async (mod, tag) => {
    const dir = tmp(tag), w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: quiet, writer: w });
    const f1 = path.join(dir, 'gmail', 'search-memo.json');
    st.searchMemoWrite('gmail', { v: 1, identity: { id: 'u-1' }, entries: [{ q: 'old', at: 1 }] }); await w.durable(f1);
    st.searchMemoDrop('gmail');
    fs.mkdirSync(path.dirname(f1), { recursive: true }); fs.writeFileSync(f1, JSON.stringify({ v: 1, identity: { id: 'u-1' }, entries: [{ q: 'old', at: 1 }] }));   // the in-flight rename, landed late
    const read1 = st.searchMemoRead('gmail');
    st.searchMemoWrite('gmail', { v: 1, identity: { id: 'u-2' }, entries: [] });
    const read2 = st.searchMemoRead('gmail');
    try { st.close(); } catch { } try { w.stop(); } catch { }
    return { read1, read2: read2 && read2.identity && read2.identity.id };
  };
  const fl = await inFlight(CS, 'inflight');
  ok(fl.read1 === null && fl.read2 === 'u-2', `② a dropped memo whose write's rename landed after the unlink: read ${JSON.stringify(fl.read1)} (the tombstone); a new memo replaces it (${fl.read2})`, fl);
  const TM = M.load('src/channel-store.js', anchored(SRC, "  const memoForget = (file) => { memoHeld.set(file, null); try { W().forget(file); } catch { } };", "  const memoForget = (file) => { memoHeld.delete(file); try { W().forget(file); } catch { } };", 'a drop without its tombstone'), 'no-tombstone');
  const flr = await inFlight(TM, 'inflight-red');
  ok(flr.read1 !== null, `② RED CONTROL: a drop without its tombstone — the late rename's memo read back (${JSON.stringify(flr.read1 && flr.read1.entries)}) — the leg above would go red`, flr);
  const MS = M.load('src/channel-store.js', anchored(SRC, "    owe(file, { name: 'channels-search-memo.write', produce: memoBytes(file), mode: 0o600, makeDir: true });", "    fs.mkdirSync(path.join(dir, safeSeg(adapterId)), { recursive: true, mode: 0o700 });\n    writeJsonAtomic(file, obj, { mode: 0o600 });", 'the release\'s memo door'), 'memo-sync');
  const red = await memoLeg(MS, 'memo-red');
  ok(red.sync.some((x) => /^mkdirSync/.test(x)) && red.sync.some((x) => /^renameSync/.test(x)), `① RED CONTROL: the release's search-memo door — ${red.sync.length} synchronous calls on the main thread (${red.sync.join(' ')}) — the leg above would go red`, red.sync);
}

// ═══ ③ + ④ INGEST'S QUESTION ═══
console.log('③ attachmentGetAsync: the same answer, no synchronous call · ④ the held-bodies road asks it');
async function attLeg(mod, tag) {
  const dir = tmp(tag), w = SW.create({ log: quiet });
  const st = mod.createChannelStore({ dir, log: quiet, writer: w });
  await st.attachmentPut('gmail', 'thr_1', 'part:1', { msg: 'm1', data: Buffer.from('<p>a formatted body</p>'), mime: 'text/html' });
  try { st.close(); } catch { } try { w.stop(); } catch { }
  const w2 = SW.create({ log: quiet }), st2 = mod.createChannelStore({ dir, log: quiet, writer: w2 });   // a fresh process: the LRU ledger not read yet
  const c = await syncCalls(async () => [await st2.attachmentGetAsync('gmail', 'thr_1', 'part:1', 'm1'), await st2.attachmentGetAsync('gmail', 'thr_1', 'part:2', 'm1')]);
  const [hit, miss] = c.r;
  const want = st2.attachmentGet('gmail', 'thr_1', 'part:1', 'm1'), wantMiss = st2.attachmentGet('gmail', 'thr_1', 'part:2', 'm1');
  try { st2.close(); } catch { } try { w2.stop(); } catch { }
  return { sync: c.seen, same: !!hit && !!want && hit.file === want.file && JSON.stringify(hit.meta) === JSON.stringify(want.meta) && miss === null && wantMiss === null };
}
{
  const r = await attLeg(CS, 'att');
  ok(r.sync.length === 0 && r.same, `③ attachmentGetAsync: the answer attachmentGet gives (a stored body, a missing one: ${r.same}), ${r.sync.length} synchronous calls on the main thread${r.sync.length ? ' (' + r.sync.join(' ') + ')' : ''} — the account's LRU ledger read at its first use included`, r);
  const MA = M.load('src/channel-store.js', anchored(SRC, '  async function attachmentGetAsync(adapterId, convId, attId, msg = null) {', '  async function attachmentGetAsync(adapterId, convId, attId, msg = null) {\n    return attachmentGet(adapterId, convId, attId, msg);', 'the synchronous question behind an async name'), 'att-sync');
  const red = await attLeg(MA, 'att-red');
  ok(red.sync.some((x) => /^readFileSync/.test(x)), `③ RED CONTROL: a body that asks the synchronous attachmentGet — ${red.sync.length} synchronous calls (${red.sync.join(' ')}) — the leg above would go red`, red.sync);
  // ③ THE LRU EFFECT (its read): a hit through the async road refreshes the entry's usedAt in the account's ledger, as the
  // synchronous one does
  const lruLeg = async (mod, tag) => {
    const dir = tmp(tag), T1 = Date.UTC(2026, 10, 21, 10, 0, 0), T2 = T1 + 3600e3;
    { const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: quiet, writer: w, now: () => T1 });
      await st.attachmentPut('gmail', 'thr_1', 'part:1', { msg: 'm1', data: Buffer.from('<p>body</p>'), mime: 'text/html' }); try { st.close(); } catch { } try { w.stop(); } catch { } }
    const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, log: quiet, writer: w, now: () => T2 });
    await st.attachmentGetAsync('gmail', 'thr_1', 'part:1', 'm1');
    try { st.close(); } catch { } try { w.stop(); } catch { }
    let used = null; try { used = Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'attachments', 'gmail', 'lru.json'), 'utf8')).items).map((x) => x.usedAt)[0]; } catch { }
    return { refreshed: used === T2, used };
  };
  const lr = await lruLeg(CS, 'lru');
  ok(lr.refreshed, `③ the async road's hit refreshes the LRU entry (usedAt ${lr.used})`, lr);
  const LM = M.load('src/channel-store.js', anchored(SRC, "    const l = await lruOfAsync(adapterId);\n    const hit = l.items[`${safeSeg(convId)}/${attSlot(attId, msg)}`];\n    if (hit) { hit.usedAt = now(); lruTouch(adapterId); }", "    const l = await lruOfAsync(adapterId);\n    const hit = l.items[`${safeSeg(convId)}/${attSlot(attId, msg)}`];\n    void hit;", 'the async hit touches no LRU'), 'no-lru');
  const lrr = await lruLeg(LM, 'lru-red');
  ok(!lrr.refreshed, `③ RED CONTROL: an async hit that touches no LRU entry — usedAt stays ${lrr.used} — the leg above would go red`, lrr);
  const i = ENGSRC.indexOf('  async function persistHeldBodies('), body = i < 0 ? '' : ENGSRC.slice(i, ENGSRC.indexOf('\n  }\n', i));
  ok(body.includes('await store.attachmentGetAsync(rec.id, convId, a.id, r.vendorId)') && !body.includes('store.attachmentGet('), '④ the engine\'s held-bodies road (persistHeldBodies, at ingest) asks attachmentGetAsync, never the synchronous attachmentGet');
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
