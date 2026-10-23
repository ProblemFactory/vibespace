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
//   ⑥ an automatic folder (lane voice-teach-skips: the folder AND its subfolders, nothing asked) — the card's toggle names the
//     folder and offers the parent; in a subfolder every word goes without a card and lands in the journal; ✕ asks again
//   ⑥b the vendor skips (documented reasons review / refused) ⇒ the toast and the journal row say why; the words are not asked again
//   ⑦ phone 390
//   ⑧ RETIRED (int263 seam c3): the polished card body it judged was deleted by plugin-settings-p0 (the Plugins list row)
//   ⑨ THE FOR-YOU TRAY (lane foryou-plugin-notices, owner 2026-10-19; lane voice-dictionary-nag 2026-10-21): the REAL tray
//     over the REAL store — ONE suggestion item: a second conversation's batch MERGES into it (the same id, the same keyed
//     row patched in place); filed LOW it waits in band 5 under the urgent ask (never the plugin pin); its ✓ says what it
//     does; a click on its BODY opens the plugin's sheet on the newest card with its words chosen (a MUTANT bundle without
//     the door line stays shut — RED); ✓ ⇒ ONE POST /v1/terms with exactly the item's (merged) words
//   ⑩ «NOT NOW» (lane voice-dictionary-nag — a fleet user: 「一天到晚有这个 Dropline 让我发信息的消息」; the user: no «never
//     again», no timers): × ⇒ nothing sent, its card leaves the sheet; the SAME conversation read again a day later brings
//     nothing back; a NEW dictation that says the word does; the REAL All Settings window (zh): 「词典建议」 ON by default
//     with every word suggested now, 忽略 / 加入词库 per word over the REAL route (the open item re-worded in place);
//     voice.suggestions.mode 只在设置里 ⇒ a card, never a For-you item; 「词典建议」 off ⇒ nothing proposed
// PNGs: VIBESPACE_VOICE_PNG_DIR (default: the scratch dir) → door-row, door-sheet, door-card, door-card-connected,
//   connect, proposal, preview, journal, phone, tray, door, tray-merged, settings-words
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
    if (u.pathname === '/v1/terms') { const t = (JSON.parse(body).terms || []).map((x) => x.term); if (fake.skip) return json(200, { added: [], skipped: t.map((x) => ({ term: x, reason: /^[A-Z]/.test(x) ? 'review' : 'refused' })), dictionary_version: 2, request_id: 'tr_skip' }); return json(200, { added: t, skipped: [], dictionary_version: 2 }); } // ⑥b: the documented skip shape
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
// lane voice-dictionary-nag: the engine's clock is the wall clock + CLOCK_SKEW (⑩ moves it by days), its ledger a real file
let CLOCK_SKEW = 0;
const LEDGER = path.join(root, 'data', 'voice-suggestions.json');
teach = require(path.join(REPO, 'src/server/voice-teach-engine.js')).create({ client, plugin: { peek: () => rec, update: (fn) => fn(rec), settings: () => rec.config || {}, writeSettings: (p) => { rec.config = { ...(rec.config || {}), ...p }; } }, userTodos, log: quiet, now: () => Date.now() + CLOCK_SKEW, ledgerFile: LEDGER });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { ChatInput } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-input.js'))};
import { renderVoiceSheet } from ${JSON.stringify(path.join(REPO, 'src/lib/voice-plugin-card.js'))};
import { installPluginsUI } from ${JSON.stringify(path.join(REPO, 'src/lib/plugins-ui.js'))};
import { openIntegrationsWindow } from ${JSON.stringify(path.join(REPO, 'src/lib/integrations-window.js'))};
import { installUserTodos } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-panel.js'))};
import { SettingsUI } from ${JSON.stringify(path.join(REPO, 'src/lib/settings-ui.js'))};
import { SETTINGS_SCHEMA } from ${JSON.stringify(path.join(REPO, 'src/lib/settings-schema.js'))};
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
// lane voice-dictionary-nag (⑩): THE All Settings window (the REAL SettingsUI) over a fake settings store (the row-layout
// suite's recipe); a write of 「词典建议」 reaches the engine through the teach settings door (the server reads settings.json)
window.__settingsOpen = () => {
  const vals = {}, ls = {};
  const def = (k) => (SETTINGS_SCHEMA[k] ? SETTINGS_SCHEMA[k].default : undefined);
  const settings = { get: (k) => (k in vals ? vals[k] : def(k)), set: (k, v) => { vals[k] = v; if (k === 'plugin.voice-input.suggest') window.__set({ suggest: v }); if (k === 'voice.suggestions.mode') window.__set({ suggestionsMode: v }); for (const f of [...(ls[k] || [])]) f(v); },
    isModified: (k) => k in vals && vals[k] !== def(k), reset: (k) => { delete vals[k]; }, resetAll() { }, on: (k, f) => { (ls[k] = ls[k] || new Set()).add(f); }, off: (k, f) => { if (ls[k]) ls[k].delete(f); } };
  const sapp = { settings, isMobile: false, ws: { onGlobal: () => () => { }, offGlobal() { }, onStateChange() { }, offStateChange() { } },
    wm: { windows: new Map(), createWindow: () => ({ id: 'settings-1', content: document.getElementById('win') }), revealWindow() { } } };
  new SettingsUI(sapp).open();
  return true;
};
// the route the microphone calls after a dictation (teachAfterDictation) — ⑨ / ⑩ file later batches through it directly
window.__seen = (conv, ...texts) => fetch('/api/voice/teach/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conv, title: conv, cwd: window.__cwd, uiLang: 'zh', messages: texts.map((text) => ({ role: 'user', content: [{ type: 'text', text }] })) }) }).then((r) => r.json());
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
  m1: ['src/lib/plugins-ui.js', "chip = p.vaultLocked ? t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)') : !p.configured ? t('Connect with Fish Audio') :", "chip = p.vaultLocked ? t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)') : !p.configured ? t('no Dropline key yet') :"],   // the base's status chip (lane vault-e2e-password-fix-r2: the chip's line now asks the vault first)
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
    // a toast can sit over the target (bottom of the page): wait until the point reaches the element itself — and the point is
    // READ AGAIN at each look (lane race-sweep, B-f220: ⑨'s mic moved when the sheet's teach section rendered above the composer;
    // a point computed once hit the proposal's text 8 s later, 7/34 on 2 cpus), the press going where the element is now
    const at = () => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (e === h || e.contains(h) || h.contains(e)) }; })()`);
    let r = await at();
    if (!r) throw new Error('no element ' + sel);
    for (const t0 = Date.now(); !r.hit && Date.now() - t0 < 8000;) { await sleep(80); r = (await at()) || r; }
    await mouse('mouseMoved', r.x, r.y); await mouse('mousePressed', r.x, r.y); await mouse('mouseReleased', r.x, r.y);
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
  // lane race-sweep (B-f220): a dictation that never records says where its press went — every pointerdown / click (target,
  // point, ms), the mic's point at the press, the status fetch — printed in dictate's throw
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__micT = { clicks: 0 }; (() => { const now = () => Math.round(performance.now()); const f = window.fetch; window.fetch = (u, o) => { const st = String(u).includes('/api/voice/status'); if (st) __micT.statusAsk = now(); const r = f(u, o); if (st) r.then(() => { __micT.statusGot = now(); }, () => { __micT.statusErr = now(); }); return r; }; addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('.chat-voice-btn')) { __micT.clicks++; __micT.clickAt = now(); } }, true); const tag = (e) => { const t = e.target; const c = t && (t.className && (t.className.baseVal != null ? t.className.baseVal : t.className)); return { x: Math.round(e.clientX), y: Math.round(e.clientY), t: now(), on: String(c || (t && t.tagName) || '') }; }; __micT.downs = []; __micT.anyClicks = []; addEventListener('pointerdown', (e) => { if (__micT.downs.length < 8) __micT.downs.push(tag(e)); }, true); addEventListener('click', (e) => { if (__micT.anyClicks.length < 8) __micT.anyClicks.push(tag(e)); }, true); })();` });
  await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await p.cdp('Page.navigate', { url: `${HUB}/${b ? '?b=' + b : ''}` });
  for (let i = 0; i < 100 && !(await p.ev('typeof window.__mount === "function"').catch(() => false)); i++) await sleep(100);
  await p.ev('window.__mount()');
  return p;
}
const MIC = '#frame .chat-voice-btn';
// the sheet renders in two answers (renderVoiceSheet: /api/voice/status fills the account box and, connected, appends the teach
// section; that section's /api/voice/teach then fills it): settled = the account box filled AND no teach section still waiting
const SHEET_SETTLED = '(() => { const a = document.querySelector("#card .voice-account-box"); if (!a) return true; if (!a.childNodes.length) return false; const s = document.querySelector("#card .voice-teach"); return !s || !!s.querySelector(".voice-teach-head, .plugin-cfg-warn"); })()';
const TA = `document.querySelector('#frame textarea')`;
const writes = () => calls.filter((c) => c.p === '/v1/terms' || c.p === '/v1/context');
async function dictate(p, conv, messages = null) {
  await p.ev(`(() => { window.__facts.conv = ${JSON.stringify(conv)}; ${messages ? `window.__facts.messages = ${JSON.stringify(messages)};` : ''} ${TA}.value = ''; ${TA}.focus(); return true; })()`);
  const n = calls.filter((c) => c.p === '/v1/dictate').length;
  await p.until(`document.querySelector(${JSON.stringify(MIC)}).offsetWidth > 0`, 5000); // lane voice-everywhere: the mic shows once /api/voice/status said on
  // lane race-sweep (B-f220): the LAST EFFECT of the page's render — the sheet's teach section answered (its own fetch; until then
  // its proposals can still land above the composer and move the mic)
  await p.until(SHEET_SETTLED, 10000);
  await p.ev(`(() => { const b = document.querySelector(${JSON.stringify(MIC)}).getBoundingClientRect(); window.__micT.pressAt = Math.round(performance.now()); window.__micT.micAt = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; window.__micT.scrollY = Math.round(scrollY); return true; })()`);
  await p.clickSel(MIC);
  if (!(await p.until(`document.querySelector(${JSON.stringify(MIC)}).classList.contains('recording')`))) throw new Error('the mic did not record: ' + JSON.stringify(await p.ev(`({ micT: window.__micT, paints: performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]), nowMs: Math.round(performance.now()), vis: document.visibilityState, focus: document.hasFocus(), cls: document.querySelector(${JSON.stringify(MIC)}).className, chip: (document.querySelector('#frame .voice-chip')||{}).textContent, errs: window.__errs, top: (() => { const b = document.querySelector(${JSON.stringify(MIC)}).getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return h && (h.className || h.tagName); })() })`)));
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

  console.log('⑥ an automatic folder (lane voice-teach-skips): the toggle names the folder + offers the parent; a subfolder asks nothing — every word goes and lands in the journal');
  await p.ev('window.__set({ context: false })');   // ⑤ proved the preview; off now, so no dialog covers the next clicks
  await dictate(p, 'conv-5', [{ role: 'user', content: [{ type: 'text', text: 'rename freshIdentOne in zeta_notes.md' }] }]);   // ④ ignored the earlier words: new ones
  await rerender(p, '.voice-project-auto input');
  const label = await p.ev('({ t: document.querySelector(".voice-project-auto").textContent.trim(), title: document.querySelector(".voice-project-auto").title, up: (document.querySelector(".voice-project-parent") || {}).textContent || null, upTitle: (document.querySelector(".voice-project-parent") || {}).title || null })');
  ok('the card\'s toggle names the folder it will cover — it and its subfolders, never asked — (its path on hover) and offers the parent folder', label.t === '这个文件夹及其子文件夹里建议的词都自动加入，不再询问（vibespace）' && label.title === '/home/u/projects/vibespace' && label.up === '或改为上一级文件夹（projects）' && label.upTitle === '/home/u/projects', label);
  await p.clickSel('.voice-project-auto input');
  await p.until('!!document.querySelector(".voice-project-row")');
  ok('the folders list says what «automatic» means: the folder and its subfolders, without asking', (await p.ev('document.querySelector(".voice-projects").textContent')).includes('这些文件夹（含子文件夹）里建议的词不经询问直接加入'));
  const nTerms = writes().filter((c) => c.p === '/v1/terms').length;
  // the base's rule sent only an agent code span here and carded the person's own word — the owner read «automatic» as «no
  // more asking there» (2026-10-22); and a conversation in a SUBFOLDER was not «on» at all (exact match)
  await p.ev("(() => { window.__cwd = '/home/u/projects/vibespace/src/lib'; return true; })()");
  await dictate(p, 'conv-4', [{ role: 'user', content: [{ type: 'text', text: 'now wire myOwnPlanWord into the card' }] }, { role: 'assistant', content: [{ type: 'text', text: 'Wired `brandNewIdent` into the card.' }] }]);
  await rerender(p, '.voice-journal-row');
  const tw = writes().filter((c) => c.p === '/v1/terms');
  const journal = await p.ev('[...document.querySelectorAll(".voice-journal-row")].map((x) => x.textContent)');
  const sent6 = tw.length === nTerms + 1 ? tw[tw.length - 1].body.terms.map((x) => x.term).sort().join() : '';
  ok('in a SUBFOLDER of the automatic folder: brandNewIdent AND the person\'s own myOwnPlanWord went in ONE write, no card asked for either; the journal says 词（本项目自动）', sent6 === 'brandNewIdent,myOwnPlanWord' && !(await p.ev('[...document.querySelectorAll(".voice-proposal")].some((c) => /myOwnPlanWord|brandNewIdent/.test(c.textContent))')) && journal[0].includes('词（本项目自动）'), { sent6, tw: tw.map((x) => x.body), journal });
  ok('the journal lists memory + words rows and the dropline.fish.audio/app link', journal.some((j) => j.includes('记忆')) && await p.ev('document.querySelector(".voice-memory-link").href === "https://dropline.fish.audio/app"'));
  await p.shot('journal.png');
  await p.clickSel('.voice-project-off');   // ✕ = ask again for this folder (the later legs dictate in it)
  await p.until('!document.querySelector(".voice-project-row")');

  console.log('⑥b the vendor skips (lane voice-teach-skips): the toast and the journal say why; a skipped word is not asked again');
  fake.skip = true;
  await p.ev("(() => { window.__cwd = '/home/u/projects/other'; return true; })()");
  await dictate(p, 'conv-6', [{ role: 'user', content: [{ type: 'text', text: 'ask Quillonia about verbaMint, then Quillonia and verbaMint again' }] }]);
  await rerender(p, '.voice-proposal');
  const id6 = await p.until('[...document.querySelectorAll(".voice-proposal")].some((c) => c.textContent.includes("Quillonia"))') ? await p.ev('[...document.querySelectorAll(".voice-proposal")].find((c) => c.textContent.includes("Quillonia")).dataset.id') : '';
  const card6 = `.voice-proposal[data-id="${id6}"]`;
  const shown6 = await p.ev(`[...document.querySelectorAll('${card6} .voice-term')].map((x) => x.dataset.term).sort().join()`);
  await p.ev(`(() => { for (const x of document.querySelectorAll('${card6} .voice-term[aria-pressed=false]')) x.click(); return true; })()`);
  await p.clickSel(`${card6} .voice-proposal-add`);
  await p.until(`!document.querySelector('${card6}')`);
  await sleep(300);
  const toast6 = await p.ev('(JSON.parse(localStorage.getItem("vibespace.toastHistory") || "[]")[0] || {}).m || ""');
  ok('加入所选 on words Dropline skips: the toast names each reason — «已加入 0 · 跳过 2（Dropline：已能写对 1 · 词典不收 1）» (the base said «已加入 0 · 跳过 2», no why)', shown6 === 'Quillonia,verbaMint' && toast6 === '已加入 0 · 跳过 2（Dropline：已能写对 1 · 词典不收 1）', { shown6, toast6 });
  await rerender(p, '.voice-journal-row');
  const jr6 = await p.ev('({ t: document.querySelector(".voice-journal-row").textContent, title: document.querySelector(".voice-journal-row").title })');
  ok('the journal row says the same, and each skipped word with its reason on hover', jr6.t.includes('跳过 2（Dropline：已能写对 1 · 词典不收 1）') && jr6.title.includes('Quillonia — 已能写对') && jr6.title.includes('verbaMint — 词典不收'), jr6);
  const again6 = await p.ev("window.__seen('conv-6b', 'ask Quillonia about verbaMint, then Quillonia and verbaMint again')");
  ok('the skipped words are not asked again (another conversation, the same words: no card, no item)', !again6.proposal && !userTodos.openItems().some((i) => /Quillonia|verbaMint/.test(i.text)), again6);
  fake.skip = false;
  await p.ev("window.__seen('conv-7', 'phoneCardWord twice: phoneCardWord')");   // ⑦'s card (the phone measures its buttons)
  await p.ev("(() => { window.__cwd = '/home/u/projects/vibespace'; return true; })()");
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
  console.log('⑨ the For-you tray (lane foryou-plugin-notices; lane voice-dictionary-nag): ONE suggestion, merged in place, band 5 under urgent; a body click opens the sheet with its words chosen; ✓ adds, × dismisses');
  { // ⑨ its own scope (the legs above declare the same short names)
  // beside the voice reminders: an urgent ask, a high one and a plain one (agents' items, the store's own add)
  userTodos.add('claude:u9', { origin: 'agent', text: 'Approve the deploy?', urgency: 'urgent', sessionName: 'deploy' });
  userTodos.add('claude:h9', { origin: 'agent', text: 'Pick a name', urgency: 'high', sessionName: 'naming' });
  userTodos.add('claude:n9', { origin: 'agent', text: 'Read the report', sessionName: 'report' });
  // lane voice-dictionary-nag: ④'s 忽略 was a dismissal — a new For-you item waits a day after one, so ⑨ starts a day later
  CLOCK_SKEW += 25 * 3600e3;
  const t9 = await page(1280, 860);
  await dictate(t9, 'conv-9', [{ role: 'user', content: [{ type: 'text', text: 'wire quuxFrobnicate into gamma_widget.md, then quuxFrobnicate again' }] }]);
  const voiceOpen = () => userTodos.openItems().filter((i) => i.sessionKey === VPD.id).sort((a, b) => b.createdAt - a.createdAt);
  const wordsOf = (it) => it.text.slice(it.text.indexOf('：') + 1).split(',').map((x) => x.trim()).filter(Boolean);
  const vId = voiceOpen()[0] && voiceOpen()[0].id;
  ok('ONE suggestion is open as the voice PLUGIN\'s reminder (origin plugin, under its id, with its door) — filed LOW (lane voice-dictionary-nag)', voiceOpen().length === 1 && voiceOpen().every((i) => i.origin === 'plugin' && i.plugin === VPD.id && i.urgency === 'low' && i.open && i.open.kind === 'plugin-settings' && i.open.prefill.terms.length > 0), voiceOpen());
  const trayOpen = async (pg) => {
    if (!(await pg.ev('!!document.getElementById("taskbar-user-todos")'))) await pg.ev('window.__tray()');
    await pg.ev('window.__pushTodos()');
    if (await pg.ev('document.getElementById("user-todos-popup").classList.contains("hidden")')) await pg.clickSel('#taskbar-user-todos');
    return pg.until('!!document.querySelector("#user-todos-popup:not(.hidden) .ut-item")', 6000);
  };
  ok('the tray opens on the REAL store\'s snapshot', await trayOpen(t9));
  const row0 = `#user-todos-popup .ut-item[data-id="${vId}"]`;
  await t9.ev(`(() => { window.__row9 = document.querySelector('${row0}'); return !!window.__row9; })()`);
  // a SECOND conversation's batch while the item is open (the route the microphone calls) ⇒ the SAME item, re-worded in place
  await t9.ev(`window.__seen('conv-10', 'rename zorbleMint in delta_sheet.md, zorbleMint twice')`);
  const merged = voiceOpen();
  ok('a second conversation\'s batch MERGES into the open item — still ONE, the same id, both batches\' words', merged.length === 1 && merged[0].id === vId && ['quuxFrobnicate', 'zorbleMint'].every((w) => wordsOf(merged[0]).includes(w)), merged);
  await t9.ev('window.__pushTodos()');
  const patched = await t9.until(`(() => { const r = document.querySelector('${row0}'); return !!r && r === window.__row9 && r.textContent.includes('zorbleMint') && r.textContent.includes('quuxFrobnicate'); })()`, 5000);
  ok('the tray PATCHES its keyed row in place: the same DOM node (data-id), now carrying both batches\' words — no second row', patched && (await t9.ev(`document.querySelectorAll('#user-todos-popup .ut-item[data-id="${vId}"]').length`)) === 1, await t9.ev(`(document.querySelector('${row0}') || {}).textContent`));
  // lane foryou-folds' bands: the urgent ask heads band 1; the LOW suggestion waits in band 5 (never the plugin pin of band 2)
  const order = await t9.ev('[...document.querySelectorAll("#user-todos-popup .ut-bands .ut-item")].map((r) => [r.dataset.id, r.closest(".ut-band").dataset.band])');
  const keyOf = new Map(userTodos.openItems().map((i) => [i.id, i.sessionKey]));
  const keys = order.map(([id, b]) => `${b}:${keyOf.get(id)}`).filter((k, i, a) => k !== a[i - 1]);
  const fold5 = await t9.ev('(() => { const f = document.querySelector("#user-todos-popup .ut-band[data-band=\\"5\\"] .ut-fold"); return f ? f.textContent : ""; })()');
  ok('NOT PINNED: the urgent ask heads band 1; the suggestion waits in band 5 with the other asks (newest first) — no band-2 pin under urgent', keys[0] === '1:claude:u9' && keys.includes(`5:${VPD.id}`) && !keys.some((k) => k.startsWith('2:')), { keys, fold5 });
  const tickTitle = await t9.ev(`(document.querySelector('${row0} .ut-done') || {}).title`);
  ok('the reminder\'s ✓ says what it does (the door\'s `done` through t()): 把这些词加入 Dropline 词库', tickTitle === '把这些词加入 Dropline 词库', tickTitle);
  await t9.shot('tray-merged.png', '#user-todos-popup');
  const it0 = userTodos.get(vId);
  // THE DOOR PROBE: a click on the row's BODY ⇒ the plugin's sheet on the newest card of the batch (marked), its words chosen
  const doorProbe = async (pg, id) => {
    await pg.clickSel(`#user-todos-popup .ut-item[data-id="${id}"] .ut-text`);
    const pid = userTodos.get(id).open.prefill.proposal;
    const opened = await pg.until(`!!document.querySelector('#voice-sheet .voice-proposal.voice-proposal-focus[data-id="${pid}"]')`, 5000);
    return { opened, sheet: await pg.ev(`(() => { const c = document.querySelector('#voice-sheet .voice-proposal-focus'); return c ? { on: [...c.querySelectorAll('.voice-term[aria-pressed="true"]')].map((x) => x.dataset.term), all: [...c.querySelectorAll('.voice-term')].length, add: c.querySelector('.voice-proposal-add').textContent, focus: document.activeElement === c.querySelector('.voice-proposal-add'), trayHidden: document.getElementById('user-todos-popup').classList.contains('hidden') } : null; })()`) };
  };
  const dr = await doorProbe(t9, vId);
  const want0 = it0.open.prefill.terms.slice().sort().join();
  ok('a click on the reminder\'s BODY opens the voice plugin\'s sheet on the newest card of the batch (marked), its words already chosen; the tray closed', dr.opened && dr.sheet && dr.sheet.on.slice().sort().join() === want0 && dr.sheet.add === `加入所选 (${it0.open.prefill.terms.length})` && dr.sheet.trayHidden, dr);
  await t9.shot('door.png', '#voice-sheet .dialog');
  await t9.clickSel('#voice-sheet .dialog-close');
  await t9.until('!document.getElementById("voice-sheet")');
  // CONTROL: the same click on a bundle WITHOUT the door line (m3) stays shut — the probe can go red
  const tm = await page(1280, 860, 'm3');
  await trayOpen(tm);
  const dm = await doorProbe(tm, vId);
  ok('CONTROL (mutant m3 — the tray without the door line, its anchor patched once): the same body click opens NO sheet — the probe is RED', mutantOnce['src/lib/user-todos-actions.js'] === true && !dm.opened && !dm.sheet, dm);
  tm.close();
  // ✓ on the reminder ⇒ ONE POST /v1/terms with exactly the item's words (both batches)
  const wantAll = wordsOf(userTodos.get(vId)).sort().join();
  const w0 = writes().length;
  await trayOpen(t9);
  await t9.clickSel(`${row0} .ut-done`);
  for (let i = 0; i < 60 && writes().length === w0; i++) await sleep(100);
  await sleep(200);
  const tw = writes().slice(w0);
  ok('✓ on the merged reminder ⇒ ONE POST /v1/terms with EXACTLY its words (both batches); the row is done and both cards gone from the sheet', tw.length === 1 && tw[0].p === '/v1/terms' && tw[0].body.terms.map((x) => x.term).sort().join() === wantAll && userTodos.get(vId).status === 'done' && !teach.view().proposals.some((x) => x.terms.includes('quuxFrobnicate') || x.terms.includes('zorbleMint')), { tw, wantAll, st: userTodos.get(vId).status });
  ok('no page error on the tray legs', (await t9.ev('window.__errs')).length === 0, await t9.ev('window.__errs'));

  console.log('⑩ «not now» (lane voice-dictionary-nag): × consumes the evidence — the same conversation brings nothing back, a NEW dictation does; All Settings 「词典建议」 + its words, 加入 / 忽略');
  const D = 24 * 3600e3;
  const PLINTH = 'and plinthMarker goes into epsilon_page.md, plinthMarker twice';
  await t9.ev(`window.__seen('conv-11', ${JSON.stringify(PLINTH)})`);
  const it1 = voiceOpen()[0];
  ok('after the ✓ a new batch files a new item (no dismissal ⇒ no wait)', !!it1 && it1.id !== vId && wordsOf(it1).includes('plinthMarker'), voiceOpen());
  await trayOpen(t9);
  const w1 = writes().length;
  await t9.clickSel(`#user-todos-popup .ut-item[data-id="${it1.id}"] .ut-dismiss`);
  for (let i = 0; i < 40 && userTodos.get(it1.id).status === 'open'; i++) await sleep(100);
  await sleep(300);
  ok('× ⇒ nothing sent; dismissed — «not now»: its card left the sheet and the ledger file holds the words\' CONSUMED evidence', writes().length === w1 && userTodos.get(it1.id).status === 'dismissed' && !teach.view().proposals.some((x) => x.terms.includes('plinthMarker')) && JSON.parse(fs.readFileSync(LEDGER, 'utf8')).words.plinthmarker.consumed.length >= 1);
  CLOCK_SKEW += D + 3600e3;   // a day and an hour later
  const q = await t9.ev(`window.__seen('conv-11', ${JSON.stringify(PLINTH)})`);
  ok('THE SAME conversation read again a day later (no new dictation) ⇒ no For-you item and no card for its words — the evidence was consumed', !q.proposal && voiceOpen().length === 0 && !teach.view().proposals.some((x) => x.terms.includes('plinthMarker')), q);
  const back = await t9.ev(`window.__seen('conv-12', ${JSON.stringify(PLINTH)}, 'please put plinthMarker in again, with quasarTrellis and quasarTrellis')`);
  const it2 = voiceOpen()[0];
  ok('a NEW dictation that SAYS plinthMarker brings it back (with the new quasarTrellis); epsilon_page.md, not said again, stays out', !!back.proposal && !!it2 && ['plinthMarker', 'quasarTrellis'].every((w) => wordsOf(it2).includes(w)) && !wordsOf(it2).includes('epsilon_page.md'), it2);
  // THE SETTINGS DOOR: the REAL All Settings window — 「插件：Voice input · Dropline」 › 「词典建议」 ON by default, its words listed
  const ts = await page(1280, 900);
  await ts.ev('window.__settingsOpen()');
  const ROW = (p) => `[...document.querySelectorAll('#win .settings-row')].find((r) => (r.querySelector('.settings-row-path') || {}).textContent === ${JSON.stringify(p)})`;
  const SUG = ROW('plugin.voice-input.suggest'), MODE = ROW('voice.suggestions.mode');
  const sRow = await ts.until(`(() => { const r = ${SUG}; return !!r && !!r.querySelector('.voice-cand[data-term="plinthMarker"]'); })()`, 8000);
  const sv = await ts.ev(`(() => { const r = ${SUG}, m = ${MODE}; return r ? { label: r.querySelector('.settings-row-label').textContent, on: r.querySelector('.settings-toggle input').checked, head: (r.querySelector('.voice-cands-head') || {}).textContent, words: [...r.querySelectorAll('.voice-cand')].map((c) => c.dataset.term), btns: [...r.querySelectorAll('.voice-cand[data-term="plinthMarker"] button')].map((x) => x.textContent), mode: m ? m.querySelector('select').value : null, modeLabel: m ? m.querySelector('.settings-row-label').textContent : null } : null; })()`);
  ok('All Settings › Voice input: 「词典建议」 is ON by default, its row lists every word suggested now (the open item\'s plinthMarker, quasarTrellis), each with 「加入词库」/「忽略」; 「词典建议放在哪里」 = 「待你处理」里的一条 (voice.suggestions.mode = item)',
    sRow && sv && sv.label.startsWith('词典建议') && sv.on === true && sv.head === `建议的词（${sv.words.length}）` && ['plinthMarker', 'quasarTrellis'].every((w) => sv.words.includes(w)) && sv.btns.join() === '加入词库,忽略' && sv.mode === 'item' && sv.modeLabel.startsWith('词典建议放在哪里'), sv);
  await ts.ev(`${SUG}.scrollIntoView({ block: 'center' })`);
  await ts.shot('settings-words.png', '#win');
  // 忽略 on one word ⇒ off the list, its evidence consumed, the open For-you item re-worded IN PLACE without it
  const w2 = writes().length;
  await ts.clickSel(`.voice-cand[data-term="plinthMarker"] .voice-cand-ignore`);
  const goneI = await ts.until(`!document.querySelector('.voice-cand[data-term="plinthMarker"]')`, 5000);
  await sleep(200);
  ok('忽略 on a word (the REAL route POST /api/voice/teach/word) ⇒ nothing sent; off the list; the open item re-worded IN PLACE (the same id) without it', goneI && writes().length === w2 && voiceOpen().length === 1 && voiceOpen()[0].id === it2.id && !wordsOf(voiceOpen()[0]).includes('plinthMarker') && wordsOf(voiceOpen()[0]).includes('quasarTrellis'), voiceOpen());
  await ts.clickSel(`.voice-cand[data-term="quasarTrellis"] .voice-cand-add`);
  for (let i = 0; i < 50 && writes().length === w2; i++) await sleep(100);
  await sleep(200);
  const tw2 = writes().slice(w2);
  ok('加入词库 on a word ⇒ ONE POST /v1/terms with exactly that word; the item it emptied is closed', tw2.length === 1 && tw2[0].body.terms.map((x) => x.term).join() === 'quasarTrellis' && userTodos.get(it2.id).status === 'done' && (await ts.until(`!document.querySelector('.voice-cand[data-term="quasarTrellis"]')`, 3000)), tw2);
  // voice.suggestions.mode = 只在设置里 ⇒ a batch is a card + the list, NEVER a For-you item
  await ts.ev(`(() => { const sel = ${MODE}.querySelector('select'); sel.value = 'settings-only'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  for (let i = 0; i < 40 && rec.config.suggestionsMode !== 'settings-only'; i++) await sleep(100);   // the write reaches the engine
  CLOCK_SKEW += 2 * D;
  const so = await ts.ev(`window.__seen('conv-13', 'and ravelPoint lands in sigma_list.md, ravelPoint twice')`);
  ok('「只在设置里」 (voice.suggestions.mode = settings-only) ⇒ the batch is a card and in the settings list — NO For-you item', rec.config.suggestionsMode === 'settings-only' && !!so.proposal && !so.proposal.itemId && voiceOpen().length === 0 && teach.view().candidates.some((x) => x.term === 'ravelPoint'), { cfg: rec.config, so: so.proposal });
  // 「词典建议」 off ⇒ nothing is proposed at all
  await ts.ev(`${SUG}.querySelector('.settings-toggle input').click()`);
  for (let i = 0; i < 40 && rec.config.suggest !== false; i++) await sleep(100);   // the write reaches the engine
  const off = await ts.ev(`window.__seen('conv-14', 'and vellumTrack in kappa_doc.md, vellumTrack twice')`);
  ok('「词典建议」 OFF ⇒ nothing is proposed — no card, no item', rec.config.suggest === false && !off.proposal && voiceOpen().length === 0, { cfg: rec.config, off });
  ok('no page error on the settings legs', (await ts.ev('window.__errs')).length === 0, await ts.ev('window.__errs'));
  ts.close();
  t9.close();
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + (e && e.stack || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
end(fail ? 1 : 0);
