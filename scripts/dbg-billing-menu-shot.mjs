#!/usr/bin/env node
// Billing-switcher menu visual check (2.258.0 layout-stability redesign).
// Drives the REAL app.showBillingSwitcher with faked account/usage caches
// covering every row shape: CLI login w/ usage, long name, scoped bucket +
// age, missing usage, API account, current ✓. Screenshot to
// /tmp/vs-uiscale-shots/billing-menu.png + per-row single-line asserts.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const PORT = 3995, CDP_PORT = 9345;
const wt = '/tmp/vs-bsw-smoke';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}`); } };
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,760', '--user-data-dir=/tmp/vs-bsw-chrome', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} try { fs.rmSync('/tmp/vs-bsw-chrome', { recursive: true, force: true }); } catch {} };
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

const info = await evalJs(`(() => {
  const now = Date.now();
  app._accounts = { accounts: [
    { id: 'sub-1', name: 'Fish Max', type: 'subscription', backend: 'claude', loggedIn: true },
    { id: 'sub-2', name: 'ProblemFactory Max With A Rather Long Name', type: 'subscription', backend: 'claude', loggedIn: true },
    { id: 'acct-3', name: 'Joinbrix Console', type: 'api', backend: 'claude' },
    { id: 'sub-4', name: 'Natural Max', type: 'subscription', backend: 'claude', loggedIn: true },
  ]};
  app._rateLimit = { fiveHour: { utilization: 0.11 }, sevenDay: { utilization: 0.14 }, scopedWeekly: [{ name: 'Fable', utilization: 0.18 }], fetchedAt: now - 60000 };
  app._accountUsage = {
    'sub-1': { fiveHour: { utilization: 0 }, sevenDay: { utilization: 0.54 }, scopedWeekly: [{ name: 'Fable', utilization: 1 }], fetchedAt: now - 40 * 60000 },
    'sub-2': { fiveHour: { utilization: 0.26 }, sevenDay: { utilization: 0.38 }, scopedWeekly: [{ name: 'Fable', utilization: 0.63 }], fetchedAt: now },
    'sub-4': { fiveHour: { utilization: 0.99 }, sevenDay: { utilization: 0.61 }, scopedWeekly: [], fetchedAt: now - 200 * 60000 },
  };
  app.showBillingSwitcher({ backend: 'claude', backendSessionId: 'fake-1', name: 'S', accountId: 'acct-3' }, { x: 320, y: 90 });
  const menu = document.querySelector('.context-menu');
  if (!menu) return { err: 'no menu' };
  const mr = menu.getBoundingClientRect();
  const rows = [...menu.querySelectorAll('.context-menu-item')].map((el) => {
    const r = el.getBoundingClientRect();
    const name = el.querySelector('.bsw-name');
    const usage = el.querySelector('.bsw-usage');
    const nameEl = el.querySelector('.bsw-name');
    return {
      h: Math.round(r.height),
      // headless matches (hover:none) → 40px touch min-height; single-line
      // truth = the TEXT spans' own height, not the row box
      oneLine: (nameEl ? nameEl.getBoundingClientRect().height : r.height) < 22
        && (!el.querySelector('.bsw-usage') || el.querySelector('.bsw-usage').getBoundingClientRect().height < 22),
      usageRight: usage ? Math.abs(usage.getBoundingClientRect().right - (mr.right - 12)) < 8 : null,
      text: (name?.textContent || el.textContent || '').slice(0, 30),
    };
  });
  return { w: Math.round(mr.width), rows };
})()`);
console.log('menu width:', info.w);
for (const r of info.rows) console.log('  row:', JSON.stringify(r));
check('menu has a stable width ≥340', info.w >= 340 && info.w <= 490);
check('every row is single-line', info.rows.every((r) => r.oneLine));
check('usage clusters right-align to one column', info.rows.filter((r) => r.usageRight != null).every((r) => r.usageRight));
fs.mkdirSync('/tmp/vs-uiscale-shots', { recursive: true });
const shot = await cdp('Page.captureScreenshot', { clip: { x: 280, y: 60, width: 560, height: 360, scale: 1.5 } });
fs.writeFileSync('/tmp/vs-uiscale-shots/billing-menu.png', Buffer.from(shot.data, 'base64'));
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
