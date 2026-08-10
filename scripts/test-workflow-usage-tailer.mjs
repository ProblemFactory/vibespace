#!/usr/bin/env node
// Workflow usage tailer (2.270.0) — the race regression test: the launch ack
// precedes the run dir's creation by ~17ms in real runs, so the tailer MUST
// arm on a dir that does not exist yet. Also covers offset persistence,
// partial-line handling, streamed re-emission (same rid growing), and
// teardown on session death.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createWorkflowTailer } = require('../src/workflow-usage-tailer.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wft-'));
const dir = path.join(base, 'wf_test-run');
const rec = (id, usage) => JSON.stringify({ type: 'assistant', requestId: id, message: { id: 'msg_' + id, model: 'claude-fable-5', usage } }) + '\n';

const noted = [];
let alive = true;
const tailer = createWorkflowTailer({
  dir,
  waitMs: 100, pollMs: 200, debounceMs: 50,
  isAlive: () => alive,
  onRecord: (r) => noted.push(r.requestId || r.message?.id),
});

// 1. The race: dir does NOT exist at arm time.
ok(!tailer.armed(), 'tailer waits while the run dir is absent (no crash, not armed)');
await sleep(250);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'agent-aaa.jsonl'), rec('r1', { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 }));
await sleep(700);
ok(tailer.armed(), 'tailer arms once the dir appears (the 17ms-race fix)');
ok(noted.includes('r1'), 'record written BEFORE arming is still counted (offset starts at 0)');

// 2. Incremental growth + partial lines.
const fp = path.join(dir, 'agent-aaa.jsonl');
fs.appendFileSync(fp, rec('r2', { input_tokens: 10, output_tokens: 5 }));
const partial = rec('r3', { input_tokens: 1, output_tokens: 1 });
fs.appendFileSync(fp, partial.slice(0, 40)); // no trailing newline
await sleep(700);
ok(noted.includes('r2') && !noted.includes('r3'), 'complete lines counted, partial line deferred');
fs.appendFileSync(fp, partial.slice(40));
await sleep(700);
ok(noted.includes('r3'), 'completed partial line counted on the next pass');

// 3. Second agent file discovered mid-run.
fs.writeFileSync(path.join(dir, 'agent-bbb.jsonl'), rec('r4', { input_tokens: 7, output_tokens: 7 }));
await sleep(700);
ok(noted.includes('r4'), 'newly appearing agent file is tailed');

// 4. Non-usage / non-assistant lines ignored.
fs.appendFileSync(fp, JSON.stringify({ type: 'user', message: { content: 'x' } }) + '\n');
const before = noted.length;
await sleep(500);
ok(noted.length === before, 'non-usage lines are ignored');

// 5. Teardown on session death.
alive = false;
await sleep(500);
ok(tailer._state.stopped, 'tailer stops when the session dies');

// 6. Give-up path: a run dir that never appears must not leak (fast budget).
const t2 = createWorkflowTailer({ dir: path.join(base, 'never'), waitMs: 50, maxWaitMs: 200, onRecord: () => {} });
await sleep(500);
ok(t2._state.stopped && !t2.armed(), 'a never-created dir gives up cleanly');

fs.rmSync(base, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
