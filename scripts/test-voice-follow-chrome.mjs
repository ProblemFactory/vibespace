#!/usr/bin/env node
// test-voice-follow-chrome — lane voice-follows-focus (the owner 2026-10-21: 「我发现还是有些输入框不能用 drop line，比如说编辑或者
// 拒绝 Agent 要发的消息」; 2026-10-13: 「每个输入框都做一下 Dropline」). DICTATION IS A PROPERTY OF FOCUS: in a real Chrome, over the
// REAL hub route (src/routes/voice.js + src/server/dropline-client.js) and a FAKE Dropline http server (never a real call),
// the REAL boxes are focused and dictated into — the words land AT THE CARET, the box's own rules run (`input`), nothing is
// committed (no Enter: the reject is not sent, the dialog not answered, the question not submitted), the field keeps its
// focus through the presses on the microphone, and the microphone stands BESIDE the field (never over it).
//   ① desk 1280: the Outbox proposal's REJECT reason box (followed — it had no microphone), its EDIT box (its own in-field
//      microphone, no second one), the API proposal's reject popover, the chat question card's own answer (a dictated line
//      break is a space: no Enter), a createModalShell showInputDialog box (the microphone and its chip over the modal's
//      backdrop), a settings text row (its onchange saves after the blur), the theme editor's name, the For-you row's reply
//      box (its own microphone), a [contenteditable] (a Range at the caret), a type=email box (no caret API: its end)
//   ② the exclusions, by the predicate: the vault's password (its unlock dialog), xterm's helper textarea (a real terminal)
//      — NO microphone; the chat composer keeps its own (no follower)
//   ③ the press: a press on the follower's microphone inside a createPopover popover keeps it open (window capture guard)
//      — MUTANT (the guard removed) closes it; blur ⇒ gone; a field removed while focused ⇒ gone; a recording outlives a
//      blur and lands in ITS field; voice input off ⇒ absent
//   ④ phone 390×844 and 375×812 (touch): a TAP on the reject box shows a 40-px microphone outside the field, inside the
//      view, clear of the keyboard-yield strip; a TAP on it keeps the focus (no blur) and the words land at the caret
//   ⑤ RED CONTROL = the base's shape: the same page over a PATCHED COPY of today's src/lib/voice-input.js in the scratch dir,
//      the follower unexported (the base had none) — no microphone on the reject box. Never the repository's history: the
//      Actions checkout is depth 1, so the .335 cut's read of the base commit was a red there (lane ci-335-reds)
//   ⑥ THE CENSUS (scripts/test-voice-focus.mjs, grep-derived): printed; each box this suite rendered is judged at run time
//      exactly as the census judged its site
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → follow-reject.png, follow-dialog.png, follow-phone-390.png,
//   follow-phone-375.png
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { census, libFiles, appCss, rowText } from './test-voice-focus.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = scratch('voice-follow');
const SHOTS = process.env.VIBESPACE_VOICE_PNG_DIR || root;
let chrome = null, srv = null, vendor = null;
const end = (code) => { try { chrome && chrome.kill('SIGKILL'); } catch { } try { srv && srv.close(); vendor && vendor.close(); } catch { } process.exit(code); };
// a leg that throws (a page exception, a missing element) is a RED with Chrome torn down — never an orphaned browser
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { fail++; console.log(`  ✗ the suite threw — ${String((e && e.stack) || e).slice(0, 900)}`); console.log(`\n${fail} FAILED (${pass} passed)`); end(1); });
const CDP_PENDS = new Set();
armWatchdog({ capMs: 280e3, exit: end, pending: () => [...CDP_PENDS].flatMap((m) => [...m.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`)) });

// ── the fake Dropline (the vendor stubbed: never a real call) ──
const KEY = 'dl_follow_fake_0123456789';
const calls = [];
const answers = [];
vendor = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const field = (n) => { const m = new RegExp(`name="${n}"\\r\\nContent-Type: [^\\r]+\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body); return m ? m[1] : null; };
    calls.push({ url: req.url, context: JSON.parse(field('context') || 'null') });
    const a = answers.shift() || 'DICTATED';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ request_id: 'dct_f' + calls.length, mode: 'dictate', final_text: a, transcript: { text: a.toLowerCase(), language: 'en' }, rewrite: { status: 'used', reason: null } }));
  });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));

