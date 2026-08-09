#!/usr/bin/env node
// Dead-reckoning estimation VISUAL check (B-fcff v2): drives the REAL usage
// popup + Manage-Agents accounts tab with faked caches + estimates covering
// normal (est > reading), rolled (est < reading — dark collapses to 0) and
// no-estimate rows, plus a POOLED account row (icon + target usage). Shots to
// /tmp/vs-est-shots/{popup,agents}.png + structural asserts.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const PORT = 3993, CDP_PORT = 9343;
const wt = '/tmp/vs-est-smoke';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}`); } };
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1200,800', '--user-data-dir=/tmp/vs-est-chrome', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} try { fs.rmSync('/tmp/vs-est-chrome', { recursive: true, force: true }); } catch {} };
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
await evalJs('new Promise(r => { const t = setInterval(() => { if (window.app) { clearInterval(t); r(); } }, 100); })');
await evalJs('app.ready'); await sleep(600);

const FIX = `
  const now = Date.now();
  const R5 = Math.floor(now/1000) + 7200, RW = Math.floor(now/1000) + 3*86400;
  app._accounts = { accounts: [
    { id: 'sub-1', name: 'ProblemFactory Max', type: 'subscription', backend: 'claude', loggedIn: true, email: 'pf@x.com' },
    { id: 'sub-2', name: 'Fish Max', type: 'subscription', backend: 'claude', loggedIn: true, email: 'fish@x.com' },
    { id: 'pool-1', name: 'The Pool', type: 'pooled', backend: 'claude', pooled: true, current: 'sub-1', currentName: 'ProblemFactory Max', loggedIn: true, memberOptions: [{id:'sub-1',name:'ProblemFactory Max'},{id:'sub-2',name:'Fish Max'}], supported: true },
    { id: 'acct-9', name: 'Console Key', type: 'api', backend: 'claude', tail: 'ab12cd34' },
  ], defaultAccountId: 'sub-1' };
  app._rateLimit = null; app._usageGlobal = {};
  app._accountUsage = {
    'sub-1': { fiveHour: { utilization: 0.41, resetsAt: R5 }, sevenDay: { utilization: 0.41, resetsAt: RW }, scopedWeekly: [{ name: 'Fable', utilization: 0.67, resetsAt: RW }], fetchedAt: now - 42*60000, scopedFetchedAt: now - 42*60000 },
    'sub-2': { fiveHour: { utilization: 0.62, resetsAt: R5 }, sevenDay: { utilization: 0.30, resetsAt: RW }, scopedWeekly: [], fetchedAt: now - 5*60000 },
  };
  app._usageEstimates = {
    'sub-1': { estimated: true, anchorAt: now - 42*60000, asOf: now,
      fiveHour: { utilization: 0.55, resetsAt: R5, estimated: true },
      sevenDay: { utilization: 0.47, resetsAt: RW, estimated: true },
      scopedWeekly: [{ name: 'Fable', utilization: 0.78, resetsAt: RW, estimated: true }] },
    'sub-2': { estimated: true, anchorAt: now - 5*60000, asOf: now,
      fiveHour: { utilization: 0.08, resetsAt: R5 + 5*3600, estimated: true }, // ROLLED: est < reading
      sevenDay: { utilization: 0.31, resetsAt: RW, estimated: true },
      scopedWeekly: [] },
  };
