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
//   §8 (B-28b1, the same row as B-1c04) THE STOP THAT CAME LATE: the REAL wrapper over the stand-in CLI with a stall PLACED in
//      the window BY ORDER (the stand-in reads the wrapper's second interrupt only after its follow-up's request left / its answer
//      was said / it ended — never by a clock):
//      the stop-late fact rides the follow-up's result and the page draws it once; answered / ran to its end / a second Stop
//      (held by COUNT: the stand-in reads nothing until both interrupts wait) / a 2.1.308 CLI; the stall the other way tells
//      nothing; RED CONTROLS: a wrapper that never looks reports a clean stop, a rebuild that drops the mark loses the fact
//   §8 (B-fcd6) once this CLI process has named a frame, a follow-up init that leaves `user_message_uuids` out took none of
//      the stamped frames (the real 2.1.308 / 2.1.312 recordings) — the rider the model read lands; RED: the r4 rule, and a
//      rule without the witness (the race CLI's held rider called read)
// THE REAL WRAPPER over the stand-in (the hand-over, the witness, Stop's follow-up interrupt, the RED legs on the 6428c67e
// wrapper) is §0 of scripts/test-claude-steer-chrome.mjs — the fast tier's 910 s sum had 0.77 s left; §8 here is the one fast
// exception (B-28b1: ten runs at once, 0.6 s on the test machine).
import { anchored } from './scratch.mjs';
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
const ENTER = await import(path.join(REPO, 'src/lib/chat-enter-keys.js'));
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
ok((/\.\.\.\(row\.enterDoor === 'steer' \? \{ enterDoor: 'steer' \} : \{\}\)/.test(read('src/lib/chat-view.js')) || (/const caps = doorCapsOf\(row, served\);/.test(read('src/lib/chat-view.js')) && /\.\.\.\(row\.enterDoor === 'steer' \? \{ enterDoor: 'steer' \} : \{\}\)/.test(read('src/backend-caps.js')))) && /caps\.enterDoor === 'steer' \? \{ enterDoor: 'steer' \} : \{\}/.test(read('src/lib/chat-input.js')), 'chat-view\'s _queueCaps() and ChatInput.setQueue carry the row\'s door (the intersection above is theirs)');
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
  // r4: the hold chord is a LIVE-TURN verb — the capability says it EXISTS, the turn says it ACTS; at idle Alt+Enter is the
  // composer's own Enter (a newline where Enter is one), and where it sends it sends UNSTAMPED (7df30f96 sent the draft at
  // idle in the expanded composer and with chat.enterSends off, where the key had always been a newline)
  const { EnterGuard } = ENTER;
  const key = () => { const ev = { key: 'Enter', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, prevented: false }; ev.preventDefault = () => { ev.prevented = true; }; return ev; };
  const chord = (over) => { const c = mkCI(live(cl, NEW), { _enterGuard: new EnterGuard(), _getTouchEnterSends: () => false, _showImeHint() { }, ...over }); const ev = key(); const did = c.ci._altEnter(ev); return { did, prevented: ev.prevented, frames: c.frames, value: c.ci._textarea.value, events: c.ci._textarea.events || [] }; };
  const run = chord({ _isStreaming: true }), runX = chord({ _isStreaming: true, _expanded: true, _textarea: { value: 'words for the agent', style: {}, classList: { remove() { } }, parentElement: null }, _shortcutHint: {} });
  ok(run.did === 'hold' && run.prevented && run.frames.length === 1 && !('steer' in run.frames[0]) && runX.did === 'hold' && runX.frames.length === 1, 'Alt+Enter while a turn runs HOLDS — in the expanded composer too (an unstamped frame the wrapper keeps)', { run, runX });
  // r5: a newline TYPED — Chrome inserts nothing for Alt+Enter (the reviewers' bare textarea; the product's composer in
  // test-claude-steer-chrome ⑲), so leaving it to the textarea's default made it a dead key
  const ab = () => ({ value: 'ab', selectionStart: 1, selectionEnd: 1, style: {}, events: [], dispatchEvent(e) { this.events.push(e.type); return true; } });
  const idleX = chord({ _isStreaming: false, _expanded: true, _textarea: ab() }), idleOff = chord({ _isStreaming: false, _getEnterSends: () => false, _textarea: ab() });
  ok(idleX.did === 'newline' && idleX.prevented && idleX.frames.length === 0 && idleX.value === 'a\nb' && idleX.events.join() === 'input'
    && idleOff.did === 'newline' && idleOff.prevented && idleOff.frames.length === 0 && idleOff.value === 'a\nb', 'Alt+Enter at IDLE in the expanded composer / with chat.enterSends off: a NEWLINE TYPED at the caret (+ an input event) — nothing sent, never a dead key', { idleX, idleOff });
  const idle = chord({ _isStreaming: false });
  ok(idle.did === 'send' && idle.prevented && idle.frames.length === 1 && !('steer' in idle.frames[0]), 'Alt+Enter at idle where Enter sends: a send, UNSTAMPED — so a tab whose flag lags behind a running turn still has it HELD by the wrapper (r2)', idle);
  ok(mkCI(live(cl, NEW), { _isStreaming: false }).ci.holdChordActs === false && mkCI(live(cl, NEW)).ci.holdChordActs === true && mkCI(live(cl, W354)).ci.holdChordActs === false, 'holdChordActs = the door exists AND a turn runs');
  const att = mkCI(live(cl, NEW), { _attachments: [{ mediaType: 'image/png', base64: 'iVBORw0KGgo=' }], _renderAttachments() { } }); att.ci._send();
  ok(att.frames[0].steer === true && /"type":"image"/.test(att.frames[0].text), 'attachments ride a stamped frame as on a plain send (one frame: the image blocks + the words)', att.frames);
});
const ciSrc = read('src/lib/chat-input.js'), cvSrc = read('src/lib/chat-view.js');
ok(/e\.key === 'Enter' && e\.altKey && !e\.ctrlKey && !e\.metaKey && !e\.shiftKey && \(this\.steerChordAllowed \|\| this\.holdChordAllowed\)\) \{ this\._altEnter\(e\); return; \}/.test(ciSrc) && (ciSrc.match(/e\.key === 'Enter' && e\.altKey/g) || []).length === 1 && /_altEnter\(e\) \{\n\s+if \(this\.steerChordAllowed\) \{ e\.preventDefault\(\); if \(this\._onSteerChord\) this\._onSteerChord\(\); else this\.steerNow\(\); return 'steer'; \}\n\s+if \(this\.holdChordActs\) \{ e\.preventDefault\(\); if \(this\._onHoldChord\) this\._onHoldChord\(\); else this\.holdNow\(\); return 'hold'; \}/.test(ciSrc) && /_canHoldComposer\(\) \{ return !!this\._chatInput\?\.holdChordActs; \}/.test(cvSrc), 'ONE Alt+Enter chord, the session\'s second door: steer (chat.steerNow) or — here — HOLD (chat.holdNow); still the only chord');
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
  ok(chip('m-b') === 'steered' && !chip('m-c') && chip('m-d') === 'kept' && !chip('m-e'), 'landed ⇒ «Steered» where it sits · own-turn ⇒ an ordinary message (no chip) · kept ⇒ «Unread when stopped — goes with your next message» (lane midturn-order) · an unknown state changes nothing', ['m-b', 'm-c', 'm-d', 'm-e'].map(chip));
  ok(ops.filter((o) => o.op === 'edit' && o.fields && 'queueState' in o.fields).length === 6 && !mm.messages.some((x) => x.noticeKind === 'unknown-record'), 'one edit op per change, live to every client; no unknown-record card');
  ok(/'input_handover',/.test(read('server.js')), 'server.js CLAUDE_STREAM_TYPES knows the record (the unhandled-type breadcrumb stays quiet)');
  const rend = read('src/lib/chat-renderers.js');
  ok(/state === 'handed' \? t\('Handed to the turn'\)/.test(rend) && /state === 'kept' \? t\('Unread when stopped — goes with your next message'\)/.test(rend) && /&& state !== 'handed' && state !== 'kept' && state !== 'undelivered' && state !== 'unconfirmed' && state !== 'resent' && state !== 'dismissed'\) return null;/.test(rend), 'the chip renderer draws both new states, each with its own words');
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
  ok(/if \(op\.kept > 0\) parts\.push\(t\('\{k\} message\(s\) unread when stopped — they go with your next message', \{ k: op\.kept \}\)\);/.test(cvSrc), 'the toast\'s words: «{k} message(s) unread when stopped — they go with your next message» (lane midturn-order r2 m5)');
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
  ok(chip2('m-p') === 'removed' && chip2('m-k') === 'kept' && chip2('m-l') === 'steered' && meta2.length === 1 && meta2[0].kept === 1 && meta2[0].landed === 1, 'the chips come from THE record: put back «Removed», kept «Unread when stopped — goes with your next message», read «Steered» — and ONE toast', { chips: ['m-p', 'm-k', 'm-l'].map(chip2), meta2 });
  ok(/if \(op\.landed > 0\) parts\.push\(t\('\{k\} message\(s\) you sent into the turn had already reached the agent', \{ k: op\.landed \}\)\);/.test(cvSrc), 'the toast names a read one in its own words — never «stays with it»: «{k} message(s) you sent into the turn had already reached the agent»');
  const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default || {};
  ok(!!zh['{k} message(s) you sent into the turn had already reached the agent'] && !!ja['{k} message(s) you sent into the turn had already reached the agent'], '…in zh and ja too');
});