// ── the hub: the real voice route + client; the boxes' own routes recorded (a commit would show here) ──
const express = require(path.join(REPO, 'node_modules/express'));
const store = { resolveIntegration: (id) => (id === 'dropline' ? { source: 'user', values: { apiKey: KEY } } : { source: 'none', values: {} }) };
const prefs = { enabled: true, config: { language: 'auto' } };
const client = require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => store, pluginOn: () => prefs.enabled, base: `http://127.0.0.1:${vendor.address().port}`, log: { log() { }, warn() { } } });
const routes = [];
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const VI_PATH = path.join(REPO, 'src/lib/voice-input.js');
const entry = `import * as VI from ${JSON.stringify(VI_PATH)};
import { dictationTarget } from ${JSON.stringify(path.join(REPO, 'src/voice-focus.js'))};
import { renderProposalCard } from ${JSON.stringify(path.join(REPO, 'src/lib/channel-outbox.js'))};
import { renderApiCard } from ${JSON.stringify(path.join(REPO, 'src/lib/channel-api-card-view.js'))};
import { ChatRenderers } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-renderers.js'))};
import { renderRow, replyBoxEl } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-row.js'))};
import { showInputDialog, createPopover } from ${JSON.stringify(path.join(REPO, 'src/lib/utils.js'))};
import { SettingsUI } from ${JSON.stringify(path.join(REPO, 'src/lib/settings-ui.js'))};
import { SETTINGS_SCHEMA } from ${JSON.stringify(path.join(REPO, 'src/lib/settings-schema.js'))};
import { ThemeEditor } from ${JSON.stringify(path.join(REPO, 'src/lib/theme-editor.js'))};
import { showUnlock } from ${JSON.stringify(path.join(REPO, 'src/lib/vault-unlock.js'))};
import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { Terminal } from '@xterm/xterm';
import { t } from ${JSON.stringify(path.join(REPO, 'src/lib/i18n.js'))};
window.__follow = () => (typeof VI.followFocus === 'function' ? VI.followFocus() : 'absent');
window.__judge = (sel) => { const el = document.querySelector(sel); return el && VI.fieldFacts ? dictationTarget(VI.fieldFacts(el)) : null; };
window.__notePlugins = (rows) => VI.noteVoicePlugins(rows);
window.__sends = [];
window.__events = [];
const vals = {}, ls = {};
const def = (k) => (SETTINGS_SCHEMA[k] ? SETTINGS_SCHEMA[k].default : undefined);
const settings = { get: (k) => (k in vals ? vals[k] : def(k)), set: (k, v) => { vals[k] = v; for (const f of [...(ls[k] || [])]) f(v); }, isModified: (k) => k in vals && vals[k] !== def(k), reset: (k) => settings.set(k, def(k)), on: (k, f) => { (ls[k] = ls[k] || new Set()).add(f); }, off: (k, f) => { if (ls[k]) ls[k].delete(f); } };
window.__vals = vals;
const app = { settings, isMobile: innerWidth < 600, sessions: new Map(), _refreshThemeDropdown() {},
  ws: { send: (m) => window.__sends.push(m), onGlobal() { return () => {}; }, offGlobal() {}, onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm'); } },
  themeManager: { current: 'dark', apply() {}, _clearInlineOverrides() {}, extractThemeValues: () => ({}), getTerminalTheme: () => ({}), registerCustomTheme() {}, setLivePreview() {}, unregisterCustomTheme() {} } };
const stage = () => { for (const s of document.querySelectorAll('.dialog-overlay, .theme-editor-panel, #user-todos-popup, [data-popover], .voice-chip-float')) s.remove(); /* a leg's 5-s 已插入 chip would cover the next leg's buttons */ const s = document.getElementById('stage'); s.textContent = ''; return s; };
// every field the person could type into: its input / change events counted (the box's own rules)
for (const ev of ['input', 'change', 'blur', 'keydown']) document.addEventListener(ev, (e) => { if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) window.__events.push({ ev, cls: e.target.className || e.target.tagName, key: e.key || null }); }, true);
window.__outbox = (text) => {
  const s = stage();
  const p = { id: 'pr-follow-1', state: 'awaiting-approval', adapterId: 'lark:a', convId: 'oc_dana', text, at: Date.now(), updatedAt: Date.now(), drafter: { name: 'agent' } };
  const card = renderProposalCard(app, p, {});
  card.dataset.armedAt = '0';   // armed now (the 600-ms arming guard has its own suite)
  s.appendChild(card);
  return true;
};
const T0 = Date.now();
window.__api = () => {
  const s = stage();
  const rec = { status: 'pending', cred: 'lark-1', credLabel: 'Lark · ops', at: T0 - 3600e3, conv: 'agent-1', principal: { kind: 'agent', id: 'agent-1', name: 'Odd jobs' }, host: 'open.feishu.cn', query: [['receive_id_type', 'chat_id']], headers: { 'content-type': 'application/json' }, bodySha: 'ab'.repeat(32), tier: 'write-ask', digest: 'd-1', id: 'api-send', method: 'POST', path: '/open-apis/im/v1/messages', body: '{"receive_id":"oc_fixture","msg_type":"text"}', bodyBytes: 46, sensitive: null, offersAlways: true, shape: 'POST open.feishu.cn/open-apis/im/*/messages', objectName: 'Product room', objectConv: { adapterId: 'lark-1', convId: 'oc_fixture' }, note: 'post the weekly summary' };
  s.appendChild(renderApiCard(rec, null, { app }));
  return true;
};
window.__ask = () => {
  const s = stage();
  const el = document.createElement('div'); el.className = 'chat-msg'; s.appendChild(el);
  const r = new ChatRenderers({ ws: app.ws, sessionId: 'sess-follow', app, compact: false, messageList: s });
  r.renderPermissionOverlay(el, { id: 'm-ask', permission: { kind: 'user_input', requestId: 'rq-follow', questions: [{ question: 'Which branch should the follower land on?', header: 'Branch', options: [{ label: 'master' }, { label: 'rel335' }], multiSelect: false }], input: {} } }, { mount: el });
  return true;
};
window.__fy = () => {
  const s = stage();
  const pop = document.createElement('div'); pop.id = 'user-todos-popup';
  pop.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:8px 8px 12px;background:var(--bg-dialog);border-bottom:1px solid var(--border);color:var(--text);font:13px system-ui';
  const item = { id: 'td-follow-1', title: 'Which branch should the follower land on?', detail: 'reply with the branch name.', sessionKey: 'claude:sess-follow', createdAt: Date.now() - 120000, options: ['master', 'rel335'] };
  const ctx = { t, nameFor: () => 'Follow lane chat', wordsOf: (i) => i.title, detailOf: (i) => i.detail, replyState: () => ({ show: true, enabled: true, why: '' }) };
  const row = renderRow({ item, resolved: false }, ctx);
  pop.appendChild(row); document.body.appendChild(pop);
  row.querySelector(':scope > .ut-body').append(replyBoxEl(t));
  return true;
};
window.__dialog = () => { stage(); window.__answer = 'pending'; showInputDialog({ title: 'Rename the window', label: 'Name', value: '' }).then((v) => { window.__answer = v; }); return true; };
window.__settingsRow = () => {
  const s = stage();
  const ui = new SettingsUI(app);
  ui._search = 'chat.uploaddir'; ui._facts = {};
  const host = document.createElement('div'); host.className = 'settings-body'; host.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:700px;overflow:auto';
  const nav = document.createElement('nav'); nav.className = 'settings-nav';
  const content = document.createElement('div'); content.className = 'settings-content';
  host.append(nav, content); s.appendChild(host);
  ui._renderContent(content, nav);
  return true;
};
window.__theme = () => { stage(); new ThemeEditor(app).open('dark'); return true; };
window.__vault = () => { stage(); showUnlock(); return true; };
window.__term = () => { const s = stage(); const d = document.createElement('div'); d.id = 'term-host'; d.style.cssText = 'position:absolute;left:20px;top:20px;width:640px;height:220px'; s.appendChild(d); const term = new Terminal({ cols: 60, rows: 8 }); term.open(d); term.focus(); window.__xterm = term; return true; };
window.__pop = () => {
  const s = stage();
  const a = document.createElement('button'); a.id = 'pop-anchor'; a.textContent = 'Rename…'; a.style.cssText = 'position:absolute;left:300px;top:200px'; s.appendChild(a);
  const pop = createPopover(a, 'zz-follow-pop');
  const inp = document.createElement('input'); inp.className = 'zz-pop-input'; inp.placeholder = 'A new name'; inp.style.cssText = 'width:260px;margin:30px 8px 8px';
  pop.appendChild(inp); pop.style.visibility = ''; pop.style.background = 'var(--bg-dialog)'; pop.style.border = '1px solid var(--border)';
  return true;
};
window.__ce = () => { const s = stage(); const d = document.createElement('div'); d.className = 'zz-ce'; d.contentEditable = 'true'; d.setAttribute('aria-label', 'A note'); d.style.cssText = 'position:absolute;left:40px;top:120px;width:500px;min-height:60px;border:1px solid var(--border);padding:6px;color:var(--text)'; d.textContent = 'Hello world'; s.appendChild(d); return true; };
window.__email = () => { const s = stage(); const i = document.createElement('input'); i.type = 'email'; i.className = 'zz-email'; i.placeholder = 'Who'; i.style.cssText = 'position:absolute;left:40px;top:160px;width:300px'; i.value = 'Hello world'; s.appendChild(i); return true; };
window.__composer = () => {
  const s = stage();
  const ci = new ChatInput(app.ws, 'sess-follow-ci', { onSend() {}, onInterrupt() {}, getCwd: () => '/home/u/p', getHost: () => null, getUploadDir: () => '', isTouch: () => false, getTouchEnterSends: () => false, getEnterSends: () => true, getVoiceFacts: () => ({ title: 'x', messages: [] }), openPlugins() {} });
  const f = document.createElement('div'); f.className = 'chat-view'; f.style.cssText = 'position:absolute;left:0;right:0;bottom:0'; f.appendChild(ci.element); s.appendChild(f);
  return true;
};`;
async function bundle(name, plugins = []) {
  await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('page.js');
// MUTANT: the follower's window-capture press guard removed (the press reaches the popover's outside-press closer)
const VI_SRC = fs.readFileSync(VI_PATH, 'utf8');
const GUARD = "  window.addEventListener('pointerdown', guard, { capture: true, ...o });\n";
ok('the mutant anchor (the press guard) is in voice-input.js exactly once', VI_SRC.split(GUARD).length === 2);
await bundle('mutant.js', [{ name: 'no-guard', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]voice-input\.js$/ }, () => ({ contents: VI_SRC.replace(GUARD, ''), loader: 'js', resolveDir: path.dirname(VI_PATH) })); } }]);
// RED CONTROL = the base's shape (no follower): a PATCHED COPY of today's voice-input.js in the scratch dir with followFocus
// unexported, so app.js's call has nothing to call, as on the base. It runs on any checkout: no git history (lane ci-335-reds)
const FOLLOW_EXPORT = 'export function followFocus() {';
ok('the control anchor (the follower\'s export) is in voice-input.js exactly once', VI_SRC.split(FOLLOW_EXPORT).length === 2);
const BASE_COPY = path.join(root, 'voice-input.base-shape.js');
fs.writeFileSync(BASE_COPY, VI_SRC.replace(FOLLOW_EXPORT, 'function followFocus() {'));
await bundle('base.js', [{ name: 'base-vi', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]voice-input\.js$/ }, () => ({ contents: fs.readFileSync(BASE_COPY, 'utf8'), loader: 'js', resolveDir: path.dirname(VI_PATH) })); } }]);

