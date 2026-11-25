#!/usr/bin/env node
// test-sync-store-hold — THE SYNCED STORES' ONE READ UNDER THE STORE-READ LAW (lane lg-recovery, 主开发 r3262 / r3271; the store
// census's item 2; its CURE round, r3654): src/sync-store.js reads drafts.json, stage-sync.json, uploads-sync.json and
// settings-sync.json ONE way. The release read a failed or torn file as «nothing at version 0» and every stop, crash and 2 s save
// wrote that over the file. Over made-up stores in a scratch folder, the read REFUSED by placement (EIO), the REAL SyncStore, the
// ws-handler's state-set / state-resync cases and the client's StateSync class cut verbatim, page stand-ins:
//   ① HELD, NOTHING WRITTEN OVER: the stop's flush and the 2 s save leave the file's bytes as they were
//   ② THE FIRST LOAD: a page loading while held is told HELD, never «no drafts at version 0»; it starts empty AND held
//   ③ THE RECONNECT: a page ahead of version 0 is told HELD, never an empty full snapshot; it keeps what it holds, re-pushes nothing
//   ④ WHILE HELD THE HUB TAKES NOTHING (r3654): a page's op is answered «held» by its key, changes nothing in the hub and reaches no
//      other page; a page that knows sends nothing (RED: a hub copy that takes the op)
//   ⑤ THE LIFT: ONE snapshot of the file as read, nothing merged, nothing written
//   ⑥ THE RESTART ROAD (round must 1): a page that SAW the data, held after a hub restart, types; the hub restarts again onto the
//      file at the same version: the page says it is unread, gets the full snapshot, sends its text as a true edit (RED: a page
//      copy that does not say it — no snapshot, unread for good, the text never sent)
//   ⑦ A PAGE OPENED DURING THE HOLD (must 3): its text JOINS the saved draft (the saved text, then what was typed), landed as a prefix;
//      its deletion of a unit it never saw is nothing (RED: a page copy without the join — the saved draft lost)
//   ⑧ TWO PAGES (must 2): neither hears the other while held; each sends ONCE at the lift and both converge; a later hold-and-lift
//      re-sends nothing of the first (RED: a page copy that keeps its map — the first hold's stale text sent over the newer one)
//   ⑨ STAGE ON A FRESH PAGE (must 4): its arrangement stays on that page, NOT sent, said once; the saved record stands at the lift
//      (RED: a page copy that keeps Stage units as text — the saved record replaced)
//   ⑩ STOP's PUT-BACK WHILE HELD (r3890), through the REAL door: (a) the words go to the open page at once — in its box and its
//      map — and at the lift a page that had deleted the draft (the messages queued) sends them, not the deletion (RED: a hub copy
//      that never hands them — the box stays empty while the toast says they are back; and, taken to the lift, one that JOINS them
//      into the lift's snapshot — the page's own deletion wipes them); (b) a hub restart before the lift loses
//      nothing the page holds (RED: the same copy — the words gone); (c) with NO page open they are owed, said «in memory only», and
//      laid on the ordinary road AFTER the lift's snapshot, the door's belt noted at their version (RED: a copy laying them first)
//   ⑪ TORN BYTES: held while their copy is made, lifted EMPTY; a fresh page's text is sent; the snapshot names the copy
//   ⑫ settings-sync.json takes the same hold
//   ⑬ THE PAGE THAT SLEPT THROUGH THE LIFT (r3890 C): its old text JOINS the newer saved draft, its old deletion is nothing (RED: a
//      page copy that ignores the version it saw — the newer draft replaced, a unit deleted)
//   ⑭ TYPED, THEN SENT, WHILE HELD on a page opened during the hold: the sent text never comes back into the box (RED: a page copy
//      that does not record the send)
//   ⑮ A HELD REPLY THAT ARRIVES AFTER THE LIFT's SNAPSHOT (placed: the first load's answer gated until after the lift) does not
//      leave the page unread (RED: a page copy without the check)
//   ⑯ THE FLUSH OFF THE LOOP (r3321, B-0248's first row), the REAL store writer: (a) a stall placed in every main-thread rename /
//      fsync, a person typing: the loop's longest turn under half the release's (its red: the write at the call, in a copy); (b) a
//      person's typing is written in the stop's FIRST pass (rank 0; red: a copy without it); (c) a failed write is SAID once, the
//      text kept (red: a copy that says nothing); (d) a HELD store asks the writer for nothing, its bytes refuse by name; the lift
//      asks once when the stop's put-back joins
//   ⑰ THE ROLLBACK RE-PUSH STANDS for a page that had seen the data (r3972): a torn lift at version 1 keeps every draft of before the
//      hold (on the hub, in the file, in the box), a unit typed or cleared while held is rule (C)'s alone; a lift at a lower version
//      keeps the page's newer draft (RED: the guard that skipped an unread page); a page whose last version IS the fresh lift's number
//      keeps its draft, open at the lift or resyncing after it (RED: a page copy / a hub copy that compares the number alone)
//   ⑱ THE RACE AT A PAGE's START (placed: the held reply handing owed words, gated until after the lift's snapshot): the words land
//      all the same (RED: a page copy that drops the whole reply as old)
//   ⑲ A PAGE THAT CONNECTS WHILE HELD takes the owed words (the hub's copy leaves); the owed list keeps at most 20, the oldest
//      dropped, said (RED: copies that never hand at a start / keep no bound)
//   ⑳ LAW (E) (r4040), A RESTORE NEVER BEATS A WRITE, AND THE HUB DECIDES: a page that wakes late after a torn lift restores nothing
//      over the other page's hour of work (a draft rewritten, one sent, a new one — never deleted: a page never restores absence),
//      and is answered with the hub's value; at the lift, a page's held-time text and an idle page's restore meet in BOTH orders
//      of arrival (placed): the typed words stand (RED: today's blind set, a page copy; and a hub copy that does not decide — scene
//      two's blind red runs the order «B first, A's old copy last», the other order cannot go red under a blind set)
//   ㉑ THE FOLLOW (r4106): an owed put-back laid at a torn lift and the page's draft of before the hold BOTH STAND, joined, whichever
//      arrives second (RED: today's refusal); a hub write then a page's restore of the key: refused (RED: the undecided hub); no
//      second lift in one life (the life's writes kept); the box shows no old text while a restore is decided; a person typing
//      while a restore is out keeps what they typed
// ①–⑮ and ⑰–⑳ hand the store the writer's contract AT THE CALL (scratch.mjs landingWriter): they read the file right after its door.
// Run: node scripts/test-sync-store-hold.mjs
import { scratch, anchored, landingWriter } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name)'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const S = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 2000) => { for (let t = 0; t < ms && !cond(); t += 5) await sleep(5); return cond(); };   // a wait for WHAT HAPPENED
const { SyncStore } = require(path.join(REPO, 'src/sync-store.js'));
const { arrivalVerdict } = require(path.join(REPO, 'src/sync-arrival.js'));
const M = mutantCopies('sync-store-hold', REPO);

// ── THE PLACED REFUSAL: the read of a named file fails (EIO) while it is in REFUSE — never a real storage made to fail ──
const REFUSE = new Set();
const eio = (p) => Object.assign(new Error(`EIO: i/o error, read '${path.basename(String(p))}'`), { code: 'EIO' });
const realReadSync = fs.readFileSync, realRead = fs.promises.readFile;
fs.readFileSync = function (p, ...a) { if (REFUSE.has(String(p))) throw eio(p); return realReadSync.call(this, p, ...a); };
fs.promises.readFile = function (p, ...a) { if (REFUSE.has(String(p))) return Promise.reject(eio(p)); return realRead.call(this, p, ...a); };

