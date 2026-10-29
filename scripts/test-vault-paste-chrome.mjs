#!/usr/bin/env node
// A SECRET PASTED INTO FOR YOU, IN A REAL PAGE (heavy, chrome — lane vault-paste-request; the owner 2026-10-23: 「应该允许你给我
// 弹一个保险库输入框让我直接 paste 进去，省得我还得手动去保险库搞」). A worktree hub WITH a sign-in password, a stub CLI behind the REAL
// chat wrapper (a live conversation through the real create path, with its own session token — the suite plays its agent),
// a real headless Chrome on the built bundle:
//   ① sign in, set the second password from the page, a live conversation and its token
//   ② THE ASK: the agent's `vibespace-vault request "<what>" --purpose "<why>" --into llm.apiKey` ⇒ exit 0, a request id;
//      the tray's row says what · what for · where it goes, above a MASKED box (a password field, autocomplete off, no reply
//      box) with 存入保险库 / 拒绝
//   ③ PASTE ⇒ STORED: the value pasted (CDP Input.insertText — the keyboard's paste) and 存入保险库 pressed (a real click) ⇒ the
//      toast, the row resolved (its box gone), the Integrations card holds the key (set, masked); the agent's NEXT TURN (the
//      prompt-context its hook reads) carries «STORED … llm.apiKey … for: <purpose>»; `vibespace-vault uses` shows the paste
//   ④ THE VALUE IS NOWHERE: the page's DOM (markup, text, every field), every WebSocket frame the page saw, the server log,
//      the agent's next turn ⇒ 0 hits
//   ⑤ 拒绝: a second ask refused in the tray ⇒ the agent's next turn says REFUSED
//   ⑥ THE PHONE (448×850, touch) over a RESTART (the hub boots LOCKED — no lock act): a free-entry ask filed before it waits in
//      the phone's tray sheet saying vault_locked with 解锁… inline; 解锁… opens THE unlock dialog; unlocked ⇒ the box is ready
//      (a 16 px field, ≥ 36 px targets) and the paste stores a `secret:<id>` entry the Vault window lists by its label
//   ⑦ RED CONTROL (saved by Enter in the box): a mutant hub whose paste door logs the value and files it on an item ⇒ the same checks find it in the server
//      log, the DOM and a WebSocket frame (they see a leak when there is one)
// Run: node scripts/test-vault-paste-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vpaste-wt'), PROFILE = scratch('vpaste-chrome'), fakeHome = scratch('vpaste-home'), stubDir = scratch('vpaste-stub');
for (const d of [fakeHome, stubDir]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'paste-leg-sign-in-7';
const SECOND = 'paste leg second password';
const SID = crypto.randomUUID();
// THE PASTED VALUES — sentinels (no credential shape a secret scan reads), each searched for raw, hex, base64, base64url
const V_FIELD = ['pasted', 'judge', 'key', crypto.randomBytes(8).toString('hex')].join('-');
const V_ENTRY = ['pasted', 'phone', 'secret', crypto.randomBytes(8).toString('hex')].join('-');
const V_RED = ['mutant', 'leaked', 'value', crypto.randomBytes(8).toString('hex')].join('-');
const formsOf = (v) => [v, Buffer.from(v).toString('hex'), Buffer.from(v).toString('base64'), Buffer.from(v).toString('base64url')];
const hitsIn = (text, v) => formsOf(v).filter((f) => String(text).includes(f)).length;

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// the stub CLI: a live conversation (its init names SID); it answers nothing — the suite plays its agent
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: ${JSON.stringify(SID)}, uuid: 'u-' + process.pid }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

