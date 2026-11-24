#!/usr/bin/env node
// THE SWEEP'S FAIL-CLOSED LAW (lane bl-windows, 主开发 r3006 — for 2.369.416): a kept browsers' store whose read FAILED at a start is
// never «empty» to the boot sweep. The release SET the unreadable data/browser-kept.json ASIDE: the file became «not there», browser-env's
// own read (keptKeySet) answered an EMPTY set, and the boot sweep removed — recursively — every kept browser's profile folder, its
// sign-ins. ONE leg, the refusal PLACED (the store's first read at the start refused, EIO — never a real mount, never a mode change): the
// real kept store loads, the REAL boot sweep (browser-env's sweep) runs over stand-in profile folders — ZERO removed — and a kept browser
// noted after it writes nothing over the file. RED: the release's load (the rename) — the folders gone. ② the same over TORN bytes
// (both reads fail to parse). ③ r3023: a MINT while the store cannot be read takes its first candidate (the kept rule names nothing
// unknown) — RED: the line before it, 64 tries and 64 walks of every conversation's meta.
// In-process, scratch folders only; no browser, no daemon.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('kept-sweep');
const { ok, report } = checker();
const KB = require(path.join(REPO, 'src/browser-kept.js'));
const BE = require(path.join(REPO, 'src/server/browser-env.js'));
const KS0 = require(path.join(REPO, 'src/server/browser-kept.js'));
const KSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-kept.js'), 'utf8');
const MUT = mutantCopies('kept-sweep', REPO);
const quiet = { log() { }, warn() { }, error() { } };
const KEYS = ['bk-0000a011', 'bk-0000b012'];   // two kept browsers, each with its profile folder (its sign-ins)
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, list: () => ({ profiles: [] }) });

let wn = 0;
async function scene(KS, { torn = false } = {}) {
  const dir = path.join(ROOT, `w${++wn}`), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true });
  const be = BE.create({ dataDir: dir, homeDir: home, serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock') });
  const file = path.resolve(path.join(dir, KB.KEPT_FILE));
  const bytes = torn ? '{"version":1,"entries":{"' + KEYS[0] + '":{"hasDir":tr' : JSON.stringify({ version: 1, entries: Object.fromEntries(KEYS.map((k) => [k, { hasDir: true, tabs: [{ url: 'https://mail.example/' }] }])) });
  fs.writeFileSync(file, bytes);
  for (const k of KEYS) { fs.mkdirSync(be.scratchDirFor(k), { recursive: true }); fs.writeFileSync(path.join(be.scratchDirFor(k), 'Cookies'), 'a sign-in'); }
  // PLACED: the store's first read at the start is refused (a share that answers EIO once) — the sweep's own read later is not
  const realRead = fs.readFileSync;
  let refused = 0;
  fs.readFileSync = function (p, ...a) { if (!torn && !refused && path.resolve(String(p)) === file) { refused++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };   // torn: no refusal — the bytes themselves do not parse
  let S;
  try { S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), log: quiet, sweepEveryMs: 0, thereEveryMs: 0 }); S.has(KEYS[0]); }   // the start's load
  finally { fs.readFileSync = realRead; }
  const sw = be.sweep(new Set(), { graceMs: 0 });   // THE REAL BOOT SWEEP
  const left = KEYS.filter((k) => fs.existsSync(path.join(be.scratchDirFor(k), 'Cookies'))).length;
  S.noteStart('bk-0000c013', { hasDir: true });   // a kept browser noted after it: the store writes (or not)
  const out = { refused, removed: KEYS.length - left, same: fs.existsSync(file) && realRead(file, 'utf8') === bytes, swept: sw.swept, keptDirs: sw.keptDirs };
  try { if (S._hold) S._hold.stop(); } catch { /* its own */ }   // r3585: no read again and no rebuild outlives the scene
  return out;
}

console.log('① a read refused at a start: the REAL boot sweep removes NO kept browser\'s folder, and nothing is written over the file');
const g = await scene(KS0);
console.log(`    facts: ${JSON.stringify(g)}`);
ok(g.refused === 1 && g.removed === 0 && g.keptDirs === KEYS.length && g.same, 'the store\'s first read is refused (EIO): the file stays where it is, the boot sweep reads it itself and spares BOTH kept browsers\' profile folders (zero removed), and a kept browser noted after it writes nothing over the file', g);
const x = await scene(MUT.load('src/server/browser-kept.js', anchored(KSRC, '    store = K.normalizeKeptStore(hold.start(a0) === \'data\' ? a0.value : null);\n', '    if (a0.state !== \'data\' && a0.state !== \'missing\') { const aside = `${file}.corrupt-${now()}`; try { fs.renameSync(file, aside); } catch { /* the release: kept nowhere */ } }\n    store = K.normalizeKeptStore(a0.state === \'data\' ? a0.value : null);\n', 'the release\'s load: the rename aside'), 'kept-sweep-release'));
console.log(`    facts (red): ${JSON.stringify(x)}`);
ok(x.removed === KEYS.length && !x.same, 'RED CONTROL (the release\'s load: an unreadable store is renamed aside): the file is «not there» to the boot sweep, which REMOVES both kept browsers\' profile folders — their sign-ins — and the next write replaces the file — red', x);


