#!/usr/bin/env node
// THE SWEEP'S FAIL-CLOSED LAW (lane bl-windows, 主开发 r3006 — for 2.369.416): a kept browsers' store whose read FAILED at a start is
// never «empty» to the boot sweep. The release SET the unreadable data/browser-kept.json ASIDE: the file became «not there», browser-env's
// own read (keptKeySet) answered an EMPTY set, and the boot sweep removed — recursively — every kept browser's profile folder, its
// sign-ins. ONE leg, the refusal PLACED (the store's first read at the start refused, EIO — never a real mount, never a mode change): the
// real kept store loads, the REAL boot sweep (browser-env's sweep) runs over stand-in profile folders — ZERO removed — and a kept browser
// noted after it writes nothing over the file. RED: the release's load (the rename) — the folders gone. ② the same over TORN bytes
// (both reads fail to parse). ③ r3023: a MINT while the store cannot be read takes its first candidate (the kept rule names nothing
// unknown) — RED: the line before it, 64 tries and 64 walks of every conversation's meta.
// r3786 (主开发, line 821's second form — LAW 5: the fact lives with the folder): a kept browser's folder holds its NOTE (its key, its
// conversation, its first time — src/server/browser-kept-note.js), written by the start's gate; every start and lift reconciles from the
// notes. ⑧ ⑫ ⑮–⑱ moved to that form (the owed offers, the stood set and the recovery mark are gone); ㉑–㉚ are the nine holds and the
// boot sweep's three rules, each through fresh instances over the same data where a restart is the point, each with its red.
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
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [], list: () => ({ profiles: [] }) });   // r3786: the keeper's new door (its registered folders) carried
const KNM = require(path.join(REPO, 'src/server/browser-kept-note.js'));
const KNSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-kept-note.js'), 'utf8');
const BF = require(path.join(REPO, 'src/browser-fact.js'));
const NOTE = '.vibespace-kept.json';
let keyN = 0;
/** r3786: a key no other leg decides (the choke point's memory of which conversation a key was decided for is the process's) */
const freshKey = () => 'bk-' + (0x00a00000 + (keyN++)).toString(16).padStart(8, '0');
let convN = 0;
const freshConv = () => `c-${(0x10000000 + (convN++)).toString(16)}-0000-4000-8000-000000000099`;
/** r3786: a red copy of the note module and a kept store whose KN is that copy → { KN, KS } */
const overKN = (knSrc, tag, storeSrc = KSRC) => { const kn = MUT.write('src/server/browser-kept-note.js', knSrc, tag + '-kn'); return { KN: require(kn), KS: MUT.load('src/server/browser-kept.js', anchored(storeSrc, "const KN = require('./browser-kept-note.js');", `const KN = require(${JSON.stringify(kn)});`, 'the store over the copy'), tag + '-store') }; };
/** r3786: THE SAME DATA FOLDER's bytes for FRESH instances (a restart): copied to a new path, so no memory this process keeps of the old
 *  path (a hold engaged on its bindings, a lift's listeners) can reach them */
const restartCopy = (dir) => { const to = path.join(ROOT, `x${++wn}`); fs.cpSync(dir, to, { recursive: true }); return to; };
const noteOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, NOTE), 'utf8')); } catch { return null; } };

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
  const res = { how, refusedN, ended: sw ? (sw.held ? 0 : sw.ended) : null, waited: !!(sw && sw.held), removed: KEYS.length - left, kept: KEYS.filter((k) => S.has(k)).length, recorded: rec, same: realRead(bfile, 'utf8') === bytes, copyKept };
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
const T6x = await tornRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "    if (!v) { Promise.resolve(rebuildFromFolders((facts && facts.setAside) || null)).then((ok) => { if (ok) reconcile('lift').catch(() => { }); }, () => { }); return; }", '    if (!v) { store = K.normalizeKeptStore(null); save(); changed(); return; }', 'r3585 the helper\'s empty start, unrebuilt'), 'kept-sweep-empty'));
console.log(`    facts (red): ${JSON.stringify(T6x)}`);
ok(T6x.left === 0 && T6x.bootRemoved === 2, 'RED CONTROL (a torn lift taken as «empty» — the helper\'s plain rule): the empty list is written, the boot sweep REMOVES both kept browsers\' folders, their sign-ins — red', T6x);

