#!/usr/bin/env node
// LOCAL session-spawn regression guard: after the B.2/B.3 ws-handler create-
// path surgery (dial branch + deviceAgentSetup wrapping), a NORMAL local
// session must still spawn byte-identically. Creates a shell terminal session
// over WS against a throwaway server and asserts it reaches 'created' + the
// dtach wrapper actually runs (no claude/login needed). Arg 1 = checkout dir.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const wt = process.argv[2] || '/tmp/vs-fixtest';
const PORT = 3991;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
process.on('exit', () => {
  try { srv.kill('SIGKILL'); } catch {}
  try { for (const s of fs.readdirSync(path.join(wt, 'data', 'sockets'))) execSync(`pkill -f ${JSON.stringify(path.join(wt, 'data', 'sockets', s))}`); } catch {}
  try { for (const d of ['sockets','session-meta','session-buffers']) fs.rmSync(path.join(wt, 'data', d), { recursive: true, force: true }); } catch {}
});

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });

let createdId = null, exited = false;
ws.on('message', (d) => {
  let m; try { m = JSON.parse(d); } catch { return; }
  if (m.type === 'created' && m.reqId === 'smoke-1') createdId = m.sessionId;
  if (m.type === 'exited' && m.sessionId === createdId) exited = true;
});

try {
  const home = (await (await fetch(`http://127.0.0.1:${PORT}/api/home`)).json()).home;
  ws.send(JSON.stringify({ type: 'create', reqId: 'smoke-1', backend: 'shell', mode: 'terminal', cwd: home, cols: 80, rows: 24 }));
  for (let i = 0; i < 40 && !createdId; i++) await sleep(200);
  check('local shell session reached "created"', !!createdId, 'no created event');
  await sleep(1500);
  // the dtach socket + wrapper must exist and be live
  const socks = fs.existsSync(path.join(wt, 'data', 'sockets')) ? fs.readdirSync(path.join(wt, 'data', 'sockets')) : [];
  check('dtach socket created for the session', socks.some((s) => s.startsWith('cw-')), socks.join(','));
  let procs = '';
  try { procs = execSync(`pgrep -af 'sockets/cw-${createdId}' || true`, { encoding: 'utf8' }); } catch {}
  check('wrapper process is running (dtach spawned it)', procs.includes(createdId), procs.slice(0, 120));
  check('session did NOT immediately exit', !exited);
  // kill it cleanly
  ws.send(JSON.stringify({ type: 'kill', sessionId: createdId }));
  await sleep(800);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.message);
} finally { try { ws.close(); } catch {} }

console.log(failed ? `\n${failed} FAILED` : '\nlocal session spawn intact');
process.exit(failed ? 1 : 0);
