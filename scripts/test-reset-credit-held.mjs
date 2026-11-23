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
//   ③ the refusal has its own sentence in the dialog's table — «until the file can be read», and the file and its access (r2413 (3)).
//   line 429's follow (round w4lak1ba3, 主开发 r2413), each with its red control:
//   ④ THE AUTOMATIC RUNG while held: no verb, no attempt minted, the wall card names the true reason (its code on the card) — the
//     writer's own guard is the ONLY door on that road (the rung never asks the preview). ⑤ the HELPER's writer's guard.
//   ⑥ torn bytes found by a READ AGAIN are set aside OFF the loop (never a sync rename after the start). ⑦ a set-aside that FAILED
//     is tried again by a press alone, never the pool's own pass. ⑧ a read again that never settles: past the bound the next press
//     may read (still held), never more than two at once, the pool's pass never. ⑨ words: a cause that does not pass.
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
function world({ engine = engMod, root: root0 = null, todos = null, session = false, mode = 'off', warm = false, cards = null } = {}) {
  const root = root0 || path.join(ROOT, `w${++wn}`);
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const prevHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(root, 'shared-codex');
  const wam = new AccountManager({ dataDir: path.join(root, 'data') });
  const A = root0 ? wam.list().accounts.find((a) => a.name === 'Cx Held').id : wam.createCodexSubscription({ name: 'Cx Held' }).id;
  process.env.CODEX_HOME = prevHome;
  const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const settings = { 'codex.limitResetCredit': mode, 'spend.unattendedPerIdentityHour': 100 };
  const sessions = new Map(), wrote = [];
  if (session) {
    const bd = path.join(root, 'data', 'session-buffers'); fs.mkdirSync(bd, { recursive: true });
    fs.writeFileSync(path.join(bd, 'cx1.json'), JSON.stringify({ caps: { resetCreditKey: true, resetCreditReadFirst: true } }));
    sessions.set('cx1', { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx1', backendSessionId: 'thread-1', _accountId: A, name: 'cx-conv', createdAt: Date.now(), _normalizer: { injectPeerCard: (c) => { if (cards) cards.push(c); return c; } }, _isStreaming: warm, _turnState: warm ? 'running' : 'idle', _lastPtyDataAt: Date.now(), pty: { write: (x) => { wrote.push(String(x)); } } });
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
  return { root, A, eng, call, verbs, session: sessions.get('cx1') || null, file: path.resolve(path.join(root, 'data', 'reset-credit-tries.json')) };
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
const ASIDE = '  if (a.state === \'unreadable\') { holdResetCreditTries({ code: \'set-aside failed\', why: \'its bytes did not parse and could not be set aside\', asideFailed: true }); return 0; }';   // line 429's follow: in settleTornTries now
const ax = await asideRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, ASIDE, '  if (false) { }', 'a failed set-aside starts empty'), 'rct-aside-empty'));
ok(!ax.code && ax.preview !== 'attempts_unread', 'RED CONTROL (a failed set-aside starts empty, the release\'s road): nothing held — the next write takes the only copy of those bytes — red', ax);

console.log('③ the refusal in words');
ok(RC.REFUSAL_CODES.includes('attempts_unread') && RC.refusalLine('attempts_unread').key !== RC.refusalLine('zzz').key && /could not be read/.test(RC.refusalLine('attempts_unread').key) && /until the file can be read/.test(RC.refusalLine('attempts_unread').key) && /attempts file in VibeSpace’s data folder and its access/.test(RC.refusalLine('attempts_unread').key) && !/data\//.test(RC.refusalLine('attempts_unread').key) && !/heals by itself/.test(RC.refusalLine('attempts_unread').key), 'attempts_unread is a refusal of the dialog\'s table with its own sentence, which says it heals by itself (never the generic «the server refused it»)', RC.refusalLine('attempts_unread'));

const EIO = () => Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
/** a world whose START read failed (EIO): the attempts held from the start — `then(w)` runs inside it */
const heldWorld = async (engine, { bytes = null, opts = {}, failStart = 'EIO' } = {}) => {
  const w0 = world({ engine });
  const b = bytes == null ? TRIES(w0.A) : bytes;
  fs.writeFileSync(w0.file, b);
  const realRead = fs.readFileSync, realRename = fs.renameSync;
  let boots = 0;
  if (failStart === 'EIO') fs.readFileSync = function (p, ...a) { if (!boots && path.resolve(String(p)) === w0.file) { boots++; throw EIO(); } return realRead.call(this, p, ...a); };
  if (failStart === 'aside') fs.renameSync = function (a, c) { if (path.resolve(String(a)) === w0.file) throw Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }); return realRename.call(this, a, c); };
  let w;
  try { w = world({ engine, root: w0.root, ...opts }); } finally { fs.readFileSync = realRead; fs.renameSync = realRename; }
  return { w, bytes: b, file: w0.file };
};
const tick = () => new Promise((z) => setImmediate(z));

