#!/usr/bin/env node
// test-accounts-store-writer — B-574d unit 1 (a) (lane lg-store-writes, 主开发 r3450 / r3455 / r3486): accounts.json written by
// THE STORE WRITER (its thread syncs the temp before the rename; the hub's loop never waits on the data folder for it).
// FAST, in process: the real AccountManager over a scratch data folder of made-up rows, each life with its OWN writer whose thread
// is a stand-in that runs the real writeJob after a held delay, or fails the write (scripts/fixtures/store-stand-writer.cjs).
// Every leg says the hold of r3455 it reads.
//   A. hold 1 — a person's account act answers only once its save is ON DISK (account-usage-routes.js answerAfterLanding):
//      held landing ⇒ no answer yet; landed ⇒ 200 and the file holds it; a write that fails ⇒ 503 not-durable by name; an act
//      that saved nothing is not held. A burst of saves in one turn is ONE landing.
//   B. hold 2 — the held laws stand through the writer: a list held at its start writes nothing (a machine's save included) and
//      refuses a person's act by name; a write queued before a hold lands nothing (the producer refuses).
// Run: node scripts/test-accounts-store-writer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { answerAfterLanding } = require(path.join(REPO, 'src/server/account-usage-routes.js'));

const { ok, report } = checker();
const ROOT = scratch('sw-accounts');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const hush = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const lives = [];
const mkW = (o = {}) => { const W = SW.create({ log: quiet, workerPath: SAND.path, durableMs: 1500, ...o }); lives.push(W); return W; };
const writesOf = (W, base) => { const s = W.stats().find((x) => path.basename(x.file) === base); return s ? s.writes : 0; };
const KEY = (c) => ['sk', 'ant', 'api03', c.repeat(80)].join('-');   // a key's shape, built at runtime (never a literal)
let dn = 0;
const dirOf = (n) => { const d = path.join(ROOT, `${n}-${++dn}`); fs.mkdirSync(d, { recursive: true }); return d; };
/** a reply stand-in: what express's res does for the door (status, json); `sent` = the body once json ran */
const resOf = () => { const r = { statusCode: 200, sent: null, at: null, status(c) { this.statusCode = c; return this; }, json(b) { this.sent = b; this.at = Date.now(); return this; }, setHeader() { }, getHeader() { } }; return r; };

console.log('A. hold 1 — a person\'s account act answers only once accounts.json holds it');
{
  const d = dirOf('a1'), W = mkW();
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  const id = hush(() => am.add({ name: 'Work key', key: KEY('a') })).id;   // a sign-in save: landed before add returns (r3782)
  SAND.hold('accounts.json', 500);
  const res = resOf();
  answerAfterLanding(am, res);
  hush(() => am.rename(id, 'Work key, renamed'));   // a person's act that carries no sign-in: it rides the writer off the loop
  res.json({ success: true, id });
  await sleep(150);
  const early = res.sent;
  for (let i = 0; i < 60 && !res.sent; i++) await sleep(50);
  SAND.unhold('accounts.json');
  let disk = null; try { disk = JSON.parse(fs.readFileSync(path.join(d, 'accounts.json'), 'utf8')); } catch { }
  const onDisk = !!(disk && disk.accounts.some((a) => a.id === id && a.name === 'Work key, renamed'));
  ok(early === null && !!res.sent && res.statusCode === 200 && onDisk, 'A1 a person\'s rename (no sign-in: off the loop): no answer while its write is held on the writer\'s thread; the answer (200) only once accounts.json holds it', { early, sent: res.sent, code: res.statusCode, onDisk });
  // A3 — an act that saved nothing is not held
  const r3 = resOf(); answerAfterLanding(am, r3); r3.json({ answered: true });
  ok(!!r3.sent && r3.statusCode === 200, 'A3 a reply whose act saved nothing answers at once (nothing to wait for)', { sent: r3.sent });
}
{
  const d = dirOf('a2'), W = mkW({ durableMs: 400 });
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  const id = hush(() => am.add({ name: 'Home key', key: KEY('b') })).id;
  SAND.failOn('accounts.json', true);
  const res = resOf(); answerAfterLanding(am, res);
  hush(() => am.rename(id, 'Home key, renamed'));
  res.json({ success: true, id });
  for (let i = 0; i < 60 && !res.sent; i++) await sleep(50);
  SAND.failOn('accounts.json', false);
  ok(res.statusCode === 503 && !!res.sent && res.sent.code === 'not-durable' && res.sent.notOnDisk === true && res.sent.id === id, 'A2 a write the storage refuses: 503 not-durable by name (the family\'s known code), the act\'s own answer kept beside it, never a silent «saved»', { code: res.statusCode, sent: res.sent });
}
{
  const d = dirOf('a4'), W = mkW();
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  const id = hush(() => am.add({ name: 'k1', key: KEY('c') })).id;   // one sign-in save: one landing of its own
  const w0 = writesOf(W, 'accounts.json');
  hush(() => { am.rename(id, 'k1 a'); am.rename(id, 'k1 b'); am.rename(id, 'k1 c'); });   // three saves with no sign-in, one turn
  const landed = await am.persisted();
  ok(landed === true && w0 === 1 && writesOf(W, 'accounts.json') === 2, 'A4 three saves with no sign-in in one turn are ONE landing of accounts.json (the bytes made at the write); the sign-in save before them landed on its own', { landed, w0, writes: writesOf(W, 'accounts.json') });
}

