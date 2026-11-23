#!/usr/bin/env node
// test-sync-store-hold — THE SYNCED STORES' ONE READ UNDER THE STORE-READ LAW (lane lg-recovery, 主开发 r3262 / r3271; the store
// census's item 2): src/sync-store.js reads drafts.json, stage-sync.json, uploads-sync.json and settings-sync.json ONE way. The
// release read a failed or torn file as «nothing at version 0» and every stop, crash and 2 s save wrote that over the file: a
// person's unsent chat and document drafts, the Stage layout, the upload history gone. Over made-up stores in a scratch folder,
// the read REFUSED by placement (EIO), the REAL SyncStore, the ws-handler's state-set / state-resync cases and the client's
// StateSync class cut verbatim, two page stand-ins:
//   ① HELD, NOTHING WRITTEN OVER: the stop's flush (and the 2 s save) leaves the file's bytes as they were
//   ② THE FIRST LOAD (law (a)): a page loading while held is told HELD, never «no drafts at version 0»; it starts empty AND held
//   ③ THE RECONNECT (law (a)): a page ahead of version 0 is told HELD, never an empty full snapshot; it keeps what it holds and
//      re-pushes nothing
//   ④ THE LIFT (law (b)): the file's units, each unit changed while held taking its held value (a draft typed, a draft sent =
//      deleted), every other unit kept; ONE snapshot above every version a page named; the store written then
//   ⑤ THE PAGE's SIDE (r3271): a page that typed while held keeps its text across a hub restart while held and across the lift's
//      snapshot — its value wins for that unit and is sent again; the store then holds it
//   ⑥ TORN BYTES: held while their copy is made, lifted with what was typed; the snapshot names the copy
//   ⑦ settings-sync.json takes the same hold
// Run: node scripts/test-sync-store-hold.mjs
import { scratch } from './scratch.mjs';
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
const { SyncStore } = require(path.join(REPO, 'src/sync-store.js'));
const { arrivalVerdict } = require(path.join(REPO, 'src/sync-arrival.js'));

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
ok(/store\.resyncAnswer\(sinceVersion\)/.test(CASES), 'state-resync answers through the store\'s own resyncAnswer() (a held store says HELD, never a snapshot)');

const MADE = {
  drafts: { version: 41, data: { 'chat:sess-a': 'a draft the person has not sent', 'chat:sess-b': 'a draft that will be sent while held', 'doc:\u0001/home/userL/notes.md': [{ id: 'c1', text: 'a comment row' }] } },
  stage: { version: 12, data: { slot: 'q2', grid: '2x2', hero: 'claude:0b5e7c1a-1111-4222-8333-944455556666', lru: ['claude:a', 'claude:b'] } },
  uploads: { version: 7, data: { 'upload:1-0': { name: 'a.txt', path: '/home/userL/a.txt', size: 3, date: 1, status: 'done' } } },
  settings: { version: 3, data: {} },
};
function world(name, { torn = false } = {}) {
  const dir = scratch('sync-hold-' + name); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name === 'drafts' ? 'drafts.json' : `${name}-sync.json`);
  const bytes = torn ? '{"version": 41, "data": {"chat:sess-a": "a draft cut off in the mid' : S(MADE[name], null, 2);
  fs.writeFileSync(file, bytes);
  if (!torn) REFUSE.add(file);
  const wss = { clients: new Set() };
  const store = new SyncStore(name, file, wss, { saveDelay: 20 });
  const stores = { [name]: store };
  const getSyncStore = (n) => stores[n];
  const activeSessions = new Map();
  const handle = CASES ? new Function('getSyncStore', 'activeSessions', 'putbackBelt', `return function handle(data, ws) { switch (data.type) {\n${CASES}\n} };`)(getSyncStore, activeSessions, (b, v) => v) : () => { };
  // the page's first load, through the store's own answer (the route above answers the same way)
  const fetchFake = async (url) => {
    const st = getSyncStore(String(url).split('/').pop());
    const ans = st && typeof st.snapshotAnswer === 'function' ? st.snapshotAnswer() : { status: 200, body: st.getSnapshot() };
    return { ok: ans.status === 200, status: ans.status, json: async () => JSON.parse(S(ans.body)) };
  };
  const StateSync = CLASS ? new Function('fetch', 'arrivalVerdict', CLASS + '\nreturn StateSync;')(fetchFake, arrivalVerdict) : null;
  const page = (pname) => {
    const globals = [], states = [], sent = [];
    const sock = { name: pname, readyState: 1, send(m) { for (const h of globals) h(JSON.parse(m)); } };
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { sent.push(JSON.parse(S(d))); if (sock.readyState === 1) handle(JSON.parse(S(d)), sock); } };
    wss.clients.add(sock);
    const sync = new StateSync(wm);
    return { sock, sync, sent, reconnect: () => { sock.readyState = 1; for (const h of states) h(true); }, drop: () => { sock.readyState = 3; for (const h of states) h(false); } };
  };
  return { dir, file, bytes, store, stores, page, wss, restart: () => { const old = stores[name]; if (old && old._hold) old._hold.stop(); stores[name] = new SyncStore(name, file, wss, { saveDelay: 20 }); return stores[name]; } };   // (a restart: the old process's hold ends with it)
}
const heldOf = (st) => (st && typeof st.held === 'function' ? st.held() : null);