console.log('② TORN BYTES (both reads fail to parse): the REAL boot sweep removes NO kept browser\'s folder');
const t = await scene(KS0, { torn: true });
console.log(`    facts: ${JSON.stringify(t)}`);
ok(t.removed === 0 && t.keptDirs === KEYS.length && t.same, 'torn bytes at the start: the file stays as it is, the boot sweep\'s own read cannot parse it either (unknown) and spares BOTH kept browsers\' folders — zero removed; nothing is written over the bytes', t);
const tx = await scene(MUT.load('src/server/browser-kept.js', anchored(KSRC, '    store = K.normalizeKeptStore(hold.start(a0) === \'data\' ? a0.value : null);\n', '    if (a0.state !== \'data\' && a0.state !== \'missing\') { const aside = `${file}.corrupt-${now()}`; try { fs.renameSync(file, aside); } catch { /* the release: kept nowhere */ } }\n    store = K.normalizeKeptStore(a0.state === \'data\' ? a0.value : null);\n', 'the release\'s load: the rename aside'), 'kept-sweep-torn-release'), { torn: true });
ok(tx.removed === KEYS.length, 'RED CONTROL (the release\'s load over torn bytes): set aside, «not there» to the sweep — BOTH folders removed — red', tx);

console.log('③ r3023: a MINT while the kept store cannot be read (torn bytes, and a refused read) does not exhaust — the kept rule names nothing unknown');
const BK = require(path.join(REPO, 'src/server/browser-key.js'));
const mintRun = async (BEm, how) => {
  const dir = path.join(ROOT, `m${++wn}`), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true }); fs.mkdirSync(path.join(dir, 'session-meta'), { recursive: true });
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, 'session-meta', `s${i}.json`), JSON.stringify({ browserKey: 'bk-0000f0' + (10 + i), backend: 'claude' }));
  const be = BEm.create({ dataDir: dir, homeDir: home, serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock') });
  const file = path.resolve(path.join(dir, KB.KEPT_FILE));
  fs.writeFileSync(file, how === 'torn' ? '{"version":1,"entries":{"bk-0000a011":{"hasDir":tr' : JSON.stringify({ version: 1, entries: {} }));
  const metaDir = path.resolve(path.join(dir, 'session-meta'));
  const realRead = fs.readFileSync, realDir = fs.readdirSync;
  let walks = 0;
  const warned = [];
  fs.readFileSync = function (p, ...a) { if (how === 'refused' && path.resolve(String(p)) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, p, ...a); };
  fs.readdirSync = function (p, ...a) { if (path.resolve(String(p)) === metaDir) walks++; return realDir.call(this, p, ...a); };
  let key;
  try { key = BK.mintKey({ browserEnv: be, keeper: null, activeSessions: new Map(), log: { warn: (m) => warned.push(String(m)), log() { } } }); }
  finally { fs.readFileSync = realRead; fs.readdirSync = realDir; }
  return { how, key: /^bk-[0-9a-f]{8}$/.test(String(key)), walks, exhausted: warned.some((m) => /EXHAUSTED/.test(m)), retriesSaid: warned.length };
};
for (const how of ['torn', 'refused']) {
  const m = await mintRun(BE, how);
  ok(m.key && m.walks === 1 && !m.exhausted && m.retriesSaid === 0, `${how === 'torn' ? 'torn bytes' : 'a refused read'}: the mint takes its FIRST candidate — zero retries, the conversations\' meta walked ONCE, no «EXHAUSTED»`, m);
  const mx = await mintRun(MUT.load('src/server/browser-env.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8'), '    const ks = keptKeySet(); if (ks && ks.has(K)) return true;\n', '    const ks = keptKeySet(); if (!ks || ks.has(K)) return true;\n', 'an unknown store names every key'), `kept-sweep-mint-${how}`), how);
  ok(mx.walks === 64 && mx.exhausted, `RED CONTROL (${how}, the line before r3023: an unknown store names every candidate): 64 tries, the meta walked 64 times on the loop, «EXHAUSTED» — red`, mx);
}

