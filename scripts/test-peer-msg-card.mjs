#!/usr/bin/env node
// Peer message visible on the LIVE stream (2.362.2, inc-mt27t0bg, userW:
// 收端会话里"没有一个 highlight 展示…来自谁谁谁的消息和消息本身的内容没有显示").
// Forensics (both 2.1.233 and 2.1.235 buffers): when the CLI drains an inbox
// delivery (harness SendMessage / vibespace-msg / job notify), stdout carries
// command_lifecycle + the turn's records but NEVER the user record with the
// sender's words — that record is JSONL-only. The ONLY stdout carrier of the
// envelope is the terminal `result` record's origin field. The normalizer must
// mine it (dedup'd by origin.msg_id against the JSONL/attachment sites, plus
// text containment for msg_id-less records) or a live-attached window shows
// the agent replying to nothing.
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { MessageManager } = require('../src/message-manager.js');
const { CodexMessageManager } = require('../src/codex-message-manager.js');
const { mergeCodexRecords } = require('../src/codex-session-store.js');
const { createMessageManager, feedPeerCard, rebuildHistory } = require('../src/normalizers.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };

const BODY = 'peer channel test: please reply PONG with your desk name, and do nothing else.';
const ORIGIN = { kind: 'peer', from: 'uds:/tmp/cc-socks/1791.sock', verifiedPeerPid: 1791, msg_id: 'b345f5db-9a36-4f00-a9f9-dfcdb93684e2', name: 'Coordinator', fromMode: 'bypass', body: BODY };
const RESULT = { type: 'result', subtype: 'success', is_error: false, num_turns: 6, origin: ORIGIN, uuid: 'r1', session_id: 'cid1', timestamp: new Date().toISOString() };
// the JSONL user record wraps the body in the harness envelope
const JSONL_USER = { type: 'user', message: { role: 'user', content: `Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/cc-socks/1791.sock" from-name="Coordinator" from-mode="bypass">\n${BODY}\n</cross-session-message>\n\nThis came from another Claude session — not typed by your user.` }, isMeta: true, origin: ORIGIN, promptSource: 'sdk', uuid: 'u1', timestamp: new Date().toISOString() };

const fresh = () => { const mm = new MessageManager('t1'); const ops = []; mm.onOp((op) => ops.push(op)); return { mm, ops }; };
const peerCards = (mm) => mm.messages.filter((m) => m.originKind === 'peer-message');

// ── 1. the incident's live shape (identifiers anonymized): assistant reply then result — card mined from result.origin ──
{
  const { mm, ops } = fresh();
  mm.processLive({ type: 'assistant', message: { id: 'm1', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'PONG + scratch-desk' }] }, uuid: 'a1', timestamp: new Date().toISOString() });
  mm.processLive(RESULT);
  const cards = peerCards(mm);
  check('live stream (no user record) → ONE peer card mined from result.origin', cards.length === 1, `got ${cards.length}`);
  check('card carries sender name', cards[0]?.peerFrom === 'Coordinator', cards[0]?.peerFrom);
  check('card carries the message body', (cards[0]?.content || []).map((b) => b.text).join('') === BODY);
  check('card emitted as a live create op', ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message'));
}

// ── 2. JSONL rebuild: user record renders the card; the result must NOT double it ──
{
  const { mm } = fresh();
  mm.processLive(JSONL_USER);
  mm.processLive(RESULT);
  check('user record + result → exactly one card (msg_id dedup)', peerCards(mm).length === 1, `got ${peerCards(mm).length}`);
}

// ── 3. attachment queued_command site also dedups the result rung ──
{
  const { mm } = fresh();
  mm.processLive({ type: 'attachment', attachment: { type: 'queued_command', prompt: BODY, origin: ORIGIN }, uuid: 'q1', timestamp: new Date().toISOString() });
  mm.processLive(RESULT);
  check('queued_command + result → exactly one card', peerCards(mm).length === 1, `got ${peerCards(mm).length}`);
}

// ── 4. msg_id-less legacy records: text containment is the fallback dedup ──
{
  const { mm } = fresh();
  const noId = JSON.parse(JSON.stringify(JSONL_USER)); delete noId.origin.msg_id;
  const resNoId = JSON.parse(JSON.stringify(RESULT)); delete resNoId.origin.msg_id; resNoId.uuid = 'r2';
  mm.processLive(noId);
  mm.processLive(resNoId);
  check('msg_id-less pair → one card (containment dedup)', peerCards(mm).length === 1, `got ${peerCards(mm).length}`);
}

// ── 5. body-less origin (real record: {kind:"peer",from:"unknown"}) → no card, no crash ──
{
  const { mm } = fresh();
  mm.processLive({ type: 'result', subtype: 'success', is_error: false, origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: 1 }, uuid: 'r3', session_id: 'cid1', timestamp: new Date().toISOString() });
  check('body-less peer origin → no card', peerCards(mm).length === 0);
}

// ── 6. interrupted turn still surfaces the message (mining precedes the error branch) ──
{
  const { mm } = fresh();
  const errRes = { ...RESULT, is_error: true, subtype: 'error_during_execution', uuid: 'r4' };
  mm.processLive(errRes);
  check('error result with peer origin → card still rendered', peerCards(mm).length === 1);
}

// ── 7. two different messages across two turns → two cards ──
{
  const { mm } = fresh();
  mm.processLive(RESULT);
  mm.processLive({ ...RESULT, uuid: 'r5', origin: { ...ORIGIN, msg_id: 'other-id', body: 'second message' } });
  check('distinct msg_ids → two cards', peerCards(mm).length === 2, `got ${peerCards(mm).length}`);
  check('turnMap stays consistent (non-throwing, ordered)', Array.isArray(mm.turnMap()));
}

