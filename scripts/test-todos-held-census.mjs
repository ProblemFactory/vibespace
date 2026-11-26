#!/usr/bin/env node
// test-todos-held-census — FOR YOU HELD UNREAD (B-44f3: the store-read law over data/user-todos.json, ruled (A) by 主开发 2026-11-18
// on bl-jobs' ruling file — the hold+merge design its read refuted is NOT this one: no merge).
//
// While user-todos.json cannot be READ (EIO, EACCES … — or torn bytes that could be neither renamed nor copied) the store is HELD
// (src/user-todos.js `_unread`): kept exactly as it is, nothing writes it, EVERY write is refused BY NAME (code todos-unread — the
// asker hears it: a route answers 503, a producer's catch logs it), the page draws the hold from the snapshot's `held` (never an
// item), the boot's reconcilers / migrations / clears WAIT for the read (whenRead), and the store is read again soon. At the read
// the FILE is the truth: memory held nothing meanwhile (every write was refused), so nothing is merged.
//
//   ① THE STORE — the real UserTodoManager over scratch data folders: held on a failed read; every writer refused by name before
//     anything moves (the file byte-identical, no write armed); the snapshot says `held`; whenRead waits and runs after the load;
//     the read again lifts it with the FILE's items (no merge); torn bytes that cannot be set aside hold it «damaged»; a file gone
//     since the hold stays held; corrupt bytes that CAN be set aside are r9's (set aside + notice, writable). CONTROL: the store
//     with the hold's line cut (a mutant copy) — a failed read starts EMPTY and writable, and its next save writes over the file.
//   ② EVERY CALLER IS A ROW — every server file that writes or reads the For-you store is a row {file, w, r, cls, why}: its write
//     count, its read count and its class (waits · refuses · contained · harmless). A file with no row is RED; a count that moved
//     is RED (classify the new site, then move the count); a row naming nothing is DEAD (red); a write with NO try around it is RED
//     unless the row counts it (`notry`, why); a write inside a catch that SWALLOWS is RED unless the row says why (`bare`).
//     ITS BLIND SPOT (said — 主开发 05:00Z, 5): receivers are the common spellings, a per-file list, and the names LEARNED from a
//     store-only method (idsWhere, forSession, setStatusMany …); a binding that calls ONLY common verbs (add / get / setStatus / flush)
//     under an unlisted name is not seen — a strong heuristic, not a closed census (the fresh-binding control proves the learned road).
//   ③ THE SCENES — driven: a data migration that touches For you is refused by name while held and runs at the read (the runner's
//     ledger); a For-you clear and a job's clear are refused by name (nothing cleared — the job's items would come back with its
//     name); the boot passes that judge «from before the restart» each wait for the read (pins, each with its control).
//   ④ THE PAGE + THE ROUTES — the held words drawn where «Nothing needs you» / «all clear» would stand (zh + ja rows); every route
//     that reads or writes the list answers 503 todos-unread by name.
// FAST, in-process.
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d unit 1 (a): accounts.json is the store writer's — each save waited for (the suite's thread)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const MJ = mutantCopies('todos-held-census', ROOT);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TMP = scratch('todos-held-census');
fs.mkdirSync(TMP, { recursive: true });
let nDir = 0;
const dataDir = () => { const d = path.join(TMP, `d${++nDir}`); fs.mkdirSync(d, { recursive: true }); return d; };
const UT = require(path.join(ROOT, 'src/user-todos.js'));
const quiet = (fn) => { const w = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { return fn(); } finally { console.warn = w; console.log = l; } };
const RETRY = { firstMs: 60_000, maxMs: 60_000 };   // a suite drives the read again itself
const ITEM = (id, text) => ({ id, sessionKey: 'claude:s1', text, status: 'open', urgency: 'normal', by: 'agent', createdAt: 1 });
const WRITERS = [
  ['add', (m) => m.add('accounts', { origin: 'spend', text: 'new' })],
  ['setStatus', (m) => m.setStatus('a', 'done')],
  ['setStatusMany', (m) => m.setStatusMany(['a'], 'done')],
  ['readNotices', (m) => m.readNotices(['a'])],
  ['resolveAnswered', (m) => m.resolveAnswered(['a'], 'user')],
  ['noteFact', (m) => m.noteFact('a', { endedAt: 1 })],
  ['resolveByReply', (m) => m.resolveByReply('a', 'yes')],
  ['resolveByAgent', (m) => m.resolveByAgent('claude:s1', 'a')],
  ['resolveByJob', (m) => m.resolveByJob('j1')],
  ['setCard', (m) => m.setCard('a', { x: 1 })],
  ['setJudged', (m) => m.setJudged('a', { group: 'now' })],
  ['setFacts', (m) => m.setFacts([['a', {}]])],
  ['redrawItem', (m) => m.redrawItem(() => true, { detail: 'd' })],
  ['reshapeItems', (m) => m.reshapeItems(() => true)],
  ['clearItems', (m) => m.clearItems(['a'])],
  ['rekey', (m) => m.rekey('webui:x', 'claude:s1')],
  ['flush', (m) => m.flush()],
];

// ── ① THE STORE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① THE STORE — held on a failed read, every write refused by name, the read again lifts it with the FILE (no merge)');
{
  // a READ that fails: a directory where the file stands (EISDIR) — the release set it aside and started EMPTY
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  const u = m.unreadState();
  ok(m.isHeldUnread() === true && u && u.file === 'user-todos.json' && u.code === 'EISDIR' && u.damaged === false, 'a READ that fails (EISDIR) HOLDS the store: { file, code, damaged: false }', u);
  const snap = m.snapshot();
  ok(snap.open.length === 0 && snap.resolved.length === 0 && snap.held && snap.held.code === 'EISDIR', 'the snapshot says `held` (the page draws it) — no item stands for it', snap);
  ok(!fs.readdirSync(d).some((x) => /\.corrupt-/.test(x)) && fs.statSync(f).isDirectory(), 'nothing is set aside: the live path is exactly as it was', fs.readdirSync(d));
  const bad = [];
  for (const [name, call] of WRITERS) {
    let e = null; try { quiet(() => call(m)); } catch (x) { e = x; }
    if (!e || e.code !== 'todos-unread' || !/For you cannot read its saved list right now \(user-todos\.json: EISDIR\) — .+ is refused and nothing was recorded/.test(e.message)) bad.push({ name, code: e && e.code, msg: e && String(e.message).slice(0, 120) });
  }
  ok(!bad.length, `EVERY writer (${WRITERS.length}: ${WRITERS.map((w) => w[0]).join(', ')}) is refused BY NAME — code todos-unread, the words name the act`, bad);
  ok(!m.writeOwed() && m._dirty === false, 'no write is armed and nothing is dirty after every refusal (the belt: _save refuses first)', { owed: m.writeOwed(), dirty: m._dirty });
  ok(m.expireDue() === 0, 'the expiry sweep resolves nothing while held (its own timer skips; asked, it finds no item)');
  // whenRead waits; the read again lifts the hold with the FILE's items
  const seen = [];
  ok(m.whenRead(() => seen.push(['first', m.get('a') && m.get('a').text]), 'one') === false && m.whenRead(() => seen.push(['second', m.isHeldUnread()]), 'two') === false && !seen.length,
    'whenRead → false while held: the step waits (nothing ran)');
  fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [ITEM('a', 'kept from before'), ITEM('b', 'the other one')] }, null, 2));
  const lifted = await quiet(() => m.readAgain());
  ok(lifted === true && !m.isHeldUnread() && !m.snapshot().held, 'the read again that answers LIFTS the hold (no `held` in the snapshot)', { lifted, held: m.snapshot().held });
  ok(JSON.stringify(m.snapshot().open.map((i) => i.id).sort()) === '["a","b"]', 'NO MERGE: the list is exactly the file\'s items (memory held nothing — every write was refused)', m.snapshot().open.map((i) => i.id));
  ok(JSON.stringify(seen) === '[["first","kept from before"],["second",false]]', 'the waiting steps ran ONCE, in order, AFTER the load (the first sees the file\'s item, the hold already down)', seen);
  let now = 0; ok(m.whenRead(() => { now++; }) === true && now === 1, 'whenRead after the read runs the step at once');
  const n = m.add('accounts', { origin: 'spend', text: 'after the read' });
  m.flush();
  ok(n && n.id && JSON.parse(fs.readFileSync(f, 'utf8')).items.length === 3, 'after the read the store writes as before (the new item on disk beside the two)');
  m.stop();
}
{
  // torn bytes that can be neither renamed nor copied (a read-only data folder): the live file is their ONLY copy — HELD «damaged»
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.writeFileSync(f, '{"items": [');
  fs.chmodSync(d, 0o555);
  const root = typeof process.getuid === 'function' && process.getuid() === 0;
  if (root) { console.log('  · SKIP (by name): root writes into a 0555 folder — the «could not be set aside» road needs a non-root runner'); fs.chmodSync(d, 0o755); }
  else {
    const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    const u = m.unreadState();
    fs.chmodSync(d, 0o755);   // the folder WRITABLE now: what keeps the bytes below is the hold, never the folder (the read's S3(4))
    let e = null; try { m.add('accounts', { origin: 'spend', text: 'x' }); } catch (x) { e = x; }
    let ef = null; try { m.flush(); } catch (x) { ef = x; }
    ok(m.isHeldUnread() && u.damaged === true && u.code === 'not set aside' && e && e.code === 'todos-unread' && ef && ef.code === 'todos-unread' && /damaged and could not be set aside/.test(e.message),
      'torn bytes that could NOT be set aside HOLD the store «damaged» (never «the next save replaces it») — a write and a flush refused with the damaged words', { u, e: e && e.message });
    ok(fs.readFileSync(f, 'utf8') === '{"items": [' && !fs.readdirSync(d).some((x) => /\.tmp$/.test(x)), 'the torn bytes are untouched by the refused write and flush — in a folder that WOULD take a write now (no tmp file either)');
    // the read again of the same torn bytes in a still read-only folder: still DAMAGED (its code kept — never «read again soon» for bytes that cannot read)
    fs.chmodSync(d, 0o555);
    const r1 = await quiet(() => m.readAgain());
    ok(r1 === false && m.isHeldUnread() && m.unreadState().damaged === true && m.unreadState().code === 'not set aside', 'the read again of the same torn bytes (still nowhere to set them aside): STILL damaged, its code kept', m.unreadState());
    // the folder writable at the next read: the torn bytes are set aside now (r9's road) — the store writable, ONE notice naming where
    fs.chmodSync(d, 0o755);
    const r2 = await quiet(() => m.readAgain());
    const aside = fs.readdirSync(d).filter((x) => /^user-todos\.json\.corrupt-/.test(x));
    ok(r2 === true && !m.isHeldUnread() && aside.length === 1 && fs.readFileSync(path.join(d, aside[0]), 'utf8') === '{"items": [' && m.snapshot().open.some((i) => i.sessionKey === 'for-you-store'),
      'a read again that CAN set the torn bytes aside lifts the hold: set aside (bytes kept), ONE notice, the store writable', { r2, aside });
    quiet(() => m.stop());
  }
}
{
  // a DAMAGED hold whose torn file the person moved away (what its words ask) was FIXED: For you starts empty
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.writeFileSync(f, '{"items": [');
  fs.chmodSync(d, 0o555);
  const root = typeof process.getuid === 'function' && process.getuid() === 0;
  if (root) fs.chmodSync(d, 0o755);
  else {
    const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    fs.chmodSync(d, 0o755); fs.renameSync(f, path.join(d, 'moved-away.json'));
    const r = await quiet(() => m.readAgain());
    ok(r === true && !m.isHeldUnread() && m.snapshot().open.length === 0 && !!m.add('accounts', { origin: 'spend', text: 'after the fix' }), 'a damaged hold whose torn file is GONE at the read (moved away — the fix its words ask): the hold lifts, For you starts empty and takes writes', { r, held: m.isHeldUnread() });
    quiet(() => m.stop());
  }
}
{
  // a held store whose file is GONE at the read is NOT a fresh start at once (a detached data folder may come back): still held — gone again at the next read: lifted
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  fs.rmdirSync(f);
  const r = await quiet(() => m.readAgain());
  ok(r === false && m.isHeldUnread() && m.unreadState().code === 'ENOENT' && !fs.existsSync(f), 'a held store whose file is gone at the read STAYS held (code ENOENT) — no empty store, nothing written (read once more: a mount may come back)', m.unreadState());
  // the first read's should (the reference machine-mounts' rule): gone AGAIN at the next read — lifted, an empty list (the next boot
  // would start empty anyway), never held for the process's life with «read again soon» words
  const r2 = await quiet(() => m.readAgain());
  ok(r2 === true && !m.isHeldUnread() && m.snapshot().open.length === 0, 'a file gone at TWO reads in a row lifts the hold — an empty list, the store writable again', { r2, held: m.isHeldUnread() });
  quiet(() => m.stop());
  ok(m._unreadT == null, 'stop() clears the read-again timer (nothing reads after the stop)');
}
{
  // corrupt bytes that CAN be set aside: r9's road stands (set aside beside it + ONE notice naming where, the store writable)
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.writeFileSync(f, '{"items": [');
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0 }));
  const aside = fs.readdirSync(d).filter((x) => /^user-todos\.json\.corrupt-/.test(x));
  const note = m.snapshot().open.find((i) => i.sessionKey === 'for-you-store');
  ok(!m.isHeldUnread() && aside.length === 1 && fs.readFileSync(path.join(d, aside[0]), 'utf8') === '{"items": [' && note && /set it aside as user-todos\.json\.corrupt-/.test(note.text) && /corrupt JSON/.test(note.detail),
    'corrupt bytes that CAN be set aside are r9\'s: set aside (bytes kept), ONE notice naming where (its detail: «corrupt JSON»), the store writable', { aside, note: note && note.text });
  m.stop();
}
{
  // CONTROL: the hold's line cut — the release's road (a failed read starts EMPTY and writable; the next save writes over the file)
  const SRC = read('src/user-todos.js');
  const cut = anchored(SRC, "    } else if (a0.state === 'unreadable') this._holdUnread(a0);\n", '    }\n', 'the hold');
  const Mx = MJ.load('src/user-todos.js', cut, 'no-hold');
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new Mx.UserTodoManager({ dataDir: d, expirySweepMs: 0 }));
  let e = null; try { m.add('accounts', { origin: 'spend', text: 'filed into the empty list' }); } catch (x) { e = x; }
  let es = null; try { quiet(() => m.stop()); } catch (x) { es = x; }   // its stop WRITES OVER the live path (here a directory: the rename fails)
  ok(!m.isHeldUnread() && !e && m.snapshot().open.length === 1 && es && /EISDIR/.test(String(es.message)), 'CONTROL (the hold\'s line cut): a failed read starts EMPTY, the write is taken, and the stop writes over the live path — the legs above go RED on it', { held: m.isHeldUnread(), e: e && e.message, stop: es && es.message });
}
{
  // THE BELT ALONE: add's own refusal cut — the save refuses (todos-unread) and nothing is armed (a writer that forgets its first line
  // still never writes over the file)
  const cut = anchored(read('src/user-todos.js'), "    this._refuseUnread('filing an item');", "    void 0;", 'add\'s own refusal');
  const Mb = MJ.load('src/user-todos.js', cut, 'belt-only');
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new Mb.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  let e = null; try { quiet(() => m.add('accounts', { origin: 'spend', text: 'past its own check' })); } catch (x) { e = x; }
  quiet(() => m.stop());
  ok(e && e.code === 'todos-unread' && /a write is refused/.test(e.message) && !m.writeOwed() && fs.statSync(f).isDirectory(), 'THE BELT ALONE (add\'s own refusal cut): the save refuses by name — no write armed, the live path untouched', { e: e && e.message });
}

