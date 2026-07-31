#!/usr/bin/env node
// attach-ack proof-of-life contract (2.234.1, lengyue mass false-death
// incident): EVERY ws attach — real, sub-, or nonexistent id — must get a
// synchronous attach-ack BEFORE the (possibly slow) attached/error reply, so
// the client can tell "server alive and processing" from "server gone" and
// stop declaring live sessions dead on slow replies.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3991;
const wt = '/tmp/vs-ack-smoke';
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const cleanup = () => {
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });

const probe = (sessionId) => new Promise((resolve) => {
  const seen = [];
  const h = (d) => {
    let m = {}; try { m = JSON.parse(d); } catch { return; }
    if (m.sessionId !== sessionId && m.type !== 'error') return;
    seen.push(m.type);
    if (m.type === 'attached' || m.type === 'error') { ws.off('message', h); resolve(seen); }
  };
  ws.on('message', h);
  ws.send(JSON.stringify({ type: 'attach', sessionId }));
  setTimeout(() => { ws.off('message', h); resolve(seen); }, 8000);
});

const dead = await probe('sess-does-not-exist-123');
check('nonexistent id: ack precedes the error reply', dead[0] === 'attach-ack', JSON.stringify(dead));
check('nonexistent id: still gets a terminal reply', dead.includes('error') || dead.includes('attached'), JSON.stringify(dead));

const sub = await probe('sub-agent-deadbeef00000000');
check('sub- viewer attach also acked first', sub[0] === 'attach-ack', JSON.stringify(sub));

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
