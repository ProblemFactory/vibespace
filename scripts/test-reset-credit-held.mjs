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
//   THE HOTFIX after .416 (主开发 r2899) and its follow (r2973), the answers PLACED, each with its red control: H1 a «not there» right
//   after a failed read is read once more; H2 only two in a row lift; H3 a file that appeared after «not there» refuses the press
//   BEFORE anything is sent (the sends counted, the file's record already charged); H4 a read that keeps an attempt of this life
//   writes it at once and the merge keeps every record (a restart reads them back); H5 the helper road's look; H6 nothing is sent
//   after a save that did not land (the save only creates: a hard link). r3154's small: H7 a save that FAILS — the rung names it and
//   tries once a limit event, the dialog's own line; H8 the helper road's back-out; H9 the copy synced and removed on every road.
// In-process: the real engine over a scratch data/, a stub conversation whose wrapper takes the verb (nothing reaches a vendor).
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
const ROOT = scratchDir('rct-held');
const { ok, report } = checker();
const quietly = async (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };

const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
waitEverySave(AccountManager);
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { registerResetCreditRoutes } = require(path.join(REPO, 'src/routes/reset-credit.js'));
const RC = require(path.join(REPO, 'src/reset-credit.js'));
const ESRC = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
const MUT = mutantCopies('rct-held', REPO);

let wn = 0;
/** one world: a codex account, the real engine over its data/, the reset-credit routes; `session` = a conversation on that account whose
 *  (stub) wrapper advertises the keyed verb — the carrier a press goes through (its verbs are collected, nothing is sent anywhere) */