// ── the real code, cut verbatim ──
const handler = read('src/ws-handler.js');
const a0 = handler.indexOf("        case 'state-set': {"), b0 = handler.indexOf("        case 'layout-sync': {");
const CASES = a0 > 0 && b0 > a0 ? handler.slice(a0, b0) : '';
const utils = read('src/lib/utils.js');
const c0 = utils.indexOf('class StateSync {'), c1 = utils.indexOf('\nlet _stateSync = null;');
const CLASS = c0 > 0 && c1 > c0 ? utils.slice(c0, c1) : '';
const persistence = read('src/routes/persistence.js');
console.log('§0 the cuts, and the doors that answer through the store');
ok(/case 'state-set'/.test(CASES) && /case 'state-resync'/.test(CASES) && /init\(storeName\) \{/.test(CLASS), 'src/ws-handler.js: state-set / state-resync and src/lib/utils.js: StateSync cut verbatim');
const route = (() => { const i = persistence.indexOf("router.get('/api/sync/:store'"); return i < 0 ? '' : persistence.slice(i, persistence.indexOf('\n  });', i)); })();
ok(/store\.snapshotAnswer\(\)/.test(route), 'GET /api/sync/:store answers through the store\'s own snapshotAnswer() (the held answer is the store\'s, one place)', route.slice(0, 300));
ok(/store\.resyncAnswer\(sinceVersion, \{ unread: unreadNames\.includes\(name\) \}\)/.test(CASES), 'state-resync answers through the store\'s own resyncAnswer(), told which stores the page holds as unread');

const SAVED = 'a draft the person has not sent';
const MADE = {
  drafts: { version: 41, data: { 'chat:sess-a': SAVED, 'chat:sess-b': 'a draft another page sent while held', 'doc:\u0001/home/userL/notes.md': [{ id: 'c1', text: 'a comment row' }] } },
  stage: { version: 12, data: { slot: 'q2', grid: '2x2', hero: 'claude:0b5e7c1a-1111-4222-8333-944455556666', lru: S(['claude:a', 'claude:b']), 'ws:claude:k1': S([{ openSpec: { type: 'files', path: '/home/userL' }, closedByLru: true }]) } },
  uploads: { version: 7, data: { 'upload:1-0': { name: 'a.txt', path: '/home/userL/a.txt', size: 3, date: 1, status: 'done' } } },
  settings: { version: 3, data: {} },
};
let WORLDS = 0;   // each world its own folder: a refused file of one world must never be another world's
const fileOf = (dir, name) => path.join(dir, name === 'drafts' ? 'drafts.json' : `${name}-sync.json`);
function world(name, { torn = false, readable = false, Store = SyncStore, cls = CLASS, fetchGate = null } = {}) {
  const dir = scratch('sync-hold-' + name + '-' + (++WORLDS)); fs.mkdirSync(dir, { recursive: true });
  const file = fileOf(dir, name);
  const bytes = torn ? '{"version": 41, "data": {"chat:sess-a": "a draft cut off in the mid' : S(MADE[name], null, 2);
  fs.writeFileSync(file, bytes);
  if (!torn && !readable) REFUSE.add(file);
  const wss = { clients: new Set() };
  const stores = { [name]: new Store(name, file, wss, { saveDelay: 20, writer: landingWriter() }) };
  const getSyncStore = (n) => stores[n];
  const activeSessions = new Map();
  const handle = CASES ? new Function('getSyncStore', 'activeSessions', 'putbackBelt', `return function handle(data, ws) { switch (data.type) {\n${CASES}\n} };`)(getSyncStore, activeSessions, (b, v) => v) : () => { };
  // the page's first load, through the store's own answer (the route above answers the same way)
  const fetchFake = async (url) => {
    const st = getSyncStore(String(url).split('/').pop());
    const ans = st.snapshotAnswer();
    if (fetchGate) await fetchGate();   // ⑮: the answer is held back until the scene lets it go
    return { ok: ans.status === 200, status: ans.status, json: async () => JSON.parse(S(ans.body)) };
  };
  const StateSync = cls ? new Function('fetch', 'arrivalVerdict', cls + '\nreturn StateSync;')(fetchFake, arrivalVerdict) : null;
  const page = (pname) => {
    const globals = [], states = [], sent = [], heard = [], errors = [];
    // a throw in the page's handler is RECORDED: the hub's own sends swallow it (try / catch around ws.send), a real page would not see it either
    const sock = { name: pname, readyState: 1, send(m) { const x = JSON.parse(m); heard.push(x); for (const h of globals) { try { h(x); } catch (e) { errors.push(String(e && e.message)); throw e; } } } };
    let queued = null;   // ⑳: while held, this page's sends wait — released in a placed order (two pages' arrivals at the hub)
    const deliver = (d) => { sent.push(JSON.parse(S(d))); if (sock.readyState === 1) handle(JSON.parse(S(d)), sock); };
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { if (queued) queued.push(d); else deliver(d); } };
    wss.clients.add(sock);
    const sync = new StateSync(wm);
    return { sock, sync, sent, heard, errors, handle: (d) => handle(d, sock), reconnect: () => { sock.readyState = 1; for (const h of states) h(true); }, drop: () => { sock.readyState = 3; for (const h of states) h(false); },
      hold: () => { queued = queued || []; }, release: () => { const q = queued || []; queued = null; for (const d of q) deliver(d); },
      releaseOne: () => { if (queued && queued.length) deliver(queued.shift()); } };   // ㉑: the first held send only — the rest still held
  };
  const restart = () => { const old = stores[name]; if (old && old._hold) old._hold.stop(); stores[name] = new Store(name, file, wss, { saveDelay: 20, writer: landingWriter() }); return stores[name]; };   // (a restart: the old process's hold ends with it)
  return { dir, file, bytes, get store() { return stores[name]; }, stores, page, wss, restart };
}
const heldOf = (st) => (st && typeof st.held === 'function' ? st.held() : null);
const disk = (f) => { try { return JSON.parse(realReadSync(f, 'utf8')); } catch { return null; } };
const setsOf = (p, key) => p.sent.filter((m) => m.type === 'state-set' && m.key === key);
const SRC = read('src/sync-store.js');
const pageCopy = (from, to, tag) => anchored(CLASS, from, to, tag);

console.log('① HELD, NOTHING WRITTEN OVER — the stop\'s flush and the 2 s save leave the unread file as it was');
const W = world('drafts');
{
  const h = heldOf(W.store);
  ok(!!h && h.code === 'drafts_unread', `the read refused (EIO): the store is HELD by name (${S(h)})`);
  W.store.flush();          // the stop's (and the crash handler's) flush
  await sleep(60);          // …and the 2 s save, at the suite's 20 ms
  ok(realReadSync(W.file, 'utf8') === W.bytes, 'the stop\'s flush and the debounced save wrote NOTHING over drafts.json (its bytes as they were)', realReadSync(W.file, 'utf8').slice(0, 120));
}

console.log('② THE FIRST LOAD — a page loading while held is told HELD, never «no drafts at version 0»');
const P1 = W.page('page-1');
{
  const loaded = await P1.sync.init('drafts');
  const ans = W.store.snapshotAnswer();
  ok(ans.status === 503 && ans.body && ans.body.held === true && ans.body.code === 'drafts_unread' && !('data' in ans.body), `GET /api/sync/drafts answers 503 HELD by name, with no data (${ans.status} ${S(ans.body).slice(0, 120)})`);
  ok(loaded === false && !!P1.sync.unreadOf('drafts'), `the page starts empty AND held (init() answers ${loaded}: the Doc strip neither adopts nor deletes its local copy)`);
}

console.log('③ THE RECONNECT — a page that held the data, held after a hub restart: told HELD; it keeps what it holds, re-pushes nothing');
{
  const R3 = world('drafts', { readable: true });
  const P2 = R3.page('page-2');
  const first = await P2.sync.init('drafts');
  REFUSE.add(R3.file); R3.restart();
  let told = 0; P2.sync.on('drafts', '*', () => { told++; });
  const before = P2.sent.length;
  P2.drop(); P2.reconnect(); await sleep(5);
  const pushed = P2.sent.slice(before).filter((m) => m.type === 'state-set');
  ok(first === true && S(P2.sync.getAll('drafts')) === S(MADE.drafts.data) && told === 0 && pushed.length === 0 && !!P2.sync.unreadOf('drafts'), `the page keeps its ${Object.keys(P2.sync.getAll('drafts')).length} drafts, no listener told, ${pushed.length} re-pushed; it knows the store is held`);
  REFUSE.delete(R3.file); R3.store._hold.stop();
}

console.log('④ WHILE HELD THE HUB TAKES NOTHING (r3654) — a page\'s op answered «held» by its key; nothing changes; no other page hears it');
const lawScene = (Store, tag) => {
  const L = world('drafts', { Store });
  const A = L.page('a-' + tag), B = L.page('b-' + tag);
  A.handle({ type: 'state-set', store: 'drafts', key: 'chat:sess-a', value: 'sent before the page knew', basedOn: 0 });   // an op sent before the page knew
  A.handle({ type: 'state-set', store: 'drafts', key: 'chat:sess-b', value: '', basedOn: 0 });                         // …and a deletion
  const out = { toA: A.heard.filter((m) => m.type === 'state-held').map((m) => m.key || null), toB: B.heard.filter((m) => m.type === 'state-sync').length, data: S(L.store.getAll()), version: L.store.version };
  L.store._hold.stop();
  return out;
};
{
  const R0 = lawScene(SyncStore, 'real');
  ok(S(R0.toA) === S(['chat:sess-a', 'chat:sess-b']) && R0.toB === 0 && R0.data === '{}' && R0.version === 0, `each op is answered «held» by its key (${S(R0.toA)}); the hub's memory unchanged (${R0.data}, version ${R0.version}); the other page hears ${R0.toB}`);
  const TAKES = M.load('src/sync-store.js', anchored(SRC, '    if (this._hold && this._hold.held()) { this._whileHeld(key, senderWs, value, extra); return; }\n', '', 'takes-while-held'), 'takes').SyncStore;
  const RX = lawScene(TAKES, 'takes');
  ok(RX.toB > 0 || RX.data !== '{}', `CONTROL (a hub copy that takes a set while held): the other page hears it, the hub's memory changes (red) (${S(RX)})`);
  const K = world('drafts');
  const P = K.page('knows');
  await P.sync.init('drafts');
  const before = P.sent.length;
  P.sync.set('drafts', 'chat:sess-a', 'typed while it knows');
  ok(P.sent.slice(before).filter((m) => m.type === 'state-set').length === 0 && P.sync.get('drafts', 'chat:sess-a') === 'typed while it knows', 'a page that knows the store is unread sends NOTHING for it; the text shows on that page as typed');
  K.store._hold.stop();
}

console.log('⑤ THE LIFT — ONE snapshot of the file as read; nothing merged; nothing written');
{
  const snaps = [];
  W.wss.clients.add({ readyState: 1, send: (m) => { const x = JSON.parse(m); if (x.type === 'state-snapshot') snaps.push(x); } });
  REFUSE.delete(W.file);
  const lifted = await W.store._hold.again();
  ok(lifted && !heldOf(W.store) && snaps.length === 1 && snaps[0].lifted === true && snaps[0].version === 41 && S(snaps[0].data) === S(MADE.drafts.data), `ONE snapshot: the file's units at its version (${snaps.length} sent, version ${snaps[0] && snaps[0].version})`);
  await sleep(60);
  ok(realReadSync(W.file, 'utf8') === W.bytes, 'nothing is written at the lift: no unit was taken while held, so the file already holds the truth');
}

console.log('⑥ THE RESTART ROAD (round must 1) — a page that saw the data, held after a restart, types; the file reads again at the SAME version');
const restartScene = async (cls, tag) => {
  const R = world('drafts', { readable: true, cls });
  const P = R.page('p-' + tag);
  const first = await P.sync.init('drafts');
  REFUSE.add(R.file); R.restart();                     // the hub restarts: the file cannot be read
  P.drop(); P.reconnect(); await sleep(5);
  const unreadHeld = !!P.sync.unreadOf('drafts');
  P.sync.set('drafts', 'chat:sess-a', 'typed after the restart, while held');
  const sentWhileHeld = setsOf(P, 'chat:sess-a').length;
  REFUSE.delete(R.file); R.restart();                  // and again: the file reads, at the same version (nothing was written over it)
  P.drop(); P.reconnect(); await sleep(5);
  const out = { first, unreadHeld, sentWhileHeld, unreadAfter: !!P.sync.unreadOf('drafts'), store: R.store.get('chat:sess-a'), version: R.store.version };
  R.store._hold.stop();
  return out;
};
{
  const R1 = await restartScene(CLASS, 'real');
  ok(R1.first === true && R1.unreadHeld && R1.sentWhileHeld === 0, `the page held the data (init ${R1.first}), is told held after the restart, and sends nothing of what it types (${R1.sentWhileHeld} sent)`);
  ok(!R1.unreadAfter && R1.store === 'typed after the restart, while held', `the hub that reads again answers the page's «unread» with the full snapshot: unread cleared, the text sent as a true edit (${S(R1.store)})`);
  const NOSAY = pageCopy('if (s.unread) unread.push(name); }', '}', 'resync-says-nothing');
  const RX = await restartScene(NOSAY, 'nosay');
  ok(RX.unreadAfter && RX.store === SAVED, `CONTROL (a page copy whose resync does not say «unread»): no snapshot — the page unread for good, its text never sent (red) (${S(RX)})`);
}

