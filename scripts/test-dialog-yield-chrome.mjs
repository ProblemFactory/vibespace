#!/usr/bin/env node
// test-dialog-yield-chrome — A DIALOG WITH FIELDS NEVER BLOCKS THE CHAT (lane dialog-yield; the owner, 2026-10-26, on his hub:
// «尽可能减少 blocking popup 的使用；带填空的对话框不阻塞聊天；打开别的窗口要让位»). Headless Chrome over a COPY of this tree (src, public,
// server.js; the bundle built by esbuild) in the hosted runner's shape — DejaVu Sans through a scratch fontconfig, the page's CPU
// throttled ×4 (VS_CPU_THROTTLE), a returning user (ONBOARDED_SOURCE) — with a stub `claude` behind the real chat-wrapper keeping
// one chat conversation live. Every press is the realClicker's (measured and pressed as ONE act: the element under the pointer AT
// PRESS TIME, never a synthetic .click()); keys are CDP key events, text is Input.insertText at the focused element.
//   ① Plugins → Install plugin… opens a FORM: a press on the chat behind it brings the chat in front and its composer takes the
//     typed text; the form stays open, behind the chat
//   ② the form back from its taskbar tile holds what was typed into it; a second window (the file explorer) opened over it puts
//     it behind; no .dialog-overlay anywhere while only forms are open
//   ③ the form's 建立… (Set up…) opens Integrations IN FRONT of it, and the Plugin Git credential row's field there takes typed
//     text; the form back from the taskbar still holds its own
//   ④ Escape with the focus in the chat leaves the form open; Escape with the focus inside the form closes it (window + tile gone)
//   ⑤ a form opened by NO click (no user activation — a broadcast, a wake) opens BEHIND the focused window: the chat stays the
//     active window and keeps the caret, also after the form's own later update (its source switched, its rows redrawn)
//   ⑥ CONTROL — a DECISION still blocks: a delete confirm (showConfirmDialog) is a .dialog-overlay, the composer is not under the
//     pointer, a press on its backdrop closes it (answers no)
//   ⑦ the buttons (R3): the install form's action row — Cancel left, the primary right (mounts-btn-primary, the accent fill), the
//     same height as a confirm's footer buttons, radius --radius-sm; the git-only rows hidden for a folder source; the Credential
//     row reads like every other field (its name above, in the labels' size) and its 建立… stands at its select's height
//   ⑩ at a smaller desktop viewport (900 × 620) a press on the form's foot lands, and a scrollIntoView on its foot never scrolls
//     the form's window (its content clips — a dialog shifted above the screen was test-exit-access-ui's 860 px red)
//   ⑨ a form open on the desktop becomes its sheet when the page crosses into the phone tier (a fold, a narrowed browser) —
//     the same element, what was typed kept; its ✕ / remove closes it
//   ⑧ CONTROL — the phone tier (390 × 844, touch): Install plugin… is still the sheet (a .dialog-overlay, no form window)
// On 6428c67e (the base — run the file on a `git archive` copy) ①–⑤ and ⑦ are RED; ⑥ and ⑧ hold on both.
// PNGs: DIALOG_YIELD_PNG_DIR (default: the scratch root) <prefix>-<leg>.png, prefix = DIALOG_YIELD_SHOT_PREFIX (default 'run').
// Requires google-chrome (SKIP without). Run: node scripts/test-dialog-yield-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, realClicker, fontLegs, runnerFontEnv, boxSans } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const VNC_ENV = await vncEnv();
const ROOT = scratch('dialog-yield');
const SHOTS = process.env.DIALOG_YIELD_PNG_DIR || ROOT;
const PREFIX = process.env.DIALOG_YIELD_SHOT_PREFIX || 'run';
const THROTTLE = Number(process.env.VS_CPU_THROTTLE) || 4; // the hosted runner's 2 vCPU, on this box
const BIN = path.join(ROOT, 'bin'), CWD = path.join(ROOT, 'project'), FONTS = path.join(ROOT, 'fonts');
for (const d of [BIN, CWD, SHOTS, FONTS]) fs.mkdirSync(d, { recursive: true });
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-yield-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-yield-run-'));
fs.chmodSync(chromeRun, 0o700);
const homes = [];
let chrome = null;
const servers = [];
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  for (const s of servers) { try { s.kill('SIGKILL'); } catch { } }
  for (const r of [ROOT, chromeHome, chromeRun, ...homes]) { try { endRootedProcesses(r); } catch { } }
  for (const d of [ROOT, chromeHome, chromeRun, ...homes]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 420e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });

