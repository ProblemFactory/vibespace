#!/usr/bin/env node
// THE vnc-display RUNG FITS THE WINDOW TOO (docs/design-desktop-apps.zh.md §7
// P8-2 chunk x4, 2026-09-22; owner: "就算是vnc也不能这样啊，完全无法做自动贴合，
// 尺寸匹配吗？"): headless chrome against a worktree server with the REAL Xvnc
// (TigerVNC) + a real xterm. (1) FOLLOWS: the app is launched, its window
// opened, the status chip says Connected; the noVNC canvas IS the framebuffer
// and the framebuffer IS the app's top-level (0,0 × fb — GET …/windows with
// depth); the VibeSpace window is resized TWICE by its own element (noVNC's
// ResizeObserver asks the server for the pane's size; Xvnc honours it; the
// keeper fits the app) and each time, within 2 s, the framebuffer equals the
// pane and the app's rect equals the framebuffer; the pixels OUTSIDE the app's
// rect on the canvas are counted (zero, printed) and the black share of the
// canvas is printed (an xterm on white; a black root would read ~100 %). The
// title bar names the APP WINDOW (X's own title, quotes and <b> as text), not
// the launch label. (1b) UNDER THE UI SCALE (vibespace.uiScale 125): a third
// size — the framebuffer is the ON-SCREEN pane, the canvas at net zoom 1, a
// pointer at canvas (x, y) lands on X (x, y) (xdotool getmouselocation).
// (2) FIXED: the same server rebooted on a PATH WITHOUT Xvnc/Xtigervnc (a dir of
// symlinks to every other binary) ⇒ the Xvfb+x11vnc spelling ⇒ the chip reads
// "fixed 1280x800 (Xvfb) — install tigervnc for a window that follows" and
// the app is fitted to the fixed 1280x800 all the same. SKIPs with evidence
// without chrome / Xvnc / Xvfb+x11vnc / xterm / xdotool. Worktree-only, scratch
// HOME, VIBESPACE_SKIP_AGENT_HOOKS=1, free ports, per-pid names, the exit
// sweep reaps by the session MARKER (the keeper's own belt).
// Run: node scripts/test-desktop-vnc-fit.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const facts = await D.hostFacts({});
const XTERM = D.binOnPath('xterm', { env: process.env });
const skipWhy = !CHROME ? 'no chrome/chromium' : !facts.bins.Xvnc ? 'Xvnc not on PATH (tigervnc-standalone-server)' : !XTERM ? 'xterm not on PATH' : !facts.bins.xdotool ? 'xdotool not on PATH' : !facts.bins.xdpyinfo ? 'xdpyinfo not on PATH' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const FIXED_POSSIBLE = !!(facts.bins.Xvfb && facts.bins.x11vnc);
// the app window's OWN title — quotes and angle brackets (it must reach the title bar as TEXT); allowTitleOps false: the shell inside may not rewrite it
const APP_TITLE = 'vs-fit "q" <b>x</b>';

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('deskfit-smoke');
const home = scratchHome('deskfit-home', fs);
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// the pin: xpra wins the default ladder when installed — this suite drives the vnc-display rung (a reorder, nothing falls)
fs.writeFileSync(path.join(wt, 'data', 'settings.json'), JSON.stringify({ 'desktop.backendPrefs': 'vnc-display, xpra, desktop-singleton' }));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// a PATH with NO Xvnc/Xtigervnc: every other executable of the real PATH symlinked into one dir (the FIXED leg's knob — a test-only environment, never a setting)
const noVncBin = scratch('deskfit-novnc-bin');
fs.mkdirSync(noVncBin, { recursive: true });
const HIDDEN = new Set(['Xvnc', 'Xtigervnc']);
for (const dir of (process.env.PATH || '').split(':')) {
  let ents = []; try { ents = fs.readdirSync(dir); } catch { continue; }
  for (const name of ents) { if (HIDDEN.has(name)) continue; const dst = path.join(noVncBin, name); if (fs.existsSync(dst)) continue; try { const st = fs.statSync(path.join(dir, name)); if (st.isFile() && (st.mode & 0o111)) fs.symlinkSync(path.join(dir, name), dst); } catch {} }
}

