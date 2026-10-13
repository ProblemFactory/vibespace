#!/usr/bin/env node
// AN APP'S NOTIFICATION REACHES THE PERSON INSIDE ITS WINDOW — end to end (lane app-display-notify-sink, 2026-10-12,
// B-4a59 piece 2). A worktree server (its own HOME + runtime dir, NO session bus of the owner's) with
// `desktop.appPortal = all` launches a FAKE app (scripts/fixtures/notify-app.py: an xmessage window + Notify calls on ITS
// session bus) on the vnc-display rung; the private bus ACTIVATES the sink (src/notify-sink.py), the machine reads its
// journal, the hub broadcasts, the app window draws the toast. Legs:
//   A  a normal notification while the window is in front ⇒ a toast INSIDE that window with the app's name + words, no
//      For-you item; the PNG (VS_NOTIFY_PNG, default the suite's scratch) is this leg's.
//   B  the window minimized + TWO critical notifications ⇒ ONE For-you item "JASP: <summary>" with the Show window action.
//   C  the person raises the window and presses it ⇒ the item resolves (POST …/notifications/seen from the window).
//   D  the ring: GET …/notifications answers the three, newest last; the window's ⋯ offers Notifications.
// SKIPs by name without chrome / Xvfb / x11vnc / xmessage / python3-gi.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const VNC_ENV = await vncEnv();
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const facts = await D.hostFacts({});
const sink = await D.notifySinkFacts({ env: process.env });
const skipWhy = !CHROME ? 'no chrome/chromium' : !facts.bins.Xvfb ? 'Xvfb not on PATH' : !facts.bins.x11vnc ? 'x11vnc not on PATH' : !D.binOnPath('xmessage', { env: process.env }) ? 'no xmessage' : !sink.python ? `no sink: ${sink.why}` : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('deskapp-notify');
const home = scratchHome('deskapp-notify-home', fs);
const RT = path.join(home, 'xrt'); fs.mkdirSync(RT, { recursive: true, mode: 0o700 });
const TRIG = path.join(home, 'trig'); fs.mkdirSync(TRIG, { recursive: true });
const PNG = process.env.VS_NOTIFY_PNG || path.join(home, 'toast.png');
let pass = 0, failed = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'scripts', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.copyFileSync(path.join(repo, 'docs/settings.md'), path.join(wt, 'docs/settings.md')); // the build's census reads the generated settings table beside the schema
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data', 'settings.json'), JSON.stringify({ 'desktop.backendPrefs': 'vnc-display, xpra, desktop-singleton', 'desktop.appPortal': 'all', 'desktop.appNotifications': 'on' }));
try { execSync('npm run build', { cwd: wt, stdio: 'pipe' }); } catch (e) { console.error(`npm run build failed in the scratch tree:\n${String((e.stdout || '') + (e.stderr || '')).split('\n').filter((l) => /✗|FAILED|Error:/.test(l)).slice(0, 12).join('\n')}`); try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} process.exit(1); }

