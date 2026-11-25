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
import { spawnSync } from 'node:child_process';
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
  const run = async (MIGmod, AMmod = null, mid = '2026-11-default-key-names') => {
    const root = dirOf('f'), dd = path.join(root, 'data'); fs.mkdirSync(dd, { recursive: true }); fs.mkdirSync(path.join(root, 'home'), { recursive: true });
    const F = path.join(dd, 'accounts.json');
    fs.writeFileSync(F, JSON.stringify({ version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: mid === '2026-09-pool-manual-priority' ? [{ id: 'pool-f1', type: 'pooled', backend: 'claude', name: 'A manual pool', auto: false, createdAt: 1 }] : [{ id: 'acct-f1', type: 'apikey', backend: 'claude', name: 'API key …abcd1234', tail: 'abcd1234', createdAt: 1 }] }));
    const am = hush(() => new (AMmod ? AMmod.AccountManager : AccountManager)({ dataDir: dd }));   // the PROCESS's writer: the one the boot's runner lands
    fs.mkdirSync(`${F}.tmp-${process.pid}-w`, { recursive: true });   // the storage refusing the write (a directory at the writer's temp name: EISDIR)
    let res = null;
    try { res = hush(() => MIGmod.create({ rootDir: root, homeDir: path.join(root, 'home'), serverNotice: () => { }, accounts: () => am }).runLocalMigrations({ only: [mid] })); } catch (e) { res = { threw: e.message }; }
    let ledger = null; try { ledger = JSON.parse(fs.readFileSync(path.join(dd, 'migrations.json'), 'utf8')); } catch { }
    try { fs.rmSync(`${F}.tmp-${process.pid}-w`, { recursive: true, force: true }); } catch { }
    const applied = !!(ledger && ledger.applied && ledger.applied[mid]);
    const r = Array.isArray(res) ? res.find((x) => x.id === mid) : null;
    return { applied, status: r && r.status, res: Array.isArray(res) ? null : res };
  };
  const a = await run(MIG);
  const m2 = await run(MIG, null, '2026-09-pool-manual-priority');
  ok(m2.applied === false && m2.status === 'failed', 'F1 the pool-manual-priority migration (the second one, r3977 (4)) whose write is refused: NOT recorded either', m2);
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

