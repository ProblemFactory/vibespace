#!/usr/bin/env node
// test-channel-att-ledger — B-f276 family, the per-account channel files (主开发 r3183 / r3188): channels/attachments/<account>/lru.json
// IS REBUILT FROM THE FOLDER. The ledger decides the account's size bound (the eviction sums it) and the card's footprint; the release
// read any failure as «nothing stored» and the next put wrote it over — every file it counted orphaned, never evicted again. The
// unreadable ledger is made by a PLACED refusal of the read call; a real store over a temp folder; made-up bytes only.
//   ① THE REFUSED READ: rebuilt from the folder at its first use — every cached file counted again, none removed, saved once.
//      RED: no rebuild (the release's: nothing counted).
//   ② THE LOST LEDGER WITH A FULL FOLDER (the release's case): a ledger not there, and one an earlier version wrote over (one item):
//      rebuilt once, every file counted. RED: the earlier version's ledger taken as it is.
//   ③ TWO PUTS DURING THE REBUILD (held by a placed stall on one meta read): admitted and counted in memory, the ledger NOT saved,
//      NOTHING evicted; at the landing merged and saved once. RED: the eviction during the rebuild (a file removed meanwhile).
//   ④ THE EVICTION AFTER IT: a put past the bound evicts the oldest files the folder holds, down to the bound. RED: the folder's files
//      not merged in (the old files never evicted).
//   ⑤ A META THAT DOES NOT PARSE: counted by its file's own size, said once, never removed. RED: a rebuild that skips it.
// Run: node scripts/test-channel-att-ledger.mjs
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
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const M = mutantCopies('att-ledger', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'att-ledger-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const turns = (ms) => new Promise((z) => setTimeout(z, ms));
const ACC = 'acct', CONV = 'c1', SIZE = 10240, N = 6;
const R0 = fs.readFileSync, P0 = fs.promises.readFile;
const restore = () => { fs.readFileSync = R0; fs.promises.readFile = P0; };
const ledgerOf = (dir) => path.join(dir, 'attachments', ACC, 'lru.json');
const filesOf = (dir) => { try { return fs.readdirSync(path.join(dir, 'attachments', ACC, CONV)).filter((x) => !x.endsWith('.json') && !x.includes('.tmp-')); } catch { return []; } };
// each store's clock: the seed's files are older than anything a later store admits (the eviction's order is the files' age)
const open = (mod, dir, warns = [], start = 2e12) => { let t = start; const w = SW.create({ log: quiet }); return { w, st: mod.createChannelStore({ dir, now: () => (t += 1000), log: { log() {}, info() {}, warn: (x) => warns.push(String(x)), error() {} }, writer: w }) }; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
const redOf = (from, run) => (SRC.includes(from) ? run() : (ok(false, `RED CONTROL: its anchor is not in this tree (${from.slice(0, 60)}…)`), null));
/** N cached files of the account, written through a store (its ledger saved), then the store closed */
async function seed(dir) {
  const o = open(CS, dir, [], 1e12);
  for (let i = 0; i < N; i++) await o.st.attachmentPut(ACC, CONV, `att-${i}`, { data: Buffer.alloc(SIZE, 97 + i), mime: 'image/png', msg: `m${i}` }, { budgetBytes: 1e9 });
  await settled(o.st);   // a first use's rebuild (an empty folder) landed
  o.st.lruFlush();   // …and its ledger saved
  shut(o);
  return filesOf(dir);
}
/** the account's usage once its rebuild (if any) landed (the release's store has no rebuild to wait for) */
async function settled(st) { if (typeof st.attachmentLedgerSettled === 'function') await st.attachmentLedgerSettled(ACC); return st.attachmentUsage(ACC); }

// ═══ ① THE REFUSED READ ═══
console.log('① the ledger\'s read refused (EIO placed): rebuilt from the folder, every file counted, none removed');
async function refusedLeg(mod, tag) {
  const dir = tmp(tag);
  const before = await seed(dir);
  const lf = ledgerOf(dir);
  const eio = () => Object.assign(new Error('EIO: placed'), { code: 'EIO' });
  fs.readFileSync = function (q, ...x) { if (path.resolve(String(q)) === lf) throw eio(); return R0.call(this, q, ...x); };
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === lf) throw eio(); return P0.call(this, q, ...x); };
  const o = open(mod, dir);
  let u;
  try { o.st.attachmentUsage(ACC); u = await settled(o.st); o.st.lruFlush(); } finally { restore(); }   // the landing's save rides the ledger's coalesced flush
  let led = null; try { led = JSON.parse(R0.call(fs, lf, 'utf8')); } catch { }
  shut(o);
  return { before: before.length, files: u.files, bytes: u.bytes, after: filesOf(dir).length, saved: !!(led && Object.keys(led.items || {}).length === N) };
}
{
  const r = await refusedLeg(CS, 'refused');
  ok(r.before === N && r.files === N && r.bytes === N * SIZE && r.after === N && r.saved, `① the ledger's read refused (EIO placed): REBUILT from the folder — ${r.files} of ${N} files counted (${r.bytes} bytes), none removed (${r.after} on disk), the ledger saved once with every file (${r.saved})`, r);
  const START = '      lruStartRebuild(adapterId, why);\n';
  await redOf(START, async () => {
    const rn = await refusedLeg(M.load('src/channel-store.js', anchored(SRC, START, '', 'no rebuild (the release\'s)'), 'no-rebuild'), 'refused-red');
    ok(rn.files === 0, `① RED CONTROL: no rebuild — the unread ledger counts nothing (${rn.files} files) and the next put would write it over — the leg above would go red`, rn);
  });
}

