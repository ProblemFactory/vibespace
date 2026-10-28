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
// A turn whose text holds `TOOL-` RUNS A TOOL (lane claude-steer-inject, the R0 recording in
// /var/tmp/vibespace-lanes/claude-steer-inject/measure — 2.1.308, a local mock /v1/messages): init → an assistant
// tool_use (Bash) → the tool works for $STAND_IN_LONG_MS → the user tool_result record → and a frame that arrived WHILE
// the tool ran is TAKEN INTO THE TURN there (the real CLI appends «The user sent a new message while you were working:
// <text>» to that tool result — stdout says nothing of it) → the assistant answers with it (`took in: …`) → result →
// idle. A frame that arrives when the turn has no tool result left (a LONG- text turn, or after the tool) waits and runs
// as a turn of its own right after the result (init with no idle between — measured). An interrupt while the tool runs
// answers a rejected tool_result + «[Request interrupted by user for tool use]» + result/error_during_execution, then
// the CLI RUNS what it was holding as a turn of its own (measured +11 ms); that follow-up turn is still before its
// request for $STAND_IN_FOLLOW_MS (default 300 — the real one waits on the model), so an interrupt there ends it with
// «[Request interrupted by user]» and no answer (measured 6/6 with a second interrupt on the follow-up init line).
//   $STAND_IN_DELIVERED  every frame the "model" read, appended as {how: 'tool_result' | 'turn', text, turn}
// What the CLI held when a turn ends runs as ONE follow-up turn (acceptance r2, measured on 2.1.308: two frames handed
// before a Stop came back as one follow-up — one init, one request carrying both); a slash command still runs alone.
//   $STAND_IN_SPLIT_FOLLOW=1  each held frame its own follow-up turn instead (the shape the real CLI showed for a frame
//                      that reached it 15–22 ms after a Stop — a SECOND follow-up turn)
//   $STAND_IN_NO_STATE=1  never say session_state_changed (a CLI before 2.1.257, or the env switch unset — the
//                      wrapper must then advertise no hand-over and fall back to the result alone)
//   $STAND_IN_POST_MS  how long the model takes to answer after a tool result (default 5) — the window in which a Stop
//                      finds a frame already TAKEN IN (it rode the tool result: the conversation has it as read)
// A TOOL- turn whose text also holds `LONGER-` runs its tool three times as long (a turn that outlives a server restart).
//   $STAND_IN_HELPER_MS  how long a BGAGENT- helper works (default $STAND_IN_LONG_MS) — past a Stop, the session stays
//                      'running' with no idle (the shape a Stop window must not wait on for ever)
// Its records are VERSION-KEYED (lane claude-steer-inject r3): $STAND_IN_CLI_VERSION (default 2.1.312, the build the R0 table was
// re-measured on 2026-10-27 — the same rows as 2.1.308) names the build in every init, and from 2.1.312 on every `result` carries
// model_usage_since_last_result (measured on every result of a local stream-json 2.1.312; `{}` = nothing counted — the stand-in bills
// nothing). STAND_IN_CLI_VERSION=2.1.308 writes the 2.1.308 result. test-record-shape judges both against src/record-shape.js.
// Used by scripts/test-queue-putback.mjs §6, scripts/test-queue-steer.mjs ⑯ and scripts/test-claude-steer-chrome.mjs.
// Never a vendor call: no network at all.
const fs = require('fs');
const CAP = process.env.STUB_CAPTURE || '';
const DELIVERED = process.env.STAND_IN_DELIVERED || '';
const LONG_MS = Number(process.env.STAND_IN_LONG_MS || 4000);
const FOLLOW_MS = Number(process.env.STAND_IN_FOLLOW_MS || 300);
const SPLIT_FOLLOW = process.env.STAND_IN_SPLIT_FOLLOW === '1';
const NO_STATE = process.env.STAND_IN_NO_STATE === '1';
const POST_MS = Number(process.env.STAND_IN_POST_MS || 5);
const HELPER_MS = Number(process.env.STAND_IN_HELPER_MS || LONG_MS);
const CLI_VERSION = process.env.STAND_IN_CLI_VERSION || '2.1.312';
const atLeast = (v) => { const a = CLI_VERSION.split('.').map(Number), b = v.split('.').map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return true; };
const SINCE_LAST = atLeast('2.1.312'); // the per-result usage delta 2.1.312 writes on every result
const argv = process.argv.slice(2);
const argAfter = (flag) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const SID = argAfter('--session-id') || argAfter('--resume') || '00000000-0000-4000-8000-00000000c0de';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let busy = null;
const queued = [];
let turnSeq = 0;
const delivered = (how, text) => { if (DELIVERED) fs.appendFileSync(DELIVERED, JSON.stringify({ how, text, turn: turnSeq }) + '\n'); };
let state = 'idle';
let helper = null;   // the background helper's timer while it works
const setState = (st) => { if (st === state) return; state = st; if (!NO_STATE) out({ type: 'system', subtype: 'session_state_changed', state: st, session_id: SID }); };
const textOf = (f) => { const c = f.message && f.message.content; return typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : ''); };
const isCommand = (f) => /^\s*\//.test(textOf(f));
/** What runs next after a turn ends: every held frame up to the first command, as ONE turn (the measured batching) —
 *  or one frame ($STAND_IN_SPLIT_FOLLOW, or a command, which always runs alone). */
