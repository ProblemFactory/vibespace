#!/usr/bin/env node
// test-webhook-ui-e2e — THE WEBHOOK OWNER SURFACE IN A REAL BROWSER (lane webhook-l2-ui, docs/design-webhook.zh.md §12
// L2). A throwaway worktree of THIS tree runs `node server.js` (sign-in off), one stub agent session (dtach + a stub CLI
// that records its frames), a stub reply URL on loopback, and headless Chrome. Legs: the Webhook section (listed, no
// sign-in / remove verbs, "New path…"); the wizard (the slug judged live by the server's rule, create ⇒ the address);
// the caller panel (register HMAC + Bearer + a no-reply caller ⇒ each token shown ONCE and gone after close); a SECOND
// client's open caller panel shows each new caller live; a call per caller ⇒ two records with the right authors; a
// `fact event == deploy.failed` notification wakes alpha ONCE and the budget row counts it; a spent budget ⇒ the
// engine's words in the header; a Quote + Send ⇒ the caller named under the box and the stub receives the signed POST;
// "Send a message… → All" ⇒ two proposals (one POSTed, one queued for poll), the no-reply caller disabled WITH its
// reason; desk 1100 + phone 390. PNGs into $WEBHOOK_UI_PNG_DIR when set. Heavy. Run: node scripts/test-webhook-ui-e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WA = require(path.join(repo, 'src/webhook-auth.js'));
const WebSocket = require('ws');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no Chrome'); process.exit(0); }
try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); } catch (e) { if (e.code === 'ENOENT') { console.log('SKIP: no dtach on PATH (the stub agent session is a dtach session)'); process.exit(0); } }
const PNG_DIR = process.env.WEBHOOK_UI_PNG_DIR || '';

const VNC_ENV = await vncEnv();
const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('webhook-ui');
const chromeDir = scratch('webhook-ui-chrome');
const fakeHome = scratchHome('webhook-ui-home', fs);
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data/settings.json'), JSON.stringify({ 'webhook.allowPrivateReplyUrl': true, 'channels.pushCoalesceSeconds': 0 }));
// ── the stub agent session (test-webhook-routes' recipe): a dtach master whose program records every frame it is handed ──
const STUB = path.join(wt, 'stub-cli.cjs');
fs.writeFileSync(STUB, `'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const [cid, name, sock, log] = process.argv.slice(2);
try { fs.unlinkSync(sock); } catch {}
const dir = path.join(process.env.HOME, '.claude', 'sessions');
fs.mkdirSync(dir, { recursive: true });
const srv = net.createServer((c) => { let buf = ''; c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) fs.appendFileSync(log, line + '\\n'); } }); });
srv.listen(sock, () => fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sock, name })));
setInterval(() => {}, 1 << 30);
`);
const SOCK_DIR = path.join(wt, 'data/sockets'), META_DIR = path.join(wt, 'data/session-meta');
fs.mkdirSync(SOCK_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
const AG = { cid: 'b2b2b2b2-0000-4000-8000-0000000000b2', name: 'alpha', sockName: `cw-1-${T0}` };
AG.inbox = path.join(wt, 'inbox-a.sock'); AG.log = path.join(wt, 'frames-a.ndjson');
fs.writeFileSync(path.join(META_DIR, AG.sockName + '.json'), JSON.stringify({ webuiSessionId: 'sess-whui-a', sockName: AG.sockName, claudeSessionId: AG.cid, backendSessionId: AG.cid, name: AG.name, mode: 'chat', backend: 'claude', cwd: wt, createdAt: T0 }));
execFileSync('dtach', ['-n', path.join(SOCK_DIR, AG.sockName), '-E', '-z', process.execPath, STUB, AG.cid, AG.name, AG.inbox, AG.log], { env: { ...process.env, HOME: fakeHome } });
const frames = () => { try { return fs.readFileSync(AG.log, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.type === 'user'); } catch { return []; } };
// ── the caller's reply URL (loopback) ──
const received = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: b }); res.end('{"ok":true}'); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const REPLY_URL = `http://127.0.0.1:${stub.address().port}/in`;
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1100,800', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }   // §57b: whatever the server (and the dtach stub) started under the scratch tree
  try { stub.close(); } catch { }
  try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch { }
  try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [fakeHome, wt, chromeDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { cleanup(); process.exit(143); });

