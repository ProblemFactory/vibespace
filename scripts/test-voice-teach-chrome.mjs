#!/usr/bin/env node
// test-voice-teach-chrome — Dropline voice input P1 (design q-029 D4 + §4 + §8 owner rulings; lane voice-p1-oauth-teach)
// in a real Chrome on a NON-loopback https origin (https://hub.test, a scratch self-signed certificate): the REAL plugin
// card (src/lib/voice-plugin-card.js + voice-teach-ui.js) and the REAL ChatInput microphone over the REAL hub routes
// (src/routes/voice.js, the landing route of src/routes/channels.js through oauth-doors), the real vendor module, Connect
// machine and teach engine — against a FAKE authorization server + FAKE Dropline (no real call to fish.audio ever).
//   ⓪ THE DOORS (lane dropline-connect-door, a fleet user's report 2026-10-18 — the sign-in existed, nobody could see it):
//     with no key and no sign-in the REAL Plugins list's Voice row chip reads 用 Fish Audio 连接 (a primary verb, its
//     title names the key's place) and opens the sheet; the sheet's ONE line opens the REAL Integrations window on the
//     dropline card; that card draws Connect ABOVE an optional key field and signs in end to end (consent tab ⇒ 已连接),
//     its Test with no key tests the sign-in, Disconnect clears it; two MUTANT bundles (the base's status chip; the card
//     without its block) turn the door probes RED
//   ① Connect with Fish Audio ⇒ the consent page in a NEW TAB (Allow + the mailed 6-digit code) ⇒ the hub's own
//     https callback ⇒ the card says 已连接：Ana · Fish Lab — with the plugin OFF; ①b the Plugins row's switch turns it on
//     after (a person connects first)
//   ② teach OFF (the default) ⇒ a full dictation writes NOTHING (only /v1/dictate)
//   ③ teach ON ⇒ a proposal card of word chips (+ a For-you item); select two, 加入所选 ⇒ ONE POST /v1/terms with exactly those two
//   ④ 忽略 ⇒ no write
//   ⑤ the context switch ⇒ the first dictation opens the PREVIEW; 发送 ⇒ ONE POST /v1/context with the previewed text
//   ⑥ the per-project tier ⇒ a later identifier goes without a card and lands in the journal
//   ⑦ phone 390
//   ⑧ RETIRED (int263 seam c3): the polished card body it judged was deleted by plugin-settings-p0 (the Plugins list row)
//   ⑨ THE FOR-YOU TRAY (lane foryou-plugin-notices, owner 2026-10-19): the REAL tray over the REAL store — the suggestion
//     pinned right under an urgent ask (above a high one); its ✓ says what it does; a click on its BODY opens the plugin's
//     sheet on that suggestion with its words chosen (a MUTANT bundle without the door line stays shut — RED); ✓ ⇒ ONE
//     POST /v1/terms with exactly its words; × ⇒ nothing sent, dismissed, the batch still waits on the sheet
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → door-row, door-sheet, door-card, door-card-connected,
//   connect, proposal, preview, journal, phone, tray, door
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
// lane dropline-connect-door: the person connects FIRST and switches the plugin on after — it starts OFF
const rec = { enabled: false, config: { language: 'auto' } };
const quiet = { log() { }, warn() { }, error() { } };
// lane dropline-connect-door: the REAL integration store (a scratch data dir) behind the REAL integrations routes — the card,
// its Connect block, its Test (the row's runner, registered as the wiring does) and the client_id the first Connect writes
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
// lane foryou-plugin-notices: the REAL For-you store (its gate = the plugin's DECLARED capability) — ⑨ draws the REAL tray over it
const UTM = require(path.join(REPO, 'src/user-todos.js'));
const userTodos = new UTM.UserTodoManager({ dataDir: path.join(root, 'data'), expirySweepMs: 0 });
const VPD = require(path.join(REPO, 'src/plugins/voice-input.js'));
userTodos.setPluginGate((id) => id === VPD.id && VPD.provides.includes('reminders'));
const store = require(path.join(REPO, 'src/server/integration-store.js')).create({ dataDir: path.join(root, 'data'), env: {}, log: quiet });
const rowValues = () => store.resolveIntegration('dropline').values;
const DO = require(path.join(REPO, 'src/server/dropline-oauth.js'));
const tokens = DO.tokenFile(path.join(root, 'data', 'dropline-oauth.json'));
let teach = null;
const client = require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => store, pluginOn: () => rec.enabled, tokens, base: FAKE, oauthBase: FAKE, authorizeUrl: `${FAKE}/oauth/authorize`, teachCap: (k) => teach.capOk(k), log: quiet });
const oauth = DO.create({ client, flows: require(path.join(REPO, 'src/oauth-loopback.js')).createOAuthLoopback({ log: quiet }), integrations: () => store, instanceUrl: () => HUB, tokens, log: quiet });
require(path.join(REPO, 'src/server/oauth-doors.js')).register('dropline', { landing: oauth.landing, page: oauth.page });
store.registerTest('dropline', client.testRunner);
// lane plugin-settings-p0: the teach / context switches are SETTINGS rows — this harness's settings store is rec.config
teach = require(path.join(REPO, 'src/server/voice-teach-engine.js')).create({ client, plugin: { peek: () => rec, update: (fn) => fn(rec), settings: () => rec.config || {}, writeSettings: (p) => { rec.config = { ...(rec.config || {}), ...p }; } }, userTodos, log: quiet });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { renderVoiceSheet } from ${JSON.stringify(path.join(REPO, 'src/lib/voice-plugin-card.js'))};
import { installPluginsUI } from ${JSON.stringify(path.join(REPO, 'src/lib/plugins-ui.js'))};
import { openIntegrationsWindow } from ${JSON.stringify(path.join(REPO, 'src/lib/integrations-window.js'))};
import { installUserTodos } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-panel.js'))};
// lane dropline-connect-door: the REAL Plugins list + Integrations window on a fake App (a one-window manager, a silent ws)
function App() { }
installPluginsUI(App);
App.prototype.openIntegration = function (id, opts) { return openIntegrationsWindow(this, { focus: id || null, ...(opts || {}) }); }; // = app.js
const app = new App();
app.wm = { windows: new Map(), revealWindow() { }, createWindow(o) { const content = document.createElement('div'); document.getElementById('win').replaceChildren(content); const w = { id: 'w' + (this.windows.size + 1), type: o.type, content }; this.windows.set(w.id, w); return w; } };
window.__wsFns = [];
app.ws = { onGlobal: (fn) => { if (typeof fn === 'function') window.__wsFns.push(fn); return () => { }; }, onStateChange() { } };
window.__app = app;
// lane foryou-plugin-notices (⑨): THE For-you tray (src/lib/user-todos-panel.js) on this fake App — its button, popup and the
// store's snapshot pushed as the server's broadcast would
window.__tray = () => {
  document.body.insertAdjacentHTML('beforeend', '<button id="mobile-nav-todos" style="display:none"></button><div class="taskbar" style="position:fixed;bottom:0;right:0;left:0;height:30px;z-index:6"><div id="taskbar-user-todos" class="taskbar-user-todos"></div></div><div id="user-todos-popup" class="usage-popup ut-popup hidden"></div>');
  app.sidebar = { _webuiSessions: [], _sessionStatuses: {}, _tasks: [] }; app.sessions = new Map();
  installUserTodos(app);
  return true;
};
window.__pushTodos = async () => { const d = await (await fetch('/api/user-todos')).json(); for (const fn of window.__wsFns) fn({ type: 'user-todos-updated', todos: d.todos }); return d.todos.open.length; };
window.__plugins = () => app.openPluginsDialog({ container: document.getElementById('plugins') });
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
// MUTANTS (lane dropline-connect-door): the same bundle with ONE door hidden, patched at bundle time — each anchor must
// occur exactly once (else the control proves nothing); the door probes below must go RED on each
const MUTANTS = {
  m1: ['src/lib/plugins-ui.js', "chip = !p.configured ? t('Connect with Fish Audio') :", "chip = !p.configured ? t('no Dropline key yet') :"],   // the base's status chip
  m2: ['src/lib/integrations-window.js', '  if (v.connect) {\n    const box = el(', '  if (false) {\n    const box = el('],                    // the card without its block
  m3: ['src/lib/user-todos-actions.js', "    if (item?.open?.kind === 'plugin-settings') { close(); app.openPluginDoor?.(item.open); return; }\n", ''],   // lane foryou-plugin-notices: the tray without the door
};
const mutantOnce = {};
async function bundle(out, mut = null) {
  const plugins = mut ? [{ name: 'mutant', setup(b) {
    const file = path.join(REPO, mut[0]);
    b.onLoad({ filter: /\.js$/ }, (a) => {
      if (a.path !== file) return undefined;
      const src = fs.readFileSync(a.path, 'utf8');
      mutantOnce[mut[0]] = src.split(mut[1]).length === 2;
      return { contents: src.replace(mut[1], mut[2]), loader: 'js', resolveDir: path.dirname(a.path) };
    });
  } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, out), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('page.js');
for (const [k, m] of Object.entries(MUTANTS)) await bundle(`page-${k}.js`, m);
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client, prefs: () => rec, oauth, teach, log: quiet }));
const chan = require(path.join(REPO, 'src/routes/channels.js')); chan.setup({}); app.use(chan.router);
// lane dropline-connect-door: the REAL integrations routes over the real store (the window's list, the card, its Test)
const IR = require(path.join(REPO, 'src/routes/integrations.js')); IR.setup({ getStore: () => store }); app.use(IR.router);
// the Plugins list's one row this suite needs: the voice plugin as src/plugins/voice-input.js states it (configured = a key OR
// the sign-in; enabled only once configured) + its switch, refused until configured like the plugin's own start verb
const VP = require(path.join(REPO, 'src/plugins/voice-input.js'));
const voiceRow = () => { const configured = client.connected(); return { id: VP.id, label: VP.label, description: VP.description, provides: VP.provides, installed: true, configured, enabled: !!rec.enabled && configured, running: !!rec.enabled && configured, integration: 'dropline' }; };
app.get('/api/plugins', (q, s) => s.json({ plugins: [voiceRow()] }));
app.get('/api/plugins/manifests', (q, s) => s.json({ plugins: [] }));
// lane foryou-plugin-notices: the For-you routes the tray uses — the snapshot, 「全部标为已看」 (the real route) and a row's ✓ / ×
// (server.js's one-line route, the same call)
app.get('/api/user-todos', (q, s) => s.json({ todos: userTodos.snapshot() }));
require(path.join(REPO, 'src/routes/user-todos-reply.js')).registerResolveManyRoute(app, { userTodos });
app.post('/api/user-todos/:id', (q, s) => { try { s.json({ success: true, item: userTodos.setStatus(q.params.id, q.body?.status, 'user') }); } catch (e) { s.status(400).json({ error: e.message }); } });
app.post(`/api/plugins/${VP.id}/enabled`, (q, s) => { if (q.body.enabled && !client.connected()) return s.status(400).json({ error: 'connect your Fish Audio account or paste your Dropline key first' }); rec.enabled = !!q.body.enabled; s.json({ ok: true }); });
const CSS = ['style', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get(/^\/page(-m\d)?\.js$/, (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, path.basename(q.path)))));
app.get('/', (q, s) => s.type('text/html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root,#fff);font-family:system-ui} #card{padding:12px;max-width:640px;position:relative;z-index:5;background:var(--bg-root,#fff)} #frame{position:relative;margin-top:12px;min-height:120px}</style></head><body><div id="card" class="plugin-card"></div><div id="frame" class="chat-view"></div><div id="side" style="position:absolute;left:660px;top:0;width:600px;height:850px;overflow:auto;background:var(--bg-root,#fff)"><div id="plugins" style="padding:8px"></div><div id="win"></div></div><script src="/page${/^m\d$/.test(String(q.query.b || '')) ? '-' + q.query.b : ''}.js"></script></body></html>`));
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
async function page(w, h, b = '') {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const p = await attach(tg.webSocketDebuggerUrl, w, h);
  p.targetId = tg.id;
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason && e.reason.stack || e.reason))); ${FAKE_MIC}` });
  await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await p.cdp('Page.navigate', { url: `${HUB}/${b ? '?b=' + b : ''}` });
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
// the consent the person does in the NEW TAB a Connect opened (Allow + the mailed code) ⇒ the hub's own https callback
async function consent(back) {
  let tab = null;
  for (let i = 0; i < 80 && !tab; i++) { await sleep(150); tab = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('/oauth/authorize')); }
  if (!tab) return { tab: null, landed: false };
  const t = await attach(tab.webSocketDebuggerUrl);
  await t.until('!!document.getElementById("allow")');
  await t.clickSel('#allow');
  await t.ev('document.getElementById("code").value = "314159"');
  await t.clickSel('#continue');
  const landed = await t.until('location.pathname === "/api/channels/oauth/cb/dropline" && !!document.getElementById("connected")', 10000);
  const href = await t.ev('location.href').catch(() => null);
  t.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => null);
  await back.cdp('Page.bringToFront');   // a background tab paints no frames: its screenshots waited minutes (measured)
  return { tab: tab.url, landed, href };
}
// lane dropline-connect-door: THE DOOR PROBES — the same two run on the real bundle (GREEN) and on each mutant (RED)
const ROW = '#plugins .plugin-row[data-plugin="voice-input"]';
const CARD = '.integ-card[data-integ="dropline"]';
async function rowDoor(pg) {
  await pg.ev('window.__plugins()');
  await pg.until(`!!document.querySelector('${ROW} .plugin-chip')`, 6000);
  return pg.ev(`(() => { const r = document.querySelector('${ROW}'); const c = r && r.querySelector('.plugin-chip'); const sw = r && r.querySelector('.plugin-sw input'); return c ? { tag: c.tagName, text: c.textContent, cls: c.className, title: c.title, swOff: !!sw && sw.disabled && !sw.checked } : null; })()`);
}
const isRowDoor = (c) => !!c && c.tag === 'BUTTON' && c.text === '用 Fish Audio 连接' && /plugin-chip-primary/.test(c.cls);
async function cardDoor(pg) {
  await pg.ev(`(window.__app.openIntegration('dropline'), true)`);
  await pg.until(`!!document.querySelector('${CARD} .integ-fields .integ-field')`, 6000);
  await pg.until(`!!document.querySelector('${CARD} .integ-connect .oauth-connect-btn')`, 3000);
  return pg.ev(`(() => { const c = document.querySelector('${CARD}'); if (!c) return null; const b = c.querySelector('.integ-connect .oauth-connect-btn'), f = c.querySelector('.integ-fields'), box = c.querySelector('.integ-connect'); return { btn: b ? b.textContent : null, above: !!box && !!f && !!(box.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING), why: (c.querySelector('.integ-connect .oauth-connect-words') || {}).textContent || '' }; })()`);
}
const isCardDoor = (d) => !!d && d.btn === '用 Fish Audio 连接' && d.above;

try {
  console.log('⓪ the doors (no key, no sign-in): the Plugins row\'s chip, the sheet\'s line to the key card, the card\'s own Connect');
  const p = await page(1280, 860);
  ok('the page is a secure, non-loopback origin (https://hub.test); the plugin is OFF and nothing is connected', await p.ev('window.isSecureContext && location.hostname === "hub.test"') && rec.enabled === false && !client.connected());
  const chip0 = await rowDoor(p);
  ok('the Plugins row: the chip is THE DOOR — a button reading 用 Fish Audio 连接 (primary tone), its title names the key\'s place; the switch waits (off, disabled)', isRowDoor(chip0) && chip0.title.includes('或在「服务 › 集成」里粘贴 Dropline key') && chip0.swOff, chip0);
  await p.shot('door-row.png', '#plugins');
  await p.clickSel(`${ROW} .plugin-chip`);
  const sheet = await p.until('!!document.querySelector("#voice-sheet .oauth-connect-btn") && !!document.querySelector("#voice-sheet .oauth-connect-key")', 6000);
  const sf = sheet ? await p.ev('(() => { const s = document.getElementById("voice-sheet"); const b = s.querySelector(".oauth-connect-btn"), k = s.querySelector(".oauth-connect-key"); return { btn: b.textContent, key: k.textContent, after: !!(b.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()') : null;
  ok('a press on the chip opens the Voice sheet: Connect first, then ONE line to the key — 已经有 key？粘贴到「服务 › 集成 › Dropline」', !!sf && sf.btn === '用 Fish Audio 连接' && sf.key === '已经有 key？粘贴到「服务 › 集成 › Dropline」' && sf.after, sf || await p.ev('document.body.innerText.slice(0, 400)'));
  await p.shot('door-sheet.png', '#voice-sheet .dialog');
  await p.clickSel('#voice-sheet .oauth-connect-key');
  const onCard = await p.until(`!document.getElementById('voice-sheet') && !!document.querySelector('${CARD}.integ-focus')`, 6000);
  ok('the sheet\'s line closes the sheet and opens the Integrations window ON the dropline card (focused)', onCard, await p.ev(`({ sheet: !!document.getElementById('voice-sheet'), cards: [...document.querySelectorAll('.integ-card')].map((c) => c.dataset.integ + (c.classList.contains('integ-focus') ? '*' : '')) })`));
  const card0 = await cardDoor(p);
  const key0 = await p.ev(`(() => { const r = document.querySelector('${CARD} .integ-field[data-field="apiKey"]'); return r ? { missing: !!r.querySelector('.integ-missing'), help: (r.querySelector('.integ-help') || {}).textContent || '' } : null; })()`);
  ok('the Integrations card signs in too: 用 Fish Audio 连接 ABOVE the key field; the key optional (never marked required), its help says either one', isCardDoor(card0) && !!key0 && !key0.missing && key0.help.startsWith('可以在上面登录，或者粘贴一个 key'), { card0, key0 });
  ok('… https here (hub.test): no refusal sentence under the button', card0 && card0.why === '', card0);
  await sleep(900); await p.ev(`(document.querySelector('${CARD}').scrollIntoView({ block: 'start' }), true)`);   // the focus scroll is smooth: settle it
  await p.shot('door-card.png', CARD);
  // RED CONTROLS: the same probes on the mutant bundles (fresh tabs, nothing connected yet) — each hides ONE door
  for (const [k, which] of [['m1', 'row'], ['m2', 'card']]) {
    const pm = await page(1280, 860, k);
    const row = isRowDoor(await rowDoor(pm)), crd = isCardDoor(await cardDoor(pm));
    ok(`CONTROL ${k}: ${which === 'row' ? 'the base\'s status chip (no Dropline key yet)' : 'the card without its Connect block'} ⇒ that door probe is RED (the other stays green)`, mutantOnce[MUTANTS[k][0]] === true && (which === 'row' ? !row && crd : row && !crd), { k, row, crd, once: mutantOnce });
    pm.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${pm.targetId}`).catch(() => null);
  }
  await p.cdp('Page.bringToFront');

  console.log('⓪b the card\'s Connect end to end (the plugin OFF), its Test on the sign-in, 断开');
  await p.clickSel(`${CARD} .oauth-connect-btn`);
  const cs0 = await consent(p);
  ok('the card\'s Connect opened the consent tab; consent + the code ⇒ the hub\'s own https callback: connected — the plugin still OFF (Connect never waits for the switch)', !!cs0.tab && cs0.landed && rec.enabled === false, cs0);
  const cardOn = await p.until(`(document.querySelector('${CARD} .oauth-connect-words') || {}).textContent === '已连接：Ana · Fish Lab'`, 12000);
  ok('the card re-renders itself: 已连接：Ana · Fish Lab with 断开', cardOn && await p.ev(`!!document.querySelector('${CARD} .oauth-disconnect')`), await p.ev(`document.querySelector('${CARD}').innerText.slice(0, 300)`));
  ok('the first Connect registered ONE client and wrote its id to the real row; no key was ever needed', fake.clients.size === 1 && /^cid_chrome_/.test(rowValues().clientId || '') && !rowValues().apiKey, rowValues());
  const nMe = calls.filter((c) => c.p === '/v1/me').length;
  await p.clickSel(`${CARD} .integ-test`);
  const passed = await p.until(`!!document.querySelector('${CARD} .integ-test-result .integ-ok')`, 8000);
  const lastMe = calls.filter((c) => c.p === '/v1/me').slice(nMe);
  ok('the card\'s Test with NO key tests the sign-in: ONE GET /v1/me with the OAuth token ⇒ 通过', passed && lastMe.length === 1 && /^at_chrome_/.test(lastMe[0].auth) && store.publicView('dropline').lastOk === true, { passed, lastMe, text: await p.ev(`(document.querySelector('${CARD} .integ-test-result') || {}).textContent`) });
  await p.ev(`(document.querySelector('${CARD}').scrollIntoView({ block: 'start' }), true)`);
  await p.shot('door-card-connected.png', CARD);
  await p.clickSel(`${CARD} .oauth-disconnect`);
  const offAgain = await p.until(`!!document.querySelector('${CARD} .oauth-connect-btn')`, 6000);
  ok('断开 on the card forgets the sign-in here; the card offers Connect again', offAgain && !client.connected() && !(tokens.read() && tokens.read().access));

  console.log('① Connect with Fish Audio — a new tab, Allow + the mailed code, the hub\'s own https callback');
  await p.ev('(document.querySelector("#card").innerHTML = "", window.__render())');
  ok('the Voice sheet offers Connect (nothing connected)', await p.until('!!document.querySelector("#card .oauth-connect-btn")'));
  await p.clickSel('#card .oauth-connect-btn');
  const cs1 = await consent(p);
  ok('Connect opened the consent page in a NEW TAB (S256 + scope + resource accepted by the fake)', !!cs1.tab && /code_challenge_method=S256/.test(cs1.tab) && /scope=dropline%3Aapi/.test(cs1.tab), cs1.tab || { errs: await p.ev('window.__errs'), words: await p.ev('(document.querySelector("#card .oauth-connect-words")||{}).textContent'), targets: (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).map((x) => x.type + ' ' + x.url.slice(0, 120)) });
  if (!cs1.tab) throw new Error('no consent tab');
  ok('the person finished consent + the 6-digit code in that tab ⇒ landed on https://hub.test/api/channels/oauth/cb/dropline: connected', cs1.landed, cs1.href);
  const connected = await p.until('(document.querySelector("#card .oauth-connect-words")||{}).textContent === "已连接：Ana · Fish Lab"', 12000);
  ok('the card says 已连接：Ana · Fish Lab with 断开 (GET /v1/me with the OAuth token)', connected && await p.ev('!!document.querySelector("#card .oauth-disconnect")') && calls.some((c) => c.p === '/v1/me' && /^at_chrome_/.test(c.auth)), await p.ev('document.querySelector("#card").innerText.slice(0, 300)'));
  ok('the client_id was registered once (the card\'s Connect and this one share it) and sits on the row; the pair is on the hub only', fake.clients.size === 1 && /^cid_chrome_/.test(rowValues().clientId || '') && !!tokens.read().access && !(await p.ev('document.documentElement.outerHTML')).includes(tokens.read().access));
  await p.until('!!document.querySelector(".voice-teach")');
  await p.shot('connect.png');

  console.log('①b connected first, switched on after: the Plugins row\'s switch');
  const chip1 = await rowDoor(p);
  ok('connected ⇒ the row\'s chip is a status again (已关闭), the switch is free', !!chip1 && !isRowDoor(chip1) && chip1.text === '已关闭' && !(await p.ev(`document.querySelector('${ROW} .plugin-sw input').disabled`)), chip1);
  await p.clickSel(`${ROW} .plugin-sw input`);
  const onNow = await p.until(`(document.querySelector('${ROW} .plugin-chip') || {}).textContent === '开'`, 6000);
  ok('the switch turns the plugin on ⇒ the row says 开', onNow && rec.enabled === true, { chip: await p.ev(`(document.querySelector('${ROW} .plugin-chip') || {}).textContent`), rec: rec.enabled });
  await p.ev('window.__render()');   // the sheet's status read tells the microphone (noteVoiceStatus): on now
  await p.until('!!document.querySelector(".voice-teach-off")');

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
  ok('the dictation made a PROPOSAL card (no write) + a For-you item 加入词库 / 忽略', hasCard && terms.includes('commentsBatches') && terms.includes('doc-window-ui.js') && !terms.includes('VibeSpace') && writes().length === 0 && userTodos.openItems().length === 1 && userTodos.openItems()[0].options.join() === '加入词库,忽略', { terms, items: userTodos.openItems(), w: writes() });
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
  console.log('⑨ the For-you tray (lane foryou-plugin-notices): the suggestion pinned under urgent; a body click opens the sheet with its words chosen; ✓ adds, × dismisses');
  { // ⑨ its own scope (the legs above declare the same short names)
  // beside the voice reminders: an urgent ask, a high one and a plain one (agents' items, the store's own add)
  userTodos.add('claude:u9', { origin: 'agent', text: 'Approve the deploy?', urgency: 'urgent', sessionName: 'deploy' });
  userTodos.add('claude:h9', { origin: 'agent', text: 'Pick a name', urgency: 'high', sessionName: 'naming' });
  userTodos.add('claude:n9', { origin: 'agent', text: 'Read the report', sessionName: 'report' });
  const t9 = await page(1280, 860);
  await dictate(t9, 'conv-9', [{ role: 'user', content: [{ type: 'text', text: 'wire quuxFrobnicate into gamma_widget.md, then quuxFrobnicate again' }] }]);
  await dictate(t9, 'conv-10', [{ role: 'user', content: [{ type: 'text', text: 'rename zorbleMint in delta_sheet.md, zorbleMint twice' }] }]);
  const voiceOpen = () => userTodos.openItems().filter((i) => i.sessionKey === VPD.id).sort((a, b) => b.createdAt - a.createdAt);
  const vIds = voiceOpen().map((i) => i.id);
  ok('two suggestions are open as the voice PLUGIN\'s reminders (origin plugin, under its id, each with its door)', vIds.length >= 2 && voiceOpen().every((i) => i.origin === 'plugin' && i.plugin === VPD.id && i.open && i.open.kind === 'plugin-settings' && i.open.prefill.terms.length > 0), voiceOpen());
  const trayOpen = async (pg) => {
    if (!(await pg.ev('!!document.getElementById("taskbar-user-todos")'))) await pg.ev('window.__tray()');
    await pg.ev('window.__pushTodos()');
    if (await pg.ev('document.getElementById("user-todos-popup").classList.contains("hidden")')) await pg.clickSel('#taskbar-user-todos');
    return pg.until('!!document.querySelector("#user-todos-popup:not(.hidden) .ut-item")', 6000);
  };
  ok('the tray opens on the REAL store\'s snapshot', await trayOpen(t9));
  const keys = await t9.ev('[...document.querySelectorAll("#user-todos-popup .ut-groups > .ut-group")].map((g) => g.dataset.key)');
  ok('THE PIN: the urgent ask first, the voice plugin\'s reminders RIGHT UNDER it — above the high ask and the plain one', keys[0] === 'claude:u9' && keys[1] === VPD.id && keys.indexOf('claude:h9') === 2 && keys.indexOf('claude:n9') === 3, keys);
  const row0 = `#user-todos-popup .ut-item[data-id="${vIds[0]}"]`;
  const tickTitle = await t9.ev(`(document.querySelector('${row0} .ut-done') || {}).title`);
  ok('the reminder\'s ✓ says what it does (the door\'s `done` through t()): 把这些词加入 Dropline 词库', tickTitle === '把这些词加入 Dropline 词库', tickTitle);
  await t9.shot('tray.png', '#user-todos-popup');
  const it0 = userTodos.get(vIds[0]);
  // THE DOOR PROBE: a click on the row's BODY ⇒ the plugin's sheet on THIS suggestion (marked), its words chosen
  const doorProbe = async (pg, id) => {
    await pg.clickSel(`#user-todos-popup .ut-item[data-id="${id}"] .ut-text`);
    const pid = userTodos.get(id).open.prefill.proposal;
    const opened = await pg.until(`!!document.querySelector('#voice-sheet .voice-proposal.voice-proposal-focus[data-id="${pid}"]')`, 5000);
    return { opened, sheet: await pg.ev(`(() => { const c = document.querySelector('#voice-sheet .voice-proposal-focus'); return c ? { on: [...c.querySelectorAll('.voice-term[aria-pressed="true"]')].map((x) => x.dataset.term), all: [...c.querySelectorAll('.voice-term')].length, add: c.querySelector('.voice-proposal-add').textContent, focus: document.activeElement === c.querySelector('.voice-proposal-add'), trayHidden: document.getElementById('user-todos-popup').classList.contains('hidden') } : null; })()`) };
  };
  const dr = await doorProbe(t9, vIds[0]);
  const want0 = it0.open.prefill.terms.slice().sort().join();
  ok('a click on the reminder\'s BODY opens the voice plugin\'s sheet on THAT suggestion (marked), its words already chosen — one press of 加入所选 adds them; the tray closed', dr.opened && dr.sheet && dr.sheet.on.slice().sort().join() === want0 && dr.sheet.add === `加入所选 (${it0.open.prefill.terms.length})` && dr.sheet.trayHidden, dr);
  await t9.shot('door.png', '#voice-sheet .dialog');
  await t9.clickSel('#voice-sheet .dialog-close');
  await t9.until('!document.getElementById("voice-sheet")');
  // CONTROL: the same click on a bundle WITHOUT the door line (m3) stays shut — the probe can go red
  const tm = await page(1280, 860, 'm3');
  await trayOpen(tm);
  const dm = await doorProbe(tm, vIds[0]);
  ok('CONTROL (mutant m3 — the tray without the door line, its anchor patched once): the same body click opens NO sheet — the probe is RED', mutantOnce['src/lib/user-todos-actions.js'] === true && !dm.opened && !dm.sheet, dm);
  tm.close();
  // ✓ on the reminder ⇒ ONE POST /v1/terms with exactly its words
  const w0 = writes().length;
  await trayOpen(t9);
  await t9.clickSel(`${row0} .ut-done`);
  for (let i = 0; i < 60 && writes().length === w0; i++) await sleep(100);
  await sleep(200);
  const tw = writes().slice(w0);
  ok('✓ on the reminder ⇒ ONE POST /v1/terms with EXACTLY its words; the row is done and its card gone from the sheet', tw.length === 1 && tw[0].p === '/v1/terms' && tw[0].body.terms.map((x) => x.term).sort().join() === want0 && userTodos.get(vIds[0]).status === 'done' && !teach.view().proposals.some((x) => x.id === it0.open.prefill.proposal), { tw, st: userTodos.get(vIds[0]).status });
  // × on the other ⇒ nothing sent, dismissed, its batch still waits on the sheet
  const it1 = userTodos.get(vIds[1]);
  await t9.clickSel(`#user-todos-popup .ut-item[data-id="${vIds[1]}"] .ut-dismiss`);
  for (let i = 0; i < 40 && userTodos.get(vIds[1]).status === 'open'; i++) await sleep(100);
  await sleep(300);
  ok('× on a reminder ⇒ nothing sent; it is dismissed and its batch still waits on the sheet (忽略这批 lives there)', writes().length === w0 + 1 && userTodos.get(vIds[1]).status === 'dismissed' && teach.view().proposals.some((x) => x.id === it1.open.prefill.proposal));
  ok('no page error on the tray legs', (await t9.ev('window.__errs')).length === 0, await t9.ev('window.__errs'));
  t9.close();
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + (e && e.stack || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