console.log('⑦ A PAGE OPENED DURING THE HOLD (round must 3) — its text JOINS the saved draft; its deletion of a unit it never saw is nothing');
const freshScene = async (cls, tag) => {
  const F = world('drafts', { cls });
  const p = F.page('fresh-' + tag);
  const loaded = await p.sync.init('drafts');
  const told = [];
  p.sync.on('drafts', 'chat:sess-a', (v, k, op) => told.push({ v, prepended: op && op.prepended }));
  p.sync.set('drafts', 'chat:sess-a', 'quick note');
  p.sync.set('drafts', 'chat:sess-b', '');   // a draft it never saw, «sent»
  const sentHeld = p.sent.filter((m) => m.type === 'state-set').length;
  REFUSE.delete(F.file);
  await F.store._hold.again(); await sleep(5);
  const out = { loaded, sentHeld, a: F.store.get('chat:sess-a'), b: F.store.get('chat:sess-b'), last: told[told.length - 1] || null, shown: p.sync.get('drafts', 'chat:sess-a') };
  F.store._hold.stop();
  return out;
};
{
  const J = SAVED + '\n\nquick note';
  const F1 = await freshScene(CLASS, 'real');
  ok(F1.loaded === false && F1.sentHeld === 0, `the page opened during the hold (init ${F1.loaded}) sends nothing while held (${F1.sentHeld})`);
  ok(F1.a === J && F1.shown === J, `at the lift its text JOINS the saved draft — the saved text, then what was typed (${S(F1.a)})`);
  ok(!!F1.last && F1.last.prepended === (SAVED + '\n\n').length, `…told to the composer as a PREFIX (${F1.last && F1.last.prepended} chars), landed in front of its live box as a put-back lands`);
  ok(F1.b === MADE.drafts.data['chat:sess-b'], 'its deletion of a draft it never saw deletes nothing');
  const NOJOIN = pageCopy("      return { value: saved + SEP + typed, prepended: (saved + SEP).length };", '      return { value: typed };', 'no-join');
  const FX = await freshScene(NOJOIN, 'nojoin');
  ok(FX.a === 'quick note', `CONTROL (a page copy without the join): the saved draft is lost at the lift (red) (${S(FX.a)})`);
}

