#!/usr/bin/env node
// Window context-menu smoke (2.212.0): title-bar right-click = full menu with
// the "Switch window" submenu (scope setting), Rename + Task Groups on
// session windows; taskbar item right-click carries the same additions.
// Throwaway worktree server + headless chrome raw CDP (stage-smoke pattern).
// Run: node scripts/test-window-menu.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, endRootedProcesses, CHROME_QUIET } from './scratch.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('menu-smoke'), home = scratch('menu-smoke-home'), chromeDir = scratch('menu-smoke-chrome');
// the stop is installed BEFORE the worktree add: a signal during the add, the copy or the build no longer kills the suite outright — Node
// holds it and the stop runs at the first await after them (or at exit, when the signal reached the build's child too); a SIGKILL first still wins
let srv = null, chrome = null, cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome?.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const r of [wt, home, chromeDir]) { try { endRootedProcesses(r); } catch {} }   // the dtach sessions and every child, BY IDENTITY
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, home]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });   // a gate's timeout ends it too
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'scripts']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build:bundles', { cwd: wt, stdio: 'ignore' });

// the EXCLUDED package's verdict (主开发 2026-11-18, the kill law): the throwaway hub runs under a SCRATCH HOME with the hooks switch —
// never the machine user's own home, whose default device-agent root (src/agentd/client.js) is a production one on the hub box —
// its Chrome asks no keyring and keeps its files under its profile, and everything it started ends BY IDENTITY at any exit (as its siblings test-stage-preview and
// test-desktop-reorder): no pattern kill
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(chromeDir, { recursive: true });
// the hub's env: a scratch HOME, none of the machine user's XDG stores nor the session bus VARIABLE (its children resolve the stores under the
// scratch home); XDG_RUNTIME_DIR stays — the tree's own socket rules read it, keyed by the scratch root (src/agentd/client.js)
const { DBUS_SESSION_BUS_ADDRESS: _hb, XDG_CONFIG_HOME: _hc, XDG_DATA_HOME: _hd, XDG_CACHE_HOME: _hk, XDG_STATE_HOME: _hs, ...hubBase } = process.env;
srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...hubBase, ...VNC_ENV, HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', PORT: String(PORT) }, stdio: 'ignore' });
const { DBUS_SESSION_BUS_ADDRESS: _bus, XDG_CONFIG_HOME: _cfg, ...chromeEnv } = process.env; chromeEnv.HOME = chromeDir;   // its crash handler too lives under the profile
chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, `--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });


for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 40, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
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

// open the title-bar menu for a window; returns { top: [top-level labels],
// switch: [submenu labels] } and leaves the menu open
const openTitleMenu = (winId) => evalJs(`(() => {
  document.querySelectorAll('[data-popover]').forEach((p) => p.remove());
  const w = app.wm.windows.get(${JSON.stringify(winId)});
  const span = w.titleBar.querySelector('.window-title') || w.titleBar;
  const r = w.titleBar.getBoundingClientRect();
  span.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 8 }));
  const menu = document.querySelector('[data-popover]');
  if (!menu) return null;
  const top = [...menu.children].filter((el) => !el.className.includes('separator')).map((el) => el.firstChild?.textContent ?? el.textContent);
  const subEl = [...menu.children].find((el) => (el.firstChild?.textContent || '').includes('Switch window'));
  const sub = subEl ? [...subEl.querySelectorAll('div > div')].map((el) => el.textContent) : null;
  return { top, sub };
})()`);

try {
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })' /* in-page poll (2.369.118): the heavy tier went red with "no app" in two chrome lanes at once — one probe 1.5 s after navigate is a bet on load speed */);

  // two overlapping terminals + one far-away file explorer
  // the EXCLUDED package (2026-11-17, its run alone on the test machine): the second terminal opens in its OWN folder, so its
  // switch entry is told apart by its title («Terminal — <cwd>»): a title set by hand was overwritten by the shell's own title
  // (the entry read «Terminal — /tmp/…» and the click found nothing)
  const zwei = path.join(wt, 'zwei-term'); fs.mkdirSync(zwei, { recursive: true });
  await evalJs(`app.openShellTerminal(${JSON.stringify(wt)})`);
  await evalJs(`app.openShellTerminal(${JSON.stringify(zwei)})`);
  let ids = [];
  for (let i = 0; i < 40 && ids.length < 2; i++) {
    ids = await evalJs(`[...app.wm.windows.values()].filter(w => w.type === 'terminal').map(w => w.id)`);
    if (ids.length < 2) await sleep(300);
  }
  check('two terminals opened', ids.length === 2);
  const [w1, w2] = ids;
  await evalJs(`(() => {
    const a = app.wm.windows.get(${JSON.stringify(w1)}), b = app.wm.windows.get(${JSON.stringify(w2)});
    a.gridBounds = { left: 0.1, top: 0.1, width: 0.4, height: 0.4 }; app.wm._applyGridBounds(a);
    b.gridBounds = { left: 0.3, top: 0.3, width: 0.4, height: 0.4 }; app.wm._applyGridBounds(b); // overlaps a
    return true; })()`);
  // Rename and Task Groups are offered only for a window whose SESSION the sidebar lists (taskbar.js sessionForWin — the same
  // rule): the first menu was opened before the sidebar had listed the new shell sessions (its first run alone: no Rename, then
  // Task Groups a second later). Wait for both, bounded, by that rule.
  const bothListed = await evalJs(`new Promise((res) => { const t0 = Date.now(); (function look() {
    const ok = [${JSON.stringify(w1)}, ${JSON.stringify(w2)}].every((id) => { const w = app.wm.windows.get(id); const sp = (w && w._openSpec) || {};
      return (app.sidebar?._allSessions || []).some((s) => (sp.backendSessionId && s.sessionId === sp.backendSessionId) || (sp.serverId && s.webuiId === sp.serverId)); });
    if (ok || Date.now() - t0 > 15000) return res(ok); setTimeout(look, 250); })(); })`);
  check('both terminals are sessions the sidebar lists (Rename / Task Groups follow them)', verdictOf(bothListed));

  // ── title-bar menu, default scope (overlap) ──
  const m1 = await openTitleMenu(w1);
  check('title-bar right-click opens a menu', !!m1, JSON.stringify(m1));
  check('menu has Switch window submenu', !!m1?.sub, JSON.stringify(m1?.top));
  check('overlap scope lists the overlapping terminal', verdictOf((m1?.sub || []).some((s) => s.includes('zwei-term'))), JSON.stringify(m1?.sub));
  check('menu has Rename', verdictOf((m1?.top || []).some((s) => s.includes('Rename'))), JSON.stringify(m1?.top));
  check('menu keeps Move/Minimize/Close', verdictOf(['Move', 'Minimize', 'Close'].every((k) => (m1?.top || []).some((s) => s.includes(k)))), JSON.stringify(m1?.top));

  // task group present → Task Groups submenu appears
  await fetch(`http://127.0.0.1:${PORT}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'menu-smoke-group' }) });
  await sleep(1200); // tasks-updated broadcast → sidebar._tasks
  const m2 = await openTitleMenu(w1);
  check('menu has Task Groups submenu (session window)', verdictOf((m2?.top || []).some((s) => s.includes('Task Groups'))), JSON.stringify(m2?.top));

  // ── scope: all — non-overlapping windows appear too ──
  await evalJs(`(() => { const b = app.wm.windows.get(${JSON.stringify(w2)});
    b.gridBounds = { left: 0.72, top: 0.72, width: 0.22, height: 0.22 }; app.wm._applyGridBounds(b); return true; })()`);
  const mOv = await openTitleMenu(w1);
  check('moved apart: overlap scope no longer lists it', !(mOv?.sub || []).some((s) => s.includes('zwei-term')), JSON.stringify(mOv?.sub));
  await evalJs(`app.settings.set('window.titlebarSwitchScope', 'all')`);
  await sleep(300);
  const mAll = await openTitleMenu(w1);
  check('scope=all lists the non-overlapping terminal', verdictOf((mAll?.sub || []).some((s) => s.includes('zwei-term'))), JSON.stringify(mAll?.sub));

  // clicking the entry focuses the target window
  await evalJs(`(() => {
    const menu = document.querySelector('[data-popover]');
    const subEl = [...menu.children].find((el) => (el.firstChild?.textContent || '').includes('Switch window'));
    const entry = [...subEl.querySelectorAll('div > div')].find((el) => el.textContent.includes('zwei-term'));
    entry.click(); return true; })()`);
  await sleep(300);
  check('clicking the submenu entry focuses the window', verdictOf(await evalJs(`app.wm.activeWindowId === ${JSON.stringify(w2)}`)));

  // ── taskbar item right-click carries Rename too ──
  const tb = await evalJs(`(() => {
    document.querySelectorAll('[data-popover]').forEach((p) => p.remove());
    const item = document.querySelector('#taskbar-items .taskbar-item[data-win-id], #taskbar-items [data-win-id]');
    if (!item) return null;
    const r = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 }));
    const menu = document.querySelector('[data-popover]');
    return menu ? [...menu.children].map((el) => el.firstChild?.textContent ?? el.textContent) : null; })()`);
  check('taskbar item menu has Rename', verdictOf((tb || []).some((s) => s && s.includes('Rename'))), JSON.stringify(tb));
  check('taskbar item menu has Task Groups', verdictOf((tb || []).some((s) => s && s.includes('Task Groups'))), JSON.stringify(tb));
  check('taskbar item menu has NO switch submenu (title-bar only)', !(tb || []).some((s) => s && s.includes('Switch window')), JSON.stringify(tb));
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally {
  try { ws.close(); } catch {}
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nwindow-menu smoke passed');
process.exit(0); import { verdictOf } from './lib/check.mjs';