{
  // A READ AGAIN'S SET-ASIDE AND THE PROCESS'S END (B-44f3 remainder — THE SHAPE CHANGED at its second read: a finish at the exit's
  // flush raced the rename still out). The set-aside announces an INTENT file before its rename; THE NEXT BOOT judges it.
  //   'stop'        a stop() lands while the rename is out and the process lives on (a suite's / a migration's store): finished at once
  //   'exit-after'  the rename LANDED and the process ends before its continuation (the hub's exit): the next start names the bytes
  //   'exit-before' the process ends before the rename lands: the next start reads the torn bytes itself (sets them aside, names them)
  const USRC = read('src/user-todos.js');
  const scene = async (UTm, mode = 'stop', { judgeIntent = false } = {}) => {   // judgeIntent: only where the drop is asserted (the bounded wait costs time)
    const d = dataDir(), f = path.join(d, 'user-todos.json');
    fs.mkdirSync(f);   // held at the start (EISDIR)
    const m = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    fs.rmdirSync(f); fs.writeFileSync(f, '{"items": [ torn');   // torn bytes at the read again — they CAN be set aside
    const asideNow = () => fs.readdirSync(d).filter((x) => x.startsWith('user-todos.json.corrupt-'));
    const namings = (items, aside) => (items || []).filter((i) => i && i.status === 'open' && aside.some((x) => String(i.text || '').includes(x))).length;
    const nextStart = () => {   // the NEXT start over the same folder: what it says (EXACTLY one notice naming the bytes)
      const m2 = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
      const aside = asideNow();
      const out = { aside: aside.length, notices: namings(m2.snapshot().open, aside), held: m2.isHeldUnread() };
      m2.stop();   // its list (with the notice) on disk — the intent goes after that, off the loop
      return out;
    };
    const intentGone = async () => { for (let k = 0; k < 80 && fs.existsSync(f + '.aside-intent'); k++) await new Promise((res) => setTimeout(res, 25)); return !fs.existsSync(f + '.aside-intent'); };   // a bounded wait for the drop (an event), never a verdict on the clock
    const r0 = fs.promises.rename;
    let reached = null, atNext = null;
    const reachedP = new Promise((res) => { reached = res; });
    fs.promises.rename = async (a, b) => {
      if (mode === 'stop') { m.stop(); return r0.call(fs.promises, a, b); }   // the stop lands while the rename is out
      if (mode === 'exit-after') await r0.call(fs.promises, a, b);           // the rename LANDED …
      m.stop(); atNext = nextStart(); reached();                              // … and the process ends here: the next start
      return new Promise(() => { });                                          // (its continuation never runs)
    };
    let lifted = null, self = null;
    try {
      if (mode === 'stop') { lifted = await quiet(() => m.readAgain()); let own = null; try { own = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { own = null; } self = own ? namings(own.items, asideNow()) : -1; }   // the stopped store's OWN list, before any next start
      else { const ended = await Promise.race([reachedP.then(() => 'reached'), m.readAgain().then(() => 'returned', () => 'threw')]); if (ended !== 'reached') return { mode, never: ended }; }   // a rename never reached ends the scene by name
    } finally { fs.promises.rename = r0; }
    if (mode === 'stop') { m.stop(); atNext = nextStart(); }
    return { mode, lifted, self, ...atNext, intentGone: judgeIntent ? await intentGone() : null };
  };
  const a = await scene(UT), ae = await scene(UT, 'exit-after', { judgeIntent: true }), ab = await scene(UT, 'exit-before', { judgeIntent: true });
  ok(a.lifted === true && a.self === 1 && a.aside === 1 && a.notices === 1 && !a.held, 'a STOP while the read again sets torn bytes aside (the process lives on): the stopped store FINISHES it — its own list holds the ONE notice naming the bytes; the next start reads it', a);
  ok(ae.aside === 1 && ae.notices === 1 && !ae.held && ae.intentGone, 'THE HUB\'S EXIT after the rename landed, before the list was written: the NEXT START names the bytes from the set-aside\'s intent (empty list + its notice; the intent dropped)', ae);
  ok(ab.aside === 1 && ab.notices === 1 && !ab.held && ab.intentGone, 'the exit BEFORE the rename landed: the next start reads the torn bytes itself — set aside and named by its own boot (the stale intent dropped)', ab);
  const Ux = MJ.load('src/user-todos.js', anchored(USRC, '    setAside = this._bootIntent(a0);', '    setAside = null;', 'the boot not judging the intent'), 'boot-intent');
  const aex = await scene(Ux, 'exit-after');
  ok(aex.aside === 1 && aex.notices === 0, 'CONTROL (the boot not judging the intent): the bytes are aside and the next start names nothing — an empty list, the person never told', aex);
  const Uw = MJ.load('src/user-todos.js', anchored(USRC, "        try { await fs.promises.writeFile(this._intentPath(), JSON.stringify({ why: why0, to: to0 })); }", '        try { }', 'no intent before the rename'), 'no-intent');
  const Us = MJ.load('src/user-todos.js', anchored(USRC, '        if (this._unreadStopped && this._unread && s0 && s0.to) { this._finishAside(s0); return true; }', '', 'the stopped set-aside not finished'), 'stop-finish');
  const asx = await scene(Us);
  ok(asx.self === -1, 'CONTROL (the stopped set-aside not finished): the stopped store writes no list of its own — only the next boot could name the bytes', asx);
  // AN UNREADABLE BOOT keeps the intent it cannot judge (and one it cannot READ then: read again at the lift); the hold's lift on a
  // missing file («gone twice») names the bytes from it
  const heldBoot = async (UTm, reread = false) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json'), to = 'user-todos.json.corrupt-2026-11-20T00-00-00-000Z', ip = f + '.aside-intent';
    fs.writeFileSync(path.join(d, to), '{"items": [ torn');
    if (reread) fs.mkdirSync(ip); else fs.writeFileSync(ip, JSON.stringify({ why: 'corrupt JSON', to }));   // reread: the intent unreadable at the boot too (EISDIR)
    fs.mkdirSync(f);   // the store unreadable at the boot (EISDIR)
    const m = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    fs.rmdirSync(f);   // the file gone
    if (reread) { fs.rmdirSync(ip); fs.writeFileSync(ip, JSON.stringify({ why: 'corrupt JSON', to })); }   // the folder readable again
    const r1 = await quiet(() => m.readAgain());   // gone once (held again)
    const kept = fs.existsSync(ip) && m.isHeldUnread();   // judged AFTER a turn: an async drop would have landed
    const r2 = await quiet(() => m.readAgain());   // gone twice (lifted)
    const n = (m.snapshot().open || []).filter((i) => i && String(i.text || '').includes(to)).length;
    m.stop();
    return { reread, kept, r1, r2, n };
  };
  // 主开发 r348 (4): A HEALTHY STORE FILE BESIDE A STALE INTENT (the common exit: the list landed, the intent's removal did not) — no
  // notice, the intent dropped, nothing emptied
  const staleBeside = async (UTm) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json'), to = 'user-todos.json.corrupt-2026-11-20T01-00-00-000Z';
    fs.writeFileSync(path.join(d, to), '{"items": [ torn');
    fs.writeFileSync(f, JSON.stringify({ items: [ITEM('h1', 'kept item')] }));
    fs.writeFileSync(f + '.aside-intent', JSON.stringify({ why: 'corrupt JSON', to }));
    const m = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    const open = m.snapshot().open || [];
    const out = { kept: open.some((i) => i && i.id === 'h1'), notices: open.filter((i) => i && String(i.text || '').includes(to)).length, held: m.isHeldUnread() };
    m.stop();
    for (let k = 0; k < 80 && fs.existsSync(f + '.aside-intent'); k++) await new Promise((res) => setTimeout(res, 25));   // a bounded wait for the drop (an event)
    return { ...out, intentGone: !fs.existsSync(f + '.aside-intent') };
  };
  const sb = await staleBeside(UT);
  ok(sb.kept && sb.notices === 0 && !sb.held && sb.intentGone, 'a HEALTHY list beside a stale intent (the list landed, the intent\'s drop did not): its items kept, NO notice, the intent dropped', sb);
  const Ub = MJ.load('src/user-todos.js', anchored(USRC, "    if (!it || a0.state !== 'missing' || !fs.existsSync(", "    if (!it || !fs.existsSync(", 'the stale intent judged whatever the live file'), 'stale-beside');
  const sbx = await staleBeside(Ub);
  ok(sbx.notices === 1, 'CONTROL (the stale intent judged whatever the live file): a «set aside» notice beside a healthy list — a false notice', sbx);
  // 主开发 r348 (1): THE INTENT CANNOT BE WRITTEN (a full disk) ⇒ nothing is set aside — the store stays held, its torn file kept as it is
  const noIntent = async (UTm) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json');
    fs.mkdirSync(f);
    const m = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    fs.rmdirSync(f); fs.writeFileSync(f, '{"items": [ torn');
    const w0 = fs.promises.writeFile;
    fs.promises.writeFile = async (file, ...rest) => { if (String(file).endsWith('.aside-intent')) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); return w0.call(fs.promises, file, ...rest); };
    let r = null; try { r = await quiet(() => m.readAgain()); } finally { fs.promises.writeFile = w0; }
    const out = { r, held: m.isHeldUnread(), torn: fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('torn'), aside: fs.readdirSync(d).filter((x) => x.startsWith('user-todos.json.corrupt-')).length };
    m.stop();
    return out;
  };
  const ni = await noIntent(UT);
  ok(ni.r === false && ni.held && ni.torn && ni.aside === 0, 'the set-aside\'s INTENT refused (a full disk): nothing is set aside — the store stays HELD and its torn file stays where it is (the bytes\' safe copy)', ni);
  const Un = MJ.load('src/user-todos.js', anchored(USRC, "        if (!intentOk) { if (!this._unreadStopped && this._unread) this._holdUnread(SR.afterSetAside(a, null)); return false; }", '', 'the set-aside without its intent'), 'no-intent-through');
  const nix = await noIntent(Un);
  ok(nix.aside === 1 && !nix.held, 'CONTROL (the set-aside going through without its intent): the bytes moved aside with no intent — after an exit nobody would name them', nix);
  // 主开发 r348 (3): THE ASIDE'S NAME NEVER REPLACES AN EARLIER ASIDE (a frozen clock: the same stamp twice)
  const sameStamp = async (UTm) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json'), T = Date.UTC(2026, 10, 20, 2, 0, 0);
    const first = 'user-todos.json.corrupt-' + new Date(T).toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(d, first), 'THE EARLIER ASIDE');   // an earlier episode's copy, same stamp
    fs.writeFileSync(f, '{"items": [ torn again');
    const m = quiet(() => new UTm.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY, now: () => T }));   // the boot's own set-aside on the frozen clock
    m.stop();
    const asides = fs.readdirSync(d).filter((x) => x.startsWith('user-todos.json.corrupt-')).sort();
    return { asides, earlier: fs.readFileSync(path.join(d, first), 'utf8') };
  };
  const ss = await sameStamp(UT);
  ok(ss.asides.length === 2 && ss.earlier === 'THE EARLIER ASIDE' && ss.asides.some((x) => x.endsWith('-1')), 'the same stamp twice (a frozen clock): the new aside takes the next FREE name — the earlier aside untouched', ss);
  const Uf2 = MJ.load('src/user-todos.js', anchored(USRC, "    const to = this._freeAsideName();", "    const to = this._asideName();", 'the aside named over an earlier one'), 'aside-over');   // stale-pins: kept (the control plants the old name — by its stamp only)
  const ssx = await sameStamp(Uf2);
  ok(ssx.asides.length === 1 && ssx.earlier !== 'THE EARLIER ASIDE', 'CONTROL (the aside named by its stamp only): the earlier aside is REPLACED — its copy of the items gone', ssx);
  const hb = await heldBoot(UT), hr = await heldBoot(UT, true);
  ok(hb.kept && hb.r1 === false && hb.r2 === true && hb.n === 1, 'an UNREADABLE boot keeps the last run\'s set-aside intent; the hold\'s lift on the missing file names the bytes (ONE notice)', hb);
  ok(hr.kept && hr.r2 === true && hr.n === 1, '…an intent the boot could not READ either (the folder unreadable then) is read again at the lift, off the loop — named (ONE notice)', hr);
  const Uk = MJ.load('src/user-todos.js', anchored(USRC, "    if (a0.state === 'unreadable') { this._heldIntent = it; return null; }", "    if (a0.state === 'unreadable') { this._dropIntentOff(); return null; }", 'the unreadable boot dropping the intent'), 'held-intent');
  const hk = await heldBoot(Uk);
  ok(hk.n === 0, 'CONTROL (an unreadable boot dropping the intent it cannot judge): the lift names nothing', hk);


  const aew = await scene(Uw, 'exit-after');
  ok(aew.aside === 1 && aew.notices === 0, 'CONTROL (no intent written before the rename): the next start names nothing', aew);
}