const srvEnv = (extra = {}) => ({ ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', ...extra });
let srv = null;
const SERVER_LOG = path.join(home, 'server.log'); // the server's own words are the evidence a red leg prints
const bootServer = (extraEnv = {}) => { const fd = fs.openSync(SERVER_LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv(extraEnv), stdio: ['ignore', fd, fd] }); fs.closeSync(fd); return srv; };
const serverLines = (re) => { try { return fs.readFileSync(SERVER_LOG, 'utf8').split('\n').filter((l) => re.test(l)).slice(-8); } catch { return []; } };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskfit-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const storeIds = () => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps); } catch { return []; } };
const recordedPids = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps).flatMap((a) => Object.values(a.pids || {})).filter(Boolean); } catch { return []; } };
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
  // the keeper's own belt: whatever still carries THIS worktree's session markers (an Xvnc/xterm a failed leg left)
  try { for (const [, pids] of D.markerCensus('VIBESPACE_DESKTOP_APP', storeIds())) for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch {} } } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [scratch('deskfit-chrome'), noVncBin, home]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('worktree server boots', await waitServer());
const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
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
const openPage = async (p) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await p.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(1500); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })'); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };

// the window's own geometry as the page computes it, plus the canvas measured: size, the black share, and the pixels OUTSIDE a rect
const MEASURE = (appId, rect) => `(() => {
  const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null;
  const mount = w.content.querySelector('.desktop-app-mount'); const mr = mount.getBoundingClientRect();
  const c = mount.querySelector('canvas'); if (!c) return { mount: { w: mr.width, h: mr.height }, canvas: null };
  const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let black = 0, n = 0, outside = 0, outsideBlack = 0; const R = ${JSON.stringify(rect || null)};
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; n++; const isBlack = d[i] + d[i + 1] + d[i + 2] < 30; if (isBlack) black++; if (R && !(x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h)) { outside++; if (isBlack) outsideBlack++; } }
  return { win: { w: w.element.offsetWidth, h: w.element.offsetHeight }, mount: { w: Math.round(mr.width), h: Math.round(mr.height) }, canvas: { w: c.width, h: c.height }, sampled: n, blackFrac: black / n, outsideSampled: outside, outsideBlack, status: w.content.querySelector('.desktop-status')?.textContent, chip: w.content.querySelector('.desktop-app-chip-backend')?.textContent, fitChip: w.content.querySelector('.desktop-app-chip-fit')?.textContent, fitChipShown: getComputedStyle(w.content.querySelector('.desktop-app-chip-fit')).display !== 'none', title: w.title, titleText: w.titleSpan ? w.titleSpan.textContent : null, titleElems: w.titleSpan ? w.titleSpan.querySelectorAll('*').length : -1 };
})()`;
const topLevel = async (appId) => { const r = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${appId}/windows`)).json(); return (r.windows || []).filter((w) => w.depth === 1 && w.mapped !== false && w.w > 1 && w.h > 1).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
const record = async (appId) => (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${appId}`)).json();