console.log('④ r3054 THE SECOND DOOR — the bindings file: a refused read, or torn bytes, at the kept store\'s sweep (past the grace) ENDS nothing and REMOVES no folder; a record over an unread file writes nothing');
const BBS = fs.readFileSync(path.join(REPO, 'src/server/browser-bindings.js'), 'utf8');
const BB0 = require(path.join(REPO, 'src/server/browser-bindings.js'));
const CONVS = ['c-aaaa1111-0000-4000-8000-000000000001', 'c-bbbb2222-0000-4000-8000-000000000002'];
async function bindScene(BBm, how) {
  const dir = path.join(ROOT, `b${++wn}`);
  fs.mkdirSync(dir, { recursive: true });
  let clock = 1_000_000;
  const bindings = BBm.create({ dataDir: dir, log: quiet });
  for (let i = 0; i < KEYS.length; i++) bindings.record(CONVS[i], KEYS[i], { at: clock });   // each kept browser's conversation CAN come back
  const bfile = path.resolve(bindings.file);
  const S = KS0.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  for (const k of KEYS) { S.noteStart(k, { hasDir: true }); fs.mkdirSync(S.dirOf(k), { recursive: true }); fs.writeFileSync(path.join(S.dirOf(k), 'Cookies'), 'a sign-in'); }
  clock += 3600e3;   // an hour later: both stopped far past the grace — only their bindings keep them
  if (how === 'torn') fs.writeFileSync(bfile, fs.readFileSync(bfile, 'utf8').slice(0, 40));   // torn bytes (a write cut short)
  const bytes = fs.readFileSync(bfile, 'utf8');
  // PLACED on the very read: the bindings file's reads refused (EIO — a share that does not answer), never a mount, never a mode change
  const realRead = fs.readFileSync;
  let refusedN = 0;
  fs.readFileSync = function (p, ...a) { if (how === 'refused' && path.resolve(String(p)) === bfile) { refusedN++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  let sw = null, rec = null;
  try {
    sw = await S.sweep();   // THE REAL KEPT SWEEP (the hourly pass) over the REAL bindings
    rec = bindings.record('c-cccc3333-0000-4000-8000-000000000003', 'bk-0000c013', { at: clock });   // a record while the file cannot be read
  } finally { fs.readFileSync = realRead; }
  const left = KEYS.filter((k) => fs.existsSync(path.join(S.dirOf(k), 'Cookies'))).length;
  // r3585: torn bytes are copied aside OFF the loop (the helper's own read again) — waited for, bounded (a loaded machine is slower)
  const hasCopy = () => fs.readdirSync(path.dirname(bfile)).some((n) => n.startsWith('bindings.json.corrupt-') && realRead(path.join(path.dirname(bfile), n), 'utf8') === bytes);
  let copyKept = false;
  for (let i = 0; i < 800 && how === 'torn' && BBm === BB0 && !(copyKept = hasCopy()); i++) await new Promise((r) => setTimeout(r, 10));   // the real module's copy only (the red control's never comes)
  const res = { how, refusedN, ended: sw ? sw.ended : null, removed: KEYS.length - left, kept: KEYS.filter((k) => S.has(k)).length, recorded: rec, same: realRead(bfile, 'utf8') === bytes, copyKept };
  try { S.shutdown(); } catch { /* its own */ }
  return res;
}
for (const how of ['refused', 'torn']) {
  const b = await bindScene(BB0, how);
  console.log(`    facts: ${JSON.stringify(b)}`);
  ok((how === 'torn' || b.refusedN >= 1) && b.ended === 0 && b.removed === 0 && b.kept === KEYS.length && b.recorded === false && (how === 'torn' ? b.copyKept : b.same),   // r3585: torn bytes are kept aside once, then rebuilt (⑫)
    `${how === 'torn' ? 'torn bytes in the bindings file' : 'the bindings file\'s read refused (EIO)'} at the hourly kept sweep, both kept browsers stopped an hour past the grace: UNKNOWN IS NOT EMPTY — ZERO ended, ZERO folders removed (their sign-ins stay); a record then writes NOTHING over the file (byte for byte)`, b);
  const bx = await bindScene(MUT.load('src/server/browser-bindings.js', anchored(BBS, '  function readState() {\n', "  function readState() { // the release: a bare catch — any failure, or bytes that do not parse, answer EMPTY\n    try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (raw && typeof raw === 'object' && raw.byConversation && typeof raw.byConversation === 'object') return { state: 'ok', all: raw }; } catch { }\n    return { state: 'absent', all: { v: 1, byConversation: {} } };\n  }\n  function readStateNow() {\n", 'r3054 control: the release\'s bare catch'), `bindings-bare-catch-${how}`), how);
  console.log(`    facts (red): ${JSON.stringify(bx)}`);
  ok(bx.removed === KEYS.length && bx.ended === KEYS.length && !bx.same, `RED CONTROL (${how}, the release's bare catch): the unread bindings answer EMPTY — the sweep ends BOTH kept browsers («its conversation can never come back») and REMOVES both folders, and the record writes over the file — red`, bx);
}

// ══ r3585 (the family's leftover: the list of kept browsers under the store-read law) ══
const { execFile: realExecFile } = require('node:child_process');
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10)); return f(); };
const TORN = '{"version":1,"entries":{"' + KEYS[0] + '":{"hasDir":tr';
// at the release these doors do not exist: each leg then reads its own ✗ (never a throw that ends the suite)
const hf = (S) => (S && typeof S.heldFacts === 'function' ? S.heldFacts() : null), rf = (S) => (S && typeof S.recoveredFacts === 'function' ? S.recoveredFacts() : null);
const again = async (S) => (S && S._hold ? S._hold.again() : false), stopHold = (S) => { try { if (S && S._hold) S._hold.stop(); } catch { /* its own */ } };
/** a kept list in its own data folder, the two kept browsers' folders (their sign-ins) beside it */
function keptWorld(bytes) {
  const dir = path.join(ROOT, `r${++wn}`), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true });
  const be = BE.create({ dataDir: dir, homeDir: home, serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock') });
  const file = path.resolve(path.join(dir, KB.KEPT_FILE));
  fs.writeFileSync(file, bytes);
  for (const k of KEYS) { fs.mkdirSync(be.scratchDirFor(k), { recursive: true }); fs.writeFileSync(path.join(be.scratchDirFor(k), 'Cookies'), 'a sign-in'); }
  const left = () => KEYS.filter((k) => fs.existsSync(path.join(be.scratchDirFor(k), 'Cookies'))).length;
  return { dir, be, file, left };
}
const GOOD = JSON.stringify({ version: 1, entries: Object.fromEntries(KEYS.map((k) => [k, { hasDir: true, tabs: [{ url: 'https://mail.example/' }], lastUsedAt: 1000 }])) });
const mkStore = (KS, dir, extra = {}) => KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), log: quiet, sweepEveryMs: 0, thereEveryMs: 0, ...extra });

