#!/usr/bin/env node
// THE RAW API, SEEN IN A BROWSER (B-2198 part 3, lane channel-api-chrome; docs/design-channel-raw-api.md §7). Gate row
// `test-channel-api-chrome`, heavy tier — a scratch copy of this tree served by a REAL server, headless chrome.
//
// ZERO vendor calls: the server runs with scripts/fixtures/channels-vendor-stub.cjs preloaded (slack.com answered by the
// recorded Slack fake); the Slack account is connected through the product's own paste-back with the fake's token. A
// fake claude (CLAUDE_CMD) is the agent: on each go-<n>.json the suite drops it prints a Bash call row
// (`vibespace-channels api request …`), makes the REAL agent call (POST /api/agent/channels/api with its session bearer)
// and prints the answer as the tool result — so the §26 witness binds the call row to that chat card.
//
//   ① the "API access…" dialog: the credential picker by source, the tier per principal, the sensitive list, the
//      always-allowed shapes with Revoke, the API log (zh; en + ja words)
//   ② a write-ask call ⇒ ONE card under the chat's call row + ONE Outbox "API calls" row + ONE For-you item
//   ③ Approve in the chat ⇒ the Outbox row and the For-you item resolve IN PLACE (ran · 200)
//   ④ Reject from the For-you tray ⇒ the chat card says "Rejected by you"
//   ⑤ a sensitive card has NO "Run and always allow" button
//   ⑥ "Run and always allow <shape>" ⇒ the next same-shape call runs without a card; the dialog lists the shape + Revoke
//   ⑦ 390 px: nothing of the card is off-screen, its action row wraps
//   ⑧ CONTROL: a bundle whose card answers WITHOUT the frozen digest ⇒ Approve answers 409, nothing runs
// PNGs (for the owner): $API_CHROME_SHOTS (default: the scratch dir) api-dialog-zh.png, api-card-chat-zh.png,
// api-card-phone-zh.png. Run: node scripts/test-channel-api-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v || Date.now() > end) return v; await sleep(150); } };

const VNC_ENV = await vncEnv();
const ROOT = scratch('chapi-chrome');
const wt = path.join(ROOT, 'wt'), BIN = path.join(ROOT, 'bin'), FAKE = path.join(ROOT, 'fake'), STUB = path.join(ROOT, 'stub');
const SHOTS = process.env.API_CHROME_SHOTS || ROOT;
for (const d of [wt, BIN, FAKE, STUB, SHOTS]) fs.mkdirSync(d, { recursive: true });
const fakeHome = scratchHome('chapi-chrome-home', fs);
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'chapi-chrome-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'chapi-chrome-run-'));
fs.chmodSync(chromeRun, 0o700);
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'scripts/fixtures']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const build = (out) => execSync(`npx esbuild src/client.js --bundle --outfile=${out} --format=iife --platform=browser --target=es2020 --loader:.css=css`, { cwd: wt, stdio: 'ignore' });
// THE CONTROL BUNDLE first: the card's Approve answers without the frozen digest it was drawn from
const CV = path.join(wt, 'src/lib/channel-api-card-view.js'), cvSrc = fs.readFileSync(CV, 'utf-8');
const APPROVE = "answerApiProposal(m.id, 'approve', { shown: rec.digest })";
ok(cvSrc.includes(APPROVE), 'the card\'s Approve names the frozen digest it was drawn from (the control has a line to cut)');
fs.writeFileSync(CV, cvSrc.replace(APPROVE, "answerApiProposal(m.id, 'approve', { shown: null })"));
build('public/bundle-control.js');
fs.writeFileSync(CV, cvSrc);
build('public/bundle.js');

