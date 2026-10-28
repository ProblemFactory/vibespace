'use strict';
// THE STAND-IN CLAUDE CLI (lane claude-wrapper-queue, 2.369.354) — the stream-json turn shape the REAL CLI was measured
// with (2.1.308 + a local mock /v1/messages; the same rows re-measured on 2.1.312): every user frame is a turn — system/session_state_changed 'running' →
// … → `result` → 'idle' — a frame that arrives MID-TURN is queued here and run after (the CLI's own queue), and a
// `control_request {subtype:'interrupt'}` is answered, ends the running turn (result/error_during_execution + idle)
// and then RUNS what it had queued (measured: +27 ms). That last behaviour is why data/bin/chat-wrapper.js holds a
// mid-turn frame itself — a leg that forwards one to this stand-in watches it run after Stop (the CONTROL).
//   $STUB_CAPTURE      every stdin line, appended (what the "CLI" really got)
//   $STAND_IN_LONG_MS  how long a turn whose text holds `LONG-` runs (default 4000; anything else ends in 5 ms)
//   $STAND_IN_BOOT_INIT=1  say a `system/init` at startup, before any input (older stand-ins in the suites do; the REAL
//                      CLI says nothing before its first input, fresh or resumed — measured on 2.1.308)
// Each turn's `system/init` names the session it was spawned for (`--session-id` / `--resume` argv, else a fixed id) —
// the server adopts a conversation's id from the first id-bearing line, as it does the real CLI's.
// A turn whose text holds `BGAGENT-` launches a BACKGROUND HELPER that works for $STAND_IN_LONG_MS: as measured on 2.1.308,
// the turn still ends in `result`, but the session stays 'running' (NO idle) until the helper ends; a prompt sent
// meanwhile runs at once (init → … → result, no state event); when the helper ends, the CLI runs a turn of its own for
// its notification, and only then says 'idle'. The state is said only when it CHANGES.
// Its records are VERSION-KEYED (lane claude-steer-inject r3): $STAND_IN_CLI_VERSION (default 2.1.312, the build the R0 table was
// re-measured on 2026-10-27 — the same rows as 2.1.308) names the build in every init, and from 2.1.312 on every `result` carries
// model_usage_since_last_result (measured on every result of a local stream-json 2.1.312; `{}` = nothing counted — the stand-in bills
// nothing). STAND_IN_CLI_VERSION=2.1.308 writes the 2.1.308 result. test-record-shape judges both against src/record-shape.js.
// Used by scripts/test-queue-putback.mjs §6 and scripts/test-queue-steer.mjs ⑯. Never a vendor call: no network at all.
const fs = require('fs');
const CAP = process.env.STUB_CAPTURE || '';
const LONG_MS = Number(process.env.STAND_IN_LONG_MS || 4000);
const CLI_VERSION = process.env.STAND_IN_CLI_VERSION || '2.1.312';
const atLeast = (v) => { const a = CLI_VERSION.split('.').map(Number), b = v.split('.').map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return true; };
const SINCE_LAST = atLeast('2.1.312'); // the per-result usage delta 2.1.312 writes on every result
const argv = process.argv.slice(2);
const argAfter = (flag) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const SID = argAfter('--session-id') || argAfter('--resume') || '00000000-0000-4000-8000-00000000c0de';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let busy = null;
const queued = [];
let state = 'idle';
let helper = null;   // the background helper's timer while it works
const setState = (st) => { if (st === state) return; state = st; out({ type: 'system', subtype: 'session_state_changed', state: st, session_id: SID }); };
const textOf = (f) => { const c = f.message && f.message.content; return typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : ''); };
function end(subtype) {
  if (!busy) return;
  clearTimeout(busy.timer);
  out({ type: 'result', subtype, is_error: subtype !== 'success', result: busy.text, session_id: SID, duration_ms: 1, total_cost_usd: 0, ...(SINCE_LAST ? { model_usage_since_last_result: {} } : {}) });
  busy = null;
  if (queued.length) { setImmediate(() => start(queued.shift())); return; }
  if (!helper) setState('idle');
}
function start(f) {
  const text = textOf(f);
  busy = { text, timer: null };
  setState('running');
  if (/BGAGENT-/.test(text) && !helper) {
    helper = setTimeout(() => {
      helper = null;
      const note = { type: 'user', message: { role: 'user', content: '<task-notification>the background helper finished</task-notification>' } };
      if (busy) queued.push(note); else start(note);
    }, LONG_MS);
  }
  out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: CLI_VERSION });
  busy.timer = setTimeout(() => { out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_' + Date.now(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: 'reply: ' + text }] } }); end('success'); }, /LONG-/.test(text) ? LONG_MS : 5);
}
if (process.env.STAND_IN_BOOT_INIT === '1') out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: CLI_VERSION });
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    if (CAP) fs.appendFileSync(CAP, line + '\n');
    let f; try { f = JSON.parse(line); } catch { continue; }
    if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') {
      out({ type: 'control_response', response: { subtype: 'success', request_id: f.request_id } });
      end('error_during_execution');
      continue;
    }
    if (f.type !== 'user') continue;
    // the real CLI ignores a frame whose content is neither a string nor an array (measured: no running, no result)
    if (!f.message || !(typeof f.message.content === 'string' || Array.isArray(f.message.content))) continue;
    if (busy) queued.push(f); else start(f);
  }
});
process.stdin.on('end', () => process.exit(0));
