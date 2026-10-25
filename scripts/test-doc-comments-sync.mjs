#!/usr/bin/env node
// A DOCUMENT'S COMMENTS ARE VIBESPACE'S, NOT ONE BROWSER'S (lane doc-comments-synced — owner 2026-10-12: his eighteen
// comments "disappeared"; they were in another computer's browser). Fast, in-process: the REAL server SyncStore
// (src/sync-store.js) behind the REAL `state-set` / `state-resync` cases of src/ws-handler.js (cut verbatim), and two REAL
// client StateSync instances (src/lib/utils.js's class, cut verbatim) over fake sockets — the path the Doc window's strip
// writes through (saveDraft('doc', …) ⇒ the `drafts` store's `doc:<host>\u0001<path>` key):
//   ① client A writes a document's comment rows ⇒ the store holds them ⇒ client B's listener gets them (A's own does not:
//     the sender is skipped, so a write never waits for an echo) ⇒ data/drafts.json holds them after the flush
//   ② B removes one ⇒ A sees one; an emptying ('' — Send all) deletes the key on the server and on A
//   ③ init() is ONE load: a second caller awaits the same snapshot (true once it is in); an unreadable store answers false
//   ④ a reconnect: A was offline while B wrote ⇒ state-resync hands A the missed op
//   ⑤ CONTROLS: a patched state-set that keeps only `chat:` keys ⇒ ① goes red (the leg can see a refused key family);
//     the old init (a second caller returned at once) ⇒ ③ goes red
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : '')); } return !!c; };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const S = JSON.stringify;
const { SyncStore } = require('../src/sync-store.js');
const { arrivalVerdict } = require('../src/sync-arrival.js'); // the class's one import (lane statesync-last-arrival: StateSync's arrival rule)
const M = require('../src/doc-model.js');