const LOG = path.join(stubDir, 'server.log');
let srv = null;
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); if (p.exitCode !== null || p.signalCode !== null) { clearTimeout(t); r(); return; } p.once('exit', () => { clearTimeout(t); r(); }); }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(300); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [wt, fakeHome, stubDir]) { try { endRootedProcesses(r); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [wt, PROFILE, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
const WS_FRAMES = [];   // every WebSocket frame the PAGE saw (received and sent) — the multi-client broadcasts included
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.webSocketFrameReceived' || m.method === 'Network.webSocketFrameSent') WS_FRAMES.push(String((m.params.response && m.params.response.payloadData) || ''));
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, hits: !!hit && (hit === el || el.contains(hit)) }; })()`);
const realClick = async (sel) => { const p = await centerOf(sel); if (!p || !p.hits) return p || false; await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await sleep(100); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); return true; };
const tap = async (sel) => { const p = await centerOf(sel); if (!p || !p.hits) return p || false; await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(60); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250); return true; };
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const pageApi = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
/** every place a value could show on the page: the markup, the rendered text, every field's value */
const pageText = () => evalJs(`document.documentElement.outerHTML + '\\n' + (document.body ? document.body.innerText : '') + '\\n' + [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('\\n')`);
const cli = (args, token) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-vault'), ...args], { env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); const k = setTimeout(() => c.kill('SIGKILL'), 20000); c.on('close', (code) => { clearTimeout(k); resolve({ code, out }); }); });
const nextTurn = async (token) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/agent/prompt-context`, { headers: { Authorization: 'Bearer ' + token } }); const j = await r.json().catch(() => ({})); return String(j.context || ''); };
const TRAY = '#user-todos-popup';
const boxOf = (id) => `${TRAY} .ut-secret[data-req="${id}"]`;
const trayOpen = () => evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
const splashGone = () => until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
/** ask through the CLI until the conversation's id is captured (the door refuses a session with none yet) */
const ask = async (args, token) => { let r = null; for (let i = 0; i < 40; i++) { r = await cli(['request', ...args], token); if (r.code === 0) break; await sleep(300); } return { ...r, id: (/\((sr-[0-9a-f]{12})\)/.exec(r.out) || [])[1] || null }; };