console.log('G. 主开发 r3977 — the follow: every sign-in call on the synchronous road legged, the three with no undo finish, a failed landing said');
{
  // G1 (4): with the writer's thread HELD, each call returns with its bytes in the file; ONE mutant copy (each call's save off the
  // loop) is the red of every one of them
  const ASRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  let off = ASRC;
  off = anchored(off, "try { this._save({ now: true, why: 'the moved long-lived token' }); }", 'try { this._save(); }', 'move off the loop');
  off = anchored(off, "try { this._save({ now: true, why: 'the imported accounts' }); }", 'try { this._save(); }', 'import off the loop');
  off = anchored(off, "const unlanded = signIn ? this._saveFinishing('the merge of the two accounts') : (this._save(), null);", 'const unlanded = (this._save(), null);', 'merge off the loop');
  off = anchored(off, "const unlanded = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);", 'const unlanded = (this._save(), null);', 'remove off the loop');
  off = anchored(off, "try { this._save({ now: true, why: 'the new account' }); }\n    catch (e) { if (e && e.signInSave) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); try { fs.rmSync(this.subDir(id)", "try { this._save(); }\n    catch (e) { if (e && e.signInSave) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); try { fs.rmSync(this.subDir(id)", 'create off the loop');
  const AMoff = MUT.load('src/accounts.js', off, 'sign-in-calls-off-loop');
  const runCalls = async (Mod) => {
    const d = dirOf('g1'), W = mkW(), am = hush(() => new Mod.AccountManager({ dataDir: d, storeWriter: W })), F = path.join(d, 'accounts.json');
    const a1 = hush(() => am.createSubscription({ name: 'From' })).id, b1 = hush(() => am.createSubscription({ name: 'To' })).id;
    hush(() => am.setOat(a1, OAT('V'))); const kid = hush(() => am.add({ name: 'Gone key', key: KEY('v') })).id; await am.persisted();
    const out = {};
    SAND.hold('accounts.json', 300);
    hush(() => am.moveOat(a1, b1)); out.move = !!(onDiskRow(F, b1) || {}).oatEnc && !(onDiskRow(F, a1) || {}).oatEnc;
    const impId = 'acct-' + 'a1b2c3d4e5f6';
    hush(() => am.importBundle({ accounts: [{ id: impId, name: 'Imported key', key: KEY('w') }] })); out.import = !!(onDiskRow(F, impId) || {}).keyEnc;
    let mergedErr = null; try { hush(() => am.mergeSubscription(b1, a1, {})); } catch (e) { mergedErr = e && (e.code || e.message); }
    out.merge = mergedErr === null && !onDiskRow(F, b1) && !!(onDiskRow(F, a1) || {}).oatEnc;
    hush(() => am.remove(kid)); out.remove = !onDiskRow(F, kid);
    const nid = hush(() => am.createSubscription({ name: 'New member' })).id; out.create = !!onDiskRow(F, nid);
    SAND.unhold('accounts.json'); await am.persisted();
    out.mergedErr = mergedErr;
    return out;
  };
  const g = await runCalls({ AccountManager });
  ok(g.move && g.import && g.merge && g.remove && g.create, 'G1 with the writer\'s thread HELD, each returns with its bytes IN THE FILE: a long-lived token moved, a key imported, two members merged (the survivor holds the token), a row with a sign-in removed, a new member\'s row created (r3977 (3): before its folder can receive a login)', g);
  const gx = await runCalls(AMoff);
  ok(!gx.move && !gx.import && !gx.merge && !gx.remove && !gx.create, 'RED CONTROL (each of the five saves off the loop): every one returns while the file does not hold it — red, each', gx);
}
{
  // G2 (2): a removal whose synchronous landing FAILS finishes what it started — the folder wiped, memory without the row, every page
  // told — and only then says the landing (landingOwed: the writer writes it again); a retry finds it gone (done), never half-done
  const run = async (Mod) => {
    const d = dirOf('g2'), W = mkW({ durableMs: 300 }), am = hush(() => new Mod.AccountManager({ dataDir: d, storeWriter: W }));
    const id = hush(() => am.createSubscription({ name: 'Member' })).id; hush(() => am.setOat(id, OAT('G'))); await am.persisted();
    const folder = am.subDir(id); const had = fs.existsSync(folder);
    SAND.failOn('accounts.json', true);
    let err = null; try { hush(() => am.remove(id)); } catch (e) { err = e; }
    SAND.failOn('accounts.json', false);
    return { had, code: err && err.code, owed: !!(err && err.landingOwed), wiped: !fs.existsSync(folder), inMemory: !!am.get(id) };
  };
  const r = await run({ AccountManager });
  ok(r.had && r.code === 'not-durable' && r.owed && r.wiped && !r.inMemory, 'G2 a removal whose landing FAILS finishes the act (its folder wiped, the row gone from memory) and only then says it by name (not-durable, kept: written again)', r);
  const ASRC2 = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const AMhalf = MUT.load('src/accounts.js', anchored(ASRC2, "      unlanded0 = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);", "      this._save({ now: true, why: 'the removal of the account' });", 'remove stops in the middle'), 'remove-half');
  const rx = await run(AMhalf);
  ok(rx.code === 'not-durable' && !rx.wiped, 'RED CONTROL (the first cure\'s form: the synchronous save BEFORE the heal and the wipe): the removal throws in the middle — its folder stays', rx);
}
{
  // G5 (主开发 r4168 MUST 1): a row that holds a sign-in is OFF THE FILE before its folder is wiped (and its pools healed), as at the
  // release — with the writer's thread HELD, what the file lists at the moment of the wipe (the wipe watched); red: that first save off
  // the loop (the follow's first form: the removed row, its long-lived token and its pools come back after a kill past the wipe)
  const fsm = require('fs');
  const wipeOf = async (Mod) => {
    const d = dirOf('g5'), W = mkW(), am = hush(() => new Mod.AccountManager({ dataDir: d, storeWriter: W })), F = path.join(d, 'accounts.json');
    const id = hush(() => am.createSubscription({ name: 'Member' })).id; hush(() => am.setOat(id, OAT('W'))); await am.persisted();
    const folder = path.resolve(am.subDir(id)); let atWipe = null;
    const rm0 = fsm.rmSync;
    fsm.rmSync = function (p, ...rest) { if (atWipe === null && path.resolve(String(p)) === folder) atWipe = !!onDiskRow(F, id); return rm0.call(this, p, ...rest); };
    SAND.hold('accounts.json', 300);
    let err = null;
    try { hush(() => am.remove(id)); } catch (e) { err = (e && e.code) || String(e); } finally { fsm.rmSync = rm0; SAND.unhold('accounts.json'); }
    await am.persisted();
    return { atWipe, err, wiped: !fs.existsSync(folder), onDisk: !!onDiskRow(F, id) };
  };
  const g5 = await wipeOf({ AccountManager });
  ok(g5.atWipe === false && g5.wiped && !g5.onDisk && !g5.err, 'G5 with the writer\'s thread HELD, a member holding a long-lived token is removed: when its folder is wiped the file no longer lists it (a kill past the wipe never brings it back)', g5);
  const ASRC5 = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const AMw = MUT.load('src/accounts.js', anchored(ASRC5, "unlanded0 = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);", 'unlanded0 = (this._save(), null);', 'remove first save off the loop'), 'remove-first-off-loop');
  const g5x = await wipeOf(AMw);
  ok(g5x.atWipe === true, 'RED CONTROL (the first save off the loop, the follow\'s first form): the folder is wiped while the file still lists the row — red', g5x);
}
{
  // G3 (1): a failed landing is SAID AS WHAT IT IS on the door: 503 not-durable by its code (the page's own «not on disk» words)
  const { failAcct } = AUR;
  const e1 = Object.assign(new Error('accounts.json could not be written (EIO) — the key was not saved'), { code: 'not-durable', status: 503, signInSave: true });
  const r1 = resOf(); failAcct(r1, e1);
  const e2 = Object.assign(new Error('The removal of the account was done here, but accounts.json could not be written (EIO) — VibeSpace keeps it in memory and writes it again'), { code: 'not-durable', status: 503, landingOwed: true });
  const r2 = resOf(); failAcct(r2, e2);
  ok(r1.statusCode === 503 && r1.sent.code === 'not-durable' && r1.sent.notOnDisk === true && r1.sent.notKept === true && r2.statusCode === 503 && r2.sent.kept === true, 'G3 the door\'s refusal of a failed landing: 503 not-durable (notKept for an undone act, kept for one that finished) — never a plain 400', { r1: [r1.statusCode, r1.sent], r2: [r2.statusCode, r2.sent] });
}
{
  // G4 (1): the config import with an accounts section whose landing fails: 503 not-durable naming it, with every section it applied
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  const run = async (Pmod) => {
    const D = dirOf('g4'); let mode = 'export';
    const unlanded = () => Object.assign(new Error('accounts.json could not be written (EIO) — the imported accounts was not saved'), { code: 'not-durable', status: 503, signInSave: true });
    const accStub = { exportBundle: () => ({ accounts: [{ id: 'acct-x', name: 'Work key' }] }), held: () => null, importBundle: () => { if (mode === 'unlanded') throw unlanded(); return { imported: 1, skipped: 0 }; }, persisted: () => Promise.resolve(true) };
    hush(() => Pmod.setup({ dataDir: D, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => [], getTasks: () => null, getAccounts: () => accStub, getUsageHistory: () => null, onSettingsWrite: () => { } }));
    const door = (pth) => Pmod.router.stack.find((l) => l.route && l.route.path === pth && l.route.methods.post).route.stack[0].handle;
    const call = (pth, body) => new Promise((resolve) => { const out = { status: 200 }; const res = { status(c) { out.status = c; return this; }, set() { return this; }, setHeader() { }, getHeader() { }, get() { return undefined; }, json(o) { out.body = o; resolve(out); }, send(o) { out.body = o; resolve(out); }, end() { resolve(out); } }; Promise.resolve().then(() => door(pth)({ body, headers: { 'sec-fetch-site': 'same-origin' }, query: {}, params: {}, app: { locals: {} }, socket: {} }, res, () => resolve(out))).catch((e) => { out.status = 'threw'; out.body = { error: String(e && e.message) }; resolve(out); }); });
    const ex = await hush(() => call('/api/config/export', { sections: ['settings'], includeSensitive: ['accounts'], passphrase: 'walk-pass-0001' }));
    mode = 'unlanded';
    const im = ex.body && ex.body.sensitive ? await hush(() => call('/api/config/import', { file: ex.body, sections: ['settings'], includeSensitive: ['accounts'], passphrase: 'walk-pass-0001' })) : null;
    return { status: im && im.status, body: im && im.body };
  };
  const r = await run(P);
  ok(r.status === 503 && !!r.body && r.body.code === 'not-durable' && Array.isArray(r.body.applied) && Array.isArray(r.body.notImported) && r.body.notImported.includes('accounts'), 'G4 the config import whose accounts section cannot land: 503 not-durable naming the accounts section, with the list of every section it DID apply — never a bare «Import failed»', r);
  const PSRC = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8');
  const Px = MUT.load('src/routes/persistence.js', anchored(PSRC, " else if (e && e.code === 'not-durable') accountsUnlanded = e; else throw e; }", ' else throw e; }', 'import rethrows'), 'import-rethrow');
  const rx = await run(Px);
  ok(rx.status !== 503 || !rx.body || !Array.isArray(rx.body.applied), 'RED CONTROL (the cure\'s first form: the failed landing rethrown): no named 503 with the applied list — red', rx);
}

