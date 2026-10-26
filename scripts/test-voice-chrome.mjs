#!/usr/bin/env node
// test-voice-chrome — Dropline voice input P0 (design q-029 D5 + §5) in a real Chrome: the REAL ChatInput bundle
// (src/lib/chat-input.js + src/lib/voice-input.js) over the REAL hub route (src/routes/voice.js) and THE vendor module
// (src/server/dropline-client.js) pointed at a FAKE Dropline http server. The page's microphone is a fake
// navigator.mediaDevices.getUserMedia (counts its calls; hands back an oscillator's MediaStream so the level meter
// has a signal) and a fake MediaRecorder that emits a small opus blob on stop.
//   desk 1280: click → the capsule records → click → the text lands at the cursor the person had at STOP; a selection
//     is replaced; Ctrl+Z undoes the insertion; ✕ and Esc cancel with NO request; rewrite skipped ⇒ "inserted as
//     spoken"; no key ⇒ "connect your Dropline first" + Open Plugins, getUserMedia never called
//   phone 390: the same button records and inserts
//   lane voice-everywhere (owner 2026-10-13, phone): ④ the composer's mic and ⤢ never share a point — 1 line, 3 lines,
//     expanded: both hit areas ≥ 40×40, ≥ 8 px apart, a tap at the mic's centre reaches the mic, and after a multi-line
//     SEND (or deleting lines) ⤢ is gone from the one-line field (PNGs phone-1line / -3line / -expanded / -after-send); ⑤ a TOUCH tap on the mic never focuses the box (no focus event, activeElement
//     stays body; a box never focused takes the words at its end; the chip's Undo neither) and never blurs a focused
//     one (the words land at its caret); ⑥ the For-you reply box on the phone: the mic inside its trailing edge, Send
//     unchanged (foryou-phone.png); ⑥b a resizable box keeps its drag grip (the mic steps left of it); ⑦ voice input off / no key ⇒ every microphone ABSENT (not greyed), and the
//     plugins-updated broadcast puts it back / takes it away live
//   an insecure origin (http://voice.test — not loopback, isSecureContext=false): the words + the localhost address
//     with Copy, and ZERO getUserMedia calls
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → desk.png, recording.png, phone.png, insecure.png,
//   phone-1line.png, phone-3line.png, phone-expanded.png, phone-after-send.png, foryou-phone.png
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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
const root = scratch('voice');
const SHOTS = process.env.VIBESPACE_VOICE_PNG_DIR || root;
let chrome = null, srv = null, vendor = null;
const end = (code) => { try { chrome && chrome.kill('SIGKILL'); } catch { } try { srv && srv.close(); vendor && vendor.close(); } catch { } process.exit(code); };
// the suite's own clock (scripts/suite-watchdog.mjs, the two-clock rule): its 240 s ceiling, before the gate's budget — it names
// the leg it was in, the CDP calls nobody answered, and the gate's digest (it was `✗ TIMEOUT (240 s)` and nothing else)
const CDP_PENDS = new Set();
armWatchdog({ capMs: 240e3, exit: end, pending: () => [...CDP_PENDS].flatMap((m) => [...m.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`)) });

// ── the fake Dropline ──
const KEY = 'dl_chrome_fake_0123456789';
const calls = [];
let answers = [];
vendor = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const field = (n) => { const m = new RegExp(`name="${n}"\\r\\nContent-Type: [^\\r]+\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body); return m ? m[1] : null; };
    calls.push({ url: req.url, auth: req.headers.authorization, request: JSON.parse(field('request') || 'null'), context: JSON.parse(field('context') || 'null'), audio: /OPUS-FAKE/.test(body) });
    const a = answers.shift() || { text: 'DICTATED' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ request_id: 'dct_c' + calls.length, mode: 'dictate', final_text: a.text, transcript: { text: a.text.toLowerCase(), language: 'en' }, rewrite: { status: a.rewrite || 'used', reason: null } }));
  });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));