console.log('⑧ TWO PAGES (round must 2) — neither hears the other while held; each sends ONCE at the lift; a later hold re-sends nothing of it');
const twoScene = async (cls, tag) => {
  const T = world('drafts', { readable: true, cls });
  const A = T.page('A-' + tag), B = T.page('B-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); A.reconnect(); B.drop(); B.reconnect(); await sleep(5);
  A.sync.set('drafts', 'chat:sess-a', 'v1, typed on A');
  B.sync.set('drafts', 'chat:sess-a', 'v2, typed on B after');
  const heardWhileHeld = A.heard.concat(B.heard).filter((m) => m.type === 'state-sync').length;
  REFUSE.delete(T.file); await T.store._hold.again(); await sleep(10);
  const atLift = { a: setsOf(A, 'chat:sess-a').length, b: setsOf(B, 'chat:sess-a').length, store: T.store.get('chat:sess-a'), onA: A.sync.get('drafts', 'chat:sess-a'), onB: B.sync.get('drafts', 'chat:sess-a') };
  // a later hold and lift: B types a newer text afterwards; the store holds it; the file then cannot be read for a moment
  B.sync.set('drafts', 'chat:sess-a', 'v3, the newer text');
  await until(() => T.store.get('chat:sess-a') === 'v3, the newer text');
  T.store.flush(); await until(() => (disk(T.file) || { data: {} }).data['chat:sess-a'] === 'v3, the newer text');
  REFUSE.add(T.file); T.restart(); A.drop(); A.reconnect(); await sleep(5);
  REFUSE.delete(T.file); await T.store._hold.again(); await sleep(10);
  const out = { heardWhileHeld, atLift, later: T.store.get('chat:sess-a'), aSetsAfter: setsOf(A, 'chat:sess-a').length - atLift.a };
  T.store._hold.stop();
  return out;
};
{
  const T1 = await twoScene(CLASS, 'real');
  ok(T1.heardWhileHeld === 0, `while held neither page hears the other (${T1.heardWhileHeld} ops)`);
  ok(T1.atLift.a === 1 && T1.atLift.b === 1 && T1.atLift.onA === T1.atLift.store && T1.atLift.onB === T1.atLift.store, `at the lift each page sends ONCE, the last to send wins and both pages show it (${S(T1.atLift)})`);
  ok(T1.later === 'v3, the newer text' && T1.aSetsAfter === 0, `a later hold and lift re-sends nothing of the first: the newer text stands (${S(T1.later)}, ${T1.aSetsAfter} sent by A)`);
  const KEEPS = pageCopy('    s.unread = null; s.typedWhileUnread = null; s.saw = true; s.changedWhileUnread = null;\n', '    s.unread = null; s.saw = true; s.changedWhileUnread = null;\n', 'map-kept');
  const TX = await twoScene(KEEPS, 'keeps');
  ok(TX.later !== 'v3, the newer text', `CONTROL (a page copy that keeps its map after the snapshot): the first hold's stale text is sent over the newer one (red) (${S(TX.later)})`);
}

console.log('⑨ STAGE ON A FRESH PAGE (round must 4) — its arrangement stays on that page, NOT sent, said once; the saved record stands');
const stageScene = async (cls, tag) => {
  const G = world('stage', { cls });
  const p = G.page('stage-' + tag);
  const loaded = await p.sync.init('stage');
  const said = [];
  p.sync.onUnread((st, u, f) => { if (u && f && f.notKept) said.push(st); });
  p.sync.set('stage', 'ws:claude:k1', S([]));                 // the Stage records its arrangement from an empty read
  p.sync.set('stage', 'lru', S(['claude:z']));                // …and its recent-use order
  const sentHeld = p.sent.filter((m) => m.type === 'state-set').length;
  REFUSE.delete(G.file); await G.store._hold.again(); await sleep(5);
  const out = { loaded, said, sentHeld, ws: G.store.get('ws:claude:k1'), lru: G.store.get('lru'), shown: p.sync.get('stage', 'ws:claude:k1') };
  G.store._hold.stop();
  return out;
};
{
  const G1 = await stageScene(CLASS, 'real');
  ok(G1.loaded === false && G1.sentHeld === 0 && S(G1.said) === S(['stage']), `the fresh page's Stage changes act for this page only: nothing sent (${G1.sentHeld}), said ONCE (${S(G1.said)})`);
  ok(G1.ws === MADE.stage.data['ws:claude:k1'] && G1.lru === MADE.stage.data.lru && G1.shown === MADE.stage.data['ws:claude:k1'], 'at the lift the saved workspace record and recent-use order stand, and the page shows them');
  const ALLTEXT = pageCopy("  _isText(storeName) { return storeName === 'drafts'; }", '  _isText(storeName) { return true; }', 'stage-as-text');
  const GX = await stageScene(ALLTEXT, 'astext');
  ok(GX.ws !== MADE.stage.data['ws:claude:k1'], `CONTROL (a page copy that keeps Stage units as text): the saved workspace record is replaced at the lift (red) (${S(GX.ws).slice(0, 80)})`);
}

console.log('⑩ STOP\'s PUT-BACK WHILE HELD (r3890) — through the REAL door: handed to the open pages, owed only with none open');
const DOOR = require(path.join(REPO, 'src/server/queue-putback.js'));
const PREFIX = 'first queued\n\nsecond queued\n\n';
const dropped = (id) => ({ type: 'queue_dropped', dropId: id, items: [{ text: 'first queued' }, { text: 'second queued' }] });
const NEVER_HANDS = () => M.load('src/sync-store.js', anchored(SRC, '    if (open.length) {\n      const msg = JSON.stringify({ type: \'state-held-putback\'', '    if (false) {\n      const msg = JSON.stringify({ type: \'state-held-putback\'', 'never-hands'), 'never-hands').SyncStore;
const putbackA = async (Store, tag) => {   // must 1: a page that saw the drafts; held; two messages queued (the box cleared); Stop
  const Q = world('drafts', { readable: true, Store });
  const P = Q.page('p-' + tag);
  await P.sync.init('drafts');
  REFUSE.add(Q.file); Q.restart(); P.drop(); P.reconnect(); await sleep(5);
  const told = [];
  P.sync.on('drafts', 'chat:sess-a', (v, k, op) => told.push({ v, prepended: op && op.prepended }));
  P.sync.set('drafts', 'chat:sess-a', 'two messages, sent while the agent works');
  P.sync.set('drafts', 'chat:sess-a', '');   // sent: they queue, the box is cleared (the page's map holds a deletion)
  const door = DOOR.create({ getSyncStore: (n) => Q.stores[n], log: () => { } });
  door.onLiveRecord({}, 'sess-a', dropped('d-a-' + tag));   // Stop
  const atStop = { box: P.sync.get('drafts', 'chat:sess-a'), told: told.length ? told[told.length - 1].prepended : null };
  REFUSE.delete(Q.file); await Q.store._hold.again(); await sleep(5);
  const out = { atStop, hub: Q.store.get('chat:sess-a'), page: P.sync.get('drafts', 'chat:sess-a') };
  Q.store._hold.stop();
  return out;
};
const putbackB = async (Store, tag) => {   // must 2: Stop while held, the hub restarted before the lift, the file reads
  const Q = world('drafts', { readable: true, Store });
  const P = Q.page('p-' + tag);
  await P.sync.init('drafts');
  REFUSE.add(Q.file); Q.restart(); P.drop(); P.reconnect(); await sleep(5);
  DOOR.create({ getSyncStore: (n) => Q.stores[n], log: () => { } }).onLiveRecord({}, 'sess-a', dropped('d-b-' + tag));
  Q.restart(); P.drop(); P.reconnect(); await sleep(5);   // the hub restarts, still held
  REFUSE.delete(Q.file); Q.restart(); P.drop(); P.reconnect(); await sleep(5);   // …and again: the file reads
  const out = { hub: Q.store.get('chat:sess-a') };
  Q.store._hold.stop();
  return out;
};
{
  const A1 = await putbackA(SyncStore, 'real');
  ok(A1.atStop.box === PREFIX + '' && A1.atStop.told === PREFIX.length, `at Stop the words are on the open page at once, in front of its box (told as a prefix of ${A1.atStop.told} chars) — the toast is true`);
  ok(A1.hub === PREFIX && A1.page === PREFIX, `at the lift the page sends its unit — the words, not the deletion — and the hub holds them (${S(A1.hub)})`);
  const AX = await putbackA(NEVER_HANDS(), 'never');
  ok(AX.atStop.box !== PREFIX, `CONTROL (a hub copy that never hands the words to a page): at Stop the box holds none of them while the toast says they are back (red) (${S(AX.atStop.box)})`);
  const JOINS = M.load('src/sync-store.js', anchored(anchored(SRC, '    if (open.length) {\n      const msg = JSON.stringify({ type: \'state-held-putback\'', '    if (false) {\n      const msg = JSON.stringify({ type: \'state-held-putback\'', 'joins-a'), "    this._freshLife = !(v && v.data);\n", "    this._freshLife = !(v && v.data);\n    for (const o of owed.splice(0)) this.data[o.key] = o.prefix + (typeof this.data[o.key] === 'string' ? this.data[o.key] : '');\n", 'joins-b'), 'joins').SyncStore;
  const AY = await putbackA(JOINS, 'joins');
  ok(AY.atStop.box !== PREFIX && !String(AY.hub || '').includes('first queued') && !String(AY.page || '').includes('first queued'), `CONTROL TAKEN TO THE LIFT (a hub copy that never hands the words and JOINS them into the lift's snapshot, at the version as read): the page's own deletion, a true edit there, wipes the joined words — on the hub and on the page (red) (${S({ hub: AY.hub, page: AY.page })})`);
  const B1 = await putbackB(SyncStore, 'real');
  ok(B1.hub === PREFIX + SAVED, `a hub restart before the lift loses nothing the page holds: the words arrive from the page at the first snapshot, in front of the draft it saw (${S(B1.hub)})`);
  const BX = await putbackB(NEVER_HANDS(), 'never');
  ok(BX.hub === SAVED, `CONTROL (the same copy): the words lived only in the first hub's memory — gone at its restart (red) (${S(BX.hub)})`);
}
const putbackC = async (Store, tag) => {   // no page open: owed, said, laid AFTER the lift's snapshot on the ordinary road
  const Q = world('drafts', { Store });
  const said = [], oWarn = console.warn;
  console.warn = (...a) => { said.push(a.map(String).join(' ')); };
  const session = {};
  try {
    DOOR.create({ getSyncStore: (n) => Q.stores[n], log: (l) => said.push(String(l)) }).onLiveRecord(session, 'sess-a', dropped('d-c-' + tag));
    const seen = [];
    Q.wss.clients.add({ readyState: 1, send: (m) => { const x = JSON.parse(m); if (x.type === 'state-snapshot' || x.type === 'state-sync') seen.push({ type: x.type, a: x.type === 'state-snapshot' ? x.data['chat:sess-a'] : x.value, prepended: x.prepended }); } });
    REFUSE.delete(Q.file); await Q.store._hold.again(); await sleep(5);
    return { said: said.filter((l) => /in MEMORY ONLY|kept in memory only/.test(l)).length, seen, hub: Q.store.get('chat:sess-a'), belt: session._putbackBelt };
  } finally { console.warn = oWarn; Q.store._hold.stop(); }
};
{
  const C1 = await putbackC(SyncStore, 'real');
  ok(C1.said >= 1, `with no page open the words are owed, and the journal says they are kept in memory only (${C1.said} line(s))`);
  ok(C1.seen.length === 2 && C1.seen[0].type === 'state-snapshot' && C1.seen[0].a === SAVED && C1.seen[1].type === 'state-sync' && C1.seen[1].prepended === PREFIX.length && C1.hub === PREFIX + SAVED, `at the lift: the file's snapshot FIRST, then the put-back on the ordinary road, in front of the saved draft (${S(C1.seen.map((x) => x.type))})`);
  ok(Array.isArray(C1.belt) && C1.belt.length === 1 && C1.belt[0].prefix === PREFIX, `…the door's belt noted where the put-back landed, so a page's own edit in flight keeps it in front (${S(C1.belt)})`);
  const FIRST = M.load('src/sync-store.js', anchored(anchored(SRC, '    this._layOwed(owed);\n  }', '  }', 'lay-first-a'), "    const msg = JSON.stringify({ type: 'state-snapshot', store: this.name, data: this.data, version: this.version, lifted: true,", "    this._layOwed(owed);\n    const msg = JSON.stringify({ type: 'state-snapshot', store: this.name, data: this.data, version: this.version, lifted: true,", 'lay-first-b'), 'lay-first').SyncStore;
  const CX = await putbackC(FIRST, 'first');
  ok(!(CX.seen[0] && CX.seen[0].type === 'state-snapshot' && CX.seen[0].a === SAVED), `CONTROL (a hub copy laying the put-back before its snapshot): the snapshot already carries the words, and a page's own edit then meets them unbelted (red) (${S(CX.seen.map((x) => x.type))})`);
}

console.log('⑪ TORN BYTES — held while their copy is made, lifted EMPTY; a fresh page\'s text is sent; the snapshot names the copy');
{
  const T = world('drafts', { torn: true });
  const snaps = [];
  T.wss.clients.add({ readyState: 1, send: (m) => { const x = JSON.parse(m); if (x.type === 'state-snapshot') snaps.push(x); } });
  const p = T.page('torn-page');
  const h0 = heldOf(T.store);
  const loading = p.sync.init('drafts');
  p.sync.set('drafts', 'chat:sess-z', 'typed while the torn file was copied');
  await loading; await until(() => !heldOf(T.store)); await sleep(5);
  const copies = fs.readdirSync(T.dir).filter((n) => n.startsWith('drafts.json.corrupt-'));
  ok(!!h0 && !heldOf(T.store) && copies.length === 1 && realReadSync(path.join(T.dir, copies[0]), 'utf8') === T.bytes, `torn: held, its bytes kept aside ONCE (${copies.join(', ')}), then lifted`);
  ok(snaps.length === 1 && path.basename(String(snaps[0].setAside || '')) === copies[0], `the lift's snapshot names the copy (${snaps[0] && snaps[0].setAside})`);
  ok(T.store.get('chat:sess-z') === 'typed while the torn file was copied', 'what the page typed while held is sent at the lift');
  await until(() => !!disk(T.file));
  ok(!!disk(T.file), 'the torn file is written whole (its bytes are kept aside)');
  T.restart(); await sleep(20);
  ok(fs.readdirSync(T.dir).filter((n) => n.startsWith('drafts.json.corrupt-')).length === 1, 'a later start makes no second copy of the same torn bytes');
  T.store._hold.stop();
}

console.log('⑫ settings-sync.json takes the same hold (its read is the same; nothing on the page reads its contents)');
{
  const X = world('settings');
  const h = heldOf(X.store);
  X.store.flush(); await sleep(40);
  ok(!!h && h.code === 'settings_unread' && realReadSync(X.file, 'utf8') === X.bytes, `held by name (${h && h.code}), nothing written over`);
  REFUSE.delete(X.file); X.store._hold.stop();
}

console.log('⑬ THE PAGE THAT SLEPT THROUGH THE LIFT (r3890 C) — its old text JOINS the newer saved draft; its old deletion is nothing');
const sleptScene = async (cls, tag) => {
  const T = world('drafts', { readable: true, cls });
  const A = T.page('A-' + tag), B = T.page('B-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); A.reconnect(); await sleep(5);
  A.sync.set('drafts', 'chat:sess-a', 'A\'s old text, typed while held');
  A.sync.set('drafts', 'chat:sess-b', '');           // …and an old deletion
  A.drop();                                           // A sleeps
  REFUSE.delete(T.file); await T.store._hold.again(); await sleep(5);
  B.sync.set('drafts', 'chat:sess-a', 'newer, saved by B after the lift');
  await until(() => T.store.get('chat:sess-a') === 'newer, saved by B after the lift');
  A.reconnect(); await sleep(10);                     // A wakes, still unread: the full snapshot is NEWER than the version it saw
  const out = { a: T.store.get('chat:sess-a'), b: T.store.get('chat:sess-b') };
  T.store._hold.stop();
  return out;
};
{
  const L1 = await sleptScene(CLASS, 'real');
  ok(L1.a === 'newer, saved by B after the lift\n\nA\'s old text, typed while held' && L1.b === MADE.drafts.data['chat:sess-b'], `the newer saved draft, then A's old text, once; A's old deletion deletes nothing (${S(L1)})`);
  const ANYVER = pageCopy('    const saw = sawBefore && !fresh && (version || 0) === s.version;\n', '    const saw = sawBefore;\n', 'saw-any-version');
  const LX = await sleptScene(ANYVER, 'anyver');
  ok(LX.a === 'A\'s old text, typed while held' || LX.b !== MADE.drafts.data['chat:sess-b'], `CONTROL (a page copy that ignores the version it saw): the newer draft is replaced, the unit deleted (red) (${S(LX)})`);
}

console.log('⑭ TYPED, THEN SENT, WHILE HELD on a page opened during the hold — the sent text never comes back into the box');
const sentScene = async (cls, tag) => {
  const F = world('drafts', { cls });
  const p = F.page('fresh-sent-' + tag);
  await p.sync.init('drafts');
  p.sync.set('drafts', 'chat:sess-a', 'typed, then sent while held');
  p.sync.set('drafts', 'chat:sess-a', '');           // sent
  REFUSE.delete(F.file); await F.store._hold.again(); await sleep(5);
  const out = { box: p.sync.get('drafts', 'chat:sess-a'), hub: F.store.get('chat:sess-a') };
  F.store._hold.stop();
  return out;
};
{
  const E1 = await sentScene(CLASS, 'real');
  ok(E1.box === SAVED && E1.hub === SAVED, `the box shows the saved draft, never the sent text (${S(E1)})`);
  const NOSEND = pageCopy("      if (this._isText(storeName)) (s.typedWhileUnread || (s.typedWhileUnread = new Map())).set(key, value == null || value === '' ? null : value);\n",
    "      if (this._isText(storeName) && !(value == null || value === '')) (s.typedWhileUnread || (s.typedWhileUnread = new Map())).set(key, value);\n", 'send-not-recorded');
  const EX = await sentScene(NOSEND, 'nosend');
  ok(String(EX.box).includes('typed, then sent while held'), `CONTROL (a page copy that does not record the send): the sent text comes back into the box at the lift (red) (${S(EX.box)})`);
}

console.log('⑮ A HELD REPLY AFTER THE LIFT\'s SNAPSHOT (placed: the first load\'s answer held back until after the lift) — the page is not left unread');
const lateScene = async (cls, tag) => {
  let release; const gate = new Promise((r) => { release = r; });
  const G = world('drafts', { cls, fetchGate: () => gate });
  const p = G.page('late-' + tag);
  const loading = p.sync.init('drafts');              // its 503 is made now, its answer waits
  REFUSE.delete(G.file); await G.store._hold.again(); await sleep(5);   // the lift's snapshot lands on the socket first
  release(); await loading; await sleep(5);
  const out = { unread: !!p.sync.unreadOf('drafts'), has: p.sync.get('drafts', 'chat:sess-a') };
  G.store._hold.stop();
  return out;
};
{
  const H1 = await lateScene(CLASS, 'real');
  ok(!H1.unread && H1.has === SAVED, `the late «held» answer is dropped: the page reads, unread no more (${S(H1)})`);
  const NOCHECK = pageCopy("        if ((s.snapEpoch || 0) !== epoch) { for (const pb of handed) this._landPutback(storeName, pb, snap.code); return true; }\n", '', 'no-epoch-check');
  const HX = await lateScene(NOCHECK, 'nocheck');
  ok(HX.unread, `CONTROL (a page copy without the check): the late answer leaves the page unread for good (red) (${S(HX)})`);
}

console.log('⑯ THE FLUSH OFF THE LOOP (r3321) — the REAL store writer: the loop never waits on the storage; typing first at a stop; a failed write said; a held store asks nothing');
{
  const SW = require(path.join(REPO, 'src/store-writer.js'));
  const quiet = { warn() { }, info() { }, log() { }, error() { } };
  const SRC = read('src/sync-store.js');
  const M = mutantCopies('sync-hold-writer', REPO);
  const ASK = "    this._writer().dirty(this.filePath, { name: 'sync-store.write', rank: 0, debounceMs: this.saveDelay, produce: () => this._bytes(), onWritten: (ok, e) => this._written(ok, e) });\n";
  ok(SRC.split(ASK).length === 2, 'control setup: the store\'s hand-off to the writer is found once');
  const plainWorld = (tag, Store, writer, saveDelay = 20) => {
    const dir = scratch('sync-hold-w-' + tag); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'drafts.json'); fs.writeFileSync(file, S(MADE.drafts, null, 2));
    return { dir, file, store: new Store('drafts', file, { clients: new Set() }, { saveDelay, writer }) };
  };
  const onDisk = (f) => { try { return JSON.parse(realReadSync(f, 'utf8')); } catch { return null; } };
  const drafted = (f, text) => { const d = onDisk(f); return !!(d && d.data && d.data['chat:sess-a'] === text); };

  // (a) THE LOOP NEVER WAITS — a stall PLACED in every main-thread rename / fsync under the scene's folder (Atomics.wait inside the
  // call: no load; the writer's thread has its own fs), a person typing a burst. RED: the release's write at the call (a copy)
  const STALL = 300, SAB = new Int32Array(new SharedArrayBuffer(4));
  const loopScene = async (Store, tag) => {
    const w = SW.create({ log: quiet, graceMs: 5000 });
    const X = plainWorld('loop-' + tag, Store, w);
    const oRen = fs.renameSync, oFsync = fs.fsyncSync;
    fs.renameSync = function (a, ...r) { if (String(a).startsWith(X.dir)) Atomics.wait(SAB, 0, 0, STALL); return oRen.call(this, a, ...r); };
    fs.fsyncSync = function (...r) { Atomics.wait(SAB, 0, 0, STALL); return oFsync.apply(this, r); };
    let last = performance.now(), gap = 0, on = true;
    const tick = () => { const t = performance.now(); if (t - last > gap) gap = t - last; last = t; if (on) setTimeout(tick, 1); };
    setTimeout(tick, 1);
    const t0 = performance.now(), text = 'typed '.repeat(8).trim();
    let landed = false;
    try {
      for (let i = 1; i <= 8; i++) { X.store.set('chat:sess-a', 'typed '.repeat(i).trim()); await sleep(2); }   // a person typing: a burst inside the debounce, ONE write
      for (let i = 0; i < 400 && !landed; i++) { await sleep(5); landed = drafted(X.file, text); }   // a wait for WHAT HAPPENED: the last text on disk
    } finally {
      // the turn still in progress counts too: a stalled turn can end with the wait's own timer due before the tick's, so the loop
      // sees the text landed and the figure would be taken before the tick reads that turn (the UTC zone of run
      // edae0e365-20261125033656-both read the red's 300 ms stall as 9 ms)
      const tEnd = performance.now(); if (tEnd - last > gap) gap = tEnd - last;
      fs.renameSync = oRen; fs.fsyncSync = oFsync; on = false;
    }
    const out = { gap: Math.round(gap), ms: Math.round(performance.now() - t0), landed };
    try { w.stop(); } catch { }
    return out;
  };
  const LR = await loopScene(SyncStore, 'real');
  console.log(`  ⊙ ⑯a the loop's longest turn with ${STALL} ms placed in each main-thread rename / fsync, a person typing: ${LR.gap} ms over ${LR.ms} ms`);
  const { SyncStore: AtCall } = M.load('src/sync-store.js', anchored(SRC, ASK, "    clearTimeout(this._relT); this._relT = setTimeout(() => { const tmp = `${this.filePath}.tmp`; fs.writeFileSync(tmp, this._bytes()); fs.renameSync(tmp, this.filePath); }, this.saveDelay);   // MUTANT: the release's write at the call, on the loop\n", 'at-call'), 'at-call');
  const XC = await loopScene(AtCall, 'atcall');
  console.log(`  ⊙ ⑯a the red's own figure: the release's write at the call ${XC.gap} ms; the tree ${LR.gap} ms`);
  // (r1053 (5): a fast suite on a busy machine — the bound is the red's own figure: under half of it, never a fixed figure)
  ok(LR.landed && LR.gap * 2 < XC.gap, `⑯a the loop never waits on the storage: with ${STALL} ms placed in each main-thread rename / fsync the longest turn is ${LR.gap} ms — under half the red's ${XC.gap} ms — and the last text is on disk`, LR);
  ok(XC.landed && XC.gap >= STALL, `CONTROL (the release's write at the call, in a copy): the loop is held ${XC.gap} ms (≥ ${STALL}) by the rename (red)`, XC);

  // (b) A PERSON's TYPING FIRST AT A STOP — the exit's first pass (server.js: beginExit, then exitFlush({only: 'rank0'})) writes it,
  // before the stores that can be re-derived. RED: a copy whose hand-off drops `rank: 0`
  const stopScene = (Store, tag) => {
    const w = SW.create({ log: quiet, graceMs: 5000 });
    const X = plainWorld('stop-' + tag, Store, w, 60000);   // no paced write before the stop
    X.store.set('chat:sess-a', 'typed just before the stop');
    w.beginExit(); w.exitFlush({ only: 'rank0' });
    const first = drafted(X.file, 'typed just before the stop');
    try { w.exitFlush({}); } catch { }
    const last = drafted(X.file, 'typed just before the stop');
    try { w.stop(); } catch { }
    return { first, last };
  };
  const SR0 = stopScene(SyncStore, 'real');
  const { SyncStore: NoRank } = M.load('src/sync-store.js', anchored(SRC, "name: 'sync-store.write', rank: 0, debounceMs", "name: 'sync-store.write', debounceMs", 'no-rank'), 'no-rank');
  const SRX = stopScene(NoRank, 'norank');
  ok(SR0.first && SR0.last, `⑯b a person's typing is written in the stop's FIRST pass (rank 0), on the writer's thread (${S(SR0)})`);
  ok(!SRX.first && SRX.last, `CONTROL (a copy without rank 0): the first pass leaves the typing, only the last pass writes it (red) (${S(SRX)})`);

  // (c) A FAILED WRITE IS SAID — its folder gone (the writer makes no folder but for the one store that may): the write fails
  // ENOENT, the store says it ONCE, the text stays in memory. RED: a copy that hands no onWritten
  const failScene = async (Store, tag) => {
    const w = SW.create({ log: quiet, graceMs: 5000 });
    const X = plainWorld('fail-' + tag, Store, w);
    fs.rmSync(X.dir, { recursive: true, force: true });
    const said = [], oWarn = console.warn;
    console.warn = (...a) => { said.push(a.map(String).join(' ')); };
    try {
      X.store.set('chat:sess-a', 'typed while the folder is gone');
      for (let i = 0; i < 120 && !said.some((l) => l.startsWith('[sync] drafts.json could not be written')); i++) await sleep(5);
    } finally { console.warn = oWarn; }
    try { w.stop(); } catch { }
    return { said: said.filter((l) => l.startsWith('[sync] drafts.json could not be written (ENOENT)')).length, kept: X.store.get('chat:sess-a') === 'typed while the folder is gone' };
  };
  const FR = await failScene(SyncStore, 'real');
  const { SyncStore: NoWord } = M.load('src/sync-store.js', anchored(SRC, ", onWritten: (ok, e) => this._written(ok, e) });", " });   // MUTANT: no word of a failed write", 'no-word'), 'no-word');
  const FX = await failScene(NoWord, 'noword');
  ok(FR.said === 1 && FR.kept, `⑯c a failed write is SAID once («could not be written (ENOENT)»), the text kept in memory (${S(FR)})`);
  ok(FX.said === 0 && FX.kept, `CONTROL (a copy that hands no onWritten): the failed write is said by nobody of the store (red) (${S(FX)})`);

  // (d) A HELD STORE's WRITER STILL REFUSES — nothing is asked while held (the overlay is written nowhere), its bytes refuse by name
  // if ever asked; the lift asks
  {
    const asked = [];
    const rec = { dirty: (f, o) => { asked.push(o.name); }, durable: () => Promise.resolve(true), pending: () => false };
    const dir = scratch('sync-hold-w-held'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'drafts.json'); fs.writeFileSync(file, S(MADE.drafts)); REFUSE.add(file);
    const st = new SyncStore('drafts', file, { clients: new Set() }, { saveDelay: 20, writer: rec });
    st.set('chat:sess-a', 'queued while held\n\n', null, undefined, { prepended: 'queued while held\n\n'.length });   // the stop's put-back: owed
    st.flush();
    let refused = null; try { st._bytes(); } catch (e) { refused = e.code; }
    ok(asked.length === 0 && refused === 'EHELD' && realReadSync(file, 'utf8') === S(MADE.drafts), `⑯d a HELD store asks the writer for nothing (${asked.length} asked) and its bytes refuse by name (${refused}); the file as it was`);
    REFUSE.delete(file);
    const lifted = st._hold ? await st._hold.again() : false;
    ok(lifted && S(asked) === S(['sync-store.write']), `⑯d …the lift asks the writer once, by the row's name, when the put-back joins (${S(asked)})`);
  }
}

const unreadOn = (...ps) => until(() => ps.every((p) => !!p.sync.unreadOf('drafts')), 500);   // a reconnect settled by its FACT: each page holds the store unread (r4106 3)
console.log('⑰ THE ROLLBACK RE-PUSH STANDS (r3972) — a page that had seen the data keeps its drafts at a torn lift and at a lower-version lift');
const TORN_BYTES = '{"version": 41, "data": {"chat:sess-a": "cut off in the mid';
const DOCK = 'doc:\u0001/home/userL/notes.md';
const tornScene = async (cls, tag) => {   // a page that saw version 41; held; one draft typed and one unit cleared while held; a TORN lift
  const T = world('drafts', { readable: true, cls });
  const P = T.page('rb-' + tag);
  await P.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); P.drop(); P.reconnect(); await unreadOn(P);   // held (EIO): the page is unread
  P.sync.set('drafts', 'chat:sess-b', 'typed while held');                     // rule (C): its text joins, once
  P.sync.set('drafts', DOCK, '');                                              // rule (C): its old deletion is nothing
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);                 // the file now reads TORN
  await T.store._hold.again(); await sleep(5);                                 // set aside, lifted EMPTY at version 1
  if (T.store.get('chat:sess-a') === SAVED) await until(() => { const d = disk(T.file); return !!(d && d.data && d.data['chat:sess-a'] === SAVED); }, 500);   // the write, when the hub holds it
  const d = disk(T.file);
  const out = { a: T.store.get('chat:sess-a'), b: T.store.get('chat:sess-b'), bSets: setsOf(P, 'chat:sess-b').length, doc: T.store.get(DOCK), docSets: setsOf(P, DOCK).length, box: P.sync.get('drafts', 'chat:sess-a'), disk: d && d.data ? d.data['chat:sess-a'] : null };
  T.store._hold.stop();
  return out;
};
const lowerScene = async (cls, tag) => {   // the page's save at 42 never reached the file (it reads 41); held; the lift at 41
  const T = world('drafts', { readable: true, cls });
  const P = T.page('lv-' + tag);
  await P.sync.init('drafts');
  P.sync.set('drafts', 'chat:sess-a', 'the newer draft, saved at 42');
  await until(() => { const d = disk(T.file); return !!(d && d.version === 42); }, 500);
  fs.writeFileSync(T.file, S(MADE.drafts, null, 2));
  REFUSE.add(T.file); T.restart(); P.drop(); P.reconnect(); await unreadOn(P);
  REFUSE.delete(T.file); await T.store._hold.again(); await sleep(5);
  const out = { a: T.store.get('chat:sess-a'), box: P.sync.get('drafts', 'chat:sess-a') };
  T.store._hold.stop();
  return out;
};
const oneScene = async (cls, Store, tag, { missed = false } = {}) => {   // a store born empty; ONE draft (version 1); held; a torn lift AT VERSION 1
  const T = world('drafts', { readable: true, cls, Store });
  fs.writeFileSync(T.file, S({ version: 0, data: {} })); T.restart();
  const P = T.page('v1-' + tag);
  await P.sync.init('drafts');
  P.sync.set('drafts', 'chat:sess-a', 'the one draft, version 1');
  await until(() => { const d = disk(T.file); return !!(d && d.version === 1); }, 500);
  REFUSE.add(T.file); T.restart(); P.drop(); P.reconnect(); await unreadOn(P);   // held: unread, its last version 1
  if (missed) P.drop();                                                         // …and its socket is down at the lift
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again(); await sleep(5);
  const version = T.store.version;
  if (missed) { P.reconnect(); await sleep(5); }                                // its resync, still unread: the full snapshot
  const out = { version, pageVersion: P.sync.stores.drafts.version, a: T.store.get('chat:sess-a'), box: P.sync.get('drafts', 'chat:sess-a') };
  T.store._hold.stop();
  return out;
};
{
  const R1 = await tornScene(CLASS, 'real');
  ok(R1.a === SAVED && R1.box === SAVED && R1.disk === SAVED, `a TORN lift at version 1 under a page that saw 41: the page's drafts of before the hold are on the hub, in the file and in the box (${S(R1.a)})`);
  ok(R1.b === 'typed while held' && R1.bSets === 1 && R1.doc === undefined && R1.docSets === 0, `…a unit typed while held joins, sent ONCE; a unit cleared while held is not pushed back (its deletion is nothing, the file gave none) (${S({ b: R1.b, bSets: R1.bSets, doc: R1.doc, docSets: R1.docSets })})`);
  const OLDGUARD = pageCopy('    if (rolledBack && sawBefore) {\n', '    if (rolledBack && !wasUnread) {\n', 'old-guard');
  const RX = await tornScene(OLDGUARD, 'oldguard');
  ok(RX.a !== SAVED && RX.box !== SAVED, `CONTROL (today's guard, which skipped a page held unread): every saved draft gone from the hub and the box (red) (${S({ a: RX.a, box: RX.box })})`);
  const V1 = await lowerScene(CLASS, 'real');
  ok(V1.a === 'the newer draft, saved at 42' && V1.box === 'the newer draft, saved at 42', `a lift at a LOWER version (41) than the page's (42): the page's newer draft stands (${S(V1.a)})`);
  const VX = await lowerScene(OLDGUARD, 'oldguard');
  ok(VX.a === SAVED && VX.box === SAVED, `CONTROL (the same guard): the file's older draft replaces the newer one on the hub and the page (red) (${S(VX)})`);
  // the counter begins again at a fresh lift: a page's last version can be the lift's number by chance — the compare is safe
  // against it (the lift's snapshot and an unread page's resync say `fresh`)
  const O1 = await oneScene(CLASS, SyncStore, 'real');
  ok(O1.version >= 1 && O1.a === 'the one draft, version 1' && O1.box === 'the one draft, version 1', `a page whose last version (1) is the torn lift's own number: its draft is pushed again all the same (hub ${S(O1.a)})`);
  const NOFRESH = pageCopy('    const rolledBack = (version || 0) < s.version || fresh;\n', '    const rolledBack = (version || 0) < s.version;\n', 'no-fresh');   // stale-pins: kept — the red copy's own text (the compare by the number alone), meant to be absent
  const OX = await oneScene(NOFRESH, SyncStore, 'nofresh');
  ok(OX.pageVersion === 1 && OX.a === undefined && OX.box === undefined, `CONTROL (a page copy whose rollback compare is the number alone): the draft is gone from the hub and the page (red) (${S(OX)})`);
  const O2 = await oneScene(CLASS, SyncStore, 'missed', { missed: true });
  ok(O2.a === 'the one draft, version 1' && O2.box === 'the one draft, version 1', `the same page with its socket down at the lift: its resync, still unread, is told the counter began again, and its draft comes back (${S(O2.a)})`);
  const RESYNC_NUMBER = M.load('src/sync-store.js', anchored(SRC, "version: this.version, ...(this._freshLife ? { fresh: true } : {}) }];", "version: this.version }];", 'resync-number'), 'resync-number').SyncStore;   // stale-pins: kept — the red copy's own text (the resync by the number alone), meant to be absent
  const O2X = await oneScene(CLASS, RESYNC_NUMBER, 'missed-x', { missed: true });
  ok(O2X.a === undefined && O2X.box === undefined, `CONTROL (a hub copy whose unread resync carries the number alone): the draft is gone (red) (${S(O2X)})`);
}