// ═══ ② THE LOST LEDGER WITH A FULL FOLDER ═══
console.log('② a ledger not there, and one an earlier version wrote over: rebuilt once, every file counted');
async function lostLeg(mod, tag, how) {
  const dir = tmp(tag);
  await seed(dir);
  const lf = ledgerOf(dir);
  if (how === 'gone') fs.unlinkSync(lf);
  else { const led = JSON.parse(R0.call(fs, lf, 'utf8')); const k = Object.keys(led.items)[0]; fs.writeFileSync(lf, JSON.stringify({ v: 1, items: { [k]: led.items[k] } })); }   // the release's written-over ledger: one item
  const o = open(mod, dir);
  o.st.attachmentUsage(ACC);
  const u = await settled(o.st);
  shut(o);
  return { files: u.files, after: filesOf(dir).length };
}
{
  const r1 = await lostLeg(CS, 'lost-gone', 'gone'), r2 = await lostLeg(CS, 'lost-over', 'over');
  ok(r1.files === N && r1.after === N && r2.files === N && r2.after === N, `② the ledger NOT THERE beside ${N} cached files: ${r1.files} counted; WRITTEN OVER by an earlier version (one item, no v 2): ${r2.files} counted — both rebuilt from the folder at the first use, none removed`, { r1, r2 });
  const VER = '    if (!good || Number(v.v) !== LRU_V) {';
  await redOf(VER, async () => {
    const rv = await lostLeg(M.load('src/channel-store.js', anchored(SRC, VER, '    if (!good) {', 'an earlier version\'s ledger taken as it is'), 'no-version'), 'lost-over-red', 'over');
    ok(rv.files === 1, `② RED CONTROL: an earlier version's written-over ledger taken as it is — ${rv.files} of ${N} files counted, the rest orphaned for good — the leg above would go red`, rv);
  });
}

