import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = '/home/xingweil/workspace/AIWorkspace/vibespace';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const PORT = 3993, CDP_PORT = 9343;
const wt = '/tmp/vs-pooldlg-smoke';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,760', '--user-data-dir=/tmp/vs-pooldlg-chrome', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} try { fs.rmSync('/tmp/vs-pooldlg-chrome', { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await cdp('Page.enable');
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(1500); await evalJs('app.ready'); await sleep(400);
// fake the accounts fetch so the dialog has rows
await evalJs(`(() => {
  const orig = window.fetch;
  window.fetch = (url, ...rest) => {
    if (String(url) === '/api/accounts') return Promise.resolve(new Response(JSON.stringify({ accounts: [
      { id: 'sub-1', name: 'Work Max', type: 'subscription', backend: 'claude', email: 'work@example.com', loggedIn: true },
      { id: 'sub-2', name: 'Personal Max', type: 'subscription', backend: 'claude', email: 'me@example.com', loggedIn: true },
      { id: 'sub-3', name: 'Backup Pro', type: 'subscription', backend: 'claude', email: null, loggedIn: false },
    ]}), { headers: { 'Content-Type': 'application/json' } }));
    return orig(url, ...rest);
  }; return true; })()`);
await evalJs(`app._poolMembersDialog('acct-pool-1', { name: 'MyPool', members: ['sub-1'] }, () => {}); true`);
await sleep(600);
const info = await evalJs(`(() => {
  const dlg = document.getElementById('pool-members-dialog');
  if (!dlg) return { err: 'no dialog' };
  const all = dlg.querySelector('#pool-mem-all');
  const cbs = [...dlg.querySelectorAll('.pool-mem-cb')];
  return { allChecked: all.checked, states: cbs.map((c) => ({ id: c.dataset.id, checked: c.checked, disabled: c.disabled })) };
})()`);
console.log('dialog state:', JSON.stringify(info));
const r = await cdp('Page.captureScreenshot', {});
fs.writeFileSync('/tmp/vs-uiscale-shots/pool-members.png', Buffer.from(r.data, 'base64'));
// toggle All → checkboxes disable
await evalJs(`(() => { const a = document.querySelector('#pool-mem-all'); a.checked = true; a.dispatchEvent(new Event('change')); return true; })()`);
const info2 = await evalJs(`(() => { const cbs = [...document.querySelectorAll('.pool-mem-cb')]; return cbs.map((c) => ({ checked: c.checked, disabled: c.disabled })); })()`);
console.log('after All:', JSON.stringify(info2));
process.exit(0);
