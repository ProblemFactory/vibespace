#!/usr/bin/env node
// meta.remote.lastError contract (2.228.1, the lengyue "host reconnecting (9)
// with no reason" report): when the remote transport child dies, the wrapper
// must record the child's last stderr line (or exit code) in meta.remote and
// on the _remote_state stdout line, so the status-bar chip tooltip can name
// the concrete failure instead of a bare attempt counter.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lasterr-'));
const buf = path.join(dir, 't.buf');
const metaPath = path.join(dir, 't.json');

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// OFFSET_MODE via VIBESPACE_REMOTE_SID; the "transport" child fails fast with
// a distinctive stderr line, driving the reconnect loop.
const child = spawn(process.execPath, [
  'data/bin/chat-wrapper.js', buf, metaPath,
  'sh', '-c', 'echo "ssh: connect to host 203.0.113.9 port 22: Connection timed out" >&2; exit 255',
], { env: { ...process.env, VIBESPACE_REMOTE_SID: 'sess-test-1' }, stdio: ['pipe', 'pipe', 'pipe'] });

let stdout = '';
child.stdout.on('data', (d) => { stdout += d; });

await new Promise((r) => setTimeout(r, 3500));
child.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 200));

let meta = {};
try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
check('meta.remote.state is reconnecting', meta.remote?.state === 'reconnecting', JSON.stringify(meta.remote));
check('meta.remote.lastError carries the stderr line',
  /Connection timed out/.test(meta.remote?.lastError || ''), meta.remote?.lastError);
const stateLines = stdout.split('\n').filter((l) => l.includes('"_remote_state"'));
const last = stateLines.length ? JSON.parse(stateLines[stateLines.length - 1]) : null;
check('_remote_state line carries lastError', /Connection timed out/.test(last?.lastError || ''), JSON.stringify(last));
check('attempts increment', (last?.attempts || 0) >= 1);

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
