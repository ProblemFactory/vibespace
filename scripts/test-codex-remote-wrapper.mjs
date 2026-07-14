#!/usr/bin/env node
// E2E for codex-chat-wrapper's REMOTE MODE (2.139.0, B-0588): a minimal
// JSON-RPC app-server stub runs under the REAL vibespace-remote-keeper; the
// wrapper attaches through `keeper run <sid> __VS_OFFSET__ -- …` exactly like
// the ssh inner command. Verifies: handshake completes through the keeper,
// transport death → reconnect WITHOUT re-initializing (handshake-once — a
// re-init would fork the remote thread), byte-offset continuation, and the
// _remote_exit sentinel finalizing the wrapper.
// Run: node scripts/test-codex-remote-wrapper.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const KEEPER = path.join(dir, '..', 'data', 'bin', 'vibespace-remote-keeper');
const WRAPPER = path.join(dir, '..', 'data', 'bin', 'codex-chat-wrapper.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cxrw-'));
const SID = 'cxtest-1';

// Minimal app-server: answers every request by id; counts initialize calls
// into a side file (handshake-once assertion); emits a notification per
// answered request; exits 9 on a {"method":"__quit__"} line.
const STUB = `
const fs = require('fs');
let b = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  b += d;
  let i;
  while ((i = b.indexOf('\\n')) !== -1) {
    const line = b.slice(0, i); b = b.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method === '__quit__') process.exit(9);
    if (m.method === 'initialize') fs.appendFileSync('${tmp.replace(/\\/g, '/')}/initcount', 'x');
    if (m.id !== undefined && m.method) {
      const result = m.method === 'thread/start' ? { thread: { id: 'th-stub-1' } } : {};
      process.stdout.write(JSON.stringify({ id: m.id, result }) + '\\n');
    }
  }
});
setInterval(() => {}, 1e3);
`;

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buf = path.join(tmp, 's.buf');
const metaF = path.join(tmp, 's.meta');
const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaF, 'utf8')); } catch { return null; } };
const readBuf = () => { try { return fs.readFileSync(buf, 'utf8'); } catch { return ''; } };

console.log('— codex remote wrapper: handshake through the keeper —');
const w = spawn(process.execPath, [
  WRAPPER, buf, metaF,
  process.execPath, KEEPER, 'run', SID, '__VS_OFFSET__', '--', process.execPath, '-e', STUB,
], {
  env: {
    ...process.env,
    VIBESPACE_KEEPER_DIR: tmp,
    VIBESPACE_REMOTE_SID: SID,
    CODEX_WEBUI_CWD: '/definitely/not/a/local/path', // remote path — spawn must not use it locally
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
w.outText = '';
w.stdout.on('data', (d) => { w.outText += d; });
w.stderr.on('data', () => {});
await sleep(4500); // keeper daemon start + initialize + thread/start
const m1 = readMeta();
check('spawn survived the remote-only cwd (ENOENT trap)', w.exitCode === null, String(w.exitCode));
check('handshake completed (threadId adopted from thread/start)', m1 && m1.threadId === 'th-stub-1', JSON.stringify(m1 && m1.threadId));
check('initialize sent exactly once', (fs.readFileSync(path.join(tmp, 'initcount'), 'utf8') || '').length === 1, '');
check('_remote_state connected recorded', readBuf().includes('"_remote_state"'), '');

console.log('— transport death: reconnect, NO re-initialize —');
const km = JSON.parse(fs.readFileSync(path.join(tmp, SID + '.json'), 'utf8'));
// kill the wrapper's CHILD (the keeper-run attach = the "ssh"), daemon+stub live on
const wrapperChild = readMeta().childPid;
process.kill(wrapperChild, 'SIGKILL');
await sleep(3500); // backoff #1 = 1s, respawn, reattach
const m2 = readMeta();
check('reconnected (fresh attach child)', m2.childPid !== wrapperChild && m2.childPid > 0, JSON.stringify({ was: wrapperChild, now: m2.childPid }));
check('stub app-server untouched by the pipe death', (() => { try { process.kill(km.childPid, 0); return true; } catch { return false; } })(), '');
check('STILL exactly one initialize (handshake-once)', (fs.readFileSync(path.join(tmp, 'initcount'), 'utf8') || '').length === 1, '');

console.log('— remote end: sentinel finalizes the wrapper —');
w.stdin.write(JSON.stringify({ type: 'chat-input' }) + '\n'); // no-op poke (ignored shape)
// tell the stub to exit via a direct socket write (the wrapper path would need a real turn)
const net = await import('node:net');
const sock = net.connect(path.join(tmp, SID + '.sock'));
await new Promise((r) => sock.on('connect', r));
sock.write(JSON.stringify({ method: '__quit__' }) + '\n');
await sleep(2500);
check('wrapper exited with the remote exit code', w.exitCode === 9, String(w.exitCode));
const m3 = readMeta();
check('meta not streaming after finalize', m3 && m3.streaming === false, JSON.stringify(m3 && m3.streaming));

try { sock.destroy(); } catch {}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall codex-remote-wrapper tests passed');
process.exit(0);