// ── ② EVERY CALLER IS A ROW ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② every server file that writes or reads the For-you store is a row (its counts, its class, why)');
const W = 'add|setStatus|setStatusMany|readNotices|resolveAnswered|noteFact|resolveByReply|resolveByAgent|resolveByJob|setCard|setJudged|setFacts|redrawItem|reshapeItems|clearItems|rekey|flush|expireDue';
const R = 'get|forSession|hiddenFor|filedEver|idsWhere|resolvedOf|openItems|getForSession|snapshot|whenWritten';   // B-8797: + filedEver (a said-once producer's question, read-only)
const WSET = new Set(W.split('|'));
const RECV = ['this\\.userTodos', 'deps\\.userTodos', 'd\\.userTodos', 'userTodos', 'todos', 'ut', 'forYou', 'inbox', 'getUserTodos\\(\\)', 'userTodos\\(\\)', 'UT', 'todos\\(\\)', 'forYou\\(\\)'];
// a file that names the store otherwise (its own binding) — the census reads it with that name too
// (the first read's MUST: `t` / `td` / `T()` bindings were invisible — named here per file, each read off the file's own binding)
const RECEIVERS = { 'src/server/migrations.js': ['store', 'live'], 'src/server/job-secrets-door.js': ['live'], 'src/agent-routes/status.js': ['store'], 'src/migration-runner.js': ['store'], 'src/server/mount-for-you.js': ['t'], 'src/server/task-groups-wiring.js': ['td'], 'src/server/oat-identity.js': ['t'], 'src/server/usage-pool-engine.js': ['t'] };
// THE STORE'S OWN VOCABULARY (the second read's MUST — a list of receiver NAMES missed a file twice: the shape changes): a method only
// the For-you store has (setStatusMany, idsWhere, forSession, redrawItem, …) called on ANY receiver names that receiver as the store
// in THAT file — every write / read method on it is then counted; `add` / `get` / `flush` / `rekey` / `snapshot` / `setStatus` are
// common words (a Set, a Map, a job) and name no receiver by themselves. The names below stay (a file that only adds or gets).
const UNIQUE = [...W.split('|'), ...R.split('|')].filter((m) => !['add', 'get', 'flush', 'rekey', 'snapshot', 'setStatus', 'setFacts', 'whenWritten'].includes(m));   // (setFacts / whenWritten: other modules' words too — a facts model, a journal)
const RECV_EXPR = '(?:this\\.|deps\\.|d\\.)?[A-Za-z_$][\\w$]*(?:\\(\\))?';
const LEARNED = new Map();   // one learning per text (the third read's should: 7 census runs over the same 27 MB)
const learned = (text) => { if (LEARNED.has(text)) return LEARNED.get(text); const out = new Set(); for (const m of String(text).matchAll(new RegExp(`(?<![\\w$.])(${RECV_EXPR})(?:\\?\\.)?\\??\\.(?:${UNIQUE.join('|')})(?:\\?\\.)?\\(`, 'g'))) out.add(m[1].replace(/[.$()]/g, (c) => '\\' + c)); const r = [...out]; LEARNED.set(text, r); return r; };
const reOf = (file, text = '') => new RegExp(`(?:(?<![\\w$])(?:${[...new Set([...RECV, ...(RECEIVERS[file] || []), ...learned(text)])].join('|')}))(?:\\?\\.)?\\??\\.(${W}|${R})(?:\\?\\.)?\\(`, 'g');   // + the optional call `forYou.add?.(`
const swallows = (h) => {
  const b = (h && h.body && h.body.body) || [];
  if (!b.length) return true;
  if (b.length > 1) return false;
  const st = b[0], a = st.argument;
  if (st.type === 'ContinueStatement' || st.type === 'BreakStatement') return true;
  if (st.type === 'ReturnStatement') return !a || a.type === 'Literal' || (a.type === 'Identifier' && a.name === 'undefined') || (a.type === 'ArrayExpression' && !a.elements.length) || (a.type === 'ObjectExpression' && !a.properties.length);
  return st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' && (st.expression.right.type === 'Literal' || (st.expression.right.type === 'ArrayExpression' && !st.expression.right.elements.length));
};
const TRIES = new Map();   // one parse per text: the controls re-run the census over copies that differ in ONE file
const triesOf = (text) => {
  if (TRIES.has(text)) return TRIES.get(text);
  let ast = null;
  for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { ast = null; } }
  if (!ast) { TRIES.set(text, null); return null; }
  const out = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'TryStatement' && n.handler) out.push({ start: n.block.start, end: n.block.end, swallow: swallows(n.handler) });
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) { for (const x of v) visit(x); } else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v); }
  };
  visit(ast);
  TRIES.set(text, out);
  return out;
};
const SKIP_DIRS = ['src/lib', 'src/agentd'];   // the page's bundle (④ below) and the device's (no For-you store there)
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.includes(rel)) walk(rel, out); }
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
};
let SERVER_FILES = null;   // read once (the controls copy the map and plant ONE file)
const serverFiles = () => SERVER_FILES || (SERVER_FILES = new Map(['server.js', ...walk('src')].filter((f) => f !== 'src/user-todos.js').map((f) => [f, read(f)])));
/** THE CENSUS over a set of file texts → { problems, sites } */
function census(files, rows) {
  const problems = [], per = new Map(), unparsed = [];
  for (const [file, text] of files) {
    const re = reOf(file, text);
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const tries = triesOf(text);
    if (!tries) unparsed.push(file);
    const o = { w: 0, r: 0, notry: 0, swallow: 0, lines: [] };
    let off = 0;
    for (const [i, ln] of text.split('\n').entries()) {
      const st = off; off += ln.length + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(ln)) continue;
      for (const m of ln.matchAll(re)) {
        const at = st + m.index, inner = (tries || []).filter((t) => t.start <= at && at < t.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        if (WSET.has(m[1])) { o.w++; if (!inner) { o.notry++; o.lines.push(`${file}:${i + 1} (no try) ${ln.trim().slice(0, 100)}`); } else if (inner.swallow) o.swallow++; } else o.r++;
      }
    }
    per.set(file, o);
  }
  for (const f of unparsed) problems.push(`${f}: acorn cannot parse it — the census never skips a file (fix the parse, or the census)`);
  for (const [file, o] of per) {
    const row = rows.find((r) => r.file === file);
    if (!row) { problems.push(`${file}: NO ROW — ${o.w} write(s), ${o.r} read(s) of the For-you store; classify it (waits / refuses / contained / harmless) and say why`); continue; }
    if (row.w !== o.w || row.r !== o.r) problems.push(`${file}: the counts moved (writes ${row.w} → ${o.w}, reads ${row.r} → ${o.r}) — classify the new site(s), then move the counts`);
    if ((row.notry || 0) !== o.notry) problems.push(`${file}: ${o.notry} write(s) with NO try around them, the row counts ${row.notry || 0} — a refusal by name THROWS (todos-unread): ${o.lines.join(' · ')}`);
    if (o.swallow && !row.bare) problems.push(`${file}: ${o.swallow} write(s) inside a catch that SWALLOWS — the refusal is lost there; the row says why that is right (\`bare\`) or the catch names it`);
    if (!o.swallow && row.bare) problems.push(`${file}: the row's \`bare\` reason names no swallowing catch any more — drop it`);
    if (!CLASSES.includes(row.cls) || !row.why || row.why.length < 40) problems.push(`${file}: the row's class (${row.cls}) or its why is missing`);
  }
  for (const r of rows) if (!per.has(r.file)) problems.push(`${r.file}: DEAD row — the file no longer writes or reads the For-you store (remove the row)`);
  return { problems, per };
}
const CLASSES = ['waits', 'refuses', 'contained', 'harmless'];
const SETTLE = 'a settle while held: `get` finds nothing (the list is unread) or the close is refused — skipped, the item closes at the producer\'s next pass (a ONE-SHOT settle waits for the read instead — the rows that say so)';
const ROWS = [
  { file: 'server.js', w: 3, r: 1, cls: 'refuses', why: 'the press route (POST /api/user-todos/:id) answers 503 todos-unread by the code; GET /api/user-todos hands the snapshot WITH `held`', bare: 'the two shutdown flushes: held ⇒ refused — nothing was ever made dirty, nothing to write' },
  { file: 'src/accounts.js', w: 3, r: 2, cls: 'contained', why: 'the B-f276 family (bl-windows, r3046 / r3129): the unread accounts list\'s ONE notice inside tries that log — found by its text in the tray (forSession: a restart adopts it, a start that reads closes it — a hidden one too, hiddenFor: never filed again while the person hid it), the other cause\'s item closed, filed again at the next hold' },
  { file: 'src/agent-routes/status.js', w: 3, r: 4, notry: 1, cls: 'refuses', why: 'vibespace-ask: every verb answers 503 todos-unread FIRST while held (list / show / resolve / add / clear need the list); its catch answers the code by name. asksOf (the ask store\'s one read, for the Artifacts rebuild): harmless — the rebuild MERGES with the persisted rows, an unread list drops no ask\'s row' },
  { file: 'src/exit-proxy.js', w: 4, r: 3, cls: 'waits', why: 'reconcileAsks (the boot\'s «ask me» items from before the restart) waits for the read; an ask\'s card filing is refused inside its try (the ask answers without a card)', bare: SETTLE },
  { file: 'src/plugins/frp.js', w: 2, r: 2, cls: 'contained', why: 'the frp notice: its try returns null on the refusal — the plugin files it again at its next state change', bare: 'the relay notice\'s close runs at For you\'s read when it is held (whenRead) — its catch only meets an item the owner cleared' },
  { file: 'src/routes/user-todos-reply.js', w: 4, r: 2, notry: 1, cls: 'refuses', why: 'the reply and the one-item read answer 503 todos-unread BEFORE any send / lookup; resolve-many and the notices doors answer the store\'s refusal 503 by its code; the reopen\'s resolveByReply (no try) is past the reply\'s held refusal' },
  { file: 'src/server/apps-engine.js', w: 5, r: 1, cls: 'contained', why: 'an app card\'s one close (dismissCard) waits for the read; an install proposal\'s card: filed inside a try that logs (the proposal stands without its card); setCard logs its refusal', bare: SETTLE },
  { file: 'src/server/automation-engine.js', w: 4, r: 2, cls: 'waits', why: 'reconcile (the first-use cards from before the restart) waits for the read; a first-use ask\'s card is refused inside its try (the ask answers without it)', bare: SETTLE },
  { file: 'src/server/browser-builds-keeper.js', w: 1, r: 0, cls: 'contained', why: 'a build notice inside a try that logs — said again at the build\'s next state change' },
  { file: 'src/server/browser-dialogs.js', w: 10, r: 0, cls: 'contained', why: 'the boot sweeps of a past hub life\'s items (pk-left / sign-in asks) wait for the read through the adapter\'s whenRead (the first read\'s MUST); the live fill\'s two notices (value shown, ceiling) through the forYou door', bare: 'a held list takes no notice: the fill goes on, its notice id stays unset (filed again at the next hold of that fill)' },
  { file: 'src/server/browser-disk-run.js', w: 2, r: 2, cls: 'contained', why: 'the disk-run notice inside a try that logs; filed again at the next run', bare: SETTLE },
  { file: 'src/server/browser-handback.js', w: 5, r: 1, cls: 'contained', why: 'a takeover\'s hand-back item: filed inside a try that logs (the takeover stands, its card refused); its close logs a refusal; r3261 (bl-browser-b): +1 — while the TAKEOVER requests are held, a pressed item is put back open (setStatus open, by system) so its request is never ended unread', bare: SETTLE + ' · r3261: the put-back while the takeover requests are held swallows its refusal (the For-you list held too): the item stays as the person left it, its request untouched, said in the journal line beside it' },
  { file: 'src/server/host-key-watch.js', w: 2, r: 0, cls: 'contained', why: 'the host-key items (lane lg-remote-hardening, met at the move onto c72bbedd2): a refused key\'s item and its notice are filed inside a try that LOGS the refusal by name — the machine\'s row says the refusal itself (its chip and Host key… door), and the next refused dial files the item again once the list reads; a retract (pinned, removed) refused while held leaves the item for that machine\'s next pin or notice to close' },
  { file: 'src/watch-door.js', w: 2, r: 2, cls: 'waits', why: 'the file watches\' notice (bl-loop-b\'s watch door): its filing is refused inside a try and filed again while the limit lasts (filesDue); its close waits for For you\'s read (whenRead) — the meeting on the stores tip; its look for the notice from before the restart (openItems) waits for the read too: adopted then — a held list\'s [] is never «nothing to adopt», and the filing waits for that look (the third read\'s MUST)', bare: 'the close is a settle: tried at For you\'s read, a close refused there (the owner cleared it) has nothing to keep' },
  { file: 'src/server/data-folder-notice.js', w: 2, r: 2, cls: 'waits', why: 'B-8797 (lane hub-loop-stalls, r5195): the data folder notice — while For you is held its whole telling (the said-once question, the filing, the settle) waits for the read (whenRead: a held list reads empty, so filedEver would say «never said»); the filing and the settle sit in tries that log' },
  { file: 'src/server/mount-for-you.js', w: 9, r: 6, notry: 3, cls: 'waits', bare: 'the settles (answered / removed / unpark) run at For you\'s read when it is held (whenRead) — their catches only meet an item the owner cleared', why: 'the client-swap items of this .413 base (B-e40d): judged at the next check after the read — clientSwaps returns the memos unchanged while held (a swap item «not open» would be filed or a memo dropped on nothing); park / killed / stranded filings have no try of their own: mounts calls them inside its tries (onPark, onKilled — a refusal is logged, the item a previous life filed still in the file); a parked mount\'s item: the boot\'s unpark pass waits for the read (whenRead — the held list is empty, the record still unparked then); a park is filed by mounts inside its tries (refused while held: the item a previous life filed is still in the file)' },
  { file: 'src/server/oat-identity.js', w: 2, r: 1, cls: 'waits', why: 'THE MONEY LAW (主开发 03:57Z): the identity check judges and saves its mark whatever For you\'s state (the pool places nothing new on a marked token at once); only its item\'s FILING is owed — the id saved as owed-at-read ON the check (a restart keeps the debt), filed by the pass at the read / the boot\'s look and its id saved; a close is done at the read' },
  { file: 'src/server/task-groups-wiring.js', w: 4, r: 3, notry: 3, cls: 'waits', why: 'say / lift / closeOpen have no try of their own: the Task Groups store calls them inside its tries (a refusal there is said again at its next held read); the Task Groups store\'s held notice: say / lift inside the store\'s tries (said again at its next held read); a stale notice of an earlier boot is closed at For you\'s read (closeOpen → whenRead)', bare: 'the stale notice\'s close at the read: a refusal there meets an item the owner cleared' },
  { file: 'src/server/conversation-facts.js', w: 0, r: 1, cls: 'harmless', why: 'a conversation\'s open asks (asksOf) answer UNKNOWN (undefined, the facts\' own «not known») while For you is held — never «none»' },
  { file: 'src/server/end-proposals.js', w: 6, r: 6, notry: 2, cls: 'refuses', bare: 'a card\'s rows redrawn after the person\'s answer (setCard in a catch that keeps the answer\'s own result) — a press is refused while held before it reaches here', why: 'the two card filings (an end proposal, a wake-grant proposal) have no try: the refusal THROWS by name to the agent\'s verb; an agent\'s end proposal is refused BY NAME while held (the card\'s add throws todos-unread through the verb\'s answer); the sweep of ended cards finds nothing while held and runs again at its next pass; a card\'s close inside a try that logs' },
  { file: 'src/server/usage-reading-for-you.js', w: 2, r: 1, cls: 'waits', why: 'an account\'s unreadable usage file\'s item (r3136 / r3200): filed at For you\'s read when it is held (the mark judged again then), its settle likewise; the sweep of an earlier run\'s item runs only once For you answers and is not held — its add and its settle each inside a try that logs' },
  { file: 'src/server/queued-file-for-you.js', w: 2, r: 1, cls: 'waits', why: 'the unread queued-messages file\'s item (B-e3fe): filed at For you\'s read when it is held (the file judged again then) — never a throw out of create() at the top of server.js (its add inside a try that logs); its settle (boot / the file reads again) waits for the read too' },
  { file: 'src/server/browser-keeper.js', w: 18, r: 10, cls: 'waits', why: 'B-9584 U2c: + the place hold\'s notices (onGeoEvent — a tab run without its place, the hold down for good or refused at a restart; the place given again after a gap is a journal line only), inside a try that logs, one of each kind a browser run; the held profile registry\'s notice (bl-jobs\' B-f276 remainder, the meeting on the stores tip): filed / closed at For you\'s read while it is held (whenRead), else inside tries that log; the folder-lost notices\' reclaim (the first load after a restart) waits for the read; browser notices (floor, version, stops, profile asks) inside tries that log, each filed again at its next event', bare: SETTLE },
  { file: 'src/server/browser-logins.js', w: 3, r: 0, cls: 'contained', why: 'a sign-in notice / action through the forYou door, each inside a try (the login road answers without its card)' },
  { file: 'src/server/browser-propose.js', w: 4, r: 2, cls: 'contained', why: 'a proposal\'s card inside tries that log (the proposal stands; its card filed again at the proposal\'s next state)' },
  { file: 'src/server/channel-api-cards.js', w: 2, r: 0, cls: 'contained', why: 'a channel API card filed inside a try (st.todoId stays unset — filed again at the next push)', bare: SETTLE },
  { file: 'src/server/channels-access.js', w: 16, r: 8, notry: 1, cls: 'waits', why: 'the wake expiry WAITS while held (expireWatchRequests answers []) — the boot reconcile at the read expires what is due; a card\'s filing (fileCard, no try of its own) rides out to the ask route\'s catch (refused by name)', bare: SETTLE + ' (the boot reconcile at the read settles it)' },
  { file: 'src/server/channels-auth.js', w: 3, r: 2, cls: 'waits', why: 'the last run\'s «finish connecting» cards (their sign-ins end with the restart) are closed at the read (whenRead); a landed sign-in\'s card inside a try that logs' },
  { file: 'src/server/channels-engine.js', w: 20, r: 11, notry: 1, cls: 'waits', why: 'B-f276 1b: +5 writes / +1 read — the held-file notices over the store hold (a damaged file\'s item with its door, an appeared file\'s item, a started-empty redraw, its setStatus) and the redraw\'s find; a card\'s redraw of this .413 base (get → redrawItem) finds nothing while held and is redrawn at its next change; the boot asks reconcile waits for the read (whenRead: a held decision\'s card «gone» would be filed twice); fileHeldCard (no try of its own) is called inside the reconcile\'s and the hold\'s tries; adapter notices inside tries that log', bare: SETTLE },
  { file: 'src/server/channels-outbound.js', w: 11, r: 7, cls: 'waits', why: 'pointerSync / composePointerSync WAIT for the read (one deferred sync a key); the outbound cards inside tries that log; r2268: the unknown-outcome item is retracted BY ITS NAME (idsWhere) inside a try that logs — while the list is held unread no close is tried and the recorded id is KEPT (r2412: cleared only after its close landed) — and its heal WAITS for the read (waitRead), closes in ONE setStatusMany and counts a refused close into one journal line', bare: SETTLE },
  { file: 'src/server/cli-unmeasured-notice.js', w: 4, r: 6, cls: 'contained', why: 'the unmeasured-CLI notice inside a try that logs; judged again at the next measurement', bare: SETTLE },
  { file: 'src/server/csp-reports.js', w: 2, r: 1, cls: 'contained', why: 'a page-security notice inside tries; said again at the next report' },
  { file: 'src/server/decision-engine.js', w: 3, r: 2, notry: 2, cls: 'harmless', why: 'the judge pass writes only beside OPEN items (setFacts / setJudged over openItems()) — a held list has none, so the two untried writes are unreachable while held; the paused row\'s add sits in a try' },
  { file: 'src/server/desktop-app-keeper.js', w: 2, r: 3, cls: 'contained', why: 'an app\'s notify item inside a try that logs; filed again at the app\'s next note', bare: SETTLE },
  { file: 'src/server/device-alerts.js', w: 1, r: 0, cls: 'contained', why: 'a device alert inside a try that logs; said again at the next alert' },
  { file: 'src/server/device-upgrade-watch.js', w: 5, r: 1, cls: 'contained', why: 'upgrade notices inside tries that log; matched() keeps the ledger record while held (its retract would be refused) — the next report after the read resolves it' },
  { file: 'src/server/dial-health-watch.js', w: 2, r: 1, cls: 'contained', why: 'the dial-health notice inside tries that log; a clear keeps its record while held (resolved at the first clear pass after the read)' },
  { file: 'src/server/engine-distribution.js', w: 1, r: 0, cls: 'contained', why: 'the engine-distribution notice inside a try that logs; said again at the next distribution step' },
  { file: 'src/server/feedback-forward.js', w: 2, r: 1, cls: 'contained', why: 'the feedback notice inside a try that logs (the forward still happens; its notice is refused)', bare: SETTLE },
  { file: 'src/server/groups-engine.js', w: 2, r: 1, cls: 'contained', why: 'a group\'s channel item inside a try that logs; drawn again at the group\'s next message' },
  { file: 'src/server/helper-asks.js', w: 2, r: 2, cls: 'contained', why: 'a helper ask\'s item inside tries that log (the agent is told by the ask\'s own road); a close logs its refusal' },
  { file: 'src/server/hooks-late.js', w: 1, r: 0, cls: 'contained', why: 'the hooks-late action inside a try; said again at the next late hook' },
  { file: 'src/server/hub-act-ask.js', w: 10, r: 7, cls: 'waits', why: 'reconcile (the hub-act asks from before the restart) waits for the read; an ask\'s card is refused inside its try (the act answers without it)', bare: SETTLE },
  { file: 'src/server/jobs-wiring.js', w: 10, r: 13, notry: 3, cls: 'waits', why: 'resolveJobAsk refused ⇒ runs again at the read (whenRead: the ask\'s item never reopens over an answered panel); noticeDropped\'s add (no try) rides out to jobs.js _sayDropped — caught, logged, filed again at the next eviction; B-6721 (met at the move onto c72bbedd2): the «notices wait» item and its close ask isHeldUnread FIRST — held ⇒ whenRead (filed at the read if still owed a wake; closed at the read if nothing is), and the add (no try) rides out to jobs.js sayWakeWaiting\'s catch (logged); B-2566: the away failure\'s renewal reads the job\'s own items first (idsWhere + get, inside notifyUser\'s try: a refusal is its answer), and its close (resolveAwayFailed) asks isHeldUnread FIRST — held ⇒ whenRead — its setStatus in a try that logs; B-2566\'s remainder: the «results wait for a machine» item (noticeMachineAway) and its close (resolveMachineAway) ask isHeldUnread FIRST — held ⇒ whenRead (filed at the read through the engine, closed at the read); its add (no try) rides out to jobs.js _machineAway\'s catch (logged); machineAwayOpen answers [] while held' },
  { file: 'src/server/ledger-shape-notice.js', w: 11, r: 12, notry: 3, cls: 'waits', why: 'reconcile (growth alarms from before the restart) waits for the read; fileItem / relabel / redrop (no try) run inside onShape, whose caller usage-hold-road _emitShape catches and answers false — the hold KEEPS its count (flushed() is false on the refusal)', bare: SETTLE },
  { file: 'src/server/login-expiry-watch.js', w: 2, r: 1, cls: 'contained', why: 'the login-expiry item inside tries that log; resolveFiled KEEPS every record while held (an unread item is never «gone»); the watch files again at its next pass' },
  { file: 'src/server/main-asks.js', w: 2, r: 2, cls: 'contained', why: 'a main ask\'s item inside tries that log (the ask answers by its own road)' },
  { file: 'src/server/memory-pressure-watch.js', w: 2, r: 2, cls: 'contained', why: 'the memory notice inside a try that logs; the watch files again at its next pass', bare: SETTLE },
  { file: 'src/server/migrations.js', w: 11, r: 5, notry: 8, cls: 'waits', why: 'liveTodos() refuses every For-you migration BY NAME before it reads (r3288: + job-secrets-retired\'s second-run guard asks liveTodos() first, then reads its keyed item; job-secrets\' settle outside its catch, the «both files» notice\'s refusal rethrown); the untried writes sit in run() — a throw is the runner\'s failed row (code todos-unread), run again at the read', bare: 'the settle\'s close and the proposals\' close: both past liveTodos() (refused before them while held)' },
  { file: 'src/auth.js', w: 2, r: 1, cls: 'waits', why: 'B-dc3f (3): the sign-in record\'s notice (the network home\'s copy refused or waiting) is filed AND closed at For you\'s read when the list is held (_heldInbox: a store that cannot answer counts as held; _owedAtRead: ONE wait on whenRead, each cause\'s last word kept — a landing after a refusal closes, a refusal after a landing files); its filing inside a try that says once in the journal (the journal line is the word), its close likewise (it closes at the next landing)' },
  { file: 'src/migration-runner.js', w: 3, r: 2, cls: 'waits', why: 'sayFailed files its notice inside a try that warns (refused while held: a warn line); r3244: sayLedgerUnread files the unread ledger\'s ONE item the same way (a try that warns); r3288: it asks the store\'s hold FIRST (held: it waits for the read) and reads its own open item (a second start: the way out); sayRan closes the notice at the read (its held check first: whenRead)', bare: 'sayRan\'s close loop runs only when the list is read (the held check returns before it)' },
  { file: 'src/server/job-secrets-door.js', w: 3, r: 2, cls: 'waits', why: 'the person\'s answer settles the job-secrets notice at the read (whenRead) — never «none open» over an unread list; B-ef1b (主开发 r191, r333): the leftover notice (copies a move made or left that are still to be removed, or its record set aside unread) is filed / settled at the read too (whenRead), its writes inside a try that logs' },
  { file: 'src/server/mount-health-watch.js', w: 3, r: 3, cls: 'contained', why: 'the storage notices inside tries that log; the watch files again at its next pass', bare: SETTLE },
  { file: 'src/server/mounts-plugins-wiring.js', w: 9, r: 4, notry: 3, cls: 'refuses', why: 'the archive verb\'s asksOf throws todos-unread while held (conversation-ops answers it by name — a worker is never archived over asks it cannot see); the doors it hands (the browser forYou add / resolve, resolveAsks) carry no try of their own — every caller sits in its own try' },
  { file: 'src/server/record-clear.js', w: 2, r: 1, notry: 2, cls: 'refuses', why: 'a For-you clear and a job\'s clear are refused by name (todos_unread 503) BEFORE anything is cleared — the two clearItems lines are past that refusal' },
  { file: 'src/server/setting-holds.js', w: 2, r: 1, cls: 'contained', why: 'a setting hold\'s notice inside a try that logs; said again at the next hold. r3095 (lane bl-loop-b): the «could not be read» notice CLOSED by the read that lifts the holds\' own hold (openItems by its key + resolveAnswered), inside a try that logs — a held For you leaves it open, and the next start that reads closes it' },
  { file: 'src/server/spend-guard.js', w: 7, r: 7, cls: 'contained', why: 'r3136 +1 write +1 read: the reading\'s notice (ONE an account) closed when the reading tells again (its idsWhere + setStatus inside a try, as the settings\' close); the spend ledger\'s held notice (this .413 base): its close at a ledger load waits for For you\'s read (whenRead) — and (B-ef83 r1648) the unlocked-episode notice\'s close the same way, and (r1801 (4)) an earlier run\'s item closed only when For you is read (never a wait registered: the beat asks again) — and the held SETTINGS\' notice its close at their lift the same way (B-225b cure 3); a refusal\'s notice while held is OWED and filed once at the read (主开发 05:00Z, 2 — the «messages waiting» seam judged again over the read list by the live path\'s ONE predicate, waitItemOpen); other spend notices inside tries that log, filed again at the next refusal of a turn', bare: SETTLE },
  { file: 'src/server/tls.js', w: 2, r: 2, cls: 'contained', why: 'the HTTPS notice inside a try that logs; filed again at the next certificate check', bare: SETTLE },
  { file: 'src/server/unexpected-exit.js', w: 2, r: 1, cls: 'contained', why: 'an unexpected exit\'s item inside tries that log; the heal pass marks no conversation healed while held (the pass after the read heals)' },
  { file: 'src/server/usage-pool-engine.js', w: 26, r: 10, cls: 'contained', why: 'line 463\'s smalls (bl-windows, r2550) +1 write +1 read: the held notice redrawn when its cause changes (redrawItem, never from an unread list, inside a try that logs) and a held start adopting the last run\'s open notice (its snapshot read, never from an unread list, inside a try that logs); B-d578 fallback F2 +4 writes: the fallback item a pool and provider — its add and its redraw (drawFallbackAsk) and its two settles (none waits; an answer), each inside a try that logs; a refused filing is filed again at the next pass; line 429\'s follow (bl-windows, r2413) +1 write: the last run\'s held-attempts notice resolved at a start that read the file (its setStatus in the reset-credit asks\' seeding, never from a held list, inside a try that logs); B-f276\'s remainder (bl-windows) +2 writes +1 read: the held reset-credit attempts\' notice (its add inside a try that logs; filed again at the next press when the store refused it) and its resolve at the lift (get + setStatus inside a try that logs); a blocked pool\'s episode item (this .413 base): its read finds nothing while held, judged again at the next poll after the read; the cross-provider asks reconcile (once a process) waits for the read (the first read\'s MUST); pool / usage / reset-credit items inside tries that log; the reset-credit asks are never seeded once from a held list; each filed again at its next judgment', bare: SETTLE },
  { file: 'src/server/vault-hooks.js', w: 6, r: 5, notry: 1, cls: 'waits', why: 'the boot\'s vault item is judged AT THE READ by the lock state of then (filed while locked, closed while unlocked); the use-failure card door (`file`, no try) is called inside its callers\' tries', bare: SETTLE },
  { file: 'src/server/vault-job-door.js', w: 4, r: 4, cls: 'refuses', why: 'lane vault-job-approval: a Background job\'s approval card is never filed over a held list (stage L3\'s F1: nor drawn again — its redraw sits behind the same held check, the landing\'s) — the job WAITS (never refused for it) and is judged again at the read (ONE whenRead waiter); a card\'s answer refuses todos-unread by name; the index of open cards is never built from a held list (built from the FILE after the read)' },
  { file: 'src/server/vault-paste-door.js', w: 8, r: 5, cls: 'refuses', why: 'a paste request and a words proposal refuse todos-unread by name while held; the index of open requests is never built from a held list (built from the FILE after the read — the cards answer, never ask_unknown)', bare: SETTLE },
  { file: 'src/server/vault-run-door.js', w: 32, r: 16, cls: 'waits', why: 'reconcile (the run cards from before the restart) and «a restart ends every grant» wait for the read (the grants noted with the restart\'s time); a run\'s card is refused inside its try (the run answers without it); r1700: the start\'s «used» for an approval a run spent is the same wait (inside the sweep); r1834: an «Always» card told «revoked» / «deleted» when its member leaves the use-grants row (a person\'s ✕ / Save / delete) is inside its try — while For you is held unread its list is empty and nothing is told, as the 1-hour window\'s road', bare: SETTLE + ' (a run card from before the restart: the reconcile at the read)' },
  { file: 'src/server/voice-teach-engine.js', w: 5, r: 3, cls: 'contained', why: 'the dictation suggestions\' items inside tries that log; offered again at the next batch', bare: SETTLE },
  { file: 'src/server/wait-watch.js', w: 3, r: 1, cls: 'contained', why: 'a wait notice inside tries that log; the watch files again at its next pass', bare: SETTLE },
];
{
  const { problems, per } = census(serverFiles(), ROWS);
  const W0 = [...per.values()].reduce((k, o) => k + o.w, 0), R0 = [...per.values()].reduce((k, o) => k + o.r, 0);
  console.log(`  the census: ${per.size} files · ${W0} writes · ${R0} reads · ${ROWS.filter((r) => r.cls === 'waits').length} wait · ${ROWS.filter((r) => r.cls === 'refuses').length} refuse · ${ROWS.filter((r) => r.cls === 'contained').length} contained · ${ROWS.filter((r) => r.cls === 'harmless').length} harmless`);
  ok(!problems.length, `every server file that writes or reads the For-you store is a row (${per.size} files, ${W0} writes, ${R0} reads) — counts, untried writes and swallowing catches each answered`, problems);
  // CONTROLS — the engine over planted texts: a new producer file, a moved count, an untried write, a swallowed write
  const files = serverFiles();
  const plant = new Map(files); plant.set('src/server/new-producer.js', "function f(userTodos) { try { userTodos.add('k', { text: 'x' }); } catch (e) { console.warn(e.message); } }\n");
  ok(census(plant, ROWS).problems.some((p) => /^src\/server\/new-producer\.js: NO ROW/.test(p)), 'CONTROL: a new file that files into For you with no row is RED');
  { // the second read's shape (the store's own vocabulary): a file whose ONLY binding is a fresh name is found by the store-only method it calls
    const fresh = new Map(serverFiles()); fresh.set('src/server/fresh-name.js', "const zq = getStore();\nfunction f() { try { zq.add('k', { text: 'x' }); } catch (e) { log(e.message); } return zq.idsWhere((i) => i.status === 'open'); }\n");
    const common = new Map(serverFiles()); common.set('src/server/common-words.js', "const s = new Set(); s.add(1); const m = new Map(); m.get(1); const j = journal(); j.setFacts({}); j.whenWritten();\n");
    ok(census(fresh, ROWS).problems.some((p) => /^src\/server\/fresh-name\.js: NO ROW — 1 write\(s\), 1 read\(s\)/.test(p)) && !census(common, ROWS).problems.some((p) => /common-words\.js/.test(p)),
      'CONTROL: a file naming the store by a fresh binding is found by the store-only method it calls (idsWhere) and its add counted; common words (a Set\'s add, a Map\'s get, another module\'s setFacts / whenWritten) name no receiver'); }
  const moved = new Map(files); moved.set('src/server/tls.js', files.get('src/server/tls.js') + "\nfunction g(todos) { try { todos.add('k', { text: 'y' }); } catch (e) { console.warn(e.message); } }\n");
  ok(census(moved, ROWS).problems.some((p) => /^src\/server\/tls\.js: the counts moved \(writes 2 → 3/.test(p)), 'CONTROL: a second write in a rowed file moves its count — RED');
  const untried = new Map(files); untried.set('src/server/tls.js', files.get('src/server/tls.js') + "\nfunction g(todos) { todos.add('k', { text: 'y' }); }\n");
  ok(census(untried, ROWS.map((r) => (r.file === 'src/server/tls.js' ? { ...r, w: 3 } : r))).problems.some((p) => /^src\/server\/tls\.js: 1 write\(s\) with NO try/.test(p)), 'CONTROL: a write with no try around it (the refusal would throw out) — RED');
  const swal = new Map(files); swal.set('src/server/csp-reports.js', files.get('src/server/csp-reports.js') + "\nfunction g(todos) { try { todos.add('k', { text: 'y' }); } catch { } }\n");
  ok(census(swal, ROWS.map((r) => (r.file === 'src/server/csp-reports.js' ? { ...r, w: 3 } : r))).problems.some((p) => /^src\/server\/csp-reports\.js: 1 write\(s\) inside a catch that SWALLOWS/.test(p)), 'CONTROL: a write inside a swallowing catch in a file whose row gives no reason — RED');
}

// ── ③ THE SCENES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ the scenes — a migration waits for the read, a clear is refused by name, the boot passes judge the FILE');
{
  // a data migration that touches For you (2026-10-job-secrets-retired: nothing to tell ⇒ it settles its item) — refused by name
  // while held (never «settled» over an unread list and recorded applied), run again at the read
  const root = path.join(TMP, 'mig'); const d = path.join(root, 'data'); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  const MIG = require(path.join(ROOT, 'src/server/migrations.js'));
  const ID = '2026-10-job-secrets-retired';
  const notices = [];
  const mg = MIG.create({ rootDir: root, serverNotice: (k, t) => notices.push([k, t]), userTodos: m });
  const r1 = quiet(() => mg.runLocalMigrations({ only: [ID] }));
  const ledger = () => { try { return JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf8')); } catch { return {}; } };
  const r = r1.find((x) => x.id === ID);
  ok(r && r.status === 'failed' && r.code === 'todos-unread' && !(ledger().applied || {})[ID], 'a For-you migration while held: refused BY NAME (the runner\'s row carries code todos-unread) — NOT recorded applied', { r, applied: ledger().applied });
  ok(!notices.some(([k]) => k === `migration-failed:${ID}`), 'no «failed — will retry on next restart» toast for it: it waits for the read');
  fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [{ ...ITEM('v1', 'Two files…'), sessionKey: 'vault', itemKey: MIG.JOB_SECRETS_ITEM }] }));
  await quiet(() => m.readAgain());
  const it = m.get('v1');
  ok(!!(ledger().applied || {})[ID] && it && it.status === 'done', 'at the READ the waiting row runs: recorded applied, and the item it settles is the FILE\'s (closed)', { applied: (ledger().applied || {})[ID], it: it && it.status });
  m.stop();
}
{
  // a clear while held: For-you items and a job's (whose cascade clears the job's For-you items) — refused by name, nothing cleared
  const d = dataDir(); fs.mkdirSync(path.join(d, 'user-todos.json'));
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  let jobsCleared = 0;
  const RCS = require(path.join(ROOT, 'src/server/record-clear.js')).create({ userTodos: m, getJobs: () => ({ ready: true, clearJobs: (ids) => { jobsCleared += ids.length; return { cleared: ids, already: [], unknown: [], refused: [] }; } }), log: () => { } });
  const owner = { role: 'owner' };
  const a = await RCS.clear({ kind: 'todo', id: 'a' }, { caller: owner });
  const b = await RCS.clear({ kind: 'job', id: 'j1' }, { caller: owner });
  ok(a.ok === false && a.code === 'todos_unread' && a.status === 503 && /For you cannot read its saved list right now — nothing was cleared/.test(a.why), 'Clear content… on a For-you item while held: refused BY NAME (todos_unread, 503)', a);
  ok(b.ok === false && b.code === 'todos_unread' && jobsCleared === 0, 'a JOB\'s clear while held: refused before the job is cleared (its For-you items would come back with its name)', { b, jobsCleared });
  m.stop();
}
{
  // the boot passes that judge «from before the restart» by the list: each waits for the read (its first line), with its control
  const PASSES = [
    ['src/exit-proxy.js', "    if (this.userTodos.isHeldUnread?.()) { this.userTodos.whenRead(() => { const n = this.reconcileAsks();"],
    ['src/server/hub-act-ask.js', "    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const n = reconcile(); if (n) log(`${n} hub-act ask(s) from before the restart resolved expired (at For you's read)`); }, 'the hub-act asks reconcile'); return 0; }"],
    ['src/server/ledger-shape-notice.js', "    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const n = reconcile(); if (n) log(`${n} growth-alarm notice(s) from before the restart closed (at For you's read)`); }, 'the growth-alarm notices reconcile'); return 0; }"],
    ['src/server/automation-engine.js', "    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const n = reconcile(); if (n) log(`${n} first-use card(s) from before the restart resolved expired (at For you's read)`); }, 'the first-use cards reconcile'); return 0; }"],
    ['src/server/vault-run-door.js', "    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const n = reconcile(); if (n) log(`${n} run card(s) from before the restart resolved expired (at For you's read)`); }, 'the vault run cards reconcile'); return 0; }"],
    ['src/server/vault-run-door.js', "    if (typeof userTodos.whenRead === 'function') userTodos.whenRead(endGrants, 'a restart ends every grant'); else endGrants();"],
    ['src/server/vault-hooks.js', "    if (typeof userTodos.whenRead === 'function') userTodos.whenRead(() => boot(late), \"the vault's For-you item\"); else boot(false);"],
    ['src/server/channels-engine.js', "    if (userTodos && typeof userTodos.whenRead === 'function') userTodos.whenRead(askReconcile, \"the channels' boot asks reconcile\"); else askReconcile();"],
    ['src/server/channels-access.js', "    if (userTodos && typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) return [];"],
    ['src/server/channels-outbound.js', "    if (waitRead(key, () => pointerSync(key))) return;"],
    ['src/server/channels-outbound.js', "    if (waitRead(`~compose:${adapterId}`, () => composePointerSync(adapterId))) return;"],
    ['src/server/jobs-wiring.js', "if (e && e.code === 'todos-unread' && typeof userTodos.whenRead === 'function') { userTodos.whenRead(() => { try { userTodos.resolveByJob(jobId, opts); }"],
    ['src/server/jobs-wiring.js', "      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const owes = (jm.wakeOwed(cid) || []).some((n) => n && n.held && n.held.kind !== 'rate-floor'); if (owes && noticeWakeWaiting({ cid, since })) jm.noteWakeSaid(cid); }, 'the «notices wait» item'); return null; }"],
    ['src/server/jobs-wiring.js', "      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { if (!(jm.wakeOwed(cid) || []).length) resolveWakeWaiting(cid); }, 'the «notices wait» item\\'s close'); return 0; }"],
    ['src/server/migrations.js', "      try { ut?.whenRead?.(() => { runLocalMigrations({ only: waiting }); }, 'the data migrations that waited for For you'); } catch { }"],
    ['src/server/migrations.js', "catch (e) { if (e && e.code === 'todos-unread') throw e; console.warn("],
    ['src/server/channels-auth.js', "  if (userTodos && typeof userTodos.whenRead === 'function') userTodos.whenRead(endLastRun, \"the last run's «finish connecting» items\"); else endLastRun();"],
    ['src/server/browser-keeper.js', "    if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => reclaimFolderNotices(), 'the folder-lost notices reclaim'); return; }"],
    ['src/server/browser-keeper.js', "    if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) { userTodos.whenRead(() => { if (heldReg) fileHeldNotice(); }, \"the held profile registry's notice\"); return; }   // still held at that read, else nothing to say"],
    ['src/watch-door.js', "    if (typeof todos.isHeldUnread === 'function' && todos.isHeldUnread() && typeof todos.whenRead === 'function') todos.whenRead(close, \"the file watches' notice\"); else close();"],
    ['src/migration-runner.js', "  if (store && typeof store.isHeldUnread === 'function' && store.isHeldUnread()) { try { store.whenRead(() => sayRan(todos, id), `migration ${id}'s failed notice`); } catch { } return; }"],
    ['src/server/job-secrets-door.js', "      if (live && typeof live.isHeldUnread === 'function' && live.isHeldUnread()) { live.whenRead(() => settle(by), 'the job-secrets notice'); return 0; }"],
    ['src/auth.js', "    if (this._heldInbox(store)) return this._owedAtRead(store, { [cause]: 'file' });"],   // B-dc3f (3): the sign-in record's notice filed at the read
    ['src/auth.js', "    if (this._heldInbox(store)) return this._owedAtRead(store, Object.fromEntries(causes.map((c) => [c, 'close'])));"],   // …and its close owed to the read, never dropped
    ['src/server/job-secrets-door.js', "      if (typeof live.isHeldUnread === 'function' && live.isHeldUnread()) { live.whenRead(() => sayLeft(entries, { settle: settleIt, aside, fresh, unsure, since }), 'the job-secrets leftover notice'); return; }"],
    ['src/server/vault-paste-door.js', "    if (userTodos.isHeldUnread?.()) return;"],
    ['src/server/vault-paste-door.js', "    if (userTodos.isHeldUnread?.()) return { ok: false, code: 'todos-unread', words: userTodos.unreadRefusal('a paste request') };"],
    ['src/server/vault-paste-door.js', "    if (userTodos && userTodos.isHeldUnread?.()) return { ok: false, code: 'todos-unread', words: userTodos.unreadRefusal('a words proposal') };"],
    ['src/server/mounts-plugins-wiring.js', "    asksOf: (key) => { if (userTodos.isHeldUnread?.()) throw Object.assign(new Error(userTodos.unreadRefusal('archiving a conversation (its open asks are unread)')), { code: 'todos-unread' });"],
    ['src/server/conversation-ops.js', "catch (e) { if (e && e.code === 'todos-unread') return { ok: false, code: 'todos-unread', why: e.message, noticeName: label }; throw e; }"],
    ['src/server/login-expiry-watch.js', "    if (userTodos && userTodos.isHeldUnread?.()) return { n: 0, remaining: recs };"],
    ['src/server/device-upgrade-watch.js', "    if (userTodos && userTodos.isHeldUnread?.()) return false;"],
    ['src/server/dial-health-watch.js', "    else if (rec && DH.clearDue(rec.clearSince, t) && !(userTodos && userTodos.isHeldUnread?.())) {"],
    ['src/server/unexpected-exit.js', "    if (deps.userTodos && deps.userTodos.isHeldUnread?.()) break;"],
    ['src/server/usage-pool-engine.js', "  if (!_resetCreditAsksSeeded && todos && typeof todos.snapshot === 'function' && !(typeof todos.isHeldUnread === 'function' && todos.isHeldUnread())) {"],
    // the third read's MUST + shoulds: the watch door's look for its earlier notice, the queued file's two waits, the refusals by name
    ['src/watch-door.js', "  if (typeof t.isHeldUnread === 'function' && t.isHeldUnread() && typeof t.whenRead === 'function') {"],
    ['src/watch-door.js', "  if (state.adoptAtRead) { state.filesDue = true; return; }"],
    ['src/server/queued-file-for-you.js', "    if (heldFy(t)) { if (!saidAtRead) { saidAtRead = true; t.whenRead(() => { saidAtRead = false; said(); }, \"the unread queued-messages file's item\"); } return null; }"],
    ['src/server/queued-file-for-you.js', "    if (heldFy(t)) { if (!settledAtRead) { settledAtRead = true; t.whenRead(() => { settledAtRead = false; const st = stateNow(); if (!st || !st.unread) settled(how); }, \"the queued-messages file's item\"); } return 0; }"],
    ['src/server/conversation-ops.js', "catch (e) { if (e && e.code === 'todos-unread') return { ok: false, code: 'todos-unread', why: e.message }; throw e; }"],
    ['src/agent-routes.js', "  if (r && r.code === 'todos-unread') return { status: 503, body: { error: r.why, code: 'todos-unread' } };"],
    ['src/routes/automation.js', "except_unnamed: 409, 'todos-unread': 503 });"],
    ['src/server/helper-asks.js', "!syncAtRead.has(session)) { syncAtRead.add(session); ut.whenRead(() => { syncAtRead.delete(session); sync(session); }, \"a helper's ask\"); }"],
    ['src/server/migrations.js', "    const waiting = canWait ? results.filter((r) => r.status === 'failed' && r.code === 'todos-unread').map((r) => r.id) : [];"],
    // 主开发 03:57Z (round wf_9022f713-55b): the money law's filing debt, the pool's read-back and lapse close, the ledger notice's close
    ['src/server/oat-identity.js', "    if (slot && heldNow()) { oweAtRead(); return OWED; }"],
    ['src/server/usage-pool-engine.js', "  if (typeof todos.isHeldUnread === 'function' && todos.isHeldUnread()) return { known: false, it: null };"],
    ['src/server/usage-pool-engine.js', "    if (s.todoId && todos && typeof todos.isHeldUnread === 'function' && todos.isHeldUnread() && typeof todos.whenRead === 'function') todos.whenRead(close, \"a pool member's «no longer active» notice\"); else close();"],
    ['src/server/spend-guard.js', "      if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(closeLedger, \"the spend ledger's unreadable notice\"); else closeLedger();"],
    ['src/server/usage-pool-engine.js', "    if (!_poolEndAtRead.has(poolId)) { _poolEndAtRead.add(poolId); todos.whenRead(() => { _poolEndAtRead.delete(poolId); poolBlockedTodoEnd(poolId, now); }, \"a blocked pool's recovery\"); }"],
    ['src/server/usage-pool-engine.js', "  if (typeof t.isHeldUnread === 'function' && t.isHeldUnread()) { if (!_crossAtRead && typeof t.whenRead === 'function') { _crossAtRead = true; t.whenRead(() => { _crossAtRead = false; reconcileCrossAsks(); }, 'the cross-provider asks reconcile'); } return; }"],
    // 主开发 05:00Z (round wf_e05ff50c-68a): the vault lock's owed withdraw, a press on the held store named by its door, a spend refusal's
    // owed notice, the channels' own presses never read as cut short by a late reconcile
    ['src/server/vault-paste-door.js', "    if (userTodos && userTodos.isHeldUnread?.() && typeof userTodos.whenRead === 'function') { if (!lockAtRead) { lockAtRead = true; userTodos.whenRead(() => { lockAtRead = false; withdrawAll(); }, \"the vault lock's withdraw of the paste requests\"); } return; }"],
    ['src/server/vault-paste-door.js', "    if (!q && userTodos && userTodos.isHeldUnread?.()) return { ok: false, code: 'todos-unread', words: userTodos.unreadRefusal('answering a paste request') };"],
    ['src/server/vault-paste-door.js', "    if (!w && userTodos && userTodos.isHeldUnread?.()) return { ok: false, code: 'todos-unread', words: userTodos.unreadRefusal('answering a words proposal') };"],
    ['src/server/spend-guard.js', "      if (!owedInboxAtRead) { owedInboxAtRead = true; userTodos.whenRead(fileOwedInbox, \"a spend refusal's notice\"); }"],
    ['src/server/spend-guard.js', "v.why === 'ledger-unreadable' ? LEDGER_ITEM : v.why === 'ledger-held-elsewhere' || v.why === 'ledger-lock-unwritable' || v.why === 'ledger-lock-unreadable' ? HELD_ITEM : v.why === 'settings-unread' ? SETTINGS_ITEM : v.why === 'reading-unread' ? READING_ITEM + (key || '?') : null, { sig: inboxSig, at: now });"],   // r3136: + the reading's notice (ONE an account)   // B-ef83 r1648: the lock-unwritable refusal files the held item too
    ['src/server/spend-guard.js', "      if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(closeSettingsItem, \"the held settings' spending notice\"); else closeSettingsItem();"],
    ['src/server/spend-guard.js', "      if (o.waitKey && waitItemOpen(o.waitKey)) {"],
    ['src/server/spend-guard.js', "    if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(close, \"the spend ledger's unlocked notice\"); else close();"],   // B-ef83 r1648 (d)
    ['src/server/spend-guard.js', "    if (!ut || (typeof ut.isHeldUnread === 'function' && ut.isHeldUnread())) return false;"],   // B-ef83 r1801 (4): the owed close skips a held store (the beat asks again)
    ['src/server/spend-guard.js', "    const waitItemStands = !!(wait && wait.key) && waitItemOpen(wait.key);"],
    ['src/server/channels-access.js', "  async function decideHeldMarked(req0, approve, by, opts = {}) { pressing.add(req0.id); try { return await decideHeld(req0, approve, by, opts); } finally { pressing.delete(req0.id); } }"],
    ['src/server/channels-access.js', "(r.status === 'approved' || r.status === 'denied') && !pressing.has(r.id)).map((r) => r.id));"],
  ];
  const missing = PASSES.filter(([f, line]) => read(f).split(line).length !== 2).map(([f, line]) => `${f} «${line.slice(0, 70)}»`);
  ok(!missing.length, `the ${PASSES.length} boot passes / settles / absence judgments that read the list each wait for the read or refuse by name (their line stands once)`, missing);
  // the reconcile passes on a 3 s boot timer, every one: a NEW one that judges the snapshot without the wait is red here
  const timed = [...serverFiles()].flatMap(([f, t]) => [...t.matchAll(/\b(?:function reconcile\(\)|reconcileAsks\(\)) \{\n\s*if \(!(?:this\.)?userTodos\) return 0;\n(.*)/g)].map((m) => [f, m[1]]));
  const unwaited = timed.filter(([, next]) => !/isHeldUnread\?\.\(\)\) \{ (?:this\.)?userTodos\.whenRead\(/.test(next)).map(([f]) => f);
  ok(timed.length === 5 && !unwaited.length, `every boot «reconcile» over the For-you list (${timed.length}: ${timed.map(([f]) => path.basename(f)).join(', ')}) waits for the read on its first line`, { timed: timed.map(([f]) => f), unwaited });
  const cutHub = anchored(read('src/server/hub-act-ask.js'), PASSES[1][1] + '   // B-44f3: For you held unread — its list is empty because it is unread: the pass judges the FILE, at the read\n', '', 'the hub-act wait');
  const timedX = [...new Map([...serverFiles(), ['src/server/hub-act-ask.js', cutHub]])].flatMap(([f, t]) => [...t.matchAll(/\b(?:function reconcile\(\)|reconcileAsks\(\)) \{\n\s*if \(!(?:this\.)?userTodos\) return 0;\n(.*)/g)].map((m) => [f, m[1]]));
  ok(timedX.some(([f, next]) => f === 'src/server/hub-act-ask.js' && !/isHeldUnread/.test(next)), 'CONTROL (the hub-act wait cut): that reconcile judges the held (empty) list at once — RED above');
}
{
  // DRIVEN: a boot reconcile while held closes NOTHING and runs at the read over the file's items (automation-engine's)
  const d = dataDir(), f = path.join(d, 'user-todos.json');
  fs.mkdirSync(f);
  const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
  const AE = require(path.join(ROOT, 'src/server/automation-engine.js'));
  const ad = dataDir();
  let eng = null; try { eng = AE.create({ dataDir: ad, vault: { facts: () => ({}), onLock: () => { }, onUnlock: () => { } }, userTodos: m, log: () => { } }); } catch (e) { eng = null; console.log('  · automation engine not built here:', e.message); }
  if (eng && typeof eng.reconcile === 'function') {
    const n0 = eng.reconcile();
    const T = m.snapshot().held ? 'held' : 'read';
    fs.rmdirSync(f);
    const ACT = (() => { const s = read('src/server/automation-engine.js'); const mm = s.match(/const ACTION_TYPE = '([^']+)'/); return mm ? mm[1] : null; })();
    fs.writeFileSync(f, JSON.stringify({ items: [{ ...ITEM('c1', 'Allow the key?'), action: { type: ACT, askId: 'gone-ask' } }] }));
    await quiet(() => m.readAgain());
    const it = m.get('c1');
    ok(n0 === 0 && T === 'held' && ACT && it && it.status === 'done' && it.resolvedBy === 'ask-expired', 'DRIVEN (automation-engine): the boot reconcile while held closes nothing; at the READ it closes the FILE\'s first-use card whose ask died with the restart', { n0, T, ACT, it: it && [it.status, it.resolvedBy] });
  } else ok(false, 'the automation engine builds in-process for the driven reconcile');
  m.stop();
}

{
  // DRIVEN (queued-file-for-you — the third read's should): its create() runs in the hub's wiring; For you HELD there throws
  // nothing out of the boot, the unread file's item is filed ONCE at the read, and an earlier run's item is closed at the read
  // when the file reads (a held list is empty because it is unread — never judged «nothing open» there)
  const QSRC = read('src/server/queued-file-for-you.js');
  const scene = async (Q, unreadAtBoot) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json');
    fs.mkdirSync(f);
    const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    const st = { unread: unreadAtBoot, file: 'msg-queued.json' };
    let threw = null, api = null;
    try { api = Q.create({ getUserTodos: () => m, deliver: { queuedFileState: () => st, onQueuedFileState: () => { } }, log: () => { } }); } catch (e) { threw = (e && (e.code || e.message)) || 'threw'; }
    if (api && unreadAtBoot) { api.said(); api.said(); }   // more turns while held: still ONE waiter (the store would merge the item anyway)
    const waits = m._readWaiters.length;
    fs.rmdirSync(f);
    fs.writeFileSync(f, JSON.stringify({ items: unreadAtBoot ? [] : [{ ...ITEM('q1', 'could not read'), sessionKey: Q.ITEM_KEY, action: { type: Q.TYPE } }] }));
    await quiet(() => m.readAgain());
    const open = (m.forSession([Q.ITEM_KEY]) || []).filter((i) => i && i.status === 'open').map((i) => i.id);
    m.stop();
    return { threw, open, waits };
  };
  const Q = require(path.join(ROOT, 'src/server/queued-file-for-you.js'));
  const a = await scene(Q, true), b = await scene(Q, false);
  ok(a.threw === null && a.open.length === 1 && a.waits === 1 && b.threw === null && b.open.length === 0 && b.waits === 1, 'DRIVEN (queued-file-for-you): For you held at its wiring — nothing thrown out of the boot; ONE waiter however many turns; the unread file\'s item filed at the read; an earlier run\'s item closed at the read when the file reads', { a, b });
  const Q1 = MJ.load('src/server/queued-file-for-you.js', anchored(QSRC, "if (!saidAtRead) { saidAtRead = true; t.whenRead(() => { saidAtRead = false; said(); }, \"the unread queued-messages file's item\"); }", "t.whenRead(() => { said(); }, \"the unread queued-messages file's item\");", 'the one-waiter flag'), 'queued-many-waiters');
  const a1 = await scene(Q1, true);
  ok(a1.waits === 3, 'CONTROL (the one-waiter flag cut): each turn while held adds a waiter', a1);
  const Qx = MJ.load('src/server/queued-file-for-you.js', anchored(QSRC, "  const heldFy = (t) => !!(t && typeof t.isHeldUnread === 'function' && t.isHeldUnread() && typeof t.whenRead === 'function');\n", '  const heldFy = () => false;\n', 'the queued-file wait'), 'queued-no-wait');
  const ax = await scene(Qx, true), bx = await scene(Qx, false);
  ok(ax.open.length === 0 && bx.open.length === 1, 'CONTROL (the queued-file wait cut): the unread file\'s item is never filed after the read, and the earlier run\'s item stays open', { ax, bx });
}

{
  // DRIVEN (oat-identity — 主开发 03:57Z, THE MONEY LAW): a verdict about money never waits on For you. A HELD For-you store and
  // K readings of a long-lived token that answer with ANOTHER account's window still MARK the member at once — the pool places
  // nothing new on it; only the notice's FILING is owed to the read (filed once then, its id saved on the mark)
  const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
  waitEverySave(AccountManager);
  const OSRC = read('src/server/oat-identity.js');
  const K = 3, nowS = Math.floor(Date.now() / 1000), OWN = nowS + 3 * 86400 + 2 * 3600, THIRD = OWN + 4 * 86400 + 11 * 3600;
  const win = (sevenDay) => ({ sevenDay, fiveHour: null, scoped: {} });
  const tok = () => ['sk', '-ant-oat01-'].join('') + 'Q9fakeIDheld_' + 'a1B2c3D4e5F6g7H8'.repeat(3) + '-zz';   // built at runtime (secret-scan)
  const OWED = 'owed-at-read';
  // mode: 'mark' (K foreign readings while held, then the read) · 'restart' (marked while held, then a NEW store + orchestrator over the
  // same folders — the hub restarted — and the read) · 'replaced' (marked while held, a new token saved before the read: nothing owed
  // any more) · 'hint' (a row with no window of its own reads another row's: the ASK is owed, filed at the read)
  const scene = async (OI, mode = 'mark') => {
    const d = dataDir(), td = path.join(d, 'todos'), f = path.join(td, 'user-todos.json'), dd = path.join(d, 'data');
    fs.mkdirSync(f, { recursive: true });
    let adds = 0;   // every add of the check's bucket (主开发 05:00Z, 4: a DOUBLE filing is seen — the store merges same words into one item)
    const counted = (t) => { const a0 = t.add.bind(t); t.add = (k, it) => { if (k === OI.INBOX_KEY) adds++; return a0(k, it); }; return t; };
    let m = counted(quiet(() => new UT.UserTodoManager({ dataDir: td, expirySweepMs: 0, unreadRetry: RETRY })));
    let am = quiet(() => new AccountManager({ dataDir: dd }));
    const x = am.createSubscription({ name: 'X' }).id, y = am.createSubscription({ name: 'Y' }).id;
    quiet(() => am.setOat(x, tok()));
    const wire = (a) => { a._readAuthFor = (be, id) => ({ loggedIn: true, oatFile: id === x }); a.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' }); };   // the member's folder holds OUR token file
    wire(am);
    const w = mode === 'hint' ? { [y]: { ...win(OWN), at: 1, source: 'on-demand' } } : { [x]: { ...win(THIRD), at: 1, source: 'on-demand' }, [y]: { ...win(OWN), at: 1, source: 'on-demand' } };
    const mk = (a, t) => OI.create({ accounts: a, todos: () => t, windows: () => w, k: K, log: () => { }, journal: () => { } });
    let o = mk(am, m); o.attach();
    const seen = [];
    for (let i = 0; i < (mode === 'hint' ? 1 : K); i++) { try { seen.push(quiet(() => o.onReading(x, { window: win(OWN), at: Date.now(), viaToken: true, gen: am.oatCheckOf(x)?.gen, eligible: { ok: true, why: 'slot-verified' } })).verdict); } catch (e) { seen.push('threw: ' + e.message); } }
    const c0 = am.oatCheckOf(x) || {};
    const held = { held: m.isHeldUnread(), state: c0.state || null, todoId: c0.todoId || null, ask: c0.ask ? { kind: c0.ask.kind, todoId: c0.ask.todoId || null } : null, placeable: am._placeable('claude', x) };
    if (mode === 'replaced') quiet(() => am.setOat(x, tok() + 'b'));   // the owner saved a new token meanwhile: the check is armed again
    if (mode === 'restart') {   // as the hub boots: the account routes attach BEFORE the For-you store exists (its getter answers nothing), the store is built in the same turn
      m.stop(); let tRef = null; am = quiet(() => new AccountManager({ dataDir: dd })); wire(am);
      o = OI.create({ accounts: am, todos: () => tRef, windows: () => w, k: K, log: () => { }, journal: () => { } }); o.attach();
      m = tRef = counted(quiet(() => new UT.UserTodoManager({ dataDir: td, expirySweepMs: 0, unreadRetry: RETRY })));
      await new Promise((res) => setImmediate(res));   // the boot's next turn: the look finds the store now
    }
    fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [] }));
    await quiet(() => m.readAgain());
    if (mode === 'mark' || mode === 'replaced') { try { quiet(() => o.onReading(x, { window: win(OWN), at: Date.now(), viaToken: true, gen: am.oatCheckOf(x)?.gen, eligible: { ok: true, why: 'slot-verified' } })); } catch { } }   // a reading AFTER the read: nothing filed again
    const open = (m.forSession([OI.INBOX_KEY]) || []).filter((i) => i && i.status === 'open');
    const c1 = am.oatCheckOf(x) || {};
    const out = { mode, seen, held, adds, open: open.length, state: c1.state || null, todoId: c1.todoId || null, askId: c1.ask ? c1.ask.todoId || null : null, filedId: open[0] ? open[0].id : null };
    m.stop();
    return out;
  };
  const OI = require(path.join(ROOT, 'src/server/oat-identity.js'));
  const r = await scene(OI);
  ok(r.held.held && r.held.state === 'mismatch' && r.held.placeable === false && r.held.todoId === OWED && r.seen[K - 1] === 'mismatch' && r.open === 1 && r.adds === 1 && r.todoId && r.todoId === r.filedId,
    `DRIVEN (oat-identity, THE MONEY LAW): For you HELD — ${K} readings of a token that answers with another account's window MARK the member at once (the pool places nothing new on it; the item's id saved OWED); its notice is filed ONCE at the read, its id saved on the mark`, r);
  const Ox = MJ.load('src/server/oat-identity.js', anchored(OSRC, "    if (check.state !== 'pending') return { verdict: 'idle' };\n", "    if (check.state !== 'pending') return { verdict: 'idle' };\n    { const t0 = T(); if (t0 && typeof t0.isHeldUnread === 'function' && t0.isHeldUnread()) return { verdict: 'idle', held: true }; }\n", 'the held early return'), 'oat-held-return');
  const rx = await scene(Ox);
  ok(rx.held.state !== 'mismatch' && rx.held.placeable === true, 'CONTROL (the early return put back — the verdict waits on For you): nothing is marked while it is held and the pool keeps placing on a token of another account', rx);
  const rs = await scene(OI, 'restart'), rr = await scene(OI, 'replaced'), rh = await scene(OI, 'hint');
  ok(rs.held.todoId === OWED && rs.state === 'mismatch' && rs.open === 1 && rs.adds === 1 && rs.todoId === rs.filedId,
    'DRIVEN (oat-identity): the hub RESTARTS while the mark\'s item is owed — the debt is on the saved check (OWED), and the new orchestrator\'s look at the read files it (its id saved)', rs);
  ok(rr.held.todoId === OWED && rr.state === 'pending' && rr.open === 0 && !rr.todoId,
    'DRIVEN (oat-identity): a new token saved before the read REPLACED the owed mark — nothing is filed at the read (never a «belongs to another account» notice on a row the owner just fixed)', rr);
  ok(rh.seen[0] === 'hint' && rh.held.ask && rh.held.ask.kind === 'hint' && rh.held.ask.todoId === OWED && rh.open === 1 && rh.askId === rh.filedId,
    'DRIVEN (oat-identity): an ASK while held (a hint) is saved OWED and filed at the read — its id on the ask (never an ask with no item that blocks every later one)', rh);
  const Ow = MJ.load('src/server/oat-identity.js', anchored(OSRC, "    if (slot && heldNow()) { oweAtRead(); return OWED; }", "    if (slot && heldNow()) { oweAtRead(); return null; }", 'the owed mark not saved'), 'oat-owed-unsaved');
  const Ob = MJ.load('src/server/oat-identity.js', anchored(OSRC, "    if (!bootLooked) { const t = setImmediate(look); if (t && t.unref) t.unref(); }\n", '', 'the boot look not tried again'), 'oat-boot-look');
  const rbx = await scene(Ob, 'restart');
  ok(rbx.open === 0, 'CONTROL (the boot\'s look not tried again on the next turn): the hub attaches before it builds the For-you store, so a mark owed before the restart is never said (no reading comes)', rbx);
  const Od = MJ.load('src/server/oat-identity.js', anchored(anchored(OSRC, '    if (owedPass) return true;\n', '', 'one owed pass at a time'), "        if (c.state === 'mismatch' && c.todoId === OWED) {", "        if (c.state === 'mismatch') {", 'only what is owed'), 'oat-double-filing');
  const rd = await scene(Od);
  ok(rd.adds >= 2, 'CONTROL (the owed pass\'s guards cut — one pass at a time, only what is still owed): the mark\'s notice is FILED TWICE (the count of adds sees it; the store merges the words into one item)', rd);
  const rsx = await scene(Ow, 'restart'), rhx = await scene(Ow, 'hint');
  ok(rsx.open === 0 && rhx.open === 0, 'CONTROL (the debt not saved on the check — OWED dropped): after a restart the mark is never said, and the held ask is never filed', { rsx, rhx });
  const Og = MJ.load('src/server/oat-identity.js', anchored(OSRC, "        if (c.state === 'mismatch' && c.todoId === OWED) {", "        if (c.state === 'mismatch' || c.state === 'pending') {", 'the owed guard cut'), 'oat-owed-guard');
  const rrx = await scene(Og, 'replaced');
  ok(rrx.open === 1, 'CONTROL (the owed guard cut): the replaced check gets a «belongs to another account» notice at the read', rrx);
}

{
  // DRIVEN (browser-dialogs — the first read's MUST, its leg asked 主开发 05:00Z, 4): the two sweeps of a PAST hub life's items wait
  // for For you's read when it is held unread — run at the read, never at the create (a sweep over the held, empty list closes
  // nothing and never runs again)
  const BSRC = read('src/server/browser-dialogs.js');
  const run = (BDm) => {
    let held = true; const waiters = [], calls = [];
    const forYou = { add: () => null, resolve() { }, isHeldUnread: () => held, whenRead: (fn) => { if (!held) { fn(); return true; } waiters.push(fn); return false; },
      sweep: (pre) => { calls.push(`sweep:${held ? 'held' : 'read'}`); return 0; }, sweepAs: () => { calls.push(`sweepAs:${held ? 'held' : 'read'}`); return 0; } };
    quiet(() => BDm.create({ keeper: { profile: () => null, cdpEndpointFor: async () => ({ ok: false }), onLease: () => () => { } }, log: { log() { }, warn() { } }, now: () => 1, forYou }));
    const atCreate = calls.length;
    held = false; for (const fn of waiters.splice(0)) fn();
    return { atCreate, calls };
  };
  const b = run(require(path.join(ROOT, 'src/server/browser-dialogs.js')));
  ok(b.atCreate === 0 && b.calls.length === 2 && b.calls.every((c) => c.endsWith(':read')), 'DRIVEN (browser-dialogs): For you held at the create — the past hub life\'s two sweeps (pk-left, the sign-in asks) run at the READ, none at the create', b);
  const Bx = MJ.load('src/server/browser-dialogs.js', anchored(BSRC, "  if (forYou && typeof forYou.isHeldUnread === 'function' && forYou.isHeldUnread() && typeof forYou.whenRead === 'function') forYou.whenRead(sweepPastLife, \"a past hub life's browser items\"); else sweepPastLife();", '  sweepPastLife();', 'the past-life sweep not deferred'), 'dialogs-sweep-now');
  const bx = run(Bx);
  ok(bx.atCreate === 2 && bx.calls.every((c) => c.endsWith(':held')), 'CONTROL (the past-life sweep not deferred): both sweeps run over the HELD (empty) list at the create — and never again', bx);
}
{
  // DRIVEN (vault-hooks — 主开发 05:00Z, 4): the vault's For-you item is judged at the READ by the lock state of then — the vault
  // unlocked while For you was held ⇒ the file's «locked» item is CLOSED at the read (never «locked» over an open vault)
  const VSRC = read('src/server/vault-hooks.js');
  const scene = async (VHm) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json');
    fs.mkdirSync(f);
    const m = quiet(() => new UT.UserTodoManager({ dataDir: d, expirySweepMs: 0, unreadRetry: RETRY }));
    let state = 'locked';
    const vault = { onOpen() { }, onLock() { }, onUnlock() { }, onBlocked() { }, onFailing() { }, facts: () => ({ state }), blockedSummary: () => null };
    quiet(() => VHm.wireVaultHooks({ vault, userTodos: m, log: { log() { }, warn() { } } }));
    state = 'unlocked';   // the person unlocked while For you was held
    fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [{ ...ITEM('v1', VHm.VAULT_ITEM_TEXT), sessionKey: VHm.VAULT_INBOX_KEY, origin: 'vault', kind: 'action', action: { type: 'vault-unlock' } }] }));
    await quiet(() => m.readAgain());
    const it = m.get('v1');
    m.stop();
    return { status: it ? it.status : null };
  };
  const v = await scene(require(path.join(ROOT, 'src/server/vault-hooks.js')));
  ok(v.status === 'done', 'DRIVEN (vault-hooks): the vault unlocked while For you was held — the file\'s «The vault is locked» item is closed at the read', v);
  const Vx = MJ.load('src/server/vault-hooks.js', anchored(VSRC, '      else if (late) {', '      else if (false) {', 'the late close cut'), 'vault-late-close');
  const vx = await scene(Vx);
  ok(vx.status === 'open', 'CONTROL (the late close cut): the «locked» item stays open over an open vault after the read', vx);
}