function world({ engine = engMod, root: root0 = null, todos = null, session = false, mode = 'off', warm = false, cards = null, helper = null } = {}) {
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
    getQuotaProbe: () => null, getUserTodos: () => todos, ...(helper ? { resetCreditHelper: helper } : {}),
  }));
  const routes = {};
  registerResetCreditRoutes({ get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; } }, { engine: eng });
  const call = (method, body = {}) => quietly(() => new Promise((resolve) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; resolve(this); return this; }, set() { return this; } };
    Promise.resolve(routes[`${method} /api/accounts/:id/reset-credit`]({ params: { id: A }, body, query: {}, headers: {} }, res)).catch((e) => resolve({ code: 'threw', body: { error: e && e.message } }));
  }));
  const verbs = () => wrote.filter((x) => /"codex-reset-credit"/.test(x)).length;
  return { root, A, eng, call, verbs, wam, session: sessions.get('cx1') || null, file: path.resolve(path.join(root, 'data', 'reset-credit-tries.json')) };
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
ok(RC.REFUSAL_CODES.includes('attempts_unread') && RC.refusalLine('attempts_unread').key !== RC.refusalLine('zzz').key && /could not be read/.test(RC.refusalLine('attempts_unread').key) && /until the file can be read/.test(RC.refusalLine('attempts_unread').key) && /attempts file in VibeSpace’s data folder and its access/.test(RC.refusalLine('attempts_unread').key) && !/data\//.test(RC.refusalLine('attempts_unread').key) && !/heals by itself/.test(RC.refusalLine('attempts_unread').key), 'attempts_unread is a refusal of the dialog\'s table with its own sentence — «until the file can be read», the file and its access, never «heals by itself» (never the generic «the server refused it»)', RC.refusalLine('attempts_unread'));

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
const aux = await autoRun(MUT.load('src/server/usage-pool-engine.js', anchored(anchored(ESRC, '  { const held = resetCreditTriesRefusal({ press: true }); if (held) { console.log(`[codex] reset credit refused for ${session._webuiId}: ${held.why}`); return held; } }   // B-f276\'s remainder: the floor is in a file that could not be read\n', '', 'the writer\'s guard taken out'), '  if (!persistResetCreditTries()) {\n', '  if (!persistResetCreditTries() && false) {\n', 'the save\'s answer not asked (r2973\'s belt)'), 'rct-auto-unguarded'));
ok(aux.verbs > 0 || aux.minted > 0, 'RED CONTROL (the writer\'s own guard taken out, and r2973\'s belt — a save that did not land is not asked — with it: the two doors of that road): the automatic rung spends while the attempts are held — a verb goes out, an attempt is minted — red', aux);

console.log('⑤ THE HELPER\'s writer while held');
const helperRun = async (engine) => { const { w } = await heldWorld(engine); return { held: !!heldOf(w), r: quiet(() => w.eng._writeResetCreditViaHelper(w.A, {})) }; };
const hp = await helperRun(engMod);
ok(hp.held && hp.r && hp.r.ok === false && hp.r.code === 'attempts_unread', 'the helper\'s writer while held refuses by name (attempts_unread) before it looks for its helper', hp);
const hpx = await helperRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  { const held = resetCreditTriesRefusal({ press: true }); if (held) return held; }   // B-f276\'s remainder: the floor is in a file that could not be read\n', '', 'the helper writer\'s guard taken out'), 'rct-helper-unguarded'));
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
const flx = await flapRun(MUT.load('src/server/usage-pool-engine.js', anchored(anchored(anchored(ESRC, '  if (press && !_resetCreditTriesHeld && _resetCreditTriesUnseen && fs.existsSync(RESET_CREDIT_TRIES_FILE)) holdResetCreditTries({ code: \'appeared\', why: \'it appeared after it was read «not there» — it is read before anything is sent\' });\n', '', 'no look at the press'), '  if (!persistResetCreditTries()) {\n', '  if (!persistResetCreditTries() && false) {\n', 'the save\'s answer not asked'), '    if (H && !H.missingOnce) { H.missingOnce = true; console.warn(\'[reset-credit] data/reset-credit-tries.json answered «not there» right after it could not be read — still HELD: it is read once more before anything is taken as «no attempts»\'); return 0; }\n', '', 'one «not there» lifts'), 'rct-hf-once'));
ok(flx.verbs > 0, 'RED CONTROL (the candidate\'s shape: one «not there» lifts the hold, no look at the press, the save\'s answer not asked — r2973\'s two doors catch a single «not there» too): the next press SENDS A SECOND reset request — red', flx);

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

console.log('H3 THE HOTFIX + its follow (主开发 r2973 must 1): a file that appeared after «not there» refuses the press BEFORE anything is sent');
/** the file's attempt went out and was CHARGED by the life that wrote it (r2973: a fixture the revive does not charge) */
const TRIES_CHARGED = (A) => TRIES(A).replace('"charged":false', '"charged":true');
const appearRun = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-h3' }) }, session: true });   // its first read: «not there»
  fs.writeFileSync(w.file, TRIES_CHARGED(w.A));   // a late mount: the file appears AFTER the read that found it missing — never read
  const bytes = fs.readFileSync(w.file, 'utf8');
  const p1 = await w.call('POST', { sessionId: 'cx1' });   // the press: nothing is held yet, nothing known
  const h1 = heldOf(w);
  const first = { post: p1.body && p1.body.code, verbs: w.verbs(), held: h1 && h1.code, same: fs.readFileSync(w.file, 'utf8') === bytes, words: /appeared after they had been read as not there/.test(JSON.stringify(p1.body || {})), mem: w.eng._resetCreditTries.size };
  const p2 = await w.call('POST', { sessionId: 'cx1' }); await settle(w);   // refused while held; its read again reads the file
  const t = w.eng._resetCreditTries.get(w.A);
  const g3 = await w.call('GET');   // the dialog after the lift: the file's attempt is the floor now
  return { first, post2: p2.body && p2.body.code, back: !!(t && t.idempotencyKey === 'k-held-1'), held: !!heldOf(w), floor: !!(g3.body && (g3.body.unsettled || g3.body.code === 'cooldown')) && (g3.body && g3.body.code) !== 'attempts_unread', verbs: w.verbs(), same: fs.readFileSync(w.file, 'utf8').includes('k-held-1') };
};
const ap = await appearRun(engMod);
console.log(`    facts: ${JSON.stringify(ap)}`);
ok(ap.first.post === 'attempts_unread' && ap.first.verbs === 0 && ap.first.held === 'appeared' && ap.first.same && ap.first.words && ap.first.mem === 0, 'the press meets a file that appeared after «not there»: refused BY NAME before an attempt is opened — NO request sent, no attempt minted, the file untouched byte for byte, the words name the cause (it appeared; read first)', ap.first);
ok(ap.post2 === 'attempts_unread' && ap.back && !ap.held && ap.floor && ap.verbs === 0 && ap.same, 'the next press is refused and its read again reads the file: the attempt that went out is back and is THE FLOOR (the dialog after the lift says it blocks a free press); NO request sent by either press', ap);
const apx = await appearRun(MUT.load('src/server/usage-pool-engine.js', anchored(anchored(ESRC, '  if (press && !_resetCreditTriesHeld && _resetCreditTriesUnseen && fs.existsSync(RESET_CREDIT_TRIES_FILE)) holdResetCreditTries({ code: \'appeared\', why: \'it appeared after it was read «not there» — it is read before anything is sent\' });\n', '', 'no look at the press'), '  if (!persistResetCreditTries()) {\n', '  if (!persistResetCreditTries() && false) {\n', 'a save that did not land is not asked'), 'rct-hf-appear'));
ok(apx.first.verbs > 0, 'RED CONTROL (029124e08: no look at the press, the save\'s answer not asked): the first press SENDS a reset request over the attempt on disk nobody read — red', apx.first);

