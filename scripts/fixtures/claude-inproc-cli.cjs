'use strict';
// THE IN-PROCESS CLAUDE (lane claude-steer-inject, acceptance r2) — preloaded into data/bin/chat-wrapper.js with
// `node -r <this> chat-wrapper.js <buf> <meta> inproc-claude`, it answers child_process.spawn('inproc-claude') with a
// stand-in that lives in the wrapper's own process and drives its stdout SYNCHRONOUSLY (an 'data' emit runs the
// wrapper's line handler before it returns). That turns a timing question into a yes/no one: after a Stop, the CLI's
// follow-up turn for a frame it held sends its request ~12 ms after its `system/init` line (measured on 2.1.308, the R0
// recording; 12–17 ms on 2.1.312), and a second interrupt is acked in 8–10 ms (10–19 ms on 2.1.312) — so the wrapper must write that interrupt IN THE SAME TICK as
// it parses the init line (a 25 ms-late copy was answered). This fake emits the init and looks at once:
// {sameTick: true|false} is appended to $INPROC_OUT. The turn shape is the stand-in's (scripts/fixtures/
// claude-stand-in-cli.cjs), cut to what that question needs: a `TOOL-` frame opens a turn whose tool runs until an
// interrupt; a frame that arrives meanwhile is held by the "CLI"; an interrupt ends the turn (rejected tool_result +
// «[Request interrupted by user for tool use]» + result/error_during_execution) and starts ONE follow-up turn for what
// it held, which answers after 50 ms unless a second interrupt came. Never a vendor call, no child process at all.
const cp = require('child_process');
const fs = require('fs');
const { EventEmitter } = require('events');
const realSpawn = cp.spawn;
const OUT = process.env.INPROC_OUT || '';
cp.spawn = function spawn(cmd, ...rest) {
  if (cmd !== 'inproc-claude') return realSpawn.call(this, cmd, ...rest);
  const SID = '00000000-0000-4000-8000-0000000c1a0d';
  const child = new EventEmitter();
  child.pid = process.pid;
  child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
  child.kill = () => { setImmediate(() => child.emit('exit', 0, null)); return true; };
  const emit = (o) => child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n'));
  let state = 'idle', busy = null, interrupts = 0, lb = '';
  const held = [];
  const setState = (st) => { if (st !== state) { state = st; emit({ type: 'system', subtype: 'session_state_changed', state: st, session_id: SID }); } };
  const init = () => emit({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-4-5', tools: [], claude_code_version: '2.1.312' });
  const textOf = (f) => { const c = f && f.message && f.message.content; return typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : ''); };
  const result = (subtype, text) => emit({ type: 'result', subtype, is_error: subtype !== 'success', result: text, session_id: SID, model_usage_since_last_result: {} }); // the 2.1.312 result
  const say = (text) => emit({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_inproc_' + Date.now(), role: 'assistant', content: [{ type: 'text', text }] } });
  function follow() {
    const text = held.splice(0, held.length).map(textOf).join(' ');
    busy = { follow: true, text, before: interrupts };
    const before = interrupts;
    init();                                       // ← the wrapper's line handler runs INSIDE this call
    const sameTick = interrupts > before;
    if (OUT) fs.appendFileSync(OUT, JSON.stringify({ sameTick, text }) + '\n');
    busy.timer = setTimeout(() => { const b = busy; busy = null; say('reply: ' + b.text); result('success', b.text); setState('idle'); }, 50);
  }
  function onFrame(f) {
    if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') {
      emit({ type: 'control_response', response: { subtype: 'success', request_id: f.request_id } });
      if (!busy) return;
      const b = busy; busy = null; clearTimeout(b.timer);
      if (b.tool) {
        emit({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: b.tool, content: "The user doesn't want to proceed with this tool use.", is_error: true }] } });
        emit({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } });
      } else emit({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
      result('error_during_execution', b.text);
      if (held.length) { setImmediate(follow); return; }
      setState('idle');
      return;
    }
    if (f.type !== 'user' || !f.message) return;
    if (busy) { held.push(f); return; }
    setState('running');
    init();
    const tool = 'toolu_inproc_1';
    busy = { tool, text: textOf(f) };
    emit({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_inproc_t', role: 'assistant', content: [{ type: 'tool_use', id: tool, name: 'Bash', input: { command: 'sleep 60' } }] } });
  }
  child.stdin = {
    writable: true,
    // an interrupt is COUNTED the moment it is written (that is the question); every frame is ACTED ON a tick later, as a
    // pipe would deliver it — never re-entrantly inside the wrapper's own line handler
    write(chunk) {
      lb += String(chunk);
      let i;
      while ((i = lb.indexOf('\n')) >= 0) {
        const line = lb.slice(0, i); lb = lb.slice(i + 1);
        let f = null; try { f = JSON.parse(line); } catch { continue; }
        if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') interrupts++;
        setImmediate(() => onFrame(f));
      }
      return true;
    },
    end() {}, on() {}, once() {},
  };
  return child;
};
