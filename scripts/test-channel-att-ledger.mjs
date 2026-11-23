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
//   ⑤ A META THAT DOES NOT PARSE: counted by its file's own size, said once, never removed by the rebuild. RED: a rebuild that skips it.
//   r3279 (round wocvcprg2's follow): ④ shows least-recently-used order (a hit keeps an old file, a newer unhit one goes); ③ a red for
//   «not saved while rebuilding»;
//   ⑥ A FOLDER THAT CANNOT BE LISTED (a conversation's, the account's): the walk is UNFINISHED — what could be read counted, nothing
//      evicted, saved without its mark, said ONCE, walked again only after its wait — and a later walk lists it whole. RED: a
//      conversation's failing listing skipped silently (saved as the truth, its files never counted).
//   ⑦ A FILE ADMITTED DURING THE REBUILD AND FOUND IN THE FOLDER: counted once. RED: the walk's key without its conversation.
//   ⑧ A CLOSE DURING A REBUILD saves it unfinished; the next store rebuilds it and counts every file. RED: a close that saves it as the
//      truth (its missed files orphaned).
//   ② also: an earlier version's ledger with an entry whose file is gone — a whole walk is the truth, the entry leaves. RED: kept.
//   ⑨ «FORGET ITS DATA» DURING A REBUILD: the next put rebuilds at once and whole, the forgotten walk still held (and it lands
//      nothing). RED: a forget that leaves the rebuild in flight (the next put waits on the forgotten walk).
// Run: node scripts/test-channel-att-ledger.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order: the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import crypto from 'node:crypto';
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
const blob = (att, msg) => crypto.createHash('sha1').update(`${msg}\n${att}`).digest('hex');   // a cached file's name (the store's attSlot)
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
  const START = '      lruUnfinished.set(adapterId, { tries: 0, retryAt: 0, said: false, why }); lruStartRebuild(adapterId, why);';
  await redOf(START, async () => {
    const rn = await refusedLeg(M.load('src/channel-store.js', anchored(SRC, START, '      void why;', 'no rebuild (the release\'s)'), 'no-rebuild'), 'refused-red');
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
  else { const led = JSON.parse(R0.call(fs, lf, 'utf8')); const k = Object.keys(led.items)[0]; fs.writeFileSync(lf, JSON.stringify({ v: 1, items: { [k]: led.items[k], [`${CONV}/ghost`]: { bytes: 999, usedAt: 1 } } })); }   // the release's written-over ledger: one item, and one whose file is gone
  const o = open(mod, dir);
  o.st.attachmentUsage(ACC);
  const u = await settled(o.st);
  shut(o);
  return { files: u.files, after: filesOf(dir).length };
}
{
  const r1 = await lostLeg(CS, 'lost-gone', 'gone'), r2 = await lostLeg(CS, 'lost-over', 'over');
  ok(r1.files === N && r1.after === N && r2.files === N && r2.after === N, `② the ledger NOT THERE beside ${N} cached files: ${r1.files} counted; WRITTEN OVER by an earlier version (one item and one with no file, no v 2): ${r2.files} counted, the entry with no file gone (the folder is the truth) — both rebuilt from the folder at the first use, none removed`, { r1, r2 });
  const VER = '    if (!good || Number(v.v) !== LRU_V) {';
  await redOf(VER, async () => {
    const rv = await lostLeg(M.load('src/channel-store.js', anchored(SRC, VER, '    if (!good) {', 'an earlier version\'s ledger taken as it is'), 'no-version'), 'lost-over-red', 'over');
    ok(rv.files === 2, `② RED CONTROL: an earlier version's written-over ledger taken as it is — ${rv.files} entries counted (one of ${N} files and one with no file), the rest orphaned for good — the leg above would go red`, rv);
  });
  const PRUNE = '      for (const k of Object.keys(l.items)) if (!r.found[k] && !admitted.has(k)) { delete l.items[k]; pruned++; }';
  await redOf(PRUNE, async () => {
    const rp = await lostLeg(M.load('src/channel-store.js', anchored(SRC, PRUNE, '', 'an entry with no file kept'), 'no-prune'), 'lost-prune-red', 'over');
    ok(rp.files === N + 1, `② RED CONTROL: a whole walk that keeps an entry with no file — ${rp.files} counted for ${N} files on disk (a size the folder does not hold) — the leg above would go red`, rp);
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
    // ④ THE EVICTION AFTER IT: a put past a bound of three files evicts the least recently used down to it (the folder's files included):
    // an old file HIT now stays, a newer file nobody drew since goes
    o.st.attachmentGet(ACC, CONV, 'att-2', 'm2');
    await o.st.attachmentPut(ACC, CONV, 'new-3', { data: Buffer.alloc(SIZE, 122), mime: 'image/png', msg: 'n3' }, { budgetBytes: 3 * SIZE + 100 });
    const after = filesOf(dir);
    const old = seeded.filter((x) => x !== blob('att-2', 'm2'));
    r = { hit, during, landed, after: after.length, oldGone: old.every((x) => !after.includes(x)), lru: after.includes(blob('att-2', 'm2')) && after.includes(blob('new-2', 'n2')) && !after.includes(blob('new-1', 'n1')) };
  } finally { restore(); release(); shut(o); }
  return r;
}
{
  const r = await duringLeg(CS, 'during');
  ok(r.hit && r.during.counted === 2 && !r.during.ledger && r.during.onDisk === N + 2 && r.landed.files === N + 2 && r.landed.saved === N + 2, `③ two puts while the rebuild was held (${r.hit}): admitted and counted in memory (${r.during.counted}), the ledger NOT saved (on disk: ${r.during.ledger}), NOTHING evicted (${r.during.onDisk} files on disk past a one-file bound); at the landing merged (${r.landed.files}) and saved once (${r.landed.saved})`, r);
  ok(r.after === 3 && r.oldGone && r.lru, `④ after it, a put past a three-file bound evicts in least-recently-used order, the folder's files included, down to the bound (${r.after} left; the old files gone: ${r.oldGone}; the old file hit now kept, the newer unhit one gone: ${r.lru})`, r);
  const SAVEG = '    if (lruRebuilding.has(adapterId) && !closed) { lruDirty.add(adapterId); return; }';
  await redOf(SAVEG, async () => {
    const rs = await duringLeg(M.load('src/channel-store.js', anchored(SRC, SAVEG, '', 'a ledger saved while it is rebuilt'), 'save-during'), 'save-red');
    ok(rs.during.ledger, `③ RED CONTROL: a ledger saved while it is rebuilt — a put writes the partial count to disk (on disk: ${rs.during.ledger}) — the leg above would go red`, rs);
  });
  const GUARD = '    if (total > budgetBytes && !lruRebuilding.has(adapterId) && !lruUnfinished.has(adapterId)) {';
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
  return { files: u.files, bytes: u.bytes, said: warns.filter((l) => /meta that is missing or does not parse/.test(l)).length, kept: filesOf(dir).includes(seeded[2]) };
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

// ═══ ⑥ A FOLDER THAT CANNOT BE LISTED ═══
console.log('⑥ a folder that cannot be listed: unfinished — counted what could be read, nothing evicted, said once, walked again after its wait');
async function listLeg(mod, tag, which) {
  const dir = tmp(tag), warns = [];
  await seed(dir);
  { const o = open(CS, dir, [], 1e12 + 1e6); for (let i = 0; i < 2; i++) await o.st.attachmentPut(ACC, 'c2', `two-${i}`, { data: Buffer.alloc(SIZE, 50 + i), mime: 'image/png', msg: `t${i}` }, { budgetBytes: 1e9 }); await settled(o.st); o.st.lruFlush(); shut(o); }
  const lf = ledgerOf(dir);
  fs.unlinkSync(lf);   // the release's case: the ledger gone, two conversations' folders full
  const target = which === 'root' ? path.join(dir, 'attachments', ACC) : path.join(dir, 'attachments', ACC, 'c2');
  const D0 = fs.promises.readdir; let lists = 0, failing = true;
  fs.promises.readdir = async function (q, ...x) { if (path.resolve(String(q)) === target) { lists++; if (failing) throw Object.assign(new Error('EIO: placed'), { code: 'EIO' }); } return D0.call(this, q, ...x); };
  const clock = { t: 2e12 };
  const w = SW.create({ log: quiet }), st = mod.createChannelStore({ dir, now: () => (clock.t += 1), log: { log() {}, info() {}, warn: (x) => warns.push(String(x)), error() {} }, writer: w });
  let r;
  try {
    st.attachmentUsage(ACC); const u1 = await settled(st);
    for (let k = 0; k < 5; k++) st.attachmentUsage(ACC);   // later uses before its wait: no new walk
    await st.attachmentPut(ACC, CONV, 'over', { data: Buffer.alloc(SIZE, 99), mime: 'image/png', msg: 'o' }, { budgetBytes: SIZE + 100 });   // past a one-file bound
    st.lruFlush();
    let led = null; try { led = JSON.parse(R0.call(fs, lf, 'utf8')); } catch { }
    const both = () => filesOf(dir).length + fs.readdirSync(path.join(dir, 'attachments', ACC, 'c2')).filter((x) => !x.endsWith('.json') && !x.includes('.tmp-')).length;   // the two conversations' cached files
    const mid = { counted: u1.files, lists, onDisk: both(), v: led ? led.v : null, said: warns.filter((l) => /could not be rebuilt whole/.test(l)).length };
    failing = false; clock.t += 31e3;   // the storage answers again, and the wait has passed
    st.attachmentUsage(ACC); const u2 = await settled(st); st.lruFlush();
    let led2 = null; try { led2 = JSON.parse(R0.call(fs, lf, 'utf8')); } catch { }
    r = { mid, whole: u2.files, v2: led2 ? led2.v : null, saidAfter: warns.filter((l) => /could not be rebuilt whole/.test(l)).length };
  } finally { fs.promises.readdir = D0; try { st.close(); } catch { } try { w.stop(); } catch { } }
  return r;
}
for (const which of ['conv', 'root']) {
  const r = await listLeg(CS, `list-${which}`, which);
  const want = which === 'conv' ? N : 0;   // the conversation's folder that failed holds 2 of the N + 2 files; the root holds them all
  ok(r.mid.counted === want && r.mid.lists === 1 && r.mid.onDisk === N + 3 && r.mid.v !== 2 && r.mid.said === 1 && r.whole === N + 3 && r.v2 === 2 && r.saidAfter === 1, `⑥ ${which === 'conv' ? 'a conversation\'s folder' : 'the account\'s folder'} could not be listed (EIO placed): UNFINISHED — ${r.mid.counted} counted, listed once in six uses (${r.mid.lists}), nothing evicted past a one-file bound (${r.mid.onDisk} on disk), saved without its mark (v ${r.mid.v}), said once (${r.mid.said}); after its wait a walk lists it whole (${r.whole} counted, v ${r.v2})`, r);
}
{
  const SKIP = "      try { names = await fs.promises.readdir(path.join(root, c)); } catch (e) { if (!e || e.code !== 'ENOENT') failed = failed || (e && e.code) || 'error'; continue; }";
  await redOf(SKIP, async () => {
    const rs = await listLeg(M.load('src/channel-store.js', anchored(SRC, SKIP, '      try { names = await fs.promises.readdir(path.join(root, c)); } catch { continue; }', 'a failing listing skipped silently (the commit\'s)'), 'skip-list'), 'list-red', 'conv');   // stale-pins: kept (the red control restores the commit's silent skip)
    ok(rs.mid.v === 2, `⑥ RED CONTROL: a conversation's failing listing skipped silently — the walk saved as the truth (v ${rs.mid.v}) without that folder's files — the leg above would go red`, rs);
  });
}

// ═══ ⑦ ADMITTED DURING THE REBUILD AND FOUND IN THE FOLDER ═══
console.log('⑦ a file admitted during the rebuild and found in the folder: counted once');
async function onceLeg(mod, tag) {
  const dir = tmp(tag);
  const seeded = await seed(dir);
  fs.unlinkSync(ledgerOf(dir));
  const stalled = path.join(dir, 'attachments', ACC, CONV, seeded[0]) + '.json';
  let release = null, hit = false;
  const gate = new Promise((z) => { release = z; });
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === stalled && !hit) { hit = true; await gate; } return P0.call(this, q, ...x); };
  const o = open(mod, dir);
  let r;
  try {
    o.st.attachmentUsage(ACC);
    for (let k = 0; k < 100 && !hit; k++) await turns(10);
    await o.st.attachmentPut(ACC, CONV, 'att-3', { data: Buffer.alloc(SIZE, 100), mime: 'image/png', msg: 'm3' }, { budgetBytes: 1e9 });   // the same file again: in the folder AND admitted
    release();
    const u = await settled(o.st);
    r = { hit, files: u.files, bytes: u.bytes };
  } finally { restore(); release(); shut(o); }
  return r;
}
{
  const r = await onceLeg(CS, 'once');
  ok(r.hit && r.files === N && r.bytes === N * SIZE, `⑦ a file admitted during the held rebuild and found in the folder is counted ONCE (${r.files} of ${N} files, ${r.bytes} bytes)`, r);
  const KEY = '        if (meta && typeof meta === \'object\' && Number.isFinite(Number(meta.bytes))) { found[`${c}/${nm}`] = { bytes: Number(meta.bytes), usedAt: Number(meta.at) || 0 }; return; }';
  await redOf(KEY, async () => {
    const rk = await onceLeg(M.load('src/channel-store.js', anchored(SRC, KEY, '        if (meta && typeof meta === \'object\' && Number.isFinite(Number(meta.bytes))) { found[nm] = { bytes: Number(meta.bytes), usedAt: Number(meta.at) || 0 }; return; }', 'the walk\'s key without its conversation'), 'key-cut'), 'once-red');
    ok(rk.files !== N, `⑦ RED CONTROL: the walk's key without its conversation — the admitted file counted twice (${rk.files} of ${N}) — the leg above would go red`, rk);
  });
}

// ═══ ⑧ A CLOSE DURING A REBUILD ═══
console.log('⑧ a close during a rebuild saves it unfinished; the next store rebuilds it and counts every file');
async function closeLeg(mod, tag) {
  const dir = tmp(tag);
  const seeded = await seed(dir);
  const lf = ledgerOf(dir);
  fs.unlinkSync(lf);
  const stalled = path.join(dir, 'attachments', ACC, CONV, seeded[0]) + '.json';
  let release = null, hit = false;
  const gate = new Promise((z) => { release = z; });
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === stalled && !hit) { hit = true; await gate; } return P0.call(this, q, ...x); };
  const o = open(mod, dir);
  let r;
  try {
    o.st.attachmentUsage(ACC);
    for (let k = 0; k < 100 && !hit; k++) await turns(10);
    await o.st.attachmentPut(ACC, CONV, 'late', { data: Buffer.alloc(SIZE, 110), mime: 'image/png', msg: 'l' }, { budgetBytes: 1e9 });
    shut(o);   // THE CLOSE, the rebuild still held
    let led = null; try { led = JSON.parse(R0.call(fs, lf, 'utf8')); } catch { }
    release(); restore();
    const o2 = open(mod, dir);
    o2.st.attachmentUsage(ACC); const u = await settled(o2.st);
    shut(o2);
    r = { hit, v: led ? led.v : null, kept: led ? Object.keys(led.items || {}).length : 0, files: u.files };
  } finally { restore(); release(); }
  return r;
}
{
  const r = await closeLeg(CS, 'close');
  ok(r.hit && r.v === 1 && r.kept === 1 && r.files === N + 1, `⑧ a close during a held rebuild saved it UNFINISHED (v ${r.v}, the put kept: ${r.kept}); the next store rebuilt it and counts every file (${r.files} of ${N + 1})`, r);
  const MARK = '    l.v = lruUnfinished.has(adapterId) ? 1 : LRU_V;';
  await redOf(MARK, async () => {
    const rm = await closeLeg(M.load('src/channel-store.js', anchored(SRC, MARK, '    l.v = LRU_V;', 'a close that saves it as the truth'), 'close-truth'), 'close-red');
    ok(rm.v === 2 && rm.files === 1, `⑧ RED CONTROL: a close that saves a rebuild in flight as the truth (v ${rm.v}) — the next store takes it as it is and counts ${rm.files} of ${N + 1} (the rest orphaned) — the leg above would go red`, rm);
  });
}