console.log('H4 THE HOTFIX\'s follow (主开发 r2973 must 2): a read that keeps an attempt of THIS life writes it AT ONCE; the merge keeps every record');
const mergeRun = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-h4' }) }, session: true });   // «not there»
  fs.writeFileSync(w.file, TRIES_CHARGED(w.A));   // it appears (charged by the life that wrote it: the read charges nothing)
  await w.call('POST', { sessionId: 'cx1' });   // refused: held «appeared» (H3)
  // PLACED — the state the must names: attempts of THIS life in memory and on no disk (sent, charged; one with a prior of its own),
  // and one on an account the file does not name
  const now = Date.now();
  const rec = (key, at, k, prior = null) => ({ key, at, sentAt: at, sid: 'cx1', via: 'session', origin: 'user', resetsAtSec: 0, idempotencyKey: k, identity: { key, name: 'Cx Held' }, charged: true, outcome: null, followers: new Map(), timer: null, ackTimer: null, hold: null, prior });
  w.eng._resetCreditTries.set(w.A, rec(w.A, now, 'k-mine', rec(w.A, now - 30e3, 'k-mine-0')));
  w.eng._resetCreditTries.set('cx-elsewhere', rec('cx-elsewhere', now, 'k-other'));
  const p2 = await w.call('POST', { sessionId: 'cx1' }); await settle(w);   // refused; its read again reads the file and merges
  const disk = fs.readFileSync(w.file, 'utf8');
  const w2 = world({ engine, root: w0.root });   // A RESTART: the next life reads what is on disk
  const chain = []; for (let x = w2.eng._resetCreditTries.get(w.A); x && chain.length < 8; x = x.prior) chain.push(x.idempotencyKey);
  return { post2: p2.body && p2.body.code, held: !!heldOf(w), disk: Object.fromEntries(['k-mine', 'k-mine-0', 'k-held-1', 'k-other'].map((k) => [k, disk.includes(k)])), chain, other: !!w2.eng._resetCreditTries.get('cx-elsewhere') };
};
const mg = await mergeRun(engMod);
console.log(`    facts: ${JSON.stringify(mg)}`);
ok(!mg.held && Object.values(mg.disk).every(Boolean) && mg.chain[0] === 'k-mine' && mg.chain.includes('k-mine-0') && mg.chain.includes('k-held-1') && mg.other, 'the read lifts and WRITES AT ONCE: this life\'s attempt, its own prior, the file\'s attempt (at the END of the chain) and the attempt on an account the file does not name are all on disk — a restart reads every one back', mg);
const mgx = await mergeRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (charged || kept) persistResetCreditTries();\n', '  if (charged) persistResetCreditTries();\n', 'a write only for a charge'), 'rct-hf-mergew'));
ok(!mgx.disk['k-mine'] && !mgx.disk['k-other'], 'RED CONTROL (029124e08: written only when the read charged a record — the file\'s is charged already): this life\'s attempts are on NO disk after the merge, and the restart has lost them — red', mgx);
const mgc = await mergeRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '      if (Number(cur.at) >= Number(t.at)) keepAsPrior(cur, t); else { keepAsPrior(t, cur); _resetCreditTries.set(t.key, t); }\n', '      if (Number(cur.at) > Number(t.at)) { if (!cur.prior) cur.prior = t; } else _resetCreditTries.set(t.key, t);\n', 'the merge of 029124e08'), 'rct-hf-chain'));
ok(!mgc.disk['k-held-1'] && !mgc.chain.includes('k-held-1'), 'RED CONTROL (029124e08\'s merge: the file\'s record is a prior only when the head has none): the file\'s attempt is DROPPED — on no disk after the write — red', mgc);