console.log('H. the relogin\'s question (r2734, on the 2.369.418 train; 主开发 r4048) — a KILL between its save and its move, then a fresh start');
{
  // the stand-ins are the VERDICT alone («ask»: the facts could not prove whose sign-in it is) and this press's helper success; the
  // mark, its save, the refusals and the resolve are the real code's
  const AI = require(path.join(REPO, 'src/account-identity.js'));
  const ASRC3 = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  // H1: THE KILL IS REAL — a child process (scripts/fixtures/accounts-relogin-kill.cjs) runs the resolve over this suite's stand-in
  // writer thread HELD and is SIGKILLed at the move into the hold; this process then starts FRESH over the same data, as the hub's
  // next start would, and reads whether the row asks
  const KILL = path.join(REPO, 'scripts/fixtures/accounts-relogin-kill.cjs');
  const killRun = async (modPath) => {
    const d = dirOf('h1'), W = mkW(), am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
    const sid = hush(() => am.createSubscription({ name: 'Member' })).id; await am.persisted();
    SAND.hold('accounts.json', 300);   // the child's writer thread is this suite's stand-in: its write waits 300 ms
    let r = null;
    try { r = spawnSync(process.execPath, [KILL, modPath, d, SAND.path, sid], { encoding: 'utf8', timeout: 30000 }); } finally { SAND.unhold('accounts.json'); }
    const fresh = hush(() => new AccountManager({ dataDir: d, storeWriter: mkW() })), row = fresh.get(sid) || {};
    return { signal: r && r.signal, out: String((r && r.stdout) || '').trim().slice(0, 160), err: String((r && r.stderr) || '').trim().slice(-240), asks: !!row.reloginAsk, resolve: row.reloginAsk ? hush(() => fresh.reloginResolve(sid)).outcome : null };
  };
  const h1 = await killRun(path.join(REPO, 'src/accounts.js'));
  ok(h1.signal === 'SIGKILL' && h1.asks === true && h1.resolve === 'ask', 'H1 a KILL between the question\'s save and the move into the hold: the fresh start reads a row that ASKS (its question can be answered)', h1);
  const offLoop = MUT.write('src/accounts.js', anchored(ASRC3, "try { this._save({ now: true, why: 'the question about the new sign-in' }); }", 'try { this._save(); }', 'ask off the loop'), 'ask-off-loop');
  const h1x = await killRun(offLoop);
  ok(h1x.signal === 'SIGKILL' && h1x.asks === false, 'RED CONTROL (the question\'s save off the loop, line 832 as taken): the same kill leaves a fresh start whose row does NOT ask while the sign-in was going into the hold — red', h1x);
  // H2 / H3 in process: the resolve itself, the move watched (H3: the file at the refusal's return is what a kill then leaves)
  const askOf = async (Mod, { failMark = false, moveFails = false } = {}) => {
    const d = dirOf('h2'), W = mkW(), am = hush(() => new Mod.AccountManager({ dataDir: d, storeWriter: W })), F = path.join(d, 'accounts.json');
    const sid = hush(() => am.createSubscription({ name: 'Member' })).id; await am.persisted();
    am._lookAgain = () => ({ loggedIn: true });
    am._reloginBefore = new Map([[sid, { at: Date.now(), attempt: 'h-1', record: null, word: 'Member' }]]);
    am._loginStatusRaw = () => ({ state: 'success', attempt: 'h-1' });
    let moves = 0;
    am._moveLogin = () => { moves++; return moveFails ? 0 : 1; };
    const was = AI.beforeAfterVerdict; AI.beforeAfterVerdict = () => 'ask';
    let r = null, threw = null, atReturn = null;
    try {
      if (failMark) SAND.failOn('accounts.json', true); else SAND.hold('accounts.json', 300);   // the writer's thread refusing (or HELD)
      try { r = hush(() => am.reloginResolve(sid)); } catch (e) { threw = (e && e.code) || String(e); }
      atReturn = !!(onDiskRow(F, sid) || {}).reloginAsk;
    } finally { AI.beforeAfterVerdict = was; SAND.failOn('accounts.json', false); SAND.unhold('accounts.json'); }
    const inMemory = !!(am.get(sid) || {}).reloginAsk;
    await am.persisted();
    return { outcome: r && r.outcome, code: r && r.code, threw, moves, atReturn, inMemory, onDisk: !!(onDiskRow(F, sid) || {}).reloginAsk };
  };
  const h2 = await askOf({ AccountManager }, { failMark: true });
  ok(h2.outcome === 'refused' && h2.code === 'not-durable' && h2.moves === 0 && !h2.inMemory && !h2.onDisk && !h2.threw, 'H2 a question whose landing FAILS: nothing is set aside, the mark comes off, and the resolve answers the refusal the page says (never a throw it polls into)', h2);
  const h3 = await askOf({ AccountManager }, { moveFails: true });
  ok(h3.outcome === 'refused' && h3.code === 'relogin_hold_failed' && h3.moves === 1 && h3.atReturn === false && !h3.inMemory, 'H3 with the writer\'s thread HELD, a move into the hold that FAILS: when the refusal returns the file no longer holds the question — a kill then never leaves a row that asks while that sign-in is live (r2734 (a))', h3);
  const AMr = MUT.load('src/accounts.js', anchored(ASRC3, "if (!moved) { delete a.reloginAsk; this._saveOrOwe('the question taken back'); return", 'if (!moved) { delete a.reloginAsk; this._save(); return', 'refusal off the loop'), 'refusal-off-loop');   // stale-pins: kept (the red copy plants the refusal's earlier form on purpose)
  const h3x = AMr ? await askOf(AMr, { moveFails: true }) : null;
  ok(!!h3x && h3x.outcome === 'refused' && h3x.atReturn === true, 'RED CONTROL (the refusal\'s save off the loop): the refusal returns while the file still holds the question — red', h3x);
}

