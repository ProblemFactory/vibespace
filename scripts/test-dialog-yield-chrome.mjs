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
//   ⑤ a form the SYSTEM opened (its caller's `opener: 'system'` — a broadcast, a poll, a wake) opens BEHIND the focused window:
//     the chat stays the active window and keeps the caret, also after the form's own later update (a row drawn, a script's focus)
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
// ROUND 2 (acceptance r1): ⑪ typing in the chat, then a form opened with no press since — behind, «hello world» whole; ⑫ ONE
// Escape door — Report a problem's typed note asked about, never lost; ⑬ the OAT sign-in running + Escape — «Cancel the
// sign-in?» over the LIVE dialog, No keeps it; ⑭ the self-update progress (Escape left off) stays; ⑮ the same form opened again
// is RAISED — one window, «AAA» kept, one broadcast handler, its guard still asks; ⑯ a form opened while a danger confirm is up
// waits UNDER it (Delete pressable), the confirm answered — a window, the chat alive; ⑰ a form opened FROM the confirm is its
// sheet and re-hosts as its window when the confirm closes; ⑱ role="dialog" named by its title, no aria-modal; ⑳ 900 × 480 —
// the whole window inside the workspace, the body scrolls, the foot reachable; ⑨ back at 1280 the sheet is its window again;
// ⑲ the welcome never counts a form.
// ROUND 3 (acceptance r2 of c3ed5f0a): ㉑ Rotate… twice ⇒ the new token; a code re-minted ⇒ shown · ㉒ the switcher pA then pB ⇒
// pB in front, pB again raised, one handler · ㉓ the Agents manager twice ⇒ its refresh hook live · ㉔ a dirty form's door asks,
// Discard ⇒ the asked form opens, Keep editing ⇒ never (said); the real Connect storage + Add remote machine side by side · ㉕ a
// running Set up is never closed by a neighbour · ㉖ a select that applied is no draft · ㉗ Publish page's failed re-read says
// so · ㉘ Browse… over a 2.5 s listing ⇒ its sheet on top, again ⇒ raised · ㉙ a system form 1403 ms after a press in New Session
// ⇒ behind · ㉚ typing, then a system form ⇒ behind, «abcdef» · ㉛ an iframe and a scroller re-hosted ⇒ loaded once, still at 150 ·
// ㉜ the keyboard up ⇒ Save above it · ㉝ Reach & policy re-opened ⇒ handlers +0. On c3ed5f0a ㉑–㉝ are RED.
// Round 4 (acceptance r3): ㉞ Set up box2 asked again beside a running box1 ⇒ box2's RAISED (two set-ups, handlers +0) · ㉟ a
// QUEUED «Models — B» (the real dialog) ⇒ Discard ⇒ drawn, its caller answered · ㊱ two mount forms' «mount point» fields (one
// field id) ⇒ two pickers, the second's pick in its own field · ㊲ Remove gimp then Remove inkscape ⇒ the inkscape plan · ㊳ New Session (the static sheet) on the phone with
// the keyboard up ⇒ its header at the top. On 981f70d6 ㉞–㊳ are RED.
// On 6428c67e (the base — run the file on a `git archive` copy) ①–⑤ and ⑦ are RED; ⑥ and ⑧ hold on both. On da9545e8 (round 1)
// the round-2 legs are RED (⑪–⑳, ⑨'s way back, ⑤'s system opener).
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
execSync('npx esbuild --bundle --format=iife --global-name=__dyProbe --platform=browser --target=es2020 --outfile=public/dy-probe.js', { cwd: wt, stdio: ['pipe', 'ignore', 'ignore'], input: "export { showConfirmDialog } from './src/lib/utils.js'; export { showTokenOnce, showPairCodeOnce } from './src/lib/channel-webhook.js'; export { showReachDialog } from './src/lib/channel-reach-editor.js'; export { openAccountModelsDialog } from './src/lib/account-models.js'; export { pathField } from './src/lib/path-field.js'; export { showInstallDialog } from './src/lib/desktop-app-launcher.js';" }); // (r3: the real webhook token / code dialogs and Reach & policy — sheets of the probe's own shell; r4: the real Models dialog, path field and install form)

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
const ONLY = String(process.env.DY_ONLY || '').split(',').filter(Boolean);   // (a debugging walk of named legs: DY_ONLY=㉗,㉘)
const step = async (name, fn) => { if (ONLY.length && !ONLY.includes(name)) return; try { await fn(); } catch (e) { check(`${name}: the leg ran to its end`, false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } };

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
  api: () => (window.__dyApi ||= app.pluginClient._hostApi({ id: 'dyprobe', version: '1' }, new AbortController())), // a plugin's dialog door (it says its own kind and opener)
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
  // round 2: the form holds what was typed (the location) — its ONE Escape door ASKS before it drops it; Discard closes it
  const q = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const d = f?.querySelector('.dialog-unsaved-discard'); if (d) d.dataset.dy = 'discard'; return { open: !!f, asked: !!f?.querySelector('.dialog-unsaved'), value: f?.querySelector('.plugin-install-value')?.value || null }; })()`);
  check('④ Escape with the focus inside the form is ITS door: the location typed into it is asked about (Discard / Keep editing), never dropped', q.open && q.asked && q.value === LOC, q);
  const dp = await realClick('[data-dy="discard"]');
  await sleep(400);
  const b = await evalJs(`({ open: !!document.getElementById('plugin-install-dialog'), win: app.wm.windows.has(${J(id)}), tile: !!document.querySelector('.taskbar-item[data-win-id="${id}"]') })`);
  check('④ …Discard closes it (its window and its taskbar tile gone)', !!id && dp && !b.open && !b.win && !b.tile, { id, dp, ...b });
  await evalJs(`(() => { document.getElementById('plugin-install-dialog')?.remove(); return true; })()`);
});

// ── ⑤ a form the SYSTEM opened (its caller says opener: 'system' — a broadcast, a poll, a wake) opens BEHIND the focused window and never takes the caret ──
await step('⑤', async () => {
  await pressChat();
  await sleep(1200); // (no typing since: the person's last act was a press)
  await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'probe', title: 'A form the system opened', kind: 'form', opener: 'system', escapeToClose: true }); sh.body.innerHTML = '<label>Name <input class="dy-probe-in"></label>'; window.__dyProbeShell = sh; return true; })()`);
  await waitFor(`!!document.getElementById('plugin-dyprobe-probe')`, 10000);
  await sleep(1200);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-probe'), c = __dy.chatWin(); return { open: !!f, win: !!f && !!f.closest('.window'), active: app.wm.activeWindowId === c?.id, fz: __dy.z(f), cz: __dy.z(c?.element), focus: document.activeElement?.dataset?.dy || document.activeElement?.className || null, overlays: __dy.overlays() }; })()`);
  await shot('5-opened-behind');
  check('⑤ a form the SYSTEM opened (opener: \'system\') opens BEHIND the focused chat (the chat stays the active window, above it)', s.open && s.win && s.active && s.fz < s.cz && s.overlays.length === 0, s);
  check('⑤ …and the caret stays in the chat\'s composer', s.focus === 'composer', s);
  await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-probe'); const i = document.createElement('input'); i.className = 'dy-late'; f.querySelector('.dialog-body').appendChild(i); i.focus(); return true; })()`); // its own later update (a row drawn) and a script's focus into it
  await sleep(1500);
  const u = await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-probe'), c = __dy.chatWin(); return { active: app.wm.activeWindowId === c?.id, fz: __dy.z(f), cz: __dy.z(c?.element), focus: document.activeElement?.dataset?.dy || null }; })()`);
  check('⑤ the form\'s later update (a row drawn, a script\'s focus into it) neither raises it nor takes the caret', u.active && u.fz < u.cz && u.focus === 'composer', u);
  await evalJs(`(() => { window.__dyProbeShell?.close(); return true; })()`);
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


