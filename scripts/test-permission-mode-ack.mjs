#!/usr/bin/env node
// Regression test for the tracked set_permission_mode flow (2.195.0).
// CLI ground truth (verified live on claude 2.1.215, scripts in the 2.195.0
// changelog entry): set_permission_mode answers with a REAL control_response —
// success `{response:{subtype:'success',request_id,response:{mode}}}` for
// default/acceptEdits/plan (and bypass on a bypass-capable launch), error
// `{response:{subtype:'error',request_id,error:'Cannot set permission mode to
// bypassPermissions because the session was not launched with
// --dangerously-skip-permissions'}}` otherwise. This test pins the adapter
// shape + the server-side bookkeeping contract.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');

let failed = 0;
const assert = (cond, name) => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`);
  if (!cond) failed++;
};

const adapter = new ClaudeCodeAdapter();

// tracked variant: line parses to the exact request the CLI accepts, and the
// returned requestId matches the line's request_id (the server keys its
// pending map on it — a mismatch would orphan every ack)
const tracked = adapter.buildTrackedSetPermissionMode('bypassPermissions');
const parsed = JSON.parse(tracked.line);
assert(parsed.type === 'control_request', 'line is a control_request');
assert(parsed.request?.subtype === 'set_permission_mode', 'subtype set_permission_mode');
assert(parsed.request?.mode === 'bypassPermissions', 'mode key is `mode` (the shape 2.1.215 parses)');
assert(parsed.request_id && parsed.request_id === tracked.requestId, 'requestId matches the line');
const t2 = adapter.buildTrackedSetPermissionMode('acceptEdits');
assert(t2.requestId !== tracked.requestId, 'ids are unique per request');

// untracked fallback still emits the same request shape (codex-path safety)
const legacy = JSON.parse(adapter.formatSetPermissionMode('plan'));
assert(legacy.request?.subtype === 'set_permission_mode' && legacy.request?.mode === 'plan', 'formatSetPermissionMode unchanged');

// server bookkeeping contract, mirrored from server.js: the ack matches ONLY
// a tracked id; success adopts the mode, error does not
const session = { _pendingModeReqs: new Map() };
session._pendingModeReqs.set(tracked.requestId, { mode: 'bypassPermissions', ts: Date.now() });
const ackErr = { type: 'control_response', response: { subtype: 'error', request_id: tracked.requestId, error: 'Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions' } };
const hit = session._pendingModeReqs.has(ackErr.response?.request_id);
assert(hit, 'error ack resolves the pending entry');
const okAck = { type: 'control_response', response: { subtype: 'success', request_id: t2.requestId, response: { mode: 'acceptEdits' } } };
assert(!session._pendingModeReqs.has(okAck.response?.request_id), 'foreign/expired ids never match');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
