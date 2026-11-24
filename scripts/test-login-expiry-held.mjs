#!/usr/bin/env node
// test-login-expiry-held — r3003 (d) (主开发, lane hub-loop-stalls): data/login-expiry.json (which login warnings were filed, the items a
// re-login retracts, when the watch began, the measured session lengths) UNDER THE STORE-READ LAW (src/store-read-hold.js), through the REAL
// src/server/login-expiry-watch.js over a scratch data folder of this suite's own, with a stand-in of the account store (made-up
// logins) and the REAL For-you store (src/user-todos.js) over the same folder; the clock MOVES between lives (a warning's words carry the
// time left, so a second witness that matched words would be green only on a fixed clock). The unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, the next read
// only), never a mount, never a mode change; torn bytes are bytes written whole that do not parse. No vendor call, nothing else.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const W = require(path.join(REPO, 'src/server/login-expiry-watch.js'));
const LE = require(path.join(REPO, 'src/login-expiry.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const M = mutantCopies('login-expiry-held', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/server/login-expiry-watch.js'), 'utf8');
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
const placeReads = (file, n = 1) => {
  const f = path.resolve(file), realS = fs.readFileSync; const seen = { sync: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.sync < n) { seen.sync++; throw EIO(); } return realS.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dirN = 0;
const mk = () => { const d = path.join(scratch('login-expiry-held'), 'd' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
const T0 = 1_800_000_000_000;
/** a subscription whose login ends in 20 h (the «24 h left» rung) */
const creds = (t) => ({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: t + 6 * 3600e3, refreshTokenExpiresAt: T0 + 20 * 3600e3, scopes: ['user:inference'] } });
const accounts = { list: () => ({ accounts: [{ id: 'sub-1', name: 'Work', type: 'subscription', backend: 'claude' }] }), decisionLoginStateOf: (id, t) => LE.loginState(creds(t), t) };
/** For you — the real store over the life's folder (no expiry timer); `open` = this watch's open items */
const inbox = (dir) => { const t = new UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0, now: () => T0 });
  return Object.assign(t, { open: () => t.forSession([W.INBOX_KEY]) }); };
const T1 = T0 + 3 * 3600e3;   // a later life: the same «24 h left» rung, its words now «17 h»
const fileOf = (dir) => path.join(dir, 'login-expiry.json');
const mkW = (Mod, dir, todos, logs, t = T1) => Mod.create({ accounts, userTodos: todos, dataDir: dir, now: () => t, log: (...a) => logs.push(a.join(' ')) });
/** life one at T0: the record read, one sweep files the «24 h left» warning and records it */
function firstLife(Mod = W) { const dir = mk(), todos = inbox(dir), logs = []; const w = mkW(Mod, dir, todos, logs, T0); w.sweep(); return { dir, todos, bytes: fs.readFileSync(fileOf(dir), 'utf8'), first: todos.open().map((i) => ({ id: i.id, text: i.text })) }; }
function heldLife(Mod, dir, todos, logs = []) { const pr = placeReads(fileOf(dir)); let w = null; try { w = mkW(Mod, dir, todos, logs); } finally { pr.restore(); } return { w, logs, seen: pr.seen.sync }; }
// THE RELEASE (the RED copies): a read blind to the hold, a save over the unread record, a filing with no identity of its own
const NO_HOLD = (src) => anchored(anchored(src, "    { const h = hold.held(); if (h) {", "    { const h = null; if (h) {", 'sweep-blind-to-the-hold'), "    if (!hold.writable('a write of the login warnings record')) return;", '', 'save-over-the-unread-record');
const NO_KEY = (src) => anchored(src, "          itemKey: `login-expiry:${a.id}:${emit}:${lexp ?? 'none'}`,\n", '', 'filed-with-no-key');