// ════ ROUND 2 (acceptance r1 — lane dialog-yield r2) ════
// ── ⑪ typing in the chat, then a form opened with no press since: it never takes the keys from that field ──
await step('⑪', async () => {
  await clearComposer();
  await pressChat();
  await cdp('Input.insertText', { text: 'hello wor' });
  await sleep(300);
  await evalJs(`(() => { app._pluginInstallDialog(() => {}); return true; })()`); // the caller's default (the person's) — yet the person was TYPING
  await cdp('Input.insertText', { text: 'ld' });
  await waitFor(`!!document.getElementById('plugin-install-dialog')`, 8000);
  await sleep(700);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'), c = __dy.chatWin(); return { composer: document.querySelector('[data-dy="composer"]')?.value || '', loc: f?.querySelector('.plugin-install-value')?.value || '', open: !!f, active: app.wm.activeWindowId === c?.id, fz: __dy.z(f), cz: __dy.z(c?.element) }; })()`);
  await shot('11-typing-kept');
  check('⑪ typing in the chat, then a form opened 300 ms later with no press since: it opens BEHIND — «hello world» whole in the composer, nothing in the form', s.open && s.composer === 'hello world' && s.loc === '' && s.active && s.fz < s.cz, s);
  const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`);
  await sleep(300);
});

// ── ⑫ ONE Escape door: Report a problem with a typed note + Escape ⇒ the shell ASKS, the note kept ──
await step('⑫', async () => {
  await sleep(1200);
  await evalJs(`(() => { app.captureIncident(); return true; })()`);
  await waitFor(`(() => { const n = [...document.querySelectorAll('textarea.dialog-input')].find((x) => /freezes the whole scene/.test(x.closest('.dialog')?.textContent || '')); if (!n) return false; n.dataset.dy = 'note'; return true; })()`, 10000);
  await sleep(400);
  const pressed = await realClick('[data-dy="note"]');
  await typeText('the export froze');
  await ESC();
  const a = await evalJs(`(() => { const n = document.querySelector('[data-dy="note"]'); const root = n && n.closest('.dialog'); return { open: !!n && n.isConnected, note: n?.value || null, asked: !!root?.querySelector('.dialog-unsaved'), buttons: [...(root?.querySelectorAll('.dialog-unsaved-actions button') || [])].map((b) => b.textContent.trim()) }; })()`);
  await shot('12-escape-asks');
  check('⑫ Report a problem with a typed note + Escape ⇒ the shell ASKS (Discard / Keep editing) — the form open, the note kept', pressed && a.open && a.asked && a.note === 'the export froze' && a.buttons.join('|') === 'Discard|Keep editing', { pressed, ...a });
  await ESC(); // Escape on the question = Keep editing
  const b = await evalJs(`(() => { const n = document.querySelector('[data-dy="note"]'); const root = n && n.closest('.dialog'); return { open: !!n && n.isConnected, note: n?.value || null, asked: !!root?.querySelector('.dialog-unsaved') }; })()`);
  check('⑫ …a second Escape is Keep editing: the question goes, the note stays', b.open && !b.asked && b.note === 'the export froze', b);
  await evalJs(`(() => { const w = document.querySelector('[data-dy="note"]')?.closest('.window'); for (const x of app.wm.windows.values()) if (x.element === w) app.wm.closeWindow(x.id); return true; })()`);
  await sleep(300);
});

// ── ⑬ the OAT sign-in running + Escape ⇒ «Cancel the sign-in?» over the LIVE dialog; No keeps it ──
await step('⑬', async () => {
  await sleep(1200);
  await evalJs(`(() => { app._oatDialog('acc-dy', { name: 'Work Max' }, () => {}); return true; })()`);
  await waitFor(`!!document.getElementById('oat-dialog')`, 10000);
  await sleep(600);
  await evalJs(`(() => { for (const h of app.ws.globalHandlers.slice()) { try { h({ type: 'oat-mint', mint: { id: 'mint-dy', accountId: 'acc-dy', phase: 'waiting-code', rev: 9, url: 'https://example.invalid/oauth/authorize' } }); } catch (e) { } } return true; })()`);
  const live = await waitFor(`document.querySelector('#oat-mint')?.dataset.phase === 'waiting-code'`, 8000);
  await evalJs(`(() => { const r = document.getElementById('oat-dialog'); const i = r.querySelector('#oat-code') || r.querySelector('input:not([type=hidden]), button') || r; i.focus(); return true; })()`);
  await ESC();
  await sleep(500);
  const a = await evalJs(`(() => { const r = document.getElementById('oat-dialog'); const conf = __dy.shown().find((o) => /Cancel the sign-in/.test(o.textContent)); const no = conf?.querySelector('.dialog-footer .btn-cancel'); if (no) no.dataset.dy = 'oat-no'; return { oat: !!r && r.isConnected, inWindow: !!r?.closest('.window'), confirm: !!conf }; })()`);
  await shot('13-oat-asks');
  check('⑬ the OAT sign-in running + Escape ⇒ «Cancel the sign-in?» asked over the LIVE dialog (still open in its window)', live && a.oat && a.inWindow && a.confirm, { live, ...a });
  const pressed = await realClick('[data-dy="oat-no"]');
  await sleep(500);
  const b = await evalJs(`(() => { const r = document.getElementById('oat-dialog'); return { oat: !!r && r.isConnected, confirm: __dy.shown().some((o) => /Cancel the sign-in/.test(o.textContent)), phase: document.querySelector('#oat-mint')?.dataset.phase || null }; })()`);
  check('⑬ …No keeps the sign-in dialog (and its running phase)', pressed && b.oat && !b.confirm && b.phase === 'waiting-code', { pressed, ...b });
  await evalJs(`(() => { const w = document.getElementById('oat-dialog')?.closest('.window'); for (const x of app.wm.windows.values()) if (x.element === w) app.wm.closeWindow(x.id); document.getElementById('oat-dialog')?.remove(); return true; })()`);
  await sleep(300);
});

// ── ⑭ the self-update progress (its caller left Escape off) + Escape ⇒ it stays ──
await step('⑭', async () => {
  await sleep(600);
  await evalJs(`(() => { if (!window.__dyFetch) { window.__dyFetch = window.fetch; window.fetch = (u, o) => { const s = String((u && u.url) || u); const j = (x) => Promise.resolve(new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })); if (/\\/api\\/self-update\\/status/.test(s)) return j({ log: 'Pulling the update…\\n' }); if (/\\/api\\/self-update/.test(s)) return j({ success: true }); return window.__dyFetch(u, o); }; } app._runSelfUpdate(); return true; })()`); // (the update itself stubbed in the page: nothing runs on the scratch server)
  await waitFor(`!!document.getElementById('self-update-dialog')`, 10000);
  await sleep(900);
  await evalJs(`(() => { const r = document.getElementById('self-update-dialog'); r.focus(); return document.activeElement === r; })()`);
  await ESC();
  await sleep(500);
  const a = await evalJs(`(() => { const r = document.getElementById('self-update-dialog'); return { open: !!r && r.isConnected, inWindow: !!r?.closest('.window') }; })()`);
  check('⑭ the self-update progress + Escape from inside it ⇒ it STAYS (its caller left Escape off — the update runs on)', a.open, a);
  await evalJs(`(() => { const w = document.getElementById('self-update-dialog')?.closest('.window'); for (const x of app.wm.windows.values()) if (x.element === w) app.wm.closeWindow(x.id); document.getElementById('self-update-dialog')?.remove(); if (window.__dyFetch) { window.fetch = window.__dyFetch; delete window.__dyFetch; } return true; })()`);
  await sleep(300);
});

// ── ⑮ the same form opened again is RAISED, never replaced: what was typed, its handlers and its guard stay ──
await step('⑮', async () => {
  await sleep(1200);
  const o = await openInstallByClick();
  await realClick('#plugin-install-dialog .plugin-install-value'); await typeText('AAA');
  const id1 = await formWinId();
  await pressChat(); // the form goes behind the chat
  const again = await openInstallByClick(); // its opener pressed a second time
  await sleep(600);
  const s = await evalJs(`(() => { const all = [...app.wm.windows.values()].filter((w) => w.type === 'form' && w.element.dataset.form === 'plugin-install-dialog'); const f = document.getElementById('plugin-install-dialog'); return { windows: all.length, same: all[0]?.id === ${J(id1)}, active: app.wm.activeWindowId === all[0]?.id, value: f?.querySelector('.plugin-install-value')?.value || null, roots: document.querySelectorAll('#plugin-install-dialog').length }; })()`);
  await shot('15-raised');
  check('⑮ the same form opened again (its opener pressed a second time): ONE window — the same one, raised in front — holding «AAA»', o.ok && again.pressed && s.windows === 1 && s.same && s.active && s.roots === 1 && s.value === 'AAA', { o, again, ...s });
  { const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); }
  // a form whose open registers a broadcast handler (the Browser switcher), opened twice
  const h0 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.openBrowserSwitcher({ profileId: 'bp-dy' }); return true; })()`);
  await waitFor(`!!document.getElementById('browser-switcher-dialog')`, 8000);
  const h1 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.openBrowserSwitcher({ profileId: 'bp-dy' }); return true; })()`);
  await sleep(500);
  const h2 = await evalJs(`({ n: app.ws.globalHandlers.length, wins: [...app.wm.windows.values()].filter((w) => w.type === 'form' && w.element.dataset.form === 'browser-switcher-dialog').length })`);
  await evalJs(`(() => { const w = document.getElementById('browser-switcher-dialog')?.closest('.window'); for (const x of app.wm.windows.values()) if (x.element === w) app.wm.closeWindow(x.id); return true; })()`);
  await sleep(300);
  const h3 = await evalJs('app.ws.globalHandlers.length');
  check('⑮ …a form whose open registers a broadcast handler, opened twice: ONE window and ONE handler (the second open\'s released at once); closed: back where it was', h1 === h0 + 1 && h2.n === h1 && h2.wins === 1 && h3 === h0, { h0, h1, h2, h3 });
  // a GUARDED form opened again keeps what was typed AND its guard
  const mk = `(() => { const sh = __dy.api().createModalShell({ id: 'guarded', title: 'A guarded form', kind: 'form', escapeToClose: true, unsaved: { isDirty: () => !!document.querySelector('#plugin-dyprobe-guarded .g-in')?.value, save: async () => true } }); if (!sh.raised) sh.body.innerHTML = '<label>Name <input class="g-in"></label>'; return true; })()`; // (a re-open is RAISED: its caller reads \`raised\` and draws nothing — r3)
  await evalJs(mk);
  await waitFor(`!!document.querySelector('#plugin-dyprobe-guarded .g-in')`, 5000);
  await realClick('#plugin-dyprobe-guarded .g-in'); await typeText('AAA');
  await evalJs(mk); // the same form again
  await sleep(500);
  const g = await evalJs(`(() => { const all = [...app.wm.windows.values()].filter((w) => w.type === 'form' && w.element.dataset.form === 'plugin-dyprobe-guarded'); if (all[0]) app.wm.requestClose(all[0].id); const f = document.getElementById('plugin-dyprobe-guarded'); return { windows: all.length, value: f?.querySelector('.g-in')?.value || null, asked: !!f?.querySelector('.dialog-unsaved'), open: !!f && f.isConnected }; })()`); // its window's ✕ (the person's close)
  check('⑮ …a GUARDED form opened again keeps what was typed and its guard: its window\'s ✕ asks (Save / Discard / Keep editing)', g.windows === 1 && g.value === 'AAA' && g.asked && g.open, g);
  await evalJs(`(() => { document.querySelector('#plugin-dyprobe-guarded .dialog-unsaved-discard')?.click(); document.getElementById('plugin-dyprobe-guarded')?.remove(); return true; })()`);
  await sleep(300);
});

// ── ⑯ a form opened while a danger confirm is up (not from it) waits UNDER it; the confirm answered, the form is a window, the chat alive ──
await step('⑯', async () => {
  await sleep(1200);
  await evalJs(`(() => { window.__dyAns = 'pending'; __dyProbe.showConfirmDialog({ title: 'Delete “payments-old”?', message: 'The conversation and its history go away.', confirmText: 'Delete', danger: true }).then((v) => { window.__dyAns = v; }); return true; })()`);
  await waitFor(`__dy.overlays().length === 1`, 5000);
  await sleep(400);
  await evalJs(`(() => { app._pluginInstallDialog(() => {}); return true; })()`); // a form opened while the confirm stands — not by a press in it
  await waitFor(`!!document.getElementById('plugin-install-dialog')`, 8000);
  await sleep(700);
  const s = await evalJs(`(() => { const o = __dy.shown().find((x) => /payments-old/.test(x.textContent)); const del = o?.querySelector('.dialog-footer .btn-create'), no = o?.querySelector('.dialog-footer .btn-cancel'); if (no) no.dataset.dy = 'confirm-no'; const f = document.getElementById('plugin-install-dialog'); return { sheet: !!f?.classList.contains('dialog-overlay'), win: !!f?.closest('.window'), delHit: del ? __dy.hitIn(del) : false, focusInConfirm: !!o && o.contains(document.activeElement) }; })()`);
  await shot('16-under-the-confirm');
  check('⑯ a form opened while a danger confirm is up waits UNDER it — a window, not a sheet: the confirm\'s Delete is under the pointer and keeps the focus', s.win && !s.sheet && s.delHit && s.focusInConfirm, s);
  const pressedNo = await realClick('[data-dy="confirm-no"]');
  await sleep(600);
  await clearComposer();
  const p = await pressChat();
  await typeText('alive');
  const a = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { overlays: __dy.overlays(), win: !!f?.closest('.window'), composer: document.querySelector('[data-dy="composer"]')?.value || '', ans: window.__dyAns }; })()`);
  await shot('16-confirm-answered');
  check('⑯ …the confirm answered: the form is a window, no blocking layer left — a press on the chat lands and its composer takes the text', pressedNo && a.ans === false && a.overlays.length === 0 && a.win && p.c && a.composer.includes('alive'), { pressedNo, p, ...a });
  { const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); else await evalJs(`document.getElementById('plugin-install-dialog')?.remove(); true`); }
  await sleep(300);
});

