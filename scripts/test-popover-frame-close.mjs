#!/usr/bin/env node
// A MENU CLOSES ON A PRESS INTO A FRAME, AND ITS ANCHOR TOGGLES (lane menu-close-residue, B-5bd5 — the two residues
// lane M «lane-popover-close» left, the owner 2026-09-26): headless Chrome on a throwaway worktree server, the REAL
// client driven the way a person drives it (real CDP presses; nothing dispatched from script but the two controls).
//   ① THE ⚙ TOGGLE: ⚙ pressed while its menu is open CLOSES it (pre-fix: the dedup rebuilt it — a new popover under the
//      same button); Enter on the focused ⚙ toggles too (the toggle is keyed on the anchor, not on a press).
//   ② A PRESS INTO A FRAME: a Web view window on a SAME-ORIGIN page (a static page of this server), a Web view on an
//      OPAQUE-ORIGIN page (a data: URL — cross-origin to the app), and a sandboxed srcdoc artboard in the Design window
//      (allow-scripts only — its own process). The parent page never sees that pointerdown (counted: 0); the one
//      signal is `window` blur with document.activeElement already the frame — the ⚙ popover (createPopover) and the
//      usage popup (a hand-built onOutsidePress site, once:false) close on it, nothing per site.
//   ③ THE FALSE-CLOSE CONTROLS: the brief's simulation — window.dispatchEvent(new Event('blur')) with the body active —
//      leaves the menu open; a REAL blur to another top-level window (a second target brought to front) leaves it open
//      (measured: activeElement unchanged, hasFocus() false); Esc still closes (the [data-popover] protocol).
//   ④ THE RED CONTROL: the same legs on a PRE-FIX bundle — the throwaway worktree's utils.js with the toggle and the
//      blur listener switched off, one esbuild — ⚙ REBUILDS on the second press and the menu stays OPEN over every
//      frame; the real bundle restored, the legs pass again (the fix, not the reload).
// The measurement behind ②/③ (what the parent sees per frame kind) is the lane's probe, docs/changelog-engineering.md
// 2.369.332. The PURE verdict (shouldCloseOnBlur) and the fake-DOM legs are scripts/test-outside-press.mjs.
// Throwaway server in a git worktree (scripts/scratch.mjs paths + ports) + headless chrome over raw CDP.
// Run: node scripts/test-popover-frame-close.mjs   (SKIPs without chrome; ~45 s)
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, takeCspReports } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('popover-frame-smoke');
const PROFILE = scratch('popover-frame-chrome');
const DESIGN = scratch('popover-frame-design'); // the artboards the Design window draws
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let untilJs = null;
const until = async (expr, { timeout = 3000, step = 50 } = {}) => { const t0 = Date.now(); for (;;) { const v = await untilJs(expr); if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };

// ── throwaway server in a worktree (overlays the gate's ALREADY-BUILT public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// the SAME-ORIGIN page a Web view window shows (served by this server's static root)
const FRAME_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>frame page</title></head><body style="margin:0;background:#dfe9d6;font:16px sans-serif"><h1 style="margin:16px">A page inside a Web view</h1><p style="margin:16px">Press anywhere in here.</p></body></html>';
fs.writeFileSync(path.join(wt, 'public', 'vs-frame-probe.html'), FRAME_PAGE);
// the artboards: two files the Design window draws as sandboxed srcdoc frames
fs.mkdirSync(DESIGN, { recursive: true });
fs.writeFileSync(path.join(DESIGN, 'Main.html'), '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:800px;height:500px;background:#fff;font:16px sans-serif}</style></head><body><h1 style="margin:24px">Main</h1><p style="margin:24px">An artboard.</p></body></html>');
fs.writeFileSync(path.join(DESIGN, 'About.html'), '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:800px;height:500px;background:#fff;font:16px sans-serif}</style></head><body><h1 style="margin:24px">About</h1></body></html>');

// the registry row the Design window needs (data/designs.json — the server reads it at boot; the read refuses an unregistered folder)
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data', 'designs.json'), JSON.stringify({ designs: [{ id: 'd-frame-probe', sessionId: null, conversationId: null, host: null, dir: DESIGN, title: 'frame probe', createdAt: Date.now(), openedAt: Date.now() }] }));
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
// a REAL MOUSE (test-gear-menu's lesson): headless linux chrome answers hover:none without these blink settings
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE, '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, PROFILE]) try { endRootedProcesses(root); } catch {} // §57b: whatever the server (or Chrome) started under its root ends with it
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [PROFILE, DESIGN]) try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} // Chrome releases its profile a beat after SIGKILL
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { await sleep(250); } }
const connect = async (url) => {
  const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, cdp };
};
const { cdp } = await connect(target.webSocketDebuggerUrl);
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
untilJs = evalJs;
const URL = `http://127.0.0.1:${PORT}/`;
const POLL_APP = 'new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })';
const VK = { Enter: 13, Escape: 27 };
// Enter carries its text: a native button activates on the keypress, which CDP sends only with `text`
const key = async (k) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: VK[k], ...(k === 'Enter' ? { text: '\r' } : {}) }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await sleep(120); };
const pressAt = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
};
const center = async (sel) => { const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!r) throw new Error('no element ' + sel); return r; };
const click = async (sel) => { const c = await center(sel); await pressAt(c.x, c.y); };
const POP = '.global-settings-popover';
const SHOTS = process.env.VS_UI_SHOTS_DIR || scratch('popover-frame-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const popState = () => evalJs(`(() => { const p = document.querySelector('${POP}'); const a = document.activeElement; return { pop: !!p, tok: p ? p.__tok || null : null, menu: !!(p && p.querySelector('.gs-menu')), active: a ? a.tagName + (a.id ? '#' + a.id : '') + '.' + String(a.className || '').split(' ')[0] : null, hasFocus: document.hasFocus(), pdown: window.__pdown || 0 }; })()`);
// a point INSIDE a frame element that is not under the open popover (the popover hangs top-right; take the frame's lower-left quarter) — and SAY what is there
const frameSpot = async (frameExpr) => evalJs(`(() => { const f = ${frameExpr}; if (!f) return null; const r = f.getBoundingClientRect(); const x = r.left + r.width * 0.25, y = r.top + r.height * 0.75; const at = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, onFrame: at === f, at: at ? at.tagName + '.' + String(at.className || '').split(' ')[0] : null }; })()`);
const boot = async () => { await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: URL }); await sleep(1500); await evalJs(POLL_APP); await sleep(600); await evalJs(`window.__pdown = 0; document.addEventListener('pointerdown', () => { window.__pdown++; }, { capture: true, passive: true }); true`); };