console.log('H5 THE HOTFIX\'s follow (r2973 must 1, the helper road): the look at the press comes before the helper is even looked for');
const helperAppear = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-h5' }) } });   // «not there»; no conversation: the helper's road
  fs.writeFileSync(w.file, TRIES_CHARGED(w.A));
  const r = quiet(() => w.eng._writeResetCreditViaHelper(w.A, {}));
  return { code: r && r.code, held: heldOf(w) && heldOf(w).code, mem: w.eng._resetCreditTries.size };
};
const ha = await helperAppear(engMod);
ok(ha.code === 'attempts_unread' && ha.held === 'appeared' && ha.mem === 0, 'the helper\'s writer meets a file that appeared: refused by name (attempts_unread) before it looks for its helper — nothing minted', ha);
const hax = await helperAppear(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (press && !_resetCreditTriesHeld && _resetCreditTriesUnseen && fs.existsSync(RESET_CREDIT_TRIES_FILE)) holdResetCreditTries({ code: \'appeared\', why: \'it appeared after it was read «not there» — it is read before anything is sent\' });\n', '', 'no look at the press'), 'rct-hf-helper'));
ok(hax.code !== 'attempts_unread', 'RED CONTROL (no look at the press): the helper\'s writer goes on to look for its helper over a file nobody read — red', hax);

console.log('H6 THE HOTFIX\'s follow (r2973 must 1): NOTHING IS SENT AFTER A SAVE THAT DID NOT LAND — the file lands between the look and the save');
const windowRun = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, todos: { add: () => ({ id: 'ut-h6' }) }, session: true });   // «not there»
  fs.writeFileSync(w.file, TRIES_CHARGED(w.A));
  const bytes = fs.readFileSync(w.file, 'utf8');
  const realE = fs.existsSync;
  fs.existsSync = function (p, ...x) { return path.resolve(String(p)) === w.file ? false : realE.call(this, p, ...x); };   // PLACED: the press's look misses it (it lands just after)
  let p1;
  try { p1 = await w.call('POST', { sessionId: 'cx1' }); } finally { fs.existsSync = realE; }
  return { post: p1.body && p1.body.code, verbs: w.verbs(), held: heldOf(w) && heldOf(w).code, mem: w.eng._resetCreditTries.size, same: fs.readFileSync(w.file, 'utf8') === bytes, marked: !!(w.session && w.session._codexResetTriedAt) };
};
const wn6 = await windowRun(engMod);
ok(wn6.post === 'attempts_unread' && wn6.verbs === 0 && wn6.held === 'appeared' && wn6.mem === 0 && wn6.same && !wn6.marked, 'the save CREATES only (a hard link: EEXIST) — it finds the file, holds the store, and the attempt is BACKED OUT: no request sent, nothing in memory, the conversation not marked, the file untouched byte for byte', wn6);
const wnx = await windowRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (!persistResetCreditTries()) {\n', '  if (!persistResetCreditTries() && false) {\n', 'the save\'s answer not asked'), 'rct-hf-belt'));
ok(wnx.verbs > 0, 'RED CONTROL (the save\'s answer not asked, as at 029124e08): the request GOES OUT after a save that did not land — red', wnx);
const wnl = await windowRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (_resetCreditTriesUnseen) {\n      let made = false;\n', '    if (false) {\n      let made = false;\n', 'the rename over whatever is there'), 'rct-hf-link'));
ok(!wnl.same, 'RED CONTROL (the rename over whatever is there, no create-only write): the file nobody read is WRITTEN OVER — red', wnl);

console.log('H7 (r3154 (1)(2)): an attempt whose save FAILS — the automatic rung names it as itself and tries ONCE a limit event; the dialog\'s code');
const unwRun = async (engine) => {
  const cards = [];
  const w = world({ engine, session: true, mode: 'auto', warm: true, cards });
  const s = w.session, nowS = Math.floor(Date.now() / 1000);
  const realW = fs.writeFileSync;
  let tries = 0;
  fs.writeFileSync = function (p, ...a) { if (String(p).startsWith(w.file + '.tmp')) { tries++; throw Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' }); } return realW.call(this, p, ...a); };   // PLACED: the attempts' save fails (the data folder refuses the write)
  let post = null;
  try {
    quiet(() => w.eng.recordCodexQuotaSignal(s, { type: 'rate_limits_updated', onDemand: true, resetCredits: { availableCount: 2 }, rateLimits: { primary: { used_percent: 50, window_minutes: 10080, resets_at: nowS + 3 * 86400 }, secondary: null } }));
    { const t0 = Date.now(); while (Date.now() < t0 + 2) { } }   // the wall comes LATER than the read
    quiet(() => w.eng.recordCodexQuotaSignal(s, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: nowS + 7200 }));
    await tick();
    quiet(() => w.eng.recordCodexQuotaSignal(s, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: nowS + 7200 }));   // the SAME limit event, signalled again
    await tick();
    const autoTries = tries;
    const p = await w.call('POST', { sessionId: 'cx1' });   // a person's press meets the same failing write
    post = { code: p.code, as: p.body && p.body.code, autoTries };
  } finally { fs.writeFileSync = realW; }
  const card = cards.find((c) => c && c.resetCredit) || null;
  return { post, verbs: w.verbs(), refused: card ? card.resetCredit.refused || null : null, ceiling: cards.some((c) => /unattended-spend ceiling/.test(String((c && c.text) || ''))) };
};
const u7 = await unwRun(engMod);
console.log(`    facts: ${JSON.stringify(u7)}`);
ok(u7.refused === 'attempts_unwritten' && !u7.ceiling && u7.post.autoTries === 1 && u7.verbs === 0, 'the automatic rung meets a save that fails: NOTHING sent, its wall card names the failed write (attempts_unwritten — never the spend ceiling\'s words), and the same limit event signalled again is NOT tried again (one try a limit event)', u7);
ok(u7.post.code === 409 && u7.post.as === 'attempts_unwritten' && RC.REFUSAL_CODES.includes('attempts_unwritten') && RC.refusalLine('attempts_unwritten').key !== RC.refusalLine('zzz').key && /could not be written to disk — nothing was sent/.test(RC.refusalLine('attempts_unwritten').key), 'a person\'s press: 409 attempts_unwritten, and the dialog draws its OWN line (nothing was sent, no credit used) — never the default sentence with the hub\'s English inside', u7.post);
ok(/appeared after they had been read as not there/.test(RC.refusalLine('attempts_unread', { appeared: true }).key) && RC.refusalLine('attempts_unread', { appeared: true }).key !== RC.refusalLine('attempts_unread').key, 'the «appeared» hold has its OWN line in the dialog (the reply marks `appeared`)');
const u7x = await unwRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, "    if (!wr.ok) { if (wr.code === 'attempts_unread' || wr.code === 'attempts_unwritten') { wallCard(wr.why, wr.code); return 'skipped'; }", "    if (!wr.ok) { if (wr.code === 'attempts_unread') { wallCard(wr.why, wr.code); return 'skipped'; }", 'the card branch before r3154'), 'rct-sm-card'));   // stale-pins: kept (the red control's mutant puts the card branch before r3154 back)
ok(u7x.ceiling || u7x.refused !== 'attempts_unwritten', 'RED CONTROL (the card branch before r3154): the failed write is told as «the unattended-spend ceiling refused it» — red', u7x);
const u7w = await unwRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, "    if (!wr.ok && wr.code === 'attempts_unwritten') session._resetCreditUnwrittenFor = `${key}|${R || '?'}`;\n", '', 'no wait after a back-out'), 'rct-sm-wait'));
ok(u7w.post.autoTries > 1, 'RED CONTROL (no wait after a back-out): the automatic road tries again at every wall signal while the write keeps failing — red', u7w.post);

