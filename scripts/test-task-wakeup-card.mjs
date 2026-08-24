#!/usr/bin/env node
// Background-task wakeup visibility (2.229.2, user report "后台任务唤醒在chat
// 里没有任何痕迹"): the CLI stamps promptSource:"sdk" on the SYSTEM-generated
// <task-notification> user record that wakes the agent — the typed heuristic
// (promptSource ⇒ user's own words ⇒ never a notification card) made it render
// as an invisible "You" bubble. origin.kind (authoritative, JSONL top-level)
// must win; the text-shape check covers transports without the origin field.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { MessageManager } = require('../src/message-manager.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };
const norm = (raw) => {
  const mm = new MessageManager('claude', 't1');
  const ops = [];
  mm.onOp((op) => ops.push(op));
  mm.processLive(raw);
  return ops.find((o) => o.op === 'create')?.message;
};

const WAKEUP_TEXT = '<task-notification>\n<task-id>by51cmm12</task-id>\n<status>completed</status>\n<summary>Background command "watch CI" completed (exit code 0)</summary>\n</task-notification>';

// real JSONL shape (origin.kind present + promptSource:"sdk")
let m = norm({ type: 'user', message: { role: 'user', content: WAKEUP_TEXT }, origin: { kind: 'task-notification' }, promptSource: 'sdk', uuid: 'w1', timestamp: new Date().toISOString() });
check('origin.kind wakeup → originKind set, NOT typed', m && m.originKind === 'task-notification' && !m.typed, JSON.stringify({ typed: m?.typed, originKind: m?.originKind }));

// transport without origin (text-shape fallback) still classified
m = norm({ type: 'user', message: { role: 'user', content: WAKEUP_TEXT }, promptSource: 'sdk', uuid: 'w2', timestamp: new Date().toISOString() });
check('origin-less wakeup (text shape) → originKind set, NOT typed', m && m.originKind === 'task-notification' && !m.typed);

// a REAL typed user message keeps its protection (the 2.88.0 guarantee)
m = norm({ type: 'user', message: { role: 'user', content: 'Stop hook feedback: I literally typed this' }, promptSource: 'sdk', uuid: 'w3', timestamp: new Date().toISOString() });
check('genuine typed message stays typed', m && m.typed === true && !m.originKind);

// a user who PASTES xml-ish text mid-sentence is not demoted
m = norm({ type: 'user', message: { role: 'user', content: 'look at this: <task-notification> weird' }, promptSource: 'sdk', uuid: 'w4', timestamp: new Date().toISOString() });
check('mid-text mention does not classify as wakeup', m && m.typed === true && !m.originKind);

// ── task lifecycle closure (2.233.0): the wakeup COMPLETES its tracked task
// (in the current harness no system/task_notification ever arrives for
// background commands — tasks only accumulated in the status-bar popup) ──
{
  const mm = new MessageManager('claude', 't2');
  const ops = [];
  mm.onOp((op) => ops.push(op));
  // background Bash: tool_use → task_started → wakeup names the tool-use-id
  mm.processLive({ type: 'assistant', message: { id: 'm1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_bg1', name: 'Bash', input: { command: 'sleep 99', run_in_background: true } }] }, uuid: 'a1', timestamp: new Date().toISOString() });
  mm.processLive({ type: 'system', subtype: 'task_started', tool_use_id: 'toolu_bg1', task_id: 'bgtask1', task_type: 'local_bash', description: 'watch CI' });
  const started = ops.filter((o) => o.op === 'edit' && o.fields?.taskInfo).pop();
  check('task_started marks running', started?.fields.taskInfo.status === 'running');
  mm.processLive({ type: 'user', message: { role: 'user', content: '<task-notification>\n<task-id>bgtask1</task-id>\n<tool-use-id>toolu_bg1</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>' }, origin: { kind: 'task-notification' }, promptSource: 'sdk', uuid: 'w9', timestamp: new Date().toISOString() });
  const done = ops.filter((o) => o.op === 'edit' && o.fields?.taskInfo).pop();
  check('wakeup completes the tracked task (popup lifecycle closed)', done?.fields.taskInfo.status === 'completed', JSON.stringify(done?.fields));
}

// ── THE REAL ORDER (2.368.15, owner: "基本每个对话都有已结束的后台任务显示为
// 正在进行"): a background command's tool_result lands SECONDS after launch
// ("Command running in background with ID…") and DELETES the pendingToolCalls
// entry; the completion notification arrives MINUTES later. Every closer that
// resolved via pendingToolCalls found nothing — the 2.233.0 test above passed
// only because it skipped the tool_result. This scenario is the production
// shape and must close the lifecycle anyway. ──
{
  const mm = new MessageManager('claude', 't3');
  const ops = [];
  mm.onOp((op) => ops.push(op));
  mm.processLive({ type: 'assistant', message: { id: 'm1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_bg2', name: 'Bash', input: { command: 'watch ci', run_in_background: true } }] }, uuid: 'a1', timestamp: new Date().toISOString() });
  mm.processLive({ type: 'system', subtype: 'task_started', tool_use_id: 'toolu_bg2', task_id: 'bgtask2', task_type: 'local_bash', description: 'watch CI' });
  mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bg2', content: 'Command running in background with ID: bgtask2. Output is being written to: /tmp/x.output.' }] }, uuid: 'r1', timestamp: new Date().toISOString() });
  check('tool_result completes the CARD but the task stays running', mm.messages.find((x) => x.taskInfo)?.taskInfo.status === 'running');
  mm.processLive({ type: 'user', message: { role: 'user', content: '<task-notification>\n<task-id>bgtask2</task-id>\n<tool-use-id>toolu_bg2</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>' }, origin: { kind: 'task-notification' }, promptSource: 'sdk', uuid: 'w9', timestamp: new Date().toISOString() });
  check('completion AFTER the tool_result still closes the lifecycle (the stuck-runner class)', mm.messages.find((x) => x.taskInfo)?.taskInfo.status === 'completed');
  // task-id-only notification (no tool-use-id — e.g. Monitor/workflow shapes)
  mm.processLive({ type: 'assistant', message: { id: 'm2', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_bg3', name: 'Bash', input: { command: 'x', run_in_background: true } }] }, uuid: 'a2', timestamp: new Date().toISOString() });
  mm.processLive({ type: 'system', subtype: 'task_started', tool_use_id: 'toolu_bg3', task_id: 'bgtask3', task_type: 'local_bash', description: 'y' });
  mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bg3', content: 'Command running in background with ID: bgtask3.' }] }, uuid: 'r2', timestamp: new Date().toISOString() });
  mm.processLive({ type: 'user', message: { role: 'user', content: '<task-notification>\n<task-id>bgtask3</task-id>\n<status>completed</status>\n</task-notification>' }, origin: { kind: 'task-notification' }, promptSource: 'sdk', uuid: 'w10', timestamp: new Date().toISOString() });
  const t3 = mm.messages.filter((x) => x.taskInfo).pop();
  check('a task-id-only notification resolves via the task index too', t3?.taskInfo.status === 'completed');
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
