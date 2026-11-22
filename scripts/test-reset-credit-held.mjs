#!/usr/bin/env node
// B-f276's remainder (lane bl-windows, 主开发 r1694 / r1702) — THE MONEY STORE OF THE ROW: data/reset-credit-tries.json under THE STORE READ.
// The release read a FAILED read of the reset-credit attempts as «no attempts»: an attempt that may have gone out before the
// restart was forgotten (its floor with it), the next press minted a second key and its persist WROTE OVER the healthy file.
// Now a read that failed is HELD:
//   ① a failed read at the start, then a press: refused BY NAME (`attempts_unread`, the POST 409, no verb to codex), the healthy
//     file untouched byte for byte, ONE For-you item that says it heals by itself. The file is read again AT THE NEXT PRESS (and at
//     the pool's own pass — never a timer of its own): a read again that fails too keeps the hold; the next answers — the attempt
//     that went out is back (unknown, charged) and THE FLOOR HOLDS (the next press must read the account first), the item resolved.
//     RED CONTROL: the release's shape — the press is free, a second key is minted and the file is written over.
//   ② bytes that do not parse and CANNOT be set aside (the rename refused): their only copy — held, never written over.
//     RED CONTROL: a failed set-aside starts empty.
//   ③ the refusal has its own sentence in the dialog's table.
// In-process: the real engine over a scratch data/, a stub conversation whose wrapper takes the verb (nothing reaches a vendor).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('rct-held');
const { ok, report } = checker();
const quietly = async (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };

const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { registerResetCreditRoutes } = require(path.join(REPO, 'src/routes/reset-credit.js'));
const RC = require(path.join(REPO, 'src/reset-credit.js'));
const ESRC = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
const MUT = mutantCopies('rct-held', REPO);

let wn = 0;
/** one world: a codex account, the real engine over its data/, the reset-credit routes; `session` = a conversation on that account whose
 *  (stub) wrapper advertises the keyed verb — the carrier a press goes through (its verbs are collected, nothing is sent anywhere) */
function world({ engine = engMod, root: root0 = null, todos = null, session = false } = {}) {
  const root = root0 || path.join(ROOT, `w${++wn}`);
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const prevHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(root, 'shared-codex');
  const wam = new AccountManager({ dataDir: path.join(root, 'data') });
  const A = root0 ? wam.list().accounts.find((a) => a.name === 'Cx Held').id : wam.createCodexSubscription({ name: 'Cx Held' }).id;
  process.env.CODEX_HOME = prevHome;
  const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const settings = { 'codex.limitResetCredit': 'off', 'spend.unattendedPerIdentityHour': 100 };
  const sessions = new Map(), wrote = [];
  if (session) {
    const bd = path.join(root, 'data', 'session-buffers'); fs.mkdirSync(bd, { recursive: true });
    fs.writeFileSync(path.join(bd, 'cx1.json'), JSON.stringify({ caps: { resetCreditKey: true, resetCreditReadFirst: true } }));
    sessions.set('cx1', { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx1', backendSessionId: 'thread-1', _accountId: A, name: 'cx-conv', _normalizer: { injectPeerCard: () => null }, _isStreaming: false, _turnState: 'idle', _lastPtyDataAt: Date.now(), pty: { write: (x) => { wrote.push(String(x)); } } });
  }
  const eng = quiet(() => engine.create({
    app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: (k) => settings[k], getAccounts: () => wam, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => ({ armIfEnabled() { }, noteRecovered() { }, noteFireOutcome() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
    getQuotaProbe: () => null, getUserTodos: () => todos,
  }));
  const routes = {};
  registerResetCreditRoutes({ get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } }, { engine: eng });
  const call = (method, body = {}) => quietly(() => new Promise((resolve) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; }, set() { return this; } };
    Promise.resolve(routes[`${method} /api/accounts/:id/reset-credit`]({ params: { id: A }, body, query: {}, headers: {} }, res)).catch((e) => resolve({ code: 'threw', body: { error: e && e.message } }));
  }));
  const verbs = () => wrote.filter((x) => /"codex-reset-credit"/.test(x)).length;
  return { root, A, eng, call, verbs, file: path.resolve(path.join(root, 'data', 'reset-credit-tries.json')) };
}
/** an attempt that WENT OUT and got no answer before the stop (the money case: it may have landed) */
const TRIES = (A) => JSON.stringify({ v: 1, at: Date.now(), tries: [{ key: A, at: Date.now() - 60e3, sentAt: Date.now() - 59e3, sid: 'cx1', via: 'session', origin: 'user', idempotencyKey: 'k-held-1', identity: { key: A, name: 'Cx Held' }, charged: false }] });
const heldOf = (w) => (typeof w.eng._resetCreditTriesHeld === 'function' ? w.eng._resetCreditTriesHeld() : null);
const settle = async (w) => { const p = typeof w.eng._resetCreditTriesReading === 'function' ? w.eng._resetCreditTriesReading() : null; if (p) await p; };