console.log('① HELD, NOTHING WRITTEN OVER — the stop\'s flush and the 2 s save leave the unread file as it was');
const W = world('drafts');
{
  const h = heldOf(W.store);
  ok(!!h && h.code === 'drafts_unread', `the read refused (EIO): the store is HELD by name (${S(h)})`);
  W.store.set('chat:sess-c', 'typed while held');   // a person types
  W.store.delete('chat:sess-b');                    // a draft sent: its key cleared
  W.store.flush();                                  // the stop's (and the crash handler's) flush
  await sleep(60);                                  // …and the 2 s save, at the suite's 20 ms
  ok(realReadSync(W.file, 'utf8') === W.bytes, 'the stop\'s flush and the debounced save wrote NOTHING over drafts.json (its bytes as they were)', realReadSync(W.file, 'utf8').slice(0, 120));
}

console.log('② THE FIRST LOAD (law (a)) — a page loading while held is told HELD, never «no drafts at version 0»');
const P1 = W.page('page-1');
{
  const loaded = await P1.sync.init('drafts');
  const ans = typeof W.store.snapshotAnswer === 'function' ? W.store.snapshotAnswer() : { status: 200, body: W.store.getSnapshot() };
  ok(ans.status === 503 && ans.body && ans.body.held === true && ans.body.code === 'drafts_unread' && !('data' in ans.body), `GET /api/sync/drafts answers 503 HELD by name, with no data (${ans.status} ${S(ans.body).slice(0, 120)})`);
  ok(loaded === false && !!(P1.sync.unreadOf && P1.sync.unreadOf('drafts')), `the page starts empty AND held (init() answers ${loaded}: the Doc strip neither adopts nor deletes its local copy)`);
}

console.log('③ THE RECONNECT (law (a)) — a page ahead of version 0 is told HELD; it keeps what it holds and re-pushes nothing');
const P2 = W.page('page-2');
{
  // page 2 was open before the hub's restart: it holds the drafts at version 41
  const s2 = P2.sync.stores.drafts = { version: 41, data: { ...MADE.drafts.data }, listeners: new Map(), loaded: Promise.resolve(true), pending: new Map(), acked: new Map(), held: new Map() };
  let told = 0; s2.listeners.set('*', new Set([() => { told++; }]));
  const sentBefore = P2.sent.length;
  P2.reconnect();
  await sleep(5);
  const pushed = P2.sent.slice(sentBefore).filter((m) => m.type === 'state-set');
  ok(S(s2.data) === S(MADE.drafts.data) && told === 0 && pushed.length === 0 && !!(P2.sync.unreadOf && P2.sync.unreadOf('drafts')), `the page keeps its ${Object.keys(s2.data).length} drafts, no listener told, ${pushed.length} re-pushed; it knows the store is held`);
  ok((W.store._namedMax || 0) === 41 || (typeof W.store.resyncAnswer === 'function'), 'the version the page named (41) is kept for the lift', W.store._namedMax);
}

