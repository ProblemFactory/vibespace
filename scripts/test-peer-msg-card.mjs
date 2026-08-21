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
const require = createRequire(import.meta.url);
const { MessageManager } = require('../src/message-manager.js');

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

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