console.log('① a failed READ of the attempts at the start, then a press — held, refused by name, read again at the press');
const heldRun = async (engine) => {
  const w0 = world({ engine });
  const bytes = TRIES(w0.A);
  fs.writeFileSync(w0.file, bytes);
  const items = [], done = [];
  const todos = { add: (k, it) => { items.push(it); return { id: `ut-held-${items.length}` }; }, get: (id) => ({ id, status: done.includes(id) ? 'done' : 'open' }), setStatus: (id, st) => { if (st === 'done') done.push(id); } };
  const realRead = fs.readFileSync, realP = fs.promises.readFile;
  let boots = 0, rereads = 0;
  fs.readFileSync = function (p, ...a) { if (!boots && path.resolve(String(p)) === w0.file) { boots++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, p, ...a); };
  fs.promises.readFile = async function (p, ...a) { if (!rereads && path.resolve(String(p)) === w0.file) { rereads++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realP.call(this, p, ...a); };
  let w;
  try { w = world({ engine, root: w0.root, todos, session: true }); } finally { fs.readFileSync = realRead; }
  const st = heldOf(w);
  const held = { boots, code: st && st.code, records: w.eng._resetCreditTries.size };
  try {
    const g1 = await w.call('GET'); await settle(w);   // the dialog opens: its read again FAILS too (EIO) — still held
    held.preview = g1.body && g1.body.code; held.stillHeld = !!heldOf(w);
    const p1 = await w.call('POST', { sessionId: 'cx1' });   // the press: refused by name; its own read again answers (after it)
    held.post = { code: p1.code, as: p1.body && p1.body.code }; held.verbs = w.verbs(); held.kept = realRead(w0.file, 'utf8') === bytes;
    held.items = items.length; held.text = items[0] && items[0].text;
    await settle(w);
  } finally { fs.promises.readFile = realP; }
  const t = w.eng._resetCreditTries.get(w.A);
  const g2 = await w.call('GET');
  const after = { held: !!heldOf(w), rereads, outcome: t ? t.outcome : null, charged: !!(t && t.charged), key: t ? t.idempotencyKey : null, preview: g2.body && g2.body.code, unsettled: !!(g2.body && g2.body.unsettled), resolved: done.length, verbs: w.verbs() };
  return { held, after, onDisk: realRead(w0.file, 'utf8') };
};
const h = await heldRun(engMod);
console.log(`    facts: ${JSON.stringify({ held: h.held, after: h.after })}`);
ok(h.held.boots === 1 && h.held.code === 'EIO' && h.held.records === 0, 'the start\'s read FAILS (EIO): the attempts are HELD (code EIO) — none taken in as «no attempts»', h.held);
ok(h.held.preview === 'attempts_unread' && h.held.stillHeld && h.held.post.code === 409 && h.held.post.as === 'attempts_unread' && h.held.verbs === 0, 'a press while held: the dialog says attempts_unread (its read again failed too: still held), the POST answers 409 attempts_unread — no verb to the wrapper, no key minted', h.held);
ok(h.held.kept, 'the healthy file is untouched byte for byte while held (never written over)', h.held);
ok(h.held.items === 1 && /could not be read — no reset credit is used until they read again; this heals by itself/.test(h.held.text || ''), 'ONE For-you item: the records could not be read, no credit is used until they read, it heals by itself', h.held);
ok(!h.after.held && h.after.rereads === 1 && h.after.outcome === 'unknown' && h.after.charged && h.after.key === 'k-held-1' && h.after.resolved === 1, 'READ AGAIN at the press: the attempt that went out is back — unknown and charged (its own key), the hold lifted, the item resolved', h.after);
ok((h.after.unsettled || h.after.preview === 'cooldown') && h.after.preview !== 'attempts_unread' && h.after.verbs === 0, 'THE FLOOR HOLDS after the lift: the attempt that may have landed blocks a free press (the next press must read the account first) — never a second key on a guess', h.after);
const FROM = '  if (a.state === \'unreadable\') { holdResetCreditTries(a); return 0; }\n';
const hx = await heldRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, FROM, '  if (a.state === \'unreadable\') return 0;\n', 'the release\'s «no attempts»'), 'rct-no-attempts'));
ok(!hx.held.code && hx.held.post.as !== 'attempts_unread' && hx.held.verbs === 1 && !hx.held.kept && !hx.onDisk.includes('k-held-1'), 'RED CONTROL (the release\'s read: a failed read is «no attempts»): the press goes — a second key minted, the file WRITTEN OVER (the attempt that went out is gone from disk)', { held: hx.held, onDisk: hx.onDisk.slice(0, 120) });