console.log('⑦ r3585 a rebuild that does NOT finish leaves the list HELD (never «rebuilt empty»); the next read again rebuilds it — no second copy');
async function unfinishedRun(KS) {
  let answer = { ok: false, why: 'made-up: the listing did not answer' }, asked = 0;
  const w = keptWorld(TORN);
  const S = mkStore(KS, w.dir, { listFolders: () => { asked++; return answer; } });
  S.has(KEYS[0]);
  // waited on the rebuild's ATTEMPT (its listing asked, then its turn settled) — never on the held state a red copy would never reach
  await until(() => asked > 0); await until(() => !!hf(S) || fs.readFileSync(w.file, 'utf8') !== TORN, 3000);   // r3961: the attempt's own end (held again, or the red copy's write) — no fixed sleep
  const held = hf(S), same = fs.readFileSync(w.file, 'utf8') === TORN, sw = await S.sweep();
  const boot = w.be.sweep(new Set(), { graceMs: 0 });
  answer = { ok: true, dirs: KEYS.map((k) => ({ name: k, mtimeMs: 1000, id: null, note: 'none', doc: null })), regs: [] };   // r3786: the listing's answer (the folders, their notes, the registered folders)
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

console.log('⑧ r3786 THE MODEL: a found-again row never ENDS by a silence and is OUTSIDE the bound (out of its sum and its order — LAW 3); a row NOT MEASURED is spared and left out of the sum while the measured ordinary rows are still bounded');
{
  const Mod = require('node:module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const MSRC = fs.readFileSync(path.join(REPO, 'src/browser-kept.js'), 'utf8');
  const verdict = (M) => M.keptEndVerdict({ entry: { browserKey: KEYS[0], recovered: 5, stoppedAt: 1 }, live: false, carried: false, bound: false, now: 10 * 3600e3, graceMs: 3600e3 });
  // LAW 3 (the attack's MUST C): a 9 GB found-again row beside two 1 MB ordinary rows under a 5 MB total — the ordinary rows fit
  const l3 = (M) => M.keptRetentionPlan({ entries: [{ key: KEYS[0], bytes: 9000 * M.MB, cacheBytes: 0, lastUsedAt: 1, recovered: true }, { key: KEYS[1], bytes: M.MB, cacheBytes: 0, lastUsedAt: 2 }, { key: 'bk-0000c013', bytes: M.MB, cacheBytes: 0, lastUsedAt: 3 }], perConversation: 100000 * M.MB, total: 5 * M.MB });
  // THE UNMEASURED-ROW RULE: the oldest row not measured (null) beside two measured 3 MB rows under a 4 MB total
  const um = (M) => M.keptRetentionPlan({ entries: [{ key: KEYS[0], bytes: null, cacheBytes: 0, lastUsedAt: 1 }, { key: KEYS[1], bytes: 3 * M.MB, cacheBytes: 0, lastUsedAt: 2 }, { key: 'bk-0000c013', bytes: 3 * M.MB, cacheBytes: 0, lastUsedAt: 3 }], perConversation: 100000 * M.MB, total: 4 * M.MB });
  const V0 = asModule('src/browser-kept.js', anchored(MSRC, "  if (entry.recovered) return { end: false, why: 'recovered' };", '', 'r3585 no recovered guard'));
  // the r3717 plan: the found-again row INSIDE the sum, only skipped in the order (the attack's MUST C)
  const A2 = "      if (e.carried) { kept.push({ key: e.key, used: est.get(e.key) || 0, overBy: used - total, why: 'its conversation is running";
  const P0 = asModule('src/browser-kept.js', anchored(anchored(MSRC, '    if (e.recovered) { outside++; continue; }', '    if (false) { outside++; continue; }', 'r3786 a found-again row inside the sum'), A2, "      if (e.recovered) { kept.push({ key: e.key, used: 0, overBy: 0, why: 'found again (the r3717 plan)' }); continue; }\n" + A2, 'r3717 skipped in the order only'));
  const U0 = asModule('src/browser-kept.js', anchored(MSRC, '{ unmeasured.push(e.key); continue; }   // spared, out of the sum', '{ unmeasured.push(e.key); }', 'r3786 an unmeasured row counted as nothing'));
  const v = verdict(KB), v0 = verdict(V0), a = l3(KB), a0 = l3(P0), u = um(KB), u0 = um(U0);
  ok(v.end === false && v.why === 'recovered' && v0.end === true, 'a found-again row ten hours past the grace with no binding: never ended (why recovered) — RED: the model without the guard ends it', { v, v0 });
  ok(a.remove.length === 0 && a.used === 2 * KB.MB && a.outside === 1 && a0.remove.some((r) => r.key === 'bk-0000c013'), 'LAW 3: the found-again row is OUTSIDE the bound — out of the sum (2 MB counted, not 9 GB) and the order: the two ordinary rows fit and stay — RED: inside the sum it fills the total and the bound removes the ordinary rows, the newest among them', { a, red: a0.remove });
  ok(u.unmeasured.includes(KEYS[0]) && u.remove.length === 1 && u.remove[0].key === KEYS[1] && u.used === 3 * KB.MB && u0.remove.some((r) => r.key === KEYS[0]), 'THE UNMEASURED-ROW RULE: the row not measured is spared and left out of the sum; the measured ordinary rows are still bounded (the older one goes) — RED: counted as nothing it is the oldest and the bound removes it', { u, red: u0.remove });
}

console.log('⑨ r3585 / r3786 (hold 9): the folders and their notes are listed by ONE CHILD — bounded in time and in output, the ALLOWLISTED environment (src/agent-env.js serviceEnv), ended only by its own starter — no folder read on the hub\'s loop');
async function childRun(KS) {
  const w = keptWorld(TORN);
  const calls = [], PDIR = path.resolve(path.join(w.dir, 'browser-profiles'));
  const realDir = fs.readdirSync; let inLoop = 0;
  process.env.VS_LEG_MADEUP_TOKEN = 'vsst_s1';   // a secret-shaped name in the hub's environment: never the child's
  fs.readdirSync = function (p, ...a) { if (path.resolve(String(p)) === PDIR) inLoop++; return realDir.call(this, p, ...a); };
  let S;
  try {
    S = mkStore(KS, w.dir, { listExec: (cmd, args, opts, cb) => { calls.push({ cmd, e: args[0], opts }); return realExecFile(cmd, args, opts, cb); } });
    S.has(KEYS[0]);
    await until(() => !hf(S));
  } finally { fs.readdirSync = realDir; delete process.env.VS_LEG_MADEUP_TOKEN; }
  const child = calls.find((c) => c.cmd === process.execPath && c.e === '-e');
  const o = (child && child.opts) || {};
  const allow = new Set(Object.keys(require(path.join(REPO, 'src/agent-env.js')).serviceEnv({ ...process.env, VS_LEG_MADEUP_TOKEN: 'x' })));
  const out = { child: !!child, timeout: o.timeout, kill: o.killSignal, maxBuffer: o.maxBuffer, env: o.env ? Object.keys(o.env).every((k) => allow.has(k)) && !('VS_LEG_MADEUP_TOKEN' in o.env) : 'the hub\'s whole environment', inLoop, found: S.list().filter((r) => r.recovered).length };
  stopHold(S);
  return out;
}
const C9 = await childRun(KS0);
console.log(`    facts: ${JSON.stringify(C9)}`);
ok(C9.child && C9.timeout > 0 && C9.kill === 'SIGKILL' && C9.maxBuffer > 0 && C9.env === true && C9.inLoop === 0 && C9.found === 2, 'the listing is ONE child (node -e): its time bound ends it with SIGKILL through its own execFile (its starter — never a signal by a pid), its pipe is bounded, its environment the allowlist only (the hub\'s made-up token never reaches it); the hub\'s own process reads no folder of data/browser-profiles for it', C9);
const C9x = await childRun(overKN(anchored(KNSRC, "env: require('../agent-env.js').serviceEnv(process.env), ", '', 'r3786 the child with no env of its own'), 'kept-sweep-child-env').KS);
ok(C9x.env !== true, 'RED CONTROL (the child started with no env: it inherits the hub\'s whole environment, the made-up token with it) — red', C9x);

console.log('⑩ r3585 the person\'s page and the routes say the hold (each by its lines, with a red copy)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const TV = src('src/lib/browser-trace-view.js'), RB = src('src/routes/browser.js'), BT = src('src/server/browser-trace.js'), UT = src('src/lib/utils.js'), HW = src('src/lib/held-lists-words.js');
  const H1 = "    if (v.keptUnread) keptSec.appendChild(el('div', 'bprof-empty chat-status-dim', krows.length ? t('VibeSpace cannot read its list of kept browsers right now, so only the browsers used since are shown here.";
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

console.log('⑫ r3786 TORN bindings at a START (fresh bindings, a fresh store over the same data): rebuilt from the conversations\' records; a conversation with NO record (it ended) gets its binding MADE AGAIN from its folder\'s NOTE — not ended; a folder with no note that no binding names ends as ordinary');
async function bindTornRun(KSmod) {
  let clock = 2_000_000;
  const STOOD = freshKey(), LATER = freshKey(), CSTOOD = freshConv();
  const w = bindWorld({ metas: [
    { browserKey: KEYS[0], claudeSessionId: CONVS[0], browserKeyFor: CONVS[0] },
    { browserKey: KEYS[1], claudeSessionId: CONVS[1], browserKeyFor: CONVS[1] },
    { browserKey: 'bk-0000f016', claudeSessionId: 'c-ffff6666-0000-4000-8000-000000000006', forkSourceId: 'c-ffff6666-0000-4000-8000-000000000006' },   // a fork source: binds nothing
  ] });
  // THE RUN BEFORE: every kept browser bound, each one's START writing its folder's note through the real gate — LATER's folder predates the note
  const bb0 = BB0.create({ dataDir: w.dir, log: quiet });
  [[CONVS[0], KEYS[0]], [CONVS[1], KEYS[1]], [CSTOOD, STOOD]].forEach(([c, k]) => bb0.record(c, k, { at: clock }));
  const S0 = KSmod.create({ dataDir: w.dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb0, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  for (const k of [...KEYS, STOOD, LATER]) { fs.mkdirSync(S0.dirOf(k), { recursive: true }); if (k !== LATER) await S0.startGate(k); S0.noteStart(k, { hasDir: true }); fs.writeFileSync(path.join(S0.dirOf(k), 'Cookies'), 'a sign-in'); S0.noteStop(k, { why: 'idle' }); }
  S0.shutdown();
  // THE DAMAGE, then A START: the bindings file torn; fresh bindings and a fresh store over the same data
  const dir = restartCopy(w.dir), bfile = path.join(dir, 'browser-env', 'bindings.json');
  fs.writeFileSync(bfile, '{"v":1,"byConversation":{"' + CONVS[0] + '":{"key":"bk-00');
  clock += 3 * 3600e3;
  const bb = BB0.create({ dataDir: dir, log: quiet });
  const S = KSmod.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  try { bb.boundKeys(); } catch { /* the torn read engages the hold: rebuilt from the records, then the lift reconciles from the notes */ }
  await until(() => !hb(bb) && !!(bb.recoveredFacts && bb.recoveredFacts()));
  await until(() => S._reconcileState() === 'done', 3000);
  const sw = await S.sweep();
  const bound = (() => { try { return [...bb.boundKeys()].sort().join(','); } catch (e) { return e.code; } })();
  const out = { rebuilt: (bb.recoveredFacts() || {}).n, bound: bound === [...KEYS, STOOD].sort().join(','), stoodKept: S.has(STOOD) && fs.existsSync(path.join(S.dirOf(STOOD), 'Cookies')), laterEnded: !S.has(LATER), keptBound: KEYS.every((k) => S.has(k)), ended: sw && sw.ended };
  try { S.shutdown(); } catch { /* its own */ }
  return out;
}
const B12 = await bindTornRun(KS0);
console.log(`    facts: ${JSON.stringify(B12)}`);
ok(B12.rebuilt === 2 && B12.bound && B12.stoodKept && B12.keptBound && B12.laterEnded && B12.ended === 1, 'torn bindings at a start: rebuilt from the two records (a fork source binds nothing); the conversation with NO record gets its binding made again from its folder\'s note — kept three hours past the grace, its sign-in on disk; the folder with no note that no binding names ends as ordinary', B12);
const B12x = await bindTornRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "        b = bb && typeof bb.restoreFromNotes === 'function' ? bb.restoreFromNotes(pairs, { at: now(), protect: new Set(pairs.map((x) => x[1])) }) : { unknown: true };", '        b = { made: 0, movedOn: 0, taken: 0 };', 'r3786 no binding made again from a note'), 'kept-sweep-no-restore'));
console.log(`    facts (red): ${JSON.stringify(B12x)}`);
ok(!B12x.stoodKept && B12x.ended === 2, 'RED CONTROL (the reconcile without its bindings half): the conversation whose record is gone is never bound again — its kept browser ENDS with its folder — red', B12x);

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

console.log('⑮ r3585 / r3786 the panel and the words: the bindings\' hold; «not measured» with its age; the found-again browsers outside the limit; a start not kept (each by its lines)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const TV = src('src/lib/browser-trace-view.js'), UT = src('src/lib/utils.js'), HW = src('src/lib/held-lists-words.js'), BT = src('src/server/browser-trace.js'), ZH = src('src/lib/i18n-zh.js'), JA = src('src/lib/i18n-ja.js');
  const NM = "Number(k.unmeasuredSince) > 0 ? t('not measured since {ago}', { ago: agoText(Date.now() - Number(k.unmeasuredSince)) })";
  const OUT = "t('{n} kept browser(s) found again from their folders are kept outside the limit until you Forget them', { n: nOut })";
  const NK = "    if (k.notKept) { const c = el('span', 'bprof-chip', t('not kept'));";
  const said = (line) => TV.includes(line) && !anchored(TV, line, '', 'r3786 the panel without it').includes(line);
  ok(said(NM) && said(OUT) && said(NK), 'the Agent browser panel says «not measured since …» (its age) in the size cell, that the found-again browsers are kept outside the limit until a Forget (LAW 3), and a start not kept by its chip (each line with a red copy)', null);
  const keys = ['not measured since {ago}', '{n} kept browser(s) found again from their folders are kept outside the limit until you Forget them', 'not kept', 'Not kept: its sign-ins end with it — the note that keeps them could not be written in its folder', 'Not kept: its sign-ins end with it — VibeSpace had not finished reading its kept browsers when it was handed'];
  ok(keys.every((k) => ZH.includes(JSON.stringify(k) + ':') && JA.includes(JSON.stringify(k) + ':')), 'every new line has its zh and ja words', keys.filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':')));
  ok(!TV.includes('k.unnamedSinceDamage') && !ZH.includes('"no conversation names it since the bindings were damaged"'), 'the stood set is gone: no row says «no conversation names it since the bindings were damaged» any more (its fact is a folder\'s note now)', null);   // stale-pins: kept (a deliberate absence check)
  ok(TV.includes("    if (v.bindingsUnread) keptSec.appendChild(") && BT.includes("...(bindingsUnread ? { bindingsUnread } : {}), ...(bindingsRecovered ? { bindingsRecovered } : {}), "), 'the panel says the bindings\' hold and their rebuild (the view carries both)', null);
  ok(/\n  bindings_unread: \(\) => t\('VibeSpace cannot read which browser belongs to which conversation right now/.test(UT) && HW.includes("'bindings.json': i18nKey('which browser belongs to which conversation'),"), 'r3488: the page\'s held words (bindings_unread) and the list\'s plain name on the family\'s notice', null);
}

// ══ r3717 (the round wf_2898fc6f-004's two musts, the two rulings and the shoulds) ══
const KSRC3 = fs.readFileSync(path.join(REPO, 'src/server/browser-kept.js'), 'utf8');
const BBS3 = fs.readFileSync(path.join(REPO, 'src/server/browser-bindings.js'), 'utf8');
/** a stand-in `du` that says every kept folder is 9 GB (the total bound passed by far); any other program runs for real */
const bigDu = (cmd, args, opts, cb) => {
  if (cmd !== 'du') return realExecFile(cmd, args, opts, cb);
  const ps = args.slice(args.indexOf('--') + 1);
  setImmediate(() => cb(null, ps.map((x) => `${/browser-profiles[\\/]bk-[0-9a-f]{8}$/.test(x) ? 9000000000 : 0}\t${x}`).join('\n'), ''));
  return { kill() { } };
};
const PLAN_LINE = ', recovered: !!e.recovered })), perConversation: lim.perConversation, total: lim.total });';
const BELT_LINE = "    if (!byPerson && e.recovered) return { removed: false, why: 'found again after a damage — removed only by the person\\'s Forget' };\n";
let planToday = null;
const todayPlan = () => planToday || (planToday = MUT.load('src/server/browser-kept.js', anchored(anchored(KSRC3, PLAN_LINE, ' })), perConversation: lim.perConversation, total: lim.total });', 'r3717 the plan as it was'), BELT_LINE, '', 'r3717 no belt'), 'kept-sweep-plan-today'));

console.log('⑯ r3717 MUST 1: a found-again row is NOT removed by the total size bound — through the REAL sweep (the marks reach the plan; the remover\'s belt)');
async function boundRun(KS) {
  const w = keptWorld(TORN);
  const S = mkStore(KS, w.dir, { execFileImpl: bigDu });
  S.has(KEYS[0]);
  await until(() => !hf(S));
  const sw = await S.sweep();
  const out = { recovered: S.list().filter((r) => r.recovered).length, removed: sw && sw.removed, left: w.left() };
  stopHold(S);
  return out;
}
const M16 = await boundRun(KS0);
console.log(`    facts: ${JSON.stringify(M16)}`);
ok(M16.recovered === 2 && M16.removed === 0 && M16.left === 2, 'a torn list rebuilt from the folders, the two kept browsers measured at 9 GB each (far past the total bound): the REAL sweep removes NONE — the size bound is a clock\'s act, not the person\'s', M16);
const M16x = await boundRun(todayPlan());
console.log(`    facts (red): ${JSON.stringify(M16x)}`);
ok(M16x.left === 0, 'RED CONTROL (the plan\'s rows as they were, no belt): the least recently used go first — the found-again rows, their sign-ins deleted by a clock — red', M16x);

console.log('⑰ r3786 THE UNMEASURED-ROW RULE through the REAL sweep: a folder `du` gives no size for is spared and left out of the sum — the measured ordinary rows are still bounded; «not measured» keeps its age; the measure starts at a different row each pass');
async function unmeasuredRun(KS) {
  let clock = 5_000_000;
  const w = bindWorld({});
  const bb = BB0.create({ dataDir: w.dir, log: quiet });
  const ks = [freshKey(), freshKey(), freshKey()], firsts = [];
  // a stand-in `du`: each measured kept folder 2.5 GB (two pass the 4 GB default total), the FIRST row's folder answered for by none
  const du = (cmd, args, opts, cb) => {
    if (cmd !== 'du') return realExecFile(cmd, args, opts, cb);
    const ps = args.slice(args.indexOf('--') + 1), folders = ps.filter((x) => /browser-profiles[\\/]bk-[0-9a-f]{8}$/.test(x));
    firsts.push(path.basename(folders[0] || ''));
    setImmediate(() => cb(null, ps.filter((x) => !x.endsWith(ks[0])).map((x) => `${/browser-profiles[\\/]bk-[0-9a-f]{8}$/.test(x) ? 2500 * KB.MB : 0}\t${x}`).join('\n'), ''));
    return { kill() { } };
  };
  const S = KS.create({ dataDir: w.dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock, execFileImpl: du });
  for (const k of ks) { bb.record(freshConv(), k, { at: clock }); clock += 1000; S.noteStart(k, { hasDir: true }); fs.mkdirSync(S.dirOf(k), { recursive: true }); fs.writeFileSync(path.join(S.dirOf(k), 'Cookies'), 'a sign-in'); S.noteStop(k, { why: 'idle' }); }
  clock += 3 * 3600e3;
  const s1 = await S.sweep();
  const age1 = (S.list().find((r) => r.browserKey === ks[0]) || {}).unmeasuredSince || 0;
  clock += 3600e3;
  const s2 = await S.sweep();
  const age2 = (S.list().find((r) => r.browserKey === ks[0]) || {}).unmeasuredSince || 0;
  const out = { unmeasuredKept: S.has(ks[0]) && fs.existsSync(path.join(S.dirOf(ks[0]), 'Cookies')), removed1: s1 && s1.removed, oldestMeasuredGone: !S.has(ks[1]), newestKept: S.has(ks[2]), unmeasured1: s1 && s1.unmeasured, age: age1 > 0 && age1 === age2, firsts, turned: firsts.length >= 2 && firsts[0] !== firsts[1] };
  try { S.shutdown(); } catch { /* its own */ }
  return out;
}
const U17 = await unmeasuredRun(KS0);
console.log(`    facts: ${JSON.stringify(U17)}`);
ok(U17.unmeasuredKept && U17.removed1 === 1 && U17.oldestMeasuredGone && U17.newestKept && U17.unmeasured1 === 1 && U17.age && U17.turned, 'three kept browsers past the 4 GB total, the oldest not measured: it is SPARED and out of the sum, the two measured ones are still bounded (the older goes, 2.5 GB is left); its row keeps «not measured» since the first pass (the same age at the second); the measure began at another row the second pass', U17);
const U17x = await unmeasuredRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, 'bytes: sizes[e.browserKey] ? sizes[e.browserKey].bytes : null, cacheBytes:', 'bytes: sizes[e.browserKey] ? (sizes[e.browserKey].bytes || 0) : 0, cacheBytes:', 'r3786 an unmeasured row read as 0'), 'kept-sweep-unmeasured-zero'));
console.log(`    facts (red): ${JSON.stringify(U17x)}`);
ok(!U17x.unmeasuredKept, 'RED CONTROL (a size not measured read as 0 bytes): the oldest row is in the order and the bound removes it — its sign-ins deleted on a size nobody measured — red', U17x);
const U17y = await unmeasuredRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, '    const from = rows.length ? (measureTurn++ % rows.length) : 0;', '    const from = 0;', 'r3786 the measure always from the first row'), 'kept-sweep-same-end'));
ok(!U17y.turned, 'RED CONTROL (the measure always from the same end): both passes begin at the same row — red', U17y);