// ── the hub: the real route + client; a fake integration store + the plugin record ──
const express = require(path.join(REPO, 'node_modules/express'));
let key = KEY;
const store = { resolveIntegration: (id) => (id === 'dropline' && key ? { source: 'user', values: { apiKey: key } } : { source: 'none', values: {} }) };
const prefs = { enabled: true, config: { language: 'auto' } };
const client = require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => store, pluginOn: () => prefs.enabled, base: `http://127.0.0.1:${vendor.address().port}`, log: { log() { }, warn() { } } });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { renderRow, replyBoxEl } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-row.js'))};
import * as VI from ${JSON.stringify(path.join(REPO, 'src/lib/voice-input.js'))};
import { t } from ${JSON.stringify(path.join(REPO, 'src/lib/i18n.js'))};
// a RESIZABLE message box (like the outbox editor / the Inbox reply) with its microphone
window.__grip = () => {
  const host = document.createElement('div'); host.id = 'grip-host'; host.style.cssText = 'position:fixed;left:20px;top:20px;width:420px';
  const ta = document.createElement('textarea'); ta.rows = 3; ta.style.cssText = 'width:100%;box-sizing:border-box;min-height:64px;resize:vertical;font:13px system-ui;padding:6px 8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text)';
  host.appendChild(ta); document.body.appendChild(host);
  if (VI.attachDictation && VI.voiceField) VI.voiceField(ta, VI.attachDictation(ta));
  return true;
};
window.__notePlugins = (rows) => (VI.noteVoicePlugins ? (VI.noteVoicePlugins(rows), true) : false);
// a For-you row (the REAL renderer) with its reply box open, the way the panel's openBox appends it
window.__fy = () => {
  const pop = document.createElement('div'); pop.id = 'user-todos-popup';
  pop.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:8px 8px 12px;background:var(--bg-dialog);border-bottom:1px solid var(--border);color:var(--text);font:13px system-ui';
  const item = { id: 'td-voice-1', title: 'Which branch should the voice lane land on?', detail: 'rel264 or master — reply with the branch name.', sessionKey: 'claude:sess-voice', createdAt: Date.now() - 120000, options: ['rel264', 'master'] };
  const ctx = { t, nameFor: () => 'Voice lane chat', wordsOf: (i) => i.title, detailOf: (i) => i.detail, replyState: () => ({ show: true, enabled: true, why: '' }) };
  const row = renderRow({ item, resolved: false }, ctx);
  pop.appendChild(row); document.body.appendChild(pop);
  row.classList.add('ut-open'); // lane foryou-honest: a touch screen's row is folded — the panel's openOne opens it before its Reply
  row.querySelector(':scope > .ut-body').append(replyBoxEl(t));
  return true;
};
const ws = { send() {}, on() {}, off() {}, onMessage() {}, isConnected: () => true };
window.__facts = { title: 'Voice lane chat', messages: [
  { role: 'user', content: [{ type: 'text', text: 'Please wire src/lib/voice-input.js into the chat box' }] },
  { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cat TOOL_NEEDLE_77' } }] },
  { role: 'user', content: [{ type: 'tool_result', content: 'TOOL_NEEDLE_78' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Done — createVoiceInput sits beside attachBtn.' }] },
] };
window.__mount = () => {
  const frame = document.getElementById('frame');
  const ci = new ChatInput(ws, 'sess-voice-chrome', { onSend() {}, onInterrupt() {}, getCwd: () => '/home/u/projects/vibespace', getHost: () => null, getUploadDir: () => '',
    isTouch: () => window.innerWidth < 600, getTouchEnterSends: () => false, getEnterSends: () => true,
    getVoiceFacts: () => window.__facts, openPlugins: () => { window.__opened = (window.__opened || 0) + 1; } });
  frame.appendChild(ci.element);
  window.__ci = ci;
  return true;
};`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express();
app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client, prefs: () => prefs, log: { log() { }, warn() { } } }));
const CSS = ['style', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-window)} #frame{position:fixed;left:0;right:0;bottom:0;padding-top:70px;border-top:1px solid var(--border);background:var(--bg-window)} .msgs{position:absolute;top:8px;left:16px;right:16px;color:var(--text-dim);font:13px system-ui}</style></head><body><div id="frame" class="chat-view"><div class="msgs">Agent: Done — createVoiceInput sits beside attachBtn.</div></div><script src="/page.js"></script></body></html>`));
const PORT = await freePort();
srv = http.createServer(app);
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless); voice.test → 127.0.0.1 ──
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP voice.test 127.0.0.1', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { env: cenv, stdio: 'ignore' });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// the fake microphone: counts getUserMedia calls; a real MediaStream from an oscillator; a fake MediaRecorder
const FAKE_MIC = `(() => {
  window.__gum = 0;
  const gum = async (c) => { window.__gum++; const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gum;
  else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true }); // reachable even off a secure context — the press must still never call it
  class FakeRecorder extends EventTarget {
    constructor(stream, opts) { super(); this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm;codecs=opus'; this.bps = opts && opts.audioBitsPerSecond; this.state = 'inactive'; window.__rec = this; }
    static isTypeSupported(t) { return /webm/.test(t); }
    start() { this.state = 'recording'; }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['\\x1aE\\xdf\\xa3 OPUS-FAKE '.repeat(40)], { type: this.mimeType }) }); this.onstop && this.onstop(); }, 30); }
  }
  window.MediaRecorder = FakeRecorder;
})();`;
async function page(w, h, origin, { touch = false, on = true } = {}) {
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
  if (touch) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `${origin}/` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__mount === "function"').catch(() => false)); i++) await sleep(100);
  await ev('window.__mount()');
  const until = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(60); } return false; };
  // the microphone shows once /api/voice/status said on (absent until then — lane voice-everywhere)
  if (on) await until(`!document.documentElement.classList.contains('voice-absent') && document.querySelector('#frame .chat-voice-btn').offsetWidth > 0`, 5000);
  // a REAL touch tap (touchStart → touchEnd: Chrome's own gesture → pointer + click), the phone's way in
  const touchTap = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] }); await sleep(40); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150); };
  const tapSel = async (sel) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [b.left + b.width / 2, b.top + b.height / 2] : null; })()`); if (!r) return false; await touchTap(r[0], r[1]); return true; };
  const shotSel = async (sel, file, pad = 8) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - pad), y: Math.max(0, r[1] - pad), width: Math.min(w, r[2] + 2 * pad), height: Math.min(h, r[3] + 2 * pad), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const clickSel = async (sel) => { const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`); await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1], 1); await mouse('mouseReleased', r[0], r[1], 0); };
  const key = async (k, code, vk, modifiers = 0) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); };
  const shot = async (file) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = document.getElementById('frame').getBoundingClientRect(); return [b.left, b.top - 60, b.width, b.height + 60]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: Math.max(0, r[1]), width: w, height: Math.min(h, r[3]), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, clickSel, key, shot, touchTap, tapSel, shotSel, close: () => { CDP_PENDS.delete(pend); ws.close(); } };
}
const TA = `document.querySelector('#frame textarea')`;
const setText = (p, v, s, e) => p.ev(`(() => { const t = ${TA}; t.focus(); t.value = ${JSON.stringify(v)}; t.setSelectionRange(${s}, ${e}); return true; })()`);
const val = (p) => p.ev(`${TA}.value`);
const chip = (p) => p.ev(`(() => { const c = document.querySelector('#frame .voice-chip'); return c && !c.classList.contains('hidden') ? { code: c.dataset.code, text: c.querySelector('.voice-chip-text').textContent, buttons: [...c.querySelectorAll('.voice-chip-btn')].map((b) => b.textContent) } : null; })()`);
const MIC = '#frame .chat-voice-btn';