console.log('⑱ THE RACE AT A PAGE\'s START (r3972) — the held reply that hands owed words, read after the lift\'s snapshot: the words land');
const startRace = async (cls, tag) => {
  let release; const gate = new Promise((r) => { release = r; });
  const Q = world('drafts', { cls, fetchGate: () => gate });
  DOOR.create({ getSyncStore: (n) => Q.stores[n], log: () => { } }).onLiveRecord({}, 'sess-a', dropped('d-r-' + tag));   // owed: no page open
  const p = Q.page('race-' + tag);
  const loading = p.sync.init('drafts');           // its 503 hands the owed words NOW (the hub's copy leaves); the answer waits
  REFUSE.delete(Q.file); await Q.store._hold.again(); await sleep(5);   // the lift's snapshot reaches the page FIRST
  release(); await loading; await sleep(5);
  const out = { owedLeft: (Q.store._owed || []).length, hub: Q.store.get('chat:sess-a'), box: p.sync.get('drafts', 'chat:sess-a') };
  Q.store._hold.stop();
  return out;
};
{
  const S1 = await startRace(CLASS, 'real');
  ok(S1.owedLeft === 0 && S1.hub === PREFIX + SAVED && S1.box === PREFIX + SAVED, `the hub handed the words in its reply; the page read the reply late and landed them all the same, in front of the saved draft (${S(S1.hub)})`);
  const DROPS = pageCopy("        if ((s.snapEpoch || 0) !== epoch) { for (const pb of handed) this._landPutback(storeName, pb, snap.code); return true; }\n", "        if ((s.snapEpoch || 0) !== epoch) return true;\n", 'drops-reply');
  const SX = await startRace(DROPS, 'drops');
  ok(SX.hub === SAVED, `CONTROL (a page copy that drops the whole reply as old): the words are on no page and the hub has nothing left to lay (red) (${S(SX.hub)})`);
}

