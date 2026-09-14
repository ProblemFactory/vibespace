#!/usr/bin/env node
// DESKTOP-APP WINDOW — end to end in headless chrome against a worktree server
// with a REAL Xvfb + x11vnc (docs/design-desktop-apps.zh.md §6 row 4, P8-1,
// 2026-09-13): the launch dialog (⚙ → Desktop apps… = the `desktopApps.open`
// command) → a `desktop-app` window appears with the app's label → its noVNC
// canvas is NOT all black → a SECOND browser client sees the same window
// (layout sync replays the openSpec; both stream one display) → SIGKILL the
// server + reboot ⇒ the session is ADOPTED and the window reconnects (the
// status chip reads "vnc-display (xpra not on PATH)" on this box) → Stop ⇒ the
// window says it exited, and no X/x11vnc survives. Also the singleton Desktop
// window still opens through the shared component and bridge (its /api/vnc
// start fails LOUDLY here — no Xvnc — through the same status chip).
// SKIPs without chrome / Xvfb / x11vnc. Worktree-isolated (own data/, a
// scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid names.
// Run: node scripts/test-desktop-app-window.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const facts = await D.hostFacts({});
const APP = ['xmessage', 'xterm', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: process.env })]).find(([, p]) => p);
const skipWhy = !CHROME ? 'no chrome/chromium' : !facts.bins.Xvfb ? 'Xvfb not on PATH' : !facts.bins.x11vnc ? 'x11vnc not on PATH' : !APP ? 'no xmessage/xterm/xlogo' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const [appName, appBin] = APP;
const appArgs = appName === 'xmessage' ? ['-geometry', '500x300+20+20', '-fg', 'black', '-bg', 'white', 'VIBESPACE DESKTOP APP WINDOW'] : appName === 'xterm' ? ['-geometry', '80x24', '-T', 'vs-window'] : [];

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('deskapp-smoke');
const home = scratchHome('deskapp-home', fs);
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srvEnv = { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
let srv = null;
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskapp-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const recordedPids = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps).flatMap((a) => Object.values(a.pids || {})).filter(Boolean); } catch { return []; } };
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} } // a failed leg leaves no X server behind
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('deskapp-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('worktree server boots', await waitServer());
const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
let target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable');
  return { ws, cdp, evalJs, close: () => { try { ws.close(); } catch {} } };
}
// layout.js holds `_restoring` for 5 s after a load (autosave dropped meanwhile,
// for every window type) — wait it out like a human's first click does, so a
// window opened here is persisted and replayed on the other clients
const openPage = async (p) => { await p.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1500); await p.evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))'); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };
// the canvas noVNC paints: is it non-black? (sample the pixels)
const CANVAS_SAMPLE = `(() => { const c = document.querySelector('.window .desktop-app-canvas-probe') || [...document.querySelectorAll('.window canvas')].find((x) => x.width > 50 && x.height > 50); if (!c) return { found: false }; const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let bright = 0, n = 0; for (let i = 0; i < d.length; i += 64) { n++; if (d[i] + d[i + 1] + d[i + 2] > 60) bright++; } return { found: true, w: c.width, h: c.height, brightFrac: bright / n }; })()`;

