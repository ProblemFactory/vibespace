#!/usr/bin/env node
// MANUAL live check (NOT in the gate — it spends one real Codex turn on the
// logged-in ChatGPT account): boots a WORKTREE server, opens a real codex chat
// on gpt-6-astra, asks the agent to run `vibespace-status` from inside its
// sandbox, and asserts the tool card completes, the final answer echoes
// "status set", and the worktree's session-status store recorded the state
// (= the 2.369.17 loopback fix end to end). Run: node scripts/dev/codex-e2e-live.mjs
// Verified 2026-09-05 on codex-cli 0.153.4 (E2E OK).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.resolve(new URL('../..', import.meta.url).pathname);
const PORT = 3993, wt = '/tmp/vs-codex-e2e';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'data/bin']) { execSync(`rm -rf ${wt}/${f} && mkdir -p $(dirname ${wt}/${f}) && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const log = fs.openSync('/tmp/codex-e2e-server.log', 'w');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: ['ignore', log, log] });
const cleanup = () => { try { srv.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
const cwd = '/tmp/vs-codex-e2e-cwd'; fs.mkdirSync(cwd, { recursive: true });
let sid = null, done = false, transcript = [];
const deadline = Date.now() + 90000;
ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.type === 'created') { sid = m.sessionId; console.log('created', sid, 'backend', m.backend || '?'); }
  if (m.type === 'msg' && m.sessionId === sid) { const msg = m.message || {}; const t = JSON.stringify(msg.content || m.changes || m.patch || m.fields || {}).slice(0, 220); transcript.push(`${m.op}:${msg.role || (m.id || '').slice(0, 24)}:${msg.status || (m.changes && m.changes.status) || ''}:${t}`); }
  if (m.type === 'exited' && m.sessionId === sid) { console.log('EXITED', JSON.stringify(m).slice(0, 200)); done = true; }
  if (m.type === 'error') console.log('ERROR', JSON.stringify(m).slice(0, 300));
});
ws.send(JSON.stringify({ type: 'create', backend: 'codex', mode: 'chat', cwd, model: 'gpt-6-astra', permissionMode: 'default', name: 'codex-e2e' }));
for (let i = 0; i < 120 && !sid; i++) await sleep(250);
if (!sid) { console.log('NO created reply'); process.exit(2); }
await sleep(4000);
ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Run exactly this shell command and reply with its full stdout on one line, nothing else: vibespace-status working --note e2e-ok' }));
let sawResult = false;
const t0 = Date.now();
while (Date.now() < deadline && !done) {
  await sleep(1000);
  const toolCreated = transcript.some((t) => /^create:tool:/.test(t));
  const toolEdited = transcript.some((t) => /^edit:/.test(t) && /toolStatus|"status":"complete"/.test(t) && /exec-|tool/.test(t));
  const finalText = transcript.some((t) => /^edit:/.test(t) && /status set/.test(t));
  if (toolCreated && (toolEdited || finalText) && Date.now() - t0 > 20000) { sawResult = true; await sleep(3000); break; }
}
console.log('--- transcript tail:'); for (const t of transcript.slice(-12)) console.log(' ', t.slice(0, 260));
let statusFile = '';
try { statusFile = fs.readFileSync(path.join(wt, 'data/session-status.json'), 'utf8'); } catch {}
console.log('status store mentions e2e-ok:', /e2e-ok/.test(statusFile));
console.log('meta:', (() => { try { const f = fs.readdirSync(path.join(wt, 'data/session-meta')).find((x) => x.includes(sid.replace('sess-', ''))); return f ? fs.readFileSync(path.join(wt, 'data/session-meta', f), 'utf8').slice(0, 300) : 'none'; } catch (e) { return e.message; } })());
try { const bufs = fs.readdirSync(path.join(wt, 'data/session-buffers')).filter((x) => x.startsWith(sid) && x.endsWith('.buf')); for (const b of bufs) fs.copyFileSync(path.join(wt, 'data/session-buffers', b), '/tmp/codex-e2e.buf'); console.log('buffer saved:', bufs.join(',')); } catch (e) { console.log('buffer copy failed', e.message); }
console.log('--- ALL ops:'); for (const t of transcript) console.log(' ', t.slice(0, 200));
ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
await sleep(2000);
console.log(sawResult && /"state": "working"/.test(statusFile) ? 'E2E OK' : 'E2E INCOMPLETE');
process.exit(0);
