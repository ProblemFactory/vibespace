#!/usr/bin/env node
// A GROUPED TASKBAR BUTTON, END TO END (lane K, 2026-09-25; the owner, on a
// button reading "VibeSpace 主开发 · 2 windows grouped" whose every click popped a
// two-row chooser instead of doing anything: "这个体验比较差"). Headless chrome
// with a REAL mouse (the gear-menu suite's blink settings) on a throwaway
// worktree server, three File Explorer windows: A + B merged into a tab group
// (host A, B on show), C alone. Timings are read on the PAGE's clock (pointer
// stamps + a MutationObserver on the chooser), never a node sleep against the
// 300 ms intent.
//   (a) click, group BEHIND (C focused) ⇒ the host is focused + raised showing
//       its active tab, NO chooser (also not after the pointer rests there);
//   (b) click again (now in front) ⇒ the chooser, above the button, pinned (it
//       stays when the pointer leaves); a row ⇒ THAT tab on show + focused, the
//       chooser gone; Esc and a click elsewhere close it too;
//   (c) hover ≥ the intent ⇒ the chooser, non-modal (focus untouched), rows
//       highlight, the pointer crosses the gap onto it without closing it,
//       leaving both ⇒ gone after the grace; a 150 ms cross-over onto the
//       neighbour ⇒ never opens;
//   (d) a window title-bar DRAG passing over the button ⇒ never opens;
//   (e) touch taps (CDP touch emulation) ⇒ the first activates, no chooser; the
//       second (in front) is the chooser;
//   (f) keyboard: Enter on the focused button = the click rule, the chooser
//       opens with focus on the active row, ArrowDown + Enter switch the tab,
//       ArrowUp = the chooser while behind, Esc returns focus to the button;
//   (g) the SINGLE button is unchanged: no chooser on hover, click focuses,
//       click again minimizes, again restores;
//   (h) right-click = the window menu ("Close group");
//   (i) under a 125 % UI scale the chooser still sits on its button (placed in
//       layout px = viewport ÷ the scale);
//   (j) lane K verify r1 (2026-09-25; red on the lane's first cut): 30 hover
//       open → leave → close cycles with NO click leave the document's
//       press (pointerdown / pointerup / pointercancel since lane M's closer;
//       mousedown) and keydown listener counts where they were — the chooser's
//       one cleanup disposes createPopover's outside-press close (it was 3 → 33,
//       each stale listener holding its detached chooser);
//   (k)…(n) the verify-r1 LOWS (2026-09-25), each red on the r1-minor cut:
//   (k) a tab title change REBUILDS the button under an open chooser: the new
//       button says aria-expanded="true" and is the chooser's anchor, Esc hands
//       the focus to it (was: body), a click on it keeps the SAME chooser (was:
//       "a click elsewhere" ⇒ close + re-create);
//   (l) a PEN resting on the button opens the hover chooser (was: mouse only);
//   (m) right-click on a row of a HOVER chooser = that tab's window menu on top,
//       the chooser pinned beneath past the leave grace, and its Close closes
//       THAT tab (was: the browser's native menu);
//   (n) a persisted A+B chain after a reload is ONE grouped button with no
//       input at all (was: three single buttons until the first window event).
//   CONTROL: the same bundle rebuilt with the old always-chooser click (a
//   patched src/lib/taskbar-group.js in the SCRATCH worktree) ⇒ (a) fails.
//   CONTROL 2: the r1 disposer AND the four low fixes above reverted in the
//   scratch worktree and rebuilt ⇒ (j) +30, (k) focus on body, (l) no open,
//   (m) no menu, (n) three single buttons 2 s after the chain came back.
// Run: node scripts/test-taskbar-group-ui.mjs   (after `npm run build`; SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for the server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public/bundle.js'))) { console.error('  ✗ public/bundle.js missing — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('taskbar-group-smoke');
const PROFILE = scratch('taskbar-group-chrome');
const HOME = scratchHome('taskbar-group-home', fs);
const SHOTS = scratch('taskbar-group-shots'); // kept for the human look, swept by the gate's reaper
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, HOME, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
// a REAL mouse (headless linux chrome answers hover:none / pointer:none without these — test-gear-menu's measurement)
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [PROFILE, HOME]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const until = async (expr, { timeout = 2500, step = 25 } = {}) => { const t0 = Date.now(); for (;;) { const v = await evalJs(expr); if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const URL = `http://127.0.0.1:${PORT}/`;
const POLL_APP = 'new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })';
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
const VK = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27 };
const key = async (k) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await sleep(80); };
const shot = async (name, clip) => { const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); if (name) fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); return r.data; };
const CH = '.taskbar-group-chooser';
const rectOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`);
const click = async (pt, { button = 'left' } = {}) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button, buttons: button === 'left' ? 1 : 2, clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button, buttons: 0, clickCount: 1 }); await sleep(120); };
const PARK = { x: 700, y: 60 }; // the toolbar strip: never a taskbar button, never a window
const park = async () => { await mouse('mouseMoved', PARK.x, PARK.y); await sleep(60); };

// the page-side recorder: pointer stamps on the two buttons + chooser open/close stamps
const RECORDER = `(() => {
  const R = window.__tg = { opens: [], closes: [], enterG: 0, leaveG: 0, enterS: 0, leavePop: 0 };
  // DELEGATED (capture on the document): a tab switch REBUILDS the taskbar buttons, a listener on the old element goes deaf
  if (window.__tgCtl) window.__tgCtl.abort();
  window.__tgCtl = new AbortController();
  const isG = (e) => e.target.classList && e.target.classList.contains('taskbar-group');
  const isS = (e) => e.target.classList && e.target.classList.contains('taskbar-item') && e.target.dataset.winId === window.__ids.C;
  document.addEventListener('pointerenter', (e) => { if (isG(e)) { R.enterG = performance.now(); R.enterType = e.pointerType; } if (isS(e)) R.enterS = performance.now(); }, { capture: true, signal: window.__tgCtl.signal });
  document.addEventListener('pointerleave', (e) => { if (isG(e)) R.leaveG = performance.now(); }, { capture: true, signal: window.__tgCtl.signal });
  let was = !!document.querySelector('${CH}');
  if (window.__tgObs) window.__tgObs.disconnect();
  window.__tgObs = new MutationObserver(() => {
    const p = document.querySelector('${CH}');
    if (p && !was) { R.opens.push({ at: performance.now(), mode: p.dataset.mode }); p.addEventListener('pointerleave', () => { R.leavePop = performance.now(); }); }
    if (!p && was) R.closes.push(performance.now());
    was = !!p;
  });
  window.__tgObs.observe(document.body, { childList: true });
  return true;
})()`;
const FACTS = `(() => { const { A, B, C } = window.__ids; const w = (id) => app.wm.windows.get(id); const ch = w(A)._tabChain; const z = (id) => parseInt(w(id).element.style.zIndex) || 0;
  const p = document.querySelector('${CH}');
  return { active: app.wm.activeWindowId, chainActive: ch ? ch.active : null, chainTabs: ch ? ch.tabs : null, topIsA: z(A) > z(C), minA: !!w(A).isMinimized, minC: !!w(C).isMinimized,
    aShown: !w(A).content.classList.contains('tab-hidden'), bShown: !w(B).content.classList.contains('tab-hidden'),
    chooser: p ? { mode: p.dataset.mode, rows: [...p.querySelectorAll('.overlap-switcher-item')].map((r) => ({ id: r.dataset.winId, active: r.classList.contains('active') })) } : null,
    focus: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null, expanded: document.querySelector('.taskbar-group')?.getAttribute('aria-expanded') }; })()`;
const facts = () => evalJs(FACTS);

// three explorers; A + B grouped (host A, B on show); C alone and focused
const SETUP = `(async () => {
  document.querySelectorAll('[data-popover]').forEach((p) => p.remove());
  for (const id of [...app.wm.windows.keys()]) app.wm.closeWindow(id);
  const a = app.openFileExplorer('/tmp'), b = app.openFileExplorer('/usr'), c = app.openFileExplorer('/etc');
  window.__ids = { A: a.id, B: b.id, C: c.id };
  app.wm.createTabChain(a, b);
  // 2.369.182 integration (lane K × 2.369.181's placement): the default cascade now keeps a window inside the
  // workspace (_defaultPlacement → keepInside), which on this short page lifts C's title bar onto A's tab strip — a
  // drag released there MERGES C (leg (d)'s release point). C is placed below A's title-bar row, where the lane's base
  // cascade put it (its title bar over A's body), through the ONE placement.
  { const ws = app.wm._workspaceBox(); if (ws) app.wm._placeWindow(c, { left: 180, top: Math.max(120, ws.h - 320), width: 700, height: 300 }); }
  app.wm.focusWindow(c.id);
  await new Promise((r) => setTimeout(r, 300));
  app.updateTaskbar();
  return window.__ids;
})()`;

let ids = null;
const G = '.taskbar-group';
const S = () => `.taskbar-item[data-win-id="${ids.C}"]`;
const focusC = async () => { await evalJs(`(() => { document.querySelectorAll('[data-popover]').forEach((p) => p.remove()); const c = app.wm.windows.get(window.__ids.C); if (c.isMinimized) app.wm.restore(c.id); app.wm.focusWindow(c.id); return true; })()`); await sleep(80); };

// (a) — also the leg the CONTROL re-runs against the old click
async function legA(label = '(a)') {
  await park(); await focusC();
  const before = await facts();
  const g = await rectOf(G);
  await evalJs('window.__tg.opens.length = 0; true');
  await click(g);
  const after = await facts();
  await sleep(500); // the pointer RESTS on the button: a press disarms the hover until it leaves
  const rested = await facts();
  const opens = await evalJs('window.__tg.opens.length');
  return { before, after, rested, opens };
}

// ── lane K verify r1 leg (a function: CONTROL 2 re-runs it on the pre-fix bundle) ──
const listeners = async () => { const r = await cdp('Runtime.evaluate', { expression: 'document' }); const l = await cdp('DOMDebugger.getEventListeners', { objectId: r.result.objectId }); const by = {}; for (const x of l.listeners) by[x.type] = (by[x.type] || 0) + 1; await cdp('Runtime.releaseObject', { objectId: r.result.objectId }); return by; };
// (j) N hover open → leave → close cycles, not one mousedown between them
async function legListeners(n) {
  await park(); await focusC();
  await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()); true`);
  await click(PARK); await sleep(60); // ONE mousedown first: flush what the earlier legs' click-opened popovers left (bounded by a click, not this leg's subject)
  const L0 = await listeners();
  await evalJs('window.__tg.opens.length = 0; window.__tg.closes.length = 0; true');
  for (let i = 0; i < n; i++) {
    const gg = await rectOf(G);
    await mouse('mouseMoved', gg.x, gg.y);
    await until(`window.__tg.opens.length > ${i}`, { timeout: 2000 });
    await park();
    await until(`window.__tg.closes.length > ${i}`, { timeout: 2000 });
  }
  await sleep(100);
  const L1 = await listeners();
  const dom = await evalJs(`({ choosers: document.querySelectorAll('${CH}').length, opens: window.__tg.opens.length, closes: window.__tg.closes.length })`);
  return { L0, L1, dom };
}

