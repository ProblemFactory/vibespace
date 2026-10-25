#!/usr/bin/env node
// STOP PUTS THE DROPPED QUEUE BACK (lane stop-refills-composer — the owner, 2026-10-24: «可以丢弃但是把内容回填到输入框»,
// amending the 2026-09-07 law «Stop clears the queue, every harness»). Stop still drops the queue — nothing queued runs —
// and what the person queued comes back into the composer, once, on every open client. Fast, in-process, DETERMINISTIC:
//   §1 the PURE rules (src/queue-putback.js): the three envelopes + junk, the caps, the merge, the landing rule, the toast
//      facts, the server belt; the wrappers' inline twins of droppedRecordFor pinned BYTE-IDENTICAL and driven on one fixture
//   §2 THE DOOR (src/server/queue-putback.js) over the REAL drafts SyncStore behind the REAL ws `state-set` / `state-resync`
//      cases (src/ws-handler.js, cut verbatim) and two REAL client StateSyncs (src/lib/utils.js, cut verbatim) on a
//      discrete-event clock: ONE state-sync carrying `prepended` to BOTH clients, no ack, drafts.json holds it; a dropId
//      twice writes once; a second Stop lands in front; nothing textful ⇒ no write; no store ⇒ a line, no throw; no
//      `_draftEditAt` (the person's door stamps it — control)
//   §3 THE CLIENT: the composer's landing handler (src/lib/chat-input.js, cut verbatim) on a fake box — THE LOST-UPDATE RACE
//      (an autosave already in flight when the put-back lands: the delta row + the belt keep it on every client and the
//      server; the pre-fix client + store lose it — CONTROL), exactly ONE extra set from two clients (one typing, one
//      idle), the caret shifted, no double prefix
//   §4 the normalizers: each envelope ⇒ ONE `queue-putback` meta op with the facts, zero unknown-record cards, the
//      undispatched prompt's chip 'removed', nothing on a history convert
//   §5 wiring pins: the ONE gate per attach, the server's lazy store, the belt, the wrapper order law + filters
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } return !!c; };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const S = JSON.stringify;
const QP = require('../src/queue-putback.js');
const { PUTBACK_ITEM_MAX_CHARS, PUTBACK_TOTAL_MAX_CHARS, PUTBACK_SEP, PUTBACK_BELT_MAX, droppedRecordFor, queueDroppedOf, mergeDraft, landDraftPrepend, putbackNotice, beltValue, noteBelt } = QP;
const { SyncStore } = require('../src/sync-store.js');
const { arrivalVerdict, ARRIVAL_TABLE } = require('../src/sync-arrival.js');
const DOOR = require('../src/server/queue-putback.js');

// ── the real code, cut verbatim ──
const handler = read('src/ws-handler.js');
const h0 = handler.indexOf("        case 'state-set': {"), h1 = handler.indexOf("        case 'layout-sync': {");
const CASES = h0 > 0 && h1 > h0 ? handler.slice(h0, h1) : '';
const utils = read('src/lib/utils.js');
const c0 = utils.indexOf('class StateSync {'), c1 = utils.indexOf('\nlet _stateSync = null;');
const CLASS = c0 > 0 && c1 > c0 ? utils.slice(c0, c1) : '';
const ci = read('src/lib/chat-input.js');
const d0 = ci.indexOf('    this._draftSyncHandler = (value, key, op) => {'), d1 = ci.indexOf('\n    };\n', d0);
const HANDLER = d0 > 0 && d1 > d0 ? ci.slice(d0, d1 + 7) : '';
// the pre-fix pair (CONTROL): a client whose arrival rule has no delta row, a store whose state-set has no belt, a
// composer that overwrites the box with the op's value (no landing)
const PRE_FIX_ARRIVAL = (input) => arrivalVerdict({ ...input, remote: input && input.remote ? { ...input.remote, prepended: undefined } : input && input.remote });
const NO_BELT = (belt, value) => value;
const PRE_FIX_HANDLER = HANDLER.replace(/      if \(op && Number\.isSafeInteger\(op\.prepended\)[\s\S]*?\n      \}\n/, '');