// ── THE STUB CLI: init, then one short reply per user message ──
const SID = crypto.randomUUID();
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const a = process.argv.slice(2), at = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (a.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
if (a.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
if (!a.includes('--output-format')) { setInterval(() => {}, 1e6); return; }
const SID = at('--session-id') || at('--resume') || ${J(SID)};
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
setTimeout(() => out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [], permissionMode: 'default', claude_code_version: '2.1.308' }), 300);
let buf = '', n = 0;
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch { }
    if (!m || m.type !== 'user') continue;
    const k = ++n;
    setTimeout(() => {
      out({ type: 'assistant', message: { id: 'msg_dy' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'noted' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 50, num_turns: 1, result: 'noted', total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    }, 150);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── THE TREE: a plain copy of this checkout (no git), its bundle built; a probe bundle exposes the real showConfirmDialog ──
const wt = path.join(ROOT, 'tree');
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
execSync('npx esbuild --bundle --format=iife --global-name=__dyProbe --platform=browser --target=es2020 --outfile=public/dy-probe.js', { cwd: wt, stdio: ['pipe', 'ignore', 'ignore'], input: "export { showConfirmDialog } from './src/lib/utils.js';" });

const port = await freePort();
const home = scratchHome('dialog-yield-home', fs); homes.push(home);
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: home, PATH: `${BIN}:${path.join(wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
servers.push(srv);
const origin = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 160 && !up; i++) { try { await fetch(`${origin}/api/home`); up = true; } catch { await sleep(250); } }
check('the tree\'s server answers', up);

// ── chrome: the runner's face (DejaVu Sans through a scratch fontconfig) where this box has it ──
const font = fontLegs().includes('dejavu') ? 'dejavu' : 'box';
const fontEnv = font === 'dejavu' ? runnerFontEnv(FONTS) : {};
console.log(`  (font: ${font === 'dejavu' ? 'DejaVu Sans — the hosted runner\'s, a scratch fontconfig' : `this box's own (${boxSans() || '?'})`}; the page's CPU throttled ×${THROTTLE})`);
const CDP_PORT = await freePort();
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--password-store=basic', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, ...fontEnv, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' } });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(J({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return !!(await evalJs(expr)); } catch { return false; } };
const realClick = realClicker({ evalJs, cdp });
const shot = async (name) => { try { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${PREFIX}-${name}.png`), Buffer.from(data, 'base64')); } catch { } };
const key = async (k, code, vk) => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(250);
};
const ESC = () => key('Escape', 'Escape', 27);
const typeText = async (text) => { await cdp('Input.insertText', { text }); await sleep(200); };
/** one leg: a throw is a NAMED ✗ with where it threw, and the walk goes on */
const step = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: the leg ran to its end`, false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } };

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'en'); } catch {}" });