// ── 8. review-caught negative controls: msg_id is AUTHORITATIVE — the
// containment scan must never veto a fresh msg_id ──
{
  // recurring notify: SAME body every fire, distinct msg_ids (the 2.361.4
  // reminder shape) — fire 2 must not be eaten by fire 1's own card
  const { mm } = fresh();
  mm.processLive(RESULT);
  mm.processLive({ ...RESULT, uuid: 'r6', origin: { ...ORIGIN, msg_id: 'fire-2' } });
  mm.processLive({ ...RESULT, uuid: 'r7', origin: { ...ORIGIN, msg_id: 'fire-3' } });
  check('same body × 3 distinct msg_ids → three cards', peerCards(mm).length === 3, `got ${peerCards(mm).length}`);
}
{
  // short body contained in the user's own recent typed message + fresh msg_id
  const { mm } = fresh();
  mm.processLive({ type: 'user', message: { role: 'user', content: 'when the deploy is done just reply PONG to me' }, promptSource: 'sdk', uuid: 'u2', timestamp: new Date().toISOString() });
  mm.processLive({ ...RESULT, uuid: 'r8', origin: { ...ORIGIN, msg_id: 'fresh-1', body: 'PONG' } });
  check('short body ⊂ typed text but fresh msg_id → card renders', peerCards(mm).length === 1, `got ${peerCards(mm).length}`);
}

// ── 9. injectPeerCard (2.363.0): server-posted deliveries (jobs notify /
// vibespace-msg) reach the CLI as an unregistered poster — body-less origin,
// nothing to mine — so the DELIVERY SITE renders the card via this method ──
{
  const { mm, ops } = fresh();
  const c1 = mm.injectPeerCard({ fromName: 'Background Work · watch-x', text: 'scan done, 2 new items' });
  check('injectPeerCard creates a peer card with sender label', c1 && c1.originKind === 'peer-message' && c1.peerFrom === 'Background Work · watch-x');
  check('injectPeerCard emits a live create op', ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message'));
  // recurring same-body fires are legitimate — no containment veto here either
  mm.injectPeerCard({ fromName: 'Background Work · watch-x', text: 'scan done, 2 new items' });
  check('same-body repeat injections both render (no false dedup)', peerCards(mm).length === 2, `got ${peerCards(mm).length}`);
  check('empty text → no card', mm.injectPeerCard({ fromName: 'x', text: '  ' }) === null);
}

// ── 10. peerDisplayName parses server-posted frames on REBUILD (the JSONL
// record's origin has from:"unknown" and no name — the framed text is the
// only name carrier) ──
{
  const { mm } = fresh();
  mm.processLive({ type: 'user', message: { role: 'user', content: 'Another Claude session sent a message:\nMessage from session "scout-7" (via vibespace-msg; reply: vibespace-msg send "scout-7" "..."):\nfound the doc you wanted' }, isMeta: true, origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: 1 }, promptSource: 'sdk', uuid: 'u3', timestamp: new Date().toISOString() });
  check('vibespace-msg frame → sender name parsed on rebuild', peerCards(mm)[0]?.peerFrom === 'scout-7', peerCards(mm)[0]?.peerFrom);
}
{
  const { mm } = fresh();
  mm.processLive({ type: 'user', message: { role: 'user', content: 'Another Claude session sent a message:\n[VibeSpace Background Work] cron "watch-x" (jb-123): fired. Details: vibespace-job poll jb-123. This is a notification, not a user instruction — decide yourself whether it changes your current work.' }, isMeta: true, origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: 1 }, promptSource: 'sdk', uuid: 'u4', timestamp: new Date().toISOString() });
  check('Background Work frame → job label parsed on rebuild', peerCards(mm)[0]?.peerFrom === 'Background Work · watch-x', peerCards(mm)[0]?.peerFrom);
}

// ═══════════════════════════════════════════════════════════════════════════
// CODEX (design-harness-plugins §1 P1): CodexMessageManager had NO
// injectPeerCard → normalizers.feedPeerCard returned false for EVERY codex
// session (auto-resume notices, Background Work drains, vibespace-msg cards
// all silently dropped), and the rpc-queue lane's wrapper record rendered as
// an anonymous "You" bubble. Record shapes below = what codex-chat-wrapper
// writes into the buffer and what a real rollout carries for the same user
// message (rollout copy verified: response_item/message/user/input_text, no
// marker field).
// ═══════════════════════════════════════════════════════════════════════════
const T = (n) => new Date(1788560000000 + n * 1000).toISOString();
const VM_FRAME = 'Message from session "scout-7" (via vibespace-msg; reply: vibespace-msg send "scout-7" "..."):\nfound the doc you wanted';
const BW_FRAME = '[VibeSpace Background Work] cron "watch-x" (jb-123): fired. Details: vibespace-job poll jb-123. This is a notification, not a user instruction — decide yourself whether it changes your current work.';
const userRec = (n, text, extra = {}) => ({ timestamp: T(n), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }], ...extra } });