console.log('§0 the cuts');
ok(/case 'state-set'/.test(CASES) && /putbackBelt\(belt, data\.value, data\.basedOn\)/.test(CASES) && /store\.set\(data\.key, value, ws, data\.basedOn\)/.test(CASES), 'src/ws-handler.js: the state-set case cut verbatim — the belt judges the value before the store writes it');
ok(CLASS.includes('this._notify(s, op.key, op.op === \'delete\' ? \'\' : op.value, op);') && /_notify\(s, key, value, op\)/.test(CLASS), 'src/lib/utils.js: the client StateSync cut verbatim — its listeners get (value, key, op)');
ok(/landDraftPrepend\(/.test(HANDLER) && /saveDraft\('chat', this\._sessionId, r\.value\)/.test(HANDLER) && !/dispatchEvent/.test(HANDLER), 'src/lib/chat-input.js: the composer\'s draft handler cut verbatim — lands the prefix, saves once, dispatches NO synthetic input');
ok(PRE_FIX_HANDLER !== HANDLER && !/op\.prepended|landDraftPrepend/.test(PRE_FIX_HANDLER) && /this\._textarea\.value = value \|\| '';/.test(PRE_FIX_HANDLER), 'control target present: the landing branch (the pre-fix composer overwrites)');

// ── §1 THE PURE RULES ──
console.log('§1 the PURE rules');
const DROP = { dropId: '4242-1', by: 'stop', turnId: 'p1-4242', omitted: 0, items: [
  { id: 'q1-4242', msgId: 'm1', ts: 1, text: 'first queued', cut: false, attachments: [] },
  { id: 'q2-4242', msgId: 'm2', ts: 2, text: 'second, with a picture', cut: false, attachments: [{ type: 'image', mime: 'image/png', name: null }] },
] };
{
  const acp = { ts: '2026-10-24T00:00:00Z', type: 'acp', kind: 'queue_dropped', ...DROP };
  const codex = { timestamp: '2026-10-24T00:00:00Z', type: 'event_msg', payload: { type: 'queue_dropped', ...DROP } };
  const bare = { type: 'queue_dropped', ...DROP };
  for (const [name, rec] of [['acp / agy {type:acp, kind:queue_dropped}', acp], ['codex {type:event_msg, payload:{type:queue_dropped}}', codex], ['the bare payload / a top-level line {type:queue_dropped}', bare]]) {
    const d = queueDroppedOf(rec);
    ok(d && d.dropId === '4242-1' && d.items.length === 2 && d.items[0].text === 'first queued' && d.items[1].attachments[0].type === 'image' && d.turnId === 'p1-4242', `queueDroppedOf: ${name} ⇒ the payload, validated`, d);
  }
  const junk = [null, 'x', 42, {}, { type: 'acp', kind: 'queue_changed', items: [] }, { type: 'event_msg', payload: { type: 'queue_changed' } }, { type: 'queue_dropped' }, { type: 'queue_dropped', dropId: '' }, { kind: 'queue_dropped', dropId: 7 }, { type: 'acp', dropId: 'x', items: [] }];
  ok(junk.every((r) => queueDroppedOf(r) === null), 'queueDroppedOf: junk, another kind, no / empty / non-string dropId, and a `type:acp` record without the kind ⇒ null');
  const mal = queueDroppedOf({ type: 'queue_dropped', dropId: 'm-1', omitted: -3, items: [null, 'x', { text: 5 }, { text: '' }, { id: 1, text: 'kept', attachments: [null, { type: '' }, { type: 'image', mime: 9 }, 'y'] }, { text: '', attachments: [{ type: 'image' }] }] });
  ok(mal && mal.items.length === 2 && mal.items[0].text === 'kept' && mal.items[0].id === '' && S(mal.items[0].attachments) === S([{ type: 'image', mime: null, name: null }]) && mal.items[1].text === '' && mal.omitted === 0, 'queueDroppedOf: malformed rows dropped (non-objects, no text and no attachment), fields coerced, never a throw', mal);
  const src = read('src/queue-putback.js');
  ok(!/=== 'acp'|'acp' ===|=== "acp"/.test(src) && !/require\(/.test(src.replace(/\/\/.*$/gm, '')), 'src/queue-putback.js recognises the envelopes by kind / type, never by the harness id \'acp\', and requires nothing (PURE)');

  const big = droppedRecordFor([{ id: 'a', msgId: 'ma', ts: 5, text: 'x'.repeat(PUTBACK_ITEM_MAX_CHARS + 1), attachments: [] }], { dropId: '1-1', turnId: null });
  ok(big.items[0].cut === true && big.items[0].text.length === PUTBACK_ITEM_MAX_CHARS && big.omitted === 0 && big.by === 'stop' && big.turnId === null, `droppedRecordFor: ${PUTBACK_ITEM_MAX_CHARS + 1} chars ⇒ cut:true, ${PUTBACK_ITEM_MAX_CHARS} kept`);
  const six = droppedRecordFor(Array.from({ length: 6 }, (_, i) => ({ id: 'q' + i, msgId: 'm' + i, ts: i, text: String(i).repeat(PUTBACK_ITEM_MAX_CHARS) })), { dropId: '1-2', turnId: 't' });
  ok(six.items.length === 5 && six.omitted === 1 && six.items.map((x) => x.id).join() === 'q0,q1,q2,q3,q4' && six.items.reduce((n, x) => n + x.text.length, 0) === PUTBACK_TOTAL_MAX_CHARS, `droppedRecordFor: 6 × ${PUTBACK_ITEM_MAX_CHARS} ⇒ five carried (${PUTBACK_TOTAL_MAX_CHARS} chars), omitted 1, oldest first`);
  const sur = droppedRecordFor([{ text: 'a'.repeat(PUTBACK_ITEM_MAX_CHARS - 1) + '😀' }], { dropId: '1-3' });
  ok(sur.items[0].text.length === PUTBACK_ITEM_MAX_CHARS - 1 && sur.items[0].cut, 'droppedRecordFor: a cut never splits a surrogate pair');
  const att = droppedRecordFor([null, 'x', { id: 'q', text: '', attachments: [{ type: 'localImage', name: 'shot.png', mime: null, path: '/Users/me/shot.png', url: 'data:image/png;base64,AAAA' }, { nope: 1 }] }], { dropId: '1-4' });
  ok(att.items.length === 1 && S(att.items[0].attachments) === S([{ type: 'localImage', mime: null, name: 'shot.png' }]), 'droppedRecordFor: attachments are DESCRIPTORS (type / mime / name) — never bytes, a data URL or a path; non-object rows skipped');

  const m = mergeDraft('my draft', DROP.items);
  ok(m.text === 'first queued' + PUTBACK_SEP + 'second, with a picture' + PUTBACK_SEP + 'my draft' && m.count === 2 && m.prepended === m.text.length - 'my draft'.length, 'mergeDraft: oldest first, blank-line separated, IN FRONT of the draft, `prepended` = the prefix incl. its trailing separator', m);
  ok(mergeDraft(undefined, DROP.items).text.endsWith(PUTBACK_SEP) && mergeDraft({ x: 1 }, DROP.items).text === mergeDraft('', DROP.items).text, 'mergeDraft: the trailing separator is always there (unsaved typing lands on its own line); a non-string draft counts as empty');
  const none = mergeDraft('kept', [{ text: '' , attachments: [{ type: 'image' }] }, { text: '   ' }]);
  ok(none.count === 0 && none.prepended === 0 && none.text === 'kept', 'mergeDraft: attachment-only / blank rows contribute nothing ⇒ count 0 (the door writes nothing)');

  const L = landDraftPrepend({ current: 'typed after Stop', selStart: 5, selEnd: 9, value: 'Q' + PUTBACK_SEP + 'old saved', prepended: 1 + PUTBACK_SEP.length });
  ok(L.value === 'Q' + PUTBACK_SEP + 'typed after Stop' && L.selStart === 5 + 3 && L.selEnd === 9 + 3, 'landDraftPrepend: the prefix goes IN FRONT of the LIVE box (unsaved words kept, the stale value\'s tail ignored), both caret ends move by the prefix', L);
  const L2 = landDraftPrepend({ current: 'ab', selStart: 99, selEnd: undefined, value: 'P\n\n', prepended: 50 });
  ok(L2.value === 'P\n\nab' && L2.selStart === 5 && L2.selEnd === 5, 'landDraftPrepend: an out-of-range caret goes to the end; `prepended` is clamped to the value', L2);

  const N = putbackNotice({ items: [...DROP.items, { text: 'y', cut: true, attachments: [{ type: 'skill', mime: null, name: 'k' }, { type: 'localImage' }] }, { text: '', attachments: [{ type: 'audio' }] }], omitted: 2 });
  ok(S(N) === S({ n: 3, images: 2, others: 2, cut: 1, omitted: 2 }), 'putbackNotice: n = rows whose text came back, images / others = attachments named not restored, cut, omitted', N);

  const belt = noteBelt(noteBelt([], { version: 10, prefix: 'P1\n\n' }), { version: 14, prefix: 'P2\n\n' });
  ok(beltValue(belt, 'typed', 9) === 'P2\n\nP1\n\ntyped', 'beltValue: a set based below BOTH put-backs keeps both prefixes, newest first (as the merges stacked them)');
  ok(beltValue(belt, 'P1\n\ntyped', 12) === 'P2\n\nP1\n\ntyped', 'beltValue: a set that saw the first put-back but not the second gets only the second');
  ok(beltValue(belt, 'P2\n\nP1\n\ntyped', 14) === 'P2\n\nP1\n\ntyped' && beltValue(belt, 'x', 20) === 'x', 'beltValue: basedOn ≥ every put-back ⇒ stored as-is (no double prefix)');
  ok(beltValue(belt, 'x', undefined) === 'x' && beltValue(belt, 'x', -1) === 'x' && beltValue([], 'x', 0) === 'x' && beltValue(null, 'x', 0) === 'x', 'beltValue: no basedOn / no belt ⇒ as-is (nothing proves the client missed it)');
  ok(beltValue(belt, '', 13) === 'P2\n\n' && beltValue(belt, null, 13) === 'P2\n\n', 'beltValue: an emptied box (a send) based below a put-back keeps the put-back — clearing was no decision about words not yet seen');
  let b = []; for (let v = 1; v <= 9; v++) b = noteBelt(b, { version: v, prefix: 'p' + v });
  ok(b.length === PUTBACK_BELT_MAX && b[0].version === 9 - PUTBACK_BELT_MAX + 1 && noteBelt(b, { version: 0, prefix: 'z' }).length === PUTBACK_BELT_MAX, `noteBelt: bounded to the newest ${PUTBACK_BELT_MAX}; a versionless entry is ignored`);

  // THE TWINS: each wrapper's inline droppedRecordFor is byte-identical to the PURE one and answers the same
  const cutFn = (txt) => { const a = txt.indexOf('function droppedRecordFor('); if (a < 0) return ''; const z = txt.indexOf('\n}\n', a); return z > a ? txt.slice(a, z + 2) : ''; };
  const pure = cutFn(src);
  const fixture = [{ id: 'q1', msgId: 'm1', ts: 3, text: 'hello', attachments: [{ type: 'image', mimeType: 'x', mime: 'image/jpeg' }] }, { id: 'q2', msgId: '', ts: null, text: 'z'.repeat(PUTBACK_ITEM_MAX_CHARS + 7), attachments: [] }, null, ...Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, text: 'w'.repeat(19999) }))];
  const want = S(droppedRecordFor(fixture, { dropId: '9-9', turnId: 'turn-1' }));
  for (const w of ['data/bin/acp-wrapper.js', 'data/bin/agy-wrapper.js', 'data/bin/codex-chat-wrapper.js']) {
    const twin = cutFn(read(w));
    let got = null; try { got = S(new Function(twin + '\nreturn droppedRecordFor;')()(fixture, { dropId: '9-9', turnId: 'turn-1' })); } catch (e) { got = 'threw ' + e.message; }
    ok(twin && twin === pure && got === want, `${w}: the inline droppedRecordFor twin is byte-identical to src/queue-putback.js and answers the same fixture (${twin.length} chars)`, { same: twin === pure, got: got && got.slice(0, 200) });
  }
  ok(arrivalVerdict({ remote: { version: 7, prepended: 12 }, own: { pending: true, ackedVersion: 3 } }) === 'apply' && arrivalVerdict({ remote: { version: 7, prepended: 12 }, own: { ackedVersion: 9 } }) === 'apply' && arrivalVerdict({ remote: { version: 7, prepended: 0 }, own: { pending: true } }) === 'queue', 'the arrival rule\'s delta row: an op carrying prepended > 0 is applied over a pending own set AND under a higher acked one; prepended 0 is no delta');
  ok(ARRIVAL_TABLE.length === 6 && ARRIVAL_TABLE[1].verdict === 'apply' && /prepended/.test(ARRIVAL_TABLE[1].when), 'the arrival table names the delta row (six rows)');
}