console.log('⑱ r3786 LAW 5: a NEW browser\'s binding offered while the bindings file is HELD (nothing of it kept in memory), then a RESTART (fresh bindings, a fresh store over the same data): its conversation is bound to it again from its folder\'s NOTE — the choke point joined the conversation, the start wrote it — not ended');
async function noteRun(KS, KN = KNM) {
  let clock = 3_000_000;
  const K = freshKey(), C = freshConv();
  const w = bindWorld({ bytes: JSON.stringify({ v: 1, byConversation: {} }) });
  const bb0 = BB0.create({ dataDir: w.dir, log: quiet });
  const S0 = KS.create({ dataDir: w.dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb0, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  const realRead = fs.readFileSync;
  fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === path.resolve(w.bfile)) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, p, ...a); };
  let rec, gate;
  try {
    try { bb0.boundKeys(); } catch { /* the hold engaged */ }
    rec = bb0.record(C, K, { at: clock });   // refused: nothing of it waits in memory
    KN.join(path.join(w.dir, 'browser-profiles'), K, C);   // the choke point beside it (src/server/session-stdout.js writeSessionMeta)
    fs.mkdirSync(S0.dirOf(K), { recursive: true });
    gate = await S0.startGate(K);   // the browser's START: its folder's note, the conversation the choke point decided
    S0.noteStart(K, { hasDir: true }); fs.writeFileSync(path.join(S0.dirOf(K), 'Cookies'), 'a sign-in'); S0.noteStop(K, { why: 'idle' });
  } finally { fs.readFileSync = realRead; }
  try { S0.shutdown(); } catch { } const h0 = hbHold(bb0); if (h0) h0.stop();
  // A RESTART over the same data: fresh bindings, a fresh store — three hours later, past the grace
  const dir = restartCopy(w.dir);
  clock += 3 * 3600e3;
  const bb = BB0.create({ dataDir: dir, log: quiet });
  const S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, now: () => clock });
  const sw = await S.sweep();
  const out = { rec, gate: gate && gate.kept, note: noteOf(path.join(dir, 'browser-profiles', K)), bound: bb.lookup(C) === K, ended: sw && sw.ended, left: fs.existsSync(path.join(S.dirOf(K), 'Cookies')) };
  try { S.shutdown(); } catch { /* its own */ }
  return out;
}
const O18 = await noteRun(KS0);
console.log(`    facts: ${JSON.stringify(O18)}`);
ok(O18.rec === false && O18.gate === true && !!O18.note && O18.bound && O18.ended === 0 && O18.left, 'the bindings held (EIO): the new browser\'s binding is refused, nothing of it kept in memory; its start wrote the folder\'s note with the conversation; after a restart the reconcile binds the conversation to it again from the note — not ended three hours later, its sign-in kept', O18);
const red18 = overKN(anchored(KNSRC, '  if (!decided.has(k)) { decided.set(k, c);', '  if (false) { decided.set(k, c);', 'r3786 the choke point joins nothing'), 'kept-sweep-no-join');
const O18x = await noteRun(red18.KS, red18.KN);
console.log(`    facts (red): ${JSON.stringify(O18x)}`);
ok(!O18x.bound && O18x.ended === 1 && !O18x.left, 'RED CONTROL (the choke point joins nothing: the start\'s note names no conversation while the bindings are held): after the restart nothing binds it — the browser ENDS, its sign-in gone — red', O18x);
{
  const SS = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8');
  const J = 'if (sid) b.record(sid, meta.browserKey); else b.noteUnbound(meta, sockName); if (sid) keptNoteJoin(meta.browserKey, sid);';
  ok(SS.includes(J) && SS.includes("require('./browser-kept-note.js').join(path.join(path.dirname(META_DIR), 'browser-profiles'), key, sid)"), 'WIRING: the choke point (writeSessionMeta) joins the conversation into the kept folder\'s note beside the binding\'s record, by the same rule (bindableIdOf)', null);
}

console.log('⑲ ⑳ r3717 the shoulds: the panel\'s held words over the rows it draws; a row noted while held merges with the file\'s');
{
  const TV3 = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  const P2 = "krows.length ? t('VibeSpace cannot read its list of kept browsers right now, so only the browsers used since are shown here.";
  const says = (x) => x.includes(P2);
  ok(says(TV3) && !says(anchored(TV3, P2, "!krows.length ? t('", 'r3717 the panel as it was')), 'the panel while held with rows noted meanwhile drawn beneath: «only the browsers used since are shown here» — never «none is shown here» above them (RED: the line as it was)', null);
}
async function mergeRun(KS) {
  const w = keptWorld(JSON.stringify({ version: 1, entries: { [KEYS[0]]: { hasDir: true, label: 'Made-up mail', tabs: [{ url: 'https://mail.example/' }], startedAt: 900, stoppedAt: 1000, lastUsedAt: 1000 } } }));
  const realRead = fs.readFileSync; let refused = 0;
  fs.readFileSync = function (p, ...a) { if (!refused && path.resolve(String(p)) === w.file) { refused++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  let S; try { S = mkStore(KS, w.dir); S.has(KEYS[0]); } finally { fs.readFileSync = realRead; }
  S.noteStart(KEYS[0], { hasDir: true });   // it runs again, noted while held
  await again(S);
  const row = S.list().find((r) => r.browserKey === KEYS[0]) || {};
  stopHold(S);
  return { label: row.label, waiting: row.waiting };
}
const G20 = await mergeRun(KS0);
const G20x = await mergeRun(MUT.load('src/server/browser-kept.js', anchored(KSRC3, 'store.entries[k] = mergeNoted(store.entries[k], e);', 'store.entries[k] = e;', 'r3717 the noted row laid whole'), 'kept-sweep-merge-today'));
ok(G20.label === 'Made-up mail' && G20.waiting === 1 && G20x.label !== 'Made-up mail' && G20x.waiting === 0, 'a browser noted while the list was held (it runs again) MERGES at the lift: the file\'s label stays and its kept tab waits to be reopened — RED: the noted row laid whole loses both', { now: G20, red: G20x });


// ══ r3786 (主开发, line 821's second form — LAW 5: the fact lives with the folder): THE NINE HOLDS ══
/** a data folder with kept folders, each `[key, note | null, extra files]`, a bindings file and the kept list (rows) — then a START:
 *  fresh bindings, a fresh store and a fresh boot sweep (browser-env WIRED to the store's own verdict) over it */
function noteWorld({ folders = [], bindings = {}, rows = null } = {}) {
  const dir = path.join(ROOT, `q${++wn}`), home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true }); fs.mkdirSync(path.join(dir, 'browser-env'), { recursive: true }); fs.mkdirSync(path.join(dir, 'session-meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'browser-env', 'bindings.json'), JSON.stringify({ v: 1, byConversation: bindings }));
  if (rows) fs.writeFileSync(path.join(dir, KB.KEPT_FILE), JSON.stringify({ version: 1, entries: rows }));
  for (const [k, note] of folders) { const d = path.join(dir, 'browser-profiles', k); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'Cookies'), 'a sign-in'); if (note) fs.writeFileSync(path.join(d, NOTE), typeof note === 'string' ? note : JSON.stringify(note), { mode: 0o600 }); }
  return dir;
}
function startOver(dir, KS = KS0, extra = {}) {
  const home = path.join(dir, 'home');
  const bb = BB0.create({ dataDir: dir, log: quiet });
  const S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 0, ...extra });
  const be = BE.create({ dataDir: dir, homeDir: home, serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock'), keptKeys: () => S.keyVerdict(), keptNoted: () => S.notedKeys() });
  return { bb, S, be, there: (k) => fs.existsSync(path.join(dir, 'browser-profiles', k, 'Cookies')) };
}

console.log('㉑ r3786 HOLD 1: a note counts only when TRUE TO ITS FOLDER — a folder a person copied carries another folder\'s note: ignored (a folder with no note); the boot sweep removes the copy by age');
async function copyRun(KS) {
  const A = freshKey(), B = freshKey(), CA = freshConv();
  const dir = noteWorld({ folders: [[A, { key: A, conversation: CA, firstAt: 1000 }], [B, { key: A, conversation: CA, firstAt: 1000 }]], bindings: { [CA]: { key: A, at: 1000 } } });
  const { S, be, bb, there } = startOver(dir, KS);
  const r = await S.reconciled();
  const boot = be.sweep(new Set(), { graceMs: 0 });
  const out = { done: r.done, rowA: S.has(A), rowB: S.has(B), notedB: !!(S.notedKeys() && S.notedKeys().has(B)), copyGone: !there(B), aKept: there(A), boundA: bb.lookup(CA) === A, swept: boot.swept };
  try { S.shutdown(); } catch { }
  return out;
}
const N21 = await copyRun(KS0);
console.log(`    facts: ${JSON.stringify(N21)}`);
ok(N21.done && N21.rowA && !N21.rowB && !N21.notedB && N21.copyGone && N21.aKept && N21.boundA, 'a copied folder\'s note (another folder\'s key) is ignored: the copy gets no row and no note counts for it, the boot sweep removes it by age; the true folder is a row, kept, its conversation still bound to it', N21);
const N21x = await copyRun(overKN(anchored(KNSRC, "  if (!KEY_RE.test(String(name || '')) || doc.key !== name) return null;", "  if (!KEY_RE.test(String(name || ''))) return null;", 'r3786 a note judged without its folder'), 'kept-sweep-copied').KS);
ok(N21x.rowB && !N21x.copyGone, 'RED CONTROL (a note judged without its folder\'s name): the copy becomes a kept row by another folder\'s note and is never swept — red', N21x);

console.log('㉒ r3786 HOLD 1: a REGISTERED profile\'s folder is never made a kept row by a note (the registered rule wins)');
async function registeredRun(KS) {
  const R = freshKey(), CR = freshConv();
  const dir = noteWorld({ folders: [[R, { key: R, conversation: CR, firstAt: 1000 }]] });
  const reg = path.join(dir, 'browser-profiles', R);
  const { S } = startOver(dir, KS, { keeper: () => ({ ...stoppedKeeper(), registeredDirs: () => [reg], profileDirRegistered: (d) => path.resolve(d) === reg }) });
  const r = await S.reconciled();
  const out = { done: r.done, row: S.has(R), noted: !!(S.notedKeys() && S.notedKeys().has(R)) };
  try { S.shutdown(); } catch { }
  return out;
}
const N22 = await registeredRun(KS0);
ok(N22.done && !N22.row && !N22.noted, 'a registered profile\'s folder (an adopt in place) with a true note: no kept row, no note counted — the registry rules it', N22);
const N22x = await registeredRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "      for (const d of r.dirs) if (d.note === 'true' && !r.registered(d)) noted.set(", "      for (const d of r.dirs) if (d.note === 'true') noted.set(", 'r3786 no registered rule'), 'kept-sweep-registered'));
ok(N22x.row, 'RED CONTROL (the reconcile without the registered rule): the profile\'s folder becomes a kept row — red', N22x);

console.log('㉓ r3786 HOLD 2: a binding is made again only into an EMPTY place — a conversation bound to ANOTHER browser has moved on (never moved back): its older folder is an ordinary row with no holder and ends by the release\'s rules; a key another conversation holds stays its');
async function movedRun(BBmod) {
  const OLD = freshKey(), NEW = freshKey(), K2 = freshKey(), C = freshConv(), C2 = freshConv(), C3 = freshConv();
  // the older folder's note names C; C has moved on to NEW (its binding); NEW's own folder predates the note (its row only); K2's note names C2, but C3 holds K2
  const dir = noteWorld({ folders: [[OLD, { key: OLD, conversation: C, firstAt: 1000 }], [NEW, null], [K2, { key: K2, conversation: C2, firstAt: 1000 }]], bindings: { [C]: { key: NEW, at: 2000 }, [C3]: { key: K2, at: 1500 } }, rows: { [NEW]: { hasDir: true, startedAt: 2000, stoppedAt: 3000, lastUsedAt: 3000 } } });
  const bb = BBmod.create({ dataDir: dir, log: quiet });
  const S = KS0.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 0 });
  const sw = await S.sweep();
  const out = { cStays: bb.lookup(C) === NEW, k2Stays: bb.lookup(C3) === K2 && !bb.lookup(C2), oldEnded: !S.has(OLD) && !fs.existsSync(path.join(dir, 'browser-profiles', OLD, 'Cookies')), newKept: S.has(NEW), k2Kept: S.has(K2), ended: sw && sw.ended };
  try { S.shutdown(); } catch { }
  return out;
}
const N23 = await movedRun(BB0);
console.log(`    facts: ${JSON.stringify(N23)}`);
ok(N23.cStays && N23.k2Stays && N23.oldEnded && N23.newKept && N23.k2Kept, 'a conversation whose binding names its newer browser keeps it (never moved back to the older folder\'s note); the older folder, no holder, ends by the release\'s rules; a key another conversation holds stays that conversation\'s', N23);
const N23x = await movedRun(MUT.load('src/server/browser-bindings.js', anchored(BBS1, "      if (cur && KEY_RE.test(String(cur.key || ''))) { out.movedOn++; continue; }\n", '', 'r3786 a binding made over one that stands'), 'kept-sweep-moved-back'));
ok(!N23x.cStays, 'RED CONTROL (a binding made over the one that stands): the conversation is moved BACK onto its older folder — red', N23x);

