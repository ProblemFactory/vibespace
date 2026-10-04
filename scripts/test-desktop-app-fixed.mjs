#!/usr/bin/env node
// A WINDOW WHOSE APP FIXES ITS SIZE IS SHOWN AT THAT SIZE — FRAME = PICTURE, NOT RESIZABLE, NEVER SCALED (lane app-fit-fixed,
// 2026-10-03; the owner on production 2.369.202 at 2×: WeChat's login filled the top-left ~45 % of a blank window,
// Inkscape 1.4.3's welcome was cut at the bottom between two bands — 「对于自己定死尺寸的窗口我们应该遵循他们的尺寸并且禁止缩放」).
// MEASURED by the lane's reproducer (real xpra 6.5.4, headless Chrome 1920×963 at DPR 2, the sidebar at 470): both apps
// state WM_NORMAL_HINTS minimum = maximum (WeChat 560×760, Inkscape 1420×1356 device px); the fit honoured the maximum, so
// WeChat's 280×380 CSS picture sat at 0,0 of an 898×618 pane (81 % blank); Inkscape's welcome is a DIALOG-typed, modal
// window with NO transient-for and the app's only window — never the main, so never fitted or named: X centred it at
// 188,0 and its 678 CSS px height was cut by a 555 px pane. FIX: the client names the app's FIXED window (the main, else a
// lone dialog — placed at 0,0, contained by the display), the view never scales it, and the VibeSpace window ADOPTS its
// size (WindowManager.setFixedSize: min = max, no handles / maximize / snap or grid sizing, never capped at the workspace).
// Heavy: headless Chrome over CDP against a scratch tree's server (git archive + the working tree's src/public/server.js,
// its own data/, a scratch HOME, a private dbus-run-session) on the REAL xpra rung with a REAL GTK 3 window that fixes its
// size (scripts/fixtures/fixed-size-window.py — a 6 px red border round a grid). Per configuration (DPR 2 with the UI in
// zh, DPR 1 in en):
//   • NORMAL 400×300: the pane IS the picture (≤ 0.5 CSS px each side), stage 1, no badge; the four red edges FOUND in a
//     decoded screenshot; not resizable — the handles and the maximize button are not displayed, a double-click on the title
//     bar, the maximize command, a trusted drag at the bottom-right corner, a title-bar drag onto the right snap zone and
//     onto the right cell of a 1×3 grid leave its size (the drags move it);
//   • DIALOG 480×700 (Inkscape's shape: a lone modal dialog TALLER than the default pane): mapped at 0,0 of the pane,
//     frame = picture (the client's placement of a lone dialog X put elsewhere is test-xpra-client §8's — xpra maps this
//     fixture at 0,0 itself, where it centred Inkscape's welcome at 188,0);
//   • RELEASE (WeChat's login → its main window: SIGUSR1 swaps the fixed window for a resizable one): the lock goes, the
//     handles come back, the window returns to its size before the lock and the new main fills the pane;
//   • BIG 1000×900 at DPR 2 (2000×1800 device px — larger than the 878 px workspace): the window keeps the app's size
//     (never capped, never scaled, no badge), its top on the workspace; the CSS px past the bottom edge are printed.
//   • WORK AREA (lane desktop-workarea, the owner's 2.369.203 WeChat: 「下面有条空白」 — root 1660×1296, _NET_WORKAREA
//     0,0,1573,973, the main window's maximum 1574×974): a resizable main that caps itself at the root's _NET_WORKAREA
//     (fixture mode `workarea`), the window sized twice — smaller, then larger than the pane the client said hello with:
//     after each, X's root is the pane and _NET_WORKAREA is that whole root (xprop / xwininfo on the app's display), and
//     the capped app fills the larger pane (no blank strip under it).
// CONTROL = a scratch tree with the levers pulled back (the client's lone-dialog rule, the view's no-scale rule, the window's
// onFixedSize wiring, the display packet's work-area rows), DPR 2: NORMAL leaves most of the pane blank, DIALOG is cut at the
// bottom of a pane that is not it, BIG is scaled with the badge, WORK AREA stays at the hello's pane with a strip under the app.
// SKIPs with evidence without chrome / xpra / xauth / dbus-run-session / python3 + GTK 3 (gi).
// Run: node scripts/test-desktop-app-fixed.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, vncEnv, endRootedProcesses, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const bin = (n) => D.binOnPath(n, { env: process.env });
const XPRA = bin('xpra'), XAUTH = bin('xauth'), DBUS = bin('dbus-run-session'), PY = bin('python3'), XPROP = bin('xprop'), XWININFO = bin('xwininfo');
const FIXTURE = path.join(repo, 'scripts/fixtures/fixed-size-window.py');
const gtkOk = () => { try { execFileSync(PY, ['-c', "import gi; gi.require_version('Gtk', '3.0'); from gi.repository import Gtk"], { stdio: 'ignore', timeout: 20000 }); return true; } catch { return false; } };
const skipWhy = !CHROME ? 'no chrome/chromium' : !XPRA ? 'xpra not on PATH (apt install xpra)' : !XAUTH ? 'xauth not on PATH' : !DBUS ? 'dbus-run-session not on PATH' : !PY ? 'python3 not on PATH' : !XPROP || !XWININFO ? 'xprop / xwininfo not on PATH (apt install x11-utils)' : !gtkOk() ? 'python3 cannot import GTK 3 (apt install python3-gi gir1.2-gtk-3.0)' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const VW = 1920, VH = 963, SIDEBAR = 470;