// THE FAKE AGENT (CLAUDE_CMD): init, then one scripted Bash call per go-<n>.json
const SID = crypto.randomUUID();
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), at = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
if (!a.includes('--output-format')) { setInterval(() => {}, 1e6); return; }
const SID = at('--session-id') || at('--resume') || ${JSON.stringify(SID)}, DIR = ${JSON.stringify(FAKE)};
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
setTimeout(() => { out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: ['Bash'], mcp_servers: [] }); fs.writeFileSync(path.join(DIR, 'sid'), SID); }, 500);
process.stdin.on('data', () => {});
let n = 0, busy = false;
setInterval(async () => {
  const f = path.join(DIR, 'go-' + (n + 1) + '.json');
  if (busy || !fs.existsSync(f)) return;
  busy = true; n++;
  const c = JSON.parse(fs.readFileSync(f, 'utf-8')), id = 'toolu_' + n + '_' + Date.now();
  out({ type: 'assistant', message: { id: 'msg_' + n + 'a', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: c.command, description: 'raw API call' } }] } });
  await new Promise((r) => setTimeout(r, 400));
  const t = await fetch(process.env.VIBESPACE_API + '/api/agent/channels/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN }, body: JSON.stringify(c.call) }).then(async (r) => r.status + ' ' + await r.text()).catch((e) => 'ERR ' + e.message);
  fs.writeFileSync(path.join(DIR, 'ans-' + n + '.txt'), t);
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: t.slice(0, 1500), is_error: false }] } });
  out({ type: 'assistant', message: { id: 'msg_' + n + 'b', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Called the API.' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, num_turns: 1, result: 'Called the API.', total_cost_usd: 0 });
  busy = false;
}, 200);
`, { mode: 0o755 });

const PORT = await freePort(), CDP_PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, PATH: `${BIN}:${path.join(wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
    NODE_OPTIONS: `--require ${path.join(wt, 'scripts/fixtures/channels-vendor-stub.cjs')}`, VS_VENDOR_STUB_DIR: STUB },
});
for (const s of [srv.stdout, srv.stderr]) s.on('data', (d) => { srvLog.push(String(d)); if (srvLog.length > 400) srvLog.shift(); });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: `:${200 + (process.pid % 500)}` } });
let wsMain = null;
const cleanup = () => {
  try { wsMain && wsMain.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const r of [ROOT, fakeHome]) { try { endRootedProcesses(r); } catch {} }
  try { execSync(`pkill -KILL -f ${JSON.stringify(path.join(BIN, 'claude'))}`, { stdio: 'ignore' }); } catch {}
  try { execSync(`pkill -KILL -f ${JSON.stringify('dtach.*' + fakeHome)}`, { stdio: 'ignore' }); } catch {}
  if (!process.env.API_CHROME_KEEP) for (const d of [ROOT, fakeHome, chromeHome, chromeRun]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const api = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let json = null; try { json = await r.json(); } catch {} return { status: r.status, json }; };
ok(await until(async () => (await fetch(`${BASE}/api/home`)).ok, 40000), 'the scratch server booted (vendor stub preloaded)');

// THE ACCOUNT: a Slack account through the product's own paste-back, answered by the recorded fake
const SV = require(path.join(repo, 'scripts/fixtures/slack-vendor.cjs'));
const con = await api('POST', '/api/channels/adapters/slack/connect', {});
const credId = con.json && con.json.adapter && con.json.adapter.id;
const fin = credId ? await api('POST', `/api/channels/adapters/${encodeURIComponent(credId)}/auth/finish`, { url: SV.TOKEN }) : null;
ok(credId && fin && fin.status === 200, `a Slack account is connected through the paste-back (stub vendor) — ${credId}`, { con, fin });

// THE AGENT: a chat session on the fake claude, granted "Read + write, ask each" on the account
const WebSocket = require('ws');
wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'api-agent' }));
const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'r1'), 20000);
const sessionId = created && created.sessionId;
const sid = await until(() => { try { return fs.readFileSync(path.join(FAKE, 'sid'), 'utf-8'); } catch { return null; } }, 20000);
ok(sessionId && sid, 'a chat session runs on the fake agent', srvLog.join('').slice(-800));
const grant = await api('PUT', `/api/channels/api/${encodeURIComponent(credId)}/grants`, { grants: [{ principal: { kind: 'agent', id: sid, name: 'api-agent' }, tier: 'write-ask' }] });
ok(grant.status === 200, 'the agent is granted "Read + write, ask each" on the account', grant);

let goN = 0;
const agentCalls = async (method, p, body) => {
  goN++;
  const call = { cred: credId, method, host: 'slack.com', path: p, body: body === undefined ? undefined : JSON.stringify(body) };
  fs.writeFileSync(path.join(FAKE, `go-${goN}.json`), JSON.stringify({ command: `vibespace-channels api request ${credId} ${method} ${p}${body ? ` --body '${JSON.stringify(body)}'` : ''}`, call }));
  const t = await until(() => { try { return fs.readFileSync(path.join(FAKE, `ans-${goN}.txt`), 'utf-8'); } catch { return null; } }, 20000);
  const sp = (t || '').indexOf(' ');
  let json = null; try { json = JSON.parse(t.slice(sp + 1)); } catch {}
  return { status: Number((t || '').slice(0, sp)), json, raw: t };
};
const cards = async () => ((await api('GET', '/api/channels/api')).json || {}).cards || [];

