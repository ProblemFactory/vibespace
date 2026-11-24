#!/usr/bin/env node
// test-held-smalls — r3333 unit 3 (lane lg-group-parents, the store-read family): FOUR SMALL STORES ARE HELD when they cannot be
// read — never «nothing stored». Each through its REAL module over a scratch data folder; the unreadable file is a PLACED refusal
// of the read call (the module's one sync read and the helper's read again answer EIO — never a mount, never a mode change):
//   ① data/voice-suggestions.json (src/server/voice-teach-engine.js): HELD ⇒ no word is proposed (a dismissed one would come
//      again); a person's dismissal goes on and its ledger change waits, replayed at the read — nothing written over meanwhile
//   ② data/cli-unmeasured-notice.json (src/server/cli-unmeasured-notice.js): HELD ⇒ the tick files nothing (the owner's
//      dismissal the ledger no longer holds is not filed again), writes nothing; after its read the dismissal stands
//   ③ data/maintenance.json (src/server/ops-routes.js): HELD ⇒ no banner shown, every POST refused by name before anything
//      changes; at its read the banner is back and broadcast; torn bytes kept aside ONCE
//   ④ data/cli-model-catalog.json (src/server/cli-model-catalog.js): HELD ⇒ this run's reads in memory, nothing written; at its
//      read the rows of builds no longer installed come back and this run's reads go over them, written once
//   RED (each): the release's read planted back — the failed read is «nothing», and the store is proposed / filed / written over
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('held-smalls');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
process.env.HOME = path.join(ROOT, 'home');
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SRH = require(path.join(REPO, 'src/store-read-hold.js'));
const M = mutantCopies('held-smalls', REPO);
let n = 0;
const dataDir = (tag) => { const d = path.join(ROOT, `${tag}-${++n}`, 'data'); fs.mkdirSync(d, { recursive: true }); return d; };

// THE PLACED REFUSAL: the read call of a refused path answers EIO (the module's sync read, the helper's read again off the loop)
const REFUSED = new Set();
const eio = (p) => Object.assign(new Error(`EIO: i/o error, open '${p}'`), { code: 'EIO', errno: -5, syscall: 'open', path: String(p) });
const realSync = fs.readFileSync, realAsync = fs.promises.readFile;
fs.readFileSync = function (p, ...rest) { if (REFUSED.has(String(p))) throw eio(p); return realSync.call(this, p, ...rest); };
fs.promises.readFile = function (p, ...rest) { if (REFUSED.has(String(p))) return Promise.reject(eio(p)); return realAsync.call(this, p, ...rest); };
const heldNamed = (base) => SRH.holds().filter((h) => h.file === base && h.held).length;
const liftOf = async (file) => { REFUSED.delete(file); return SRH.readAgainOf(path.basename(file)); };

