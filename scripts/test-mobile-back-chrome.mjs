#!/usr/bin/env node
// THE PHONE'S BACK GESTURE in a real Chrome (lane mobile-back-guard, 2026-10-18 — the owner: 「在手机版上能不能 block 一下
// 那个返回手势啊？」). A throwaway server in a git worktree (test-mobile-gaps' harness: the built public/ overlaid) and
// headless Chrome over raw CDP at 390×844, DPR 3, an Android UA, touch emulation, hover:none / pointer:coarse — so
// app.isMobile AND app.isTouch hold as on a phone. Every app is entered from a "previous page" (a data: URL), so
// "leaving VibeSpace" is the tab landing back on it. Two kinds of back: `history.back()` from the page (the brief's
// leg) and the BROWSER's own back — the Alt+Left accelerator, i.e. NavigationController::GoBack with Chrome's
// back-button intervention, the same path Android's back gesture takes.
//   A  phone: one sentinel at boot; the window switcher, the "+" sheet (history.back()), the New Session dialog, the
//      For-you tray, the window area (→ the sidebar, the window kept), the Task Groups drill-down (→ its list) each
//      close on ONE back with the URL and the history length unchanged; at home the toast (seen — not an unread
//      notification), a lapse of 2 s re-arms, a second back inside 2 s leaves to the previous page
//   B  an untouched page is never stranded (Chrome may skip an entry pushed before any tap — it is said which way it
//      went); a reload standing on the sentinel keeps ONE sentinel and the next back still closes a menu; a #fragment
//      navigation is no back (the sheet stays, a sentinel stands above it)
//   C  a `?` deep link in zh: the first back closes no window and says 再返回一次退出; after 2 s the window yields
//   D  the Mobile setting off: one browser back leaves at once
//   E  a 1280×800 desktop: no sentinel, `overscroll-behavior` stays auto (the phone: none), one back leaves
//   F  (lane phone-first-screen, design q-044 decision 5) asks open ⇒ the boot lands on the ATTENTION PAGE, which is home:
//      a back on it arms the toast; ☰ then back closes the sidebar (back on the page, no toast); a window opened from it
//      hides it and one back returns to the page (the window kept); the For-you sheet over it closes on one back
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-mobile-back-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('mobile-back-wt');
const fakeHome = scratchHome('mobile-back-home', fs);
const chromeDir = scratch('mobile-back-chrome'); // its own registered scratch root (a `${wt}-chrome` sibling outlived Chrome's SIGKILL twice)
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PREV = 'data:text/html,<title>prev</title><h1>the page before VibeSpace</h1>';
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const stubPath = `${wt}-claude-stub`; // never a vendor CLI: the boot probes get a version and nothing else
fs.writeFileSync(stubPath, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const startServer = () => spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
let srv = startServer(); // `let`: F restarts it on a For-you store with asks (the store reads data/user-todos.json at boot)
const restartWith = async (items) => {
  const was = srv; was.kill('SIGKILL');
  await new Promise((r) => { if (was.exitCode !== null || was.signalCode) r(); else { was.once('exit', r); setTimeout(r, 3000); } });
  fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items }, null, 2));
  srv = startServer();
  for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }
};
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, chromeDir]) { try { endRootedProcesses(root); } catch { } } // whatever the server / Chrome started under its roots (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 240e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard over the nav bar
const nav = async () => { const h = await cdp('Page.getNavigationHistory'); return { index: h.currentIndex, len: h.entries.length, url: h.entries[h.currentIndex].url }; };
const onApp = (n) => n.url.startsWith(ORIGIN);
/** The BROWSER's back (the Alt+Left accelerator → NavigationController::GoBack, the intervention's skip rule included). */
const browserBack = async (wait = 700) => {
  for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
  await sleep(wait);
};
const jsBack = async (wait = 700) => { await evalJs('history.back(); true'); await sleep(wait); };
const tapAt = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(50);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
};
const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const tap = async (sel) => { const p = await centerOf(sel); if (!p) throw new Error('tap: nothing at ' + sel); await tapAt(p.x, p.y); };
const longPress = async (sel, ms = 700) => {
  const p = await centerOf(sel); if (!p) throw new Error('longPress: nothing at ' + sel);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(ms);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
};
const toasts = () => evalJs(`[...document.querySelectorAll('#global-toasts .global-toast-body')].map((e) => e.textContent)`);
const phone = async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
};
const desk = async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] });
};
/** The previous page, then VibeSpace (`query` = a deep link); waits for the restore to settle. */
const boot = async (query = '') => {
  await cdp('Page.navigate', { url: PREV }); await sleep(300);
  await cdp('Page.navigate', { url: `${ORIGIN}/${query}` });
  await waitFor('!!(window.app && app.ready)', 20000);
  await evalJs('app.ready.then(() => true)');
  await waitFor('!app.layoutManager._restoring', 15000);
  await sleep(1200);
};
/** A harmless tap (the person touched the page once — Chrome's activation): the empty window area. */
const touchOnce = async () => {
  const at = await evalJs(`(() => { const el = document.elementFromPoint(195, 640); return el ? (el.id || el.className || el.tagName) : null; })()`);
  await tapAt(195, 640);
  return at;
};
const state = () => evalJs('JSON.stringify(history.state)');