{
  // DRIVEN (spend-guard — 主开发 05:00Z, 2): a turn refused while For you is held STAYS refused (the gate decides, nothing waits on For
  // you); its NOTICE is owed — filed ONCE at the read, its cadence stamped with the refusal's own instant (a refusal after the read
  // files no second one)
  const GSRC = read('src/server/spend-guard.js');
  const scene = async (SGm, ago = 0) => {   // ago: the held refusals' clock that far back (their notice's expiry passed before the read)
    const d = dataDir(), td = path.join(d, 'todos'), f = path.join(td, 'user-todos.json'), gd = path.join(d, 'data');
    fs.mkdirSync(f, { recursive: true }); fs.mkdirSync(gd, { recursive: true });
    const m = quiet(() => new UT.UserTodoManager({ dataDir: td, expirySweepMs: 0, unreadRetry: RETRY }));
    let tried = 0; const a0 = m.add.bind(m); m.add = (k, it) => { if (it && it.origin === 'spend') tried++; return a0(k, it); };
    const g = quiet(() => SGm.create({ dataDir: gd, serverSetting: (k) => (k === 'spend.unattendedPerIdentityHour' ? 0 : undefined), getUserTodos: () => m, log: () => { } }));
    const id = { key: 'sub-held', name: 'Held account' };
    const ask = (back = 0) => { try { const v = quiet(() => g.authorize({ reason: 'auto-resume', identity: id, hold: false, now: Date.now() - back })); return v && v.ok === false ? v.why : 'allowed'; } catch (e) { return 'threw: ' + e.message; } };
    const held = [ask(ago), ask(ago)], triedHeld = tried;
    fs.rmdirSync(f); fs.writeFileSync(f, JSON.stringify({ items: [] }));
    await quiet(() => m.readAgain());
    const spendOpen = () => (m.snapshot().open || []).filter((i) => i && i.origin === 'spend').length;
    const filed = spendOpen();
    const after = ask(), afterOpen = spendOpen();
    m.stop();
    return { held, triedHeld, filed, after, afterOpen, tried };
  };
  const sg = await scene(require(path.join(ROOT, 'src/server/spend-guard.js')));
  ok(sg.held.every((w) => w === 'hour-cap') && sg.triedHeld === 0 && sg.filed === 1 && sg.after === 'hour-cap' && sg.afterOpen === 1 && sg.tried === 1,
    'DRIVEN (spend-guard): two turns refused while For you is held stay REFUSED; the refusal\'s notice is owed (no add tried while held) and filed ONCE at the read; a refusal after it files no second one', sg);
  const Gx = MJ.load('src/server/spend-guard.js', anchored(GSRC, ", { sig: inboxSig, at: now });", ");", 'the refusal notice not owed'), 'spend-notice-unowed');
  const gx = await scene(Gx);
  ok(gx.held.every((w) => w === 'hour-cap') && gx.filed === 0, 'CONTROL (the refusal\'s notice not owed): the person never reads why after the read — until another refusal comes', gx);
  const SG = require(path.join(ROOT, 'src/server/spend-guard.js'));
  const se = await scene(SG, 7 * 3600e3);
  ok(se.held.every((w) => w === 'hour-cap') && se.filed === 0, 'DRIVEN (spend-guard): an owed notice whose expiry passed while For you was held is NOT filed at the read (the store would keep it with no end — the window it named is over)', se);
  const Ge = MJ.load('src/server/spend-guard.js', anchored(GSRC, "      if (Number(o.args[3]) > 0 && Number(o.args[3]) <= t) continue;", '', 'the expiry skip cut'), 'spend-owed-expired');
  const ge = await scene(Ge, 7 * 3600e3);
  ok(ge.filed === 1, 'CONTROL (the expiry skip cut): a notice of a window that ended hours ago is filed at the read — and kept with no end', ge);
}