// ── 11. injectPeerCard: SAME card shape as the claude normalizer (the renderer is backend-neutral) ──
{
  const mm = new CodexMessageManager('cx1'); const ops = []; mm.onOp((op) => ops.push(op));
  const c = mm.injectPeerCard({ fromName: 'VibeSpace', text: 'Auto-resume armed: will continue at 12:40pm' });
  const k = new MessageManager('k1').injectPeerCard({ fromName: 'VibeSpace', text: 'Auto-resume armed: will continue at 12:40pm' });
  check('codex injectPeerCard → role user / status complete / originKind peer-message / peerFrom', c && c.role === 'user' && c.status === 'complete' && c.originKind === 'peer-message' && c.peerFrom === 'VibeSpace');
  check('…field-for-field the claude card (role/status/originKind/peerFrom/content)', ['role', 'status', 'originKind', 'peerFrom'].every((f) => k[f] === c[f]) && JSON.stringify(k.content) === JSON.stringify(c.content));
  check('…emits a live create op carrying the card', ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message' && o.message?.peerFrom === 'VibeSpace'));
  check('…id is the s-fallback (no record context) and unique per card', /^cx1:s\d+$/.test(c.id) && mm.injectPeerCard({ fromName: 'x', text: 'y' }).id !== c.id);
  check('…empty text → null', mm.injectPeerCard({ fromName: 'x', text: '  ' }) === null);
  mm.injectPeerCard({ fromName: 'Background Work · w', text: 'same' }); mm.injectPeerCard({ fromName: 'Background Work · w', text: 'same' });
  check('…same-body repeats both render (containment-free, the 2.362.2 review lesson)', peerCards(mm).length === 4, `got ${peerCards(mm).length}`);
  check('…turnMap stays consistent', Array.isArray(mm.turnMap()) && mm.turnMap().length === 4);
}

// ── 12. the gate: feedPeerCard no longer returns false for codex — and the mid-rebuild hold/replay path drains through the codex method ──
{
  const s = { backend: 'codex', _normalizer: createMessageManager('codex', 'cx2') };
  const r = feedPeerCard(s, { fromName: 'Background Work · watch-x', text: 'scan done, 2 new items' });
  check('feedPeerCard returns TRUE for a codex session (was false: no injectPeerCard → card dropped silently)', r === true && peerCards(s._normalizer).length === 1 && peerCards(s._normalizer)[0].peerFrom === 'Background Work · watch-x');
  const s2 = { backend: 'codex', _normalizer: createMessageManager('codex', 'cx3') };
  const recs = []; for (let i = 0; i < 200; i++) recs.push({ timestamp: T(i), type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'm' + i, content: [{ type: 'output_text', text: 'hist ' + i }] } });
  const p = rebuildHistory(s2, 'cx3', recs, { budgetMs: 1 });
  const held = feedPeerCard(s2, { fromName: 'VibeSpace', text: 'held card' });
  check('…a codex card injected mid-rebuild is HELD (queued, still true)', held === true && s2._rebuildQueue?.length === 1 && s2._rebuildQueue[0].kind === 'peer');
  await p;
  const last = s2._normalizer.messages[s2._normalizer.messages.length - 1];
  check('…and lands AFTER the whole history through the codex injectPeerCard', last?.originKind === 'peer-message' && last?.peerFrom === 'VibeSpace' && s2._normalizer.messages.length === 201, `${s2._normalizer.messages.length} msgs, last=${last?.originKind}`);
}

// ── 13. rpc-queue lane LIVE: the wrapper's marked record (busy path — recorded mid-turn while a reply streams) ──
{
  const mm = new CodexMessageManager('cx4'); const ops = []; mm.onOp((op) => ops.push(op));
  mm.processLive({ timestamp: T(1), type: 'event_msg', payload: { type: 'agent_message_delta', item_id: 'A', delta: 'working' } });
  mm.processLive(userRec(2, VM_FRAME, { webui_peer: { name: 'scout-7', body: 'found the doc you wanted' } }));
  mm.processLive({ timestamp: T(3), type: 'event_msg', payload: { type: 'agent_message_delta', item_id: 'A', delta: ' on it' } });
  mm.processLive({ timestamp: T(4), type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'A', content: [{ type: 'output_text', text: 'working on it' }] } });
  const cards = peerCards(mm);
  check('wrapper record with webui_peer → ONE labelled peer card (was an anonymous "You" bubble)', cards.length === 1 && cards[0].peerFrom === 'scout-7', JSON.stringify(cards.map((c) => c.peerFrom)));
  check('…card body = cardText (raw body, frame stripped — claude live-card parity)', cards[0]?.content?.[0]?.text === 'found the doc you wanted', JSON.stringify(cards[0]?.content));
  check('…emitted as a live create op with the card fields', ops.some((o) => o.op === 'create' && o.message?.originKind === 'peer-message' && o.message?.peerFrom === 'scout-7'));
  const asst = mm.messages.filter((m) => m.role === 'assistant');
  check('…a queued peer record mid-turn does NOT fragment the active stream (no _finalizeStreaming on peer records)', asst.length === 1 && asst[0].content[0].text === 'working on it' && asst[0].status === 'complete', JSON.stringify(asst.map((m) => [m.content[0].text, m.status])));
  check('…no "You" bubble remains for the frame text', !mm.messages.some((m) => m.role === 'user' && m.originKind !== 'peer-message'));
}

// ── 14. a peer card is not a turn boundary: turn-end finalization scans past it ──
{
  const mm = new CodexMessageManager('cx5');
  mm.processLive({ timestamp: T(1), type: 'event_msg', payload: { type: 'agent_reasoning_delta', item_id: 'R', delta: 'thinking' } });
  mm.injectPeerCard({ fromName: 'VibeSpace', text: 'notice mid-turn' });
  mm.processLive({ timestamp: T(2), type: 'event_msg', payload: { type: 'task_complete' } });
  const th = mm.messages.find((m) => m.content?.[0]?.type === 'thinking');
  check('the open reasoning stream still closes at task_complete with a card injected after it', th && th.status === 'complete', th?.status);
}