// ── a discrete-event clock + one server store + N clients (the test-sync-arrival world, on the drafts store) ──
function makeClock() {
  const q = []; let now = 0, seq = 0;
  return {
    get now() { return now; },
    at(t, fn) { q.push({ t: Math.max(t, now), s: seq++, fn }); },
    run() { let n = 0; while (q.length && n++ < 100000) { let i = 0; for (let j = 1; j < q.length; j++) if (q[j].t < q[i].t || (q[j].t === q[i].t && q[j].s < q[i].s)) i = j; const [e] = q.splice(i, 1); now = e.t; e.fn(); } return n; },
  };
}
const SID = 'e2e00000-0000-4000-8000-00000000c0de';
const KEY = 'chat:' + SID;
function world({ cls = CLASS, cases = CASES, handlerSrc = HANDLER, belt = beltValue, arrival = arrivalVerdict, filePath = null, storeUp = true } = {}) {
  const clock = makeClock();
  const wss = { clients: new Set() };
  const store = new SyncStore('drafts', filePath, wss, { saveDelay: 60000 });
  const log = [];
  const push = store._pushOp.bind(store); store._pushOp = (op) => { log.push(op); push(op); };
  const stores = { drafts: store };
  const session = { id: SID };
  const activeSessions = new Map([[SID, session]]);
  const handle = new Function('getSyncStore', 'activeSessions', 'putbackBelt', `return function handle(data, ws) { switch (data.type) {\n${cases}\n} };`)((n) => stores[n], activeSessions, belt);
  const lines = [];
  const door = DOOR.create({ getSyncStore: (n) => (storeUp ? stores[n] : undefined), log: (l) => lines.push(String(l)) });
  const fetchFake = async (url) => { const st = stores[String(url).split('/').pop()]; return { ok: !!st, json: async () => JSON.parse(S(st ? st.getSnapshot() : {})) }; };
  const StateSync = new Function('fetch', 'arrivalVerdict', cls + '\nreturn StateSync;')(fetchFake, arrival);
  const client = (name, { up = 5, down = 5 } = {}) => {
    const globals = [], states = [], events = [];
    let sock = null, lastUp = 0, lastDown = 0, closed = false;
    sock = { name, readyState: 1, send(m) {
      const t = Math.max(lastDown, clock.now + down); lastDown = t;
      clock.at(t, () => { if (closed) return; const d = JSON.parse(m); events.push({ kind: 'frame', t: clock.now, d }); for (const h of globals) h(d); });
    } };
    wss.clients.add(sock);
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { events.push({ kind: 'sent', t: clock.now, d: JSON.parse(S(d)) }); const txt = S(d); const t = Math.max(lastUp, clock.now + up); lastUp = t; clock.at(t, () => handle(JSON.parse(txt), sock)); } };
    const sync = new StateSync(wm);
    // the composer: a fake box + the handler cut verbatim, bound to this client's saveDraft
    const ta = { value: '', selectionStart: 0, selectionEnd: 0, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
    const doc = { activeElement: ta };
    const timers = new Set();
    const composer = { _sessionId: SID, _textarea: ta, _pendingEdit: null, _editingQueueId: null, _editDraftBefore: null, _draftTimer: null, _autoSize() { } };
    const saveDraft = (type, id, value) => sync.set('drafts', type + ':' + id, value);
    new Function('landDraftPrepend', 'saveDraft', 'document', 'clearTimeout', `return function install() {\n${handlerSrc}\n};`)(landDraftPrepend, saveDraft, doc, (h) => { timers.delete(h); }).call(composer);
    const C = {
      name, events, sync, ta, composer, timers,
      async init() { await sync.init('drafts'); sync.on('drafts', KEY, composer._draftSyncHandler); },
      sets() { return events.filter((e) => e.kind === 'sent' && e.d.type === 'state-set'); },
      syncs() { return events.filter((e) => e.kind === 'frame' && e.d.type === 'state-sync'); },
      acks() { return events.filter((e) => e.kind === 'frame' && e.d.type === 'state-ack'); },
      // the person types: the box changes and the 300 ms autosave is armed (a fake timer the test fires by hand)
      type(text) { ta.value += text; ta.selectionStart = ta.selectionEnd = ta.value.length; const h = { fire: () => { if (timers.has(h)) { timers.delete(h); saveDraft('chat', SID, ta.value); } } }; timers.add(h); composer._draftTimer = h; return h; },
      autosaveNow() { for (const h of [...timers]) h.fire(); },
      close() { closed = true; sock.readyState = 3; wss.clients.delete(sock); },   // the tab closed: what is in flight TO it is lost, what it sent still lands
    };
    return C;
  };
  const record = (dropId, items, extra = {}) => ({ ts: new Date(0).toISOString(), type: 'acp', kind: 'queue_dropped', dropId, by: 'stop', turnId: null, items, omitted: 0, ...extra });
  const feed = (msg) => door.onLiveRecord(session, SID, msg);
  return { clock, store, log, session, activeSessions, handle, door, lines, client, record, feed };
}
const row = (id, text, extra = {}) => ({ id, msgId: 'm-' + id, ts: 1, text, cut: false, attachments: [], ...extra });

