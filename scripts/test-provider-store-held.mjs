#!/usr/bin/env node
// PROVIDERS.JSON UNDER THE STORE-READ LAW (B-f276 family, lane lg-providers — 主开发 r3000 / r3019; the store census of lane
// bl-machines-b, its item 1). The real provider store over a scratch data folder and a real vault; the unreadable file by a PLACED
// refusal of the read calls (this process's fs, never a mount or a mode change), torn bytes written by the leg, made-up values only.
//   ① a refused read HOLDS: the list answers unread, every change is refused by name, NOTHING is written over the file, a conversation
//     that names a provider is refused by name (never «removed», never another one), its model too; read again ⇒ the records back
//   ② a START while held reads the same file again (still held while it fails; whole when it reads)
//   ③ torn bytes are kept aside ONCE, then the list starts empty — and THE REMOVER BY ITS SILENCE (the Vault row's Remove of an
//     «orphaned» key) removes ZERO of the keys the torn list named; a true orphan is still removed
//   ④ (r3106) the damaged list said (the kept bytes named), a lost provider's conversation told so, the old key removed by a
//     CONFIRMED press only; ⑤ every provider door while held answers the hold's words
//   ⑥ (r3216) the usage door answers each kind in its one catch (the accounts list's, the provider list's held, its no-holds, a login)
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

console.log('— ④ the damaged list said, the old key removed by a confirmed press (r3106)');
{
  const w = await place('damaged');
  fs.writeFileSync(w.file, w.before.slice(0, w.before.length - 3));
  const s = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} });
  await settle(120);
  const dmg = s.damaged();
  const spawn = PSP.create({ providers: s, dataDir: w.DATA });
  let lost = null; try { spawn(w.a.id, 'claude', {}); } catch (e) { lost = e; }
  const lostModel = PSP.modelFor(s, w.a.id, null, 'claude');
  ok(!!dmg && /^providers\.json\.corrupt-/.test(dmg.copy) && !!lost && lost.code === 'providers_damaged' && /was damaged/.test(lost.message) && !/removed/.test(lost.message) && lostModel.code === 'providers_damaged' && !/removed/.test(lostModel.message),
    '④ torn bytes lifted EMPTY: the store says the list WAS DAMAGED and names the kept bytes; a conversation naming a provider it held is told the list was damaged (providers_damaged) — never «it was removed»', { dmg, lost: lost && lost.code, model: lostModel.code });
  const refusedFirst = await s.remove(w.a.id);
  const confirmed = await s.remove(w.a.id, { keptCopyOk: true });
  ok(refusedFirst.code === 'providers_torn_named' && /new provider to VibeSpace with a NEW key/.test(refusedFirst.error) && !/[Rr]estore/.test(refusedFirst.error) && confirmed.ok === true && confirmed.orphan === true && !s.hasKey(w.a.id) && s.hasKey(w.b.id),
    '④ …the old key the damaged list names: the first Remove says the truth (a provider added again has a NEW key — nothing to restore) and keeps it; a CONFIRMED Remove removes that one key only', { first: refusedFirst.code, confirmed });
  const fresh = PS.create({ dataDir: scratchDir('provider-store-held-clean'), vault: () => w.vault, log: () => {} });
  ok(fresh.damaged() === null, '④ …a list that read (or was absent) is not «damaged»');
}

