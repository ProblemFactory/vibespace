#!/usr/bin/env node
// A SNAPPED DESKTOP-APP WINDOW NEVER CLIPS ITS PICTURE (inc-muhmqvzf-jodk, 2026-09-26; the owner, a Mac at
// 1920×963 CSS / DPR 2 / UI 100 %, the sidebar open, a 1×3 grid: "chrome吸附在右侧，右侧有截断"). The cause, measured
// by the reproducer: a window whose own minimum (Chrome: 1020 device px ⇒ 512 CSS on lane D) is WIDER than its
// grid cell (478 CSS on a 1450 px workspace) grew rightward from the cell's left edge, hung ~29 CSS past the
// workspace, and #workspace (overflow: clip) cut the app's own ⋮ / ✕. The picture inside the window was complete;
// the WINDOW hung off the screen. FIX: every path that puts a window into a zone goes through ONE placement
// (WindowManager._placeWindow → PURE window-min-size.js zoneBox) that slides the raised window back inside.
// Heavy: headless Chrome over CDP against a worktree server (its own data/, a scratch HOME, a private
// dbus-run-session) on the REAL xpra rung (xpra 6.5.3) with REAL google-chrome and gnome-calculator; every act is a
// trusted user act (a drag of our title bar or the app's own header bar onto a snap zone / grid cell, a drag of the
// right resize handle, the product's maximize toggle). Every state is MEASURED:
//   • geometry — the window, the pane and the app's main picture element vs #workspace (CSS px): nothing past it;
//     the picture vs the pane ≤ 1 device px (a fractional pane cannot be covered by whole device px any closer);
//   • rendered pixels — a viewport screenshot decoded in the page: the picture's rightmost 40 and bottom 40 device
//     columns / rows (the app's own ⋮ / ✕ / keypad edge) read from the canvas backing are FOUND at their mapped
//     screen positions (inside the screenshot, inside the workspace; ≥ 80 % the same colours at the best ±1 device px
//     alignment — a cut or covered picture reads 0–50 %);
//   • our own title-bar ✕ and the strip's Paste — revealed on a seamless window by the person's top-edge hover — are
//     inside the workspace and hit-test to themselves.
// Developer knobs (never set by the gate; a narrowed run exits 1): SNAP_ONLY=<app>-<dpr>-<ui>,… SNAP_CONTROL=0
// SNAP_SHOTS=<dir> (each state's viewport + the main canvas backing as PNGs).
// Matrix: Chrome and Calculator × DPR 2 / 1 × UI 100 / 125 %, the sidebar open at 470 (the owner's workspace), acts
// rest, grid13 (the right third of 1×3 — the owner's), right, left, top, bottom, grid22 (bottom-right), max,
// restore, w700. THE OWNER'S CASE is its own check line (Chrome, DPR 2, UI 100 %, grid13 ⇒ 0 px hidden).
// r2 (the verifier's MAJOR, a 3-click everyday flow): at DPR 2 / UI 100 % both apps also run THE FLOWS — the sidebar
// CLOSED ⇒ the right third of 1×3 on the wide workspace (sb0grid13), minimize → the sidebar opens → restore
// (minrestore), again (sb0grid13b), maximize → the sidebar opens → un-maximize (maxsb), then THE CASCADE: the sidebar
// closed again (widen) and opened again (narrow) ⇒ still inside; and a phone viewport round trip (phone: 390×844 and
// back) ⇒ the picture EXACTLY 0 past its pane (stored bounds land on whole layout px). Each flow its own line with the
// device px of the picture hidden.
// CONTROL = a copy of this tree with the two placement levers pulled back (the zone written as given, the default
// cascade as it falls) and the r2 levers (minimized windows skipped by the reflow, the stale prevBounds px, a hidden
// window's capture read from its offsets, fractional stored boxes, a capped raise shared), bundle rebuilt: the owner's
// case hangs past the workspace and the pixel judge fails; the calculator's bottom half and its UI-125 % default
// placement are cut at the bottom; Chrome's minrestore / maxsb hang past and the cascade (widen, then narrow again) keeps hanging.
// SKIPs with evidence without chrome / xpra / xauth / dbus-run-session; each app SKIPs when absent.
// Run: node scripts/test-desktop-app-snap.mjs
import { execSync, spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, vncEnv, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const bin = (n) => D.binOnPath(n, { env: process.env });
const XPRA = bin('xpra'), XAUTH = bin('xauth'), DBUS = bin('dbus-run-session'), CALC = bin('gnome-calculator');
const skipWhy = !CHROME ? 'no chrome/chromium' : !XPRA ? 'xpra not on PATH (apt install xpra)' : !XAUTH ? 'xauth not on PATH' : !DBUS ? 'dbus-run-session not on PATH' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const VW = 1920, VH = 963, SIDEBAR = 470;

let failed = 0, skipped = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const skip = (n, why) => { skipped++; console.log(`  ⚠ SKIP ${n}: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

// ── the worktrees: ours (the working tree's src/public/server.js) and the CONTROL copy (two levers pulled back) ──
const worktrees = [], servers = [], homes = [];
const mkTree = (name) => {
  const wt = scratch(name);
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wt);
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  return wt;
};
const appsOf = (w) => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(w, 'data/desktop-apps.json'), 'utf8')).apps).map((a) => ({ ...a, _wt: w })); } catch { return []; } };
const markerSweep = () => {
  const apps = worktrees.flatMap(appsOf).filter((a) => a.id);
  const needles = [...apps.map((a) => `VIBESPACE_DESKTOP_APP=${a.id}`), ...apps.map((a) => `XAUTHORITY=${path.join(a._wt, 'data', 'desktop-apps', a.id, 'Xauthority')}`), ...homes.map((h) => `HOME=${h}`)];
  const hit = [];
  if (!needles.length) return hit;
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) hit.push(Number(d)); }
  for (const p of hit) { try { process.kill(p, 'SIGKILL'); } catch {} }
  return hit;
};
let chrome = null;
const CHROME_DIR = scratch('deskapp-snap-chrome');
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  if (chrome) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} try { chrome.kill('SIGKILL'); } catch {} }
  for (const s of servers) { try { process.kill(-s.pid, 'SIGKILL'); } catch {} try { s.kill('SIGKILL'); } catch {} }
  for (const p of worktrees.flatMap(appsOf).flatMap((a) => Object.values(a.pids || {})).filter(Boolean)) { try { process.kill(p, 'SIGKILL'); } catch {} }
  const swept = markerSweep();
  if (swept.length) console.log(`  (exit sweep reaped ${swept.length} process(es) carrying this run's marker / HOME: ${swept.join(', ')})`);
  for (const w of worktrees) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch {} }
  for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch {} }
  try { fs.rmSync(CHROME_DIR, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

/** a worktree server under a PRIVATE session bus (the real apps want one), detached ⇒ its own process group; its own
 *  singleton-Desktop display / port (scratch.mjs vncEnv — test-architecture §57, never the machine-global :7 / 5901) */
const bootServer = async (wt, name) => {
  const [port] = await freePorts(1);
  const home = scratchHome(name, fs); homes.push(home);
  const log = [];
  const s = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: wt, detached: true, env: { ...process.env, ...(await vncEnv()), PORT: String(port), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', NO_AUTO_UPDATE: '1', CLAUDE_CMD: '/bin/false', CODEX_CMD: '/bin/false', DBUS_SESSION_BUS_ADDRESS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  s.stdout.on('data', (d) => log.push(String(d))); s.stderr.on('data', (d) => log.push(String(d)));
  servers.push(s);
  let up = false; for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/home`); up = true; } catch { await sleep(250); } }
  return { origin: `http://127.0.0.1:${port}`, up, log, proc: s };
};

const wt = mkTree('deskapp-snap');
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const S = await bootServer(wt, 'deskapp-snap-home');
check('the worktree server boots (under its own dbus-run-session)', S.up);
const [CDP_PORT] = await freePorts(1);
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', `--window-size=${VW},${VH + 100}`, `--user-data-dir=${CHROME_DIR}`, 'about:blank'], { stdio: 'ignore', detached: true });
const WebSocket = require('ws');
const target = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'), 20000, 250);
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); const logs = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')); });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  return { ws, cdp, evalJs, logs, close: () => { try { ws.close(); } catch {} } };
}
const P = await page(target);
await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('sidebarWidth', '${SIDEBAR}'); } catch {}` });
await P.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });

const FIND = (id) => `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
/** the window's raw handles (never the DOM's words): the WindowManager record, the view, the client's main window */
const MEAS = (id) => `(() => { const w = ${FIND(id)}; if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return { noView: true };
  const c = v.client; const main = c && c.mainWid ? c.windows.get(c.mainWid) : null;
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const pr = R(v.pane), er = R(w.element), tb = R(w.titleBar), ws = R(document.getElementById('workspace'));
  const mainEl = main ? v.pane.querySelector('.xpra-win[data-wid="' + main.wid + '"]') : null;
  const me = mainEl ? R(mainEl) : null;
  return { status: v.status.textContent, win: { ...er, max: !!w.isMaximized, minW: w.minWidth, minH: w.minHeight, style: [w.element.style.left, w.element.style.top, w.element.style.width, w.element.style.height] }, ws, pane: pr, tbH: tb.h, ratio: v.ratio, stage: v.stageScale,
    main: main ? { wid: main.wid, x: main.x, y: main.y, w: main.w, h: main.h } : null, mainEl: me,
    handles: [...w.element.querySelectorAll('.resize-handle')].map((h) => ({ d: h.dataset.dir, ...R(h) })).filter((h) => h.d === 'e' || h.d === 'w') };
})()`;
/** our own bars as a person sees them: shown (a window with a frame) or revealed (a seamless one, after the top-edge
 *  hover) — the title bar's ✕ and the strip's Paste, their rects and whether a point at their centre hits them */
const BARS = (id) => `(() => { const w = ${FIND(id)}; const v = w._desktopAppView; const sm = w._desktopSeamless || null;
  const folded = !!(sm && sm.seamless) && !w.element.classList.contains('seamless-revealed');
  const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden') return null; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), hits: !!hit && (hit === el || el.contains(hit)) }; };
  return { seamless: !!(sm && sm.seamless), folded, close: vis(w.element.querySelector('.win-close')), paste: vis(v.bar && v.bar.querySelector('.desktop-paste')) };
})()`;
/** THE RENDERED-PIXEL JUDGE: a viewport screenshot decoded in the page; the picture's right and bottom 40 device
 *  columns / rows from the canvas backing looked for at their mapped screen positions (same colours) */
const PIXJ = (id, shot) => `(async () => { const w = ${FIND(id)}; const v = w._desktopAppView; const c = v.client; const main = c && c.mainWid ? c.windows.get(c.mainWid) : null;
  const cv = main && v.pane.querySelector('.xpra-win[data-wid="' + main.wid + '"] canvas'); if (!cv) return { none: true };
  const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot)}; await img.decode();
  const SW = img.naturalWidth, SH = img.naturalHeight, dpr = SW / innerWidth;
  const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH; const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
  const r = cv.getBoundingClientRect(), kx = r.width / cv.width, ky = r.height / cv.height;
  const W = Math.min(cv.width, main.w), H = Math.min(cv.height, main.h);
  const ws = document.getElementById('workspace').getBoundingClientRect(), pn = v.pane.getBoundingClientRect();
  const pnd = { l: pn.x * dpr, t: pn.y * dpr, r: pn.right * dpr, b: pn.bottom * dpr };
  const pic = { l: r.x * dpr, t: r.y * dpr, r: (r.x + W * kx) * dpr, b: (r.y + H * ky) * dpr };
  const wsd = { l: ws.x * dpr, t: ws.y * dpr, r: ws.right * dpr, b: ws.bottom * dpr };
  const one = Math.abs(kx * dpr - 1) < 0.01 && Math.abs(ky * dpr - 1) < 0.01;
  const tol = one ? 36 : 150;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const S = sx.getImageData(0, 0, SW, SH).data;
  // each sampled backing pixel mapped to the screen: past the PANE (the ≤ 1 CSS px a fractional pane cannot cover —
  // judged by geometry) is counted apart; past the screenshot = off screen; past the workspace = clipped (and compared).
  // The compositor snaps a layer to the device grid its own way (a picture a sub-pixel off the grid is resampled —
  // measured at UI 125 %, every edge half a pixel soft): the colours are compared at the best of the ±1 device px
  // alignments around the mapped position; WHERE the pixels are (off / clipped) is judged at the mapped position itself
  const strip = (bx0, by0, bw, bh, step) => { const B = ctx.getImageData(bx0, by0, bw, bh).data; let n = 0, off = 0, clipped = 0, paneHid = 0; const pts = [];
    for (let y = 0; y < bh; y += step) for (let x = 0; x < bw; x += 1) { const bx = bx0 + x, by = by0 + y; const fx = r.x * dpr + (bx + 0.5) * kx * dpr, fy = r.y * dpr + (by + 0.5) * ky * dpr, dx = Math.floor(fx), dy = Math.floor(fy);
      if (fx >= pnd.r && fx < wsd.r || fy >= pnd.b && fy < wsd.b) { paneHid++; continue; }
      n++;
      if (dx < 0 || dy < 0 || dx >= SW || dy >= SH) { off++; continue; }
      if (dx >= wsd.r || dy >= wsd.b) clipped++;
      pts.push((y * bw + x) * 4, dx, dy); }
    let ok = 0, at = [0, 0];
    for (const [ox, oy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) { let c = 0;
      for (let q = 0; q < pts.length; q += 3) { const i = pts[q], dx = pts[q + 1] + ox, dy = pts[q + 2] + oy; if (dx < 0 || dy < 0 || dx >= SW || dy >= SH) continue; const j = (dy * SW + dx) * 4; if (Math.abs(B[i] - S[j]) + Math.abs(B[i + 1] - S[j + 1]) + Math.abs(B[i + 2] - S[j + 2]) <= tol) c++; }
      if (c > ok) { ok = c; at = [ox, oy]; } }
    return { n, ok, off, clipped, paneHid, at, frac: n ? ok / n : 0 }; };
  const k = 40;
  const right = strip(Math.max(0, W - k), 0, Math.min(k, W), H, 3), bottom = strip(0, Math.max(0, H - k), W, Math.min(k, H), 3);
  return { dpr, one, tol, pic, ws: wsd, right, bottom, overR: +(pic.r - Math.min(SW, wsd.r)).toFixed(2), overB: +(pic.b - Math.min(SH, wsd.b)).toFixed(2) };
})()`;
const mouse = (type, x, y, extra = {}) => P.cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
async function drag(x0, y0, x1, y1, steps = 20) {
  await mouse('mouseMoved', x0, y0);
  await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
  await sleep(120);
  await mouse('mouseMoved', x0 + 4, y0 + 2, { button: 'left', buttons: 1 });
  await sleep(350);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { button: 'left', buttons: 1 }); await sleep(25); }
  await sleep(250);
  await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
}
/** where a person grabs the window: our title bar when it shows, else the app's own header bar / tab strip */
const grabPoint = (m, app) => (m.tbH >= 20 ? { x: m.win.x + Math.min(m.win.w * 0.45, 260), y: m.win.y + m.tbH / 2 + 1 } : { x: m.pane.x + m.pane.w * (app === 'chromium' ? 0.62 : 0.35), y: m.pane.y + (app === 'chromium' ? 14 : 20) });
/** settle: the window rect, the client's main and the pane unchanged for 1.5 s (max 10 s) */
const settle = async (id) => {
  let last = null, since = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    await sleep(300);
    const m = await P.evalJs(MEAS(id));
    const key = m && m.main ? JSON.stringify([m.win.x, m.win.y, m.win.w, m.win.h, m.main, m.pane.w, m.pane.h, m.stage]) : 'x';
    if (key !== last) { last = key; since = Date.now(); } else if (Date.now() - since >= 1500) return m;
  }
  return P.evalJs(MEAS(id));
};
const ACTS = ['rest', 'grid13', 'right', 'left', 'top', 'bottom', 'grid22', 'max', 'restore', 'w700'];
/** r2 — the verifier's flows (a box the window manager kept ITSELF through a minimize / a maximize while the sidebar
 *  opened) + the cascade + the phone round trip; run at DPR 2 / UI 100 % after ACTS */