// ── §2 THE DOOR ──
console.log('§2 the door — the ONE writer over the real drafts store');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-putback-'));
  const file = path.join(tmp, 'drafts.json');
  const w = world({ filePath: file });
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  w.store.set(KEY, 'my draft'); w.clock.run();
  const before = w.log.length;
  w.feed(w.record('77-1', [row('q1', 'first queued'), row('q2', 'second queued')]));
  w.clock.run();
  const op = w.log.at(-1);
  const toA = A.syncs().filter((e) => e.d.version === op.version), toB = B.syncs().filter((e) => e.d.version === op.version);
  ok(w.log.length === before + 1 && op.value === 'first queued\n\nsecond queued\n\nmy draft' && op.prepended === 'first queued\n\nsecond queued\n\n'.length && !('from' in op) && !('basedOn' in op), '② one record ⇒ ONE write: the texts oldest first, in front of the draft, the op stamped `prepended` (no sender, no basedOn)', op);
  ok(toA.length === 1 && toB.length === 1 && toA[0].d.prepended === op.prepended && A.acks().length === 0 && B.acks().length === 0, '② …broadcast to BOTH clients (the one that pressed Stop too) with `prepended`, acked to nobody');
  ok(A.ta.value === op.value && B.ta.value === op.value && A.sets().length === 0 && B.sets().length === 0, '② …both idle composers now show it and save NOTHING (their boxes held the stored draft — nothing unsaved to merge)', { A: A.ta.value, sets: A.sets().length + B.sets().length });
  w.store.flush();
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(disk.data[KEY] === op.value && disk.version === op.version, '② drafts.json holds the put-back after the flush (tmp + rename, the store\'s own)');
  ok(!('_draftEditAt' in w.session) && S(w.session._putbackSeen) === S(['77-1']) && w.session._putbackBelt.length === 1 && w.session._putbackBelt[0].version === op.version && w.session._putbackBelt[0].prefix === op.value.slice(0, op.prepended), '② the door stamps no _draftEditAt (a machine write is not a person composing); it remembers the dropId and the belt entry {version, prefix}');
  const n1 = w.log.length;
  w.feed(w.record('77-1', [row('q1', 'first queued'), row('q2', 'second queued')]));
  w.feed({ type: 'acp', kind: 'queue_dropped', dropId: '77-1', items: [row('q9', 'other bytes, same Stop')] });
  ok(w.log.length === n1, '② the same dropId fed again (a gap-fill, a double feed) writes NOTHING');
  w.feed({ timestamp: 'x', type: 'event_msg', payload: { type: 'queue_dropped', dropId: '88-1', by: 'stop', turnId: 't', items: [row('c1', 'a codex row')], omitted: 0 } });
  w.clock.run();
  ok(w.store.get(KEY) === 'a codex row\n\nfirst queued\n\nsecond queued\n\nmy draft' && A.ta.value === w.store.get(KEY) && B.ta.value === w.store.get(KEY), '② a second Stop (any envelope) lands IN FRONT of the first, on every client');
  const n2 = w.log.length;
  w.feed(w.record('77-2', [row('i1', '', { attachments: [{ type: 'image', mime: 'image/png', name: null }] })]));
  w.feed(w.record('77-3', [], { omitted: 0 }));
  ok(w.log.length === n2 && w.lines.some((l) => /Stop put 0 queued message/.test(l)), '② nothing textful (an attachment-only row) ⇒ no write, one journal line; an empty record ⇒ nothing at all');
  for (let i = 0; i < 40; i++) w.feed(w.record('seen-' + i, [row('s' + i, 'x' + i)]));
  ok(w.session._putbackSeen.length === DOOR.SEEN_MAX && w.session._putbackBelt.length === PUTBACK_BELT_MAX, `② the per-session memories are bounded (dropIds ${DOOR.SEEN_MAX}, belt ${PUTBACK_BELT_MAX})`);
  // the CONTROL for the _draftEditAt fence: the PERSON's door (the ws state-set) stamps it
  const w2 = world();
  w2.handle({ type: 'state-set', store: 'drafts', key: KEY, value: 'a person typing', basedOn: 0 }, { readyState: 1, send() { } });
  ok(typeof w2.session._draftEditAt === 'number', '② CONTROL: the ws state-set path (a person composing) DOES stamp _draftEditAt — the door\'s absence above is real');
  const w3 = world({ storeUp: false });
  let threw = null; try { w3.feed(w3.record('99-1', [row('q', 'lost?')])); } catch (e) { threw = e; }
  ok(!threw && w3.lines.length === 1 && /drafts store not up — 1 message\(s\) NOT put back \(dropId 99-1\)/.test(w3.lines[0]), '② no drafts store yet (boot) ⇒ ONE journal line naming the count and dropId, no throw', w3.lines);
  let threw2 = null; try { w3.door.onLiveRecord(null, SID, null); w3.door.onLiveRecord({}, SID, { kind: 'queue_dropped', dropId: 'q', items: 'nope' }); w3.door.onLiveRecord({ _putbackSeen: 'corrupt' }, SID, { type: 'queue_dropped', dropId: 'z', items: [row('a', 'b')] }); } catch (e) { threw2 = e; }
  ok(!threw2, '② a malformed record / a missing session / a corrupt memory never throws into the gate');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── §3 THE CLIENT ──