console.log('H8 (r3154 (3)): the HELPER road\'s back-out — nothing spawned after a save that did not land');
const helperBelt = async (engine) => {
  const w0 = world({ engine });
  const w = world({ engine, root: w0.root, helper: { codexCmd: '/opt/stub/codex' } });   // «not there»; a helper that would carry the press
  w.wam._readAuthFor = () => ({ loggedIn: true });   // PLACED: the account's own login is there (the helper's condition)
  fs.writeFileSync(w.file, TRIES_CHARGED(w.A));
  const bytes = fs.readFileSync(w.file, 'utf8');
  const CRH = require(path.join(REPO, 'src/codex-reset-helper.js'));
  const real = CRH.consumeResetCreditViaAppServer;
  let spawned = 0;
  CRH.consumeResetCreditViaAppServer = async () => { spawned++; return { ok: false, skipped: true, why: 'stand-in' }; };   // never a real CLI
  const realE = fs.existsSync;
  fs.existsSync = function (p, ...x) { return path.resolve(String(p)) === w.file ? false : realE.call(this, p, ...x); };   // PLACED: the press's look misses it
  let r;
  try { r = quiet(() => w.eng._writeResetCreditViaHelper(w.A, {})); } finally { fs.existsSync = realE; CRH.consumeResetCreditViaAppServer = real; }
  await tick();
  return { code: r && r.code, appeared: !!(r && r.appeared), spawned, mem: w.eng._resetCreditTries.size, same: fs.readFileSync(w.file, 'utf8') === bytes };
};
const h8 = await helperBelt(engMod);
ok(h8.code === 'attempts_unread' && h8.appeared && h8.spawned === 0 && h8.mem === 0 && h8.same, 'the helper road: the save creates only (EEXIST over the file that appeared) — the attempt backed out, NO helper spawned, refused by name (attempts_unread, «appeared»), the file untouched', h8);
const h8x = await helperBelt(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (!persistResetCreditTries()) {\n', '  if (!persistResetCreditTries() && false) {\n', 'the save\'s answer not asked'), 'rct-sm-helper'));
ok(h8x.spawned > 0, 'RED CONTROL (the save\'s answer not asked): the helper is SPAWNED after a save that did not land — red', h8x);