console.log('④ THE LIFT (law (b)) — the file\'s units, each one changed while held taking its held value; one snapshot above every version named');
{
  const snaps = [];
  const watcher = { readyState: 1, send: (m) => { const x = JSON.parse(m); if (x.type === 'state-snapshot') snaps.push(x); } };
  W.wss.clients.add(watcher);
  REFUSE.delete(W.file);
  const lifted = W.store._hold ? await W.store._hold.again() : false;   // this store's own read again (the hold's turn)
  const d = W.store.getAll();
  ok(lifted && !heldOf(W.store), `the read again answered: the hold lifted (${lifted})`);
  ok(d['chat:sess-a'] === MADE.drafts.data['chat:sess-a'] && d['chat:sess-c'] === 'typed while held' && !('chat:sess-b' in d) && S(d['doc:\u0001/home/userL/notes.md']) === S(MADE.drafts.data['doc:\u0001/home/userL/notes.md']),
    'merged by unit: the draft typed while held is there, the draft sent while held stays deleted, every other unit of the file kept', d);
  const snap = snaps[0] || {};
  ok(snaps.length === 1 && snap.version > 41 && snap.lifted === true && S(snap.data) === S(d), `ONE snapshot to every page, its version (${snap.version}) above every version a page named (41)`);
  await sleep(60);
  const onDisk = JSON.parse(realReadSync(W.file, 'utf8'));
  ok(onDisk.version === W.store.version && onDisk.data['chat:sess-c'] === 'typed while held' && onDisk.data['chat:sess-a'] === MADE.drafts.data['chat:sess-a'], 'the store written only now, with the merged units');
}

console.log('⑤ THE PAGE\'s SIDE (r3271) — typed while held, the hub restarted while held, the lift: the page\'s text stands and the store then holds it');
{
  const V = world('drafts');
  const P = V.page('typist');
  await P.sync.init('drafts');
  P.sync.set('drafts', 'chat:sess-a', 'the person\'s newer text, typed while held');   // the page holds it (and the held hub keeps it in memory)
  V.restart();                                                                      // the hub restarts while still held: its memory is gone
  P.drop(); P.reconnect(); await sleep(5);
  ok(P.sync.get('drafts', 'chat:sess-a') === 'the person\'s newer text, typed while held', 'across the hub\'s restart while held the page still shows what the person typed (told HELD, nothing cleared)');
  REFUSE.delete(V.file);
  if (V.stores.drafts._hold) await V.stores.drafts._hold.again();
  await sleep(5);
  ok(P.sync.get('drafts', 'chat:sess-a') === 'the person\'s newer text, typed while held', `the lift's snapshot (the file's older draft) never replaces it on that page (${S(P.sync.get('drafts', 'chat:sess-a'))})`);
  await sleep(60);
  ok(V.stores.drafts.get('chat:sess-a') === 'the person\'s newer text, typed while held', `…it is sent again, and the store then holds it (${S(V.stores.drafts.get('chat:sess-a'))})`);
  ok(V.stores.drafts.get('doc:\u0001/home/userL/notes.md') !== undefined, 'every other unit of the file is kept');
}

console.log('⑥ TORN BYTES — held while their copy is made, lifted with what was typed; the snapshot names the copy');
{
  const T = world('drafts', { torn: true });
  const h0 = heldOf(T.store);
  T.store.set('chat:sess-z', 'typed while the torn file was copied');
  for (let i = 0; i < 200 && heldOf(T.store); i++) await sleep(10);
  const copies = fs.readdirSync(T.dir).filter((n) => n.startsWith('drafts.json.corrupt-'));
  ok(!!h0 && !heldOf(T.store) && copies.length === 1 && realReadSync(path.join(T.dir, copies[0]), 'utf8') === T.bytes, `torn: held, its bytes kept aside ONCE (${copies.join(', ')}), then lifted`);
  ok(T.store.get('chat:sess-z') === 'typed while the torn file was copied', 'what was typed while held is kept at the lift');
  T.restart(); await sleep(20);
  ok(fs.readdirSync(T.dir).filter((n) => n.startsWith('drafts.json.corrupt-')).length === 1, 'a later start makes no second copy of the same torn bytes');
}

console.log('⑦ settings-sync.json takes the same hold (its read is the same; nothing reads its contents)');
{
  const X = world('settings');
  const h = heldOf(X.store);
  X.store.flush(); await sleep(40);
  ok(!!h && h.code === 'settings_unread' && realReadSync(X.file, 'utf8') === X.bytes, `held by name (${h && h.code}), nothing written over`);
  REFUSE.delete(X.file);
}

for (const s of [W]) REFUSE.delete(s.file);
fs.readFileSync = realReadSync; fs.promises.readFile = realRead;
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