const raw = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
  const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j }); }); });
  req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
  if (b !== null) req.write(b); req.end();
});
const hmacHex = (k, t) => crypto.createHmac('sha256', k).update(t).digest('hex');
const signed = (slug, b, tok, id, extra = {}) => { const t = String(Math.floor(Date.now() / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, WA.signatureBase(t, '/hook/' + slug, b)), ...extra }; };

async function newPage(metrics = null) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const tg = await r.json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  if (metrics) await cdp('Emulation.setDeviceMetricsOverride', metrics);
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result && r2.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 600));
    return r2.result && r2.result.result ? r2.result.result.value : undefined;
  };
  const until = async (expr, ms = 15000) => waitFor(async () => evaljs(expr), ms, 150);
  const load = async (lang) => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    // the splash covers the page until app.ready (+ its 300 ms fade) — a PNG taken under it shows only the logo
    return !!(await until("!!(window.app && window.app.wm && window.app.sidebar) && !document.getElementById('loading-screen')", 40000));
  };
  const shot = async (name, sel = null) => {
    if (!PNG_DIR) return;
    const box = sel ? await evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 }; })()`) : null;
    const s = await cdp('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 } } : {}) });
    if (s.result && s.result.data) fs.writeFileSync(path.join(PNG_DIR, name), Buffer.from(s.result.data, 'base64'));
  };
  return { cdp, evaljs, until, load, shot, close: () => { try { ws.close(); } catch { } } };
}
// page helpers (run IN the page): set a field's value as a person types it; click by selector
const TYPE = (sel, v) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
const CLICK = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`;
const RAIL = `(async () => { const sb = window.app.sidebar; if (!sb._railEl) return false; sb._railGo('channels'); return true; })()`;