// ── page-side probes (installed after every load) ──
const PROBES = `window.__dy = {
  R: (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; },
  winOf: (id) => { const el = document.getElementById(id); return el ? el.closest('.window') : null; },
  z: (el) => { const f = el && (el.closest('.window') || el); return f ? (parseInt(getComputedStyle(f).zIndex, 10) || 0) : null; },
  hitIn: (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)); return !!h && el.contains(h); },
  shown: () => [...document.querySelectorAll('.dialog-overlay')].filter((o) => !o.classList.contains('hidden') && o.getClientRects().length),
  overlays: () => __dy.shown().map((o) => o.id || o.className),
  tag: (sel, text, name) => { document.querySelectorAll('[data-dy="' + name + '"]').forEach((x) => { delete x.dataset.dy; }); const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === text && x.getClientRects().length); if (!b) return false; b.dataset.dy = name; return true; },
  chatWin: () => { for (const w of app.wm.windows.values()) if (w.type === 'chat' && w.element.querySelector('textarea.chat-input')) return w; return null; },
};
true`;
const load = async () => {
  await cdp('Page.navigate', { url: origin + '/' });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 40000) return rej(new Error("no app after 40s")); setTimeout(w, 200); })(); })');
  await waitFor(`!document.getElementById('loading-screen')`, 30000);
  await sleep(900);
  await evalJs(PROBES);
  await evalJs(`(() => { const s = document.createElement('script'); s.src = '/dy-probe.js'; document.head.appendChild(s); return true; })()`);
  await waitFor('!!window.__dyProbe', 10000);
};

