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
//   §6 CLAUDE, LIVE (lane claude-wrapper-queue, 2.369.354 — the wrapper owns claude's mid-turn queue): the REAL
//      data/bin/chat-wrapper.js over a stand-in CLI (every frame a turn: running → result → idle; an interrupt ends it)
//      — a frame sent mid-turn never reaches the CLI, Stop's records come in the order law BEFORE the interrupt reaches
//      it, nothing runs after it, and the wrapper's stdout through the REAL door lands the words in a REAL drafts store;
//      CONTROL: a frame the stand-in got mid-turn (the pre-.354 forward) DOES run after the interrupt
//   §7 THE STARTED ROW (lane codex-interrupted-putback — the owner, 2026-10-25): a codex row the app-server drained under
//      the sweep whose own turn Stop interrupts comes back too (`started: true`) — counted, merged, named in the toast and
//      on its chip; a row whose turn ENDED stays `gone` (drainedWasStopped + its wrapper twin; RED controls)
//   §8 THE DRAFT LANDING (lane draft-focus-guard, B-b0fa): landDraft — the ONE verdict for every draft another client saved
//      (the put-back prefix its first row): its rows, a grid of every combination (a focused or typing box is never replaced,
//      a held value never deletes words typed here), and two composers over the same world with the REAL autosave callback —
//      the verifier's «x» vs «hel», a×8 / b×8 interleaved at two cadences, the blur legs; RED CONTROL = the 2.369.354 rule
//      (the box overwritten, then its own pending autosave writes the overwritten value back)
import fs from 'node:fs';
import { spawn } from 'node:child_process';
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
const { PUTBACK_ITEM_MAX_CHARS, PUTBACK_TOTAL_MAX_CHARS, PUTBACK_SEP, PUTBACK_BELT_MAX, droppedRecordFor, queueDroppedOf, mergeDraft, landDraftPrepend, putbackNotice, drainedWasStopped, beltValue, noteBelt, landDraft, DRAFT_LANDING_TABLE } = QP;
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
// the landing block: the held draft, the ONE landing (landDraft), its re-judge + the blur listener, the sync handler
const d0 = ci.indexOf('    this._heldDraft = null;\n'), d1 = ci.indexOf('\n    };\n', ci.indexOf('    this._draftSyncHandler = (value, key, op) => {'));
const HANDLER = d0 > 0 && d1 > d0 ? ci.slice(d0, d1 + 7) : '';
// the input listener's autosave callback, cut verbatim (the timer nulls itself, saves, judges a held draft again)
const TIMER = (ci.match(/this\._draftTimer = setTimeout\((\(\) => \{[^\n]*?\}), 300\);/) || [])[1] || '';
const LAND_RE = /    this\._landDraft = \(value, op, held = false\) => \{\n[\s\S]*?\n    \};\n/;
// the pre-fix pair (CONTROL): a client whose arrival rule has no delta row, a store whose state-set has no belt, a
// composer that overwrites the box with the op's value (no landing)
const PRE_FIX_ARRIVAL = (input) => arrivalVerdict({ ...input, remote: input && input.remote ? { ...input.remote, prepended: undefined } : input && input.remote });
const NO_BELT = (belt, value) => value;
const PRE_FIX_HANDLER = HANDLER.replace(LAND_RE, "    this._landDraft = (value) => { this._textarea.value = value || ''; this._autoSize?.(); };\n");
// THIS LANE'S RED CONTROL = the 2.369.354 composer: the put-back prefix, otherwise the box OVERWRITTEN; its autosave reads
// the box when it fires (so it writes back whatever landed) and never nulls itself
const BASE_354_HANDLER = HANDLER.replace(LAND_RE, `    this._landDraft = (value, op) => {
      if (op && Number.isSafeInteger(op.prepended) && op.prepended > 0) {
        const focused = typeof document !== 'undefined' && document.activeElement === this._textarea;
        const r = landDraftPrepend({ current: this._textarea.value, selStart: this._textarea.selectionStart, selEnd: this._textarea.selectionEnd, value: value || '', prepended: op.prepended });
        this._textarea.value = r.value;
        if (focused) { try { this._textarea.setSelectionRange(r.selStart, r.selEnd); } catch { } }
        this._autoSize?.();
        if (r.value !== (value || '')) { clearTimeout(this._draftTimer); this._draftTimer = null; saveDraft('chat', this._sessionId, r.value); }
        return;
      }
      this._textarea.value = value || '';
      this._autoSize?.();
    };
`);
const BASE_354_TIMER = "() => saveDraft('chat', this._sessionId, this._textarea.value)";