// ── ④ THE PAGE + THE ROUTES ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the page draws the hold where «Nothing needs you» would stand; every route answers todos-unread by name');
{
  const A = read('src/lib/user-todos-actions.js'), P = read('src/lib/user-todos-panel.js'), WIN = read('src/lib/inbox-window.js');
  const SENT = 'For you cannot read its saved list right now ({file}: {code}) — nothing can be filed or changed until it reads. It is read again soon.';
  const DMG = "For you's saved list is damaged and could not be set aside ({file}) — it is kept exactly as it is, and nothing can be filed or changed until it is fixed.";
  ok(A.includes('export function heldWords(todos) {') && A.includes(`t(${JSON.stringify(DMG)}, p)`) && A.includes(`t('${SENT}', p)`), 'ONE helper words the hold (user-todos-actions heldWords): the read failed / the bytes damaged');
  ok(P.includes("btn.title = (heldWords(todos) || actionWords(action, total))") && P.includes("label = t('Inbox') + (heldNow ? ', ' + heldNow :"), 'the TASKBAR CHIP and the Inbox tab say what the tray says while held (主开发 05:00Z, 3) — never «Nothing waiting on you»');
  ok(P.includes("const held = heldWords(todos);") && P.includes("held ? t('cannot be read') : openActions ?") && P.includes("emptyWords = held || idle;") && P.includes("idle = emptyEl.dataset.idle != null ? emptyEl.dataset.idle : (emptyEl.dataset.idle = emptyEl.textContent)"), 'the For-you popup: the head reads «cannot be read» (never «all clear») and the empty line is the hold\'s words (else the element\'s own idle words — the plain-words debt sentence keeps its one site)');
  ok(WIN.includes(': heldWords(todos) ? heldWords(todos)'), 'the For-you window: the empty line is the hold\'s words');
  for (const lang of ['zh', 'ja']) {
    const D = read(`src/lib/i18n-${lang}.js`);
    const has = (k) => D.includes(JSON.stringify(k).replace(/—/g, '\\u2014') + ':') || D.includes(JSON.stringify(k) + ':');
    ok(has(SENT) && has(DMG) && has('cannot be read'), `the hold's three sentences have their ${lang} rows`);
  }
  const S = read('server.js'), RR = read('src/routes/user-todos-reply.js'), AR = read('src/agent-routes/status.js');
  ok(S.includes("held = e && e.code === 'todos-unread'; res.status(held ? 503 : decision ? 409 : 400)"), 'the press route answers 503 by the code');
  ok(RR.includes("'todos-unread': 503") && RR.includes("if (userTodos.isHeldUnread?.()) return fail(res, 'todos-unread', userTodos.unreadRefusal('a reply'));") && RR.includes("return res.status(503).json({ error: userTodos.unreadRefusal('reading an item'), code: 'todos-unread' });")
    && RR.split("if (e && e.code === 'todos-unread') return fail(503, e.code, e.message);").length === 3, 'the reply, the one-item read, resolve-many and the notices doors answer 503 todos-unread');
  ok(AR.includes("if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) return res.status(503).json({ error: userTodos.unreadRefusal(add ? 'filing this ask'"), 'vibespace-ask answers 503 todos-unread for every verb while held');
}

