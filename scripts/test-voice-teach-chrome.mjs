#!/usr/bin/env node
// test-voice-teach-chrome — Dropline voice input P1 (design q-029 D4 + §4 + §8 owner rulings; lane voice-p1-oauth-teach)
// in a real Chrome on a NON-loopback https origin (https://hub.test, a scratch self-signed certificate): the REAL plugin
// card (src/lib/voice-plugin-card.js + voice-teach-ui.js) and the REAL ChatInput microphone over the REAL hub routes
// (src/routes/voice.js, the landing route of src/routes/channels.js through oauth-doors), the real vendor module, Connect
// machine and teach engine — against a FAKE authorization server + FAKE Dropline (no real call to fish.audio ever).
//   ① Connect with Fish Audio ⇒ the consent page in a NEW TAB (Allow + the mailed 6-digit code) ⇒ the hub's own
//     https callback ⇒ the card says 已连接：Ana · Fish Lab
//   ② teach OFF (the default) ⇒ a full dictation writes NOTHING (only /v1/dictate)
//   ③ teach ON ⇒ a proposal card of word chips (+ a For-you item); select two, 加入所选 ⇒ ONE POST /v1/terms with exactly those two
//   ④ 忽略 ⇒ no write
//   ⑤ the context switch ⇒ the first dictation opens the PREVIEW; 发送 ⇒ ONE POST /v1/context with the previewed text
//   ⑥ the per-project tier ⇒ a later identifier goes without a card and lands in the journal
//   ⑦ phone 390
//   ⑧ RETIRED (int263 seam c3): the polished card body it judged was deleted by plugin-settings-p0 (the Plugins list row)
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → connect, proposal, preview, journal, phone
//   (card-fold / card-key / card-phone retired with ⑧)
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratchDir, ONBOARDED_SOURCE } from './scratch.mjs';
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
const root = scratchDir('voiceteach');
const SHOTS = process.env.VIBESPACE_VOICE_PNG_DIR || root;
let chrome = null, hubSrv = null, vendor = null;
const end = (code) => { try { chrome && chrome.kill('SIGKILL'); } catch { } try { hubSrv && hubSrv.close(); vendor && vendor.close(); } catch { } process.exit(code); };
// the suite's own clock (scripts/suite-watchdog.mjs, the two-clock rule): its 300 s ceiling, before the gate's budget — it names
// the leg it was in, the CDP calls nobody answered, and the gate's digest (it was `✗ TIMEOUT (300 s)` and nothing else)
const CDP_PENDS = new Set();
armWatchdog({ capMs: 300e3, exit: end, pending: () => [...CDP_PENDS].flatMap((m) => [...m.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`)) });

// ── the scratch certificate for hub.test (an https origin that is NOT loopback by name) ──
const cert = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(root, 'key.pem'), '-out', path.join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=hub.test', '-addext', 'subjectAltName=DNS:hub.test'], { encoding: 'utf8' });
if (cert.status !== 0) { console.log('SKIP: openssl could not mint a scratch certificate: ' + String(cert.stderr || cert.error).slice(-300)); end(0); }

// ── the FAKE authorization server + FAKE Dropline ──
const calls = [];          // every /v1/* call: {m, p, body, auth}
const fake = { clients: new Map(), pending: new Map(), codes: new Map(), access: new Set(), n: 0 };
const read = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); });
vendor = http.createServer(async (req, res) => {
  const body = await read(req);
  const u = new URL(req.url, 'http://x');
  const json = (st, o) => res.writeHead(st, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  if (u.pathname === '/oauth/register') { const j = JSON.parse(body); const id = `cid_chrome_${++fake.n}`; fake.clients.set(id, j.redirect_uris); return json(201, { client_id: id, token_endpoint_auth_method: 'none' }); }
  if (u.pathname === '/oauth/authorize') {
    const q = Object.fromEntries(u.searchParams);
    if (q.code_challenge_method !== 'S256' || q.scope !== 'dropline:api' || q.resource !== 'https://api.dropline.fish.audio' || !(fake.clients.get(q.client_id) || []).includes(q.redirect_uri)) return json(400, { error: 'invalid_request' });
    const rid = 'req' + (++fake.n); fake.pending.set(rid, q);
    return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>Fish Audio</title><body style="font:16px system-ui;margin:2em">
<h2>VibeSpace wants to use your Dropline</h2><p>Not made by Fish Audio · redirect ${new URL(q.redirect_uri).host}</p>
<button id="allow" onclick="document.getElementById('otp').hidden=false;this.hidden=true">Allow</button>
<form id="otp" hidden action="/oauth/approve"><p>Verify it's you — we mailed a 6-digit code</p><input name="code" id="code"><input type="hidden" name="rid" value="${rid}"><button id="continue">Continue</button></form></body>`);
  }
  if (u.pathname === '/oauth/approve') {
    const q = fake.pending.get(u.searchParams.get('rid'));
    if (!q || u.searchParams.get('code') !== '314159') return res.writeHead(400).end('wrong code');
    const code = 'code_' + (++fake.n); fake.codes.set(code, q);
    return res.writeHead(302, { Location: `${q.redirect_uri}?code=${code}&iss=https%3A%2F%2Ffish.audio&state=${encodeURIComponent(q.state)}` }).end();
  }
  if (u.pathname === '/oauth/token') {
    const f = Object.fromEntries(new URLSearchParams(body));
    const q = fake.codes.get(f.code);
    const crypto = require('node:crypto');
    if (f.grant_type !== 'authorization_code' || !q || q.used || crypto.createHash('sha256').update(f.code_verifier || '').digest('base64url') !== q.code_challenge) return json(400, { error: 'invalid_grant' });
    q.used = true;
    const at = 'at_chrome_' + fake.n; fake.access.add(at);
    return json(200, { access_token: at, refresh_token: 'rt_chrome_' + fake.n, expires_in: 86400, token_type: 'Bearer' });
  }
  if (u.pathname.startsWith('/v1/')) {
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    calls.push({ m: req.method, p: u.pathname, body: req.headers['content-type'] === 'application/json' ? JSON.parse(body || 'null') : null, auth: tok });
    if (!fake.access.has(tok)) return json(401, { error: { code: 'unauthorized' } });
    if (u.pathname === '/v1/me') return json(200, { user: { id: 'u1', email: 'ana@example.test', name: 'Ana' }, team: { id: 't1', name: 'Fish Lab' }, request_id: 'r' });
    if (u.pathname === '/v1/vocabulary') return json(200, { terms: [{ term: 'VibeSpace', aliases: [], section: 'auto' }], version: 1 });
    if (u.pathname === '/v1/terms') { const t = (JSON.parse(body).terms || []).map((x) => x.term); return json(200, { added: t, skipped: [], dictionary_version: 2 }); }
    if (u.pathname === '/v1/context') return json(200, { ok: true, request_id: 'cx' });
    if (u.pathname === '/v1/dictate') return json(200, { request_id: 'd' + calls.length, mode: 'dictate', final_text: 'DICTATED', transcript: { text: 'dictated', language: 'en' }, rewrite: { status: 'used' } });
  }
  json(404, { error: 'nope' });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));