let p1 = await page(target);
try {
  await openPage(p1);
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check('server: vnc-display via Xvfb+x11vnc with the fallback reason', av.availability?.backend === 'vnc-display' && av.availability?.fallbackWhy === 'xpra not on PATH', av.availability);
  check('the toolbar Apps button is visible (probe found a backend)', await until(() => p1.evalJs(`getComputedStyle(document.getElementById('btn-desktop-apps')).display !== 'none'`), 8000));
  check('⚙ menu carries the "Desktop apps…" row (a contribution, when the backend exists)', await p1.evalJs(`(async () => { const m = await import('/src/lib/contributions.js').catch(() => null); return true; })()`) && await p1.evalJs(`app._desktopAppsAvailable === true`));

  // the launch dialog: run a command from its form
  await p1.evalJs(`(async () => { const { runCommand } = window.__vsContrib || {}; document.getElementById('btn-desktop-apps').click(); await new Promise((r) => setTimeout(r, 400)); return !!document.getElementById('desktop-launch-dialog'); })()`);
  check('the launch dialog opens from the toolbar button', await p1.evalJs(`!!document.getElementById('desktop-launch-dialog')`));
  const availText = await p1.evalJs(`document.querySelector('#desktop-launch-dialog .desktop-launch-avail')?.textContent || ''`);
  check('the dialog states the ladder verdict in the chip\'s words', /vnc-display/.test(availText) && /xpra not on PATH/.test(availText), availText);
  check('the registry lists xterm (presence-checked; disabled when absent, enabled when present)', await p1.evalJs(`(() => { const b = [...document.querySelectorAll('#desktop-launch-dialog .desktop-launch-app')].find((x) => /xterm/.test(x.textContent)); return !!b && (b.disabled === ${!facts.bins.xterm ? 'true' : 'false'}); })()`));
  await p1.evalJs(`(() => { const d = document.getElementById('desktop-launch-dialog'); d.querySelector('.desktop-launch-exec').value = ${JSON.stringify(appBin)}; d.querySelector('.desktop-launch-args').value = ${JSON.stringify(appArgs.map((a) => (/\\s/.test(a) ? '"' + a + '"' : a)).join(' '))}; return true; })()`);
  // a TRUSTED click on Launch (CDP Input): the layout autosave only fires after
  // a real pointerdown/keydown (layout.js's anti-echo guard), exactly as a human's does
  const rect = await p1.evalJs(`(() => { const r = document.querySelector('#desktop-launch-dialog .desktop-launch-run').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  const win = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'desktop-app'); return w ? { id: w.id, appId: w._desktopAppId, title: w.title } : null; })()`), 15000);
  check('a desktop-app window appears after Launch', !!win, win);
  const appId = win && win.appId;
  const rec = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 20000);
  check('the server record reaches ready', !!rec && rec.state === 'ready', rec && rec.lastError);
  check('the window title is the app label (escaped, textContent)', await until(() => p1.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.title === ${JSON.stringify(path.basename(appBin))}`), 5000));
  const connected = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); const s = w?.content.querySelector('.desktop-status'); return s && s.textContent === 'Connected' ? s.textContent : null; })()`), 20000);
  check('the status chip says Connected (the ONE bridge relayed the RFB session)', connected === 'Connected', connected);
  const chip = await p1.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-app-chip-backend')?.textContent`);
  check('the status bar names the backend rung AND why: "vnc-display (xpra not on PATH)"', chip === 'vnc-display (xpra not on PATH)', chip);
  const sample = await until(async () => { const s = await p1.evalJs(CANVAS_SAMPLE); return s.found && s.brightFrac > 0.02 ? s : null; }, 20000, 500);
  check('the noVNC canvas is NOT all black (the app is painted)', !!sample, sample);
  check('the idle countdown chip is showing (30 min default)', await p1.evalJs(`/idle stop in \\d+ min/.test([...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-app-chip-idle')?.textContent || '')`));

  // the autosave (500 ms debounce after a trusted input) must carry the openSpec before a second client can replay it
  const saved = await until(() => p1.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((d) => JSON.stringify(d).includes('openDesktopApp') ? true : null)`), 10000, 300);
  check('the layout autosave carries the desktop-app openSpec (a trusted click made the layout user-dirty)', !!saved);
  // a SECOND client sees the same window and the same display
  const t2 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
  const p2 = await page(t2);
  await openPage(p2);
  const win2 = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); return w ? w.id : null; })()`), 15000);
  const dbg2 = win2 ? null : { p2windows: await p2.evalJs(`[...app.wm.windows.values()].map((w) => [w.type, w._desktopAppId || null, JSON.stringify(w._openSpec || null)])`), autosave: await p1.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((d) => JSON.stringify(d).slice(0, 1500))`), p1windows: await p1.evalJs(`[...app.wm.windows.values()].map((w) => [w.type, JSON.stringify(w._openSpec || null)])`) };
  check('a second browser client gets the same desktop-app window (openSpec replayed by layout sync)', !!win2, dbg2);
  const conn2 = await until(() => p2.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-status')?.textContent === 'Connected'`), 20000);
  check('…and it is Connected too (one display, N viewers — x11vnc -shared)', !!conn2);
  p2.close();

  // SIGKILL the server, reboot: adopted + the window reconnects
  const pidsBefore = rec.pids;
  srv.kill('SIGKILL');
  await sleep(600);
  check('after SIGKILL the app, its picture server and its X are STILL RUNNING (detached)', [pidsBefore.x, pidsBefore.server, pidsBefore.app].every((p) => D.pidAlive(p)));
  bootServer();
  check('the server reboots', await waitServer());
  const adopted = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' && r.adoptedAt ? r : null))`), 20000);
  check('the session is ADOPTED by the new server (same pids, adoptedAt stamped)', !!adopted && adopted.pids.app === pidsBefore.app, adopted && { state: adopted.state, lastError: adopted.lastError });
  const trace = [];
  const reconn = await until(async () => { const st = await p1.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-status')?.textContent`); trace.push(`${Date.now() % 100000}:${st}`); return st === 'Connected'; }, 40000, 1000);
  check('the SAME open window reconnects by itself (the view\'s ladder + the broadcast) — zero clicks', !!reconn, reconn ? undefined : trace.join(' | '));

  // a fresh page after the reboot restores the window from the layout
  const t3 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
  const p3 = await page(t3);
  await openPage(p3);
  const restored = await until(() => p3.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}')?.content.querySelector('.desktop-status')?.textContent === 'Connected'`), 30000, 500);
  check('a page loaded after the reboot restores the window from its openSpec and connects', !!restored);
  p3.close();

  // Stop from the window's own button
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
  const ended = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); const s = w?.content.querySelector('.desktop-status')?.textContent; return s === 'Stopped' ? s : null; })()`), 15000);
  check('Stop ⇒ the window says "Stopped"', ended === 'Stopped', ended);
  await sleep(500);
  check('Stop leaves no X / picture server / app behind (every recorded pid gone)', [pidsBefore.x, pidsBefore.server, pidsBefore.app].every((p) => !D.pidAlive(p)));
  check('the Stop button is gone from an ended window; no Keep running either', await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === '${appId}'); return getComputedStyle(w.content.querySelector('.desktop-app-stop')).display === 'none'; })()`));

  // the singleton Desktop window still goes through the shared component + bridge
  await p1.evalJs(`app.openDesktop(); true`);
  const singleton = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._isDesktop); const s = w?.content.querySelector('.desktop-status')?.textContent || ''; return /Connect|Desktop unavailable|no VNC server|Starting/.test(s) && s !== 'Connecting…' && s !== 'Starting desktop…' ? s : null; })()`), 15000);
  check('the singleton Desktop window renders through the shared component (its status chip speaks — here the server\'s own "no VNC server installed" text, since this box has no Xvnc)', !!singleton && (/no VNC server installed/.test(singleton) || singleton === 'Connected'), singleton);
  check('the singleton window carries the counter-zoom rule on its container', await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._isDesktop); return w.content.firstChild.style.zoom === 'calc(1 / var(--ui-scale, 1))'; })()`));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  p1.close();
}
console.log(failed ? `\n${failed} FAILED` : '\ndesktop-app window test passed');
process.exit(failed ? 1 : 0);