let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

// ── the scratch trees: ours (the working tree's src/public/server.js over HEAD) and the CONTROL (levers pulled back) ──
const ROOT = scratch('deskapp-fixed');
fs.mkdirSync(ROOT, { recursive: true });
const servers = [], homes = [], trees = [];
const LEVERS = [
  ['src/lib/xpra-client.js', "  const loneFixed = () => { const f = fixedWindow(); return f && f.kind !== 'main' ? f : null; };", '  const loneFixed = () => null; // CONTROL'],
  ['src/lib/xpra-client.js', "    const subject = main || [...windows.values()].filter((w) => w.kind === 'dialog' && !w.meta['transient-for']).sort((a, b) => (b.w * b.h - a.w * a.h) || (a.wid - b.wid))[0] || null;", '    const subject = main; // CONTROL'],
  ['src/lib/xpra-view.js', '      } else if (minSize && !(fixedCss && fixedFollows())) {', '      } else if (minSize) { // CONTROL'],
  ['src/lib/desktop-app-window.js', 'onFixedSize: applyFixedSize, ', ''],
  ['src/lib/xpra-proto.js', "  const rowsTaken = types.includes('desktop_size') || !name;", '  const rowsTaken = !name; // CONTROL'],
];
const mkTree = (name, levers = []) => {
  const t = path.join(ROOT, name); fs.mkdirSync(t, { recursive: true }); trees.push(t);
  execSync(`git archive HEAD | tar -x -C ${t}`, { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'], shell: '/bin/bash' });
  for (const f of ['src', 'public', 'server.js']) { fs.rmSync(path.join(t, f), { recursive: true, force: true }); fs.cpSync(path.join(repo, f), path.join(t, f), { recursive: true }); }
  for (const [f, from, to] of levers) { const p = path.join(t, f); const s = fs.readFileSync(p, 'utf8'); if (s.split(from).length !== 2) throw new Error(`lever not found once in ${f}: ${from.slice(0, 60)}`); fs.writeFileSync(p, s.replace(from, to)); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(t, 'node_modules'));
  const G = ['-c', 'user.name=suite', '-c', 'user.email=suite@example.invalid'];
  execFileSync('git', ['init', '-q'], { cwd: t }); execFileSync('git', ['add', '-A'], { cwd: t }); execFileSync('git', [...G, 'commit', '-qm', name], { cwd: t });
  execSync('npm run build', { cwd: t, stdio: 'ignore' });
  fs.mkdirSync(path.join(t, 'data'), { recursive: true });
  return t;
};
const appsOf = (t) => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(t, 'data/desktop-apps.json'), 'utf8')).apps).map((a) => ({ ...a, _t: t })); } catch { return []; } };
let chrome = null, cleaned = false;
const CHROME_DIR = path.join(ROOT, 'chrome');
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  if (chrome) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} try { chrome.kill('SIGKILL'); } catch {} }
  for (const s of servers) { try { process.kill(-s.pid, 'SIGKILL'); } catch {} }
  for (const p of trees.flatMap(appsOf).flatMap((a) => Object.values(a.pids || {})).filter(Boolean)) { try { process.kill(p, 'SIGKILL'); } catch {} }
  // everything the servers started — the xpra rung, the apps, the session bus's daemons (cwd / HOME / argv under a scratch root)
  for (const r of [ROOT, ...homes]) { try { endRootedProcesses(r); } catch {} }
  // the private session's FUSE daemons (gvfsd-fuse at <home>/run/gvfs, the document portal at <home>/run/doc) die with it
  // and leave their mounts behind — measured: the home's rm then fails "Is a directory" and the scratch dir stays; lazy-unmount first
  try {
    for (const line of fs.readFileSync('/proc/mounts', 'utf8').split('\n')) {
      const mp = (line.split(' ')[1] || '').replace(/\\040/g, ' ');
      if (!mp || ![...homes, ROOT].some((h) => mp.startsWith(h + '/'))) continue;
      try { execFileSync('fusermount3', ['-u', '-z', mp], { stdio: 'ignore' }); } catch { try { execFileSync('fusermount', ['-u', '-z', mp], { stdio: 'ignore' }); } catch {} }
    }
  } catch {}
  for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch {} }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