const FAKE = `http://127.0.0.1:${vendor.address().port}`;

// ── the hub (https://hub.test:PORT): real routes, client, Connect machine, teach engine; a fake store + plugin record ──
const express = require(path.join(REPO, 'node_modules/express'));
const PORT = await freePort();
const HUB = `https://hub.test:${PORT}`;
const row = {};
const store = { resolveIntegration: () => ({ source: Object.keys(row).length ? 'user' : 'none', values: { ...row } }), presetsFor: () => [], setIntegration: (id, v) => Object.assign(row, v) };
const rec = { enabled: true, config: { language: 'auto' } };
const items = [];
const userTodos = { add: (k, it) => { const x = { id: 'ut' + items.length, sessionKey: k, status: 'open', ...it }; items.push(x); return x; }, get: (id) => items.find((x) => x.id === id), setStatus: (id, s) => { const x = items.find((i) => i.id === id); if (x) x.status = s; }, onStatus() { } };
const quiet = { log() { }, warn() { } };
const DO = require(path.join(REPO, 'src/server/dropline-oauth.js'));
const tokens = DO.tokenFile(path.join(root, 'data', 'dropline-oauth.json'));
let teach = null;
const client = require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => store, pluginOn: () => rec.enabled, tokens, base: FAKE, oauthBase: FAKE, authorizeUrl: `${FAKE}/oauth/authorize`, teachCap: (k) => teach.capOk(k), log: quiet });
const oauth = DO.create({ client, flows: require(path.join(REPO, 'src/oauth-loopback.js')).createOAuthLoopback({ log: quiet }), integrations: () => store, instanceUrl: () => HUB, tokens, log: quiet });
require(path.join(REPO, 'src/server/oauth-doors.js')).register('dropline', { landing: oauth.landing, page: oauth.page });
// lane plugin-settings-p0: the teach / context switches are SETTINGS rows — this harness's settings store is rec.config
teach = require(path.join(REPO, 'src/server/voice-teach-engine.js')).create({ client, plugin: { peek: () => rec, update: (fn) => fn(rec), settings: () => rec.config || {}, writeSettings: (p) => { rec.config = { ...(rec.config || {}), ...p }; } }, userTodos, log: quiet });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { renderVoiceSheet } from ${JSON.stringify(path.join(REPO, 'src/lib/voice-plugin-card.js'))};
const ws = { send() {}, on() {}, off() {}, onMessage() {}, isConnected: () => true };
window.__cwd = '/home/u/projects/vibespace';
window.__facts = { conv: 'conv-0', title: 'Doc comments', messages: [
  { role: 'user', content: [{ type: 'text', text: 'Please fix commentsBatches in doc-window-ui.js and voice-teach.js' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Done — dictationContext and termsOf now live in voice-model.js.' }] },
] };
window.__render = async () => {
  const card = document.getElementById('card');
  const st = await (await fetch('/api/voice/status')).json();
  card.innerHTML = '';
  renderVoiceSheet(card, () => window.__render()); // the Plugins list's Voice chip sheet (lane plugin-settings-p0)
  return true;
};
window.__set = (patch) => fetch('/api/voice/teach/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then((r) => r.ok); // the settings rows' door (All Settings writes the same rows)
window.__mount = () => {
  const ci = new ChatInput(ws, 'sess-teach', { onSend() {}, onInterrupt() {}, getCwd: () => window.__cwd, getHost: () => null, getUploadDir: () => '',
    isTouch: () => window.innerWidth < 600, getTouchEnterSends: () => false, getEnterSends: () => true, getVoiceFacts: () => window.__facts, openPlugins: () => {} });
  document.getElementById('frame').appendChild(ci.element);
  return window.__render();
};`;
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client, prefs: () => rec, oauth, teach, log: quiet }));
const chan = require(path.join(REPO, 'src/routes/channels.js')); chan.setup({}); app.use(chan.router);
// the key tier's two doors (the integrations routes in the product): Save writes the store row, Test = ONE GET /v1/me
app.put('/api/integrations/dropline', (q, s) => { store.setIntegration('dropline', q.body.values); fake.access.add(q.body.values.apiKey); s.json({ ok: true }); }); // the fake knows the key
app.post('/api/integrations/dropline/test', async (q, s) => {
  const me = await fetch(`${FAKE}/v1/me`, { headers: { Authorization: `Bearer ${row.apiKey}` } }).then((r) => r.json()).catch(() => null);
  s.json(me && me.user ? { ok: true, detail: `${me.user.name} · ${me.team.name}` } : { ok: false, error: 'no answer' });
});
const CSS = ['style', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root,#fff);font-family:system-ui} #card{padding:12px;max-width:640px;position:relative;z-index:5;background:var(--bg-root,#fff)} #frame{position:relative;margin-top:12px;min-height:120px}</style></head><body><div id="card" class="plugin-card"></div><div id="frame" class="chat-view"></div><script src="/page.js"></script></body></html>`));
hubSrv = https.createServer({ key: fs.readFileSync(path.join(root, 'key.pem')), cert: fs.readFileSync(path.join(root, 'cert.pem')) }, app);
await new Promise((r) => hubSrv.listen(PORT, '127.0.0.1', r));

// ── Chrome: scratch profile, private HOME / XDG_RUNTIME_DIR, headless; hub.test → 127.0.0.1 over TLS ──
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', '--ignore-certificate-errors', '--disable-popup-blocking', '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP hub.test 127.0.0.1', `--user-data-dir=${path.join(root, 'chrome-profile')}`, 'about:blank'], { env: cenv, stdio: 'ignore' });
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const FAKE_MIC = `(() => {
  const gum = async () => { const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gum;
  class FakeRecorder extends EventTarget {
    constructor(stream, opts) { super(); this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm;codecs=opus'; this.state = 'inactive'; }
    static isTypeSupported(t) { return /webm/.test(t); }
    start() { this.state = 'recording'; }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['OPUS-FAKE '.repeat(40)], { type: this.mimeType }) }); this.onstop && this.onstop(); }, 20); }
  }
  window.MediaRecorder = FakeRecorder;
})();`;
async function attach(wsUrl, w = 1280, h = 860) {
  const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); CDP_PENDS.add(pend);
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id).r(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, { r, method, at: Date.now() }); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
  const until = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(80); } return false; };
  const mouse = (type, x, y) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const clickSel = async (sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    if (!r) throw new Error('no element ' + sel);
    // a toast can sit over the target (bottom of the page): wait until the point reaches the element itself
    await until(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const h = document.elementFromPoint(${r[0]}, ${r[1]}); return !!e && !!h && (e === h || e.contains(h) || h.contains(e)); })()`, 8000);
    await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1]); await mouse('mouseReleased', r[0], r[1]);
  };
  const shot = async (file, sel = '#card') => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await ev(`(() => { window.scrollTo(0, 0); const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0]), y: Math.max(0, r[1]), width: Math.min(w, Math.max(1, r[2])), height: Math.min(4000, Math.max(1, r[3])), scale: 1 }, captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, clickSel, shot, close: () => { CDP_PENDS.delete(pend); ws.close(); } };
}
async function page(w, h) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const p = await attach(tg.webSocketDebuggerUrl, w, h);
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && e.reason.stack || e.reason))); ${FAKE_MIC}` });
  await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await p.cdp('Page.navigate', { url: `${HUB}/` });
  for (let i = 0; i < 100 && !(await p.ev('typeof window.__mount === "function"').catch(() => false)); i++) await sleep(100);
  await p.ev('window.__mount()');
  return p;
}
const MIC = '#frame .chat-voice-btn';
const TA = `document.querySelector('#frame textarea')`;
const writes = () => calls.filter((c) => c.p === '/v1/terms' || c.p === '/v1/context');
async function dictate(p, conv, messages = null) {
  await p.ev(`(() => { window.__facts.conv = ${JSON.stringify(conv)}; ${messages ? `window.__facts.messages = ${JSON.stringify(messages)};` : ''} ${TA}.value = ''; ${TA}.focus(); return true; })()`);
  const n = calls.filter((c) => c.p === '/v1/dictate').length;
  await p.until(`document.querySelector(${JSON.stringify(MIC)}).offsetWidth > 0`, 5000); // lane voice-everywhere: the mic shows once /api/voice/status said on
  await p.clickSel(MIC);
  if (!(await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`))) throw new Error('the mic did not record: ' + JSON.stringify(await p.ev(`({ cls: document.querySelector(${JSON.stringify(MIC)}).className, chip: (document.querySelector('#frame .voice-chip')||{}).textContent, errs: window.__errs, top: (() => { const b = document.querySelector(${JSON.stringify(MIC)}).getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return h && (h.className || h.tagName); })() })`)));
  await sleep(300);
  await p.clickSel(`${MIC} .voice-time`);
  const inserted = await p.until(`${TA}.value.includes('DICTATED')`);
  await sleep(700);   // the teach POST (when on) follows the insertion
  return inserted && calls.filter((c) => c.p === '/v1/dictate').length === n + 1;
}
const rerender = async (p, sel) => { await p.ev('window.__render()'); return sel ? p.until(`!!document.querySelector(${JSON.stringify(sel)})`) : true; };

