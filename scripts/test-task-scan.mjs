#!/usr/bin/env node
// Task-tool scan regression (2.180.1 — real report: a long-completed task
// showed as in_progress in Steps forever):
//  (a) COMPACTION re-appends retained records (original timestamps + uuids)
//      after the whole history — a task's create/in_progress replayed while
//      its completed update (summarized away) did not; file-order application
//      ended on the stale replay.
//  (b) The full-history scan must NOT let an ANCIENT TodoWrite snapshot shadow
//      the newer TaskCreate/TaskUpdate family — the LATEST-used family wins.
//  (c) Incremental byte cursor: appended records picked up without a rescan.
// Runs in a CHILD with a fake HOME so findSessionJsonlPath resolves into a
// throwaway projects dir — never touches the real ~/.claude.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.TASK_SCAN_CHILD) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'task-scan-home-'));
  try {
    const r = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, HOME: home, TASK_SCAN_CHILD: '1' }, encoding: 'utf-8',
    });
    process.stdout.write(r);
  } catch (e) {
    process.stdout.write(String(e.stdout || ''));
    process.stderr.write(String(e.stderr || e.message));
    process.exitCode = 1;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
} else {
  let failed = 0;
  const check = (n, c, extra) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${extra ? '\n    ' + extra : ''}`); } };

  const cwd = '/tmp/task-scan-proj';
  const sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const projDir = path.join(process.env.HOME, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(projDir, { recursive: true });
  const fp = path.join(projDir, sid + '.jsonl');

  const T0 = '2026-07-01T00:00:00.000Z'; // ancient TodoWrite era
  const T1 = '2026-07-15T01:00:00.000Z';
  const T2 = '2026-07-15T01:05:00.000Z';
  const T3 = '2026-07-15T04:00:00.000Z';
  const rec = (uuid, ts, type, content) => JSON.stringify({ uuid, timestamp: ts, type, message: { role: type, content } });
  const create = (uuid, ts, tuid) => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: tuid, name: 'TaskCreate', input: { subject: 'Ship it', activeForm: 'Shipping it' } }]);
  const createRes = (uuid, ts, tuid) => rec(uuid, ts, 'user', [{ type: 'tool_result', tool_use_id: tuid, content: 'Task #1 created successfully: Ship it' }]);
  const update = (uuid, ts, status) => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: 'tu-' + Math.abs(status.length * 7919) + status, name: 'TaskUpdate', input: { taskId: '1', status } }]);
  const todoWrite = (uuid, ts) => rec(uuid, ts, 'assistant', [{ type: 'tool_use', id: 'tw-' + uuid, name: 'TodoWrite', input: { todos: [{ content: 'old todo', status: 'completed' }] } }]);

  const lines = [
    todoWrite('u0', T0),                 // ancient family — must NOT win
    create('u1', T1, 'tc-1'),
    createRes('u2', T1, 'tc-1'),
    update('u3', T2, 'in_progress'),
    update('u4', T3, 'completed'),
    // ── compaction replay: same uuids + original timestamps, APPENDED after
    // the completion; the completed update itself was summarized away ──
    create('u1', T1, 'tc-1'),
    createRes('u2', T1, 'tc-1'),
    update('u3', T2, 'in_progress'),
    // ── and one uuid-LESS stale replay (ts-sort must neutralize it even
    // without dedup) ──
    JSON.stringify({ timestamp: T2, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu-x', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }] } }),
  ];
  fs.writeFileSync(fp, lines.join('\n') + '\n');

  const { SessionMessages } = await import(path.join(repo, 'src', 'session-store.js')).then((m) => m.default || m);
  const mk = () => new SessionMessages({ backend: 'claude', backendSessionId: sid, claudeSessionId: sid, cwd }, null, { buffersDir: path.join(process.env.HOME, 'buf'), permissionModes: [] });

  let todos = (mk().taskState() || {}).todos || [];
  check('one task, not the ancient TodoWrite snapshot', todos.length === 1 && todos[0].content === 'Ship it', JSON.stringify(todos));
  check('completed despite the compaction replay after it', todos[0]?.status === 'completed', JSON.stringify(todos[0]));

  // ── (c) incremental append: a GENUINE later reopen must apply ──
  fs.appendFileSync(fp, update('u9', '2026-07-16T09:00:00.000Z', 'in_progress') + '\n');
  todos = (mk().taskState() || {}).todos || [];
  check('appended (genuine) update picked up incrementally', todos[0]?.status === 'in_progress', JSON.stringify(todos[0]));

  console.log(failed ? `FAILED (${failed})` : 'task-scan test passed');
  process.exit(failed ? 1 : 0);
}
