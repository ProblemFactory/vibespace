#!/usr/bin/env node
// Codex feature-completeness pins (2.368.15, owner audit of a real session):
// a 582-record rollout normalized into a view with 52 tool cards stuck
// "pending" forever (custom_tool_call_output was NEVER ROUTED — only the
// function_call twin was), invisible sub-agents, and a live status bar that
// could not show context% until re-attach. Shapes below are verbatim from
// the real rollout (ids sanitized).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = await import('node:path');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { CodexMessageManager } = require(REPO + '/src/codex-message-manager.js');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

// ── custom_tool_call + its output twin (the stuck-card fix) ──
{
  const mm = new CodexMessageManager('t1');
  const msgs = mm.convertHistory([
    { type: 'response_item', payload: { type: 'custom_tool_call', id: 'ctc_1', call_id: 'call_A', name: 'shell', input: '{"command":"vibespace-status done"}' } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', id: 'ctco_1', call_id: 'call_A', output: [{ type: 'input_text', text: 'Script completed\n' }, { type: 'input_text', text: 'status set: done\n' }] } },
  ]);
  const tool = msgs.find((m) => m.role === 'tool');
  ok('custom_tool_call_output is ROUTED (52 cards stuck pending in one real session)', tool && tool.status === 'complete', JSON.stringify(tool?.status));
  ok('array-of-blocks output is flattened to text, not a JSON blob', tool?.content?.[0]?.output === 'Script completed\nstatus set: done\n', JSON.stringify(tool?.content?.[0]?.output));
}

// ── sub-agent visibility (Codex sub-agent threads, 2026-08 CLI) ──
{
  const mm = new CodexMessageManager('t2');
  const msgs = mm.convertHistory([
    { type: 'event_msg', payload: { type: 'sub_agent_activity', event_id: 'call_B', occurred_at_ms: 1, agent_thread_id: '01a0338e-79d3-7820-a298-b119d4ec5bb3', agent_path: '/root/paper_analysis', kind: 'started' } },
    { type: 'event_msg', payload: { type: 'sub_agent_activity', event_id: 'call_B', occurred_at_ms: 2, agent_thread_id: '01a0338e-79d3-7820-a298-b119d4ec5bb3', agent_path: '/root/paper_analysis', kind: 'interacted' } },
  ]);
  const lines = msgs.filter((m) => (m.content || []).some((c) => c.type === 'system_info' && /sub-agent/i.test(c.text || '')));
  ok('a sub-agent spawn is announced (it was fully invisible)', lines.length === 1 && /paper_analysis/.test(JSON.stringify(lines[0].content)));
  ok("'interacted' churn does not spam extra lines", lines.length === 1);
}

// ── live context%: contextWindow rides the usage meta ──
{
  const mm = new CodexMessageManager('t3');
  const metas = [];
  mm.onOp((op) => { if (op.op === 'meta' && op.subtype === 'usage') metas.push(op.data); });
  mm.processLive({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 16371, cached_input_tokens: 11008, cache_write_input_tokens: 0, output_tokens: 125, reasoning_output_tokens: 104, total_tokens: 16496 }, last_token_usage: { input_tokens: 16371, cached_input_tokens: 11008, cache_write_input_tokens: 0, output_tokens: 125, reasoning_output_tokens: 104, total_tokens: 16496 }, model_context_window: 828400 } } });
  ok('usage meta carries contextWindow (live context% showed "?" until re-attach)', metas.length === 1 && metas[0].contextWindow === 828400, JSON.stringify(metas[0]));
  const sb = require('node:fs').readFileSync(REPO + '/src/lib/chat-status-bar.js', 'utf8');
  ok('…and the status bar consumes it in updateUsage', /updateUsage\(usageData\)[\s\S]{0,600}u\.contextWindow\) this\._statusContextWindow = u\.contextWindow/.test(sb));
}

// ── encrypted reasoning: silently absent, never a broken card ──
{
  const mm = new CodexMessageManager('t4');
  const msgs = mm.convertHistory([
    { type: 'response_item', payload: { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAAAA…' } },
  ]);
  ok('encrypted reasoning (no summary) yields no message — upstream withholds the text; a blank thinking card would read as a bug', msgs.length === 0, JSON.stringify(msgs));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