// ── ⑰ a form opened FROM a blocking layer (a press inside it) is its sheet above it — and re-hosts as its window the moment the layer closes ──
await step('⑰', async () => {
  await sleep(1200);
  await evalJs(`(() => { window.__dyAns = 'pending'; __dyProbe.showConfirmDialog({ title: 'Pick the plugin first?', message: 'Its install form opens from here.', confirmText: 'OK' }).then((v) => { window.__dyAns = v; }); return true; })()`);
  await waitFor(`__dy.overlays().length === 1`, 5000);
  await evalJs(`(() => { const o = __dy.shown().pop(); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-cancel'; b.textContent = 'Install plugin…'; b.dataset.dy = 'from-layer'; b.onclick = () => app._pluginInstallDialog(() => {}); o.querySelector('.dialog-body').appendChild(b); return true; })()`);
  await sleep(300);
  const pressed = await realClick('[data-dy="from-layer"]');
  await waitFor(`!!document.getElementById('plugin-install-dialog')`, 8000);
  await sleep(600);
  const s = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { sheet: !!f && f.classList.contains('dialog-overlay') && f.classList.contains('form-sheet'), onTop: __dy.hitIn(f?.querySelector('.dialog')) }; })()`);
  check('⑰ a form opened FROM a blocking layer (a press inside it) is its SHEET, above it', pressed && s.sheet && s.onTop, { pressed, ...s });
  await realClick('#plugin-install-dialog .plugin-install-value'); await typeText('from/layer');
  await evalJs(`(() => { __dy.shown().find((o) => /Pick the plugin first/.test(o.textContent))?.querySelector('.dialog-footer .btn-cancel')?.click(); return true; })()`); // the layer closes (answered by its own door)
  await waitFor(`!!document.getElementById('plugin-install-dialog')?.closest('.window')`, 6000);
  await sleep(500);
  const a = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { win: !!f?.closest('.window'), dialogForm: !!f?.classList.contains('dialog-form'), value: f?.querySelector('.plugin-install-value')?.value || null, overlays: __dy.overlays() }; })()`);
  await shot('17-rehosted');
  check('⑰ …the layer closed: the sheet RE-HOSTS as its window (what was typed kept) and nothing blocks the chat', a.win && a.dialogForm && a.value === 'from/layer' && a.overlays.length === 0, a);
  { const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); else await evalJs(`document.getElementById('plugin-install-dialog')?.remove(); true`); }
  await sleep(300);
});

// ── ⑱ the form is a NON-MODAL dialog for assistive tech ──
await step('⑱', async () => {
  const o = await openInstallByClick();
  await sleep(400);
  const d = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); const lb = f?.getAttribute('aria-labelledby'); return { role: f?.getAttribute('role') || null, modal: f?.getAttribute('aria-modal') || null, label: lb ? document.getElementById(lb)?.textContent || null : null }; })()`);
  let ax = null;
  try { const doc = await cdp('DOM.getDocument', { depth: 0 }); const q = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#plugin-install-dialog' }); const tr = await cdp('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }); const n = (tr.nodes || []).find((x) => !x.ignored) || (tr.nodes || [])[0]; ax = { role: n?.role?.value || null, name: n?.name?.value || null }; } catch (e) { ax = { error: String((e && e.message) || e) }; }
  check('⑱ the form is a NON-MODAL dialog for assistive tech: role="dialog", named by its title (aria-labelledby), no aria-modal — the accessibility tree reads «dialog · Install plugin»', o.ok && d.role === 'dialog' && d.modal === null && d.label === 'Install plugin' && ax && ax.role === 'dialog' && ax.name === 'Install plugin', { d, ax });
  { const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); }
  await sleep(300);
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

// ── ⑳ at 900 × 480 (below ~585 px of viewport height) a long form's WHOLE window stays inside the workspace: the dialog capped, its body scrolls, its foot reachable ──
await step('⑳', async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 480, deviceScaleFactor: 1, mobile: false });
  await sleep(1000);
  await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'long', title: 'A long form', kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<label>Name <input class="dy-l-in"></label><div style="height: 900px; flex: none">a long list</div>'; const foot = document.createElement('div'); foot.className = 'dialog-footer'; const go = document.createElement('button'); go.className = 'btn-create dy-l-go'; go.textContent = 'Save'; foot.append(go); sh.dialog.appendChild(foot); window.__dyLong = sh; return true; })()`);
  await waitFor(`!!document.getElementById('plugin-dyprobe-long')?.closest('.window')`, 8000);
  await sleep(1200);
  const g = await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-long'), w = f.closest('.window'), ws = app.wm.workspace.getBoundingClientRect(), r = w.getBoundingClientRect(), d = f.querySelector('.dialog').getBoundingClientRect(), b = f.querySelector('.dialog-body'), go = f.querySelector('.dy-l-go'), c = w.querySelector('.window-content');
    return { vh: innerHeight, wsTop: Math.round(ws.top), wsBottom: Math.round(ws.bottom), top: Math.round(r.top), bottom: Math.round(r.bottom), dBottom: Math.round(d.bottom), bodyScrolls: b.scrollHeight > b.clientHeight + 1, goHit: __dy.hitIn(go), scrolled: c ? c.scrollTop : null }; })()`);
  await shot('20-short-viewport');
  check('⑳ at 900 × 480 a long form\'s WHOLE window stays inside the workspace (the dialog capped at the workspace less the title bar)', g.top >= g.wsTop - 0.5 && g.bottom <= g.wsBottom + 0.5 && g.dBottom <= g.wsBottom + 0.5, g);
  check('⑳ …its body scrolls and its foot (Save) is under the pointer without scrolling the window', g.bodyScrolls && g.goHit && g.scrolled === 0, g);
  await evalJs(`(() => { window.__dyLong?.close(); return true; })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
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
  // round 2: …and BACK (390 → 1280): a sheet exists only while what made it holds — the dirty form is its window again, its value kept
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const home = await waitFor(`!!document.getElementById('plugin-install-dialog')?.closest('.window')`, 10000);
  await sleep(700);
  const k = await evalJs(`(() => { const f = document.getElementById('plugin-install-dialog'); return { win: !!f?.closest('.window'), form: !!f?.classList.contains('dialog-form'), sheet: !!f?.classList.contains('dialog-overlay'), value: f?.querySelector('.plugin-install-value')?.value || null, overlays: __dy.overlays(), hit: __dy.hitIn(f?.querySelector('.dialog')) }; })()`);
  await shot('9-crossing-back');
  check('⑨ …and back at a desktop width (390 → 1280) the sheet is its WINDOW again — no blocking overlay left, what was typed kept', home && k.win && k.form && !k.sheet && k.overlays.length === 0 && k.value === 'kept/across@fold', k);
  await evalJs(`(() => { document.getElementById('plugin-install-dialog')?.remove(); return true; })()`);
  await sleep(300);
  const gone = await evalJs(`!document.getElementById('plugin-install-dialog')`);
  check('⑨ …and its ✕ path (the root\'s remove) closes the sheet', gone);
});

