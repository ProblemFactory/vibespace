#!/usr/bin/env node
// R0 — content-derived message ids (docs/design-three-tier.md).
//
// The old id was `${sessionId}:${counter}` — every parser rebuild renumbered
// everything, which forces the client's full-view reset on each server
// restart and makes device-side parsing impossible (daemon self-upgrades are
// routine). This test pins the new contract:
//   1. REBUILD STABILITY — the same record stream parses to the same ids.
//   2. CROSS-TRANSPORT JOIN — the stdout copy and the JSONL copy of the SAME
//      message derive the SAME id (message.id preferred; tool messages key on
//      toolCallId), so a device-parsed history merges a server-parsed live
//      stream by construction.
//   3. Replay overlap collapses (same tool_use twice = one message).
//   4. Keyless records (hash fallback) stay stable and never collide.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MessageManager } = require('../src/message-manager.js');
const { CodexMessageManager } = require('../src/codex-message-manager.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const mk = () => new MessageManager('S');

const PLACEHOLDER = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
const stdoutStream = [
  { type: 'system', subtype: 'init', model: 'claude-fable-5', uuid: PLACEHOLDER, timestamp: '2026-08-10T10:00:00Z' },
  { type: 'user', uuid: 'u1-1111-1111-1111-abcdefabcdef', timestamp: '2026-08-10T10:00:01Z', message: { role: 'user', content: 'hello there' } },
  // ONE stdout record carrying thinking + text + tool_use (placeholder uuid, real message.id)
  { type: 'assistant', uuid: PLACEHOLDER, timestamp: '2026-08-10T10:00:02Z', requestId: 'req_1',
    message: { id: 'msg_ABC', model: 'claude-fable-5', content: [
      { type: 'thinking', thinking: 'let me think' },
      { type: 'text', text: 'the answer' },
      { type: 'tool_use', id: 'toolu_T1', name: 'Bash', input: { command: 'ls' } },
    ], usage: { input_tokens: 10, output_tokens: 5 } } },
  { type: 'user', uuid: 'u2-2222-2222-2222-abcdefabcdef', timestamp: '2026-08-10T10:00:03Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_T1', content: 'file.txt' }] } },
  { type: 'result', subtype: 'success', timestamp: '2026-08-10T10:00:04Z', total_cost_usd: 0.01 },
];
// the SAME conversation as a JSONL rebuild would see it: per-block records,
// REAL uuids, same message.id
const jsonlStream = [
  { type: 'system', subtype: 'init', model: 'claude-fable-5', uuid: 'j0-0000-0000-0000-abcdefabcdef', timestamp: '2026-08-10T10:00:00Z' },
  { type: 'user', uuid: 'u1-1111-1111-1111-abcdefabcdef', timestamp: '2026-08-10T10:00:01Z', message: { role: 'user', content: 'hello there' } },
  { type: 'assistant', uuid: 'j1-aaaa-0000-0000-abcdefabcdef', timestamp: '2026-08-10T10:00:02Z',
    message: { id: 'msg_ABC', model: 'claude-fable-5', content: [{ type: 'thinking', thinking: 'let me think' }] } },
  { type: 'assistant', uuid: 'j2-bbbb-0000-0000-abcdefabcdef', timestamp: '2026-08-10T10:00:02Z',
    message: { id: 'msg_ABC', model: 'claude-fable-5', content: [{ type: 'text', text: 'the answer' }] } },
  { type: 'assistant', uuid: 'j3-cccc-0000-0000-abcdefabcdef', timestamp: '2026-08-10T10:00:02Z',
    message: { id: 'msg_ABC', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_T1', name: 'Bash', input: { command: 'ls' } }] } },
  { type: 'user', uuid: 'u2-2222-2222-2222-abcdefabcdef', timestamp: '2026-08-10T10:00:03Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_T1', content: 'file.txt' }] } },
];

// ── 1. rebuild stability ──
const a = mk(); a.convertHistory(stdoutStream);
const b = mk(); b.convertHistory(stdoutStream);
ok(JSON.stringify(a.messages.map((m) => m.id)) === JSON.stringify(b.messages.map((m) => m.id)),
  'same stream twice → identical id sequence (restart stops renumbering)');
ok(a.messages.every((m) => !/^S:\d+$/.test(m.id)), 'no message carries a bare counter id');

