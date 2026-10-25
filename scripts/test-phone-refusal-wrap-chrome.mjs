#!/usr/bin/env node
// test-phone-refusal-wrap-chrome — FIVE PHONE-WIDTH DEFECTS THE DUO WALK FOUND (lane phone-refusal-wrap, 2.369.355; the walk's
// report §P1-5 / §P2-1 / §P2-2 / §P2-15 / §P2-17), in a real Chrome at 382×580, 385×571 and 594×368 (DPR 2, an Android UA,
// touch emulation, hover:none / pointer:coarse — app.isMobile and app.isTouch hold, the page loaded AT each size).
// TWO throwaway servers over plain copies of THIS working tree (no git): `head`, and `control` = the same tree with each fix
// cut back out by an exact-string patch (= the base) — every leg runs on both: the head passes, the control is RED on every
// gate (but ① at 594 px, where the base already fit the sentence — the walk's own finding, the layout that stays). A stub
// `claude` (stream-json, never a vendor) keeps one chat conversation LIVE behind the real chat-wrapper.
//   ① New Session: the refusal «✕ Cannot create yet: Choose a folder first» — every character inside the viewport and inside
//     its box (no sideways scroll), its LAST character the hit target at its point; a folder chosen ⇒ every summary chip whole
//   ② a toast (the real port notice through the app's own ws handler): its rect off the composer's; with a modal open (the
//     real New Session sheet = the static #dialog-overlay; a tall confirm = createModalShell) it stands in the room the dialog
//     made — off every row of the dialog — and is painted on top at its centre; its ✕ ≥ 44 × 44; plain words, the plug SVG
//   ③ ✕ (#mobile-nav-close, a real tap) on the running conversation ⇒ «Closed the window — the conversation keeps running» ONCE
//   ④ «a⏎b⏎c» sent from the composer ⇒ the user bubble holds two <br> (three lines); the agent's «one⏎two» stays one line
//   ⑤ the model chip's picker: inside the viewport under the top bar, it SCROLLS (a finger drag moves scrollTop), and its
//     first row, its current model and its last row each come into view
// PNGs: PHONE_WRAP_PNG_DIR (default: the scratch root) <tree>-<w>x<h>-<leg>.png. Requires google-chrome (SKIP without).
// Run: node scripts/test-phone-refusal-wrap-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VNC_ENV = await vncEnv();
const ROOT = scratch('phone-wrap');
const SHOTS = process.env.PHONE_WRAP_PNG_DIR || ROOT;
const BIN = path.join(ROOT, 'bin'), CWD = path.join(ROOT, 'project');
for (const d of [BIN, CWD, SHOTS]) fs.mkdirSync(d, { recursive: true });
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-wrap-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-wrap-run-'));
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
armWatchdog({ capMs: 300e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });

