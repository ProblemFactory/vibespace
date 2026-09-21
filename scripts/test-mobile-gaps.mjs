#!/usr/bin/env node
// Mobile gaps battery (docs/design-mobile-gaps.md, 2026-09-20 — the top-10
// gaps + the measured defects) at 390×844, DSF 2, an iPhone UA, touch
// emulation and hover:none/pointer:coarse, so app.isMobile AND app.isTouch
// are true exactly as on a phone. A THROWAWAY server in a git worktree (own
// data/, a scratch HOME carrying one seeded For-you item and a view-only
// fixture transcript) + headless chrome over raw CDP, test-sidebar-rail's
// harness. Long-presses are REAL touch sequences (Input.dispatchTouchEvent,
// held past installLongPressContextMenu's 500 ms) — never a synthesized
// contextmenu, which would skip the very path a phone takes.
//   #8  every lifted touch target is ≥ 36 px (nav, sidebar header/search/tabs,
//       status-bar chips, dropdown rows, terminal keys, explorer toolbar)
//   #1  the nav inbox button carries the badge and opens the For-you sheet
//   #3  "+" long-press → the create sheet (Agent / Terminal / Files / Browser
//       [/ Desktop when available]); its Files row opens the explorer
//   #6  explorer phone layout: one Name column, no horizontal overflow, the
//       bookmark strip above the list, long-press → Select… mode
//   #4  the status-bar magnifier opens the search bar
//   #5  the message long-press menu; the hover buttons are display:none
//   #7  switcher: the "+" desktop tab, tab long-press → Rename/Delete, window
//       row long-press → the 'window' menu incl. Move to Desktop
//   #10 the terminal key row shows every key inside the viewport and carries
//       Copy screen
//   TWO CLIENTS (r2, the verifier's A/B harness): a 1280×800 desktop page joins
//       the same server; a phone's saves reach it live and vice versa —
//   #9  ⚙ System… / Ports… / Channels… rows land in windows on the phone AND
//       replay as WINDOWS on the rail-bearing desktop (its rail tab untouched);
//       the desktop's next save leaves the phone's windows alone
//   #10 a desktop minimize is TRUTH on the phone (isMinimized, hidden locally,
//       another window shown, listed under Minimized); the phone's next save
//       does NOT restore it; the phone's own restore tap does
//   defect: the settings nav strip wraps (no horizontal scroller)
// Requires google-chrome (SKIP without). Run: node scripts/test-mobile-gaps.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('mobile-gaps-wt');
const fakeHome = scratchHome('mobile-gaps-home', fs);
const CWD = path.join(fakeHome, 'proj');
const SID = 'f01d0000-0000-4000-8000-0000000ab11e'; // view-only fixture (the fold-ux precedent: a non-guarded id under a scratch HOME)
const VW = 390, VH = 844;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: a seeded For-you item (the store's own persisted shape) + a
// short view-only transcript + two plain files for the explorer ────────────
fs.mkdirSync(CWD, { recursive: true });
fs.writeFileSync(path.join(fakeHome, 'notes.txt'), 'hello\n');
fs.writeFileSync(path.join(fakeHome, 'todo.md'), '- one\n');
{
  const lines = [];
  let ts0 = Date.now() - 3600e3; let n = 0;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  const push = (o) => lines.push(JSON.stringify(o));
  for (let k = 0; k < 6; k++) {
    push({ type: 'user', message: { role: 'user', content: `question ${k}` }, uuid: `u-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID });
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${k}: a line of prose long enough to reach the right edge of a phone screen and wrap once or twice` }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID });
  }
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');
}

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const TODO_TEXT = 'Approve the migration plan before I continue';
fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items: [{
  id: 'ut-mobilegap01', sessionKey: 'claude:' + SID, text: TODO_TEXT, detail: null, urgency: 'high', kind: 'action',
  status: 'open', by: 'agent', sessionName: 'mobile gaps', jobId: null, createdAt: Date.now() - 60e3, resolvedAt: null, resolvedBy: null,
}] }, null, 2));

