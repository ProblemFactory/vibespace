#!/usr/bin/env node
// Sidebar activity rail smoke (task #149, 2.176.0 — docs/design-sidebar-rail.md):
// rail renders by default, panel tabs (Ports / Agents / Plugins) render into the
// sidebar list area, re-click collapses the sidebar, and turning the setting off
// live-restores the classic tab bar (and back on again restores the rail).
// Runs a THROWAWAY server in a git worktree (own data dir — never touches a
// live instance) + headless chrome over raw CDP. Requires google-chrome.
// Run: node scripts/test-sidebar-rail.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const PORT = 3988, CDP_PORT = 9338;
const wt = '/tmp/vs-rail-smoke';
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree ──────────────────────────────────────────
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', '--user-data-dir=/tmp/vs-rail-smoke-chrome', 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync('/tmp/vs-rail-smoke-chrome', { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))');
  await sleep(800); // rail builds on a constructor setTimeout + settings load

  // default ON: rail present, classic tab bar hidden
  check('rail renders by default', await evalJs(`!!document.getElementById('sidebar-rail')`));
  check('rail has 9 items', await evalJs(`document.querySelectorAll('#sidebar-rail .rail-item').length === 9`)); // 2.216.0 added the system icon
  check('classic tab bar hidden', await evalJs(`getComputedStyle(document.querySelector('.sidebar-tabs')).display === 'none'`));
  check('sidebar content wrapped', await evalJs(`!!document.querySelector('#sidebar .sidebar-main')`));

  // panel tabs render into the list area
  const openPanel = async (id) => {
    await evalJs(`app.sidebar._railGo(${JSON.stringify(id)})`);
    await sleep(600);
    return evalJs(`!!document.querySelector('.rail-panel-${id}')`);
  };
  check('ports panel renders', await openPanel('ports'));
  check('ports panel shows local machine scan', await evalJs(`document.querySelector('.rail-panel-ports .ports-machine') !== null`));
  check('agents panel renders', await openPanel('agents'));
  // redesign: roster header has the Add-account menu button, rows carry a ⋯ menu
  check('agents roster uses redesigned header', await evalJs(`!!document.querySelector('.rail-panel-agents .acct-roster-head .acct-add')`));
  // a fresh instance has only the CLI-login row (no ⋯); IF a named account
  // exists it must carry the ⋯ menu, and NO row may carry the old Test button
  check('named account rows (if any) have overflow menu, none have inline Test', await evalJs(`
    (() => { const rows = [...document.querySelectorAll('.rail-panel-agents .acct-key-row:not([data-id="__global__"]):not([data-id="__codex_global__"])')];
      const noTest = !document.querySelector('.rail-panel-agents .acct-test');
      const allMenu = rows.every(r => r.querySelector('.acct-menu'));
      return noTest && allMenu; })()`));
  // add-account menu opens a context menu
  await evalJs(`document.querySelector('.rail-panel-agents .acct-add').click()`);
  await sleep(200);
  check('add-account opens a menu', await evalJs(`!!document.querySelector('.context-menu')`));
  await evalJs(`document.querySelector('.context-menu')?.remove()`);
  check('plugins panel renders', await openPanel('plugins'));

  // gs-menu style entry redirects to the rail panel (no modal)
  await evalJs(`app.sidebar._railGo('folders')`);
  await sleep(200);
  await evalJs(`app.openPluginsDialog()`);
  await sleep(500);
  check('openPluginsDialog redirects to rail panel', await evalJs(`!!document.querySelector('.rail-panel-plugins') && !document.getElementById('plugins-dialog')`));

  // re-click active item collapses the sidebar — but the rail STRIP persists
  // (sidebar.railPersistent, default ON) and a rail click expands back
  await evalJs(`app.sidebar._railGo('plugins')`);
  await sleep(200);
  check('re-click collapses sidebar', await evalJs(`!app.sidebar.isOpen`));
  check('collapsed keeps the rail strip', await evalJs(`document.getElementById('sidebar').classList.contains('rail-collapsed')`));
  check('collapsed strip is 44px', await evalJs(`Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 44`));
  check('panel area hidden while collapsed', await evalJs(`getComputedStyle(document.querySelector('.sidebar-main')).display === 'none'`));
  await evalJs(`app.sidebar._railGo('folders')`);
  await sleep(200);
  check('rail click expands back', await evalJs(`app.sidebar.isOpen && !document.getElementById('sidebar').classList.contains('rail-collapsed')`));
  // railPersistent OFF → collapsing hides everything (classic)
  await evalJs(`app.settings.set('sidebar.railPersistent', false)`);
  await sleep(1200); // let the save echo land (applyRemote guard covers the debounce)
  await evalJs(`app.sidebar.toggle(false)`);
  await sleep(200);
  check('persistent off: collapse hides fully', await evalJs(`!document.getElementById('sidebar').classList.contains('rail-collapsed')`));
  await evalJs(`app.settings.set('sidebar.railPersistent', true)`);
  await sleep(200);
  check('persistent back on applies live to a collapsed sidebar', await evalJs(`document.getElementById('sidebar').classList.contains('rail-collapsed')`));
  await evalJs(`app.sidebar.toggle(true)`);
  // header title tracks the active panel
  await evalJs(`app.sidebar._railGo('ports')`);
  await sleep(300);
  check('header title tracks panel', await evalJs(`document.querySelector('#sidebar .sidebar-title').textContent.length > 0 && document.querySelector('#sidebar .sidebar-title').textContent !== 'Sessions'`));
  await evalJs(`app.sidebar._railGo('folders')`);
  await sleep(200);
  check('header title restores for sessions', await evalJs(`document.querySelector('#sidebar .sidebar-title').textContent === 'Sessions'`));

  // setting OFF live-restores the classic tab bar + falls back to a session tab
  await evalJs(`app.settings.set('sidebar.activityRail', false)`);
  await sleep(500);
  check('rail removed when setting off', await evalJs(`!document.getElementById('sidebar-rail')`));
  check('classic tab bar restored', await evalJs(`getComputedStyle(document.querySelector('.sidebar-tabs')).display !== 'none'`));
  check('panel tab fell back to folders', await evalJs(`app.sidebar._activeTab === 'folders'`));

  // and back ON
  await evalJs(`app.settings.set('sidebar.activityRail', true)`);
  await sleep(500);
  check('rail rebuilt when setting on', await evalJs(`!!document.getElementById('sidebar-rail')`));

} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message);
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