console.log('① the voice suggestions\' ledger');
{
  const VM = require(path.join(REPO, 'src/voice-model.js'));
  const ENGINE = 'src/server/voice-teach-engine.js';
  const MSGS = [{ role: 'user', content: [{ type: 'text', text: 'the commentsBatches handler in docWindowPane drops the zephyrQueue rows' }] }];
  const seenArgs = { conv: 'conv-1', title: 'Doc comments', cwd: '/w/vibespace', messages: MSGS, uiLang: 'en' };
  const rig = (Mod, ledgerFile, rec) => Mod.create({
    client: { connected: () => true, vocabulary: async () => [], terms: async (l) => ({ added: l.slice(), skipped: [] }), context: async () => ({ ok: true }) },
    plugin: { peek: () => rec, update: (fn) => fn(rec), settings: () => rec.config, writeSettings: (p) => { rec.config = { ...rec.config, ...p }; } },
    userTodos: null, now: () => 1e12, ledgerFile, log: { warn() { }, log() { } } });
  const fresh = () => ({ enabled: true, config: { teach: true, suggest: true, mode: 'card' } });
  const real = () => { delete require.cache[require.resolve(path.join(REPO, ENGINE))]; return require(path.join(REPO, ENGINE)); };
  // the world: one dictation proposed its words, the person dismissed them all (the ledger holds the dismissal)
  const world = async () => {
    const dir = dataDir('voice'), file = path.join(dir, 'voice-suggestions.json'), rec = fresh();
    const E0 = rig(real(), file, rec);
    const p0 = (await E0.seen(seenArgs)).proposal;
    E0.ignore(p0.id);
    return { dir, file, rec, words: p0.terms, bytes: realSync(file, 'utf8') };
  };
  {
    const w = await world();
    const again = (await rig(real(), w.file, fresh()).seen(seenArgs)).proposal;
    ok(w.words.length > 0 && !again, 'control: a readable ledger — the same dictation proposes none of the words the person dismissed', { words: w.words, again });
  }
  {
    const w = await world();
    REFUSED.add(w.file);
    const E = rig(real(), w.file, fresh());
    const out = await E.seen(seenArgs);
    ok(!out.proposal && realSync(w.file, 'utf8') === w.bytes && heldNamed('voice-suggestions.json') === 1, 'HELD (EIO): no word is proposed — a dismissed one would come again — nothing is written over the ledger, the family\'s list names it', { out, held: heldNamed('voice-suggestions.json') });
    const lifted = await liftOf(w.file);
    const after = (await E.seen({ ...seenArgs, conv: 'conv-2' })).proposal;
    ok(lifted === true && !after && heldNamed('voice-suggestions.json') === 0, 'LIFTED by the family\'s read again: the dismissal is read back — the same words are still not proposed (no restart)', { lifted, after });
  }
  {
    // the person's own act while held: a suggestion an earlier run left on the sheet is dismissed — it goes on, its change waits
    const dir = dataDir('voice'), file = path.join(dir, 'voice-suggestions.json'), rec = fresh();
    const p0 = (await rig(real(), file, rec).seen(seenArgs)).proposal;   // run 1 proposed (the ledger holds the suggestion)
    const bytes = realSync(file, 'utf8');
    REFUSED.add(file);
    const E = rig(real(), file, rec);                                       // run 2 over the same plugin record: the ledger unread
    const r = E.ignore(p0.id);
    const during = realSync(file, 'utf8');
    await liftOf(file);
    const L = JSON.parse(realSync(file, 'utf8'));
    const dismissed = p0.terms.every((t) => { const x = Object.values(L.words || {}).find((v) => v.term === t); return !!x && Array.isArray(x.dismissedAt) && x.dismissedAt.length > 0; });
    const again = (await rig(real(), file, fresh()).seen(seenArgs)).proposal;
    ok(r.ignored === p0.terms.length && during === bytes && dismissed && !again, 'HELD: the person\'s dismissal goes on (never refused), nothing is written meanwhile; at the read its change is replayed onto the ledger and written once — the words are not proposed again', { r, dismissed, again, words: L.words && Object.keys(L.words) });
  }
  {
    const SRC = read(ENGINE);
    const anchor = "    const st = ledgerHold.start(a);\n    if (st === 'held') return null;";
    const Rel = M.load(ENGINE, anchored(SRC, anchor, "    const st = a.state === 'unreadable' ? 'missing' : ledgerHold.start(a);", 'voice-release'), 'voice-release');
    const w = await world();
    REFUSED.add(w.file);
    const out = await rig(Rel, w.file, fresh()).seen(seenArgs);
    REFUSED.delete(w.file);
    ok(!!out.proposal && out.proposal.terms.some((t) => w.words.includes(t)) && realSync(w.file, 'utf8') !== w.bytes, 'RED the release\'s read: an unreadable ledger is «empty» — the dismissed words are proposed again, and the ledger is written over', { proposal: out.proposal && out.proposal.terms, words: w.words });
  }
}

