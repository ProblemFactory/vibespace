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
//   ⑩ THE HUB's OWN WRITER (r3654 5): the stop's put-backs while held are owed, joined in front of the draft at the lift, said by
//      count (RED: a hub copy that owes nothing — the queued messages' words lost)
//   ⑪ TORN BYTES: held while their copy is made, lifted EMPTY; a fresh page's text is sent; the snapshot names the copy
//   ⑫ settings-sync.json takes the same hold
// Run: node scripts/test-sync-store-hold.mjs
import { scratch, anchored } from './scratch.mjs';
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
const fileOf = (dir, name) => path.join(dir, name === 'drafts' ? 'drafts.json' : `${name}-sync.json`);
function world(name, { torn = false, readable = false, Store = SyncStore, cls = CLASS } = {}) {
  const dir = scratch('sync-hold-' + name); fs.mkdirSync(dir, { recursive: true });
  const file = fileOf(dir, name);
  const bytes = torn ? '{"version": 41, "data": {"chat:sess-a": "a draft cut off in the mid' : S(MADE[name], null, 2);
  fs.writeFileSync(file, bytes);
  if (!torn && !readable) REFUSE.add(file);
  const wss = { clients: new Set() };
  const stores = { [name]: new Store(name, file, wss, { saveDelay: 20 }) };
  const getSyncStore = (n) => stores[n];
  const activeSessions = new Map();
  const handle = CASES ? new Function('getSyncStore', 'activeSessions', 'putbackBelt', `return function handle(data, ws) { switch (data.type) {\n${CASES}\n} };`)(getSyncStore, activeSessions, (b, v) => v) : () => { };
  // the page's first load, through the store's own answer (the route above answers the same way)
  const fetchFake = async (url) => {
    const st = getSyncStore(String(url).split('/').pop());
    const ans = st.snapshotAnswer();
    return { ok: ans.status === 200, status: ans.status, json: async () => JSON.parse(S(ans.body)) };
  };
  const StateSync = cls ? new Function('fetch', 'arrivalVerdict', cls + '\nreturn StateSync;')(fetchFake, arrivalVerdict) : null;
  const page = (pname) => {
    const globals = [], states = [], sent = [], heard = [];
    const sock = { name: pname, readyState: 1, send(m) { const x = JSON.parse(m); heard.push(x); for (const h of globals) h(x); } };
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { sent.push(JSON.parse(S(d))); if (sock.readyState === 1) handle(JSON.parse(S(d)), sock); } };
    wss.clients.add(sock);
    const sync = new StateSync(wm);
    return { sock, sync, sent, heard, handle: (d) => handle(d, sock), reconnect: () => { sock.readyState = 1; for (const h of states) h(true); }, drop: () => { sock.readyState = 3; for (const h of states) h(false); } };
  };
  const restart = () => { const old = stores[name]; if (old && old._hold) old._hold.stop(); stores[name] = new Store(name, file, wss, { saveDelay: 20 }); return stores[name]; };   // (a restart: the old process's hold ends with it)
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

console.log('③ THE RECONNECT — a page ahead of version 0 is told HELD; it keeps what it holds and re-pushes nothing');
const P2 = W.page('page-2');
{
  const s2 = P2.sync.stores.drafts = { version: 41, data: { ...MADE.drafts.data }, listeners: new Map(), loaded: Promise.resolve(true), pending: new Map(), acked: new Map(), held: new Map(), saw: true };
  let told = 0; s2.listeners.set('*', new Set([() => { told++; }]));
  const before = P2.sent.length;
  P2.reconnect(); await sleep(5);
  const pushed = P2.sent.slice(before).filter((m) => m.type === 'state-set');
  ok(S(s2.data) === S(MADE.drafts.data) && told === 0 && pushed.length === 0 && !!P2.sync.unreadOf('drafts'), `the page keeps its ${Object.keys(s2.data).length} drafts, no listener told, ${pushed.length} re-pushed; it knows the store is held`);
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
  const KEEPS = pageCopy('    s.unread = null; s.typedWhileUnread = null; s.saw = true;\n', '    s.unread = null; s.saw = true;\n', 'map-kept');
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

console.log('⑩ THE HUB\'s OWN WRITER (r3654 5) — the stop\'s put-backs while held are owed, joined in front at the lift, said by count');
const putbackScene = async (Store, tag) => {
  const Q = world('drafts', { Store });
  const said = [], oWarn = console.warn;
  console.warn = (...a) => { said.push(a.map(String).join(' ')); };
  try {
    // the put-back's own call (src/server/queue-putback.js): store.set(key, text, null, undefined, { prepended })
    for (const t of ['first queued', 'second queued']) { const pre = t + '\n\n'; Q.store.set('chat:sess-a', pre + (Q.store.get('chat:sess-a') || ''), null, undefined, { prepended: pre.length }); }
    const heldMem = Q.store.get('chat:sess-a');
    REFUSE.delete(Q.file); await Q.store._hold.again();
    await until(() => ((disk(Q.file) || { data: {} }).data['chat:sess-a'] || '').includes('queued'), 500);
    return { heldMem, store: Q.store.get('chat:sess-a'), onDisk: (disk(Q.file) || { data: {} }).data['chat:sess-a'], said: said.filter((l) => /put-back\(s\) of queued messages/.test(l)) };
  } finally { console.warn = oWarn; Q.store._hold.stop(); }
};
{
  const want = 'second queued\n\nfirst queued\n\n' + SAVED;
  const Q1 = await putbackScene(SyncStore, 'real');
  ok(Q1.heldMem === undefined && Q1.store === want && Q1.onDisk === want, `held: nothing in the hub's memory; at the lift the put-backs land in front of the saved draft, the later first, and the file holds it (${S(Q1.store)})`);
  ok(Q1.said.length === 1 && /: 2 put-back\(s\)/.test(Q1.said[0]), `…said in the journal by count (${S(Q1.said)})`);
  const OWES = M.load('src/sync-store.js', anchored(SRC, "    if (typeof value === 'string' && n > 0) {", '    if (false) {', 'owes-nothing'), 'owes').SyncStore;
  const QX = await putbackScene(OWES, 'owes');
  ok(QX.store === SAVED, `CONTROL (a hub copy that owes nothing): the queued messages' words are lost at the lift (red) (${S(QX.store)})`);
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

for (const s of [W]) { REFUSE.delete(s.file); if (s.store._hold) s.store._hold.stop(); }
fs.readFileSync = realReadSync; fs.promises.readFile = realRead;
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