{
  // H4 (主开发 r4168 MUST 2): WHILE A SIGN-IN SITS IN THE HOLD ITS ROW ASKS — «another account» whose new row cannot land (it undoes
  // itself) puts the question back before its refusal: memory asks, what lands next asks, the hold untouched. The ask is the real
  // resolve's (the verdict its only stand-in) with the real move into the hold
  const AI = require(path.join(REPO, 'src/account-identity.js'));
  const HELD = '.vibespace-relogin-held';
  const askedRow = async (Mod) => {
    const d = dirOf('h4'), W = mkW({ durableMs: 300 }), am = hush(() => new Mod.AccountManager({ dataDir: d, storeWriter: W })), F = path.join(d, 'accounts.json');
    const sid = hush(() => am.createSubscription({ name: 'Member' })).id; await am.persisted();
    fs.writeFileSync(path.join(am.subDir(sid), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'h4-access', refreshToken: 'h4-refresh', expiresAt: Date.now() + 36e5 } }), { mode: 0o600 });
    am._lookAgain = () => ({ loggedIn: true });
    am._reloginBefore = new Map([[sid, { at: Date.now(), attempt: 'h-4', record: null, word: 'Member' }]]);
    am._loginStatusRaw = () => ({ state: 'success', attempt: 'h-4' });
    const was = AI.beforeAfterVerdict; AI.beforeAfterVerdict = () => 'ask';
    let r0 = null; try { r0 = hush(() => am.reloginResolve(sid)); } finally { AI.beforeAfterVerdict = was; }
    await am.persisted();
    return { am, F, sid, ask: r0 && r0.outcome, heldFile: path.join(am.subDir(sid), HELD, '.credentials.json') };
  };
  const anotherOf = async (Mod) => {
    const w = await askedRow(Mod), heldBefore = fs.existsSync(w.heldFile);
    SAND.failOn('accounts.json', true);
    let code = null; try { hush(() => w.am.reloginAnswer(w.sid, 'another')); } catch (e) { code = (e && e.code) || String(e); }
    SAND.failOn('accounts.json', false);
    const asksNow = !!(w.am.get(w.sid) || {}).reloginAsk;
    let landed = null; try { landed = hush(() => w.am._save({ now: true, why: 'the suite: what memory holds, landed' })); } catch (e) { landed = (e && e.code) || String(e); }
    return { ask: w.ask, heldBefore, code, asksNow, landed, asksOnDisk: !!(onDiskRow(w.F, w.sid) || {}).reloginAsk, heldAfter: fs.existsSync(w.heldFile), rows: w.am.list().accounts.length };
  };
  const h4 = await anotherOf({ AccountManager });
  ok(h4.ask === 'ask' && h4.heldBefore && h4.code === 'not-durable' && h4.asksNow && h4.landed === true && h4.asksOnDisk && h4.heldAfter && h4.rows === 1, 'H4 «another account» whose new row cannot land: refused by name, the question PUT BACK (in memory and in what lands next), the held sign-in untouched, no new row', h4);
  const ASRC4 = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const AMa = MUT.load('src/accounts.js', anchored(ASRC4, "catch (e) { if (e && e.code === 'not-durable') { a.reloginAsk = asked; this._save(); this._notify(); } throw e; }", 'catch (e) { throw e; }', 'another drops the question'), 'another-drops-question');
  const h4x = await anotherOf(AMa);
  ok(h4x.code === 'not-durable' && !h4x.asksNow && !h4x.asksOnDisk && h4x.heldAfter, 'RED CONTROL (the reply that does not put the question back): a row that no longer asks beside a sign-in in the hold — red', h4x);
  // H5 (主开发 r4168 shoulds (a) and (c)): THE TWO RELOGIN DOORS of the real routes module (create() over stand-in hub parts, its data
  // under a scratch root): the finalize door answers the resolve's refusal as an ANSWER (200, outcome refused, its code — the page
  // stops on it); the answer door answers a failed landing 503 not-durable like every other door (red: the bare 400)
  const routesOf = (mod, accounts) => {
    const h = {};
    const app = new Proxy({}, { get: (t, k) => (k === 'use' ? () => { } : (p, ...fns) => { if (typeof p === 'string' && fns.length) (h[k] || (h[k] = new Map())).set(p, fns[fns.length - 1]); }) });
    const at = Date.now(), none = async () => ({ since: at, facts: new Map() });
    const base = { list: () => ({ accounts: [] }), get: () => null, subDir: () => dirOf('h5-nope'), finalizeSubscription: () => ({ loggedIn: true }), finalizeCodexSubscription: () => ({ loggedIn: true }), _subscriptionLoginStatus: () => null, decisionList: () => ({ accounts: [] }), decisionRowOf: () => null, signinFactsNow: none, signinFactsSettled: none };
    let err = null;
    try { hush(() => mod.create({ app, rootDir: dirOf('h5-root'), HOST: '127.0.0.1', CLAUDE_CMD: 'claude', NODE_CMD: 'node', CLAUDE_SUBSCRIPTION_LOGIN_HELPER: path.join(dirOf('h5-helper'), 'helper.js'), activeSessions: new Map(), auth: { enabled: false }, engine: { clearSealedOrders: () => { } }, serverSetting: () => null, recordUsageAttribution: () => { }, liveAccountIdSet: () => new Set(), buildClaudeSubscriptionLoginCommand: () => 'claude auth login', getAccounts: () => ({ ...base, ...accounts }), getHosts: () => null, getMounts: () => null, getTelemetry: () => null, getUsageHistory: () => null, getLoginExpiryWatch: () => null })); } catch (e) { err = e && e.message; }
    return { post: h.post || new Map(), err };
  };
  const callDoor = (fn, req) => { const res = resOf(); try { fn({ params: {}, query: {}, body: {}, headers: {}, ...req }, res); } catch (e) { res.threw = e && e.message; } return res; };
  const doors = async (mod) => {
    // the finalize door over the REAL resolve whose question cannot land
    const d = dirOf('h5'), W = mkW({ durableMs: 300 }), am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
    const sid = hush(() => am.createSubscription({ name: 'Member' })).id; await am.persisted();
    am._lookAgain = () => ({ loggedIn: true });
    am._reloginBefore = new Map([[sid, { at: Date.now(), attempt: 'h-5', record: null, word: 'Member' }]]);
    am._loginStatusRaw = () => ({ state: 'success', attempt: 'h-5' });
    let w = null;   // the answer door's world (below), read by the stand-in only when that door is called
    const R = routesOf(mod, { reloginResolve: (id) => am.reloginResolve(id), reloginAnswer: (id, ans) => w.am.reloginAnswer(id, ans) });
    const fin = R.post.get('/api/accounts/:id/relogin-finalize'), ans = R.post.get('/api/accounts/:id/relogin-answer');
    const was = AI.beforeAfterVerdict; AI.beforeAfterVerdict = () => 'ask';
    let f = null;
    SAND.failOn('accounts.json', true);
    try { f = fin ? callDoor(fin, { params: { id: sid } }) : null; } finally { AI.beforeAfterVerdict = was; SAND.failOn('accounts.json', false); }
    // the answer door over the REAL reply whose new row cannot land
    w = await askedRow({ AccountManager });
    let a = null;
    SAND.failOn('accounts.json', true);
    try { a = ans ? callDoor(ans, { params: { id: w.sid }, body: { answer: 'another' } }) : null; } finally { SAND.failOn('accounts.json', false); }
    return { built: !R.err, err: R.err, fin: f && { status: f.statusCode, success: f.sent && f.sent.success, outcome: f.sent && f.sent.outcome, code: f.sent && f.sent.code }, ans: a && { status: a.statusCode, code: a.sent && a.sent.code, notKept: a.sent && a.sent.notKept } };
  };
  const h5 = await doors(AUR);
  ok(h5.built && h5.fin && h5.fin.status === 200 && h5.fin.success === true && h5.fin.outcome === 'refused' && h5.fin.code === 'not-durable', 'H5 the finalize door: a question that cannot land comes back as an ANSWER the page stops on (200, outcome refused, code not-durable) — never a throw it polls into', h5);
  ok(h5.ans && h5.ans.status === 503 && h5.ans.code === 'not-durable' && h5.ans.notKept === true, 'H5 the answer door: a reply whose new row cannot land answers 503 not-durable (notKept: undone in memory), as every other door', h5.ans);
  const AURSRC5 = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  const AURx5 = MUT.load('src/server/account-usage-routes.js', anchored(AURSRC5, "  } catch (e) { failAcct(res, e); }   // 主开发 r4168 (a): a failed landing answers 503 not-durable, as on every door", '  } catch (e) { res.status(400).json({ error: e.message }); }', 'answer door bare 400'), 'answer-door-400');
  const h5x = await doors(AURx5);
  ok(h5x.ans && h5x.ans.status === 400, 'RED CONTROL (the answer door\'s bare 400): the failed landing is not said as not-durable — red', h5x.ans);
}

for (const W of lives) { try { W.stop(); } catch { } }
report();