console.log('§3 the client — the landing rule, the delta row, the belt (THE LOST-UPDATE RACE)');
/** The race: A types 'hello' and its 300 ms autosave goes out (basedOn V) — then the wrapper's record reaches the door
 *  BEFORE that set reaches the server (A's uplink is slow); A keeps typing ' world' (unsaved). */
async function race(opts = {}) {
  const w = world(opts);
  const A = w.client('A', { up: 40, down: 5 }), B = w.client('B', { up: 5, down: 5 });
  await A.init(); await B.init();
  A.type('hello'); A.autosaveNow();              // the set leaves A at t=0, basedOn 0 (lands at t=40)
  w.clock.at(10, () => w.feed(w.record('5-1', [row('q1', 'queued one')])));   // the put-back is written at t=10 (V1), reaches A at t=15
  w.clock.at(12, () => A.type(' world'));          // A keeps typing — the debounce never fires while it does
  w.clock.run();
  return { w, A, B, srv: w.store.get(KEY) };
}
{
  const r = await race();
  const want = 'queued one\n\nhello world';
  ok(r.A.ta.value === want && r.srv === want && r.B.ta.value === want, `③ THE RACE: an autosave in flight when the put-back lands — A, B and the server all hold «${want.replace(/\n/g, '⏎')}» (the prefix kept, every typed word kept)`, { A: r.A.ta.value, B: r.B.ta.value, srv: r.srv });
  const beltOp = r.w.log.find((o) => o.from && o.basedOn === 0);
  ok(beltOp && beltOp.value === 'queued one\n\nhello', '③ …the server BELT: A\'s stale set (basedOn 0 < the put-back\'s version) was stored as prefix + value', beltOp);
  ok(r.A.sets().length === 2 && r.A.sets()[1].d.value === want && r.B.sets().length === 0, '③ …the delta row landed the op on A at once (not held behind its pending set), and A saved ONCE — its box held unsaved words; B, idle, saved nothing', r.A.sets().map((e) => e.d.value));
  // CONTROLS: take away each fix and the put-back is lost
  const pre = await race({ arrival: PRE_FIX_ARRIVAL, belt: NO_BELT, handlerSrc: PRE_FIX_HANDLER });
  ok(!pre.A.ta.value.includes('queued one') && !pre.srv.includes('queued one'), `③ CONTROL: the pre-fix client + store (no delta row, no belt, an overwriting composer) LOSE the put-back — A «${pre.A.ta.value}», server «${pre.srv}»`, { A: pre.A.ta.value, srv: pre.srv });
  const noBelt = await race({ belt: NO_BELT });
  ok(noBelt.srv.includes('queued one') && noBelt.A.ta.value.includes('queued one'), `③ the client half alone converges here (A re-saves the landed prefix) — server «${noBelt.srv.replace(/\n/g, '⏎')}»`, { srv: noBelt.srv });
  const noRow = await race({ arrival: PRE_FIX_ARRIVAL });
  ok(noRow.srv.includes('queued one') && !noRow.A.ta.value.includes('queued one'), `③ CONTROL: without the delta row A's held op is DROPPED at its ack — the belt keeps it on the server («${noRow.srv.replace(/\n/g, '⏎')}») but A's box never shows it («${noRow.A.ta.value}»): both halves are needed`, { A: noRow.A.ta.value, srv: noRow.srv });
}
{
  // THE BELT ON ITS OWN: the typing client's tab closes right after its autosave left — it can never land or re-save
  const run = async (belt) => {
    const w = world({ belt });
    const A = w.client('A', { up: 40, down: 5 }), B = w.client('B');
    await A.init(); await B.init();
    A.type('typed, then the tab closed'); A.autosaveNow();
    w.clock.at(2, () => A.close());
    w.clock.at(10, () => w.feed(w.record('8-1', [row('q1', 'queued one')])));
    w.clock.run();
    return { srv: w.store.get(KEY), B: B.ta.value };
  };
  const r = await run(beltValue), n = await run(NO_BELT);
  ok(r.srv === 'queued one\n\ntyped, then the tab closed' && r.B === r.srv, '③ the BELT alone: the typing tab closed right after its autosave left — its stale set (basedOn below the put-back) keeps the prefix on the server and on every other client', r);
  ok(n.srv === 'typed, then the tab closed' && n.B === n.srv, '③ CONTROL: without the belt that set erases the put-back for good (nobody is left to re-save it)', n);
}
{
  // exactly ONE extra set: two composers, one with unsaved typing, one idle
  const w = world();
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  w.store.set(KEY, 'saved'); w.clock.run();
  A.type(' + unsaved');                          // A's box: 'saved + unsaved', not yet saved (the debounce is armed)
  A.ta.selectionStart = 2; A.ta.selectionEnd = 4;
  const setsBefore = A.sets().length + B.sets().length;
  w.feed(w.record('6-1', [row('q', 'back')]));
  w.clock.run();
  const extra = A.sets().length + B.sets().length - setsBefore;
  ok(extra === 1 && A.sets().at(-1).d.value === 'back\n\nsaved + unsaved' && w.store.get(KEY) === 'back\n\nsaved + unsaved' && B.ta.value === w.store.get(KEY), '③ two composers (one typing, one idle) ⇒ exactly ONE extra set, from the one with unsaved words: store = prefix + what it typed, and the idle one follows', { extra, srv: w.store.get(KEY), B: B.ta.value });
  ok(A.ta.selectionStart === 2 + 6 && A.ta.selectionEnd === 4 + 6 && A.timers.size === 0, '③ the caret moved by exactly the prefix; the armed autosave was cancelled (its save is the one above)');
  // no double prefix: the re-save (basedOn ≥ the put-back) is stored as-is
  ok((w.store.get(KEY).match(/back/g) || []).length === 1, '③ no double prefix: the composer\'s re-save is based on the put-back\'s version, so the belt leaves it as-is');
  // a snapshot / an op without prepended still overwrites (the old path) and a one-argument call keeps it
  w.store.set(KEY, 'hub wrote'); w.clock.run();
  ok(A.ta.value === 'hub wrote' && B.ta.value === 'hub wrote', '③ an ordinary op (no prepended) overwrites the box exactly as before');
  A.composer._draftSyncHandler('one argument');
  ok(A.ta.value === 'one argument', '③ the handler called with ONE argument (test-queue-steer\'s own pin) keeps the overwrite path');
  // while an edit is open the put-back lands on the STASH (the whole merged value), never the live box
  A.composer._editingQueueId = 'q7'; A.ta.value = 'the queued text being edited';
  w.feed(w.record('6-2', [row('q7', 'the queued text')])); w.clock.run();
  ok(A.ta.value === 'the queued text being edited' && A.composer._editDraftBefore === w.store.get(KEY) && w.store.get(KEY).startsWith('the queued text\n\n'), '③ while a queue edit is open the put-back lands on the edit\'s stash (restored when the edit ends), never over the rewrite');
}
{
  // a reconnecting client gets the op from the ring with `prepended` intact and prepends onto its own value
  const w = world();
  const A = w.client('A');
  await A.init();
  w.store.set(KEY, 'v0'); w.clock.run();
  const ringOp = (() => { w.feed(w.record('7-1', [row('q', 'ring')])); return w.store.getOpsSince(1).ops.find((o) => o.prepended); })();
  ok(ringOp && ringOp.prepended === 'ring\n\n'.length && ringOp.value === 'ring\n\nv0', '③ the op rides the store\'s ring whole — a state-resync replays it with `prepended` intact', ringOp);
}