console.log('H9 (r3154 (4)(5)): the written copy — synced before it takes the name, removed on every road');
const copyRun = async (engine, linkErr) => {
  const w = world({ engine, session: true });   // «not there»: the save links
  const realL = fs.linkSync;
  fs.linkSync = function (a, b) { if (path.resolve(String(b)) === w.file) throw Object.assign(new Error(linkErr + ': stand-in'), { code: linkErr }); return realL.call(this, a, b); };
  let p1;
  try { p1 = await w.call('POST', { sessionId: 'cx1' }); } finally { fs.linkSync = realL; }
  const left = fs.readdirSync(path.dirname(w.file)).filter((n) => n.startsWith(path.basename(w.file) + '.tmp')).length;
  let whole = false; try { whole = Array.isArray(JSON.parse(fs.readFileSync(w.file, 'utf8')).tries); } catch { whole = false; }
  return { code: p1.code, as: p1.body && p1.body.code, verbs: w.verbs(), left, exists: fs.existsSync(w.file), whole };
};
const c9a = await copyRun(engMod, 'EPERM');
ok(c9a.exists && c9a.whole && c9a.left === 0 && c9a.verbs === 1, 'a folder without hard links (EPERM): the exclusive create writes the file WHOLE (it parses), the copy is gone, the press goes', c9a);
const c9b = await copyRun(engMod, 'EACCES');
ok(c9b.as === 'attempts_unwritten' && c9b.verbs === 0 && c9b.left === 0 && !c9b.exists, 'a link that fails for ANOTHER reason (EACCES): the save fails — nothing sent (attempts_unwritten), no file made, and the written copy is REMOVED', c9b);
const c9x = await copyRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, "      } finally { try { fs.unlinkSync(tmp); } catch { } }   // r3154 (5)", '      } finally { }   // r3154 (5)', 'the copy left behind'), 'rct-sm-copy'), 'EACCES');
ok(c9x.left > 0, 'RED CONTROL (the copy\'s removal only on the good roads): a failed link leaves the written copy beside the store — red', c9x);
ok(/fs\.writeFileSync\(tmp, body, \{ flush: true \}\)/.test(ESRC) && /fs\.writeSync\(fd, body\); fs\.fsyncSync\(fd\);/.test(ESRC), 'MONEY RIDES THE WRITE: the copy is written synced (flush) before the link or the rename; the exclusive create is written whole and synced before the attempt can go out');