// ── the live conversation (the real spawn path: the stub CLI behind the real chat-wrapper) ──
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise((r) => ws.on('open', r));
const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
ws.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'dy1', name: 'payments' }));
let sid = null;
for (let i = 0; i < 120 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
check('a live claude chat conversation is created through the real spawn path (stub CLI)', !!sid, frames.slice(-3).map((f) => J(f).slice(0, 160)).join(' | '));

await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await load();
if (THROTTLE > 1) await cdp('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await waitFor(`!!(app.sidebar?._allSessions || []).find((s) => s.webuiId === ${J(sid)} && s.status === 'live')`, 20000);
await evalJs(`app.attachSession(${J(sid)}, 'payments', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
const opened = await waitFor(`(() => { const i = document.querySelector('.chat-view textarea.chat-input'); return !!i && i.getClientRects().length > 0; })()`, 30000);
check('the running conversation\'s chat window shows its composer (desktop 1280 × 800)', opened);
// the chat fills the left part of the workspace: its title bar and composer stand clear of a form that opens in the middle
await evalJs(`(() => { const w = __dy.chatWin(); if (w) { app.wm.snapToHalf(w.id, 'left'); } return !!w; })()`);
await sleep(800);
await evalJs(`(() => { const w = __dy.chatWin(); w.titleSpan.dataset.dy = 'chat-title'; w.element.querySelector('textarea.chat-input').dataset.dy = 'composer'; return true; })()`);

const formWinId = () => evalJs(`(() => { const w = __dy.winOf('plugin-install-dialog'); if (!w) return null; for (const x of app.wm.windows.values()) if (x.element === w) return x.id; return null; })()`);
const openInstallByClick = async () => {
  // the rail's Plugins panel — opened only when it is not on show (a second openPluginsDialog is the rail's re-click: it folds)
  if (!(await evalJs(`__dy.tag('button', 'Install plugin…', 'install')`))) await evalJs('app.openPluginsDialog(); true');
  const tagged = await waitFor(`__dy.tag('button', 'Install plugin…', 'install')`, 15000);
  if (!tagged) return { ok: false, why: 'no Install plugin… button' };
  const pressed = await realClick('[data-dy="install"]');
  const there = await waitFor(`!!document.querySelector('#plugin-install-dialog .plugin-install-value')`, 10000);
  return { ok: pressed && there, pressed, there, miss: realClick.lastMiss };
};
const composerValue = () => evalJs(`document.querySelector('[data-dy="composer"]')?.value || ''`);
const clearComposer = () => evalJs(`(() => { const c = document.querySelector('[data-dy="composer"]'); if (c) { c.value = ''; c.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
/** the chat brought in front by a press on its title bar, then a press into its composer */
const pressChat = async () => {
  const t = await realClick('[data-dy="chat-title"]'); const tMiss = realClick.lastMiss;
  await sleep(300);
  const c = await realClick('[data-dy="composer"]'); const cMiss = realClick.lastMiss;
  await sleep(300);
  return { t, c, tMiss, cMiss };
};
const taskbarBack = async (id) => {
  if (!id) return false;
  const ok = await realClick(`.taskbar-item[data-win-id="${id}"]`);
  await sleep(500);
  return ok;
};

// ── ① the composer behind an open form takes the typed text ──
const LOC = 'owner/plugin-repo@v1.2.0';
await step('①', async () => {
  const o = await openInstallByClick();
  check('① Plugins → Install plugin… opens by a real press', o.ok, o);
  await realClick('#plugin-install-dialog .plugin-install-value'); await typeText(LOC);
  await shot('1-install-open');
  const before = await evalJs(`({ overlays: __dy.overlays(), win: !!__dy.winOf('plugin-install-dialog') })`);
  check('① the install dialog is a FORM — a window, no .dialog-overlay (a backdrop over the chat)', before.win && before.overlays.length === 0, before);
  await clearComposer();
  const p = await pressChat();
  await typeText('typed while the form is open');
  const v = await composerValue();
  const after = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'), c = __dy.chatWin(); return { formOpen: !!f && f.isConnected, active: app.wm.activeWindowId === c?.id, formZ: __dy.z(f), chatZ: __dy.z(c?.element), focus: document.activeElement?.dataset?.dy || document.activeElement?.className || null }; })()`);
  await shot('1-composer-typed');
  check('① a press on the chat\'s title bar and one into its composer land (nothing over them)', p.t && p.c, p);
  check('① the composer took the text typed while the install form is open', v.includes('typed while the form is open'), { value: v, ...after });
  check('① the form stayed open, BEHIND the chat (the chat is the active window, above it)', after.formOpen && after.active && after.formZ < after.chatZ, after);
});

// ── ② back from the taskbar with its values; a second window over it puts it behind ──
await step('②', async () => {
  const id = await formWinId();
  const back = await taskbarBack(id);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { active: app.wm.activeWindowId === ${J(id)}, hit: __dy.hitIn(f?.querySelector('.dialog')), value: f?.querySelector('.plugin-install-value')?.value || null }; })()`);
  await shot('2-form-back');
  check('② the form\'s taskbar tile brings it back in front', !!id && back && s.active && s.hit, { id, back, miss: realClick.lastMiss, ...s });
  check('② …holding what was typed into it', s.value === LOC, s);
  await evalJs('app.openFileExplorer(); true');
  await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'files')`, 15000);
  await sleep(800);
  const o = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'), fw = [...app.wm.windows.values()].find((w) => w.type === 'files'); return { formOpen: !!f, formZ: __dy.z(f), filesZ: __dy.z(fw?.element), activeFiles: app.wm.activeWindowId === fw?.id, overlays: __dy.overlays() }; })()`);
  await shot('2-window-over-form');
  check('② a second window opened over the form stands in front of it (the form behind, still open)', o.formOpen && o.activeFiles && o.filesZ > o.formZ, o);
  check('② no .dialog-overlay in the page while only forms are open', o.overlays.length === 0, o);
  const back2 = await taskbarBack(id);
  const s2 = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { active: app.wm.activeWindowId === ${J(id)}, value: f?.querySelector('.plugin-install-value')?.value || null }; })()`);
  check('② back again from the taskbar: in front, the typed location intact', back2 && s2.active && s2.value === LOC, s2);
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'files') app.wm.closeWindow(w.id); return true; })()`);
});