/** the legs, under the bundle in the page: `fixed` = what the fixed code does (the control runs them with fixed=false) */
async function legs(label, fixed) {
  console.log(`${label}`);
  const want = (fixedOutcome, prefixOutcome) => (fixed ? fixedOutcome : prefixOutcome);
  // ① ⚙ pressed again
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);
  await click('#btn-global-settings');
  const s1 = await popState();
  check(`${label} (setup) a real press on ⚙ opens its menu (${JSON.stringify(s1)})`, s1.pop && s1.menu, s1);
  await evalJs(`document.querySelector('${POP}').__tok = 'first'; true`);
  await shot(`${fixed ? 'fixed' : 'prefix'}-gear-open.png`);
  await click('#btn-global-settings');
  const s2 = await popState();
  check(`${label} ⚙ pressed while its menu is open: ${want('CLOSED — no popover left', 'REBUILT (the residue) — a NEW popover under the same button')} (${JSON.stringify(s2)})`, want(!s2.pop, s2.pop && s2.tok === null), s2);
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);
  // ①b Enter on the focused ⚙ (no press at all): open, then closed — the toggle is keyed on the anchor
  await evalJs(`document.getElementById('btn-global-settings').focus(); true`);
  await key('Enter'); const k1 = await popState(); await evalJs(`if (document.querySelector('${POP}')) document.querySelector('${POP}').__tok = 'kb'; document.getElementById('btn-global-settings').focus(); true`);
  await key('Enter'); const k2 = await popState();
  check(`${label} Enter on the focused ⚙ opens, Enter again ${want('closes', 'rebuilds')} (${JSON.stringify({ k1, k2 })})`, k1.pop && want(!k2.pop, k2.pop && k2.tok === null), { k1, k2 });
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);
  // ② a press into a frame — the Web view window on a SAME-ORIGIN page
  await evalJs(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); window.__wv = app.openBrowser(${JSON.stringify(URL + 'vs-frame-probe.html')}); true`);
  const loaded = await until(`(() => { const f = window.__wv && window.__wv.content.querySelector('iframe'); try { return !!(f && f.contentDocument && /frame page/.test(f.contentDocument.title)); } catch { return false; } })()`, { timeout: 8000 });
  check(`${label} (setup) a Web view window shows the server's own page in its frame (same-origin: contentDocument readable)`, !!loaded);
  await evalJs(`const w = window.__wv; app.wm.setBounds ? 0 : 0; true`);
  let spot = await frameSpot(`window.__wv && window.__wv.content.querySelector('iframe')`);
  check(`${label} (setup) a point inside the Web view frame is the frame itself (${JSON.stringify(spot)})`, !!spot && spot.onFrame, spot);
  await click('#btn-global-settings');
  const o1 = await popState();
  check(`${label} (setup) ⚙ open over the Web view (${JSON.stringify(o1)})`, o1.pop && o1.menu, o1);
  await shot(`${fixed ? 'fixed' : 'prefix'}-gear-over-webview.png`);
  const pd0 = (await popState()).pdown;
  await pressAt(spot.x, spot.y);
  const f1 = await popState();
  check(`${label} a press INTO the same-origin Web view frame: the parent saw NO pointerdown (${f1.pdown - pd0}), the focus is the frame (${f1.active}), the menu is ${want('CLOSED', 'still OPEN (the residue)')} (${JSON.stringify(f1)})`, f1.pdown - pd0 === 0 && /^IFRAME/.test(f1.active || '') && want(!f1.pop, f1.pop), f1);
  await shot(`${fixed ? 'fixed' : 'prefix'}-after-press-into-webview.png`);
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);
  // ② (a fact, measured here) a Web view on a CROSS-ORIGIN page (a data: URL): the window HIDES its frame and shows its
  // "blocked" note — the Web view's X-Frame-Options heuristic reads any unreadable document as blocked — so a Web view
  // frame is always same-origin; the app's opaque-origin frames are its sandboxed ones (plugin windows, the mail frame,
  // the Design artboards: the next leg)
  await evalJs(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); window.__wv = app.openBrowser('data:text/html,' + encodeURIComponent(${JSON.stringify(FRAME_PAGE)})); true`);
  await sleep(600);
  const xo = await evalJs(`(() => { const f = window.__wv && window.__wv.content.querySelector('iframe'); if (!f) return { frame: 'none' }; let doc; try { doc = f.contentDocument ? 'readable' : 'opaque'; } catch (e) { doc = 'threw ' + e.name; } return { doc, hidden: f.style.display === 'none', note: /blocked/.test(window.__wv.content.textContent) }; })()`);
  check(`${label} (fact) a Web view on a cross-origin page hides its frame and says the site blocked embedding — a Web view frame is only ever same-origin (${JSON.stringify(xo)})`, xo.doc === 'opaque' && xo.hidden && xo.note, xo);
  // int332 (lane app-page-csp's teardown, .331): the data: Web view above is this suite's OWN cross-origin plant — the app page's
  // report-only policy notes ONE frame-src line for it (deduped by key across the passes); the suite TAKES it, the teardown judges the rest
  await takeCspReports((r) => r.directive === 'frame-src' && String(r.blocked) === 'other', { want: 1, ms: 3000 });
  // ② the Design artboard (a sandboxed frame — srcdoc, or since .331 the hub's frame host (writeFrame keeps the document as __frameDoc); its own process) — the ⚙ popover AND the usage popup (a hand-built onOutsidePress site)
  await evalJs(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); window.__dw = app.openDesign({ host: '', dir: ${JSON.stringify(DESIGN)} }); true`);
  const frames = await until(`(() => { const w = window.__dw; const f = w ? [...w.element.querySelectorAll('.dc-frame iframe')] : []; return f.length === 2 && f.every((x) => (x.getAttribute('srcdoc') || '').length > 100 || (x.__frameDoc || '').length > 100) ? f.map((x) => x.getAttribute('sandbox')) : null; })()`, { timeout: 15000, step: 100 });
  check(`${label} (setup) the Design window draws the two artboards as sandboxed frames — srcdoc, or the frame host's document kept on the element (lane design-frame-host, .331) (${JSON.stringify(frames)})`, !!frames && frames.every((s) => s === 'allow-scripts'), frames || await evalJs(`window.__dw ? window.__dw.element.querySelector('.design-status')?.textContent : 'no window'`));
  // the canvas SHIELDS its artboards (the pointer is the canvas's: pan, zoom, a drag) — a real double-click on an artboard
  // opens the FOCUSED VIEW: that one artboard at fit-width, LIVE (its shield lifted, the frame takes the press)
  const shieldAt = await evalJs(`(() => { const sh = window.__dw.element.querySelector('.dc-frame-shield'); const r = sh.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: shieldAt.x, y: shieldAt.y });
  for (const n of [1, 2]) { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: shieldAt.x, y: shieldAt.y, button: 'left', buttons: 1, clickCount: n }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: shieldAt.x, y: shieldAt.y, button: 'left', buttons: 0, clickCount: n }); }
  const live = await until(`(() => { const w = window.__dw; if (!w || !w._designCanvas || !w._designCanvas.focused()) return null; const f = [...w.element.querySelectorAll('.dc-frame iframe')].find((i) => i.getClientRects().length); if (!f) return null; const r = f.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width * 0.25, r.top + r.height * 0.75); return at === f ? { focused: w._designCanvas.focused(), w: Math.round(r.width), h: Math.round(r.height) } : null; })()`, { timeout: 5000, step: 100 });
  check(`${label} (setup) a real double-click on an artboard opens the FOCUSED view: that artboard live, its shield lifted (${JSON.stringify(live)})`, !!live, live || await evalJs(`(() => { const w = window.__dw; return { focused: w._designCanvas && w._designCanvas.focused(), shields: [...w.element.querySelectorAll('.dc-frame-shield')].map((s) => s.style.display) }; })()`));
  spot = await frameSpot(`[...window.__dw.element.querySelectorAll('.dc-frame iframe')].find((i) => i.getClientRects().length)`);
  check(`${label} (setup) a point inside the live artboard is the frame itself (${JSON.stringify(spot)})`, !!spot && spot.onFrame, spot);
  if (!spot || !spot.onFrame) { check(`${label} the artboard legs (a press into the sandboxed frame closes the ⚙ menu and the usage popup) — not reached: no artboard frame to press into`, false); await evalJs(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); true`); return; }
  await click('#btn-global-settings');
  const pd2 = (await popState()).pdown;
  await pressAt(spot.x, spot.y);
  const f3 = await popState();
  check(`${label} a press INTO the sandboxed artboard frame: no parent pointerdown (${f3.pdown - pd2}), focus = ${f3.active}, the ⚙ menu is ${want('CLOSED', 'still OPEN')}`, f3.pdown - pd2 === 0 && /^IFRAME/.test(f3.active || '') && want(!f3.pop, f3.pop), f3);
  await shot(`${fixed ? 'fixed' : 'prefix'}-after-press-into-artboard.png`);
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);
  // the usage popup: a hand-built onOutsidePress surface (once:false, hidden by class) — opened by its chip's own handler
  await evalJs(`document.getElementById('btn-global-settings').focus(); true`); // the focus back in the page (the frame held it), so the next press into the frame is a transfer INTO it
  await evalJs(`document.getElementById('taskbar-usage').onclick(); true`);
  const uf = await evalJs(`document.activeElement.tagName + ' ' + document.hasFocus()`);
  check(`${label} (setup) the page holds the focus again before the usage popup opens (${uf})`, /^BUTTON true$/.test(uf), uf);
  const u0 = await evalJs(`!document.getElementById('usage-popup').classList.contains('hidden')`);
  check(`${label} (setup) the usage popup is open (its chip's handler; a persistent popup hidden by class)`, u0);
  await pressAt(spot.x, spot.y);
  const u1 = await evalJs(`({ hidden: document.getElementById('usage-popup').classList.contains('hidden'), active: document.activeElement.tagName })`);
  check(`${label} a press INTO the artboard frame ${want('HIDES', 'leaves OPEN')} the usage popup too — every onOutsidePress site, nothing per site (${JSON.stringify(u1)})`, u1.active === 'IFRAME' && want(u1.hidden, !u1.hidden), u1);
  await evalJs(`document.getElementById('usage-popup').classList.add('hidden'); for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); document.getElementById('btn-global-settings').focus(); document.getElementById('btn-global-settings').blur(); true`);
}