console.log('② the unmeasured-CLI notice\'s memory');
{
  const CC = require(path.join(REPO, 'src/cli-caps.js'));
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const NOTICE = 'src/server/cli-unmeasured-notice.js';
  const N = require(path.join(REPO, NOTICE));
  const CLI = '2.1.312', NAMES = ['acct-7', 'acct-8'];
  const world = (Mod) => {
    const dir = dataDir('notice'), file = path.join(dir, 'cli-unmeasured-notice.json');
    // the memory: the owner dismissed this version's item — and the For-you ledger no longer holds it (a fresh store)
    const bytes = JSON.stringify({ versions: { [CLI]: { filedAt: 1, itemId: 'ut-gone', count: 2, resolvedBy: 'user', resolvedAt: 2, usedAt: 2 } } });
    fs.writeFileSync(file, bytes);
    const todos = new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0 });
    const acc = { oatFileCaps: () => ({ known: true, ok: false, cli: CLI }), cliUnmeasuredNotice: () => ({ cli: CLI, members: NAMES.map((x, i) => ({ id: 'm' + i, name: x })), prefix: CC.cliUnmeasuredPrefix(CLI), item: CC.cliUnmeasuredItem({ cli: CLI, names: NAMES }) }) };
    let clock = Date.parse('2026-11-24T09:00:00Z');
    const logs = [];
    const no = Mod.create({ accounts: () => acc, todos: () => todos, file, log: (l) => logs.push(String(l)), now: () => clock });
    const mine = () => todos.idsWhere((i) => i.sessionKey === N.ITEM_KEY).length;
    return { file, bytes, no, mine, logs, wait: (ms) => { clock += ms; }, stop: () => todos.flush() };
  };
  {
    const w = world(N);
    REFUSED.add(w.file);
    const t1 = w.no.tick(); w.wait(60e3); const t2 = w.no.tick();
    const during = { t1, t2, filed: w.mine(), bytes: realSync(w.file, 'utf8') === w.bytes, held: heldNamed('cli-unmeasured-notice.json') };
    const lifted = await liftOf(w.file);
    w.wait(60e3); const t3 = w.no.tick();
    const after = { lifted, t3, filed: w.mine(), bytes: realSync(w.file, 'utf8') };
    w.stop();
    ok(during.t1 === null && during.t2 === null && during.filed === 0 && during.bytes && during.held === 1, 'HELD (EIO): two ticks file nothing and write nothing (the owner\'s dismissal the For-you ledger no longer holds is never filed again)', during);
    ok(after.lifted === true && after.t3 === null && after.filed === 0 && JSON.parse(after.bytes).versions[CLI].resolvedBy === 'user', 'LIFTED: the next tick reads the memory — the owner\'s dismissal stands, nothing is filed', after);
  }
  {
    const SRC = read(NOTICE);
    const anchor = "      const st = hold.start(a);\n      if (st === 'held') return null;";
    const Rel = M.load(NOTICE, anchored(SRC, anchor, "      const st = a.state === 'unreadable' ? 'missing' : hold.start(a);", 'notice-release'), 'notice-release');
    const w = world(Rel);
    REFUSED.add(w.file);
    const id = w.no.tick();
    REFUSED.delete(w.file);
    const filed = w.mine();
    w.stop();
    ok(typeof id === 'string' && filed === 1, 'RED the release\'s read: an unreadable memory is «none» — the notice the owner dismissed is filed again', { id, filed });
  }
}

console.log('③ the maintenance banner');
{
  const OPS = 'src/server/ops-routes.js';
  const routesOf = (Mod, rootDir) => {
    const routes = {}, sent = [];
    const app = new Proxy({}, { get: (t, verb) => (p, ...h) => { if (typeof p === 'string') routes[`${String(verb).toUpperCase()} ${p}`] = h[h.length - 1]; } });
    const wss = { clients: new Set([{ readyState: 1, send: (m) => sent.push(JSON.parse(m)) }]) };
    Mod.create({ app, rootDir, wss, WS_OPEN: 1, throwaway: () => true, throwawayView: () => ({}) });
    const call = (verb, p, body = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; routes[`${verb} ${p}`]({ body, query: {}, headers: {} }, res); return res; };
    return { call, sent };
  };
  const banner = () => JSON.stringify({ active: true, message: 'support is connected', by: 'support', since: Date.now(), until: Date.now() + 2 * 3600e3, updates: [] });
  const world = () => { const dir = dataDir('maint'), file = path.join(dir, 'maintenance.json'), bytes = banner(); fs.writeFileSync(file, bytes); return { root: path.dirname(dir), file, bytes }; };
  {
    const w = world();
    REFUSED.add(w.file);
    const R = routesOf(require(path.join(REPO, OPS)), w.root);
    const g = R.call('GET', '/api/maintenance'), p = R.call('POST', '/api/maintenance', { update: 'checking the cache' }), off = R.call('POST', '/api/maintenance', { on: false });
    const during = { g: g.body, p: [p.code, p.body && p.body.code], off: [off.code, off.body && off.body.code], bytes: realSync(w.file, 'utf8') === w.bytes, held: heldNamed('maintenance.json') };
    const lifted = await liftOf(w.file);
    const after = { lifted, g: R.call('GET', '/api/maintenance').body, said: R.sent.filter((m) => m.type === 'maintenance-updated' && m.maintenance.active).length };
    ok(during.g.active === false && during.p[0] === 503 && during.p[1] === 'maintenance_unread' && during.off[0] === 503 && during.bytes && during.held === 1, 'HELD (EIO): no banner is shown, an update and an «off» are refused by name before anything changes — the record is never written over', during);
    ok(after.lifted === true && after.g.active === true && after.g.message === 'support is connected' && after.said === 1, 'LIFTED: the banner is back (no restart) and broadcast to the pages', after);
  }
  {
    const dir = dataDir('maint'), file = path.join(dir, 'maintenance.json'), torn = '{"active": tr';
    fs.writeFileSync(file, torn);
    const R = routesOf(require(path.join(REPO, OPS)), path.dirname(dir));
    let lifted = false; for (let i = 0; i < 100 && !lifted; i++) { await new Promise((r) => setTimeout(r, 20)); lifted = heldNamed('maintenance.json') === 0; }
    const copies = fs.readdirSync(dir).filter((x) => x.startsWith('maintenance.json.corrupt-'));
    const p = R.call('POST', '/api/maintenance', { on: true, message: 'back', hours: 1 });
    ok(lifted && copies.length === 1 && realSync(path.join(dir, copies[0]), 'utf8') === torn && p.code === 200 && JSON.parse(realSync(file, 'utf8')).message === 'back', 'TORN BYTES: kept aside ONCE (the same bytes), then no banner — and a POST goes on as before', { copies, p: p.code });
  }
  {
    const SRC = read(OPS);
    const anchor = "  if (maintHold.start(a) === 'data') _maintenance = a.value; }";
    const Rel = M.load(OPS, anchored(SRC, anchor, "  if (a.state === 'data') _maintenance = a.value; }", 'maint-release'), 'maint-release');
    const w = world();
    REFUSED.add(w.file);
    const R = routesOf(Rel, w.root);
    const p = R.call('POST', '/api/maintenance', { update: 'checking the cache' });
    REFUSED.delete(w.file);
    const now = JSON.parse(realSync(w.file, 'utf8'));
    ok(p.code === 200 && now.active === false, 'RED the release\'s read: an unreadable record is «no banner» — the operator\'s next update writes «off» over the banner', { code: p.code, now });
  }
}