// ── CHROME ──
await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).ok, 20000);
async function newPage({ lang = 'zh', width = 1400, height = 1000, control = false } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map(), on = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method && on.has(m.method)) on.get(m.method)(m.params); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  if (control) {   // the CONTROL: this page runs the bundle whose card answers without the frozen digest
    const body = fs.readFileSync(path.join(wt, 'public/bundle-control.js')).toString('base64');
    on.set('Fetch.requestPaused', (p) => cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body }));
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/bundle.js*', requestStage: 'Response' }] });
  }
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)})}catch{};window.__answers=[];const __f=window.fetch;window.fetch=async(...a)=>{const r=await __f(...a);try{const u=String(a[0]&&a[0].url||a[0]);if(/\\/api\\/channels\\/api\\/proposals\\//.test(u))window.__answers.push({u,status:r.status})}catch{};return r};` });
  await cdp('Page.navigate', { url: `${BASE}/` });
  const loaded = await until(() => evaljs('!!(window.app && window.app.wm && window.app.sidebar)'), 40000);
  const shot = async (file, sel) => {
    const box = sel ? await evaljs(`(async () => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); for (let i = 0; i < 100; i++) { await new Promise((q) => setTimeout(q, 200)); const b = e.getBoundingClientRect(), hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + Math.min(b.height, innerHeight) / 2)); if (hit && e.contains(hit)) break; } const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) }; })()`) : null;
    const r = await cdp('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 } } : {}) });
    if (r.result && r.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
    return !!(r.result && r.result.data);
  };
  return { cdp, evaljs, shot, loaded, close: () => { try { ws.close(); } catch {} } };
}
const CHAT = (sidSel) => `[...document.querySelectorAll('.chat-api-cards')].filter((b) => b.closest(${JSON.stringify(sidSel)}))`;
const openChat = (p) => p.evaljs(`(async () => { for (let i = 0; i < 80; i++) { const s = (app.sidebar._webuiSessions || []).find((x) => x.id === ${JSON.stringify(sessionId)}); if (s) { app.attachSession(s.id, s.name, s.cwd, { mode: 'chat', backend: 'claude' }); return true; } await new Promise((r) => setTimeout(r, 250)); } return false; })()`);
const chatCards = (p) => p.evaljs(`[...document.querySelectorAll('.chat-api-cards .chan-api-card')].map((c) => ({ id: c.dataset.key, fate: c.dataset.fate, text: c.innerText, always: !!c.querySelector('.chan-api-always'), approve: !!c.querySelector('.chan-api-approve'), underCall: !!(c.closest('.chat-api-cards') && c.closest('.chat-api-cards').previousElementSibling && c.closest('.chat-api-cards').previousElementSibling.classList.contains('chat-channel-touches')) }))`);
const outboxRows = (p) => p.evaljs(`[...document.querySelectorAll('.chan-api-outbox .chan-api-orow')].map((r) => ({ id: r.dataset.key, fate: r.dataset.fate, text: r.innerText }))`);
const forYou = (p) => p.evaljs(`(async () => { try { const r = await fetch('/api/user-todos'); const j = await r.json(); const s = j.todos; const list = Array.isArray(s) ? s : [].concat(...Object.values(s || {}).filter(Array.isArray)); return list.filter((i) => i && i.action && i.action.type === 'channel-api-proposal').map((i) => ({ id: i.action.id, status: i.status, state: i.state, resolved: !!(i.resolvedAt || i.doneAt || i.status === 'done' || i.status === 'resolved'), outcome: i.outcome || i.resolution || null, title: i.title })); } catch (e) { return String(e); } })()`);

const p1 = await newPage({ lang: 'zh' });
ok(p1.loaded, 'page 1 (zh, 1400 px) loaded the app');
ok(await openChat(p1), 'the agent\'s chat window opens');
await p1.evaljs('app.openChannelOutbox(); 1');

// ② a write-ask call ⇒ ONE card under the call row, ONE Outbox row, ONE For-you item
const c1 = await agentCalls('POST', '/api/chat.postMessage', { channel: 'C0VIBE', text: 'hello from the API' });
const pid1 = c1.json && c1.json.proposal && c1.json.proposal.id;
ok(c1.status === 202 && c1.json && c1.json.code === 'api_pending' && pid1, `a write under "ask each" is a proposal (202 api_pending ${pid1})`, c1.raw);
const seen1 = await until(async () => { const cc = await chatCards(p1), ob = await outboxRows(p1); return cc.length === 1 && ob.filter((r) => r.id === pid1).length === 1 ? { cc, ob } : null; }, 20000);
ok(seen1 && seen1.cc[0].id === pid1 && seen1.cc[0].fate === 'pending' && seen1.cc[0].underCall, 'ONE card in the chat, keyed by the proposal, right under the call row\'s touch box', seen1 || await chatCards(p1));
ok(seen1 && seen1.ob.length === 1 && seen1.ob[0].fate === 'pending', 'ONE Outbox "API calls" row for it (pending)', seen1 && seen1.ob);
const fy1 = await until(async () => { const f = await forYou(p1); return Array.isArray(f) && f.filter((i) => i.id === pid1).length === 1 ? f : null; });
ok(fy1, 'ONE For-you item names the proposal', await forYou(p1));
ok(seen1 && seen1.cc[0].always && /chat\.postMessage/.test(seen1.cc[0].text), 'a non-sensitive write card offers "Run and always allow <shape>" and shows the frozen request', seen1 && seen1.cc[0]);
ok(await p1.shot('api-card-chat-zh.png', '.chat-api-cards'), 'api-card-chat-zh.png');

// ③ Approve in the chat ⇒ the Outbox row and the For-you item resolve in place
await p1.evaljs(`(() => { const b = document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid1)}] .chan-api-approve'); b.click(); return 1; })()`);
const ran1 = await until(async () => { const ob = await outboxRows(p1), cc = await chatCards(p1); return ob.find((r) => r.id === pid1 && r.fate === 'ran') && cc.find((c) => c.id === pid1 && c.fate === 'ran') ? { ob, cc } : null; }, 20000);
ok(ran1 && /200/.test(ran1.ob.find((r) => r.id === pid1).text) && !ran1.cc.find((c) => c.id === pid1).approve, 'Approve in the chat ⇒ the Outbox row says it ran · 200, the chat card lost its buttons (patched in place)', ran1 || { ob: await outboxRows(p1), cc: await chatCards(p1), ans: await p1.evaljs('window.__answers') });
const fyRan = await until(async () => { const f = await forYou(p1); const it = Array.isArray(f) && f.find((i) => i.id === pid1); return it && it.status !== 'open' && it.status !== 'pending' ? it : null; });
ok(fyRan, 'the For-you item resolved in place', await forYou(p1));
ok(fs.readFileSync(path.join(STUB, 'calls.ndjson'), 'utf-8').split('\n').some((l) => /"host":"slack.com","path":"\/api\/chat\.postMessage"/.test(l)), 'the approved call reached the STUB vendor (slack.com answered by the fake)');

// ④ Reject from the For-you tray ⇒ the chat card says "Rejected by you"
const c2 = await agentCalls('POST', '/api/chat.postMessage', { channel: 'C0VIBE', text: 'second' });
const pid2 = c2.json && c2.json.proposal && c2.json.proposal.id;
await until(async () => (await chatCards(p1)).some((c) => c.id === pid2));
const tray = await p1.evaljs(`(async () => { const tb = document.getElementById('taskbar-user-todos'); if (tb && !(document.getElementById('user-todos-popup') || {}).offsetWidth) tb.click(); for (let i = 0; i < 60; i++) { const it = [...document.querySelectorAll('.ut-item')].find((r) => /second|chat\\.postMessage/.test(r.innerText) && [...r.querySelectorAll('button')].some((b) => /拒绝|Reject/.test(b.textContent))); if (it) { [...it.querySelectorAll('button')].find((b) => /拒绝|Reject/.test(b.textContent)).click(); return true; } await new Promise((r) => setTimeout(r, 250)); } return [...document.querySelectorAll('.ut-item')].map((r) => r.innerText.slice(0, 120)); })()`);
ok(tray === true, 'the For-you tray shows the item with a Reject button, pressed', tray);
const rej = await until(async () => (await chatCards(p1)).find((c) => c.id === pid2 && c.fate === 'rejected'), 15000);
ok(rej && /被你拒绝|Rejected by you/.test(rej.text), 'the chat card says it was rejected by you (zh)', rej || await chatCards(p1));

// ⑤ a sensitive card has NO "Run and always allow"
const c3 = await agentCalls('POST', '/api/chat.delete', { channel: 'C0VIBE', ts: '1.2' });
const pid3 = c3.json && c3.json.proposal && c3.json.proposal.id;
const sens = await until(async () => (await chatCards(p1)).find((c) => c.id === pid3));
ok(sens && sens.approve && !sens.always, 'a SENSITIVE card (chat.delete) has Approve but no "Run and always allow"', sens);
await api('POST', `/api/channels/api/proposals/${pid3}/reject`, {});

// ⑥ "Run and always allow <shape>" ⇒ the next same-shape call runs without a card; the dialog lists the shape + Revoke
const c4 = await agentCalls('POST', '/api/reactions.add', { channel: 'C0VIBE', name: 'thumbsup', timestamp: '1.2' });
const pid4 = c4.json && c4.json.proposal && c4.json.proposal.id;
await until(async () => (await chatCards(p1)).find((c) => c.id === pid4 && c.always));
await p1.evaljs(`(() => { document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid4)}] .chan-api-always').click(); return 1; })()`);
ok(await until(async () => (await cards()).find((r) => r.id === pid4 && C_ran(r))), '"Run and always allow" ran the call', (await cards()).find((r) => r.id === pid4));
function C_ran(r) { return r.status === 'ran' || r.status === 'done' || (r.outcome && r.outcome.status === 200); }
const before = (await cards()).length;
const c5 = await agentCalls('POST', '/api/reactions.add', { channel: 'C0VIBE', name: 'eyes', timestamp: '1.3' });
ok(c5.status === 200 && c5.json && c5.json.ok && (await cards()).length === before, 'the next same-shape call RUNS with no new card (200, no proposal)', c5.raw);
await sleep(800);
ok((await chatCards(p1)).length === 4, 'the chat holds exactly the four proposals\' cards — none for the always-allowed call', await chatCards(p1));
// open the dialog the user's way: the account card's ⋯ menu → "API access…" (falls back to the call row's click)
const opened = await p1.evaljs(`(async () => {
  app.sidebar._railGo && app.sidebar._railGo('channels');
  for (let i = 0; i < 60; i++) { if (document.getElementById('chan-api-dialog')) return 'already'; const row = document.querySelector('.chat-channel-touches .chat-channel-touch'); if (row) { row.click(); } await new Promise((r) => setTimeout(r, 250)); if (document.getElementById('chan-api-dialog')) return 'row'; }
  return false; })()`);
ok(!!opened, `the API access… dialog opens (${opened})`);
const dlg = await until(() => p1.evaljs(`(() => { const d = document.getElementById('chan-api-dialog'); if (!d || !d.querySelector('.chan-api-logrow')) return null; return { text: d.innerText, cred: [...d.querySelectorAll('.chan-api-cred option')].map((o) => o.textContent), tiers: [...d.querySelectorAll('.chan-api-row')].map((r) => ({ key: r.dataset.key, tier: r.querySelector('.chan-api-tier').value })), shapes: [...d.querySelectorAll('.chan-api-shape')].map((s) => ({ text: s.innerText, revoke: !!s.querySelector('button') })), sens: (d.querySelector('.chan-api-sensitive') || {}).textContent || '', logs: d.querySelectorAll('.chan-api-logrow').length }; })()`), 15000);
ok(dlg && dlg.cred.length === 1 && /^Channels|^频道/.test(dlg.cred[0]), 'the dialog: ONE credential picker labelled by its source', dlg && dlg.cred);
ok(/档位：读写，每次询问|所在档位：读/.test(seen1 && seen1.cc[0].text || '') || /所在档位：(?!write)/.test(seen1 && seen1.cc[0].text || ''), 'the card words its tier as the dialog does (not the raw id)', seen1 && seen1.cc[0].text);
ok(dlg && dlg.tiers.length === 1 && dlg.tiers[0].key === `agent:${sid}` && dlg.tiers[0].tier === 'write-ask', 'the dialog: the agent\'s row at "Read + write, ask each"', dlg && dlg.tiers);
ok(dlg && /delete/.test(dlg.sens) && !/\\\/|\^/.test(dlg.sens), 'the dialog: the vendor\'s sensitive list, worded (no regex source)', dlg && dlg.sens);
ok(dlg && dlg.shapes.length === 1 && /reactions\.add/.test(dlg.shapes[0].text) && dlg.shapes[0].revoke, 'the dialog: the always-allowed shape with its Revoke', dlg && dlg.shapes);
ok(dlg && dlg.logs >= 2, `the dialog: the API log (${dlg && dlg.logs} rows)`);
ok(await p1.shot('api-dialog-zh.png', '#chan-api-dialog .modal-content, #chan-api-dialog > *'), 'api-dialog-zh.png');
const zhLeft = dlg ? ['API access', 'Credential', 'Always allowed', 'Waiting for you', 'API log', 'Revoke', ' · proposed', ' · ok', ' · approved'].filter((w) => dlg.text.includes(w)) : ['no dialog'];
ok(!zhLeft.length, 'zh: no English label left in the dialog', zhLeft);
p1.close();

// en + ja words
for (const lang of ['en', 'ja']) {
  const p = await newPage({ lang });
  await openChat(p);
  await p.evaljs(`(async () => { for (let i = 0; i < 60; i++) { const row = document.querySelector('.chat-channel-touches .chat-channel-touch'); if (row) { row.click(); return 1; } await new Promise((r) => setTimeout(r, 250)); } return 0; })()`);
  const tx = await until(() => p.evaljs(`(() => { const d = document.getElementById('chan-api-dialog'); return d && d.querySelector('.chan-api-shape') ? d.innerText : null; })()`), 15000);
  const want = lang === 'en' ? /API access[\s\S]*Always allowed[\s\S]*Revoke/ : /常に許可|取り消/;
  ok(tx && want.test(tx) && (lang === 'en' || !/Always allowed|Waiting for you/.test(tx)), `${lang}: the dialog speaks ${lang}`, tx && tx.slice(0, 400));
  p.close();
}

// ⑦ 390 px: a pending card, nothing off-screen, the action row wraps
const c6 = await agentCalls('POST', '/api/chat.postMessage', { channel: 'C0VIBE', text: 'a phone-width card with a long enough body to wrap '.repeat(3) });
const pid6 = c6.json && c6.json.proposal && c6.json.proposal.id;
const p3 = await newPage({ lang: 'zh', width: 390, height: 844 });
await openChat(p3);
const phone = await until(() => p3.evaljs(`(() => { const c = document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}]'); if (!c || !c.offsetWidth) return null; c.scrollIntoView({ block: 'center' }); const off = [...c.querySelectorAll('*')].filter((e) => e.offsetWidth && (e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5)).map((e) => e.className + ' ' + Math.round(e.getBoundingClientRect().right)); const btns = [...c.querySelectorAll('.chan-api-actions > *')].map((b) => Math.round(b.getBoundingClientRect().top)); const r = c.getBoundingClientRect(), top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + Math.min(r.height, innerHeight) / 2)); return top && c.contains(top) ? { off, rows: new Set(btns).size, w: Math.round(r.width) } : null; })()`), 30000);
ok(phone && !phone.off.length, `390 px: the card is on top (no overlay) and nothing of it is off-screen (card ${phone && phone.w} px)`, phone);
ok(phone && phone.rows >= 2, `390 px: the action row wraps (${phone && phone.rows} lines)`, phone);
ok(await p3.shot('api-card-phone-zh.png', `.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}]`), 'api-card-phone-zh.png');
p3.close();

// ⑧ CONTROL: the card without the frozen digest ⇒ Approve answers 409, nothing runs
const pc = await newPage({ lang: 'zh', control: true });
await openChat(pc);
await until(() => pc.evaljs(`!!document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}] .chan-api-approve')`), 20000);
await pc.evaljs(`(() => { document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}] .chan-api-approve').click(); return 1; })()`);
const ctl = await until(() => pc.evaljs('window.__answers.find((a) => /approve/.test(a.u))'), 10000);
ok(ctl && ctl.status === 409 && (await cards()).find((r) => r.id === pid6).status === 'pending', 'CONTROL: a card that answers without its frozen digest gets 409 — the proposal still waits, nothing ran (RED for that card)', ctl);
pc.close();
const p4 = await newPage({ lang: 'zh' });
await openChat(p4);
await until(() => p4.evaljs(`!!document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}] .chan-api-approve')`), 20000);
await p4.evaljs(`(() => { document.querySelector('.chat-api-cards .chan-api-card[data-key=${JSON.stringify(pid6)}] .chan-api-approve').click(); return 1; })()`);
const real = await until(() => p4.evaljs('window.__answers.find((a) => /approve/.test(a.u))'), 10000);
ok(real && real.status === 200, '…and the real bundle\'s Approve on the same card answers 200', real);
p4.close();
ok(!fs.readFileSync(path.join(STUB, 'calls.ndjson'), 'utf-8').split('\n').filter(Boolean).some((l) => !/"host":"slack.com"/.test(l)), 'every intercepted vendor call went to the stub (slack.com only)');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
if (fail && process.env.API_CHROME_DEBUG) console.error(srvLog.join('').slice(-3000));
process.exit(fail ? 1 : 0);