// ════ ROUND 3 (acceptance r2 of c3ed5f0a) — a form's identity is its caller's KEY; a caller never gets a detached shell; «from a
// layer» is captured at the press; an undismissable form is never closed by a neighbour (each leg RED on c3ed5f0a) ════
const formsOpen = () => evalJs(`[...document.querySelectorAll('.dialog-form, .dialog-overlay.form-sheet')].filter((r) => r.isConnected).map((r) => ({ id: r.id, h3: r.querySelector('.dialog-header h3')?.textContent || '', sheet: r.classList.contains('form-sheet'), win: !!r.closest('.window') }))`);
const closeForms = () => evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'form') { w.onCloseRequest = null; app.wm.closeWindow(w.id); } document.querySelectorAll('.dialog-overlay.form-sheet').forEach((e) => e.remove()); return true; })()`);
const tagIn = (rootExpr, sel, name) => evalJs(`(() => { document.querySelectorAll('[data-dy="${name}"]').forEach((x) => { delete x.dataset.dy; }); const r = ${rootExpr}; const e = r && r.querySelector(${J(sel)}); if (!e) return false; e.dataset.dy = ${J(name)}; return true; })()`);
const byTitle = (t) => `[...document.querySelectorAll('.dialog-form, .dialog-overlay')].find((r) => r.isConnected && r.querySelector(':scope > .dialog > .dialog-header h3')?.textContent === ${J(t)})`;

// ── ㉑ Rotate… twice on one caller ⇒ the NEW token is drawn; a pairing code re-minted after «Expired» ⇒ the new code (the real showTokenOnce / showPairCodeOnce) ──
await step('㉑', async () => {
  const r = await evalJs(`(async () => {
    const tick = () => new Promise((res) => setTimeout(res, 80));
    const shown = () => [...document.querySelectorAll('[data-wh-token]')].filter((c) => c.isConnected).map((c) => c.textContent);
    __dyProbe.showTokenOnce({ caller: { name: 'bot', auth: 'bearer', id: 'c1' }, token: 'tok_ONE', rotated: true }); await tick();
    const first = shown();
    __dyProbe.showTokenOnce({ caller: { name: 'bot', auth: 'bearer', id: 'c1' }, token: 'tok_TWO', rotated: true }); await tick();
    const second = shown(), roots = document.querySelectorAll('#chan-wh-token').length;
    __dyProbe.showPairCodeOnce({ code: 'vswp_OLD', expiresAt: Date.now() - 1000, path: 'inbox' }); await tick();
    const pc1 = { code: document.querySelector('[data-wh-pair-code]')?.textContent, clock: document.querySelector('[data-wh-pair-clock]')?.dataset.whPairClock };
    __dyProbe.showPairCodeOnce({ code: 'vswp_NEW', expiresAt: Date.now() + 600000, path: 'inbox' }); await tick();
    const pc2 = { codes: [...document.querySelectorAll('[data-wh-pair-code]')].filter((c) => c.isConnected).map((c) => c.textContent), clock: document.querySelector('[data-wh-pair-clock]')?.dataset.whPairClock, roots: document.querySelectorAll('#chan-wh-paircode').length };
    for (const id of ['chan-wh-token', 'chan-wh-paircode']) document.querySelector('#' + id + ' .dialog-close')?.click();
    await tick();
    return { first, second, roots, pc1, pc2, left: document.querySelectorAll('#chan-wh-token, #chan-wh-paircode').length };
  })()`);
  check('㉑ Rotate… twice on one caller ⇒ ONE dialog showing the NEW token (tok_TWO) — never the one rotated away (c3ed5f0a: tok_ONE, tok_TWO into a detached shell)', J(r.first) === J(['tok_ONE']) && J(r.second) === J(['tok_TWO']) && r.roots === 1, r);
  check('㉑ …a pairing code re-minted after «Expired — make a new code» ⇒ the new code shown, its clock running (c3ed5f0a: «—», expired)', r.pc1.clock === 'expired' && J(r.pc2.codes) === J(['vswp_NEW']) && r.pc2.clock === 'running' && r.pc2.roots === 1 && r.left === 0, r);
});

// ── ㉒ the Browser switcher for pA, then pB (the title says «Browser» for both) ⇒ pB's switcher in front; pB again ⇒ raised, one handler ──
await step('㉒', async () => {
  const r = await evalJs(`(async () => {
    const wait = () => new Promise((res) => setTimeout(res, 400));
    const h0 = app.ws.globalHandlers.length;
    const a = app.openBrowserSwitcher({ profileId: 'pA' }); await wait();
    const h1 = app.ws.globalHandlers.length;
    const b = app.openBrowserSwitcher({ profileId: 'pB' }); await wait();
    const h2 = app.ws.globalHandlers.length;
    const root = document.getElementById('browser-switcher-dialog');
    const bLive = !!b && !!b.overlay && b.overlay === root && root.isConnected;
    const w = root && root.closest('.window');
    const b2 = app.openBrowserSwitcher({ profileId: 'pB' }); await wait();
    const h3 = app.ws.globalHandlers.length;
    return { h0, h1, h2, h3, aClosed: a.state().closed, bClosed: b.state().closed, bLive, front: !!w && w.classList.contains('window-active'), same: !!b2 && b2.overlay === root, roots: document.querySelectorAll('#browser-switcher-dialog').length };
  })()`);
  check('㉒ the switcher for pA, then for pB ⇒ pB\'s switcher is the one open and in front, pA\'s closed through its door (c3ed5f0a: pA raised, pB\'s handle closed)', !r.bClosed && r.aClosed && r.bLive && r.front && r.roots === 1, r);
  check('㉒ …pB again ⇒ RAISED (its handle back, one window) and the broadcast handlers stay ONE per open switcher', r.same && r.h1 === r.h0 + 1 && r.h2 === r.h1 && r.h3 === r.h2, r);
  await closeForms(); await sleep(300);
});

// ── ㉓ the Agents manager opened twice ⇒ raised, its refresh hook bound to the LIVE body ──
await step('㉓', async () => {
  await evalJs(`(() => { app._showAgentsDialog({ forceModal: true }); return true; })()`);
  await waitFor(`!!document.getElementById('agents-dialog-overlay')`, 10000);
  await sleep(800);
  await evalJs(`(() => { app._showAgentsDialog({ forceModal: true }); return true; })()`);
  await sleep(800);
  const r = await evalJs(`({ hook: app._agentsRefreshHook ? app._agentsRefreshHook() : null, roots: document.querySelectorAll('#agents-dialog-overlay').length, forms: [...app.wm.windows.values()].filter((w) => w.type === 'form').length })`);
  check('㉓ the Agents manager opened twice ⇒ ONE manager, raised, and _agentsRefreshHook() answers true — it refreshes the live one (c3ed5f0a: false, bound to a detached body)', r.hook === true && r.roots === 1 && r.forms === 1, r);
  await closeForms(); await sleep(300);
});

// ── ㉔ another subject under the same id while the open one is DIRTY ⇒ its door asks; Discard ⇒ the asked form OPENS; Keep editing ⇒ it never does (said: its onClose, ready null) ──
await step('㉔', async () => {
  const openA = async () => {
    await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'q', key: 'A', title: 'Notes', kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<label>Note <input class="dy-q-in"></label>'; return true; })()`);
    await waitFor(`!!document.querySelector('#plugin-dyprobe-q .dy-q-in')`, 5000);
    await realClick('#plugin-dyprobe-q .dy-q-in'); await typeText('draft');
  };
  const openB = () => evalJs(`(() => { window.__dyQB = 'open'; window.__dyQReady = 'pending'; const b = __dy.api().createModalShell({ id: 'q', key: 'B', title: 'Notes', kind: 'form', escapeToClose: true, onClose: () => { window.__dyQB = 'closed'; } }); b.body.innerHTML = '<p class="dy-q-b">B\\'s content</p>'; if (b.ready) b.ready.then((x) => { window.__dyQReady = x ? 'open' : 'null'; }); return { asked: !!b.asked, raised: !!b.raised }; })()`);
  await openA();
  const asked = await openB();
  await sleep(400);
  const a1 = await evalJs(`({ ask: !!document.querySelector('#plugin-dyprobe-q .dialog-unsaved'), bShown: !!document.querySelector('.dy-q-b')?.isConnected })`);
  if (a1.ask) await realClick('#plugin-dyprobe-q .dialog-unsaved-discard');
  await sleep(600);
  const d = await evalJs(`({ bShown: !!document.querySelector('.dy-q-b')?.isConnected, bWin: !!document.querySelector('.dy-q-b')?.closest('.window'), aGone: !document.querySelector('.dy-q-in'), ready: window.__dyQReady, roots: document.querySelectorAll('#plugin-dyprobe-q').length })`);
  check('㉔ another subject under the id while the open one is dirty ⇒ its door ASKS first, the new one waits (asked)', asked.asked && !asked.raised && a1.ask && !a1.bShown, { asked, a1 });
  check('㉔ …Discard ⇒ the form the person asked for OPENS with its content (c3ed5f0a: dropped — no form left)', d.bShown && d.bWin && d.aGone && d.ready === 'open' && d.roots === 1, d);
  await closeForms(); await sleep(300);
  await openA();
  await openB();
  await sleep(400);
  const k0 = await evalJs(`!!document.querySelector('#plugin-dyprobe-q .dialog-unsaved')`);
  if (k0) await realClick('#plugin-dyprobe-q .dialog-unsaved-keep');
  await sleep(500);
  const k = await evalJs(`({ bShown: !!document.querySelector('.dy-q-b')?.isConnected, b: window.__dyQB, ready: window.__dyQReady, kept: document.querySelector('.dy-q-in')?.value || null })`);
  check('㉔ …Keep editing ⇒ the asked form never opens, and that is SAID to its caller (its onClose ran, ready → null); the draft stays', k0 && !k.bShown && k.b === 'closed' && k.ready === 'null' && k.kept === 'draft', { k0, ...k });
  await closeForms(); await sleep(300);
  // the real pair: a dirty «Connect storage», then «Add remote machine» — each its own id now: both open, nothing asked, nothing lost
  await evalJs(`(() => { app.sidebar._showAddMountDialog(); return true; })()`);
  await waitFor(`!!${byTitle('Connect storage')}?.querySelector('input[placeholder="my-mount"]')`, 10000);
  await tagIn(byTitle('Connect storage'), 'input[placeholder="my-mount"]', 'cs-name');
  await realClick('[data-dy="cs-name"]'); await typeText('nas1');
  await evalJs(`(() => { app.sidebar._showAddHostDialog({ key: { exists: true } }); return true; })()`);
  await sleep(800);
  const p1 = await evalJs(`({ ask: !!document.querySelector('.dialog-unsaved'), titles: [...document.querySelectorAll('.dialog-form, .dialog-overlay')].filter((r) => r.isConnected).map((r) => r.querySelector('.dialog-header h3')?.textContent) })`);
  if (p1.ask) { await evalJs(`(() => { const b = document.querySelector('.dialog-unsaved-discard'); if (b) b.dataset.dy = 'disc'; return true; })()`); await realClick('[data-dy="disc"]'); await sleep(700); }
  const p2 = await evalJs(`({ titles: [...document.querySelectorAll('.dialog-form, .dialog-overlay')].filter((r) => r.isConnected).map((r) => r.querySelector('.dialog-header h3')?.textContent), name: ${byTitle('Connect storage')}?.querySelector('input[placeholder="my-mount"]')?.value || null })`);
  check('㉔ the real pair — a dirty «Connect storage», then «Add remote machine» ⇒ Add remote machine is open, Connect storage beside it with «nas1» (c3ed5f0a: one shared id — asked, and after Discard nothing open)', p2.titles.includes('Add remote machine') && p2.titles.includes('Connect storage') && p2.name === 'nas1' && !p1.ask, { p1, p2 });
  await closeForms(); await sleep(300);
});