try {
  const up = await waitFor(async () => (await raw('GET', '/api/channels/webhook/paths')).status === 200, 60000, 300);
  ok(!!up, 'FIXTURE: the worktree server is up (sign-in off)');
  let roster = null;
  for (let i = 0; i < 60; i++) { roster = await raw('GET', '/api/channel-groups/roster'); if (roster.j && Array.isArray(roster.j.sessions) && roster.j.sessions.some((x) => x.cid === AG.cid)) break; await sleep(500); }
  ok(roster.j && roster.j.sessions.some((x) => x.cid === AG.cid), 'FIXTURE: the server adopted the stub agent session (alpha)');
  for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
  const p1 = await newPage({ width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  ok(await p1.load('en'), 'page 1 (desk 1100) loaded the app');

  console.log('§1 the Webhook section');
  await p1.evaljs(RAIL);
  const sec = await p1.until(`(() => { const s = document.querySelector('.rail-panel-channels [data-adapter="webhook"]'); return s && s.querySelector('[data-wh-new-path]') ? { name: s.querySelector('.chan-sec-name').textContent, connect: !!s.querySelector('.chan-connect'), signIn: /sign in|re-authorize/i.test(s.textContent) } : null; })()`, 20000);
  ok(sec && sec.name === 'Webhook' && !sec.connect && !sec.signIn, 'the Webhook section is listed with "New path…" and no sign-in row', sec);
  await p1.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels [data-adapter="webhook"] .chan-sec-more'); b.click(); return true; })()`);
  const menu = await p1.until(`(() => { const m = [...document.querySelectorAll('.context-menu .context-menu-item, .ctx-menu-item, [role="menuitem"]')].map((x) => x.textContent.trim()).filter(Boolean); return m.length ? m : null; })()`, 5000);
  ok(Array.isArray(menu) && !menu.some((x) => /Remove|Disconnect|Re-authorize|Duplicate|^Connect$/.test(x)) && menu.some((x) => /Reach & policy/.test(x)), 'its ⋯ has no Remove / Disconnect / Re-authorize / Duplicate (not removable, no sign-in) — Reach & policy is there', menu);
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p1.evaljs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
  await p1.shot('section.png', '.rail-panel-channels [data-adapter="webhook"]');

  console.log('§2 the New path wizard');
  ok(await p1.evaljs(CLICK('[data-wh-new-path]')) && await p1.until(`!!document.querySelector('[data-wh-wizard]')`), 'New path… opens the wizard');
  await p1.evaljs(TYPE('[data-wh-slug]', 'Bad Slug'));
  const w1 = await p1.evaljs(`document.querySelector('[data-wh-slug-note]').textContent`);
  await p1.evaljs(TYPE('[data-wh-slug]', 'groups'));
  const w2 = await p1.evaljs(`document.querySelector('[data-wh-slug-note]').textContent`);
  await p1.evaljs(TYPE('[data-wh-slug]', 'deploys'));
  const w3 = await p1.evaljs(`({ note: document.querySelector('[data-wh-slug-note]').textContent, at: document.querySelector('.chan-wh-at').textContent })`);
  ok(/a-z, 0-9/.test(w1) && /reserved/.test(w2) && w3.note === '' && w3.at.includes('/hook/deploys'), 'the slug is judged live by the server\'s rule: grammar, reserved, then good (its address shown)', [w1, w2, w3]);
  // the mapping: text at `text`, sender at `who`, one declared fact `event`
  await p1.evaljs(`(() => { const ins = [...document.querySelectorAll('[data-wh-wizard] .chan-wh-field input')]; const by = (ph) => ins.find((i) => i.placeholder === ph); const set = (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set(ins[1], 'Deploys'); set(by('message'), 'text'); set(by('sender.name'), 'who'); return true; })()`);
  await p1.evaljs(CLICK('[data-wh-wizard] .chan-wh-add'));
  await p1.evaljs(`(() => { const [k, p] = document.querySelectorAll('[data-wh-wizard] .chan-wh-fact input'); k.value = 'event'; k.dispatchEvent(new Event('input')); p.value = 'event'; p.dispatchEvent(new Event('input')); return true; })()`);
  await p1.shot('wizard.png', '[data-wh-wizard]');
  await p1.evaljs(CLICK('[data-wh-create]'));
  const made = await p1.until(`(() => { const u = document.querySelector('[data-wh-wizard] [data-wh-url="deploys"]'); return u ? u.textContent : null; })()`);
  const pv = await raw('GET', '/api/channels/webhook/paths');
  const P = pv.j && pv.j.paths.find((x) => x.hookUrl === '/hook/deploys');
  ok(made && made.endsWith('/hook/deploys') && P && P.options.textPath === 'text' && P.options.senderKey === 'who' && P.options.wakesPerHour === 6 && JSON.stringify(P.options.facts) === '[{"key":"event","path":"event"}]', 'Create makes the path with its mapping + declared fact + 6 wakes/hour and shows its address with Copy', [made, P && P.options]);

  console.log('§3 a second client opens the path\'s caller panel');
  const p2 = await newPage({ width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  ok(await p2.load('en'), 'page 2 (a second client) loaded');
  await p2.evaljs(`window.app.openChannel('webhook', 'deploys'); true`);
  ok(!!(await p2.until(`!!document.querySelector('[data-wh-callers-open]')`, 20000)) && await p2.evaljs(CLICK('[data-wh-callers-open]')) && !!(await p2.until(`!!document.querySelector('[data-wh-callers="deploys"]')`)), 'page 2: the path\'s window offers Callers… (capability row) and opens the panel');

  console.log('§4 register three callers — each token shown ONCE');
  ok(await p1.evaljs(CLICK('[data-wh-wizard] .dialog-footer .mounts-btn-primary')) && !!(await p1.until(`!!document.querySelector('[data-wh-register]') && document.querySelector('[data-wh-register]').style.display !== 'none'`)), '"Register a caller…" opens the caller panel with the form');
  const tokens = [];
  const register = async (name, auth, mode, url = '') => {
    await p1.evaljs(`(() => { const f = document.querySelector('[data-wh-register]'); f.style.display = ''; const [n, u] = [...f.querySelectorAll('input')]; n.value = ${JSON.stringify(name)}; const [a, d] = [...f.querySelectorAll('select')]; a.value = ${JSON.stringify(auth)}; d.value = ${JSON.stringify(mode)}; d.dispatchEvent(new Event('change')); u.value = ${JSON.stringify(url)}; f.querySelector(':scope > .mounts-btn-primary').click(); return true; })()`);
    const tk = await p1.until(`(() => { const d = document.querySelector('[data-wh-token-once]'); return d ? { token: d.querySelector('[data-wh-token]').textContent, text: d.textContent } : null; })()`);
    return tk;
  };
  const t1 = await register('CI deploy-bot', 'hmac', 'reply-url', REPLY_URL);
  ok(t1 && /^vswh_/.test(t1.token) && /Shown once — rotate to get a new one/.test(t1.text) && /X-Webhook-Signature/.test(t1.text), 'HMAC caller registered: its token in the token-once dialog, with the words and how to sign', t1 && t1.text.slice(0, 200));
  await p1.shot('token-once.png', '[data-wh-token-once]');
  await p1.evaljs(CLICK('[data-wh-token-once] .dialog-footer .mounts-btn-primary'));
  await sleep(300);
  const gone1 = await p1.evaljs(`!document.querySelector('[data-wh-token-once]') && !document.documentElement.outerHTML.includes(${JSON.stringify(t1 ? t1.token : 'x')})`);
  ok(gone1, 'after Done the token is nowhere in the page (the caller panel never re-renders it)');
  tokens.push(t1 && t1.token);
  const t2 = await register('Monitor', 'bearer', 'poll');
  ok(t2 && /^vswh_/.test(t2.token) && /Authorization: Bearer/.test(t2.text), 'Bearer caller registered (poll delivery): its token once, with the header to send it in');
  await p1.evaljs(CLICK('[data-wh-token-once] .dialog-footer .mounts-btn-primary'));
  tokens.push(t2 && t2.token);
  const t3 = await register('Audit log', 'hmac', 'none');
  await p1.evaljs(CLICK('[data-wh-token-once] .dialog-footer .mounts-btn-primary'));
  const list = await p1.until(`(() => { const r = [...document.querySelectorAll('[data-wh-callers="deploys"] [data-wh-caller]')]; return r.length === 3 ? r.map((x) => x.textContent) : null; })()`);
  ok(list && /HMAC-signed/.test(list[0]) && /Replies are POSTed to/.test(list[0]) && /Bearer token/.test(list[1]) && /fetch them/.test(list[1]) && /Takes no replies/.test(list[2]) && !tokens.concat(t3 && t3.token).some((x) => list.join('').includes(x)), 'the caller panel lists all three (auth, delivery, dates) and no token', list);
  await p1.shot('callers.png', '[data-wh-callers-dialog]');
  const live = await p2.until(`(() => { const r = [...document.querySelectorAll('[data-wh-callers="deploys"] [data-wh-caller]')]; return r.length === 3 ? r.map((x) => x.querySelector('.chan-wh-caller-name').textContent) : null; })()`, 15000);
  ok(live && live.join('|') === 'CI deploy-bot|Monitor|Audit log', 'page 2: each new caller appeared in its open caller panel live (no reload)', live);
  await p2.evaljs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);

  console.log('§5 a fact rule, a call per caller, the budget row');
  const cs = (await raw('GET', '/api/channels/webhook/paths')).j.paths.find((x) => x.hookUrl === '/hook/deploys').callers;
  const ID1 = cs.find((c) => c.name === 'CI deploy-bot').id, ID2 = cs.find((c) => c.name === 'Monitor').id;
  const acc = await raw('PUT', '/api/channels/webhook/deploys/access', { body: { access: [{ principal: { kind: 'agent', id: AG.cid, name: AG.name }, authority: 'send' }] } });
  const wat = await raw('PUT', '/api/channels/webhook/deploys/watchers', { body: { watchers: [{ principal: { kind: 'agent', id: AG.cid, name: AG.name }, notify: 'wake', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'fact', key: 'event', value: 'deploy.failed' }] } }] } });
  ok(acc.status === 200 && wat.status === 200, 'FIXTURE: alpha holds send access and a `fact event == deploy.failed` notification', [acc.t.slice(0, 160), wat.t.slice(0, 200)]);
  const f0 = frames().length;
  const b1 = JSON.stringify({ text: 'deploy failed on db1', event: 'deploy.failed', who: 'ci-runner' });
  const c1 = await raw('POST', '/hook/deploys', { headers: signed('deploys', b1, tokens[0], ID1, { 'Idempotency-Key': 'df-1' }), body: b1 });
  const c2 = await raw('POST', '/hook/deploys', { headers: { Authorization: 'Bearer ' + tokens[1], 'Idempotency-Key': 'disk-1' }, body: { text: 'disk at 91%', event: 'disk.high' } });
  ok(c1.status === 200 && c2.status === 200, 'a signed call (HMAC) and a Bearer call both land', [c1.t, c2.t]);
  const woke = await waitFor(() => frames().length > f0, 20000);
  await sleep(1200);
  ok(woke && frames().length - f0 === 1 && JSON.stringify(frames().slice(f0)).includes('deploy failed on db1'), `the fact rule woke alpha ONCE (the disk call none): ${frames().length - f0} frame(s)`);
  await p1.evaljs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); window.app.openChannel('webhook', 'deploys'); true`);
  const rows = await p1.until(`(() => { const w = [...document.querySelectorAll('.chanmsg')].filter((r) => /deploy failed on db1|disk at 91%/.test(r.textContent)); return w.length === 2 ? w.map((r) => r.textContent.slice(0, 160)) : null; })()`, 20000);
  ok(rows && rows.some((x) => x.includes('CI deploy-bot') && x.includes('deploy failed')) && rows.some((x) => x.includes('Monitor') && x.includes('disk at 91%')), 'two records in the window, each with its caller as the author', rows);
  const bud = await p1.until(`(() => { const b = document.querySelector('[data-wh-budget]'); return b && /1 \\/ 6/.test(b.textContent) ? b.textContent : null; })()`, 15000);
  // the rail is a toggle: open it only when its panel is not showing (a second _railGo would fold it)
  await p1.evaljs(`(() => { const s = document.querySelector('.rail-panel-channels [data-adapter="webhook"]'); if (!s || !s.getBoundingClientRect().width) window.app.sidebar._railGo('channels'); return true; })()`);
  await p1.until(`(() => { const r = document.querySelector('.rail-panel-channels [data-adapter="webhook"] .chan-row .chan-av-vs'); return !!r && r.getBoundingClientRect().width > 0; })()`, 10000);
  await p1.shot('section.png', '.rail-panel-channels [data-adapter="webhook"]');
  ok(bud === 'path deploys: 1 / 6 wakes this hour', 'the header\'s budget row counts the wake: "path deploys: 1 / 6 wakes this hour"', bud);
  // the Notify dialog: the fact rule row (key + value fields) and the budget line
  await p1.evaljs(`(() => { const m = document.querySelector('.chanwin-title-row .icon-btn'); m.click(); return true; })()`);
  await p1.until(`[...document.querySelectorAll('.context-menu-item, [role="menuitem"]')].some((x) => /Notify/.test(x.textContent))`, 5000);
  await p1.evaljs(`(() => { const it = [...document.querySelectorAll('.context-menu-item, [role="menuitem"]')].find((x) => /^Notify/.test(x.textContent.trim())); it.click(); return true; })()`);
  const nd = await p1.until(`(() => { const b = document.querySelector('[data-wh-budget-row]'); const r = [...document.querySelectorAll('.chan-af-rule')].find((x) => x.querySelector('select') && x.querySelector('select').value === 'fact'); return b && r ? { budget: b.textContent, key: r.querySelectorAll('input')[0].value, value: r.querySelectorAll('input')[1].value } : null; })()`, 15000);
  ok(nd && nd.key === 'event' && nd.value === 'deploy.failed' && /^path deploys: 1 \/ 6 wakes this hour — a digest by default here/.test(nd.budget), 'the Notify dialog draws the fact rule (key = event, value = deploy.failed) and the budget line', nd);
  await p1.evaljs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);

  console.log('§6 a spent budget says the engine\'s words');
  const put = await raw('PUT', '/api/channels/webhook/paths/deploys', { body: { wakesPerHour: 1 } });
  const b3 = JSON.stringify({ text: 'deploy failed again', event: 'deploy.failed' });
  await raw('POST', '/hook/deploys', { headers: signed('deploys', b3, tokens[0], ID1, { 'Idempotency-Key': 'df-2' }), body: b3 });
  const spent = await p1.until(`(() => { const b = document.querySelector('[data-wh-budget="spent"]'); return b ? b.textContent : null; })()`, 20000);
  ok(put.status === 200 && spent && /^path deploys used 1 \/ 1 wakes this hour \(woke /.test(spent) && frames().length - f0 === 1, 'the budget spent: the header shows the engine\'s refusal words as written, and nobody was woken again', spent);

  console.log('§7 reply to a record ⇒ its caller, a signed POST');
  await p1.evaljs(`(() => { const r = [...document.querySelectorAll('.chanmsg')].find((x) => /deploy failed on db1/.test(x.textContent)); r.querySelector('.chanmsg-bar-btn[data-act="quote"]').click(); return true; })()`);
  const to = await p1.until(`(() => { const e = document.querySelector('[data-wh-to]'); return e && /CI deploy-bot/.test(e.textContent) ? e.textContent : null; })()`);
  ok(to === 'to CI deploy-bot (caller)', 'Quote names the caller under the reply box: "to CI deploy-bot (caller)"', to);
  await p1.evaljs(`(() => { const ta = document.querySelector('.chanwin-composer textarea'); ta.value = 'rolling back db1 now'; ta.dispatchEvent(new Event('input')); return true; })()`);
  await p1.shot('reply.png', '.chanwin-composer');
  const n0 = received.length;
  await p1.evaljs(CLICK('.chanwin-composer [data-channel-direct]'));
  const got = await waitFor(() => received.slice(n0).find((x) => x.body.includes('rolling back db1 now')), 15000);
  ok(got && /^v1=[0-9a-f]{64}$/.test(String(got.headers['x-webhook-signature'] || '')) && JSON.parse(got.body).from.name === 'VibeSpace' && !!JSON.parse(got.body).inReplyTo, 'the stub received the reply as a signed POST, from VibeSpace, in reply to the call', got && { h: got.headers['x-webhook-signature'], b: got.body.slice(0, 200) });

  console.log('§8 Send a message… → All ⇒ two proposals; the no-reply caller disabled WITH its reason');
  ok(await p1.evaljs(CLICK('[data-wh-send-open]')) && !!(await p1.until(`!!document.querySelector('[data-wh-send="deploys"]')`)), 'Send a message… opens the caller picker');
  const pick = await p1.evaljs(`[...document.querySelectorAll('[data-wh-send] .chan-wh-pick')].map((l) => ({ text: l.textContent, off: !!(l.querySelector('input[data-wh-pick]') || {}).disabled, why: (l.querySelector('.chan-wh-why') || {}).textContent || null }))`);
  ok(pick.length === 4 && pick[3].off && /takes no replies/.test(pick[3].why || '') && !pick[1].off && !pick[2].off, 'All + three callers; "Audit log" (delivery none) is disabled WITH its reason beside it', pick);
  await p1.evaljs(`(() => { const a = document.querySelector('[data-wh-pick-all]'); a.checked = true; a.dispatchEvent(new Event('change')); const ta = document.querySelector('[data-wh-send] textarea'); ta.value = 'maintenance at 22:00'; return true; })()`);
  await p1.shot('send.png', '[data-wh-send]');
  const n1 = received.length;
  // every toast this send raises, as it appears (a later one may replace an earlier in the stack)
  await p1.evaljs(`(() => { window.__whToasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('global-toast')) window.__whToasts.push(n.textContent); }).observe(document.body, { childList: true, subtree: true }); return true; })()`);
  await p1.evaljs(CLICK('[data-wh-send-go]'));
  const toasts = await p1.until(`(() => { const t = window.__whToasts || []; return t.some((x) => /Queued for Monitor to fetch/.test(x)) && t.some((x) => /Sent to CI deploy-bot/.test(x)) ? t : null; })()`, 15000);
  const posted = await waitFor(() => received.slice(n1).find((x) => x.body.includes('maintenance at 22:00')), 10000);
  const polled = await raw('GET', '/api/channels/webhook/deploys/replies?wait=0', { headers: { Authorization: 'Bearer ' + tokens[1] } });
  ok(toasts && posted && polled.status === 200 && polled.t.includes('maintenance at 22:00'), 'two proposals: POSTed to CI deploy-bot, queued for Monitor (its poll returns it); each outcome toasted', [toasts, polled.status, polled.t.slice(0, 200)]);

  console.log('§9 the phone (390)');
  const p3 = await newPage({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  ok(await p3.load('zh'), 'page 3 (phone 390, zh) loaded');
  await p3.evaljs(`window.app.openChannel('webhook', 'deploys'); true`);
  const btn3 = await p3.until(`(() => { const b = document.querySelector('[data-wh-callers-open]'); return b ? b.textContent : null; })()`, 20000);
  await p3.evaljs(CLICK('[data-wh-callers-open]'));
  const ph = await p3.until(`(() => { const b = document.querySelector('[data-wh-callers-open]'); const d = document.querySelector('[data-wh-callers-dialog]'); return d && d.querySelectorAll('[data-wh-caller]').length === 3 ? { w: d.getBoundingClientRect().width, vw: innerWidth, label: b.textContent } : null; })()`, 20000);
  ok(ph && ph.w <= ph.vw && ph.label === '调用方…', 'phone: the path window\'s 调用方… opens the caller panel inside the 390 px screen', ph);
  await sleep(400);
  await p3.shot('phone.png');
  for (const pg of [p1, p2, p3]) pg.close();
} catch (e) { ok(false, 'the suite ran to its end', String(e && e.stack || e).slice(0, 900)); }
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} — ${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