console.log('㉔ r3786 HOLD 3: THE START\'s ORDER — a resume during the start\'s reconcile WAITS for it (its binding, made again from its folder\'s note, is there when its key is asked); past the reconcile\'s bound it is told by name');
{
  const K = freshKey(), C = freshConv();
  const dir = noteWorld({ folders: [[K, { key: K, conversation: C, firstAt: 1000 }]], rows: { [K]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
  let release; const gateP = new Promise((r) => { release = r; });
  const { S, be } = startOver(dir, KS0, { listFolders: (d, o) => gateP.then(() => KNM.listFolders(d, o)) });
  const p = S.reconciled();
  const early = be.priorKeyFor(C);   // a resume that did NOT wait: its key asked before the note was read
  release();
  const r = await p;
  const after = be.priorKeyFor(C);   // the resume that waited
  try { S.shutdown(); } catch { }
  ok(early === '' && r.done === true && after === K, 'during the start\'s reconcile the conversation\'s binding is not there yet (a resume asking then would mint a NEW browser over its folder\'s unread note); the create waits for the reconcile — then its key is its folder\'s', { early, r, after });
  const K2 = freshKey(), N = freshKey();
  const dir2 = noteWorld({ folders: [[K2, { key: K2, conversation: freshConv(), firstAt: 1000 }]] });
  const o2 = startOver(dir2, KS0, { listFolders: () => new Promise(() => { }) });
  const r2 = await o2.S.reconciled(120);   // a listing that never answers: only the bound can end this wait
  o2.S.noteStartCode(N, r2.code);
  const b = o2.S.brief(N), words = BF.startNoteWords(BF.browserFactFor({ browserKey: N, variant: BF.MANAGED_RUNGS[0] }, { kept: b, now: Date.now() }));
  const told = o2.S.takeStartNote(N), again2 = o2.S.takeStartNote(N);
  const g2 = await o2.S.startGate(N), noteN = fs.existsSync(path.join(o2.S.dirOf(N), NOTE));   // r4099: its start is NOT KEPT (no note)
  try { o2.S.shutdown(); } catch { }
  ok(r2.done === false && r2.code === 'kept_reconcile_unfinished' && !!b && b.kind === 'not-kept' && b.notKept === 'kept_reconcile_unfinished' && /^Not kept: its sign-ins end with it — VibeSpace had not finished reading/.test(words) && told === 'kept_reconcile_unfinished' && again2 === null && /NOT KEPT this time/.test(KB.startNoteText(told)) && g2.kept === false && g2.code === 'kept_reconcile_unfinished' && !noteN, 'past its bound the wait ends (unknown), and the browser handed then is NOT KEPT (r4099), said by hold 5\'s words: the conversation\'s browser card «Not kept: its sign-ins end with it — …», the agent\'s first answer once; its start writes no note', { r2, b, words, told, again2, g2, noteN });
  const WC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const W1 = 'keptOrder = await be0.startKeyOrder({ resumeId: resumeAsk });', W2 = "const prior = resumeAsk ? (keptOrder ? keptOrder.prior : be0.priorKeyFor(data.resumeId)) : '';";
  const order = (x) => x.indexOf(W1) >= 0 && x.indexOf(W1) < x.indexOf(W2) && x.indexOf(W2) - x.indexOf(W1) < 1200;
  ok(order(WC) && !order(anchored(WC, W1, 'keptOrder = null;', 'r3786 the create that does not wait')) && WC.includes("liveKeptStore()?.noteStartCode?.(bk.key, keptOrder.code)"), 'WIRING: the create asks the start\'s reconcile BEFORE it asks the conversation\'s prior key, and a resume past the bound is told by its code (RED: the create that does not wait)', null);
}

console.log('㉕ r3786 HOLD 4: a reconcile CUT AT ITS BOUND is UNKNOWN, never «nothing found» — that pass removes nothing (LAW 2), the next pass asks again, said ONCE by its code');
async function cutRun(KS) {
  const A = freshKey(), B = freshKey();
  const dir = noteWorld({ folders: [[A, null], [B, null]], rows: { [A]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 }, [B]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
  const warns = [], asked = { n: 0 };
  // the listing child cut at its bound: execFile answers as its timeout's SIGKILL does (killed: true) — no real wait
  const cut = (cmd, args, opts, cb) => { if (cmd === process.execPath && args[0] === '-e' && String(args[1]).includes('.vibespace-kept.json')) { asked.n++; setImmediate(() => cb(Object.assign(new Error('Command failed: killed'), { killed: true, signal: 'SIGKILL' }), '', '')); return { kill() { } }; } return realExecFile(cmd, args, opts, cb); };
  const bb = BB0.create({ dataDir: dir, log: quiet });
  const S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: { log() { }, warn: (s) => warns.push(String(s)), error() { } }, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 0, listExec: cut });
  const s1 = await S.sweep(), s2 = await S.sweep();
  const out = { s1: !!(s1 && s1.held), s2: !!(s2 && s2.held), asked: asked.n, said: warns.filter((w) => /kept_reconcile_unfinished: the kept browsers' folders and their notes were not read to their end/.test(w)).length, kept: [A, B].filter((k) => S.has(k) && fs.existsSync(path.join(dir, 'browser-profiles', k, 'Cookies'))).length, state: S._reconcileState() };
  try { S.shutdown(); } catch { }
  return out;
}
const N25 = await cutRun(KS0);
console.log(`    facts: ${JSON.stringify(N25)}`);
ok(N25.s1 && N25.s2 && N25.asked === 2 && N25.said === 1 && N25.kept === 2 && N25.state === 'unknown', 'the listing cut at its bound (two passes, each asks again): both passes REMOVE NOTHING — two kept browsers no binding names, past their grace, both stay with their folders; the reconcile is unknown, said once by kept_reconcile_unfinished', N25);
const N25x = await cutRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "    recState = 'unknown';\n    if (!recSaid)", "    recState = 'done'; recFacts = recFacts || { at: 0, noted: new Set(), trueKeys: new Set() }; return true;\n    if (!recSaid)", 'r3786 an unfinished reconcile taken as «nothing found»'), 'kept-sweep-cut-empty'));
ok(N25x.kept === 0, 'RED CONTROL (an unfinished reconcile taken as «nothing found»): the pass ends both kept browsers and removes their folders — red', N25x);
{
  const d = noteWorld({ folders: [[freshKey(), null]] });
  const r = await KNM.listFolders(path.join(d, 'browser-profiles'), { timeoutMs: 1 });
  ok(r.ok === false && /bound/.test(String(r.why)), 'the REAL child past a 1 ms bound: its own execFile ends it and the answer is «the listing passed its bound» (never a listing)', r);
}

console.log('㉖ r3786 HOLD 5: a note that CANNOT BE WRITTEN — off the loop, whole, 0600, BOUNDED: the start is NOT KEPT and BOTH are told (the agent in its tool\'s words, the person on that conversation\'s browser); a landing past the bound is taken back');
async function unwritableRun(KS, noteFs, { noteWriteMs = 2000, ended = null } = {}) {
  const K = freshKey();
  const dir = noteWorld({});
  const S = mkStore(KS, dir, { noteFs, noteWriteMs });
  fs.mkdirSync(S.dirOf(K), { recursive: true });
  const t0 = Date.now(), g = await S.startGate(K), ms = Date.now() - t0;
  if (ended) await until(ended, 3000);   // r3961: the late write's own end (its temp unlinked, or renamed) — no fixed settle
  const b = S.brief(K), fact = BF.browserFactFor({ browserKey: K, variant: BF.MANAGED_RUNGS[0] }, { kept: b, now: Date.now() });
  const told = S.takeStartNote(K), again2 = S.takeStartNote(K);
  const left = fs.readdirSync(S.dirOf(K));
  try { S.shutdown(); } catch { }
  return { kept: g.kept, code: g.code, ms, notKept: b && b.notKept, kind: b && b.kind, card: BF.startNoteWords(fact), agent: told ? KB.startNoteText(told) : null, once: again2 === null, left };
}
const refuseTmp = { ...fs.promises, open: (p, f, m) => (String(p).includes('.tmp-') ? Promise.reject(Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' })) : fs.promises.open(p, f, m)) };   // PLACED: the temp's open refused
const N26 = await unwritableRun(KS0, refuseTmp);
console.log(`    facts: ${JSON.stringify(N26)}`);
ok(N26.kept === false && N26.code === 'kept_note_unwritten' && N26.notKept === 'kept_note_unwritten' && N26.kind === 'not-kept' && /^Not kept: its sign-ins end with it/.test(N26.card) && /NOT KEPT/.test(N26.agent) && /ends with it/.test(N26.agent) && N26.once && N26.left.length === 0,
  'the note\'s temp refused (EACCES): the start is NOT kept; the person\'s card says «Not kept: its sign-ins end with it…»; the agent\'s answer carries its English words ONCE; nothing is left in the folder', N26);
const N26x = await unwritableRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "    startNotes.set(k, { code: r.code, at: now(), said: false });\n", "    return { kept: true };\n", 'r3786 a failed note read as kept'), 'kept-sweep-silent-downgrade'), refuseTmp);
ok(N26x.kept === true && !N26x.notKept && !N26x.card, 'RED CONTROL (a note that failed read as kept): the browser starts on its folder with nothing protecting its sign-ins, and neither the agent nor the person hears of it — a silent downgrade — red', N26x);
const stall = { ...fs.promises, open: (p, f, m) => (String(p).includes('.tmp-') ? new Promise(() => { }) : fs.promises.open(p, f, m)) };   // PLACED: the temp's open never answers
const N26b = await unwritableRun(KS0, stall, { noteWriteMs: 150 });
ok(N26b.kept === false && N26b.code === 'kept_note_timeout' && N26b.notKept === 'kept_note_timeout', 'the note\'s write that never answers (its open never settles: only the bound can answer): past its bound the start is NOT kept (kept_note_timeout)', N26b);
const lateEnd = { n: 0 };
const late = { ...fs.promises, open: (p, f, m) => (String(p).includes('.tmp-') ? new Promise((r, j) => setTimeout(() => fs.promises.open(p, f, m).then(r, j), 250)) : fs.promises.open(p, f, m)),
  unlink: (p) => fs.promises.unlink(p).finally(() => { if (String(p).includes('.tmp-')) lateEnd.n++; }), rename: (a, b) => fs.promises.rename(a, b).finally(() => { lateEnd.n++; }) };   // PLACED: the temp's open answers past the bound (its end counted)
lateEnd.n = 0;
const N26c = await unwritableRun(KS0, late, { noteWriteMs: 80, ended: () => lateEnd.n > 0 });
ok(N26c.kept === false && N26c.code === 'kept_note_timeout' && N26c.left.length === 0, 'a write that lands PAST its bound is taken back: the folder of a browser told «not kept» holds no note after it (nothing reads it as kept later)', N26c);
const N26cx = await unwritableRun(overKN(anchored(anchored(KNSRC, "      if (cut) { await fsp.unlink(tmp).catch(() => { }); return { ok: false, code: 'kept_note_timeout' }; }\n", '', 'r3786 no cut before the rename'), '      if (cut && takeBack) await takeBackOwn(fin, ino, fsp, dir, doc);\n', '', 'r3786 a late landing left'), 'kept-sweep-late-note').KS, late, (lateEnd.n = 0, { noteWriteMs: 80, ended: () => lateEnd.n > 0 }));
ok(N26cx.left.includes(NOTE), 'RED CONTROL (a late landing left in place): a browser told «not kept» has a note in its folder after all — red', N26cx);
{
  const d = noteWorld({}), kept = path.join(d, 'browser-profiles', freshKey()), cfg = path.join(d, 'browser-env', 'bk-madeup.json'), other = path.join(d, 'browser-env', 'bk-other.json');
  fs.writeFileSync(cfg, JSON.stringify({ profile: kept, headed: false, args: ['--quiet'] })); fs.writeFileSync(other, JSON.stringify({ profile: '/var/empty/vs-work-profile' }));
  const u = await KNM.unkeepConfig(cfg, kept), v = await KNM.unkeepConfig(other, kept);
  const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  ok(u.ok && u.changed && !('profile' in c) && c.headed === false && Array.isArray(c.args) && (fs.statSync(cfg).mode & 0o777) === 0o600 && v.ok && !v.changed && JSON.parse(fs.readFileSync(other, 'utf8')).profile === '/var/empty/vs-work-profile',
    'a start NOT KEPT on rung D: the session\'s own generated config loses only the `profile` naming its kept folder (written whole, 0600, before the start); a config naming any other folder is left alone', { u, v, c });
  const KP = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8'), RB = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'), CLI = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const G1 = '      const g = await ks.startGate(bk);', G2 = "    const browser = await start(p.id, { why: resume === 'user' ? 'resumed by the user' : (created ? 'first verb' : 'verb') });";
  const gateFirst = (x) => x.indexOf(G1) > 0 && x.indexOf(G1) < x.indexOf(G2) && x.includes("require('./browser-kept-note.js').unkeepConfig(cfg, keptDirFor(bk))") && x.includes("{ ok: false, why: 'its link is its folder' }");
  ok(gateFirst(KP) && !gateFirst(anchored(KP, G1, '      const g = { kept: true };', 'r3786 the keeper that starts without the gate')) && RB.includes("...(e.startNote ? { notKept: { text: require('../browser-kept.js').startNoteText(e.startNote) } } : {}),") && CLI.includes('if (r.notKept && typeof r.notKept === \'object\' && r.notKept.text) console.error(`note: ${r.notKept.text} [browser_not_kept]`);'),
    'WIRING: the keeper asks the gate BEFORE the browser starts on its folder (rung D: its config un-kept; rung C, whose link IS the folder: refused by name); the route hands the agent its words, and the tool prints them (RED: the keeper that starts without the gate)', null);
}

console.log('㉗ r3786 HOLD 6: the note holds THREE things and no more — the browser\'s name, the conversation\'s id, the first time; a note with a fourth field is not a note');
async function fieldsRun(KS) {
  const K = freshKey(), C = freshConv(), X = freshKey();
  const dir = noteWorld({ folders: [[X, { key: X, conversation: freshConv(), firstAt: 1000, site: 'mail.example' }]], bindings: { [C]: { key: K, at: 1000 } } });
  const { S } = startOver(dir, KS);
  fs.mkdirSync(S.dirOf(K), { recursive: true });
  const g = await S.startGate(K);
  const doc = noteOf(S.dirOf(K)), mode = fs.statSync(path.join(S.dirOf(K), NOTE)).mode & 0o777;
  await S.reconciled();
  const out = { kept: g.kept, keys: doc ? Object.keys(doc).sort().join(',') : null, conv: doc && doc.conversation === C, mode, fourth: S.has(X) };
  try { S.shutdown(); } catch { }
  return out;
}
const N27 = await fieldsRun(KS0);
ok(N27.kept && N27.keys === 'conversation,firstAt,key' && N27.conv && N27.mode === 0o600 && !N27.fourth, 'the note a start writes holds exactly its key, its conversation and its first time (no site, no place, no label), mode 0600; a folder whose note carries a fourth field (a site) counts as a folder with no note', N27);
const N27x = await fieldsRun(overKN(anchored(KNSRC, '  if (ks.length !== NOTE_FIELDS.length || ks.some((k, i) => k !== NOTE_FIELDS[i])) return null;\n', '', 'r3786 a note of any shape'), 'kept-sweep-fourth').KS);
ok(N27x.fourth, 'RED CONTROL (a note of any shape): the folder whose note carries a site becomes a kept row by it — red', N27x);

console.log('㉘ r3786 HOLD 7: the note sits at the root of the browser\'s own data folder (beside Chromium\'s Local State) — the size measure never counts it, the cache trim never moves it');
async function placeRun(KS) {
  const K = freshKey(), C = freshConv();
  const dir = noteWorld({ bindings: { [C]: { key: K, at: 1000 } } });
  // a stand-in `du`: the folder 2 GB (past its own 512 MB bound), its cache 1.5 GB
  const du = (cmd, args, opts, cb) => { if (cmd !== 'du') return realExecFile(cmd, args, opts, cb); const ps = args.slice(args.indexOf('--') + 1); setImmediate(() => cb(null, ps.map((x) => `${x.endsWith(K) ? 2000 * KB.MB : /Cache$/.test(x) ? 1500 * KB.MB : 0}\t${x}`).join('\n'), '')); return { kill() { } }; };
  const S = KS.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: BB0.create({ dataDir: dir, log: quiet }), log: quiet, sweepEveryMs: 0, thereEveryMs: 0, graceMs: 60000, execFileImpl: du });
  fs.mkdirSync(path.join(S.dirOf(K), 'Default', 'Cache'), { recursive: true }); fs.writeFileSync(path.join(S.dirOf(K), 'Default', 'Cache', 'data_0'), 'cached');
  await S.startGate(K);
  const before = fs.readFileSync(path.join(S.dirOf(K), NOTE), 'utf8'), size = Buffer.byteLength(before);
  S.noteStart(K, { hasDir: true }); S.noteStop(K, { why: 'idle' });
  const m = await S._measure([{ browserKey: K, hasDir: true }]);
  const sw = await S.sweep();
  const out = { bytes: m[K] && m[K].bytes, want: 2000 * KB.MB - size, trimmed: sw && sw.trimmed, cacheGone: !fs.existsSync(path.join(S.dirOf(K), 'Default', 'Cache', 'data_0')), noteSame: fs.existsSync(path.join(S.dirOf(K), NOTE)) && fs.readFileSync(path.join(S.dirOf(K), NOTE), 'utf8') === before };
  try { S.shutdown(); } catch { }
  return out;
}
const N28 = await placeRun(KS0);
console.log(`    facts: ${JSON.stringify(N28)}`);
ok(N28.bytes === N28.want && N28.trimmed === 1 && N28.cacheGone && N28.noteSame, 'the folder\'s bytes are measured WITHOUT its note (its size taken out of the sum); the cache trim of a folder past its own bound removes the cache and leaves the note byte for byte', N28);
const N28x = await placeRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, 'bytes: Number.isFinite(b) ? Math.max(0, b - (noteBytes.get(e.browserKey) || 0)) : null,', 'bytes: Number.isFinite(b) ? b : null,', 'r3786 the note counted'), 'kept-sweep-note-counted'));   // stale-pins: kept (the red copy writes the line as it was)
ok(N28x.bytes !== N28x.want, 'RED CONTROL (the note counted in the folder\'s size) — red', N28x);

