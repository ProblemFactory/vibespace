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
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d unit 1 (a): accounts.json is the store writer's — each save waited for (the suite's thread)
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('acct-held');
const { ok, report } = checker();
const AM0 = require(path.join(REPO, 'src/accounts.js'));
waitEverySave(AM0.AccountManager);
const ASRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
const MUT = mutantCopies('acct-held', REPO);
const cut = (from, to, why, tag, src = ASRC) => { const m = MUT.load('src/accounts.js', anchored(src, from, to, why), tag); waitEverySave(m.AccountManager); return m; };   // B-574d unit 1 (a): a copy's own class waits for its saves too
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
  const settle = async () => { for (let i = 0; i < 100 && (asides().length === 0 || (am.held() && !am._torn)); i++) await new Promise((z) => setTimeout(z, 10)); await tick(); };   // torn: until the copy is made AND the list re-held (or lifted, in a red)
  return { am, dir, file, onDisk, asides, settle, changes };
}
const inbox = () => { const items = [], done = [], hidden = []; return { items, done, add: (k, it) => { items.push({ k, ...it, id: `ut-${items.length + 1}` }); return { id: `ut-${items.length}` }; }, get: (id) => ({ id, status: done.includes(id) ? 'done' : 'open' }), forSession: (k) => items.filter((i) => i.k === k && !done.includes(i.id) && !hidden.includes(i.id)), hiddenFor: (k) => items.filter((i) => i.k === k && hidden.includes(i.id) && !done.includes(i.id)), hide: (id) => { hidden.push(id); }, setStatus: (id, st) => { if (st === 'done') done.push(id); } }; };
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
const r2x = refuseRun(cut('  _refuseWhileHeld(what = \'changing the accounts\') { if (this.held()) throw this._heldRefusal(what); }\n', '  _refuseWhileHeld() { }\n', 'no refusal', 'acct-refuse'));
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
const n3x = await noticeRun(cut('    if (same) { this._heldTodoId = same.id; return; }', '', 'a notice at every ask', 'acct-once'));
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
ok(!!t5.aside && t5.words.includes(t5.aside) && /mend the file by hand and restart/.test(t5.words) && /remove it and restart/.test(t5.words) && /each account is signed in again/.test(t5.words) && !/restore/i.test(t5.words), 'r3104 / r3129 (5): the torn hold\'s words say WHERE the damaged bytes are kept (by base name) and what the person can do — mend the file by hand and restart, or remove it and restart (the old sign-ins stay unused, each account is signed in again); never «restore» (they are the damaged bytes)', { aside: t5.aside, words: t5.words });
const t5x = await tornRun(cut('      this._torn = { since, aside: facts.setAside };\n      this._fileHeldNotice();   // the torn notice — now that its copy exists (it names it)\n      this._notify();           // every page learns the hold\'s true words\n      return;\n', '', 'lifted as empty once copied', 'acct-rehold'));
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
// B-574d unit 1 (a): the save has TWO guards since accounts.json is the store writer's — the save's own check and the producer's
// refusal at the write (a write queued before a hold lands nothing): «no guard» cuts both
const PRODUCER_GUARD = `      if (this._torn || (this._hold && this._hold.held())) throw Object.assign(new Error('accounts.json is held (it could not be read, or its bytes are damaged) — nothing is written over it until it reads'), { code: 'EHELD' });\n`;
const s6x = restartRun(cut('    if (this._hold && !this._hold.writable(\'an accounts change\')) return;', '    if (false) return;', 'no guard at the save', 'acct-guard', anchored(ASRC, PRODUCER_GUARD, '', 'no guard at the save (the producer)')));
ok(s6x.rows3 === 0, 'RED CONTROL (no guard at the save): the held life wrote its EMPTY list — the next life reads «no accounts» for good — red', s6x);

console.log('⑦ THE MONEY: nothing starts or resumes on another login while held');
const spawnRun = (AM) => {
  const w = world(AM, { failBoot: 'EIO' });
  const sp = (req, be) => tryCall(() => w.am.resolveForSpawn(req, be));
  return { def: sp(null, 'claude'), named: sp(ID1, 'claude'), codex: sp(null, 'codex'), machine: sp('subscription', 'claude') };
};
const m7 = spawnRun(AM0);
ok(m7.def.code === 'accounts_unread' && m7.named.code === 'accounts_unread' && m7.codex.code === 'accounts_unread' && !m7.machine.code && m7.machine.r === null, 'the spawn door while held: a start with no pick, with a pick, a codex start — REFUSED by name (never null = the machine\'s own login); a person\'s «this machine\'s login» stays theirs', m7);
const m7x = spawnRun(cut('    if (requested !== \'subscription\' && this.held()) throw this._heldRefusal(\'starting a conversation on an account\');\n', '', 'no refusal at the spawn door', 'acct-spawn'));
ok(m7x.def.r === null && /unknown account/.test(m7x.named.msg || ''), 'RED CONTROL (no refusal at the spawn door): the start with no pick resolves to the MACHINE\'S OWN LOGIN, and a resume of a named account throws «unknown account» (ws-create\'s «deleted account» degrade) — red', m7x);
ok(!/unknown account/.test(m7.named.msg || ''), 'the held refusal never says «unknown account» (the words ws-create\'s «deleted account» degrade matches)', (m7.named.msg || '').slice(0, 90));

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