console.log('① desk 1280 — record, stop, insert at the cursor, Ctrl+Z, a selection, ✕ / Esc, rewrite skipped, no key');
{
  const p = await page(1280, 800, `http://127.0.0.1:${PORT}`);
  const geo = await p.ev(`(() => { const m = document.querySelector(${JSON.stringify(MIC)}), a = document.querySelector('#frame .chat-attach-btn:not(.chat-voice-btn)'); const r = m.getBoundingClientRect(); return { micVisible: r.width > 0 && getComputedStyle(m).display !== 'none', afterAttach: a.nextElementSibling === m || a.nextElementSibling?.nextElementSibling === m, svg: !!m.querySelector('svg') }; })()`);
  ok('the microphone sits beside attach in the input row, visible on desk (an SVG icon)', geo.micVisible && geo.afterAttach && geo.svg, geo);
  await setText(p, 'Hello world', 6, 6);
  await p.clickSel(MIC);
  const recOn = await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`);
  await sleep(1300);
  const cap = await p.ev(`(() => { const b = document.querySelector(${JSON.stringify(MIC)}); return { time: b.querySelector('.voice-time')?.textContent, x: !!b.querySelector('.voice-cancel'), dot: !!b.querySelector('.voice-dot'), bars: b.querySelectorAll('.voice-bars i').length, ph: ${TA}.placeholder, gum: window.__gum, mime: window.__rec && window.__rec.mimeType, bps: window.__rec && window.__rec.bps }; })()`);
  ok('click ⇒ the capsule "● 0:01 ▮▮▮ ✕", placeholder 正在听…, getUserMedia once, opus webm at 32 kbps', recOn && cap.dot && /^0:0[1-2]$/.test(cap.time || '') && cap.bars === 3 && cap.x && cap.ph === '正在听…' && cap.gum === 1 && cap.mime === 'audio/webm;codecs=opus' && cap.bps === 32000, cap);
  await p.shot('recording.png');
  await p.ev(`(() => { ${TA}.setSelectionRange(6, 6); return true; })()`);
  await p.clickSel(`${MIC} .voice-time`);
  const done = await p.until(`${TA}.value === 'Hello DICTATEDworld'`);
  const c1 = await chip(p);
  ok('click again ⇒ the text lands at the cursor the person had at stop', done, await val(p));
  ok('the 5-s chip says 已插入 with 撤销', c1 && c1.code === 'inserted' && c1.text === '已插入' && c1.buttons.includes('撤销'), c1);
  const k = calls[calls.length - 1];
  ok('the hub sent ONE dictation with the key, the opus blob and the PURE context (before / after at the cursor, title, the messages without the tool call / result)', calls.length === 1 && k.auth === `Bearer ${KEY}` && k.audio && k.context.before === 'Hello ' && k.context.after === 'world' && k.context.title === 'Voice lane chat' && /user: Please wire src\/lib\/voice-input\.js/.test(k.context.text) && /agent: Done — createVoiceInput/.test(k.context.text) && !/TOOL_NEEDLE/.test(JSON.stringify(k.context)) && /\nvibespace\n/.test(k.context.text) && k.request.locale === 'zh-CN' && k.request.single_line === false, k);
  await p.shot('desk.png');
  await p.ev(`${TA}.focus()`);
  await p.key('z', 'KeyZ', 90, 2);
  ok('Ctrl+Z undoes the insertion (the textarea\'s own undo stack)', await p.until(`${TA}.value === 'Hello world'`, 3000), await val(p));
  await setText(p, 'Replace THIS please', 8, 12);
  answers.push({ text: 'THAT' });
  await p.clickSel(MIC); await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`); await sleep(300);
  await p.clickSel(`${MIC} .voice-time`);
  ok('a selection is replaced by the dictation', await p.until(`${TA}.value === 'Replace THAT please'`), await val(p));
  const n0 = calls.length, g0 = await p.ev('window.__gum');
  await setText(p, 'keep me', 7, 7);
  await p.clickSel(MIC); await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`); await sleep(300);
  await p.clickSel(`${MIC} .voice-cancel`);
  await sleep(600);
  const x1 = { calls: calls.length - n0, gum: (await p.ev('window.__gum')) - g0, state: await p.ev(`window.__ci._voice.state`), value: await val(p) };
  await p.clickSel(MIC); await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`); await sleep(200);
  await p.key('Escape', 'Escape', 27);
  await sleep(600);
  const x2 = { calls: calls.length - n0, state: await p.ev(`window.__ci._voice.state`), value: await val(p) };
  ok('✕ cancels: no request, the text untouched, the button back to the microphone', x1.calls === 0 && x1.gum === 1 && x1.state === 'idle' && x1.value === 'keep me', x1);
  ok('Esc cancels the same way', x2.calls === 0 && x2.state === 'idle' && x2.value === 'keep me', x2);
  answers.push({ text: ' raw words', rewrite: 'skipped' });
  await p.clickSel(MIC); await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`); await sleep(200);
  await p.clickSel(`${MIC} .voice-time`);
  await p.until(`${TA}.value === 'keep me raw words'`);
  const c2 = await chip(p);
  ok('rewrite.status skipped ⇒ inserted anyway, the chip says 按原话插入', (await val(p)) === 'keep me raw words' && c2 && c2.code === 'raw-inserted' && /按原话插入/.test(c2.text), c2);
  key = '';
  const n1 = calls.length, g1 = await p.ev('window.__gum');
  await p.clickSel(MIC);
  await p.until(`document.querySelector('#frame .voice-chip')?.dataset.code === 'not-connected'`);
  const c3 = await chip(p);
  await p.ev(`[...document.querySelectorAll('#frame .voice-chip-btn')].find((b) => b.textContent === '打开插件').click()`);
  ok('no key ⇒ 先连接你的 Dropline + 打开插件 (opens the plugin card); the microphone is never asked, nothing sent', c3 && c3.text === '先连接你的 Dropline' && c3.buttons.includes('打开插件') && (await p.ev('window.__opened')) === 1 && (await p.ev('window.__gum')) === g1 && calls.length === n1, c3);
  key = KEY;
  p.close();
}

console.log('② phone 390 — the same button records and inserts');
{
  const p = await page(390, 800, `http://127.0.0.1:${PORT}`);
  const vis = await p.ev(`(() => { const m = document.querySelector(${JSON.stringify(MIC)}).getBoundingClientRect(); const t = ${TA}.getBoundingClientRect(); return { w: m.width, h: m.height, right: m.right, inField: m.left >= t.left - 1 && m.right <= t.right + 1 && m.top >= t.top - 1 && m.bottom <= t.bottom + 1, vw: innerWidth }; })()`);
  ok('the microphone is on the phone too — inside the field\'s trailing edge (a 40×40 hit area; lanes phone-chat-composer + voice-everywhere)', vis.w >= 40 && vis.h >= 40 && vis.inField, vis);
  await setText(p, '', 0, 0);
  answers.push({ text: '手机上的口述' });
  await p.clickSel(MIC); await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`); await sleep(1100);
  await p.clickSel(`${MIC} .voice-time`);
  ok('phone: click → record → click → inserted', await p.until(`${TA}.value === '手机上的口述'`), await val(p));
  await p.shot('phone.png');
  p.close();
}

console.log('③ an insecure origin (http://voice.test — not loopback): the words + the localhost address, ZERO getUserMedia');
{
  const p = await page(1280, 800, `http://voice.test:${PORT}`);
  const sec = await p.ev('window.isSecureContext');
  const n = calls.length;
  await p.clickSel(MIC);
  await p.until(`document.querySelector('#frame .voice-chip')?.dataset.code === 'insecure'`);
  const c = await chip(p);
  const facts = { secure: sec, gum: await p.ev('window.__gum'), recording: await p.ev(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`), calls: calls.length - n };
  ok('isSecureContext is false on this origin (the leg is real)', sec === false, sec);
  ok('the press says 这个页面不是 https… with http://localhost:<port> and a 复制 button', c && /这个页面不是 https/.test(c.text) && c.text.includes(`http://localhost:${PORT}`) && c.buttons.includes('复制'), c);
  ok('… and getUserMedia was called ZERO times, nothing recorded, nothing sent', facts.gum === 0 && !facts.recording && facts.calls === 0, facts);
  await p.shot('insecure.png');
  p.close();
}

// ── lane voice-everywhere ──
const RECT = `const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null; };`;
const GEO = `(() => { ${RECT} const mic = R('#frame .chat-voice-btn'), exp = R('#frame .chat-expand-btn'), field = R('#frame .chat-input-field textarea');
  const hit = (q) => { if (!q) return null; const e = document.elementFromPoint(q.l + q.w / 2, q.t + q.h / 2); return e ? (e.closest('.chat-voice-btn') ? 'mic' : e.closest('.chat-expand-btn') ? 'expand' : e.tagName) : null; };
  return { mic, exp, field, micHit: hit(mic), expHit: hit(exp), expanded: !!document.querySelector('#frame textarea.chat-input-expanded') }; })()`;
const apart = (a, b) => (a && b ? Math.max(b.t - a.b, a.t - b.b, b.l - a.r, a.l - b.r) : Infinity); // the gap between two boxes (negative = overlap)
const setVal = (p, v) => p.ev(`(() => { const t = ${TA}; t.value = ${JSON.stringify(v)}; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const FOCUS_SPY = `(() => { const t = ${TA}; window.__focusN = 0; t.addEventListener('focus', () => window.__focusN++); return true; })()`;
const FOCI = `({ focusN: window.__focusN, active: document.activeElement === ${TA} ? 'textarea' : document.activeElement && document.activeElement.closest && document.activeElement.closest('.chat-voice-btn') ? 'mic' : (document.activeElement || {}).tagName })`;

console.log('④ phone 390×844 — the mic and ⤢ never share a point (1 line · 3 lines · expanded)');
{
  const p = await page(390, 844, `http://127.0.0.1:${PORT}`, { touch: true });
  await setVal(p, ''); await sleep(150);
  const g1 = await p.ev(GEO);
  await p.shot('phone-1line.png');
  ok('1 line: the mic keeps the trailing edge, a 40×40 hit area; ⤢ hidden; a tap at its centre reaches the mic', g1.mic && g1.mic.w >= 40 && g1.mic.h >= 40 && g1.field.r - g1.mic.r <= 4 && g1.field.b - g1.mic.b <= 4 && !g1.exp && g1.micHit === 'mic', g1);
  await setVal(p, 'first line of the reply\nsecond line\nthird line'); await sleep(200);
  const g3 = await p.ev(GEO);
  await p.shot('phone-3line.png');
  ok(`3 lines: ⤢ at the field's top-right corner, the mic at its trailing bottom — both ≥ 40×40, ${apart(g3.exp, g3.mic).toFixed(0)} px apart (≥ 8)`, g3.exp && g3.exp.w >= 40 && g3.exp.h >= 40 && g3.exp.t - g3.field.t <= 4 && g3.field.r - g3.exp.r <= 4 && g3.mic.w >= 40 && g3.mic.h >= 40 && g3.field.b - g3.mic.b <= 4 && apart(g3.exp, g3.mic) >= 8, g3);
  ok('3 lines: a tap at the mic\'s centre reaches the mic, at ⤢\'s centre ⤢', g3.micHit === 'mic' && g3.expHit === 'expand', { micHit: g3.micHit, expHit: g3.expHit });
  await p.ev(FOCUS_SPY);
  answers.push({ text: ' and a fourth' });
  await p.tapSel(MIC);
  const recOn = await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`, 5000);
  const f3 = await p.ev(`({ ...${FOCI}, expanded: !!document.querySelector('#frame textarea.chat-input-expanded') })`);
  ok('3 lines: a TOUCH tap on the mic records — the editor does not expand, no keyboard (the box is not focused)', recOn && !f3.expanded && f3.focusN === 0 && f3.active !== 'textarea', f3);
  await p.tapSel(`${MIC} .voice-time`);
  ok('…and the words land at the box\'s end (it was never focused)', await p.until(`${TA}.value === 'first line of the reply\\nsecond line\\nthird line and a fourth'`, 6000), await val(p));
  await p.ev(`document.querySelector('#frame .chat-expand-btn').click()`); await sleep(250);
  const gx = await p.ev(GEO);
  await p.shot('phone-expanded.png');
  ok(`expanded: ⤡ top-right, the mic trailing bottom, ${apart(gx.exp, gx.mic).toFixed(0)} px apart, a tap at the mic's centre reaches the mic`, gx.expanded && gx.exp && gx.exp.w >= 40 && gx.mic.w >= 40 && gx.exp.t - gx.field.t <= 4 && gx.field.b - gx.mic.b <= 4 && apart(gx.exp, gx.mic) >= 8 && gx.micHit === 'mic', gx);
  // THE OWNER'S MIS-TAP: ⤢ was judged on input only, so a multi-line SEND left a one-line field with ⤢ still shown ON the mic
  await p.ev(`document.querySelector('#frame .chat-expand-btn').click()`); await sleep(250); // collapse again
  await setVal(p, 'line one\nline two\nline three\nline four'); await sleep(250);
  await p.tapSel('#frame .chat-send-btn'); await sleep(400);
  const gs = await p.ev(GEO);
  await p.shot('phone-after-send.png');
  ok('after a four-line message is SENT the field is one line again: ⤢ gone, the mic alone (it used to stay ON the mic)', (await val(p)) === '' && gs.field.h < 60 && !gs.exp && gs.micHit === 'mic', gs);
  await setVal(p, 'a\nb\nc'); await sleep(250); await setVal(p, 'a'); await sleep(250);
  const gd = await p.ev(GEO);
  ok('deleting back to one line hides ⤢ as well', gd.field.h < 60 && !gd.exp && gd.micHit === 'mic', gd);
  p.close();
}

console.log('⑤ phone — a touch tap on the mic never focuses the box, never blurs it');
{
  const p = await page(390, 844, `http://127.0.0.1:${PORT}`, { touch: true });
  await p.ev(FOCUS_SPY);
  await setVal(p, 'note: ');
  answers.push({ text: 'from the phone' });
  await p.tapSel(MIC);
  const rec = await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`, 5000);
  const f1 = await p.ev(FOCI);
  ok('a tap on an UNFOCUSED box\'s mic records; no focus event on the box, activeElement is not the box (no keyboard) — nor the mic', rec && f1.focusN === 0 && f1.active !== 'textarea' && f1.active !== 'mic', f1);
  await p.tapSel(`${MIC} .voice-time`);
  const landed = await p.until(`${TA}.value === 'note: from the phone'`, 6000);
  const f2 = await p.ev(FOCI);
  ok('the words land at the end of a box never focused — and inserting them focuses nothing', landed && f2.focusN === 0 && f2.active !== 'textarea', { value: await val(p), ...f2 });
  const c = await chip(p);
  await p.tapSel('#frame .voice-chip .voice-chip-btn'); // a real touch tap on 撤销
  const f3 = await p.ev(FOCI);
  ok('the chip\'s 撤销 puts the old text back without a focus', c && c.code === 'inserted' && (await val(p)) === 'note: ' && f3.focusN === 0 && f3.active !== 'textarea', { c, value: await val(p), ...f3 });
  await p.ev(`(() => { const t = ${TA}; t.focus(); t.setSelectionRange(2, 2); window.__focusN = 0; return true; })()`);
  answers.push({ text: 'XY' });
  await p.tapSel(MIC);
  const rec2 = await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`, 5000);
  const f4 = await p.ev(FOCI);
  ok('the keyboard already up (the box focused): a tap on the mic keeps it focused — nothing is blurred', rec2 && f4.active === 'textarea', f4);
  await p.tapSel(`${MIC} .voice-time`);
  const at = await p.until(`${TA}.value === 'noXYte: '`, 6000);
  ok('…and the words land at the caret it had', at && (await p.ev(FOCI)).active === 'textarea', await val(p));
  p.close();
}