console.log('④ THE AUTOMATIC RUNG while the attempts are held — the writer\'s own guard is its only door');
const autoRun = async (engine) => {
  const cards = [];
  const realP = fs.promises.readFile;
  let H;
  fs.promises.readFile = async function (p, ...a) { if (H && path.resolve(String(p)) === H.file) throw EIO(); return realP.call(this, p, ...a); };   // every read again fails: held through the leg
  try {
    H = await heldWorld(engine, { opts: { todos: { add: () => ({ id: 'ut-auto' }) }, session: true, mode: 'auto', warm: true, cards } });
    const { w } = H, s = w.session, nowS = Math.floor(Date.now() / 1000);
    quiet(() => w.eng.recordCodexQuotaSignal(s, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 2 }, rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: nowS + 3 * 86400 }, secondary: null } }));
    { const t0 = Date.now(); while (Date.now() < t0 + 2) { } }   // the wall comes LATER than the read (the cache keeps the newer file)
    quiet(() => w.eng.recordCodexQuotaSignal(s, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: nowS + 7200 }));
    await tick(); await settle(w);
    const card = cards.find((c) => c && c.resetCredit) || null;
    return { held: !!heldOf(w), verbs: w.verbs(), minted: w.eng._resetCreditTries.size, refused: card ? card.resetCredit.refused || null : null, text: card ? String(card.text).slice(-460) : null, kept: fs.readFileSync(H.file, 'utf8') === H.bytes };
  } finally { fs.promises.readFile = realP; }
};
const au = await autoRun(engMod);
console.log(`    facts: ${JSON.stringify(au)}`);
ok(au.held && au.verbs === 0 && au.minted === 0 && au.kept, 'the automatic rung at a wall while held: NO verb to the wrapper, NO attempt minted, the file untouched', au);
ok(au.refused === 'attempts_unread' && /Not used automatically: the reset-credit attempt records could not be read \(EIO\)/.test(au.text || '') && !/unattended-spend ceiling/.test(au.text || ''), 'the wall card names the TRUE reason (the attempt records could not be read) and carries the writer\'s own code — never «the unattended-spend ceiling refused it»', au);
const aux = await autoRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  { const held = resetCreditTriesRefusal(); if (held) { console.log(`[codex] reset credit refused for ${session._webuiId}: ${held.why}`); return held; } }   // B-f276\'s remainder: the floor is in a file that could not be read\n', '', 'the writer\'s guard taken out'), 'rct-auto-unguarded'));
ok(aux.verbs > 0 || aux.minted > 0, 'RED CONTROL (the writer\'s own guard taken out): the automatic rung spends while the attempts are held — a verb goes out, an attempt is minted — red', aux);

console.log('⑤ THE HELPER\'s writer while held');
const helperRun = async (engine) => { const { w } = await heldWorld(engine); return { held: !!heldOf(w), r: quiet(() => w.eng._writeResetCreditViaHelper(w.A, {})) }; };
const hp = await helperRun(engMod);
ok(hp.held && hp.r && hp.r.ok === false && hp.r.code === 'attempts_unread', 'the helper\'s writer while held refuses by name (attempts_unread) before it looks for its helper', hp);
const hpx = await helperRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  { const held = resetCreditTriesRefusal(); if (held) return held; }   // B-f276\'s remainder: the floor is in a file that could not be read\n', '', 'the helper writer\'s guard taken out'), 'rct-helper-unguarded'));
ok(hpx.r && hpx.r.code !== 'attempts_unread', 'RED CONTROL (the helper writer\'s guard taken out): it goes on to look for its helper while held — red', hpx);