console.log('⑩ line 463\'s smalls (r2550 (1)(2)): while a set-aside\'s rename is out, NO read starts — presses past the bound, the pool\'s passes');
const TORN10 = '{"v":1,"tries":[{"key":"x","at":1';
const renameOutRun = async (engine) => {
  const items = [];
  const H = await heldWorld(engine, { opts: { todos: { add: (k, it) => { items.push(it); return { id: `ut-10-${items.length}` }; } } } });
  fs.writeFileSync(H.file, TORN10);   // torn when it is read again
  const realP = fs.promises.readFile, realR = fs.promises.rename, realNow = Date.now;
  let reads = 0, land = null;
  fs.promises.readFile = function (p, ...a) { if (path.resolve(String(p)) === H.file) reads++; return realP.call(this, p, ...a); };
  fs.promises.rename = function (a, b) { if (path.resolve(String(a)) === H.file) return new Promise((z) => { land = () => z(realR.call(fs.promises, a, b)); }); return realR.call(this, a, b); };
  const out = {};
  try {
    await H.w.call('GET');
    { const end = realNow() + 5000; while (!land && realNow() < end) await new Promise((z) => setTimeout(z, 5)); }   // the real read answers, then the rename starts
    out.renaming = !!land; out.first = reads;
    Date.now = () => realNow() + 61_000;   // past every bound: still nothing starts while the rename is out
    await H.w.call('GET'); await H.w.call('GET');
    quiet(() => H.w.eng.kickPoolEval({ kick: false })); await tick(); await tick();
    out.during = reads;
    if (land) land();
    await settle(H.w); await tick();
    out.held = !!heldOf(H.w); out.lost = items.some((it) => /could not be read at start|set aside/i.test(String(it.text || '')));
  } finally { Date.now = realNow; fs.promises.readFile = realP; fs.promises.rename = realR; }
  return out;
};
const ro = await renameOutRun(engMod);
console.log(`    facts: ${JSON.stringify(ro)}`);
ok(ro.renaming && ro.first === 1 && ro.during === 1 && !ro.held, 'while the set-aside\'s rename is out no read starts (two presses past the bound, a pool pass): its own outcome settles the hold', ro);
const rox = await renameOutRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (_resetCreditTriesAsiding) return _resetCreditTriesReading;   // line 463\'s smalls (r2550 (1)(2)): a set-aside\'s rename is out — its own outcome settles the hold; no read starts meanwhile (the cap\'s count, the pool\'s 5 s)\n', '', 'reads during the rename'), 'rct-rename-read'));
ok(rox.during > rox.first, 'RED CONTROL (no guard): presses and the pool\'s pass start reads while the rename is out — the cap of two does not count it — red', rox);

console.log('⑪ line 463\'s smalls (r2550 (1)): the rename\'s end ALWAYS settles — «set aside as …» and the release\'s notice even when a read lifted the hold');
// the race the round named, made exact: a second read starts while the rename is out, the rename LANDS on disk, the second read
// answers «not there» and lifts the hold — and only then does the rename's own promise answer (the guard of ⑩ cut in every copy here)
const raceRun = async (engine) => {
  const items = [];
  const H = await heldWorld(engine, { opts: { todos: { add: (k, it) => { items.push(it); return { id: `ut-11-${items.length}` }; } } } });
  fs.writeFileSync(H.file, TORN10);
  const realP = fs.promises.readFile, realR = fs.promises.rename, realNow = Date.now;
  let n = 0, land = null, secondDone = null, gate = null;
  const second = new Promise((z) => { secondDone = z; });
  const opened = new Promise((z) => { gate = z; });
  fs.promises.readFile = function (p, ...a) {
    if (path.resolve(String(p)) !== H.file) return realP.call(this, p, ...a);
    if (++n === 1) return realP.call(this, p, ...a);
    return opened.then(() => realP.call(fs.promises, p, ...a)).finally(() => setTimeout(secondDone, 5));   // answers after the rename landed
  };
  fs.promises.rename = function (a, b) { if (path.resolve(String(a)) === H.file) return new Promise((z) => { land = () => z(realR.call(fs.promises, a, b).then(() => { gate(); return second; })); }); return realR.call(this, a, b); };
  try {
    await H.w.call('GET');
    { const end = realNow() + 5000; while (!land && realNow() < end) await new Promise((z) => setTimeout(z, 5)); }
    Date.now = () => realNow() + 61_000;
    await H.w.call('GET');   // the second read starts while the rename is out
    land();
    await second; await new Promise((z) => setTimeout(z, 30)); await tick();   // the second read answered, then the rename's own end ran
  } finally { Date.now = realNow; fs.promises.readFile = realP; fs.promises.rename = realR; }
  return { reads: n, held: !!heldOf(H.w), lost: items.some((it) => /set aside|could not be read at start/i.test(String(it.text || ''))) };
};
const noGuard = anchored(ESRC, '  if (_resetCreditTriesAsiding) return _resetCreditTriesReading;   // line 463\'s smalls (r2550 (1)(2)): a set-aside\'s rename is out — its own outcome settles the hold; no read starts meanwhile (the cap\'s count, the pool\'s 5 s)\n', '', 'reads during the rename');
const rc = await raceRun(MUT.load('src/server/usage-pool-engine.js', noGuard, 'rct-race-settle'));
ok(rc.reads === 2 && !rc.held && rc.lost, 'the race exact (⑩\'s guard cut in a copy): the second read lifts the hold as «not there», then the rename answers — and its settle STILL files the release\'s notice (the bytes were set aside)', rc);
// moved onto the train (r3509): the hotfix's «not there» read ONCE MORE (line 638) keeps the hold through the second read, so the
// release-era race this control guards needs that re-read cut too — else the hold still stands at the rename's end and the copy settles
const noGuardOnce = anchored(noGuard, '    if (H && !H.missingOnce) { H.missingOnce = true;', '    if (false) { H.missingOnce = true;', 'one «not there» lifts (the race of 463)');
const rcx = await raceRun(MUT.load('src/server/usage-pool-engine.js', anchored(noGuardOnce, '    .then((ok) => { _resetCreditTriesAsiding = false; return settleTornTries(a, why, asideAs, ok); });', '    .then((ok) => { _resetCreditTriesAsiding = false; return _resetCreditTriesHeld ? settleTornTries(a, why, asideAs, ok) : 0; });', 'the settle only while held'), 'rct-race-skip'));   // stale-pins: kept (the control restores the line before these smalls)
ok(rcx.reads === 2 && !rcx.lost, 'RED CONTROL (the settle only while held, as before — the guard cut too, and one «not there» lifting the hold as before the hotfix): the «set aside as …» line and the notice are never said — red', rcx);