console.log('§1 a record that could not be read is HELD: the sweep files, retracts and drops nothing, nothing is written over it; it comes back whole');
{
  const f = firstLife();
  ok(f.first.length === 1 && JSON.parse(f.bytes).members['sub-1'] && JSON.parse(f.bytes).since === T0, 'CONTROL: a readable record — one sweep files the «24 h left» warning once and records it', f.first);
  const again = mkW(W, f.dir, f.todos, []); again.sweep();
  ok(f.todos.open().length === 1, 'CONTROL: a later start (3 h on) that reads the record files nothing twice', f.todos.open().length);
  const bytes = fs.readFileSync(fileOf(f.dir), 'utf8');
  const { w, logs, seen } = heldLife(W, f.dir, f.todos);
  const r = w.sweep(); w.sweep();
  ok(seen === 1 && !!w.held() && r && r.held === true && f.todos.open().length === 1 && fs.readFileSync(fileOf(f.dir), 'utf8') === bytes && logs.filter((l) => /sweep skipped — the record of the login warnings already filed could not be read/.test(l)).length === 1, 'HELD: the sweeps file nothing, retract nothing, write nothing over the record; said ONCE a hold', { held: w.held(), open: f.todos.open().length, logs });
  ok(/could not be read/.test(w.heldWords() || ''), `HELD: its words name what waits («${w.heldWords()}»)`);
  const lifted = await w.readAgain();
  w.sweep();
  ok(lifted === true && !w.held() && f.todos.open().length === 1 && !!w.ledger()['sub-1'] && w.watchingSince() === T0, 'LIFTED: the record back as it was (the watch began at T0) — the warning already filed is not filed again', { open: f.todos.open().length, since: w.watchingSince() });
  // RED: the release (no hold, no key) — the same warning filed a SECOND time (its words moved with the clock) and the record written over
  const REL = M.load('src/server/login-expiry-watch.js', NO_KEY(NO_HOLD(SRC)), 'release');
  const g = firstLife(REL);
  const h = heldLife(REL, g.dir, g.todos); h.w.sweep();
  ok(g.todos.open().length === 2 && JSON.parse(fs.readFileSync(fileOf(g.dir), 'utf8')).since === T1, 'RED: the release — the same warning filed a SECOND time and the record written over (the watch «began» again)', g.todos.open().map((i) => i.text));
  // RED: the key without the hold — one item (the store's identity), but the record still written over: the watch's birth and the measured lengths gone
  const HK = M.load('src/server/login-expiry-watch.js', NO_HOLD(SRC), 'no-hold');
  const k = firstLife(HK);
  heldLife(HK, k.dir, k.todos).w.sweep();
  ok(k.todos.open().length === 1 && JSON.parse(fs.readFileSync(fileOf(k.dir), 'utf8')).since === T1, 'RED: no hold — the record written over (since reset to the held life), though the key files nothing twice', JSON.parse(fs.readFileSync(fileOf(k.dir), 'utf8')).since);
  for (const t of [f.todos, g.todos, k.todos]) try { t.flush(); } catch { }
}

console.log('§2 a restart while still unreadable: held again, its sweeps file nothing, the record untouched');
{
  const f = firstLife();
  heldLife(W, f.dir, f.todos).w.sweep();
  const b = heldLife(W, f.dir, f.todos); b.w.sweep();
  ok(!!b.w.held() && f.todos.open().length === 1 && fs.readFileSync(fileOf(f.dir), 'utf8') === f.bytes, 'a second start while unreadable: held again, nothing filed, the bytes as they were');
  try { f.todos.flush(); } catch { }
}

console.log('§3 TORN: kept aside once; the record starts empty; THE INBOX IS THE SECOND WITNESS — the warning re-filed is the SAME item (its key), never a second');
{
  const run = async (Mod = W) => {
    const f = firstLife(Mod);
    const TORN = f.bytes.slice(0, 40);
    fs.writeFileSync(fileOf(f.dir), TORN);
    const logs = [];
    const w = mkW(Mod, f.dir, f.todos, logs);
    for (let i = 0; i < 200 && w.held(); i++) await sleep(10);
    w.sweep();
    const copies = fs.readdirSync(f.dir).filter((n) => n.startsWith('login-expiry.json.corrupt-'));
    const open = f.todos.open();
    try { f.todos.flush(); } catch { }
    return { first: f.first, open: open.map((i) => ({ id: i.id, text: i.text })), copies, copyOk: copies.length === 1 && fs.readFileSync(path.join(f.dir, copies[0]), 'utf8') === TORN, rec: (w.ledger()['sub-1'] || {}).items || [], logs };
  };
  const g = await run();
  ok(g.open.length === 1 && g.copyOk && g.open[0].id === g.first[0].id && g.rec.length === 1 && g.rec[0].id === g.first[0].id && g.logs.some((l) => /already in For you — the same item/.test(l)), `TORN: kept aside once, byte for byte; the warning re-filed is the SAME item (its id back in the record for the retraction), not a second (${g.open.length})`, g);
  ok(g.open[0].text !== g.first[0].text && g.rec[0].text === g.open[0].text, 'CONTROL: the words moved with the clock (a match by words would have filed twice) — the record keeps the words the item has now', { was: g.first[0].text, now: g.open[0].text });
  const r = await run(M.load('src/server/login-expiry-watch.js', NO_KEY(SRC), 'no-key'));
  ok(r.open.length === 2, `RED: no identity of its own — after torn bytes the same warning is filed twice (${r.open.length})`, r.open);
}
console.log('§4 production: server.js builds the watch over its own data folder');
{
  const sv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/require\('\.\/src\/server\/login-expiry-watch\.js'\)\.create\(\{ accounts, userTodos, dataDir: path\.join\(__dirname, 'data'\)/.test(sv), 'PRODUCTION: the watch reads its record from the data folder, over the real account store and For you');
}

report();