console.log('B. hold 2 — the held laws of the list stand through the writer');
{
  const d = dirOf('b1'), W0 = mkW();
  const seed = hush(() => new AccountManager({ dataDir: d, storeWriter: W0 }));
  hush(() => seed.add({ name: 'Seed key', key: KEY('f') })); await seed.persisted();
  const F = path.join(d, 'accounts.json'), before = fs.readFileSync(F, 'utf8');
  const realRead = fs.readFileSync; let placed = 0;
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === path.resolve(F) && placed < 1) { placed++; throw Object.assign(new Error('EIO: i/o error (placed)'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  const W = mkW(); let am = null;
  try { am = hush(() => new AccountManager({ dataDir: d, storeWriter: W })); } finally { fs.readFileSync = realRead; }
  let refused = null; try { hush(() => am.add({ name: 'New key', key: KEY('g') })); } catch (e) { refused = e && e.code; }
  hush(() => { try { am._save(); } catch { } });   // a machine's own save (a reading, a mark) — every one of the ~40 sites goes through _save
  await sleep(300);
  const rowOf = W.stats().find((x) => path.basename(x.file) === 'accounts.json') || null;
  ok(placed === 1 && !!am.held() && refused === 'accounts_unread' && rowOf === null && fs.readFileSync(F, 'utf8') === before, 'B1 a list held at its start (its read failed): a person\'s act refused accounts_unread, a machine\'s save asks NOTHING of the writer (no store row for accounts.json at all: the save\'s own guard stops it first), the file is the bytes it was', { placed, held: !!am.held(), refused, row: rowOf && { writes: rowOf.writes, dirty: rowOf.dirty } });
  try { am.close(); } catch { }
}
{
  // B2 — no production road makes a hold AFTER a save queued (accounts.json holds only at its start's read, and a torn hold rises
  // from a list already held), so the hold is PLACED through the helper's own answer, held(), while the write waits on the thread
  const d = dirOf('b2'), W = mkW();
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  const id = hush(() => am.add({ name: 'First key', key: KEY('h') })).id; await am.persisted();
  const F = path.join(d, 'accounts.json'), before = fs.readFileSync(F, 'utf8');
  SAND.hold('accounts.json', 400);
  hush(() => am.rename(id, 'Renamed while queued'));   // a save with no sign-in, queued: the thread waits 400 ms before it writes
  const realHeld = am._hold.held.bind(am._hold);
  am._hold.held = () => ({ code: 'EIO', since: Date.now() });   // the hold rises while the write waits
  const landed = await am.persisted();
  // the writer's OWN settle (r3763 should): the held write's job ends (a failure, never a landing), not a fixed sleep
  for (let i = 0; i < 200; i++) { const st = W.stats().find((x) => path.basename(x.file) === 'accounts.json'); if (st && !st.inflight && (st.failures || 0) > 0) break; await sleep(20); }
  SAND.unhold('accounts.json');
  am._hold.held = realHeld;
  ok(landed === false && fs.readFileSync(F, 'utf8') === before, 'B2 a write queued before a hold lands nothing: the producer refuses (EHELD) and the file stays the bytes that were read', { landed, same: fs.readFileSync(F, 'utf8') === before });
}

console.log('C. r3763 MUST 2 — the door\'s own wiring (the real routes module), no patched save');
const AUR = require(path.join(REPO, 'src/server/account-usage-routes.js'));
const MUT = mutantCopies('sw-accounts', REPO);
/** the /api/accounts middleware the REAL routes module registers first (create() throws past it without a hub: the guard is first) */
const doorOf = (mod, am) => { let mw = null; const app = new Proxy({}, { get: (t, k) => (k === 'use' ? (p, fn) => { if (p === '/api/accounts' && !mw) mw = fn; } : () => { }) }); try { hush(() => mod.create({ app, rootDir: dirOf('routes'), engine: {}, getAccounts: () => am })); } catch { } return mw; };
/** one write route through the door: the middleware, then a handler that makes the act and answers */
const through = (mw, act) => { const res = resOf(); mw({ method: 'POST', path: '/x' }, res, () => { const body = act(); res.json(body); }); return res; };
const AURSRC = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
{
  const d = dirOf('c1'), W = mkW(), am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  const mw = doorOf(AUR, am);
  const rid = hush(() => am.add({ name: 'Door key', key: KEY('p') })).id;   // the sign-in save lands before add returns (r3782)
  SAND.hold('accounts.json', 400);
  const res = through(mw, () => { hush(() => am.rename(rid, 'Door key, renamed')); return { success: true, id: rid }; });
  await sleep(120); const early = res.sent;
  for (let i = 0; i < 80 && !res.sent; i++) await sleep(25);
  SAND.unhold('accounts.json');
  ok(!!mw && early === null && !!res.sent && res.statusCode === 200 && !!res.sent.id, 'C1 THROUGH THE REAL DOOR: a write route\'s reply waits while the list\'s landing is held, and answers 200 once it lands', { mw: !!mw, early, sent: res.sent, code: res.statusCode });
  SAND.failOn('accounts.json', true);
  const W2 = mkW({ durableMs: 300 }), am2 = hush(() => new AccountManager({ dataDir: dirOf('c1b'), storeWriter: W2 })), mw2 = doorOf(AUR, am2);
  SAND.failOn('accounts.json', false); const rid2 = hush(() => am2.add({ name: 'Door key', key: KEY('q') })).id; SAND.failOn('accounts.json', true);
  const res2 = through(mw2, () => { hush(() => am2.rename(rid2, 'Door key, renamed')); return { success: true, id: rid2 }; });
  for (let i = 0; i < 80 && !res2.sent; i++) await sleep(25);
  SAND.failOn('accounts.json', false);
  ok(res2.statusCode === 503 && !!res2.sent && res2.sent.code === 'not-durable' && !!res2.sent.id, 'C1 a landing that fails: 503 not-durable through the door, the act\'s own answer (its id) kept beside it', { code: res2.statusCode, sent: res2.sent });
  // r3763 should: an act that saved NOTHING is not held by another save in the same window (the request's own count)
  SAND.hold('accounts.json', 400);
  hush(() => am.rename(rid, 'A machine save meanwhile'));   // not in the request's context
  const res3 = through(mw, () => ({ answered: true }));
  SAND.unhold('accounts.json');
  ok(!!res3.sent && res3.statusCode === 200, 'C1 a request whose act saved nothing answers at once, even while ANOTHER save waits on the writer (the request\'s own saves are counted)', { sent: res3.sent });
  const cutLine = "    if (req.method !== 'GET') { const ctx = { saves: 0 }; answerAfterLanding(accounts, res, ctx); return require('../accounts.js').countingSaves(ctx, next); }";
  const AURx = MUT.load('src/server/account-usage-routes.js', anchored(AURSRC, cutLine, '', 'no-door-wait'), 'no-door-wait');
  const amx = hush(() => new AccountManager({ dataDir: dirOf('c1x'), storeWriter: mkW() })), mwx = AURx ? doorOf(AURx, amx) : null;
  const ridx = hush(() => amx.add({ name: 'Door key', key: KEY('s') })).id;
  SAND.hold('accounts.json', 400);
  const resx = mwx ? through(mwx, () => { hush(() => amx.rename(ridx, 'Door key, renamed')); return { success: true, id: ridx }; }) : null;
  const earlyX = resx ? resx.sent : null;
  SAND.unhold('accounts.json'); await sleep(450);
  ok(!!mwx && earlyX !== null, 'RED CONTROL (the door\'s wiring line cut): the reply goes out at once while the list is only in memory — red', { mw: !!mwx, early: earlyX });
}

console.log('D. 主开发 r3782 THE LAW — a save that carries a sign-in is in the file before its call returns');
const OAT = (c) => ['sk', 'ant', 'oat01', c.repeat(40)].join('-');   // a long-lived token's shape, built at runtime
const onDiskRow = (F, rid) => { try { return JSON.parse(fs.readFileSync(F, 'utf8')).accounts.find((a) => a.id === rid) || null; } catch { return null; } };
{
  const d = dirOf('d1'), W = mkW(), am = hush(() => new AccountManager({ dataDir: d, storeWriter: W })), F = path.join(d, 'accounts.json');
  const sid = hush(() => am.createSubscription({ name: 'Member' })).id; await am.persisted();
  SAND.hold('accounts.json', 400);   // the writer's thread HELD: the call must wait for it, then return with the bytes on disk
  const t0 = Date.now(); hush(() => am.setOat(sid, OAT('M'))); const took = Date.now() - t0;
  const set = !!(onDiskRow(F, sid) || {}).oatEnc;
  const kid = hush(() => am.add({ name: 'Typed key', key: KEY('k') })).id;
  const added = !!(onDiskRow(F, kid) || {}).keyEnc;
  hush(() => am.clearOat(sid));
  const cleared = !(onDiskRow(F, sid) || {}).oatEnc;
  SAND.unhold('accounts.json');
  ok(took >= 300 && set && added && cleared, 'D1 with the writer\'s thread HELD: a long-lived token set, a typed key added and a token removed are each IN THE FILE when the call returns (the synchronous road)', { took, set, added, cleared });
  // a synchronous landing that FAILS: said by name, and nothing is handed out from memory
  SAND.failOn('accounts.json', true);
  let code = null; try { hush(() => am.setOat(sid, OAT('F'))); } catch (e) { code = e && e.code; }
  SAND.failOn('accounts.json', false);
  ok(code === 'not-durable' && !(am.get(sid) || {}).oatEnc && !(onDiskRow(F, sid) || {}).oatEnc, 'D1 a sign-in save whose landing FAILS: refused by name (not-durable) and undone in memory — nothing is handed out from memory for that row', { code, inMemory: !!(am.get(sid) || {}).oatEnc });
  // RED: the off-loop road for a sign-in save (the unit's first form)
  const SRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const cut = "try { this._save({ now: true, why: 'the long-lived token' }); }";
  const AMx = MUT.load('src/accounts.js', anchored(SRC, cut, 'try { this._save(); }', 'off-loop-sign-in'), 'off-loop-sign-in');
  let redSet = null;
  if (AMx) {
    const dx = dirOf('d1x'), Wx = mkW(), amx = hush(() => new AMx.AccountManager({ dataDir: dx, storeWriter: Wx })), Fx = path.join(dx, 'accounts.json');
    const sx = hush(() => amx.createSubscription({ name: 'Member' })).id; await amx.persisted();
    SAND.hold('accounts.json', 400);
    hush(() => amx.setOat(sx, OAT('R'))); redSet = !!(onDiskRow(Fx, sx) || {}).oatEnc;
    SAND.unhold('accounts.json'); await amx.persisted();
  }
  ok(!!AMx && redSet === false, 'RED CONTROL (the off-loop road for a sign-in save): the call returns while the file does not hold the token — red', { redSet });
}

console.log('E. r3763 REQUIRED 3 — the door\'s answer goes out inside the exit\'s flush');
{
  const d = dirOf('e1'), W = mkW(), am = hush(() => new AccountManager({ dataDir: d, storeWriter: W })), mw = doorOf(AUR, am);
  const eid = hush(() => am.add({ name: 'At the stop', key: KEY('t') })).id;
  SAND.hold('accounts.json', 200);
  const res = through(mw, () => { hush(() => am.rename(eid, 'Renamed as the hub stops')); return { success: true, id: eid }; });
  const before = res.sent;
  SAND.unhold('accounts.json');
  hush(() => { W.beginExit(); W.exitFlush(); });
  const atExit = res.sent;   // read in the SAME synchronous run as the exit's flush (no turn of the loop between)
  ok(before === null && !!atExit && res.statusCode === 200, 'E1 a person\'s rename pressed as the hub stops (a save that rides the writer): its reply is SENT inside the exit\'s flush (the writer\'s own answer road), never lost to a promise\'s then', { before, atExit, code: res.statusCode });
  const cutA = "    accounts.persisted((ok) => {\n      try { require('../store-writer.js').identityAtExit(res); } catch { }";
  const AURy = MUT.load('src/server/account-usage-routes.js', anchored(AURSRC, cutA, "    Promise.resolve(accounts.persisted()).then((ok) => {\n      try { require('../store-writer.js').identityAtExit(res); } catch { }", 'promise-road'), 'promise-road');
  const dy = dirOf('e1y'), Wy = mkW(), amy = hush(() => new AccountManager({ dataDir: dy, storeWriter: Wy })), mwy = AURy ? doorOf(AURy, amy) : null;
  const yid = hush(() => amy.add({ name: 'At the stop', key: KEY('u') })).id;
  SAND.hold('accounts.json', 200);
  const resy = mwy ? through(mwy, () => { hush(() => amy.rename(yid, 'Renamed as the hub stops')); return { success: true, id: yid }; }) : null;
  SAND.unhold('accounts.json');
  let atExitY = 'none';
  if (resy) { hush(() => { Wy.beginExit(); Wy.exitFlush(); }); atExitY = resy.sent; }
  ok(!!resy && atExitY === null, 'RED CONTROL (the reply made from a promise\'s then, the first form): nothing is sent by the end of the exit\'s flush — red', { atExitY });
}

console.log('F. r3763 REQUIRED 4 — the two boot migrations that reshape the list are recorded only once it landed');
{
  const MIG = require(path.join(REPO, 'src/server/migrations.js'));
  const run = async (MIGmod, AMmod = null) => {
    const root = dirOf('f'), dd = path.join(root, 'data'); fs.mkdirSync(dd, { recursive: true }); fs.mkdirSync(path.join(root, 'home'), { recursive: true });
    const F = path.join(dd, 'accounts.json');
    fs.writeFileSync(F, JSON.stringify({ version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [{ id: 'acct-f1', type: 'apikey', backend: 'claude', name: 'API key …abcd1234', tail: 'abcd1234', createdAt: 1 }] }));
    const am = hush(() => new (AMmod ? AMmod.AccountManager : AccountManager)({ dataDir: dd }));   // the PROCESS's writer: the one the boot's runner lands
    fs.mkdirSync(`${F}.tmp-${process.pid}-w`, { recursive: true });   // the storage refusing the write (a directory at the writer's temp name: EISDIR)
    let res = null;
    try { res = hush(() => MIGmod.create({ rootDir: root, homeDir: path.join(root, 'home'), serverNotice: () => { }, accounts: () => am }).runLocalMigrations({ only: ['2026-11-default-key-names'] })); } catch (e) { res = { threw: e.message }; }
    let ledger = null; try { ledger = JSON.parse(fs.readFileSync(path.join(dd, 'migrations.json'), 'utf8')); } catch { }
    try { fs.rmSync(`${F}.tmp-${process.pid}-w`, { recursive: true, force: true }); } catch { }
    const applied = !!(ledger && ledger.applied && ledger.applied['2026-11-default-key-names']);
    const r = Array.isArray(res) ? res.find((x) => x.id === '2026-11-default-key-names') : null;
    return { applied, status: r && r.status, res: Array.isArray(res) ? null : res };
  };
  const a = await run(MIG);
  ok(a.applied === false && a.status === 'failed', 'F1 the default-key-names migration reshaped the live list and its write could not land: NOT recorded (its save is synchronous by r3782, and the runner lands the stores a migration dirtied before its own row), it runs again at the next start', a);
  const MSRC = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf8');
  const cutL = 'todos: userTodos, landStores, onLate:';
  const MIGx = MUT.load('src/server/migrations.js', anchored(MSRC, cutL, 'todos: userTodos, onLate:', 'no-land-stores'), 'no-land-stores');
  const ASRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const cutS = "if (out.length) { this._save({ now: true, why: 'the migration of the default key names' }); this._notify(); }";
  const AMy = MUT.load('src/accounts.js', anchored(ASRC, cutS, 'if (out.length) { this._save(); this._notify(); }', 'migration-off-loop'), 'migration-off-loop');
  const b = MIGx && AMy ? await run(MIGx, AMy) : null;
  ok(!!b && b.applied === true, 'RED CONTROL (the migration\'s save off the loop AND the runner without its landing of the dirtied stores): recorded applied over a write that never landed — red', b);
}

for (const W of lives) { try { W.stop(); } catch { } }
report();