// ── the real code, cut verbatim ──
const handler = read('src/ws-handler.js');
const a = handler.indexOf("        case 'state-set': {"), b = handler.indexOf("        case 'layout-sync': {");
const CASES = a > 0 && b > a ? handler.slice(a, b) : '';
const utils = read('src/lib/utils.js');
const c0 = utils.indexOf('class StateSync {'), c1 = utils.indexOf('\nlet _stateSync = null;');
const CLASS = c0 > 0 && c1 > c0 ? utils.slice(c0, c1) : '';
console.log('§0 the cuts');
ok(/case 'state-set'/.test(CASES) && /case 'state-resync'/.test(CASES) && /store\.set\(data\.key, value, ws, data\.basedOn\)/.test(CASES) && /const value = belt \? putbackBelt\(belt, data\.value, data\.basedOn\) : data\.value;/.test(CASES), 'src/ws-handler.js: the state-set + state-resync cases cut verbatim (the value is data.value off the drafts belt — lane stop-refills-composer)');
ok(/init\(storeName\) \{/.test(CLASS) && /s\.loaded = \(async \(\) => \{/.test(CLASS) && /_applyOp\(storeName, op\)/.test(CLASS), 'src/lib/utils.js: the client StateSync class cut verbatim (init answers its one load)');
ok(/saveDraft\('doc', draftId, /.test(read('src/lib/doc-window-ui.js')) && /export function saveDraft\(type, id, value\) \{\s*_stateSync\?\.set\('drafts', type \+ ':' \+ id, value\);/.test(utils), 'the Doc window writes through saveDraft(\'doc\', <host>\\u0001<path>) = the drafts store\'s doc:<host>\\u0001<path> key (the path below)');

function world(cases = CASES, { failRead = false, cls = CLASS } = {}) {
  const dir = scratchDir('dcsync');
  const wss = { clients: new Set() };
  const stores = { drafts: new SyncStore('drafts', path.join(dir, 'drafts.json'), wss, { saveDelay: 5 }) };
  const getSyncStore = (n) => stores[n];
  const activeSessions = new Map();
  const handle = new Function('getSyncStore', 'activeSessions', `return function handle(data, ws) { switch (data.type) {\n${cases}\n} };`)(getSyncStore, activeSessions);
  let gate = null;
  const fetchFake = async (url) => {
    if (gate) await gate.p;
    const st = getSyncStore(String(url).split('/').pop());
    if (failRead || !st) return { ok: false, json: async () => { throw new Error('not json'); } };
    return { ok: true, json: async () => JSON.parse(S(st.getSnapshot())) };
  };
  const StateSync = new Function('fetch', 'arrivalVerdict', cls + '\nreturn StateSync;')(fetchFake, arrivalVerdict);
  const client = (name) => {
    const globals = [], states = [];
    const sock = { name, readyState: 1, send(m) { for (const h of globals) h(JSON.parse(m)); } }; // server → this client
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { if (sock.readyState === 1) handle(JSON.parse(S(d)), sock); } };
    wss.clients.add(sock);
    const sync = new StateSync(wm);
    return { sock, sync, reconnect: () => { sock.readyState = 1; for (const h of states) h(true); } };
  };
  const hold = () => { let r; gate = { p: new Promise((x) => { r = x; }) }; return () => { const g = gate; gate = null; r(); return g; }; };
  return { dir, stores, client, hold, done: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } } };
}

const KEY = 'doc:' + '\u0001' + '/w/docs/设计.md';
const ROWS = M.commentRows([{ id: 'r1', quote: '目标', line: 5, note: '更有力一点' }, { id: 'r2', quote: 'ship', line: 7, note: 'add a date' }]);

async function roundTrip(w) {
  const A = w.client('A'), B = w.client('B');
  await A.sync.init('drafts'); await B.sync.init('drafts');
  const seenA = [], seenB = [];
  A.sync.on('drafts', KEY, (v) => seenA.push(v)); B.sync.on('drafts', KEY, (v) => seenB.push(v));
  A.sync.set('drafts', KEY, ROWS.slice());
  return { A, B, seenA, seenB, held: w.stores.drafts.get(KEY) };
}

console.log('§1 a doc: key round-trips through the drafts store and broadcasts');
{
  const w = world();
  const { A, B, seenA, seenB, held } = await roundTrip(w);
  ok(S(held) === S(ROWS), '① A writes the rows ⇒ the server\'s drafts store holds them under doc:<host>\\u0001<path>', held);
  ok(seenB.length === 1 && S(seenB[0]) === S(ROWS) && S(B.sync.get('drafts', KEY)) === S(ROWS), '① …client B\'s listener gets them at once (no reload) and its copy holds them', seenB);
  ok(seenA.length === 0, '① …A\'s own listener is not called (the sender is skipped — a write never waits for an echo)', seenA);
  w.stores.drafts.flush();
  const disk = JSON.parse(fs.readFileSync(path.join(w.dir, 'drafts.json'), 'utf8'));
  ok(S(disk.data[KEY]) === S(ROWS) && disk.version >= 1, '① …data/drafts.json holds them after the flush (a restart keeps them)', disk);
  const C = w.client('C'); await C.sync.init('drafts');
  ok(S(M.commentRows(C.sync.get('drafts', KEY))) === S(ROWS), '① a client that boots later reads them from the snapshot (another browser, another computer)');

  console.log('§2 a removal and an emptying travel the same way');
  B.sync.set('drafts', KEY, ROWS.filter((r) => r.id !== 'r1'));
  ok(S(A.sync.get('drafts', KEY)) === S([ROWS[1]]) && seenA.length === 1, '② B removes one ⇒ A sees one', A.sync.get('drafts', KEY));
  A.sync.set('drafts', KEY, '');
  ok(!(KEY in w.stores.drafts.data) && B.sync.get('drafts', KEY) === undefined && seenB.at(-1) === '', '② an emptying (\'\' — Send all) deletes the key on the server and on B (its listener hears \'\')', { server: w.stores.drafts.get(KEY), b: B.sync.get('drafts', KEY), last: seenB.at(-1) });

  console.log('§4 a reconnect hands over a missed op');
  A.sock.readyState = 3;
  B.sync.set('drafts', KEY, [ROWS[0]]);
  ok(A.sync.get('drafts', KEY) === undefined, '④ A is offline while B writes ⇒ A has not seen it yet');
  A.reconnect();
  ok(S(A.sync.get('drafts', KEY)) === S([ROWS[0]]), '④ A reconnects ⇒ state-resync hands over the missed op', A.sync.get('drafts', KEY));
  w.done();
}

console.log('§3 init() is one load');
{
  const w = world();
  const A = w.client('A');
  w.stores.drafts.set(KEY, ROWS);
  const release = w.hold();
  const first = A.sync.init('drafts'), second = A.sync.init('drafts');
  let early = null; second.then(() => { early = A.sync.get('drafts', KEY); });
  await new Promise((r) => setTimeout(r, 20));
  ok(early === null && A.sync.get('drafts', KEY) === undefined, '③ while the snapshot is out, a second init() has not resolved (no empty store handed over)');
  release();
  const [r1, r2] = await Promise.all([first, second]);
  ok(r1 === true && r2 === true && S(early) === S(ROWS), '③ …both callers resolve true once the snapshot is in, and the second reads the rows', { r1, r2, early });
  w.done();
  const w2 = world(CASES, { failRead: true });
  const B = w2.client('B');
  ok((await B.sync.init('drafts')) === false && (await B.sync.init('drafts')) === false, '③ an unreadable store answers false (the Doc window then leaves the browser\'s old copy alone)');
  w2.done();
}

console.log('§5 control');
{
  const from = "if (store && store.clientWrites !== false && data.key && typeof data.key === 'string') {"; // lane agent-feedback: the guard reads clientWrites (a server-owned mirror takes no client write)
  ok(CASES.includes(from), 'control target present: the state-set key check');
  const w = world(CASES.replace(from, "if (store && store.clientWrites !== false && data.key && typeof data.key === 'string' && data.key.startsWith('chat:')) {"));
  const { seenB, held } = await roundTrip(w);
  ok(held === undefined && seenB.length === 0, 'CONTROL: a state-set that keeps only chat: keys ⇒ the store holds nothing and B hears nothing (① would be red)', { held, seenB });
  w.done();
  const old = 'if (this.stores[storeName]) return this.stores[storeName].loaded;';
  ok(CLASS.includes(old), 'control target present: init\'s second caller');
  const w2 = world(CASES, { cls: CLASS.replace(old, 'if (this.stores[storeName]) return;') });
  const A = w2.client('A'); w2.stores.drafts.set(KEY, ROWS);
  const release = w2.hold(); A.sync.init('drafts');
  const second = await A.sync.init('drafts');
  ok(second === undefined && A.sync.get('drafts', KEY) === undefined, 'CONTROL: the old init — a second init() returns before the load, with an EMPTY store (③ would be red: the Doc window would take it for "no comments")', { second });
  release(); w2.done();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