try {
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: URL });
  // ── the verify-r1 LOW legs (functions: CONTROL 2 re-runs them on the pre-fix bundle; defined after the
  //    ONBOARDED_SOURCE addScript — legRestore navigates, test-architecture §47) ──
  // a tab title change re-keys the taskbar structure ⇒ the grouped button is REBUILT under the open chooser
  const REBUILD = `(() => { const { B } = window.__ids; const g0 = document.querySelector('.taskbar-group'); const w = app.wm.windows.get(B); if (window.__kTitle == null) window.__kTitle = w.title; w.title = 'B renamed ' + Math.random().toString(36).slice(2, 6) + ' \\u2014 /usr'; app.updateTaskbar(); const g1 = document.querySelector('.taskbar-group'); const p = document.querySelector('${CH}'); return { rebuilt: !!g0 && !!g1 && g0 !== g1, chooser: !!p, expanded: g1 && g1.getAttribute('aria-expanded'), anchored: !!(p && p._chooser && p._chooser.anchor === g1), focusRow: document.activeElement && document.activeElement.getAttribute('role') }; })()`;
  const UNTITLE = `(() => { const w = app.wm.windows.get(window.__ids.B); if (w && window.__kTitle != null) w.title = window.__kTitle; window.__kTitle = null; app.updateTaskbar(); return true; })()`;
  // (k) keyboard: ArrowUp chooser → rebuild → Esc; mouse: in front, click chooser → rebuild → click the rebuilt button
  async function legReanchor() {
    await park(); await focusC();
    await evalJs(`document.querySelector('.taskbar-group').focus(); true`);
    await key('ArrowUp'); await sleep(120);
    const k1 = await evalJs(REBUILD);
    await key('Escape');
    const k2 = await evalJs(`({ chooser: !!document.querySelector('${CH}'), back: !!document.activeElement && document.activeElement.classList.contains('taskbar-group') && document.activeElement.isConnected, expanded: document.querySelector('.taskbar-group')?.getAttribute('aria-expanded'), focus: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null })`);
    await evalJs(`app.wm.focusWindow(window.__ids.A); true`); await sleep(80);
    await click(await rectOf(G)); await park();
    const k3a = await evalJs(`(() => { const p = document.querySelector('${CH}'); window.__kPop = p; window.__tg.opens.length = 0; window.__tg.closes.length = 0; return { chooser: !!p, mode: p && p.dataset.mode }; })()`);
    const k3 = await evalJs(REBUILD);
    await click(await rectOf(G)); await park();
    const k4 = await evalJs(`({ same: !!window.__kPop && window.__kPop.isConnected && document.querySelector('${CH}') === window.__kPop, opens: window.__tg.opens.length, closes: window.__tg.closes.length, expanded: document.querySelector('.taskbar-group')?.getAttribute('aria-expanded') })`);
    await key('Escape');
    await evalJs(`window.__kPop = null; true`);
    await evalJs(UNTITLE);
    return { k1, k2, k3a, k3, k4 };
  }
  // (l) a pen (a fine, hovering pointer) rests on the grouped button
  async function legPen() {
    await park(); await focusC();
    await evalJs('window.__tg.opens.length = 0; window.__tg.closes.length = 0; window.__tg.enterType = ""; true');
    const gp = await rectOf(G);
    await mouse('mouseMoved', gp.x, gp.y, { pointerType: 'pen' });
    await until('window.__tg.opens.length > 0', { timeout: 1200 });
    const f = await evalJs(`({ opens: window.__tg.opens.length, mode: window.__tg.opens[0] && window.__tg.opens[0].mode, type: window.__tg.enterType, active: app.wm.activeWindowId })`);
    await mouse('mouseMoved', PARK.x, PARK.y, { pointerType: 'pen' });
    const closed = f.opens ? !!(await until('window.__tg.closes.length > 0', { timeout: 1500 })) : false;
    await park();
    await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()); true`);
    return { ...f, closed };
  }
  // (m) a HOVER chooser, right-click on row B, the pointer leaves for 450 ms (past the grace), then B's own Close
  async function legRowMenu() {
    await park(); await focusC();
    await evalJs('window.__tg.opens.length = 0; window.__rowCtx = null; document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".taskbar-group-chooser")) window.__rowCtx = e; }, { once: true }); true');
    const gm = await rectOf(G);
    await mouse('mouseMoved', gm.x, gm.y);
    await until('window.__tg.opens.length > 0', { timeout: 2000 });
    await mouse('mouseMoved', gm.x, gm.t - 2); await sleep(40);
    const rowB = await rectOf(`${CH} .overlap-switcher-item[data-win-id="${ids.B}"]`);
    if (rowB) {
      await mouse('mouseMoved', rowB.x, rowB.y); await sleep(60);
      await mouse('mousePressed', rowB.x, rowB.y, { button: 'right', buttons: 2, clickCount: 1 });
      await mouse('mouseReleased', rowB.x, rowB.y, { button: 'right', buttons: 0, clickCount: 1 });
      await sleep(150);
    }
    await park(); await sleep(450);
    const m1 = await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'); const p = document.querySelector('${CH}'); const mr = m && m.getBoundingClientRect(); const top = mr && document.elementFromPoint(mr.left + mr.width / 2, mr.top + 8); return { row: ${!!rowB}, menu: m ? [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].map((r) => r.textContent.trim()) : null, onTop: !!(m && top && m.contains(top)), prevented: !!(window.__rowCtx && window.__rowCtx.defaultPrevented), chooser: !!p, mode: p && p.dataset.mode }; })()`);
    const closeRow = m1.menu ? await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'); const r = m && [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].reverse().find((x) => /Close/.test(x.textContent)); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: r.textContent.trim() }; })()`) : null;
    if (closeRow) { await click(closeRow); await sleep(200); }
    const m2 = await evalJs(`(() => { const { A, B } = window.__ids; return { a: app.wm.windows.has(A), b: app.wm.windows.has(B), chooser: !!document.querySelector('${CH}'), menu: !!document.querySelector('.taskbar-context-menu'), groups: document.querySelectorAll('.taskbar-group').length }; })()`);
    await evalJs(`document.querySelectorAll('[data-popover]').forEach((p) => p.remove()); true`);
    return { m1, closeRow, m2 };
  }
  // (n) persist the A+B chain (the autosave a user's input would cause), reload, touch nothing
  const RESTORED = `(() => { const a = app.wm.windows.get(window.__ids.A); return { chain: !!(a && a._tabChain && a._tabChain.tabs.length === 2), items: [...document.querySelectorAll('#taskbar-items .taskbar-item')].map((e) => (e.classList.contains('taskbar-group') ? 'G' : 'S')).join('') }; })()`;
  const PERSISTED = `fetch('/api/layouts').then((r) => r.json()).then((d) => { const { A, B } = window.__ids; const hit = (o) => !!o && typeof o === 'object' && ((Array.isArray(o.tabs) && o.tabs.includes(A) && o.tabs.includes(B)) || Object.values(o).some(hit)); return hit(d); })`;
  async function legRestore(settleMs) {
    // the autosave is gated for 5 s after a page load (the layout manager's own restore window): wait it out, never race it
    await until(`!app.layoutManager._restoring && !(app.desktopManager && app.desktopManager._restoring)`, { timeout: 8000, step: 100 });
    await evalJs(`(() => { const L = app.layoutManager; L._userDirty = true; L._lastUserInputAt = Date.now(); L._lastSentJson = null; L.scheduleAutoSave(); return true; })()`);
    const saved = await until(PERSISTED, { timeout: 6000, step: 200 });
    await cdp('Page.navigate', { url: URL });
    await sleep(1500);
    await evalJs(POLL_APP);
    await evalJs(`window.__ids = ${JSON.stringify(ids)}; true`);
    const chainAt = await until(`(${RESTORED}).chain`, { timeout: 8000, step: 50 });
    const t0 = Date.now();
    const grouped = await until(`(${RESTORED}).items === 'GS'`, { timeout: settleMs, step: 50 });
    const ms = Date.now() - t0;
    const st = await evalJs(RESTORED);
    await evalJs(RECORDER);
    return { saved, chainAt, grouped, ms, st };
  }
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(500);
  ids = await evalJs(SETUP);
  await evalJs(RECORDER);
  const env = await evalJs(`({ fine: matchMedia('(any-pointer: fine)').matches, touch: app.isTouch, mobile: app.isMobile, items: [...document.querySelectorAll('#taskbar-items .taskbar-item')].map((e) => ({ id: e.dataset.winId, group: e.classList.contains('taskbar-group'), sub: e.querySelector('.taskbar-subtitle')?.textContent, role: e.getAttribute('role'), tab: e.tabIndex, label: e.getAttribute('aria-label'), title: e.title })) })`);
  check(`the desk: a real mouse, not touch, desktop width; one GROUPED button + one single (${JSON.stringify(env.items.map((i) => (i.group ? 'G' : 'S') + ':' + i.sub))})`, env.fine && !env.touch && !env.mobile && env.items.length === 2 && env.items.filter((i) => i.group).length === 1, env);
  const gi = env.items.find((i) => i.group), si = env.items.find((i) => !i.group);
  check('the grouped button is a focusable button with a name and no native tooltip over the chooser', gi.role === 'button' && gi.tab === 0 && /2 windows grouped/.test(gi.label || '') && !gi.title, gi);
  check('the single button is untouched (not made focusable, keeps its tooltip)', si.role === null && si.tab === -1 && !!si.title, si);

  // ══ (a) ══
  console.log('(a) click, group behind ⇒ activate, no chooser');
  const a = await legA();
  check(`before: C is focused, the group behind (active ${a.before.active})`, a.before.active === ids.C && !a.before.topIsA);
  check(`the click ACTIVATES: the group's active tab (B) is focused, its host raised above C, B still on show (active ${a.after.active}, chain.active ${a.after.chainActive})`, a.after.active === ids.B && a.after.topIsA && a.after.chainActive === 1 && a.after.bShown && !a.after.aShown, a.after);
  check('…and NO chooser — not at the click, not after the pointer rested 500 ms on the button', !a.after.chooser && !a.rested.chooser && a.opens === 0, { after: a.after.chooser, rested: a.rested.chooser, opens: a.opens });
  await shot('a-activated.png');

  // ══ (b) ══
  console.log('(b) click again (in front) ⇒ the chooser; a row switches the tab');
  const g = await rectOf(G);
  await click(g);
  const b1 = await facts();
  check(`in front, the click is the CHOOSER (pinned: mode ${b1.chooser && b1.chooser.mode}), two rows, B marked active, aria-expanded`, !!b1.chooser && b1.chooser.mode === 'click' && b1.chooser.rows.length === 2 && b1.chooser.rows.find((r) => r.id === ids.B)?.active && b1.expanded === 'true', b1);
  const pr = await until(`(() => { const p = document.querySelector('${CH}'); if (!p || getComputedStyle(p).visibility === 'hidden') return null; const r = p.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; })()`);
  check(`the chooser sits ABOVE the button, on screen (pop b ${pr && Math.round(pr.b)} ≤ button t ${Math.round(g.t)})`, !!pr && pr.b <= g.t + 1 && pr.l >= 0 && pr.t >= 0 && pr.r <= pr.vw && Math.abs(pr.l - g.l) < 40, { pr, g });
  await shot('b-chooser-pinned.png');
  await park(); await sleep(450);
  check('a PINNED chooser stays when the pointer leaves (only a hover chooser has a leave timer)', !!(await facts()).chooser);
  const rowA = await rectOf(`${CH} .overlap-switcher-item[data-win-id="${ids.A}"]`);
  await click(rowA);
  const b2 = await facts();
  check(`choosing A ⇒ A is the tab on show and focused, the chooser gone (active ${b2.active}, chain.active ${b2.chainActive})`, b2.active === ids.A && b2.chainActive === 0 && b2.aShown && !b2.bShown && !b2.chooser && b2.expanded === 'false', b2);
  await shot('b-switched-to-A.png');
  // Esc and a click elsewhere
  await click(await rectOf(G)); await park();
  check('(b) chooser open again for the Esc leg', !!(await facts()).chooser);
  await key('Escape');
  check('Esc closes it', !(await facts()).chooser);
  await click(await rectOf(G)); await park();
  const ws1 = await evalJs(`(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.right - 20, y: r.bottom - 20 }; })()`);
  await click(ws1);
  check('a click elsewhere closes it', !(await facts()).chooser);

  // ══ (c) ══
  console.log('(c) hover ⇒ the chooser (non-modal); leave ⇒ gone; a cross-over ⇒ nothing');
  await park(); await focusC();
  await evalJs(`(() => { const i = document.createElement('input'); i.id = 'tg-probe-focus'; i.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;opacity:0'; document.body.appendChild(i); i.focus(); window.__tg.opens.length = 0; window.__tg.closes.length = 0; return document.activeElement === i; })()`);
  const gc = await rectOf(G);
  await mouse('mouseMoved', gc.x, gc.y);
  const opened = await until(`window.__tg.opens.length > 0`);
  const hc = await evalJs(`({ enter: window.__tg.enterG, open: window.__tg.opens[0] && window.__tg.opens[0].at, mode: window.__tg.opens[0] && window.__tg.opens[0].mode, focus: document.activeElement && document.activeElement.id, active: app.wm.activeWindowId })`);
  check(`hovering opens the chooser (polled ≤ 2.5 s)`, !!opened, hc);
  check(`…no earlier than the intent, on the page's clock (pointerenter → open ${Math.round(hc.open - hc.enter)} ms, expected ≥ 280)`, hc.enter > 0 && hc.open - hc.enter >= 280 && hc.open - hc.enter <= 2500, hc);
  check('…non-modal: HOVER mode, the focus stayed where it was, the focused window is still C', hc.mode === 'hover' && hc.focus === 'tg-probe-focus' && hc.active === ids.C, hc);
  const hp = await until(`(() => { const p = document.querySelector('${CH}'); if (!p || getComputedStyle(p).visibility === 'hidden') return null; const r = p.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`);
  check('…above the button', !!hp && hp.b <= gc.t + 1, { hp, gc });
  const clip = hp ? { x: Math.floor(hp.l), y: Math.floor(hp.t), width: Math.ceil(hp.w), height: Math.ceil(hp.h) } : null;
  const drawn = clip ? await shot('c-hover-chooser.png') && await shot(null, clip) : null;
  // across the 4 px gap onto the chooser, then onto row A: it stays, the row lights up
  await mouse('mouseMoved', gc.x, gc.t - 2); await sleep(40);
  const hRowA = await rectOf(`${CH} .overlap-switcher-item[data-win-id="${ids.A}"]`);
  await mouse('mouseMoved', hRowA.x, hRowA.y); await sleep(350);
  const lit = await evalJs(`(() => { const p = document.querySelector('${CH}'); if (!p) return null; const rows = [...p.querySelectorAll('.overlap-switcher-item')]; const bg = (r) => getComputedStyle(r).backgroundColor; return { mode: p.dataset.mode, a: bg(rows.find((r) => r.dataset.winId === window.__ids.A)), b: bg(rows.find((r) => r.dataset.winId === window.__ids.B)) }; })()`);
  check('moving across the gap onto the chooser keeps it open (the leave grace covers button + chooser) and the hovered row highlights', !!lit && lit.mode === 'hover' && lit.a !== lit.b, lit);
  await shot('c-hover-row.png');
  await park();
  const gone = await until(`window.__tg.closes.length > 0`);
  const lc = await evalJs(`({ leave: window.__tg.leavePop, close: window.__tg.closes[0] })`);
  check(`leaving both ⇒ gone after the grace (chooser pointerleave → removed ${Math.round(lc.close - lc.leave)} ms, expected 200–1500)`, !!gone && lc.leave > 0 && lc.close - lc.leave >= 200 && lc.close - lc.leave <= 1500, lc);
  const after = clip ? await shot(null, clip) : null;
  check('the rendered pixels in the chooser\'s box change when it closes (it was drawn, and it is gone)', !!drawn && !!after && drawn !== after);
  // cross-over: onto the grouped button, ~150 ms, on to the single button (retried when a starved box held it ≥ the intent)
  let crossed = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await park();
    await evalJs('window.__tg.opens.length = 0; window.__tg.enterS = 0; true');
    const gx = await rectOf(G), sx = await rectOf(S());
    await mouse('mouseMoved', gx.x, gx.y); await sleep(150);
    await mouse('mouseMoved', sx.x, sx.y); await sleep(600);
    crossed = await evalJs(`({ dwell: window.__tg.leaveG - window.__tg.enterG, opens: window.__tg.opens.length, onSingle: window.__tg.enterS > 0 })`);
    if (crossed.dwell < 280) break;
  }
  check(`a cross-over (${Math.round(crossed.dwell)} ms on the grouped button, then the neighbour) never opens the chooser`, crossed.dwell < 280 && crossed.onSingle && crossed.opens === 0, crossed);
  await evalJs(`document.getElementById('tg-probe-focus')?.remove(); true`);

  // ══ (d) ══
  console.log('(d) a window drag passing over the button ⇒ no chooser');
  await park(); await focusC();
  const enterBefore = await evalJs('window.__tg.opens.length = 0; window.__tg.enterG');
  const tbar = await evalJs(`(() => { const w = app.wm.windows.get(window.__ids.C); const r = w.titleBar.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
  const gd = await rectOf(G);
  await mouse('mouseMoved', tbar.x, tbar.y);
  await mouse('mousePressed', tbar.x, tbar.y, { button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', tbar.x + (gd.x - tbar.x) * i / 12, tbar.y + (gd.y - tbar.y) * i / 12, { button: 'left', buttons: 1 }); await sleep(30); }
  const dragging = await evalJs(`!!document.querySelector('.window.dragging')`);
  for (let i = 0; i < 6; i++) { await mouse('mouseMoved', gd.x + (i % 2), gd.y, { button: 'left', buttons: 1 }); await sleep(100); }
  const during = await evalJs(`({ opens: window.__tg.opens.length, entered: window.__tg.enterG })`);
  for (let i = 11; i >= 0; i--) { await mouse('mouseMoved', tbar.x + (gd.x - tbar.x) * i / 12, tbar.y + (gd.y - tbar.y) * i / 12, { button: 'left', buttons: 1 }); await sleep(20); }
  await mouse('mouseReleased', tbar.x, tbar.y, { button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);
  const dEnd = await evalJs(`({ opens: window.__tg.opens.length, dragging: !!document.querySelector('.window.dragging') })`);
  check(`a real title-bar drag was in progress (${dragging}), the pointer ENTERED the button during it (${during.entered > enterBefore}), and ~600 ms there opened NOTHING (opens ${during.opens} → ${dEnd.opens})`, dragging && during.entered > enterBefore && during.opens === 0 && dEnd.opens === 0 && !dEnd.dragging, { dragging, enterBefore, during, dEnd });

  // ══ (g) ══ (before touch emulation changes the page's pointer facts)
  console.log('(g) the single button is unchanged');
  await park(); await evalJs(`(() => { const { A } = window.__ids; app.wm.focusWindow(A); window.__tg.opens.length = 0; return true; })()`);
  const sg = await rectOf(S());
  await mouse('mouseMoved', sg.x, sg.y); await sleep(700);
  check('resting 700 ms on the single button opens no chooser', (await evalJs('window.__tg.opens.length')) === 0 && !(await facts()).chooser);
  await click(sg);
  const g1 = await facts();
  check('click ⇒ C focused + raised', g1.active === ids.C && !g1.topIsA && !g1.chooser, g1);
  await click(sg);
  const g2 = await facts();
  check('click again (focused) ⇒ C minimized — today\'s behaviour', g2.minC && !g2.chooser, g2);
  await click(sg);
  const g3 = await facts();
  check('click again ⇒ C restored and focused', !g3.minC && g3.active === ids.C, g3);

  // ══ (h) ══
  console.log('(h) right-click ⇒ the window menu');
  await park();
  const gh = await rectOf(G);
  await mouse('mouseMoved', gh.x, gh.y);
  await mouse('mousePressed', gh.x, gh.y, { button: 'right', buttons: 2, clickCount: 1 });
  await mouse('mouseReleased', gh.x, gh.y, { button: 'right', buttons: 0, clickCount: 1 });
  await sleep(400);
  const menu = await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'); return m ? [...m.querySelectorAll('.taskbar-context-menu-item')].map((r) => r.textContent.trim()) : null; })()`);
  check(`right-click opens the group's window menu (${menu && menu.slice(-2).join(' / ')}) and no chooser`, !!menu && menu.some((r) => /Close group/.test(r)) && !(await facts()).chooser, menu);
  await key('Escape'); await park();

  // ══ (f) ══
  console.log('(f) keyboard');
  await focusC();
  await evalJs(`document.querySelector('.taskbar-group').focus(); true`);
  await key('Enter');
  const f1 = await facts();
  check(`Enter on the focused button while behind = activate (active ${f1.active}), no chooser`, [ids.A, ids.B].includes(f1.active) && f1.topIsA && !f1.chooser, f1);
  await evalJs(`document.querySelector('.taskbar-group').focus(); true`);
  await key('Enter');
  await sleep(120);
  const f2 = await evalJs(`({ chooser: !!document.querySelector('${CH}'), mode: document.querySelector('${CH}')?.dataset.mode, focusRow: document.activeElement?.getAttribute('role'), focusId: document.activeElement?.dataset?.winId, activeTab: app.wm.windows.get(window.__ids.A)._tabChain.tabs[app.wm.windows.get(window.__ids.A)._tabChain.active] })`);
  check('Enter again (in front) = the chooser, focus on the ACTIVE row', f2.chooser && f2.focusRow === 'menuitem' && f2.focusId === f2.activeTab, f2);
  await key('ArrowDown');
  const other = await evalJs(`document.activeElement?.dataset?.winId`);
  check('ArrowDown moves to the other row', !!other && other !== f2.focusId, other);
  await key('Enter');
  const f3 = await facts();
  check(`Enter on it switches to that tab and closes the chooser (active ${f3.active})`, f3.active === other && !f3.chooser, f3);
  await focusC();
  await evalJs(`document.querySelector('.taskbar-group').focus(); true`);
  await key('ArrowUp');
  await sleep(120);
  const f4 = await evalJs(`({ chooser: !!document.querySelector('${CH}'), focusRow: document.activeElement?.getAttribute('role'), active: app.wm.activeWindowId })`);
  check('ArrowUp while behind = the chooser (nothing activated), focus in it', f4.chooser && f4.focusRow === 'menuitem' && f4.active === ids.C, f4);
  await key('Escape');
  const f5 = await evalJs(`({ chooser: !!document.querySelector('${CH}'), back: document.activeElement?.classList.contains('taskbar-group') })`);
  check('Esc closes it and hands the focus back to the button', !f5.chooser && f5.back, f5);

  // ══ lane K verify r1 (2026-09-25): (j) the hover chooser leaves no listener behind ══
  console.log('(j) 30 hover open/leave cycles leave no document listener behind');
  const j = await legListeners(30);
  check(`every hover chooser opened and left the DOM (opens ${j.dom.opens}, closes ${j.dom.closes}, left ${j.dom.choosers})`, j.dom.opens >= 30 && j.dom.closes >= 30 && j.dom.choosers === 0, j.dom);
  // since lane M (the 2.369.182 integration) the outside-press close is utils.js onOutsidePress: a capture-phase
  // pointerdown (+ its pointerup / pointercancel) — those are the closer's listeners now; mousedown is counted too
  const PRESS_TYPES = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown'];
  const grow = (a, b) => PRESS_TYPES.map((t) => `${t} ${a[t] || 0} → ${b[t] || 0}`).join(', ');
  check(`no document press-listener growth with ZERO clicks (${grow(j.L0, j.L1)}) — each cycle's outside-press close is disposed by the chooser's one cleanup`, PRESS_TYPES.every((t) => (j.L1[t] || 0) === (j.L0[t] || 0)), j);
  check(`no document keydown listener growth (${j.L0.keydown || 0} → ${j.L1.keydown || 0})`, (j.L1.keydown || 0) === (j.L0.keydown || 0), j);

  // ══ the verify-r1 LOWS (2026-09-25): (k) re-anchor · (l) pen · (m) row menu · (n) restore ══
  console.log('(k) a taskbar rebuild under an open chooser re-anchors it to the live button');
  const k = await legReanchor();
  check(`ArrowUp chooser, then a tab title change REBUILDS the button (${k.k1.rebuilt}): the chooser stays, the new button says aria-expanded="${k.k1.expanded}" and is the chooser's anchor (${k.k1.anchored})`, k.k1.rebuilt && k.k1.chooser && k.k1.expanded === 'true' && k.k1.anchored && k.k1.focusRow === 'menuitem', k.k1);
  check(`Esc closes it and hands the focus to the LIVE button (focus ${k.k2.focus}), aria-expanded back to "false"`, !k.k2.chooser && k.k2.back && k.k2.expanded === 'false', k.k2);
  check('a click on the REBUILT button keeps the SAME chooser (its mousedown is the button\'s own, never "a click elsewhere": no close + re-create)', k.k3a.chooser && k.k3.anchored && k.k4.same && k.k4.opens === 0 && k.k4.closes === 0 && k.k4.expanded === 'true', k);

  console.log('(l) a pen hovers like a mouse');
  const l = await legPen();
  check(`a pen resting on the grouped button opens the HOVER chooser (pointerType ${l.type}, opens ${l.opens}, mode ${l.mode}), nothing activated`, l.type === 'pen' && l.opens >= 1 && l.mode === 'hover' && l.active === ids.C, l);
  check('…and it closes when the pen leaves', l.closed, l);

  console.log('(m) right-click on a chooser row = THAT tab\'s window menu, the chooser stays beneath');
  const m = await legRowMenu();
  check(`right-click on row B opens the window menu on top (${m.m1.menu && m.m1.menu.slice(-1).join('')}), no native menu (defaultPrevented ${m.m1.prevented}), the chooser still open beneath it and PINNED past the leave grace (mode ${m.m1.mode})`, !!m.m1.menu && m.m1.menu.length > 0 && m.m1.onTop && m.m1.prevented && m.m1.chooser && m.m1.mode === 'click' && !m.m1.menu.some((r) => /Close group/.test(r)), m.m1);
  check(`its "${m.closeRow && m.closeRow.text}" closes B — the tab right-clicked — and leaves A (the chooser goes with the group)`, !!m.closeRow && m.m2.a && !m.m2.b && !m.m2.chooser && !m.m2.menu && m.m2.groups === 0, m);
  ids = await evalJs(SETUP); await evalJs(RECORDER);

  console.log('(n) after a reload a restored tab group is ONE grouped button, with no input');
  const n = await legRestore(1000);
  check(`the chain was persisted (${n.saved}) and restored on reload (${n.chainAt})`, !!n.saved && !!n.chainAt, n);
  check(`the taskbar shows ONE grouped button + ONE single item without any input (items ${n.st.items}, ${n.ms} ms after the chain came back)`, !!n.grouped && n.st.items === 'GS', n);
  ids = await evalJs(SETUP); await evalJs(RECORDER);

  // ══ (e) ══
  console.log('(e) touch');
  await park(); await focusC();
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await evalJs('window.__tg.opens.length = 0; true');
  const tap = async (pt) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350); };
  await tap(await rectOf(G));
  await sleep(400);
  const e1 = await facts();
  check(`a tap while behind ACTIVATES (active ${e1.active}), no chooser even after 750 ms`, [ids.A, ids.B].includes(e1.active) && e1.topIsA && !e1.chooser && (await evalJs('window.__tg.opens.length')) === 0, e1);
  await tap(await rectOf(G));
  const e2 = await facts();
  check('a second tap (in front) is the chooser — touch reaches the list', !!e2.chooser && e2.chooser.mode === 'click', e2);
  await key('Escape');
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });

  // ══ (i) the UI scale ══
  console.log('(i) under a 125 % UI scale the chooser still sits on its button');
  await evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(500);
  ids = await evalJs(SETUP);
  await evalJs(RECORDER);
  await park();
  const gz = await rectOf(G);
  await click(gz); await park();
  await click(await rectOf(G)); await park();
  const zr = await until(`(() => { const p = document.querySelector('${CH}'); if (!p || getComputedStyle(p).visibility === 'hidden') return null; const r = p.getBoundingClientRect(); return { l: r.left, b: r.bottom, t: r.top, z: getComputedStyle(document.body).zoom }; })()`);
  const gz2 = await rectOf(G);
  check(`at zoom ${zr && zr.z} the chooser is above its button and aligned with it (pop l ${zr && Math.round(zr.l)} b ${zr && Math.round(zr.b)} vs button l ${Math.round(gz2.l)} t ${Math.round(gz2.t)}, viewport px)`, !!zr && String(zr.z) === '1.25' && zr.b <= gz2.t + 1 && gz2.t - zr.b < 12 && Math.abs(zr.l - gz2.l) < 8, { zr, gz2 });
  await shot('i-ui-scale-125.png');
  await key('Escape');
  await evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);

  // ══ CONTROL ══
  console.log('CONTROL: the old always-chooser click, rebuilt into the scratch bundle ⇒ (a) fails');
  const MOD = path.join(wt, 'src/lib/taskbar-group.js');
  const src = fs.readFileSync(MOD, 'utf8');
  const RULE = "return inFront ? 'chooser' : 'activate';";
  check('the rule is spelled where the control patches it', src.includes(RULE));
  fs.writeFileSync(MOD, src.replace(RULE, "return 'chooser';"));
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify', { cwd: wt, stdio: 'ignore' });
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(500);
  ids = await evalJs(SETUP);
  await evalJs(RECORDER);
  const c = await legA('control');
  check(`CONTROL: with the old click the same leg shows the chooser and leaves C focused (active ${c.after.active}, chooser ${!!c.after.chooser}) — (a) can go red`, c.after.active === ids.C && !!c.after.chooser, c.after);

  // ══ CONTROL 2 (lane K verify r1): the r1 disposer + the four low fixes reverted in the scratch bundle ⇒ (j) (k) (l) (m) (n) go red ══
  console.log('CONTROL 2: the verify-r1 fixes reverted, rebuilt into the scratch bundle ⇒ (j) (k) (l) (m) (n) fail');
  fs.writeFileSync(MOD, src); // the click rule back
  const REVERTS = [
    ['src/lib/taskbar.js', 'mo.disconnect(); ctl.abort(); pop._closeCtl?.abort(); state.keep();', 'mo.disconnect(); ctl.abort(); state.keep();', '(j) the chooser no longer disposes the outside-click close'],
    ['src/lib/taskbar.js', '  _chooserOf(hostId)?._chooser.reanchor(item);\n', '', '(k) a rebuild no longer re-anchors'],
    ['src/lib/taskbar.js', "(e.pointerType === 'mouse' || e.pointerType === 'pen') && _finePointer()", "e.pointerType === 'mouse' && _finePointer()", '(l) a mouse only'],
    ['src/lib/taskbar.js', "    item.addEventListener('contextmenu', (e) => {\n      e.preventDefault();\n      state.pin();", "    if (0) item.addEventListener('contextmenu', (e) => {\n      e.preventDefault();\n      state.pin();", '(m) no row menu'],
    ['src/lib/tab-group.js', '    this._notify();\n  },\n};', '  },\n};', '(n) restoreTabChain no longer notifies'],
  ];
  for (const [f, from, to, what] of REVERTS) {
    const fp = path.join(wt, f), t0 = fs.readFileSync(fp, 'utf8');
    check(`CONTROL 2 patch ${what}: spelled exactly once where it is reverted`, t0.split(from).length === 2);
    fs.writeFileSync(fp, t0.replace(from, to));
  }
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify', { cwd: wt, stdio: 'ignore' });
  const cn = await legRestore(2000); // persists from the CONTROL page, then loads the reverted bundle
  check(`CONTROL 2 (n): without the notify the restored chain (${cn.chainAt}) still shows as single buttons 2 s later (items ${cn.st.items})`, !!cn.saved && !!cn.chainAt && !cn.grouped && cn.st.items === 'SSS', cn);
  ids = await evalJs(SETUP); await evalJs(RECORDER);
  const cj = await legListeners(30);
  check(`CONTROL 2 (j): without the disposer 30 hover cycles grow the document's capture pointerdown (the outside-press closer since lane M) by 30 (${cj.L0.pointerdown || 0} → ${cj.L1.pointerdown || 0})`, cj.dom.opens >= 30 && (cj.L1.pointerdown || 0) - (cj.L0.pointerdown || 0) === 30, cj);
  const ck = await legReanchor();
  check(`CONTROL 2 (k): without the re-anchor the rebuilt button reads aria-expanded="${ck.k1.expanded}" and Esc drops the focus (${ck.k2.focus})`, ck.k1.rebuilt && !ck.k1.anchored && ck.k1.expanded === 'false' && !ck.k2.back, ck);
  const cl = await legPen();
  check(`CONTROL 2 (l): a mouse-only hover gives the pen nothing (pointerType ${cl.type}, opens ${cl.opens})`, cl.type === 'pen' && cl.opens === 0, cl);
  const cm = await legRowMenu();
  check(`CONTROL 2 (m): with no row handler a right-click opens no window menu (${JSON.stringify(cm.m1.menu)}, defaultPrevented ${cm.m1.prevented})`, cm.m1.row && !cm.m1.menu && !cm.m1.prevented, cm.m1);
} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message);
}
console.log(`screenshots: ${SHOTS}`);
console.log(failed ? `FAILED (${failed}; ${passed} passed)` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