const app = express();
app.use(express.json());
app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client, prefs: () => prefs, log: { log() { }, warn() { } } }));
app.post(/^\/api\/channels\/outbox\/([^/]+)\/(reject|approve)$/, (q, s) => { routes.push({ url: q.path, body: q.body }); s.json({ ok: true, proposal: { id: q.params[0], state: q.params[1] === 'reject' ? 'rejected' : 'sent' } }); });
app.post(/^\/api\/channels\/api\/proposals\/([^/]+)\/(reject|approve|resubmit)$/, (q, s) => { routes.push({ url: q.path, body: q.body }); s.json({ ok: true }); });
app.get('/api/custom-themes', (q, s) => s.json({}));
app.get('/api/vault/facts', (q, s) => s.json({ state: 'locked' }));
// the app's stylesheets in public/index.html's order (chat.css after style.css — the cascade the chip lost)
const CSS = [...String(fs.readFileSync(path.join(REPO, 'public/index.html'), 'utf8')).matchAll(/<link rel="stylesheet" href="\/([\w-]+)\.css">/g)].map((m) => m[1]);
const cssFile = (n) => (n === 'xterm' ? path.join(REPO, 'node_modules/@xterm/xterm/css/xterm.css') : path.join(REPO, `public/${n}.css`));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => (fs.existsSync(cssFile(n)) ? s.type('text/css').send(fs.readFileSync(cssFile(n))) : s.type('text/css').send('')));
for (const n of ['page', 'mutant', 'base']) app.get(`/${n}.js`, (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, `${n}.js`))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-window);color:var(--text);font:13px system-ui} #stage{position:fixed;inset:0;padding:120px 24px 24px;overflow:auto}</style></head><body><div id="stage"></div><script src="/${['mutant', 'base'].includes(q.query.b) ? q.query.b : 'page'}.js"></script></body></html>`));
app.use((q, s) => s.status(404).json({ error: 'not in this harness' }));
const PORT = await freePort();
srv = http.createServer(app);
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { env: cenv, stdio: 'ignore' });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