// ── ③ 建立… opens Integrations in front of the form; its credential field takes text ──
await step('③', async () => {
  await evalJs(`(() => { const s = document.querySelector('#plugin-install-dialog .plugin-install-source'); s.value = 'git'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(500);
  const pressed = await realClick('#plugin-install-dialog .plugin-install-cred-open');
  const card = await waitFor(`!!document.querySelector('.integ-card[data-integ="plugin-git"]')`, 15000);
  await sleep(900);
  const s = await evalJs(`(() => { const iw = [...app.wm.windows.values()].find((w) => w.type === 'integrations'), f = document.getElementById('plugin-install-dialog');
    return { iw: !!iw, active: app.wm.activeWindowId === iw?.id, iz: __dy.z(iw?.element), fz: __dy.z(f), hit: __dy.hitIn(iw?.element), overlays: __dy.overlays() }; })()`);
  await shot('3-integrations-front');
  check('③ 建立… (Set up…) is pressed in the form', pressed, realClick.lastMiss);
  check('③ Integrations opens IN FRONT of the install form (the active window, above it, under the pointer)', card && s.iw && s.active && s.iz > s.fz && s.hit, s);
  const setBtn = await evalJs(`(() => { const b = document.querySelector('.integ-card[data-integ="plugin-git"] .integ-replace'); if (!b) return false; b.dataset.dy = 'cred-set'; return true; })()`);
  const p2 = setBtn ? await realClick('[data-dy="cred-set"]') : false;
  await sleep(400);
  await typeText('example-host.invalid');
  const typed = await evalJs(`(() => { const i = document.querySelector('.integ-card[data-integ="plugin-git"] .integ-editing .integ-input'); return i ? { value: i.value, focused: document.activeElement === i } : null; })()`);
  await shot('3-credential-typed');
  check('③ the Plugin Git credential row\'s field there takes typed text (the credential form it opens)', p2 && !!typed && typed.value === 'example-host.invalid', { setBtn, p2, miss: realClick.lastMiss, typed });
  await evalJs(`(() => { const c = [...document.querySelectorAll('.integ-card[data-integ="plugin-git"] .integ-editing .mounts-btn')].find((b) => b.textContent.trim() === 'Cancel'); c?.click(); return true; })()`);
  const id = await formWinId();
  const back = await taskbarBack(id);
  const s3 = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { active: app.wm.activeWindowId === ${J(id)}, value: f?.querySelector('.plugin-install-value')?.value || null, src: f?.querySelector('.plugin-install-source')?.value || null }; })()`);
  check('③ the install form back from the taskbar still holds its own (location + the git source)', back && s3.active && s3.value === LOC && s3.src === 'git', s3);
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'integrations') app.wm.closeWindow(w.id); return true; })()`);
});

// ── ④ Escape: from the chat it leaves the form; from inside the form it closes it ──
await step('④', async () => {
  const id = await formWinId();
  const p = await pressChat();
  await ESC();
  const a = await evalJs(`({ open: !!document.getElementById('plugin-install-dialog'), focus: document.activeElement?.dataset?.dy || null })`);
  check('④ Escape with the focus in the chat leaves the form open', p.c && a.open && a.focus === 'composer', { ...a, p });
  await taskbarBack(id);
  await realClick('#plugin-install-dialog .plugin-install-value');
  await ESC();
  const b = await evalJs(`({ open: !!document.getElementById('plugin-install-dialog'), win: app.wm.windows.has(${J(id)}), tile: !!document.querySelector('.taskbar-item[data-win-id="${id}"]') })`);
  check('④ Escape with the focus inside the form closes it (its window and its taskbar tile gone)', !!id && !b.open && !b.win && !b.tile, { id, ...b });
  await evalJs(`(() => { document.getElementById('plugin-install-dialog')?.remove(); return true; })()`);
});

// ── ⑤ a form opened by no click opens BEHIND the focused window and never takes the caret ──
await step('⑤', async () => {
  await pressChat();
  const idle = await waitFor('!navigator.userActivation || !navigator.userActivation.isActive', 12000);
  await evalJs(`(() => { app._pluginInstallDialog(() => {}); return true; })()`); // Runtime.evaluate: no user gesture — a broadcast's / a wake's open
  await waitFor(`!!document.getElementById('plugin-install-dialog')`, 10000);
  await sleep(1200);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'), c = __dy.chatWin(); return { open: !!f, active: app.wm.activeWindowId === c?.id, fz: __dy.z(f), cz: __dy.z(c?.element), focus: document.activeElement?.dataset?.dy || document.activeElement?.className || null, overlays: __dy.overlays() }; })()`);
  await shot('5-opened-behind');
  check('⑤ (no user activation when it opened)', idle);
  check('⑤ a form opened by no click opens BEHIND the focused chat (the chat stays the active window, above it)', s.open && s.active && s.fz < s.cz && s.overlays.length === 0, s);
  check('⑤ …and the caret stays in the chat\'s composer', s.focus === 'composer', s);
  await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const sel = f.querySelector('.plugin-install-source'); sel.value = 'git'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); // its own later update (rows shown, the credential read)
  await sleep(1500);
  const u = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'), c = __dy.chatWin(); return { active: app.wm.activeWindowId === c?.id, fz: __dy.z(f), cz: __dy.z(c?.element), focus: document.activeElement?.dataset?.dy || null }; })()`);
  check('⑤ the form\'s later update (its source switched, its rows redrawn) neither raises it nor takes the caret', u.active && u.fz < u.cz && u.focus === 'composer', u);
  const id = await formWinId();
  if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); else await evalJs(`document.getElementById('plugin-install-dialog')?.remove(); true`);
  await sleep(300);
});