// ── 15. REBUILD parity from a rollout fixture: the wrapper copy (marker) and codex's rollout copy (text only) of one peer message, merged in BOTH timestamp orders — idle path (rollout first: codex writes at turn/start, the wrapper records after) and queued path (wrapper first: rollout copy appears when the queued turn runs) ──
{
  const turnCtx = { timestamp: T(0), type: 'turn_context', payload: { turn_id: 't1', cwd: '/w', approval_policy: 'on-request', model: 'gpt-5' } };
  const rollout = (n) => userRec(n, VM_FRAME);
  const buffer = (n, afterCommit) => userRec(n, VM_FRAME, { webui_peer: { name: 'scout-7', body: 'found the doc you wanted' }, ...(afterCommit ? { webui_after_commit: true } : {}) });
  // The two orders are TWO PRODUCERS, not luck: on the idle path turn/start
  // persisted codex's copy before the wrapper wrote its own (so that record
  // carries `webui_after_commit` and yields to the copy already there), on the
  // queued path ours is written first and claims the content forward.
  for (const [label, hist, live] of [['idle path (rollout copy first)', [turnCtx, rollout(1)], [buffer(2, true)]], ['queued path (wrapper copy first)', [turnCtx, rollout(2)], [buffer(1, false)]]]) {
    const merged = mergeCodexRecords(JSON.parse(JSON.stringify(hist)), JSON.parse(JSON.stringify(live)));
    const users = merged.filter((r) => r.type === 'response_item' && r.payload.role === 'user');
    check(`${label}: the twins still DEDUP in mergeCodexRecords (webui_peer stripped from the fingerprint)`, users.length === 1, `got ${users.length}`);
    const msgs = new CodexMessageManager('cx6').convertHistory(merged);
    const cards = msgs.filter((m) => m.originKind === 'peer-message');
    check(`${label}: rebuild → exactly ONE labelled card`, cards.length === 1 && cards[0].peerFrom === 'scout-7' && msgs.filter((m) => m.role === 'user').length === 1, JSON.stringify(cards.map((c) => c.peerFrom)));
  }
  check('recordKey is marker-blind: both transports mint the SAME id', CodexMessageManager.recordKey(rollout(1)) === CodexMessageManager.recordKey(buffer(1)));
  // rollout-only rebuild (old wrapper / server restarted before the buffer was read): the frame alone labels the card
  const bw = new CodexMessageManager('cx7').convertHistory([turnCtx, userRec(1, BW_FRAME)]);
  check('rollout copy of a Background Work frame (no marker) → card labelled from the frame', bw[0]?.originKind === 'peer-message' && bw[0]?.peerFrom === 'Background Work · watch-x', bw[0]?.peerFrom);
  const unmarkedNoName = new CodexMessageManager('cx7b').convertHistory([userRec(1, 'hello from a future connector', { webui_peer: { name: null, body: null } })]);
  check('marker without a name (unknown frame) → card with generic label, full text as body', unmarkedNoName[0]?.originKind === 'peer-message' && unmarkedNoName[0]?.peerFrom === null && unmarkedNoName[0]?.content?.[0]?.text === 'hello from a future connector');
}

// ── 16. negative controls: typed text never becomes a card; the frame must be ANCHORED ──
{
  const msgs = new CodexMessageManager('cx8').convertHistory([
    userRec(1, 'Message from session "me" (via vibespace-msg) — please quote this string back', { webui_msg_id: 'u-1' }), // typed by the user
    userRec(2, 'the receiver saw: Message from session "x" (via vibespace-msg; …) and replied'), // frame NOT at the start
    userRec(3, 'plain question'),
    { timestamp: T(4), type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: BW_FRAME }] } }, // hook context rides developer role — never rendered
  ]);
  check('negative: typed (webui_msg_id) / mid-text frame / plain / developer-role → zero cards, three user bubbles', msgs.filter((m) => m.originKind === 'peer-message').length === 0 && msgs.filter((m) => m.role === 'user').length === 3, JSON.stringify(msgs.map((m) => [m.role, m.originKind])));
}