let p1 = await page(target);
try {
  await openPage(p1);
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check('server: vnc-display via Xvnc (pinned first — nothing fell)', av.availability?.backend === 'vnc-display' && av.availability?.via === 'Xvnc' && av.availability?.fallbackWhy === null, av.availability);

  // ── §1 FOLLOWS ──
  console.log('§1 the app fills the pane and FOLLOWS two resizes of the VibeSpace window (real Xvnc + xterm)');
  const launched = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exec: ${JSON.stringify(XTERM)}, args: ['-geometry', '80x24', '-bg', 'white', '-fg', 'black', '-T', ${JSON.stringify(APP_TITLE)}, '-xrm', 'XTerm*allowTitleOps: false'], label: 'xterm' }) }).then((r) => r.json())`);
  check('launch answers a launching record on vnc-display via Xvnc with fitMode follows', launched && !launched.error && launched.via === 'Xvnc' && launched.fitMode === 'follows', launched);
  const appId = launched.id;
  await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
  const rec1 = await until(async () => { const r = await record(appId); return r.state === 'ready' && r.fit && r.fit.ok ? r : null; }, 25000);
  check(`the record is ready and FITTED (fit.why ${rec1 && rec1.fit.why}, fb ${rec1 && `${rec1.fb.w}x${rec1.fb.h}`})`, !!rec1, rec1 && rec1.lastError);
  const connected = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const s = w?.content.querySelector('.desktop-status'); return s && s.textContent === 'Connected' ? true : null; })()`), 20000);
  check('the status chip says Connected', !!connected);
  // noVNC asks the display to be the pane's size on connect (resizeSession) — the keeper follows; settle, then measure
  const settle = async (label) => {
    const t0 = Date.now();
    const r = await until(async () => {
      const m = await p1.evalJs(MEASURE(appId, null)); if (!m || !m.canvas) return null;
      const rec = await record(appId); if (!rec.fb || rec.fb.w !== m.canvas.w || rec.fb.h !== m.canvas.h) return null;
      if (Math.abs(m.mount.w - rec.fb.w) > 2 || Math.abs(m.mount.h - rec.fb.h) > 2) return null;
      const top = await topLevel(appId); if (!top || top.w !== rec.fb.w || top.h !== rec.fb.h || top.x !== 0 || top.y !== 0) return null;
      if (!rec.fit || !rec.fit.ok || rec.fit.w !== rec.fb.w || rec.fit.h !== rec.fb.h) return null;
      return { m: await p1.evalJs(MEASURE(appId, { x: 0, y: 0, w: top.w, h: top.h })), rec, top, ms: Date.now() - t0 };
    }, 8000, 150);
    if (!r) { const m = await p1.evalJs(MEASURE(appId, null)); const rec = await record(appId); const top = await topLevel(appId); return { ok: false, evidence: { m, fb: rec.fb, fit: rec.fit, top } }; }
    console.log(`    ${label}: window ${r.m.win.w}x${r.m.win.h}, pane ${r.m.mount.w}x${r.m.mount.h}, framebuffer ${r.rec.fb.w}x${r.rec.fb.h} = canvas ${r.m.canvas.w}x${r.m.canvas.h}, app window ${r.top.w}x${r.top.h}+${r.top.x}+${r.top.y}; pixels outside the app: ${r.m.outsideSampled} (black ${r.m.outsideBlack}); black share of the canvas ${(100 * r.m.blackFrac).toFixed(1)} %; settled in ${r.ms} ms (fit ${r.rec.fit.ms} ms, why "${r.rec.fit.why}")`);
    return { ok: true, ...r };
  };
  const s0 = await settle('after connect');
  check('after connect: framebuffer = pane = canvas, the app window = the framebuffer at 0,0, ZERO pixels outside the app, the canvas is not a black root', s0.ok && s0.m.outsideSampled === 0 && s0.m.blackFrac < 0.2, s0.ok ? { blackFrac: s0.m.blackFrac } : s0.evidence);
  check('the backend chip reads the plain rung, NO fit chip on a display that follows', s0.ok && s0.m.chip === 'vnc-display' && !s0.m.fitChipShown, s0.ok && { chip: s0.m.chip, fitChip: s0.m.fitChip });
  {
    // "窗口是第一位的感觉": the VibeSpace title bar names the APP WINDOW (X's own title, read by the keeper's fit enumeration), not the launch label — as TEXT
    const xTop = await topLevel(appId);
    const tm = await until(async () => { const m = await p1.evalJs(MEASURE(appId, null)); return m && m.title === APP_TITLE ? m : null; }, 8000, 200);
    const tl = tm || await p1.evalJs(MEASURE(appId, null));
    console.log(`    title bar: ${JSON.stringify(tl && tl.titleText)} (X says ${JSON.stringify(xTop && xTop.title)}; the launch label was "xterm"; elements inside the title: ${tl && tl.titleElems})`);
    check('the window title is the app window\'s OWN title (X\'s name, quotes and <b> kept as TEXT — zero elements in the title bar), not the launch label', !!tm && !!xTop && xTop.title === APP_TITLE && tm.titleText === APP_TITLE && tm.titleElems === 0, tl && { title: tl.title, titleText: tl.titleText, titleElems: tl.titleElems, x: xTop && xTop.title });
  }
  const RESIZES = [[900, 640], [1180, 760]];
  for (const [W, H] of RESIZES) {
    const before = (await record(appId)).fb;
    const t0 = Date.now();
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; return true; })()`);
    const followed = await until(async () => { const rec = await record(appId); return rec.fb && (rec.fb.w !== before.w || rec.fb.h !== before.h) ? rec : null; }, 6000, 100);
    const fbMs = Date.now() - t0;
    check(`resize to ${W}x${H}: the framebuffer CHANGED within 2 s (${followed && `${followed.fb.w}x${followed.fb.h}`} in ${fbMs} ms)`, !!followed && fbMs <= 2000, followed && followed.fb);
    const s = await settle(`after resize to ${W}x${H}`);
    check(`resize to ${W}x${H}: framebuffer = pane = canvas, the app window = the framebuffer, ZERO pixels outside the app (settled ${s.ok && s.ms} ms after the change was seen)`, s.ok && s.m.outsideSampled === 0 && s.m.blackFrac < 0.2 && s.m.win.w === W && s.m.win.h === H, s.ok ? undefined : s.evidence);
    check(`resize to ${W}x${H}: the fit's cause is the client's ask (why "${s.ok && s.rec.fit.why}")`, s.ok && /^client asked/.test(s.rec.fit.why));
  }
  // a second window of the same app (xterm's own child xterm) is nudged inside — driven at the X level: the keeper's plan on the next tick keeps it in the pane
  {
    const rec = await record(appId);
    const xenv = { PATH: process.env.PATH, DISPLAY: rec.display, XAUTHORITY: path.join(wt, 'data/desktop-apps', appId, 'Xauthority') };
    // matched by WM_CLASS (`-class`): the shell inside an xterm rewrites the TITLE from its prompt (the first run matched on the title and lost the window to the prompt); spawned from the scratch HOME
    const dlg = spawn(XTERM, ['-geometry', '40x10+2000+1500', '-class', 'VsFitDialog', '-T', 'vs-dialog'], { env: { ...xenv, HOME: home }, cwd: home, stdio: 'ignore', detached: true }); dlg.unref();
    let seen = null;
    const nudged = await until(async () => { const r = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${appId}/windows`)).json(); const d = (r.windows || []).find((w) => w.depth === 1 && w.cls === 'VsFitDialog'); const fb = (await record(appId)).fb; seen = { windows: (r.windows || []).filter((w) => w.depth === 1).map((w) => ({ id: w.id, cls: w.cls, rect: `${w.w}x${w.h}+${w.x}+${w.y}` })), fb, why: r.why }; return d && fb && d.x + d.w <= fb.w && d.y + d.h <= fb.h && d.x >= 0 && d.y >= 0 ? { d, fb } : null; }, 12000, 250);
    check(`a second top-level of the app placed off-screen by X (+2000+1500) is NUDGED inside the framebuffer by the belt, its size kept (${nudged && `${nudged.d.w}x${nudged.d.h}+${nudged.d.x}+${nudged.d.y} in ${nudged.fb.w}x${nudged.fb.h}`})`, !!nudged, nudged || { seen, dialogExit: dlg.exitCode, server: serverLines(/\[desktop\]/) });
    check('…and the main window was NOT touched by that nudge (still the whole framebuffer)', !!nudged && seen.windows.some((w) => w.rect === `${nudged.fb.w}x${nudged.fb.h}+0+0`), seen);
    try { dlg.kill('SIGKILL'); } catch {}
  }
  // ── §1b UNDER THE UI SCALE (owner acceptance 1: the window follows AT NET ZOOM 1 under the UI scale) ──
  // vibespace.uiScale 125 ⇒ body zoom 1.25; the picture shell counter-zooms its container, so the pane's own
  // px ARE screen px: noVNC must ask the display for the ON-SCREEN pane (not the layout px), the canvas must be
  // drawn 1:1 (never scaled by the zoom), and a pointer at canvas (x, y) must land on X (x, y).
  console.log('§1b the same app under vibespace.uiScale 125 (body zoom 1.25) at a THIRD window size: net zoom 1');
  {
    await p1.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
    await openPage(p1);
    check(`the page boots under the UI scale (body zoom ${await p1.evalJs('document.body.style.zoom')})`, await p1.evalJs(`document.body.style.zoom === '1.25'`));
    const hasWin = await p1.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)})`);
    if (!hasWin) await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
    const conn = await until(() => p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const s = w?.content.querySelector('.desktop-status'); return s && s.textContent === 'Connected' ? true : null; })()`), 20000);
    check(`the window is back under the UI scale and Connected (${hasWin ? 'layout replay' : 're-opened'})`, !!conn);
    const [W, H] = [640, 500]; // layout px ⇒ ~800×625 on screen at 1.25 — a size neither leg above used
    const before = (await record(appId)).fb;
    const t0 = Date.now();
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.left = '40px'; w.element.style.top = '20px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; return true; })()`);
    const followed = await until(async () => { const rec = await record(appId); return rec.fb && (rec.fb.w !== before.w || rec.fb.h !== before.h) ? rec : null; }, 6000, 100);
    const fbMs = Date.now() - t0;
    check(`UI scale: resize to ${W}x${H} layout px — the framebuffer CHANGED within 2 s (${followed && `${followed.fb.w}x${followed.fb.h}`} in ${fbMs} ms)`, !!followed && fbMs <= 2000, followed && followed.fb);
    const s = await settle(`under the UI scale, window ${W}x${H} layout px`);
    check(`UI scale: framebuffer = the ON-SCREEN pane (> 1.1 × the layout width) = canvas, the app window = the framebuffer, ZERO pixels outside the app`, s.ok && s.m.outsideSampled === 0 && s.m.blackFrac < 0.2 && s.m.win.w === W && s.m.win.h === H && s.rec.fb.w > W * 1.1, s.ok ? { fb: s.rec.fb, mount: s.m.mount } : s.evidence);
    const z = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const mount = w.content.querySelector('.desktop-app-mount'); const c = mount.querySelector('canvas'); const r = c.getBoundingClientRect(); const mr = mount.getBoundingClientRect(); return { canvas: { w: c.width, h: c.height }, onScreen: { x: r.left, y: r.top, w: r.width, h: r.height }, mount: { w: mr.width, h: mr.height, cw: mount.clientWidth, ch: mount.clientHeight }, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() }; })()`);
    console.log(`    UI scale ${z.uiScale}: pane ${z.mount.w.toFixed(1)}x${z.mount.h.toFixed(1)} on screen (clientWidth ${z.mount.cw}x${z.mount.ch}), canvas ${z.canvas.w}x${z.canvas.h} drawn on ${z.onScreen.w.toFixed(1)}x${z.onScreen.h.toFixed(1)} screen px`);
    check(`UI scale: the pane's own px ARE screen px (clientWidth ${z.mount.cw} == rect ${z.mount.w.toFixed(1)}) — the shell's counter-zoom`, z.uiScale === '1.25' && Math.abs(z.mount.cw - z.mount.w) <= 1 && Math.abs(z.mount.ch - z.mount.h) <= 1, z);
    check(`UI scale: the canvas sits at NET zoom 1 (${z.canvas.w}x${z.canvas.h} canvas px on ${z.onScreen.w.toFixed(1)}x${z.onScreen.h.toFixed(1)} screen px)`, Math.abs(z.canvas.w - z.onScreen.w) <= 1 && Math.abs(z.canvas.h - z.onScreen.h) <= 1, z);
    const rec = await record(appId);
    const xenv = { PATH: process.env.PATH, DISPLAY: rec.display, XAUTHORITY: path.join(wt, 'data/desktop-apps', appId, 'Xauthority') };
    for (const [px, py] of [[137, 91], [Math.round(z.canvas.w * 0.8), Math.round(z.canvas.h * 0.7)]]) {
      await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: z.onScreen.x + px, y: z.onScreen.y + py });
      const loc = await until(() => { try { const o = execSync('xdotool getmouselocation', { env: xenv, encoding: 'utf8', timeout: 4000 }); const m = /x:(\d+) y:(\d+)/.exec(o); if (!m) return null; const x = Number(m[1]), y = Number(m[2]); return Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1 ? { x, y } : null; } catch { return null; } }, 5000, 150);
      let last = null; try { last = execSync('xdotool getmouselocation', { env: xenv, encoding: 'utf8', timeout: 4000 }).trim(); } catch {}
      console.log(`    pointer at canvas (${px}, ${py}) screen px ⇒ X says ${last}`);
      check(`UI scale: a pointer at canvas (${px}, ${py}) lands on X (${px}, ${py}) — never scaled by the zoom`, !!loc, last);
    }
    await p1.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);
  }
  await p1.evalJs(`fetch('/api/desktop/apps/${appId}/stop', { method: 'POST' }).then((r) => r.json())`);
  await until(async () => { const r = await record(appId); return r.state === 'exited' || r.state === 'failed' ? r : null; }, 15000);
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (w) app.wm.closeWindow(w.id); return true; })()`);

  // ── §2 FIXED ──
  console.log('§2 the FIXED spelling (a PATH without Xvnc ⇒ Xvfb+x11vnc): the chip names the limit, the app is fitted to the fixed 1280x800');
  if (!FIXED_POSSIBLE) console.log(`  SKIP §2: Xvfb (${!!facts.bins.Xvfb}) + x11vnc (${!!facts.bins.x11vnc}) are needed for the fixed spelling`);
  else {
    srv.kill('SIGKILL'); await sleep(500);
    bootServer({ PATH: noVncBin });
    check('the server reboots on a PATH without Xvnc', await waitServer());
    await openPage(p1);
    const av2 = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
    check('the ladder now names vnc-display via Xvfb+x11vnc (Xvnc hidden from PATH — the test-only knob)', av2.availability?.backend === 'vnc-display' && av2.availability?.via === 'Xvfb+x11vnc', av2.availability);
    const l2 = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exec: ${JSON.stringify(XTERM)}, args: ['-geometry', '80x24', '-bg', 'white', '-fg', 'black', '-T', 'vs-fixed'], label: 'xterm' }) }).then((r) => r.json())`);
    check('launch: fitMode FIXED', l2 && !l2.error && l2.fitMode === 'fixed', l2);
    const id2 = l2.id;
    await p1.evalJs(`app.openDesktopApp(${JSON.stringify(id2)}); true`);
    const r2 = await until(async () => { const r = await record(id2); return r.state === 'ready' && r.fit && r.fit.ok ? r : null; }, 25000);
    check(`ready + fitted on the fixed display (fb ${r2 && `${r2.fb.w}x${r2.fb.h}`})`, !!r2 && r2.fb.w === 1280 && r2.fb.h === 800, r2 && r2.lastError);
    const top2 = r2 && await topLevel(id2);
    check(`the app's top-level is the whole fixed framebuffer (${top2 && `${top2.w}x${top2.h}+${top2.x}+${top2.y}`})`, !!top2 && top2.w === 1280 && top2.h === 800 && top2.x === 0 && top2.y === 0);
    const m2 = await until(async () => { const m = await p1.evalJs(MEASURE(id2, { x: 0, y: 0, w: 1280, h: 800 })); return m && m.status === 'Connected' && m.fitChipShown ? m : null; }, 20000);
    check(`the fit chip NAMES the limit: "${m2 && m2.fitChip}"`, !!m2 && m2.fitChip === 'fixed 1280x800 (Xvfb) — install tigervnc for a window that follows', m2 && { fitChip: m2.fitChip, shown: m2.fitChipShown });
    // "Connected" + the chip can precede x11vnc's first framebuffer update (it POLLS the Xvfb screen — a fresh
    // canvas is black until that update lands; 1 run in 3 measured it black at the Connected instant), so the
    // picture is waited for, bounded: a black ROOT never turns white and still fails here.
    const t2 = Date.now();
    const m2p = m2 && await until(async () => { const m = await p1.evalJs(MEASURE(id2, { x: 0, y: 0, w: 1280, h: 800 })); return m && m.canvas && m.blackFrac < 0.2 ? m : null; }, 10000);
    const m2l = m2p || (m2 && await p1.evalJs(MEASURE(id2, { x: 0, y: 0, w: 1280, h: 800 })));
    if (m2l) console.log(`    fixed display: canvas ${m2l.canvas && `${m2l.canvas.w}x${m2l.canvas.h}`}, black share ${Math.round(m2l.blackFrac * 1000) / 10} %, pixels outside the app ${m2l.outsideSampled}; first non-black picture ${m2p ? `${Date.now() - t2} ms after the Connected + chip reading` : 'NEVER within 10 s'}`);
    check('…and the picture is the app scaled into the pane (canvas 1280x800, the noVNC scale — not a black root)', !!m2p && m2p.canvas.w === 1280 && m2p.canvas.h === 800 && m2p.outsideSampled === 0 && m2p.blackFrac < 0.2, m2l && { canvas: m2l.canvas, blackFrac: m2l.blackFrac });
    // a resize of the VibeSpace window changes NOTHING on the fixed display (x11vnc offers no SetDesktopSize) — and the app stays fitted
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id2)}); w.element.style.width = '700px'; w.element.style.height = '500px'; return true; })()`);
    await sleep(2500);
    const r2b = await record(id2); const top2b = await topLevel(id2);
    check('after a window resize the fixed framebuffer is still 1280x800 and the app still fills it (the browser scales)', r2b.fb.w === 1280 && r2b.fb.h === 800 && top2b && top2b.w === 1280 && top2b.h === 800, { fb: r2b.fb, top: top2b });
    await p1.evalJs(`fetch('/api/desktop/apps/${id2}/stop', { method: 'POST' }).then((r) => r.json())`);
    await until(async () => { const r = await record(id2); return r.state === 'exited' || r.state === 'failed' ? r : null; }, 15000);
  }
} catch (e) {
  failed++; console.error('  ✗ suite threw:', e && e.stack || e);
} finally {
  try { p1?.close(); } catch {}
}
console.log(`${failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
