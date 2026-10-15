#!/usr/bin/env node
// test-phone-composer-chrome — THE PHONE COMPOSER (lane phone-chat-composer, owner 2026-10-13: "手机版布局有点丑陋啊…
// 输入框非常窄。下面状态栏又很稀疏") in a real Chrome: the REAL ChatInput + ChatStatusBar bundle stacked like the chat
// view's bottom panel, the real public CSS, the hub voice route over a FAKE Dropline, a fake microphone.
//   phone 390 / 412 (DPR 3, Android UA, touch): the field owns ≥ 72 % / ≥ 75 % of the composer row; ONE "+" door
//     (36×36) whose sheet reaches the image / file / folder inputs; the mic INSIDE the field's trailing edge and its
//     recording capsule in place (fake getUserMedia) → the words land; send 40×40 sends; the ⤢ glyph only past 2 lines;
//     the status bar ONE row ≤ 40 px, no horizontal overflow with the agent-browser chip present, no gap > 8 px, the
//     rest behind ⋯ (a tap opens the bar in place), effort + style reachable from the model chip's sheet
//   desk 1100: the composer + bar DOM signature is the pinned desk one; its PNG equals the one rendered with the lane's
//     phone CSS block stripped (RED control: the same block un-gated ⇒ a different PNG)
// PNGs: PHONE_COMPOSER_PNG_DIR (default: the scratch dir), named <PHONE_COMPOSER_TAG|after>-390.png, -412.png,
//   -412-light.png, -390-rec.png, -390-more.png, desk-1100.png
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700) : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = scratch('phonecomp');
const SHOTS = process.env.PHONE_COMPOSER_PNG_DIR || root;
const TAG = process.env.PHONE_COMPOSER_TAG || 'after';
let chrome = null, srv = null, vendor = null;
const end = (code) => { try { chrome && chrome.kill('SIGKILL'); } catch { } try { srv && srv.close(); vendor && vendor.close(); } catch { } process.exit(code); };
// the suite's own clock (scripts/suite-watchdog.mjs, the two-clock rule): its 150 s ceiling, before the gate's budget — it names
// the leg it was in, the CDP calls nobody answered, and the gate's digest (it was `✗ TIMEOUT (150 s)` and nothing else)
const CDP_PENDS = new Set();
armWatchdog({ capMs: 150e3, exit: end, pending: () => [...CDP_PENDS].flatMap((m) => [...m.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`)) });

// ── the fake Dropline (answers every dictation with one sentence) ──
vendor = http.createServer((req, res) => {
  req.on('data', () => { });
  req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ request_id: 'dct_p1', mode: 'dictate', final_text: 'DICTATED ON THE PHONE', transcript: { text: 'dictated on the phone', language: 'en' }, rewrite: { status: 'used', reason: null } })); });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));
const express = require(path.join(REPO, 'node_modules/express'));
const store = { resolveIntegration: (id) => (id === 'dropline' ? { source: 'user', values: { apiKey: 'dl_phone_fake_0123456789' } } : { source: 'none', values: {} }) };
const prefs = { enabled: true, config: { language: 'auto' } };
const client = require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => store, pluginOn: () => prefs.enabled, base: `http://127.0.0.1:${vendor.address().port}`, log: { log() { }, warn() { } } });

// ── the page: ChatInput over ChatStatusBar inside a .chat-view column (the chat window's bottom panel) ──
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { ChatStatusBar } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-status-bar.js'))};
window.__sent = [];
const ws = { send(m) { if (m && m.type === 'chat-input') window.__sent.push(m.text); }, on() {}, off() {}, onMessage() {}, isConnected: () => true };
window.__mount = () => {
  const frame = document.getElementById('frame');
  const list = document.createElement('div'); list.className = 'chat-message-list'; list.style.flex = '1';
  const ci = new ChatInput(ws, 'sess-phone-composer', { onSend() {}, onInterrupt() {}, getCwd: () => '/home/u/projects/vibespace', getHost: () => null, getUploadDir: () => '',
    isTouch: () => window.innerWidth <= 768, getTouchEnterSends: () => false, getEnterSends: () => true,
    getVoiceFacts: () => ({ title: 'Phone composer', messages: [] }), openPlugins: () => {} });
  const sb = new ChatStatusBar(ws, 'sess-phone-composer', { backend: 'claude', onSearch: () => { window.__searched = (window.__searched || 0) + 1; } });
  frame.append(list, ci.element, sb.element);
  sb.popupContainer = frame;
  sb.setModel('claude-fable-5-1'); sb.setEffort('high', 'high'); sb.setOutputStyle('ultracode'); sb.setPermMode('bypassPermissions');
  sb.setBrowserProfile({ key: 'k1', fact: { input: 'agent' }, words: { show: true, line: 'Agent 浏览器 · 无配置（临时浏览器）', amber: false } });
  ci.updateTodos(Array.from({ length: 13 }, (_, i) => ({ content: 'step ' + (i + 1), activeForm: 'doing step ' + (i + 1), status: i < 8 ? 'completed' : (i === 8 ? 'in_progress' : 'pending') })));
  window.__ci = ci; window.__sb = sb;
  return true;
};`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express();
app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client, prefs: () => prefs, log: { log() { }, warn() { } } }));
// chat.css variants for the desk proof: as shipped · the lane's phone block stripped · the same block un-gated (RED control)
const chatCss = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
const BLOCK = /\/\* ── THE PHONE COMPOSER[\s\S]*?\/\* ── end THE PHONE COMPOSER ── \*\//;
const cssVariant = { real: chatCss, stripped: chatCss.replace(BLOCK, ''), leak: chatCss.replace(BLOCK, (b) => b.replace(/@media \(max-width: 768px\)/g, '@media all')) };
for (const n of ['style', 'fonts']) if (fs.existsSync(path.join(REPO, `public/${n}.css`))) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/chat.css', (q, s) => s.type('text/css').send(cssVariant[q.query.v] || chatCss));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="${q.query.theme === 'light' ? 'light' : 'dark'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/chat.css?v=${q.query.css || 'real'}"><link rel="stylesheet" href="/fonts.css"><style>body{margin:0;background:var(--bg-window)} #frame{position:fixed;inset:0;display:flex;flex-direction:column}</style></head><body><div id="frame" class="chat-view"></div><script src="/page.js"></script></body></html>`));
const PORT = await freePort();
srv = http.createServer(app);
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, headless (no DISPLAY) ──
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'profile')}`, 'about:blank'], { env: cenv, stdio: 'ignore' });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

const FAKE_MIC = `(() => {
  window.__gum = 0;
  const gum = async () => { window.__gum++; const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gum;
  class FakeRecorder extends EventTarget {
    constructor(stream, opts) { super(); this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm;codecs=opus'; this.state = 'inactive'; }
    static isTypeSupported(t) { return /webm/.test(t); }
    start() { this.state = 'recording'; }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['OPUS-FAKE '.repeat(40)], { type: this.mimeType }) }); this.onstop && this.onstop(); }, 30); }
  }
  window.MediaRecorder = FakeRecorder;
  // which hidden input a sheet row reached (the file chooser itself never opens headless)
  window.__picked = [];
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (this.type === 'file') { window.__picked.push(this.hasAttribute('webkitdirectory') ? 'folder' : (this.accept === 'image/*' ? 'image' : 'file')); return; } return click.call(this); };
})();`;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
async function page(w, h, { phone, theme = 'dark', css = 'real' }) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); CDP_PENDS.add(pend);
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).r(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, { r, method, at: Date.now() }); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} ${FAKE_MIC}` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (phone) { await cdp('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l' }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: phone ? 3 : 1, mobile: !!phone });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?theme=${theme}&css=${css}` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__mount === "function" && document.readyState === "complete"').catch(() => false)); i++) await sleep(100);
  await ev('window.__mount()');
  await ev('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
  const until = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(60); } return false; };
  await until(`!document.documentElement.classList.contains('voice-absent')`, 5000); // lane voice-everywhere: the mic shows once /api/voice/status said on
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const tap = async (sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [b.left + b.width / 2, b.top + b.height / 2] : null; })()`);
    if (!r) return false;
    await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1], 1); await mouse('mouseReleased', r[0], r[1]);
    await sleep(120); return true;
  };
  const shot = async (file, band = 300) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: h - band, width: w, height: band, scale: 1 } });
    const buf = Buffer.from(pic.result.data, 'base64');
    if (file) { fs.writeFileSync(path.join(SHOTS, file), buf); console.log(`    (PNG ${path.join(SHOTS, file)})`); }
    return crypto.createHash('sha1').update(buf).digest('hex');
  };
  return { cdp, ev, until, tap, shot, close: () => { CDP_PENDS.delete(pend); ws.close(); } };
}
const rect = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; })()`;
const inside = (a, b) => a && b && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

async function phoneLeg(w, minRatio) {
  console.log(`① phone ${w} (DPR 3, Android UA, touch, dark) — the field owns the row, one + door, the mic in the field, one 40-px bar`);
  const p = await page(w, 860, { phone: true });
  await p.shot(`${TAG}-${w}.png`);
  const m = await p.ev(`(() => {
    const area = document.querySelector('#frame .chat-input-area'), cs = getComputedStyle(area);
    const row = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ta = document.querySelector('#frame textarea').getBoundingClientRect();
    const bar = document.querySelector('#frame .chat-status-bar');
    const kids = [...bar.children].filter((e) => e.offsetWidth > 0).map((e) => e.getBoundingClientRect());
    let gap = 0; for (let i = 1; i < kids.length; i++) gap = Math.max(gap, kids[i].left - kids[i - 1].right);
    const shown = [...document.querySelectorAll('#frame .chat-input-wrap > *')].filter((e) => e.offsetWidth > 0).map((e) => e.className);
    return { ratio: ta.width / row, row, ta: ta.width, taH: ta.height, barH: bar.getBoundingClientRect().height, sw: bar.scrollWidth, cw: bar.clientWidth, gap, browser: !!bar.querySelector('.chat-status-browser'), more: !!bar.querySelector('.chat-status-more'), shown };
  })()`);
  ok(`${w}: the field owns ≥ ${minRatio * 100} % of the composer row (${(m.ratio * 100).toFixed(1)} % of ${m.row} px)`, m.ratio >= minRatio, m);
  ok(`${w}: the field is ≥ 44 px tall at rest`, m.taH >= 44 && m.taH < 60, m.taH);
  ok(`${w}: the row shows ONE leading door and the field — no image / upload / mic buttons beside it`, JSON.stringify(m.shown) === JSON.stringify(['chat-plus-btn', 'chat-input-field']), m.shown);
  const plus = await p.ev(rect('#frame .chat-plus-btn')), send = await p.ev(rect('#frame .chat-send-btn')), field = await p.ev(rect('#frame .chat-input-field textarea')), mic = await p.ev(rect('#frame .chat-input-field .chat-voice-btn'));
  ok(`${w}: the + door is 36×36`, plus && Math.round(plus.w) === 36 && Math.round(plus.h) === 36, plus);
  ok(`${w}: send is 40×40`, send && Math.round(send.w) === 40 && Math.round(send.h) === 40, send);
  ok(`${w}: the mic sits INSIDE the field at its trailing edge (a 40×40 hit area — lane voice-everywhere)`, inside(mic, field) && field.r - mic.r <= 8 && Math.round(mic.h) === 40, { mic, field });
  ok(`${w}: the status bar is ONE row ≤ 40 px`, m.barH <= 40, m.barH);
  ok(`${w}: no horizontal overflow with the agent-browser chip present`, m.browser && m.sw <= m.cw, m);
  ok(`${w}: no gap between bar chips > 8 px, ⋯ present`, m.gap <= 8 && m.more, m);
  // the + sheet: three rows, each reaching its own hidden input
  const picked = [];
  for (const i of [0, 1, 2]) {
    await p.tap('#frame .chat-plus-btn');
    const rows = await p.ev(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent.trim())`).catch(() => []);
    if (i === 0) ok(`${w}: the + sheet offers 图片 / 文件 / 文件夹`, JSON.stringify(rows) === JSON.stringify(['图片', '文件', '文件夹']), rows);
    await p.tap(`.context-menu .context-menu-item:nth-child(${i + 1})`);
    picked.push(...(await p.ev('window.__picked.splice(0)')));
  }
  ok(`${w}: each sheet row reaches its input (image · file · folder)`, JSON.stringify(picked) === JSON.stringify(['image', 'file', 'folder']), picked);
  // the ⤢ glyph: hidden at one line, shown past two
  const exp1 = await p.ev(`document.querySelector('#frame .chat-expand-btn').offsetWidth`);
  await p.ev(`(() => { const t = document.querySelector('#frame textarea'); t.focus(); t.value = 'one\\ntwo\\nthree\\nfour'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(100);
  const exp2 = await p.ev(rect('#frame .chat-expand-btn')), field2 = await p.ev(rect('#frame .chat-input-field textarea'));
  ok(`${w}: ⤢ hidden at one line, inside the field past two lines`, exp1 === 0 && exp2 && exp2.w > 0 && inside(exp2, field2), { exp1, exp2, field2 });
  // send
  await p.ev(`(() => { const t = document.querySelector('#frame textarea'); t.value = 'hello from the phone'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await p.tap('#frame .chat-send-btn');
  ok(`${w}: the send button sends`, await p.until(`window.__sent.includes('hello from the phone')`, 3000), await p.ev('window.__sent'));
  // the mic: capsule in place inside the field, the words land
  await p.ev(`(() => { const t = document.querySelector('#frame textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); return true; })()`);
  await p.tap('#frame .chat-voice-btn');
  const rec = await p.until(`!!document.querySelector('#frame .chat-input-field .chat-voice-btn.recording') && window.__gum > 0`, 5000);
  const cap = await p.ev(rect('#frame .chat-voice-btn.recording')), field3 = await p.ev(rect('#frame .chat-input-field textarea'));
  ok(`${w}: the mic records — the capsule replaces it in place, inside the field`, rec && inside(cap, field3), { rec, cap, field3 });
  if (w === 390) await p.shot(`${TAG}-390-rec.png`);
  await p.tap('#frame .chat-voice-btn.recording');
  ok(`${w}: the dictated words land in the field`, await p.until(`document.querySelector('#frame textarea').value.includes('DICTATED ON THE PHONE')`, 6000), await p.ev(`document.querySelector('#frame textarea').value`));
  // ⋯ opens the bar in place (the browser chip reachable); effort + style ride the model chip's sheet
  await p.tap('#frame .chat-status-more');
  const open = await p.ev(`(() => { const b = document.querySelector('#frame .chat-status-bar'); const br = b.querySelector('.chat-status-browser'); return { open: b.classList.contains('chat-status-open'), browserW: br ? br.offsetWidth : 0, effortW: (b.querySelector('.chat-status-effort') || {}).offsetWidth || 0 }; })()`);
  ok(`${w}: ⋯ opens the bar in place — the agent-browser and effort chips are reachable`, open.open && open.browserW > 0 && open.effortW > 0, open);
  if (w === 390) await p.shot(`${TAG}-390-more.png`);
  await p.tap('#frame .chat-status-more');
  await p.tap('#frame .chat-status-model');
  const rows = await p.ev(`[...document.querySelectorAll('.chat-status-dropdown .chat-status-fold-row')].map((e) => e.textContent)`).catch(() => []);
  ok(`${w}: the model chip's sheet carries effort + style rows`, rows.length === 2 && /推理强度/.test(rows[0]) && /输出风格/.test(rows[1]), rows);
  await p.tap('.chat-status-dropdown .chat-status-fold-row');
  const eff = await p.ev(`(() => { const d = document.querySelector('.chat-status-dropdown'); return { dd: !!d && /high|max|low|medium/i.test(d.textContent), open: document.querySelector('#frame .chat-status-bar').classList.contains('chat-status-open') }; })()`);
  ok(`${w}: the effort row opens the effort chip's own menu`, eff.dd && eff.open, eff);
  p.close();
  if (w === 412) {
    const l = await page(412, 860, { phone: true, theme: 'light' });
    await l.shot(`${TAG}-412-light.png`);
    l.close();
  }
}

await phoneLeg(390, 0.72);
await phoneLeg(412, 0.75);

console.log('② desk 1100 — the composer + bar untouched (DOM signature pinned; PNG = the phone block stripped; RED control = un-gated)');
{
  const SIG_JS = `(() => { const sig = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + (e.children.length ? '(' + [...e.children].map(sig).join(',') + ')' : ''); return sig(document.querySelector('#frame .chat-input-area')) + '|' + sig(document.querySelector('#frame .chat-status-bar')); })()`;
  const d = await page(1100, 760, { phone: false });
  const sig = await d.ev(SIG_JS);
  const real = await d.shot('desk-1100.png', 260);
  d.close();
  const s = await page(1100, 760, { phone: false, css: 'stripped' }); const stripped = await s.shot(null, 260); s.close();
  const k = await page(1100, 760, { phone: false, css: 'leak' }); const leak = await k.shot(null, 260); const leakSig = await k.ev(SIG_JS); k.close();
  console.log(`    desk sig sha1 ${crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12)} · png ${real.slice(0, 12)}`);
  const DESK_SIG = process.env.PHONE_COMPOSER_DESK_SIG || '6c0f8ac4b488';
  ok('desk: the composer + bar DOM signature is the pinned desk one (no + door, no in-field mic, no ⋯)', crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12) === DESK_SIG && !/chat-plus-btn|chat-input-field|chat-status-more/.test(sig), sig);
  ok('desk: the PNG equals the render with the phone block stripped', real === stripped, { real, stripped });
  ok('RED control: the phone block un-gated changes the desk PNG', leak !== real && leakSig === sig, { leak, real });
}

console.log(`\n${pass} passed, ${fail} failed`);
end(fail ? 1 : 0);