console.log('§0 the cuts');
ok(/case 'state-set'/.test(CASES) && /putbackBelt\(belt, data\.value, data\.basedOn\)/.test(CASES) && /store\.set\(data\.key, value, ws, data\.basedOn\)/.test(CASES), 'src/ws-handler.js: the state-set case cut verbatim — the belt judges the value before the store writes it');
ok(CLASS.includes('this._notify(s, op.key, op.op === \'delete\' ? \'\' : op.value, op);') && /_notify\(s, key, value, op\)/.test(CLASS), 'src/lib/utils.js: the client StateSync cut verbatim — its listeners get (value, key, op)');
ok(/landDraft\(\{ focused, dirty: this\._draftTimer !== null,/.test(HANDLER) && /if \(v\.save\) saveDraft\('chat', this\._sessionId, v\.value\);/.test(HANDLER) && /this\._landDraft\(value \|\| '', op\);/.test(HANDLER) && !/dispatchEvent/.test(HANDLER), 'src/lib/chat-input.js: the composer\'s landing block cut verbatim — ONE verdict (landDraft) for every arrival, the prefix saved once, NO synthetic input');
ok(/this\._draftTimer = null; saveDraft\('chat', this\._sessionId, this\._textarea\.value\); this\._judgeHeldDraft\(\);/.test(TIMER), 'src/lib/chat-input.js: the autosave callback cut verbatim — it nulls its timer, saves, judges a held draft again', TIMER);
ok(PRE_FIX_HANDLER !== HANDLER && BASE_354_HANDLER !== HANDLER && !/landDraft\(\{|op\.prepended/.test(PRE_FIX_HANDLER) && /this\._textarea\.value = value \|\| '';/.test(PRE_FIX_HANDLER) && /landDraftPrepend\(/.test(BASE_354_HANDLER), 'control targets present: the landing (the pre-.353 composer overwrites; the .354 one prepends a put-back, overwrites the rest)');

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
  ok(S(N) === S({ n: 3, images: 2, others: 2, cut: 1, omitted: 2, started: 0 }), 'putbackNotice: n = rows whose text came back, images / others = attachments named not restored, cut, omitted, started (none here)', N);

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
  const fixture = [{ id: 'q1', msgId: 'm1', ts: 3, text: 'hello', attachments: [{ type: 'image', mimeType: 'x', mime: 'image/jpeg' }] }, { id: 'q0', msgId: 'm0', ts: 2, text: 'it had started', started: true, attachments: [] }, { id: 'q9', text: 'not a boolean', started: 'yes' }, { id: 'q2', msgId: '', ts: null, text: 'z'.repeat(PUTBACK_ITEM_MAX_CHARS + 7), attachments: [] }, null, ...Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, text: 'w'.repeat(19999) }))];
  const want = S(droppedRecordFor(fixture, { dropId: '9-9', turnId: 'turn-1' }));
  for (const w of ['data/bin/acp-wrapper.js', 'data/bin/agy-wrapper.js', 'data/bin/codex-chat-wrapper.js', 'data/bin/chat-wrapper.js']) {
    const twin = cutFn(read(w));
    let got = null; try { got = S(new Function(twin + '\nreturn droppedRecordFor;')()(fixture, { dropId: '9-9', turnId: 'turn-1' })); } catch (e) { got = 'threw ' + e.message; }
    ok(twin && twin === pure && got === want, `${w}: the inline droppedRecordFor twin is byte-identical to src/queue-putback.js and answers the same fixture (${twin.length} chars)`, { same: twin === pure, got: got && got.slice(0, 200) });
  }
  ok(/"started":true/.test(want) && (want.match(/"started"/g) || []).length === 1, 'the twins\' fixture carries ONE started row (`started: true` only — a non-boolean is no claim)', want.slice(0, 300));
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
function world({ cls = CLASS, cases = CASES, handlerSrc = HANDLER, timerSrc = TIMER, land = landDraft, belt = beltValue, arrival = arrivalVerdict, filePath = null, storeUp = true } = {}) {
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
    const ta = { value: '', selectionStart: 0, selectionEnd: 0, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }, _on: {}, addEventListener(t, f) { (this._on[t] ||= []).push(f); } };
    const doc = { activeElement: ta };   // no hasFocus() ⇒ the page is not focused (the §2–§3 composers); §8's call focus()
    const timers = new Set();
    const composer = { _sessionId: SID, _textarea: ta, _pendingEdit: null, _editingQueueId: null, _editDraftBefore: null, _draftTimer: null, _autoSize() { } };
    const saveDraft = (type, id, value) => sync.set('drafts', type + ':' + id, value);
    const loadDraft = (type, id) => sync.get('drafts', type + ':' + id) || '';
    // afterPress: no pointer in this world — the judge runs one event later (the product: one task later)
    new Function('landDraft', 'landDraftPrepend', 'saveDraft', 'loadDraft', 'document', 'clearTimeout', 'afterPress', `return function install() {\n${handlerSrc}\n};`)(land, landDraftPrepend, saveDraft, loadDraft, doc, (h) => { timers.delete(h); }, (fn) => clock.at(clock.now, fn)).call(composer);
    const autosave = new Function('saveDraft', `return ${timerSrc};`).call(composer, saveDraft);
    const C = {
      name, events, sync, ta, composer, timers,
      async init() { await sync.init('drafts'); sync.on('drafts', KEY, composer._draftSyncHandler); },
      sets() { return events.filter((e) => e.kind === 'sent' && e.d.type === 'state-set'); },
      syncs() { return events.filter((e) => e.kind === 'frame' && e.d.type === 'state-sync'); },
      acks() { return events.filter((e) => e.kind === 'frame' && e.d.type === 'state-ack'); },
      // the person types: the box changes and the 300 ms autosave is armed (a fake timer the test fires by hand)
      // (the input listener: the previous timer cleared, a new one armed; its callback = the product's, cut verbatim)
      type(text) { ta.value += text; ta.selectionStart = ta.selectionEnd = ta.value.length; timers.clear(); const h = { fire: () => { if (timers.has(h)) { timers.delete(h); autosave(); } } }; timers.add(h); composer._draftTimer = h; return h; },
      autosaveNow() { for (const h of [...timers]) h.fire(); },
      // a keystroke on the world's clock: the 300 ms debounce fires unless another keystroke re-arms it first
      key(text) { const h = C.type(text); clock.at(clock.now + 300, () => h.fire()); },
      focus() { doc.activeElement = ta; doc.hasFocus = () => true; },
      blur() { doc.activeElement = null; doc.hasFocus = () => false; for (const f of ta._on.blur || []) f(); },
      sentValues() { return C.sets().map((e) => e.d.value); },
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
  ok(m1.length === 1 && S({ ...m1[0], op: undefined, subtype: undefined }) === S({ dropId: '1-1', n: 1, images: 1, others: 0, cut: 0, omitted: 0, started: 0 }) && unknown(a) === 0, 'acp: ONE `queue-putback` meta op {dropId, n, images, others, cut, omitted, started}, zero unknown-record cards', m1);
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
  // claude (2.369.354): the wrapper's TOP-LEVEL records on the claude stream — the bubble the server fed live (the
  // adapter's userMsg) carries its msgId, the held row chips it, Stop's per-item result says removed, ONE toast
  const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');
  const cl = createMessageManager('claude', 'putback-claude');
  const clops = []; cl.onOp((o) => clops.push(o));
  cl.processLive(new ClaudeCodeAdapter({ buffersDir: os.tmpdir() }).formatChatInput('held while a turn runs', 'm-cl1').userMsg);
  const VERBS = ['remove', 'reorder', 'edit'];
  cl.processLive({ type: 'queue_changed', items: [{ id: 'q1-9', msgId: 'm-cl1', preview: 'held while a turn runs', text: 'held while a turn runs', ts: 1, kind: 'user', from: null }], turn_id: null, verbs: VERBS });
  cl.processLive({ type: 'queued_input', msg_id: 'm-cl1', turn_id: null });
  const clb = cl.messages.find((m) => m.role === 'user');
  const queuedChip = clb && clb.queueState;
  cl.processLive({ type: 'queue_op_result', op: 'remove', id: 'q1-9', ok: true, msg_id: 'm-cl1', reason: 'stopped' });
  cl.processLive({ type: 'queue_dropped', dropId: '9-1', by: 'stop', turnId: null, items: [{ id: 'q1-9', msgId: 'm-cl1', ts: 1, text: 'held while a turn runs', cut: false, attachments: [] }], omitted: 0 });
  cl.processLive({ type: 'queue_changed', items: [], turn_id: null, verbs: VERBS });
  ok(clb && clb.webuiMsgId === 'm-cl1' && queuedChip === 'queued' && clb.queueState === 'removed' && metaOps(clops).length === 1 && metaOps(clops)[0].n === 1 && unknown(cl) === 0 && cl.queueState().length === 0 && S(cl.queueVerbsPublished()) === S(VERBS),
    'claude: the live bubble carries its msgId, the held row chips it queued, Stop\'s result marks it removed (the emptied republish leaves that alone), ONE meta op, zero unknown-record cards', { chip: queuedChip, now: clb && clb.queueState, metas: metaOps(clops), cards: cl.messages.map((m) => m.noticeKind) });
  ok(/case 'queue_dropped': return this\._processQueueDropped\(raw, emit\);/.test(read('src/message-manager.js')), 'claude routes the raw top-level record to the base method too (no second reader)');
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
  const cw = read('data/bin/chat-wrapper.js');
  ok(order(cw, /for \(const q of dropped\) record\('queue_op_result', \{ op: 'remove', id: q\.id, ok: true, msg_id: q\.msgId, reason: 'stopped' \}\);/, /if \(putBack\.length\) record\('queue_dropped', droppedRecordFor\(/, /\n  publishQueue\(\);\n  log\(`interrupt: dropped/)
    && /if \(parsed\.type === 'control_request' && parsed\.request && parsed\.request\.subtype === 'interrupt'\) dropHeldForStop\(\);/.test(cw), 'chat-wrapper (2.369.354): per-item stopped results → ONE queue_dropped → the emptied republish, all BEFORE the interrupt line goes on to the CLI');
  ok(/const putBack = dropped\.filter\(\(q\) => !q\.origin\);/.test(cw), 'chat-wrapper: only the person\'s rows come back — a frame VibeSpace typed (webui_origin: auto-resume / dispatch) is dropped, never put into the composer');
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

// ── §6 CLAUDE, LIVE ──
console.log('§6 claude, live — the REAL chat-wrapper over a stand-in CLI, its stdout through the REAL door');
{
  // the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs): the measured stream-json turn shape — running → result →
  // idle per frame, a mid-turn frame queued and RUN after an interrupt (the 2.1.308 measurement, +27 ms)
  const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return fn(); };
  const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');
  const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
  const runOne = async (wrapperPath, label) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-putback-claude-'));
    const cap = path.join(dir, 'cli-got.jsonl');
    // a FILE, never `-e`: the wrapper appends the transport flags (--output-format …), which node would read as its own
    const w = spawn(process.execPath, [wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STUB_CAPTURE: cap, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
    const recs = []; let lb = '';
    w.stdout.setEncoding('utf8');
    w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } } });
    const got = () => (fs.existsSync(cap) ? fs.readFileSync(cap, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
    const gotUser = (t) => got().some((f) => f.type === 'user' && JSON.stringify(f).includes(t));
    const turns = () => recs.filter((r) => r.type === 'system' && r.state === 'running').length;
    await until(() => fs.existsSync(path.join(dir, 's.json')));
    w.stdin.write(ad.formatChatInput('LONG-A the running turn', 'm-a').stdinPayload + '\n');
    await until(() => turns() >= 1);
    w.stdin.write(ad.formatChatInput('B typed while A runs', 'm-b').stdinPayload + '\n');
    await until(() => recs.some((r) => r.type === 'queue_changed' && (r.items || []).length) || gotUser('B typed while A runs'), 2000);
    const heldBeforeStop = !gotUser('B typed while A runs');
    const stopLine = ad.formatInterrupt();
    const recsAtStop = recs.length;
    w.stdin.write(stopLine + '\n');
    await until(() => got().some((f) => f.type === 'control_request'));
    await sleep(400);   // anything that would run after the interrupt has run by now (the CLI's own: +27 ms)
    const after = recs.slice(recsAtStop).filter((r) => r.type !== '_stdin_ack');
    const out = { heldBeforeStop, bRan: gotUser('B typed while A runs'), turnsAfterStop: after.filter((r) => r.type === 'system' && r.subtype === 'init').length, after, recs };
    try { w.kill('SIGKILL'); } catch { }
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };
  const r = await runOne(path.join(REPO, 'data/bin/chat-wrapper.js'), 'lane');
  const kinds = r.after.map((x) => x.type + (x.reason ? ':' + x.reason : ''));
  const iRes = kinds.indexOf('queue_op_result:stopped'), iDrop = kinds.indexOf('queue_dropped'), iEmpty = r.after.findIndex((x) => x.type === 'queue_changed' && !(x.items || []).length), iCtl = kinds.indexOf('control_response');
  ok(r.heldBeforeStop, '§6 a frame typed while a turn runs is HELD by the wrapper — the CLI never got it');
  ok(iRes >= 0 && iDrop > iRes && iEmpty > iDrop && iCtl > iEmpty, `§6 Stop: the stopped result → ONE queue_dropped → the emptied queue_changed, then the CLI answers the interrupt (${kinds.join(' · ')})`);
  ok(!r.bRan && r.turnsAfterStop === 0, '§6 NOTHING RUNS after Stop (the 2026-09-07 law) — the held frame never reached the CLI, no turn started', { bRan: r.bRan, turns: r.turnsAfterStop });
  // the wrapper's stdout through the REAL door into a REAL drafts store
  const store = new SyncStore('drafts', null, { clients: new Set() }, { saveDelay: 60000 });
  const door = DOOR.create({ getSyncStore: () => store, log: () => { } });
  const session = {};
  for (const rec of r.recs) door.onLiveRecord(session, 'claude-live', rec);
  ok(store.get('chat:claude-live') === 'B typed while A runs\n\n', '§6 …and the words come back: the REAL door writes the held text into the session\'s draft', store.get('chat:claude-live'));
  const drop = r.recs.find((x) => x.type === 'queue_dropped');
  ok(drop && drop.items.length === 1 && drop.items[0].msgId === 'm-b' && drop.items[0].text === 'B typed while A runs', '§6 the record names the bubble (msgId from the frame\'s webui_msg_id) and the full text', drop);
  // CONTROL — the same flow with the frame forwarded to the CLI mid-turn (the pre-.354 wrapper: no hold): it RUNS
  // after the interrupt, exactly what the 2.1.308 measurement saw. A copy of the wrapper with its hold switched off.
  const ctlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-putback-claude-ctl-'));
  const cwSrc = read('data/bin/chat-wrapper.js');
  const ctlSrc = cwSrc.replace("if (!turnBusy || !opensTurn(o)) { forwardUser(line, o, buffered); return; }", "{ forwardUser(line, o, buffered); return; }");
  fs.mkdirSync(path.join(ctlDir, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(ctlDir, 'src'));
  fs.writeFileSync(path.join(ctlDir, 'data', 'bin', 'chat-wrapper.js'), ctlSrc);
  const c = await runOne(path.join(ctlDir, 'data', 'bin', 'chat-wrapper.js'), 'control');
  ok(ctlSrc !== cwSrc && !c.heldBeforeStop && c.bRan && c.turnsAfterStop === 1, '§6 CONTROL: forwarded mid-turn (no hold), the frame RUNS right after the interrupt — the leg above can say no', { mutated: ctlSrc !== cwSrc, held: c.heldBeforeStop, ran: c.bRan, turns: c.turnsAfterStop });
  fs.rmSync(ctlDir, { recursive: true, force: true });
  // AN INIT SAID OUTSIDE A TURN opens nothing: a CLI (or a stand-in) that says `system/init` before its first input must
  // not wedge the gate — the first frame still reaches it. The turn start an init marks is only one said while the CLI's
  // last word was 'running' (a background task's notification turn has nothing else). CONTROL: a gate that starts a turn
  // on ANY init holds that first frame for ever.
  const bootOne = async (wrapperPath) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-putback-claude-boot-'));
    const cap = path.join(dir, 'cli-got.jsonl');
    const w = spawn(process.execPath, [wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STUB_CAPTURE: cap, STAND_IN_BOOT_INIT: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
    let out = ''; w.stdout.setEncoding('utf8'); w.stdout.on('data', (d) => { out += d; });
    await until(() => /"subtype":"init"/.test(out));
    w.stdin.write(ad.formatChatInput('the first message after a boot init', 'm-boot').stdinPayload + '\n');
    const reached = await until(() => fs.existsSync(cap) && fs.readFileSync(cap, 'utf8').includes('the first message after a boot init'), 1500);
    try { w.kill('SIGKILL'); } catch { }
    fs.rmSync(dir, { recursive: true, force: true });
    return reached;
  };
  ok(await bootOne(path.join(REPO, 'data/bin/chat-wrapper.js')), '§6 an init said BEFORE any input (no turn behind it) opens nothing — the first message reaches the CLI');
  const anyInitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-putback-claude-anyinit-'));
  const anyInitSrc = cwSrc.replace("msg.subtype === 'init' && busyWord;", "msg.subtype === 'init';");
  fs.mkdirSync(path.join(anyInitDir, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(anyInitDir, 'src'));
  fs.writeFileSync(path.join(anyInitDir, 'data', 'bin', 'chat-wrapper.js'), anyInitSrc);
  ok(anyInitSrc !== cwSrc && !(await bootOne(path.join(anyInitDir, 'data', 'bin', 'chat-wrapper.js'))), '§6 CONTROL: a gate that starts a turn on ANY init holds that first message for ever — the leg above can say no');
  fs.rmSync(anyInitDir, { recursive: true, force: true });
}

// ── §7 THE STARTED ROW (lane codex-interrupted-putback) ──
console.log('§7 the started row (codex: drained, then cut off by Stop)');
{
  // the shape: `started` rides only when true, in the record AND through the ONE extractor
  const rec = droppedRecordFor([{ id: 'qa', msgId: 'ma', text: 'queued', attachments: [] }, { id: 'qb', msgId: 'mb', text: 'it had started', started: true, attachments: [] }, { id: 'qc', msgId: 'mc', text: 'claim', started: 1 }], { dropId: '5-1', turnId: 'turn-3' });
  ok(rec.items.length === 3 && !('started' in rec.items[0]) && rec.items[1].started === true && !('started' in rec.items[2]), 'droppedRecordFor: `started: true` rides on its row only (absent elsewhere — the older shape unchanged; 1 is no boolean)', rec.items);
  const ex = queueDroppedOf({ type: 'event_msg', payload: { type: 'queue_dropped', ...rec } });
  ok(ex && ex.items[1].started === true && !('started' in ex.items[0]) && !('started' in ex.items[2]), 'queueDroppedOf: carries `started` through (true only)', ex && ex.items);
  // counted, merged
  const N = putbackNotice(rec);
  ok(N.n === 3 && N.started === 1, 'putbackNotice: the started row is one of the n that came back, and counted as started', N);
  ok(putbackNotice({ items: [{ text: '  ', started: true, attachments: [{ type: 'image' }] }] }).started === 0, 'putbackNotice: a started row with no text came back as no words ⇒ not counted as started (started ⊆ n)');
  const m = mergeDraft('draft', rec.items);
  ok(m.text === 'queued' + PUTBACK_SEP + 'it had started' + PUTBACK_SEP + 'claim' + PUTBACK_SEP + 'draft' && m.count === 3, 'mergeDraft: a started row merges like any row, in queue order (mergeDraft unchanged)', m);
  // THE RULE — by the turn's state
  ok(drainedWasStopped({ turnId: 'turn-3', stopTurnId: 'turn-3', ended: false }) === true, 'drainedWasStopped: its turn IS the one Stop interrupts and has not ended ⇒ stopped (put back)');
  ok(drainedWasStopped({ turnId: 'turn-2', stopTurnId: 'turn-2', ended: true }) === false, 'drainedWasStopped: its turn ENDED ⇒ it RAN to the end — stays gone');
  ok(drainedWasStopped({ turnId: 'turn-2', stopTurnId: 'turn-3', ended: false }) === false && drainedWasStopped({ turnId: 'turn-2', stopTurnId: null }) === false, 'drainedWasStopped: another turn is the one Stop interrupts (or none) ⇒ stays gone');
  ok(drainedWasStopped({ turnId: null, stopTurnId: null }) === false && drainedWasStopped({ turnId: '', stopTurnId: '' }) === false && drainedWasStopped() === false, 'drainedWasStopped: no witness (the turn was never named) ⇒ nothing proves it was stopped — stays gone');
  // RED CONTROL: the rule without its turn-state clause puts back a row that ran to completion (the leg above would red)
  const src = read('src/queue-putback.js');
  const cutRule = (txt) => { const a = txt.indexOf('function drainedWasStopped('); if (a < 0) return ''; const z = txt.indexOf('\n}\n', a); return z > a ? txt.slice(a, z + 2) : ''; };
  const pureRule = cutRule(src);
  const mutant = pureRule.replace(' && ended !== true', '');
  ok(mutant !== pureRule && new Function(mutant + '\nreturn drainedWasStopped;')()({ turnId: 'turn-2', stopTurnId: 'turn-2', ended: true }) === true, 'RED CONTROL: the rule without `ended` puts back a completed-turn row — the gone-stays-gone leg bites');
  const mutant2 = pureRule.replace(' && turnId === stopTurnId', '');
  ok(mutant2 !== pureRule && new Function(mutant2 + '\nreturn drainedWasStopped;')()({ turnId: 'turn-2', stopTurnId: 'turn-3', ended: false }) === true, 'RED CONTROL: the rule without the same-turn clause puts back a row of another turn');
  // the codex wrapper's twin: byte-identical, and the sweep reads the witness, judges after the loop, inside the latch
  const cx = read('data/bin/codex-chat-wrapper.js');
  const twin = cutRule(cx);
  ok(twin && twin === pureRule, `data/bin/codex-chat-wrapper.js: the inline drainedWasStopped twin is byte-identical to src/queue-putback.js (${twin.length} chars)`);
  ok(/if \(item\.type === 'userMessage'\) noteCidTurn\(item\.clientId \|\| item\.client_id, itemCtx\.turnId\);/.test(cx), 'codex-chat-wrapper: the witness — every userMessage item names the turn its submission entered');
  const sweep = cx.slice(cx.indexOf('async function _clearQueueForStop()'), cx.indexOf('function interruptTurn('));
  const iDrain = sweep.indexOf('drained.push({ id, cid'), iJudge = sweep.indexOf('drainedWasStopped({ turnId: cidTurns.get(d.cid) || null, stopTurnId: stopTurn, ended: completedTurns.has(cidTurns.get(d.cid)) })'), iLatch = sweep.indexOf('} finally { queueSweepActive = false; }'), iRec = sweep.indexOf("if (putBack.length) emitTaskEvent('queue_dropped', droppedRecordFor(putBack,");
  ok(iDrain > 0 && iJudge > iDrain && iLatch > iJudge && iRec > iLatch, `codex-chat-wrapper: a drained row is held, judged by its turn AFTER the loop and INSIDE the latch, then the ONE record (${iDrain} < ${iJudge} < ${iLatch} < ${iRec})`);
  ok(/reason: 'gone', started: true, detail: 'it had started and was stopped — put back', msg_id: d\.msgId/.test(sweep) && /putBack\.splice\(drained\[k\]\.at, 0, \{ \.\.\.drained\[k\]\.row, started: true \}\)/.test(sweep) && /row: \(known \? known\.kind !== 'peer' : !\/\^\(peer\|notif\)-\\d\+-\\d\+\$\/\.test\(cid\)\) \?/.test(sweep), 'codex-chat-wrapper: its result stays honest (gone + started + the detail), its row joins in queue order, and only the person\'s row ever does (a drained peer stays gone)');
  // the normalizers: the chip names it, the card says it, the toast counts it — and nothing reads as an unknown field
  const { createMessageManager } = require('../src/normalizers.js');
  const c = createMessageManager('codex', 'putback-started');
  const ops = []; c.onOp((o) => ops.push(o));
  c.processLive({ timestamp: 'x', type: 'response_item', payload: { type: 'message', role: 'user', webui_msg_id: 'mb', content: [{ type: 'input_text', text: 'it had started' }] } });
  c.processLive({ timestamp: 'x', type: 'event_msg', payload: { type: 'queue_op_result', op: 'remove', id: 'qb', ok: false, reason: 'gone', started: true, detail: 'it had started and was stopped — put back', msg_id: 'mb' } });
  c.processLive({ timestamp: 'x', type: 'event_msg', payload: { type: 'queue_dropped', ...rec } });
  const bubble = c.messages.find((x) => x.role === 'user');
  const meta = ops.filter((o) => o.op === 'meta' && o.subtype === 'queue-putback');
  const res = ops.find((o) => o.op === 'meta' && o.subtype === 'queue-result');
  const cards = c.messages.filter((x) => x.role === 'system').map((x) => x.content?.[0]?.text || '');
  ok(bubble && bubble.queueState === 'stopped' && ops.some((o) => o.op === 'edit' && o.fields && o.fields.queueState === 'stopped'), "codex: the started row's bubble reads 'stopped' (it reached the agent — 'Removed' would be false)", bubble && bubble.queueState);
  ok(meta.length === 1 && meta[0].n === 3 && meta[0].started === 1, 'codex: ONE queue-putback meta op, started counted', meta);
  ok(res && res.reason === 'gone' && /had already started — Stop stopped it and put it back into the input box/.test(res.text || '') && cards.some((x) => /had already started/.test(x)) && !cards.some((x) => /it already ran/.test(x)), 'codex: the result and its card say it started and came back — never «it already ran»', { res, cards });
  ok(!c.messages.some((x) => /unknown/.test(String(x.noticeKind || ''))), 'codex: `started` (on the result, inside the record\'s items) raises no unknown-record / unknown-fields card (record-shape judges top-level keys)', c.messages.map((x) => x.noticeKind));
  const plain = createMessageManager('codex', 'putback-gone');
  plain.processLive({ timestamp: 'x', type: 'event_msg', payload: { type: 'queue_op_result', op: 'remove', id: 'qz', ok: false, reason: 'gone', msg_id: '' } });
  ok(plain.messages.some((x) => x.role === 'system' && /no longer queued — it already ran/.test(x.content?.[0]?.text || '')), 'codex: a plain gone (it RAN) keeps its words');
  // the client: the toast clause + the chip words, through t() with zh and ja
  const view = read('src/lib/chat-view.js'), rend = read('src/lib/chat-renderers.js');
  ok(/\(op\.started > 0 \? t\(', \{n\} had already started and was stopped — put back too', \{ n: op\.started \}\) : ''\)/.test(view), 'chat-view: the toast adds the started clause only when started > 0');
  ok(/state !== 'removed' && state !== 'stopped'\) return null;/.test(rend) && /state === 'stopped' \? t\('Started, then stopped'\)/.test(rend), "chat-renderers: the chip has a 'stopped' state with its own words");
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [', {n} had already started and was stopped — put back too', 'Started, then stopped', 'It had already started when Stop cut it off — its words are back in the input box'];
  ok(keys.every((k) => (view + rend).includes(`t('${k}'`) && zh.includes(`"${k}":`) && ja.includes(`"${k}":`)), 'the three new strings go through t() with zh AND ja entries');
}

// ── §8 THE DRAFT LANDING (lane draft-focus-guard) ──
console.log('§8 the draft landing — a draft another client saved never replaces what you are typing (B-b0fa)');
// the 2.369.354 verdict, as landDraft's shape (CONTROL): a put-back prepends, everything else replaces
const BASE_354_LAND = (o) => (o && Number.isSafeInteger(o.prepended) && o.prepended > 0 ? landDraft(o) : { act: 'replace', why: 'free', value: typeof o.incoming === 'string' ? o.incoming : '' });
const keeps = (whole, part) => { let i = 0; for (const ch of whole) if (i < part.length && ch === part[i]) i++; return i === part.length; };
{
  const ROWS = [
    ['the report: A focused mid-typing, B\'s autosave «oko…k» arrives', { focused: true, dirty: true, current: '好，退款那条也改成同样的策略', incoming: 'oko…k' }, 'hold', 'focused'],
    ['the verifier: B focused, «x» typed and not saved yet, A\'s «hel» arrives', { focused: true, dirty: true, current: 'x', incoming: 'hel' }, 'hold', 'focused'],
    ['…the same box unfocused, «x» still unsaved', { focused: false, dirty: true, current: 'x', incoming: 'hel' }, 'hold', 'typing'],
    ['focused, nothing unsaved (a pause past the autosave)', { focused: true, dirty: false, current: 'saved words', incoming: 'other words' }, 'hold', 'focused'],
    ['focused, an empty box', { focused: true, current: '', incoming: 'from B' }, 'hold', 'focused'],
    ['unfocused and clean — as before the rule', { focused: false, dirty: false, current: 'old', incoming: 'new' }, 'replace', 'free'],
    ['unfocused and clean, a clear from another client (it sent)', { current: 'sent elsewhere', incoming: '' }, 'replace', 'free'],
    ['the value equals the box', { focused: true, dirty: true, current: 'same', incoming: 'same' }, 'drop', 'same'],
    ['re-judge: the store no longer holds it (this client saved since)', { held: true, stored: 'x', current: 'x', incoming: 'hel', taken: '' }, 'drop', 'superseded'],
    ['re-judge at the blur, the box empty', { held: true, stored: 'from B', current: '', incoming: 'from B', taken: 'old' }, 'replace', 'free'],
    ['re-judge at the blur, words typed here it would delete', { held: true, stored: 'other words', current: 'my words', incoming: 'other words', taken: '' }, 'hold', 'typed-here'],
    ['re-judge at the blur, the other client CONTINUED the words', { held: true, stored: 'hello world', current: 'hello', incoming: 'hello world', taken: '' }, 'replace', 'free'],
    ['re-judge at the blur, the box shows what it took from the store', { held: true, stored: '', current: 'shared', incoming: '', taken: 'shared' }, 'replace', 'free'],
    ['re-judge, the box still focused', { held: true, stored: 'v', focused: true, current: '', incoming: 'v', taken: '' }, 'hold', 'focused'],
    ['the put-back, focused mid-typing', { focused: true, dirty: true, current: 'typing', incoming: 'Q\n\nold', prepended: 3, selStart: 6, selEnd: 6 }, 'replace', 'putback'],
  ];
  for (const [name, input, act, why] of ROWS) { const v = landDraft(input); ok(v.act === act && v.why === why, `landDraft: ${name} ⇒ ${act} (${why})`, v); }
  const pb = landDraft(ROWS.at(-1)[1]);
  ok(pb.value === 'Q\n\ntyping' && pb.selStart === 9 && pb.selEnd === 9 && pb.save === true, 'landDraft: the put-back row IS landDraftPrepend (prefix + live box, caret moved, saved once — it differs from the op)', pb);
  const strs = ['', 'mine', 'mine and more', 'theirs'];
  const bad = [], whys = [];
  let n = 0;
  for (const focused of [false, true]) for (const dirty of [false, true]) for (const held of [false, true]) for (const current of strs) for (const incoming of strs)
    for (const stored of [incoming, 'elsewhere']) for (const taken of [current, '']) for (const prepended of [undefined, 0, 2]) {
      const v = landDraft({ focused, dirty, held, current, incoming, stored, taken, prepended });
      n++; if (!whys.includes(v.why)) whys.push(v.why);
      const putback = prepended > 0;
      if (!putback && (focused || dirty) && v.act === 'replace') bad.push(['a focused or typing box replaced', { focused, dirty, current, incoming }]);
      if (putback && !(v.act === 'replace' && v.value === incoming.slice(0, 2) + current)) bad.push(['a put-back that is not prefix + the live box', { current, incoming, v }]);
      if (!putback && v.act === 'replace' && v.value !== incoming) bad.push(['a replace that is not the value', { current, incoming, v }]);
      if (!putback && held && v.act === 'replace' && current !== '' && current !== taken && !keeps(incoming, current)) bad.push(['a held value deleted words typed here', { current, incoming, taken }]);
      if (v.why === 'superseded' && !(held && stored !== incoming)) bad.push(['superseded outside a re-judge', { held, stored, incoming }]);
      if (v.act !== 'replace' && 'value' in v) bad.push(['a hold / drop carries a value', v]);
    }
  ok(bad.length === 0, `landDraft over ${n} combinations: a focused or typing box is never replaced, a put-back is prefix + the live box, a replace is the value, a held value never deletes words typed here`, bad.slice(0, 3));
  ok(S(whys.slice().sort()) === S(DRAFT_LANDING_TABLE.map((r) => r.why).sort()) && DRAFT_LANDING_TABLE.length === 7 && DRAFT_LANDING_TABLE.every((r) => ['replace', 'hold', 'drop'].includes(r.act) && r.when && r.then), 'DRAFT_LANDING_TABLE: its seven rows are exactly the verdicts the grid reaches (replace / hold / drop, each with when + then)', whys);
  ok(BASE_354_LAND(ROWS[0][1]).act === 'replace' && BASE_354_LAND(ROWS[1][1]).act === 'replace', 'RED CONTROL (PURE): the 2.369.354 rule replaces the report\'s focused, typing box and the verifier\'s');
}
// two composers on one conversation over the §3 world: the real StateSync + ws cases + the landing block + the autosave callback
const frameTypes = (...cs) => [...new Set(cs.flatMap((c) => c.events.map((e) => (e.kind === 'sent' ? 'sent:' : '') + e.d.type)))].sort();
async function verifierRun(opts = {}) {
  const w = world(opts);
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  A.focus(); B.focus();
  w.clock.at(0, () => A.key('h')); w.clock.at(40, () => A.key('e')); w.clock.at(80, () => A.key('l'));   // A's «hel» is saved at 380
  w.clock.at(200, () => B.key('x'));                                                                      // B's «x» is due at 500
  w.clock.run();
  return { w, A, B, srv: w.store.get(KEY) };
}
{
  const r = await verifierRun();
  ok(r.A.ta.value === 'hel' && r.B.ta.value === 'x', `⑧ the verifier's case: B focused with «x» unsaved when A's «hel» arrives — each box keeps what was typed in it (A «${r.A.ta.value}», B «${r.B.ta.value}»)`, { A: r.A.ta.value, B: r.B.ta.value });
  ok(S(r.B.sentValues()) === S(['x']) && S(r.A.sentValues()) === S(['hel']) && r.srv === 'x', '⑧ …B\'s autosave saved «x» — never a value it did not type — and the store holds the last save', { A: r.A.sentValues(), B: r.B.sentValues(), srv: r.srv });
  ok(r.B.composer._heldDraft === null && r.A.composer._heldDraft === 'x', '⑧ …B\'s own save SUPERSEDED the «hel» it held; A, still focused, holds «x» (not dropped: the store has it)', { A: r.A.composer._heldDraft, B: r.B.composer._heldDraft });
  r.A.blur(); r.w.clock.run();
  ok(r.A.ta.value === 'hel' && r.A.composer._heldDraft === 'x' && r.A.sentValues().length === 1, '⑧ …A blurs: «hel» was typed here and «x» does not keep it ⇒ still held, nothing sent (typed words are never deleted by a held draft)', { A: r.A.ta.value, held: r.A.composer._heldDraft });
  ok(S(frameTypes(r.A, r.B)) === S(['sent:state-set', 'state-ack', 'state-sync']), '⑧ …no new frame: holding, re-judging and superseding use the store\'s own set / sync / ack', frameTypes(r.A, r.B));
  const base = await verifierRun({ handlerSrc: BASE_354_HANDLER, timerSrc: BASE_354_TIMER });
  ok(base.B.ta.value === 'hel' && base.B.sentValues().includes('hel') && base.srv === 'hel' && !base.A.ta.value.includes('x') && !base.B.ta.value.includes('x'), `⑧ RED CONTROL (the 2.369.354 composer): B's focused box became «${base.B.ta.value}», its own pending autosave then SAVED «hel» — «x» lost on both sides (server «${base.srv}»)`, { A: base.A.ta.value, B: base.B.ta.value, Bsent: base.B.sentValues(), srv: base.srv });
}
async function interleave(gap, opts = {}) {
  const w = world(opts);
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  A.focus(); B.focus();
  for (let i = 0; i < 8; i++) { w.clock.at(i * 2 * gap, () => A.key('a')); w.clock.at(i * 2 * gap + gap, () => B.key('b')); }
  w.clock.run();
  const kept = (A.ta.value.match(/a/g) || []).length + (B.ta.value.match(/b/g) || []).length;
  const own = (c, ch) => c.sentValues().every((v) => v === ch.repeat(v.length));
  return { A, B, kept, lost: 16 - kept, ownOnly: own(A, 'a') && own(B, 'b'), srv: w.store.get(KEY), saves: A.sets().length + B.sets().length };
}
for (const gap of [120, 200]) {
  const r = await interleave(gap), base = await interleave(gap, { handlerSrc: BASE_354_HANDLER, timerSrc: BASE_354_TIMER });
  ok(r.A.ta.value === 'aaaaaaaa' && r.B.ta.value === 'bbbbbbbb' && r.lost === 0 && r.ownOnly, `⑧ a×8 / b×8 interleaved every ${gap} ms, both boxes focused (${r.saves} autosaves): 0 of 16 characters lost — each box holds exactly its own typing, each client saved only what it typed`, { A: r.A.ta.value, B: r.B.ta.value, sent: [r.A.sentValues(), r.B.sentValues()] });
  ok(base.lost > 0 && !base.ownOnly, `⑧ RED CONTROL (2.369.354) at ${gap} ms: ${base.lost} of 16 characters lost (A «${base.A.ta.value}», B «${base.B.ta.value}»), a client saved the other's characters`, { A: base.A.ta.value, B: base.B.ta.value, sent: [base.A.sentValues(), base.B.sentValues()] });
}
{
  // A blurs with an EMPTY box ⇒ the remote draft lands; nothing is sent by the landing
  const w = world();
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  A.focus(); B.focus();
  w.clock.at(0, () => B.key('draft typed on B'));
  w.clock.run();
  const heldWhileFocused = A.ta.value === '' && A.composer._heldDraft === 'draft typed on B';
  A.blur(); w.clock.run();
  ok(heldWhileFocused && A.ta.value === 'draft typed on B' && A.composer._heldDraft === null && A.sets().length === 0, '⑧ A focused with an EMPTY box holds B\'s draft; A blurs ⇒ it lands — and the landing sends nothing (the store already has it)', { A: A.ta.value, held: A.composer._heldDraft, sets: A.sets().length });
}
{
  // a blur over words typed here: held (typed-here) until A's own next save supersedes it; CONTROL: without that row they go
  const run = async (land) => {
    const w = world({ land });
    const A = w.client('A'), B = w.client('B');
    await A.init(); await B.init();
    A.focus(); w.clock.at(0, () => A.key('my words')); w.clock.run();              // saved at 300 — clean, still focused
    B.focus(); w.clock.at(w.clock.now + 10, () => B.key(' other words')); w.clock.run();   // B's box took «my words» unfocused, B typed on
    const held = A.composer._heldDraft;
    A.blur(); w.clock.run();
    return { w, A, B, held, afterBlur: A.ta.value };
  };
  const r = await run(landDraft);
  ok(r.held === 'my words other words' && r.afterBlur === 'my words other words' && r.A.composer._heldDraft === null && r.A.sets().length === 1, '⑧ B continued A\'s words while A was focused ⇒ held; A blurs ⇒ «my words other words» keeps every character of «my words» ⇒ it lands, and A sends nothing for it', { held: r.held, afterBlur: r.afterBlur, sets: r.A.sets().length });
}
{
  const run = async (land) => {
    const w = world({ land });
    const A = w.client('A'), B = w.client('B');
    await A.init(); await B.init();
    A.focus(); B.focus();
    w.clock.at(0, () => A.key('my words')); w.clock.at(5, () => B.key('other words')); w.clock.run();   // both saved, each box focused
    A.blur(); w.clock.run();
    const afterBlur = A.ta.value, heldAfterBlur = A.composer._heldDraft;
    A.focus(); w.clock.at(w.clock.now + 10, () => A.key('!')); w.clock.run();
    return { w, A, B, afterBlur, heldAfterBlur };
  };
  const r = await run(landDraft);
  ok(r.afterBlur === 'my words' && r.heldAfterBlur === 'other words', '⑧ A and B typed different words at once; A blurs ⇒ «other words» would delete «my words» (typed here, saved nowhere now) ⇒ STILL HELD', { afterBlur: r.afterBlur, held: r.heldAfterBlur });
  ok(r.A.ta.value === 'my words!' && r.A.composer._heldDraft === null && r.w.store.get(KEY) === 'my words!' && r.B.ta.value === 'other words', '⑧ …A types on ⇒ its own save supersedes the held draft; B, focused, keeps its own words (it holds A\'s)', { A: r.A.ta.value, B: r.B.ta.value, srv: r.w.store.get(KEY) });
  const noRow = await run((o) => { const v = landDraft(o); return v.why === 'typed-here' ? { act: 'replace', why: 'free', value: o.incoming } : v; });
  ok(noRow.afterBlur === 'other words', `⑧ RED CONTROL: without the typed-here row A's blur puts «${noRow.afterBlur}» over the words A typed — gone from every box and the store`, { afterBlur: noRow.afterBlur });
}
{
  // the box shows what it TOOK from the store (nothing typed here): a clear from the client that sent it lands at the blur
  const w = world();
  const A = w.client('A'), B = w.client('B');
  await A.init(); await B.init();
  B.focus(); w.clock.at(0, () => B.key('shared draft')); w.clock.run();        // A, unfocused and clean, took it at arrival
  const took = A.ta.value;
  A.focus();
  w.clock.at(w.clock.now + 10, () => B.sync.set('drafts', KEY, '')); w.clock.run();   // B sent it: its deferred clear
  const heldClear = A.composer._heldDraft === '' && A.ta.value === 'shared draft';
  A.blur(); w.clock.run();
  ok(took === 'shared draft' && heldClear && A.ta.value === '', '⑧ an unfocused clean box takes a draft at arrival (as before); focused, it holds B\'s clear; at the blur the box only showed what it took from the store ⇒ the clear lands', { took, heldClear, A: A.ta.value });
}
{
  // the chat-input wiring the legs above cannot see (the page-level press wait, the send, dispose)
  const at = (re) => re.test(ci);
  ok(at(/function afterPress\(fn\) \{\n  if \(!pressDown\) \{ setTimeout\(fn, 0\); return; \}/) && at(/window\.addEventListener\('pointerdown', \(\) => \{ pressDown = true; \}, true\);/) && at(/this\._textarea\.addEventListener\('blur', \(\) => \{ if \(this\._heldDraft !== null\) afterPress\(\(\) => this\._judgeHeldDraft\(\)\); \}\);/), 'chat-input: the blur judges a held draft only after the press that moved the focus has ended (afterPress — a press on Send sends what the box held)');
  ok(at(/const storeBefore = this\._heldDraft !== null \? null : loadDraft\('chat', this\._sessionId\);/) && at(/this\._pendingSend = \{ text, storeBefore \};\n    this\._judgeHeldDraft\(\);/) && at(/    clearTimeout\(this\._draftTimer\);\n    this\._draftTimer = null;\n    \/\/ WHAT THIS SEND DISPLACED/), 'chat-input: a send nulls the autosave timer, never lets the pinless clear take a HELD draft, and judges it again in the emptied box');
  ok(at(/this\._heldDraft = null;   \/\/ a blur judge still pending finds nothing/) && (ci.match(/this\._textarea\.value = value \|\| '';/g) || []).length === 0, 'chat-input: dispose forgets the held draft; no overwrite of the box outside landDraft is left');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