const FAKE_MIC = `(() => {
  const gum = async () => { const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gum;
  class FakeRecorder extends EventTarget {
    constructor(stream, opts) { super(); this.mimeType = (opts && opts.mimeType) || 'audio/webm;codecs=opus'; this.state = 'inactive'; }
    static isTypeSupported(t) { return /webm/.test(t); }
    start() { this.state = 'recording'; }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['\\x1aE\\xdf\\xa3 OPUS-FAKE '.repeat(40)], { type: this.mimeType }) }); this.onstop && this.onstop(); }, 30); }
  }
  window.MediaRecorder = FakeRecorder;
})();`;
async function page(w, h, { touch = false, b = 'page', follow = true } = {}) {
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
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?b=${b}` });
  for (let i = 0; i < 100 && !(await ev('typeof window.__outbox === "function"').catch(() => false)); i++) await sleep(100);
  await ev(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && e.reason.message || e.reason)));`);
  const started = follow ? await ev('window.__follow()') : null;
  const until = async (expr, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(50); } return false; };
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  // a target below the fold is brought into view first (no scroll when it is already seen — a focused field's caret stays put)
  const center = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; let b = e.getBoundingClientRect(); if (b.top < 0 || b.bottom > innerHeight) { e.scrollIntoView({ block: 'center' }); b = e.getBoundingClientRect(); } return b.width ? [b.left + b.width / 2, b.top + b.height / 2] : null; })()`);
  const clickAt = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const clickSel = async (sel) => { const r = await center(sel); if (!r) return false; await clickAt(r[0], r[1]); return true; };
  const touchTap = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] }); await sleep(40); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150); };
  const tapSel = async (sel) => { const r = await center(sel); if (!r) return false; await touchTap(r[0], r[1]); return true; };
  const press = touch ? tapSel : clickSel;
  const key = async (k, code, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const shot = async (file, sel, pad = 12) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const x = Math.max(0, r[0] - pad), y = Math.max(0, r[1] - pad - 48);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x, y, width: Math.min(w - x, r[2] + 2 * pad), height: Math.min(h - y, r[3] + 2 * pad + 96), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, clickSel, clickAt, tapSel, press, touchTap, key, shot, started, close: () => { CDP_PENDS.delete(pend); ws.close(); } };
}

// the follower's microphone for the focused field: geometry + who holds the focus
const MIC = '.voice-follow:not([hidden]) > .voice-btn';
const geo = (p, sel) => p.ev(`(() => {
  const f = document.querySelector(${JSON.stringify(sel)}), host = document.querySelector('.voice-follow:not([hidden])');
  if (!f) return { field: false };
  const r = f.getBoundingClientRect(), m = host ? host.getBoundingClientRect() : null;
  const cx = m ? m.left + m.width / 2 : 0, cy = m ? m.top + m.height / 2 : 0;
  const top = m ? document.elementFromPoint(cx, cy) : null;
  return { field: true, mic: !!m && m.width > 0 && getComputedStyle(host).display !== 'none', w: m && m.width, h: m && m.height, side: host && host.dataset.side,
    overField: !!m && m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom,
    inView: !!m && m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight,
    onTop: !!top && !!top.closest && !!top.closest('.voice-follow'), focused: document.activeElement === f, svg: !!(host && host.querySelector('svg')), n: document.querySelectorAll('.voice-follow').length };
})()`);
/** set the field's text and caret (no focus move), press the microphone, press again, wait for the words */
async function dictate(p, sel, { value = 'Hello world', caret = 6, answer = 'DICTATED', want = null, ce = false } = {}) {
  if (value !== null) await p.ev(`(() => { const f = document.querySelector(${JSON.stringify(sel)}); ${ce ? `f.textContent = ${JSON.stringify(value)}; const r = document.createRange(); r.setStart(f.firstChild, ${caret}); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);` : `f.value = ${JSON.stringify(value)}; try { f.setSelectionRange(${caret}, ${caret}); } catch {}`} window.__events.length = 0; return true; })()`);
  const n0 = calls.length;
  answers.length = 0; answers.push(answer);
  await p.press(MIC);
  const recording = await p.until(`!!document.querySelector('.voice-follow .voice-btn.recording')`, 4000);
  const focusRec = await p.ev(`document.activeElement === document.querySelector(${JSON.stringify(sel)})`);
  await sleep(250);
  await p.press('.voice-follow .voice-btn .voice-time');
  const target = want != null ? want : value.slice(0, caret) + answer + value.slice(caret);
  const read = ce ? `document.querySelector(${JSON.stringify(sel)}).textContent` : `document.querySelector(${JSON.stringify(sel)}).value`;
  const landed = await p.until(`${read} === ${JSON.stringify(target)}`, 6000);
  await sleep(120);
  const after = await p.ev(`(() => ({ value: ${read}, focused: document.activeElement === document.querySelector(${JSON.stringify(sel)}), events: window.__events.slice(), chip: (document.querySelector('.voice-chip-float:not(.hidden)') || {}).dataset?.code || null }))()`);
  return { recording, focusRec, landed, ...after, call: calls.length === n0 + 1 ? calls[calls.length - 1] : null, n: calls.length - n0 };
}
const noBlur = (d) => !d.events.some((e) => e.ev === 'blur');
const noEnter = (d) => !d.events.some((e) => e.ev === 'keydown' && e.key === 'Enter');
const inputFired = (d) => d.events.some((e) => e.ev === 'input');
const judged = {};

console.log('① desk 1280 — the boxes the owner named, and the rest of the client: focus ⇒ the microphone beside the field ⇒ the words at the caret, nothing committed');
{
  const p = await page(1280, 860);
  ok('followFocus() binds once (a second call is a no-op)', p.started === true && (await p.ev('window.__follow()')) === false);
  // — the Outbox proposal's REJECT reason box: it had NO microphone (the owner's 「拒绝」) —
  await p.ev(`window.__outbox('The quarterly numbers are in — shall I post them to the product room?')`);
  await p.clickSel('.chan-prop [data-reject]');
  const rj = '.chan-prop-rejectbox input.chan-opt-input';
  await p.until(`document.activeElement === document.querySelector(${JSON.stringify(rj)})`);
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g1 = await geo(p, rj);
  ok('the Outbox proposal\'s REJECT reason box (focused by Reject…) has a microphone — BESIDE the field (not over it), inside the view, on top, an SVG; ONE', g1.mic && !g1.overField && g1.inView && g1.onTop && g1.svg && g1.focused && g1.n === 1, g1);
  judged['channel-outbox.js inp'] = await p.ev(`window.__judge(${JSON.stringify(rj)})`);
  await p.shot('follow-reject.png', '.chan-prop');
  const d1 = await dictate(p, rj);
  ok('dictated into the reject box: the words land AT THE CARET ("Hello DICTATEDworld"), `input` fired, the field kept the focus through both presses (no blur)', d1.recording && d1.landed && d1.focusRec && d1.focused && noBlur(d1) && inputFired(d1), d1);
  ok('…and NOTHING is committed: no Enter, no reject request (the Outbox reject box sent on an Enter once — chat-enter-keys.js, 2026-10-14)', noEnter(d1) && routes.length === 0, { routes, ev: d1.events });
  const ph1 = await p.ev(`document.querySelector(${JSON.stringify(rj)}).placeholder`);
  ok('the dictation\'s context = the box\'s label (its placeholder, 「理由（agent 会读到）」) + the card\'s words (≤ 600 chars), no conversation', !!d1.call && d1.call.context.title === ph1 && /quarterly numbers are in/.test(d1.call.context.text || '') && (d1.call.context.text || '').length <= 600 && d1.call.context.before === 'Hello ' && d1.call.context.after === 'world', d1.call && d1.call.context);
  await p.clickSel('.chan-prop-rejectbox .mounts-btn-primary');
  for (let i = 0; i < 40 && !routes.length; i++) await sleep(50);
  ok('the person\'s own Reject then sends the dictated reason (the box\'s value is real)', routes.length === 1 && /\/reject$/.test(routes[0].url) && routes[0].body.reason === 'Hello DICTATEDworld', routes);
  await p.until(`!document.querySelector(${JSON.stringify(MIC)})`, 2000);
  ok('the field gone with the card\'s re-render or its blur ⇒ no microphone left behind', await p.ev(`!document.querySelector(${JSON.stringify(MIC)})`));
  routes.length = 0;
  // — the Outbox EDIT box: its own in-field microphone (voiceField), no second one —
  await p.ev(`window.__outbox('Draft: the numbers are in.')`);
  await p.clickSel('.chan-prop [data-edit]');
  await p.until(`document.activeElement === document.querySelector('.chan-prop-edit')`);
  await sleep(200);
  const g2 = await p.ev(`(() => { const f = document.querySelector('.chan-prop-edit'), b = f.parentElement.querySelector(':scope > .voice-btn'); const r = b && b.getBoundingClientRect(); return { wrapped: f.parentElement.classList.contains('voice-field'), own: !!b && r.width > 0, follow: document.querySelectorAll('.voice-follow:not([hidden])').length }; })()`);
  ok('the Outbox EDIT box (the owner\'s 「编辑」, measured): its own microphone inside the box (voiceField) — the follower adds NO second one', g2.wrapped && g2.own && g2.follow === 0, g2);
  judged['channel-outbox.js editor'] = await p.ev(`window.__judge('.chan-prop-edit')`);
  await p.ev(`(() => { const f = document.querySelector('.chan-prop-edit'); f.value = 'Draft: the numbers are in.'; f.setSelectionRange(6, 6); return true; })()`);
  answers.length = 0; answers.push(' EDITED');
  await p.clickSel('.chan-prop-edit + .voice-btn');
  await p.until(`!!document.querySelector('.chan-prop-edit + .voice-btn.recording')`);
  await sleep(250);
  await p.clickSel('.chan-prop-edit + .voice-btn .voice-time');
  ok('…dictated through it: the words at the caret, nothing approved', await p.until(`document.querySelector('.chan-prop-edit').value === 'Draft: EDITED the numbers are in.'`) && routes.length === 0, await p.ev(`document.querySelector('.chan-prop-edit').value`));
  // — the API proposal's reject popover —
  await p.ev('window.__api()');
  await p.clickSel('.chan-api-reject');
  await p.until(`document.activeElement === document.querySelector('.chan-api-why')`);
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g3 = await geo(p, '.chan-api-why');
  judged['channel-api-card-view.js why'] = await p.ev(`window.__judge('.chan-api-why')`);
  const d3 = await dictate(p, '.chan-api-why');
  ok('the API proposal\'s reject popover: a microphone beside its box; the words at the caret; the popover still open, nothing rejected', g3.mic && !g3.overField && d3.landed && d3.focused && noBlur(d3) && (await p.ev(`!!document.querySelector('.chan-api-reject-pop')`)) && routes.length === 0, { g3, d3 });
  // — the chat question card's own answer: a dictated line break is a SPACE (no Enter), the card's rule runs —
  await p.ev('window.__ask()');
  await p.clickSel('.chat-ask-custom');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g4 = await geo(p, '.chat-ask-custom');
  judged['chat-renderers.js customInput'] = await p.ev(`window.__judge('.chat-ask-custom')`);
  const d4 = await dictate(p, '.chat-ask-custom', { value: '', caret: 0, answer: 'the follower\nbranch', want: 'the follower branch' });
  const submit = await p.ev(`(() => { const b = [...document.querySelectorAll('.chat-permission-inline button')].find((x) => /提交|Submit/.test(x.textContent)); return b ? { disabled: b.disabled } : null; })()`);
  ok('the chat question card\'s own answer: a microphone beside it; a dictated line break becomes a space (a one-line box never takes an Enter)', g4.mic && !g4.overField && d4.landed && noEnter(d4), { g4, d4 });
  ok('…its own rule ran (input ⇒ the answer is selected, Submit enabled) and NOTHING was submitted (no permission-response sent)', inputFired(d4) && submit && submit.disabled === false && (await p.ev('window.__sends.length')) === 0, { submit, sends: await p.ev('window.__sends') });
  // — a createModalShell showInputDialog box: the microphone and its chip OVER the modal's backdrop —
  await p.ev('window.__dialog()');
  await p.until(`document.activeElement && document.activeElement.matches('.dialog-overlay input')`);
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g5 = await geo(p, '.dialog-overlay input');
  judged['utils.js input'] = await p.ev(`window.__judge('.dialog-overlay input')`);
  await p.shot('follow-dialog.png', '.dialog-overlay .dialog');
  const d5 = await dictate(p, '.dialog-overlay input', { value: '', caret: 0, answer: 'Planning board' });
  const chipTop = await p.ev(`(() => { const c = document.querySelector('.voice-chip-float:not(.hidden)'), m = document.querySelector('.voice-follow'); if (!c || !m) return null; const b = c.getBoundingClientRect(), q = m.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 4, b.top + b.height / 2); return { onTop: !!e && !!e.closest('.voice-chip-float'), fixed: getComputedStyle(c).position === 'fixed', above: b.bottom <= q.top + 1, right: Math.abs(b.right - q.right) < 2 }; })()`);
  ok('showInputDialog\'s box: the microphone stands over the modal\'s backdrop (on top at its centre), beside the box', g5.mic && g5.onTop && !g5.overField && g5.inView, g5);
  ok('…the words land, the dialog is NOT answered (no Enter) and its "已插入 · 撤销" chip floats ABOVE its microphone (right edges aligned, fixed) over the backdrop — chat.css\'s composer chip rule no longer wins the cascade', d5.landed && noEnter(d5) && (await p.ev('window.__answer')) === 'pending' && !!chipTop && chipTop.onTop && chipTop.fixed && chipTop.above && chipTop.right, { d5, chipTop, answer: await p.ev('window.__answer') });
  // CONTROL: the base's one-class rule (the selector switched back in place, then restored) — chat.css wins: the chip is
  // absolute at the page's LEFT edge with z-index 20, under the dialog's backdrop
  const ctl = await p.ev(`(() => { for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules) if (r.selectorText === '.voice-chip.voice-chip-float') { r.selectorText = '.voice-chip-float'; const c = document.querySelector('.voice-chip-float:not(.hidden)'); const st = getComputedStyle(c), b = c.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 4, b.top + b.height / 2); const out = { position: st.position, z: st.zIndex, left: Math.round(b.left), onTop: !!e && !!e.closest('.voice-chip-float') }; r.selectorText = '.voice-chip.voice-chip-float'; return out; } } return null; })()`);
  ok('CONTROL (the base\'s one-class .voice-chip-float): the chip is absolute at the page\'s left edge, z-index 20, under the backdrop', !!ctl && ctl.position === 'absolute' && ctl.z === '20' && ctl.left < 4 && ctl.onTop === false, ctl);
  await p.clickSel('.dialog-overlay .btn-create');
  ok('…the person\'s OK answers it with the dictated name', await p.until(`window.__answer === 'Planning board'`, 3000), await p.ev('window.__answer'));
  // — a settings text row: the words land; its onchange saves at the blur —
  await p.ev('window.__settingsRow()');
  const SR = '.settings-content input.settings-input-text';
  ok('a settings text row is drawn (「Upload files to」 — chat.uploadDir)', await p.until(`!!document.querySelector(${JSON.stringify(SR)})`, 4000));
  await p.clickSel(SR);
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g6 = await geo(p, SR);
  judged['settings-ui.js input'] = await p.ev(`window.__judge(${JSON.stringify(SR)})`);
  const d6 = await dictate(p, SR, { value: '/home/u/uploads', caret: 15, answer: '/voice' });
  await p.clickAt(1200, 840);
  ok('a settings text row: a microphone beside it; the words at the caret; its own onchange saves them once the box is left (as after typing)', g6.mic && !g6.overField && d6.landed && (await p.until(`window.__vals['chat.uploadDir'] === '/home/u/uploads/voice'`, 3000)), { g6, d6, vals: await p.ev('window.__vals') });
  ok('…and the microphone goes with the blur', await p.until(`!document.querySelector(${JSON.stringify(MIC)})`, 2000));
  // — the theme editor's name —
  await p.ev('window.__theme()');
  ok('the theme editor opens', await p.until(`!!document.querySelector('.theme-editor-name')`, 4000));
  await p.clickSel('.theme-editor-name');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const g7 = await geo(p, '.theme-editor-name');
  judged['theme-editor.js nameInput'] = await p.ev(`window.__judge('.theme-editor-name')`);
  const d7 = await dictate(p, '.theme-editor-name', { value: '', caret: 0, answer: 'Dusk' });
  ok('the theme editor\'s name: a microphone beside it, the words in it', g7.mic && !g7.overField && d7.landed && d7.focused, { g7, d7 });
  // — the For-you row's reply: its own microphone, no follower —
  await p.ev('window.__fy()');
  await p.clickSel('#user-todos-popup .ut-reply-input');
  await sleep(250);
  const g8 = await p.ev(`(() => { const f = document.querySelector('#user-todos-popup .ut-reply-input'); return { own: !!f.parentElement.querySelector(':scope > .voice-btn'), focused: document.activeElement === f, follow: document.querySelectorAll('.voice-follow:not([hidden])').length }; })()`);
  ok('the For-you row\'s reply box: its own microphone (voiceField), focused — no second microphone from the follower', g8.own && g8.focused && g8.follow === 0, g8);
  // — a contenteditable: a Range at the caret —
  await p.ev('window.__ce()');
  await p.clickSel('.zz-ce');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const d9 = await dictate(p, '.zz-ce', { ce: true });
  ok('a [contenteditable]: a microphone; the words at the caret (a Range — insertText), `input` fired, the focus kept', d9.landed && d9.focused && inputFired(d9), d9);
  // — a type=email box: no caret API ⇒ at its end —
  await p.ev('window.__email()');
  await p.clickSel('.zz-email');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const d10 = await dictate(p, '.zz-email', { want: 'Hello worldDICTATED' });
  ok('a type=email box (no caret API in Chrome): the words at its end, never an exception', d10.landed && d10.focused, d10);
  ok('no page error on the desk legs', (await p.ev('window.__errs')).length === 0, await p.ev('window.__errs'));
  p.close();
}

console.log('② the exclusions are the predicate\'s — the vault\'s password, the terminal; the composer keeps its own');
{
  const p = await page(1280, 860);
  await p.ev('window.__vault()');
  const pw = '#vault-unlock-pw';
  ok('the vault\'s unlock dialog: its second-password box is focused…', await p.until(`!!document.querySelector('${pw}')`, 4000) && (await p.clickSel(pw)) && (await p.until(`document.activeElement === document.querySelector('${pw}')`)));
  await sleep(400);
  judged['vault-unlock.js i'] = await p.ev(`window.__judge('${pw}')`);
  ok('…and gets NO microphone (secret — type=password)', (await p.ev(`document.querySelectorAll('.voice-follow').length`)) === 0 && judged['vault-unlock.js i'] && judged['vault-unlock.js i'].why === 'secret', judged['vault-unlock.js i']);
  await p.ev('window.__term()');
  ok('a real xterm terminal holds the focus (its helper textarea)…', await p.until(`document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea')`, 4000));
  await sleep(400);
  const tj = await p.ev(`window.__judge('.xterm-helper-textarea')`);
  ok('…and gets NO microphone (terminal)', (await p.ev(`document.querySelectorAll('.voice-follow').length`)) === 0 && tj && tj.why === 'terminal', tj);
  await p.ev('window.__composer()');
  await p.clickSel('.chat-view textarea');
  await sleep(400);
  const cg = await p.ev(`(() => ({ focused: document.activeElement === document.querySelector('.chat-view textarea'), own: !!document.querySelector('.chat-view .chat-voice-btn'), follow: document.querySelectorAll('.voice-follow').length }))()`);
  ok('the chat composer keeps ITS microphone (placement chat, richer facts) — the follower adds none', cg.focused && cg.own && cg.follow === 0, cg);
  p.close();
}