console.log('⑤ r3585 HELD, then LIFTED WITH NO RESTART: a refused first read holds the list; its read again brings the kept browsers back, with what was noted meanwhile');
async function liftRun(KS) {
  const w = keptWorld(GOOD);
  const realRead = fs.readFileSync; let refused = 0;
  fs.readFileSync = function (p, ...a) { if (!refused && path.resolve(String(p)) === w.file) { refused++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  let S; try { S = mkStore(KS, w.dir); S.has(KEYS[0]); } finally { fs.readFileSync = realRead; }
  const held = hf(S), heldList = S.list().length;
  let fg = null; try { await S.forget(KEYS[0]); } catch (e) { fg = { code: e.code, status: e.status }; }
  S.noteStart('bk-0000c013', { hasDir: true });   // a browser that runs meanwhile (a true fact)
  await again(S);
  const after = { held: hf(S), n: S.list().length, file: Object.keys((JSON.parse(realRead(w.file, 'utf8')).entries) || {}).length };
  stopHold(S);
  return { held: held && held.code, heldList, fg, after };
}
const L5 = await liftRun(KS0);
console.log(`    facts: ${JSON.stringify(L5)}`);
ok(L5.held === 'EIO' && L5.heldList === 0 && !!L5.fg && L5.fg.code === 'kept_unread' && L5.fg.status === 503 && L5.after.held === null && L5.after.n === 3 && L5.after.file === 3,
  'the first read refused (EIO): the list is HELD (by its own code), Forget is refused by name (503 kept_unread — nothing removed); its read again off the loop LIFTS it with no restart: both kept browsers are back, and the browser noted meanwhile is kept too (written once it reads)', L5);
const L5x = await liftRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, '    onLift: (v, facts) => lifted(v, facts),\n', '    onLift: () => { },\n', 'r3585 the release: nothing lifts without a restart'), 'kept-sweep-nolift'));
console.log(`    facts (red): ${JSON.stringify(L5x)}`);
ok(L5x.after.n === 1, 'RED CONTROL (the list never lifted — the release waits for a restart): after the read answers the panel still shows only the browser noted meanwhile — red', L5x);

console.log('⑥ r3585 TORN BYTES: kept aside once, then the rows are REBUILT FROM THE FOLDERS — never «empty»: the REAL boot sweep and the REAL hourly sweep remove NO kept browser');
async function tornRun(KS, extra = {}) {
  const w = keptWorld(TORN);
  const S = mkStore(KS, w.dir, { graceMs: 0, ...extra });
  S.has(KEYS[0]);
  await until(() => !hf(S));
  const rows = S.list(), facts = rf(S);
  let doc = null; try { doc = JSON.parse(fs.readFileSync(w.file, 'utf8')); } catch { doc = null; }
  const copies = fs.readdirSync(w.dir).filter((n) => n.startsWith(KB.KEPT_FILE + '.corrupt-'));
  const boot = w.be.sweep(new Set(), { graceMs: 0 });   // THE REAL BOOT SWEEP (browser-env's own read of the file)
  const hourly = await S.sweep();                        // THE REAL HOURLY SWEEP (past the grace: graceMs 0)
  const out = { rows: rows.length, recovered: rows.filter((r) => r.recovered).length, n: facts && facts.n, copy: !!(facts && facts.copy && /^browser-kept\.json\.corrupt-/.test(facts.copy)), copies: copies.length,
    named: doc ? Object.keys(doc.entries || {}).length : null, bootRemoved: boot.swept, ended: hourly && hourly.ended, removed: hourly && hourly.removed, left: w.left() };
  stopHold(S);
  return out;
}
const T6 = await tornRun(KS0);
console.log(`    facts: ${JSON.stringify(T6)}`);
ok(T6.rows === 2 && T6.recovered === 2 && T6.n === 2 && T6.copy && T6.copies === 1 && T6.named === 2 && T6.bootRemoved === 0 && T6.ended === 0 && T6.removed === 0 && T6.left === 2,
  'torn bytes: copied aside ONCE (browser-kept.json.corrupt-…), the two kept browsers FOUND AGAIN from their folders (marked recovered; the count said), the list written with both — the boot sweep removes none, the hourly sweep past the grace ends none and removes none: both sign-ins stay', T6);
const T6x = await tornRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, '    if (!v) { rebuildFromFolders((facts && facts.setAside) || null); return; }\n', '    if (!v) { store = K.normalizeKeptStore(null); save(); changed(); return; }\n', 'r3585 the helper\'s empty start, unrebuilt'), 'kept-sweep-empty'));
console.log(`    facts (red): ${JSON.stringify(T6x)}`);
ok(T6x.left === 0 && T6x.bootRemoved === 2, 'RED CONTROL (a torn lift taken as «empty» — the helper\'s plain rule): the empty list is written, the boot sweep REMOVES both kept browsers\' folders, their sign-ins — red', T6x);