// A stub `claude` (the CODEX_CMD precedent of test-collab-live-counter): the
// REAL chat-wrapper spawns it through the REAL create path; it answers the
// boot probes, announces a stream-json init frame and then idles on stdin
// exactly where the real CLI waits for its first user turn. This is the ONLY
// way to put a LIVE (non-read-only) chat window on the phone without a vendor
// CLI — and the magnifier is gated to live windows like Ctrl+F itself.
const LIVE_SID = 'f01d0000-0000-4000-8000-0000000ab1fe';
const stubPath = `${wt}-claude-stub`;
fs.writeFileSync(stubPath, `#!/bin/sh
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; done
printf '%s\n' '{"type":"system","subtype":"init","session_id":"${LIVE_SID}","model":"claude-fable-5","cwd":"${CWD}","tools":[],"permissionMode":"default","claude_code_version":"2.1.274"}'
exec cat >/dev/null
`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [`${wt}-chrome`, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
// ONE page client per CDP target (r2: the battery drives TWO pages — the phone
// and a desktop — on the same server, so the helpers are a factory)
const connectPage = async (wsUrl) => {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(200); } return evalJs(expr); };
  // A REAL user input (layout.js marks the client user-dirty on a capture
  // pointerdown — a client that never had one never SENDS a layout save, the
  // 2.90.1 anti-echo gate): a mouse click on the inert toolbar title span.
  // (A modifier-only Shift key never produced a document keydown in headless
  // — measured: the desktop stayed clean and never sent.) VERIFIED against the
  // gate itself, so a silent no-input can never pass as "the other client's
  // save changed nothing".
  const userInput = async () => {
    const pt = await evalJs(`(() => { const el = document.querySelector('#toolbar .toolbar-title'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!pt) throw new Error('userInput: no toolbar title on this page');
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(100);
    if (!(await evalJs('app.layoutManager._userDirty === true'))) throw new Error('userInput: the click did not mark the client user-dirty');
  };
  const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  // Two tabs in one headless window: only the FOREGROUND tab acks input
  // (Chrome never acks a touch/key dispatched to a hidden renderer — the
  // Puppeteer bringToFront class; measured: the first tap after the desktop
  // tab was created hung the battery). Every input helper fronts its page.
  const front = () => cdp('Page.bringToFront');
  return { cdp, evalJs, waitFor, userInput: async () => { await front(); await userInput(); }, front, waitApp, pageErrors, sock };
};
const phone = await connectPage(target.webSocketDebuggerUrl);
const { cdp, evalJs, waitFor, pageErrors } = phone;
// Let a RECEIVER settle before it acts as a sender: _applyRemoteState holds
// `_restoring` for 1 s and _doAutoSave inside that window returns WITHOUT
// rescheduling (the anti-ping-pong cooldown) — measured: a user-dirty desktop
// that opened a window 300 ms after applying a phone save never sent.
const settle = async (client) => { await client.waitFor('!app.layoutManager._restoring', 15000); await sleep(1500); };
// A REAL long-press: touch down, hold past the 500 ms timer, release. The
// coordinates are CSS px (the emulated viewport), taken from the element's
// rect at press time.
const longPress = async (selector, holdMs = 700) => {
  await phone.front();
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; })()`);
  if (!pt) throw new Error('longPress: no element for ' + selector);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(holdMs);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
  return pt;
};
const tap = async (selector) => {
  await phone.front();
  // a row below a scroller's fold is scrolled into view first (the finger does the same); 'nearest' is a no-op for a visible target
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error('tap: no element for ' + selector);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
};
// two quick taps (the verifier's 150–170 ms) → Chrome synthesizes a dblclick
const tapTwice = async (selector, gapMs = 150) => {
  await phone.front();
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error('tapTwice: no element for ' + selector);
  for (let i = 0; i < 2; i++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    await sleep(40);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (i === 0) await sleep(gapMs);
  }
  await sleep(300);
};
// cancelable like a real key (a handler's preventDefault must be observable by the next layer)
const escape = async () => { await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`); await sleep(150); };
const rectsOf = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed').map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), txt: (el.textContent || '').trim().slice(0, 40) }; })`;
const allAtLeast = (rects, min = 36, axis = 'both') => rects.length > 0 && rects.every((r) => (axis === 'h' ? r.h >= min : axis === 'w' ? r.w >= min : (r.h >= min && r.w >= min)));

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  // the phone BEFORE navigation: viewport, UA, touch, the media features App reads at construction
  await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  // A RETURNING user: on a fresh instance with no sessions the first-run
  // wizard (#welcome.onboarding, position:fixed inset:0 z 9600) covers the nav
  // bar by design — every touch below would land on it (measured: the hit-test
  // at the inbox button's centre answered #welcome). app._maybeShowOnboarding
  // reads this flag before showing it.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await phone.waitApp();
  await sleep(1200);

  console.log('phone emulation');
  const env = await evalJs(`({ mobile: app.isMobile, touch: app.isTouch, nav: !!app._mobileNav, toolbar: getComputedStyle(document.getElementById('toolbar')).display, taskbar: getComputedStyle(document.getElementById('taskbar')).display, iw: innerWidth, ih: innerHeight })`);
  check(`app.isMobile + app.isTouch + MobileNav present, #toolbar/#taskbar display:none at ${env.iw}×${env.ih}`, env.mobile && env.touch && env.nav && env.toolbar === 'none' && env.taskbar === 'none', env);

  // ── #8 touch targets: the nav bar ──
  console.log('#8 touch targets');
  const navRects = await evalJs(rectsOf('#mobile-nav-menu, #mobile-nav-new, #mobile-nav-gear, #mobile-nav-todos'));
  check(`nav buttons (menu / new / gear / inbox) are ≥ 36×36 px (${navRects.map((r) => r.w + '×' + r.h).join(', ')})`, navRects.length === 4 && allAtLeast(navRects), navRects);
  // sidebar header + search row + tabs
  await evalJs(`app.sidebar.toggle(true); true`); await sleep(400);
  const sbRects = await evalJs(rectsOf('#sidebar-close, #backend-filter, #manage-toggle, #sort-toggle'));
  check(`sidebar header buttons (close / filter / manage / sort) are ≥ 36×36 px (${sbRects.map((r) => r.w + '×' + r.h).join(', ')})`, sbRects.length === 4 && allAtLeast(sbRects), sbRects);
  const search = await evalJs(rectsOf('#session-filter'));
  check(`sidebar search input is ≥ 36 px tall (${search[0]?.h})`, search.length === 1 && search[0].h >= 36, search);
  const tabRects = await evalJs(rectsOf('.sidebar-tab'));
  check(`sidebar tabs are ≥ 36 px tall (${tabRects.map((r) => r.h).join('/')})`, allAtLeast(tabRects, 36, 'h'), tabRects);
  await evalJs(`app.sidebar.toggle(false); true`); await sleep(300);

  // ── #1 For-you inbox on the nav bar ──
  console.log('#1 For-you inbox');
  const badge = await evalJs(`(() => { const b = document.getElementById('mobile-nav-todos'); return { has: b.classList.contains('ut-has-items'), urg: b.dataset.urgency, pills: [...b.querySelectorAll('.ut-count')].map((p) => p.className.replace('ut-count ', '') + ':' + p.textContent) }; })()`);
  check('the nav inbox button carries the seeded item as a high-urgency badge pill', badge.has && badge.urg === 'high' && badge.pills.length === 1 && badge.pills[0] === 'ut-seg-high:1', badge);
  await tap('#mobile-nav-todos');
  const sheet = await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); const r = p.getBoundingClientRect(); return { hidden: p.classList.contains('hidden'), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top), text: p.textContent.includes(${JSON.stringify(TODO_TEXT)}) }; })()`);
  check(`tapping it opens #user-todos-popup as a full-width sheet under the nav (left ${sheet.l}, right ${sheet.r}, top ${sheet.t}) listing the item`, !sheet.hidden && sheet.l >= 0 && sheet.r <= VW && sheet.w >= VW - 40 && sheet.t >= 40 && sheet.text, sheet);
  // r2: the sheet's OWN controls (tabs 17 px, ✓/✕/⤢ 20 px, the session header 18 px before)
  const sheetCtl = await evalJs(rectsOf('#user-todos-popup .ut-tab, #user-todos-popup .ut-act, #user-todos-popup .ut-group-head'));
  check(`the sheet's tabs / ✓ ✕ ⤢ / session header are ≥ 36 px tall, the buttons ≥ 36 wide (${sheetCtl.map((r) => r.w + '×' + r.h).join(', ')})`, sheetCtl.length >= 6 && sheetCtl.every((r) => r.h >= 36) && sheetCtl.filter((r) => r.txt.length <= 1).every((r) => r.w >= 36), sheetCtl);
  // r2: Escape closes it (a persistent element cannot carry [data-popover] — its own keydown handler)
  await escape();
  check('Escape closes the sheet (its own handler; the popup cannot carry the [data-popover] protocol)', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));
  await tap('#mobile-nav-todos');
  // layering: a [data-popover] node above the sheet takes the Escape first (the global handler removes it), the sheet stays
  await evalJs(`(() => { const m = document.createElement('div'); m.className = 'context-menu'; m.setAttribute('data-popover', ''); m.id = 'r2-pop'; document.body.appendChild(m); return true; })()`);
  await escape();
  check('…and a popover above it takes the Escape first: the popover closes, the sheet stays open', await evalJs(`!document.getElementById('r2-pop') && !document.getElementById('user-todos-popup').classList.contains('hidden')`));
  await tap('#mobile-nav-todos');
  check('tapping the button again closes the sheet (the outside-tap closer exempts it)', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));

  // ── #3 "+" long-press sheet ──
  console.log('#3 "+" long-press sheet');
  await longPress('#mobile-nav-new');
  const createSheet = await evalJs(`(() => { const m = document.querySelector('.context-menu.mobile-sheet'); if (!m) return null; const r = m.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), rows: [...m.querySelectorAll('.context-menu-item')].map((el) => ({ txt: el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), svg: !!el.querySelector('svg') })), vnc: !!app._vncAvailable }; })()`);
  const wantRows = createSheet?.vnc ? ['Agent session', 'Terminal', 'Files', 'Browser', 'Desktop'] : ['Agent session', 'Terminal', 'Files', 'Browser'];
  check(`a real 700 ms press on "+" opens the create sheet with ${wantRows.join(' / ')} (Desktop only when /api/vnc/status says available)`, createSheet && JSON.stringify(createSheet.rows.map((r) => r.txt)) === JSON.stringify(wantRows), createSheet);
  check('the sheet is full-width under the nav and every row is ≥ 44 px with an SVG icon', createSheet && createSheet.l <= 12 && createSheet.r >= VW - 12 && createSheet.t >= 40 && createSheet.rows.length >= 4 && createSheet.rows.every((r) => r.h >= 44 && r.svg), createSheet);
  check('no window opened yet (the press did not also fire the tap)', await evalJs('app.wm.windows.size') === 0);
  await evalJs(`[...document.querySelectorAll('.mobile-sheet .context-menu-item')].find((el) => el.textContent.trim() === 'Files').click(); true`);
  check('its Files row opens the file explorer', await waitFor(`!!document.querySelector('.file-explorer') && app.wm.windows.size === 1`));

  // ── #6 explorer phone layout ──
  console.log('#6 explorer phone layout');
  await waitFor(`document.querySelectorAll('.file-explorer .file-item').length >= 2`);
  const fe = await evalJs(`(() => {
    const ex = document.querySelector('.file-explorer'); const list = ex.querySelector('.file-list'); const bk = ex.querySelector('.file-bookmark-panel');
    const cols = [...ex.querySelectorAll('.file-sort-header .file-sort-col')].map((c) => ({ txt: c.textContent.trim(), r: Math.round(c.getBoundingClientRect().right) }));
    const tools = [...ex.querySelectorAll('.file-toolbar .file-tool-btn')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const pathIn = ex.querySelector('.file-path-input').getBoundingClientRect();
    const rows = [...ex.querySelectorAll('.file-item')].map((r) => Math.round(r.getBoundingClientRect().right));
    const toggle = ex.querySelector('.file-bookmark-toggle');
    return { cols, exScroll: ex.scrollWidth, exClient: ex.clientWidth, listScroll: list.scrollWidth, listClient: list.clientWidth, tools, pathH: Math.round(pathIn.height), pathW: Math.round(pathIn.width),
      bkBottom: Math.round(bk.getBoundingClientRect().bottom), listTop: Math.round(list.getBoundingClientRect().top), bkCollapsed: bk.classList.contains('bk-collapsed'), toggleShown: toggle && getComputedStyle(toggle).display !== 'none', rowsRight: rows, cwd: ex.querySelector('.file-path-input').value };
  })()`);
  check(`ONE column (Name) on the phone; header cell ends inside the viewport (${fe.cols.map((c) => c.txt + '@' + c.r).join(', ')})`, fe.cols.length === 1 && /^Name/.test(fe.cols[0].txt) && fe.cols[0].r <= VW, fe.cols);
  check(`no horizontal overflow: explorer ${fe.exScroll}/${fe.exClient}, list ${fe.listScroll}/${fe.listClient}, every row's right edge ≤ ${VW}`, fe.exScroll <= fe.exClient + 1 && fe.listScroll <= fe.listClient + 1 && fe.rowsRight.every((r) => r <= VW + 1), fe);
  check(`toolbar buttons are ≥ 36×36 (${fe.tools.map((t) => t.join('×')).join(', ')}) and the path input has its own ≥ 36 px line`, fe.tools.length >= 6 && fe.tools.every(([w, h]) => w >= 36 && h >= 36) && fe.pathH >= 36 && fe.pathW >= VW - 60, fe);
  check('bookmarks are a folded STRIP above the list (chevron shown, panel collapsed, its bottom ≤ the list top)', fe.toggleShown && fe.bkCollapsed && fe.bkBottom <= fe.listTop + 1, fe);
  await evalJs(`document.querySelector('.file-bookmark-toggle').click(); true`); await sleep(150);
  check('the chevron unfolds the strip', await evalJs(`!document.querySelector('.file-bookmark-panel').classList.contains('bk-collapsed') && getComputedStyle(document.querySelector('.file-bookmark-list')).display !== 'none'`));
  await evalJs(`document.querySelector('.file-bookmark-toggle').click(); true`);
  // long-press → Select… mode
  await longPress('.file-explorer .file-item');
  const feMenu = await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a row opens its menu with a Select… row first (${feMenu.slice(0, 3).join(' / ')}…)`, feMenu[0] === 'Select…', feMenu);
  await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Select…').click(); true`); await sleep(150);
  const sel1 = await evalJs(`(() => { const b = document.querySelector('.file-select-bar'); return { shown: getComputedStyle(b).display !== 'none', count: b.querySelector('.file-select-count')?.textContent, n: document.querySelectorAll('.file-item.selected').length, btns: [...b.querySelectorAll('.file-select-btn')].map((x) => Math.round(x.getBoundingClientRect().height)) }; })()`);
  check('Select… enters the mode: the bar shows "1 selected", the pressed row is selected, its buttons are ≥ 36 px', sel1.shown && sel1.count === '1 selected' && sel1.n === 1 && sel1.btns.length === 6 && sel1.btns.every((h) => h >= 36), sel1);
  await tap('.file-explorer .file-item:nth-of-type(2)');
  const sel2 = await evalJs(`({ count: document.querySelector('.file-select-count')?.textContent, n: document.querySelectorAll('.file-item.selected').length })`);
  check('a tap on a second row TOGGLES it into the selection (2 selected)', sel2.count === '2 selected' && sel2.n === 2, sel2);
  // r2: a quick double-tap (Chrome synthesizes dblclick) on a FOLDER row must
  // toggle twice — never navigate, never drop the mode (the verifier's repro)
  const dirSel = '.file-explorer .file-item[data-is-dir="true"]';
  const dbl0 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(dirSel)}); return { path: document.querySelector('.file-path-input').value, sel: r?.classList.contains('selected'), name: r?.dataset.name, count: document.querySelector('.file-select-count')?.textContent }; })()`);
  await tapTwice(dirSel, 150);
  const dbl1 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(dirSel)}); return { path: document.querySelector('.file-path-input').value, sel: r?.classList.contains('selected'), bar: getComputedStyle(document.querySelector('.file-select-bar')).display !== 'none', count: document.querySelector('.file-select-count')?.textContent, editors: [...app.wm.windows.values()].filter((w) => w.type === 'editor' || w.type === 'viewer').length }; })()`);
  check(`a double-tap on the "${dbl0.name}" folder row in Select mode keeps the path (${dbl1.path}), keeps the mode (${dbl1.count}) and toggles it twice (selected ${dbl0.sel} → ${dbl1.sel})`, dbl0.name && dbl1.path === dbl0.path && dbl1.bar && dbl1.sel === dbl0.sel && dbl1.count === dbl0.count && dbl1.editors === 0, { dbl0, dbl1 });
  await evalJs(`document.querySelector('.file-select-btn.file-select-done').click(); true`); await sleep(100);
  check('Done leaves the mode and clears the selection', await evalJs(`getComputedStyle(document.querySelector('.file-select-bar')).display === 'none' && document.querySelectorAll('.file-item.selected').length === 0`));
  // negative control: OUTSIDE Select mode the same double-tap still navigates into the folder
  await tapTwice(dirSel, 150);
  const dbl2 = await waitFor(`document.querySelector('.file-path-input').value === ${JSON.stringify(dbl0.path.replace(/\/$/, '') + '/' + dbl0.name)}`, 8000);
  check(`negative control: outside Select mode a double-tap on the folder row navigates into it (${dbl0.path}/${dbl0.name})`, dbl2, await evalJs(`document.querySelector('.file-path-input').value`));

  // ── #4 / #5 chat: search chip, chips ≥ 36, hover buttons gone, message long-press ──
  console.log('#4/#5 chat');
  await evalJs(`app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'mobile gaps'); true`);
  check('the view-only fixture chat renders', await waitFor(`document.querySelectorAll('.chat-view .chat-msg').length >= 6`, 20000));
  await sleep(600);
  const chips = await evalJs(`(() => { const bar = document.querySelector('.window-active .chat-view .chat-status-bar');
    return { barH: Math.round(bar.getBoundingClientRect().height), search: !!bar.querySelector('.chat-status-search'), searchBar: !!document.querySelector('.window-active .chat-search-bar'),
      chips: [...bar.querySelectorAll('.chat-status-clickable')].map((c) => ({ cls: c.className.split(' ')[0], h: Math.round(c.getBoundingClientRect().height) })) }; })()`);
  check(`every status-bar chip is ≥ 36 px tall (${chips.chips.map((c) => c.h).join('/')})`, chips.chips.length >= 3 && chips.chips.every((c) => c.h >= 36), chips);
  check('a VIEW-ONLY window builds no ChatSearch, so it shows no magnifier either (the chip follows Ctrl+F\'s own gate)', !chips.search && !chips.searchBar, chips);
  await evalJs(`document.querySelector('.window-active .chat-view .chat-status-model').click(); true`); await sleep(250);
  const ddRows = await evalJs(`[...document.querySelectorAll('.chat-view .chat-status-dropdown-item')].map((el) => Math.round(el.getBoundingClientRect().height))`);
  check(`the model dropdown rows are ≥ 36 px (${ddRows.join('/')})`, ddRows.length > 0 && ddRows.every((h) => h >= 36), ddRows);
  await escape();
  const hover = await evalJs(`(() => { const btns = [...document.querySelectorAll('.chat-view .chat-msg > .chat-open-editor-btn')]; return { n: btns.length, shown: btns.filter((b) => getComputedStyle(b).display !== 'none').length }; })()`);
  check(`the ${hover.n} per-message hover buttons are display:none ≤768px (the overlap defect)`, hover.n > 0 && hover.shown === 0, hover);
  // a real long-press on an assistant message → the message menu
  await evalJs(`document.querySelector('.chat-message-list').scrollTop = document.querySelector('.chat-message-list').scrollHeight; true`); await sleep(200);
  await longPress('.chat-view .chat-msg.chat-msg-assistant');
  const msgMenu = await evalJs(`[...document.querySelectorAll('.context-menu.chat-msg-menu .context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a message opens the message menu: ${msgMenu.join(' / ')}`, msgMenu.includes('Copy text') && msgMenu.includes('Open in editor') && msgMenu.includes('Message details'), msgMenu);
  check('…without a Fork row in a VIEW-ONLY window (the fork gate holds)', !msgMenu.includes('Fork from here'), msgMenu);
  await evalJs(`[...document.querySelectorAll('.chat-msg-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Message details').click(); true`); await sleep(200);
  check('Message details opens the per-message metadata popup', await evalJs(`!!document.querySelector('.msg-meta-pop')`));
  await escape(); await evalJs(`document.querySelectorAll('.msg-meta-pop').forEach((p) => p.remove()); true`);

  // a LIVE chat window (stub CLI behind the real wrapper) carries the magnifier
  console.log('#4 chat search on a LIVE window');
  {
    const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => liveWs.on('open', r));
    const frames = [];
    liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'live1' }));
    let sid = null;
    for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(500); }
    check('a live claude chat session is created through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
    if (sid) {
      await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'live stub', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
      check('the live window attaches on the phone (composer present)', await waitFor(`!!document.querySelector('.window-active .chat-view .chat-input') && !!document.querySelector('.window-active .chat-view .chat-status-search')`, 20000));
      const mag = await evalJs(`(() => { const s = document.querySelector('.window-active .chat-view .chat-status-search'); if (!s) return null; const r = s.getBoundingClientRect(); return { display: getComputedStyle(s).display, w: Math.round(r.width), h: Math.round(r.height), svg: !!s.querySelector('svg') }; })()`);
      check(`the live status bar carries the search magnifier as a ≥ 36×36 SVG chip (${mag?.display}, ${mag?.w}×${mag?.h})`, mag && mag.display !== 'none' && mag.w >= 36 && mag.h >= 36 && mag.svg, mag);
      await evalJs(`document.querySelector('.window-active .chat-view .chat-status-search').click(); true`); await sleep(250);
      check('tapping the magnifier opens the search bar (Ctrl+F\'s touch face, the same open())', await evalJs(`(() => { const b = document.querySelector('.window-active .chat-view .chat-search-bar'); return !!b && !b.classList.contains('hidden') && getComputedStyle(b).display !== 'none'; })()`));
      // r2: the bar's own prev / next / close were 24×17 / 24×17 / 20×20
      const sbBtns = await evalJs(rectsOf('.window-active .chat-view .chat-search-bar button'));
      check(`the search bar's prev / next / close buttons are ≥ 36×36 (${sbBtns.map((r) => r.w + '×' + r.h).join(', ')})`, sbBtns.length === 3 && allAtLeast(sbBtns), sbBtns);
    }
    try { liveWs.close(); } catch {}
  }

  // ── #7 switcher: "+" desktop tab, tab long-press, window-row long-press ──
  console.log('#7 desktop management in the switcher');
  await evalJs(`document.getElementById('mobile-nav-title').click(); true`); await sleep(300);
  const sw0 = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { open: !!p, add: !!p?.querySelector('.mobile-desk-add'), tabs: [...(p?.querySelectorAll('.mobile-desk-tab:not(.mobile-desk-add)') || [])].map((t) => t.textContent.trim()), desks: app.desktopManager.desktops.length, rows: p?.querySelectorAll('.mobile-win-row').length, wins: [...app.wm.windows.values()].filter((w) => !w.isMinimized && !w._hiddenByDesktop).length, tabH: Math.round(p?.querySelector('.mobile-desk-add')?.getBoundingClientRect().height || 0), closeBtns: [...(p?.querySelectorAll('.mobile-win-row button') || [])].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }; })()`);
  check(`the switcher lists ${sw0.desks} desktop tab(s) + a "+" tab (≥ 36 px) and one row per window on this desktop (${sw0.rows} of ${sw0.wins})`, sw0.open && sw0.add && sw0.tabs.length === sw0.desks && sw0.tabH >= 36 && sw0.rows === sw0.wins && sw0.rows >= 3, sw0);
  check(`every window row's ✕ is ≥ 36×36 (r2; was 32×32: ${sw0.closeBtns.map((b) => b.join('×')).join(', ')})`, sw0.closeBtns.length === sw0.rows && sw0.closeBtns.every(([w, h]) => w >= 36 && h >= 36), sw0.closeBtns);
  await evalJs(`document.querySelector('.mobile-win-switcher .mobile-desk-add').click(); true`); await sleep(1200);
  const sw1 = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { open: !!p, tabs: [...(p?.querySelectorAll('.mobile-desk-tab:not(.mobile-desk-add)') || [])].map((t) => t.textContent.trim()), desks: app.desktopManager.desktops.length, active: app.desktopManager.activeDesktopId, lastId: app.desktopManager.desktops[app.desktopManager.desktops.length - 1].id }; })()`);
  check(`"+" creates a desktop and switches to it (${sw1.desks} desktops, tabs: ${sw1.tabs.join(' | ')})`, sw1.open && sw1.desks === sw0.desks + 1 && sw1.tabs.length === sw1.desks && sw1.active === sw1.lastId, sw1);
  await longPress('.mobile-win-switcher .mobile-desk-tab:not(.mobile-desk-add)');
  const deskMenu = await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a desktop tab offers Rename / Delete (${deskMenu.join(' / ')})`, deskMenu.length === 2 && deskMenu[0] === 'Rename' && deskMenu[1] === 'Delete', deskMenu);
  check('…and the switcher stays open underneath (a child popover is not a dismissal)', await evalJs(`!!document.querySelector('.mobile-win-switcher')`));
  await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Delete').click(); true`); await sleep(1200);
  check('Delete removes the new desktop and the tabs re-render', await evalJs(`app.desktopManager.desktops.length === ${sw0.desks} && document.querySelectorAll('.mobile-win-switcher .mobile-desk-tab:not(.mobile-desk-add)').length === ${sw0.desks}`));
  // a second desktop so Move to Desktop has a target, then the window-row menu
  await evalJs(`app.desktopManager.createDesktop('Second'); true`); await sleep(300);
  await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); document.getElementById('mobile-nav-title').click(); true`); await sleep(300);
  await longPress('.mobile-win-switcher .mobile-win-row');
  const winMenu = await evalJs(`[...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a window row opens the 'window' menu incl. Move to Desktop and Close (${winMenu.join(' / ')})`, winMenu.some((x) => /Move to Desktop/.test(x)) && winMenu.some((x) => /Close/.test(x)), winMenu);
  await escape(); await evalJs(`document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); document.querySelector('.mobile-win-switcher')?.remove(); true`);

  // ── #10 terminal key row: every key inside the viewport, Copy screen present ──
  console.log('#10 terminal key row');
  await evalJs(`app.openShellTerminal(); true`);
  const termUp = await waitFor(`document.querySelectorAll('.window-active .mobile-term-keys .mobile-term-key').length >= 16`, 25000);
  check('a plain shell terminal opens on the phone (real dtach session)', termUp);
  if (termUp) {
    const keys = await evalJs(`(() => { const ks = [...document.querySelectorAll('.window-active .mobile-term-keys .mobile-term-key')]; const row = document.querySelector('.window-active .mobile-term-keys');
      return { n: ks.length, rects: ks.map((k) => { const r = k.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; }), copy: !!row.querySelector('.mobile-term-copy'), emoji: /[\\u{1F300}-\\u{1FAFF}]/u.test(row.textContent), rowScroll: row.scrollWidth, rowClient: row.clientWidth }; })()`);
    check(`all ${keys.n} keys sit inside the viewport (max right ${Math.max(...keys.rects.map((r) => r.r))} ≤ ${VW}; row ${keys.rowScroll}/${keys.rowClient})`, keys.rects.every((r) => r.l >= 0 && r.r <= VW + 1) && keys.rowScroll <= keys.rowClient + 1, keys);
    check(`every key is ≥ 36×36 px (min ${Math.min(...keys.rects.map((r) => r.h))} tall / ${Math.min(...keys.rects.map((r) => r.w))} wide)`, keys.rects.every((r) => r.h >= 36 && r.w >= 36), keys.rects);
    check('the row carries a Copy-screen key and no emoji glyph (SVG icons only)', keys.copy && !keys.emoji, keys);
    // Copy screen reads the buffer: with nothing rendered yet it must SAY so rather than copy '' silently
    await sleep(1200); // let the shell paint its first lines
    await evalJs(`navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; document.querySelector('.window-active .mobile-term-copy').click(); true`);
    await sleep(300);
    const copied = await evalJs(`({ toasts: [...document.querySelectorAll('.global-toast')].map((t) => t.textContent.trim()), text: window.__copied == null ? null : String(window.__copied) })`);
    const m = copied.toasts.map((t) => t.match(/Copied (\d+) lines/)).find(Boolean);
    const lines = copied.text == null ? null : copied.text.split('\n');
    check(`tapping Copy screen copies the visible rows and SAYS so (toast "${m ? m[0] : copied.toasts.join('|')}", ${lines ? lines.length : 'no'} lines reached the clipboard, trailing blank lines dropped)`, !!m && lines && lines.length === Number(m[1]) && lines[lines.length - 1].trim() !== '' && copied.text.trim().length > 0, { toasts: copied.toasts, head: (copied.text || '').slice(0, 80) });
  }

  // ── a SECOND client: a 1280×800 desktop page on the same server (r2, the
  // verifier's A/B harness). A phone's layout saves reach it live and its
  // saves reach the phone; every cross-client leg below asserts on BOTH ends. ──
  console.log('a desktop client joins');
  const dTarget = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const desk = await connectPage(dTarget.webSocketDebuggerUrl);
  await desk.cdp('Runtime.enable'); await desk.cdp('Page.enable');
  await desk.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await desk.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await desk.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await desk.waitApp();
  // layout.js keeps `_restoring` for 5 s after a boot restore and DROPS every
  // inbound layout-sync meanwhile (measured: the phone's first save after the
  // join was never applied) — wait it out before the phone sends anything
  await desk.waitFor('!app.layoutManager._restoring && !(app.desktopManager && app.desktopManager._restoring)', 15000);
  await sleep(300);
  const denv = await desk.evalJs(`({ mobile: app.isMobile, rail: !!app.sidebar._railEl, tab: app.sidebar._activeTab, iw: innerWidth, wins: app.wm.windows.size, seq: app.layoutManager._lastRemoteSeq })`);
  check(`a desktop client (${denv.iw} px, activity rail ${denv.rail ? 'on' : 'OFF'}, tab '${denv.tab}') joins the same instance (${denv.wins} windows restored from the shared record)`, !denv.mobile && denv.rail && denv.iw === 1280, denv);

  // ── #9 ⚙ System… / Ports… / Channels… land in windows (no rail on a phone) ──
  console.log('#9 gear rows → windows on the phone, WINDOWS on the desktop');
  // a REAL tap on the gear (user-dirty on the phone, so its saves go out)
  const gearRows = async () => { await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`); await tap('#mobile-nav-gear'); await sleep(300); return evalJs(`[...document.querySelectorAll('.global-settings-popover .gs-menu-item')].map((el) => el.textContent.trim())`); };
  const rows = await gearRows();
  check(`the ⚙ menu lists System… / Ports… / Channels… on the phone (${rows.filter((r) => /System…|Ports…|Channels…/.test(r)).join(' / ')})`, ['System…', 'Ports…', 'Channels…'].every((l) => rows.some((r) => r.startsWith(l))), rows);
  const openGear = async (label, sel, type) => {
    const dBefore = await desk.evalJs(`({ tab: app.sidebar._activeTab, open: app.sidebar.isOpen })`);
    await evalJs(`[...document.querySelectorAll('.global-settings-popover .gs-menu-item')].find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)})).click(); true`);
    const ok = await waitFor(`!!document.querySelector('.window-active ${sel}') && [...app.wm.windows.values()].some((w) => w.type === ${JSON.stringify(type)})`, 15000);
    check(`⚙ ${label} opens a '${type}' window hosting the rail panel renderer (${sel})`, ok);
    // r2: the phone's layout save replays it on the rail-bearing desktop as a WINDOW with the same id
    const id = await evalJs(`[...app.wm.windows.values()].find((w) => w.type === ${JSON.stringify(type)})?.id`);
    const mirrored = await desk.waitFor(`[...app.wm.windows.values()].some((w) => w.type === ${JSON.stringify(type)} && w.id === ${JSON.stringify(id)})`, 15000);
    const dAfter = await desk.evalJs(`({ tab: app.sidebar._activeTab, open: app.sidebar.isOpen, railPanel: !!app.sidebar.listEl?.querySelector('.rail-panel-' + ${JSON.stringify(type)}), wins: [...app.wm.windows.values()].filter((w) => w.type === ${JSON.stringify(type)}).map((w) => w.id) })`);
    check(`…and the desktop client (rail on) replays it as a '${type}' WINDOW ${id} — its rail tab stays '${dBefore.tab}', no rail panel, its sidebar does not open by itself`, mirrored && dAfter.tab === dBefore.tab && !dAfter.railPanel && !(dAfter.open && !dBefore.open) && dAfter.wins.length === 1, { dBefore, dAfter, mirrored, id });
    await gearRows();
  };
  await openGear('System…', '.rail-panel-system', 'system');
  await openGear('Ports…', '.rail-panel-ports', 'ports');
  await openGear('Channels…', '.rail-panel-channels .chan-head', 'channels');
  await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`);
  check('opening System… again focuses the existing window (singleton)', await evalJs(`(() => { const before = app.wm.windows.size; app._showGlobalSettings(document.getElementById('mobile-nav-gear')); [...document.querySelectorAll('.global-settings-popover .gs-menu-item')].find((el) => el.textContent.trim().startsWith('System…')).click(); document.querySelector('.global-settings-popover')?.remove(); return app.wm.windows.size === before && app.wm.windows.get(app.wm.activeWindowId)?.type === 'system'; })()`));
  // the desktop's OWN next save must leave the phone's three windows alone
  {
    const phoneBefore = await evalJs(`[...app.wm.windows.values()].filter((w) => ['system', 'ports', 'channels'].includes(w.type)).map((w) => w.type + ':' + w.id).sort()`);
    const pseq = await evalJs(`app.layoutManager._lastRemoteSeq`);
    await settle(desk);
    await desk.userInput();
    await desk.evalJs(`app.openFileExplorer(); true`);
    const arrived = await waitFor(`app.layoutManager._lastRemoteSeq > ${pseq}`, 15000);
    await sleep(800);
    const phoneAfter = await evalJs(`({ three: [...app.wm.windows.values()].filter((w) => ['system', 'ports', 'channels'].includes(w.type)).map((w) => w.type + ':' + w.id).sort(), files: [...app.wm.windows.values()].filter((w) => w.type === 'files').length })`);
    check(`the desktop's next layout save (it opened an explorer; seq ${pseq} → later) reaches the phone and leaves the phone's System / Ports / Channels windows in place (${phoneAfter.three.length} of ${phoneBefore.length}; explorers now ${phoneAfter.files})`, arrived && JSON.stringify(phoneAfter.three) === JSON.stringify(phoneBefore) && phoneAfter.files === 2, { phoneBefore, phoneAfter, arrived });
  }

  // ── #10 minimize: the TRUTH is shared, only the display is local (r2) ──
  console.log('#10 minimize across two clients');
  {
    const filesId = await evalJs(`[...app.wm.windows.values()].find((w) => w.type === 'files')?.id`);
    check('the desktop client mirrors the phone\'s explorer', await desk.waitFor(`app.wm.windows.has(${JSON.stringify(filesId)})`, 15000));
    // make it the phone's ACTIVE window, so the phone has to show something else once it is minimized
    await evalJs(`app.wm.focusWindow(${JSON.stringify(filesId)}); true`); await sleep(300);
    await settle(desk);
    await desk.userInput();
    const dmin = await desk.evalJs(`(() => { app.wm.minimize(${JSON.stringify(filesId)}); const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w.isMinimized, display: w.element.style.display }; })()`);
    check('desktop A/B: minimize on the desktop client hides the window and marks it minimized (unchanged)', dmin.min === true && dmin.display === 'none', dmin);
    const pm = await waitFor(`app.wm.windows.get(${JSON.stringify(filesId)})?.isMinimized === true`, 15000);
    const ps = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); const a = app.wm.windows.get(app.wm.activeWindowId); return { min: w?.isMinimized, display: w ? getComputedStyle(w.element).display : null, activeIsIt: app.wm.activeWindowId === ${JSON.stringify(filesId)}, activeType: a?.type, activeShown: a ? getComputedStyle(a.element).display : 'none' }; })()`);
    check(`the phone applies the synced minimize as TRUTH (isMinimized true), hides it locally (computed ${ps.display}) and shows another window instead (${ps.activeType}: ${ps.activeShown})`, pm && ps.min === true && ps.display === 'none' && !ps.activeIsIt && ps.activeShown !== 'none', ps);
    await tap('#mobile-nav-title'); await sleep(300);
    const swm = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { head: !!p?.querySelector('.mobile-win-minimized-head'), minRows: [...(p?.querySelectorAll('.mobile-win-row.mobile-win-minimized') || [])].map((r) => r.textContent.trim().slice(0, 30)), plain: p?.querySelectorAll('.mobile-win-row:not(.mobile-win-minimized)').length }; })()`);
    check(`the switcher lists it under Minimized (${swm.minRows.join(' | ')}) beside ${swm.plain} plain rows`, swm.head && swm.minRows.length === 1 && swm.plain >= 1, swm);
    // the phone's next save (a real tap focuses another row → z changes → a send) must NOT restore it on the desktop
    const dseq = await desk.evalJs(`app.layoutManager._lastRemoteSeq`);
    await tap('.mobile-win-switcher .mobile-win-row:not(.mobile-win-minimized)');
    const arrived = await desk.waitFor(`app.layoutManager._lastRemoteSeq > ${dseq}`, 15000);
    await sleep(800);
    const dAfter = await desk.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w?.isMinimized, display: w?.element.style.display }; })()`);
    check(`the phone's save arrives on the desktop (seq ${dseq} → later) and the desktop's window STAYS minimized (r1 restored it: min:false rode the phone's save)`, arrived && dAfter.min === true && dAfter.display === 'none', { arrived, dAfter });
    // the user's own restore is intent — it travels
    await tap('#mobile-nav-title'); await sleep(300);
    const rowGeo = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); const r = p?.querySelector('.mobile-win-row.mobile-win-minimized'); if (!p || !r) return null; const pr = p.getBoundingClientRect(), rr = r.getBoundingClientRect(); return { popBottom: Math.round(pr.bottom), rowTop: Math.round(rr.top), rowBottom: Math.round(rr.bottom), ih: innerHeight }; })()`);
    await tap('.mobile-win-switcher .mobile-win-row.mobile-win-minimized');
    const pr = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w.isMinimized, display: getComputedStyle(w.element).display, active: app.wm.activeWindowId === ${JSON.stringify(filesId)} }; })()`);
    check(`a tap on the Minimized row (scrolled into the sheet's view first: row ${rowGeo?.rowTop}–${rowGeo?.rowBottom}, sheet bottom ${rowGeo?.popBottom}) restores it on the phone (shown, active)`, pr.min === false && pr.display !== 'none' && pr.active, { pr, rowGeo });
    check('…and the restore reaches the desktop (intent travels; the display does not)', await desk.waitFor(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return !!w && w.isMinimized === false && w.element.style.display !== 'none'; })()`, 15000));
  }

  // ── measured defect: the settings nav strip wraps ──
  console.log('settings nav strip');
  await evalJs(`app._settingsUI?.open(); true`);
  check('the Settings window opens', await waitFor(`!!document.querySelector('.settings-window .settings-nav')`));
  const nav = await evalJs(`(() => { const n = document.querySelector('.settings-window .settings-nav'); const items = [...n.querySelectorAll('.settings-nav-item')]; return { scroll: n.scrollWidth, client: n.clientWidth, wrap: getComputedStyle(n).flexWrap, n: items.length, inside: items.every((i) => i.getBoundingClientRect().right <= innerWidth + 1), minH: Math.min(...items.map((i) => Math.round(i.getBoundingClientRect().height))) }; })()`);
  check(`the settings nav wraps (${nav.n} categories, scrollWidth ${nav.scroll} ≤ ${nav.client}, every item inside the viewport, rows ≥ 36 px)`, nav.wrap === 'wrap' && nav.scroll <= nav.client + 1 && nav.inside && nav.minH >= 36, nav);

  check('no uncaught page exceptions during the battery', pageErrors.length === 0, pageErrors.slice(0, 3));
  check('no uncaught page exceptions on the desktop client either', desk.pageErrors.length === 0, desk.pageErrors.slice(0, 3));
  try { desk.sock.close(); } catch {}
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