console.log('⑫ line 463\'s smalls (r2550 (3)): the notice\'s words follow the cause');
const causeRun = async (engine) => {
  const items = [], redrawn = [];
  const todos = { add: (k, it) => { items.push(it); return { id: `ut-12-${items.length}` }; }, redrawItem: (pred, patch) => { if (pred({ id: 'ut-12-1' })) redrawn.push(patch); return 1; } };
  const H = await heldWorld(engine, { opts: { todos } });   // EIO: a passing cause — the passing words
  const realP = fs.promises.readFile;
  fs.promises.readFile = async function (p, ...a) { if (path.resolve(String(p)) === H.file) throw Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' }); return realP.call(this, p, ...a); };
  try { await H.w.call('GET'); await settle(H.w); } finally { fs.promises.readFile = realP; }   // the read again meets a permission
  return { code: (heldOf(H.w) || {}).code || null, filed: items.length, first: items[0] && items[0].text, redrawn: redrawn.length, now: redrawn[0] && redrawn[0].text };
};
const cr = await causeRun(engMod);
ok(cr.code === 'EACCES' && cr.filed === 1 && /heals by itself/.test(cr.first || '') && cr.redrawn === 1 && /until the file can be read/.test(cr.now || '') && !/heals by itself/.test(cr.now || ''), 'a passing fault (EIO) becomes a permission (EACCES) at the read again: the ONE notice is redrawn in the lasting words, never the first words for ever', cr);
const crx = await causeRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '    if (H.todoId && H.filedLasting !== H.lasting && !unread && typeof todos.redrawItem === \'function\') {\n', '    if (false) {\n', 'the first words kept'), 'rct-cause-kept'));
ok(crx.redrawn === 0, 'RED CONTROL (the words chosen once at filing, as before): a permission keeps saying «heals by itself» — red', crx);

console.log('⑬ line 463\'s smalls (r2550 (5)): a HELD start adopts the last run\'s open notice — never two the same');
const adoptRun = async (engine) => {
  const added = [];
  const last = { id: 'ut-last-run', origin: 'pool', status: 'open', text: 'The reset-credit attempt records could not be read — no reset credit is used until they read again; this heals by itself when they do' };
  const todos = { add: (k, it) => { added.push(it); return { id: `ut-13-${added.length}` }; }, snapshot: () => ({ open: [last], resolved: [] }), get: (id) => (id === last.id ? last : null), setStatus: (id, st) => { if (id === last.id) last.status = st; } };
  const H = await heldWorld(engine, { opts: { todos } });
  return { held: !!heldOf(H.w), added: added.length, todoId: (heldOf(H.w) || {}).todoId || null };
};
const ad = await adoptRun(engMod);
ok(ad.held && ad.added === 0 && ad.todoId === 'ut-last-run', 'a start that is itself HELD takes the last run\'s open «could not be read» notice as its own — no second notice the same', ad);
const adx = await adoptRun(MUT.load('src/server/usage-pool-engine.js', anchored(ESRC, '  if (!H.adoptAsked && typeof todos.snapshot === \'function\') {\n', '  if (false) {\n', 'never adopted'), 'rct-adopt-never'));
ok(adx.added === 1, 'RED CONTROL (never adopted, as before): the held start files its own beside the last run\'s — two the same — red', adx);

report();