console.log('⑥ torn bytes found by a READ AGAIN are set aside OFF the loop');
const TORN = '{"v":1,"tries":[{"key":"x","at":1';
const asyncAsideRun = async (engine) => {
  const H = await heldWorld(engine, { bytes: TORN });
  const realRename = fs.renameSync;
  let sync = 0;
  fs.renameSync = function (a, c) { if (path.resolve(String(a)) === H.file) sync++; return realRename.call(this, a, c); };
  try { await H.w.call('GET'); await settle(H.w); await tick(); } finally { fs.renameSync = realRename; }
  const dir = path.dirname(H.file);
  return { sync, held: !!heldOf(H.w), gone: !fs.existsSync(H.file), aside: fs.readdirSync(dir).filter((f) => f.startsWith('reset-credit-tries.json.corrupt-')).length };
};
const aa = await asyncAsideRun(engMod);
ok(aa.sync === 0 && !aa.held && aa.gone && aa.aside === 1, 'torn bytes found by the press\'s read again: set aside by an ASYNC rename (no synchronous rename after the start), the hold lifted as the release\'s «set aside»', aa);
const aax = await asyncAsideRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (aside === \'async\') return asideTornTriesAsync(a, why, asideAs);   // line 429\'s follow (r2413 (1)): the READ-AGAIN road never renames on the loop\n', '', 'the read again renames on the loop'), 'rct-aside-sync'));
ok(aax.sync === 1, 'RED CONTROL (the read-again road with the boot\'s synchronous rename): a rename runs ON THE LOOP against the storage that just failed — red', aax);

console.log('⑦ a set-aside that FAILED is tried again by a press alone, never the pool\'s pass');
const passRun = async (engine) => {
  const H = await heldWorld(engine, { bytes: TORN, failStart: 'aside' });
  const realP = fs.promises.readFile;
  let reads = 0;
  fs.promises.readFile = async function (p, ...a) { if (path.resolve(String(p)) === H.file) reads++; return realP.call(this, p, ...a); };
  let pass = -1, press = -1;
  try {
    quiet(() => H.w.eng.kickPoolEval({ kick: false })); await tick(); await tick(); await settle(H.w);
    pass = reads;
    await H.w.call('GET'); await settle(H.w);
    press = reads - pass;
  } finally { fs.promises.readFile = realP; }
  return { code: (heldOf(H.w) || {}).code || null, pass, press };
};
const pr = await passRun(engMod);
ok(pr.pass === 0 && pr.press === 1, 'held because the start\'s set-aside FAILED: the pool\'s own pass reads nothing (no rename tried again on its round); a person\'s press reads it again', pr);
const prx = await passRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (by !== \'press\' && H.asideFailed) return null;   // line 429\'s follow (r2413 (1)): a set-aside that failed is tried again by a person\'s press alone, never the pool\'s round\n', '', 'the pool tries a failed set-aside again'), 'rct-pass-aside'));
ok(prx.pass > 0, 'RED CONTROL (the pool\'s pass reads a failed set-aside again): every pass meets the storage that just failed — red', prx);

console.log('⑧ a read again that never settles — bounded');
const stuckRun = async (engine) => {
  const H = await heldWorld(engine);
  const realP = fs.promises.readFile, realNow = Date.now;
  let reads = 0;
  fs.promises.readFile = function (p, ...a) { if (path.resolve(String(p)) === H.file) { reads++; return new Promise(() => { }); } return realP.call(this, p, ...a); };   // a dead mount: never answers
  const out = {};
  try {
    await H.w.call('GET'); out.first = reads;   // the press's read again: hung
    await H.w.call('GET'); out.within = reads;   // inside the bound: it rides the one in flight
    quiet(() => H.w.eng.kickPoolEval({ kick: false })); await tick(); await tick(); out.pass = reads;   // the pool's round never starts another
    Date.now = () => realNow() + 31_000;
    await H.w.call('GET'); out.past = reads;   // past the bound: the next press may read (still held)
    Date.now = () => realNow() + 62_000;   // past the bound again: only the cap holds the next press
    await H.w.call('GET'); out.max = reads;   // …never more than two at once
    out.held = !!heldOf(H.w);
  } finally { Date.now = realNow; fs.promises.readFile = realP; }
  return out;
};
const sk = await stuckRun(engMod);
ok(sk.first === 1 && sk.within === 1 && sk.pass === 1 && sk.past === 2 && sk.max === 2 && sk.held, 'a read again that never settles: inside the bound a press rides it, the pool\'s pass starts none, past the bound the next press reads again — still held, never more than two reads at once', sk);
const skx = await stuckRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (by !== \'press\' || Date.now() - _resetCreditTriesReadAt < RESET_CREDIT_REREAD_BOUND_MS || _resetCreditTriesReads >= RESET_CREDIT_REREADS_MAX) return _resetCreditTriesReading;\n', '    return _resetCreditTriesReading;\n', 'one read for ever'), 'rct-stuck-forever'));
ok(skx.past === 1, 'RED CONTROL (no bound: the one read in flight for ever): a hung read keeps every later press from reading — the hold can never lift — red', skx);
const skm = await stuckRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (by !== \'press\' || Date.now() - _resetCreditTriesReadAt < RESET_CREDIT_REREAD_BOUND_MS || _resetCreditTriesReads >= RESET_CREDIT_REREADS_MAX) return _resetCreditTriesReading;\n', '    if (by !== \'press\' || Date.now() - _resetCreditTriesReadAt < RESET_CREDIT_REREAD_BOUND_MS) return _resetCreditTriesReading;\n', 'no cap on the reads at once'), 'rct-stuck-nomax'));
ok(skm.max === 3, 'RED CONTROL (no cap): each press past the bound starts one more hung read — they pile up on the shared file threads — red', skm);

