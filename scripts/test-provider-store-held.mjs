#!/usr/bin/env node
// PROVIDERS.JSON UNDER THE STORE-READ LAW (B-f276 family, lane lg-providers — 主开发 r3000 / r3019; the store census of lane
// bl-machines-b, its item 1). The real provider store over a scratch data folder and a real vault; the unreadable file by a PLACED
// refusal of the read calls (this process's fs, never a mount or a mode change), torn bytes written by the leg, made-up values only.
//   ① a refused read HOLDS: the list answers unread, every change is refused by name, NOTHING is written over the file, a conversation
//     that names a provider is refused by name (never «removed», never another one), its model too; read again ⇒ the records back
//   ② a START while held reads the same file again (still held while it fails; whole when it reads)
//   ③ torn bytes are kept aside ONCE, then the list starts empty — and THE REMOVER BY ITS SILENCE (the Vault row's Remove of an
//     «orphaned» key) removes ZERO of the keys the torn list named; a true orphan is still removed
//   RED COPIES: a store without the hold writes over the file; a remover without the kept copy's check drops a named key.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const M = mutantCopies('provider-store-held', REPO);
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const PS = require(path.join(REPO, 'src/server/provider-store.js'));
const PSP = require(path.join(REPO, 'src/server/provider-spawn.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/server/provider-store.js'), 'utf8');
const KEY = ['sk-', 'held', '-store', '-provider-', 'b5e1a7'].join('');   // built at runtime (never a token-shaped literal)
const quiet = { log() {}, warn() {}, error() {} };
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function place(tag, Store = PS) {
  const DATA = scratchDir('provider-store-held-' + tag);
  const vault = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, register: false });
  await vault.setup('correct horse battery staple', {});
  const s0 = Store.create({ dataDir: DATA, vault: () => vault, log: () => {} });
  const a = (await s0.add({ preset: 'deepseek', key: KEY, label: 'Router A' })).provider;
  const b = (await s0.add({ preset: 'deepseek', key: KEY, label: 'Router B' })).provider;
  const file = path.join(DATA, 'providers.json');
  return { DATA, vault, file, a, b, before: fs.readFileSync(file, 'utf8') };
}
/** a PLACED refusal of the file's reads (sync and async), lifted by the leg */
function refuseReads(file) {
  const realSync = fs.readFileSync, realAsync = fs.promises.readFile;
  const eio = () => Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
  fs.readFileSync = function (p, ...rest) { if (String(p) === file) throw eio(); return realSync.call(this, p, ...rest); };
  fs.promises.readFile = function (p, ...rest) { if (String(p) === file) return Promise.reject(eio()); return realAsync.call(this, p, ...rest); };
  return () => { fs.readFileSync = realSync; fs.promises.readFile = realAsync; };
}
const idsIn = (file) => { try { return (JSON.parse(fs.readFileSync(file, 'utf8')).providers || []).map((r) => r.id); } catch { return null; } };

console.log('— ① a refused read HOLDS');
{
  const w = await place('eio');
  const lift = refuseReads(w.file);
  let lifted = 0;
  const s = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {}, onLift: () => { lifted++; } });
  const words = s.unread();
  const add = await s.add({ preset: 'deepseek', key: KEY, label: 'Router C' });
  const put = s.put({ preset: 'deepseek', label: 'Router D', baseUrl: null });
  const rm = await s.remove(w.a.id);
  const spawn = PSP.create({ providers: s, dataDir: w.DATA });
  let refused = null; try { spawn(w.a.id, 'claude', {}); } catch (e) { refused = e; }
  const model = PSP.modelFor(s, w.a.id, null, 'claude');
  lift();
  const unchanged = fs.readFileSync(w.file, 'utf8') === w.before;
  ok(!!words && /could not be read/.test(words) && s.thirdParty().length === 0 && add.code === 'providers_unread' && put.code === 'providers_unread' && rm.code === 'providers_unread'
    && !!refused && refused.code === 'providers_unread' && !/removed/.test(refused.message) && model.code === 'providers_unread' && unchanged && s.readClean() === false,
    '① held: the list answers UNREAD (words, never «none»); an add, a put and a remove are refused by name; a conversation that names a provider is refused BY NAME (providers_unread — never «it was removed», never another one), its model too; the file is byte-for-byte what it was',
    { words, add: add.code, put: put.code, rm: rm.code, refused: refused && refused.code, model: model.code, unchanged });
  // the read again (the hold's own ladder — asked now through a fresh read by the helper's timer is 30 s; a restart is ②)
  const s2 = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });
  ok(s2.unread() === null && s2.thirdParty().length === 2 && idsIn(w.file).length === 2 && lifted === 0, '…the read answers again (a start): the two records are back, nothing was lost', { listed: s2.thirdParty().length });
}

