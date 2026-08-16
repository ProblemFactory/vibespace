#!/usr/bin/env node
// resolveWrapperFiles (2.339.2): the sidecar/buffer pair must resolve to the
// files the wrapper ACTUALLY maintains, even for counter-collision sessions
// whose socket name and wrapper-env id diverged (the 设备运维大师 incident:
// boot-restore read a nonexistent sidecar into catch{} on every restart and
// silently lost streaming/goal/todos/buffer for those sessions).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveWrapperFiles } = require('../src/server/wrapper-files.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wf-'));
try {
  // 1. healthy session: expected pair exists → returned untouched, no /proc walk
  fs.writeFileSync(path.join(tmp, 'sess-1-123.json'), '{}');
  const r1 = resolveWrapperFiles(tmp, 'sess-1-123', '/nonexistent/sock');
  ok(r1.sidecar === path.join(tmp, 'sess-1-123.json'), 'existing sidecar wins without any /proc walk');

  // 2. missing sidecar + no matching process → falls back to the expected pair
  const r2 = resolveWrapperFiles(tmp, 'sess-9-999', path.join(tmp, 'no-such-socket'));
  ok(r2.buf === path.join(tmp, 'sess-9-999.buf') && r2.sidecar === path.join(tmp, 'sess-9-999.json'),
    'no process match → expected pair (never throws)');

  // 3. REAL /proc resolution: spawn a decoy process whose argv mimics the
  //    dtach master shape (dtach\0-c\0<sock>…chat-wrapper.js…<buf>)
  const sock = path.join(tmp, 'cw-5-555');
  const buf = path.join(tmp, 'sess-4-444.buf');
  fs.writeFileSync(buf.replace(/\.buf$/, '.json'), JSON.stringify({ streaming: false }));
  const { spawn } = await import('node:child_process');
  // argv[0] must literally contain 'dtach' and the args '-c <sock> … chat-wrapper.js … <buf>'
  const decoyPath = path.join(tmp, 'dtach');
  fs.writeFileSync(decoyPath, '#!/bin/bash\nsleep 15\n'); fs.chmodSync(decoyPath, 0o755);
  const decoy = spawn(decoyPath, ['-c', sock, 'x', 'node', 'chat-wrapper.js', buf, buf.replace(/\.buf$/, '.json')], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  const r3 = resolveWrapperFiles(tmp, 'sess-5-555', sock);
  decoy.kill('SIGKILL');
  ok(r3.buf === buf && r3.sidecar === buf.replace(/\.buf$/, '.json'),
    'counter-collision shape: wrapper files resolved from the socket process argv', JSON.stringify(r3));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