console.log('⑨ a cause that does not pass by itself');
const lastRun = async () => {
  const w0 = world({});
  fs.writeFileSync(w0.file, TRIES(w0.A));
  const items = [];
  const realRead = fs.readFileSync;
  let boots = 0;
  fs.readFileSync = function (p, ...a) { if (!boots && path.resolve(String(p)) === w0.file) { boots++; throw Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' }); } return realRead.call(this, p, ...a); };
  let w;
  try { w = world({ root: w0.root, todos: { add: (k, it) => { items.push(it); return { id: 'ut-last' }; } } }); } finally { fs.readFileSync = realRead; }
  const code = (heldOf(w) || {}).code || null;   // before the press: its read again (the file is healthy) lifts the hold
  const g = await w.call('GET'); await settle(w);
  return { code, text: items[0] && items[0].text, detail: items[0] && items[0].detail, error: g.body && g.body.error };
};
const lr = await lastRun();
ok(lr.code === 'EACCES' && /until the file can be read: check the reset-credit attempts file in VibeSpace’s data folder and its access/.test(lr.text || '') && !/data\//.test(lr.text || '') && /reset-credit-tries\.json/.test(lr.detail || '') && !/heals by itself/.test(lr.text || '') && /check the file and its access/.test(lr.detail || '') && /until the file can be read/.test(lr.error || '') && !/heals by itself/.test(lr.error || ''), 'a permission (EACCES) never says «heals by itself»: the item and the refusal say until the file can be read, and name the file and its access', lr);

console.log('H1 THE HOTFIX (主开发 r2899): a «not there» right after a failed read is read ONCE MORE — the verifier\'s scene, its answers placed');
const flapRun = async (engine) => {
  const realP = fs.promises.readFile;
  let n = 0, H;
  fs.promises.readFile = async function (p, ...a) { if (H && path.resolve(String(p)) === H.file && ++n === 1) throw Object.assign(new Error('ENOENT: stand-in'), { code: 'ENOENT' }); return realP.call(this, p, ...a); };   // the first read again: «not there» ONCE (a folder that flaps)
  const out = {};
  try {
    H = await heldWorld(engine, { opts: { todos: { add: () => ({ id: 'ut-h1' }) }, session: true } });   // the start's read fails (EIO): held
    const p1 = await H.w.call('POST', { sessionId: 'cx1' }); await settle(H.w);
    out.first = { post: p1.body && p1.body.code, held: !!heldOf(H.w) };
    const p2 = await H.w.call('POST', { sessionId: 'cx1' }); await settle(H.w);
    out.second = { post: p2.body && p2.body.code };
  } finally { fs.promises.readFile = realP; }
  const t = H.w.eng._resetCreditTries.get(H.w.A);
  return { ...out, held: !!heldOf(H.w), back: !!(t && t.idempotencyKey === 'k-held-1'), verbs: H.w.verbs(), onDisk: fs.readFileSync(H.file, 'utf8').includes('k-held-1') };
};
const fl = await flapRun(engMod);
console.log(`    facts: ${JSON.stringify(fl)}`);
ok(fl.first.post === 'attempts_unread' && fl.first.held && fl.second.post === 'attempts_unread' && !fl.held && fl.back && fl.verbs === 0 && fl.onDisk, 'held; a press is refused and its read again answers «not there» ONCE: STILL HELD; the next read reads the file — the attempt that went out is back, no second request, the file untouched', fl);
const flx = await flapRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (H && !H.missingOnce) { H.missingOnce = true; console.warn(\'[reset-credit] data/reset-credit-tries.json answered «not there» right after it could not be read — still HELD: it is read once more before anything is taken as «no attempts»\'); return 0; }\n', '', 'one «not there» lifts'), 'rct-hf-once'));
ok(flx.verbs > 0, 'RED CONTROL (one «not there» lifts the hold, as at the candidate): the next press SENDS A SECOND reset request — red', flx);

console.log('H2 THE HOTFIX: only two «not there» IN A ROW lift the hold — a failed read between starts the count again');
const rowRun = async (engine) => {
  const realP = fs.promises.readFile;
  const answers = ['ENOENT', 'EIO', 'ENOENT', 'ENOENT'];
  let H;
  fs.promises.readFile = async function (p, ...a) { if (H && path.resolve(String(p)) === H.file && answers.length) { const c = answers.shift(); throw Object.assign(new Error(c + ': stand-in'), { code: c }); } return realP.call(this, p, ...a); };
  const held = [];
  try {
    H = await heldWorld(engine, { opts: { todos: { add: () => ({ id: 'ut-h2' }) } } });
    for (let i = 0; i < 4; i++) { await H.w.call('GET'); await settle(H.w); held.push(!!heldOf(H.w)); }
  } finally { fs.promises.readFile = realP; }
  return { held };
};
const rw = await rowRun(engMod);
ok(rw.held.join() === 'true,true,true,false', '«not there» (held, read once more) · a failed read (held: the count starts again) · «not there» (held) · «not there» (two in a row: lifted as «no attempts»)', rw);
const rwx = await rowRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, 'missingOnce: false /* r2899: a failed read starts the «two in a row» again */,', 'missingOnce: !!(was && was.missingOnce),', 'the count carried over a failed read'), 'rct-hf-row'));
ok(rwx.held[2] === false, 'RED CONTROL (the count carried across a failed read): «not there», a failure, «not there» lifts it — never two in a row — red', rwx);