/** a tree's server under a PRIVATE session bus with its OWN runtime dir (test-desktop-app-snap's rule: never the owner's a11y bus) */
const bootServer = async (t, name) => {
  const [port] = await freePorts(1);
  const home = scratchHome(name, fs); homes.push(home);
  const rt = path.join(home, 'run'); fs.mkdirSync(rt, { recursive: true }); fs.chmodSync(rt, 0o700);
  const log = [];
  const benv = { ...process.env, ...(await vncEnv()), PORT: String(port), HOME: home, XDG_RUNTIME_DIR: rt, VIBESPACE_SKIP_AGENT_HOOKS: '1', NO_AUTO_UPDATE: '1', CLAUDE_CMD: '/bin/false', CODEX_CMD: '/bin/false', DBUS_SESSION_BUS_ADDRESS: '' };
  delete benv.AT_SPI_BUS_ADDRESS;
  const s = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: t, detached: true, env: benv, stdio: ['ignore', 'pipe', 'pipe'] });
  s.stdout.on('data', (d) => log.push(String(d))); s.stderr.on('data', (d) => log.push(String(d)));
  servers.push(s);
  let up = false; for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/home`); up = true; } catch { await sleep(250); } }
  return { origin: `http://127.0.0.1:${port}`, up, log };
};

