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
//   an insecure origin (http://voice.test — not loopback, isSecureContext=false): the words + the localhost address
//     with Copy, and ZERO getUserMedia calls
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → desk.png, recording.png, phone.png, insecure.png
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

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
setTimeout(() => { console.log('✗ TIMEOUT (120 s)'); end(1); }, 120e3).unref();

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
async function page(w, h, origin) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} ${FAKE_MIC}` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `${origin}/` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__mount === "function"').catch(() => false)); i++) await sleep(100);
  await ev('window.__mount()');
  const until = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(60); } return false; };
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
  return { cdp, ev, until, clickSel, key, shot, close: () => ws.close() };
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
  ok('the microphone is on the phone too — inside the field\'s trailing edge (≥ 32 px glyph; lane phone-chat-composer)', vis.w >= 32 && vis.h >= 32 && vis.inField, vis);
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
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