console.log('⑲ A PAGE THAT CONNECTS WHILE HELD takes the owed words; the owed list keeps at most 20, the oldest dropped, said');
const connectScene = async (Store, tag) => {
  const Q = world('drafts', { Store });
  DOOR.create({ getSyncStore: (n) => Q.stores[n], log: () => { } }).onLiveRecord({}, 'sess-a', dropped('d-h-' + tag));   // owed: no page open
  const owedBefore = (Q.store._owed || []).length;
  const p = Q.page('conn-' + tag);
  await p.sync.init('drafts');                       // connects while still held: handed
  const atConnect = { owedLeft: (Q.store._owed || []).length, box: p.sync.get('drafts', 'chat:sess-a') };
  REFUSE.delete(Q.file); await Q.store._hold.again(); await sleep(5);
  const out = { owedBefore, atConnect, hub: Q.store.get('chat:sess-a') };
  Q.store._hold.stop();
  return out;
};
const boundScene = async (Store, tag) => {
  const Q = world('drafts', { Store });
  const said = [], oWarn = console.warn;
  console.warn = (...a) => { said.push(a.map(String).join(' ')); };
  try {
    for (let i = 1; i <= 21; i++) Q.store.heldPutBack('chat:sess-a', `queued ${i}\n\n`);
    return { owed: (Q.store._owed || []).length, first: (Q.store._owed || [])[0] && Q.store._owed[0].prefix, said: said.filter((l) => /the oldest is dropped/.test(l)).length };
  } finally { console.warn = oWarn; Q.store._hold.stop(); }
};
{
  const C1 = await connectScene(SyncStore, 'real');
  ok(C1.owedBefore === 1 && C1.atConnect.owedLeft === 0 && C1.atConnect.box === PREFIX, `owed with no page open; the page that connects while held takes the words (in its box: ${S(C1.atConnect.box)}) and the hub's copy leaves`);
  ok(C1.hub === SAVED + '\n\n' + PREFIX, `…at the lift they arrive from that page, once (it opened during the hold: its text joins after the saved draft) (${S(C1.hub)})`);
  const NOHAND = M.load('src/sync-store.js', anchored(SRC, "    if (h) { const owed = this._handOwed(); return", "    if (h) { const owed = []; return", 'no-hand-at-start'), 'no-hand-at-start').SyncStore;
  const CX = await connectScene(NOHAND, 'nohand');
  ok(CX.atConnect.owedLeft === 1 && CX.atConnect.box !== PREFIX, `CONTROL (a hub copy that hands nothing at a page's start): the page's box lacks the words while the hub still owes them (red) (${S(CX.atConnect)})`);
  const B1 = await boundScene(SyncStore, 'real');
  ok(B1.owed === 20 && B1.first === 'queued 2\n\n' && B1.said >= 1, `the owed list keeps 20: the oldest (queued 1) dropped, said (${S(B1)})`);
  const NOBOUND = M.load('src/sync-store.js', anchored(SRC, '    if (this._owed.length > OWED_MAX) {', '    if (false) {', 'no-bound'), 'no-bound').SyncStore;
  const BX = await boundScene(NOBOUND, 'nobound');
  ok(BX.owed === 21, `CONTROL (a hub copy with no bound): 21 owed (red) (${S(BX)})`);
}