// ── §4 THE NORMALIZERS ──
console.log('§4 the normalizers — ONE base method, the three envelopes');
{
  const { createMessageManager } = require('../src/normalizers.js');
  const { AcpMessageManager } = require('../src/acp-message-manager.js');
  const metaOps = (ops) => ops.filter((o) => o.op === 'meta' && o.subtype === 'queue-putback');
  const unknown = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-record' || m.noticeKind === 'unknown-fields').length;
  // acp / agy: the undispatched active prompt — its chip CLEARED when the drain shifted it ("it ran"); the record says removed
  const a = new AcpMessageManager('putback-acp');
  const ops = []; a.onOp((o) => ops.push(o));
  a.processLive({ type: 'acp', kind: 'user', msgId: 'm-p1', content: [{ type: 'text', text: 'claimed, never dispatched' }] });
  a.processLive({ type: 'acp', kind: 'queue_changed', items: [{ id: 'q1', msgId: 'm-p1', preview: 'x', kind: 'user' }], verbs: ['remove', 'reorder', 'edit'] });
  a.processLive({ type: 'acp', kind: 'queue_changed', items: [], verbs: ['remove', 'reorder', 'edit'] });
  const bubble = a.messages.find((m) => m.role === 'user');
  const chipBefore = bubble && bubble.queueState;
  a.processLive({ ts: 'x', type: 'acp', kind: 'queue_dropped', dropId: '1-1', by: 'stop', turnId: 'p1', items: [{ id: 'p1', msgId: 'm-p1', ts: null, text: 'claimed, never dispatched', cut: false, attachments: [{ type: 'image', mime: 'image/png', name: null }] }], omitted: 0 });
  const m1 = metaOps(ops);
  ok(chipBefore === null && bubble.queueState === 'removed' && ops.some((o) => o.op === 'edit' && o.id === bubble.id && o.fields && o.fields.queueState === 'removed'), 'acp: the undispatched prompt\'s chip had CLEARED (= "it ran"); the record stamps it removed');
  ok(m1.length === 1 && S({ ...m1[0], op: undefined, subtype: undefined }) === S({ dropId: '1-1', n: 1, images: 1, others: 0, cut: 0, omitted: 0 }) && unknown(a) === 0, 'acp: ONE `queue-putback` meta op {dropId, n, images, others, cut, omitted}, zero unknown-record cards', m1);
  const c = createMessageManager('codex', 'putback-codex');
  const cops = []; c.onOp((o) => cops.push(o));
  c.processLive({ timestamp: 'x', type: 'event_msg', payload: { type: 'queue_dropped', dropId: '2-1', by: 'stop', turnId: 't1', items: [{ id: 'a1', msgId: 'mm', ts: 1, text: 't'.repeat(20000), cut: true, attachments: [] }], omitted: 2 } });
  const m2 = metaOps(cops);
  ok(m2.length === 1 && m2[0].n === 1 && m2[0].cut === 1 && m2[0].omitted === 2 && unknown(c) === 0, 'codex: the event_msg envelope ⇒ ONE meta op with the facts, zero unknown-record / unknown-fields cards (the record-shape row is declared)', { m2, cards: c.messages.map((m) => m.noticeKind) });
  // the same record fed twice (the door's own idempotency key) toasts ONCE
  a.processLive({ ts: 'x', type: 'acp', kind: 'queue_dropped', dropId: '1-1', by: 'stop', turnId: 'p1', items: [{ id: 'p1', msgId: 'm-p1', ts: null, text: 'claimed, never dispatched', cut: false, attachments: [] }], omitted: 0 });
  ok(metaOps(ops).length === 1, 'the same record fed twice (one dropId) ⇒ still ONE meta op — one toast per Stop');
  // a malformed record from another wrapper version never throws inside the normalizer
  let threw = null; try { a.processLive({ type: 'acp', kind: 'queue_dropped', dropId: 'bad', items: [{ text: 1, attachments: 'x' }, null] }); c.processLive({ type: 'event_msg', payload: { type: 'queue_dropped', items: 7 } }); } catch (e) { threw = e; }
  ok(!threw && metaOps(ops).length === 1 && metaOps(cops).length === 1, 'a malformed record (no text, no dropId) is validated by the ONE extractor — no throw, no op');
  // a history convert emits nothing (live only) but still marks the bubble
  const h = new AcpMessageManager('putback-hist');
  const hops = []; h.onOp((o) => hops.push(o));
  await h.convertHistoryAsync([{ type: 'acp', kind: 'user', msgId: 'mh', content: [{ type: 'text', text: 'old' }] }, { type: 'acp', kind: 'queue_dropped', dropId: '3-1', items: [{ id: 'q', msgId: 'mh', text: 'old', attachments: [] }] }]);
  ok(hops.length === 0 && h.messages.find((m) => m.role === 'user').queueState === 'removed', 'a history convert emits NO op (the toast is live-only) and the rebuilt bubble still reads removed');
  const base = read('src/message-window.js');
  ok(/_stampQueueChip\(\) \{ return false; \}/.test(base) && /_processQueueDropped\(record, emit\) \{\n    const d = queueDroppedOf\(record\);/.test(base), 'src/message-window.js: ONE base method validating through the ONE extractor, and a base _stampQueueChip (acp/codex override)');
  ok(/case 'queue_dropped': return this\._processQueueDropped\(record, emit\);/.test(read('src/acp-message-manager.js')) && /if \(type === 'queue_dropped'\) return this\._processQueueDropped\(event, emit\);/.test(read('src/codex-message-manager.js')), 'acp and codex route the raw envelope to the base method (no second reader)');
}

// ── §5 WIRING PINS ──
console.log('§5 wiring pins');
{
  const ss = read('src/server/session-stdout.js');
  ok(/getSyncStore = \(\) => null \}\) \{/.test(ss) && /const putback = require\('\.\/queue-putback\.js'\)\.create\(\{ getSyncStore \}\);/.test(ss) && /const helpersFor = \(id\) => \(\{ \.\.\.stdoutHelpers, feedLive: \(s, m\) => \{ putback\.onLiveRecord\(s, id, m\); stdoutHelpers\.feedLive\(s, m\); \} \}\);/.test(ss) && /consumer\.attach\(session, id, ptyProcess, helpersFor\(id\)\);/.test(ss), 'session-stdout: the door is built once (getSyncStore defaults to null for every other create() caller) and rides the ONE gate per attach, BEFORE the normalizer');
  ok(/getSyncStore: \(name\) => \{ try \{ return getSyncStore\(name\); \} catch \{ return null; \} \}/.test(read('server.js')), 'server.js hands session-stdout a LAZY drafts-store getter (the store is built later in boot)');
  const consumers = ['claude-stream-json', 'codex-events', 'acp-events'].map((f) => read(`src/server/stdout/${f}.js`));
  ok(consumers.every((s) => !/queue_dropped/.test(s)), 'no stdout consumer spells queue_dropped — the door sits at the gate, never in a parse block');
  const acp = read('data/bin/acp-wrapper.js'), agy = read('data/bin/agy-wrapper.js'), cx = read('data/bin/codex-chat-wrapper.js');
  const order = (s, results, dropped, republish) => { const i = s.search(results), j = s.search(dropped), k = s.search(republish); return i > 0 && j > i && k > j; };
  ok(order(acp, /for \(const q of dropped\) record\('queue_op_result', \{ op: 'remove'[^\n]*reason: 'stopped' \}\);/, /record\('queue_dropped', droppedRecordFor\(/, /\n      if \(dropped\.length\) publishQueue\(\);\n      if \(activePrompt\) \{\n        activePrompt\.cancelled = true;/), 'acp-wrapper: per-item stopped results → ONE queue_dropped → the emptied republish (the order law)');
  ok(order(agy, /for \(const q of dropped\) record\('queue_op_result', \{ op: 'remove'[^\n]*reason: 'stopped' \}\);/, /record\('queue_dropped', droppedRecordFor\(/, /\n      if \(dropped\.length\) publishQueue\(\);\n      for \(const q of dropped\) \{ peerBack\(q, /), 'agy-wrapper: the same order (the republish, then the dropped peers back through peerBack — lane agy-peer-wake)');
  ok(order(cx, /emitTaskEvent\('queue_op_result', \{ op: 'remove', id, ok: true, msg_id: known\?\.msgId \|\| '', reason: 'stopped' \}\);/, /if \(putBack\.length\) emitTaskEvent\('queue_dropped', droppedRecordFor\(putBack,/, /await refreshQueue\(\{ timeoutMs: rpcBudget\(\) \}\);/), 'codex-chat-wrapper: every result → ONE queue_dropped (after the latch) → the republish');
  ok(/const theirs = \(q\) => !q\.opts\?\.peer && !q\.opts\?\.nudge && !q\.opts\?\.retry && !q\.opts\?\.silentQueue;/.test(acp) && /activePrompt && !activePrompt\.dispatched && activePrompt\.blocks && theirs\(activePrompt\) \? \[activePrompt\] : \[\]/.test(acp) && /dispatched: false, blocks, opts \}/.test(acp), 'acp-wrapper: the person\'s rows only, and the UNDISPATCHED active prompt first (the claim carries its blocks + opts)');
  ok(/const theirs = \(q\) => !q\.opts\?\.peer && !q\.opts\?\.nudge && !q\.opts\?\.retry && !q\.opts\?\.silentQueue;/.test(agy) && /activePrompt && !activePrompt\.dispatched && typeof activePrompt\.text === 'string' && theirs\(activePrompt\)/.test(agy) && /dispatched: false, opts, text \}/.test(agy), 'agy-wrapper: the same filter, the undispatched prompt first (the claim carries its text)');
  ok(/if \(known \? known\.kind !== 'peer' : !\/\^\(peer\|notif\)-\\d\+-\\d\+\$\/\.test\(cid\)\) \{\n\s+putBack\.push\(/.test(cx), 'codex-chat-wrapper: only deleted:true rows of the person — an INHERITED peer-/notif- row is judged by the wrapper\'s own cid convention');
  ok(!/'queue-cleared'/.test(acp) && !/send \$\{userDropped/.test(acp), 'acp-wrapper: the «send them again» queue-cleared notice is retired (the toast is the ONE notice on every harness)');
  const ws = read('src/ws-handler.js');
  ok(/const \{ beltValue: putbackBelt \} = require\('\.\/queue-putback\.js'\);/.test(ws) && /data\.store === 'drafts' && data\.key\.startsWith\('chat:'\) \? activeSessions\.get\(data\.key\.slice\(5\)\)\?\._putbackBelt : null;/.test(ws), 'ws-handler: the belt reads the session\'s put-back memory on a drafts chat:<id> set only');
  ok(/'codex:rollout:event\/queue_dropped': sh\(\['type', 'dropId', 'by', 'turnId', 'items', 'omitted'\]\)/.test(read('src/record-shape.js')), 'record-shape: the codex queue_dropped row (no field-drift card on the routed event)');
  const view = read('src/lib/chat-view.js');
  ok(/op\.subtype === 'queue-putback'/.test(view) && /showToast\(parts\.join\(' · '\), \{ duration: 6000 \}\)/.test(view) && /setQueueOpResult\(op\.id, op\.ok !== false, op\.text \|\| '', op\.queueOp \|\| null\)/.test(view), 'chat-view: the ONE toast for queue-putback; the queue result names its verb to the composer');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['Stop put {n} queued message(s) back into the input box', '{k} attached image(s) were not put back — attach them again', '{k} other attachment(s) were not put back — attach them again', '{m} message(s) came back shortened', '{k} more queued message(s) were too long to put back'];
  ok(keys.every((k) => view.includes(`t('${k}'`) && zh.includes(`"${k}":`) && ja.includes(`"${k}":`)), 'the toast\'s five strings go through t() with zh AND ja entries');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