// ── ㉕ a running «Set up <machine>» (no Escape, no backdrop) is never closed by a neighbour: Connect storage opens BESIDE it, its live-log handler kept ──
await step('㉕', async () => {
  const h0 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.sidebar._showBootstrapDialog({ id: 'h-dy', name: 'box1' }); return true; })()`);
  const shown = await waitFor(`!!${byTitle('Set up box1')}?.querySelector('.bs-start')`, 10000);
  await waitFor(`app.ws.globalHandlers.length > ${h0}`, 6000);   // (its live-log handler registers after the view is drawn)
  const h1 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.sidebar._showAddMountDialog(); return true; })()`);
  await waitFor(`!!${byTitle('Connect storage')}`, 10000);
  await sleep(600);
  const r = await evalJs(`({ setup: !!${byTitle('Set up box1')}, storage: !!${byTitle('Connect storage')}, h2: app.ws.globalHandlers.length })`);
  check('㉕ «Set up box1» running, then «Connect storage» ⇒ BOTH open and the set-up\'s live-log handler kept (c3ed5f0a: the shared id\'s door closed the set-up, handlers 28 → 27)', shown && r.setup && r.storage && h1 === h0 + 1 && r.h2 === h1, { shown, h0, h1, ...r });
  await closeForms(); await sleep(400);
});