const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, XDG_RUNTIME_DIR: RT, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
delete srvEnv.DBUS_SESSION_BUS_ADDRESS; // never the owner's session bus (the app's own bus is the plan's)
delete srvEnv.AT_SPI_BUS_ADDRESS;
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1200,800', `--user-data-dir=${scratch('deskapp-notify-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const recordedPids = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps).flatMap((a) => Object.values(a.pids || {})).filter(Boolean); } catch { return []; } };
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
  for (const root of [wt, home]) { try { endRootedProcesses(root); } catch {} } // the private bus's activated services (the sink, the portal) by evidence
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('deskapp-notify-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const up = await until(async () => { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; }, 20000, 250);
check('worktree server boots', !!up);
const WebSocket = require('ws');
const target = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'), 20000, 250);
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await until(() => evalJs('!!(window.app && window.app.wm && window.app.ws)'), 20000, 200);
await sleep(5500); // layout.js's 5 s restore window (a window opened inside it is dropped by the autosave)
const api = (p, opts) => evalJs(`fetch(${JSON.stringify(p)}, ${JSON.stringify(opts || {})}).then((r) => r.json())`);
const launched = await api('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exec: sink.python, args: [path.join(repo, 'scripts/fixtures/notify-app.py'), TRIG], label: 'JASP' }) });
const id = launched && launched.id;
check('the fake app launches (POST /api/desktop/apps, the vnc-display rung, desktop.appPortal = all)', !!id, launched);
await evalJs(`(window.app.openDesktopApp(${JSON.stringify(id)}), true)`);
const rec = await until(async () => { const r = await api(`/api/desktop/apps/${id}`); return r && r.state === 'ready' && r.notify ? r : null; }, 30000, 300);
check('the record is ready with portal on + notify on (the sink is part of its private bus)', rec && rec.portal === 'on' && rec.notify === 'on', rec && { state: rec.state, portal: rec.portal, notify: rec.notify });
const winSel = `[...window.app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)} && !w._desktopSatelliteWid)`;
await until(() => evalJs(`(() => { const w = ${winSel}; return !!(w && w.element.querySelector('canvas')); })()`), 20000, 250);
await until(async () => { const v = await api(`/api/desktop/apps/${id}/viewers`); return v && (v.active || (v.viewers || []).length); }, 15000, 250);
const send = (n, note) => fs.writeFileSync(path.join(TRIG, `${n}.json`), JSON.stringify(note));
const forYou = async () => { const t = (await api('/api/user-todos')).todos || {}; return [...(t.open || []), ...(t.resolved || [])]; }; // snapshot(): { open, resolved }
const forYouOf = async () => (await forYou()).filter((t) => t.action && t.action.type === 'desktop-app-notify' && t.action.appId === id);

console.log('A  a notification while the window is in front ⇒ a toast INSIDE that window');
send(1, { summary: 'Export finished', body: 'results.omv saved to Documents', urgency: 1 });
const toast = await until(() => evalJs(`(() => { const w = ${winSel}; const el = w && w.element.querySelector('.desktop-app-note'); if (!el) return null; const r = el.getBoundingClientRect(), wr = w.element.getBoundingClientRect();
  return { app: el.querySelector('.desktop-app-note-app')?.textContent, sum: el.querySelector('.desktop-app-note-summary')?.textContent, body: el.querySelector('.desktop-app-note-body')?.textContent, svg: !!el.querySelector('svg path'),
    inside: r.left >= wr.left && r.right <= wr.right && r.top >= wr.top && r.bottom <= wr.bottom && r.width > 80, global: !!document.querySelector('#global-toasts .desktop-app-note') }; })()`), 15000, 100);
check('the toast is inside the app\'s window: the app\'s name, the summary, the body, the bell (SVG)', toast && toast.inside && toast.app === 'JASP' && toast.sum === 'Export finished' && toast.body === 'results.omv saved to Documents' && toast.svg && !toast.global, toast);
if (toast) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(PNG, Buffer.from(r.data, 'base64')); console.log(`    PNG ${PNG}`); }
check('a normal notification on a window in front files NO For-you item', (await forYouOf()).length === 0);
const gone = await until(() => evalJs(`(() => { const w = ${winSel}; return w && !w.element.querySelector('.desktop-app-note'); })()`), 9000, 200);
check('the toast leaves by itself (6 s)', !!gone);

console.log('B  the window minimized + two critical notifications ⇒ ONE For-you item');
await evalJs(`(() => { const w = ${winSel}; window.app.wm.minimize(w.id); return true; })()`);
send(2, { summary: 'Analysis done', body: 'Bayesian ANOVA: 3 models', urgency: 2 });
const items = await until(async () => { const f = await forYouOf(); return f.length ? f : null; }, 15000, 250);
send(3, { summary: 'Analysis done again', body: '', urgency: 2 });
await until(() => fs.existsSync(path.join(TRIG, '3.json.sent')), 10000, 100);
await sleep(1500);
const open = (await forYouOf()).filter((t) => t.status === 'open');
check('ONE open For-you item "JASP: Analysis done" (the second critical folds into it)', items && open.length === 1 && open[0].text === 'JASP: Analysis done' && open[0].urgency === 'high', open.map((t) => ({ text: t.text, status: t.status, urgency: t.urgency })));

console.log('C  the person raises the window and presses it ⇒ the item resolves');
const bar = await evalJs(`(() => { const w = ${winSel}; window.app.wm.revealWindow(w.id); const tb = w.element.querySelector('.window-titlebar'); const r = (tb || w.element).getBoundingClientRect(); return { x: r.left + Math.min(60, r.width / 3), y: r.top + Math.min(12, r.height / 2) }; })()`);
await sleep(400);
await click(bar.x, bar.y);
const resolved = await until(async () => { const f = await forYouOf(); return f.length && f.every((t) => t.status !== 'open') ? f : null; }, 10000, 250);
check('raised + pressed ⇒ the For-you item is resolved (done)', resolved && resolved[0].status === 'done', resolved && resolved.map((t) => t.status));

console.log('D  the ring and the window\'s ⋯');
const ring = await api(`/api/desktop/apps/${id}/notifications`);
check('GET …/notifications: the three, newest last, with their urgency', ring && ring.notify === 'on' && ring.notes.map((n) => n.summary).join('|') === 'Export finished|Analysis done|Analysis done again' && ring.notes[1].urgency === 'critical', ring);
const more = await evalJs(`(() => { const w = ${winSel}; const b = w.element.querySelector('.desktop-app-more'); if (!b) return null; b.click(); return true; })()`); // the ⋯'s own handler (folded or not)
await sleep(300);
const menu = more && await evalJs(`[...document.querySelectorAll('.context-menu')].map((m) => m.textContent).join(' | ')`);
check('the window\'s ⋯ offers Notifications', /Notifications/.test(menu || ''), menu);

console.log(`\ntest-desktop-app-notify: ${pass} passed, ${failed} failed`);
if (!failed) console.log(`ALL PASS (${pass})`);
process.exit(failed ? 1 : 0);