try {
  await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  startServer();
  check('the hub boots (sign-in password on)', await ready());
  const URL = `http://127.0.0.1:${PORT}/`;

  console.log('① sign in, the second password, a live conversation');
  await cdp('Page.navigate', { url: URL + 'login' });
  await until(`document.readyState === 'complete'`);
  check('signed in (the page)', (await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`)) === 200);
  await cdp('Page.navigate', { url: URL });
  check('the app loads', !!(await until(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos'))`, { timeout: 30000 })));
  await splashGone();
  const su = await pageApi('POST', '/api/vault/setup', { password: SECOND });
  check('the second password is set from the page (unlocked)', su.status === 200 && su.json.state === 'unlocked', su);
  const lr = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify({ password: SIGN_IN }) });
  const cookie = String(lr.headers.get('set-cookie') || '').split(';')[0];
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { frames0.push(String(d)); });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'vp1', sessionName: 'Paste lane' }));
  let env = null;
  for (let i = 0; i < 100 && !env; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) env = e; } catch { } } if (!env) await sleep(250); }
  const TOKEN = env && env.VIBESPACE_SESSION_TOKEN;
  check('a live conversation through the real spawn path (the stub CLI behind the real wrapper) with its own session token', !!TOKEN, frames0.slice(-3));

  console.log('② THE ASK — the agent\'s verb, the tray\'s row and its masked box');
  const a1 = await ask(['the OpenAI key for the judged rules', '--purpose', 'judge your notification rules', '--into', 'llm.apiKey'], TOKEN);
  check('`vibespace-vault request "<what>" --purpose "<why>" --into llm.apiKey` ⇒ exit 0, a request id, where it goes', a1.code === 0 && !!a1.id && /llm\.apiKey/.test(a1.out) && /never ask for the secret in the chat/.test(a1.out), a1);
  await realClick('#taskbar-user-todos');
  check('the tray opens on its row with the paste box', !!(await until(visible(boxOf(a1.id)), { timeout: 10000 })));
  const row = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a1.id))}); const it = b.closest('.ut-item'); const i = b.querySelector('input'); return { text: it.querySelector('.ut-text').textContent, plan: (it.querySelector('.ut-secret-plan') || {}).textContent || '', type: i.type, ac: i.getAttribute('autocomplete'), sc: i.spellcheck, reply: !!it.querySelector('.ut-reply-btn'), save: b.querySelector('.ut-secret-save').textContent, deny: b.querySelector('.ut-secret-deny').textContent, value: i.value }; })()`);
  check('the row says who asks and what; its words say what for and WHERE it goes (the Integrations card\'s field)', /Paste lane asks you for a secret: the OpenAI key for the judged rules/.test(row.text) && /judge your notification rules/.test(row.plan) && /llm\.apiKey/.test(row.plan) && /never the value/.test(row.plan), row);
  check('a MASKED field — type password, autocomplete off, no spell-check, empty — with Save to vault / Refuse and NO reply box (a reply goes to the chat)', row.type === 'password' && row.ac === 'off' && row.sc === false && row.value === '' && row.save === 'Save to vault' && row.deny === 'Refuse' && !row.reply, row);

  console.log('③ PASTE ⇒ STORED — the integration store, the row resolved, the agent\'s next turn');
  await evalJs(`document.querySelector(${JSON.stringify(boxOf(a1.id) + ' input')}).focus(); true`);
  await cdp('Input.insertText', { text: V_FIELD });
  check('the paste lands in the field (the keyboard\'s paste — CDP insertText)', (await evalJs(`document.querySelector(${JSON.stringify(boxOf(a1.id) + ' input')}).value`)) === V_FIELD);
  // A REPAINT WHILE IT SITS THERE: the agent files another item (the For-you broadcast re-draws the tray) — the box is never rebuilt
  await evalJs(`window.__pasteBox = document.querySelector(${JSON.stringify(boxOf(a1.id))}); true`);
  const other = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-ask'), 'a question that repaints the tray'], { env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: TOKEN } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
  check('another item arrives while the value sits in the box (the tray repaints)', other.code === 0 && !!(await until(`[...document.querySelectorAll('#user-todos-popup .ut-item .ut-text')].some((e) => /a question that repaints the tray/.test(e.textContent))`, { timeout: 8000 })), other);
  const kept = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a1.id))}); const i = b && b.querySelector('input'); return { same: b === window.__pasteBox, value: i ? i.value === ${JSON.stringify(V_FIELD)} : false, focus: document.activeElement === i }; })()`);
  check('the SAME box survives the repaint — the pasted value and the focus kept (never rebuilt under the owner)', kept.same && kept.value && kept.focus, kept);
  check('a real click on Save to vault', (await realClick(boxOf(a1.id) + ' .ut-secret-save')) === true);
  check('the box is gone — the row resolved itself', !!(await until(`!document.querySelector(${JSON.stringify(boxOf(a1.id))})`, { timeout: 10000 })));
  check('the toast says it is in the vault and the agent is told only that', !!(await until(`[...document.querySelectorAll('.toast, [class*=toast]')].some((t) => /Saved to the vault — the agent is told it is there, never the value/.test(t.textContent))`, { timeout: 5000 })));
  const integ = await pageApi('GET', '/api/integrations');
  const llm = ((integ.json && integ.json.integrations) || []).find((x) => x.id === 'llm');
  check('the Integrations card holds it: set, the owner\'s own, masked', !!llm && llm.set.apiKey === true && llm.source === 'user' && !!llm.masked.apiKey && hitsIn(JSON.stringify(llm), V_FIELD) === 0, llm && { set: llm.set, source: llm.source, masked: llm.masked });
  const turn1 = await nextTurn(TOKEN);
  check('the agent\'s NEXT TURN carries the receipt: STORED, llm.apiKey, the purpose — never the value', /STORED/.test(turn1) && /llm\.apiKey/.test(turn1) && /judge your notification rules/.test(turn1) && hitsIn(turn1, V_FIELD) === 0, turn1.slice(0, 900));
  const uses = await cli(['uses'], TOKEN);
  check('`vibespace-vault uses` shows the paste as a use line (door paste, ok, a receipt) — no value', uses.code === 0 && /via paste\s+ok\s+receipt vr-/.test(uses.out) && hitsIn(uses.out, V_FIELD) === 0, uses);

  console.log('④ THE VALUE IS NOWHERE — the DOM, the WebSocket frames, the server log');
  await sleep(600);
  check('the page\'s DOM (markup, text, every field) holds it in no form', hitsIn(await pageText(), V_FIELD) === 0);
  check(`no WebSocket frame the page saw holds it (${WS_FRAMES.length} frames)`, WS_FRAMES.length > 5 && WS_FRAMES.every((f) => hitsIn(f, V_FIELD) === 0), WS_FRAMES.length);
  check('the server log holds it in no form', fs.existsSync(LOG) && hitsIn(fs.readFileSync(LOG, 'utf8'), V_FIELD) === 0);

  console.log('⑤ 拒绝 — the agent is told');
  const a2 = await ask(['the sandbox password', '--purpose', 'log in to the sandbox', '--kind', 'password'], TOKEN);
  check('a second ask (a new password entry) ⇒ its row and box', a2.code === 0 && !!(await until(visible(boxOf(a2.id)), { timeout: 10000 })), a2);
  check('a real click on Refuse', (await realClick(boxOf(a2.id) + ' .ut-secret-deny')) === true);
  check('the row resolved', !!(await until(`!document.querySelector(${JSON.stringify(boxOf(a2.id))})`, { timeout: 10000 })));
  const turn2 = await nextTurn(TOKEN);
  check('the agent\'s next turn says REFUSED (by the press), do not ask again for 10 minutes', /REFUSED/.test(turn2) && /pressed Refuse/.test(turn2) && /10 minutes/.test(turn2), turn2.slice(0, 600));
  if (await trayOpen()) await realClick('#taskbar-user-todos');

  console.log('⑥ THE PHONE over a RESTART — the hub boots LOCKED; 解锁… inline; the free entry');
  const a3 = await ask(['the router admin password', '--purpose', 'change the router\'s DNS for you', '--kind', 'password', '--name', 'Router admin'], TOKEN);
  check('a free-entry ask filed while unlocked (a new password entry «Router admin»)', a3.code === 0 && !!a3.id && /new vault entry «Router admin»/.test(a3.out), a3);
  await stopServer(); startServer();
  check('the hub is back (LOCKED at boot — no lock act ran, so the request waits)', await ready());
  await cdp('Emulation.setDeviceMetricsOverride', { width: 448, height: 850, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: URL });
  check('the phone page loads (still signed in) and the unlock dialog opens by itself', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })) && (await evalJs('app.isMobile')) === true);
  await splashGone();
  await evalJs(`document.querySelector('#vault-unlock-dialog .vault-later').click(); true`);   // set aside for this tab — the box says it instead
  check('set aside (Later)', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 5000 })));
  // lane foryou-honest: the phone's badge opens its first-screen PAGE (the same rows) — the sheet through its own door; a touch
  // screen's row is FOLDED (its box inside), a tap on its words opens it
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  const ROW3 = `${TRAY} .ut-item:has(.ut-secret[data-req="${a3.id}"])`; // the row itself (its words pass a tap through to it)
  await until(`!!document.querySelector(${JSON.stringify(ROW3)})`, { timeout: 10000 });
  await tap(ROW3);
  check('the phone\'s tray sheet shows the request kept over the restart, with its box', !!(await until(visible(boxOf(a3.id)), { timeout: 10000 })));
  const locked = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a3.id))}); const u = b.querySelector('.ut-secret-unlock'); return { state: b.dataset.state, words: b.querySelector('.ut-secret-words').textContent, unlock: !!u && u.getBoundingClientRect().height > 0 }; })()`);
  check('LOCKED is said by name in the box (vault_locked) with 解锁… inline — never a silent failure', locked.state === 'locked' && /vault_locked/.test(locked.words) && locked.unlock, locked);
  check('a tap on 解锁… opens THE unlock dialog', (await tap(boxOf(a3.id) + ' .ut-secret-unlock')) === true && !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));
  await evalJs(`(() => { const i = document.getElementById('vault-unlock-pw'); i.focus(); i.value = ${JSON.stringify(SECOND)}; document.querySelector('#vault-unlock-dialog .vault-unlock-go').click(); return true; })()`);
  check('unlocked ⇒ the box is ready (its words gone, 解锁… hidden)', !!(await until(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a3.id))}); return !!b && b.dataset.state === 'ready'; })()`, { timeout: 15000 })));
  const fit = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a3.id))}); const i = b.querySelector('input'); const s = b.querySelector('.ut-secret-save').getBoundingClientRect(), d = b.querySelector('.ut-secret-deny').getBoundingClientRect(); return { font: parseFloat(getComputedStyle(i).fontSize), ih: i.getBoundingClientRect().height, sh: s.height, dh: d.height, right: Math.max(s.right, d.right, i.getBoundingClientRect().right), vw: innerWidth }; })()`);
  check('the phone box: a 16 px field (no zoom), targets ≥ 36 px, all inside the screen', fit.font >= 16 && fit.ih >= 36 && fit.sh >= 36 && fit.dh >= 36 && fit.right <= fit.vw, fit);
  await evalJs(`document.querySelector(${JSON.stringify(boxOf(a3.id) + ' input')}).focus(); true`);
  await cdp('Input.insertText', { text: V_ENTRY });
  check('a tap on Save to vault', (await tap(boxOf(a3.id) + ' .ut-secret-save')) === true);
  check('stored ⇒ the box is gone', !!(await until(`!document.querySelector(${JSON.stringify(boxOf(a3.id))})`, { timeout: 10000 })));
  const contents = await evalJs(`fetch('/api/vault/contents').then((r) => r.json())`);
  const freeRow = ((contents && contents.rows) || []).find((r) => /^secret:[0-9a-f]{10}$/.test(r.entry) && r.label === 'Router admin');
  check('the Vault window\'s contents list it: «Router admin», a password, revealable, its delete door — and no value', !!freeRow && freeRow.kind === 'password' && freeRow.revealable === true && !!(freeRow.doors && freeRow.doors.delete) && hitsIn(JSON.stringify(contents), V_ENTRY) === 0, freeRow);
  const turn3 = await nextTurn(TOKEN);
  check('the agent\'s next turn: STORED as a vault reference it may run with (granted 8 hours) — never the value', /STORED/.test(turn3) && /vault:\/\/secrets\/secret:[0-9a-f]{10}\/secret/.test(turn3) && /vibespace-vault run --env NAME=/.test(turn3) && hitsIn(turn3, V_ENTRY) === 0, turn3.slice(0, 900));
  await sleep(600);
  check('…and the phone value is in no DOM, frame or log line either', hitsIn(await pageText(), V_ENTRY) === 0 && WS_FRAMES.every((f) => hitsIn(f, V_ENTRY) === 0) && hitsIn(fs.readFileSync(LOG, 'utf8'), V_ENTRY) === 0);
  await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });

  console.log('⑦ RED CONTROL — a mutant paste door that logs the value and files it on an item');
  const doorFile = path.join(wt, 'src/server/vault-paste-door.js');
  const src = fs.readFileSync(doorFile, 'utf8');
  const anchor = "settle(q, 'stored', { ref, grantHours, receipt });";   // lane vault-use-grants round 10: the anchor names the LIVE settle line (r6 `100a1ab0` dropped «standing» from it) — an anchor names the code as it is, never a past spelling
  check('the mutant\'s anchor is in the door', src.includes(anchor));
  fs.writeFileSync(doorFile, src.replace(anchor, "log('stored ' + vv.value); try { userTodos.add(q.sessionKey || 'vault', { origin: 'vault', kind: 'notice', text: 'stored ' + vv.value }); } catch { } " + anchor));
  await stopServer(); startServer();
  check('the mutant hub is up', await ready());
  await cdp('Page.navigate', { url: URL });
  await until(`!!(window.app && app.wm)`, { timeout: 30000 }); await splashGone();
  if (await evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await evalJs(`(() => { const i = document.getElementById('vault-unlock-pw'); i.focus(); i.value = ${JSON.stringify(SECOND)}; document.querySelector('#vault-unlock-dialog .vault-unlock-go').click(); return true; })()`); await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 }); }
  else await pageApi('POST', '/api/vault/unlock', { password: SECOND });
  const a4 = await ask(['a mutant key', '--purpose', 'the red control', '--kind', 'secret'], TOKEN);
  await realClick('#taskbar-user-todos');
  await until(visible(boxOf(a4.id)), { timeout: 10000 });
  await evalJs(`document.querySelector(${JSON.stringify(boxOf(a4.id) + ' input')}).focus(); true`);
  await cdp('Input.insertText', { text: V_RED });
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });   // Enter in the box = 存入保险库 (the panel's one Enter rule)
  check('Enter in the box saves it (the panel\'s Enter rule — no click)', !!(await until(`!document.querySelector(${JSON.stringify(boxOf(a4.id))})`, { timeout: 10000 })));
  await sleep(800);
  const red = { log: hitsIn(fs.readFileSync(LOG, 'utf8'), V_RED), dom: hitsIn(await pageText(), V_RED), ws: WS_FRAMES.filter((f) => hitsIn(f, V_RED) > 0).length };
  check('RED: the same checks find the mutant\'s leak — in the server log, the DOM (its item) and a WebSocket frame (the For-you broadcast)', red.log > 0 && red.dom > 0 && red.ws > 0, red);
  fs.writeFileSync(doorFile, src);
} catch (e) {
  check('the run did not throw', false, e && e.stack);
} finally {
  await stopServer();
}
console.log(`\n${failed ? '✗' : '✓'} test-vault-paste-chrome: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAIL'); process.exit(1); } else { console.log(`ALL PASS (${passed})`); process.exit(0); }
