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
//   $STAND_IN_RELEASE_FILE  set: a LONGER- turn's tool ends only once THAT FILE exists (polled every 50 ms; 180 s at most) — the leg
//                      releases it AFTER what must happen inside the turn (a server restart and the page back), never a clock.
//                      Unset: as before.
// THE CONVERSATION'S FACTS (lane conversation-facts): a turn whose text holds `BGSET-` says the level signal with one background
// task (`system/background_tasks_changed` with its uuid, as the dumps declare — the shape src/message-manager.js reads), `BGEMPTY-` says it with none, `WAKE-` writes
// a fired loop wakeup (`command_lifecycle` started + `wakeup_source` / `scheduled_for`, src/record-shape.js:341-342), and
// `BURST-` answers with 2000 assistant records in one go (a leg counts the wrapper's sidecar writes over them). `BGSHELL-` asks a
// Bash to run in the background (its input's `run_in_background`); `BGDONE-` ends it — both in the order 主开发's census measured on
// 2.1.322 (scripts/fixtures/claude-cli/2.1.322-background-kinds.jsonl): the set naming it BEFORE its task_started (is_backgrounded,
// run_id); at the end task_updated completed, task_notification completed, THEN the set published empty.
//   $STAND_IN_HELPER_MS  how long a BGAGENT- helper works (default $STAND_IN_LONG_MS) — past a Stop, the session stays
//                      'running' with no idle (the shape a Stop window must not wait on for ever)
// THE HOLDS (r5473, test-claude-steer-chrome ⑬'s placement: a scene whose Stop must land INSIDE a window stands on the window's
// fact, never on a clock the scene can outrun). Each is a FILE; unset: as before.
//   $STAND_IN_POST_HOLD  set: after a tool result the model answers only once THAT FILE exists (polled every 20 ms; 180 s at most)
//                      in place of $STAND_IN_POST_MS — a Stop pressed after the tool result finds the turn still running, by fact
//   $STAND_IN_HELPER_HOLD  set: a BGAGENT- helper works until THAT FILE exists (polled every 20 ms) in place of $STAND_IN_HELPER_MS —
//                      the helper provably runs through a Stop window; the stand-in still exits when its stdin ends
// Its records are VERSION-KEYED (lane claude-steer-inject r3): $STAND_IN_CLI_VERSION (default 2.1.312, the build the R0 table was
// re-measured on 2026-10-27 — the same rows as 2.1.308) names the build in every init, and from 2.1.312 on every `result` carries
// model_usage_since_last_result (measured on every result of a local stream-json 2.1.312; `{}` = nothing counted — the stand-in bills
// nothing). STAND_IN_CLI_VERSION=2.1.308 writes the 2.1.308 result. test-record-shape judges both against src/record-shape.js.
// A PROMPT HOOK PHASE (acceptance r4, measured on 2.1.312 with the product's own hook): with $STAND_IN_PROMPT_HOOK_MS > 0
// every turn first runs a UserPromptSubmit hook for that long — a follow-up and an owed turn too, BEFORE their init — and
// with CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS=1 (what the adapter sets) it says so: system/hook_started, then
// hook_response (`success`, or `cancelled` when an interrupt arrives during the hook — the turn's init still follows, and
// a second interrupt there ends it, as the real CLI does). The hook WORDS are keyed on the VERSION too (acceptance r5): 2.1.308's
// binary does not know the env switch (measured: it never says them), so STAND_IN_CLI_VERSION=2.1.308 runs the hook in silence.
// A TURN'S INIT NAMES THE CLIENT UUIDS IT CONSUMED (acceptance r5, measured on 2.1.308 and 2.1.312; the writer is in the strings
// of 2.1.307 on): a frame carrying a `uuid` (the wrapper stamps every mid-turn frame) makes the init of the turn that takes it say
// `user_message_uuids` — a batch names each frame's, in order; the batch's own uuid is its LAST frame's (the CLI writes ONE user
// record under it). STAND_IN_CLI_VERSION below 2.1.307 writes neither.
// WHAT AN INTERRUPT IN THE HOOK DOES TO THE CONVERSATION (acceptance r5, measured on 2.1.312 — measure/r4-312/res-hook-*): the
// hook is cancelled and the init still follows, but the frame the CLI held is DROPPED from the conversation (no user record,
// the next request lacks it) — $STAND_IN_DELIVERED gets {how:'dropped'}; a follow-up interrupted on its INIT keeps it
// ({how:'kept'}: it stays in the conversation, the next request carries it).
//   $STAND_IN_PROMPT_HOOK_WEDGED=1  a FOLLOW-UP's prompt hook (the turn the CLI starts for what it held at an interrupt) says
//                      hook_started and then NOTHING, ever (a lost hook_response — the shape a window must end by name); an
//                      interrupt during it is answered and changes nothing
//   $STAND_IN_PROMPT_HOOK_CMD  the prompt hook phase RUNS this command (lane report-mark-on-ack, measured on claude 2.1.321
//                      with the product's own hook — measure/probe-cli.mjs): through /bin/sh, its stdin the UserPromptSubmit input
//                      ({session_id, transcript_path, cwd, hook_event_name, prompt}), the turn's init after it EXITS; hook_response
//                      says `success` with its exit_code / stdout / stderr / output (stderr + stdout) — an aborted hook that printed
//                      nothing is `success` with stdout '' too; the additionalContext its stdout names is what the turn CARRIES
//                      ($STAND_IN_DELIVERED {how:'context', text}; a hook's stderr never is); an interrupt during it SIGTERMs it
//                      (`cancelled`, exit_code 1 — measured +45 ms)
// THE STOP THAT CAME LATE (B-28b1): a STALL PLACED in the window — by order, never load or a clock. With $STAND_IN_FOLLOW_REQ_MS set, a
// follow-up's REQUEST reaches the model that long after its init ($STAND_IN_DELIVERED gets {how:'request'}; from then on its
// result counts tokens — ASSUMED, not measured: the 2.1.312 recording has only a follow-up that sent nothing, with `{}`; whether
// the real CLI counts an aborted stream is what the heavy §A's told/shown counts will say). THE STALL IS PLACED BY ORDER, never by a
// clock (the coordinator's rule): $STAND_IN_FOLLOW_HOLD_UNTIL=request|answer|end — after a follow-up's init the stand-in reads no
// stdin line until its request has left / its answer was said / it has ended (the real CLI's loop busy sending): the interrupt the
// wrapper wrote on the init is read only THEN, whatever the load. $STAND_IN_FOLLOW_HOLD_INTERRUPTS=N:
// after a follow-up's init no stdin line is read until N interrupt lines wait in the pipe (a stall placed by COUNT: a second
// Stop is surely read before the follow-up's result, whatever the load). $STAND_IN_FOLLOW_ANSWER_MS
// (with REQ_MS): an assistant record that long after the request (the model answered). $STAND_IN_FOLLOW_AGENT_TOKENS=N: a
// follow-up's result says N tokens of OTHER calls in model_usage_since_last_result (a background agent's, as the 2.1.312 recording
// shows: never in the result's own `usage`). All five unset: the shape every older leg drives (nothing is sent inside FOLLOW_MS,
// nothing billed).
// Used by scripts/test-queue-putback.mjs §6, scripts/test-queue-steer.mjs ⑯, scripts/test-claude-steer.mjs §8, scripts/test-claude-steer-chrome.mjs and scripts/test-turn-carry.mjs.
// Never a vendor call: no network at all.
const fs = require('fs');
const CAP = process.env.STUB_CAPTURE || '';
const DELIVERED = process.env.STAND_IN_DELIVERED || '';
const LONG_MS = Number(process.env.STAND_IN_LONG_MS || 4000);
const FOLLOW_MS = Number(process.env.STAND_IN_FOLLOW_MS || 300);
const SPLIT_FOLLOW = process.env.STAND_IN_SPLIT_FOLLOW === '1';
const NO_STATE = process.env.STAND_IN_NO_STATE === '1';
const POST_MS = Number(process.env.STAND_IN_POST_MS || 5);
const FOLLOW_REQ_MS = process.env.STAND_IN_FOLLOW_REQ_MS ? Number(process.env.STAND_IN_FOLLOW_REQ_MS) : null;
const FOLLOW_HOLD_UNTIL = process.env.STAND_IN_FOLLOW_HOLD_UNTIL || '';   // 'request' | 'answer' | 'end'
if (FOLLOW_HOLD_UNTIL && !['request', 'answer', 'end'].includes(FOLLOW_HOLD_UNTIL)) { process.stderr.write(`stand-in: STAND_IN_FOLLOW_HOLD_UNTIL=${FOLLOW_HOLD_UNTIL} is none of request / answer / end\n`); process.exit(2); }
const FOLLOW_ANSWER_MS = process.env.STAND_IN_FOLLOW_ANSWER_MS ? Number(process.env.STAND_IN_FOLLOW_ANSWER_MS) : null;
const FOLLOW_HOLD_N = Number(process.env.STAND_IN_FOLLOW_HOLD_INTERRUPTS || 0);
const FOLLOW_AGENT_TOKENS = Number(process.env.STAND_IN_FOLLOW_AGENT_TOKENS || 0);
const RELEASE_FILE = process.env.STAND_IN_RELEASE_FILE || '';   // a LONGER- turn's tool ends when this file exists (the leg's release)
const POST_HOLD = process.env.STAND_IN_POST_HOLD || '';   // r5473: the model's answer after a tool result waits for this file
const HELPER_HOLD = process.env.STAND_IN_HELPER_HOLD || '';   // r5473: a BGAGENT- helper works until this file exists
let holdUntil = '';   // B-28b1: no stdin line is read until the follow-up did this (its init placed it)
const release = (what) => { if (holdUntil && (holdUntil === what || what === 'end')) { holdUntil = ''; setImmediate(readLines); } };
let holdInterrupts = 0;   // B-28b1: …nor before this many interrupt lines wait
// $STAND_IN_RIDE_MISS=1 (lane midturn-order r2 M1): a frame written while the tool ran MISSED the request built after its result
// (the race the wrapper counts a riding frame KEPT for, chat-wrapper dropHeldForStop) — it stays held by the CLI, which runs it
// as a follow-up turn after a Stop
const RIDE_MISS = process.env.STAND_IN_RIDE_MISS === '1';
const HELPER_MS = Number(process.env.STAND_IN_HELPER_MS || LONG_MS);
const CLI_VERSION = process.env.STAND_IN_CLI_VERSION || '2.1.312';
const atLeast = (v) => { const a = CLI_VERSION.split('.').map(Number), b = v.split('.').map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); return true; };
const SINCE_LAST = atLeast('2.1.312'); // the per-result usage delta 2.1.312 writes on every result
const PROMPT_HOOK_MS = Number(process.env.STAND_IN_PROMPT_HOOK_MS || 0);
const PROMPT_HOOK_CMD = process.env.STAND_IN_PROMPT_HOOK_CMD || '';
const HOOK_WEDGED = process.env.STAND_IN_PROMPT_HOOK_WEDGED === '1';
const SAYS_HOOKS = atLeast('2.1.312') && process.env.CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS === '1';
const INIT_UUIDS = atLeast('2.1.307');
const uuidsOf = (f) => (f && Array.isArray(f._uuids) ? f._uuids : (f && typeof f.uuid === 'string' ? [f.uuid] : []));
let hookSeq = 0;
const hookWord = (subtype, id, outcome, ran = null) => { if (SAYS_HOOKS) out({ type: 'system', subtype, hook_id: id, hook_name: 'UserPromptSubmit', hook_event: 'UserPromptSubmit', ...(outcome ? { output: ran ? ran.stderr + ran.stdout : '', stdout: ran ? ran.stdout : '', stderr: ran ? ran.stderr : '', exit_code: ran ? ran.code : (outcome === 'success' ? 0 : undefined), outcome } : {}), session_id: SID }); };
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
  const uuids = batch.flatMap(uuidsOf);
  return { type: 'user', message: { role: 'user', content: batch.map((f) => ({ type: 'text', text: textOf(f) })) }, _uuids: uuids, ...(uuids.length ? { uuid: uuids[uuids.length - 1] } : {}) };
}
function end(subtype) {
  if (!busy) return;
  clearTimeout(busy.timer); clearTimeout(busy.reqTimer); clearTimeout(busy.ansTimer);
  const interrupted = subtype !== 'success';
  if (interrupted && busy.tool) {
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: busy.tool, content: "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.", is_error: true }] } });
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } });
  } else if (interrupted && (busy.follow || busy.post)) {
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
    if (busy.follow && !busy.dropped) delivered('kept', busy.text);
  }
  // an interrupted result carries NO `result` words (measured on 2.1.312: claude-steer-inject measure/r3-312/stop-late-*, `result`
  // absent on error_during_execution) — the chat's row says «Interrupted» alone (lane midturn-order r2 r1)
  // B-28b1: a follow-up whose request reached the model counts it on its result — in its own `usage` on every version, and in
  // model_usage_since_last_result on 2.1.312+ (with $STAND_IN_FOLLOW_AGENT_TOKENS, an agent's calls there too, never in `usage`)
  const billed = !!busy.requested, outTok = busy.answered ? 8 : 0, agentTok = busy.follow ? FOLLOW_AGENT_TOKENS : 0;
  const since = (billed || agentTok) ? { 'claude-sonnet-4-5': { inputTokens: (billed ? 1200 : 0) + agentTok, outputTokens: outTok + (agentTok ? 1 : 0), cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.0036, contextWindow: 200000 } } : {};
  out({ type: 'result', subtype, is_error: interrupted, ...(interrupted ? {} : { result: busy.text }), session_id: SID, duration_ms: 1, total_cost_usd: billed ? 0.0036 : 0, ...(billed ? { usage: { input_tokens: 1200, output_tokens: outTok, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } : {}), ...(SINCE_LAST ? { model_usage_since_last_result: since } : {}) });
  if (holdInterrupts) { holdInterrupts = 0; setImmediate(readLines); }   // the follow-up ended on its own: the hold ends with it
  release('end');
  busy = null;
  // what the CLI was holding runs as a turn of its own — after an interrupt too (measured); after an interrupt its
  // request is still out for FOLLOW_MS when a second interrupt can end it
  if (queued.length) { const fol = interrupted; const next = nextFollow(); setImmediate(() => start(next, { follow: fol })); return; }
  if (!helper) setState('idle');
}
function start(f, { follow = false } = {}) {
  if (PROMPT_HOOK_CMD) {
    const id = 'hook-' + (++hookSeq);
    busy = { text: textOf(f), timer: null, follow, hook: id, frame: f };
    setState('running');
    hookWord('hook_started', id);
    const child = require('child_process').spawn('/bin/sh', ['-c', PROMPT_HOOK_CMD], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    busy.hookChild = child;
    let so = '', se = '';
    child.stdout.on('data', (d) => { so += d; }); child.stderr.on('data', (d) => { se += d; });
    child.stdin.on('error', () => { });
    child.stdin.end(JSON.stringify({ session_id: SID, transcript_path: '', cwd: process.cwd(), hook_event_name: 'UserPromptSubmit', prompt: textOf(f) }));
    child.on('close', (code) => {
      const b = busy;
      if (!b || b.hook !== id) return;   // cancelled: its answer is dropped (measured)
      b.hook = null; b.hookChild = null;
      hookWord('hook_response', id, 'success', { code: code == null ? 1 : code, stdout: so, stderr: se });
      let ctx = ''; try { ctx = JSON.parse(so).hookSpecificOutput.additionalContext || ''; } catch { }
      if (ctx) delivered('context', ctx);
      begin(b.frame, { follow: b.follow });
    });
    return;
  }
  if (PROMPT_HOOK_MS > 0) {
    // the prompt hook runs first (the turn has no init yet); an interrupt now cancels the hook — see the stdin handler
    const id = 'hook-' + (++hookSeq);
    busy = { text: textOf(f), timer: null, follow, hook: id, frame: f };
    setState('running');
    hookWord('hook_started', id);
    if (HOOK_WEDGED && follow) return; // never a response, never an init
    busy.timer = setTimeout(() => { const b = busy; b.hook = null; hookWord('hook_response', id, 'success'); begin(b.frame, { follow: b.follow }); }, PROMPT_HOOK_MS);
    return;
  }
  begin(f, { follow });
}
/** An interrupt during the prompt hook: the hook is cancelled, the turn's init still comes — as a follow-up a second
 *  interrupt can end (2.1.312: hook_response «cancelled», then init). */
function cancelHook() {
  const b = busy;
  if (HOOK_WEDGED && b.follow) return;
  clearTimeout(b.timer);
  if (b.hookChild) { try { b.hookChild.kill('SIGTERM'); } catch { } b.hookChild = null; }   // measured: the CLI SIGTERMs a cancelled hook
  hookWord('hook_response', b.hook, 'cancelled', PROMPT_HOOK_CMD ? { code: 1, stdout: '', stderr: '' } : null);
  b.hook = null;
  if (b.follow) delivered('dropped', b.text); // the frame the CLI held is gone from the conversation (measured)
  begin(b.frame, { follow: true });
  if (b.follow) busy.dropped = true;
}
function begin(f, { follow = false } = {}) {
  const text = textOf(f);
  turnSeq++;
  delivered('turn', text);
  busy = { text, timer: null, follow };
  setState('running');
  if (/BGAGENT-/.test(text) && !helper) {
    const helperDone = () => {
      helper = null;
      const note = { type: 'user', message: { role: 'user', content: '<task-notification>the background helper finished</task-notification>' } };
      if (busy) queued.push(note); else start(note);
    };
    if (HELPER_HOLD) { const poll = () => { if (fs.existsSync(HELPER_HOLD)) helperDone(); else helper = setTimeout(poll, 20); }; helper = setTimeout(poll, 20); }   // r5473: works until the leg's file
    else helper = setTimeout(helperDone, HELPER_MS);
  }
  const uuids = INIT_UUIDS ? uuidsOf(f) : [];
  out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: CLI_VERSION, ...(uuids.length ? { user_message_uuids: uuids } : {}) });
  if (/BGSET-/.test(text)) out({ type: 'system', subtype: 'background_tasks_changed', session_id: SID, uuid: 'bgset-stand-in-' + turnSeq, tasks: [{ task_id: 'bg-stand-in-1', task_type: 'local_bash', description: 'a dev server' }] });
  if (/BGEMPTY-/.test(text)) out({ type: 'system', subtype: 'background_tasks_changed', session_id: SID, uuid: 'bgempty-stand-in-' + turnSeq, tasks: [] });
  if (/BGSHELL-/.test(text)) {
    out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_s' + turnSeq, role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: 'toolu_stand_in_bgsh', name: 'Bash', input: { command: 'npm run dev', description: 'a dev server', run_in_background: true } }] } });
    out({ type: 'system', subtype: 'background_tasks_changed', session_id: SID, uuid: 'bgsh-set-' + turnSeq, tasks: [{ task_id: 'bgsh-stand-in-1', run_id: 'bgsh-run-1', task_type: 'local_bash', description: 'a dev server' }] });
    out({ type: 'system', subtype: 'task_started', session_id: SID, uuid: 'bgsh-start-' + turnSeq, task_id: 'bgsh-stand-in-1', run_id: 'bgsh-run-1', tool_use_id: 'toolu_stand_in_bgsh', description: 'a dev server', task_type: 'local_bash', is_backgrounded: true });
    out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_stand_in_bgsh', content: 'Command running in background with ID: bgsh-stand-in-1', is_error: false }] } });
  }
  if (/BGDONE-/.test(text)) {
    out({ type: 'system', subtype: 'task_updated', session_id: SID, uuid: 'bgsh-upd-' + turnSeq, task_id: 'bgsh-stand-in-1', run_id: 'bgsh-run-1', patch: { status: 'completed' } });
    out({ type: 'system', subtype: 'task_notification', session_id: SID, uuid: 'bgsh-done-' + turnSeq, task_id: 'bgsh-stand-in-1', run_id: 'bgsh-run-1', tool_use_id: 'toolu_stand_in_bgsh', status: 'completed' });
    out({ type: 'system', subtype: 'background_tasks_changed', session_id: SID, uuid: 'bgsh-empty-' + turnSeq, tasks: [] });
  }
  if (/WAKE-/.test(text)) out({ type: 'command_lifecycle', session_id: SID, state: 'started', command_uuid: 'cmd-stand-in-' + turnSeq, wakeup_source: 'loop_wakeup', scheduled_for: Date.now() - 1000 });
  if (/BURST-/.test(text)) for (let i = 0; i < 2000; i++) out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_b' + i, role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: 'burst ' + i }] } });
  const say = (t) => out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_' + Date.now(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: t }] } });
  if (/TOOL-/.test(text) && !follow) {
    const toolId = 'toolu_stand_in_' + turnSeq;
    busy.tool = toolId;
    out({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_stand_in_t' + Date.now(), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command: 'sleep 8', description: 'Sleep 8 seconds' } }] } });
    const finishTool = () => {
      out({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: '(Bash completed with no output)', is_error: false }] } });
      busy.tool = null; busy.post = true;
      // every frame that arrived while the tool ran rides THIS tool result into the turn (the CLI's own queue — a
      // slash command never does: it waits for its own turn)
      const took = [];
      for (let i = 0; i < queued.length && !RIDE_MISS;) { const t = textOf(queued[i]); if (/^\s*\//.test(t)) { i++; continue; } took.push(t); queued.splice(i, 1); }
      for (const t of took) delivered('tool_result', t);
      const answer = () => { say('done after the tool' + (took.length ? ' — took in: ' + took.join(' | ') : '')); end('success'); };
      if (POST_HOLD) {   // r5473: the answer waits for the leg's file (an interrupt ends the turn: end() clears the timer, a stale poll finds another busy)
        const t0 = Date.now(), b = busy;
        const poll = () => { if (busy !== b) return; if (fs.existsSync(POST_HOLD) || Date.now() - t0 > 180000) answer(); else b.timer = setTimeout(poll, 20); };
        busy.timer = setTimeout(poll, 20);
      } else busy.timer = setTimeout(answer, POST_MS);
    };
    if (RELEASE_FILE && /LONGER-/.test(text)) {
      const t0 = Date.now(), b = busy;   // an interrupt ends the turn (end() clears the timer; a stale poll finds another busy)
      const poll = () => { if (busy !== b || b.tool !== toolId) return; if (fs.existsSync(RELEASE_FILE) || Date.now() - t0 > 180000) finishTool(); else b.timer = setTimeout(poll, 50); };
      busy.timer = setTimeout(poll, 50);
    } else busy.timer = setTimeout(finishTool, /LONGER-/.test(text) ? LONG_MS * 3 : LONG_MS);
    return;
  }
  if (follow && FOLLOW_REQ_MS !== null) {
    const b = busy;   // B-28b1: the follow-up's request leaves FOLLOW_REQ_MS after its init — the model has it from then on
    b.reqTimer = setTimeout(() => {
      if (busy !== b) return;
      b.requested = true; delivered('request', text); release('request');
      if (FOLLOW_ANSWER_MS !== null) b.ansTimer = setTimeout(() => { if (busy !== b) return; b.answered = true; say('reply: ' + text); release('answer'); }, FOLLOW_ANSWER_MS);
    }, FOLLOW_REQ_MS);
  }
  if (follow && FOLLOW_HOLD_UNTIL) holdUntil = FOLLOW_HOLD_UNTIL;   // B-28b1: the stall placed by ORDER
  if (follow && FOLLOW_HOLD_N > 0) holdInterrupts = FOLLOW_HOLD_N;   // …by count
  busy.timer = setTimeout(() => { if (!busy.answered) say('reply: ' + text); end('success'); }, follow ? FOLLOW_MS : (/LONG-/.test(text) ? LONG_MS : 5));
}
if (process.env.STAND_IN_BOOT_INIT === '1') out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: CLI_VERSION });
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; readLines(); });
function readLines() {
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    if (holdUntil) return;   // B-28b1: lines wait for the follow-up's own step (release() reads them on), in order
    if (holdInterrupts) {   // …and the hold by count: a new chunk calls readLines again
      const waiting = buf.slice(0, buf.lastIndexOf('\n')).split('\n').filter((l) => /"subtype":"interrupt"/.test(l)).length;
      if (waiting < holdInterrupts) return;
      holdInterrupts = 0;
    }
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    if (CAP) fs.appendFileSync(CAP, line + '\n');
    let f; try { f = JSON.parse(line); } catch { continue; }
    if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') {
      out({ type: 'control_response', response: { subtype: 'success', request_id: f.request_id } });
      if (busy && busy.hook) { cancelHook(); continue; }
      end('error_during_execution');
      continue;
    }
    if (f.type !== 'user') continue;
    // the real CLI ignores a frame whose content is neither a string nor an array (measured: no running, no result)
    if (!f.message || !(typeof f.message.content === 'string' || Array.isArray(f.message.content))) continue;
    if (busy) queued.push(f); else start(f);
  }
}
process.stdin.on('end', () => { holdUntil = ''; holdInterrupts = 0; readLines(); const done = () => (buf.indexOf('\n') >= 0 ? setTimeout(done, 5) : process.exit(0)); done(); });   // stdin ends: every hold ends with it