console.log('— ② a start while held');
{
  const w = await place('restart');
  const lift = refuseReads(w.file);
  const s1 = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });
  const s2 = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });   // a restart while the read still fails
  const stillHeld = !!s1.unread() && !!s2.unread();
  lift();
  const s3 = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });
  ok(stillHeld && s3.unread() === null && s3.thirdParty().length === 2, '② a start while the read fails holds AGAIN (nothing was written in between); the first start that reads has every record', { stillHeld, s3: s3.thirdParty().length });
}

console.log('— ③ torn bytes: kept aside once, then empty — the remover by its silence removes ZERO');
{
  const w = await place('torn');
  fs.writeFileSync(w.file, w.before.slice(0, w.before.length - 3));   // torn at its end: both records' ids still in the bytes, the JSON unclosed
  let lifted = 0;
  const s = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {}, onLift: () => { lifted++; } });
  await settle(120);
  const copies = fs.readdirSync(w.DATA).filter((n) => n.startsWith('providers.json.corrupt-'));
  const s2 = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });   // a restart over the SAME torn bytes
  await settle(120);
  const copies2 = fs.readdirSync(w.DATA).filter((n) => n.startsWith('providers.json.corrupt-'));
  const named = await s.remove(w.a.id), named2 = await s.remove(w.b.id);
  const keysKept = s.hasKey(w.a.id) && s.hasKey(w.b.id);
  // a TRUE orphan (named by no record and no kept copy) is still the Vault row's to remove
  const orphanId = 'pv-' + 'f'.repeat(12);
  w.vault.secretPut(require(path.join(REPO, 'src/model-providers.js')).keyEntryOf(orphanId), KEY);
  const orphan = await s.remove(orphanId);
  ok(lifted === 1 && copies.length === 1 && copies2.length === 1 && s.unread() === null && s.thirdParty().length === 0
    && named.code === 'providers_torn_named' && named2.code === 'providers_torn_named' && /^providers\.json\.corrupt-/.test(String(named.copy)) && !/providers\.json|corrupt-/.test(named.error) && keysKept && orphan.ok === true && orphan.orphan === true,
    '③ torn bytes are kept aside ONCE (a restart over the same bytes makes no second copy), then the list starts empty; the Vault row\'s Remove of a key the torn list named is REFUSED by name (the copy named in the answer\'s `copy`, never a file name in its words) — ZERO removed; a true orphan is still removed',
    { lifted, copies, copies2, named: named.code, keysKept, orphan });
}

console.log('— RED COPIES');
{
  const NOHOLD = "  const heldNo = (what) => (hold.held() ? { ok: false, code: 'providers_unread', error: hold.refusal(what).message } : null);";
  const NOSAVE = "  function save() { if (!hold.writable('a provider change')) return; W().dirty(";
  const cut = anchored(anchored(SRC, NOHOLD, '  const heldNo = () => null;', 'no door refuses while held'), NOSAVE, '  function save() { W().dirty(', 'the save writes while held');
  const P2 = M.load('src/server/provider-store.js', cut, 'no-hold');
  const w = await place('red-hold');
  const lift = refuseReads(w.file);
  let s; try { s = P2.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} }); } finally { lift(); }
  await s.add({ preset: 'deepseek', key: KEY, label: 'Router C' });
  const after = idsIn(w.file) || [];
  ok(!after.includes(w.a.id) && after.length === 1, 'CONTROL: a store without the hold writes ONLY the new record over the file after a refused read ⇒ ① goes RED', after);
  const NOCOPY = "        const kept = await keptCopyNaming(id);";
  const P3 = M.load('src/server/provider-store.js', anchored(SRC, NOCOPY, '        const kept = null;', 'the remover reads no kept copy'), 'no-copy-check');
  const w3 = await place('red-remover', P3);
  fs.writeFileSync(w3.file, w3.before.slice(0, w3.before.length - 3));
  const s3 = P3.create({ dataDir: w3.DATA, vault: () => w3.vault, log: () => {} });
  await settle(120);
  const r3 = await s3.remove(w3.a.id);
  ok(r3.ok === true && r3.orphan === true && !s3.hasKey(w3.a.id), 'CONTROL: a remover that reads no kept copy drops the key the torn list named ⇒ ③ goes RED', r3);
}

report();