// ═══ ③ + ④ PUTS DURING THE REBUILD, THE EVICTION AFTER IT ═══
console.log('③ two puts during the rebuild: counted in memory, not saved, nothing evicted · ④ the eviction after it');
async function duringLeg(mod, tag) {
  const dir = tmp(tag);
  const seeded = await seed(dir);
  const lf = ledgerOf(dir);
  fs.unlinkSync(lf);   // the release's case: the ledger gone, the folder full
  const stalled = path.join(dir, 'attachments', ACC, CONV, seeded[0]) + '.json';
  let release = null, hit = false;
  const gate = new Promise((z) => { release = z; });
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === stalled && !hit) { hit = true; await gate; } return P0.call(this, q, ...x); };   // THE REBUILD HELD at one meta (placed)
  const o = open(mod, dir);
  let r;
  try {
    o.st.attachmentUsage(ACC);   // its first use: the rebuild starts
    for (let k = 0; k < 100 && !hit; k++) await turns(10);
    const budget = SIZE + 100;   // one file's room: a second put would evict the first
    await o.st.attachmentPut(ACC, CONV, 'new-1', { data: Buffer.alloc(SIZE, 120), mime: 'image/png', msg: 'n1' }, { budgetBytes: budget });
    await o.st.attachmentPut(ACC, CONV, 'new-2', { data: Buffer.alloc(SIZE, 121), mime: 'image/png', msg: 'n2' }, { budgetBytes: budget });
    const mid = o.st.attachmentUsage(ACC);
    const during = { counted: mid.files, ledger: fs.existsSync(lf), onDisk: filesOf(dir).length };
    release();
    const u = await settled(o.st);
    o.st.lruFlush();   // the landing's save (the ledger's coalesced flush)
    let led = null; try { led = JSON.parse(R0.call(fs, lf, 'utf8')); } catch { }
    const landed = { files: u.files, saved: led ? Object.keys(led.items || {}).length : 0 };
    // ④ THE EVICTION AFTER IT: a put past a bound of three files evicts the oldest down to it (the folder's files included)
    await o.st.attachmentPut(ACC, CONV, 'new-3', { data: Buffer.alloc(SIZE, 122), mime: 'image/png', msg: 'n3' }, { budgetBytes: 3 * SIZE + 100 });
    const after = filesOf(dir);
    r = { hit, during, landed, after: after.length, oldGone: !after.includes(seeded[0]) && !after.includes(seeded[1]) };
  } finally { restore(); release(); shut(o); }
  return r;
}
{
  const r = await duringLeg(CS, 'during');
  ok(r.hit && r.during.counted === 2 && !r.during.ledger && r.during.onDisk === N + 2 && r.landed.files === N + 2 && r.landed.saved === N + 2, `③ two puts while the rebuild was held (${r.hit}): admitted and counted in memory (${r.during.counted}), the ledger NOT saved (on disk: ${r.during.ledger}), NOTHING evicted (${r.during.onDisk} files on disk past a one-file bound); at the landing merged (${r.landed.files}) and saved once (${r.landed.saved})`, r);
  ok(r.after === 3 && r.oldGone, `④ after it, a put past a three-file bound evicts the oldest files the folder held, down to the bound (${r.after} left; the oldest gone: ${r.oldGone})`, r);
  const GUARD = '    if (total > budgetBytes && !lruRebuilding.has(adapterId)) {';
  await redOf(GUARD, async () => {
    const rg = await duringLeg(M.load('src/channel-store.js', anchored(SRC, GUARD, '    if (total > budgetBytes) {', 'the eviction during the rebuild'), 'evict-during'), 'during-red');   // stale-pins: kept (the red control restores the release's eviction)
    ok(rg.during.onDisk < N + 2, `③ RED CONTROL: an eviction during the rebuild — a file removed from a part of the truth (${rg.during.onDisk} of ${N + 2} on disk) — the leg above would go red`, rg);
  });
  const MERGE = '      for (const [k, x] of Object.entries(r.found)) if (!l.items[k]) { l.items[k] = x; added++; }';
  await redOf(MERGE, async () => {
    const rm = await duringLeg(M.load('src/channel-store.js', anchored(SRC, MERGE, '', 'the folder\'s files not merged in'), 'no-merge'), 'merge-red');
    ok(!rm.oldGone, `④ RED CONTROL: the folder's files not merged in — the old files are never evicted (the oldest gone: ${rm.oldGone}) — the leg above would go red`, rm);
  });
}

// ═══ ⑤ A META THAT DOES NOT PARSE ═══
console.log('⑤ a meta that does not parse: counted by its file\'s own size, said once, never removed');
async function badMetaLeg(mod, tag) {
  const dir = tmp(tag), warns = [];
  const seeded = await seed(dir);
  fs.unlinkSync(ledgerOf(dir));
  fs.writeFileSync(path.join(dir, 'attachments', ACC, CONV, seeded[2]) + '.json', '{"bytes": 10');   // torn
  const o = open(mod, dir, warns);
  o.st.attachmentUsage(ACC);
  const u = await settled(o.st);
  o.st.attachmentUsage(ACC);
  shut(o);
  return { files: u.files, bytes: u.bytes, said: warns.filter((l) => /meta that does not parse/.test(l)).length, kept: filesOf(dir).includes(seeded[2]) };
}
{
  const r = await badMetaLeg(CS, 'badmeta');
  ok(r.files === N && r.bytes === N * SIZE && r.said === 1 && r.kept, `⑤ a meta that does not parse: counted by its file's own size (${r.files} files, ${r.bytes} bytes), said once (${r.said}), never removed (${r.kept})`, r);
  const STAT = "        try { const st = await fs.promises.stat(f); if (st.isFile()) { found[`${c}/${nm}`] = { bytes: st.size, usedAt: Math.round(st.mtimeMs) || 0 }; bad++; } } catch { /* gone meanwhile */ }";
  await redOf(STAT, async () => {
    const rs = await badMetaLeg(M.load('src/channel-store.js', anchored(SRC, STAT, '', 'a rebuild that skips a meta that does not parse'), 'skip-bad'), 'badmeta-red');
    ok(rs.files === N - 1, `⑤ RED CONTROL: a rebuild that skips the meta that does not parse — ${rs.files} of ${N} counted (its file orphaned) — the leg above would go red`, rs);
  });
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