console.log('⑳ LAW (E) (r4040) — a restore never beats a write, and the hub decides');
const KK = 'chat:sess-a', LL = 'chat:sess-b', MM = 'chat:sess-m';
const BLIND = anchored(anchored(anchored(CLASS,
  '      for (const key of oldKeys) {\n', '      for (const key of new Set([...oldKeys, ...Object.keys(s.data)])) {\n', 'blind-a'),   // stale-pins: kept — the red copy's own text (today's blind set), meant to be absent
  "        const localVal = oldData[key];\n        if (localVal === undefined || localVal === '') continue;\n", "        const localVal = oldData[key] ?? '';\n", 'blind-b'),   // stale-pins: kept — the red copy's own text (today's blind set), meant to be absent
  'this._restore(storeName, key, localVal);', 'this.set(storeName, key, localVal);', 'blind-c');   // stale-pins: kept — the red copy's own text (today's blind set), meant to be absent (as at 0ead09fad)
const UNDECIDED = () => M.load('src/sync-store.js', anchored(SRC, "    if (value != null && value !== '' && !this._lifeWrites.has(key)) { this.set(key, value, senderWs, basedOn); return 'applied'; }", "    if (value != null && value !== '') { this.set(key, value, senderWs, basedOn); return 'applied'; }", 'undecided'), 'undecided').SyncStore;
const box3 = (p) => ({ K: p.sync.get('drafts', KK), L: p.sync.get('drafts', LL), M: p.sync.get('drafts', MM) });
const sceneOne = async (cls, Store, tag) => {   // B open at a torn lift, A's socket down (a closed laptop); an hour on B; A wakes
  const T = world('drafts', { readable: true, cls, Store });
  const A = T.page('one-a-' + tag), B = T.page('one-b-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); B.drop(); A.reconnect(); B.reconnect(); await unreadOn(A, B);   // held: both unread
  A.drop();
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again(); await until(() => T.store.get(KK) === SAVED, 500);   // the torn lift: B restores the drafts it saw
  const restoredByB = T.store.get(KK) === SAVED && T.store.get(LL) === MADE.drafts.data[LL];
  B.sync.set('drafts', KK, 'K rewritten on B'); B.sync.set('drafts', LL, ''); B.sync.set('drafts', MM, 'M typed on B');
  A.reconnect();                                                   // A wakes: still unread — the whole snapshot, with the fresh mark
  await until(() => A.sync.stores.drafts && !A.sync.stores.drafts.unread && A.sync.stores.drafts.pending.size === 0, 500);
  await until(() => { const d = disk(T.file); return !!(d && d.data && d.data[MM] === T.store.get(MM) && d.data[KK] === T.store.get(KK)); }, 500);
  const d = disk(T.file) || { data: {} };
  const out = { restoredByB, hub: { K: T.store.get(KK), L: T.store.get(LL), M: T.store.get(MM) }, disk: { K: d.data[KK], L: d.data[LL], M: d.data[MM] }, boxB: box3(B), boxA: box3(A),
    refused: A.heard.filter((m) => m.type === 'state-restore-refused').map((m) => m.key).sort(), aPushedM: setsOf(A, MM).length };
  T.store._hold.stop();
  return out;
};
const sceneTwo = async (cls, Store, tag, first) => {   // at the lift: B typed K while held (rule (C)); idle A restores the old K
  const T = world('drafts', { readable: true, cls, Store });
  const A = T.page('two-a-' + tag), B = T.page('two-b-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); B.drop(); A.reconnect(); B.reconnect(); await unreadOn(A, B);
  const TYPED = SAVED + ' — and the words B typed while held';
  B.sync.set('drafts', KK, TYPED);
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  A.hold(); B.hold();
  await T.store._hold.again();                                     // the lift's snapshot reaches both; each page's answer waits
  for (const p of (first === 'B' ? [B, A] : [A, B])) p.release();  // the two arrivals PLACED at the hub in this order
  await until(() => [A, B].every((p) => p.sync.stores.drafts.pending.size === 0), 500);
  const second = first === 'B' ? A : B;
  const out = { TYPED, hub: T.store.get(KK), boxA: A.sync.get('drafts', KK), boxB: B.sync.get('drafts', KK),
    secondRefusedL: second.heard.some((m) => m.type === 'state-restore-refused' && m.key === LL), hubL: T.store.get(LL) };
  T.store._hold.stop();
  return out;
};
{
  const E1 = await sceneOne(CLASS, SyncStore, 'real');
  ok(E1.restoredByB, 'scene one: at the torn lift the open page B restores the drafts it saw (nothing was written in the new life)');
  ok(E1.hub.K === 'K rewritten on B' && E1.hub.L === undefined && E1.hub.M === 'M typed on B' && S(E1.disk) === S(E1.hub) && S(E1.boxB) === S(E1.hub),
    `scene one: page A wakes late with the fresh mark — B's hour stands on the hub, in the file and in B's box: K rewritten, L sent, M new (${S(E1.hub)})`);
  ok(S(E1.boxA) === S({ K: 'K rewritten on B', L: undefined, M: 'M typed on B' }) && E1.refused.includes(KK) && E1.refused.includes(LL),
    `…A's restores of K and L are REFUSED (written in this life) and A then shows the hub's values (${S(E1.refused)}; A ${S(E1.boxA)})`);
  ok(E1.aPushedM === 0, 'a page never restores ABSENCE: A lacks M and pushes nothing for it');
  const E1X = await sceneOne(BLIND, SyncStore, 'blind');
  ok(E1X.hub.K === SAVED || E1X.hub.M === undefined, `CONTROL (today's blind set, a page copy): A's old copy is written over B's hour — K back to the old text, M deleted (red) (${S(E1X.hub)})`);
  const E1H = await sceneOne(CLASS, UNDECIDED(), 'undecided');
  ok(E1H.hub.K === SAVED, `CONTROL (a hub copy that applies every restore): the hub does not decide — K back to A's old text (red) (${S(E1H.hub)})`);
  for (const first of ['A', 'B']) {
    const E2 = await sceneTwo(CLASS, SyncStore, 'real-' + first, first);
    ok(E2.hub === E2.TYPED && E2.boxA === E2.TYPED && E2.boxB === E2.TYPED, `scene two, ${first === 'A' ? "A's restore" : "B's typed text"} arriving FIRST: B's typed words stand on the hub and on both pages (${S(E2.hub)})`);
    ok(E2.secondRefusedL && E2.hubL === MADE.drafts.data[LL], `…the key both pages restore (L): the first applies, the second page's restore is refused (an applied restore is a write)`);
  }
  const E2X = await sceneTwo(BLIND, SyncStore, 'blind-B', 'B');
  // every store keeps the set, a MIRROR with no file too (a subclass's: the grants, the feedback) — its writes and restores
  const mirrorScene = (Store) => { try { const X = new Store('mirror', null, { clients: new Set() }); X.set('a', 'written'); const r1 = X.restore('a', 'old', null), r2 = X.restore('b', 'kept', null); return { a: X.get('a'), b: X.get('b'), r1, r2 }; } catch (e) { return { threw: String(e && e.message) }; } };
  const MR = mirrorScene(SyncStore);
  ok(MR.a === 'written' && MR.b === 'kept' && MR.r1 === 'refused' && MR.r2 === 'applied', `a store with NO file (a mirror) takes its writes and decides its restores (${S(MR)})`);
  const NOTMIRROR = M.load('src/sync-store.js', anchored(anchored(SRC, "    this._lifeWrites = new Set();\n    this._lifeLaid = new Set();", "    this._lifeLaid = new Set();", 'set-with-file-only-a'), "    if (this.filePath) this._load();\n", "    if (this.filePath) { this._load(); this._lifeWrites = new Set(); }\n", 'set-with-file-only-b'), 'set-with-file-only').SyncStore;
  const MX = mirrorScene(NOTMIRROR);
  ok(!!MX.threw, `CONTROL (a hub copy that keeps the set only for a store with a file): a mirror's first write throws (red) (${S(MX)})`);
  ok(E2X.hub === SAVED, `CONTROL (today's blind set), B's text first and A's old copy last: B's typed words gone from the hub (red) (${S(E2X.hub)})`);
}

console.log('㉑ THE FOLLOW (r4106) — an owed put-back and the page\'s earlier draft both stand; a hub write is never beaten; one lift a life');
const NOJOIN = () => M.load('src/sync-store.js', anchored(SRC, "    if (typeof value === 'string' && value !== '' && this._lifeLaid.has(key) && typeof this.data[key] === 'string') {\n", "    if (false) {\n", 'no-join'), 'no-join').SyncStore;
const owedScene = async (Store, tag) => {   // no page open at the Stop (owed); a torn lift lays the words; the page comes back with its draft
  const T = world('drafts', { readable: true, Store });
  const A = T.page('ow-' + tag);
  await A.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); A.reconnect(); await unreadOn(A);
  A.drop();
  DOOR.create({ getSyncStore: (n) => T.stores[n], log: () => { } }).onLiveRecord({}, 'sess-a', dropped('d-ow-' + tag));
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again();
  const laid = T.store.get(KK);
  A.reconnect();
  await until(() => A.sync.stores.drafts && !A.sync.stores.drafts.unread && A.sync.stores.drafts.pending.size === 0, 500);
  await until(() => { const d = disk(T.file); return !!(d && d.data && d.data[KK] === T.store.get(KK)); }, 500);
  const d = disk(T.file) || { data: {} };
  const out = { laid, hub: T.store.get(KK), box: A.sync.get('drafts', KK), disk: d.data[KK], joinedSaid: A.heard.some((m) => m.type === 'state-restore-refused' && m.key === KK && m.joined === true) };
  T.store._hold.stop();
  return out;
};
const restoreFirst = async (tag) => {   // the other order: the page's restore lands first, a Stop's put-back after it (the ordinary road)
  const T = world('drafts', { readable: true });
  const A = T.page('rf-' + tag);
  await A.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); A.reconnect(); await unreadOn(A);
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again(); await until(() => T.store.get(KK) === SAVED, 500);
  DOOR.create({ getSyncStore: (n) => T.stores[n], log: () => { } }).onLiveRecord({}, 'sess-a', dropped('d-rf-' + tag));
  await until(() => A.sync.get('drafts', KK) === PREFIX + SAVED, 500);
  const out = { hub: T.store.get(KK), box: A.sync.get('drafts', KK) };
  T.store._hold.stop();
  return out;
};
const hubWriteScene = async (Store, tag, { again = false } = {}) => {   // after the torn lift the HUB writes K itself (or a page writes K and the hold is asked again); A wakes late
  const T = world('drafts', { readable: true, Store });
  const A = T.page('hw-a-' + tag), B = T.page('hw-b-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); B.drop(); A.reconnect(); B.reconnect(); await unreadOn(A, B);
  A.drop(); B.drop();
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again();
  let secondLift = null;
  if (again) { B.reconnect(); await until(() => B.sync.stores.drafts.pending.size === 0 && !B.sync.stores.drafts.unread, 500); B.sync.set('drafts', KK, 'K written on B'); secondLift = await T.store._hold.again(); }
  else T.store.set(KK, 'K the hub wrote itself', null);
  const wrote = T.store.get(KK);
  A.reconnect();
  await until(() => A.sync.stores.drafts && !A.sync.stores.drafts.unread && A.sync.stores.drafts.pending.size === 0, 500);
  const out = { wrote, secondLift, hub: T.store.get(KK), box: A.sync.get('drafts', KK), refused: A.heard.some((m) => m.type === 'state-restore-refused' && m.key === KK) };
  T.store._hold.stop();
  return out;
};
const boxScene = async (tag, { typeMeanwhile = false, cls = CLASS } = {}) => {   // B wrote K after the torn lift; A wakes; while A's restore is out, its box shows…
  const T = world('drafts', { readable: true, cls });
  const A = T.page('bx-a-' + tag), B = T.page('bx-b-' + tag);
  await A.sync.init('drafts'); await B.sync.init('drafts');
  REFUSE.add(T.file); T.restart(); A.drop(); B.drop(); A.reconnect(); B.reconnect(); await unreadOn(A, B);
  A.drop();
  fs.writeFileSync(T.file, TORN_BYTES); REFUSE.delete(T.file);
  await T.store._hold.again(); await until(() => T.store.get(KK) === SAVED, 500);
  B.sync.set('drafts', KK, 'K rewritten on B');
  const told = [];
  A.sync.on('drafts', KK, (v) => told.push(v));
  A.hold(); A.reconnect(); A.releaseOne();                         // only A's resync reaches the hub: the snapshot comes back, A's restore of K waits at the page
  await until(() => A.sync.stores.drafts && !A.sync.stores.drafts.unread, 500);
  const inFlight = A.sync.get('drafts', KK);
  if (typeMeanwhile) A.sync.set('drafts', KK, 'typed on A meanwhile');   // the person types while the restore is out
  A.release();
  await until(() => A.sync.stores.drafts.pending.size === 0, 500);
  const out = { told: told.slice(), inFlight, hub: T.store.get(KK), box: A.sync.get('drafts', KK) };
  T.store._hold.stop();
  return out;
};
{
  const F1 = await owedScene(SyncStore, 'real');
  ok(F1.laid === PREFIX && F1.hub === PREFIX + SAVED && F1.box === PREFIX + SAVED && F1.disk === PREFIX + SAVED && F1.joinedSaid,
    `an owed put-back laid at a torn lift, then the page's draft of before the hold: BOTH stand, joined (the words in front) — on the hub, in the box, in the file (${S(F1.hub)})`);
  const F1X = await owedScene(NOJOIN(), 'nojoin');
  ok(F1X.hub === PREFIX && F1X.box === PREFIX, `CONTROL (today's refusal, a hub copy without the join): the page's earlier draft is gone — only the put-back's words (red) (${S(F1X)})`);
  const F2 = await restoreFirst('real');
  ok(F2.hub === PREFIX + SAVED && F2.box === PREFIX + SAVED, `the other order — the page's restore first, a Stop's put-back after it: both stand, the words in front (${S(F2.hub)})`);
  const F3 = await hubWriteScene(SyncStore, 'real');
  ok(F3.hub === 'K the hub wrote itself' && F3.box === F3.hub && F3.refused, `a HUB write of K in this life, then a late page's restore of K: refused, the page takes the hub's value (${S(F3)})`);
  const F3X = await hubWriteScene(UNDECIDED(), 'undecided');
  ok(F3X.hub === SAVED, `CONTROL (a hub copy that applies every restore): the page's old copy beats the hub's own write (red) (${S(F3X.hub)})`);
  const F4 = await hubWriteScene(SyncStore, 'again', { again: true });
  ok(F4.secondLift === false && F4.hub === 'K written on B' && F4.refused, `no SECOND lift in one life: the hold asked again after its lift does nothing (${S(F4.secondLift)}), the life's writes stand and a late restore of K is refused`);
  const F5 = await boxScene('quiet');
  ok(!F5.told.includes(SAVED) && F5.inFlight === 'K rewritten on B' && F5.box === 'K rewritten on B' && F5.hub === F5.box, `while its restore is decided the waking page's box never shows its old text (in flight ${S(F5.inFlight)}, told ${S(F5.told)}); refused, it shows the hub's value`);
  const FLICKER = pageCopy("    (s.restoring || (s.restoring = new Map())).set(key, value);\n", "    (s.restoring || (s.restoring = new Map())).set(key, value); s.data[key] = value;\n", 'flicker');
  const F5X = await boxScene('flicker', { cls: FLICKER });
  ok(F5X.told.includes(SAVED) && F5X.inFlight === SAVED, `CONTROL (a page copy that writes its old copy at once, as before): the waking page's box shows the old text until the refusal lands (red) (${S({ told: F5X.told, inFlight: F5X.inFlight })})`);
  // a page whose socket dropped (its restores forgotten) sets a key after it reconnects: the set's ack lands like any other
  const dropScene = async (cls, tag) => {
    const T = world('drafts', { readable: true, cls });
    const P = T.page('dr-' + tag);
    await P.sync.init('drafts');
    try { P.drop(); P.reconnect(); P.sync.set('drafts', KK, 'set after a reconnect'); return { hub: T.store.get(KK), box: P.sync.get('drafts', KK), pending: P.sync.stores.drafts.pending.size, errors: P.errors.slice() }; }
    catch (e) { return { threw: String(e && e.message) }; }
  };
  const D1 = await dropScene(CLASS, 'real');
  ok(D1.hub === 'set after a reconnect' && D1.box === D1.hub && D1.pending === 0 && D1.errors.length === 0, `a page whose socket dropped, then a set: its ack lands, nothing thrown in the page (no restore is in flight after a drop) (${S(D1)})`);
  const NULLREAD = pageCopy("    const restored = s.restoring ? s.restoring.get(ack.key) : undefined;", "    const restored = s.restoring && s.restoring.get(ack.key);", 'null-read');
  const D1X = await dropScene(NULLREAD, 'nullread');
  ok(!!D1X.threw || (D1X.errors && D1X.errors.length > 0), `CONTROL (a page copy reading the dropped record as «s.restoring && …»: null is not undefined): the ack throws in the page (red) (${S(D1X)})`);
  const F6 = await boxScene('typed', { typeMeanwhile: true });
  ok(F6.hub === 'typed on A meanwhile' && F6.box === F6.hub, `a person typing in the box while its restore is out keeps what they typed (the refusal yields to the own later set; the hub takes it) (${S(F6)})`);
}

for (const s of [W]) { REFUSE.delete(s.file); if (s.store._hold) s.store._hold.stop(); }
fs.readFileSync = realReadSync; fs.promises.readFile = realRead;
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