// ── §6 A MID-TURN FRAME IS A RECORD OF THE CONVERSATION (r2) ──
console.log('§6 a mid-turn frame survives a restart: the wrapper\'s buffer copy, drawn once');
await guard('§6 the buffer copy', () => {
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  // r4: the copy names the WITNESS (`cliUuid`, the uuid the wrapper stamped on the frame); the CLI keeps it as its user record's
  // uuid and as a queued_command attachment's source_uuid (measured on 2.1.312)
  const U = (n) => 'e2e00000-0000-4000-8000-' + String(n).padStart(12, '0');
  const copy = (text, msgId, cliUuid = null, extra = []) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }, ...extra] }, msgId, ...(cliUuid ? { cliUuid } : {}), _fromWebui: true, webui_copy: true, timestamp: new Date().toISOString() });
  const IMG = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo' } };
  const imgs = (m) => (m.content || []).filter((b) => b.type === 'image').length;
  const users = (mm, text) => mm.messages.filter((m) => m.role === 'user' && S(m.content).includes(text));
  // a restart's history: the copy, the wrapper's records about it — the bubble comes back with its last chip
  const a = createMessageManager('claude', 'copy-a');
  a.processLive(copy('B handed mid tool', 'm-b', U(1)));
  a.processLive({ type: 'input_handover', state: 'handed', msg_ids: ['m-b'], via: 'enter' });
  a.processLive({ type: 'input_handover', state: 'landed', msg_ids: ['m-b'] });
  a.processLive({ type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'B handed mid tool' }], source_uuid: U(1) } });
  ok(users(a, 'B handed mid tool').length === 1 && users(a, 'B handed mid tool')[0].queueState === 'steered' && users(a, 'B handed mid tool')[0].webuiMsgId === 'm-b', 'the copy draws the bubble (its msgId, «Steered»); the CLI\'s own attachment of the same words claims it — ONE bubble', users(a, 'B handed mid tool'));
  const b = createMessageManager('claude', 'copy-b');
  b.processLive(ad.formatChatInput('C sent live', 'm-c', { steer: true }).userMsg);
  b.processLive(copy('C sent live', 'm-c'));
  ok(users(b, 'C sent live').length === 1, 'the live send and the copy of it (one msgId) are ONE bubble', users(b, 'C sent live'));
  const c = createMessageManager('claude', 'copy-c');
  c.processLive(copy('D held, then ran', 'm-d', U(4)));
  c.processLive({ type: 'queued_input', msg_id: 'm-d', turn_id: null });
  c.processLive({ type: 'user', uuid: U(4), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'D held, then ran' }] } });
  ok(users(c, 'D held, then ran').length === 1, 'the CLI\'s own record of the turn it ran (a held frame drained, a kept frame\'s follow-up) — its uuid the copy\'s witness — claims the copy: ONE bubble', users(c, 'D held, then ran'));
  // the claim is by WITNESS, never by distance (7df30f96: a copy more than 60 messages back was drawn twice) …
  for (const N of [59, 61, 150]) {
    const w = createMessageManager('claude', 'copy-w' + N);
    w.processLive(copy('W held through a long turn', 'm-w', U(5)));
    w.processLive({ type: 'queued_input', msg_id: 'm-w', turn_id: null });
    for (let i = 0; i < N; i++) {
      w.processLive({ type: 'assistant', message: { id: 'msg_w' + i, role: 'assistant', content: [{ type: 'tool_use', id: 'tw' + i, name: 'Bash', input: { command: 'ls' } }] } });
      w.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tw' + i, content: 'ok' }] } });
    }
    w.processLive({ type: 'result', subtype: 'success' });
    w.processLive({ type: 'user', uuid: U(5), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'W held through a long turn' }] } });
    ok(users(w, 'W held through a long turn').length === 1, `…at ANY distance: ${N} tool round trips between the copy and the record — ONE bubble`, users(w, 'W held through a long turn').length);
  }
  // … and never by its words: the same words in a record that is not the copy's (a person typing them again) are their own bubble
  const n = createMessageManager('claude', 'copy-n');
  n.processLive(copy('N said twice', 'm-n', U(6)));
  n.processLive({ type: 'user', uuid: U(7), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'N said twice' }] } });
  ok(users(n, 'N said twice').length === 2, '…and never by its WORDS: a record of the same words under another uuid is its own bubble', users(n, 'N said twice').length);
  // a copy never hides a RICHER record (7df30f96: the text-only copy of a 400 KB screenshot frame claimed the CLI's record and the
  // screenshot was gone after a restart) — the bubble shows what the CLI recorded, image and all, with the copy's chip
  const r = createMessageManager('claude', 'copy-r');
  r.processLive(copy('what is wrong in this screenshot?', 'm-r', U(8)));
  r.processLive({ type: 'queued_input', msg_id: 'm-r', turn_id: null });
  r.processLive({ type: 'result', subtype: 'success', result: 'x' });
  r.processLive({ type: 'user', uuid: U(8), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'what is wrong in this screenshot?' }, IMG] } });
  const ru = users(r, 'what is wrong in this screenshot?');
  ok(ru.length === 1 && imgs(ru[0]) === 1 && ru[0].webuiMsgId === 'm-r', 'a text-only copy (a frame over 256 KB) and the CLI\'s record WITH the image ⇒ ONE bubble, WITH the image (the record\'s blocks), the copy\'s msgId and chip', ru.map((m) => ({ images: imgs(m), chip: m.queueState || null })));
  const ra = createMessageManager('claude', 'copy-ra');
  ra.processLive(copy('see this', 'm-ra', U(9)));
  ra.processLive({ type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'see this' }, IMG], source_uuid: U(9) } });
  ok(users(ra, 'see this').length === 1 && imgs(users(ra, 'see this')[0]) === 1, '…the same through the CLI\'s queued_command attachment (a frame taken in at a tool result): ONE bubble, with the image', users(ra, 'see this').map(imgs));
  const eq = createMessageManager('claude', 'copy-eq');
  eq.processLive(copy('small image', 'm-eq', U(10), [IMG]));
  eq.processLive({ type: 'user', uuid: U(10), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'small image' }, IMG] } });
  ok(users(eq, 'small image').length === 1 && imgs(users(eq, 'small image')[0]) === 1, 'CONTROL: a whole copy (under 256 KB, its image inline) and the record ⇒ one bubble, one image (never two)', users(eq, 'small image').map(imgs));
  const e = createMessageManager('claude', 'copy-e');
  e.processLive(copy('E put back', 'm-e', U(11)));
  e.processLive({ type: 'queue_dropped', dropId: '9-9', by: 'stop', turnId: null, items: [{ id: 'q', msgId: 'm-e', text: 'E put back' }], omitted: 0 });
  e.processLive({ type: 'user', uuid: U(12), promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'E put back' }] } });
  ok(users(e, 'E put back').length === 2 && users(e, 'E put back')[0].queueState === 'removed', 'a frame Stop PUT BACK never ran: the person\'s resend of the same words is its own bubble (the copy keeps «Removed»)', users(e, 'E put back').map((m) => m.queueState || null));
  ok(/if \(msg\._fromWebui && msg\.timestamp && !msg\.webui_copy\) \{/.test(read('src/session-store.js')), 'the history merge keeps a copy whatever user record follows it (a tool_result is one) — src/session-store.js');
  const wr = read('data/bin/chat-wrapper.js');
  ok(/if \(!origin && msgId && !isCommandFrame\(o\)\) \{\n\s+const st = stampFrame\(line, o\);\n\s+line = st\.line;\n\s+if \(recordPersonFrame\(o, msgId, st\.uuid\)\) buffered = false;\n\s+\}/.test(wr) && /return JSON\.stringify\(\{ type: 'user', message: \{ role: 'user', content \}, msgId, cliUuid, handNo, _fromWebui: true, webui_copy: true, timestamp: ts \}\);/.test(wr) && /buffer \+= line \+ '\\n';\n\s+copies\.set\(msgId, \{ line, ts, cliUuid, handNo: 0, settled: false \}\);/.test(wr) && /rewriteCopy\(entry\.msgId, o\);/.test(wr), 'the wrapper writes the copy into its HISTORY BUFFER only (never stdout — the live view drew it at send), for the person\'s mid-turn frames (never a slash command — the CLI records the command it runs its own way)');
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

await guard('§r6 the settle chip tells the truth', () => {
  const MMr = require(path.join(REPO, 'src/message-manager.js'));
  const m = new MMr.MessageManager('s-r6-chip');
  m.processLive({ type: 'user', _fromWebui: true, msgId: 'm-c', message: { role: 'user', content: [{ type: 'text', text: 'C held behind B' }] }, timestamp: new Date().toISOString() });
  m.processLive({ type: 'queue_changed', items: [{ id: 'q1', msgId: 'm-c', preview: 'C', ts: 1, kind: 'user' }], verbs: ['remove', 'steer', 'steer-all', 'reorder', 'edit'] });
  m.processLive({ type: 'queue_settle', state: 'settling', until: Date.now() + 30000, ms: 30000, why: 'handover' });
  const c = () => m.messages.find((x) => x.webuiMsgId === 'm-c');
  const settling = c()?.settling;
  m.processLive({ type: 'queue_settle', state: 'running', why: 'handover' });
  const running = c()?.settling;
  ok(!!settling && settling.why === 'handover' && Number(settling.now) > 0 && Number(settling.until) > settling.now && !!running && running.running === true && !running.until, '(r6) the owed turn\'s init ENDS the settle: «settling» (its why, the hub\'s now + until) → «running» with no deadline — a countdown only while a timer exists', { settling, running });
  const cv = read('src/lib/chat-view.js'), cr = read('src/lib/chat-renderers.js');
  ok(/localUntil: Date\.now\(\) \+ \(Number\(fields\.settling\.until\) - Number\(fields\.settling\.now\)\)/.test(cv) && /Number\(settling\.localUntil\) > 0 \? Number\(settling\.localUntil\)/.test(cr) && !/Number\(settling\.until\) > 0 \? Number\(settling\.until\)/.test(cr), '(r6) the hub-clock law: the browser counts down to `until − now` from the moment the edit arrived (never the hub\'s epoch against its own clock); a restored page shows no seconds');
  const w = read('data/bin/chat-wrapper.js');
  ok(/record\('queue_settle', \{ state: 'running', why: 'handover' \}\)/.test(w) && /why: stopping \? 'stop' : 'handover'/.test(w), '(r6) the wrapper says «running» at the owed turn\'s init and names WHY a window holds (a Stop or a hand-over)');
});
await guard('§r7 the hook bound is two facts: which hooks the CLI loads AND how many it said started', () => {
  // the wrapper's own census + bound, run over scratch settings (never the box's): HOME / cwd / argv / env are stubs
  const w = read('data/bin/chat-wrapper.js');
  const body = w.slice(w.indexOf('const PROMPT_HOOK_MARGIN_MS'), w.indexOf('let hookTimer = null;'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-steer-r7-'));
  const home = path.join(root, 'home'), cwd = path.join(root, 'cwd'), bin = path.join(REPO, 'data/bin');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true }); fs.mkdirSync(cwd, { recursive: true });
  const hooksOf = (...hs) => JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: hs }] } });
  const PRODUCT = { type: 'command', command: `"${process.execPath}" ${path.join(bin, 'vibespace-hook.mjs')}`, timeout: 10 };
  const run = ({ settings, argv = [], env = {}, started = 1 }) => {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), settings);
    const proc = { env: { HOME: home, ...env }, platform: 'linux', cwd: () => cwd, argv: ['node', 'chat-wrapper.js', 'b.buf', 'm.json', 'claude', ...argv] };
    const f = new Function('fs', 'path', 'os', 'process', '__dirname', body + '\nreturn { promptHookCensus, promptHookBound };');
    return f(fs, path, { ...os, homedir: () => home }, proc, bin).promptHookBound(started);
  };
  try {
    const flag = path.join(root, 'mine.json'); fs.writeFileSync(flag, hooksOf({ type: 'command', command: 'sleep 100', timeout: 120 }));
    const lone = run({ settings: hooksOf(PRODUCT) });
    ok(lone.ms === 15000 && /the product's hook/.test(lone.why), '(r7) the product-only control: one hook started, the settings name only the product\'s (this install\'s path, timeout 10) ⇒ 15 s', lone);
    const two = run({ settings: hooksOf(PRODUCT), started: 2 });
    ok(two.ms === 605000 && /2 hook\(s\) said started/.test(two.why), '(r7) TWO hooks started, the settings name one ⇒ the unseen one fails closed: 605 s (r6: 15 s ⇒ the kept frame answered after Stop)', two);
    const remote = run({ settings: hooksOf(PRODUCT), env: { VIBESPACE_REMOTE_SID: 'r-1' } });
    ok(remote.ms === 605000 && /remote session/.test(remote.why), '(r7) a REMOTE session (its CLI loads the device\'s settings) ⇒ unknown ⇒ 605 s', remote);
    const flagged = run({ settings: hooksOf(PRODUCT), argv: ['--settings', flag], started: 2 });
    ok(flagged.ms === 125000 && /not the product's: its timeout 120 s/.test(flagged.why), '(r7) a `--settings <file>` in the CLI\'s arguments is READ: its 120 s hook attributed ⇒ 125 s', flagged);
    const inline = run({ settings: hooksOf(PRODUCT), argv: ['--settings=' + hooksOf({ type: 'command', command: 'sleep 1', timeout: 40 })], started: 2 });
    ok(inline.ms === 45000, '(r7) an inline `--settings=<json>` is read too ⇒ its 40 s hook + 5 s', inline);
    const named = run({ settings: hooksOf({ type: 'command', command: 'sleep 125 # vibespace-hook.mjs' }) });
    ok(named.ms === 605000 && !/product's hook/.test(named.why), '(r7) the product\'s hook by IDENTITY, never a name match: `sleep 125 # vibespace-hook.mjs` is a user hook ⇒ its 600 s default + 5 s', named);
    const elsewhere = run({ settings: hooksOf({ type: 'command', command: 'node /var/tmp/some-other-place/vibespace-hook.mjs', timeout: 600 }) });
    ok(elsewhere.ms === 605000 && !/product's hook/.test(elsewhere.why), '(r7) a vibespace-hook.mjs from another path is not the product\'s ⇒ its own 600 s + 5 s', elsewhere);
    const longer = run({ settings: hooksOf({ ...PRODUCT, timeout: 300 }) });
    ok(longer.ms === 305000, '(r7) the product\'s path with timeout 300 ⇒ ITS registered timeout + 5 s (r6 said 15 s)', longer);
    const plugin = run({ settings: hooksOf(PRODUCT), argv: ['--plugin-dir', root] });
    ok(plugin.ms === 605000, '(r7) a `--plugin-dir` (its hooks are its own) ⇒ 605 s', plugin);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  ok(/const b = promptHookBound\(hooksStarted\);/.test(w) && /promptHooks\.add\(hid\); hooksStarted\+\+;/.test(w), '(r7) the wrapper arms the bound with the count the CLI said started (r6 read the census alone)');
  ok(/function settleStopCopies\(why\) \{\n\s+landRiding\(why\);[\s\S]{0,200}settleCopies\(kept\); settleCopies\(rode\);/.test(w) && (w.match(/settleStopCopies\(/g) || []).length === 3, '(r7) every frame a Stop touched settles once — kept AND riding (the follow-up took it), at the settle and at the backstop');
});
// ── §8 THE STOP THAT CAME LATE (B-28b1 — the same row as B-1c04; the coordinator's ruling 2026-11-18 «TELL, DO NOT PRETEND») ──
// A frame the CLI still held at Stop runs as a follow-up the wrapper interrupts on its init; on a loaded machine the CLI read that
// second interrupt after its request had left (hosted: settle +57..66 ms). Proven with a STALL PLACED in the stand-in's window — a
// placed by ORDER, never load or a clock (the coordinator's rule): the stand-in reads no stdin line after a follow-up's init until
// its request has left (or its answer was said, or it ended) — so the wrapper's interrupt on that init is read only THEN; the other
// direction gives the follow-up no request at all, so the interrupt is read first and ends it.
// Every follow-up waits for ever unless its interrupt ends it (FOLLOW_MS 600 s) and the tool runs 5 s: Stop ends each run early.
console.log('§8 the Stop that came late: the REAL chat-wrapper over the stand-in CLI, a stall placed in the window');
await guard('§8', async () => {
  const { spawn } = await import('node:child_process');
  const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
  const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(5); } return fn(); };
  const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
  // THE RECORD IS SAID AFTER IT IS ON DISK (主开发 r2320, the hosted gates' «late: [] … lateLines: 1»): the wrapper logs «stop late» and
  // «stop settled» while it handles the CLI's chunk, and SAYS the result that carries the fact only at the batch's end, after the
  // durable write (data/bin/chat-wrapper.js endBatch: persistNow, the journal, then stdout — B-5a4d / B-cd4b). So the log runs one
  // write AHEAD of the record by design; the run waits for the RECORD by order, never a clock. STALL: a preload placed in that very
  // window — the wrapper's SAY is held: from the line that carries the chosen text (its STOP_LATE_STALL_AT-th copy) every line it
  // says waits until THE RUN RELEASES IT (a file the run writes, STOP_LATE_STALL_RELEASE — never a duration, 主开发 r2870), then all go
  // out in their order — the hosted symptom made at will. A held SAY, never a blocked
  // write: a blocked durable write made the red control hang on how the CLI's lines met the wrapper (its result and its idle word
  // in ONE chunk: the settle is logged before the record is said; in TWO: the record is said before the settle is logged, and the
  // release's read is right). The held say opens the same window either way.
  const STALL = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-late-stall-')), 'stall-say.cjs');
  fs.writeFileSync(STALL, [
    "'use strict';",
    "const fs = require('fs'), out = process.stdout, write = out.write.bind(out), E = process.env;",
    "const TEXT = E.STOP_LATE_STALL_TEXT || '', AT = Number(E.STOP_LATE_STALL_AT) || 1, MARK = E.STOP_LATE_STALL_MARK || '', RELEASE = E.STOP_LATE_STALL_RELEASE || '';",
    "let seen = 0, state = 0, q = [];   // 0 not yet · 1 holding · 2 let go",
    "out.write = function (chunk, ...a) {",
    "  if (state === 1) { q.push([chunk, a]); return true; }",
    "  if (state === 0 && TEXT) {",
    "    const s = String(chunk); for (let i = s.indexOf(TEXT); i >= 0; i = s.indexOf(TEXT, i + 1)) seen++;",
    "    if (seen >= AT) { state = 1; q.push([chunk, a]); if (MARK) fs.writeFileSync(MARK, 'held');",
    "      const poll = setInterval(() => { if (RELEASE && fs.existsSync(RELEASE)) { clearInterval(poll); state = 2; for (const [c, x] of q) write(c, ...x); q = []; } }, 10); return true; }",
    "  }",
    "  return write(chunk, ...a);",
    "};",
  ].join('\n') + '\n');
  process.on('exit', () => { try { fs.rmSync(path.dirname(STALL), { recursive: true, force: true }); } catch { } });   // the stall's folder is the run's own
  const run = async (wrapperPath, label, env, { secondStop = false, stall = null, oldWait = false } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-late-' + label + '-'));
    const dlv = path.join(dir, 'delivered.jsonl');
    const w = spawn(process.execPath, [...(stall ? ['-r', STALL] : []), wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STAND_IN_DELIVERED: dlv, STAND_IN_LONG_MS: '5000', STAND_IN_RELEASE_FILE: path.join(dir, 'tool-never-released'), VIBESPACE_SKIP_AGENT_HOOKS: '1', ...env, ...(stall ? { STOP_LATE_STALL_TEXT: stall.text, STOP_LATE_STALL_AT: String(stall.at), STOP_LATE_STALL_RELEASE: path.join(dir, 'release'), STOP_LATE_STALL_MARK: path.join(dir, 'held') } : {}) } });
    const recs = []; let lb = '';
    w.stdout.setEncoding('utf8');
    w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } } });
    const log = () => { try { return fs.readFileSync(path.join(dir, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } };
    // EVERY STEP ENDS ON ITS FACT (主开发 r3297, B-3dbd): each wait below is for the state the next step needs, bounded at 30 s; the
    // first that does not come is NAMED in the result (`missed`, red in the BY ORDER leg) — the release gave them 3–6 s and went on
    // regardless, so on the loaded pod a late step changed the scene (the Stop after the tool had ended) and the run judged THAT
    let missed = null;
    const step = async (name, fn, ms = 30000) => { if (missed) return false; const got = await until(fn, ms); if (!got) missed = name; return got; };
    try {
      await step('the wrapper wrote its session file', () => fs.existsSync(path.join(dir, 's.json')));
      // the tool runs until the Stop's interrupt ends the turn (LONGER- + a release file nobody writes): the Stop lands while it runs on
      // every run, whatever the load — the release's tool ran 5 s, the window the Stop had to fall into
      w.stdin.write(ad.formatChatInput('TOOL-A LONGER- run a slow command', 'm-a').stdinPayload + '\n');
      await step('the tool_use record', () => recs.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')));
      w.stdin.write(ad.formatChatInput('MARK-B handed while the tool runs', 'm-b', { steer: true }).stdinPayload + '\n');
      await step('the handover (handed)', () => recs.some((r) => r.type === 'input_handover' && r.state === 'handed'));
      const n0 = recs.length;   // what was said before the Stop: the settle's own line is read after it
      w.stdin.write(ad.formatInterrupt() + '\n');
      // a SECOND Stop pressed while the follow-up runs (its init came, its result not yet): the window is rebuilt around it
      if (secondStop && await step('the follow-up\'s init (the second Stop\'s moment)', () => recs.filter((r) => r.type === 'system' && r.subtype === 'init').length >= 2)) w.stdin.write(ad.formatInterrupt() + '\n');
      await step('the log\'s «stop settled»', () => /stop settled/.test(log()));
      // BY ORDER (r2323), never a clock: after «stop late» in the log, the result record that carries the late mark; else the
      // line the window SETTLED at (the CLI's idle word, said after the follow-up's result; a result where the CLI says no state
      // word). The deadline only names a failure (byOrder 'DEADLINE'). `oldWait` is the release's 20 ms — the RED controls
      let byOrder = 'off';
      // THE HOLD IS PLACED AND RELEASED BY THIS RUN (主开发 r2870), never a timer: a RED control reads the release's way (20 ms after
      // the log's settle) and NEVER releases, so the held record cannot come — it misses it by the placed cause on every run; it then
      // waits, by order, for the hold's mark (the hold was reached). A run read by order releases the hold once it stands.
      if (oldWait) { await sleep(20); if (stall) await until(() => fs.existsSync(path.join(dir, 'held')), 15000); }
      else {
        if (stall && await until(() => fs.existsSync(path.join(dir, 'held')), 15000)) fs.writeFileSync(path.join(dir, 'release'), 'go');
        const lg0 = log();
        const said = /stop late: /.test(lg0) ? (r) => r.type === 'result' && r.webui_stop_late
          : /stop settled \(result\)/.test(lg0) ? (r) => r.type === 'result'
          : (r) => r.type === 'system' && r.subtype === 'session_state_changed' && r.state === 'idle';
        byOrder = (await until(() => recs.slice(n0).some(said), 15000)) ? 'read' : 'DEADLINE';
      }
      const lg = log(), d1 = lg.indexOf('interrupt: dropped'), d2 = d1 < 0 ? -1 : lg.indexOf('interrupt: dropped', d1 + 1);
      const endAt = lg.indexOf('stop late: ') >= 0 ? lg.indexOf('stop late: ') : lg.indexOf('stop settled');   // the result's judgement, else the settle after it
      return { byOrder: missed ? `MISSED ${missed}` : byOrder, results: recs.filter((r) => r.type === 'result').length, ...(stall ? { held: fs.existsSync(path.join(dir, 'held')) } : {}), recs: recs.filter((r) => r.type !== '_stdin_ack'), late: recs.filter((r) => r.type === 'result' && r.webui_stop_late).map((r) => r.webui_stop_late), requests: lines(dlv).filter((d) => d.how === 'request').length, settled: /stop settled/.test(lg), lateLines: (lg.match(/stop late: /g) || []).length, secondBeforeResult: d2 >= 0 && endAt >= 0 && d2 < endAt };
    } finally { try { w.kill('SIGKILL'); } catch { } fs.rmSync(dir, { recursive: true, force: true }); }
  };
  // RED CONTROLS: wrapper copies — one that NEVER LOOKS (the release's: the follow-up is not marked), one whose rebuilt window on a
  // second Stop DROPS the mark
  const cwSrc = read('data/bin/chat-wrapper.js');
  const MARK = "        stopping.followRun = { n: stopping.follows, answered: false };   // B-28b1: judged at its result (stopLateOf)\n";
  const CARRY = ', followRun: stopping ? stopping.followRun || null : null }; armBound(); }';
  ok(cwSrc.split(MARK).length === 2 && cwSrc.split(CARRY).length === 2, '§8 ANCHORS: the follow-up\'s mark and the rebuilt window\'s carry, each spelled once (a missing anchor builds no control: RED by name)');
  const ctlDirs = [];
  const mutantWrapper = (tag, src) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-late-ctl-' + tag + '-')); ctlDirs.push(d);
    fs.mkdirSync(path.join(d, 'data', 'bin'), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'src'), path.join(d, 'src'));
    fs.writeFileSync(path.join(d, 'data', 'bin', 'chat-wrapper.js'), src);
    return path.join(d, 'data', 'bin', 'chat-wrapper.js');
  };
  const TOK = "  const tokens = sum(result && result.usage, ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']);\n";
  ok(cwSrc.split(TOK).length === 2, '§8 ANCHOR: the follow-up\'s own tokens (its result\'s usage), spelled once');
  const LANE = path.join(REPO, 'data/bin/chat-wrapper.js'), BLIND = mutantWrapper('blind', cwSrc.replace(MARK, '')), DROPS = mutantWrapper('drops', cwSrc.replace(CARRY, ' }; armBound(); }'));
  const SINCE = mutantWrapper('since', cwSrc.replace(TOK, "  const tokens = Object.values((result && result.model_usage_since_last_result) || {}).reduce((a, v) => a + sum(v, ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']), 0);\n"));
  // every follow-up waits for ever unless its interrupt ends it (FOLLOW_MS 600 s): the ORDER is the stand-in's own steps
  const LATE = { STAND_IN_FOLLOW_REQ_MS: '12', STAND_IN_FOLLOW_HOLD_UNTIL: 'request', STAND_IN_FOLLOW_MS: '600000' };
  const ONTIME = { STAND_IN_FOLLOW_MS: '600000' };   // no request at all: the interrupt is read first and ends the follow-up
  const AGENT = { ...ONTIME, STAND_IN_FOLLOW_AGENT_TOKENS: '900' };
  // the stalls: the SAY of the record that carries the late mark · of the follow-up's result (a run's second result)
  const LATE_SAY = { text: '"webui_stop_late"', at: 1 }, SETTLE_SAY = { text: '"type":"result"', at: 2 };
  let L, A, E, O, C, T2, M2, V, G, GS, K1, K2, K3, K4;
  try {
    [L, A, E, O, C, T2, M2, V, G, GS, K1, K2, K3, K4] = (await Promise.allSettled([
      run(LANE, 'late', LATE),                                                                                  // the request left, THEN the interrupt read
      run(LANE, 'answered', { ...LATE, STAND_IN_FOLLOW_REQ_MS: '5', STAND_IN_FOLLOW_ANSWER_MS: '10', STAND_IN_FOLLOW_HOLD_UNTIL: 'answer' }),   // …the model spoke, THEN
      run(LANE, 'ran', { ...LATE, STAND_IN_FOLLOW_REQ_MS: '5', STAND_IN_FOLLOW_ANSWER_MS: '10', STAND_IN_FOLLOW_MS: '40', STAND_IN_FOLLOW_HOLD_UNTIL: 'end' }),   // …it ended, THEN
      run(LANE, 'ontime', ONTIME),                                                                              // the other way: no request at all, the interrupt read first
      run(BLIND, 'blind', LATE),                                                                                // RED CONTROL: never looks
      run(LANE, 'second', { ...LATE, STAND_IN_FOLLOW_HOLD_INTERRUPTS: '2' }, { secondStop: true }),            // a second Stop during the follow-up (held by count)
      run(DROPS, 'drops', { ...LATE, STAND_IN_FOLLOW_HOLD_INTERRUPTS: '2' }, { secondStop: true }),            // RED CONTROL: the rebuild drops the mark
      run(LANE, 'old', { ...LATE, STAND_IN_CLI_VERSION: '2.1.308' }),                                           // a CLI before the per-result count: its `usage`
      run(LANE, 'agent', AGENT),                                                                                // on time, but an agent's tokens in the since-last count
      run(SINCE, 'since', AGENT),                                                                               // RED CONTROL: the since-last count tells falsely
      run(LANE, 'stall-old', LATE, { stall: LATE_SAY, oldWait: true }),                                         // RED CONTROL: the late record's say held, the release's 20 ms read
      run(LANE, 'stall-new', LATE, { stall: LATE_SAY }),                                                        // …the same stall, read by order
      run(LANE, 'settle-old', ONTIME, { stall: SETTLE_SAY, oldWait: true }),                                    // RED CONTROL: nothing late, the follow-up's result's say held, 20 ms
      run(LANE, 'settle-new', ONTIME, { stall: SETTLE_SAY }),                                                   // …the same stall, read by order (the settle's line)
    ])).map((x) => { if (x.status === 'rejected') throw x.reason; return x.value; });   // every run ends (its finally kills its pair) before a throw
  } finally { for (const d of ctlDirs) fs.rmSync(d, { recursive: true, force: true }); }
  const rowsOf = (recs, live) => { const mm = createMessageManager('claude', 'stop-late'); if (live) { for (const r of recs) mm.processLive(r); } else mm.convertHistory(recs); return mm.messages.filter((m) => m.content?.[0]?.stopLate).map((m) => ({ status: m.status, text: m.content[0].text, late: m.content[0].stopLate })); };
  const S8 = (x) => ({ late: x.late, requests: x.requests, settled: x.settled, lateLines: x.lateLines, results: x.results, byOrder: x.byOrder, ...(x.held !== undefined ? { held: x.held } : {}) });
  // (the two RED controls read the release's way, byOrder 'off' by design; a step they MISSED is named here like every run's)
  const offOrder = Object.entries({ L, A, E, O, C, T2, M2, V, G, GS, K2, K4, K1, K3 }).filter(([k, x]) => x.byOrder !== (k === 'K1' || k === 'K3' ? 'off' : 'read')).map(([k, x]) => k + ': ' + x.byOrder);
  ok(offOrder.length === 0, '§8 BY ORDER (r2323): every step of every run came (r3297: each waited on its fact, none named missed) and every run read the record it waits for — the result carrying the late mark, else the line the window settled at (none met the deadline)', offOrder);
  ok(K2.held === true && K2.settled && K2.lateLines === 1 && K2.late.length === 1 && K2.late[0].how === 'billed', '§8 THE RECORD BY ORDER (r2320): the SAY of the record that carries the late fact HELD (a stall placed between the logged fact and the said record) — the run still reads the fact off the record', S8(K2));
  ok(K1.held === true && K1.settled && K1.lateLines === 1 && K1.late.length === 0, '§8 RED CONTROL: the same stall read the release\'s way (20 ms after the log\'s settle) misses the record — «late: [] · lateLines: 1», the hosted gates\' symptom made at will', S8(K1));
  ok(K4.held === true && K4.settled && K4.lateLines === 0 && K4.late.length === 0 && K4.results >= 2, '§8 THE SETTLE\'S LINE BY ORDER (r2323): nothing late, the SAY of the follow-up\'s result HELD — the run reads past it (the CLI\'s idle word comes after it) before «nothing late» is judged', S8(K4));
  ok(K3.held === true && K3.settled && K3.lateLines === 0 && K3.results === 1, '§8 RED CONTROL: the same stall read the release\'s way — «nothing late» judged before the follow-up\'s result was read', S8(K3));
  console.log(`    §8 agent tokens only — ${G.late.length} told (the since-last copy: ${GS.late.length})`);
  console.log(`    §8 leaked follow-ups (told) — late ${L.requests} (${L.late.length}) · answered ${A.requests} (${A.late.length}) · ran ${E.requests} (${E.late.length}) · on time ${O.requests} (${O.late.length}) · blind ${C.requests} (${C.late.length}) · second Stop ${T2.requests} (${T2.late.length}) · drops ${M2.requests} (${M2.late.length}) · 2.1.308 ${V.requests} (${V.late.length})`);
  ok(L.settled && L.requests === 1 && L.late.length === 1 && L.late[0].follow === 1 && L.late[0].how === 'billed' && L.late[0].cut === true && L.late[0].tokens > 0 && L.lateLines === 1,
    '§8 the follow-up\'s request LEFT, THEN the CLI read the second interrupt (the stall placed by order) ⇒ the stop-late fact rides ITS result (billed, cut off), one log line', S8(L));
  ok(A.requests === 1 && A.late.length === 1 && A.late[0].how === 'answered' && A.late[0].cut === true, '§8 …the model answered before the interrupt was read ⇒ the fact says answered (cut off)', S8(A));
  ok(E.requests === 1 && E.late.length === 1 && E.late[0].how === 'answered' && E.late[0].cut === false, '§8 …the follow-up RAN TO ITS END before the interrupt was read ⇒ the fact says so (not cut off)', S8(E));
  ok(O.settled && O.requests === 0 && O.late.length === 0 && O.lateLines === 0, '§8 the other way (the follow-up sends no request at all; the interrupt is read first and ends it): nothing reached the model and NOTHING is told — no false alarm', S8(O));
  ok(C.settled && C.requests === 1 && C.late.length === 0 && C.lateLines === 0, '§8 RED CONTROL: the wrapper that never looks (the release\'s) — the same leaked request, and it reports a clean stop', S8(C));
  ok(T2.settled && T2.secondBeforeResult && T2.requests === 1 && T2.late.length === 1 && T2.late[0].how === 'billed', '§8 a SECOND Stop pressed while the follow-up runs (the wrapper saw it before the result — the stand-in held by count) rebuilds the window — the follow-up is still judged at its result and told', { ...S8(T2), secondBeforeResult: T2.secondBeforeResult });
  ok(M2.secondBeforeResult && M2.requests === 1 && M2.late.length === 0, '§8 RED CONTROL: a rebuild that drops the follow-up\'s mark — the second Stop (seen before the result) loses the fact', { ...S8(M2), secondBeforeResult: M2.secondBeforeResult });
  ok(V.requests === 1 && V.late.length === 1 && V.late[0].how === 'billed' && V.late[0].tokens > 0, '§8 a CLI before the per-result count (2.1.308): its result\'s own usage says it, as on every version', S8(V));
  ok(G.requests === 0 && G.late.length === 0 && G.lateLines === 0, '§8 an agent\'s tokens in the since-last count (the follow-up itself sent nothing) tell NOTHING — the follow-up\'s own usage is empty', S8(G));
  ok(GS.requests === 0 && GS.late.length === 1, '§8 RED CONTROL: a wrapper that reads the since-last count tells «billed» for a follow-up that sent nothing', S8(GS));
  const rL = rowsOf(L.recs, true), rR = rowsOf(L.recs, false);
  ok(rL.length === 1 && rL[0].status === 'interrupted' && rL[0].text === 'Interrupted' && rL[0].late.cut === true && JSON.stringify(rL) === JSON.stringify(rR),
    '§8 the page says it ONCE, in that Stop\'s own «Interrupted» line — live and after a reload the same (the fact rides the turn\'s record)', { live: rL, reload: rR });
  const rE = rowsOf(E.recs, false);
  ok(rE.length === 1 && rE[0].status === 'interrupted' && rE[0].late.cut === false && rE[0].late.own === true && rE[0].text === '', '§8 …a follow-up that ran to its end gets the line as a row of its own (no «Interrupted» to stand beside) — the stored row holds NO words: the renderer says them in the reader\'s language', rE);
  // the result shapes no recording shows, judged on the record alone: no subtype ⇒ its own row (it draws none); success with
  // is_error ⇒ ONE row, the error row's (never the own row beside it)
  const lone = (rec) => rowsOf([{ type: 'result', session_id: 'stop-late', ...rec }], false);
  // the turn's meta (system/turn_duration) rides the follow-up's own answer, never the Stop's own late row after it
  const mmT = createMessageManager('claude', 'stop-late-meta');
  mmT.convertHistory([{ type: 'assistant', message: { id: 'msg_t1', role: 'assistant', content: [{ type: 'text', text: 'the answer' }] } }, { type: 'result', subtype: 'success', is_error: false, session_id: 'x', webui_stop_late: { follow: 1, how: 'answered', cut: false } }, { type: 'system', subtype: 'turn_duration', duration_ms: 1234, message_count: 2 }]);
  const metaOn = mmT.messages.filter((m) => m.meta && m.meta.turn).map((m) => (m.content?.[0]?.stopLate ? 'late-row' : m.role));
  ok(JSON.stringify(metaOn) === JSON.stringify(['assistant']), '§8 the turn\'s meta (its duration) rides the follow-up\'s answer, never the Stop\'s own late row — the skip reads the mark on the record', metaOn);
  ok(read('src/lib/chat-renderers.js').includes("if (late && late.own) { const lel = this.appendSystem(stopLateLine(late));"), '§8 WIRING: the renderer draws the own row\'s words keyed on the record\'s `own` mark (the stored row holds none)');
  const noSub = lone({ is_error: false, webui_stop_late: { follow: 1, how: 'billed', cut: true, tokens: 9 } }), errOk = lone({ subtype: 'success', is_error: true, webui_stop_late: { follow: 1, how: 'answered', cut: false } });
  ok(noSub.length === 1 && noSub[0].late.own === true && noSub[0].text === '' && errOk.length === 1 && !errOk[0].late.own && errOk[0].status === 'error', '§8 a result with NO subtype carrying the fact gets its own row (it draws none); a success with is_error says it once, on its error row', { noSub, errOk });
  ok(rowsOf(O.recs, false).length === 0 && rowsOf(C.recs, false).length === 0, '§8 …and nothing is drawn where nothing was told');
  const CR = read('src/lib/chat-renderers.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const CUT = 'The Stop arrived after the message handed in earlier had already gone to the model — it was cut off at once, and it may be billed';
  const RAN = 'The Stop arrived after the message handed in earlier had already gone to the model — it was answered before the Stop reached it, and it is billed';
  ok(CR.includes(`t('${CUT}')`) && CR.includes(`t('${RAN}')`) && CR.includes("if (late) { const line = document.createElement('div'); line.className = 'chat-system chat-stop-late'; line.textContent = stopLateLine(late); el.appendChild(line); }"),
    '§8 WIRING: the renderer says the fact through t() beside «Interrupted» (or as its own line) — never a toast, never a For-you item');
  ok([ZH, JA].every((D) => D.includes(`  "${CUT}": "`) && D.includes(`  "${RAN}": "`)), '§8 …in zh and ja');
  ok(cwSrc.includes("msg.message?.model !== '<synthetic>') stopping.followRun.answered = true;") && cwSrc.includes("const tokens = sum(result && result.usage, ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']);") && !/stopLateOf[\s\S]{0,1200}model_usage_since_last_result\s*;/.test(cwSrc),
    '§8 WIRING: the follow-up\'s OWN tokens only — its result\'s usage (a background agent\'s calls are in the since-last count, never in it), and a <synthetic> record is no answer');
});
await guard('§8 (B-fcd6) once this CLI has named a frame, a follow-up init without the names took NONE — the rider the model read lands', () => {
  const w = read('data/bin/chat-wrapper.js');
  const cut = (from, to, name) => {
    const a = w.indexOf(from), b = a < 0 ? -1 : w.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error(`the anchor of the control «${name}» is not in the source`);
    return w.slice(a, b);
  };
  const SRC = cut('let initNamesSeen = false;', '/** EVERY FRAME A STOP TOUCHED SETTLES ONCE', 'the wrapper slice');
  const build = (src) => new Function('stopping', 'copies', 'record', 'settleCopies', 'log', src + '\nreturn { initNames, noteInitNames, noteFollowUpNames, noteWindowRecord, landRiding };');
  const swap = (src, from, to, name) => { if (!src.includes(from)) throw new Error(`the anchor of the control «${name}» is not in the source`); return src.replace(from, to); };
  // THE MEASUREMENT FIRST — the real CLI, recorded through the real wrapper (lane claude-steer-inject r5): the init of a turn that
  // took a stamped frame names it; the init of a turn that took none leaves the field OUT (never []); read IN ORDER, as the
  // wrapper reads them, an omission before this process saw a naming init cannot say (null), after it says «none» ([])
  for (const v of ['2.1.308-stamped', '2.1.312-stamped', '2.1.312-frames']) {
    const inits = read(`scripts/fixtures/claude-cli/${v}.jsonl`).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.type === 'system' && r.subtype === 'init');
    const f = build(SRC)({ named: new Set() }, new Map(), () => { }, () => { }, () => { });
    const read2 = [], seenAt = [];
    let seen = false;
    for (const r of inits) { read2.push(S(f.initNames(r, seen))); f.noteInitNames(r); if (Array.isArray(r.user_message_uuids) && r.user_message_uuids.length) seen = true; seenAt.push(seen); }
    const first = inits.findIndex((r) => Array.isArray(r.user_message_uuids));
    const want = inits.map((r, i) => Array.isArray(r.user_message_uuids) ? S(r.user_message_uuids) : (first >= 0 && i > first ? '[]' : 'null'));
    // the reader's should: a recording that lost its naming init would make every expected value «null» and still agree — the
    // stamped recordings MUST witness and then omit (the post-witness «[]» half on real data); the frames recording names nothing
    const proves = v.endsWith('-stamped') ? first >= 0 && read2.slice(first + 1).includes('[]') : first === -1 && read2.every((x) => x === 'null');
    ok(proves && inits.length >= 2 && inits.every((r) => !Array.isArray(r.user_message_uuids) || r.user_message_uuids.length > 0) && S(read2) === S(want),
      `${v} (the real CLI, recorded): no init writes an empty list; read in order, an omission before the first naming init cannot say, after it says «none» (${read2.join(' ')})`, { read2, want });
  }
  const PURE = [[{}, false, 'null'], [{}, true, '[]'], [{ user_message_uuids: ['u-1', 2] }, false, '["u-1","2"]'], [{ user_message_uuids: [] }, false, '[]'], [{ claude_code_version: '2.1.312' }, false, 'null']];
  const helpers = build(SRC)({ named: new Set() }, new Map(), () => { }, () => { }, () => { });
  const pureBad = PURE.filter(([m, seen, want]) => S(helpers.initNames(m, seen)) !== want);
  ok(!pureBad.length, 'PURE initNames(init, witnessed): a list is read as written; no list ⇒ [] only with the witness, else null — a version alone proves nothing', pureBad);
  // the Stop window's judgment, the REAL helpers over the wrapper's state (stubbed): rider m-b (its copy stamped u-b) rode the
  // tool result at Stop, the CLI started follow-up(s) the window interrupted on the init, the window settles
  const judge = (src, inits, { witness = true, witnessWith = ['u-a'], records = [] } = {}) => {
    const recs = [];
    const stopping = { riding: ['m-b'], follows: inits.length, namesSaid: false, named: new Set(), kept: [] };
    const f = build(src)(stopping, new Map([['m-b', { cliUuid: 'u-b' }]]), (type, o) => recs.push({ type, ...o }), () => { }, () => { });
    if (witness) f.noteInitNames({ type: 'system', subtype: 'init', claude_code_version: '2.1.312', user_message_uuids: witnessWith });   // the session's first turn: a stamped frame, named
    for (const r of records) f.noteWindowRecord(r);   // records the CLI wrote on stdout inside the Stop window
    for (const m of inits) { f.noteInitNames(m); f.noteFollowUpNames(m); }
    f.landRiding('idle');
    return recs.filter((r) => r.type === 'input_handover' && r.state === 'landed').flatMap((r) => r.msg_ids);
  };
  const TASK = { type: 'system', subtype: 'init', claude_code_version: '2.1.312' };   // a background task-notification follow-up: it took no stamped frame
  ok(S(judge(SRC, [TASK])) === '["m-b"]', 'the verifier\'s case (r4, pre-existing): this CLI named a frame before, and the only follow-up\'s init leaves the names out ⇒ the rider the model read LANDS (it was drawn «Unread when stopped»)', judge(SRC, [TASK]));
  ok(S(judge(SRC, [TASK], { witness: false })) === '[]', 'a CLI that never named a frame (scripts/fixtures/claude-race-cli.cjs: 2.1.312 by its word, no names — test-claude-steer-chrome ⑮ «riding is not landed») ⇒ the rider stays kept');
  ok(S(judge(SRC, [{ ...TASK, user_message_uuids: ['u-b'] }])) === '[]', 'a follow-up that NAMES the rider (the CLI still held it) ⇒ kept, as before');
  ok(S(judge(SRC, [TASK, { ...TASK, user_message_uuids: ['u-b'] }])) === '[]', 'two follow-ups, one naming none and one naming the rider ⇒ kept (every follow-up\'s names are judged together)');
  ok(S(judge(SRC, [TASK], { witnessWith: [] })) === '[]', 'the reader\'s should: an init with an EMPTY list is no witness — the follow-up that names nothing keeps the rider');
  ok(S(judge(SRC, [TASK], { records: [{ type: 'user', uuid: 'u-b', message: { role: 'user', content: '[Request interrupted by user]' } }] })) === '[]' && S(judge(SRC, [TASK], { records: [{ type: 'attachment', attachment: { type: 'queued_command', source_uuid: 'u-b' } }] })) === '[]',
    '主开发 11:12Z, the row\'s condition (1): a user record or an attachment the CLI writes inside the Stop window carrying the rider\'s stamp keeps it, whatever the follow-up\'s init omitted');
  // RED CONTROLS, each anchored on a line of the slice (a missing anchor fails by name)
  const r4 = swap(SRC, '  return seen ? [] : null;\n', '  return null;\n', 'the r4 rule');
  ok(S(judge(r4, [TASK])) === '[]', 'RED CONTROL the midturn-order r4 rule (no list ⇒ unknown) leaves the read rider kept');
  const noWitness = swap(SRC, '  return seen ? [] : null;\n', '  return [];\n', 'no witness');
  ok(S(judge(noWitness, [TASK], { witness: false })) === '["m-b"]', 'RED CONTROL a rule without the witness (every omission = none — this commit\'s first cut, keyed on the version) calls the race CLI\'s still-held rider read');
  const emptyWitness = swap(SRC, '  if (Array.isArray(msg.user_message_uuids) && msg.user_message_uuids.length) initNamesSeen = true;\n', '  if (Array.isArray(msg.user_message_uuids)) initNamesSeen = true;\n', 'an empty list witnesses');
  ok(S(judge(emptyWitness, [TASK], { witnessWith: [] })) === '["m-b"]', 'RED CONTROL a witness that takes an EMPTY list lands the rider');
  const blindWindow = swap(SRC, "  for (const u of [msg.uuid, msg.attachment && msg.attachment.source_uuid]) if (typeof u === 'string' && u) stopping.named.add(u);\n", '', 'the window records');
  ok(S(judge(blindWindow, [TASK], { records: [{ type: 'user', uuid: 'u-b' }] })) === '["m-b"]', 'RED CONTROL a wrapper blind to the window\'s records lands a rider the CLI wrote it still held');
  // THE WIRING: every init line feeds the witness; the Stop window's follow-up branch asks noteFollowUpNames(msg) — the ONE
  // writer of namesSaid (dropHeldForStop only carries the flag over into a second Stop's window)
  const branch = cut('      if (stopping && stopping.held > 0) {', '      } else if (cliOwesTurn) {', 'the follow-up branch');
  ok(/\n\s+noteFollowUpNames\(msg\);/.test(branch) && (w.match(/noteFollowUpNames\(msg\);/g) || []).length === 1 && (w.match(/stopping\.namesSaid = true/g) || []).length === 1
    && (w.match(/namesSaid = /g) || []).length === 1 && (w.match(/if \(msg\.type === 'system' && msg\.subtype === 'init'\) noteInitNames\(msg\);/g) || []).length === 1
    && w.includes("    if (stopping && (msg.type === 'user' || msg.type === 'attachment')) noteWindowRecord(msg);") && /function startChild\(\) \{\n  reconnectTimer = null;\n  if \(!OFFSET_MODE\) initNamesSeen = false;/.test(w),
    'the wiring: every init feeds the witness; the follow-up branch (inside the Stop window, before the owed-turn branch) calls noteFollowUpNames(msg), the ONE writer of namesSaid');
});
// ── §8b THE STOP REACHES THE CLI FIRST (主开发 r5172; test-claude-steer-chrome §A ③'s hosted red, rows B-1217 / B-28b1) — and
// law 6 (r5357): NOTHING BETWEEN A PERSON's STOP AND ITS INTERRUPT WAITS ON A DISK. 2.369.420's wrapper wrote the handed records
// (renamed after an fsync) inside the Stop's drop, before the interrupt went on; the drop also logged its own line (a stat and an
// append), unlinked the dropped frames' kept files, and a Stop line that asked a receipt had it written first. PLACED, each: the
// wrapper's FIRST such call after the run arms the hold waits until THIS RUN releases it (never a clock) — the hold's mark names the
// file it held: the WITNESS that the hold was in force (r5135 law 1). The run releases on the first of two facts: the CLI READ the
// interrupt (the stand-in's own capture of its stdin), or the tool's turn went on without it and its result CARRIED the handed frame
// to the model (the stand-in's record) — the B-28b1 law's red. Each call's RED CONTROL is a copy with that call where it stood.
console.log('§8b the Stop reaches the CLI before any of its road\'s file calls: the REAL chat-wrapper over the stand-in CLI, each call HELD');
await guard('§8b', async () => {
  const { spawn } = await import('node:child_process');
  const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(5); } return !!fn(); };
  const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
  const own = [];
  process.on('exit', () => { for (const d of own) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });   // this run's folders
  const holdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-sync-hold-'));
  process.on('exit', () => { try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { } });   // the hold's folder is the run's own
  const HOLD = path.join(holdDir, 'hold-call.cjs');
  // THE HOLD: SYNC_HOLD_KIND names the one call it takes — 'handed' (the fsync of a handed records file), 'droplog' (an append to the
  // wrapper's log of the Stop drop's own line), 'kept' (an unlink inside the kept-files folder, <buf>.img), 'receipt' (a write of the
  // receipts file)
  fs.writeFileSync(HOLD, [
    "'use strict';",
    "const fs = require('fs'), path = require('path'), E = process.env, ARM = E.SYNC_HOLD_ARM || '', MARK = E.SYNC_HOLD_MARK || '', REL = E.SYNC_HOLD_RELEASE || '', KIND = E.SYNC_HOLD_KIND || 'handed';",
    "const paths = new Map(), open = fs.openSync;",
    "fs.openSync = function (p, ...a) { const fd = open.call(fs, p, ...a); try { paths.set(fd, String(p)); } catch (e) { } return fd; };",
    "let done = false, chunk = false;",
    "if (E.SYNC_HOLD_CHUNK) { const si = process.stdin, emit = si.emit; si.emit = function (ev, d, ...a) { if (ev === 'data') { const t = String(d); if (t.includes('\"subtype\":\"interrupt\"') && t.includes(E.SYNC_HOLD_CHUNK)) chunk = true; } return emit.call(this, ev, d, ...a); }; }   // the WITNESS: the Stop and the later frame in ONE stdin chunk",
    "const hold = (file) => {",
    "  done = true;",
    "  try { fs.writeFileSync(MARK, JSON.stringify({ file: String(file || ''), chunk })); } catch (e) { }",
    "  const sab = new Int32Array(new SharedArrayBuffer(4)), end = Date.now() + 30000;   // the run releases it; 30 s only names a run that never did",
    "  while (!fs.existsSync(REL) && Date.now() < end) Atomics.wait(sab, 0, 0, 10);",
    "};",
    "const armed = () => !done && ARM && fs.existsSync(ARM);",
    "const realSync = fs.fsyncSync, realAppend = fs.appendFileSync, realUnlink = fs.unlinkSync, realWrite = fs.writeFileSync;",
    "fs.fsyncSync = function (fd) { if (KIND === 'handed' && armed() && /[\\\\/]handed[\\\\/]/.test(paths.get(fd) || '')) hold(paths.get(fd)); return realSync.call(fs, fd); };",
    "fs.appendFileSync = function (f, data, ...a) { if (KIND === 'droplog' && armed() && /chat-wrapper\\.log$/.test(String(f)) && /interrupt: dropped/.test(String(data))) hold(f); return realAppend.call(fs, f, data, ...a); };",
    "fs.unlinkSync = function (f, ...a) { if (KIND === 'kept' && armed() && /\\.img$/.test(path.dirname(String(f)))) hold(f); return realUnlink.call(fs, f, ...a); };",
    "fs.writeFileSync = function (f, ...a) { if (KIND === 'receipt' && armed() && /\\.receipts$/.test(String(f))) hold(f); return realWrite.call(fs, f, ...a); };",
  ].join('\n') + '\n');
  const start = (wrapperPath, tag, env = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-sync-' + tag + '-')); own.push(dir);
    const f = { dir, dlv: path.join(dir, 'delivered.jsonl'), cap: path.join(dir, 'cli-stdin.jsonl'), arm: path.join(dir, 'arm'), mark: path.join(dir, 'held'), rel: path.join(dir, 'release'), log: path.join(dir, 'chat-wrapper.log') };
    const w = spawn(process.execPath, ['-r', HOLD, wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STAND_IN_DELIVERED: f.dlv, STUB_CAPTURE: f.cap, STAND_IN_LONG_MS: '1500', VIBESPACE_SKIP_AGENT_HOOKS: '1', SYNC_HOLD_ARM: f.arm, SYNC_HOLD_MARK: f.mark, SYNC_HOLD_RELEASE: f.rel, ...env } });
    const recs = []; let lb = '';
    w.stdout.setEncoding('utf8');
    w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } } });
    const out = { missed: null };
    const step = async (name, fn, ms = 30000) => { if (out.missed) return false; const got = await until(fn, ms); if (!got) out.missed = name; return got; };
    const interrupts = () => (fs.existsSync(f.cap) ? fs.readFileSync(f.cap, 'utf8').split('\n').filter((l) => /"subtype":"interrupt"/.test(l)).length : 0);
    const logText = () => { try { return fs.readFileSync(f.log, 'utf8'); } catch { return ''; } };
    const heldFile = () => { try { return JSON.parse(fs.readFileSync(f.mark, 'utf8')).file; } catch { return null; } };
    return { w, f, recs, out, step, interrupts, logText, heldFile };
  };
  // THE FIRST STOP's ROAD: a tool turn, a frame handed while it runs (and, for 'kept', a long frame HELD in the queue: its kept file
  // goes when the Stop drops it), then the Stop (for 'receipt' a Stop line that asks a receipt), the chosen call held
  const scene = async (wrapperPath, tag, kind) => {
    const S = start(wrapperPath, tag, { SYNC_HOLD_KIND: kind }), { w, f, recs, out, step } = S;
    try {
      await step('the wrapper wrote its session file', () => fs.existsSync(path.join(f.dir, 's.json')));
      w.stdin.write(ad.formatChatInput('TOOL-A LONG- run a slow command', 'm-a').stdinPayload + '\n');
      await step('the tool_use record', () => recs.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')));
      w.stdin.write(ad.formatChatInput('MARK-B handed while the tool runs', 'm-b', { steer: true }).stdinPayload + '\n');
      await step('the handover (handed)', () => recs.some((r) => r.type === 'input_handover' && r.state === 'handed'));
      if (kind === 'kept') {
        w.stdin.write(ad.formatChatInput('MARK-C held in the queue ' + 'x'.repeat(9000), 'm-c').stdinPayload + '\n');   // past the kept bound (8 KiB): a file of its own
        await step('the held frame\'s kept file', () => fs.existsSync(path.join(f.dir, 's.img')) && fs.readdirSync(path.join(f.dir, 's.img')).length > 0, 15000);
      }
      const d0 = lines(f.dlv).length, n0 = recs.length;
      fs.writeFileSync(f.arm, 'armed');   // the hold takes the FIRST such call from here on: the Stop's own
      const stopLine = kind === 'receipt' ? JSON.stringify({ ...JSON.parse(ad.formatInterrupt()), webui_receipt: true }) : ad.formatInterrupt();
      w.stdin.write(stopLine + '\n');
      if (await step('the hold reached (the wrapper inside the call)', () => fs.existsSync(f.mark), 15000)) {
        out.heldFile = S.heldFile();
        const carried = () => lines(f.dlv).slice(d0).some((x) => x.how === 'tool_result' || x.how === 'request');
        if (!(await until(() => S.interrupts() > 0 || carried(), 10000))) out.missed = out.missed || 'neither the CLI\'s read of the interrupt nor a carried frame within 10 s of the hold';
        out.interruptWhileHeld = S.interrupts() > 0; out.carriedWhileHeld = carried();
        fs.writeFileSync(f.rel, 'go');
      }
      await step('the CLI\'s answer to the interrupt, said', () => recs.slice(n0).some((r) => r.type === 'control_response'), 15000);
      out.carried = lines(f.dlv).slice(d0).filter((x) => x.how === 'tool_result' || x.how === 'request').map((x) => x.how + ':' + String(x.text || '').slice(0, 12));
      if (kind === 'kept') out.keptLeft = fs.readdirSync(path.join(f.dir, 's.img')).length;   // the owed unlink was MADE, after the forward
      if (kind === 'receipt') out.receipt = fs.existsSync(path.join(f.dir, 's.receipts')) && /_stdin_ack/.test(fs.readFileSync(path.join(f.dir, 's.receipts'), 'utf8'));
      if (kind === 'droplog') out.dropLine = /interrupt: dropped/.test(S.logText());
    } finally { try { w.kill('SIGKILL'); } catch { } }   // the wrapper this run started (its stand-in child ends with its stdin)
    return out;
  };
  // THE RED COPIES: each call where 2.369.420 had it, in a copy — the drop and its records' write before the forward ('handed'); the
  // drop's own log line inside the drop; the kept files' unlink inside the drop; the Stop's receipt before the drop
  const cwSrc = read('data/bin/chat-wrapper.js');
  const FIRST = "          handedAfterStop = true;\n          try { dropHeldForStop(); } finally { handedAfterStop = false; }\n          sendChild(line);\n";
  const LOGL = "  owedOnStop(() => log(dropWords));", KEPTL = "  owedOnStop(() => KC.dropFiles(KEPT_DIR, unnamedNow(names)));", RCPT = "if (receipt) writeReceipt(ack, stop);";
  ok([FIRST, LOGL, KEPTL, RCPT].every((a) => cwSrc.split(a).length === 2), '§8b ANCHORS: the Stop\'s branch, the drop\'s owed log line, the owed unlink, the owed receipt — each spelled once (a missing anchor builds no control: RED by name)');
  const copyOf = (tag, src) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-stop-sync-ctl-' + tag + '-')); own.push(d);
    fs.mkdirSync(path.join(d, 'data', 'bin'), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'src'), path.join(d, 'src'));
    fs.writeFileSync(path.join(d, 'data', 'bin', 'chat-wrapper.js'), src);
    return path.join(d, 'data', 'bin', 'chat-wrapper.js');
  };
  const RED = {
    handed: copyOf('handed', anchored(cwSrc, FIRST, "          dropHeldForStop();\n          if (handedDue) { handedDue = false; writeRecords(); }\n          sendChild(line);\n", 'the Stop\'s branch')),
    droplog: copyOf('droplog', anchored(cwSrc, LOGL, '  log(dropWords);', 'the drop\'s log line')),
    kept: copyOf('kept', anchored(cwSrc, KEPTL, '  KC.dropFiles(KEPT_DIR, names);', 'the kept files\' unlink')),
    receipt: copyOf('receipt', anchored(cwSrc, RCPT, 'if (receipt) writeReceipt(ack);', 'the Stop\'s receipt')),
  };
  const FILE = { handed: /[\\/]handed[\\/]/, droplog: /chat-wrapper\.log$/, kept: /\.img[\\/]/, receipt: /\.receipts$/ };
  const WORDS = { handed: 'the handed records\' sync', droplog: 'the drop\'s own log line', kept: 'the dropped frame\'s kept file\'s unlink', receipt: 'the receipt the Stop line asked for' };
  // THE SCENES RUN AT ONCE (each its own wrapper, stand-in, folder and hold — they share nothing but the clock they never read): the
  // section's time is its longest scene's, not their sum
  const KINDS = ['handed', 'droplog', 'kept', 'receipt'];
  const firstRoad = Promise.all(KINDS.flatMap((kind) => [scene(path.join(REPO, 'data/bin/chat-wrapper.js'), 'tip-' + kind, kind), scene(RED[kind], 'release-' + kind, kind)]));
  firstRoad.catch(() => { });   // handled where it is awaited (below): never an unhandled rejection while the second road runs
  const judgeFirst = (runs) => { for (const [i, kind] of KINDS.entries()) {
    const cur = runs[2 * i], red = runs[2 * i + 1];
    ok(!cur.missed && FILE[kind].test(String(cur.heldFile || '')), `§8b WITNESS (${kind}): the hold was in force on the Stop's own call — ${WORDS[kind]}, the file it held named`, cur);
    ok(!cur.missed && cur.interruptWhileHeld === true && cur.carriedWhileHeld === false && cur.carried.length === 0
      && (kind !== 'kept' || cur.keptLeft === 0) && (kind !== 'receipt' || cur.receipt === true) && (kind !== 'droplog' || cur.dropLine === true),
      `§8b THE STOP REACHES THE CLI FIRST (${kind}): with ${WORDS[kind]} held, the CLI read the interrupt and nothing carried the handed frame to the model — and the owed call was MADE after it`, cur);
    ok(!red.missed && FILE[kind].test(String(red.heldFile || '')) && red.interruptWhileHeld === false && red.carriedWhileHeld === true,
      `§8b RED CONTROL (${kind}: ${WORDS[kind]} where 2.369.420 had it, in a copy): held there, the interrupt does NOT reach the CLI and the tool's result carries the handed frame to the model before the Stop`, red);
  } };
  // THE SAME CHUNK (主开发 r5457 (1)): a frame HELD with a picture, then ONE stdin write holding the Stop AND a new held frame with the
  // SAME picture (under PIPE_BUF: one read, one batch). The Stop's drop owes the first frame's kept file's unlink; the later line's
  // keeper finds the file there and writes nothing; the owed unlink runs at the batch's end. The hold takes the drop's own log line,
  // owed AFTER the unlink: there the unlink has run. WITNESS: the preload saw the Stop and the new frame in ONE stdin chunk. RED: a
  // copy whose owed unlink is not filtered again (60320367c's line) removes the file the new copy names.
  const PIC = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
  const picFrame = (text, id) => ad.formatChatInput(JSON.stringify({ type: 'user', message: { role: 'user', content: [PIC, { type: 'text', text }] } }), id).stdinPayload;
  const sameChunk = async (wrapperPath, tag) => {
    const later = 'm-c2-' + tag, S = start(wrapperPath, tag, { SYNC_HOLD_KIND: 'droplog', SYNC_HOLD_CHUNK: later }), { w, f, recs, out, step } = S;
    const img = path.join(f.dir, 's.img');
    try {
      await step('the wrapper wrote its session file', () => fs.existsSync(path.join(f.dir, 's.json')));
      w.stdin.write(ad.formatChatInput('TOOL-A LONG- run a slow command', 'm-a').stdinPayload + '\n');
      await step('the tool_use record', () => recs.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')));
      w.stdin.write(picFrame('MARK-C held with a picture', 'm-c') + '\n');
      await step('the held frame\'s kept picture', () => fs.existsSync(img) && fs.readdirSync(img).length > 0, 15000);
      out.kept = fs.existsSync(img) ? fs.readdirSync(img) : [];
      fs.writeFileSync(f.arm, 'armed');   // the hold takes the drop's own log line, the first after the arm
      const both = ad.formatInterrupt() + '\n' + picFrame('MARK-C2 held after the Stop, the same picture', later) + '\n';
      out.bytes = Buffer.byteLength(both);
      w.stdin.write(both);   // ONE write under PIPE_BUF (4096 bytes): the pipe hands it over whole
      if (await step('the hold reached (the drop\'s line, owed after the unlink)', () => fs.existsSync(f.mark), 15000)) {
        let m = {}; try { m = JSON.parse(fs.readFileSync(f.mark, 'utf8')); } catch { }
        out.heldFile = m.file || null; out.oneChunk = m.chunk === true;
        out.standsAtHold = out.kept.length === 1 && fs.existsSync(path.join(img, out.kept[0]));
        fs.writeFileSync(f.rel, 'go');
      }
      await step('the later frame held, said', () => recs.some((r) => r.type === 'queued_input' && r.msg_id === later), 15000);
    } finally { try { w.kill('SIGKILL'); } catch { } }
    return out;
  };
  const RED3 = copyOf('chunk', anchored(cwSrc, KEPTL, '  owedOnStop(() => KC.dropFiles(KEPT_DIR, names));', 'the owed unlink filtered again'));   // stale-pins: kept — 60320367c's line, the red copy's planted text (not a pin)
  const chunkRoad = Promise.all([sameChunk(path.join(REPO, 'data/bin/chat-wrapper.js'), 'tip-chunk'), sameChunk(RED3, 'unfiltered-chunk')]);
  chunkRoad.catch(() => { });   // handled where it is awaited (below)
  // THE SECOND STOP's ROAD (holdSecondStop): a Stop pressed while the window is open and the CLI's turn has ended — the follow-up's
  // prompt hook runs (STAND_IN_PROMPT_HOOK_MS) — is HELD, and goes to the CLI on the follow-up's init. Its drop runs under the same rule:
  // with the hold on its own drop line (the first after the arm), the wrapper's log ALREADY says the Stop is held when the hold is
  // reached (that line is the held road's own, written after the drop) — the drop's line came at the batch's end. Released, the held
  // Stop reaches the CLI on the follow-up's init. RED: a copy whose second road drops outside the rule — its line inside the drop.
  // (r5457 (3)) This leg is NOT «no file call before the held interrupt»: the second road's own log line («a second Stop inside the
  // window: held») is still made at once, and that is right — that batch forwards no interrupt (it is held, and delivered on the
  // follow-up's init), so nothing of it stands between a Stop and its forward.
  const SECOND = "  handedAfterStop = true;   // r5172: the second Stop's road the same — its records' synced write is owed to the batch's end\n  try { dropHeldForStop(); } finally { handedAfterStop = false; }\n  stopping.heldInterrupt = line;\n";
  ok(cwSrc.split(SECOND).length === 2, '§8b ANCHOR: the second Stop\'s drop under the rule, spelled once');
  const RED2 = copyOf('second', anchored(cwSrc, SECOND, "  dropHeldForStop();\n  stopping.heldInterrupt = line;\n", 'the second Stop\'s drop'));
  const second = async (wrapperPath, tag) => {
    const S = start(wrapperPath, tag, { SYNC_HOLD_KIND: 'droplog', STAND_IN_PROMPT_HOOK_MS: '1500', CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1' }), { w, f, recs, out, step } = S;
    try {
      await step('the wrapper wrote its session file', () => fs.existsSync(path.join(f.dir, 's.json')));
      w.stdin.write(ad.formatChatInput('TOOL-A LONG- run a slow command', 'm-a').stdinPayload + '\n');
      await step('the tool_use record', () => recs.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')));
      w.stdin.write(ad.formatChatInput('MARK-B handed while the tool runs', 'm-b', { steer: true }).stdinPayload + '\n');
      await step('the handover (handed)', () => recs.some((r) => r.type === 'input_handover' && r.state === 'handed'));
      const nStop = recs.length;
      w.stdin.write(ad.formatInterrupt() + '\n');   // the FIRST Stop: free
      // the first turn's interrupted RESULT: the window is open and the CLI's turn has ended; the follow-up's prompt hook (1.5 s) runs
      // before its init — the second Stop's road (the wrapper says no hook record: it is the CLI's own phase)
      await step('the first turn\'s interrupted result (the window open, the CLI\'s turn ended)', () => recs.slice(nStop).some((r) => r.type === 'result'), 15000);
      fs.writeFileSync(f.arm, 'armed');
      w.stdin.write(ad.formatInterrupt() + '\n');   // the SECOND Stop, inside the window
      if (await step('the hold reached (the second Stop\'s drop line)', () => fs.existsSync(f.mark), 15000)) {
        out.heldFile = S.heldFile();
        out.heldSaidFirst = /a second Stop inside the window: held/.test(S.logText());
        fs.writeFileSync(f.rel, 'go');
      }
      await step('the held Stop delivered to the CLI (its second interrupt read)', () => S.interrupts() >= 2, 15000);
      out.interrupts = S.interrupts();
      out.heldRoad = /a second Stop inside the window: held/.test(S.logText());   // the second Stop took the held road
    } finally { try { w.kill('SIGKILL'); } catch { } }
    return out;
  };
  const [runs, [cur2, red2], [cur3, red3]] = await Promise.all([firstRoad, Promise.all([second(path.join(REPO, 'data/bin/chat-wrapper.js'), 'tip-second'), second(RED2, 'release-second')]), chunkRoad]);
  judgeFirst(runs);
  ok(!cur3.missed && cur3.oneChunk === true && /chat-wrapper\.log$/.test(String(cur3.heldFile || '')) && cur3.bytes < 4096 && cur3.standsAtHold === true,
    '§8b THE SAME CHUNK (r5457 (1)): a Stop and a frame with the same picture in ONE stdin chunk (the preload\'s witness) — at the batch\'s end, after the owed unlink ran, the kept file the new held copy names still stands', cur3);
  ok(!red3.missed && red3.oneChunk === true && red3.standsAtHold === false,
    '§8b RED CONTROL (the owed unlink not filtered again, in a copy): the same chunk, and the file the new held copy names is removed', red3);
  ok(!cur2.missed && /chat-wrapper\.log$/.test(String(cur2.heldFile || '')) && cur2.heldRoad === true && cur2.heldSaidFirst === true && cur2.interrupts >= 2,
    '§8b THE SECOND STOP\'s ROAD: held in the window (its own words said first), its drop line made at the batch\'s end, and the held Stop reaches the CLI on the follow-up\'s init', cur2);
  ok(!red2.missed && /chat-wrapper\.log$/.test(String(red2.heldFile || '')) && red2.heldRoad === true && red2.heldSaidFirst === false,
    '§8b RED CONTROL (the second Stop\'s drop outside the rule, in a copy): its drop line is written INSIDE the drop — the hold is reached before the held road said anything', red2);
});
// ── §8c THE OWED MARK OUTLIVES A THROW (主开发 r5357 (2): the owed records write, made safe against a throw, carries a mark ANOTHER
// road set — a taken-back Send again on the Stop's road (B-5a4d unit 3's endTakenBack, 8dad62d3e) sets the SAME handedDue). PURE: the
// wrapper's own batch state line, owedOnStop, say, beginBatch and endBatch, lifted by text and run with a records write that THROWS
// once (placed; the log line naming the placed throw is its witness). RED CONTROLS, each a copy through anchored(): the release's
// clear-before-write line (the throw leaves the batch, the mark is gone, the records are never written again) and the owed calls'
// loop without its guard (one throw skips the next owed call for good).
console.log('§8c a Stop\'s owed records write that throws keeps its mark owed; the batch\'s other owed calls and its lines still go');
await guard('§8c', async () => {
  const src = read('data/bin/chat-wrapper.js');
  const fnText = (text, header) => { const i = text.indexOf(header); if (i < 0) return null; const eol = text.indexOf('\n', i), line = text.slice(i, eol); if ((line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) return line; const j = text.indexOf('\n}\n', i); return j > i ? text.slice(i, j + 2) : null; };
  const lift = (s) => {
    const parts = [s.split('\n').find((l) => l.startsWith('let batchDepth = 0, batchOut = [],')), s.split('\n').find((l) => l.startsWith('const owedOnStop = ')),
      fnText(s, 'function say(line) {'), fnText(s, 'function beginBatch() {'), fnText(s, 'function endBatch() {')];
    if (!parts.every(Boolean)) throw new Error('a lifted part of the wrapper is gone (its anchor moved)');
    return new Function('JOURNAL', 'process', 'writeRecords', 'log', 'trimBuffer', 'persistNow',   // eslint-disable-line no-new-func
      `${parts.join('\n')}\nreturn { beginBatch, endBatch, say, owedOnStop, onStop: (v) => { handedAfterStop = v; }, owe: () => { handedDue = true; }, mark: () => handedDue };`);
  };
  const run = (s, owedThrows) => {
    const ev = []; let writes = 0;
    const api = lift(s)(null, { stdout: { write: (t) => { ev.push('said ' + t.trim()); return true; } } },
      () => { writes++; ev.push('write ' + writes); if (writes === 1) throw new Error('placed'); return true; }, (l) => ev.push('log ' + l), () => { }, () => { });
    const out = { ev };
    try {
      api.beginBatch();
      api.onStop(true);
      api.owe();   // the mark another road set (endTakenBack on the Stop's road sets handedDue, as the drop's own hand words do)
      if (owedThrows) api.owedOnStop(() => { throw new Error('placed owed'); });
      api.owedOnStop(() => ev.push('owed call'));
      api.onStop(false);
      api.say('the batch\'s line');
      api.endBatch();
    } catch (e) { out.threw = String((e && e.message) || e); }
    out.markAfterThrow = api.mark();
    try { api.beginBatch(); api.endBatch(); } catch (e) { out.threw2 = String((e && e.message) || e); }
    out.markAfterNext = api.mark(); out.writes = writes;
    return out;
  };
  const at = (r, e) => r.ev.indexOf(e), SAID = 'said the batch\'s line';
  const tip = run(src, false), tip2 = run(src, true);
  ok(!tip.threw && !tip.threw2 && tip.markAfterThrow === true && tip.markAfterNext === false && tip.writes === 2
    && tip.ev.some((e) => /^log handed records: the owed write threw \(placed\) — still owed/.test(e))
    && at(tip, 'owed call') > at(tip, 'write 1') && at(tip, SAID) > at(tip, 'owed call') && tip.ev[tip.ev.length - 1] === 'write 2',
    '§8c THE MARK OUTLIVES A THROW: the owed records write threw (placed, its log line the witness) — the mark another road set stays owed, the batch\'s owed call runs and its line is said, and the next batch\'s end writes the records', tip);
  ok(!tip2.threw && tip2.ev.some((e) => /^log a Stop's owed file call threw \(placed owed\)/.test(e)) && at(tip2, 'owed call') > -1 && at(tip2, SAID) > at(tip2, 'owed call'),
    '§8c ONE OWED CALL THAT THROWS SKIPS NONE: it is logged, the next owed call runs, the batch\'s line is said', tip2);
  const RED_MARK = anchored(src, /  if \(handedDue\) \{ let wrote = false;[^\n]*\n/, '  if (handedDue) { handedDue = false; writeRecords(); }\n', 'the guarded owed records write');
  const RED_LOOP = anchored(src, /  for \(const f of stopOwed\.splice\(0\)\) \{ try \{ f\(\); \}[^\n]*\n/, '  for (const f of stopOwed.splice(0)) f();\n', 'the guarded owed calls');
  const r1 = run(RED_MARK, false), r2 = run(RED_LOOP, true);
  ok(r1.threw === 'placed' && r1.markAfterThrow === false && r1.writes === 1,
    '§8c RED CONTROL (the release\'s clear-before-write line, in a copy): the placed throw leaves the batch and the mark is gone — the records are never written again', r1);
  ok(r2.threw === 'placed owed' && at(r2, 'owed call') === -1,
    '§8c RED CONTROL (the owed calls without their guard, in a copy): the placed throw skips the next owed call for good', r2);
  // (r5457 (2)) A STOP LINE's RECEIPT TAKES ITS STAMP AND ITS RING PLACE AT THE PUSH; only the file's write is owed. Lifted with
  // ackLine, writeReceipt and writeReceiptsFile: a Stop line asking a receipt, then a later line of the same batch asking one. RED: a
  // copy with 60320367c's line (the whole receipt owed: its stamp and ring place wait for the batch's end).
  const RLINE = 'if (receipt) writeReceipt(ack, stop);';
  const liftR = (s) => {
    const parts = [s.split('\n').find((l) => l.startsWith('let batchDepth = 0, batchOut = [],')), s.split('\n').find((l) => l.startsWith('const owedOnStop = ')),
      fnText(s, 'function say(line) {'), fnText(s, 'function beginBatch() {'), fnText(s, 'function endBatch() {'), fnText(s, 'function writeReceipt(rec, owed = false) {'),
      fnText(s, 'function writeReceiptsFile() {'), fnText(s, 'function ackLine(id, receipt, stop = false) {')];
    if (!parts.every(Boolean)) throw new Error('a lifted part of the receipt road is gone (its anchor moved)');
    return new Function('fs', 'receiptsFile', 'JOURNAL', 'process', 'writeRecords', 'log', 'trimBuffer', 'persistNow',   // eslint-disable-line no-new-func
      `const receiptLines = []; var lastReceiptAt = 0;\n${parts.join('\n')}\nreturn { beginBatch, endBatch, ackLine, stamp: () => lastReceiptAt, ring: () => receiptLines.map((l) => JSON.parse(l).msg_id) };`);
  };
  const runR = (s) => {
    const files = [], api = liftR(s)({ writeFileSync: (f, t) => files.push(t.trim().split('\n').map((l) => JSON.parse(l).msg_id).join(',')) }, '/r.receipts', null,
      { stdout: { write: () => true } }, () => true, () => { }, () => { }, () => { });
    api.beginBatch();
    api.ackLine('m-stop', true, true);
    const atStop = { stamp: api.stamp() > 0, ring: api.ring().join(','), files: files.length };
    api.ackLine('m-next', true, false);
    const atNext = { ring: api.ring().join(','), files: files.slice() };
    api.endBatch();
    return { atStop, atNext, files };
  };
  const rt = runR(src), rr = runR(anchored(src, RLINE, 'if (receipt) { if (stop) stopOwed.push(() => writeReceipt(ack)); else writeReceipt(ack); }', 'the receipt pushed whole'));   // stale-pins: kept — 60320367c's line, the red copy's planted text (not a pin)
  ok(src.split(RLINE).length === 2 && rt.atStop.stamp === true && rt.atStop.ring === 'm-stop' && rt.atStop.files === 0 && rt.atNext.ring === 'm-stop,m-next' && rt.files.length === 2 && rt.files.every((x) => x === 'm-stop,m-next'),
    '§8c THE RECEIPT AT THE PUSH (r5457 (2)): the Stop line\'s receipt is stamped and placed in the ring at its line (in line order) and its file is not written there; the batch\'s files hold both, in order', rt);
  ok(rr.atStop.stamp === false && rr.atNext.ring === 'm-next',
    '§8c RED CONTROL (60320367c\'s line, in a copy): the Stop\'s stamp and ring place wait for the batch\'s end — a later line\'s receipt comes first', rr);
});
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
