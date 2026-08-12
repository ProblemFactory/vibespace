#!/usr/bin/env node
// Restore-path smoke (decomposition guard): boot an ISOLATED worktree server,
// create a real dtach shell session over WS, SIGKILL the server, boot again,
// assert the session RECONNECTS. This crosses the src/server/session-stdout.js
// + boot-restore.js seam end-to-end — the exact path a wiring miss breaks
// (it caught the deviceMgr live-read gap the empty-data boot smoke could not).
// NEVER run server.js from the repo dir for smokes: the repo's data/ is
// PRODUCTION and restoreSessions would attach to live sessions (#127 class).
import { WebSocket } from 'ws';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wt = `/tmp/vs-restore-smoke-${process.pid}`;
const PORT = 3971 + (process.pid % 20);
execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const cleanup = () => {
  try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { }
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);

const boot = () => spawn('node', ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const waitReady = (p) => new Promise((res, rej) => {
  let out = '';
  p.stdout.on('data', (d) => { out += d; if (out.includes('Ready.')) res(out); });
  p.stderr.on('data', (d) => { out += d; });
  setTimeout(() => rej(new Error('boot timeout\n' + out)), 20000);
});

let srv = boot(); await waitReady(srv);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws.on('open', r));
const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: '/tmp', cols: 80, rows: 24, reqId: 'r1' }));
await new Promise((res, rej) => {
  const t = setInterval(() => { if (msgs.some((m) => m.type === 'created')) { clearInterval(t); res(); } }, 200);
  setTimeout(() => { clearInterval(t); rej(new Error('no created reply: ' + JSON.stringify(msgs.map((m) => m.type)))); }, 12000);
});
const sid = msgs.find((m) => m.type === 'created').sessionId;
console.log('created', sid);
await new Promise((r) => setTimeout(r, 1500));
ws.close(); srv.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 800));
srv = boot(); const out2 = await waitReady(srv);
const ok = /Reconnected/.test(out2);
console.log(ok ? 'RESTORE OK — session reconnected after SIGKILL restart' : 'RESTORE FAILED:\n' + out2);
const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws2.on('open', r));
ws2.send(JSON.stringify({ type: 'kill', sessionId: sid }));
await new Promise((r) => setTimeout(r, 1200));
ws2.close(); srv.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 300));
console.log(ok ? 'ALL PASS (1)' : 'FAIL');
process.exit(ok ? 0 : 1);