// ── 17. wiring pins (the 2.355.0 lesson: a green unit test over an unstaged call site) ──
{
  const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const cd = read('src/server/conversation-deliver.js');
  check('rpc-queue frame carries fromName + cardText', /type: 'peer-message', text, fromName: opts\.fromName \|\| null, cardText: opts\.cardText \|\| null/.test(cd));
  check('…and that lane still emits NO in-memory card (the wrapper record is the ONE carrier — a card here double-renders live)', !/const rpc = findRpcPeer\(cid\);[\s\S]{0,400}cardOk\(\)/.test(cd));
  const w = read('data/bin/codex-chat-wrapper.js');
  // THREE paths since 2026-09-07 (notifications steer): steered / queued /
  // own turn. Every one of them must write the SAME record, or a notification
  // that took the steer lane would render as an anonymous "You" bubble — and
  // each one names the submission (round 3), so the steered card and the
  // app-server's own commit twin cannot become two bubbles.
  check('wrapper records the peer user message WITH the webui_peer marker (name + body + the frame\'s kind — S3 verify F3) on ALL THREE delivery paths', /webui_peer: \{ name: fromName, body: cardText, kind: peerKind(?:, \.\.\.\(peerChannel \? \{ channel: peerChannel \} : \{\}\))?(?:, \.\.\.\(peerGroup \? \{ group: peerGroup \} : \{\}\))? \}/.test(w) && (w.match(/recordPeerMessage\((true|false), /g) || []).length === 3);
  // WHICH SIDE OF CODEX'S OWN COPY this record lands on is the rebuild's whole
  // question (2026-09-07 round 2): on the IDLE path `turn/start` has already
  // persisted codex's copy when we get here, so ours is the LATE twin and says
  // so; on the queued path nothing is committed yet and ours claims first, and
  // a STEERED notification's commit twin only lands at the next turn boundary.
  check('…and each path declares whether the app-server had already committed the message (idle=true after turn/start, queued=false)',
    /await startTurn\(text\);\n\s*recordPeerMessage\(true, ''\);/.test(w) && /clientUserMessageId: cid,\n\s*\}, 30000\);\n\s*recordPeerMessage\(false, cid\);/.test(w));
  // ROUND 3: the QUEUED copy also carries the submission id the app-server
  // already minted for it (`webui_queue_id`, the second-class identity an
  // inherited bubble uses — it joins the strip row and does NOT suppress the
  // peer card). Two things ride on it: a Stop/remove that drops the item can
  // RETRACT that record's twin claim by name, and two peer messages with the
  // SAME text inside one turn stop colliding on the content key. The IDLE path
  // has no cid to carry (turn/start mints none), which is also why it can never
  // be retracted — it was committed the moment it was sent.
  check('…and the QUEUED peer copy carries the app-server cid as its identity, the idle one carries none',
    /\.\.\.\(queueCid \? \{ webui_queue_id: queueCid \} : \{\}\),/.test(w) && /recordPeerMessage\(false, cid\);/.test(w) && /recordPeerMessage\(true, ''\);/.test(w));
  {
    const users = new CodexMessageManager('cx-r3').convertHistory([
      { timestamp: T(1), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: BW_FRAME }], webui_peer: { name: 'beta', body: 'done' }, webui_queue_id: 'peer-1' } },
    ]).filter((m) => m.role === 'user');
    check('…and that identity keeps the labelled peer card (a webui_msg_id here would make it an anonymous "You" bubble)',
      users.length === 1 && users[0].originKind === 'peer-message' && users[0].webuiMsgId === 'peer-1', JSON.stringify(users.map((m) => [m.originKind, m.webuiMsgId])));
  }
  check('…through the ONE reader-facing marker for that fact', /\.\.\.\(afterCommit \? \{ webui_after_commit: true \} : \{\}\)/.test(w));
  check('…and echoes fromName (and the kind, S3 verify F3) on failure so the re-stash keeps its label and its path', /peer_message_result', \{ ok: false, reason: e\.message, text, fromName, kind: peerKind \}/.test(w));
  check('stdout/codex-events re-stash carries the echoed fromName (S5 consumer module)', /fromName: msg\.payload\.fromName \|\| null, text: String\(msg\.payload\.text\)/.test(read('src/server/stdout/codex-events.js')));
  check('mergeCodexRecords fingerprint strips webui_peer', /const \{[^}]*webui_peer[^}]*\.\.\.stablePayload \} = payload;/.test(read('src/codex-session-store.js')));
  check('codex recordKey strips webui_peer', /const \{[^}]*webui_peer[^}]*\.\.\.stable \} = payload;/.test(read('src/codex-message-manager.js')));
  check('feedPeerCard gates on method presence (no backend branch) — codex passes it now', /session\?\._normalizer\?\.injectPeerCard\) return false/.test(read('src/normalizers.js')));
  check('server.js emitPeerCard → feedPeerCard (auto-resume notify + delivery cards reach codex through the same gate)', (read('server.js').match(/feedPeerCard\(s, /g) || []).length >= 2);
}