const FLOWS = ['sb0grid13', 'minrestore', 'sb0grid13b', 'maxsb', 'widen', 'narrow', 'phone'];
const WS_RECT = `(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;
const sidebarSet = async (open) => { await P.evalJs(`(() => { if (!!app.sidebar.isOpen !== ${open}) app.sidebar.toggle(${open}); return true; })()`); await sleep(900); };
async function act(id, app, a, ws, ui, dpr = 1) {
  await P.evalJs(`(() => { const w = ${FIND(id)}; app.wm.focusWindow(w.id); return true; })()`);
  const midY = ws.y + ws.h / 2, midX = ws.x + ws.w / 2;
  if (a === 'rest') return;
  if (a === 'sb0grid13' || a === 'sb0grid13b') {
    // the sidebar CLOSED (the wide workspace); each flow starts ON SCREEN — the product's own cell key puts the window in
    // the left cell (a pre-r2 tree left the previous flow's window hanging off the screen, and its cascade would leak into
    // the next flow's numbers) — then the person's drag into the right third of 1×3
    await sidebarSet(false);
    await P.evalJs(`(() => { const w = ${FIND(id)}; app.wm.setGrid(1, 3); app.wm.focusWindow(w.id); app.wm.snapActiveToCell(0); return true; })()`); await sleep(900);
    const w0 = await P.evalJs(WS_RECT), m = await P.evalJs(MEAS(id)), g = grabPoint(m, app);
    await drag(g.x, g.y, w0.x + w0.w * 0.85, w0.y + w0.h / 2);
    await sleep(900);
  } else if (a === 'minrestore') {
    await P.evalJs(`(() => { const w = ${FIND(id)}; app.wm.minimize(w.id); return true; })()`); await sleep(600);
    await sidebarSet(true);
    await P.evalJs(`(() => { const w = ${FIND(id)}; app.wm.restore(w.id); return true; })()`); await sleep(900);
  } else if (a === 'maxsb') {
    await P.evalJs(`(() => { const w = ${FIND(id)}; if (!w.isMaximized) app.wm.toggleMaximize(w.id); return true; })()`); await sleep(900);
    await sidebarSet(true);
    await P.evalJs(`(() => { const w = ${FIND(id)}; if (w.isMaximized) app.wm.toggleMaximize(w.id); return true; })()`); await sleep(900);
  } else if (a === 'widen') await sidebarSet(false);
  else if (a === 'narrow') await sidebarSet(true);
  else if (a === 'phone') {
    await P.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: dpr, mobile: false }); await sleep(2000);
    await P.cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: dpr, mobile: false }); await sleep(1500);
    await P.evalJs('app.sidebar.isOpen || app.sidebar.toggle(true); true'); await sleep(900);
  }
  if (FLOWS.includes(a)) { await mouse('mouseMoved', 20, Math.round(VH / 2)); await sleep(700); return; }
  if (a === 'right' || a === 'left' || a === 'top' || a === 'bottom') {
    await P.evalJs('app.wm.setGrid(null); true');
    const m = await P.evalJs(MEAS(id)); const g = grabPoint(m, app);
    const tgt = { right: [ws.x + ws.w - 8, midY], left: [ws.x + 8, midY], top: [midX, ws.y + 8], bottom: [midX, ws.y + ws.h - 8] }[a];
    await drag(g.x, g.y, tgt[0], tgt[1]);
  } else if (a === 'grid13' || a === 'grid22') {
    const [rows, cols] = a === 'grid22' ? [2, 2] : [1, 3];
    await P.evalJs(`app.wm.setGrid(${rows}, ${cols}); true`);
    const m = await P.evalJs(MEAS(id)); const g = grabPoint(m, app);
    await drag(g.x, g.y, ws.x + ws.w * (cols === 2 ? 0.75 : 0.85), a === 'grid22' ? ws.y + ws.h * 0.75 : midY);
  } else if (a === 'max') await P.evalJs(`(() => { const w = ${FIND(id)}; app.wm.toggleMaximize(w.id); return true; })()`);
  else if (a === 'restore') await P.evalJs(`(() => { const w = ${FIND(id)}; if (w.isMaximized) app.wm.toggleMaximize(w.id); return true; })()`);
  else if (a === 'w700') {
    await P.evalJs('app.wm.setGrid(null); true');
    // 700 LAYOUT px = 700 × the UI scale on screen, by the handle a person would use: the right one, or the LEFT one
    // when growing to the right would take the pointer past the screen (a window in the bottom-right cell)
    const m = await P.evalJs(MEAS(id)); const dw = 700 * ui - m.win.w;
    const useW = m.win.r + dw > VW - 2;
    const h = m.handles.find((x) => x.d === (useW ? 'w' : 'e'));
    const x0 = h.x + h.w / 2 + (useW ? 1 : -1), y0 = h.y + h.h / 2;
    await drag(x0, y0, x0 + (useW ? -dw : dw), y0, 16);
  }
  // the pointer leaves the window (onto the sidebar): a seamless app's bars revealed by a hover at its top edge fold
  // again inside the settle below (the 1.5 s linger) and never cover the picture the pixel judge reads
  await mouse('mouseMoved', 60, Math.round(VH / 2));
  await sleep(700);
}
const ensureActive = async (id) => {
  const seat = () => P.evalJs(`(() => { const w = ${FIND(id)}; if (!w) return null; const s = w._desktopSeats || {}; return { known: !!s.known, active: s.active, pane: w._desktopPaneKey }; })()`);
  const s = await until(async () => { const v = await seat(); return v && v.known ? v : null; }, 10000, 250);
  if (s && s.active === s.pane) return true;
  await P.evalJs(`(() => { const w = ${FIND(id)}; const b = w && w.content.querySelector('.desktop-app-resume'); if (b) b.click(); return true; })()`);
  return !!(await until(async () => { const v = await seat(); return v && v.active === v.pane ? v : null; }, 10000, 250));
};

/** ONE configuration: a page at (dpr, uiScale), the app launched from it, the acts, each state measured + judged */
async function runConfig(origin, { app, dpr, ui, acts = ACTS, label }) {
  if (label !== 'CONTROL' && dpr === 2 && ui === 1 && acts === ACTS) acts = [...ACTS, ...FLOWS]; // r2: the verifier's flows at the owner's DPR / UI
  const tag = `${label} ${app === 'chromium' ? 'Chrome' : 'Calculator'} DPR ${dpr} UI ${Math.round(ui * 100)} %`;
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: dpr, mobile: false });
  await P.cdp('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await P.cdp('Page.navigate', { url: `${origin}/` }); await sleep(800);
  await P.evalJs(ui !== 1 ? `localStorage.setItem('vibespace.uiScale', '${Math.round(ui * 100)}'); true` : `localStorage.removeItem('vibespace.uiScale'); true`);
  await P.cdp('Page.reload'); await sleep(1500);
  await P.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app")); setTimeout(w, 200); })(); })');
  await until(() => P.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250);
  await P.evalJs('app.sidebar.isOpen || app.sidebar.toggle(true); true'); await sleep(800);
  const facts = await P.evalJs(`({ dpr: devicePixelRatio, ui: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1, ws: (() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, ow: document.getElementById('workspace').offsetWidth, oh: document.getElementById('workspace').offsetHeight }; })(), sidebar: (document.getElementById('sidebar') || {}).offsetWidth || 0 })`);
  const launch = await P.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: ${JSON.stringify(app)}, dpr: devicePixelRatio, uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1 }) }).then((r) => r.json())`);
  const id = launch && launch.id;
  const rows = [];
  if (!id) { check(`${tag}: launches`, false, launch); return { tag, rows, facts }; }
  try {
    const rec = await until(async () => { const r = await (await fetch(`${origin}/api/desktop/apps/${id}`)).json(); return r.state === 'ready' || r.state === 'exited' ? r : null; }, 45000);
    if (!rec || rec.state !== 'ready') { check(`${tag}: reaches ready`, false, rec); return { tag, rows, facts }; }
    await P.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
    await ensureActive(id);
    const conn = await until(async () => { const m = await P.evalJs(MEAS(id)); return m && m.status === 'Connected' && m.main && m.main.h > 50 ? m : null; }, 45000, 300);
    if (!conn) { check(`${tag}: connects`, false, await P.evalJs(MEAS(id))); return { tag, rows, facts }; }
    await sleep(app === 'chromium' ? 5000 : 2000); // Chrome's startup windows
    console.log(`  ${tag}: record scale ${rec.scale} dpi ${rec.dpi}${rec.gdkScale != null ? ` gdk ${rec.gdkScale} picture ${rec.pictureScale}` : ''}; workspace ${facts.ws.w.toFixed(1)}×${facts.ws.h.toFixed(1)} CSS (layout ${facts.ws.ow}×${facts.ws.oh}), sidebar ${facts.sidebar}`);
    for (const a of acts) {
      await act(id, app, a, facts.ws, facts.ui, dpr);
      const m0 = await settle(id);
      await sleep(600); // the repaint
      const m = await P.evalJs(MEAS(id));
      // the rendered-pixel judge; a strip found below PIX_MIN while nothing is off screen / past the workspace is judged
      // again (≤ 2 more screenshots, 700 ms apart): the app repainting between the screenshot and the backing read (a
      // Chrome page animating in) is a race of the instrument, never a verdict on the placement
      let shot = null, px = null;
      for (let k = 0; k < 3; k++) {
        if (k) await sleep(700);
        shot = await P.cdp('Page.captureScreenshot', { format: 'png' });
        px = await P.evalJs(PIXJ(id, shot.data));
        if (!px || px.none || px.right.off || px.bottom.off || px.right.clipped || px.bottom.clipped || (px.right.frac >= PIX_MIN && px.bottom.frac >= PIX_MIN)) break;
      }
      if (process.env.SNAP_SHOTS) { const d = path.join(process.env.SNAP_SHOTS, tag.replace(/[^A-Za-z0-9]+/g, '-')); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${a}.png`), Buffer.from(shot.data, 'base64')); const cvp = await P.evalJs(`(() => { const w = ${FIND(id)}; const v = w._desktopAppView; const c = v.client; const cv = c && c.mainWid && v.pane.querySelector('.xpra-win[data-wid="' + c.mainWid + '"] canvas'); return cv ? cv.toDataURL('image/png').split(',')[1] : null; })()`); if (cvp) fs.writeFileSync(path.join(d, `${a}-canvas.png`), Buffer.from(cvp, 'base64')); } // SNAP_SHOTS=<dir>: each state's viewport + the main canvas backing, for a person to look at
      // our own ✕ and Paste: a seamless window's bars are folded — reveal them the way a person does (a 250 ms hover of
      // the window's top edge), read them, then leave onto the sidebar (the window-leave folds them at once)
      let bars = await P.evalJs(BARS(id));
      if (bars.folded) {
        const hx = m.win.x + m.win.w / 2, hy = m.win.y + 2;
        await mouse('mouseMoved', hx, hy); await sleep(350); await mouse('mouseMoved', hx + 3, hy + 1);
        bars = (await until(async () => { const b = await P.evalJs(BARS(id)); return b && !b.folded ? b : null; }, 3000, 100)) || await P.evalJs(BARS(id));
        await mouse('mouseMoved', 60, Math.round(VH / 2)); await sleep(200);
      }
      const dev = (v) => Math.round(v * m.ratio * 100) / 100;
      const row = {
        a, win: m.win, pane: m.pane, ws: m.ws, main: m.main, px,
        wsHidR: +(m.win.r - m.ws.r).toFixed(2), wsHidB: +(m.win.b - m.ws.b).toFixed(2),
        // the picture past the pane or the workspace, CSS px (+ the same in the app's own X px for the log)
        picHidR: m.mainEl ? +Math.max(0, m.mainEl.r - Math.min(m.pane.r, m.ws.r)).toFixed(2) : null, picHidB: m.mainEl ? +Math.max(0, m.mainEl.b - Math.min(m.pane.b, m.ws.b)).toFixed(2) : null,
        ratio: m.ratio, dpr,
        // the picture past the WORKSPACE, device px (the verifier's measure: 842 on the pre-r2 minrestore)
        devHid: m.mainEl ? +(Math.max(0, m.mainEl.r - m.ws.r) * dpr).toFixed(1) : null,
        bars, settled: !!m0,
      };
      rows.push(row);
    }
  } finally {
    await fetch(`${origin}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    await P.evalJs(`(() => { const w = ${FIND(id)}; if (w) app.wm.closeWindow(w.id); return true; })()`).catch(() => {});
    await sleep(1500);
  }
  return { tag, rows, facts };
}
const fmt = (r) => `${r.a}: window ${r.win.x.toFixed(1)},${r.win.y.toFixed(1)} ${r.win.w.toFixed(1)}×${r.win.h.toFixed(1)} (min ${r.win.minW}×${r.win.minH}${r.win.max ? ', max' : ''}) ws right ${r.ws.r.toFixed(1)} bottom ${r.ws.b.toFixed(1)}; hidden by the workspace R/B ${Math.max(0, r.wsHidR)}/${Math.max(0, r.wsHidB)} CSS; picture hidden R/B ${r.picHidR}/${r.picHidB} CSS (${r.picHidR == null ? '-' : +(r.picHidR * r.ratio).toFixed(1)}/${r.picHidB == null ? '-' : +(r.picHidB * r.ratio).toFixed(1)} X px); pixels right ${r.px.right ? `${r.px.right.ok}/${r.px.right.n} (off ${r.px.right.off}, clipped ${r.px.right.clipped})` : '-'} bottom ${r.px.bottom ? `${r.px.bottom.ok}/${r.px.bottom.n} (off ${r.px.bottom.off}, clipped ${r.px.bottom.clipped})` : '-'}${r.px.one ? '' : ' (resampled)'}; our ✕ ${r.bars && r.bars.close ? `${r.bars.close.r},${r.bars.close.b}${r.bars.close.hits ? '' : ' NOT HIT'}` : '-'}, Paste ${r.bars && r.bars.paste ? `${r.bars.paste.r},${r.bars.paste.b}${r.bars.paste.hits ? '' : ' NOT HIT'}` : '-'}${r.bars && r.bars.seamless ? ' (revealed)' : ''}`;
/** a state passes when nothing of the window / picture is past the workspace and the rendered pixels are there —
 *  `faults(r)` names every clause a state breaks (empty = clean), so a red line says WHICH */
const faults = (r) => {
  const f = [];
  const px = r.px || {};
  if (!(r.wsHidR <= 0.5)) f.push(`window past the workspace right by ${r.wsHidR} CSS`);
  if (!(r.wsHidB <= 0.5)) f.push(`window past the workspace bottom by ${r.wsHidB} CSS`);
  if (r.picHidR == null || !(r.picHidR <= 1) || !(r.picHidB <= 1)) f.push(`picture hidden R/B ${r.picHidR}/${r.picHidB} CSS`);
  if (!r.px || px.none) f.push('no picture canvas');
  else {
    if (!(px.overR <= 1.01) || !(px.overB <= 1.01)) f.push(`picture past the screen / workspace by ${px.overR}/${px.overB} device px`);
    for (const k of ['right', 'bottom']) { const q = px[k]; if (q.off || q.clipped) f.push(`${k} strip: ${q.off} off screen, ${q.clipped} past the workspace`); if (!(q.frac >= PIX_MIN)) f.push(`${k} strip: ${(100 * q.frac).toFixed(1)} % of ${q.n} pixels found on screen`); }
  }
  const bars = r.bars || {};
  if (bars.folded) f.push('our bars never revealed (the top-edge hover)');
  else for (const [k, b] of [['our ✕', bars.close], ['Paste', bars.paste]]) if (!b || !(b.r <= r.ws.r + 0.5 && b.b <= r.ws.b + 0.5 && b.hits)) f.push(`${k} not on screen / not hit: ${JSON.stringify(b)}`);
  return f;
};
const clean = (r) => !faults(r).length;
/** the share of the strips' pixels that must be FOUND at their place: a picture cut or covered reads 0–50 % (measured on
 *  the control: 0 / 23160 off screen, the taskbar under a cut keypad), a whole one ≥ 99 % on the grid and 85–95 % when the
 *  compositor resamples it half a pixel off the grid (every text / icon edge soft) */
const PIX_MIN = 0.8;

// a DEVELOPER's narrowing only (never set by the gate): SNAP_ONLY=chromium-2-1,gnome-calculator-2-1.25 runs those cells,
// SNAP_CONTROL=0 skips the control copy — a narrowed run says so in its last line and exits 1 (never a green gate)
const ONLY = (process.env.SNAP_ONLY || '').split(',').filter(Boolean), NO_CONTROL = process.env.SNAP_CONTROL === '0';
const MATRIX = [];
for (const app of ['chromium', 'gnome-calculator']) for (const dpr of [2, 1]) for (const ui of [1, 1.25]) if (!ONLY.length || ONLY.includes(`${app}-${dpr}-${ui}`)) MATRIX.push({ app, dpr, ui });
const appAbsent = (app) => (app === 'gnome-calculator' && !CALC ? 'gnome-calculator not on PATH' : null);
try {
  const av = await (await fetch(`${S.origin}/api/desktop/apps`)).json();
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);
  for (const cfg of MATRIX) {
    const why = appAbsent(cfg.app);
    const name = `${cfg.app === 'chromium' ? 'Chrome' : 'Calculator'} DPR ${cfg.dpr} UI ${Math.round(cfg.ui * 100)} %`;
    if (why) { skip(name, why); continue; }
    const t0 = Date.now();
    let res;
    try { res = await runConfig(S.origin, { ...cfg, label: 'ours' }); } catch (e) { check(`${name}: the configuration runs`, false, e.stack || e.message); continue; }
    for (const r of res.rows) console.log(`    ${fmt(r)}`);
    const want = cfg.dpr === 2 && cfg.ui === 1 ? [...ACTS, ...FLOWS] : ACTS;
    if (res.rows.length === want.length) {
      if (cfg.app === 'chromium' && cfg.dpr === 2 && cfg.ui === 1) {
        const o = res.rows.find((r) => r.a === 'grid13');
        check(`THE OWNER'S CASE (inc-muhmqvzf-jodk): Chrome at DPR 2 / UI 100 % on a 1920×963 page with the sidebar at ${SIDEBAR}, snapped into the right third of a 1×3 grid — the window ends at ${o.win.r.toFixed(1)} ≤ the workspace's ${o.ws.r.toFixed(1)}, 0 px of the picture outside the pane or the workspace (R ${o.picHidR} / B ${o.picHidB} CSS), the picture's last 40 device columns FOUND on screen (${o.px.right.ok}/${o.px.right.n}) — Chrome's own ⋮ and ✕ there`, clean(o) && o.picHidR === 0 && o.picHidB === 0, { faults: faults(o), row: fmt(o) });
      }
      if (want.length > ACTS.length) {
        // r2 — THE VERIFIER'S FLOWS, each its own line: a box the window manager kept ITSELF through a minimize / a maximize
        // while the sidebar opened, the cascade through the captured fractions, the phone round trip on whole layout px
        const row = (a) => res.rows.find((r) => r.a === a);
        const w0 = row('sb0grid13'), mr = row('minrestore'), mx = row('maxsb'), wd = row('widen'), nr = row('narrow'), ph = row('phone');
        check(`r2 FLOW (a): ${name} — the sidebar CLOSED, the right third of 1×3 (window ${w0.win.x.toFixed(0)}–${w0.win.r.toFixed(0)} on a workspace ending at ${w0.ws.r.toFixed(0)}) → minimize → the sidebar opens → restore: the window ends at ${mr.win.r.toFixed(1)} ≤ ${mr.ws.r.toFixed(1)}, ${mr.devHid} device px of the picture past the workspace (pre-r2: 842)`, clean(mr) && mr.devHid === 0 && mr.wsHidR <= 0.5, { faults: faults(mr), row: fmt(mr) });
        check(`r2 FLOW (b): ${name} — the same drop → maximize → the sidebar opens → un-maximize: the window ends at ${mx.win.r.toFixed(1)} ≤ ${mx.ws.r.toFixed(1)}, ${mx.devHid} device px of the picture past the workspace (pre-r2: 842)`, clean(mx) && mx.devHid === 0 && mx.wsHidR <= 0.5, { faults: faults(mx), row: fmt(mx) });
        check(`r2 THE CASCADE: ${name} — the sidebar closed again (${wd.win.x.toFixed(0)}–${wd.win.r.toFixed(0)} ≤ ${wd.ws.r.toFixed(0)}, ${wd.devHid} device px) and opened again (${nr.win.x.toFixed(0)}–${nr.win.r.toFixed(0)} ≤ ${nr.ws.r.toFixed(0)}, ${nr.devHid} device px) — the captured fractions never hang (pre-r2: 1090 on the widening, 842 on the narrowing)`, clean(wd) && clean(nr) && wd.devHid === 0 && nr.devHid === 0, { widen: fmt(wd), narrow: fmt(nr), faults: [...faults(wd), ...faults(nr)] });
        check(`r2 WHOLE PX: ${name} — a phone viewport (390×844) and back: the window on whole layout px (${ph.win.style.join(' ')}), the picture EXACTLY 0 past its pane (R ${ph.picHidR} / B ${ph.picHidB} CSS; the verifier's pre-r2 0.55 / 0.47 — 727.03px-class fractions)`, clean(ph) && ph.picHidR === 0 && ph.picHidB === 0 && ph.win.style.every((v) => /^-?\d+px$/.test(v)), { faults: faults(ph), row: fmt(ph), style: ph.win.style });
      }
      const bad = res.rows.filter((r) => !clean(r));
      check(`${name}: every act (${want.join(', ')}) leaves the window, the pane and the picture inside the workspace, the picture's right / bottom edge pixels on screen (${((Date.now() - t0) / 1000).toFixed(0)} s)${bad.length ? ` — not clean: ${bad.map((r) => r.a).join(', ')}` : ''}`, !bad.length, bad.map((r) => `${r.a}: ${faults(r).join('; ')}`));
    } else check(`${name}: every act measured (${res.rows.length} of ${want.length})`, false, P.logs.slice(-8));
  }

  // ── CONTROL: the pre-fix placement (the zone written as given, the default cascade as it falls), bundle rebuilt ──
  if (NO_CONTROL) throw Object.assign(new Error('SNAP_CONTROL=0'), { narrowed: true });
  const wtc = mkTree('deskapp-snap-ctl');
  const levers = [
    ['src/lib/window.js', '    const box = ws && !this._mobileLayout() ? zoneBox(zone, this._ownMinOf(win), ws, gap) : { ...zone };', '    const box = { ...zone }; // pre-fix CONTROL: the zone as given'],
    ['src/lib/window.js', '    if (!ws) return box;', '    return box; // pre-fix CONTROL: the cascade as it falls'],
    // r2: the tree before the verifier's MAJOR + lows (the same five levers test-window-minsize §4b pulls)
    ['src/lib/window.js', '      if (win.gridBounds && !win.isMaximized) this._applyGridBounds(win);', '      if (win.gridBounds && !win.isMinimized && !win.isMaximized) this._applyGridBounds(win); // pre-fix CONTROL'],
    ['src/lib/window.js', '        box = rescaleBox(box, p.ws, this._workspaceBox());', '        // pre-fix CONTROL: the stale px'],
    ['src/lib/window.js', '    const b = this._layoutBoxOf(win.element);', '    const b = { left: win.element.offsetLeft, top: win.element.offsetTop, width: win.element.offsetWidth, height: win.element.offsetHeight }; // pre-fix CONTROL'],
    ['src/lib/window.js', '    this._placeWindow(win, wholePx({ left: b.left * r.width, top: b.top * r.height, width: b.width * r.width, height: b.height * r.height }), 4);', '    this._placeWindow(win, { left: b.left * r.width, top: b.top * r.height, width: b.width * r.width, height: b.height * r.height }, 4); // pre-fix CONTROL'],
    ['src/lib/window.js', '    const full = minOf(win), local = full.w > min.w || full.h > min.h;', '    const local = false; // pre-fix CONTROL'],
  ];
  let once = true;
  for (const [f, from, to] of levers) { const src = fs.readFileSync(path.join(wtc, f), 'utf8'); if (src.split(from).length !== 2) { once = false; console.error(`    lever not spelled once in ${f}: ${from.slice(0, 80)}`); } fs.writeFileSync(path.join(wtc, f), src.replace(from, to)); }
  check('CONTROL: each placement lever (r1 + r2) is spelled exactly once in window.js (the copy pulls back exactly those)', once);
  execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
  const C = await bootServer(wtc, 'deskapp-snap-ctl-home');
  check('CONTROL: the pre-fix copy boots', C.up);
  if (C.up) {
    const o = await runConfig(C.origin, { app: 'chromium', dpr: 2, ui: 1, acts: ['rest', 'grid13', 'sb0grid13', 'minrestore', 'sb0grid13b', 'maxsb', 'widen', 'narrow'], label: 'CONTROL' });
    for (const r of o.rows) console.log(`    ${fmt(r)}`);
    const g = o.rows.find((r) => r.a === 'grid13');
    const cm = o.rows.find((r) => r.a === 'minrestore'), cx = o.rows.find((r) => r.a === 'maxsb'), cw = o.rows.find((r) => r.a === 'widen'), cn = o.rows.find((r) => r.a === 'narrow');
    check(`CONTROL (r2): on the pre-r2 copy the verifier's flows hang past the workspace — minrestore ${cm && cm.devHid} device px of the picture past it, maxsb ${cx && cx.devHid}, and the cascade: the widening ${cw && cw.devHid}, the narrowing again ${cn && cn.devHid} — the flow lines above can fail`, !!cm && !!cx && !!cw && !!cn && !clean(cm) && cm.devHid > 100 && !clean(cx) && cx.devHid > 100 && !clean(cw) && cw.devHid > 100 && !clean(cn) && cn.devHid > 100, { minrestore: cm && fmt(cm), maxsb: cx && fmt(cx), widen: cw && fmt(cw), narrow: cn && fmt(cn) });
    check(`CONTROL: on the pre-fix copy the owner's case hangs past the workspace — the window ends at ${g && g.win.r.toFixed(1)} > ${g && g.ws.r.toFixed(1)}, ${g && g.picHidR} CSS px of the picture hidden, its last columns NOT on screen (${g && g.px.right ? `${g.px.right.ok}/${g.px.right.n}, off ${g.px.right.off}` : '?'}) — the owner's screenshot; the judge above can fail`, !!g && !clean(g) && g.wsHidR > 5 && g.picHidR > 5 && g.px.right.off > 0, g && fmt(g));
    if (CALC) {
      const c = await runConfig(C.origin, { app: 'gnome-calculator', dpr: 2, ui: 1, acts: ['rest', 'bottom'], label: 'CONTROL' });
      for (const r of c.rows) console.log(`    ${fmt(r)}`);
      const b = c.rows.find((r) => r.a === 'bottom');
      check(`CONTROL: …the calculator (minimum 618 CSS high) dragged to the bottom half is cut at the bottom — ${b && b.picHidB} CSS px of the keypad hidden, its last rows not in the workspace (${b && b.px.bottom ? `${b.px.bottom.ok}/${b.px.bottom.n}, clipped ${b.px.bottom.clipped}` : '?'})`, !!b && !clean(b) && b.wsHidB > 5, b && fmt(b));
      const u = await runConfig(C.origin, { app: 'gnome-calculator', dpr: 2, ui: 1.25, acts: ['rest'], label: 'CONTROL' });
      for (const r of u.rows) console.log(`    ${fmt(r)}`);
      const rr = u.rows.find((r) => r.a === 'rest');
      check(`CONTROL: …and at UI 125 % the default cascade (70 + 620 on a 685.6 px workspace) is cut at rest — ${rr && rr.picHidB} CSS px hidden`, !!rr && !clean(rr) && rr.wsHidB > 1, rr && fmt(rr));
    } else skip('the calculator CONTROL legs', 'gnome-calculator not on PATH');
  }
} catch (e) { if (e && e.narrowed) console.log('  (the control copy skipped: SNAP_CONTROL=0)'); else { failed++; console.error('  ✗ threw:', e.stack || e.message); console.error('  server log tail:', S.log.join('').split('\n').filter((l) => /desktop|xpra|error/i.test(l)).slice(-15).join('\n  ')); } }
finally { P.close(); }
const narrowed = ONLY.length || NO_CONTROL;
console.log(failed ? `\n${failed} FAILED${skipped ? ` (${skipped} skipped)` : ''}` : narrowed ? `\nNARROWED RUN (SNAP_ONLY / SNAP_CONTROL) — its checks passed, but a narrowed run is never a verdict` : `\ndesktop-app snap test passed${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed || narrowed ? 1 : 0);
