'use strict';
// THE RIDING RACE (lane claude-steer-inject, acceptance r4) — preloaded into data/bin/chat-wrapper.js with
// `node -r <this> chat-wrapper.js <buf> <meta> race-claude`, it answers child_process.spawn('race-claude') with a scripted CLI
// that lives in the wrapper's process (the shape of scripts/fixtures/claude-inproc-cli.cjs). It plays the race the wrapper's
// witness cannot see: a frame B handed mid-tool reaches the CLI's stdin, the CLI writes the tool_result line RIGHT AFTER —
// but B missed the request it had already built, so the CLI still holds B. The model has not spoken yet when Stop comes.
// The CLI then runs B as a follow-up turn of its own (the measured behaviour) and answers it 50 ms later unless a second
// interrupt ends it. $RACE_OUT gets one line per fact: {toolResultAfterB}, {interrupt}, {followInit, interruptedSameTick},
// {answeredAfterStop}. Never a network call.
const cp = require('child_process');
const fs = require('fs');
const { EventEmitter } = require('events');
const realSpawn = cp.spawn;
const OUT = process.env.RACE_OUT || '';
const note = (o) => { if (OUT) fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); };
cp.spawn = function spawn(cmd, ...rest) {
  if (cmd !== 'race-claude') return realSpawn.call(this, cmd, ...rest);
  const SID = 'e2e00000-0000-4000-8000-0000000c1a0e';
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
  const result = (subtype, text) => emit({ type: 'result', subtype, is_error: subtype !== 'success', result: text, session_id: SID, model_usage_since_last_result: {} });
  function follow() {
    const text = held.splice(0, held.length).map(textOf).join(' ');
    const before = interrupts;
    busy = { follow: true, text };
    init();
    note({ followInit: true, interruptedSameTick: interrupts > before, text });
    busy.timer = setTimeout(() => {
      const b = busy; busy = null;
      emit({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_race_f', role: 'assistant', content: [{ type: 'text', text: 'reply: ' + b.text }] } });
      note({ answeredAfterStop: b.text });
      result('success', 'reply: ' + b.text);
      setState('idle');
    }, 50);
  }
  function onFrame(f) {
    if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') {
      emit({ type: 'control_response', response: { subtype: 'success', request_id: f.request_id } });
      if (!busy) return;
      const b = busy; busy = null; clearTimeout(b.timer);
      emit({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
      result('error_during_execution', b.text || '');
      if (held.length) { setImmediate(follow); return; }
      setState('idle');
      return;
    }
    if (f.type !== 'user' || !f.message) return;
    if (busy) {
      held.push(f);
      // THE RACE: the tool ends NOW — its tool_result line comes after B reached stdin, but B missed that request
      if (busy.tool && !busy.resulted) { busy.resulted = true; emit({ type: 'user', session_id: SID, parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: busy.tool, content: 'done' }] } }); note({ toolResultAfterB: true }); }
      return;
    }
    setState('running');
    init();
    busy = { tool: 'toolu_race', text: textOf(f) };
    emit({ type: 'assistant', session_id: SID, parent_tool_use_id: null, message: { id: 'msg_race_t', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_race', name: 'Bash', input: { command: 'sleep 60' } }] } });
  }
  child.stdin = {
    writable: true,
    write(chunk) {
      lb += String(chunk);
      let i;
      while ((i = lb.indexOf('\n')) >= 0) {
        const line = lb.slice(0, i); lb = lb.slice(i + 1);
        let f = null; try { f = JSON.parse(line); } catch { continue; }
        // an interrupt is COUNTED synchronously (so a follow-up's init can tell one written in the same tick) and acted on next
        if (f.type === 'control_request' && f.request && f.request.subtype === 'interrupt') { interrupts++; note({ interrupt: f.request_id }); }
        setImmediate(() => onFrame(f));
      }
      return true;
    },
    end() {}, on() {}, once() {},
  };
  return child;
};