console.log('③ the press: a popover stays open; blur / removal ⇒ gone; a recording outlives a blur; voice off ⇒ absent');
{
  const p = await page(1280, 860);
  await p.ev('window.__pop()');
  await p.clickSel('.zz-pop-input');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  const d = await dictate(p, '.zz-pop-input', { value: '', caret: 0, answer: 'Renamed' });
  ok('a field inside a createPopover popover: the presses on the follower\'s microphone are no outside press — the popover stays open, the words land', d.landed && (await p.ev(`!!document.querySelector('.zz-follow-pop') && document.querySelector('.zz-follow-pop').isConnected`)), d);
  // blur ⇒ gone
  await p.clickAt(1200, 840);
  ok('a blur (a press elsewhere) ⇒ the microphone is gone', await p.until(`!document.querySelector('.voice-follow')`, 2000));
  // removal while focused ⇒ gone
  await p.ev('window.__dialog()');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  await p.ev(`document.querySelector('.dialog-overlay').remove(), true`);
  ok('the field removed while it holds the focus (a dialog closed by a script) ⇒ the microphone is gone too', await p.until(`!document.querySelector('.voice-follow')`, 2000));
  // a recording outlives a blur and lands in ITS field
  await p.ev('window.__api()');
  await p.clickSel('.chan-api-reject');
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  await p.ev(`(() => { const f = document.querySelector('.chan-api-why'); f.value = 'too wide'; f.setSelectionRange(8, 8); return true; })()`);
  answers.length = 0; answers.push(' — ask first');
  await p.clickSel(MIC);
  await p.until(`!!document.querySelector('.voice-follow .voice-btn.recording')`);
  await p.ev(`(() => { const o = document.createElement('input'); o.className = 'zz-other'; o.style.cssText = 'position:absolute;left:40px;top:40px'; document.getElementById('stage').appendChild(o); o.focus(); return true; })()`);
  await sleep(200);
  const mid = await p.ev(`({ host: !!document.querySelector('.voice-follow .voice-btn.recording'), n: document.querySelectorAll('.voice-follow').length })`);
  await p.clickSel('.voice-follow .voice-btn .voice-time');
  const landed = await p.until(`document.querySelector('.chan-api-why').value === 'too wide — ask first'`);
  ok('a recording outlives a blur: its microphone stays (one), the words land in ITS field (unfocused: a range edit)', mid.host && mid.n === 1 && landed, { mid, value: await p.ev(`document.querySelector('.chan-api-why').value`) });
  ok('…then the microphone follows the field that holds the focus now', await p.until(`(() => { const h = document.querySelector('.voice-follow:not([hidden])'); const o = document.querySelector('.zz-other'); if (!h || !o) return false; const a = h.getBoundingClientRect(), b = o.getBoundingClientRect(); return Math.abs(a.right - b.right) < 60 || Math.abs(a.left - b.right) < 60; })()`, 3000));
  // voice input off ⇒ absent
  await p.ev(`window.__notePlugins([{ id: 'voice-input', enabled: false }]), true`);
  await p.ev('window.__email()');
  await p.clickSel('.zz-email');
  await sleep(300);
  ok('voice input off (the plugins-updated broadcast) ⇒ the follower\'s microphone is ABSENT (not greyed)', await p.ev(`[...document.querySelectorAll('.voice-follow')].every((h) => getComputedStyle(h).display === 'none')`));
  await p.ev(`window.__notePlugins([{ id: 'voice-input', enabled: true }]), true`);
  ok('…and back with the broadcast', await p.until(`!!document.querySelector('.voice-follow') && getComputedStyle(document.querySelector('.voice-follow')).display !== 'none'`, 2000));
  ok('no page error on the press legs', (await p.ev('window.__errs')).length === 0, await p.ev('window.__errs'));
  p.close();
  // MUTANT: the window-capture guard removed ⇒ the press on the microphone is the popover's outside press
  const m = await page(1280, 860, { b: 'mutant' });
  await m.ev('window.__pop()');
  await m.clickSel('.zz-pop-input');
  await m.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  await m.clickSel(MIC);
  await sleep(300);
  ok('MUTANT (the press guard removed): the same press closes the popover — the guard is what keeps it', await m.ev(`!document.querySelector('.zz-follow-pop')`));
  m.close();
}