function nextFollow() {
  if (SPLIT_FOLLOW || isCommand(queued[0])) return queued.shift();
  const batch = [];
  while (queued.length && !isCommand(queued[0])) batch.push(queued.shift());
  if (batch.length === 1) return batch[0];
  return { type: 'user', message: { role: 'user', content: batch.map((f) => ({ type: 'text', text: textOf(f) })) } };
}
function end(subtype) {
  if (!busy) return;
  clearTimeout(busy.timer);
  const interrupted = subtype !== 'success';
  if (interrupted && busy.tool) {
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: busy.tool, content: "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.", is_error: true }] } });
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } });
  } else if (interrupted && (busy.follow || busy.post)) {
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
  }
  out({ type: 'result', subtype, is_error: interrupted, result: busy.text, session_id: SID, duration_ms: 1, total_cost_usd: 0, ...(SINCE_LAST ? { model_usage_since_last_result: {} } : {}) });
  busy = null;
  // what the CLI was holding runs as a turn of its own — after an interrupt too (measured); after an interrupt its
  // request is still out for FOLLOW_MS when a second interrupt can end it
  if (queued.length) { const fol = interrupted; const next = nextFollow(); setImmediate(() => start(next, { follow: fol })); return; }
  if (!helper) setState('idle');
}
function start(f, { follow = false } = {}) {
  const text = textOf(f);
  turnSeq++;
  delivered('turn', text);
  busy = { text, timer: null, follow };
  setState('running');
  if (/BGAGENT-/.test(text) && !helper) {
    helper = setTimeout(() => {
      helper = null;
      const note = { type: 'user', message: { role: 'user', content: '<task-notification>the background helper finished</task-notification>' } };
      if (busy) queued.push(note); else start(note);
    }, HELPER_MS);
  }
  out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: CLI_VERSION });
  const say = (t) => out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_' + Date.now(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: t }] } });
  if (/TOOL-/.test(text) && !follow) {
    const toolId = 'toolu_stand_in_' + turnSeq;
    busy.tool = toolId;
    out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_t' + Date.now(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command: 'sleep 8', description: 'Sleep 8 seconds' } }] } });
    busy.timer = setTimeout(() => {
      out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: '(Bash completed with no output)', is_error: false }] } });
      busy.tool = null; busy.post = true;
      // every frame that arrived while the tool ran rides THIS tool result into the turn (the CLI's own queue — a
      // slash command never does: it waits for its own turn)
      const took = [];
      for (let i = 0; i < queued.length;) { const t = textOf(queued[i]); if (/^\s*\//.test(t)) { i++; continue; } took.push(t); queued.splice(i, 1); }
      for (const t of took) delivered('tool_result', t);
      busy.timer = setTimeout(() => { say('done after the tool' + (took.length ? ' — took in: ' + took.join(' | ') : '')); end('success'); }, POST_MS);
    }, /LONGER-/.test(text) ? LONG_MS * 3 : LONG_MS);
    return;
  }
  busy.timer = setTimeout(() => { say('reply: ' + text); end('success'); }, follow ? FOLLOW_MS : (/LONG-/.test(text) ? LONG_MS : 5));
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