// ── ㉖ a select that applies at once is no draft: Escape closes, nothing asked (the vault Filter's Sort) ──
await step('㉖', async () => {
  await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'filt', title: 'Filter', kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<label>Sort <select class="dy-f-sel"><option value="name">Name</option><option value="recent">Recent</option></select></label>'; window.__dySort = null; sh.body.querySelector('.dy-f-sel').onchange = (e) => { window.__dySort = e.target.value; }; return true; })()`);
  await waitFor(`!!document.querySelector('#plugin-dyprobe-filt .dy-f-sel')`, 5000);
  await evalJs(`(() => { const s = document.querySelector('#plugin-dyprobe-filt .dy-f-sel'); s.focus(); s.value = 'recent'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);   // (the pick, applied at once)
  await ESC(); await sleep(400);
  const r = await evalJs(`({ open: !!document.getElementById('plugin-dyprobe-filt'), ask: !!document.querySelector('#plugin-dyprobe-filt .dialog-unsaved'), sort: window.__dySort })`);
  check('㉖ a select that applied at once (the vault Filter\'s Sort) + Escape ⇒ the form closes, nothing asked (c3ed5f0a: «You have unsaved changes»)', !r.open && !r.ask && r.sort === 'recent', r);
  await closeForms(); await sleep(300);
});

// ── ㉗ Publish page: the re-read at the answer FAILED (a 502) ⇒ «could not re-check — try again», the person's Unpublish still theirs ──
await step('㉗', async () => {
  await evalJs(`(() => { window.__dyPubFetch = window.fetch; window.__dyPubFail = false; window.__dyDel = 0; window.fetch = (u, o) => { const s = String((u && u.url) || u); if (/\\/api\\/pages\\/by-path/.test(s)) { window.__dyPubN = (window.__dyPubN || 0) + 1; return !window.__dyPubFail ? Promise.resolve(new Response(JSON.stringify({ page: { id: 'pg1', url: '/p/pg1', name: 'notes', public: false } }), { headers: { 'Content-Type': 'application/json' } })) : Promise.resolve(new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } })); } if (/\\/api\\/pages\\/pg1/.test(s) && o && o.method === 'DELETE') { window.__dyDel++; return Promise.resolve(new Response(JSON.stringify({ ok: true }))); } return window.__dyPubFetch(u, o); }; window.__dyFx = app.openFileExplorer(${J(CWD)}); window.__dyFx._explorer._publishPageDialog(${J(CWD + '/notes.html')}, 'notes.html'); return true; })()`);
  const drawn = await waitFor(`!!document.querySelector('#pp-unpub')`, 8000);
  const d0 = await evalJs(`({ n: window.__dyPubN || 0, h3: document.querySelector('#publish-page-dialog .dialog-header h3')?.textContent || null, text: (document.getElementById('publish-page-dialog')?.innerText || '').slice(0, 160), html: (document.getElementById('publish-page-dialog')?.innerHTML || '').slice(0, 400) })`);
  d0.errors = pageErrors.slice(-3).map((x) => String(x).slice(0, 300));
  await sleep(400);
  await evalJs(`(() => { window.__dyPubFail = true; return true; })()`);   // the hub hiccups now: the re-read at the answer gets a 502 (the explorer reads by-path itself — armed only now)
  await realClick('#pp-unpub');
  await sleep(1000);
  const r = await evalJs(`({ unpub: !!document.querySelector('#pp-unpub'), title: document.querySelector('#pp-unpub')?.closest('.dialog')?.querySelector('.dialog-header h3')?.textContent || null, said: document.body.innerText.includes('Could not re-check this page'), false: document.body.innerText.includes('unpublished elsewhere'), deleted: window.__dyDel, fx: !!window.__dyFx, ex: !!window.__dyFx?._explorer, root: !!document.getElementById('publish-page-dialog'), forms: [...document.querySelectorAll('.dialog-form')].map((f) => f.id), n: window.__dyPubN || 0 })`);
  r.drawn = drawn; r.d0 = d0;
  check('㉗ Publish page, the re-read at Unpublish gets a 502 ⇒ «Could not re-check this page — try again», the form still the Published page with its Unpublish, nothing deleted (c3ed5f0a: «unpublished elsewhere», the form redrawn as Publish page)', r.said && !r.false && r.unpub && r.deleted === 0, r);
  await evalJs(`(() => { window.fetch = window.__dyPubFetch; delete window.__dyPubFetch; const w = window.__dyFx; if (w) app.wm.closeWindow(w.id); return true; })()`);
  await closeForms(); await sleep(400);
});

// ── ㉘ «from the layer» is captured AT THE PRESS: Browse… in New Session over a remote listing that takes 2.5 s ⇒ the picker is its sheet ON TOP; Browse… again ⇒ raised ──
await step('㉘', async () => {
  await evalJs(`(() => { window.__dyNsFetch = window.fetch; window.fetch = (u, o) => { const s = String((u && u.url) || u); if (/\\/api\\/hosts\\/hx\\/dir-complete/.test(s)) { (window.__dyDc ||= []).push(Math.round(performance.now())); return new Promise((res) => setTimeout(() => res(new Response(JSON.stringify({ listing: { home: '/home/u', machine: 'hx', dirs: { '~': { kids: ['work'] }, '~/work': { kids: [] } }, links: {}, localized: {}, mounts: [] } }), { headers: { 'Content-Type': 'application/json' } })), 3000)); } return window.__dyNsFetch(u, o); }; app.showNewSessionDialog(); return true; })()`);
  await waitFor(`!document.getElementById('dialog-overlay').classList.contains('hidden') && !!document.querySelector('#dialog-new-session .pf-pick')`, 8000);
  await evalJs(`(() => { const s = document.getElementById('input-host'); if (![...s.options].some((o) => o.value === 'hx')) { const o = document.createElement('option'); o.value = 'hx'; o.textContent = 'box-x'; s.appendChild(o); } s.value = 'hx'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(1500);   // (the machine list lands and sets the select again — the person's pick comes after it)
  const hostSet = await evalJs(`(() => { const s = document.getElementById('input-host'); if (![...s.options].some((o) => o.value === 'hx')) { const o = document.createElement('option'); o.value = 'hx'; o.textContent = 'box-x'; s.appendChild(o); } s.value = 'hx'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(300);
  await evalJs(`(() => { window.__dyPickAt = 0; window.__dyPickerAt = 0; document.addEventListener('pointerdown', () => { window.__dyPickAt = Math.round(performance.now()); }, { capture: true, once: true }); new MutationObserver((_, mo) => { if (document.querySelector('.dialog.pf-picker')) { window.__dyPickerAt = Math.round(performance.now()); mo.disconnect(); } }).observe(document.body, { childList: true, subtree: true }); return true; })()`);
  await realClick('#dialog-new-session .pf-pick');
  const appeared = await waitFor(`!!document.querySelector('.dialog.pf-picker')`, 10000);
  await sleep(500);
  const g = await evalJs(`(() => { const d = document.querySelector('.dialog.pf-picker'); if (!d) return { picker: false }; const r = d.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)); return { picker: true, sheet: d.parentElement.classList.contains('form-sheet'), onTop: !!h && !!h.closest('.pf-picker'), focusIn: d.contains(document.activeElement), afterPress: window.__dyPickerAt && window.__dyPickAt ? window.__dyPickerAt - window.__dyPickAt : null, listings: (window.__dyDc || []).map((t) => t - window.__dyPickAt), host: document.getElementById('input-host').value }; })()`);
  g.hostSet = hostSet;
  await shot('28-browse-late');
  check(`㉘ Browse… in New Session over a 3 s remote listing (the picker opened ${g.afterPress} ms after the press) ⇒ it is its SHEET on top, under the pointer (c3ed5f0a: a window BEHIND the New Session sheet, unreachable)`, appeared && g.picker && g.afterPress > 1500 && g.sheet && g.onTop, g);
  await evalJs(`(() => { document.querySelector('#dialog-new-session .pf-pick').click(); return true; })()`);   // the button again (its press is under the sheet: the act itself)
  await sleep(600);
  const a = await evalJs(`({ pickers: document.querySelectorAll('.dialog.pf-picker').length, onTop: (() => { const d = document.querySelector('.dialog.pf-picker'); if (!d) return false; const r = d.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)); return !!h && !!h.closest('.pf-picker'); })() })`);
  check('㉘ …Browse… again ⇒ the open picker raised (ONE picker, on top) — never a dead button', a.pickers === 1 && a.onTop, a);
  await evalJs(`(() => { document.querySelector('.dialog.pf-picker .dialog-close')?.click(); return true; })()`);
  await sleep(400);
});

// ── ㉙ a SYSTEM form 1403 ms after a press inside the New Session sheet ⇒ behind (never a sheet over it); ㉚ typing in its name field, then a system form ⇒ behind, the keys stay in the field ──
await step('㉙', async () => {
  await evalJs(`(() => { window.__dyPressAt = 0; document.addEventListener('pointerdown', () => { window.__dyPressAt = performance.now(); }, { capture: true, once: true }); return true; })()`);
  await realClick('#dialog-new-session label');
  const dt = await evalJs(`new Promise((res) => { const wait = Math.max(0, 1403 - (performance.now() - window.__dyPressAt)); setTimeout(() => { const sh = __dy.api().createModalShell({ id: 'sys1', title: 'From the system', kind: 'form', opener: 'system', escapeToClose: true }); sh.body.innerHTML = '<p>news</p>'; res(Math.round(performance.now() - window.__dyPressAt)); }, wait); })`);
  await sleep(400);
  const r = await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-sys1'); const ns = document.getElementById('dialog-new-session'); const r2 = ns.getBoundingClientRect(); const h = document.elementFromPoint(r2.left + r2.width / 2, r2.top + 30); return { sheet: !!f?.classList.contains('form-sheet'), win: !!f?.closest('.window'), nsOnTop: !!h && !!h.closest('#dialog-new-session') }; })()`);
  check(`㉙ a SYSTEM form ${dt} ms after a press inside the New Session sheet ⇒ BEHIND it (a window), never a sheet over it (c3ed5f0a: a sheet covering New Session)`, dt >= 1300 && !r.sheet && r.win && r.nsOnTop, { dt, ...r });
  await closeForms(); await sleep(300);
});
await step('㉚', async () => {
  await realClick('#input-session-name'); await evalJs(`(() => { const i = document.getElementById('input-session-name'); i.value = ''; return true; })()`);
  await typeText('abc');
  await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'sys2', title: 'Also from the system', kind: 'form', opener: 'system', escapeToClose: true }); sh.body.innerHTML = '<p>news</p>'; return true; })()`);
  await sleep(120);
  await typeText('def');
  await sleep(300);
  const r = await evalJs(`(() => { const f = document.getElementById('plugin-dyprobe-sys2'); return { sheet: !!f?.classList.contains('form-sheet'), win: !!f?.closest('.window'), value: document.getElementById('input-session-name').value, focus: document.activeElement?.id || document.activeElement?.className || null }; })()`);
  await shot('30-typing-system');
  check('㉚ typing in New Session\'s name field, then a SYSTEM form ⇒ behind (no sheet over the field), the keys stay in the field: «abcdef» (c3ed5f0a: a sheet covered the field being typed in)', !r.sheet && r.win && r.value === 'abcdef' && r.focus === 'input-session-name', r);
  await closeForms();
  await evalJs(`(() => { if (window.__dyNsFetch) { window.fetch = window.__dyNsFetch; delete window.__dyNsFetch; } app.hideDialogs?.(); return true; })()`);
  await sleep(500);
});

// ── ㉛ a re-host MOVES the element: a form holding an iframe and a scrolled list, across desktop → phone → desktop ⇒ the iframe loaded ONCE, the list where it was ──
await step('㉛', async () => {
  await evalJs(`(() => { window.__dyLoads = 0; const sh = __dy.api().createModalShell({ id: 'frm', title: 'A page and a list', kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<div class="dy-scr" style="height: 120px; overflow: auto; flex: none"><div style="height: 900px">rows</div></div>'; const f = document.createElement('iframe'); f.className = 'dy-if'; f.style.height = '80px'; f.addEventListener('load', () => { window.__dyLoads++; }); f.srcdoc = '<p>a page</p>'; sh.body.appendChild(f); return true; })()`);
  await waitFor(`window.__dyLoads === 1 && !!document.getElementById('plugin-dyprobe-frm')?.closest('.window')`, 8000);
  await sleep(300);
  await evalJs(`(() => { document.querySelector('#plugin-dyprobe-frm .dy-scr').scrollTop = 150; return true; })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(`!!document.getElementById('plugin-dyprobe-frm')?.classList.contains('dialog-overlay')`, 8000);
  await sleep(700);
  const ph = await evalJs(`({ loads: window.__dyLoads, scroll: document.querySelector('#plugin-dyprobe-frm .dy-scr')?.scrollTop, sheet: !!document.getElementById('plugin-dyprobe-frm')?.classList.contains('form-sheet') })`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitFor(`!!document.getElementById('plugin-dyprobe-frm')?.closest('.window')`, 10000);
  await sleep(800);
  const dk = await evalJs(`({ loads: window.__dyLoads, scroll: document.querySelector('#plugin-dyprobe-frm .dy-scr')?.scrollTop, win: !!document.getElementById('plugin-dyprobe-frm')?.closest('.window') })`);
  check('㉛ a form holding an iframe and a scrolled list, desktop → phone → desktop ⇒ re-hosted each way, the iframe loaded ONCE and the list still at 150 (c3ed5f0a: loads 1 → 2 → 3, scrollTop 150 → 0)', ph.sheet && dk.win && ph.loads === 1 && dk.loads === 1 && Math.round(ph.scroll) === 150 && Math.round(dk.scroll) === 150, { ph, dk });
  await closeForms(); await sleep(300);
});

// ── ㉜ the phone (390 × 844) with the on-screen keyboard up (a 400 px visual viewport) ⇒ a sheet's foot (Save) stays above it ──
await step('㉜', async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  await evalJs(`(() => { const sh = __dy.api().createModalShell({ id: 'kb', title: 'A form on the phone', kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<label>Name <input class="dy-kb-in"></label><div style="height: 520px; flex: none">a long list</div>'; const foot = document.createElement('div'); foot.className = 'dialog-footer'; const go = document.createElement('button'); go.className = 'btn-create dy-kb-go'; go.textContent = 'Save'; foot.append(go); sh.dialog.appendChild(foot); return true; })()`);
  await waitFor(`!!document.getElementById('plugin-dyprobe-kb')?.classList.contains('dialog-overlay')`, 8000);
  await sleep(400);
  const before = await evalJs(`Math.round(document.querySelector('#plugin-dyprobe-kb .dy-kb-go').getBoundingClientRect().bottom)`);
  await evalJs(`(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 400 }); window.visualViewport.dispatchEvent(new Event('resize')); return true; })()`);
  await sleep(700);
  const r = await evalJs(`(() => { const go = document.querySelector('#plugin-dyprobe-kb .dy-kb-go'), b = go.getBoundingClientRect(); return { kbOpen: document.documentElement.classList.contains('vs-kb-open'), inset: getComputedStyle(document.documentElement).getPropertyValue('--kb-inset').trim(), top: Math.round(b.top), bottom: Math.round(b.bottom) }; })()`);
  await shot('32-keyboard');
  check('㉜ the phone with a 400 px visual viewport (the keyboard up) ⇒ the sheet\'s Save stays above the keyboard (c3ed5f0a: 744–770, under it)', r.kbOpen && r.bottom <= 400 && r.top >= 0, { before, ...r });
  await evalJs(`(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); return true; })()`);
  await closeForms();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
});

// ── ㉝ Reach & policy re-opened for the same conversation ⇒ RAISED, its broadcast handlers +0 (the real showReachDialog) ──
await step('㉝', async () => {
  await evalJs(`(() => { window.__dyReFetch = window.fetch; window.fetch = (u, o) => { const s = String((u && u.url) || u); if (/\\/api\\/channels\\/lark\\/c-dy(\\?|$)/.test(s) && (!o || !o.method || o.method === 'GET')) return Promise.resolve(new Response(JSON.stringify({ conversation: { adapterId: 'lark', id: 'c-dy', title: 'ops', policy: null, reach: { entries: [], requests: [] } } }), { headers: { 'Content-Type': 'application/json' } })); return window.__dyReFetch(u, o); }; return true; })()`);
  const h0 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { __dyProbe.showReachDialog(app, { adapterId: 'lark', id: 'c-dy', title: 'ops' }); return true; })()`);
  await waitFor(`!!document.getElementById('chan-reach-dialog')`, 8000);
  await sleep(500);
  const h1 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { __dyProbe.showReachDialog(app, { adapterId: 'lark', id: 'c-dy', title: 'ops' }); return true; })()`);
  await sleep(800);
  const h2 = await evalJs('app.ws.globalHandlers.length');
  const roots = await evalJs(`document.querySelectorAll('#chan-reach-dialog').length`);
  await evalJs(`(() => { document.querySelector('#chan-reach-dialog .dialog-close')?.click(); return true; })()`);
  await sleep(500);
  const h3 = await evalJs('app.ws.globalHandlers.length');
  check('㉝ Reach & policy re-opened for the same conversation ⇒ RAISED (one dialog) and the broadcast handlers +0; closed ⇒ back to where they were (c3ed5f0a: +1 per re-open, re-fetching into a detached body)', h1 > h0 && h2 === h1 && roots === 1 && h3 === h0, { h0, h1, h2, h3, roots });
  await evalJs(`(() => { window.fetch = window.__dyReFetch; delete window.__dyReFetch; return true; })()`);
});

// ── ㉞ (r4) a form opened BESIDE an undismissable one is found by its key: Set up box1 running, Set up box2 beside it, Set up box2 again ⇒ box2's RAISED (two set-ups, handlers +0) ──
await step('㉞', async () => {
  const setups = `[...document.querySelectorAll('.dialog-form, .dialog-overlay')].filter((r) => r.isConnected && /^Set up /.test(r.querySelector(':scope > .dialog > .dialog-header h3')?.textContent || '')).map((r) => r.id + '=' + r.querySelector(':scope > .dialog > .dialog-header h3').textContent)`;
  const h0 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.sidebar._showBootstrapDialog({ id: 'h-dy1', name: 'box1' }); return true; })()`);
  await waitFor(`!!${byTitle('Set up box1')}?.querySelector('.bs-start')`, 10000);
  await waitFor(`app.ws.globalHandlers.length > ${h0}`, 6000);
  await evalJs(`(() => { app.sidebar._showBootstrapDialog({ id: 'h-dy2', name: 'box2' }); return true; })()`);
  await waitFor(`!!${byTitle('Set up box2')}?.querySelector('.bs-start')`, 10000);
  await waitFor(`app.ws.globalHandlers.length > ${h0 + 1}`, 6000);
  const h1 = await evalJs('app.ws.globalHandlers.length');
  await evalJs(`(() => { app.sidebar._showBootstrapDialog({ id: 'h-dy2', name: 'box2' }); return true; })()`);
  await sleep(1200);
  const r = await evalJs(`({ setups: ${setups}, h2: app.ws.globalHandlers.length, front: (() => { const w = app.wm.windows.get(app.wm.activeWindowId); return w ? w.title : null; })() })`);
  await shot('34-beside-raised');
  check('㉞ Set up box1 running, Set up box2 beside it, then Set up box2 AGAIN ⇒ box2\'s set-up RAISED — two set-up forms, its live-log handler not doubled (981f70d6: a third «host-setup-dialog-3», a second Start and handler for box2)', r.setups.length === 2 && r.setups.filter((x) => /=Set up box2$/.test(x)).length === 1 && r.h2 === h1, { h0, h1, ...r });
  await closeForms(); await sleep(400);
});

// ── ㉟ (r4) a QUEUED form's caller is told: «Models — A» with an edit, then «Models — B» (the real openAccountModelsDialog) ⇒ A asks; Discard ⇒ B OPENS DRAWN (its models), its caller answered ──
await step('㉟', async () => {
  await evalJs(`(() => { window.__dyAmFetch = window.fetch; window.fetch = (u, o) => { const s = String((u && u.url) || u); const m = /\\/api\\/accounts\\/(acct-[AB])\\/models$/.exec(s); if (m && (!o || !o.method || o.method === 'GET')) { const id = m[1].slice(5); return Promise.resolve(new Response(JSON.stringify({ provider: { id: 'p-' + id, kind: 'self-hosted', label: 'Self-hosted or other', models: [{ id: 'model-' + id, label: 'model-' + id, context: 200000, caps: [] }], modelsSource: 'configured', aliases: {} }, editable: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } return window.__dyAmFetch(u, o); }; return true; })()`);
  await evalJs(`(() => { __dyProbe.openAccountModelsDialog({ accountId: 'acct-A', name: 'A' }); return true; })()`);
  await waitFor(`!!document.querySelector('#account-models-dialog input.am-id')`, 8000);
  await tagIn(`document.getElementById('account-models-dialog')`, 'input.am-id', 'am-a');
  await realClick('[data-dy="am-a"]'); await typeText('-edited');
  await evalJs(`(() => { window.__dyAmB = 'pending'; __dyProbe.openAccountModelsDialog({ accountId: 'acct-B', name: 'B' }).then((v) => { window.__dyAmB = v === null ? 'null' : typeof v; }); return true; })()`);
  await sleep(700);
  const asked = await evalJs(`!!document.querySelector('#account-models-dialog .dialog-unsaved-discard')`);
  if (asked) { await tagIn(`document.getElementById('account-models-dialog')`, '.dialog-unsaved-discard', 'am-disc'); await realClick('[data-dy="am-disc"]'); }
  await sleep(1000);
  const r = await evalJs(`({ asked: ${asked}, roots: [...document.querySelectorAll('#account-models-dialog')].map((o) => ({ title: o.querySelector('h3')?.textContent, ids: [...o.querySelectorAll('input.am-id')].map((i) => i.value), loading: /Loading…/.test(o.querySelector('.dialog-body')?.textContent || '') })), caller: window.__dyAmB })`);
  await shot('35-queued-drawn');
  check('㉟ «Models — A» edited, then «Models — B» ⇒ A asks; Discard ⇒ B opens DRAWN (model-B) and its caller is answered (981f70d6: B stuck on «Loading…», the call returned null)', r.asked && r.roots.length === 1 && r.roots[0].title === 'Models — B' && r.roots[0].ids.join() === 'model-B' && !r.roots[0].loading && r.caller === 'object', r);
  await closeForms(); await evalJs(`(() => { document.querySelectorAll('#account-models-dialog').forEach((o) => o.remove()); return true; })()`); await sleep(300);   // (the probe bundle's own shell draws sheets: closeForms never sees them)
  await evalJs(`(() => { window.fetch = window.__dyAmFetch; delete window.__dyAmFetch; return true; })()`);
});

// ── ㊱ (r4) a picker's key is the field INSTANCE: two mount forms open at once, each with its 'mounts:mountpoint' field (Share a folder onto box1 · Mount a folder from box1), Browse… on each ⇒ two pickers; the second one's pick lands in ITS field ──
await step('㊱', async () => {
  await evalJs(`(() => { window.__dyMpFetch = window.fetch; window.fetch = (u, o) => { const s = String((u && u.url) || u); if (/\\/api\\/hosts\\/h-dy\\/dir-complete/.test(s)) return Promise.resolve(new Response(JSON.stringify({ listing: { home: '/home/u', machine: 'h-dy', dirs: { '~': { kids: ['work'] }, '~/work': { kids: [] } }, links: {}, localized: {}, mounts: [] } }), { headers: { 'Content-Type': 'application/json' } })); return window.__dyMpFetch(u, o); }; return true; })()`);
  const h = `{ id: 'h-dy', name: 'box1', transport: 'ssh', user: 'me' }`;
  const SHARE = 'Share a folder onto "box1"', PULL = 'Mount a folder from "box1" into this VibeSpace';
  await evalJs(`(() => { app.sidebar._showHostMountDialog(${h}); app.sidebar._showMachinePullDialog(${h}); return true; })()`);
  await waitFor(`!!${byTitle(SHARE)}?.querySelector('.pf-pick') && !!${byTitle(PULL)}?.querySelector('.pf-pick')`, 10000);
  const mp = (title) => `${byTitle(title)}?.querySelector('input[placeholder^="default: ~/vibespace-"]')`;
  await evalJs(`(() => { const a = ${mp(SHARE)}, b = ${mp(PULL)}; a.closest('.path-field').querySelector('.pf-pick').dataset.dy = 'mp-a'; b.closest('.path-field').querySelector('.pf-pick').dataset.dy = 'mp-b'; return true; })()`);
  const front = (title) => evalJs(`(() => { const r = ${byTitle(title)}; const w = r && r.closest('.window'); for (const x of app.wm.windows.values()) if (x.element === w) app.wm.revealWindow(x.id); return true; })()`);
  let firstOpened = false;
  for (let i = 0; i < 2 && !firstOpened; i++) { await front(SHARE); await sleep(400); await realClick('[data-dy="mp-a"]'); firstOpened = await waitFor(`document.querySelectorAll('.dialog.pf-picker').length >= 1`, 8000); }
  check('㊱ (control) the first form\'s Browse… opens its picker', firstOpened);
  await sleep(500);
  await front(PULL); await sleep(300);
  await realClick('[data-dy="mp-b"]');
  await sleep(1200);
  const n2 = await evalJs(`document.querySelectorAll('.dialog.pf-picker').length`);
  // the picker in front is the one the second Browse… opened (or, on 981f70d6, the first one raised by it): its «go» picks
  await evalJs(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const go = w && w.element.querySelector('.pf-picker [data-act="go"]'); if (go) go.dataset.dy = 'go-b'; return !!go; })()`);
  await shot('36-two-pickers');
  await realClick('[data-dy="go-b"]');
  await sleep(800);
  const r = await evalJs(`({ pickers: ${n2}, share: ${mp(SHARE)}?.value ?? null, pull: ${mp(PULL)}?.value ?? null })`);
  check('㊱ two mount forms open at once, each with its «mount point» field (the same field id \'mounts:mountpoint\') ⇒ Browse… on each opens ITS picker (two), and the second one\'s pick lands in ITS field — the first untouched (981f70d6: the second Browse… raised the first picker, the pick went into the other form — Task Detail\'s rows the same)', r.pickers === 2 && !!r.pull && !r.share, r);
  await closeForms(); await sleep(300);
  await evalJs(`(() => { window.fetch = window.__dyMpFetch; delete window.__dyMpFetch; return true; })()`);
});

// ── ㊲ (r4) an app request's key is the request: Remove gimp, then Remove inkscape (the real showInstallDialog) ⇒ the inkscape plan, asked and shown ──
await step('㊲', async () => {
  await evalJs(`(() => { window.__dyInsFetch = window.fetch; window.__dyPlans = []; window.fetch = (u, o) => { const s = String((u && u.url) || u); if (/\\/api\\/apps\\/plan$/.test(s)) { const b = JSON.parse((o && o.body) || '{}'); window.__dyPlans.push(b.request && b.request.entryId); return Promise.resolve(new Response(JSON.stringify({ plan: { ok: true, canRun: true, commands: ['sudo apt-get remove -y ' + (b.request && b.request.entryId)] }, request: b.request, digest: 'd-' + (b.request && b.request.entryId) }), { status: 200, headers: { 'Content-Type': 'application/json' } })); } return window.__dyInsFetch(u, o); }; return true; })()`);
  await evalJs(`__dyProbe.showInstallDialog({ hostId: 'local', label: null }, { what: 'app', request: { kind: 'remove', entryId: 'gimp' } }).then(() => true)`);
  await sleep(500);
  await evalJs(`__dyProbe.showInstallDialog({ hostId: 'local', label: null }, { what: 'app', request: { kind: 'remove', entryId: 'inkscape' } }).then(() => true)`);
  await sleep(800);
  const r = await evalJs(`({ shown: [...document.querySelectorAll('[id^="desktop-install-dialog"]')].map((o) => ({ title: o.querySelector('h3')?.textContent, commands: o.querySelector('.desktop-install-pre')?.textContent })), plans: window.__dyPlans })`);
  await shot('37-install-inkscape');
  check('㊲ Remove gimp, then Remove inkscape ⇒ the inkscape plan is asked for and shown — its Remove runs apt-get remove inkscape (981f70d6: «Remove gimp» raised, the inkscape plan never fetched)', r.shown.length === 1 && /inkscape/.test(r.shown[0].title || '') && /remove -y inkscape/.test(r.shown[0].commands || '') && r.plans.join() === 'gimp,inkscape', r);
  await closeForms(); await evalJs(`(() => { document.querySelectorAll('[id^="desktop-install-dialog"]').forEach((o) => o.remove()); return true; })()`); await sleep(300);   // (the probe's own sheets)
  await evalJs(`(() => { window.fetch = window.__dyInsFetch; delete window.__dyInsFetch; return true; })()`);
});

// ── ㊳ (r4) the phone keyboard rule is the yield law's: New Session (the STATIC sheet) at 390 × 844 with the keyboard up ⇒ its header stays on screen at the top ──
await step('㊳', async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  await evalJs(`(() => { app.showNewSessionDialog(); return true; })()`);
  await waitFor(`!document.getElementById('dialog-overlay').classList.contains('hidden') && !!document.querySelector('#dialog-new-session .ns-head')`, 8000);
  await sleep(500);
  const before = await evalJs(`(() => { const h = document.querySelector('#dialog-new-session .ns-head').getBoundingClientRect(); return [Math.round(h.top), Math.round(h.bottom)]; })()`);
  await evalJs(`(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 400 }); window.visualViewport.dispatchEvent(new Event('resize')); return true; })()`);
  await sleep(700);
  const r = await evalJs(`(() => { const h = document.querySelector('#dialog-new-session .ns-head').getBoundingClientRect(); return { kbOpen: document.documentElement.classList.contains('vs-kb-open'), head: [Math.round(h.top), Math.round(h.bottom)] }; })()`);
  await shot('38-newsession-keyboard');
  check('㊳ New Session (the static sheet) on the phone with the keyboard up ⇒ its header stays at the top, on screen (981f70d6: −172..−78 — the sheets\' keyboard rule shrank the static overlay)', r.kbOpen && r.head[0] >= 0 && r.head[0] <= 4 && r.head[1] > r.head[0], { before, ...r });
  await evalJs(`(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); app.hideDialogs(); return true; })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
});

// ── ⑲ the welcome never counts a form: the last chat closed with a form open, then the form — the empty desktop shows its welcome ──
await step('⑲', async () => {
  await evalJs(`(() => { app._pluginInstallDialog(() => {}); return true; })()`);
  const o = { ok: await waitFor(`!!document.getElementById('plugin-install-dialog')?.closest('.window')`, 8000) };
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type !== 'form') app.wm.closeWindow(w.id); return true; })()`); // the chat closed (its conversation runs on)
  await sleep(700);
  const a = await evalJs(`!document.getElementById('welcome').classList.contains('hidden')`);
  { const id = await formWinId(); if (id) await evalJs(`app.wm.closeWindow(${J(id)}); true`); }
  await sleep(700);
  const b = await evalJs(`({ welcome: !document.getElementById('welcome').classList.contains('hidden'), windows: app.wm.windows.size })`);
  await shot('19-welcome');
  check('⑲ the welcome never counts a form: the last chat closed while a form is open, then the form — the empty desktop shows its welcome', o.ok && b.welcome && b.windows === 0, { o, a, ...b });
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