// ── THE STUB CLI: init, then one short reply per user message (the agent's «one⏎two» — markdown's convention: one line) ──
const SID = crypto.randomUUID();
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const a = process.argv.slice(2), at = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (a.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
if (a.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
if (!a.includes('--output-format')) { setInterval(() => {}, 1e6); return; }
const SID = at('--session-id') || at('--resume') || ${JSON.stringify(SID)};
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
      out({ type: 'assistant', message: { id: 'msg_pw' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'one\\ntwo' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 50, num_turns: 1, result: 'one two', total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    }, 150);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── THE CONTROL = the base: each fix cut back out of a copy (every patch applies exactly once, or the setup is red) ──
const CONTROL = [
  ['public/style.css', '  #dialog-new-session .ns-foot { flex-wrap: wrap; gap: 8px; padding: 8px 10px; padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); }\n  #dialog-new-session .ns-foot-info { flex-wrap: wrap; min-width: 0; }\n  #dialog-new-session .ns-chip { min-height: 32px; flex: none; max-width: 100%; font-size: 12px; padding: 0 10px; white-space: normal; overflow-wrap: anywhere; text-align: start; }\n  #dialog-new-session .ns-refuse { white-space: normal; overflow-wrap: anywhere; font-size: 13px; line-height: 1.35; }',
    '  #dialog-new-session .ns-foot { flex-wrap: nowrap; gap: 8px; padding: 8px 10px; padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); }\n  #dialog-new-session .ns-foot-info { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }\n  #dialog-new-session .ns-foot-info::-webkit-scrollbar { display: none; }\n  #dialog-new-session .ns-chip { min-height: 32px; flex: none; font-size: 12px; padding: 0 10px; }\n  #dialog-new-session .ns-refuse { white-space: nowrap; font-size: 13px; }'],
  ['public/style.css', '  #dialog-new-session .ns-foot-info { flex: 1 1 100%; }', ''],
  ['public/style.css', '  .global-toast-x { min-width: 44px; min-height: 44px; margin: -9px -10px -9px 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }', ''],
  ['src/lib/utils.js', '  _placeToastStack(); _queueToastPlace();', ''],
  ['src/lib/sidebar-mounts.js', "showToast(said + ' — ' + tr('to open it here, use the plug button on its row under Remote'), { icon: MI.ports });", "showToast(tr('New port on \"{name}\": {ports} — 🔌 on its machine row forwards it', { name: msg.hostId === '__local__' ? tr('This machine') : name, ports }));"],
  ['src/lib/window.js', '    if (said) sayClosedKeepsRunning(said);', ''],
  ['src/lib/chat-renderers.js', '${this.renderUserMarkdown(b.text)}', '${this.renderMarkdown(b.text)}'],
  ['public/chat.css', 'min-width: 130px; overflow-x: hidden;', 'min-width: 130px; overflow: hidden;'],
  ['public/chat.css', '  max-height: var(--dd-room, none); overflow-y: auto; overscroll-behavior: contain;', ''],
];
const makeTree = (name, patches) => {
  const wt = path.join(ROOT, name);
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
  const hits = patches.map(([f, from, to]) => {
    const p = path.join(wt, f), src = fs.readFileSync(p, 'utf-8'), n = src.split(from).length - 1;
    if (n === 1) fs.writeFileSync(p, src.replace(from, () => to));
    return n;
  });
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  // the probe: the real showConfirmDialog (a createModalShell modal) — the app keeps no page handle on it
  execSync(`npx esbuild --bundle --format=iife --global-name=__wrapProbe --platform=browser --target=es2020 --outfile=public/wrap-probe.js`, { cwd: wt, stdio: ['pipe', 'ignore', 'ignore'], input: "export { showConfirmDialog } from './src/lib/utils.js';" });
  return { wt, hits };
};
const head = makeTree('head', []);
const ctl = makeTree('control', CONTROL);
check('CONTROL setup: every patch that cuts a fix back out applies exactly once (the control tree = the base)', ctl.hits.every((n) => n === 1), ctl.hits);

const startServer = async (tree) => {
  const port = await freePort();
  const home = scratchHome('phone-wrap-home', fs); homes.push(home);
  const srv = spawn(process.execPath, ['server.js'], { cwd: tree.wt, stdio: 'ignore',
    env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: home, PATH: `${BIN}:${path.join(tree.wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
  servers.push(srv);
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { await fetch(`${origin}/api/home`); break; } catch { await sleep(250); } }
  return { origin, port };
};

// ── raw CDP ──
const CDP_PORT = await freePort();
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--password-store=basic', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' } });
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
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return !!(await evalJs(expr)); } catch { return false; } };
const tapAt = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
};
const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
const tap = async (sel) => { const p = await centerOf(sel); if (!p) throw new Error('tap: nothing at ' + sel); await tapAt(p.x, p.y); };
const shot = async (name) => { try { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64')); } catch { } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard over the nav bar
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'en'); } catch {}" });
await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });

// ── page-side probes ──
const RECT = 'const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }; const X = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;';
const clearToasts = () => evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((e) => e.remove()); true`);
const portNotice = () => evalJs(`(() => { app.ws.globalHandlers.forEach((h) => { try { h({ type: 'machine-ports-new', hostId: '__local__', hostName: 'This machine', ports: [{ port: 9835, proc: 'chrome' }] }); } catch { } }); return true; })()`);
const toastFacts = (others) => evalJs(`(() => { ${RECT}
  const el = [...document.querySelectorAll('.global-toast')].find((t) => /9835/.test(t.textContent)); if (!el) return null;
  // the toast's body passes taps through (B-a42d) — to ask «is it painted on top?» the probe lends it the pointer for one read
  const tr = R(el), x = R(el.querySelector('.global-toast-x')), c = { x: (tr.l + tr.r) / 2, y: (tr.t + tr.b) / 2 };
  const lend = document.createElement('style'); lend.textContent = '.global-toast, .global-toast * { pointer-events: auto !important; }'; document.head.appendChild(lend);
  const hit = document.elementFromPoint(c.x, c.y); lend.remove();
  const over = ${JSON.stringify(others)}.flatMap((s) => [...document.querySelectorAll(s)].filter((o) => o.getClientRects().length && X(tr, R(o))).map((o) => s));
  return { text: el.querySelector('.global-toast-body').textContent, svg: !!el.querySelector('.global-toast-icon svg'), emoji: /\\u{1F50C}/u.test(el.textContent), over,
    inView: tr.l >= 0 && tr.t >= 0 && tr.r <= innerWidth + 0.5 && tr.b <= innerHeight + 0.5, hitSelf: !!hit && el.contains(hit), x: [Math.round(x.w), Math.round(x.h)], rect: [tr.l, tr.t, tr.r, tr.b].map(Math.round) }; })()`);

const runTree = async (label, srv) => {
  const RED = label === 'control';
  const want = (name, headOk, facts) => {
    check(RED ? `[${label}] RED: ${name}` : `[${label}] ${name}`, RED ? !headOk : headOk, facts);
    if (RED && !headOk && facts !== undefined) console.log(`      the base measured: ${JSON.stringify(facts).slice(0, 400)}`);
  };
  // the live conversation (the real spawn path: the stub CLI behind the real chat-wrapper)
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  await new Promise((r) => ws.on('open', r));
  const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'pw1', name: 'payments' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check(`[${label}] a live claude chat conversation is created through the real spawn path (stub CLI)`, !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 160)).join(' | '));
  for (const [w, h] of [[382, 580], [385, 571], [594, 368]]) {
    const tag = `${label}-${w}x${h}`, V = `[${label} ${w}×${h}]`;
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: srv.origin + '/' });
    await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })');
    await waitFor(`!document.getElementById('loading-screen')`, 20000);
    await sleep(900);
    await evalJs(`(() => { const s = document.createElement('script'); s.src = '/wrap-probe.js'; document.head.appendChild(s); return true; })()`);
    await waitFor(`!!window.__wrapProbe && !!(app.sidebar?._allSessions || []).find((s) => s.webuiId === ${JSON.stringify(sid)} && s.status === 'live')`, 15000);
    await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'payments', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
    const opened = await waitFor(`(() => { const i = document.querySelector('.chat-view .chat-input'); return !!i && i.getClientRects().length > 0 && !!document.querySelector('.chat-view .chat-status-model'); })()`, 20000);
    check(`${V} the running conversation's chat window shows (composer + the model chip)`, opened);
    await sleep(500);

    // ⑤ THE MODEL PICKER (P2-17)
    await tap('.chat-view .chat-status-model');
    await waitFor(`!!document.querySelector('.chat-status-dropdown')`, 5000); await sleep(400);
    const dd = await evalJs(`(() => { ${RECT} const d = document.querySelector('.chat-status-dropdown'); if (!d) return null; const r = R(d), nav = document.getElementById('mobile-nav'), nb = nav && nav.getClientRects().length ? R(nav).b : 0;
      return { r: [r.l, r.t, r.r, r.b].map(Math.round), nav: Math.round(nb), inView: r.t >= nb - 0.5 && r.b <= innerHeight + 0.5 && r.l >= -0.5 && r.r <= innerWidth + 0.5, scrolls: d.scrollHeight > d.clientHeight + 4, sh: d.scrollHeight, ch: d.clientHeight, rows: d.querySelectorAll('.chat-status-dropdown-item').length }; })()`);
    await shot(`${tag}-picker`);
    want('⑤ the model picker stands inside the viewport, under the top bar', !!dd && dd.inView, dd);
    // a finger drag up inside the picker (touchStart → 10 touchMoves → touchEnd, the way a thumb scrolls a list)
    const p = await centerOf('.chat-status-dropdown');
    if (p) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y + 60 }] });
      for (let i = 1; i <= 10; i++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y + 60 - i * 15 }] }); await sleep(16); }
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await sleep(500);
    const st = await evalJs(`(() => { const d = document.querySelector('.chat-status-dropdown'); if (!d) return null; const chain = []; for (let e = d; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.touchAction !== 'auto') chain.push((e.id || e.className || e.tagName).toString().slice(0, 30) + ':' + cs.touchAction); } return { top: d.scrollTop, oy: getComputedStyle(d).overflowY, chain }; })()`);
    want('⑤ a finger drag inside the picker moves its scrollTop', !!dd && dd.scrolls && !!st && st.top > 0, { ...dd, st });
    const reach = await evalJs(`(() => { const d = document.querySelector('.chat-status-dropdown'); if (!d) return null; const rows = [...d.querySelectorAll('.chat-status-dropdown-item')]; const act = d.querySelector('.chat-status-dropdown-item.active');
      const can = (e) => { if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2); return !!h && e.contains(h); };
      return { first: can(rows[0]), active: can(act), last: can(rows[rows.length - 1]), n: rows.length, act: act ? act.textContent.slice(0, 40) : null }; })()`);
    want('⑤ the picker\'s first row, its current model and its last row each come into view and take a tap', !!reach && reach.first && reach.active !== false && reach.last, reach);
    await evalJs(`document.querySelector('.chat-status-dropdown')?.remove(); true`);

    // ② A TOAST OFF THE COMPOSER (P2-1)
    await clearToasts(); await portNotice(); await sleep(450);
    const t1 = await toastFacts(['.chat-view .chat-input-area']);
    await shot(`${tag}-toast`);
    want('② the toast stands off the composer — its rect does not meet the composer\'s', !!t1 && t1.inView && t1.over.length === 0, t1);
    want('② its ✕ is a 44 × 44 touch target', !!t1 && t1.x[0] >= 44 && t1.x[1] >= 44, t1 && t1.x);
    want('② plain words + the plug SVG, no emoji: «A program on this machine started listening on port 9835 (chrome) — …»', !!t1 && t1.text.startsWith('A program on this machine started listening on port 9835 (chrome)') && t1.svg && !t1.emoji, t1 && t1.text);

    // ④ WHAT YOU TYPED IS WHAT THE BUBBLE SHOWS (P2-15)
    const before = await evalJs(`document.querySelectorAll('.chat-view .chat-msg-user').length`);
    await evalJs(`(() => { const ta = document.querySelector('.chat-view .chat-input'); ta.focus(); ta.value = 'a${w}\\nb\\nc'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await tap('.chat-view .chat-send-btn');
    await waitFor(`[...document.querySelectorAll('.chat-view .chat-msg-user')].some((m) => m.textContent.includes('a${w}'))`, 10000);
    await waitFor(`document.querySelectorAll('.chat-view .chat-msg-assistant').length > 0`, 8000); await sleep(400);
    const bub = await evalJs(`(() => { const m = [...document.querySelectorAll('.chat-view .chat-msg-user')].filter((x) => x.textContent.includes('a${w}')).pop(); if (!m) return null; const tx = m.querySelector('.chat-text');
      const ag = [...document.querySelectorAll('.chat-view .chat-msg-assistant .chat-text')].pop();
      return { br: tx.querySelectorAll('br').length, lines: tx.innerText.split('\\n').filter(Boolean), html: tx.innerHTML.slice(0, 160), agentBr: ag ? ag.querySelectorAll('br').length : null, agent: ag ? ag.innerText.trim() : null }; })()`);
    want('④ «a⏎b⏎c» sent ⇒ the bubble holds two <br> — three lines, as typed', !!bub && bub.br === 2 && bub.lines.join('|') === `a${w}|b|c`, { bub, before });
    if (!RED) check(`${V} ④ the agent's «one⏎two» keeps the markdown convention (one line, no <br>)`, !!bub && bub.agentBr === 0 && bub.agent === 'one two', bub);

    // ③ ✕ ON THE RUNNING CONVERSATION (P2-2)
    await clearToasts();
    await tap('#mobile-nav-close'); await sleep(700);
    const said = await evalJs(`[...document.querySelectorAll('.global-toast-body')].filter((b) => b.textContent === 'Closed the window — the conversation keeps running').length`);
    const gone = await evalJs(`![...app.wm.windows.values()].some((x) => x.type === 'chat')`);
    await shot(`${tag}-closed`);
    want('③ ✕ on the running conversation closes its window and says ONCE «Closed the window — the conversation keeps running»', gone && said === 1, { gone, said });

    // ① THE NEW SESSION REFUSAL (P1-5) — and ② a toast with the sheet open (the static #dialog-overlay)
    await clearToasts();
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(`/Cannot create yet/.test(document.getElementById('ns-foot-info')?.textContent || '')`, 8000); await sleep(400);
    const ref = await evalJs(`(() => { ${RECT} const el = document.querySelector('#ns-foot-info .ns-refuse'), box = document.getElementById('ns-foot-info'); if (!el) return null; const b = R(box);
      const rg = document.createRange(); rg.selectNodeContents(el); const out = [...rg.getClientRects()].filter((q) => q.width > 0 && (q.left < Math.max(0, b.l) - 0.5 || q.right > Math.min(innerWidth, b.r) + 0.5 || q.top < -0.5 || q.bottom > innerHeight + 0.5)).length;
      const tn = el.firstChild, last = document.createRange(); last.setStart(tn, tn.length - 1); last.setEnd(tn, tn.length); const lr = last.getBoundingClientRect(), hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
      return { text: el.textContent, out, sideways: box.scrollWidth > box.clientWidth + 1, lastHit: !!hit && el.contains(hit), box: [b.l, b.t, b.r, b.b].map(Math.round) }; })()`);
    await shot(`${tag}-refusal`);
    const refOk = !!ref && ref.text === '✕ Cannot create yet: Choose a folder first' && ref.out === 0 && !ref.sideways && ref.lastHit;
    if (RED && w >= 594) check(`${V} the base already reads the refusal whole at 594 px (the walk's own finding — the layout that stays)`, refOk, ref);
    else want('① the refusal reads whole — «✕ Cannot create yet: Choose a folder first», every character in the viewport and its box, nothing sideways, the last character the hit target', refOk, ref);
    await portNotice(); await sleep(450);
    const t2 = await toastFacts(['#dialog-new-session > .ns-head', '#dialog-new-session > .ns-body', '#dialog-new-session > .ns-foot']);
    await shot(`${tag}-toast-sheet`);
    want('② with the New Session sheet open the toast meets none of its rows (head / body / footer) and is painted on top at its centre', !!t2 && t2.inView && t2.over.length === 0 && t2.hitSelf, t2);
    await clearToasts();
    await evalJs(`(() => { const f = document.getElementById('input-cwd'); f.value = ${JSON.stringify(CWD)}; f.dispatchEvent(new Event('input')); return true; })()`);
    await sleep(500); await tap('#input-session-name');
    await waitFor(`document.querySelectorAll('#ns-foot-info [data-chip]').length >= 3`, 8000); await sleep(400);
    const chips = await evalJs(`(() => { ${RECT} const box = document.getElementById('ns-foot-info'), b = R(box); const cs = [...box.querySelectorAll('.ns-chip')];
      const bad = cs.filter((c) => { const r = R(c), h = document.elementFromPoint((r.l + r.r) / 2, (r.t + r.b) / 2); return r.l < Math.max(0, b.l) - 0.5 || r.r > Math.min(innerWidth, b.r) + 0.5 || r.b > innerHeight + 0.5 || c.scrollWidth > c.clientWidth + 1 || !h || !c.contains(h); }).map((c) => c.dataset.chip);
      return { n: cs.length, bad, sideways: box.scrollWidth > box.clientWidth + 1 }; })()`);
    await shot(`${tag}-chips`);
    want('① a folder chosen ⇒ every summary chip whole on the screen and the hit target at its centre, nothing sideways', chips.n >= 3 && chips.bad.length === 0 && !chips.sideways, chips);
    await evalJs(`app.hideDialogs(); true`); await sleep(300);

    // ② a toast over a TALL createModalShell modal (a confirm naming 14 rows)
    await evalJs(`(() => { window.__cf = window.__wrapProbe.showConfirmDialog({ title: 'Close 14 tabs?', message: 'Each tab below closes.', items: Array.from({ length: 14 }, (_, i) => 'Tab number ' + (i + 1) + ' — its conversation keeps running') }); return true; })()`);
    await sleep(400); await portNotice(); await sleep(450);
    const t3 = await toastFacts(['.dialog-overlay > .dialog > .dialog-header', '.dialog-overlay > .dialog > .dialog-body', '.dialog-overlay > .dialog > .dialog-footer']);
    await shot(`${tag}-toast-modal`);
    want('② with a tall modal open the toast meets none of its rows (header / body / footer) and is painted on top at its centre', !!t3 && t3.inView && t3.over.length === 0 && t3.hitSelf, t3);
    await evalJs(`[...document.querySelectorAll('.dialog-overlay:not(.hidden)')].pop()?.querySelector('.dialog-footer .btn-cancel')?.click(); true`); await sleep(400);
    const roomGone = await evalJs(`!document.querySelector('.gt-room')`);
    if (!RED) check(`${V} ② the room goes with the modal`, roomGone);
    await clearToasts();
  }
  ws.close();
};

const headSrv = await startServer(head);
await runTree('head', headSrv);
const ctlSrv = await startServer(ctl);
await runTree('control', ctlSrv);
check('no page errors in either tree', pageErrors.length === 0, pageErrors.slice(0, 4));
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed) — PNGs in ${SHOTS}`);
process.exit(fail ? 1 : 0);
