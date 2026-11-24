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
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
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
  SAND.hold('accounts.json', 500);
  const res = resOf();
  answerAfterLanding(am, res);
  const id = hush(() => am.add({ name: 'Work key', key: KEY('a') })).id;
  res.json({ success: true, id });
  await sleep(150);
  const early = res.sent;
  for (let i = 0; i < 60 && !res.sent; i++) await sleep(50);
  SAND.unhold('accounts.json');
  let disk = null; try { disk = JSON.parse(fs.readFileSync(path.join(d, 'accounts.json'), 'utf8')); } catch { }
  const onDisk = !!(disk && disk.accounts.some((a) => a.id === id && a.keyEnc));
  ok(early === null && !!res.sent && res.statusCode === 200 && onDisk, 'A1 the key a person typed: no answer while its write is held on the writer\'s thread; the answer (200) only once accounts.json holds it', { early, sent: res.sent, code: res.statusCode, onDisk });
  // A3 — an act that saved nothing is not held
  const r3 = resOf(); answerAfterLanding(am, r3); r3.json({ answered: true });
  ok(!!r3.sent && r3.statusCode === 200, 'A3 a reply whose act saved nothing answers at once (nothing to wait for)', { sent: r3.sent });
}
{
  const d = dirOf('a2'), W = mkW({ durableMs: 400 });
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  SAND.failOn('accounts.json', true);
  const res = resOf(); answerAfterLanding(am, res);
  hush(() => am.add({ name: 'Home key', key: KEY('b') }));
  res.json({ success: true });
  for (let i = 0; i < 60 && !res.sent; i++) await sleep(50);
  SAND.failOn('accounts.json', false);
  ok(res.statusCode === 503 && !!res.sent && res.sent.code === 'not-durable' && res.sent.notOnDisk === true, 'A2 a write the storage refuses: 503 not-durable by name (the family\'s known code), never a silent «saved»', { code: res.statusCode, sent: res.sent });
}
{
  const d = dirOf('a4'), W = mkW();
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  hush(() => { am.add({ name: 'k1', key: KEY('c') }); am.add({ name: 'k2', key: KEY('d') }); am.add({ name: 'k3', key: KEY('e') }); });
  const landed = await am.persisted();
  ok(landed === true && writesOf(W, 'accounts.json') === 1, 'A4 three saves in one turn are ONE landing of accounts.json (the bytes made at the write)', { landed, writes: writesOf(W, 'accounts.json') });
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
  ok(placed === 1 && !!am.held() && refused === 'accounts_unread' && writesOf(W, 'accounts.json') === 0 && fs.readFileSync(F, 'utf8') === before, 'B1 a list held at its start (its read failed): a person\'s act refused accounts_unread, a machine\'s save asks nothing of the writer, the file is the bytes it was', { placed, held: !!am.held(), refused, writes: writesOf(W, 'accounts.json') });
  try { am.close(); } catch { }
}
{
  // B2 — no production road makes a hold AFTER a save queued (accounts.json holds only at its start's read, and a torn hold rises
  // from a list already held), so the hold is PLACED through the helper's own answer, held(), while the write waits on the thread
  const d = dirOf('b2'), W = mkW();
  const am = hush(() => new AccountManager({ dataDir: d, storeWriter: W }));
  hush(() => am.add({ name: 'First key', key: KEY('h') })); await am.persisted();
  const F = path.join(d, 'accounts.json'), before = fs.readFileSync(F, 'utf8');
  SAND.hold('accounts.json', 400);
  hush(() => am.add({ name: 'Second key', key: KEY('i') }));   // queued: the thread waits 400 ms before it writes
  const realHeld = am._hold.held.bind(am._hold);
  am._hold.held = () => ({ code: 'EIO', since: Date.now() });   // the hold rises while the write waits
  const landed = await am.persisted();
  await sleep(600);
  SAND.unhold('accounts.json');
  am._hold.held = realHeld;
  ok(landed === false && fs.readFileSync(F, 'utf8') === before, 'B2 a write queued before a hold lands nothing: the producer refuses (EHELD) and the file stays the bytes that were read', { landed, same: fs.readFileSync(F, 'utf8') === before });
}

for (const W of lives) { try { W.stop(); } catch { } }
report();