console.log('㉙ r3786 HOLD 8: THE FOLDERS OF TODAY HAVE NO NOTE — one STEPPED pass of the tree\'s migration runner writes it for every row the kept list AND a binding both name (both read), nothing for a row only one names; an unread list: not run, tried again at the next start');
async function migRun(noteExisting) {
  const root = path.join(ROOT, `mg${++wn}`), dir = path.join(root, 'data');
  const K1 = freshKey(), K2 = freshKey(), K3 = freshKey(), C1 = freshConv(), C3 = freshConv();
  fs.mkdirSync(path.join(dir, 'browser-env'), { recursive: true });
  for (const k of [K1, K2, K3]) fs.mkdirSync(path.join(dir, 'browser-profiles', k), { recursive: true });
  fs.writeFileSync(path.join(dir, KB.KEPT_FILE), JSON.stringify({ version: 1, entries: { [K1]: { hasDir: true, startedAt: 1234, stoppedAt: 2000, lastUsedAt: 2000 }, [K2]: { hasDir: true, startedAt: 1300, stoppedAt: 2000, lastUsedAt: 2000 } } }));
  fs.writeFileSync(path.join(dir, 'browser-env', 'bindings.json'), JSON.stringify({ v: 1, byConversation: { [C1]: { key: K1, at: 1500 }, [C3]: { key: K3, at: 1500 } } }));
  const rep = await noteExisting(dir);
  const n = (k) => noteOf(path.join(dir, 'browser-profiles', k));
  fs.writeFileSync(path.join(dir, KB.KEPT_FILE), '{"version":1,"entries":{"' + K1 + '":{"hasDir":tr');   // the list torn at the next start
  let torn = null; try { await noteExisting(dir); torn = 'ran'; } catch (e) { torn = /not run; tried again at the next start/.test(e.message) ? 'refused' : e.message; }
  return { rep, k1: n(K1), k1ok: !!n(K1) && n(K1).conversation === C1 && n(K1).firstAt === 1234 && n(K1).key === K1, k2: n(K2), k3: n(K3), torn };
}
const MIG = require(path.join(REPO, 'src/server/migrations.js'));
const viaRunner = (dir) => { const m = MIG.create({ rootDir: path.dirname(dir), serverNotice: () => { } }).MIGRATIONS.find((x) => x.id === '2026-11-kept-browser-notes'); return m.run(); };
const N29 = await migRun(viaRunner);
console.log(`    facts: ${JSON.stringify(N29)}`);
ok(N29.rep && N29.rep.noted === 1 && N29.k1ok && N29.k2 === null && N29.k3 === null && N29.torn === 'refused', 'the registry\'s 2026-11-kept-browser-notes (its run a promise: the boot never waits): the row both files name gets its note (its binding\'s conversation, its row\'s first time); the row only the list names and the binding with no row get none; a torn list: not run, tried again at the next start', N29);
const red29 = overKN(anchored(anchored(KNSRC, '    if (!h || !e.hasDir || !convOf(h.sid)) { only++; continue; }', '    if (!e.hasDir) { only++; continue; }', 'r3786 a row only the list names'), "ensureNote(dir, k, h.sid, { now: () => Number(e.startedAt) || h.at || Date.now(), fsp });", "ensureNote(dir, k, h ? h.sid : '', { now: () => Number(e.startedAt) || Date.now(), fsp });", 'r3786 a row only the list names'), 'kept-sweep-mig');
const N29x = await migRun((dir) => red29.KN.noteExisting({ dataDir: dir }));
ok(N29x.k2 !== null, 'RED CONTROL (a note written for a row only the list names): a folder no binding gives to a conversation gets a note — red', N29x);