try {
  await cdp('Page.enable');
  await boot();
  console.log('popover-frame-close — desktop 1280×800, the real bundle');
  await legs('[real]', true);

  // ③ the false-close controls + Esc (the real bundle only)
  console.log('the false-close controls');
  await evalJs(`document.querySelector('${POP}')?.remove(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); true`);
  await click('#btn-global-settings');
  await evalJs(`document.activeElement && document.activeElement.blur(); window.dispatchEvent(new Event('blur')); true`);
  await sleep(150);
  const c1 = await popState();
  check(`the brief's simulation — window.dispatchEvent(new Event('blur')) with the body active — does NOT close the menu (${JSON.stringify(c1)})`, c1.pop && c1.menu, c1);
  // a REAL blur to another top-level window: a second target brought to the front
  await evalJs(`document.querySelector('${POP} .gs-menu-item').focus(); true`);
  const t2 = await cdp('Target.createTarget', { url: 'about:blank' });
  await sleep(400);
  const other = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.id === t2.targetId);
  const C2 = await connect(other.webSocketDebuggerUrl);
  await C2.cdp('Page.bringToFront'); await sleep(400);
  const c2 = await popState();
  await cdp('Page.bringToFront'); await sleep(400);
  const c3 = await popState();
  check(`a REAL blur to another top-level window (a second target to the front) does NOT close the menu — the active element stays the menu row, hasFocus() false while away (${JSON.stringify({ away: c2, back: c3 })})`, c2.pop && c3.pop && c2.hasFocus === false && c3.hasFocus === true && /gs-menu-item/.test(c2.active || ''), { c2, c3 });
  try { await cdp('Target.closeTarget', { targetId: t2.targetId }); } catch {}
  await key('Escape');
  const c4 = await popState();
  check(`Esc still closes the menu (the [data-popover] protocol) (${JSON.stringify(c4)})`, !c4.pop, c4);

  // ④ THE RED CONTROL: the pre-fix bundle (the throwaway worktree's utils.js with the toggle + the blur listener off; one esbuild)
  console.log('the RED control — a pre-fix bundle (the toggle and the blur listener switched off in the throwaway copy)');
  const U = path.join(wt, 'src/lib/utils.js');
  const src = fs.readFileSync(U, 'utf8');
  const BLUR_GATE = "if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {\n    window.addEventListener('blur', (e) => {";
  const TOGGLE = "if (reopened && opts.position !== 'cursor' && opts.toggle !== false) {";
  check('the two edits the control makes are each spelled exactly once in utils.js', src.split(BLUR_GATE).length === 2 && src.split(TOGGLE).length === 2);
  fs.writeFileSync(U, src.replace(BLUR_GATE, "if (false) {\n    window.addEventListener('blur', (e) => {").replace(TOGGLE, 'if (false) {'));
  const esbuild = path.join(repo, 'node_modules', '.bin', 'esbuild');
  const tb = Date.now();
  execFileSync(esbuild, ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify', '--log-level=error'], { cwd: wt, stdio: 'ignore' });
  console.log(`  (the pre-fix bundle built in ${Date.now() - tb} ms)`);
  await boot();
  await legs('[CONTROL pre-fix]', false);
  // the real bundle back (the gate's built one), the page reloaded: the legs pass again — the fix, not the reload
  fs.writeFileSync(U, src);
  fs.copyFileSync(path.join(repo, 'public', 'bundle.js'), path.join(wt, 'public', 'bundle.js'));
  await boot();
  await legs('[real again]', true);
} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
}
console.log(`screenshots: ${SHOTS}`);
console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