const T = mkTree('ours');
const S = await bootServer(T, 'deskapp-fixed-home');
check('the scratch tree\'s server boots (under its own dbus-run-session)', S.up, S.log.join('').slice(-1500));
const [CDP_PORT] = await freePorts(1);
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', `--window-size=${VW},${VH + 100}`, `--user-data-dir=${CHROME_DIR}`, 'about:blank'], { stdio: 'ignore', detached: true });
const WebSocket = require('ws');
const target = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'), 20000, 250);
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('sidebarWidth', '${SIDEBAR}'); } catch {}` });
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
async function drag(x0, y0, x1, y1, steps = 16) {
  await mouse('mouseMoved', x0, y0);
  await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
  await sleep(120);
  await mouse('mouseMoved', x0 + 4, y0 + 2, { button: 'left', buttons: 1 });
  await sleep(300);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { button: 'left', buttons: 1 }); await sleep(25); }
  await sleep(250);
  await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
  await sleep(700);
}

const FIND = (id) => `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
/** the window's raw handles: its rect, the pane, the app's FIXED window element (or the main), the stage, the lock */
const MEAS = (id) => `(() => { const w = ${FIND(id)}; if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return { noView: true };
  const c = v.client; const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const f = c && c.fixed; const anyWin = () => [...c.windows.values()].filter((x) => x.kind !== 'popup').sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
  const cw = !c ? null : f ? c.windows.get(f.wid) : c.mainWid ? c.windows.get(c.mainWid) : anyWin(); const wid = cw && cw.wid; // the fixed window, else the main, else the largest window
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
  return { status: v.status.textContent, win: R(w.element), ws: R(document.getElementById('workspace')), pane: R(v.pane), tb: R(w.titleBar), pic: R(wid ? v.pane.querySelector('.xpra-win[data-wid="' + wid + '"]') : null),
    xwin: cw ? { wid: cw.wid, kind: cw.kind, x: cw.x, y: cw.y, w: cw.w, h: cw.h } : null, fixed: f || null, lock: w.fixedSize || null, pre: w._preFixedSize || null, mainWid: c && c.mainWid,
    stage: v.stageScale, badge: v.fitBadge.style.display !== 'none' ? v.fitBadge.textContent : null, cls: w.element.classList.contains('window-fixed-size'), max: !!w.isMaximized,
    handles: [...w.element.querySelectorAll(':scope > .resize-handle')].some(shown), maxBtn: shown(w.element.querySelector('.win-maximize')), title: w.titleBar.textContent.slice(0, 80), strip: v.bar.textContent.slice(0, 120) };
})()`;
/** the picture's four red edges found in a decoded viewport screenshot (2 device px inside each edge, ±1 px) */
const EDGES = (id, shot) => `(async () => { const w = ${FIND(id)}; const v = w._desktopAppView; const c = v.client; const f = c.fixed; const wid = f ? f.wid : c.mainWid;
  const el = v.pane.querySelector('.xpra-win[data-wid="' + wid + '"]'); const r = el.getBoundingClientRect();
  const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot)}; await img.decode();
  const SW = img.naturalWidth, SH = img.naturalHeight, dpr = SW / innerWidth;
  const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH; const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
  const S = sx.getImageData(0, 0, SW, SH).data;
  const red = (x, y) => { for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const j = (Y * SW + X) * 4; if (S[j] > 190 && S[j + 1] < 80 && S[j + 2] < 80) return true; } return false; };
  const L = Math.round(r.x * dpr), Tp = Math.round(r.y * dpr), Rt = Math.round(r.right * dpr), B = Math.round(r.bottom * dpr);
  const wsr = document.getElementById('workspace').getBoundingClientRect(); const wsB = Math.round(wsr.bottom * dpr);
  const edge = (pts) => { let n = 0, ok = 0; for (const [x, y] of pts) { if (y >= wsB) continue; n++; if (red(x, y)) ok++; } return { n, ok }; };
  const along = (a, b, k) => Array.from({ length: k }, (_, i) => a + ((b - a) * (i + 0.5)) / k);
  return { left: edge(along(Tp + 12, B - 12, 24).map((y) => [L + 2, Math.round(y)])), right: edge(along(Tp + 12, B - 12, 24).map((y) => [Rt - 3, Math.round(y)])),
    top: edge(along(L + 12, Rt - 12, 24).map((x) => [Math.round(x), Tp + 2])), bottom: edge(along(L + 12, Rt - 12, 24).map((x) => [Math.round(x), B - 3])), hiddenB: Math.max(0, B - wsB) / dpr };
})()`;
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;
const framed = (m) => !!(m && m.pic && near(m.pic.x, m.pane.x) && near(m.pic.y, m.pane.y) && near(m.pic.w, m.pane.w) && near(m.pic.h, m.pane.h));
const blankPct = (m) => (m && m.pic ? Math.round(100 * (1 - Math.min(m.pic.w, m.pane.w) * Math.min(m.pic.h, m.pane.h) / (m.pane.w * m.pane.h))) : 100);
const settle = async (id, ms = 10000) => {
  let last = null, since = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await sleep(300);
    const m = await ev(MEAS(id));
    const key = m && m.pic ? JSON.stringify([m.win, m.pane, m.pic, m.stage, m.lock]) : 'x';
    if (key !== last) { last = key; since = Date.now(); } else if (Date.now() - since >= 1500) return m;
  }
  return ev(MEAS(id));
};
const ensureActive = async (id) => {
  const seat = () => ev(`(() => { const w = ${FIND(id)}; if (!w) return null; const s = w._desktopSeats || {}; return { known: !!s.known, active: s.active, pane: w._desktopPaneKey }; })()`);
  const s = await until(async () => { const v = await seat(); return v && v.known ? v : null; }, 10000, 250);
  if (s && s.active === s.pane) return true;
  await ev(`(() => { const w = ${FIND(id)}; const b = w && w.content.querySelector('.desktop-app-resume'); if (b) b.click(); return true; })()`);
  return !!(await until(async () => { const v = await seat(); return v && v.active === v.pane ? v : null; }, 10000, 250));
};
const launch = async (origin, args, tag) => {
  const body = { exec: PY, args: [FIXTURE, ...args.map(String)], label: 'fixed-size' };
  const r = await ev(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(${JSON.stringify(body)}, { dpr: devicePixelRatio, uiScale: 1 })) }).then((r) => r.json())`);
  const id = r && r.id;
  if (!id) { check(`${tag}: launches`, false, r); return null; }
  const rec = await until(async () => { const x = await (await fetch(`${origin}/api/desktop/apps/${id}`)).json(); return x.state === 'ready' || x.state === 'exited' ? x : null; }, 45000);
  if (!rec || rec.state !== 'ready') { check(`${tag}: reaches ready`, false, rec); return null; }
  await ev(`app.openDesktopApp(${JSON.stringify(id)}); true`);
  await ensureActive(id);
  const conn = await until(async () => { const m = await ev(MEAS(id)); return m && m.pic && m.pic.h > 50 ? m : null; }, 45000, 300);
  if (!conn) { check(`${tag}: connects`, false, await ev(MEAS(id))); return null; }
  await mouse('mouseMoved', 60, Math.round(VH / 2));
  return { id, rec };
};
const stop = async (origin, id) => {
  await fetch(`${origin}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }).catch(() => {});
  await until(() => ev(`!${FIND(id)}`), 15000, 300);
  await ev(`(() => { const w = ${FIND(id)}; if (w) app.wm.closeWindow(w.id); return true; })()`).catch(() => {});
};
const shotOf = async () => (await cdp('Page.captureScreenshot', { format: 'png' })).data;
const fmt = (b) => (b ? `${+b.w.toFixed(1)}×${+b.h.toFixed(1)}@${+b.x.toFixed(1)},${+b.y.toFixed(1)}` : 'none');