// ═══ ⑨ «FORGET ITS DATA» DURING A REBUILD ═══
console.log('⑨ the account forgotten during a held rebuild: the next put rebuilds at once, and the old walk lands nothing');
async function purgeLeg(mod, tag, waitMs = 2000) {
  const dir = tmp(tag);
  const seeded = await seed(dir);
  fs.unlinkSync(ledgerOf(dir));
  const stalled = path.join(dir, 'attachments', ACC, CONV, seeded[0]) + '.json';
  let release = null, hit = false;
  const gate = new Promise((z) => { release = z; });
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === stalled && !hit) { hit = true; await gate; } return P0.call(this, q, ...x); };
  const o = open(mod, dir);
  let r;
  try {
    o.st.attachmentUsage(ACC);
    for (let k = 0; k < 100 && !hit; k++) await turns(10);
    o.st.purgeAccount(ACC);   // «Forget its data», the rebuild still held
    await o.st.attachmentPut(ACC, CONV, 'p1', { data: Buffer.alloc(SIZE, 70), mime: 'image/png', msg: 'q1' }, { budgetBytes: 1e9 });
    // THE NEXT PUT REBUILDS AT ONCE: its own walk settles while the forgotten one is still held (never waits on it)
    const atOnce = await Promise.race([o.st.attachmentLedgerSettled(ACC).then(() => true), turns(waitMs).then(() => false)]);
    release();
    const u = await settled(o.st);
    for (let k = 0; k < 5; k++) await turns(10);   // the old walk lands too
    await o.st.attachmentPut(ACC, CONV, 'p2', { data: Buffer.alloc(SIZE, 71), mime: 'image/png', msg: 'q2' }, { budgetBytes: SIZE + 100 });
    r = { hit, atOnce, files: u.files, onDisk: filesOf(dir).length, after: o.st.attachmentUsage(ACC).files };
  } finally { restore(); release(); shut(o); }
  return r;
}
{
  const r = await purgeLeg(CS, 'purge');
  ok(r.hit && r.atOnce && r.files === 1 && r.onDisk === 1 && r.after === 1, `⑨ the account forgotten while its rebuild was held: the next put's ledger rebuilt AT ONCE, the forgotten walk still held (${r.atOnce}), and whole (${r.files} counted, nothing of the forgotten folder), so a put past a one-file bound evicts again (${r.onDisk} on disk, ${r.after} counted)`, r);
  const CLEAR = '    lruRebuilding.delete(adapterId); lruUnfinished.delete(adapterId); lruAdmitted.delete(adapterId);';
  await redOf(CLEAR, async () => {
    const rc = await purgeLeg(M.load('src/channel-store.js', anchored(SRC, CLEAR, '', 'a forget that leaves the rebuild in flight'), 'purge-keeps'), 'purge-red', 300);   // its mutant waits on a walk held until the release: a short bound
    ok(rc.atOnce === false, `⑨ RED CONTROL: «Forget its data» leaves the rebuild in flight — the next put's ledger waits on the forgotten walk (settled while the forgotten walk is held: ${rc.atOnce}), unfinished until a later use walks again — the leg above would go red`, rc);
  });
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