try {
  // a Task Group for the sidebar's drill-down (its card → the detail with the ‹ All Task Groups row)
  await fetch(`${ORIGIN}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Back guard group' }) });

  // ── A: the phone ──
  console.log('A  phone 390×844: one back = one layer closed');
  await phone(); await boot();
  const env = await evalJs(`({ mobile: app.isMobile, touch: app.isTouch, state: history.state, osb: getComputedStyle(document.documentElement).overscrollBehaviorY, osbx: getComputedStyle(document.body).overscrollBehaviorX })`);
  const n0 = await nav();
  check('A0 app.isMobile + isTouch; ONE sentinel ({vs:1}) above the page\'s entry; html/body overscroll-behavior none on a coarse pointer', env.mobile && env.touch && env.state?.vs === 1 && env.osb === 'none' && env.osbx === 'none', { env, n0 });
  const tapped = await touchOnce();
  await tap('#mobile-nav-title'); await sleep(300);
  const swOpen = await evalJs(`!!document.querySelector('.mobile-win-switcher')`);
  await browserBack();
  let n = await nav();
  check('A1 the window switcher open → the browser\'s back closes it; same URL, same history length, back on the sentinel', swOpen && !(await evalJs(`!!document.querySelector('.mobile-win-switcher')`)) && onApp(n) && n.len === n0.len && (await state()) === '{"vs":1}', { swOpen, n, n0, tapped });
  await longPress('#mobile-nav-new'); // the "+" long-press create sheet (a [data-popover] context menu)
  const sheetOpen = await evalJs(`!!document.querySelector('.mobile-sheet[data-popover]')`);
  const before = await evalJs('({ href: location.href, len: history.length })');
  await jsBack();
  const after = await evalJs('({ href: location.href, len: history.length, pop: !!document.querySelector("[data-popover]"), st: history.state })');
  check('A2 the "+" sheet open → history.back() closes it; location.href and history.length unchanged', sheetOpen && !after.pop && after.href === before.href && after.len === before.len && after.st?.vs === 1, { sheetOpen, before, after });
  await evalJs('app.showNewSessionDialog(); true'); await sleep(300);
  const dlgOpen = await evalJs(`!document.getElementById('dialog-overlay').classList.contains('hidden')`);
  await browserBack();
  n = await nav();
  check('A3 the New Session dialog → one back hides it (app.hideDialogs), still on VibeSpace', dlgOpen && (await evalJs(`document.getElementById('dialog-overlay').classList.contains('hidden')`)) && onApp(n) && n.len === n0.len, { dlgOpen, n });
  await tap('#mobile-nav-todos'); await sleep(400);
  const fyOpen = await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
  await browserBack();
  n = await nav();
  check('A4 the For-you tray → one back closes it (through its own hidePopup), still on VibeSpace', fyOpen && (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) && onApp(n) && n.len === n0.len, { fyOpen, n });
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const win = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  await browserBack();
  const win2 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  n = await nav();
  check('A5 a window on show → one back yields it to the sidebar (home); the window is NOT closed', win.n >= 1 && !win.sb && win2.sb && win2.n === win.n && onApp(n) && n.len === n0.len, { win, win2, n });
  await tap('.sidebar-tab[data-tab="tasks"]'); await sleep(500);
  await waitFor(`[...document.querySelectorAll('#sidebar .mobile-folder-card')].some((c) => c.textContent.includes('Back guard group'))`, 8000);
  await evalJs(`[...document.querySelectorAll('#sidebar .mobile-folder-card')].find((c) => c.textContent.includes('Back guard group')).click(); true`); await sleep(400);
  const dd = await evalJs(`({ back: !!document.querySelector('#sidebar .mobile-folder-back'), dd: !!app.sidebar._mobileDrilldown })`);
  await browserBack();
  const dd2 = await evalJs(`({ back: !!document.querySelector('#sidebar .mobile-folder-back'), dd: !!app.sidebar._mobileDrilldown, sb: app.sidebar.isOpen })`);
  check('A6 the Task Groups drill-down → one back returns to the list (its ‹ row), the sidebar stays open', dd.back && dd.dd && !dd2.back && !dd2.dd && dd2.sb, { dd, dd2 });
  await browserBack(300);
  const t1 = await toasts(); const st1 = await state(); n = await nav();
  const hist = await evalJs(`(JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]')[0]) || null`);
  check('A7 at home → the toast "Press back again to exit"; VibeSpace stays (on its own entry for the window)', t1.includes('Press back again to exit') && onApp(n) && st1 === 'null', { t1, st1, n });
  check('A7b the toast is the person\'s own act — recorded seen, never an unread notification', hist?.m === 'Press back again to exit' && hist?.seen === true, hist);
  await sleep(2400);
  const st2 = await state(); n = await nav();
  check('A8 after 2 s the page stands on the sentinel again (no new entry)', st2 === '{"vs":1}' && n.len === n0.len && onApp(n), { st2, n, n0 });
  await browserBack(300);
  const t2 = await toasts();
  await browserBack(900);
  n = await nav();
  check('A9 the next back re-arms (the toast again); a second back 0.3 s later leaves to the previous page', t2.includes('Press back again to exit') && n.url.startsWith('data:'), { t2, n });

  // ── B: an untouched page; a reload on the sentinel ──
  console.log('B  an untouched page; a reload standing on the sentinel');
  await boot();
  const bs = await state(), nb0 = await nav();
  await browserBack(900);
  n = await nav();
  const stood = onApp(n) && n.len === nb0.len && (await state()) === '{"vs":1}' && !(await toasts()).length;
  // Chrome MAY skip an entry a page pushed before any tap (its back-button intervention — measured both ways on cold
  // pages; the app's boot push was kept 4 of 4) — either way the person is never stranded:
  console.log(`  · untouched page, one browser back: ${n.url.startsWith('data:') ? 'left to the previous page (Chrome skipped the entry)' : 'stayed — one layer closed, back on the sentinel'}`);
  check('B1 never touched: one browser back either leaves (Chrome\'s skip) or closes one layer and stands on the sentinel — never stranded', bs === '{"vs":1}' && (n.url.startsWith('data:') || stood), { bs, n });
  await boot(); await touchOnce();
  const nb = await nav();
  await cdp('Page.reload'); await waitFor('!!(window.app && app.ready)', 20000); await evalJs('app.ready.then(() => true)'); await sleep(1500);
  const nr = await nav(); const sr = await state();
  check('B2 a reload ON the sentinel keeps ONE sentinel (no second entry)', sr === '{"vs":1}' && nr.len === nb.len && nr.index === nb.index, { nb, nr, sr });
  await longPress('#mobile-nav-new');
  const pop2 = await evalJs(`!!document.querySelector('[data-popover]')`);
  await browserBack();
  n = await nav();
  check('B3 after the reload a back still closes the open sheet and stays (the entry below stayed same-document)', pop2 && !(await evalJs(`!!document.querySelector('[data-popover]')`)) && onApp(n) && n.len === nb.len, { pop2, n });
  await longPress('#mobile-nav-new');
  await evalJs("location.hash = 'install'; true"); await sleep(400); // a same-document #fragment navigation (a link in rendered markdown)
  const f1 = await evalJs(`({ pop: !!document.querySelector('[data-popover]'), st: history.state, hash: location.hash, sb: app.sidebar.isOpen })`);
  await browserBack();
  const f2 = await evalJs(`({ pop: !!document.querySelector('[data-popover]'), st: history.state, hash: location.hash })`); n = await nav();
  check('B4 a #fragment navigation is no back: the sheet stays open, a sentinel stands above it; the next back closes the sheet and stays', f1.pop && f1.st?.vs === 1 && f1.hash === '#install' && !f2.pop && f2.st?.vs === 1 && onApp(n), { f1, f2, n });

  // ── C: a `?` deep link, in zh ──
  console.log('C  a deep link (?…) in zh');
  const zh = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await boot('?session=back-guard'); await touchOnce();
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const c0 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  await browserBack(300);
  const c1 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })'); const tz = await toasts();
  check('C1 the first back after a `?` link closes no window: it arms — 再返回一次退出', c0.n >= 1 && !c0.sb && !c1.sb && c1.n === c0.n && tz.includes('再返回一次退出'), { c0, c1, tz });
  await sleep(2400); await browserBack();
  const c2 = await evalJs('({ n: app.wm.windows.size, sb: app.sidebar.isOpen })');
  check('C2 then the same rule: the next back (after the window) yields the window to the sidebar', c2.sb && c2.n === c0.n, c2);
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: zh.identifier });
  await evalJs("localStorage.removeItem('vibespace.lang'); true");

  // ── F: the attention page is HOME (lane phone-first-screen, design q-044 decision 5) — before D: D's setting write must not race F's restart ──
  console.log('F  asks open: the attention page is home');
  await restartWith([1, 2, 3].map((k) => ({ id: 'ut-fback' + k, sessionKey: 'claude:back-guard-' + k, sessionName: 'back guard', text: 'Which bucket should the nightly export use? (' + k + ')', detail: null, urgency: 'normal', kind: 'action', origin: 'agent', status: 'open', by: 'agent', createdAt: Date.now() - k * 60e3, resolvedAt: null, resolvedBy: null, jobId: null })));
  await boot(); const F_at = await touchOnce(); // (195, 640): the page's empty area below its three rows
  const F_act = await evalJs('({ active: navigator.userActivation?.hasBeenActive, state: history.state, len: history.length })');
  const F_pageOn = () => evalJs(`!document.getElementById('phone-home').classList.contains('hidden')`);
  const F_exitToasts = async () => (await toasts()).filter((x) => x.includes('Press back again to exit')).length;
  const F_f0 = await evalJs(`({ page: !document.getElementById('phone-home').classList.contains('hidden'), rows: document.querySelectorAll('#phone-home .ut-item').length, sb: app.sidebar.isOpen, state: history.state })`);
  check('F0 asks open: the boot lands on the attention page (home) — 3 rows, the sidebar shut, ONE sentinel above the page\'s entry', F_f0.page && F_f0.rows === 3 && !F_f0.sb && F_f0.state?.vs === 1, { ...F_f0, F_at, F_act });
  await browserBack(300);
  const F_fa = await toasts(); let F_fn = await nav();
  check('F1 at home on the page: one back arms the exit toast; the page stays, VibeSpace stays', F_fa.includes('Press back again to exit') && (await F_pageOn()) && onApp(F_fn), { F_fa, F_fn });
  await sleep(2400);
  await tap('#mobile-nav-menu'); await sleep(300);
  const F_sbOpen = await evalJs('app.sidebar.isOpen'); const F_tb = await F_exitToasts();
  await browserBack();
  const F_f2 = await evalJs(`({ sb: app.sidebar.isOpen, page: !document.getElementById('phone-home').classList.contains('hidden') })`); F_fn = await nav();
  check('F2 ☰ over the page, then one back: the sidebar closes — back on the page, no exit toast', F_sbOpen && !F_f2.sb && F_f2.page && (await F_exitToasts()) === F_tb && onApp(F_fn), { F_sbOpen, F_f2, F_tb, F_fn });
  await evalJs('app.openFileExplorer(); true'); await sleep(900);
  const F_f3a = await evalJs(`({ n: app.wm.windows.size, page: !document.getElementById('phone-home').classList.contains('hidden'), sb: app.sidebar.isOpen })`);
  await browserBack();
  const F_f3b = await evalJs(`({ n: app.wm.windows.size, page: !document.getElementById('phone-home').classList.contains('hidden'), sb: app.sidebar.isOpen })`); F_fn = await nav();
  check('F3 a window opened over the page hides it (the central yield); one back returns to the PAGE — the window kept, the sidebar shut', F_f3a.n >= 1 && !F_f3a.page && F_f3b.page && !F_f3b.sb && F_f3b.n === F_f3a.n && onApp(F_fn), { F_f3a, F_f3b, F_fn });
  await tap('#mobile-nav-todos'); await sleep(400);
  const F_fy = await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
  await browserBack();
  check('F4 the For-you sheet over the page: one back closes the sheet, the page stays', F_fy && (await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`)) && (await F_pageOn()) && onApp(await nav()), { F_fy });

  // ── D: the Mobile setting off ──
  console.log('D  the Mobile setting off');
  await boot(); await touchOnce();
  await evalJs("app.settings.set('mobile.backGuard', false); true"); await sleep(300);
  await longPress('#mobile-nav-new');
  await browserBack(1000);
  n = await nav();
  check('D1 setting off: one browser back leaves VibeSpace at once (a sheet open or not)', n.url.startsWith('data:'), n);
  await boot(); await evalJs("app.settings.set('mobile.backGuard', undefined); true"); await sleep(300);

  // ── E: a desktop ──
  console.log('E  a 1280×800 desktop');
  await desk(); await boot();
  const e0 = await evalJs(`({ mobile: app.isMobile, state: history.state, osb: getComputedStyle(document.documentElement).overscrollBehaviorY })`);
  const ne = await nav();
  await browserBack(900);
  const ne2 = await nav();
  check('E1 a desktop pushes no sentinel, keeps overscroll-behavior auto, and one back leaves', e0.mobile === false && e0.state === null && e0.osb === 'auto' && ne2.url.startsWith('data:') && ne2.index === ne.index - 1, { e0, ne, ne2 });
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (err) {
  fail++; console.log('  ✗ the suite threw: ' + (err?.stack || err));
}
console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
// Chrome first, and wait for it: a profile dir removed while its processes still write comes back
try { sock.close(); } catch { }
if (chrome.exitCode === null) { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await Promise.race([gone, sleep(3000)]); }
try { endRootedProcesses(chromeDir); } catch { }
await sleep(300);
process.exit(fail ? 1 : 0);