console.log('— ⑤ every provider door while held answers the hold\'s words (r3106 (3) (4) (5))');
{
  const w = await place('doors');
  const lift = refuseReads(w.file);
  let s; try { s = PS.create({ dataDir: w.DATA, vault: () => w.vault, log: () => {} }); } finally { lift(); }
  const R = require(path.join(REPO, 'src/routes/providers.js'));
  const uses = [];
  const app = { use: (p, f) => uses.push([p, f]), get() { }, post() { }, put() { }, patch() { }, delete() { } };
  R.registerProviderRoutes(app, { providers: s });
  const answer = (method, sub) => { let out = null; const res = { set() { return res; }, status(c) { out = { status: c }; return res; }, json(b) { out = { ...(out || {}), body: b }; return res; } };
    for (const [p, f] of uses) { if (p !== '/api/providers') continue; let go = false; f({ method, path: sub, query: {} }, res, () => { go = true; }); if (!go) return out; } return { passed: true }; };
  const del = answer('DELETE', '/' + w.a.id), refresh = answer('POST', '/' + w.a.id + '/models/refresh'), list = answer('POST', '/list');
  ok(del && del.status === 503 && del.body.code === 'providers_unread' && del.body.error === R.PROVIDERS_UNREAD_WORDS && refresh && refresh.status === 503 && list && list.passed === true,
    '⑤ held: a provider door (the Vault row\'s Remove, a models refresh) answers 503 providers_unread with the hold\'s words — never «unknown provider»; the list still answers (unread)', { del, refresh, list });
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const WS = read('src/ws-create.js'), DOOR = read('src/server/cli-usage-door.js'), AM = read('src/routes/account-models.js'), PM = read('src/routes/provider-models.js'), VW = read('src/lib/vault-window.js');
  ok(WS.includes("if (/^(provider-|providers_|vault_|key-unreadable|no-key)/.test(String(e && e.code || '')))") && DOOR.includes("if (e && /^providers_/.test(String(e.code || ''))) return { ok: false, status: e.code === 'providers_unread' ? 503 : 409, code: e.code, error: e.message };")
    && AM.includes("if (heldFor(String(req.params.id))) return res.status(503).json({ error: UNREAD_WORDS, code: 'providers_unread' });") && AM.includes("if (r.code === 'providers_unread') return res.status(503)")
    && PM.includes("if (/^pv-/.test(id) && typeof providers.unread === 'function' && providers.unread()) return res.status(503)") && VW.includes("reason: heldWordsOf(r) ||"),
    '⑤ …the create\'s last-resort pass carries providers_* by its code (never «log it in again»), the usage door answers it (never «login needed»), the models routes answer the hold\'s words, the Vault row\'s refusal is worded by heldWordsOf (zh / ja)');
}

console.log('— ⑥ the usage door answers each kind of refusal in its ONE catch (r3216: the move onto the hotfix trial)');
{
  const DM = require(path.join(REPO, 'src/server/cli-usage-door.js'));
  const named = (code) => Object.assign(new Error('placed: ' + code), { code });
  const throwsFor = { 'a-acc': named('accounts_unread'), 'a-pvu': named('providers_unread'), 'a-pvd': named('providers_damaged'), 'a-pvt': named('providers_torn_named'), 'a-login': new Error('not signed in') };
  const accounts = { get: (id) => (throwsFor[id] ? { id, backend: 'claude' } : null), resolveForSpawn: (id) => { throw throwsFor[id]; } };
  const harnessOf = () => ({ label: 'Claude Code', quota: { onDemand: { argv: ['usage'], judge: () => ({ verdict: 'reading' }) } } });
  const door = DM.createCliUsageDoor({ accounts, harnessOf, cliCmds: { check: async () => '/bin/true' }, cacheDir: scratchDir('provider-store-held-door'), log: () => {} });
  const got = {};
  for (const id of Object.keys(throwsFor)) { const r = await door.read(id, { person: true }); got[id] = [r.status, r.code]; }
  ok(JSON.stringify(got) === JSON.stringify({ 'a-acc': [503, 'accounts_unread'], 'a-pvu': [503, 'providers_unread'], 'a-pvd': [409, 'providers_damaged'], 'a-pvt': [409, 'providers_torn_named'], 'a-login': [409, 'login-needed'] }),
    '⑥ the usage door, ONE catch: the accounts list held ⇒ 503 accounts_unread (that unit\'s answer, unchanged); the provider list held ⇒ 503 providers_unread; the two provider codes that are no holds ⇒ 409 by their code; any other refusal ⇒ 409 login-needed', got);
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
  const NOCOPY = "        const kept = keptCopyOk ? null : await keptCopyNaming(id);";
  const P3 = M.load('src/server/provider-store.js', anchored(SRC, NOCOPY, '        const kept = null;', 'the remover reads no kept copy'), 'no-copy-check');
  const w3 = await place('red-remover', P3);
  fs.writeFileSync(w3.file, w3.before.slice(0, w3.before.length - 3));
  const s3 = P3.create({ dataDir: w3.DATA, vault: () => w3.vault, log: () => {} });
  await settle(120);
  const r3 = await s3.remove(w3.a.id);
  ok(r3.ok === true && r3.orphan === true && !s3.hasKey(w3.a.id), 'CONTROL: a remover that reads no kept copy drops the key the torn list named ⇒ ③ goes RED', r3);
}

report();