console.log('⑥ phone — the For-you reply box: the mic inside its trailing edge, Send unchanged');
{
  const p = await page(390, 844, `http://127.0.0.1:${PORT}`, { touch: true });
  await p.ev('window.__fy()');
  const FYM = '#user-todos-popup .ut-reply .chat-voice-btn', FYT = '#user-todos-popup .ut-reply textarea';
  await p.until(`!!document.querySelector(${JSON.stringify(FYM)}) && document.querySelector(${JSON.stringify(FYM)}).offsetWidth > 0`, 3000);
  const g = await p.ev(`(() => { ${RECT} const mic = R(${JSON.stringify(FYM)}), ta = R(${JSON.stringify(FYT)}), send = R('#user-todos-popup .ut-reply > .ut-reply-send'); return { mic, ta, send, sendChild: !!document.querySelector('#user-todos-popup .ut-reply > .ut-reply-send') }; })()`);
  await p.shotSel('#user-todos-popup', 'foryou-phone.png', 0);
  const inside = g.mic && g.ta && g.mic.l >= g.ta.l - 1 && g.mic.r <= g.ta.r + 1 && g.mic.t >= g.ta.t - 1 && g.mic.b <= g.ta.b + 1;
  ok('the mic sits INSIDE the reply box\'s trailing edge (40×40), Send still beside the box', inside && g.mic.w >= 40 && g.mic.h >= 40 && g.ta.r - g.mic.r <= 4 && g.sendChild && g.send && g.send.l >= g.ta.r, g);
  await p.ev(`(() => { const t = document.querySelector(${JSON.stringify(FYT)}); window.__fyFocus = 0; t.addEventListener('focus', () => window.__fyFocus++); return true; })()`);
  answers.push({ text: 'rel264' });
  await p.tapSel(FYM);
  const rec = await p.until(`document.querySelector(${JSON.stringify(FYM)}).classList.contains('recording')`, 5000);
  if (rec) await p.tapSel(`${FYM} .voice-time`);
  ok('a tap records, a tap stops — the words land in the reply box, no focus, no keyboard', rec && await p.until(`document.querySelector(${JSON.stringify(FYT)}).value === 'rel264'`, 6000) && (await p.ev('window.__fyFocus')) === 0, await p.ev(`document.querySelector(${JSON.stringify(FYT)}).value`));
  p.close();
}