console.log('② bytes that do not parse and CANNOT be set aside — their only copy, held');
const asideRun = async (engine) => {
  const w0 = world({ engine });
  const torn = '{"v":1,"tries":[{"key":"' + w0.A + '","at":1';
  fs.writeFileSync(w0.file, torn);
  const realRename = fs.renameSync;
  fs.renameSync = function (a, b) { if (path.resolve(String(a)) === w0.file) throw Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }); return realRename.call(this, a, b); };
  let w;
  try { w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-aside' }) } }); } finally { fs.renameSync = realRename; }
  const st = heldOf(w);
  const g = await w.call('GET');
  return { code: st && st.code, preview: g.body && g.body.code, kept: fs.readFileSync(w0.file, 'utf8') === torn };
};
const a2 = await asideRun(engMod);
ok(a2.code === 'set-aside failed' && a2.preview === 'attempts_unread' && a2.kept, 'torn bytes whose set-aside is refused (EACCES): HELD (set-aside failed), every use refused by name, the bytes kept as they are — never started empty over their only copy', a2);
const ASIDE = '    if (a.state === \'unreadable\') { holdResetCreditTries({ code: \'set-aside failed\', why: \'its bytes did not parse and could not be set aside\' }); return 0; }';
const ax = await asideRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, ASIDE, '    if (false) { }', 'a failed set-aside starts empty'), 'rct-aside-empty'));
ok(!ax.code && ax.preview !== 'attempts_unread', 'RED CONTROL (a failed set-aside starts empty, the release\'s road): nothing held — the next write takes the only copy of those bytes — red', ax);

console.log('③ the refusal in words');
ok(RC.REFUSAL_CODES.includes('attempts_unread') && RC.refusalLine('attempts_unread').key !== RC.refusalLine('zzz').key && /could not be read/.test(RC.refusalLine('attempts_unread').key) && /heals by itself/.test(RC.refusalLine('attempts_unread').key), 'attempts_unread is a refusal of the dialog\'s table with its own sentence, which says it heals by itself (never the generic «the server refused it»)', RC.refusalLine('attempts_unread'));

report();