// ── ⑥ CONTROL: a decision still blocks, and its backdrop closes it ──
await step('⑥', async () => {
  await evalJs(`(() => { window.__dyAns = 'pending'; __dyProbe.showConfirmDialog({ title: 'Delete “payments-old”?', message: 'The conversation and its history go away.', confirmText: 'Delete', danger: true }).then((v) => { window.__dyAns = v; }); return true; })()`);
  await waitFor(`__dy.overlays().length === 1`, 5000);
  await sleep(300);
  const blocked = await realClick('[data-dy="composer"]');
  const s = await evalJs(`(() => { const o = document.querySelector('.dialog-overlay:not(.hidden)'); return { overlays: __dy.overlays(), z: o ? getComputedStyle(o).zIndex : null, miss: null }; })()`);
  await shot('6-decision-blocks');
  check('⑥ CONTROL: a delete confirm is a DECISION — a .dialog-overlay over everything (z 99998)', s.overlays.length === 1 && s.z === '99998', s);
  check('⑥ CONTROL: …the composer is not under the pointer while it is open (the press is refused)', !blocked, realClick.lastMiss);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 400 });
  const under = await evalJs(`document.elementFromPoint(8, 400)?.classList.contains('dialog-overlay')`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 400, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 400, button: 'left', clickCount: 1 });
  await sleep(500);
  const g = await evalJs(`({ overlays: __dy.overlays(), ans: window.__dyAns })`);
  check('⑥ CONTROL: a press on its backdrop closes it and answers no', under && g.overlays.length === 0 && g.ans === false, { under, ...g });
});