console.log('⑦ r3585 a rebuild that does NOT finish leaves the list HELD (never «rebuilt empty»); the next read again rebuilds it — no second copy');
async function unfinishedRun(KS) {
  let answer = { ok: false, why: 'made-up: the listing did not answer' }, asked = 0;
  const w = keptWorld(TORN);
  const S = mkStore(KS, w.dir, { listFolders: () => { asked++; return answer; } });
  S.has(KEYS[0]);
  // waited on the rebuild's ATTEMPT (its listing asked, then its turn settled) — never on the held state a red copy would never reach
  await until(() => asked > 0); await new Promise((r) => setTimeout(r, 30));
  const held = hf(S), same = fs.readFileSync(w.file, 'utf8') === TORN, sw = await S.sweep();
  const boot = w.be.sweep(new Set(), { graceMs: 0 });
  answer = { ok: true, dirs: KEYS.map((k) => [k, 1000]) };
  await again(S);
  await until(() => !hf(S));
  const out = { held: held && held.code, same, sweepHeld: !!(sw && sw.held), bootRemoved: boot.swept, after: S.list().filter((r) => r.recovered).length, copies: fs.readdirSync(w.dir).filter((n) => n.startsWith(KB.KEPT_FILE + '.corrupt-')).length, left: w.left() };
  stopHold(S);
  return out;
}
const U7 = await unfinishedRun(KS0);
console.log(`    facts: ${JSON.stringify(U7)}`);
ok(U7.held === 'rebuild-unfinished' && U7.same && U7.sweepHeld && U7.bootRemoved === 0 && U7.after === 2 && U7.copies === 1 && U7.left === 2,
  'the folders\' listing does not answer: the list is HELD again by the helper (rebuild-unfinished; the family\'s notice lists it), the torn file stays, the sweep waits, the boot sweep removes none; the next read again rebuilds both rows — the copy already beside it is theirs (no second copy)', U7);
const U7x = await unfinishedRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "        hold.start({ state: 'unreadable', error: { code: 'rebuild-unfinished' } });", "        store = K.normalizeKeptStore(null); save();", 'r3585 a failed rebuild written empty'), 'kept-sweep-unfinished'));
console.log(`    facts (red): ${JSON.stringify(U7x)}`);
ok(U7x.left === 0, 'RED CONTROL (a rebuild that fails writes an empty list): the boot sweep removes both kept browsers\' folders — red', U7x);

