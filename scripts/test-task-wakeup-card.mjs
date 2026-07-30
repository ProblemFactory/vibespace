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

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