// ── ⑦ the buttons of the install form's action row ──
await step('⑦', async () => {
  const o = await openInstallByClick();
  if (!o.ok) { await evalJs(`(() => { document.getElementById('plugin-install-dialog')?.remove(); app._pluginInstallDialog(() => {}); return true; })()`); await waitFor(`!!document.getElementById('plugin-install-dialog')`, 10000); } // the row is measured whatever the door did
  await sleep(500);
  const m = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const c = f.querySelector('.plugin-install-cancel'), g = f.querySelector('.plugin-install-go');
    const probe = document.createElement('div'); probe.style.cssText = 'background: var(--accent); position: fixed; width: 1px; height: 1px; left: -9px'; document.body.appendChild(probe);
    const accent = getComputedStyle(probe).backgroundColor; probe.style.borderRadius = 'var(--radius-sm)'; const rsm = getComputedStyle(probe).borderTopLeftRadius; probe.remove();
    const cs = (e) => getComputedStyle(e);
    return { cancel: { ...__dy.R(c), radius: cs(c).borderTopLeftRadius, font: cs(c).fontSize }, go: { ...__dy.R(g), radius: cs(g).borderTopLeftRadius, font: cs(g).fontSize, bg: cs(g).backgroundColor, primary: g.classList.contains('mounts-btn-primary') }, accent, rsm }; })()`);
  await shot('7-buttons');
  // a confirm's footer — THE dialog button the rest of the app draws
  await evalJs(`(() => { window.__dyAns = 'pending'; __dyProbe.showConfirmDialog({ title: 'Delete?', message: 'x', confirmText: 'Delete' }).then((v) => { window.__dyAns = v; }); return true; })()`);
  await waitFor(`!!__dy.shown().pop()?.querySelector('.dialog-footer .btn-create')`, 5000); // the confirm's own overlay (the static #dialog-overlay is hidden)
  const f = await evalJs(`(() => { const o = __dy.shown().pop(), ok = o.querySelector('.dialog-footer .btn-create'), no = o.querySelector('.dialog-footer .btn-cancel'); return { ok: __dy.R(ok).h, no: __dy.R(no).h, font: getComputedStyle(ok).fontSize }; })()`);
  await evalJs(`(() => { __dy.shown().pop()?.querySelector('.dialog-footer .btn-cancel')?.click(); return true; })()`);
  const fac = { install: o, ...m, footer: f };
  check('⑦ Cancel stands LEFT of the primary', m.cancel.l < m.go.l, fac);
  check('⑦ the primary is mounts-btn-primary in the accent fill', m.go.primary && m.go.bg === m.accent, fac);
  check('⑦ both buttons stand at the dialog button\'s height (a confirm\'s footer) and its font size', Math.abs(m.cancel.h - f.ok) <= 0.5 && Math.abs(m.go.h - f.ok) <= 0.5 && m.go.font === f.font && m.cancel.font === f.font, fac);
  check('⑦ both radii are --radius-sm', m.cancel.radius === m.rsm && m.go.radius === m.rsm, fac);
  // the 建立… row (the owner's other odd shape): hidden for a folder source; for git it reads like every other field
  const g0 = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const shown = (sel) => { const e = f.querySelector(sel); return !!e && e.getClientRects().length > 0; }; return { src: f.querySelector('.plugin-install-source').value, cred: shown('.plugin-install-cred-row'), hint: shown('.plugin-install-cred-hint'), ref: shown('.plugin-install-ref-row') }; })()`);
  check('⑦ the git-only rows (Ref, Credential, its hint) are not shown for a folder source', g0.src === 'path' && !g0.cred && !g0.hint && !g0.ref, g0);
  await evalJs(`(() => { const s = document.querySelector('#plugin-install-dialog .plugin-install-source'); s.value = 'git'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(600);
  const g = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const sel = f.querySelector('.plugin-install-cred'), b = f.querySelector('.plugin-install-cred-open'), name = f.querySelector('.plugin-install-cred-row > span'), src = f.querySelector('.plugin-install-source').closest('label').querySelector('span');
    return { sel: __dy.R(sel).h, btn: __dy.R(b).h, nameFont: getComputedStyle(name).fontSize, srcFont: getComputedStyle(src).fontSize, nameAbove: __dy.R(name).b <= __dy.R(sel).t + 0.5, radius: getComputedStyle(b).borderTopLeftRadius }; })()`);
  await shot('7-credential-row');
  check('⑦ the Credential row reads like every other field: its name above the select, in the labels\' size', g.nameAbove && g.nameFont === g.srcFont, g);
  check('⑦ …and 建立… (Set up…) stands at its select\'s height, radius --radius-sm', Math.abs(g.sel - g.btn) <= 0.5 && g.radius === m.rsm, g);
  const id = await formWinId();
  if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); else await evalJs(`document.getElementById('plugin-install-dialog')?.remove(); true`);
});

check('no page error on the desktop walk', pageErrors.length === 0, pageErrors.slice(0, 4));