console.log('④ phone (touch) — a tap on the reject box: a 40-px microphone outside the field, in the view, clear of the keyboard-yield strip; a tap on it keeps the focus');
for (const [w, h] of [[390, 844], [375, 812]]) {
  const p = await page(w, h, { touch: true });
  await p.ev(`window.__outbox('The quarterly numbers are in — shall I post them to the product room?')`);
  await p.tapSel('.chan-prop [data-reject]');
  const rj = '.chan-prop-rejectbox input.chan-opt-input';
  await p.until(`document.activeElement === document.querySelector(${JSON.stringify(rj)})`);
  // the keyboard-yield strip (the chat's "your keys come here" line) right above the box
  await p.ev(`(() => { const s = document.createElement('div'); s.className = 'chat-kbd-yield'; s.textContent = '你在给 agent 打字（浏览器仍由你驾驶）'; document.querySelector('.chan-prop-rejectbox').before(s); return true; })()`);
  await p.tapSel(rj);
  await p.until(`!!document.querySelector(${JSON.stringify(MIC)})`, 3000);
  await sleep(150);
  const g = await geo(p, rj);
  const strip = await p.ev(`(() => { const m = document.querySelector('.voice-follow').getBoundingClientRect(), s = document.querySelector('.chat-kbd-yield').getBoundingClientRect(); return { over: m.left < s.right && s.left < m.right && m.top < s.bottom && s.top < m.bottom }; })()`);
  ok(`${w}×${h}: a TAP on the reject box ⇒ a microphone ≥ 40×40, outside the field, inside the view, on top`, g.mic && g.w >= 40 && g.h >= 40 && !g.overField && g.inView && g.onTop && g.focused, g);
  ok(`${w}×${h}: …never over the keyboard-yield strip`, strip.over === false, { strip, side: g.side });
  const d = await dictate(p, rj);
  ok(`${w}×${h}: a TAP on it records, a tap stops — the box keeps the focus (the keyboard stays), the words at the caret, nothing sent`, d.recording && d.focusRec && d.landed && d.focused && noBlur(d) && routes.length === 0, d);
  const ch = await p.ev(`(() => { const c = document.querySelector('.voice-chip-float:not(.hidden)'), f = document.querySelector(${JSON.stringify(rj)}); if (!c) return null; const b = c.getBoundingClientRect(), r = f.getBoundingClientRect(); return { over: b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom, inView: b.top >= 0 && b.bottom <= innerHeight, side: document.querySelector('.voice-follow').dataset.side }; })()`);
  ok(`${w}×${h}: …its 已插入 · 撤销 chip never lies over the words it just wrote (the far side of the microphone)`, !!ch && ch.over === false && ch.inView, ch);
  await p.shot(`follow-phone-${w}.png`, '.chan-prop');
  // the owner's 「编辑」 on the phone: the Outbox Edit… box keeps its OWN microphone (voiceField), ≥ 40×40, inside the box
  await p.tapSel('.chan-prop [data-edit]');
  await p.until(`!!document.querySelector('.chan-prop-edit')`);
  const eg = await p.ev(`(() => { const f = document.querySelector('.chan-prop-edit'), b = f.parentElement.querySelector(':scope > .voice-btn'); if (!b) return null; const q = b.getBoundingClientRect(), r = f.getBoundingClientRect(); return { w: q.width, h: q.height, inBox: q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1, follow: document.querySelectorAll('.voice-follow:not([hidden])').length }; })()`);
  ok(`${w}×${h}: the Outbox Edit… box (the owner's 「编辑」) has its own microphone on the phone — ≥ 40×40 inside the box, no second one`, !!eg && eg.w >= 40 && eg.h >= 40 && eg.inBox && eg.follow === 0, eg);
  ok(`${w}×${h}: no page error`, (await p.ev('window.__errs')).length === 0, await p.ev('window.__errs'));
  p.close();
}

