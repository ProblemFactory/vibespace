#!/usr/bin/env node
// lane window-reveal-desktop — HEAVY (server + chrome, zero vendor calls): userW inc-muv3qfo7-96tm ("点击 Outbox 没有任何
// 反应"). A real worktree server; a 1400×1000 page: the Outbox opened on desktop 1, a desktop 2 created and switched to,
// the Channels panel's 发件箱 button PRESSED ⇒ desktop 1 is shown and the Outbox is the active, visible window (a rect on
// screen, not display:none / visibility:hidden); the same for the For-you window and the Channels window (their openers);
// CONTROL: the door without a DesktopManager (the switch removed) leaves the user on desktop 2 with the window hidden.
// A second client stays on its own desktop (the active desktop is per client — no broadcast switch). A 390 px phone: the
// same press switches the desktop and shows the Outbox.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('win-reveal-desk');
const fakeHome = scratchHome('win-reveal-desk-home', fs);
const chromeDir = scratch('win-reveal-desk-chrome');
const chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'wrd-xdg-'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) { fs.rmSync(path.join(wt, f), { recursive: true, force: true }); fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true }); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'],
  { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: chromeDir, XDG_RUNTIME_DIR: chromeRun, DISPLAY: ':' + (90 + (PORT % 7)) } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(wt); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, chromeRun]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
let up = false; for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
ok(up, 'the worktree server booted');
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function newPage(w, h, mobile) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const ev = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 900));
    return r.result?.result?.value;
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  let ready = false;
  for (let i = 0; i < 160 && !ready; i++) { try { ready = await ev("!!(window.app && app.wm && app.desktopManager && app.openChannelOutbox) && !document.getElementById('loading-screen')"); } catch {} if (!ready) await sleep(250); }
  return { cdp, ev, ready };
}
// in-page helpers: the shown-ness of a window (rect on screen, displayed, visible) + a wait
const HELP = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const dm = app.desktopManager, wm = app.wm;
  const byType = (ty) => [...wm.windows.values()].find((w) => w.type === ty);
  const shown = (w) => { if (!w) return null; const e = w.element, r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { desk: w._desktopId, active: dm.activeDesktopId, isActive: wm.activeWindowId === w.id, display: cs.display, vis: cs.visibility, onScreen: r.width > 50 && r.height > 50 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight }; };
  const railBtn = () => [...document.querySelectorAll('.chan-outbox-btn')].find((b) => b.getBoundingClientRect().width > 0 && !b.closest('.window'));
  // the phone has no rail panel beside the desktop: the button's own handler (() => app.openChannelOutbox()) is called
  const press = async () => { if (!railBtn() && innerWidth > 768) { document.querySelector('[data-rail="channels"], [data-tab="channels"]')?.click(); await until(railBtn); } const b = railBtn(); if (b) b.click(); else app.openChannelOutbox(); };
  const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(60); } return false; };`;
const OPENERS = { 'channel-outbox': 'PRESS', inbox: 'app.openInbox()', channels: 'app.openChannels({ forceWindow: true })' };
// the leg: open on desktop 1, go to a NEW desktop 2, name the window again; neuter = the door without a DesktopManager
const leg = (type, { neuter = false } = {}) => `(async () => { ${HELP}
  const d1 = dm.desktops[0].id; if (dm.activeDesktopId !== d1) await dm.switchTo(d1);
  const open = async () => { if (${J(OPENERS[type])} === 'PRESS') await press(); else { ${OPENERS[type]}; } };
  if (!byType(${J(type)})) { await open(); await until(() => byType(${J(type)})); }
  const w = byType(${J(type)}); if (!w) return { err: 'not opened' };
  const before = shown(w);
  const d2 = dm.desktops[1] ? dm.desktops[1].id : dm.createDesktop(); await dm.switchTo(d2); await sleep(300);
  const away = shown(w);
  // the PRESS happens on desktop 2 in the sidebar rail's Channels panel (the user's own button — it lives on no desktop)
  if (${J(OPENERS[type])} === 'PRESS' && !railBtn() && innerWidth > 768) { document.querySelector('[data-rail="channels"], [data-tab="channels"]')?.click(); await until(railBtn); }
  if (dm.activeDesktopId !== d2) return { err: 'left desktop 2 before the press', active: dm.activeDesktopId };
  const saved = wm._app; if (${neuter}) wm._app = Object.create(saved, { desktopManager: { value: null } });
  try { if (${J(OPENERS[type])} === 'PRESS') await press(); else { ${OPENERS[type]}; }
    await until(() => dm.activeDesktopId === d1 && shown(w).isActive && shown(w).onScreen); await sleep(250); }
  finally { wm._app = saved; }
  const after = shown(w); if (${neuter}) await dm.switchTo(d1);
  return { d1, d2, before, away, after };
})()`;
const good = (r) => r && r.after && r.after.active === r.d1 && r.after.desk === r.d1 && r.after.isActive && r.after.onScreen && r.after.display !== 'none' && r.after.vis === 'visible';

const p1 = await newPage(1400, 1000, false);
ok(p1.ready, 'client 1 (1400×1000) loaded');
const p2 = await newPage(1400, 1000, false);
ok(p2.ready, 'client 2 (a second desktop page) loaded');
for (const type of ['channel-outbox', 'inbox', 'channels']) {
  const r = await p1.ev(leg(type));
  const p2Before = await p2.ev('app.desktopManager.activeDesktopId');
  ok(r && r.away && r.away.active === r.d2 && !(r.away.onScreen && r.away.vis === 'visible') && good(r),
    `${type}: open on desktop 1, go to desktop 2, ${type === 'channel-outbox' ? 'PRESS 发件箱' : 'name it again'} ⇒ desktop 1 shown, the window active + visible on screen`, J(r));
  await sleep(600);
  ok((await p2.ev('app.desktopManager.activeDesktopId')) === p2Before, `${type}: client 2 stays on its own desktop (no broadcast switch)`);
}
{
  const c = await p1.ev(leg('channel-outbox', { neuter: true }));
  ok(c && c.after && c.after.active === c.d2 && !good(c), 'CONTROL: the door without the desktop switch leaves the user on desktop 2 with the Outbox hidden (the incident)', J(c));
}
const ph = await newPage(390, 844, true);
ok(ph.ready, 'the 390 px phone loaded');
{
  const r = await ph.ev(leg('channel-outbox'));
  ok(r && r.away && r.away.active === r.d2 && good(r), 'phone 390 px: the Outbox on desktop 1, the phone on desktop 2, the 发件箱 handler ⇒ desktop 1 shown, the Outbox the shown window', J(r));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