console.log('⑥b desk — a resizable box keeps its drag grip: the mic steps left of the corner');
{
  const p = await page(1280, 800, `http://127.0.0.1:${PORT}`);
  await p.ev('window.__grip()'); await sleep(200);
  const G = `(() => { ${RECT} const ta = R('#grip-host textarea'), mic = R('#grip-host .chat-voice-btn'); return { ta, mic }; })()`;
  const g = await p.ev(G);
  ok('the mic sits inside the box and clear of its bottom-right drag grip (14×14)', g.mic && g.mic.l >= g.ta.l && g.mic.b <= g.ta.b && g.mic.r <= g.ta.r - 14, g);
  const x = g.ta.r - 3, y = g.ta.b - 3;
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 6; k++) await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + k * 15, button: 'left', buttons: 1 });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y + 90, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(150);
  const g2 = await p.ev(G);
  ok('a drag on the grip resizes the box (the mic never takes the press), and the mic follows the trailing edge', g2.ta.h > g.ta.h + 60 && !(await p.ev(`document.querySelector('#grip-host .chat-voice-btn').classList.contains('recording')`)) && g2.ta.b - g2.mic.b <= 4, { before: g.ta.h, after: g2.ta.h, mic: g2.mic });
  p.close();
}

console.log('⑦ voice input off / no key ⇒ every microphone ABSENT (not greyed); the plugins-updated broadcast flips it live');
{
  prefs.enabled = false;
  const p = await page(390, 844, `http://127.0.0.1:${PORT}`, { on: false });
  await p.ev('window.__fy()');
  await sleep(1200);
  const gone = await p.ev(`(() => { const m = [...document.querySelectorAll('.chat-voice-btn')]; return { n: m.length, shown: m.filter((e) => e.offsetWidth > 0 || e.offsetHeight > 0).length, absent: document.documentElement.classList.contains('voice-absent') }; })()`);
  ok('the plugin off ⇒ the chat composer\'s and the For-you box\'s microphones are absent (no box, no greyed button)', gone.n === 2 && gone.shown === 0 && gone.absent, gone);
  const live = await p.ev(`window.__notePlugins([{ id: 'voice-input', enabled: true }])`);
  const back = await p.until(`[...document.querySelectorAll('.chat-voice-btn')].filter((e) => e.offsetWidth > 0).length === 2`, 2000);
  await p.ev(`window.__notePlugins([{ id: 'voice-input', enabled: false }])`);
  const away = await p.until(`[...document.querySelectorAll('.chat-voice-btn')].every((e) => e.offsetWidth === 0)`, 2000);
  ok('plugins-updated (voice-input enabled) puts both back; enabled false takes both away — live, no reload', live && back && away, { live, back, away });
  p.close();
  prefs.enabled = true;
  key = '';
  const q = await page(1280, 800, `http://127.0.0.1:${PORT}`, { on: false });
  await sleep(1200);
  const nokey = await q.ev(`({ shown: document.querySelector('#frame .chat-voice-btn').offsetWidth, absent: document.documentElement.classList.contains('voice-absent') })`);
  ok('no Dropline key ⇒ the desk microphone is absent too', nokey.shown === 0 && nokey.absent, nokey);
  q.close();
  key = KEY;
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