console.log('⑤ RED CONTROL = the base\'s shape (the follower unexported in a patched copy): the same reject box has NO microphone');
{
  const p = await page(1280, 860, { b: 'base' });
  ok('the control bundle has no followFocus (voice-input.base-shape.js: today\'s file, the follower unexported)', p.started === 'absent', p.started);
  await p.ev(`window.__outbox('The quarterly numbers are in — shall I post them to the product room?')`);
  await p.clickSel('.chan-prop [data-reject]');
  await p.until(`document.activeElement === document.querySelector('.chan-prop-rejectbox input')`);
  await sleep(800);
  const base = await p.ev(`(() => { const f = document.querySelector('.chan-prop-rejectbox input'), r = f.getBoundingClientRect(); const near = [...document.querySelectorAll('.chat-voice-btn')].filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && Math.abs(q.top - r.top) < 80; }).length; return { focused: document.activeElement === f, mics: near }; })()`);
  ok('BASE SHAPE: the focused reject box has no microphone at all — the check ① proves is RED without the follower', base.focused && base.mics === 0, base);
  p.close();
}

console.log('⑥ THE CENSUS (scripts/test-voice-focus.mjs, grep-derived) — and the boxes rendered here judged at run time as their sites were');
{
  const C = census(libFiles(REPO), appCss(REPO));
  const by = {};
  for (const r of C) (by[r.verdict.why] = by[r.verdict.why] || []).push(r);
  console.log(`    ${C.length} sites: ${Object.entries(by).map(([w, rs]) => `${w} ${rs.length}`).join(' · ')}`);
  for (const w of ['secret', 'terminal', 'disabled', 'read-only', 'opted-out', 'hidden']) for (const r of by[w] || []) console.log(`      ${rowText(r)}`);
  const pairs = Object.entries(judged).map(([k, rt]) => {
    const [file, name] = k.split(' ');
    const rows = C.filter((r) => r.file === file && r.name === name && (name !== 'input' || r.tag === 'input'));
    return { k, runtime: rt && rt.why, census: [...new Set(rows.map((r) => r.verdict.why))].join('|') || 'NO SITE' };
  });
  ok(pairs.length >= 8 && pairs.every((x) => x.runtime === x.census), `every box rendered here is judged at run time as the census judged its site (${pairs.map((x) => `${x.k}: ${x.runtime}`).join(' · ')})`, pairs);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