// ── ⑩ a smaller desktop viewport and a press on the form's foot: the form stays inside the screen, its content never scrolled ──
await step('⑩', async () => {
  const o = await openInstallByClick();
  await evalJs(`(() => { const s = document.querySelector('#plugin-install-dialog .plugin-install-source'); s.value = 'git'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 620, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const pressed = await realClick('#plugin-install-dialog .plugin-install-cancel'); // the realClicker scrolls its target into view first
  await sleep(400);
  const st = await evalJs(`(() => { const w = __dy.winOf('plugin-install-dialog'); const f = document.getElementById('plugin-install-dialog'); return { open: !!f, win: !!w }; })()`);
  // the press was Cancel — the form closed; open it again at this size and read where it stands, then press its foot without closing it
  const o2 = await openInstallByClick();
  await evalJs(`(() => { const s = document.querySelector('#plugin-install-dialog .plugin-install-source'); s.value = 'git'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#plugin-install-dialog .plugin-install-go').scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(500);
  const g = await evalJs(`(() => { const w = __dy.winOf('plugin-install-dialog'); const d = document.querySelector('#plugin-install-dialog .dialog'), r = d.getBoundingClientRect(), c = w && w.querySelector('.window-content');
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrolled: c ? c.scrollTop : null, inside: r.top >= 0 && r.bottom <= innerHeight + 0.5 }; })()`);
  await shot('10-small-desktop');
  check('⑩ at 900 × 620 a press on the form\'s foot lands and closes it (Cancel)', o.ok && pressed && !st.open && !st.win, { o, pressed, miss: realClick.lastMiss, ...st });
  check('⑩ …and a scrollIntoView on its foot never scrolls the form\'s window: the dialog stays inside the screen', o2.ok && g.scrolled === 0 && g.inside, g);
  const id = await formWinId();
  if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
});

// ── ⑨ a crossing into the phone tier (a fold, a narrowed browser) turns an open form into its sheet, what was typed kept ──
await step('⑨', async () => {
  const o = await openInstallByClick();
  if (o.ok) { await realClick('#plugin-install-dialog .plugin-install-value'); await typeText('kept/across@fold'); }
  const was = await evalJs(`({ win: !!__dy.winOf('plugin-install-dialog') })`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(`!!document.getElementById('plugin-install-dialog')?.classList.contains('dialog-overlay')`, 8000);
  await sleep(600);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); if (!f) return { gone: true }; const d = f.querySelector('.dialog'), r = d.getBoundingClientRect(), x = f.querySelector('.dialog-close').getBoundingClientRect();
    return { overlay: f.classList.contains('dialog-overlay'), inWindow: !!f.closest('.window'), forms: [...app.wm.windows.values()].filter((w) => w.type === 'form').length, value: f.querySelector('.plugin-install-value').value, inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.width > 0, close: x.width > 0 }; })()`);
  await shot('9-crossing-sheet');
  check('⑨ a form open on the desktop becomes its SHEET when the page crosses into the phone tier (a .dialog-overlay, no form window, its ✕ shown, inside the screen)', o.ok && was.win && s.overlay && !s.inWindow && s.forms === 0 && s.close && s.inside, { o, was, ...s });
  check('⑨ …holding what was typed into it', s.value === 'kept/across@fold', s);
  await evalJs(`(() => { document.getElementById('plugin-install-dialog')?.remove(); return true; })()`);
  await sleep(300);
  const gone = await evalJs(`!document.getElementById('plugin-install-dialog')`);
  check('⑨ …and its ✕ path (the root\'s remove) closes the sheet', gone);
});

// ── ⑧ CONTROL: the phone tier keeps the sheet ──
await step('⑧', async () => {
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await load();
  await evalJs(`app._pluginInstallDialog(() => {}); true`);
  await waitFor(`!!document.getElementById('plugin-install-dialog')`, 10000);
  await sleep(600);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { isMobile: !!app.isMobile, overlay: !!f && f.classList.contains('dialog-overlay'), inWindow: !!f && !!f.closest('.window'), forms: [...app.wm.windows.values()].filter((w) => w.type === 'form').length }; })()`);
  await shot('8-phone-sheet');
  check('⑧ CONTROL: on the phone tier (390 × 844, touch) Install plugin… is still the sheet — a .dialog-overlay, no form window', s.isMobile && s.overlay && !s.inWindow && s.forms === 0, s);
});

console.log(`\n${fail ? '✗' : '✓'} test-dialog-yield-chrome: ${pass} passed, ${fail} failed${fail ? '' : ' — ALL PASS'}`);
process.exit(fail ? 1 : 0);