console.log('⑧ r3585 THE MODEL: a found-again row never ENDS by a silence and is never REMOVED by the size bound (only a Forget)');
{
  const Mod = require('node:module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const MSRC = fs.readFileSync(path.join(REPO, 'src/browser-kept.js'), 'utf8');
  const verdict = (M) => M.keptEndVerdict({ entry: { browserKey: KEYS[0], recovered: 5, stoppedAt: 1 }, live: false, carried: false, bound: false, now: 10 * 3600e3, graceMs: 3600e3 });
  const plan = (M) => M.keptRetentionPlan({ entries: [{ key: KEYS[0], bytes: 50 * M.MB, cacheBytes: 0, lastUsedAt: 1, live: false, carried: false, recovered: true }], perConversation: 100 * M.MB, total: M.MB });
  const v = verdict(KB), pl = plan(KB);
  const V0 = asModule('src/browser-kept.js', anchored(MSRC, "  if (entry.recovered) return { end: false, why: 'recovered' };", '', 'r3585 no recovered guard'));
  const P0 = asModule('src/browser-kept.js', anchored(MSRC, "      if (e.recovered) { kept.push(", "      if (false) { kept.push(", 'r3585 no recovered bound guard'));
  const v0 = verdict(V0), pl0 = plan(P0);
  ok(v.end === false && v.why === 'recovered' && pl.remove.length === 0 && v0.end === true && pl0.remove.length === 1, 'a found-again row ten hours past the grace with no binding: never ended (why recovered); over the total bound: kept, reported — RED: the model without the two guards ends it and removes it', { v, remove: pl.remove.length, red: { v0, remove0: pl0.remove.length } });
}

console.log('⑨ r3585 the rebuild\'s folder listing runs in a CHILD with a bound — no folder read on the hub\'s loop');
{
  const w = keptWorld(TORN);
  const calls = [], PDIR = path.resolve(path.join(w.dir, 'browser-profiles'));
  const realDir = fs.readdirSync; let inLoop = 0;
  fs.readdirSync = function (p, ...a) { if (path.resolve(String(p)) === PDIR) inLoop++; return realDir.call(this, p, ...a); };
  let S;
  try {
    S = mkStore(KS0, w.dir, { execFileImpl: (cmd, args, opts, cb) => { calls.push({ cmd, e: args[0], timeout: opts && opts.timeout }); return realExecFile(cmd, args, opts, cb); } });
    S.has(KEYS[0]);
    await until(() => !hf(S));
  } finally { fs.readdirSync = realDir; }
  const child = calls.find((c) => c.cmd === process.execPath && c.e === '-e');
  ok(!!child && child.timeout > 0 && inLoop === 0 && S.list().filter((r) => r.recovered).length === 2, 'the listing is ONE child (node -e) with a timeout; the hub\'s own process reads no folder of data/browser-profiles for it', { child, inLoop });
  stopHold(S);
}

console.log('⑩ r3585 the person\'s page and the routes say the hold (each by its lines, with a red copy)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const TV = src('src/lib/browser-trace-view.js'), RB = src('src/routes/browser.js'), BT = src('src/server/browser-trace.js'), UT = src('src/lib/utils.js'), HW = src('src/lib/held-lists-words.js');
  const H1 = "    if (v.keptUnread) keptSec.appendChild(el('div', 'bprof-empty chat-status-dim', t('VibeSpace cannot read its list of kept browsers right now, so none is shown here.";
  const panel = (x) => x.includes(H1) && x.includes("    if (!v.keptUnread && !krows.length) keptSec.appendChild(");
  ok(panel(TV) && !panel(anchored(TV, "    if (!v.keptUnread && !krows.length) keptSec.appendChild(", "    if (!krows.length) keptSec.appendChild(", 'r3585 the panel as it was')), 'the Agent browser panel while the list is held: its held words, never «None — no conversation\'s browser has stopped…» (RED: the panel as it was)', null);   // stale-pins: kept (the red copy writes the line as it was)
  const H2 = "    if (k.recovered) { const c = el('span', 'bprof-chip', t('found again'));";
  ok(TV.includes(H2) && TV.includes("    else if (!k.live && !(k.recovered && !k.conversationKnown)) row.appendChild(") && TV.includes("t('The list of kept browsers was damaged: {n} kept browser(s) were found again from their folders, without their tabs. The damaged copy is kept as {copy}.'"), 'a found-again row says so (its chip); one no conversation names offers no Resume at all (no dead hint); the section says the count and the copy\'s name', null);
  const H3 = "...(keptUnread ? { keptUnread } : {}), ...(keptRecovered ? { keptRecovered } : {}), ";
  ok(BT.includes(H3) && !anchored(BT, H3, '', 'r3585 the view as it was').includes(H3), 'the panel\'s one read carries the hold and the rebuild\'s count (RED: the view as it was)', null);
  const KP = src('src/server/browser-keeper.js');
  const H4 = "    if (!reconnect && ks && typeof ks.heldFacts === 'function' && ks.heldFacts()) throw namedError('kept_unread', `Resume: ${ks.heldWords()}`, { status: 503 });\n";
  const resumeGuard = (x) => { const r = x.indexOf('    const reconnect = who === \'user\''), g = x.indexOf(H4); return r >= 0 && g > r && g < x.indexOf('    let entry0 = null; try { entry0 = ks ? ks.get(bk) : null; }', r); };   // the NEXT entry0 read after the reconnect (the keeper has two)
  ok(resumeGuard(KP) && !resumeGuard(anchored(KP, H4, '', 'r3585 the resume as it was')) && RB.includes("  kept_unread: 503,") && RB.includes("...(h ? { unread: ks.heldWords(), code: 'kept_unread' } : {})"), 'Resume of a STOPPED browser — the person\'s and the agent\'s — refused by name while held (503 kept_unread), never «nothing kept»; a reconnect of a running one passes; the list says its hold; the status row (RED: the resume as it was)', null);
  ok(/\n  kept_unread: \(\) => t\('VibeSpace cannot read its list of kept browsers right now/.test(UT) && HW.includes("'browser-kept.json': i18nKey('the list of kept browsers'),"), 'r3488: the unit carries its rows — the page\'s held words (kept_unread) and the list\'s plain name on the family\'s notice', null);
}

// ══ r3585 commit 2: the bindings under the store-read law (a failed or torn read engages ONE hold; a torn lift rebuilt from the records) ══
const BBm = BB0;
/** a data folder with the bindings file, the kept browsers and (optionally) the conversations' records */
function bindWorld({ metas = [], bytes = null } = {}) {
  const dir = path.join(ROOT, `n${++wn}`);
  fs.mkdirSync(path.join(dir, 'browser-env'), { recursive: true }); fs.mkdirSync(path.join(dir, 'session-meta'), { recursive: true });
  const bfile = path.join(dir, 'browser-env', 'bindings.json');
  if (bytes !== null) fs.writeFileSync(bfile, bytes);
  metas.forEach((m, i) => fs.writeFileSync(path.join(dir, 'session-meta', `sess-madeup-${i}.json`), JSON.stringify(m)));
  return { dir, bfile };
}
const hb = (bb) => (bb && typeof bb.heldFacts === 'function' ? bb.heldFacts() : null), hbHold = (bb) => (bb && typeof bb._hold === 'function' ? bb._hold() : null);

console.log('⑪ r3585 the bindings\' read REFUSED: ONE hold engaged (no further read of that file on the hub\'s loop); read again off the loop and LIFTED with no restart');
async function bindHeldRun(BBmod) {
  const w = bindWorld({ bytes: JSON.stringify({ v: 1, byConversation: { [CONVS[0]]: { key: KEYS[0], at: 1 }, [CONVS[1]]: { key: KEYS[1], at: 1 } } }) });
  const bb = BBmod.create({ dataDir: w.dir, log: quiet });
  const realRead = fs.readFileSync; let reads = 0, refuse = true;
  fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === path.resolve(w.bfile)) { reads++; if (refuse) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  let first = null, more = 0, rec = null, held = null;
  try {
    try { bb.boundKeys(); } catch (e) { first = e.code; }
    const r0 = reads;
    for (let i = 0; i < 5; i++) { try { bb.boundKeys(); } catch { /* unknown */ } bb.lookup(CONVS[0]); bb.keys(); }
    more = reads - r0; rec = bb.record(CONVS[0], KEYS[0]); held = hb(bb);
    refuse = false;
  } finally { fs.readFileSync = realRead; }
  const h = hbHold(bb); if (h) await h.again();
  let after = null; try { after = [...bb.boundKeys()].length; } catch (e) { after = e.code; }
  if (h) h.stop();
  return { first, more, rec, held: held && held.code, after };
}
const B11 = await bindHeldRun(BBm);
console.log(`    facts: ${JSON.stringify(B11)}`);
ok(B11.first === 'bindings_unknown' && B11.more === 0 && B11.rec === false && B11.held === 'EIO' && B11.after === 2,
  'the bindings\' read refused (EIO): unknown (r3054 — nothing ends), ONE hold for the file (EIO), fifteen later calls read the file NO more on the loop, a record writes nothing; its read again off the loop LIFTS it with no restart — both bindings back', B11);
const BBS1 = fs.readFileSync(path.join(REPO, 'src/server/browser-bindings.js'), 'utf8');
const B11x = await bindHeldRun(MUT.load('src/server/browser-bindings.js', anchored(BBS1, "    { const H = HELD.get(file); if (H && (H.hold.held() || H.rebuilding)) return { state: 'unknown', kind: H.hold.held() ? String(H.hold.held().code) : 'rebuilding' }; }\n", '', 'r3585 the release: every call reads the failing file again'), 'kept-sweep-bind-reads'));
console.log(`    facts (red): ${JSON.stringify(B11x)}`);
ok(B11x.more >= 15, 'RED CONTROL (the release: every call reads the failing file again on the loop) — fifteen more reads of a storage that does not answer — red', B11x);

console.log('⑫ r3585 TORN bindings: kept aside once, REBUILT from the conversations\' own records; r3590\'s per-row rule — a kept browser that STOOD at the recovery and that no binding names never ends by that silence; one kept after it is ordinary');
const STOOD = 'bk-0000d014', LATER = 'bk-0000e015';
async function bindTornRun(BBmod, KSmod) {
  let clock = 2_000_000;
  const w = bindWorld({ bytes: '{"v":1,"byConversation":{"' + CONVS[0] + '":{"key":"bk-00', metas: [
    { browserKey: KEYS[0], claudeSessionId: CONVS[0], browserKeyFor: CONVS[0] },
    { browserKey: KEYS[1], claudeSessionId: CONVS[1], browserKeyFor: CONVS[1] },
    { browserKey: 'bk-0000f016', claudeSessionId: 'c-ffff6666-0000-4000-8000-000000000006', forkSourceId: 'c-ffff6666-0000-4000-8000-000000000006' },   // a fork source: binds nothing
  ] });
  const bb = BBmod.create({ dataDir: w.dir, log: quiet });
  const S = KSmod.create({ dataDir: w.dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  for (const k of [...KEYS, STOOD]) { S.noteStart(k, { hasDir: true }); fs.mkdirSync(S.dirOf(k), { recursive: true }); fs.writeFileSync(path.join(S.dirOf(k), 'Cookies'), 'a sign-in'); S.noteStop(k, { why: 'idle' }); }
  try { bb.boundKeys(); } catch { /* the torn read engages the hold */ }
  await until(() => !hb(bb) && !!(bb.recoveredFacts && bb.recoveredFacts()));
  const rec = bb.recoveredFacts ? bb.recoveredFacts() : null;
  // a kept browser started AFTER the recovery, its binding never written (a made-up loss): ordinary — it ends after its grace
  clock = Date.now() + 1000;
  S.noteStart(LATER, { hasDir: true }); fs.mkdirSync(S.dirOf(LATER), { recursive: true }); fs.writeFileSync(path.join(S.dirOf(LATER), 'Cookies'), 'a sign-in'); S.noteStop(LATER, { why: 'idle' });
  clock += 3 * 3600e3;   // three hours later: all four stopped far past the grace
  const sw = await S.sweep();
  const row = (k) => S.list().find((r) => r.browserKey === k) || null;
  const out = { rebuilt: rec && rec.n, copy: !!(rec && rec.copy), bound: (() => { try { return [...bb.boundKeys()].sort().join(','); } catch (e) { return e.code; } })(),
    stoodKept: S.has(STOOD), stoodSays: !!(row(STOOD) && row(STOOD).unnamedSinceDamage), laterEnded: !S.has(LATER), keptBound: KEYS.every((k) => S.has(k)), ended: sw && sw.ended };
  try { S.shutdown(); } catch { /* its own */ }
  return out;
}
const B12 = await bindTornRun(BBm, KS0);
console.log(`    facts: ${JSON.stringify(B12)}`);
ok(B12.rebuilt === 2 && B12.copy && B12.bound === [...KEYS].sort().join(',') && B12.stoodKept && B12.stoodSays && B12.keptBound && B12.laterEnded && B12.ended === 1,
  'torn bindings: kept aside once, REBUILT from the two conversations\' records (the fork source binds nothing): both kept browsers bound again; the one that stood at the recovery with no record is NOT ended (its row says «no conversation names it since the bindings were damaged»); the one kept after the recovery with no binding ends as ordinary', B12);
const KM = fs.readFileSync(path.join(REPO, 'src/browser-kept.js'), 'utf8');
{
  const Mod = require('node:module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const V = (M) => M.keptEndVerdict({ entry: { browserKey: STOOD, startedAt: 1000, stoppedAt: 2000 }, bound: false, now: 10 * 3600e3, graceMs: 3600e3, bindingsRecoveredAt: 5000 });
  const V2 = (M) => M.keptEndVerdict({ entry: { browserKey: LATER, startedAt: 6000, stoppedAt: 7000 }, bound: false, now: 10 * 3600e3, graceMs: 3600e3, bindingsRecoveredAt: 5000 });
  const M0 = asModule('src/browser-kept.js', anchored(KM, "  if (Number(bindingsRecoveredAt) > 0 && (Number(entry.startedAt) || Number(entry.lastUsedAt) || 0) < Number(bindingsRecoveredAt)) return { end: false, why: 'bindings-recovered' };\n", '', 'r3590 no per-row rule'));
  ok(V(KB).why === 'bindings-recovered' && V2(KB).end === true && V(M0).end === true, 'THE MODEL (r3590): stood at the recovery ⇒ never ended by the silence; kept after it ⇒ ordinary — RED: the model without the rule ends the one that stood', { stood: V(KB), later: V2(KB), red: V(M0) });
}

console.log('⑬ r3585 a bindings rebuild that does NOT finish leaves the file HELD — nothing ends; the next read again rebuilds it');
{
  let answer = { ok: false, why: 'made-up: the records did not answer' };
  const w = bindWorld({ bytes: '{"v":1,"byConversation":{"x' });
  const bb = BBm.create({ dataDir: w.dir, log: quiet, listMetas: () => answer });
  try { bb.boundKeys(); } catch { /* torn */ }
  await until(() => !!hb(bb) && hb(bb).code === 'rebuild-unfinished');
  const held = hb(bb), same = fs.readFileSync(w.bfile, 'utf8') === '{"v":1,"byConversation":{"x';
  let ends = null; try { bb.boundKeys(); ends = 'answered'; } catch (e) { ends = e.code; }
  answer = { ok: true, rows: [[KEYS[0], CONVS[0], '', '', CONVS[0], 1000]] };
  const h = hbHold(bb); if (h) await h.again();
  await until(() => !hb(bb));
  let after = null; try { after = [...bb.boundKeys()].join(','); } catch (e) { after = e.code; }
  ok(!!held && held.code === 'rebuild-unfinished' && same && ends === 'bindings_unknown' && after === KEYS[0], 'the records\' listing does not answer: HELD again (rebuild-unfinished), the torn file left as it is, the sweep\'s read answers unknown (nothing ends); the next read again rebuilds it', { held, same, ends, after });
  if (h) h.stop();
}

console.log('⑭ r3585 the bindings\' rebuild reads the records in a CHILD with a bound — none on the hub\'s loop');
{
  const w = bindWorld({ bytes: '{"v":1,"byConversation":{"y', metas: [{ browserKey: KEYS[0], claudeSessionId: CONVS[0], browserKeyFor: CONVS[0] }] });
  const calls = [], MDIR = path.resolve(path.join(w.dir, 'session-meta'));
  const realDir = fs.readdirSync; let inLoop = 0;
  fs.readdirSync = function (p, ...a) { if (path.resolve(String(p)) === MDIR) inLoop++; return realDir.call(this, p, ...a); };
  let bb;
  try {
    bb = BBm.create({ dataDir: w.dir, log: quiet, execFileImpl: (cmd, args, opts, cb) => { calls.push({ cmd, e: args[0], timeout: opts && opts.timeout }); return realExecFile(cmd, args, opts, cb); } });
    try { bb.boundKeys(); } catch { /* torn */ }
    await until(() => !hb(bb) && !!(bb.recoveredFacts && bb.recoveredFacts()));
  } finally { fs.readdirSync = realDir; }
  const child = calls.find((c) => c.cmd === process.execPath && c.e === '-e');
  ok(!!child && child.timeout > 0 && inLoop === 0 && !!(bb.recoveredFacts && bb.recoveredFacts() && bb.recoveredFacts().n === 1), 'the records are read by ONE child (node -e) with a timeout; the hub\'s own process lists none of data/session-meta for it', { child, inLoop });
}

console.log('⑮ r3585 the panel and the words say the bindings\' hold (each by its lines)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const TV = src('src/lib/browser-trace-view.js'), UT = src('src/lib/utils.js'), HW = src('src/lib/held-lists-words.js'), BT = src('src/server/browser-trace.js');
  const R1 = "    } else if (!k.live && k.unnamedSinceDamage) row.appendChild(el('span', 'bprof-cell bprof-kept-unnamed chat-status-dim', t('no conversation names it since the bindings were damaged')));";
  const rowSays = (x) => x.includes(R1) && x.indexOf(R1) < x.indexOf("    else if (!k.live && !(k.recovered && !k.conversationKnown)) row.appendChild(");
  ok(rowSays(TV) && !rowSays(anchored(TV, R1 + '   // r3590: its fact, and no Resume where no conversation can open it\n', '', 'r3590 the row as it was')), 'a kept browser no conversation names since the bindings were damaged says so, and offers no Resume hint (RED: the row as it was)', null);
  ok(TV.includes("    if (v.bindingsUnread) keptSec.appendChild(") && BT.includes("...(bindingsUnread ? { bindingsUnread } : {}), ...(bindingsRecovered ? { bindingsRecovered } : {}), "), 'the panel says the bindings\' hold and their rebuild (the view carries both)', null);
  ok(/\n  bindings_unread: \(\) => t\('VibeSpace cannot read which browser belongs to which conversation right now/.test(UT) && HW.includes("'bindings.json': i18nKey('which browser belongs to which conversation'),"), 'r3488: the page\'s held words (bindings_unread) and the list\'s plain name on the family\'s notice', null);
}

report();