console.log('H3 THE HOTFIX: a save never writes over a file that was not read');
const appearRun = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-h3' }) }, session: true });   // its first read: «not there»
  fs.writeFileSync(w.file, TRIES(w.A));   // a late mount: the file appears AFTER the read that found it missing — never read
  const p1 = await w.call('POST', { sessionId: 'cx1' });   // a press goes (nothing held, nothing known yet): its save meets the file
  const kept = fs.readFileSync(w.file, 'utf8').includes('k-held-1');
  const h1 = heldOf(w);
  const p2 = await w.call('POST', { sessionId: 'cx1' }); await settle(w);   // refused while held; its read again reads the file
  const t = w.eng._resetCreditTries.get(w.A);
  return { post1: p1.code, held: h1 && h1.code, kept, post2: p2.body && p2.body.code, prior: !!(t && t.prior && t.prior.idempotencyKey === 'k-held-1'), onDisk: fs.readFileSync(w.file, 'utf8').includes('k-held-1') };
};
const ap = await appearRun(engMod);
ok(ap.held === 'appeared' && ap.kept && ap.post2 === 'attempts_unread' && ap.prior && ap.onDisk, 'a file that appeared after the read found it missing: the save writes NOTHING over it — the store holds («appeared»), reads it at the next press, and the file\'s attempt becomes this life\'s prior (the floor reads both); both on disk', ap);
const apx = await appearRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (_resetCreditTriesUnseen && fs.existsSync(RESET_CREDIT_TRIES_FILE)) { holdResetCreditTries({ code: \'appeared\', why: \'it appeared after it was read «not there» — it is read before anything is written\' }); return; }\n', '', 'the save renames over whatever is there'), 'rct-hf-over'));
ok(!apx.kept, 'RED CONTROL (the save renames over whatever is there, as before): the file nobody read is WRITTEN OVER — the attempt that went out is gone from disk — red', apx);

report();