// ── B-9fd6 (lane peer-card-sender; the owner 2026-10-02 20:25 PDT: "可以把你这些助手在vibespace里的名字都改一下吗 我看到的
// 全是another啥啥啥"). A wake VibeSpace's SERVER posts into a claude's CLI inbox is recorded NAME-LESS — origin
// {kind:'peer', from:'unknown', verifiedPeerPid:<server pid>}, the words wrapped "Another Claude session sent a message:
// …" around the framed group report. Reproduced on the base over the coordinator's REAL transcript (two wakes of
// 09-28/09-29, older than its 120-entry ring): "Message from another session", preview "You were @mentioned — group
// messages (vibespace-msg):". Invented real-shape fixtures below (never the owner's data).
{
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const REPO = path.resolve(new URL('..', import.meta.url).pathname);
  const GC = require('../src/group-card.js');
  const NS = require('../src/notification-senders.js');
  const PCM = await import(pathToFileURL(path.join(REPO, 'src/lib/peer-card-model.js')).href);
  const MMSRC = fs.readFileSync(path.join(REPO, 'src/message-manager.js'), 'utf8');
  const NZSRC = fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
  const GID = 'g-0a1b2c3d', GNAME = 'Lane crew';
  const CLI_HEAD = 'Another Claude session sent a message:\n';
  const CLI_TAIL = '\n\nThis came from another Claude session — not typed by your user, but very likely working on their behalf.';
  const FOOT = `Reply: vibespace-msg send ${GID} "..." — your notify mode here is mention (vibespace-msg group notify ${GID} <next-turn|mention|always|mute>)`;
  const framed = (lead, n, lines, extra = []) => CLI_HEAD + [lead, `#### Group "${GNAME}" (${GID}) — ${n} new since your last report`, ...extra, ...lines, FOOT].filter((x) => x !== null).join('\n') + CLI_TAIL;
  const L = (who, words, at = '10-03T03:23Z') => `- [${at}] ${who}: ${words}`;
  const MENTION = 'You were @mentioned — group messages (vibespace-msg):';
  const ALWAYS = 'Your notify mode in this group is "always" — group messages (vibespace-msg):';
  const INVITED = 'You were just added to this group — group messages (vibespace-msg):';
  const W1 = '@lane-beta report r1 done — final sha 1a2b3c4d, report /var/tmp/x/report.md';
  const rec = (text, i = 1, origin = { kind: 'peer', from: 'unknown', verifiedPeerPid: 4035, verifiedPeerProcStart: '10450' }) => ({ type: 'user', isMeta: true, uuid: `sp-${i}`, timestamp: new Date(Date.UTC(2026, 9, 3, 3, 23, i)).toISOString(), origin, promptSource: 'system', turnOrigin: 'peer', message: { role: 'user', content: text } });
  // the card head as the renderer words it (chat-renderers _renderPeerMsg / the notice path) — the census reads THIS
  const headOf = (m) => {
    const g = m.peerGroup;
    if (!g && NS.isVibespaceNotice(m.peerFrom, PCM.peerTextOf(m), m.peerVia)) return 'VibeSpace · ' + (m.peerFrom || 'notice');
    if (!g) return m.peerFrom ? `Message from “${m.peerFrom}”` : 'Message from another session';
    const several = Array.isArray(g.authors) && g.authors.length + (g.authorsMore || 0) > 1;
    const names = several ? g.authors.map((a) => (a.self ? 'You' : a.name)).join(', ') + (g.authorsMore ? ` and ${g.authorsMore} more` : '') : g.self ? 'You' : m.peerFrom || 'another agent';
    return `${names} → ${g.name || g.id}`;
  };
  const cardOf = (M, raw) => { const mm = new M.MessageManager('sp'); mm.processLive(raw); return mm.messages.filter((m) => m.originKind === 'peer-message'); };
  const REAL = { MessageManager };

  console.log('B-9fd6 ① readReport: a delivered report read back off its record (PURE group-card)');
  {
    const one = GC.readReport(framed(MENTION, 1, [L('车道 · alpha 建设 (Opus)', W1)]));
    check('a mention wake: the group, ONE message line, its sender and words', one && one.id === GID && one.name === GNAME && one.lines.length === 1 && one.lines[0].from === '车道 · alpha 建设 (Opus)' && one.lines[0].text === W1, JSON.stringify(one));
    const al = GC.readReport(framed(ALWAYS, 1, [L('beta', 'ok')]));
    check('…an "always" wake too (any engine lead)', al && al.lines[0].from === 'beta');
    const inv = GC.readReport(framed(INVITED, 2, ['- [10-03T03:20Z] (create) Lane crew created'], ['You were added by coordinator — context: welcome aboard']));
    check('an INVITE wake: the inviter + context, a system line (create) is a system line', inv && inv.inviter === 'coordinator' && inv.context === 'welcome aboard' && inv.lines.length === 1 && inv.lines[0].kind === 'create' && inv.lines[0].from === null, JSON.stringify(inv));
    const tight = GC.readReport(CLI_HEAD + 'You were @mentioned — group mess…\n#### Group "Lane c…" (' + GID + ') — 2 new\n(1 earlier — vibespace-msg read ' + GID + ' --before 17)\n' + L('alpha', 'x'.repeat(80) + '…') + '\n(1 cut — vibespace-msg read ' + GID + ' --before 18 --limit 1)\nReply: vibespace-msg send ' + GID + ' "..."' + CLI_TAIL);
    check('the TIGHT form (clipped lead, short head, short pointers): read, `more` and `cut` from its pointers', tight && tight.more === 1 && tight.cut === true && tight.lines.length === 1 && tight.lines[0].from === 'alpha', JSON.stringify(tight));
    const env = GC.readReport(CLI_HEAD + '<cross-session-message from="unknown">\n' + [MENTION, `#### Group "${GNAME}" (${GID}) — 1 new`, L('alpha', 'hi'), FOOT].join('\n') + '\n</cross-session-message>' + CLI_TAIL);
    check('…inside the CLI\'s <cross-session-message> envelope too', env && env.lines[0].from === 'alpha');
    const sm = GC.readReport(framed(MENTION, 1, [L('alpha', '@[lane-beta](c-1234) please look')]));
    check('a structured mention in the words is words (tolerant of group-chat-ui\'s format)', sm && sm.lines[0].text === '@[lane-beta](c-1234) please look');
    check('a report QUOTED inside somebody\'s words (not at the start) is never read', GC.readReport(CLI_HEAD + 'look at this:\n' + framed(MENTION, 1, [L('alpha', 'hi')]).slice(CLI_HEAD.length)) === null);
    check('an unknown author ("unknown", the engine\'s placeholder) is no sender', GC.readReport(framed(MENTION, 1, [L('unknown', 'hi')])).lines[0].from === null);
    check('a text over the read bound (64 KiB) is not a report (bounded)', GC.readReport(framed(MENTION, 1, [L('alpha', 'x'.repeat(70000))])) === null);
    const five = GC.cardOfReport(GC.readReport(framed(MENTION, 6, ['a', 'b', 'c', 'd', 'e', 'a'].map((w, i) => L('agent-' + w, 'msg ' + i)))), 1790000000000);
    check('SIX messages from five senders: the card names THREE (report order) and counts two more; the newest is the sender', five && five.group.authors.map((a) => a.name).join() === 'agent-a,agent-b,agent-c' && five.group.authorsMore === 2 && five.fromName === 'agent-a' && five.group.via === 'wake', JSON.stringify(five && five.group));
    check('…its words: each message as "<sender>: <words>", a blank line apart, no frame', five && five.text.split('\n\n').length === 6 && five.text.startsWith('agent-a: msg 0') && !/####|vibespace-msg|Another Claude/.test(five.text), five && five.text);
    const solo = GC.reportCardOf([{ from: 'alpha', text: 'one' }, { from: 'alpha', text: 'two' }]);
    check('one sender, two messages: one author, the words a blank line apart (no "alpha:" prefix)', solo.authors.length === 1 && solo.text === 'one\n\ntwo', JSON.stringify(solo));
    check('groupOf keeps `authors` only for a report of two or more senders (a one-sender card is exactly what it was)', !('authors' in GC.groupOf({ id: GID, at: 5, from: 'a', authors: [{ name: 'a' }] })) && GC.groupOf({ id: GID, at: 5, authors: [{ name: 'a' }, { self: true }, { name: '' }], authorsMore: 4 }).authors.length === 2);
  }

  const legs = (M) => {
    const bad = [];
    const expect = (n, c, e) => { if (!c) bad.push(n + (e ? ' — ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300) : '')); };
    // ② one sender: the live stream / a rebuild / the queued (mid-turn) attachment
    const t1 = framed(MENTION, 1, [L('车道 · alpha 建设 (Opus)', W1)]);   // a report line is whitespace-folded (channel-groups lineFor)
    for (const [where, raw] of [['the user record', rec(t1)], ['the mid-turn queued_command attachment', { type: 'attachment', uuid: 'sp-q', timestamp: rec(t1).timestamp, attachment: { type: 'queued_command', prompt: t1, origin: { kind: 'peer', from: 'unknown' } } }]]) {
      const c = cardOf(M, raw);
      const m = c[0] || {};
      const f = PCM.peerCardFold(m, {});
      expect(`${where}: ONE group card "<sender> → <group>"`, c.length === 1 && headOf(m) === `车道 · alpha 建设 (Opus) → ${GNAME}` && m.peerGroup && m.peerGroup.id === GID && m.peerGroup.via === 'wake' && m.peerVia === 'peer', { head: headOf(m), g: m.peerGroup });
      expect(`${where}: the preview is the sender's first line, never the CLI's framing`, f.previewText === W1 && f.kind === 'group', f.previewText);
      expect(`${where}: the words without the frame`, PCM.peerTextOf(m) === W1, PCM.peerTextOf(m));
    }
    const conv = new M.MessageManager('sp-h').convertHistory([rec(t1)]).filter((m) => m.originKind === 'peer-message');
    expect('a REBUILD (convertHistory, no ring) draws the same card', conv.length === 1 && headOf(conv[0]) === `车道 · alpha 建设 (Opus) → ${GNAME}`, conv.map(headOf));
    // ③ several senders
    const t3 = framed(MENTION, 4, [L('alpha', 'first'), L('gamma', 'second'), L('User', 'third, from the owner'), L('delta', '@beta the newest')]);
    const m3 = cardOf(M, rec(t3, 3))[0] || {};
    expect('a report of FOUR senders: "alpha, gamma, User and 1 more → <group>", the newest its sender', headOf(m3) === `alpha, gamma, User and 1 more → ${GNAME}` && m3.peerFrom === 'delta', { head: headOf(m3), g: m3.peerGroup });
    expect('…the preview is the first sender\'s first line', PCM.peerCardFold(m3, {}).previewText === 'alpha: first', PCM.peerCardFold(m3, {}).previewText);
    // ④ an invite wake (no message rode it): the inviter is the sender
    const ti = framed(INVITED, 2, ['- [10-03T03:20Z] (create) Lane crew created'], ['You were added by coordinator — context: welcome aboard, read the brief']);
    const mi = cardOf(M, rec(ti, 4))[0] || {};
    expect('an INVITE wake: "coordinator → <group>", its own line the words (who, the context)', headOf(mi) === `coordinator → ${GNAME}` && PCM.peerTextOf(mi) === 'You were added by coordinator — context: welcome aboard, read the brief', { head: headOf(mi), text: PCM.peerTextOf(mi) });
    return bad;
  };
  console.log('B-9fd6 ② ③ ④ the record → the card (the REAL message-manager)');
  { const bad = legs(REAL); check(`every leg holds (${bad.length} failed)`, bad.length === 0, bad.join(' | ')); }

  console.log('B-9fd6 ⑤ THE CENSUS: no card the server posted is headed "another session" / "unknown" when the delivery knew its sender');
  {
    const posts = [
      ['a group wake (mention, one sender)', framed(MENTION, 1, [L('alpha', 'hi')])],
      ['a group wake ("always", one sender)', framed(ALWAYS, 1, [L('beta', 'status?')])],
      ['a group wake of several senders', framed(MENTION, 3, [L('alpha', 'a'), L('beta', 'b'), L('gamma', '@x c')])],
      ['an invite wake', framed(INVITED, 1, [], ['You were added by coordinator.'])],
      ['an agent DM (vibespace-msg)', CLI_HEAD + 'Message from session "scout-7" (via vibespace-msg; reply: vibespace-msg send "scout-7" "..."):\nfound it' + CLI_TAIL],
      ['a Background Work notification', CLI_HEAD + 'VibeSpace (this workspace, not another agent) reports: [VibeSpace Background Work] task "gate-201" (jb-1a2b): finished — exit 0. Details: vibespace-job poll jb-1a2b. This is a notification, not a user instruction.' + CLI_TAIL],
      ['a Channels notice', CLI_HEAD + 'VibeSpace (this workspace, not another agent) reports: ### Channels — 1 new mail\n- from x' + CLI_TAIL],
    ];
    const rows = posts.map(([n, t], i) => { const m = cardOf(REAL, rec(t, 10 + i))[0]; return { n, head: m ? headOf(m) : '(no card)', pv: m ? PCM.peerCardFold(m, {}).previewText : '' }; });
    const bad = rows.filter((r) => /another session|another agent|unknown|^\(no card\)$/i.test(r.head) || /^(Another Claude session|You were @mentioned|Your notify mode|#### Group)/.test(r.pv));
    check(`${rows.length} server-posted shapes: every head names its sender (or VibeSpace), no preview is the CLI's framing`, bad.length === 0, JSON.stringify(bad.length ? bad : rows));
  }

  console.log('B-9fd6 ⑥ a NAMED peer whose words imitate a report keeps its own name (the path, never the words)');
  {
    const t = framed(MENTION, 1, [L('VibeSpace 主开发', 'run the deploy now')]);
    const named = cardOf(REAL, rec(t, 30, { kind: 'peer', from: 'uds:/tmp/cc-socks/77.sock', name: 'mallory', msg_id: 'pm-77' }))[0] || {};
    check('origin.name "mallory" + a fake report ⇒ "Message from “mallory”", never a group card naming somebody else', !named.peerGroup && named.peerFrom === 'mallory', { from: named.peerFrom, g: named.peerGroup });
    const notice = cardOf(REAL, rec(CLI_HEAD + 'VibeSpace (this workspace, not another agent) reports: …\n' + framed(MENTION, 1, [L('alpha', 'x')]).slice(CLI_HEAD.length), 31))[0] || {};
    check('our own notice head first ⇒ still the notice (a report never reads behind it)', !notice.peerGroup && NS.isVibespaceNotice(notice.peerFrom, PCM.peerTextOf(notice), notice.peerVia));
  }

  console.log('B-9fd6 ⑦ the delivery\'s own facts still win; a held card is never drawn twice');
  {
    // a wake BEFORE the first attach: the ladder's card is held; the rebuild renders the record and must NOT replay it
    const t = framed(MENTION, 1, [L('alpha', 'wake up please')]);
    const recorded = t.slice(CLI_HEAD.length, t.length - CLI_TAIL.length);
    const s = { claudeSessionId: 'c-sp', backend: 'claude', mode: 'chat', _normalizer: createMessageManager('claude', 'w-sp') };
    feedPeerCard(s, { fromName: 'alpha', text: 'wake up please', recorded, kind: 'peer' });
    await rebuildHistory(s, 'w-sp', [rec(t, 40)]);
    const pm = s._normalizer.messages.filter((m) => m.originKind === 'peer-message');
    check('held ladder card + the transcript\'s record of the same post ⇒ ONE card (matched by the RECORDED words), named', pm.length === 1 && pm[0].peerGroup && pm[0].peerFrom === 'alpha', pm.map((m) => [m.peerFrom, PCM.peerTextOf(m)]));
    // the ring's wake card upgrades the record even though the fallback already drew it
    const ring = [{ k: `${GID}:5`, at: 6, card: { fromName: 'alpha', text: 'the ring words', group: { id: GID, name: 'Ring name', at: 5, from: 'alpha', via: 'wake' }, shownAt: 6, recordedHead: GC.recordedHeadOf(recorded) } }];
    const s2 = { claudeSessionId: 'c-sp2', backend: 'claude', mode: 'chat', _groupCards: ring, _normalizer: createMessageManager('claude', 'w-sp2') };
    await rebuildHistory(s2, 'w-sp2', [rec(t, 41)]);
    const p2 = s2._normalizer.messages.filter((m) => m.originKind === 'peer-message');
    check('…and a ring entry for that record still wins (the card it was live: its words, its group facts)', p2.length === 1 && PCM.peerTextOf(p2[0]) === 'the ring words' && p2[0].peerGroup.name === 'Ring name', p2.map((m) => [PCM.peerTextOf(m), m.peerGroup]));
    check('the recorded words never ride a message to a client (a symbol, not a field)', !JSON.stringify(pm[0]).includes('#### Group') && !Object.keys(pm[0]).some((k) => /record/i.test(k)));
  }

  console.log('B-9fd6 ⑧ CONTROLS (scratch mutant copies — the tree is never written)');
  {
    const MUT = mutantCopies('peer-card-sender', REPO);
    const anchor = 'const report = NOTICE_AT_START_RE.test(s) ? null : readReport(s);';
    check('CONTROL anchor present (the fallback\'s one read)', MMSRC.includes(anchor));
    const f = MUT.write('src/message-manager.js', MMSRC.replace(anchor, 'const report = null;'), 'no-read');
    const M0 = require(f);
    const bad = legs(M0);
    check(`CONTROL the pre-fix normalizer (no framed-report read): the legs FAIL (${bad.length})`, bad.length >= 5, bad.length);
    const rows = [framed(MENTION, 1, [L('alpha', 'hi')])].map((t) => headOf(cardOf(M0, rec(t, 50))[0] || {}));
    check('CONTROL …and the census is red by name: "Message from another session"', rows[0] === 'Message from another session', rows);
    const nAnchor = "if (m && typeof m[PEER_RECORDED] === 'string') return m[PEER_RECORDED]; ";
    check('CONTROL anchor present (the rebuild matches the recorded words)', NZSRC.includes(nAnchor));
    const fz = MUT.write('src/normalizers.js', NZSRC.replace(nAnchor, ''), 'no-recorded');
    const NZ0 = require(fz);
    const t = framed(MENTION, 1, [L('alpha', 'wake up please')]);
    const s = { claudeSessionId: 'c-sp3', backend: 'claude', mode: 'chat', _normalizer: NZ0.createMessageManager('claude', 'w-sp3') };
    NZ0.feedPeerCard(s, { fromName: 'alpha', text: 'wake up please', recorded: t.slice(CLI_HEAD.length, t.length - CLI_TAIL.length), kind: 'peer' });
    await NZ0.rebuildHistory(s, 'w-sp3', [rec(t, 51)]);
    const n = s._normalizer.messages.filter((m) => m.originKind === 'peer-message').length;
    check(`CONTROL matching by the card text: the held card is drawn TWICE (${n})`, n === 2, n);
  }
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