console.log('⑨ r3129 (7): a RESUME through the REAL create handler while held — its record keeps its account, no «deleted» notice');
const WS = require(path.join(REPO, 'src/ws-create.js'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const Wp = (f) => '/w/' + f;
const resumeRun = async (am) => {
  const registry = createAdapterRegistry({ claudeCmd: '/opt/bin/claude', codexCmd: '/opt/bin/codex', chatWrapper: Wp('chat-wrapper.js'), codexChatWrapper: Wp('codex-chat-wrapper.js'), acpWrapper: Wp('acp-wrapper.js'), acpCommands: { opencode: '/opt/bin/opencode', antigravity: '/opt/bin/agy' }, ptyWrapper: Wp('pty-wrapper.js'), buffersDir: '/b' });
  const sent = [], spawned = [], notices = [], metas = [];
  const active = new Map(), noop = () => undefined;
  const base = path.join(ROOT, 'create-' + (++wn)), SOCK = path.join(base, 'sock'), BUF = path.join(base, 'buf'), CWD = path.join(base, 'cwd');
  for (const d of [SOCK, BUF, CWD]) fs.mkdirSync(d, { recursive: true });
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry, hosts: null, accounts: am, fs, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: Wp('pty-wrapper.js'), CHAT_WRAPPER: Wp('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: '/opt/bin/claude', EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: () => undefined, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    writeSessionMeta: (...a) => { metas.push(a); },
    serverNotice: (key, text) => { notices.push({ key: String(key), text: String(text) }); return 1; },
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = WS.createWsCreateHandler({ ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: process.env.HOME }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() }, execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null, getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p });
  try { await quietA(() => handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', backend: 'claude', cwd: CWD, reqId: 'r1', resumeId: '0a0a0a0a-0000-4000-8000-00000000abcd', accountId: ID1 }, new Set())); } catch (e) { return { threw: String(e && e.message).slice(0, 120) }; }
  const err = sent.find((f) => f && f.type === 'error') || null;
  return { code: err && err.code, spawned: spawned.length, gone: notices.some((n) => /resume-acct-gone/.test(n.key)), dropped: metas.some((m) => JSON.stringify(m).includes('"accountId":null')), live: active.size };
};
const c9 = await resumeRun(world(AM0, { failBoot: 'EIO' }).am);
ok(c9.code === 'accounts_unread' && c9.spawned === 0 && !c9.gone && !c9.dropped && c9.live === 0, 'held: a resume of a conversation that names an account is REFUSED by name (the error frame, accounts_unread) — nothing spawns on the machine login, no «deleted» notice, no record written with its account dropped', c9);
const c9x = await resumeRun(world(cut('    if (requested !== \'subscription\' && this.held()) throw this._heldRefusal(\'starting a conversation on an account\');\n', '', 'no refusal at the spawn door', 'acct-spawn-create'), { failBoot: 'EIO' }).am);
ok(!!c9x.gone && c9x.spawned > 0, 'RED CONTROL (no refusal at the spawn door — the release\'s «unknown account»): the resume DEGRADES — «was deleted» said, and it spawns on the global login — red', c9x);

console.log('⑩ r3129 (1)/(4)/(5): the notice across two starts with the same tray; torn bytes off the ladder; the words by cause');
const twoStarts = async (AM) => {
  const todos = inbox();
  const w1 = world(AM, { failBoot: 'EIO', todos });
  const open1 = todos.forSession('accounts').length;
  const w2 = world(AM, { dir: w1.dir, todos });   // the restart: the file reads
  return { open1, open2: todos.forSession('accounts').length, filed: todos.items.length, held2: !!w2.am.held() };
};
const s10 = await twoStarts(AM0);
ok(s10.open1 === 1 && s10.open2 === 0 && s10.filed === 1 && !s10.held2, 'a held start files ONE notice; the next start READS the file and CLOSES it (its id lived in memory only — never a notice left saying no conversation starts while every account works)', s10);
const s10x = await twoStarts(cut('  setUserTodos(todos) { this._todos = todos || null; if (this.held()) this._fileHeldNotice(); else this._closeHeldNotice(); }\n', '  setUserTodos(todos) { this._todos = todos || null; if (this.held()) this._fileHeldNotice(); }\n', 'no close at a start that reads', 'acct-closeatstart'));
ok(s10x.open2 === 1, 'RED CONTROL (no close at a start that reads): the notice stays open after a restart in which the file reads — red', s10x);
const tornNotice = async (AM) => {
  const todos = inbox();
  const w = world(AM, { text: TORN, todos });
  await w.settle();
  const h = w.am.held(), items = todos.forSession('accounts');
  const at1 = h && h.at;
  await new Promise((z) => setTimeout(z, 30));
  const named = items.length === 1 && w.asides().length === 1 && String(items[0].detail || '').includes(w.asides()[0]);
  return { code: h && h.code, ladder: !!w.am._hold.held(), sameSince: !!(w.am.held() && w.am.held().at === at1), items: items.length, torn: items.length === 1 && /damaged/.test(items[0].text || ''), named, restart: items.length === 1 && /at the next start of VibeSpace that reads the file/.test(String(items[0].detail || '')), signins: /old sign-ins stay on disk unused/.test((h && h.why) || ''), mends: /does not mend by itself/.test((h && h.why) || '') };
};
const t10 = await tornNotice(AM0);
ok(t10.code === 'torn bytes' && !t10.ladder && t10.sameSince && t10.items === 1 && t10.torn && t10.named && t10.restart && t10.signins && t10.mends, 'torn bytes: held for the life OFF the helper\'s ladder (no read and no journal every 30 s; the first «since» kept); ONE notice in the torn words, filed once the copy exists (its detail names it); the words say it does not mend by itself and the old sign-ins stay on disk unused', t10);
const t10x = await tornNotice(cut('      this._torn = { since, aside: facts.setAside };\n      this._fileHeldNotice();   // the torn notice — now that its copy exists (it names it)\n      this._notify();           // every page learns the hold\'s true words\n      return;\n', "      this._hold.start({ state: 'unreadable', code: 'torn bytes', why: `did not parse — kept beside it as ${facts.setAside}` });\n      this._fileHeldNotice();\n      return;\n", 'the old re-hold on the helper\'s ladder', 'acct-torn-ladder'));
ok(t10x.ladder, 'RED CONTROL (r3173 (4): the old re-hold put back): torn bytes go back on the helper\'s ladder — a read and a journal line every 30 s — red', t10x);

console.log('⑪ r3129 (7): the pins of the one-line doors a suite cannot drive here');
const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
const wired = (src) => src.split('accounts.setUserTodos(userTodos)').length === 2 && src.indexOf('accounts.setUserTodos(userTodos)') > src.indexOf('const userTodos = new UserTodoManager(');
ok(wired(SV), 'server.js wires the tray ONCE, after it is made (accounts.setUserTodos(userTodos)) — without it no notice is ever filed in production');
ok(!wired(SV.replace('accounts.setUserTodos(userTodos)', 'void 0')), 'RED CONTROL: the line taken out — the pin reds (no other suite sees it)');
const APP = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8'), PER = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8'), SES = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8'), PRM = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8');
ok(/msg\.type === 'accounts-updated'[\s\S]{0,400}held: msg\.held \|\| null/.test(APP), 'r3129 (2): the page\'s accounts push keeps `held` — the lift ends the banner on every open page');
ok(/catch \(e\) \{ if \(e && e\.code === 'accounts_unread'\) rh = e; else throw e; \}[\s\S]{0,200}if \(rh\) held\.push\(rh\.code\)/.test(PER), 'r3129 (3): the config import\'s accounts section is refused by name and said with the other held sections (never a bare 503 after the rest was written)');
ok(/if \(h\) return \{ refuse: h\.why, code: 'accounts_unread'/.test(SES), 'r3129 (6): the account-bound resume says the hold\'s words, never «deleted» over the held list');
ok(/accounts\.held\(\) : null; if \(h\) return Promise\.resolve\(\{ ok: false, reason: 'account', detail: h\.why \}\)/.test(PRM), 'r3129 (6): the permission oracle says the hold\'s words, never «unknown account»');

console.log('⑫ r3173: the config import with the accounts held — the route says the section held; the page words it');
const PRSRC = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8');
const routeImportAcc = async (Pmod) => {
  const D = path.join(ROOT, 'imp-' + (++wn)); fs.mkdirSync(D, { recursive: true });
  let mode = 'export';
  const accStub = { exportBundle: () => ({ accounts: [{ id: 'acct-x', name: 'Work key' }] }), held: () => (mode === 'held' ? { code: 'EIO', at: 1, why: 'the accounts could not be read (EIO)' } : null),
    importBundle: () => { if (mode === 'held') throw Object.assign(new Error('importing the accounts: the accounts could not be read (EIO)'), { code: 'accounts_unread', status: 503 }); return { imported: 1, skipped: 0 }; },
    persisted: () => Promise.resolve(true) };   // B-574d unit 1 (a): the production store's landing (the import answers after it)
  Pmod.setup({ dataDir: D, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => [], getTasks: () => null, getAccounts: () => accStub, getUsageHistory: () => null, onSettingsWrite: () => { } });
  const door = (p) => Pmod.router.stack.find((l) => l.route && l.route.path === p && l.route.methods.post).route.stack[0].handle;
  const call = (p, body) => new Promise((resolve) => { const out = { status: 200 }; const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, get() { return undefined; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); } }; Promise.resolve().then(() => door(p)({ body, headers: { 'sec-fetch-site': 'same-origin' }, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out))).catch((e) => { out.status = 'threw'; out.body = { error: String(e && e.message) }; resolve(out); }); });
  const ex = await quietA(() => call('/api/config/export', { sections: [], includeSensitive: ['accounts'], passphrase: 'walk-pass-0001' }));
  mode = 'held';
  const im = ex.body && ex.body.sensitive ? await quietA(() => call('/api/config/import', { file: ex.body, sections: [], includeSensitive: ['accounts'], passphrase: 'walk-pass-0001' })) : null;
  return { exported: ex.status, status: im && im.status, applied: (im && im.body && im.body.applied) || null, held: (im && im.body && im.body.held) || null };
};
const ri = await routeImportAcc(require(path.join(REPO, 'src/routes/persistence.js')));
ok(ri.exported === 200 && ri.status === 200 && Array.isArray(ri.applied) && !ri.applied.some((a) => /^accounts/.test(a)) && JSON.stringify(ri.held) === '["accounts_unread"]', 'the import route, driven: a bundle with the accounts imported while the list is held answers `held: [accounts_unread]` — no accounts entry in `applied`, never a bare 503 after the rest was written', ri);
const rix = await routeImportAcc(MUT.load('src/routes/persistence.js', anchored(PRSRC, "        let r = null, rh = null; try { r = getAccounts?.()?.importBundle?.(sens.accounts); } catch (e) { if (e && e.code === 'accounts_unread') rh = e; else throw e; }", "        let r = null, rh = null; r = getAccounts?.()?.importBundle?.(sens.accounts);", 'the refusal not caught'), 'acct-import'));
ok(rix.status !== 200 || !rix.held, 'RED CONTROL (the refusal not caught, line 625\'s shape): the import fails after the other sections were written, its words the hub\'s — red', rix);
const APPSRC = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8'), MASRC = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
ok(/d\.held\.includes\('accounts_unread'\) \? t\('Your accounts were not imported — VibeSpace cannot read its accounts list right now\. Import them again once it reads; For you says why\.'\)/.test(APPSRC) && APPSRC.includes("if (heldSaid && !(d.applied || []).length) { err.textContent = heldSaid; return; }"), 'the PAGE words the held accounts section beside «Imported: …» — with only the accounts ticked, the form stays and says it (never «Imported: — reloading»)');
ok(/const torn = this\._accounts\?\.held\?\.code === 'torn bytes';/.test(MASRC) && /torn \? t\('Nothing was changed\. The accounts file is damaged and does not mend by itself/.test(MASRC), 'r3173 (1): the Add dialog says the torn cause (it does not mend by itself — mend or remove, restart), never «reads them again by itself»');

console.log('⑬ r3173 (2): a notice the person HID is not filed again at a held restart; a start that reads closes it');
const hideRun = async (AM) => {
  const todos = inbox();
  const w1 = world(AM, { failBoot: 'EIO', todos });
  const first = todos.items.length;
  todos.hide(todos.items[0].id);   // the person's ✕
  world(AM, { dir: w1.dir, failBoot: 'EIO', todos });   // a restart while still held
  const afterHeldRestart = todos.items.length;
  world(AM, { dir: w1.dir, todos });   // the restart in which the file reads
  return { first, afterHeldRestart, closed: todos.done.includes(todos.items[0].id) };
};
const h13 = await hideRun(AM0);
ok(h13.first === 1 && h13.afterHeldRestart === 1 && h13.closed, 'the person hid the notice: a restart while still held files NO new one; the start that reads closes the hidden one (the next hold says it afresh)', h13);
const h13x = await hideRun(cut('    if (this._hiddenHeldItems().some((i) => i.text === text)) return;   // r3173 (2): the person hid this notice — it is not filed again for this hold\n', '', 'no ask of the hidden items', 'acct-hidden'));
ok(h13x.afterHeldRestart > 1, 'RED CONTROL (no ask of the hidden items): the hidden notice comes back at every held restart — red', h13x);

for (const am of ALL) { try { am.close(); } catch { } }
report();
