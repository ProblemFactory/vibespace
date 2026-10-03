#!/usr/bin/env node
// A WHOLE TAB GROUP CLOSES ONLY AFTER A QUESTION — in chrome, with a real mouse (B-a67c, 2026-10-02; the owner:
// "当窗口是tabbed或者side by side的时候，注意点击整体的关闭要有个警告提示确认要关闭x个标签页吗，避免想关闭tab但点错").
// Heavy: headless chrome on a scratch copy of this tree (src, public, server.js, data/bin — no git worktree), three
// File Explorer windows in one tab group, CDP mouse + keys:
//   (a) TABS — a real click on the frame's ✕ opens the house dialog "Close 3 tabs?" naming the three tabs exactly as
//       the strip shows them, "Close 3 tabs" / Cancel; every tab still open under it; Esc keeps every tab; the Cancel
//       button keeps every tab; Enter closes all three.
//   (b) a TAB's own ✕ closes that tab with no dialog; the other two stay grouped.
//   (c) SIDE BY SIDE — the same frame ✕: "Close 3 tabs?" naming the left half then the right, Cancel keeps the split,
//       a pane tab's own ✕ closes one with no dialog, Enter on the frame ✕ closes the rest.
//   (d) the taskbar GROUP button's right-click "Close group" and the frame's own title-bar menu "Close group" ask the
//       same question (Esc keeps all; Enter closes all).
//   (e) a lone window's ✕ closes at once, no dialog; a programmatic close of every member (layout sync's shape) never
//       asks.
//   CONTROL: the scratch bundle rebuilt with the pre-fix frame ✕ (requestClose) ⇒ (a) red — no dialog, and the click
//   ends only the host (tabs[0]) while the tab on show stays: the bug the owner's request presumed fixed.
// Run: node scripts/test-tab-close-confirm-ui.mjs   (after `npm run build`; SKIPs without chrome)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop names for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public/bundle.js'))) { console.error('  ✗ public/bundle.js missing — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const ROOT = scratch('tcc');
const wt = path.join(ROOT, 'tree'), PROFILE = path.join(ROOT, 'chrome'), HOME = path.join(ROOT, 'home');
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the scratch tree: a copy of what the server serves (no git — nothing registers anywhere)
fs.mkdirSync(wt, { recursive: true });
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
for (const f of ['src', 'public', 'server.js', 'package.json']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.cpSync(path.join(repo, 'data/bin'), path.join(wt, 'data/bin'), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

let srv = null, chrome = null;
const boot = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, HOME, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' }); };
boot();
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(ROOT); } catch {} // §57b: the server's setsid daemon (and anything else rooted here) dies with the suite
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('the scratch server answers', await waitServer());

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
const VK = { Enter: 13, Escape: 27 };
const key = async (k) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: VK[k], ...(k === 'Enter' ? { text: '\r' } : {}) }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await sleep(150); };
// a rect, read until it holds still (the chrome bar folds on a frame after a resize — a captured rect can move)
const stableRect = async (expr) => {
  let last = null, same = 0;
  for (let i = 0; i < 60; i++) {
    const r = await evalJs(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null; })()`);
    if (r && last && r.x === last.x && r.y === last.y) { if (++same >= 2) return r; } else same = 0;
    last = r; await sleep(40);
  }
  return last;
};
const click = async (pt, { button = 'left' } = {}) => {
  await mouse('mouseMoved', pt.x, pt.y); await sleep(80);
  await mouse('mousePressed', pt.x, pt.y, { button, buttons: button === 'left' ? 1 : 2, clickCount: 1 });
  await mouse('mouseReleased', pt.x, pt.y, { button, buttons: 0, clickCount: 1 });
  await sleep(150);
};
const W = (id) => `app.wm.windows.get(${JSON.stringify(id)})`;
const FRAME_X = (host) => `${W(host)}?.titleBar.querySelector('.window-controls .win-close')`;
const TAB_X = (host, id) => `${W(host)}?.titleBar.querySelector('.tab-item[data-win-id="${id}"] .tab-close')`;
// what is on screen: the dialog (title, the listed names, the buttons), the windows still open, the strip's own labels
const STATE = `(() => {
  const ids = window.__ids || {};
  const ov = [...document.querySelectorAll('.dialog-overlay')].pop() || null;
  const dlg = ov && ov.querySelector('.dialog');
  const open = Object.entries(ids).filter(([, id]) => app.wm.windows.has(id)).map(([k]) => k).join('');
  const host = Object.values(ids).map((id) => app.wm.windows.get(id)).find((w) => w && w._tabChain && w._tabChain.tabs[0] === w.id);
  const strip = host ? [...host.titleBar.querySelectorAll('.tab-item .tab-label')].map((el) => el.textContent) : [];
  return {
    dialog: dlg ? { title: dlg.querySelector('.dialog-header h3')?.textContent, list: [...dlg.querySelectorAll('.dialog-list li')].map((li) => li.textContent), ok: dlg.querySelector('.btn-create')?.textContent, cancel: dlg.querySelector('.btn-cancel')?.textContent, okFocused: document.activeElement === dlg.querySelector('.btn-create'), danger: !!dlg.querySelector('.btn-create.danger') } : null,
    overlays: document.querySelectorAll('.dialog-overlay').length,
    open, strip, chainSize: host ? host._tabChain.tabs.length : 0, layout: host ? host._tabChain.layout || 'tabs' : null,
    shown: host ? (Object.entries(ids).find(([, id]) => id === host._tabChain.tabs[host._tabChain.active]) || [null])[0] : null,
  };
})()`;
const state = () => evalJs(STATE);
// three File Explorer windows A B C in ONE group (C on show), or `split` = A | B side by side with C on A's side
const SETUP = (mode) => `(async () => {
  document.querySelectorAll('[data-popover], .dialog-overlay').forEach((p) => p.remove());
  for (const id of [...app.wm.windows.keys()]) app.wm.closeWindow(id);
  const a = app.openFileExplorer('/tmp'), b = app.openFileExplorer('/usr'), c = app.openFileExplorer('/etc');
  window.__ids = { A: a.id, B: b.id, C: c.id };
  ${mode === 'lone' ? '' : `app.wm.createTabChain(a, b); app.wm.addToTabChain(a._tabChain, c);`}
  ${mode === 'split' ? `app.wm.bindSplit(a, b, { side: 'right' });` : ''}
  { const box = app.wm._workspaceBox(); if (box && a._tabChain) app.wm._placeWindow(app.wm.windows.get(a._tabChain.tabs[0]), { left: 60, top: 40, width: 1000, height: 520 }); }
  await new Promise((r) => setTimeout(r, 500));
  app.updateTaskbar();
  // the three explorer titles differ by folder; wait until each tab's label is its real name (the strip draws win.title)
  return window.__ids;
})()`;
let ids = null;
const settle = async () => { await sleep(300); };

async function legA(tag = '(a)') {
  const out = {};
  const host = ids.A;
  out.before = await state();
  await click(await stableRect(FRAME_X(host)));
  out.ask = await until(`(${STATE}).dialog`, { timeout: 1500 }) ? await state() : await state();
  return out;
}

try {
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(800);

  // ══ (a) TABS ══
  console.log('(a) a tab group: the frame\'s ✕ asks; Esc and Cancel keep every tab; Enter closes all');
  ids = await evalJs(SETUP('tabs')); await settle();
  const a0 = await legA();
  const s0 = a0.before, s1 = a0.ask;
  check(`the group is up: 3 tabs, the strip reads ${JSON.stringify(s0.strip)}, tab ${s0.shown} on show, no dialog`, s0.chainSize === 3 && s0.strip.length === 3 && !s0.dialog && s0.open === 'ABC' && s0.shown === 'C', s0);
  check(`a real click on the frame's ✕ opens the house dialog "${s1.dialog && s1.dialog.title}" with "${s1.dialog && s1.dialog.ok}" / "${s1.dialog && s1.dialog.cancel}"`, !!s1.dialog && s1.dialog.title === 'Close 3 tabs?' && s1.dialog.ok === 'Close 3 tabs' && s1.dialog.cancel === 'Cancel' && s1.dialog.danger, s1.dialog);
  check(`…naming every tab exactly as the strip shows them (${JSON.stringify(s1.dialog && s1.dialog.list)})`, !!s1.dialog && JSON.stringify(s1.dialog.list) === JSON.stringify(s0.strip), { list: s1.dialog && s1.dialog.list, strip: s0.strip });
  check('…every tab still open under the question, the confirm button holding the keyboard (Enter)', s1.open === 'ABC' && s1.chainSize === 3 && s1.dialog && s1.dialog.okFocused, s1);
  await key('Escape');
  const s2 = await state();
  check('Esc = Cancel: the dialog goes, all three tabs stay in their group', !s2.dialog && s2.overlays === 0 && s2.open === 'ABC' && s2.chainSize === 3, s2);
  await click(await stableRect(FRAME_X(ids.A)));
  await until(`(${STATE}).dialog`, { timeout: 1500 });
  await click(await stableRect(`[...document.querySelectorAll('.dialog-overlay')].pop()?.querySelector('.btn-cancel')`));
  const s3 = await state();
  check('the Cancel button (a real click) keeps every tab', !s3.dialog && s3.open === 'ABC' && s3.chainSize === 3, s3);
  await click(await stableRect(FRAME_X(ids.A)));
  await until(`(${STATE}).dialog`, { timeout: 1500 });
  await key('Enter');
  await until(`!(${STATE}).open`, { timeout: 2000 });
  const s4 = await state();
  check(`Enter = "Close 3 tabs": every tab of the group closes (open: "${s4.open}"), the dialog is gone`, s4.open === '' && !s4.dialog && s4.overlays === 0, s4);

  // ══ (b) a TAB's own ✕ ══
  console.log('(b) a tab\'s own ✕ closes that tab, no question');
  ids = await evalJs(SETUP('tabs')); await settle();
  await click(await stableRect(TAB_X(ids.A, ids.B)));
  await sleep(500);
  const b1 = await state();
  check(`a real click on tab B's own ✕ closes B with NO dialog (open "${b1.open}", overlays ${b1.overlays}); A and C stay grouped`, !b1.dialog && b1.overlays === 0 && b1.open === 'AC' && b1.chainSize === 2, b1);

  // ══ (c) SIDE BY SIDE ══
  console.log('(c) side by side: the same question, the halves in order; a pane tab\'s own ✕ never asks');
  ids = await evalJs(SETUP('split')); await settle();
  const c0 = await state();
  check(`the split is up (layout ${c0.layout}, strip ${JSON.stringify(c0.strip)})`, c0.layout === 'split' && c0.chainSize === 3, c0);
  await click(await stableRect(FRAME_X(ids.A)));
  await until(`(${STATE}).dialog`, { timeout: 1500 });
  const c1 = await state();
  check(`side by side the frame's ✕ asks "${c1.dialog && c1.dialog.title}", naming the left half then the right as the strip draws them (${JSON.stringify(c1.dialog && c1.dialog.list)})`, !!c1.dialog && c1.dialog.title === 'Close 3 tabs?' && JSON.stringify(c1.dialog.list) === JSON.stringify(c0.strip), { dialog: c1.dialog, strip: c0.strip });
  await key('Escape');
  const c2 = await state();
  check('Esc keeps the split whole (3 tabs, still side by side)', !c2.dialog && c2.open === 'ABC' && c2.chainSize === 3 && c2.layout === 'split', c2);
  await click(await stableRect(TAB_X(ids.A, ids.C)));
  await sleep(500);
  const c3 = await state();
  check(`a pane tab's own ✕ (C) closes C alone with no dialog (open "${c3.open}", ${c3.chainSize} tabs, ${c3.layout})`, !c3.dialog && c3.overlays === 0 && c3.open === 'AB' && c3.chainSize === 2, c3);
  await click(await stableRect(FRAME_X(ids.A)));
  await until(`(${STATE}).dialog`, { timeout: 1500 });
  const c4 = await state();
  check(`…the frame's ✕ on the two left asks "${c4.dialog && c4.dialog.title}"`, !!c4.dialog && c4.dialog.title === 'Close 2 tabs?' && c4.dialog.ok === 'Close 2 tabs' && c4.dialog.list.length === 2, c4.dialog);
  await key('Enter');
  await until(`!(${STATE}).open`, { timeout: 2000 });
  const c5 = await state();
  check(`Enter closes both panes (open "${c5.open}")`, c5.open === '' && !c5.dialog, c5);

  // ══ (d) the menus ══
  console.log('(d) the taskbar group\'s "Close group" and the frame\'s own menu ask the same question');
  const menuRow = (re) => `[...document.querySelectorAll('.taskbar-context-menu *')].filter((el) => ${re}.test(el.textContent || '') && ![...el.children].some((k) => ${re}.test(k.textContent || ''))).pop()`;
  ids = await evalJs(SETUP('tabs')); await settle();
  await click(await stableRect(`document.querySelector('.taskbar-group[data-win-id="${ids.A}"]') || document.querySelector('.taskbar-group')`), { button: 'right' });
  await until(`!!(${menuRow('/Close group/')})`, { timeout: 1500 });
  await click(await stableRect(menuRow('/Close group/')));
  await until(`(${STATE}).dialog`, { timeout: 1500 });
  const d1 = await state();
  check(`the taskbar group button's right-click "Close group" asks "${d1.dialog && d1.dialog.title}" (all 3 still open)`, !!d1.dialog && d1.dialog.title === 'Close 3 tabs?' && d1.open === 'ABC', d1);
  await key('Escape');
  const d2 = await state();
  check('…Esc keeps every tab', !d2.dialog && d2.open === 'ABC' && d2.chainSize === 3, d2);
  // the frame's own menu: a right-click on the title bar beside the strip (not on a tab)
  const barPt = await evalJs(`(() => { const w = ${W(ids.A)}; const tb = w.titleBar.getBoundingClientRect(); const strip = w.titleBar.querySelector('.tab-bar-tabs'); const tabs = [...w.titleBar.querySelectorAll('.tab-item')].map((t) => t.getBoundingClientRect()); const ctl = w.titleBar.querySelector('.window-controls').getBoundingClientRect(); const right = Math.max(...tabs.map((r) => r.right)); return { x: Math.round((right + ctl.left) / 2), y: Math.round(tb.top + tb.height / 2), gap: Math.round(ctl.left - right), strip: !!strip }; })()`);
  check(`the frame's title bar has room beside its tabs for a right-click (${barPt.gap} px)`, barPt.gap > 20, barPt);
  await click(barPt, { button: 'right' });
  await until(`!!(${menuRow('/Close group/')})`, { timeout: 1500 });
  const hasGroupRow = await evalJs(`!!(${menuRow('/Close group/')})`);
  check('the frame\'s own title-bar menu says "Close group"', hasGroupRow);
  if (hasGroupRow) {
    await click(await stableRect(menuRow('/Close group/')));
    await until(`(${STATE}).dialog`, { timeout: 1500 });
    const d3 = await state();
    check(`…and asks "${d3.dialog && d3.dialog.title}"`, !!d3.dialog && d3.dialog.title === 'Close 3 tabs?' && d3.open === 'ABC', d3);
    await key('Enter');
    await until(`!(${STATE}).open`, { timeout: 2000 });
    const d4 = await state();
    check(`…Enter closes every tab (open "${d4.open}")`, d4.open === '' && !d4.dialog, d4);
  }
  // a tab's own menu keeps the plain Close (one window)
  ids = await evalJs(SETUP('tabs')); await settle();
  await click(await stableRect(`${W(ids.A)}?.titleBar.querySelector('.tab-item[data-win-id="${ids.B}"] .tab-label')`), { button: 'right' });
  await until(`!!(${menuRow('/Close/')})`, { timeout: 1500 });
  const tabMenu = await evalJs(`({ group: !!(${menuRow('/Close group/')}), close: !!(${menuRow('/^\\s*✕ Close\\s*$/')}) })`);
  check(`a TAB's own right-click menu offers the plain "✕ Close" (one window), never "Close group" (${JSON.stringify(tabMenu)})`, tabMenu.close && !tabMenu.group, tabMenu);
  if (tabMenu.close) {
    await click(await stableRect(menuRow('/^\\s*✕ Close\\s*$/')));
    await sleep(500);
    const d5 = await state();
    check(`…which closes B alone, no dialog (open "${d5.open}")`, !d5.dialog && d5.overlays === 0 && d5.open === 'AC', d5);
  }

  // ══ (e) never asks ══
  console.log('(e) a lone window and a programmatic close never ask');
  ids = await evalJs(SETUP('lone')); await settle();
  await click(await stableRect(FRAME_X(ids.A)));
  await sleep(500);
  const e1 = await state();
  check(`a lone window's ✕ closes it at once, no dialog (open "${e1.open}")`, !e1.dialog && e1.overlays === 0 && e1.open === 'BC', e1);
  ids = await evalJs(SETUP('tabs')); await settle();
  await evalJs(`(() => { const ch = ${W(ids.A)}._tabChain; for (const id of [...ch.tabs]) app.wm.closeWindow(id); return true; })()`);
  await sleep(500);
  const e2 = await state();
  check(`a programmatic close of every member (the layout replay's closeWindow) asks nothing and ends the group (open "${e2.open}")`, !e2.dialog && e2.overlays === 0 && e2.open === '', e2);

  // ══ CONTROL — the pre-fix frame ✕, rebuilt into the scratch bundle ══
  console.log('CONTROL: the frame\'s ✕ back on requestClose (pre-fix), rebuilt into the scratch bundle ⇒ (a) fails');
  const MOD = path.join(wt, 'src/lib/window.js');
  const src = fs.readFileSync(MOD, 'utf8');
  const FIX = 'this.requestCloseGroup(winInfo.id); };';
  check('the door is spelled where the control patches it (once)', src.split(FIX).length === 2);
  fs.writeFileSync(MOD, src.replace(FIX, 'this.requestClose(winInfo.id); };'));
  execFileSync(path.join(wt, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify', '--log-level=error'], { cwd: wt, stdio: 'ignore' });
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(800);
  ids = await evalJs(SETUP('tabs')); await settle();
  const k = await legA('control');
  await sleep(400);
  const k2 = await state();
  check(`CONTROL: the pre-fix ✕ (clicked while C was on show: ${k.before.shown}) shows NO dialog and ends only the hidden host A (open "${k2.open}", ${k2.chainSize} tabs left, ${k2.shown} on show) — (a) can go red`, k.before.shown === 'C' && !k.ask.dialog && k2.open === 'BC' && k2.chainSize === 2 && k2.shown === 'C', { ask: k.ask, after: k2 });
} catch (e) {
  failed++;
  console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}

console.log(failed ? `FAILED (${failed}; ${passed} passed)` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
