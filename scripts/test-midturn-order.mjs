#!/usr/bin/env node
// THE CHAT'S ORDER IS THE ORDER OF EVENTS AS THE AGENT LIVED THEM (lane midturn-order — the owner, 2026-11-07, his own chat:
// «你能不能确保chatview里的顺序就是事件的实际顺序。你这interrupt在下正常人都会以为先读到了上面那句然后才interrupt？»). A
// message the person sent while a Claude turn ran was drawn where it was TYPED: Stop came before the agent read it, and the
// stop's two interrupt rows were drawn BELOW it — a reader takes that as «the agent read it, then I interrupted». The fix:
// a message the agent has not read is AFLOAT (src/message-window.js) — below every card drawn since, until its fate says
// where it goes (src/queue-chips.js `place`); every other card goes above it.
// FAST (in-process: PURE rules + the claude normalizer over the record shapes MEASURED on the real wrapper + the stand-in CLI
// — /var/tmp/vibespace-lanes/midturn-order/probe/shot.mjs; the stand-in is the R0 recording of 2.1.308 / 2.1.312). The
// browser half (a scratch hub, the stand-in CLI, the DOM order, the chip in en / zh) is scripts/test-midturn-order-chrome.mjs.
//   §1 the chip table: each state's place · placeOf · moveVerdict over every window case
//   §2 THE SHOT: Enter mid-tool, Stop before the next tool call ⇒ the kept message is drawn BELOW both interrupt rows (and
//      their «Interrupted» rows), and the person's next message right below it — CONTROL: the base draws it above them
//   §3 handed, then read at the tool result ⇒ drawn where it entered (below the tool card, above the answer) — unchanged
//   §4 handed during a text-only turn ⇒ it runs as a turn of its own: below the answer it never saw
//   §5 held (Alt+Enter), then Stop ⇒ «Removed» below the stop's records
//   §6 it rode a tool result, then Stop ⇒ the model read it: back ABOVE the interrupt row (one move op), «Steered»
//   §7 live = rebuild: the restart's records (the wrapper's copy + the CLI's own transcript record) draw the same order
//   §8 the ops say where: every create above an afloat message carries {before, at}; replaying the live ops the way
//      src/lib/chat-view.js applies them (insert before / moveVerdict) gives the server's order
//   §9 nothing else moves: streaming text under an afloat message edits its card; the turn's meta reaches its cards; a
//      codex / acp normalizer never floats; every card writer places through `_place`
//   §10 the kept chip says what happens next — en / zh / ja
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1400) : '')); } return !!c; };
const S = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** A section that THROWS (an older tree has no such method) is one red line naming it — the sections after it still run. */
const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} threw`, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const QC = require(path.join(REPO, 'src/queue-chips.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));

// ── the records (the stand-in's measured shapes; each a fresh object) ──
const SID = '6d0c1a52-0000-4000-8000-00000000c0de';
const R = {
  queue: () => ({ type: 'queue_changed', items: [], verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] }),
  running: () => ({ type: 'system', subtype: 'session_state_changed', state: 'running' }),
  idle: () => ({ type: 'system', subtype: 'session_state_changed', state: 'idle' }),
  init: () => ({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', tools: [], cwd: '/tmp' }),
  toolUse: (id) => ({ type: 'assistant', message: { id: 'msg_' + id, role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'sleep 8' } }] } }),
  toolResult: (id, rejected = false) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: rejected, content: rejected ? "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed." : 'done' }] } }),
  marker: (forTool) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: forTool ? '[Request interrupted by user for tool use]' : '[Request interrupted by user]' }] } }),
  result: (err) => ({ type: 'result', subtype: err ? 'error_during_execution' : 'success', is_error: !!err, result: '', session_id: SID }),
  said: (text) => ({ type: 'assistant', message: { id: 'msg_' + text.replace(/\W+/g, '_').slice(0, 24), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text }] } }),
  send: (text, msgId) => ({ type: 'user', message: { role: 'user', content: text }, msgId, timestamp: '2026-11-07T21:00:00.000Z', _fromWebui: true }),
  queued: (msgId) => ({ type: 'queued_input', msg_id: msgId, turn_id: null }),
  queueOf: (msgId) => ({ type: 'queue_changed', items: [{ id: 'q1-1', msgId, text: 'x' }], verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] }),
  hand: (state, ids) => ({ type: 'input_handover', state, msg_ids: ids, ...(state === 'handed' ? { via: 'enter' } : {}) }),
  dropped: ({ kept = [], items = [] } = {}) => ({ type: 'queue_dropped', dropId: 'd1', by: 'stop', turnId: null, items: items.map((msgId) => ({ id: 'q1-1', msgId, ts: 1, text: 'x' })), ...(kept.length ? { kept: kept.length, keptIds: kept } : {}) }),
  removed: (msgId) => ({ type: 'queue_op_result', op: 'remove', id: 'q1-1', ok: true, msg_id: msgId, reason: 'stopped' }),
  // the wrapper's restart copy of a mid-turn frame (buffer only) and the CLI's own transcript record of it (its stamp)
  copy: (text, msgId, cliUuid) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, msgId, cliUuid, handNo: 0, _fromWebui: true, webui_copy: true, timestamp: '2026-11-07T21:00:00.000Z' }),
  cliRecord: (text, uuid) => ({ type: 'user', uuid, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text }] } }),
};
const textOf = (m) => (m.content || []).map((b) => (b.type === 'text' || b.type === 'system_info' ? b.text : b.type === 'tool_call' ? '⚙' + b.toolName : '')).join(' ').replace(/\s+/g, ' ').trim();
/** The drawn order: one short label per card (the system «Model» line of an init is not a row a reader orders by). */
const order = (mm) => mm.messages.filter((m) => !(m.role === 'system' && /^Model:/.test(textOf(m)))).map((m) => {
  const t = textOf(m);
  if (/^\[Request interrupted by user for tool use\]/.test(t)) return 'i1';
  if (/^\[Request interrupted by user\]/.test(t)) return 'i2';
  if (m.role === 'system' && /^Interrupted/.test(t)) return 'I';
  if (m.role === 'tool') return 'tool';
  if (m.role === 'assistant') return 'said:' + t.slice(0, 12);
  return t.slice(0, 1) + (m.queueState ? `[${m.queueState}]` : '');
});
/** Feed records live; collect the ops (create / edit / move) the client receives. */
function live(records, id = 'mo') {
  const mm = createMessageManager('claude', id);
  const ops = []; mm.onOp((o) => { if (o.op !== 'meta') ops.push(o); });
  for (const r of records) mm.processLive(r);
  return { mm, ops };
}
/** The shot's records, up to the person's next message (the stand-in's wire, the person's send fed first as user-input.js does). */
const SHOT = () => [R.queue(), R.send('A run the slow command', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'),
  R.send('B the mid-turn message', 'm-b'), R.hand('handed', ['m-b']),
  R.dropped({ kept: ['m-b'] }), R.toolResult('toolu_1', true), R.marker(true), R.result(true),
  R.init(), R.marker(false), R.result(true), R.idle()];

// ── §1 THE CHIP TABLE ──
console.log('§1 the chip table: where each state\'s bubble is drawn (src/queue-chips.js)');
await guard('§1', () => {
  const place = Object.fromEntries(QC.QUEUE_STATES.map((s) => [s, QC.QUEUE_CHIPS[s].place]));
  ok(S(place) === S({ queued: 'tail', steered: 'here', removed: 'next-turn', handed: 'tail', kept: 'next-turn', stopped: 'here' }), 'every chip state names its place: not read yet ⇒ tail · the turn ended before it was read / it never runs ⇒ next-turn · read where it entered / started its own turn ⇒ here', place);
  ok(typeof QC.placeOf === 'function' && QC.placeOf(null) === 'here' && QC.placeOf(undefined) === 'here' && QC.placeOf('kept') === 'next-turn' && QC.placeOf('nonsense') === 'here', 'placeOf: no state (it ran as a turn of its own) ⇒ here; an unknown word ⇒ here (never afloat on a guess)');
  const V = (from, to) => { const v = QC.moveVerdict({ from, to, start: 10, end: 20 }); return v && typeof v === 'object' ? [v.kind, v.start, v.end, v.at ?? null] : v; };
  const cases = { inPlace: V(18, 12), leaveDown: V(15, 25), leaveUp: V(15, 5), enterBelow: V(25, 15), enterAbove: V(5, 15), noneBelow: V(25, 22), noneAbove: V(3, 5), shiftUp: V(25, 5), shiftDown: V(5, 25) };
  const want = { inPlace: ['in-place', 10, 20, 2], leaveDown: ['leave', 10, 19, null], leaveUp: ['leave', 11, 20, null], enterBelow: ['enter', 10, 21, 5], enterAbove: ['enter', 9, 20, 6], noneBelow: ['none', 10, 20, null], noneAbove: ['none', 10, 20, null], shiftUp: ['shift+1', 11, 21, null], shiftDown: ['shift-1', 9, 19, null] };
  ok(S(cases) === S(want), 'moveVerdict over the window [10, 20) → the window AFTER the move: both in ⇒ in-place · it left ⇒ leave (the rest kept) · it came in ⇒ enter at its place (the op carries the card) · across ⇒ shift ±1 · NEVER a re-read (r2 F4)', cases);
  const MI = QC.movedIndex;
  ok(typeof MI === 'function' && S([0, 3, 4, 5, 7, 9].map((i) => MI(i, 7, 3))) === S([0, 4, 5, 6, 3, 9]) && S([2, 3, 5, 6, 8].map((i) => MI(i, 3, 6))) === S([2, 6, 4, 5, 8]), 'movedIndex: the moved card takes `to`, the cards it crossed shift one the other way — the minimap markers follow their cards (r2 F3)');
});

// ── §2 THE SHOT ──
console.log('§2 THE SHOT — Enter mid-tool, Stop before the next tool call: the kept message is drawn BELOW the stop\'s rows');
let shotLive = null;
await guard('§2', () => {
  const { mm, ops } = live(SHOT());
  const o = order(mm);
  shotLive = o;
  const b = o.indexOf('B[kept]'), i1 = o.indexOf('i1'), i2 = o.indexOf('i2');
  ok(b > i1 && b > i2 && i1 > 0 && i2 > 0, 'THE OWNER\'S SHOT: the kept message\'s row is AFTER both interrupt rows (it was never read before them)', o);
  ok(S(o) === S(['A', 'tool', 'i1', 'I', 'i2', 'I', 'B[kept]']), '…and the whole order is the order the agent lived: the tool, the stop for tool use, the follow-up stopped on its init, then the message it has not read', o);
  ok(!ops.some((x) => x.op === 'move'), '…with no move op: it never left the tail (each later card was created ABOVE it)', ops.filter((x) => x.op === 'move'));
  // the person's next message: the kept one goes with it — directly above it, never below it
  mm.processLive(R.send('N the next message', 'm-n')); mm.processLive(R.running()); mm.processLive(R.init()); mm.processLive(R.said('reply N')); mm.processLive(R.result(false));
  const o2 = order(mm);
  ok(S(o2.slice(-3)) === S(['B[kept]', 'N', 'said:reply N']), 'the next message is drawn right BELOW the kept one (they reach the agent together) and the answer below both', o2);
  ok(mm.afloatIds().length === 0, '…and nothing is afloat once the next turn opened', mm.afloatIds());
  // two handed, both kept: in the order sent, below everything the stop drew
  const two = live([R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B first', 'm-b'), R.hand('handed', ['m-b']), R.send('C second', 'm-c'), R.hand('handed', ['m-c']),
    R.dropped({ kept: ['m-b', 'm-c'] }), R.toolResult('toolu_1', true), R.marker(true), R.result(true), R.init(), R.marker(false), R.result(true), R.idle()]);
  ok(S(order(two.mm)) === S(['A', 'tool', 'i1', 'I', 'i2', 'I', 'B[kept]', 'C[kept]']), 'two kept messages: both below the stop\'s rows, in the order sent', order(two.mm));
});

// ── §3 HANDED, READ AT THE TOOL RESULT ──
console.log('§3 handed, then read at the tool result: drawn where it entered — unchanged');
await guard('§3', () => {
  const { mm } = live([R.queue(), R.send('A run the slow command', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B the mid-turn message', 'm-b'), R.hand('handed', ['m-b']),
    R.toolResult('toolu_1'), R.hand('landed', ['m-b']), R.said('done after the tool'), R.result(false), R.idle()]);
  ok(S(order(mm)) === S(['A', 'tool', 'B[steered]', 'said:done after t']), 'below the tool card whose result carried it, above the answer that read it — «Steered» where it entered (the base\'s place too)', order(mm));
  // typed while the model was still streaming the text before its tool call: it entered at THAT tool's result
  const s = live([R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.send('B early', 'm-b'), R.hand('handed', ['m-b']), R.toolUse('toolu_1'),
    R.toolResult('toolu_1'), R.hand('landed', ['m-b']), R.said('answer'), R.result(false), R.idle()]);
  ok(S(order(s.mm)) === S(['A', 'tool', 'B[steered]', 'said:answer']), 'typed before the tool call was made: drawn below that call (the agent read it at its result), never above a call it had not seen', order(s.mm));
});

// ── §4 A TEXT-ONLY TURN ──
console.log('§4 handed during a text-only turn: it runs as a turn of its own, below the answer it never saw');
await guard('§4', () => {
  const { mm } = live([R.queue(), R.send('A a long text turn', 'm-a'), R.running(), R.init(), R.send('B the mid-turn message', 'm-b'), R.hand('handed', ['m-b']),
    R.said('reply A'), R.result(false), R.hand('own-turn', ['m-b']), R.init(), R.said('reply B'), R.result(false), R.idle()]);
  ok(S(order(mm)) === S(['A', 'said:reply A', 'B', 'said:reply B']), 'the turn ended before the agent took it: it opens its own turn — drawn after reply A, before reply B (the base drew it above reply A)', order(mm));
});

// ── §5 HELD, THEN STOP ──
console.log('§5 held (Alt+Enter), then Stop: «Removed» below the stop\'s records');
await guard('§5', () => {
  const { mm } = live([R.queue(), R.send('A run the slow command', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B held', 'm-b'), R.queueOf('m-b'), R.queued('m-b'),
    R.removed('m-b'), R.dropped({ items: ['m-b'] }), R.queue(), R.toolResult('toolu_1', true), R.marker(true), R.result(true), R.idle()]);
  ok(S(order(mm)) === S(['A', 'tool', 'i1', 'I', 'B[removed]']), 'a held row Stop put back never reached the agent: drawn below the stop for tool use and its «Interrupted» row', order(mm));
});

// ── §6 RODE A TOOL RESULT, THEN STOP ──
console.log('§6 it rode a tool result, then Stop: the model read it — back above the interrupt row');
await guard('§6', () => {
  const { mm, ops } = live([R.queue(), R.send('A run the slow command', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B the mid-turn message', 'm-b'), R.hand('handed', ['m-b']),
    R.toolResult('toolu_1'), R.dropped({ kept: ['m-b'] }), R.marker(false), R.result(true), R.hand('landed', ['m-b']), R.idle()]);
  ok(S(order(mm)) === S(['A', 'tool', 'B[steered]', 'i2', 'I']), 'the request after the tool result carried it (the wrapper\'s landed, once the window closed): drawn where it entered, ABOVE the stop\'s rows', order(mm));
  const moves = ops.filter((x) => x.op === 'move');
  const bId = mm.messages.find((m) => m.webuiMsgId === 'm-b')?.id;
  const at = mm.messages.indexOf(mm.get(bId));
  ok(moves.length === 1 && moves[0].id === bId && moves[0].before === mm.messages[at + 1].id && moves[0].from === mm.messages.length - 1 && moves[0].to === at && /^\[Request interrupted by user\]/.test(textOf(mm.messages[at + 1])), 'ONE move op says it: {id, before, from, to} — from the tail (its last index) back to just above the interrupt row', { moves, at, n: mm.messages.length });
});

// ── §7 LIVE = REBUILD ──
console.log('§7 live = rebuild: the restart\'s records draw the order the live view drew');
await guard('§7', () => {
  const U = '00000000-0000-4000-8000-0000000000b0';
  // the merged record list a restart rebuilds from (src/session-store.js: the transcript in its order, the wrapper's buffer
  // records anchored after the transcript record before them — measured: probe/shot.mjs's «rebuild»): the copy where the
  // frame reached the wrapper, the CLI's own record of the frame between the stop for tool use and the follow-up it stopped
  const recs = [R.queue(), R.cliRecord('A run the slow command', '00000000-0000-4000-8000-0000000000a0'), R.running(), R.init(), R.toolUse('toolu_1'),
    R.copy('B the mid-turn message', 'm-b', U), R.hand('handed', ['m-b']), R.dropped({ kept: ['m-b'] }), R.toolResult('toolu_1', true), R.marker(true), R.result(true),
    R.cliRecord('B the mid-turn message', U), R.init(), R.marker(false), R.result(true), R.idle()];
  const mm = createMessageManager('claude', 'mo-rebuild');
  mm.convertHistory(recs);
  const below = (o) => o.indexOf('B[kept]') > o.lastIndexOf('i2') && o.lastIndexOf('i2') > o.indexOf('i1');
  ok(S(order(mm)) === S(shotLive) && below(order(mm)), 'the rebuild draws the live order — the kept message below both interrupt rows, ONE bubble (its copy, claimed by the CLI\'s record, never a second)', { rebuild: order(mm), live: shotLive });
  const viaAsync = createMessageManager('claude', 'mo-rebuild-a');
  return viaAsync.convertHistoryAsync(recs, { budgetMs: 1e9 }).then(() => ok(S(order(viaAsync)) === S(shotLive) && below(order(viaAsync)), '…and the time-sliced rebuild (convertHistoryAsync) the same', order(viaAsync)));
});

// ── §8 THE OPS SAY WHERE ──
console.log('§8 the ops say where: the client replays create.before / move into the server\'s order');
await guard('§8', () => {
  // a client model applying the live ops exactly as src/lib/chat-view.js does: a create with `before` is inserted before that
  // card (else appended), a move goes by moveVerdict over the window it holds (the whole list here: in place)
  const replay = (ops) => {
    const list = [];
    for (const op of ops) {
      if (op.op === 'create') { if (list.some((m) => m.id === op.message.id)) continue; const i = op.before ? list.findIndex((m) => m.id === op.before) : -1; if (i >= 0) list.splice(i, 0, op.message); else list.push(op.message); }
      else if (op.op === 'move') { const v = QC.moveVerdict({ from: op.from, to: op.to, start: 0, end: list.length }); if ((v && v.kind) !== 'in-place') return null; const i = list.findIndex((m) => m.id === op.id); const [m] = list.splice(i, 1); list.splice(op.to, 0, m); }
    }
    return list.map((m) => m.id);
  };
  for (const [name, recs] of [['the shot', SHOT()], ['the rider (§6)', [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B', 'm-b'), R.hand('handed', ['m-b']), R.toolResult('toolu_1'), R.dropped({ kept: ['m-b'] }), R.marker(false), R.result(true), R.hand('landed', ['m-b']), R.idle()]]]) {
    const { mm, ops } = live(recs, 'mo-ops');
    ok(S(replay(ops)) === S(mm.messages.map((m) => m.id)), `${name}: the client's replay of the live ops = the server's list, card for card`, { client: replay(ops), server: mm.messages.map((m) => m.id) });
    const creates = ops.filter((x) => x.op === 'create' && x.before);
    ok(creates.every((x) => typeof x.at === 'number' && x.at >= 0) && creates.length > 0, `${name}: each create placed above an afloat message carries {before, at}`, creates.map((x) => ({ before: x.before, at: x.at })));
  }
  const cv = read('src/lib/chat-view.js');
  ok(/import \{ moveVerdict \} from '\.\.\/queue-chips\.js';/.test(cv) && /\} else if \(op\.op === 'move'\) \{\n\s+this\._onMoveMessage\(op\);/.test(cv) && /this\._onCreateMessage\(op\.message, op\.before \? op : null\);/.test(cv),
    'chat-view routes `move` to _onMoveMessage and hands a create its {before, at}; the window rule is the PURE moveVerdict');
  ok(/if \(beforeIdx >= 0 && beforeEl\.parentNode === this\._messageList\) this\._messageList\.insertBefore\(el, beforeEl\); else this\._messageList\.appendChild\(el\);/.test(cv) && /_reorderStale\(why\) \{[\s\S]{0,200}this\._seqPoisoned = true;[\s\S]{0,120}this\._reattach\(\);/.test(cv)
    && /if \(this\._teleported\) \{ this\._moveInSlab\(op\); return; \}/.test(cv) && /if \(w\.kind === 'leave'\) \{/.test(cv) && /if \(w\.kind === 'enter'\) \{/.test(cv),
    '…inserts before the named card; a move is judged by moveVerdict (leave / enter drawn from the op\'s own card), a teleported slab by the ids it holds — the re-read is only for a malformed op, never a guessed position');
  ok(/messages\.every\(\(m, i\) => this\._messages\[i\]\?\.id === m\?\.id\)/.test(cv), 'the reconnect no-op compares the WHOLE order (a card moved inside the slab is another slab)');
});

// ── §9 NOTHING ELSE MOVES ──
console.log('§9 nothing else moves');
await guard('§9', () => {
  // streaming assistant text while a message is afloat: the SAME card is edited (never a second card per record)
  const { mm } = live([R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.send('B mid', 'm-b'), R.hand('handed', ['m-b'])]);
  mm.processLive({ type: 'assistant', message: { id: 'msg_s', role: 'assistant', content: [{ type: 'text', text: 'part one' }] } });
  mm.processLive({ type: 'assistant', message: { id: 'msg_s', role: 'assistant', content: [{ type: 'text', text: 'part one and two' }] } });
  const texts = mm.messages.filter((m) => m.role === 'assistant').map(textOf);
  ok(S(texts) === S(['part one and two']) && order(mm).slice(-1)[0] === 'B[handed]', 'streaming text under an afloat message edits its ONE card (the last PLACED card, never the afloat bubble)', { texts, order: order(mm) });
  // the turn's meta (duration…) reaches the turn's cards — an afloat message at the tail is not where the turn began
  mm.processLive(R.result(false));
  mm.processLive({ type: 'system', subtype: 'turn_duration', duration_ms: 1234, message_count: 3 });
  const said = mm.messages.find((m) => m.role === 'assistant');
  ok(said && said.meta && said.meta.turn && said.meta.turn.durationMs === 1234, 'the result\'s turn meta reaches the turn\'s cards across an afloat message', said && said.meta);
  // codex / acp keep their place rules: their normalizers never float a bubble
  for (const h of ['codex', 'opencode']) {
    let m = null; try { m = createMessageManager(h, 'mo-' + h); } catch { m = null; }
    ok(m && Array.isArray(m._afloat) && m._afloat.length === 0 && typeof m._place === 'function', `${h}: the base placement exists and stays idle (no harness but claude floats a message)`);
  }
  // THE CENSUS: every card writer places through `_place` — no bare push below the afloat block
  const pushes = (f) => (read(f).match(/messages\.push\(/g) || []).length;
  const mw = read('src/message-window.js'), nz = read('src/normalizers.js');
  ok(pushes('src/message-manager.js') === 0 && pushes('src/message-window.js') === 3 && /_place\(msg, \{ afloat = false, startsTurn = false \} = \{\}\) \{\n\s+const f = this\._afloat;\n\s+if \(afloat\) \{ this\.messages\.push\(msg\);/.test(mw)
    && /if \(b >= 0\) this\.messages\.splice\(b, 0, msg\); else this\.messages\.push\(msg\);/.test(mw)
    && (nz.match(/mm\.messages\.push\(/g) || []).length === 1 && /const placeIn = \(mm, msg\) => \{ if \(typeof mm\._place === 'function'\) mm\._place\(msg\); else mm\.messages\.push\(msg\); \};/.test(nz),
    'every card writer places through _place: message-manager pushes nothing, message-window only inside _place (and _moveBefore re-placing a card it holds), the normalizers\' card placers through placeIn', { mm: pushes('src/message-manager.js'), mw: pushes('src/message-window.js') });
});

// ── §10 THE CHIP'S WORDS ──
console.log('§10 the kept chip says what happens next (en / zh / ja)');
await guard('§10', () => {
  const rend = read('src/lib/chat-renderers.js'), zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const L = 'Unread when stopped — goes with your next message';
  const T = 'Stop came before the agent read it. It stays in the conversation and reaches the agent with the next message it gets — yours, or a notice that wakes it — so there is no need to send it again';
  ok(rend.includes(`state === 'kept' ? t('${L}')`) && rend.includes(`state === 'kept' ? t('${T}')`) && !rend.includes("t('Stays with the stopped turn')"), 'the label says the agent had not read it and where it goes; the title says when it arrives and that nothing needs resending', L);
  const zhL = new RegExp(`\\n  "${L}": "停止时未读 · 随你的下一条消息送达",`), jaL = new RegExp(`\\n  "${L}": "停止時は未読 · 次のメッセージと一緒に届きます",`);
  ok(zhL.test(zh) && jaL.test(ja) && zh.includes(`"${T}": "停止先于 agent 读到它。`) && ja.includes(`"${T}": "エージェントが読む前に停止しました。`), 'zh + ja carry both new keys (the label and the title)');
  ok(!zh.includes('"Stays with the stopped turn"') && !ja.includes('"Stays with the stopped turn"'), 'the retired label left both dictionaries');
});

// ── §11 ROUND 2 (the r1 acceptance of 92943cdb1) ──
console.log('§11 round 2: each finding of the r1 acceptance, as a leg (RED on 92943cdb1 by name)');
const userTurns = (mm) => mm.turnMap().filter((t) => t.role === 'user').map((t) => (t.preview || '').slice(0, 1));
await guard('§11 M1', () => {
  // the rider the CLI still held: it rode the tool result, Stop named it KEPT, a follow-up was stopped — then the next message
  const recs = [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B rode then kept', 'm-b'), R.hand('handed', ['m-b']),
    R.toolResult('toolu_1'), R.dropped({ kept: ['m-b'] }), R.marker(false), R.result(true), R.init(), R.marker(false), R.result(true), R.idle()];
  const { mm, ops } = live(recs, 'mo-m1');
  mm.processLive(R.send('N the next message', 'm-n')); mm.processLive(R.running()); mm.processLive(R.init()); mm.processLive(R.said('reply N')); mm.processLive(R.result(false));
  ok(S(order(mm)) === S(['A', 'tool', 'i2', 'I', 'i2', 'I', 'B[kept]', 'N', 'said:reply N']) && !ops.some((o) => o.op === 'move'), 'M1 RIDING-BUT-KEPT: a message that rode a tool result and was then named KEPT stays below BOTH interrupt rows when the next message comes — 0 move ops (its ride facts are void: the agent never read it)', { order: order(mm), moves: ops.filter((o) => o.op === 'move').map((o) => [o.from, o.to]) });
  const rb = createMessageManager('claude', 'mo-m1-rb');
  rb.convertHistory([...recs, R.send('N the next message', 'm-n'), R.running(), R.init(), R.said('reply N'), R.result(false)]);
  ok(S(order(rb)) === S(order(mm)), '…and a rebuild of the same records draws the same order', order(rb));
});
await guard('§11 M2', () => {
  // Alt+Enter hold during a tool, then two text cards: both end 'complete' with their edit ops — live and rebuild
  const recs = [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B held', 'm-b'), R.queueOf('m-b'), R.queued('m-b'),
    R.toolResult('toolu_1'), R.said('now I will run another'), R.toolUse('toolu_2'), R.toolResult('toolu_2'), R.said('final answer'), R.result(false), R.idle()];
  const { mm, ops } = live(recs, 'mo-m2');
  const said = mm.messages.filter((m) => m.role === 'assistant').map((m) => [textOf(m).slice(0, 12), m.status]);
  const completes = ops.filter((o) => o.op === 'edit' && o.fields && o.fields.status === 'complete' && mm.get(o.id)?.role === 'assistant').length;
  ok(said.length === 2 && said.every(([, st]) => st === 'complete') && completes === 2, 'M2 a text card created while a message is afloat ends \'complete\' — the streaming finalize never stops at the afloat bubble (2 status edits sent)', { said, completes });
  const rb = createMessageManager('claude', 'mo-m2-rb'); rb.convertHistory(recs);
  ok(rb.messages.filter((m) => m.role === 'assistant').every((m) => m.status === 'complete'), '…and the rebuild\'s text cards are complete too', rb.messages.filter((m) => m.role === 'assistant').map((m) => m.status));
});
await guard('§11 F3', () => {
  // the person's message keeps its own turn in the minimap / TOC (the server's turnMap = what a reload draws)
  const shapes = {
    'held then drained': [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B held', 'm-b'), R.queueOf('m-b'), R.queued('m-b'), R.toolResult('toolu_1'), R.said('answer A'), R.result(false), R.queue(), R.init(), R.said('reply B'), R.result(false), R.idle()],
    'text-only turn': [R.queue(), R.send('A a long text turn', 'm-a'), R.running(), R.init(), R.send('B mid', 'm-b'), R.hand('handed', ['m-b']), R.said('reply A'), R.result(false), R.hand('own-turn', ['m-b']), R.init(), R.said('reply B'), R.result(false), R.idle()],
    'Enter before the tool call': [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.send('B early', 'm-b'), R.hand('handed', ['m-b']), R.toolUse('toolu_1'), R.toolResult('toolu_1'), R.hand('landed', ['m-b']), R.said('answer'), R.result(false), R.idle()],
  };
  for (const [name, recs] of Object.entries(shapes)) {
    const { mm } = live(recs, 'mo-f3');
    const rb = createMessageManager('claude', 'mo-f3-rb'); rb.convertHistory(recs);
    ok(S(userTurns(mm)) === S(['A', 'B']) && S(userTurns(rb)) === S(['A', 'B']), `F3 ${name}: the minimap / TOC keep the person's message as its own turn — live and rebuilt (a card placed above it belongs to the running turn)`, { live: userTurns(mm), rebuild: userTurns(rb) });
  }
  const cvm = read('src/lib/chat-minimap.js');
  ok(/shiftFrom\(at\) \{/.test(cvm) && /moveCard\(from, to\) \{[\s\S]{0,300}movedIndex\(t\.startIdx, from, to\)/.test(cvm) && /insertTurn\(turn, total\) \{/.test(cvm)
    && /this\._chatMinimap\?\.moveCard\?\.\(from, to\);/.test(read('src/lib/chat-view.js')) && /if \(beforeIdx >= 0\) this\._chatMinimap\?\.shiftFrom\?\.\(this\._windowStart \+ beforeIdx\);/.test(read('src/lib/chat-view.js')),
    'F3 live: a marker follows its card — an insert above shifts the markers below it, a move carries the marker (movedIndex), a user card inserted above later turns takes its place (the browser leg measures it)');
});
await guard('§11 m5', () => {
  const cv = read('src/lib/chat-view.js'), zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const K = '{k} message(s) unread when stopped — they go with your next message';
  ok(cv.includes(`t('${K}', { k: op.kept })`) && zh.includes(`"${K}": "{k} 条消息停止时未读 · 随你的下一条消息送达",`) && ja.includes(`"${K}": "{k} 件のメッセージは停止時に未読 · 次のメッセージと一緒に届きます",`) && ![cv, zh, ja].some((x) => x.includes('you sent into the turn stay with it')),
    'm5 Stop\'s toast says what the chip says — unread when stopped, goes with the next message (en / zh / ja); the retired words left every file');
});
await guard('§11 m6', () => {
  const SM = require(path.join(REPO, 'src/search-model.js'));
  // the live index's walk after every record (the hub's flushLive loop): every card the turn drew is sent while a message is afloat
  const mm = createMessageManager('claude', 'mo-m6');
  const cur = { from: 0, sent: new Set() };
  const flush = () => { const w = SM.liveWalk(mm.messages, Math.min(cur.from, mm.messages.length), cur.sent, mm._afloat.length); for (const i of w.send) cur.sent.add(mm.messages[i].id); cur.from = w.from; };
  for (const r of [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B held', 'm-b'), R.queueOf('m-b'), R.queued('m-b'), R.toolResult('toolu_1'), R.toolUse('toolu_2'), R.toolResult('toolu_2'), R.said('final answer'), R.result(false)]) { mm.processLive(r); flush(); }
  const missing = mm.messages.filter((m) => (!m.status || m.status === 'complete') && !cur.sent.has(m.id)).map((m) => m.role + ':' + textOf(m).slice(0, 14));
  ok(typeof SM.liveWalk === 'function' && missing.length === 0, 'm6 the live search index sends every card inserted above an afloat message (its cursor never passes the afloat block)', missing);
  ok(/const walk = M\.liveWalk\(msgs, Math\.min\(cur\.from, msgs\.length\), cur\.sent, Array\.isArray\(mm\._afloat\) \? mm\._afloat\.length : 0, cur\.walked\);/.test(read('src/server/search-index.js')), '…the hub\'s flushLive walks with that rule');
});
await guard('§11 m7', () => {
  // a send INSIDE the Stop window (after the stop's first result, before the follow-up's interrupt) — the wrapper HOLDS it
  const { mm } = live([...SHOT().slice(0, 11), R.send('C inside the window', 'm-c'), R.queueOf('m-c'), R.queued('m-c'), R.init(), R.marker(false), R.result(true), R.idle(), R.queue(), R.init(), R.said('reply C'), R.result(false)], 'mo-m7');
  ok(S(order(mm)) === S(['A', 'tool', 'i1', 'I', 'i2', 'I', 'B[kept]', 'C', 'said:reply C']), 'm7 a message sent inside the Stop window is held — the kept message stays below BOTH interrupt pairs, the held one right below it (measured with the real wrapper: probe/shot.mjs window2)', order(mm));
});
await guard('§11 m8', () => {
  // a history conversion emits no op — not even after a replay() inside it (normalizers.js placeWritesLostCard ← beforeRecord)
  const mm = createMessageManager('claude', 'mo-m8');
  const ops = []; mm.onOp((o) => ops.push(o.op));
  return mm.convertHistoryAsync([R.copy('B', 'm-b', '00000000-0000-4000-8000-0000000000b8'), R.hand('handed', ['m-b']), R.toolUse('toolu_1'), R.toolResult('toolu_1'), R.dropped({ kept: ['m-b'] }), R.marker(false), R.result(true), R.hand('landed', ['m-b'])], {
    budgetMs: 1e9, beforeRecord: (r) => { if (r.type === 'queue_dropped') mm.replay({ type: 'system', subtype: 'informational', content: 'x' }); },
  }).then(() => ok(ops.length === 0 && mm._live === true, 'm8 a replay() inside a history conversion restores the PRIOR live flag — the conversion emits no move op; live again after it', ops));
});
await guard('§11 m10', () => {
  const N = require(path.join(REPO, 'src/normalizers.js'));
  const { mm, ops } = live([R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B handed', 'm-b'), R.hand('handed', ['m-b'])], 'mo-m10');
  mm.artifactSlab = { slabFirstAt: 1, slabLastAt: Date.now() + 3600e3 };
  const n0 = ops.length;
  N.placeArtifactCard(mm, { type: 'artifact', key: '/tmp/x.md', firstAt: Date.now() + 10, path: '/tmp/x.md' }, { emit: true, rebuilt: true });
  const made = ops.slice(n0).filter((o) => o.op === 'create');
  ok(made.length === 1 && made[0].before === mm.messages[mm.messages.length - 1].id && order(mm).slice(-1)[0] === 'B[handed]', 'm10 a deliverable card drained from the rebuild queue while a message is afloat is placed above it AND emitted live (create + before)', made.map((o) => ({ before: o.before, at: o.at })));
});
await guard('§11 r1', () => {
  // the real CLI's interrupted result carries no words (2.1.312 measured: `result` absent on error_during_execution) ⇒ «Interrupted» alone
  const { mm } = live([R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: SID, errors: ['[ede_diagnostic] result_type=user'] }]);
  const row = mm.messages.find((m) => m.role === 'system' && /^Interrupted/.test(textOf(m)));
  ok(row && textOf(row) === 'Interrupted', 'r1 the interrupted row the real CLI writes reads «Interrupted» alone — it never names a message below it (the stand-in now writes the measured shape)', row && textOf(row));
  ok(/\.\.\.\(interrupted \? \{\} : \{ result: busy\.text \}\)/.test(read('scripts/fixtures/claude-stand-in-cli.cjs')), '…the stand-in CLI writes the same shape');
});

// ── §12 ROUND 3 (the r2 acceptance of 6c7d4d7ca) ──
console.log('§12 round 3: the r2 acceptance\'s minors (RED on 6c7d4d7ca by name)');
await guard('§12 m12', () => {
  // two sends inside the Stop window, both held, then a second Stop (the real wrapper's records: probe/shot3.mjs w2stop2two)
  const q2 = (ids) => ({ type: 'queue_changed', items: ids.map((m) => ({ id: 'q-' + m, msgId: m, text: 'x' })), verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] });
  const recs = [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B mid', 'm-b'), R.hand('handed', ['m-b']),
    R.dropped({ kept: ['m-b'] }), R.toolResult('toolu_1', true), R.marker(true), R.result(true),
    R.send('C in the window', 'm-c'), q2(['m-c']), R.queued('m-c'), R.send('D in the window', 'm-d'), q2(['m-c', 'm-d']), R.queued('m-d'),
    R.removed('m-c'), R.removed('m-d'), { type: 'queue_dropped', dropId: 'd2', by: 'stop', turnId: null, items: [{ id: 'q-m-c', msgId: 'm-c', ts: 1, text: 'x' }, { id: 'q-m-d', msgId: 'm-d', ts: 1, text: 'x' }] }, R.queue(),
    R.init(), R.marker(false), R.result(true), R.idle()];
  const { mm } = live(recs, 'mo-m12');
  // the restart's records: the wrapper's copies where the frames reached it (afloat from there), the same wire records
  const rbRecs = recs.map((r) => (r._fromWebui && ['m-b', 'm-c', 'm-d'].includes(r.msgId) ? R.copy(r.message.content, r.msgId, '00000000-0000-4000-8000-0000000' + { 'm-b': '000b1', 'm-c': '000c1', 'm-d': '000d1' }[r.msgId]) : r)).filter((r) => !(r._fromWebui && r.msgId === 'm-a'));
  const rb = createMessageManager('claude', 'mo-m12-rb'); rb.convertHistory(rbRecs);
  const tailOf = (o) => o.slice(o.lastIndexOf('I') + 1);
  ok(S(tailOf(order(mm))) === S(['B[kept]', 'C[removed]', 'D[removed]']) && S(tailOf(order(rb))) === S(tailOf(order(mm))), 'm12 two sends held inside the Stop window + a second Stop: the unread block keeps the order SENT — B, C, D — live and after a restart (a re-float goes back to its place, never behind a message sent after it)', { live: order(mm), rebuild: order(rb) });
});
await guard('§12 m13', () => {
  // the live index over EVERY two-flush schedule of: a send that opens a turn after a result, its «queued» chip re-floats it,
  // a peer card placed above it (the acceptance's m6e set — 153 schedules)
  const SM = require(path.join(REPO, 'src/search-model.js'));
  const PEER = { peer: true };
  const recs = [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.said('reply A'), R.result(false),
    R.send('C after the result', 'm-c'), R.queueOf('m-c'), R.queued('m-c'), PEER, R.init(), R.said('follow-up text'), R.result(false), R.queue(), R.init(), R.said('reply C'), R.result(false)];
  let runs = 0, bad = 0, ex = null;
  for (let a = 0; a < recs.length; a++) for (let b = a; b < recs.length; b++) {
    const mm = createMessageManager('claude', 'mo-m13'); const cur = { from: 0, sent: new Set() };
    const flush = () => { const w = SM.liveWalk(mm.messages, Math.min(cur.from, mm.messages.length), cur.sent, mm._afloat.length); for (const i of w.send) cur.sent.add(mm.messages[i].id); cur.from = w.from; };
    recs.forEach((r, k) => { if (r === PEER) mm.injectPeerCard({ fromName: 'peer-x', text: 'a peer wrote this searchable line' }); else mm.processLive(JSON.parse(JSON.stringify(r))); if (k === a || k === b) flush(); });
    flush(); runs++;
    const miss = mm.messages.filter((m) => !cur.sent.has(m.id) && (!m.status || m.status === 'complete') && SM.textOf(m));
    if (miss.length) { bad++; ex = ex || { at: [a, b], miss: miss.map((m) => m.role + ':' + SM.textOf(m).slice(0, 24)) }; }
  }
  ok(runs === 153 && bad === 0, `m13 the live search index misses nothing over all ${runs} two-flush schedules (a message re-floated after a flush pulls the walk back to the block's start)`, { bad, ex });
});

// ── §13 ROUND 4 (the r3 verifier of c771b00d1) ──
console.log('§13 round 4: the r3 verifier\'s findings (RED on c771b00d1 by name)');
await guard('§13 m12', () => {
  // a send held inside the Stop window, then two + a second Stop: the block is right with NO cancelling pair of moves
  const q2 = (ids) => ({ type: 'queue_changed', items: ids.map((m) => ({ id: 'q-' + m, msgId: m, text: 'x' })), verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] });
  const head = [R.queue(), R.send('A go', 'm-a'), R.running(), R.init(), R.toolUse('toolu_1'), R.send('B mid', 'm-b'), R.hand('handed', ['m-b']), R.dropped({ kept: ['m-b'] }), R.toolResult('toolu_1', true), R.marker(true), R.result(true)];
  const one = live([...head, R.send('C in the window', 'm-c'), q2(['m-c']), R.queued('m-c'), R.init(), R.marker(false), R.result(true), R.idle()], 'mo-m12a');
  const two = live([...head, R.send('C', 'm-c'), q2(['m-c']), R.queued('m-c'), R.send('D', 'm-d'), q2(['m-c', 'm-d']), R.queued('m-d'), R.removed('m-c'), R.removed('m-d'),
    { type: 'queue_dropped', dropId: 'd2', by: 'stop', turnId: null, items: [{ id: 'q-m-c', msgId: 'm-c', ts: 1, text: 'x' }, { id: 'q-m-d', msgId: 'm-d', ts: 1, text: 'x' }] }, R.queue(), R.init(), R.marker(false), R.result(true), R.idle()], 'mo-m12b');
  const mv = (x) => x.ops.filter((o) => o.op === 'move').length;
  ok(mv(one) === 0 && mv(two) <= 2 && S(order(two.mm).slice(-3)) === S(['B[kept]', 'C[removed]', 'D[removed]']), 'm12 no cancelling pair of moves: one send held inside the Stop window = 0 moves (6c7d4d7ca 0), two + a second Stop ≤ 2 (6c7d4d7ca 2) — the block already in the order sent moves nothing', { one: mv(one), two: mv(two), order: order(two.mm) });
});
await guard('§13 m13', () => {
  // the hub's flush (search-index flushLive): 12 000 complete cards on a fresh cursor — over LIVE_QUEUE_MAX, so that batch is
  // DROPPED (taken back out of `sent`, left to the backfill) — then 3 new cards, one flush each
  const SM = require(path.join(REPO, 'src/search-model.js'));
  const MAX = 10000;
  const msgs = Array.from({ length: 12000 }, (_, i) => ({ id: 'c' + i, role: 'assistant', status: 'complete', content: [{ type: 'text', text: 'card ' + i }] }));
  const cur = { from: 0, sent: new Set(), walked: new Set() }; let dropped = 0; const indexed = []; const walkedPerFlush = [];
  const flush = () => { const w = SM.liveWalk(msgs, Math.min(cur.from, msgs.length), cur.sent, 0, cur.walked); for (const id of (w.passed || [])) cur.walked.add(id); const out = w.send.map((i) => msgs[i].id); for (const id of out) cur.sent.add(id); cur.from = w.from; walkedPerFlush.push(out.length); if (out.length > MAX) { for (const id of out) cur.sent.delete(id); dropped += out.length; } else indexed.push(...out); };
  flush();
  for (let k = 0; k < 3; k++) { msgs.push({ id: 'new' + k, role: 'assistant', status: 'complete', content: [{ type: 'text', text: 'new ' + k }] }); flush(); }
  ok(S(walkedPerFlush) === S([12000, 1, 1, 1]) && S(indexed) === S(['new0', 'new1', 'new2']) && dropped === 12000, 'm13 after one capped (dropped) flush, each next flush walks only the card placed since — 3/3 new cards indexed; the dropped batch waits for the backfill, never re-walked and re-dropped at every flush', { walkedPerFlush, indexed, dropped });
  ok(/cur\.walked\.add\(id\)/.test(read('src/server/search-index.js')) && /walked: new Set\(\)/.test(read('src/server/search-index.js')), '…and the hub\'s flushLive keeps that walked set (a dropped batch leaves `sent`, never `walked`)');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