console.log('㉚ r3786 LAW 4 — THE BOOT SWEEP\'s THREE RULES: it judges the list by THE STORE\'s verdict (a wrong-shape list is torn, never «no rows»); it never removes by age a folder whose note names a conversation; with the bindings unread it removes no key-named folder');
async function bootRun(BEm, { keptKeys, keptNoted, bindingsBytes = null, listBytes = null }) {
  const K = freshKey();
  const dir = noteWorld({ folders: [[K, null]] });
  if (bindingsBytes !== null) fs.writeFileSync(path.join(dir, 'browser-env', 'bindings.json'), bindingsBytes);
  if (listBytes !== null) fs.writeFileSync(path.join(dir, KB.KEPT_FILE), listBytes);
  const be = BEm.create({ dataDir: dir, homeDir: path.join(dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock'), ...(keptKeys ? { keptKeys } : {}), ...(keptNoted ? { keptNoted: () => keptNoted(K) } : {}) });
  const sw = be.sweep(new Set(), { graceMs: 0 });
  return { removed: !fs.existsSync(path.join(dir, 'browser-profiles', K, 'Cookies')), notedSpared: sw.notedSpared, keptUnreadable: sw.keptUnreadable };
}
const BESRC = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
const shapeRun = await bootRun(BE, { listBytes: JSON.stringify({ version: 1, entries: [] }) });   // no live store: the file judged by the store's own judge
const shapeRed = await bootRun(MUT.load('src/server/browser-env.js', anchored(BESRC, "    if (a.state !== 'data') return null;\n", "    if (a.state !== 'data') return new Set();\n", 'r3786 the boot sweep\'s own parse: a wrong shape is «no rows»'), 'kept-sweep-shape'), { listBytes: JSON.stringify({ version: 1, entries: [] }) });
ok(!shapeRun.removed && shapeRun.keptUnreadable && shapeRed.removed, 'RULE 1 (the verifier\'s scene 1): a list whose entries are not the store\'s shape is TORN to the boot sweep (judged by the store\'s own judge) — every key-named folder spared — RED: the sweep\'s own parse reads it as «no rows» and removes the folder', { shapeRun, shapeRed });
const noted = await bootRun(BE, { keptKeys: () => new Set(), keptNoted: (k) => new Set([k]) });
const notedRed = await bootRun(MUT.load('src/server/browser-env.js', anchored(BESRC, "(noted instanceof Set ? noted.has(key) : noteHeld(path.join(dir, n)))", 'false', 'r3786 a noted folder removed by age'), 'kept-sweep-noted-age'), { keptKeys: () => new Set(), keptNoted: (k) => new Set([k]) });
ok(!noted.removed && noted.notedSpared === 1 && notedRed.removed, 'RULE 2: the store names no row for a folder whose note names its conversation — the boot sweep does NOT remove it by age — RED: removed by its age', { noted, notedRed });
const unread = await bootRun(BE, { keptKeys: () => new Set(), keptNoted: () => new Set(), bindingsBytes: '{"v":1,"byConversation":{"x' });
const unreadRed = await bootRun(MUT.load('src/server/browser-env.js', anchored(BESRC, "(bindingsUnread || noted === null ||", "(noted === null ||", 'r3786 the bindings unread ignored'), 'kept-sweep-bind-unread'), { keptKeys: () => new Set(), keptNoted: () => new Set(), bindingsBytes: '{"v":1,"byConversation":{"x' });
ok(!unread.removed && unread.notedSpared === 1 && unreadRed.removed, 'RULE 3: the bindings unread (torn) — no key-named folder is removed, whatever the list says — RED: removed', { unread, unreadRed });
{
  const WC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), MW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(WC.includes("keptKeys: () => { const ks = liveKeptStore(); return ks && typeof ks.keyVerdict === 'function' ? ks.keyVerdict() : undefined; },") && WC.includes("keptNoted: () => { const ks = liveKeptStore(); return ks && typeof ks.notedKeys === 'function' ? ks.notedKeys() : undefined; },") && MW.includes("keptKeys: () => (browserKept ? browserKept.keyVerdict() : undefined), keptNoted: () => (browserKept ? browserKept.notedKeys() : undefined)"),
    'WIRING: both browser-env instances of the hub (ws-create\'s boot sweep, the routes\') take the live kept store\'s verdict and facts — ONE verdict of the list for every remover', null);
}


// ══ r3961 (the round wf_9f9929d5-6b1's cure) and r3963 (the verifier's scene 2) ══
const BKS = fs.readFileSync(path.join(REPO, 'src/server/browser-key.js'), 'utf8');
const BBS4 = fs.readFileSync(path.join(REPO, 'src/server/browser-bindings.js'), 'utf8');
const twoHoursOld = (p) => { const t = (Date.now() - 2 * 3600e3) / 1000; fs.utimesSync(p, t, t); };

console.log('㉛ r3961 (1): ONE WRITE AT A TIME A FOLDER — a rename held past the bound, then a second start: the second waits (inside ITS bound) for the first to truly end, and a take-back removes only its own file — never «kept» over a folder with no note');
async function oneAtATimeRun(KS, { releaseAfterSecond = false } = {}) {
  const K = freshKey();
  const dir = noteWorld({});
  let release; const gateP = new Promise((r) => { release = r; });
  let held = 0, firstLanded = null;
  const flags = { lstatDone: 0, unlinkIssued: 0, unlinkDone: 0 };
  const isNote = (p) => String(p).endsWith(NOTE);
  const noteFs = { ...fs.promises,
    rename: (a, b) => { if (isNote(b) && held++ === 0) { firstLanded = gateP.then(() => fs.promises.rename(a, b)); return firstLanded; } return fs.promises.rename(a, b); },   // PLACED: the FIRST note's rename held
    lstat: (p) => fs.promises.lstat(p).finally(() => { if (firstLanded && isNote(p)) flags.lstatDone++; }),
    unlink: (p) => { if (isNote(p)) flags.unlinkIssued++; return fs.promises.unlink(p).finally(() => { if (isNote(p)) flags.unlinkDone++; }); } };
  const S = mkStore(KS, dir, { noteFs, noteWriteMs: 300 });   // a bound wide enough for a loaded machine's fsync (the second start's whole wait and write)
  fs.mkdirSync(S.dirOf(K), { recursive: true });
  const g1 = await S.startGate(K);   // past its bound: not kept — its write still runs (its rename held)
  const g2p = S.startGate(K);        // the next start of the same folder
  let g2;
  if (releaseAfterSecond) { g2 = await g2p; release(); } else { release(); g2 = await g2p; }
  // the first write's late landing and its take-back look (then its unlink, when it took its own file back): waited for by their own events
  await firstLanded; await until(() => flags.lstatDone > 0, 3000); await new Promise((r) => setImmediate(r)); await until(() => flags.unlinkDone >= flags.unlinkIssued, 3000);
  const note = noteOf(S.dirOf(K));
  try { S.shutdown(); } catch { }
  return { first: g1.kept ? 'kept' : g1.code, second: g2.kept ? 'kept' : g2.code, note: !!note && note.key === K, keptOverNone: !!g2.kept && !(note && note.key === K) };
}
const N31a = await oneAtATimeRun(KS0), N31b = await oneAtATimeRun(KS0, { releaseAfterSecond: true });
console.log(`    facts: ${JSON.stringify({ N31a, N31b })}`);
ok(N31a.first === 'kept_note_timeout' && N31a.second === 'kept' && N31a.note && !N31b.keptOverNone && N31b.second === 'kept_note_timeout',
  'the first write past its bound (its rename held): not kept; a second start WAITS for it to end, then writes the folder\'s note — kept, its note there; when the first is still held through the second\'s whole bound, the second is not kept either (it writes nothing): never «kept» over a folder with no note', { N31a, N31b });
const N31x = await oneAtATimeRun(overKN(anchored(KNSRC, '  const end = run.then(() => (ran ? held : prev), () => null).then(() => null, () => null);', '  const end = run.then(() => null, () => null);', 'r3786 the chain moves on at the bound'), 'kept-sweep-chain-bound').KS, { releaseAfterSecond: true });
ok(N31x.keptOverNone, 'RED CONTROL (the chain moves on at the bounded answer): the second start writes and says kept, then the first lands over its note and takes it back — a browser told «kept» on a folder with NO note — red', N31x);

console.log('㉜ r3961 (2): TWO TRUE NOTES NAME ONE CONVERSATION — bound by the bindings\' own rebuild rule (a conversation keeps its FIRST key: the earliest first time), whatever the listing\'s order');
async function twoNotesRun(KS, order) {
  const X = freshKey(), Y = freshKey(), C = freshConv();
  const dir = noteWorld({ folders: [[X, { key: X, conversation: C, firstAt: 1000 }], [Y, { key: Y, conversation: C, firstAt: 2000 }]] });
  const listFolders = (d, o) => KNM.listFolders(d, o).then((r) => (r && r.ok ? { ...r, dirs: [...r.dirs].sort((a, b) => (order === 'xy' ? 1 : -1) * ((a.name === X ? 0 : 1) - (b.name === X ? 0 : 1))) } : r));
  const { S, bb } = startOver(dir, KS, { listFolders });
  await S.reconciled();
  const out = { bound: bb.lookup(C) === X ? 'X' : bb.lookup(C) === Y ? 'Y' : 'none' };
  try { S.shutdown(); } catch { }
  return out;
}
const N32 = [await twoNotesRun(KS0, 'xy'), await twoNotesRun(KS0, 'yx')];
ok(N32.every((x) => x.bound === 'X'), 'two folders noted for one conversation, the bindings empty: in BOTH listing orders the conversation is bound to the folder of its FIRST key (the earliest first time) — the other is an ordinary row with no holder', N32);
const KS32 = MUT.load('src/server/browser-kept.js', anchored(KSRC, '      pairs.sort((a, b) => (a[2] - b[2]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));\n', '', 'r3786 the listing\'s order'), 'kept-sweep-listing-order');
const N32x = [await twoNotesRun(KS32, 'xy'), await twoNotesRun(KS32, 'yx')];
ok(N32x[0].bound !== N32x[1].bound, 'RED CONTROL (the listing\'s order decides): the two orders bind two different folders — which sign-ins a person keeps is a folder listing\'s — red', N32x);

console.log('㉝ r3961 (3): HOLD 3 AT EVERY DOOR — (a) a create waits for a reconcile a LIFT began; (b) THE LATE DOOR refuses by name while one runs, then hands the conversation its own key; (c) a reconcile that ended unknown is ASKED AGAIN');
{
  // (a) the create's door (browser-env startKeyOrder, the one ws-create asks): a LIFT's reconcile in flight is waited for
  const aRun = async (KS) => {
    const K = freshKey(), C = freshConv();
    const dir = noteWorld({ rows: { [K]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
    let gate = null;
    const listFolders = (d, o) => (gate ? gate.then(() => KNM.listFolders(d, o)) : KNM.listFolders(d, o));
    const o = startOver(dir, KS, { listFolders });
    const be = BE.create({ dataDir: dir, homeDir: path.join(dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock'), keptReady: () => o.S.reconciled() });
    await o.S.reconciled();   // the start's reconcile: done (no note yet)
    fs.mkdirSync(path.join(dir, 'browser-profiles', K), { recursive: true }); fs.writeFileSync(path.join(dir, 'browser-profiles', K, NOTE), JSON.stringify({ key: K, conversation: C, firstAt: 1000 }));
    let release; gate = new Promise((r) => { release = r; });
    o.S.reconcile('lift');    // a LIFT's reconcile, in flight
    const pk = be.startKeyOrder({ resumeId: C });
    release();
    const r = await pk;
    try { o.S.shutdown(); } catch { }
    return { prior: r.prior === K, code: r.code };
  };
  const A = await aRun(KS0);
  const Ax = await aRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "    if (recState === 'done' && !recBusy) return Promise.resolve({ done: true, code: null });\n    const p = recBusy ||", "    if (recState === 'done') return Promise.resolve({ done: true, code: null });\n    const p = recBusy ||", 'r3786 the start\'s reconcile only'), 'kept-sweep-lift-wait'));
  ok(A.prior && A.code === null && !Ax.prior, '(a) a create during a LIFT\'s reconcile waits for it: its resume\'s key is its folder\'s (the binding made again from the note) — RED (the wait covers the start\'s reconcile only): it reads no binding and would mint a new browser', { A, Ax });
  // (b) THE LATE DOOR (browser-key.js ensureBrowserKey, the routes' first browser command of a keyless session)
  const bRun = async (BKm) => {
    const K = freshKey(), C = freshConv();
    const dir = noteWorld({ folders: [[K, { key: K, conversation: C, firstAt: 1000 }]], rows: { [K]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
    let release; const gateP = new Promise((r) => { release = r; });
    const o = startOver(dir, KS0, { listFolders: (d, oo) => gateP.then(() => KNM.listFolders(d, oo)) });
    const session = { claudeSessionId: C, cwd: dir, name: 'made-up' };
    const active = new Map([['sess-made-up-1', session]]);
    const keys = BKm.create({ browserEnv: () => o.be, keeper: () => ({ keptStore: () => o.S }), activeSessions: active, log: quiet });
    o.S.reconciled();   // the start's reconcile, held at its listing
    const during = keys.ensureBrowserKey(session, { sessionId: 'sess-made-up-1' });
    release();
    await o.S.reconciled();
    const s2 = { claudeSessionId: C, cwd: dir, name: 'made-up' }; active.set('sess-made-up-2', s2);
    const after = BKm === BK0 ? keys.ensureBrowserKey(s2, { sessionId: 'sess-made-up-2' }) : null;
    try { o.S.shutdown(); } catch { }
    return { during: during.ok ? (during.key === K ? 'its own' : 'a NEW key') : during.why, after: after ? (after.ok && after.key === K ? 'its own' : after.ok ? 'a NEW key' : after.why) : null };
  };
  const BK0 = require(path.join(REPO, 'src/server/browser-key.js'));
  const Bv = await bRun(BK0);
  const Bx = await bRun(MUT.load('src/server/browser-key.js', anchored(BKS, '    if (order && order.done === false && order.waiting) return refused(session, f.id, KEPT_RECONCILING);\n', '', 'r3786 the late door asks nothing'), 'kept-sweep-late-door'));
  ok(Bv.during === 'kept_reconciling' && Bv.after === 'its own' && Bx.during === 'a NEW key', '(b) THE LATE DOOR: while the reconcile runs its first browser command is refused by name (kept_reconciling, «ask again in a moment»); after it the conversation gets ITS OWN key back (the binding made again from the note) — RED (the door asks nothing): a NEW browser over its own kept one', { Bv, Bx });
  // (c) a reconcile that ended UNKNOWN is asked again by the next wait
  const cRun = async (KS) => {
    let fail = true;
    const dir = noteWorld({});
    const o = startOver(dir, KS, { listFolders: (d, oo) => (fail ? Promise.resolve({ ok: false, why: 'made-up: the listing did not answer' }) : KNM.listFolders(d, oo)) });
    const r1 = await o.S.reconciled();
    fail = false;
    const r2 = await o.S.reconciled();
    try { o.S.shutdown(); } catch { }
    return { first: r1.done, second: r2.done };
  };
  const Cv = await cRun(KS0);
  const Cx = await cRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "    const p = recBusy || reconcile(recStart ? 'a start of a conversation\\'s browser' : 'start');\n    if (!recStart) recStart = p;", "    if (!recStart) recStart = reconcile('start');\n    const p = recStart;", 'r3786 the start\'s answer for good'), 'kept-sweep-ask-again'));
  ok(Cv.first === false && Cv.second === true && Cx.second === false, '(c) the start\'s reconcile ended unknown; the next wait ASKS AGAIN and is done — RED (the start\'s answer kept for the run): every later start is told «had not finished» and waits for nothing', { Cv, Cx });
  // (d) r4094 ONE BOUND A FLIGHT: the start's reconcile ended UNKNOWN; half an hour later on a PLACED monotonic clock (far past the bound) a
  // resume of a conversation whose binding lives only in its folder's note — its door begins the flight and WAITS for it: its own folder
  const dRun = async (KS) => {
    let fail = true, clock = 1000;
    const K = freshKey(), C = freshConv();
    const dir = noteWorld({ folders: [[K, { key: K, conversation: C, firstAt: 1000 }]], rows: { [K]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
    const o = startOver(dir, KS, { mono: () => clock, listFolders: (d, oo) => (fail ? Promise.resolve({ ok: false, why: 'made-up: the listing timed out on a loaded start' }) : KNM.listFolders(d, oo)) });
    const be = BE.create({ dataDir: dir, homeDir: path.join(dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock'), keptReady: () => o.S.reconciled() });
    const r1 = await o.S.reconciled();   // the start's flight: ended unknown
    fail = false; clock += 30 * 60e3;    // half an hour on the placed clock; the listing answers again
    const r = await be.startKeyOrder({ resumeId: C });
    try { o.S.shutdown(); } catch { }
    return { first: r1.done, own: r.prior === K, code: r.code };
  };
  const Dv = await dRun(KS0);
  const Dx = await dRun(MUT.load('src/server/browser-kept.js', anchored(anchored(KSRC, '  let recFlight = 0, recFlightEnded = 0, recBusySince = 0;\n', '  let recFlight = 0, recFlightEnded = 0, recBusySince = 0, streak0 = 0;\n', 'r3961 the streak\'s field'), '    const left = Math.min(ms, RECONCILE_WAIT_MS - (mono() - recBusySince));', '    if (!streak0) streak0 = mono(); const left = Math.min(ms, RECONCILE_WAIT_MS - (mono() - streak0));', 'r3961 one bound a streak'), 'kept-sweep-streak'));
  ok(Dv.first === false && Dv.own && Dv.code === null && !Dx.own && Dx.code === 'kept_reconcile_unfinished', '(d) ONE BOUND A FLIGHT (r4094): the start\'s reconcile ended unknown; half an hour later (a placed clock that never steps back) the resume\'s door begins a new flight and waits for it — the conversation gets ITS OWN folder, no new browser — RED (one bound a streak, 922cc8494): its wait is the streak\'s remainder, nothing; it reads no binding and would mint a new browser over its own note', { Dv, Dx });
  // (e) r4094 THE LATE DOOR's re-ask is the SAME wait: refused while its flight runs; that flight ended unknown ⇒ its wait is over (it goes
  // on, told by name) — never refused for good while every reconcile ends unknown
  const eRun = async (KS) => {
    const dir = noteWorld({});
    let release; const gateP = new Promise((r) => { release = r; });
    const o = startOver(dir, KS, { listFolders: () => gateP.then(() => ({ ok: false, why: 'made-up: every listing fails' })) });
    const session = { name: 'made-up' };
    const f0 = o.S.reconciled();   // the start's flight, held at its listing
    const first = o.S.startOrder(session);
    release(); await f0;           // that flight ends UNKNOWN
    const second = o.S.startOrder(session);
    try { o.S.shutdown(); } catch { }
    return { first: first.waiting, second: second.waiting, secondDone: second.done };
  };
  const Ev = await eRun(KS0);
  const Ex = await eRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, '      if (asked !== undefined && asked <= recFlightEnded) { lateAsked.delete(h); return { done: false, waiting: false, code: RECONCILE_CODE }; }   // its flight ended unknown: its wait is over\n', '', 'r4094 a re-ask begins a new wait'), 'kept-sweep-late-reask'));
  ok(Ev.first === true && Ev.second === false && Ev.secondDone === false && Ex.second === true, '(e) THE LATE DOOR (r4094): refused while the flight it waits for runs; when that flight ended unknown, the session\'s re-ask is the end of the same wait — it goes on, told by name — RED (each re-ask a new wait): refused again, for good while every reconcile ends unknown', { Ev, Ex });
  const WC2 = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(WC2.includes('keptOrder = await be0.startKeyOrder({ resumeId: resumeAsk });') && WC2.includes("const prior = resumeAsk ? (keptOrder ? keptOrder.prior : be0.priorKeyFor(data.resumeId)) : '';"), 'WIRING: ws-create asks the create\'s door (startKeyOrder) for the wait AND the resume\'s prior key — the door ㉝ (a) drives', null);
}

console.log('㉞ r3961 (4): THE RESTORED BINDING AT THE BOUND (4096 bindings): stamped NOW, and a noted key is never pruned for it — the conversation\'s kept browser stays bound');
async function pruneBoundRun(BBm) {
  const K = freshKey(), C = freshConv(), P = freshKey(), CP = freshConv();
  const by = {};
  for (let i = 0; i < 4095; i++) by[`c-old-${String(i).padStart(5, '0')}-0000-4000-8000-000000000000`] = { key: 'bk-' + (0x00e00000 + i).toString(16).padStart(8, '0'), at: 1000 + i };
  by[CP] = { key: P, at: 1 };   // the OLDEST binding — its key has a note (a kept browser)
  const dir = noteWorld({ folders: [[K, { key: K, conversation: C, firstAt: 500 }], [P, { key: P, conversation: CP, firstAt: 1 }]], bindings: by });
  const bb = BBm.create({ dataDir: dir, log: quiet });
  const S = KS0.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), bindings: bb, log: quiet, sweepEveryMs: 0, thereEveryMs: 0 });
  await S.reconciled();
  const out = { restored: bb.lookup(C) === K, notedKept: bb.lookup(CP) === P, n: Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'browser-env', 'bindings.json'), 'utf8')).byConversation).length };
  try { S.shutdown(); } catch { }
  return out;
}
const N34 = await pruneBoundRun(BB0);
console.log(`    facts: ${JSON.stringify(N34)}`);
ok(N34.restored && N34.notedKept && N34.n === 4096, 'at the bound: the binding made again from the note stays (stamped now), the oldest binding is kept too because its key has a note — the bound evicts the oldest OTHER binding', N34);
const N34x = await pruneBoundRun(MUT.load('src/server/browser-bindings.js', anchored(anchored(BBS4, "      all.byConversation[sid] = { key, at: Math.round(Number(at)) || Date.now() }; out.made++;", "      all.byConversation[sid] = { key, at: Math.round(Number(p[2])) || Date.now() }; out.made++;", 'r3786 stamped with the first time'), "    try { all.byConversation = prune(all.byConversation, protect); writeAll(all); known.clear(); }", "    try { all.byConversation = prune(all.byConversation); writeAll(all); known.clear(); }", 'r3786 nothing protected'), 'kept-sweep-bound-prune'));   // stale-pins: kept (the red copy writes the release's two lines)
ok(!N34x.restored || !N34x.notedKept, 'RED CONTROL (stamped with the folder\'s old first time, nothing protected): the prune evicts the binding just made again, or the noted oldest one — a kept browser left unbound until the sweep ends it — red', N34x);

console.log('㉟ r3961 (5): HOLD 4 — a reconcile over an UNREADABLE note, and one over UNREAD bindings, is UNKNOWN: nothing is removed; the start over an unreadable note is not kept');
{
  const nRun = async (KS) => {
    const A = freshKey();
    const dir = noteWorld({ folders: [[A, null]], rows: { [A]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
    const listFolders = (d, o) => KNM.listFolders(d, o).then((r) => (r && r.ok ? { ...r, dirs: r.dirs.map((x) => (x.name === A ? { ...x, note: 'unreadable', doc: null } : x)) } : r));   // the child's answer for a note it could not open (EACCES)
    const { S, there } = startOver(dir, KS, { listFolders });
    const sw = await S.sweep();
    const out = { state: S._reconcileState(), held: !!(sw && sw.held), kept: S.has(A) && there(A) };
    try { S.shutdown(); } catch { }
    return out;
  };
  const Nv = await nRun(KS0), Nx = await nRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "      if (r.dirs.some((d) => d.note === 'unreadable')) return unfinished(why, 'a folder\\'s note could not be read');\n", '', 'r3786 an unreadable note read as none'), 'kept-sweep-unreadable-note'));
  ok(Nv.state === 'unknown' && Nv.held && Nv.kept && !Nx.kept, 'a folder\'s note the child could not read: the reconcile is unknown, the sweep removes nothing (a row no binding names, past its grace, stays) — RED (an unreadable note read as none): it ends with its folder', { Nv, Nx });
  const uRun = async (KS) => {
    const A = freshKey();
    const dir = noteWorld({ folders: [[A, null]], rows: { [A]: { hasDir: true, startedAt: 1000, stoppedAt: 2000, lastUsedAt: 2000 } } });
    const bfile = path.resolve(path.join(dir, 'browser-env', 'bindings.json'));
    const realRead = fs.readFileSync;
    fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === bfile) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, p, ...a); };
    let out;
    try { const { S, there } = startOver(dir, KS); const ok1 = await S.reconcile('start'); out = { reconciled: ok1, state: S._reconcileState(), kept: S.has(A) && there(A) }; try { S.shutdown(); } catch { } }
    finally { fs.readFileSync = realRead; }
    return out;
  };
  const Uv = await uRun(KS0), Ux = await uRun(MUT.load('src/server/browser-kept.js', anchored(KSRC, "      if (!bb0 || (typeof bb0.state === 'function' && bb0.state() === 'unknown')) return unfinished(why, 'the bindings could not be read');\n", '', 'r3786 the bindings not asked'), 'kept-sweep-bindings-unread'));
  ok(Uv.reconciled === false && Uv.state === 'unknown' && Uv.kept && Ux.state === 'done', 'the bindings unread (EIO): the reconcile is UNKNOWN (never «done» over a fact it could not read), nothing removed — RED (the bindings not asked): the reconcile says done over them', { Uv, Ux });
  const K2 = freshKey(), d2 = noteWorld({});
  const S2 = mkStore(KS0, d2, { noteFs: { ...fs.promises, open: (p, f, m) => (String(p).endsWith(NOTE) ? Promise.reject(Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' })) : fs.promises.open(p, f, m)) } });
  fs.mkdirSync(S2.dirOf(K2), { recursive: true });
  const g = await S2.startGate(K2);
  ok(g.kept === false && g.code === 'kept_note_unreadable' && S2.brief(K2).notKept === 'kept_note_unreadable', 'the start over a note it cannot read (EACCES, placed): NOT kept, by its code — the person\'s card and the agent\'s answer say it', g);
}

console.log('㊱ r3961 (5): THE BOOT SWEEP\'s RULE 2 IN A PROCESS WITH NO LIVE STORE — a folder holding a note file is never removed by age');
async function noStoreRun(BEm) {
  const K = freshKey();
  const dir = noteWorld({ folders: [[K, 'any bytes: a note file the sweep does not judge']], rows: {} });
  twoHoursOld(path.join(dir, 'browser-profiles', K));
  const be = BEm.create({ dataDir: dir, homeDir: path.join(dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(dir, 'sock') });   // no keptKeys, no keptNoted: no live store
  be.sweep(new Set(), { graceMs: 0 });
  return { kept: fs.existsSync(path.join(dir, 'browser-profiles', K, 'Cookies')) };
}
const N36 = await noStoreRun(BE), N36x = await noStoreRun(MUT.load('src/server/browser-env.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8'), "    const noteHeld = (dir) => { try { fs.lstatSync(path.join(dir, require('./browser-kept-note.js').NOTE_NAME)); return true; } catch (e) { return !e || e.code !== 'ENOENT'; } };", '    const noteHeld = () => false;', 'r3786 the note not looked for'), 'kept-sweep-nostore-note'));
ok(N36.kept && !N36x.kept, 'no live store, a valid list with no row, a key-named folder two hours old holding a note file: spared — RED (the note not looked for): removed by its age', { N36, N36x });

console.log('㊲ r3963 (item 6): LAW 4 — a folder a STANDING BINDING names is never removed by age (with no live store, and with one), and it is not left a folder with no row: its note is written and its row made at the reconcile; the folder nothing names still goes');
{
  const scene = () => {
    const A = freshKey(), B = freshKey(), C = freshConv();
    const dir = noteWorld({ folders: [[A, null], [B, null]], bindings: { [C]: { key: A, at: 1000 } }, rows: {} });
    for (const k of [A, B]) twoHoursOld(path.join(dir, 'browser-profiles', k));
    return { A, B, C, dir };
  };
  const BESRC6 = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  const BEred = MUT.load('src/server/browser-env.js', anchored(BESRC6, ' || (boundNow && boundNow.has(key))', '', 'r3786 the sweep asks no binding'), 'kept-sweep-bound-folder');
  // (i) NO live store in the process (a fresh browser-env over the data)
  const noStore = (BEm) => { const s = scene(); const be = BEm.create({ dataDir: s.dir, homeDir: path.join(s.dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(s.dir, 'sock') }); be.sweep(new Set(), { graceMs: 0 }); return { bound: fs.existsSync(path.join(s.dir, 'browser-profiles', s.A, 'Cookies')), other: fs.existsSync(path.join(s.dir, 'browser-profiles', s.B, 'Cookies')) }; };
  const I = noStore(BE), Ix = noStore(BEred);
  ok(I.bound && !I.other && !Ix.bound, '(i) no live store: the folder the binding names is spared; the folder nothing names goes (the control) — RED (today\'s sweep, no binding asked): BOTH removed', { I, Ix });
  // (ii) a START: fresh bindings, a fresh store, a fresh boot sweep wired to its verdict, over the same data
  const withStore = async (KS) => {
    const s = scene();
    const dir = restartCopy(s.dir);
    for (const k of [s.A, s.B]) twoHoursOld(path.join(dir, 'browser-profiles', k));   // the copy keeps the folders' old time
    const o = startOver(dir, KS);
    const t0 = Date.now();
    await o.S.reconciled();
    o.be.sweep(new Set(), { graceMs: 0 });
    const note = noteOf(path.join(dir, 'browser-profiles', s.A));
    const e = o.S.get(s.A);
    const out = { row: o.S.has(s.A), note: !!note && note.key === s.A && note.conversation === s.C, bound: o.bb.lookup(s.C) === s.A, kept: o.there(s.A), other: o.there(s.B), last: e ? e.lastUsedAt : null, t0 };
    try { o.S.shutdown(); } catch { }
    return out;
  };
  const II = await withStore(KS0);
  const IIx = await withStore(MUT.load('src/server/browser-kept.js', anchored(KSRC, "          const w = await KN.ensureNote(path.join(PROFILE_DIR, d.name), d.name, sid, { timeoutMs: noteWriteMs, now: () => d.mtimeMs || now(), ...(noteFs ? { fsp: noteFs } : {}) });", '          const w = null;', 'r3786 no note for a bound folder'), 'kept-sweep-bound-note'));
  ok(II.row && II.note && II.bound && II.kept && !II.other && !IIx.row && !IIx.note, '(ii) a start over the same data: the reconcile gives the bound folder its NOTE (true to its folder, the binding\'s conversation) and its ROW; the boot sweep spares it, removes the folder nothing names — RED (no note for a bound folder): it stays a folder with no row and no note', { II, IIx });
  // (iii) r4094 (the coordinator's ruling): the SIZE BOUND may remove a bound, measured, ordinary row, least recently used first — but a row the
  // REPAIR made is last used at the repair, never first in that line by its folder's old time
  const firstOut = (x) => { if (!x.last) return null; const other = freshKey(); const pl = KB.keptRetentionPlan({ entries: [{ key: 'bk-0000a001', bytes: 10 * KB.MB, cacheBytes: 0, lastUsedAt: x.last }, { key: other, bytes: 10 * KB.MB, cacheBytes: 0, lastUsedAt: Date.now() - 3600e3 }], perConversation: 100 * KB.MB, total: 15 * KB.MB }); return pl.remove.length ? (pl.remove[0].key === 'bk-0000a001' ? 'the repaired row' : 'the other row') : 'none'; };
  const III = await withStore(MUT.load('src/server/browser-kept.js', anchored(KSRC, 'last = repaired.has(k) ? now() : Math.max(n.firstAt, n.mtimeMs || 0);', 'last = Math.max(n.firstAt, n.mtimeMs || 0);', 'r3963 the repaired row stamped with its folder\'s time'), 'kept-sweep-repair-stamp'));   // stale-pins: kept (the red: the folder's old time)
  ok(II.last >= II.t0 && firstOut(II) === 'the other row' && III.row && III.last < III.t0 && firstOut(III) === 'the repaired row', '(iii) the repaired row is last used AT THE REPAIR: over the total, the least recently used OTHER row goes first — RED (its folder\'s old time): the repaired row is first in the size bound\'s line', { II: { last: II.last, t0: II.t0, first: firstOut(II) }, III: { last: III.last, t0: III.t0, first: firstOut(III) } });
}

console.log('⑭b r3961 (5): THE BINDINGS\' REBUILD CHILD starts with the allowlisted environment');
{
  const envRun = async (BBm) => {
    const w = bindWorld({ bytes: '{"v":1,"byConversation":{"z', metas: [{ browserKey: KEYS[0], claudeSessionId: CONVS[0], browserKeyFor: CONVS[0] }] });
    const calls = [];
    process.env.VS_LEG_MADEUP_TOKEN = 'vsst_s1';
    let bb;
    try {
      bb = BBm.create({ dataDir: w.dir, log: quiet, execFileImpl: (cmd, args, opts, cb) => { calls.push(opts); return realExecFile(cmd, args, opts, cb); } });
      try { bb.boundKeys(); } catch { /* torn */ }
      await until(() => calls.length > 0 && !hb(bb));
    } finally { delete process.env.VS_LEG_MADEUP_TOKEN; }
    const o = calls[0] || {};
    const allow = new Set(Object.keys(require(path.join(REPO, 'src/agent-env.js')).serviceEnv({ ...process.env, VS_LEG_MADEUP_TOKEN: 'x' })));
    return { env: o.env ? Object.keys(o.env).every((k) => allow.has(k)) && !('VS_LEG_MADEUP_TOKEN' in o.env) : 'the hub\'s whole environment' };
  };
  const E = await envRun(BB0), Ex = await envRun(MUT.load('src/server/browser-bindings.js', anchored(BBS4, ", env: require('../agent-env.js').serviceEnv(process.env) }, (err, stdout) => {", ' }, (err, stdout) => {', 'r3786 the rebuild child with no env'), 'kept-sweep-meta-env'));
  ok(E.env === true && Ex.env !== true, 'the rebuild\'s child (the conversations\' records) gets the allowlist only — RED (no env): the hub\'s whole environment, a made-up token with it', { E, Ex });
}

console.log('㊳ r3961 (5): THE PERSON\'s TWO SENTENCES WHERE THEY ARE DRAWN — the chat card of the conversation\'s own browser (both phases) and its live view, from THE fact');
{
  const CR = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8'), LW = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const CARD = "    { const w = this._browserStartNote(b); if (w) { const g = document.createElement('div'); g.className = 'chat-browser-session-note chat-status-dim'; g.textContent = w; el.appendChild(g); } }";
  // drawn for BOTH phases: after the head, before the end card's branch — never inside it (the start card says it too)
  const cardBoth = (x) => { const i = x.indexOf(CARD), h = x.indexOf('    el.appendChild(head);'), e = x.indexOf("    if (b.phase === 'end') {", h); return i > h && h > 0 && i < e && x.includes('return startNoteWords(fact, t);'); };
  const LIVE = '    renderKeptNote();   // r3786: every move of the fact or the status asks it again';
  const liveDrawn = (x) => { const r = x.indexOf('  function renderResume() {'); return r > 0 && x.indexOf(LIVE, r) === x.indexOf('\n', r) + 1 && x.includes('  shareLine.after(keptNoteLine);') && x.includes('const words = own ? startNoteWords(f, t) : \'\';'); };
  const cardRed = anchored(CR, CARD, '', 'r3786 the card draws nothing').replace("    if (b.phase === 'end') {\n", "    if (b.phase === 'end') {\n" + CARD + '\n');   // moved into the end card only
  ok(cardBoth(CR) && !cardBoth(cardRed) && liveDrawn(LW) && !liveDrawn(anchored(LW, LIVE + '\n', '', 'r3786 the live view never asks')), 'the chat card draws «Not kept…» (its two reasons) from THE fact in BOTH its phases (RED: moved into the end card only — the start card would say nothing); the live view asks it at every move of the fact and draws it under its share line (RED: never asked)', null);
  const f = (n) => BF.startNoteWords({ own: { startNote: n } });
  ok(/^Not kept: its sign-ins end with it — the note/.test(f('not-kept')) && /^Not kept: its sign-ins end with it — VibeSpace had not finished reading/.test(f('not-kept-reconcile')) && f('before-reconcile') === '' && f(null) === '', 'the two sentences themselves (THE fact\'s words, r4099: hold 5\'s words both): «Not kept: its sign-ins end with it — the note …» and «… — VibeSpace had not finished reading …»; no «A new browser» any more; nothing for a start that was kept', null);   // stale-pins: kept (a deliberate absence: no «A new browser» phase)
  const fk = (code) => BF.browserFactFor({ browserKey: freshKey(), variant: BF.MANAGED_RUNGS[0] }, { kept: { tabs: 0, kind: 'not-kept', notKept: code }, now: Date.now() }).own.startNote;
  ok(fk('kept_reconcile_unfinished') === 'not-kept-reconcile' && fk('kept_note_timeout') === 'not-kept', 'THE fact names which: a browser handed past the bound → its own sentence; a note not written → hold 5\'s', null);
}

console.log('㊴ r4099: PAST ITS BOUND A DOOR HANDS A BROWSER THAT IS NOT KEPT — no binding, no note naming the conversation; the reconcile, when it at last reads the conversation\'s OWN note, binds that folder into the empty place; a sweep past the grace keeps it and ends the not-kept one');
{
  const BKr = require(path.join(REPO, 'src/server/browser-key.js'));
  const BPr = require(path.join(REPO, 'src/browser-profiles.js'));
  // the scene (the verifier's scene 3): a conversation's ONLY fact on disk is its old kept folder's note (no row, no binding); the start's
  // reconcile hangs at its listing; a placed monotonic clock passes the flight's bound; the wall clock passes the grace for the sweep
  const scene = () => {
    const OLD = freshKey(), C = freshConv();
    const dir = noteWorld({ folders: [[OLD, { key: OLD, conversation: C, firstAt: 1000 }]] });
    let release; const gateP = new Promise((r) => { release = r; });
    const clocks = { mono: 1000, wall: Date.now() };   // the wall clock near the folders' own times (the rows read them)
    const o = startOver(dir, KS0, { mono: () => clocks.mono, now: () => clocks.wall, graceMs: 60000, listFolders: (d, oo) => gateP.then(() => KNM.listFolders(d, oo)) });
    return { OLD, C, dir, o, release, clocks };
  };
  // the keeper's start of a handed key (its gate; the run and stop it tells the store, on its kept folder only when kept), then the
  // listing answers, then a sweep past the grace and the boot sweep
  const ending = async (s, NEW, f0) => {
    const g = NEW ? await s.o.S.startGate(NEW) : null;
    if (NEW) { fs.mkdirSync(s.o.S.dirOf(NEW), { recursive: true }); if (g.kept) fs.writeFileSync(path.join(s.o.S.dirOf(NEW), 'Cookies'), 'a sign-in in the new one'); s.o.S.noteStart(NEW, { hasDir: !!g.kept }); s.o.S.noteStop(NEW, { why: 'idle', hasDir: !!g.kept }); }
    s.release(); await f0;
    const boundTo = s.o.bb.lookup(s.C);
    s.clocks.wall += 3 * 3600e3;
    await s.o.S.sweep();
    s.o.be.sweep(new Set(), { graceMs: 0 });
    const out = { gate: g ? g.kept : null, noteNew: NEW ? fs.existsSync(path.join(s.o.S.dirOf(NEW), NOTE)) : null, bound: boundTo === s.OLD ? 'its OWN old browser' : boundTo && boundTo === NEW ? 'the NEW browser' : boundTo || 'none', oldLeft: fs.existsSync(path.join(s.dir, 'browser-profiles', s.OLD, 'Cookies')), newLeft: NEW ? fs.existsSync(s.o.S.dirOf(NEW)) : null };
    try { s.o.S.shutdown(); } catch { }
    return out;
  };
  // (i) THE LATE DOOR (browser-key.js ensureBrowserKey, a live session's first browser command), the product's door over the leg's store;
  // a persisted key goes through its stand-in of the ONE choke point (the session's record binds it)
  const lateRun = async (BKm) => {
    const s = scene();
    const session = { claudeSessionId: s.C, cwd: s.dir, name: 'made-up' };
    const recorded = [];
    const persistMeta = (x, patch) => { recorded.push(patch.browserKey); s.o.bb.record(s.C, patch.browserKey); };
    const keys = BKm.create({ browserEnv: () => s.o.be, keeper: () => ({ keptStore: () => s.o.S }), activeSessions: new Map([['sess-made-up-1', session]]), persistMeta, readMeta: () => ({ webuiSessionId: 'sess-made-up-1', claudeSessionId: s.C }), log: quiet });
    const f0 = s.o.S.reconciled();   // the start's flight: its listing hangs
    const inside = keys.ensureBrowserKey(session, { sessionId: 'sess-made-up-1' });
    s.clocks.mono += 25_000;         // past the flight's bound
    const past = keys.ensureBrowserKey(session, { sessionId: 'sess-made-up-1' });
    const NEW = past.ok && past.key !== s.OLD ? past.key : null;
    const told = NEW ? s.o.S.takeStartNote(NEW) : null, card = NEW ? s.o.S.brief(NEW) : null;
    return { inside: inside.ok ? 'handed' : inside.why, handed: !!NEW, recorded: recorded.length, told, card: card && card.kind, ...(await ending(s, NEW, f0)) };
  };
  const Lv = await lateRun(BKr);
  const Lx = await lateRun(MUT.load('src/server/browser-key.js', anchored(BKS, '    const notKeptNow = !!(order && order.done === false);\n', '    const notKeptNow = false;\n', 'r4094 the mint, kept and in the record'), 'kept-sweep-late-mint'));
  ok(Lv.inside === 'kept_reconciling' && Lv.handed && Lv.recorded === 0 && Lv.told === 'kept_reconcile_unfinished' && Lv.card === 'not-kept' && Lv.gate === false && Lv.noteNew === false && Lv.bound === 'its OWN old browser' && Lv.oldLeft && Lv.newLeft === false
    && Lx.bound === 'the NEW browser' && !Lx.oldLeft,
    '(i) THE LATE DOOR: refused by name inside the bound; past it the browser handed is NOT KEPT (written into no record, so no binding; its start writes no note; the agent told once, the card «not kept»); the reconcile then binds the conversation\'s OWN old folder, and a sweep past the grace keeps its sign-ins and ends the not-kept one — RED (today\'s mint, its key in the session\'s record): the mint takes the conversation\'s place, the old folder «moved on» and its sign-ins are removed', { Lv, Lx });
  // (ii) THE CREATE's DOOR (browser-env startKeyOrder, the one ws-create asks) past its bound: the order it answers, then ws-create's own rule
  // for the key it mints there (read in its text below: told, NOT KEPT, written into no record) — the store's half run here
  const createRun = async (recordIt) => {
    const s = scene();
    const be = BE.create({ dataDir: s.dir, homeDir: path.join(s.dir, 'home'), serverSetting: () => undefined, log: quiet, socketDirBase: path.join(s.dir, 'sock'), keptReady: () => s.o.S.reconciled() });
    const f0 = s.o.S.reconciled();
    s.clocks.mono += 25_000;
    const r = await be.startKeyOrder({ resumeId: s.C });
    const bk = BPr.browserKeyFor({ prior: r.prior, resume: true, fork: false, mint: BKr.mintKey });
    if (!recordIt && bk.origin === 'resume-unknown' && r.code) s.o.S.noteStartCode(bk.key, r.code);   // ws-create's rule (its text below): told, NOT KEPT
    if (recordIt) s.o.bb.record(s.C, bk.key);   // the create before r4099: its key in the session's record (the choke point binds it), kept
    return { order: r.code, origin: bk.origin, ...(await ending(s, bk.key, f0)) };
  };
  const Cv2 = await createRun(false), Cx2 = await createRun(true);
  ok(Cv2.order === 'kept_reconcile_unfinished' && Cv2.origin === 'resume-unknown' && Cv2.gate === false && Cv2.noteNew === false && Cv2.bound === 'its OWN old browser' && Cv2.oldLeft && Cv2.newLeft === false && Cx2.bound === 'the NEW browser' && !Cx2.oldLeft,
    '(ii) THE CREATE\'s DOOR past its bound: a resume-unknown key, NOT KEPT and in no record — the reconcile binds the conversation\'s own folder, the sweep keeps it — RED (the key in the record): the old folder ends', { Cv2, Cx2 });
  const WC4 = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const R1 = 'spawnKeyNotKept = true; try { liveKeptStore()?.noteStartCode?.(bk.key, keptOrder.code); }', R2 = '            ...(spawnKeyNotKept ? { browserKey: undefined, browserKeyFor: undefined } : {}),\n          });';
  const createRule = (x) => x.includes(R1) && x.includes(R2) && x.indexOf(R2) > x.indexOf('            browserKey: session._browserKey || undefined,');
  ok(createRule(WC4) && !createRule(anchored(WC4, R2, '          });', 'r4094 the create\'s key in its record')), 'WIRING: ws-create, past its bound, tells, marks the key NOT KEPT, and its record drops the key (after the field that writes it) — RED (the key in the record)', null);
  // the SECOND BELT: the bindings' ONE writer (record) binds no key the note module marks not kept — whoever writes a record with it
  const beltRun = (BBm) => { const dir = noteWorld({}); const bb = BBm.create({ dataDir: dir, log: quiet }); const k = freshKey(), C = freshConv(); KNM.markNotKept(k); const r = bb.record(C, k); return { refused: r === false, bound: bb.lookup(C) || '' }; };
  const Bt = beltRun(BB0), Btx = beltRun(MUT.load('src/server/browser-bindings.js', anchored(BBS4, "    try { if (require('./browser-kept-note.js').isNotKept(key)) return false; } catch { /* the module says its own */ }\n", '', 'r4094 the writer binds any key'), 'kept-sweep-belt'));
  ok(Bt.refused && Bt.bound === '' && Btx.bound !== '', 'the bindings\' writer binds no key handed past the bound (a second belt beside the doors) — RED (no belt): a record with that key takes the conversation\'s place', { Bt, Btx });
}

report();