try {
  console.log('① Connect with Fish Audio — a new tab, Allow + the mailed code, the hub\'s own https callback');
  const p = await page(1280, 860);
  ok('the page is a secure, non-loopback origin (https://hub.test) and the card offers Connect (no key yet)', await p.ev('window.isSecureContext && location.hostname === "hub.test"') && await p.until('!!document.querySelector(".voice-connect")'));
  await p.clickSel('.voice-connect');
  let tab = null;
  for (let i = 0; i < 80 && !tab; i++) { await sleep(150); tab = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('/oauth/authorize')); }
  ok('Connect opened the consent page in a NEW TAB (S256 + scope + resource accepted by the fake)', !!tab && /code_challenge_method=S256/.test(tab.url) && /scope=dropline%3Aapi/.test(tab.url), tab ? tab.url : { errs: await p.ev('window.__errs'), words: await p.ev('(document.querySelector(".voice-account-words")||{}).textContent'), btn: await p.ev('(() => { const b = document.querySelector(".voice-connect").getBoundingClientRect(); return [b.left, b.top, b.width, b.height, document.elementFromPoint(b.left + b.width/2, b.top + b.height/2).className]; })()'), targets: (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).map((x) => x.type + ' ' + x.url.slice(0, 120)) });
  if (!tab) throw new Error('no consent tab');
  const t = await attach(tab.webSocketDebuggerUrl);
  await t.until('!!document.getElementById("allow")');
  await t.clickSel('#allow');
  await t.ev('document.getElementById("code").value = "314159"');
  await t.clickSel('#continue');
  const landed = await t.until('location.pathname === "/api/channels/oauth/cb/dropline" && !!document.getElementById("connected")', 10000);
  ok('the person finished consent + the 6-digit code in that tab ⇒ landed on https://hub.test/api/channels/oauth/cb/dropline: connected', landed, await t.ev('location.href').catch(() => null));
  t.close();
  const connected = await p.until('(document.querySelector(".voice-account-words")||{}).textContent === "已连接：Ana · Fish Lab"', 12000);
  ok('the card says 已连接：Ana · Fish Lab with 断开 (GET /v1/me with the OAuth token)', connected && await p.ev('!!document.querySelector(".voice-disconnect")') && calls.some((c) => c.p === '/v1/me' && /^at_chrome_/.test(c.auth)), await p.ev('document.querySelector("#card").innerText.slice(0, 300)'));
  ok('the client_id was registered once and written to the row; the pair is on the hub only', /^cid_chrome_/.test(row.clientId || '') && !!tokens.read().access && !(await p.ev('document.documentElement.outerHTML')).includes(tokens.read().access));
  await p.until('!!document.querySelector(".voice-teach")');
  await p.shot('connect.png');

  console.log('② teach OFF (default) ⇒ a full dictation writes nothing');
  const before = calls.length;
  ok('teach and context are OFF by default (settings rows; the sheet says where to turn teaching on)', await p.ev('!!document.querySelector(".voice-teach-off")') && !(rec.config && (rec.config.teach || rec.config.context)));
  const d0 = await dictate(p, 'conv-0');
  ok('a full dictation with teach OFF ⇒ ONLY /v1/dictate reached Dropline (no vocabulary, no terms, no context)', d0 && calls.slice(before).every((c) => c.p === '/v1/dictate') && calls.slice(before).length === 1, calls.slice(before).map((c) => c.p));

  console.log('③ teach ON ⇒ a proposal of chips; select two, 加入所选 ⇒ ONE POST /v1/terms with exactly those two');
  await p.ev('window.__set({ teach: true })');
  await p.ev('window.__render()'); await p.until('!document.querySelector(".voice-teach-off") && !!document.querySelector(".voice-teach-why")');
  ok('the teach section carries the privacy sentence', (await p.ev('document.querySelector(".voice-teach-why").textContent')).startsWith('会把当前对话里的名字、术语与文件名发给 Dropline（Fish Audio）'));
  await dictate(p, 'conv-1');
  const hasCard = await rerender(p, '.voice-proposal');
  const terms = await p.ev('[...document.querySelectorAll(".voice-proposal .voice-term")].map((x) => x.dataset.term)');
  ok('the dictation made a PROPOSAL card (no write) + a For-you item 加入词库 / 忽略', hasCard && terms.includes('commentsBatches') && terms.includes('doc-window-ui.js') && !terms.includes('VibeSpace') && writes().length === 0 && items.length === 1 && items[0].options.join() === '加入词库,忽略', { terms, items, w: writes() });
  await p.shot('proposal.png');
  // the chips (lane voice-teach-candidates): words the person wrote start selected, a press toggles one, the count is live
  const chips = () => p.ev('({ on: [...document.querySelectorAll(".voice-proposal .voice-term")].filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.term), add: document.querySelector(".voice-proposal-add").textContent, off: document.querySelector(".voice-proposal-add").disabled, tag: document.querySelector(".voice-proposal .voice-term").tagName })');
  const c0 = await chips();
  ok('the card is word CHIPS (buttons, no checkbox), the words the person wrote preselected, 加入所选 (3)', c0.tag === 'BUTTON' && c0.on.join() === terms.join() && terms.length === 3 && c0.add === '加入所选 (3)' && !c0.off && !(await p.ev('!!document.querySelector(".voice-proposal-terms input")')), c0);
  await p.clickSel('.voice-proposal .voice-term[data-term="voice-teach.js"]');
  const c1 = await chips();
  ok('a press on a chip unselects it and the count follows: 加入所选 (2)', c1.on.slice().sort().join() === 'commentsBatches,doc-window-ui.js' && c1.add === '加入所选 (2)', c1);
  await p.ev('(() => { for (const x of document.querySelectorAll(".voice-proposal .voice-term[aria-pressed=true]")) x.click(); return true; })()');
  const c2 = await chips();
  ok('nothing selected ⇒ 加入所选 (0) is disabled', !c2.on.length && c2.add === '加入所选 (0)' && c2.off, c2);
  await p.ev('(() => { for (const t of ["commentsBatches", "doc-window-ui.js"]) document.querySelector(`.voice-proposal .voice-term[data-term="${t}"]`).click(); return true; })()');
  await p.clickSel('.voice-proposal-add');
  await p.until('!document.querySelector(".voice-proposal")');
  await sleep(300);
  const w1 = writes();
  ok('加入所选 ⇒ the fake Dropline saw ONE POST /v1/terms with EXACTLY the two selected words', w1.length === 1 && w1[0].p === '/v1/terms' && w1[0].body.terms.map((x) => x.term).sort().join() === 'commentsBatches,doc-window-ui.js' && w1[0].body.terms.length === 2, w1);

  console.log('④ 忽略 ⇒ none');
  await dictate(p, 'conv-2');
  await rerender(p, '.voice-proposal');
  await p.clickSel('.voice-proposal-ignore');
  await p.until('!document.querySelector(".voice-proposal")');
  ok('忽略 ⇒ no write, the card gone', writes().length === 1);

  console.log('⑤ the context switch ⇒ the first-time preview; 发送 ⇒ ONE POST /v1/context with the previewed text');
  await p.ev('window.__set({ context: true })');
  await dictate(p, 'conv-3');
  const dlg = await p.until('!!document.querySelector(".voice-preview")', 8000);
  const shown = dlg ? await p.ev('document.querySelector(".voice-preview-text").textContent') : '';
  ok('the first dictation of a conversation opens the PREVIEW (the exact text; nothing sent yet)', dlg && shown.includes('commentsBatches') && shown.includes('Working directory: vibespace') && !writes().some((c) => c.p === '/v1/context'), shown);
  await p.shot('preview.png', '.voice-preview');
  await p.clickSel('.voice-preview-send');
  await p.until('!document.querySelector(".voice-preview")');
  await sleep(300);
  const cx = writes().filter((c) => c.p === '/v1/context');
  ok('发送 ⇒ ONE POST /v1/context with exactly the previewed text, title + source VibeSpace', cx.length === 1 && cx[0].body.text === shown && cx[0].body.source === 'VibeSpace' && cx[0].body.title === 'Doc comments', cx);

  console.log('⑥ the per-project tier ⇒ a later identifier goes without a card and lands in the journal');
  await p.ev('window.__set({ context: false })');   // ⑤ proved the preview; off now, so no dialog covers the next clicks
  await dictate(p, 'conv-5', [{ role: 'user', content: [{ type: 'text', text: 'rename freshIdentOne in zeta_notes.md' }] }]);   // ④ ignored the earlier words: new ones
  await rerender(p, '.voice-project-auto input');
  await p.clickSel('.voice-project-auto input');
  await p.until('!!document.querySelector(".voice-project-row")');
  const nTerms = writes().filter((c) => c.p === '/v1/terms').length;
  // voice-verify F2 (lane voice-verify-fixes): the per-project tier auto-sends only what a SOURCE names — here an agent
  // code span — and the person's own word (myOwnPlanWord) goes to the card (int260, ruling R1)
  await dictate(p, 'conv-4', [{ role: 'user', content: [{ type: 'text', text: 'now wire myOwnPlanWord into the card' }] }, { role: 'assistant', content: [{ type: 'text', text: 'Wired `brandNewIdent` into the card.' }] }]);
  await rerender(p, '.voice-journal-row');
  const tw = writes().filter((c) => c.p === '/v1/terms');
  const journal = await p.ev('[...document.querySelectorAll(".voice-journal-row")].map((x) => x.textContent)');
  const ownCarded = await p.until('[...document.querySelectorAll(".voice-proposal")].some((c) => c.textContent.includes("myOwnPlanWord"))');
  ok('opted in: brandNewIdent (an agent code span) went WITHOUT a card (one POST, no new proposal), the journal says 词（本项目自动） and the person\'s own myOwnPlanWord is on the card, never auto-sent', ownCarded && !tw.some((x) => x.body.terms.some((y) => y.term === 'myOwnPlanWord')) && tw.length === nTerms + 1 && tw[tw.length - 1].body.terms.map((x) => x.term).join() === 'brandNewIdent' && !(await p.ev('[...document.querySelectorAll(".voice-proposal")].some((c) => c.textContent.includes("brandNewIdent"))')) && journal[0].includes('词（本项目自动）'), { ownCarded, tw: tw.map((x) => x.body), journal });
  ok('the journal lists memory + words rows and the dropline.fish.audio/app link', journal.some((j) => j.includes('记忆')) && await p.ev('document.querySelector(".voice-memory-link").href === "https://dropline.fish.audio/app"'));
  await p.shot('journal.png');
  p.close();

  console.log('⑦ phone 390');
  const ph = await page(390, 844);
  await ph.until('!!document.querySelector(".voice-proposal-add")');
  const geo = await ph.ev(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const a = r('.voice-proposal-add'), card = r('#card'); return { h: a.height, right: a.right, cw: card.right, overflow: document.documentElement.scrollWidth > innerWidth }; })()`);
  ok('phone 390: the proposal buttons are ≥ 36 px tall and nothing overflows sideways', geo.h >= 36 && geo.right <= geo.cw + 1 && !geo.overflow, geo);
  const chipH = await ph.ev('[...document.querySelectorAll(".voice-proposal .voice-term")].map((x) => Math.round(x.getBoundingClientRect().height))');
  ok('phone 390: every word chip is a ≥ 36 px tap target', chipH.length > 0 && chipH.every((h) => h >= 36), chipH);
  await ph.shot('phone.png');
  ph.close();

  // ⑧ (lane voice-card-polish, rel262: the card's header chip + switch, 账号 / 语言 grid, the folded key) RETIRED by int263 seam (c3):
  // plugin-settings-p0 deleted the card body — the Voice row of the Plugins list (chip · switch · ⚙) is judged by
  // test-plugin-settings / test-plugins-grammar, the key lives in Integrations, language + teach are All Settings rows
} catch (e) { fail++; console.log('  ✗ threw: ' + (e && e.stack || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
