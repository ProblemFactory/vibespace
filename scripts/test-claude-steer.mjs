#!/usr/bin/env node
// A MESSAGE SENT WHILE A CLAUDE TURN RUNS IS THE PERSON'S TO HAND OVER OR TO HOLD (lane claude-steer-inject, 2.369.361 —
// the owner, 2026-10-27, ruling «A»: «Enter 立即送入，Alt+Enter 排队»). FAST, in-process + the REAL data/bin/chat-wrapper.js
// over the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — the turn shape R0 measured on 2.1.308 with a local
// mock /v1/messages: a frame written mid-tool is taken INTO the turn at the next tool result; a frame written when no
// tool result is left runs as a turn of its own right after; after an interrupt the CLI RUNS what it still holds).
//   §1 THE SEND-DOOR TABLE (PURE composerSendModes): claude = Enter hands over · Alt+Enter holds; codex = Enter holds ·
//      Alt+Enter injects; a door is drawn ONLY where the running wrapper backs it (a .354 wrapper: «Enter queues» alone)
//   §2 the composer: Enter's send carries the hand-over stamp, the hold door never does; the hint's words
//   §3 the adapter + the typing path: `webui_steer` on the frame; steer / steer-all queue ops for claude
//   §4 the normalizer: input_handover → the bubble's chip (handed → steered / own-turn → none / kept)
//   §5 Stop's ONE record says each handed frame's fate — `kept` (the CLI still held it) / `landed` (the model read it) —
//      and the chips and the toast are drawn from it (acceptance r2: a frame that rode a tool result was counted kept)
//   §6 (r2) a mid-turn frame the person sent is a RECORD of the conversation: the wrapper's buffer copy draws its bubble
//      after a restart — ONCE (the live send's msgId, the CLI's own later record of the same words claim it)
//   §7 (r2) the strip draws no ⚡ on a row the wrapper marks `steerable: false`; each refusal says why in its own words
// THE REAL WRAPPER over the stand-in (the hand-over, the witness, Stop's follow-up interrupt, the RED legs on the 6428c67e
// wrapper) is §0 of scripts/test-claude-steer-chrome.mjs — the fast tier's 910 s sum had 0.77 s left.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : '')); } return !!c; };
const S = JSON.stringify;
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** A section that THROWS (an older tree has no such method) is one red line naming it — the sections after it still run. */
const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} threw`, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };

const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const AM = await import(path.join(REPO, 'src/lib/agent-meta.js'));
const { ChatInput } = await import(path.join(REPO, 'src/lib/chat-input.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });

// ── §1 THE SEND-DOOR TABLE ──
console.log('§1 the send-door table (PURE composerSendModes over the RUNNING wrapper\'s verbs)');
ok(S(AM.SEND_DOOR_TABLE) === S({ queue: { enter: 'queue', alt: 'steer' }, steer: { enter: 'steer', alt: 'queue' } }), 'ONE row per default: queue = Enter holds · the second key injects; steer = Enter hands over · the second key holds', AM.SEND_DOOR_TABLE);
const cl = capsOf('claude').inputModes;
ok(cl.enterDoor === 'steer' && S(cl.queueVerbs) === S(['remove', 'steer', 'steer-all', 'reorder', 'edit']) && cl.steer === true, 'claude\'s row: steer / steer-all served by its wrapper, and plain Enter\'s door is the hand-over (the owner\'s ruling «A»)', cl);
const mirror = AM.getBackendMeta('claude').caps.inputModes;
ok(S(mirror) === S(cl), 'the client mirror carries the SAME row (enterDoor included — test-harness-contract deep-compares the rest)', { mirror, cl });
// the live intersection chat-view's _queueCaps() builds: the harness row ∧ the verbs the RUNNING wrapper named
const live = (row, served) => { const verbs = (row.queueVerbs || []).filter((v) => !served || served.includes(v)); return { queue: !!row.queue, steer: verbs.includes('steer'), queueOps: verbs.length > 0, queueVerbs: verbs, ...(row.enterDoor === 'steer' ? { enterDoor: 'steer' } : {}) }; };
ok(/\.\.\.\(row\.enterDoor === 'steer' \? \{ enterDoor: 'steer' \} : \{\}\)/.test(read('src/lib/chat-view.js')) && /caps\.enterDoor === 'steer' \? \{ enterDoor: 'steer' \} : \{\}/.test(read('src/lib/chat-input.js')), 'chat-view\'s _queueCaps() and ChatInput.setQueue carry the row\'s door (the intersection above is theirs)');
const m = (row, served, o) => AM.composerSendModes(live(row, served), o);
const NEW = ['remove', 'steer', 'steer-all', 'reorder', 'edit'], W354 = ['remove', 'reorder', 'edit'];
const cNew = m(cl, NEW);
ok(cNew.enterDoor === 'steer' && cNew.altDoor === 'queue' && cNew.steerOnEnter === true && cNew.allowHoldChord === true && cNew.allowSteerChord === false && cNew.showHint === true, 'claude on a 2.369.361 wrapper: Enter hands it to the running turn, Alt+Enter HOLDS it (the hold chord, not the steer one)', cNew);
const c354 = m(cl, W354);
ok(c354.enterDoor === 'queue' && c354.altDoor === null && c354.steerOnEnter === false && c354.allowHoldChord === false && c354.allowSteerChord === false && c354.queueSegment && !c354.steerSegment, 'OLD WRAPPER (2.369.354, names no steer): Enter keeps the door it really serves — «Enter queues» alone, no chord, no stamp', c354);
const cOld = AM.composerSendModes({ queue: false, steer: false, queueOps: false, queueVerbs: [] });
ok(cOld.showHint === false && cOld.enterDoor === null && cOld.steerOnEnter === false, 'a wrapper from before the queue (no advert at all): no hint, no chord, no stamp', cOld);
const cx = m(capsOf('codex').inputModes, null);
ok(cx.enterDoor === 'queue' && cx.altDoor === 'steer' && cx.allowSteerChord === true && cx.allowHoldChord === false && cx.steerOnEnter === false, 'codex unchanged: Enter queues, Alt+Enter injects (send, then convert the queued item)', cx);
const oc = m(capsOf('opencode').inputModes, null);
ok(oc.enterDoor === 'queue' && oc.altDoor === null && !oc.allowSteerChord && !oc.allowHoldChord, 'opencode unchanged: the queue door alone', oc);
ok(AM.composerSendModes(null).showHint === false && AM.composerSendModes(capsOf('shell').inputModes).showHint === false, 'shell / no caps: nothing');
const cOff = m(cl, NEW, { enterSends: false });
ok(cOff.enterDoor === 'steer' && cOff.sendSegment === false && cOff.enterSends === false, 'chat.enterSends off: Enter\'s own door names its key (no separate «sends» segment)', cOff);

// ── §2 THE COMPOSER ──
console.log('§2 the composer: the stamp, the hold door, the words');
const hint = (modes, key) => ChatInput.sendHintHtml(modes, key).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
ok(hint(cNew) === '|Enter sends now|·|Alt+Enter queues until the turn ends|', 'claude: «Enter sends now · Alt+Enter queues until the turn ends» (zh «Enter 立即送入 · Alt+Enter 排队到回合结束»)', hint(cNew));
ok(hint(c354) === '|Enter queues|', 'claude on an OLD wrapper: «Enter queues» alone — honestly', hint(c354));
ok(hint(cx) === '|Enter queues|·|Alt+Enter injects now|', 'codex: «Enter queues · Alt+Enter injects now» (unchanged)', hint(cx));
ok(hint(cOff, 'Ctrl+Enter') === '|Ctrl+Enter sends now|·|Alt+Enter queues until the turn ends|', 'enterSends off: «Ctrl+Enter sends now · …»', hint(cOff, 'Ctrl+Enter'));
const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default || {};
ok(zh['Enter sends now'] === 'Enter 立即送入' && zh['Alt+Enter queues until the turn ends'] === 'Alt+Enter 排队到回合结束' && zh['Handed to the running turn — the agent reads it at its next tool call'] === '已交给正在进行的回合 · 下一次工具调用时送达', 'the owner\'s own words in zh (the hint and the handed chip)');
// the REAL _send / holdNow over a DOM-free composer (the draft helpers are null-safe without a StateSync)
const mkCI = (caps, over = {}) => {
  const frames = [];
  const ci = Object.assign(Object.create(ChatInput.prototype), {
    _isStreaming: true, _queueCaps: caps, _textarea: { value: 'words for the agent', style: {} }, _attachments: [], _disconnected: false, _editingQueueId: null,
    _sessionId: 's-steer', _heldDraft: null, _judgeHeldDraft() { }, _expanded: false, _onSend() { }, showTyping() { }, _isTouch: () => false, _getEnterSends: () => true,
    _ws: { send: (f) => frames.push(f) },
  }, over);
  return { ci, frames };
};
await guard('§2 the composer', () => {
  const a = mkCI(live(cl, NEW)); const id = a.ci._send();
  ok(typeof id === 'string' && a.frames.length === 1 && a.frames[0].type === 'chat-input' && a.frames[0].steer === true && a.frames[0].msgId === id, 'claude ENTER: the chat-input frame carries steer:true (the hand-over door)', a.frames);
  const b = mkCI(live(cl, NEW)); const held = b.ci.holdNow();
  ok(held === true && b.frames.length === 1 && !('steer' in b.frames[0]), 'claude ALT+ENTER (holdNow): the SAME send, never stamped — the wrapper holds it', b.frames);
  const i = mkCI(live(cl, NEW), { _isStreaming: false }); i.ci._send();
  ok(i.frames[0].steer === true, 'idle claude: still stamped (a stamped frame with no turn running is a plain send — a lagging streaming flag never turns Enter into a hold)', i.frames);
  const o = mkCI(live(cl, W354)); o.ci._send();
  ok(!('steer' in o.frames[0]), 'claude on an OLD wrapper: no stamp (that wrapper would hold it anyway, and its hint says so)', o.frames);
  const x = mkCI(live(capsOf('codex').inputModes, null)); x.ci._send();
  ok(!('steer' in x.frames[0]), 'codex: no stamp (its steer is a queue op on the item, never a send shape)', x.frames);
  // r2: the HOLD door is the capability's alone — a client whose streaming flag lags (a second tab) still holds; at idle an
  // unstamped frame is a plain send (eeece327 gated it on the flag: the lagging tab's Alt+Enter fell through to a STAMPED send)
  const ia = mkCI(live(cl, NEW), { _isStreaming: false }); const iaHeld = ia.ci.holdNow();
  ok(ia.ci.holdChordAllowed === true && iaHeld === true && ia.frames.length === 1 && !('steer' in ia.frames[0]) && mkCI(live(cl, NEW)).ci.holdChordAllowed === true && mkCI(live(cl, W354)).ci.holdChordAllowed === false, 'the hold chord: the CAPABILITY alone — a lagging client (flag false) still HOLDS, unstamped; never where the wrapper does not back both doors', ia.frames);
  const att = mkCI(live(cl, NEW), { _attachments: [{ mediaType: 'image/png', base64: 'iVBORw0KGgo=' }], _renderAttachments() { } }); att.ci._send();
  ok(att.frames[0].steer === true && /"type":"image"/.test(att.frames[0].text), 'attachments ride a stamped frame as on a plain send (one frame: the image blocks + the words)', att.frames);
});
const ciSrc = read('src/lib/chat-input.js'), cvSrc = read('src/lib/chat-view.js');
ok(/e\.key === 'Enter' && e\.altKey && !e\.ctrlKey && !e\.metaKey && !e\.shiftKey && \(this\.steerChordAllowed \|\| this\.holdChordAllowed\)\) \{\n\s+e\.preventDefault\(\);\n\s+if \(this\.steerChordAllowed\) \{ if \(this\._onSteerChord\) this\._onSteerChord\(\); else this\.steerNow\(\); \}\n\s+else if \(this\._onHoldChord\) this\._onHoldChord\(\); else this\.holdNow\(\);/.test(ciSrc) && (ciSrc.match(/e\.key === 'Enter' && e\.altKey/g) || []).length === 1, 'ONE Alt+Enter chord, the session\'s second door: steer (chat.steerNow) or — here — HOLD (chat.holdNow); still the only chord');
ok(/export const HOLD_NOW_COMMAND = 'chat\.holdNow';/.test(cvSrc) && /command: HOLD_NOW_COMMAND,\n\s+when: \(ctx\) => steerTargetView\(ctx\) === this && this\._canHoldComposer\(\),/.test(cvSrc) && /onHoldChord: \(\) => runCommand\(HOLD_NOW_COMMAND, \{ view: this \}\)/.test(cvSrc) && /this\._holdKeyDispose\?\.\(\)/.test(cvSrc), 'chat.holdNow: registered once, keybound per view with its own `when` (mutually exclusive with chat.steerNow on the one chord), disposed with the view');
ok(/this\._holdBtn\.classList\.toggle\('hidden', !modes\.allowHoldChord\)/.test(ciSrc) && /get holdChordAllowed\(\) \{ return !!this\._sendModes\(\)\.allowHoldChord; \}/.test(ciSrc) && /this\._holdBtn\.innerHTML = UI_ICONS\.clock;/.test(ciSrc) && /\.chat-hold-btn:not\(\.hidden\)/.test(read('public/chat.css')), '≤ 768 px: the hold button beside Send (Send itself hands the message over), shown on the capability alone like the chord (r2), placed by CSS');

// ── §3 THE ADAPTER + THE TYPING PATH ──
console.log('§3 the adapter and the typing path');
const fr = (o) => JSON.parse(o.stdinPayload);
await guard('§3 the adapter', () => {
ok(fr(ad.formatChatInput('hi', 'm1', { steer: true })).webui_steer === true && !('webui_steer' in fr(ad.formatChatInput('hi', 'm1'))), 'formatChatInput stamps `webui_steer: true` only when asked');
ok(!('webui_steer' in fr(ad.formatChatInput('/compact', 'm2', { origin: 'dispatch', steer: true }))), 'a frame VibeSpace types (origin) is NEVER stamped — it is always held mid-turn');
const img = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }, { type: 'text', text: 'see' }] } });
const fimg = fr(ad.formatChatInput(img, 'm3', { steer: true }));
ok(fimg.webui_steer === true && fimg.message.content[0].type === 'image', 'an image paste is spliced with the stamp, its blocks untouched');
ok(ad.formatQueueOp({ op: 'steer', id: 'q1' }) === S({ type: 'queue-op', op: 'steer', id: 'q1' }) && ad.formatQueueOp({ op: 'steer-all' }) === S({ type: 'queue-op', op: 'steer-all', id: null }), 'claude steer / steer-all → the codex frame shapes (was: refused «takes no input into a running turn» — measured false on 2.1.308)');
let runNowErr = ''; try { ad.formatQueueOp({ op: 'run-now', id: 'q1' }); } catch (e) { runNowErr = e.message; }
ok(/as soon as the current turn ends/.test(runNowErr), 'run-now stays refused with its honest words', runNowErr);
});
await guard('§3 the typing path', () => {
  const { createUserInputSender } = require(path.join(REPO, 'src/server/user-input.js'));
  const lines = [];
  const session = { pty: {}, mode: 'chat', backend: 'claude', buffer: '' };
  const send = createUserInputSender({ activeSessions: new Map([['w1', session]]), adapterRegistry: { get: () => ad }, BUFFERS_DIR: os.tmpdir(), broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty() { }, ptyQuietSince: () => false, writeSessionInput: (s, l) => lines.push(JSON.parse(l)), log() { } }).send;
  send('w1', 'handed', { msgId: 'mh', origin: 'ws', steer: true });
  send('w1', 'held', { msgId: 'mq', origin: 'ws' });
  send('w1', '/compact', { msgId: 'md', origin: 'dispatch', steer: true });
  ok(lines[0].webui_steer === true && !('webui_steer' in lines[1]) && !('webui_steer' in lines[2]) && lines[2].webui_origin === 'dispatch', 'THE ONE typing path: the person\'s door rides to the wrapper; a dispatch never hands over', lines);
  ok(/sendUserInput\(data\.sessionId, data\.text, \{ msgId: data\.msgId, origin: 'ws', steer: data\.steer === true \}\)/.test(read('src/ws-handler.js')), 'ws `chat-input`: only `steer: true` counts');
});

// ── §4 THE NORMALIZER ──
console.log('§4 the normalizer: input_handover → the bubble\'s chip');
await guard('§4 the normalizer', () => {
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const mm = createMessageManager('claude', 'steer-chips');
  const ops = []; mm.onOp((o) => ops.push(o));
  for (const id of ['m-b', 'm-c', 'm-d', 'm-e']) mm.processLive(ad.formatChatInput('words ' + id, id, { steer: true }).userMsg);
  const chip = (id) => mm.messages.find((x) => x.webuiMsgId === id)?.queueState;
  mm.processLive({ type: 'input_handover', state: 'handed', msg_ids: ['m-b', 'm-c', 'm-d'], via: 'enter' });
  const handed = ['m-b', 'm-c', 'm-d'].map(chip);
  mm.processLive({ type: 'input_handover', state: 'landed', msg_ids: ['m-b'] });
  mm.processLive({ type: 'input_handover', state: 'own-turn', msg_ids: ['m-c'] });
  mm.processLive({ type: 'input_handover', state: 'kept', msg_ids: ['m-d'] });
  mm.processLive({ type: 'input_handover', state: 'bogus', msg_ids: ['m-e'] });
  ok(S(handed) === S(['handed', 'handed', 'handed']), 'handed: the bubble reads «Handed to the turn» (the agent reads it at its next tool call)', handed);
  ok(chip('m-b') === 'steered' && !chip('m-c') && chip('m-d') === 'kept' && !chip('m-e'), 'landed ⇒ «Steered» where it sits · own-turn ⇒ an ordinary message (no chip) · kept ⇒ «Stays with the stopped turn» · an unknown state changes nothing', ['m-b', 'm-c', 'm-d', 'm-e'].map(chip));
  ok(ops.filter((o) => o.op === 'edit' && o.fields && 'queueState' in o.fields).length === 6 && !mm.messages.some((x) => x.noticeKind === 'unknown-record'), 'one edit op per change, live to every client; no unknown-record card');
  ok(/'input_handover',/.test(read('server.js')), 'server.js CLAUDE_STREAM_TYPES knows the record (the unhandled-type breadcrumb stays quiet)');
  const rend = read('src/lib/chat-renderers.js');
  ok(/state === 'handed' \? t\('Handed to the turn'\)/.test(rend) && /state === 'kept' \? t\('Stays with the stopped turn'\)/.test(rend) && /&& state !== 'handed' && state !== 'kept'\) return null;/.test(rend), 'the chip renderer draws both new states, each with its own words');
});

// ── §5 STOP'S PUT-BACK COUNTS WHAT STAYS ──
console.log('§5 Stop: what was handed stays with the turn — counted, never put back');
await guard('§5 the put-back count', async () => {
  const PB = require(path.join(REPO, 'src/queue-putback.js'));
  const d = PB.queueDroppedOf({ type: 'queue_dropped', dropId: '9-1', by: 'stop', turnId: null, items: [], omitted: 0, kept: 2 });
  ok(d && d.kept === 2 && d.items.length === 0, 'queueDroppedOf reads `kept` (a record may carry it and no rows at all)', d);
  ok(S(PB.putbackNotice(d)) === S({ n: 0, images: 0, others: 0, cut: 0, omitted: 0, started: 0, kept: 2 }) && !('kept' in PB.putbackNotice(PB.queueDroppedOf({ type: 'queue_dropped', dropId: '9-2', items: [] }))), 'the toast\'s facts carry it — and only when there is one (every other harness\'s shape is unchanged)');
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const mm = createMessageManager('claude', 'steer-kept');
  const ops = []; mm.onOp((o) => ops.push(o));
  mm.processLive({ type: 'queue_dropped', dropId: '9-1', by: 'stop', turnId: null, items: [], omitted: 0, kept: 1 });
  const meta = ops.filter((o) => o.op === 'meta' && o.subtype === 'queue-putback');
  ok(meta.length === 1 && meta[0].kept === 1 && meta[0].n === 0, 'a Stop that put nothing back but ends a turn holding a handed message still says ONE toast', meta);
  ok(/if \(op\.kept > 0\) parts\.push\(t\('\{k\} message\(s\) you sent into the turn stay with it', \{ k: op\.kept \}\)\);/.test(cvSrc), 'the toast\'s words: «{k} message(s) you sent into the turn stay with it»');
  // r2: ONE record says EACH frame's fate, and the chips are drawn from it
  const d2 = PB.queueDroppedOf({ type: 'queue_dropped', dropId: '9-3', items: [{ id: 'q1', msgId: 'm-p', text: 'put back' }], kept: 1, keptIds: ['m-k'], landed: 1, landedIds: ['m-l'] });
  ok(d2 && S(d2.keptIds) === S(['m-k']) && S(d2.landedIds) === S(['m-l']) && d2.landed === 1 && S(PB.putbackNotice(d2)) === S({ n: 1, images: 0, others: 0, cut: 0, omitted: 0, started: 0, kept: 1, landed: 1 }), 'queueDroppedOf names each handed frame (keptIds / landedIds) and the toast\'s facts count both', { d2, facts: PB.putbackNotice(d2) });
  const mm2 = createMessageManager('claude', 'steer-fates');
  const ops2 = []; mm2.onOp((o) => ops2.push(o));
  for (const id of ['m-p', 'm-k', 'm-l']) mm2.processLive(ad.formatChatInput('words ' + id, id, { steer: id !== 'm-p' }).userMsg);
  mm2.processLive({ type: 'input_handover', state: 'handed', msg_ids: ['m-k', 'm-l'], via: 'enter' });
  mm2.processLive({ type: 'queue_dropped', dropId: '9-3', by: 'stop', turnId: null, items: [{ id: 'q1', msgId: 'm-p', text: 'words m-p' }], omitted: 0, kept: 1, keptIds: ['m-k'], landed: 1, landedIds: ['m-l'] });
  const chip2 = (id) => mm2.messages.find((x) => x.webuiMsgId === id)?.queueState;
  const meta2 = ops2.filter((o) => o.op === 'meta' && o.subtype === 'queue-putback');
  ok(chip2('m-p') === 'removed' && chip2('m-k') === 'kept' && chip2('m-l') === 'steered' && meta2.length === 1 && meta2[0].kept === 1 && meta2[0].landed === 1, 'the chips come from THE record: put back «Removed», kept «Stays with the stopped turn», read «Steered» — and ONE toast', { chips: ['m-p', 'm-k', 'm-l'].map(chip2), meta2 });
  ok(/if \(op\.landed > 0\) parts\.push\(t\('\{k\} message\(s\) you sent into the turn had already reached the agent', \{ k: op\.landed \}\)\);/.test(cvSrc), 'the toast names a read one in its own words — never «stays with it»: «{k} message(s) you sent into the turn had already reached the agent»');
  const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default || {};
  ok(!!zh['{k} message(s) you sent into the turn had already reached the agent'] && !!ja['{k} message(s) you sent into the turn had already reached the agent'], '…in zh and ja too');
});

// ── §6 A MID-TURN FRAME IS A RECORD OF THE CONVERSATION (r2) ──
console.log('§6 a mid-turn frame survives a restart: the wrapper\'s buffer copy, drawn once');
await guard('§6 the buffer copy', () => {
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const copy = (text, msgId) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, msgId, _fromWebui: true, webui_copy: true, timestamp: new Date().toISOString() });
  const users = (mm, text) => mm.messages.filter((m) => m.role === 'user' && S(m.content).includes(text));
  // a restart's history: the copy, the wrapper's records about it — the bubble comes back with its last chip
  const a = createMessageManager('claude', 'copy-a');
  a.processLive(copy('B handed mid tool', 'm-b'));
  a.processLive({ type: 'input_handover', state: 'handed', msg_ids: ['m-b'], via: 'enter' });
  a.processLive({ type: 'input_handover', state: 'landed', msg_ids: ['m-b'] });
  a.processLive({ type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'B handed mid tool' }] } });
  ok(users(a, 'B handed mid tool').length === 1 && users(a, 'B handed mid tool')[0].queueState === 'steered' && users(a, 'B handed mid tool')[0].webuiMsgId === 'm-b', 'the copy draws the bubble (its msgId, «Steered»); the CLI\'s own attachment of the same words claims it — ONE bubble', users(a, 'B handed mid tool'));
  const b = createMessageManager('claude', 'copy-b');
  b.processLive(ad.formatChatInput('C sent live', 'm-c', { steer: true }).userMsg);
  b.processLive(copy('C sent live', 'm-c'));
  ok(users(b, 'C sent live').length === 1, 'the live send and the copy of it (one msgId) are ONE bubble', users(b, 'C sent live'));
  const c = createMessageManager('claude', 'copy-c');
  c.processLive(copy('D held, then ran', 'm-d'));
  c.processLive({ type: 'queued_input', msg_id: 'm-d', turn_id: null });
  c.processLive({ type: 'user', promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'D held, then ran' }] } });
  ok(users(c, 'D held, then ran').length === 1, 'the CLI\'s own record of the turn it ran (a held frame drained, a kept frame\'s follow-up) claims the copy — ONE bubble', users(c, 'D held, then ran'));
  const e = createMessageManager('claude', 'copy-e');
  e.processLive(copy('E put back', 'm-e'));
  e.processLive({ type: 'queue_dropped', dropId: '9-9', by: 'stop', turnId: null, items: [{ id: 'q', msgId: 'm-e', text: 'E put back' }], omitted: 0 });
  e.processLive({ type: 'user', promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'E put back' }] } });
  ok(users(e, 'E put back').length === 2 && users(e, 'E put back')[0].queueState === 'removed', 'a frame Stop PUT BACK never ran: the person\'s resend of the same words is its own bubble (the copy keeps «Removed»)', users(e, 'E put back').map((m) => m.queueState || null));
  ok(/if \(msg\._fromWebui && msg\.timestamp && !msg\.webui_copy\) \{/.test(read('src/session-store.js')), 'the history merge keeps a copy whatever user record follows it (a tool_result is one) — src/session-store.js');
  const wr = read('data/bin/chat-wrapper.js');
  ok(/if \(!origin && msgId && !isCommandFrame\(o\) && recordPersonFrame\(o, msgId\)\) buffered = false;/.test(wr) && /buffer \+= JSON\.stringify\(\{ type: 'user', message: \{ role: 'user', content \}, msgId, _fromWebui: true, webui_copy: true, timestamp: new Date\(\)\.toISOString\(\) \}\) \+ '\\n';/.test(wr), 'the wrapper writes the copy into its HISTORY BUFFER only (never stdout — the live view drew it at send), for the person\'s mid-turn frames (never a slash command — the CLI records the command it runs its own way)');
});

// ── §7 THE STRIP AND THE REFUSALS (r2) ──
console.log('§7 the strip: no ⚡ where the wrapper says it cannot join; each refusal in its own words');
await guard('§7 the strip', () => {
  const caps = { queueVerbs: NEW };
  const html = ChatInput.queueStripHtml([{ id: 'q1', msgId: 'm1', preview: 'mine', text: 'mine', kind: 'user' }, { id: 'q2', msgId: 'm2', preview: '/cost', text: '/cost', kind: 'user', steerable: false }, { id: 'q3', msgId: 'm3', preview: 'a dispatch', kind: 'system', steerable: false }], caps);
  const steers = (html.match(/data-queue-op="steer" data-queue-id="([^"]+)"/g) || []).map((s) => s.replace(/.*data-queue-id="([^"]+)"/, '$1'));
  ok(S(steers) === S(['q1']) && !/data-queue-op="steer-all"/.test(html), 'a row marked `steerable: false` (a command, a frame VibeSpace typed) has no ⚡, and «Steer all» counts only rows that may join (one ⇒ none drawn)', steers);
  const html2 = ChatInput.queueStripHtml([{ id: 'q1', msgId: 'm1', preview: 'a', kind: 'user' }, { id: 'q2', msgId: 'm2', preview: 'b', kind: 'user' }], caps);
  ok((html2.match(/data-queue-op="steer"/g) || []).length === 2 && /data-queue-op="steer-all"/.test(html2), 'CONTROL: rows that say nothing keep their ⚡ (codex / agy / acp unchanged)');
  const MM = require(path.join(REPO, 'src/message-manager.js'));
  const txt = (why) => (MM.MessageManager || MM).queueOpFailureText({ reason: 'not-steerable', ...(why ? { why } : {}) });
  ok(/^VibeSpace's own message runs between turns/.test(txt('origin')) && /^The turn is being stopped/.test(txt('stopping')) && /^This agent has not shown yet/.test(txt('unproven')) && /^A command runs between turns/.test(txt('command')) && /^A command runs between turns/.test(txt()), 'not-steerable says WHY: VibeSpace\'s own message / the stop settling / an unproven CLI / a command (no why = a command, an older wrapper)', ['origin', 'stopping', 'unproven', 'command', null].map(txt));
});

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