console.log('④ the model catalog\'s ledger');
{
  const CAT_PATH = 'src/server/cli-model-catalog.js';
  const OLD = 'old-build|1:2:3:4', NEW = 'new-build|5:6:7:8';
  const entry = () => ({ state: 'unreadable', models: [], refused: [] });
  const world = () => {
    const dir = dataDir('catalog'), file = path.join(dir, 'cli-model-catalog.json');
    const bytes = JSON.stringify({ schema: 1, current: OLD, binaries: { [OLD]: entry() }, said: [] });
    fs.writeFileSync(file, bytes);
    return { dir, file, bytes };
  };
  {
    const CAT = require(path.join(REPO, CAT_PATH));
    const w = world();
    REFUSED.add(w.file);
    CAT._reset();
    const l = CAT._load(w.dir);
    l.binaries[NEW] = entry(); l.current = NEW;   // this run's read of the binary in use (in memory)
    CAT._saveNow();
    const during = { rows: Object.keys(l.binaries), bytes: realSync(w.file, 'utf8') === w.bytes, held: heldNamed('cli-model-catalog.json') };
    const lifted = await liftOf(w.file);
    const after = JSON.parse(realSync(w.file, 'utf8'));
    CAT._reset();
    ok(during.rows.join() === NEW && during.bytes && during.held === 1, 'HELD (EIO): this run\'s read is kept in memory, the save writes nothing over the ledger, the family\'s list names it', during);
    ok(lifted === true && !!after.binaries[OLD] && !!after.binaries[NEW] && after.current === NEW, 'LIFTED: the row of the build no longer installed is back, this run\'s read goes over the file\'s, written once', { lifted, rows: Object.keys(after.binaries || {}), current: after.current });
  }
  {
    const SRC = read(CAT_PATH);
    const anchor = "    if (st.hold.start(a) === 'data') l = a.value;";
    const Rel = M.load(CAT_PATH, anchored(SRC, anchor, "    if (a.state === 'data') l = a.value;", 'catalog-release'), 'catalog-release');
    const w = world();
    REFUSED.add(w.file);
    Rel._reset();
    const l = Rel._load(w.dir);
    l.binaries[NEW] = entry(); l.current = NEW;
    Rel._saveNow();
    REFUSED.delete(w.file);
    const now = JSON.parse(realSync(w.file, 'utf8'));
    Rel._reset();
    ok(!now.binaries[OLD] && !!now.binaries[NEW], 'RED the release\'s read: an unreadable ledger is «none» — the next save writes over it and the row of the build no longer installed is lost', { rows: Object.keys(now.binaries || {}) });
  }
}

fs.readFileSync = realSync; fs.promises.readFile = realAsync;
report();