// ── ⑤ B-0248 (lane bl-loop-b, 主开发 r3320): THE LIST's WRITE IS OFF THE LOOP ─────────────────────────────────────────────────────
// The list's whole-file rewrite held the loop for its rename's whole delay (the page bl-loop-b/b0248-page.md: 507 ms at 500 ms
// a rename over 300 items). It is the store writer's now. A person's act and an agent's acknowledged ask are on disk before
// their answer; a write that is not is answered by its code (todos-not-on-disk) and the page words it.
console.log('⑤ B-0248: the list\'s write is the store writer\'s (off the loop); a person\'s act and an agent\'s ask are on disk before their answer');
{
  const SRC5 = read('src/user-todos.js');
  const STALL = require(path.join(ROOT, 'scripts/fixtures/fs-stall.cjs'));
  const STALL_MS = 400, TICK_MS = 10;
  const lateMeter = () => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; };
  // (a) THE PLACED STALL: the real list, the real store writer's thread, a scratch dir; every synchronous write-family call of
  // THIS thread under the dir is held STALL_MS (scripts/fixtures/fs-stall.cjs: the writer's thread loads its own fs, never held)
  const stallScene = async (Mod, n = 4) => {   // n: the changes made under the stall (the red copy needs ONE to hold the loop — r3713: the suite's time)
    const d = dataDir();
    const m = quiet(() => new Mod.UserTodoManager({ dataDir: d, onChange() { }, expirySweepMs: 0 }));
    for (let i = 0; i < 50; i++) m.add('claude:s' + (i % 10), { text: 'ask ' + i, detail: 'x'.repeat(1500), urgency: 'normal', by: 'agent', origin: 'agent' });
    await m.whenWritten();
    const S = STALL.install({ under: d, ms: STALL_MS });
    const meter = lateMeter();
    let late = null, written = null;
    try {
      for (let i = 0; i < n; i++) { m.add('claude:t' + i, { text: 'late ' + i, urgency: 'normal', by: 'agent', origin: 'agent' }); await new Promise((r) => setTimeout(r, 150)); }
      written = await m.whenWritten();
    } finally { late = meter.stop(); S.restore(); }
    let last = false; try { last = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf8')).items.some((x) => x.text === 'late ' + (n - 1)); } catch { }
    try { quiet(() => m.stop()); } catch { }
    return { late, written, last, stalled: S.calls.filter((c) => c.kind === 'write' && c.stalled).length };
  };
  const A = await stallScene(UT);
  ok(A.late < STALL_MS && A.stalled === 0 && A.written === true && A.last, `⑤a THE PLACED STALL (${STALL_MS} ms in every main-thread write under the list's dir): four For-you changes, the loop's worst lateness ${A.late} ms < one stall, NO main-thread write stalled, every change on disk (the writer's thread)`, A);
  const Rel = MJ.load('src/user-todos.js', anchored(SRC5, '    this._dirty = true;\n    this._handToWriter();\n  }', "    this._dirty = true;\n    { const json = JSON.stringify(this._state, null, 2); fs.writeFileSync(this._file + '.tmp', json); fs.renameSync(this._file + '.tmp', this._file); this._lastWritten = json; this._dirty = false; }\n  }", 'the release\'s write on the loop'), 'b0248-release');
  const AX = await stallScene(Rel, 1);   // one change held by the release's write on the loop is the red
  ok(AX.late >= STALL_MS && AX.stalled > 0, `⑤a RED control (the release's write: temp + rename on the loop): the loop is held a stall's length or more (${AX.late} ms; ${AX.stalled} main-thread writes stalled) (red)`, AX);
  // (b) DURABLE BEFORE THE ANSWER: a writer that HOLDS its write until released — persisted() answers only once the bytes are on disk
  const holdingWriter = (landOk = true) => {
    const st = new Map(); let release; const gate = new Promise((r) => { release = r; });
    const land = (file, s) => { const b = s.produce ? s.produce() : null; if (landOk && b != null) fs.writeFileSync(file, b); s.dirty = false; try { s.onWritten && s.onWritten(landOk, landOk ? null : Object.assign(new Error('EIO: a placed failure'), { code: 'EIO' })); } catch { } return landOk; };
    return { release: () => release(), W: {
      dirty(file, o) { const s = st.get(file) || {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined) s[k] = v; s.dirty = true; st.set(file, s); },
      pending(file) { const s = st.get(file); return !!(s && s.dirty); },
      durable(file) { const s = st.get(file); if (!s || !s.dirty) return Promise.resolve(true); return gate.then(() => land(file, s)); },
      flushSync(files) { for (const f of files) { const s = st.get(f); if (s && s.dirty) land(f, s); } return { left: [] }; },
    } };
  };
  const durScene = async (Mod) => {
    const d = dataDir(), HW = holdingWriter();
    const m = quiet(() => new Mod.UserTodoManager({ dataDir: d, onChange() { }, expirySweepMs: 0, writer: HW.W }));
    const it = m.add('claude:s1', { text: 'an ask', urgency: 'normal', by: 'agent', origin: 'agent' });
    let answered = null; const p = m.persisted().then((ok1) => { answered = ok1; });
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    const early = answered; let earlyOnDisk = false; try { earlyOnDisk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf8')).items.some((x) => x.id === it.id); } catch { }
    HW.release(); await p;
    let onDisk = false; try { onDisk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf8')).items.some((x) => x.id === it.id); } catch { }
    try { quiet(() => m.stop()); } catch { }   // the stop lands what is owed: the list lets go of its process handle
    return { early, earlyOnDisk, answered, onDisk };
  };
  const B = await durScene(UT);
  ok(B.early === null && B.answered === true && B.onDisk, '⑤b DURABLE BEFORE THE ANSWER: persisted() does not answer while the writer holds the write, and answers true once the ask is ON DISK', B);
  const Rx = MJ.load('src/user-todos.js', anchored(SRC5, '    try { return Promise.resolve(this._W().durable(this._file, { timeoutMs: PERSIST_BOUND_MS, answer })).catch(() => false); }\n    catch { if (answer) { try { answer(false); } catch { } } return Promise.resolve(false); }\n', '    if (answer) answer(true); return Promise.resolve(true);\n', 'persisted answering at once'), 'b0248-persisted');
  const BX = await durScene(Rx);
  ok(BX.early === true && !BX.earlyOnDisk, '⑤b RED control (persisted answers at once): «on disk» is answered while the ask is in memory only (red)', BX);
  // (c) A FAILED WRITE IS SAID: a writer whose write fails — persisted() answers false; the routes answer by the code; a reply
  // already SENT answers ok with `written: false` (never a 503 a retry would send twice)
  {
    const d = dataDir(), HW = holdingWriter(false);
    const m = quiet(() => new UT.UserTodoManager({ dataDir: d, onChange() { }, expirySweepMs: 0, writer: HW.W, onWriteError() { } }));
    m.add('claude:s1', { text: 'an ask', urgency: 'normal', by: 'agent', origin: 'agent' });
    const p = m.persisted(); HW.release();
    const okc = await p;
    m._letGo();   // a write that failed for good here (the stand-in retries nothing): the process handle let go
    const RR = require(path.join(ROOT, 'src/routes/user-todos-reply.js'));
    const resOf = () => { const r = { code: 200, body: null, headersSent: false }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; r.headersSent = true; return r; }; return r; };
    const ans = RR.answerDurableOf({ persisted: () => Promise.resolve(false) });
    const r1 = resOf(); await ans(r1, { ok: true, changed: 2 });
    const r2 = resOf(); await ans(r2, { ok: true, msgId: 'm1' }, { sent: true });
    const r3 = resOf(); await RR.answerDurableOf({ persisted: () => Promise.resolve(true) })(r3, { ok: true });
    ok(okc === false && r1.code === 503 && r1.body.code === 'todos-not-on-disk' && r1.body.error === UT.NOT_ON_DISK && r2.code === 200 && r2.body.ok === true && r2.body.written === false && r2.body.code === 'todos-not-on-disk' && r3.code === 200 && r3.body.ok === true,
      '⑤c A FAILED WRITE IS SAID: persisted() answers false; a store act answers 503 todos-not-on-disk with the store\'s words; a SENT reply answers ok with written: false; a write on disk answers ok', { okc, r1: r1.code, r2: r2.body && r2.body.written });
    // r3658: its RED in a copy — the sent road answering plain ok (its write not said)
    const RRx = MJ.load('src/routes/user-todos-reply.js', anchored(read('src/routes/user-todos-reply.js'), "  return sent ? res.json({ ...body, written: false, code: 'todos-not-on-disk', warning: words }) :", '  return sent ? res.json(body) :', 'the sent road unsaid'), 'b0248-sent-unsaid');
    const r2x = resOf(); await RRx.answerDurableOf({ persisted: () => Promise.resolve(false) })(r2x, { ok: true, msgId: 'm1' }, { sent: true });
    ok(r2x.code === 200 && r2x.body && r2x.body.written === undefined, '⑤c RED control (a copy whose sent road answers plain ok): the reply says nothing of the write that did not land (red)', r2x.body);
    // r3658: ONE reply on the writer's synchronous road — given by persisted's `answer` (inside the exit's flush at a stop), never twice
    let calls = 0; const r4 = resOf(); r4.json = (b) => { calls++; r4.body = b; r4.headersSent = true; return r4; };
    await RR.answerDurableOf({ persisted: (answer) => { answer(true); return Promise.resolve(true); } })(r4, { ok: true });
    ok(calls === 1 && r4.body.ok === true && UT.PERSIST_BOUND_MS === 20000 && /durable\(this\._file, \{ timeoutMs: PERSIST_BOUND_MS, answer \}\)/.test(SRC5), '⑤c the reply is ONE, given on the writer\'s own answer road (persisted\'s callback), and persisted() is bounded at 20 s, under the CLI\'s 30 s write budget', { calls, bound: UT.PERSIST_BOUND_MS });
  }
  // (e) r3658's MUST: whenWritten() keeps the release's contract — settled only once ON DISK. A boot finds the last run's set-aside
  // intent (no live list, the kept copy beside it): it files the notice naming the copy and drops the intent only once the list
  // naming the bytes is on disk. A writer that fails ONCE (ENOSPC, the likely reason the file tore): the intent stays
  const failOnceWriter = () => {
    const st = new Map(); let fails = 1;
    const land = (file, s) => { const ok = fails-- <= 0; const b = s.produce ? s.produce() : null; if (ok && b != null) fs.writeFileSync(file, b); if (ok) s.dirty = false; try { s.onWritten && s.onWritten(ok, ok ? null : Object.assign(new Error('ENOSPC: a placed failure'), { code: 'ENOSPC' })); } catch { } return ok; };
    return { dirty(file, o) { const s = st.get(file) || {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined) s[k] = v; s.dirty = true; st.set(file, s); },
      pending(file) { const s = st.get(file); return !!(s && s.dirty); },
      durable(file) { const s = st.get(file); if (!s || !s.dirty) return Promise.resolve(true); return Promise.resolve().then(() => land(file, s)); },
      flushSync(files) { for (const f of files) { const s = st.get(f); if (s && s.dirty) land(f, s); } return { left: [] }; } };
  };
  const intentScene = async (Mod) => {
    const d = dataDir(), f = path.join(d, 'user-todos.json'), to = 'user-todos.json.corrupt-2026-11-24T00-00-00-000Z';
    fs.writeFileSync(path.join(d, to), '{"items":[{"id":"x","text":"a kept item');
    fs.writeFileSync(f + '.aside-intent', JSON.stringify({ why: 'corrupt JSON (placed)', to }));
    const m = quiet(() => new Mod.UserTodoManager({ dataDir: d, onChange() { }, expirySweepMs: 0, writer: failOnceWriter(), onWriteError() { } }));
    await new Promise((r) => setTimeout(r, 300));   // the boot's first write has FAILED; its whenWritten asks again 1 s later
    const during = { intent: fs.existsSync(f + '.aside-intent'), onDisk: fs.existsSync(f) };
    const landed = await Promise.race([m.whenWritten(), new Promise((r) => setTimeout(() => r('no answer in 4 s'), 4000))]);
    for (let i = 0; i < 60 && fs.existsSync(f + '.aside-intent'); i++) await new Promise((r) => setTimeout(r, 50));   // the boot's own re-ask drops it
    let names = false; try { names = fs.readFileSync(f, 'utf8').includes(to); } catch { }
    const after = { landed, intent: fs.existsSync(f + '.aside-intent'), names };
    try { quiet(() => m.stop()); } catch { }
    return { during, after };
  };
  const E5 = await intentScene(UT);
  ok(E5.during.intent && !E5.during.onDisk && E5.after.landed === true && !E5.after.intent && E5.after.names, '⑤e r3658\'s MUST: a write that FAILS leaves the set-aside intent in place and whenWritten() unsettled (never «on disk» on a failure); the retry lands the list naming the kept copy, and only then the intent goes', E5);
  const E5x = await intentScene(MJ.load('src/user-todos.js', anchored(SRC5, '  whenWritten() {\n', "  whenWritten() { if (!this._dirty && !this._W().pending(this._file)) return Promise.resolve(true); return this._W().durable(this._file); }\n  _whenWrittenR3658() {\n", 'the tip\'s whenWritten (the writer\'s durable)'), 'b0248-when-written'));
  ok(!E5x.during.intent, '⑤e RED control (the tip\'s whenWritten: the writer\'s durable, false on a failure): the intent is dropped while the list naming the kept copy never landed (red)', E5x.during);
  // (d) the doors that answer through it (pins): the status press (server.js), the reply's two roads, resolve-many, the notices'
  // doors, the agent's ask (acknowledged only once on disk) — and the page words the code in zh and ja
  {
    const SJ = read('server.js'), RT = read('src/routes/user-todos-reply.js'), ST = read('src/agent-routes/status.js'), ACT = read('src/lib/user-todos-actions.js'), PAN = read('src/lib/user-todos-panel.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
    const K = 'The change is made, but it is not saved to disk yet: the storage is slow or failing. It is written when the storage can; a restart before then loses it.';
    const doors = (sj, rt, st) => /const item = userTodos\.setStatus\(req\.params\.id, req\.body\?\.status, 'user', \{ pressed: press \}\); require\('\.\/src\/user-todos\.js'\)\.replyOnDisk\(userTodos, res, \(\) => res\.json\(\{ success: true, item \}\), \(\) => res\.status\(503\)/.test(sj)
      && (rt.match(/return answerDurable\(res, /g) || []).length === 4 && /\{ sent: true \}\);/.test(rt) && /const answerDurableOf = \(userTodos\) => \(res, body, \{ sent = false \} = \{\}\) => require\('\.\.\/user-todos\.js'\)\.replyOnDisk\(userTodos, res, /.test(rt)
      && /return require\('\.\.\/user-todos\.js'\)\.replyOnDisk\(userTodos, res, \(\) => res\.json\(ack\), \(\) => res\.status\(503\)/.test(st);
    ok(doors(SJ, RT, ST), '⑤d the doors answer after the disk, ONE reply on the writer\'s synchronous road (replyOnDisk): the status press, the reply\'s two roads and resolve-many / the notices\' doors (four), the agent\'s acknowledged ask');
    const RELEASE_PRESS = "const item = userTodos.setStatus(req.params.id, req.body?.status, 'user', { pressed: press }); res.json({ success: true, item }); }";
    ok(!doors(SJ.replace(/const item = userTodos\.setStatus\(req\.params\.id, req\.body\?\.status, 'user', \{ pressed: press \}\); require[^\n]*/, RELEASE_PRESS), RT, ST), '⑤d RED control (the release\'s press, answered before the disk): the doors\' pin is red');
    const TQ = read('src/lib/browser-takeover-queue.js'), RC = read('src/lib/reset-credit-dialog.js');
    const pagePins = (act) => (act.match(/code === 'todos-not-on-disk'/g) || []).length === 4 && /r\.written === false/.test(act) && /code === 'todos-not-on-disk'/.test(PAN) && /r\.written === false/.test(TQ) && /r && r\.code === 'todos-not-on-disk'\) showToast\(t\(/.test(RC) && [ZH, JA].every((dd) => dd.includes('\n  ' + JSON.stringify(K) + ': '));
    ok(pagePins(ACT), '⑤d the page words the code (the status press, «Mark all read» and its Undo, the bulk dismiss, a sent reply; r3658: the takeover\'s reply and the reset-credit dialog\'s press) in its language — zh and ja');
    ok(!pagePins(ACT.replace(/r\.written === false/g, 'false')), '⑤d RED control (a sent reply\'s written: false unread): the page pin is red');
  }
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'todos-held-census ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