`;

// ── 1. usage popup (selection: sub-1 via default/auto) ──────────────────────
const pop = await evalJs(`(() => { ${FIX}
  try { localStorage.setItem('vibespace.usageAccount', 'sub-1'); } catch {}
  app._usageAcctSel = 'sub-1';
  app._renderUsage();
  const popup = document.getElementById('usage-popup');
  popup.classList.remove('hidden'); popup.style.left = '30px'; popup.style.top = '30px'; popup.style.right = 'auto'; popup.style.bottom = 'auto'; popup.style.position = 'fixed';
  const bars = [...popup.querySelectorAll('.usage-bar')].map((b) => ({
    fillW: b.querySelector('.usage-bar-fill')?.style.width || null,
    est: b.querySelector('.usage-bar-est')?.style.width || null,
  }));
  const estStats = [...popup.querySelectorAll('.usage-est-stat')].map((s) => s.textContent.trim());
  const donutEst = document.querySelectorAll('#taskbar-usage .usage-donut-est').length;
  return { bars, estStats, donutEst, html: popup.innerHTML.length };
})()`);
console.log('popup bars:', JSON.stringify(pop.bars));
console.log('popup est stats:', JSON.stringify(pop.estStats));
check('popup: every bar carries an est layer (5h/7d/Fable)', pop.bars.filter((b) => b.est).length >= 3);
check('popup: est stats rendered with pct', pop.estStats.length >= 3 && pop.estStats.some((s) => /55%/.test(s)));
check('taskbar pies: est rings on both donuts', pop.donutEst === 2);
fs.mkdirSync('/tmp/vs-est-shots', { recursive: true });
await sleep(200);
let shot = await cdp('Page.captureScreenshot', { clip: { x: 0, y: 0, width: 460, height: 560, scale: 1.5 } });
fs.writeFileSync('/tmp/vs-est-shots/popup.png', Buffer.from(shot.data, 'base64'));

// ── 2. Manage Agents accounts tab (incl. pooled row + rolled sub-2) ─────────
const ag = await evalJs(`(async () => { ${FIX}
  document.getElementById('usage-popup').classList.add('hidden');
  // Stub the roster fetches so refresh() renders our fixture accounts.
  const origFetch = window.fetch;
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('/api/accounts') && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve(new Response(JSON.stringify({ accounts: app._accounts.accounts, defaultAccountId: 'sub-1', subscription: { loggedIn: false }, codex: { installed: false } }), { headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/backend-status')) {
      return Promise.resolve(new Response(JSON.stringify({ claude: { installed: true, version: '2.1.x', loggedIn: false }, codex: { installed: false } }), { headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/usage') && !u.includes('refresh')) {
      return Promise.resolve(new Response(JSON.stringify({ accounts: app._accountUsage, estimates: app._usageEstimates, globalLogin: {}, codexGlobalLogin: {}, codexAccounts: {}, hosts: {}, hostAccounts: {} }), { headers: { 'Content-Type': 'application/json' } }));
    }
    return origFetch(url, opts);
  };
  try { localStorage.setItem('vibespace.agentsTab', 'accounts'); } catch {}
  // Force the MODAL form (rail panel engages the ≤340px pill fallback — the
  // donut light-arc rendering is only visible in the wide modal).
  try { app.settings.set('sidebar.activityRail', false); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  app._showAgentsDialog();
  await new Promise((r) => setTimeout(r, 1800));
  const dlg = document.querySelector('.agents-dialog') || document.querySelector('#manage-agents-overlay') || document.body;
  const rows = [...document.querySelectorAll('.acct-key-row')].map((r2) => ({
    id: r2.dataset.id,
    icon: r2.querySelector('.acct-type-icon')?.innerHTML.includes('circle cx="5.4"') ? 'pool' : (r2.querySelector('.acct-type-icon')?.innerHTML.includes('12.5h11') ? 'crown' : 'key'),
    donuts: r2.querySelectorAll('.acct-usage-donut').length,
    estDonuts: r2.querySelectorAll('.acct-donut-est').length,
    usageTip: r2.querySelector('.acct-donut-est')?.title || null,
  }));
  return { rows };
})()`);
for (const r of ag.rows) console.log('  row:', JSON.stringify(r));
const poolRow = ag.rows.find((r) => r.id === 'pool-1');
const sub1Row = ag.rows.find((r) => r.id === 'sub-1');
const sub2Row = ag.rows.find((r) => r.id === 'sub-2');
check('agents: pooled row uses the POOL icon (not KEY)', poolRow?.icon === 'pool');
check('agents: pooled row shows its TARGET\'s usage donuts', (poolRow?.donuts || 0) >= 2);
check('agents: sub-1 donuts carry est rings', (sub1Row?.estDonuts || 0) >= 2);
check('agents: rolled sub-2 est ring present too', (sub2Row?.estDonuts || 0) >= 1);
check('agents: est tooltip names the estimate', /est|预计|推定/.test(poolRow?.usageTip || sub1Row?.usageTip || ''));
// pool ⋯ menu must NOT offer "Show key…"
const menu = await evalJs(`(async () => {
  const row = [...document.querySelectorAll('.acct-key-row')].find((r) => r.dataset.id === 'pool-1');
  row.querySelector('.acct-menu').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const items = [...document.querySelectorAll('.context-menu .context-menu-item')].map((i) => i.textContent.trim());
  document.querySelector('.context-menu')?.remove();
  return items;
})()`);
console.log('pool menu:', JSON.stringify(menu));
check('agents: pool ⋯ menu has NO "Show key…"', menu.length > 0 && !menu.some((i) => /Show key|查看.*key/i.test(i)));
check('agents: pool ⋯ menu has pool actions', menu.some((i) => /Switch target|Members/.test(i)));
await sleep(200);
shot = await cdp('Page.captureScreenshot', { clip: { x: 0, y: 0, width: 1200, height: 760, scale: 1.1 } });
fs.writeFileSync('/tmp/vs-est-shots/agents.png', Buffer.from(shot.data, 'base64'));

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
console.log('shots: /tmp/vs-est-shots/popup.png /tmp/vs-est-shots/agents.png');
process.exit(failed ? 1 : 0);