async function page(origin, { dpr, lang }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: dpr, mobile: false });
  await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await cdp('Page.navigate', { url: `${origin}/` }); await sleep(800);
  await ev(`localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); localStorage.removeItem('vibespace.uiScale'); true`);
  await cdp('Page.reload'); await sleep(1500);
  await ev('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app")); setTimeout(w, 200); })(); })');
  await until(() => ev('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250);
  await ev('app.sidebar.isOpen || app.sidebar.toggle(true); true'); await sleep(800);
}

/** ONE configuration on a tree's server */
async function runConfig(origin, { dpr, lang, label, tree, control = false }) {
  const tag = `${label} DPR ${dpr} (${lang})`;
  await page(origin, { dpr, lang });
  const out = {};
  // ── NORMAL 400×300 ──
  let L = await launch(origin, [400, 300, 'normal'], `${tag} NORMAL`);
  if (L) {
    const m = await settle(L.id);
    out.normal = m;
    console.log(`  ${tag} NORMAL: record scale ${L.rec.scale}; window ${fmt(m.win)} pane ${fmt(m.pane)} picture ${fmt(m.pic)} (X ${m.xwin && `${m.xwin.w}×${m.xwin.h}`}) stage ${m.stage} badge ${JSON.stringify(m.badge)} lock ${JSON.stringify(m.lock)} — blank ${blankPct(m)} %; strip "${m.strip}"`);
    if (!control) {
      check(`${tag} NORMAL: the pane IS the picture (400×300 CSS, ≤ 0.5 CSS px each side), stage 1, no badge, the window locked`, framed(m) && near(m.pic.w, 400) && near(m.pic.h, 300) && m.stage === 1 && m.badge === null && m.cls && !!m.lock, m);
      const e = await ev(EDGES(L.id, await shotOf()));
      check(`${tag} NORMAL: all four red edges of the picture are on screen (left ${e.left.ok}/${e.left.n}, right ${e.right.ok}/${e.right.n}, top ${e.top.ok}/${e.top.n}, bottom ${e.bottom.ok}/${e.bottom.n})`, ['left', 'right', 'top', 'bottom'].every((k) => e[k].n >= 20 && e[k].ok >= e[k].n - 1), e);
      check(`${tag} NORMAL: no resize handle and no maximize button is displayed`, !m.handles && !m.maxBtn, { handles: m.handles, maxBtn: m.maxBtn });
      const tbY = m.tb.y + m.tb.h / 2, tbX = m.tb.x + Math.min(m.tb.w * 0.3, 120);
      await mouse('mouseMoved', tbX, tbY);
      await mouse('mousePressed', tbX, tbY, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', tbX, tbY, { button: 'left', buttons: 0, clickCount: 1 });
      await mouse('mousePressed', tbX, tbY, { button: 'left', buttons: 1, clickCount: 2 }); await mouse('mouseReleased', tbX, tbY, { button: 'left', buttons: 0, clickCount: 2 });
      await sleep(600);
      await ev(`(() => { const w = ${FIND(L.id)}; app.wm.toggleMaximize(w.id); return true; })()`); await sleep(400);
      const m1 = await ev(MEAS(L.id));
      check(`${tag} NORMAL: a double-click on the title bar and the maximize command leave it unmaximized at its size`, !m1.max && near(m1.win.w, m.win.w) && near(m1.win.h, m.win.h), { before: m.win, after: m1.win, max: m1.max });
      await drag(m1.win.r - 3, m1.win.b - 3, m1.win.r + 200, m1.win.b + 120);
      const m2 = await settle(L.id, 5000);
      check(`${tag} NORMAL: a trusted drag at its bottom-right corner does not resize it (${fmt(m2.win)})`, near(m2.win.w, m.win.w) && near(m2.win.h, m.win.h) && framed(m2), m2.win);
      await drag(m2.tb.x + 40, m2.tb.y + m2.tb.h / 2, m2.ws.r - 6, m2.ws.y + m2.ws.h / 2);
      const m3 = await settle(L.id, 5000);
      check(`${tag} NORMAL: a title-bar drag onto the right snap zone moves it and never sizes it (${fmt(m3.win)})`, near(m3.win.w, m.win.w) && near(m3.win.h, m.win.h) && !near(m3.win.x, m2.win.x, 20) && framed(m3), m3.win);
      await ev('app.wm.setGrid(1, 3); true'); await sleep(500);
      await drag(m3.tb.x + 40, m3.tb.y + m3.tb.h / 2, m3.ws.x + m3.ws.w * 0.5, m3.ws.y + m3.ws.h * 0.5);
      const m4 = await settle(L.id, 5000);
      await ev('app.wm.setGrid(null); true'); await sleep(300);
      check(`${tag} NORMAL: a drop on the middle cell of a 1×3 grid never sizes it (${fmt(m4.win)})`, near(m4.win.w, m.win.w) && near(m4.win.h, m.win.h) && framed(m4), m4.win);
      // RELEASE: the fixed window replaced by a resizable main (WeChat's login → its main window)
      const pid = (await (await fetch(`${origin}/api/desktop/apps/${L.id}`)).json()).pids?.app;
      const pre = m4.pre;
      try { process.kill(pid, 'SIGUSR1'); } catch (err) { check(`${tag} RELEASE: the fixture takes SIGUSR1`, false, String(err)); }
      const r = await until(async () => { const x = await ev(MEAS(L.id)); return x && !x.lock && x.pic && x.xwin && x.xwin.kind === 'main' && !x.fixed ? x : null; }, 20000, 300);
      const m5 = r ? await settle(L.id, 6000) : await ev(MEAS(L.id));
      check(`${tag} RELEASE: the resizable main replaces it ⇒ unlocked, the handles and maximize back, the window at its size before the lock (${JSON.stringify(pre)} ⇒ ${fmt(m5.win)}), the new main fills the pane`, !!r && !m5.cls && m5.handles && m5.maxBtn && !!pre && near(m5.win.w, parseFloat(pre.width) + 0, 1) && near(m5.win.h, parseFloat(pre.height), 1) && framed(m5), { pre, m5 });
    }
    await stop(origin, L.id);
  }
  // ── DIALOG 480×700: a lone, modal DIALOG-typed window taller than the default pane (Inkscape's welcome) ──
  L = await launch(origin, [480, 700, 'dialog'], `${tag} DIALOG`);
  if (L) {
    const m = await settle(L.id);
    out.dialog = m;
    console.log(`  ${tag} DIALOG: window ${fmt(m.win)} pane ${fmt(m.pane)} picture ${fmt(m.pic)} X ${JSON.stringify(m.xwin)} main ${m.mainWid} — blank ${blankPct(m)} %`);
    if (!control) check(`${tag} DIALOG: the lone fixed dialog is the picture at the pane's origin (X 0,0) and the pane IS it (480×700 CSS)`, framed(m) && m.xwin && m.xwin.kind === 'dialog' && m.xwin.x === 0 && m.xwin.y === 0 && near(m.pic.w, 480) && near(m.pic.h, 700) && m.cls, m);
    await stop(origin, L.id);
  }
  // ── BIG 1000×900 at DPR 2: larger than the workspace ──
  if (dpr === 2) {
    L = await launch(origin, [1000, 900, 'normal'], `${tag} BIG`);
    if (L) {
      const m = await settle(L.id);
      out.big = m;
      const e = control ? null : await ev(EDGES(L.id, await shotOf()));
      console.log(`  ${tag} BIG: window ${fmt(m.win)} on a workspace ${fmt(m.ws)}; pane ${fmt(m.pane)} picture ${fmt(m.pic)} stage ${m.stage} badge ${JSON.stringify(m.badge)}${e ? ` — ${e.hiddenB.toFixed(1)} CSS px of the picture past the workspace's bottom edge` : ''}`);
      if (!control) {
        check(`${tag} BIG: a fixed window larger than the workspace keeps the app's size (pane = the 1000×900 CSS picture, stage 1, no badge), its top on the workspace`, framed(m) && near(m.pic.w, 1000) && near(m.pic.h, 900) && m.stage === 1 && m.badge === null && m.win.h > m.ws.h && near(m.win.y, m.ws.y, 1), m);
        check(`${tag} BIG: its left, right and top red edges are on screen; the bottom is past the workspace (${e.hiddenB.toFixed(1)} CSS px — movable, the Scale ▸ menu is the lever)`, ['left', 'right', 'top'].every((k) => e[k].n >= 20 && e[k].ok >= e[k].n - 1) && e.hiddenB > 0, e);
      }
      await stop(origin, L.id);
    }
  }
  // ── WORK AREA (lane desktop-workarea): WeChat's main window — resizable, its MAXIMUM the root's _NET_WORKAREA, re-read as
  // it changes — and the VibeSpace window sized twice: smaller, then LARGER than the pane the client said hello with ──
  L = await launch(origin, [600, 400, 'workarea'], `${tag} WORK AREA`);
  if (L) {
    const xenv = { ...process.env, DISPLAY: L.rec.display, XAUTHORITY: path.join(tree, 'data/desktop-apps', L.id, 'Xauthority') };
    const x11 = () => {
      try {
        const wa = execFileSync(XPROP, ['-root', '_NET_WORKAREA'], { env: xenv, encoding: 'utf8', timeout: 10000 }), r = execFileSync(XWININFO, ['-root'], { env: xenv, encoding: 'utf8', timeout: 10000 });
        return { wa: wa.split('=').pop().split(',').map((s) => parseInt(s, 10)).slice(0, 4), root: [+(/Width: (\d+)/.exec(r) || [0, 0])[1], +(/Height: (\d+)/.exec(r) || [0, 0])[1]] };
      } catch (err) { return { wa: [], root: [0, 0], err: String(err).slice(0, 300) }; }
    };
    /** X's root is the pane (device px, ±2) and _NET_WORKAREA is that whole root */
    const follows = (x, m) => !!(m && m.pane) && Math.abs(x.root[0] - m.pane.w * dpr) <= 2 && Math.abs(x.root[1] - m.pane.h * dpr) <= 2 && x.wa.join() === [0, 0, ...x.root].join();
    const sizeWin = (cw, ch) => ev(`(() => { const w = ${FIND(L.id)}; app.wm.focusWindow(w.id); w.element.style.left = '20px'; w.element.style.top = '10px'; w.element.style.width = '${cw}px'; w.element.style.height = '${ch}px'; if (w.onResize) w.onResize(); return true; })()`);
    const m0 = await settle(L.id), x0 = x11();
    console.log(`  ${tag} WORK AREA: hello pane ${fmt(m0.pane)} ⇒ root ${x0.root.join('×')}, _NET_WORKAREA ${x0.wa.join(',')}${x0.err ? ` (${x0.err})` : ''}`);
    const steps = [];
    for (const [cw, ch] of [[Math.round(m0.win.w * 0.7), Math.round(m0.win.h * 0.7)], [Math.round(m0.ws.w - 60), Math.round(m0.ws.h - 30)]]) {
      await sizeWin(cw, ch);
      await until(async () => { const m = await ev(MEAS(L.id)); return follows(x11(), m) && framed(m); }, control ? 6000 : 20000, 400);
      const m = await settle(L.id, 8000), x = x11();
      steps.push({ x, follows: follows(x, m), framed: framed(m), strip: m.pic ? +(m.pane.b - m.pic.b).toFixed(1) : null, pane: m.pane, pic: m.pic, xwin: m.xwin });
      console.log(`  ${tag} WORK AREA: window ${cw}×${ch} ⇒ pane ${fmt(m.pane)} (${Math.round(m.pane.w * dpr)}×${Math.round(m.pane.h * dpr)} device), root ${x.root.join('×')}, _NET_WORKAREA ${x.wa.join(',')}; picture ${fmt(m.pic)} — ${steps.at(-1).strip} CSS px blank under it`);
    }
    out.workarea = steps;
    if (!control) {
      check(`${tag} WORK AREA: after the 1st resize (smaller) X's root is the pane and _NET_WORKAREA is that whole root`, steps[0].follows, steps[0]);
      check(`${tag} WORK AREA: after the 2nd resize (larger than the hello's pane) _NET_WORKAREA still equals the pane (${steps[1].x.wa.join(',')} on a ${steps[1].x.root.join('×')} root)`, steps[1].follows, steps[1]);
      check(`${tag} WORK AREA: the app that caps itself at the work area fills the larger pane — no blank strip under it (${steps[1].strip} CSS px)`, steps[1].framed, steps[1]);
    }
    await stop(origin, L.id);
  }
  return out;
}

console.log('§1 ours — frame = picture, not resizable, never scaled (DPR 2 in zh, DPR 1 in en)');
await runConfig(S.origin, { dpr: 2, lang: 'zh', label: 'ours', tree: T });
await runConfig(S.origin, { dpr: 1, lang: 'en', label: 'ours', tree: T });

console.log('§2 CONTROL — a tree with the levers pulled back (the client\'s lone-dialog rule, the view\'s no-scale rule, the window\'s onFixedSize wiring, the display packet\'s work-area rows)');
{
  const Tc = mkTree('control', LEVERS);
  const Sc = await bootServer(Tc, 'deskapp-fixed-chome');
  check('CONTROL: the control tree\'s server boots', Sc.up);
  const c = await runConfig(Sc.origin, { dpr: 2, lang: 'zh', label: 'CONTROL', tree: Tc, control: true });
  check(`CONTROL: NORMAL — the 400×300 picture in a larger pane, ${blankPct(c.normal)} % of it blank (the owner's WeChat)`, !!c.normal && !framed(c.normal) && blankPct(c.normal) >= 50, c.normal);
  check(`CONTROL: DIALOG — the lone fixed dialog is never adopted: the pane is not the picture (${blankPct(c.dialog)} % blank) and ${c.dialog && c.dialog.pic ? (c.dialog.pic.b - c.dialog.pane.b).toFixed(0) : '?'} CSS px of it are cut at the pane's bottom (the owner's Inkscape)`, !!c.dialog && !framed(c.dialog) && !!c.dialog.pic && c.dialog.pic.b > c.dialog.pane.b + 1, c.dialog);
  check(`CONTROL: BIG — scaled to fit with the badge (stage ${c.big && c.big.stage}, "${c.big && c.big.badge}")`, !!c.big && c.big.stage < 1 && !!c.big.badge, c.big);
  const cw = c.workarea && c.workarea[1];
  check(`CONTROL: WORK AREA — the pre-lane display packet (display-configure alone) leaves _NET_WORKAREA at the hello's pane after the larger resize (${cw && cw.x.wa.join(',')} on a ${cw && cw.x.root.join('×')} root) and ${cw && cw.strip} CSS px blank under the app (the owner's WeChat)`, !!cw && !cw.follows && !cw.framed && cw.strip > 1, cw);
}

console.log(`${failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
