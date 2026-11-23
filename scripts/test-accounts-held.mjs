#!/usr/bin/env node
// THE B-f276 FAMILY'S GRAVEST STORE (lane bl-windows, 主开发 r2947 / r3043 — the list's part): data/accounts.json under THE STORE READ on
// the family's helper (src/store-read-hold.js). The release read ANY failure as a fresh install; the first adding save wrote its one row
// over the file; a start with no pick ran on the machine's own login. Each leg with its red control (the faults PLACED at the fs calls;
// the read again driven through the helper's own `again`):
//   ① a failed read at the start HOLDS the list: no save writes over it. RED: the release's start — an add writes ONE row over the file.
//   ② every adding and changing act is refused BY NAME (accounts_unread, 503). RED: no refusal — the add answers «done» over nothing.
//   ③ the list carries `held` (never an empty list as a fact); ONE For-you notice, closed when the file reads. REDS: the list without
//     it; a notice at every ask.
//   ④ the read again ADOPTS the file: every account and the default back, the change pushed. RED: a lift that adopts nothing.
//   ⑤ torn bytes: kept aside ONCE (a restart makes no second copy) and HELD — never lifted as empty (removers read this list's
//     silence, r3019). RED: lifted as empty once copied — the list reads «none» as a fact.
//   ⑥ a restart while held is held again. RED: no guard at the save — the held life's EMPTY list is the next life's fact.
//   ⑦ THE MONEY: a start with no pick, with a pick, a codex start — refused by name, never the machine's own login; «this machine's
//     login» asked by the person stays theirs. RED: no refusal at the spawn door — the default resolves to the machine login.
//     ws-create's resume: the refusal before the «deleted account» degrade, and the held words never say «unknown account».
//   ⑧ r3104 (a): every road that looks an account up (a rename, a pool, the tails) answers the hold's words. RED: no guard.
// In-process: the real store over scratch data dirs; no CLI, no vendor, no network.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('acct-held');
const { ok, report } = checker();
const AM0 = require(path.join(REPO, 'src/accounts.js'));
const ASRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
const MUT = mutantCopies('acct-held', REPO);
const cut = (from, to, why, tag) => MUT.load('src/accounts.js', anchored(ASRC, from, to, why), tag);
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };
const quietA = async (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const stand = (code) => Object.assign(new Error(`${code}: stand-in`), { code });
const tick = () => new Promise((z) => setImmediate(z));
const KEY = (c) => 'sk-ant-api03-' + c.repeat(80);

// the last run's healthy file: two keys, the second the default
const SEED = path.join(ROOT, 'seed'); fs.mkdirSync(SEED, { recursive: true });
const seedAm = quiet(() => new AM0.AccountManager({ dataDir: SEED }));
const ID1 = quiet(() => seedAm.add({ name: 'Work key', key: KEY('a') })).id;
const ID2 = quiet(() => seedAm.add({ name: 'Home key', key: KEY('b') })).id;
quiet(() => seedAm.setDefault(ID2));
try { seedAm.close(); } catch { }
const HEALTHY = fs.readFileSync(path.join(SEED, 'accounts.json'), 'utf8');
const TORN = HEALTHY.slice(0, Math.floor(HEALTHY.length / 2));
ok(JSON.parse(HEALTHY).accounts.length === 2 && JSON.parse(HEALTHY).defaultAccountId === ID2, 'setup: the last run\'s file holds two accounts, the second the default', JSON.parse(HEALTHY).accounts.length);

let wn = 0;
const ALL = [];
function world(AM, { text = HEALTHY, failBoot = null, dir: dir0 = null, todos = null } = {}) {
  const dir = dir0 || path.join(ROOT, `w${++wn}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.resolve(path.join(dir, 'accounts.json'));
  if (!dir0) { if (text != null) fs.writeFileSync(file, text); try { fs.copyFileSync(path.join(SEED, '.accounts-key'), path.join(dir, '.accounts-key')); } catch { } }
  const realRead = fs.readFileSync;
  if (failBoot) fs.readFileSync = function (p, ...a) { if (path.resolve(String(p)) === file) throw stand(failBoot); return realRead.call(this, p, ...a); };
  const changes = [];
  let am;
  try { am = quiet(() => new AM.AccountManager({ dataDir: dir, onChange: (l) => changes.push(l) })); } finally { fs.readFileSync = realRead; }
  ALL.push(am);
  if (todos) am.setUserTodos(todos);
  const onDisk = () => (fs.existsSync(file) ? realRead(file, 'utf8') : null);
  const asides = () => fs.readdirSync(dir).filter((f) => f.startsWith('accounts.json.corrupt-'));
  // the helper's torn-bytes copy runs off the loop at the start: wait for its answer (bounded)
  const settle = async () => { for (let i = 0; i < 300 && (asides().length === 0 || (am.held() && !am._tornAside)); i++) await new Promise((z) => setTimeout(z, 10)); await tick(); };   // torn: until the copy is made AND the list re-held (or lifted, in a red)
  return { am, dir, file, onDisk, asides, settle, changes };
}
const inbox = () => { const items = [], done = []; return { items, done, add: (k, it) => { items.push({ k, ...it }); return { id: `ut-${items.length}` }; }, get: (id) => ({ id, status: done.includes(id) ? 'done' : 'open' }), setStatus: (id, st) => { if (st === 'done') done.push(id); } }; };
const tryCall = (fn) => { try { return { r: quiet(fn) }; } catch (e) { return { code: (e && e.code) || null, status: (e && e.status) || null, msg: String((e && e.message) || '') }; } };

console.log('① a failed read at the start HOLDS the list — nothing is written over the file');
const holdRun = (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  const h = w.am.held();
  const add = tryCall(() => w.am.add({ name: 'New key', key: KEY('c') }));
  quiet(() => w.am._save());   // every one of the store's save sites goes through this ONE save
  return { held: h && h.code, add: add.code || (add.r && add.r.id ? 'added' : null), same: w.onDisk() === HEALTHY, disk: (JSON.parse(w.onDisk() || '{"accounts":[]}').accounts || []).length };
};
const h1 = holdRun(AM0);
ok(h1.held === 'EIO' && h1.add === 'accounts_unread' && h1.same, 'the start\'s read FAILS (EIO): HELD — a person\'s add is refused by name, the store\'s save writes nothing: the healthy file untouched byte for byte', h1);
const h1x = holdRun(cut('    if (this._hold.start(a) === \'data\') this._state = a.value;\n', "    if (a.state === 'data') this._state = a.value;\n", 'the release\'s start', 'acct-release'));
ok(!h1x.held && h1x.add === 'added' && !h1x.same && h1x.disk === 1, 'RED CONTROL (the release\'s start: a failed read is a fresh install): the add goes and its save writes ONE row over the file — the other two accounts gone — red', h1x);

console.log('② every adding and changing act is refused BY NAME while held');
const refuseRun = (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  const acts = {
    add: () => w.am.add({ name: 'New key', key: KEY('c') }),
    subscription: () => w.am.createSubscription({ name: 'New Max' }),
    codex: () => w.am.createCodexSubscription({ name: 'New Codex' }),
    home: () => w.am.createHomeSubscription('antigravity', { name: 'New Google' }),
    setDefault: () => w.am.setDefault(ID1),
    pool: () => w.am.createPool({ name: 'A pool', members: [ID1, ID2] }),
    importBundle: () => w.am.importBundle({ accounts: [] }),
  };
  const out = {};
  for (const [k, fn] of Object.entries(acts)) { const r = tryCall(fn); out[k] = r.code ? `${r.code}/${r.status}` : 'went'; }
  return { out, same: w.onDisk() === HEALTHY, rows: w.am._state.accounts.length };
};
const r2 = refuseRun(AM0);
ok(Object.values(r2.out).every((v) => v === 'accounts_unread/503') && r2.same && r2.rows === 0, 'add, a subscription, a codex login, another harness\'s login, the default, a pool, an import: each refused BY NAME (accounts_unread, 503) — nothing in memory, nothing on disk', r2);
const r2x = refuseRun(cut('  _refuseWhileHeld(what = \'changing the accounts\') { if (this._hold) this._hold.refuse(what); }\n', '  _refuseWhileHeld() { }\n', 'no refusal', 'acct-refuse'));
ok(r2x.out.add === 'went' && r2x.rows > 0 && r2x.same, 'RED CONTROL (no refusal): the add answers «done» while nothing reached disk — the person is told a change that never landed — red', r2x);

console.log('③ the list carries `held` — never an empty list as a fact');
const listRun = (AM) => { const w = world(AM, { failBoot: 'EIO' }); const l = w.am.list(); return { held: !!(l.held && l.held.code === 'EIO' && /could not be read/.test(l.held.why || '')), rows: l.accounts.length }; };
const l3 = listRun(AM0);
ok(l3.held && l3.rows === 0, 'the list says `held` (EIO, «could not be read») beside its empty rows', l3);
const l3x = listRun(cut('      ...(this.held() ? { held: this.held() } : {}),   // r2947 (3) / r3043', '      ...({}),   // r2947 (3) / r3043', 'the list without its word', 'acct-list'));
ok(!l3x.held, 'RED CONTROL (the list without `held`): an empty list as a fact — red', l3x);
const noticeRun = async (AM) => {
  const todos = inbox();
  const w = world(AM, { failBoot: 'EIO', todos });
  quiet(() => w.am._fileHeldNotice());   // asked again (a re-hold asks it): still ONE
  const filed = todos.items.length, it = todos.items[0] || {};
  await quietA(() => w.am._hold.again());   // the file reads: the notice closes
  return { filed, origin: it.origin, key: it.i18n && it.i18n.text && it.i18n.text.key, path: /accounts\.json|data\//.test(String(it.text || '') + String(it.detail || '')), closed: todos.done.length };
};
const n3 = await noticeRun(AM0);
ok(n3.filed === 1 && n3.origin === 'login' && /none is shown as gone/.test(n3.key || '') && !n3.path && n3.closed === 1, 'ONE notice (r3046: never one per page open): a For-you item while the list is unread, filed once though asked again, no file path in its words, closed when the file reads', n3);
const n3x = await noticeRun(cut('    if (!todos || typeof todos.add !== \'function\' || !h || this._heldTodoId) return;\n', "    if (!todos || typeof todos.add !== 'function' || !h) return;\n", 'a notice at every ask', 'acct-once'));
ok(n3x.filed > 1, 'RED CONTROL (a notice at every ask): the tray fills with copies of one fact — red', n3x);

console.log('④ the read again (the helper\'s) ADOPTS the file');
const liftRun = async (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  const lifted = await quietA(() => w.am._hold.again());   // the share is back: the helper's read again answers
  const l = w.am.list();
  return { lifted, held: !!w.am.held(), rows: l.accounts.length, def: l.defaultAccountId, pushed: w.changes.length > 0 };
};
const r4 = await liftRun(AM0);
ok(r4.lifted && !r4.held && r4.rows === 2 && r4.def === ID2 && r4.pushed, 'the read again ADOPTS the file: both accounts and the default back, the change pushed to every page', r4);
const r4x = await liftRun(cut('    this._state = v && this._accountsValid(v) ? v : { version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [] };   // a lift ADOPTS the file\n', '    void v;\n', 'a lift that adopts nothing', 'acct-adopt'));
ok(r4x.rows === 0, 'RED CONTROL (a lift that adopts nothing): the list stays empty after the file reads — red', r4x);

console.log('⑤ torn bytes: kept aside ONCE, and HELD — never lifted as empty (removers read this list\'s silence)');
const tornRun = async (AM) => {
  const w = world(AM, { text: TORN });
  await w.settle();
  const h = w.am.held(), a1 = w.asides();
  const add = tryCall(() => w.am.add({ name: 'New key', key: KEY('c') }));
  const w2 = world(AM, { dir: w.dir });   // a restart over the same torn bytes
  await w2.settle();
  return { held: h && h.code, words: (h && h.why) || '', aside: a1[0] || null, asides: a1.length, keptBytes: a1.length ? fs.readFileSync(path.join(w.dir, a1[0]), 'utf8') === TORN : false, add: add.code || 'went', torn: w.onDisk() === TORN, held2: w2.am.held() && w2.am.held().code, after: w2.asides().length };
};
const t5 = await tornRun(AM0);
ok(t5.held === 'torn bytes' && t5.asides === 1 && t5.keptBytes && t5.add === 'accounts_unread' && t5.torn && t5.held2 === 'torn bytes' && t5.after === 1, 'torn bytes at the start: copied aside ONCE (its bytes kept), the list stays HELD (never «none»), an add refused, the file as it is; a restart over the same bytes: held again, no second copy', t5);
ok(!!t5.aside && t5.words.includes(t5.aside) && /Mend the file by hand/.test(t5.words) && /add them again/.test(t5.words) && !/restore/i.test(t5.words), 'r3104: the torn hold\'s words say WHERE the damaged bytes are kept (by base name) and what the person can do — mend the file by hand and restart, or remove it and add the accounts again; never «restore» (they are the damaged bytes)', { aside: t5.aside, words: t5.words });
const t5x = await tornRun(cut('      this._hold.start({ state: \'unreadable\', code: \'torn bytes\', why: `did not parse — kept beside it as ${facts.setAside}` });\n      this._fileHeldNotice();   // the same notice (one a hold)\n      return;\n', '', 'lifted as empty once copied', 'acct-rehold'));
ok(!t5x.held && t5x.add === 'went', 'RED CONTROL (lifted as empty once copied, the helper\'s default): the list reads «none» as a fact and the next add goes — red', t5x);

console.log('⑥ a restart while held keeps the hold');
const restartRun = (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  quiet(() => w.am._save());   // the life's saves while held
  const w2 = world(AM, { dir: w.dir, failBoot: 'EIO' });
  const held2 = w2.am.held() && w2.am.held().code;
  const w3 = world(AM, { dir: w.dir });
  return { held2, rows3: w3.am.list().accounts.length };
};
const s6 = restartRun(AM0);
ok(s6.held2 === 'EIO' && s6.rows3 === 2, 'a restart while the read still fails: held again; the restart after it reads: both accounts', s6);
const s6x = restartRun(cut('    if (this._hold && !this._hold.writable(\'an accounts change\')) return;', '    if (false) return;', 'no guard at the save', 'acct-guard'));
ok(s6x.rows3 === 0, 'RED CONTROL (no guard at the save): the held life wrote its EMPTY list — the next life reads «no accounts» for good — red', s6x);

console.log('⑦ THE MONEY: nothing starts or resumes on another login while held');
const spawnRun = (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  const sp = (req, be) => tryCall(() => w.am.resolveForSpawn(req, be));
  return { def: sp(null, 'claude'), named: sp(ID1, 'claude'), codex: sp(null, 'codex'), machine: sp('subscription', 'claude') };
};
const m7 = spawnRun(AM0);
ok(m7.def.code === 'accounts_unread' && m7.named.code === 'accounts_unread' && m7.codex.code === 'accounts_unread' && !m7.machine.code && m7.machine.r === null, 'the spawn door while held: a start with no pick, with a pick, a codex start — REFUSED by name (never null = the machine\'s own login); a person\'s «this machine\'s login» stays theirs', m7);
const m7x = spawnRun(cut('    if (this._hold && this._hold.held() && requested !== \'subscription\') throw this._hold.refusal(\'starting a conversation on an account\');\n', '', 'no refusal at the spawn door', 'acct-spawn'));
ok(m7x.def.r === null && /unknown account/.test(m7x.named.msg || ''), 'RED CONTROL (no refusal at the spawn door): the start with no pick resolves to the MACHINE\'S OWN LOGIN, and a resume of a named account throws «unknown account» (ws-create\'s «deleted account» degrade) — red', m7x);
const WSC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
const iRef = WSC.indexOf("if (e && e.code === 'accounts_unread') {"), iDeg = WSC.indexOf("if (data.resumeId && /unknown account/.test(String(e.message))) {");
ok(iRef > 0 && iDeg > iRef && !/unknown account/.test(m7.named.msg || ''), 'ws-create\'s resume: the refusal by name comes BEFORE the «deleted account» degrade, and the held refusal never says «unknown account» — the degrade cannot fire on it', { iRef, iDeg, msg: (m7.named.msg || '').slice(0, 90) });

console.log('⑧ r3104 (a): every road that looks an account up answers the hold\'s words while held — never «unknown account» from the empty list');
const AURSRC = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
const guardRun = (AUR, am) => {
  let mw = null;
  const app = new Proxy({}, { get: (t, k) => (k === 'use' ? (p, fn) => { if (p === '/api/accounts' && !mw) mw = fn; } : () => { }) });
  try { quiet(() => AUR.create({ app, rootDir: path.join(ROOT, 'routes-' + (++wn)), engine: {}, getAccounts: () => am })); } catch { /* the rest of create needs the hub: the guard is registered first */ }
  if (!mw) return { mw: false };
  const call = (method, p) => { const out = { next: false }; const res = { status(c) { out.code = c; return this; }, json(o) { out.body = o; return this; } }; mw({ method, path: p }, res, () => { out.next = true; }); return out; };
  return { mw: true, rename: call('PATCH', '/acct-x'), pool: call('POST', '/pool/p1/target'), tails: call('POST', '/tails'), list: call('GET', '/') };
};
const AUR0 = require(path.join(REPO, 'src/server/account-usage-routes.js'));
const gH = guardRun(AUR0, world(AM0, { failBoot: 'EIO' }).am), gR = guardRun(AUR0, world(AM0).am);
ok(gH.mw && [gH.rename, gH.pool, gH.tails].every((x) => x.code === 503 && x.body && x.body.code === 'accounts_unread' && /could not be read/.test(x.body.error || '') && !x.next) && gH.list.next && [gR.rename, gR.pool, gR.tails, gR.list].every((x) => x.next), 'held: a rename, a pool\'s target, the tails — each answers 503 accounts_unread with the hold\'s words (never «unknown account»); the list itself passes; when the list reads every road passes', { gH, gR });
const AURx = MUT.load('src/server/account-usage-routes.js', anchored(AURSRC, "  if (typeof app.use === 'function') app.use('/api/accounts', (req, res, next) => {", "  if (false) app.use('/api/accounts', (req, res, next) => {", 'no guard'), 'acct-routes-guard');
const gX = guardRun(AURx, world(AM0, { failBoot: 'EIO' }).am);
ok(!gX.mw, 'RED CONTROL (no guard): no road answers the hold — a rename over the empty list meets «unknown account» — red', gX);

for (const am of ALL) { try { am.close(); } catch { } }
report();