// ── 2. cross-transport join ──
const j = mk(); j.convertHistory(jsonlStream);
const idsBy = (mm, pred) => mm.messages.filter(pred).map((m) => m.id);
const toolA = idsBy(a, (m) => m.role === 'tool')[0];
const toolJ = idsBy(j, (m) => m.role === 'tool')[0];
ok(toolA === 'S:t:toolu_T1' && toolJ === toolA, `tool message keys on toolCallId on BOTH transports (${toolA})`);
const textA = a.messages.find((m) => m.role === 'assistant' && m.content[0]?.type === 'text')?.id;
const textJ = j.messages.find((m) => m.role === 'assistant' && m.content[0]?.type === 'text')?.id;
ok(textA && textA === textJ, `assistant text derives the SAME id from stdout and JSONL copies (${textA})`);
const thinkA = a.messages.find((m) => m.content[0]?.type === 'thinking')?.id;
const thinkJ = j.messages.find((m) => m.content[0]?.type === 'thinking')?.id;
ok(thinkA && thinkA === thinkJ, `thinking block joins too (${thinkA})`);
ok(textA !== thinkA, 'sibling blocks of one API message get DISTINCT ids (per-key counter)');
const userA = a.messages.find((m) => m.role === 'user')?.id;
const userJ = j.messages.find((m) => m.role === 'user')?.id;
ok(userA === userJ && userA.includes('u:u1-'), 'user records key on their (real) uuid');

// ── 3. replay overlap collapses ──
const c = mk(); c.convertHistory([...stdoutStream, stdoutStream[2]]); // tool_use record replayed
ok(c.messages.filter((m) => m.role === 'tool').length === 1, 'duplicate tool_use replay = ONE tool message (no double card)');

// ── 4. keyless records: stable + collision-free ──
const r1 = a.messages.find((m) => m.content[0]?.type === 'result' || m.role === 'system' && m.id.includes('h:'));
const twins = mk();
twins.convertHistory([
  { type: 'system', subtype: 'init', model: 'x' },
  { type: 'system', subtype: 'init', model: 'x' }, // identical twin, no uuid
]);
const twinIds = twins.messages.map((m) => m.id);
ok(new Set(twinIds).size === twinIds.length, 'two IDENTICAL keyless records get distinct ids (deterministic suffix)');
const twins2 = mk();
twins2.convertHistory([{ type: 'system', subtype: 'init', model: 'x' }, { type: 'system', subtype: 'init', model: 'x' }]);
ok(JSON.stringify(twinIds) === JSON.stringify(twins2.messages.map((m) => m.id)), 'keyless ids stable across rebuilds');

// ── 5. tool_result still resolves (edit targeting by stable id) ──
const tool = a.messages.find((m) => m.role === 'tool');
ok(tool.status === 'complete' && tool.content[0].type === 'tool_result', 'tool_result resolved the stable-id tool message');

// ── 6. streaming repeat edits in place (same message.id re-emitted) ──
const s = mk();
const rec = (text) => ({ type: 'assistant', uuid: PLACEHOLDER, message: { id: 'msg_S', model: 'm', content: [{ type: 'text', text }] } });
s.processLive(rec('partial'));
s.processLive(rec('partial + more'));
const texts = s.messages.filter((m) => m.role === 'assistant');
ok(texts.length === 1 && texts[0].content[0].text === 'partial + more', 'streaming re-emit of one message edits in place (no dup, no id churn)');

// ── 7. codex: rebuild-stable + volatile-field-immune ──
const cx1 = new CodexMessageManager('C');
const cxRecords = [
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }], item_id: 'item_live_1' } },
  { type: 'event_msg', payload: { type: 'agent_reasoning', text: 'thinking...', item_id: 'item_live_2' } },
];
cx1.convertHistory(cxRecords);
const cx2 = new CodexMessageManager('C');
cx2.convertHistory([
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }], id: 'item_jsonl_1' } },
  { type: 'event_msg', payload: { type: 'agent_reasoning', text: 'thinking...', id: 'item_jsonl_9' } },
]);
ok(JSON.stringify(cx1.messages.map((m) => m.id)) === JSON.stringify(cx2.messages.map((m) => m.id)),
  'codex: buffer copy (item_id) and rollout copy (id) derive IDENTICAL ids (volatile fields stripped)');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
