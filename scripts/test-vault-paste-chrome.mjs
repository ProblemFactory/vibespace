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
//      (a 16 px field, ≥ 36 px targets) and the paste stores a `secret:<id>` entry the Vault window lists by its label;
//      lane vault-entry-description: the ask carries `--note` — the box shows the agent's name and description in their own
//      fields (16 px on the phone), the owner renames it before pasting and the owner's name wins, the agent's description stands
//   ⑥b (lane vault-entry-description) a LATER change waits for the owner: the agent's `describe` ⇒ ONE tray card (old → new, 允许 / 拒绝),
//      the Vault row's description + «An agent proposes new words» + Edit…; a real click on Allow ⇒ the row and `list` read
//      the new words, the agent's next turn says APPLIED; r2: the RUN card of a held `vibespace-vault run` with it says «What it is:
//      …» (Deny ends the run) (VAULT_WORDS_SHOTS=<dir> keeps the four PNGs)
//   ⑧ A WEBSITE LOGIN (lane login-request-card, B-a681): a plain-http site refused at the CLI by name; a 200-character ask
//      `--kind login --host shop.example.test` ⇒ ONE card whose FIRST line says who asks, for which site, typed only there;
//      its box = the add door's own fields (the site read-only, user name, password, two-step NAME + «Two-step code…»), the
//      tick «Let <who> sign in to <site> with it» ON by default, its words + the button naming the moment (Save and allow /
//      Save only); an IDN site in both forms; the user name shown as the vault keeps it (lower case); a pasted trailing line
//      break never in the field; a two-step name that names no entry refused by name with every field kept; «Two-step code…»
//      opens THE 两步验证… dialog — the page behind stays usable, the card keeps its fields, the saved name fills the field;
//      Save and allow ⇒ ONE web-login + ONE this-account row for this conversation; the receipt names the user + how to use it;
//      THE PHONE over a RESTART (locked at boot): 44 px targets, every text ≥ 16 px, inside the screen; Save while locked ⇒
//      vault_locked in the box, every field kept; 解锁… then Save only ⇒ stored with no grant; a SECOND client's card resolves
//      live; the receipt names no user; the passwords in no DOM, frame, log line or receipt
//   ⑨ (r3, law B) EVERY SURFACE THAT DRAWS THE CARD — the census's legs (scripts/test-vault-paste.mjs ⑬): the tray, the mini
//      inbox, the chat's needs card, the For-you window, the Vault window's 「需要你」, the phone's page — on each: type both fields
//      → «Two-step code…» → a press INSIDE the dialog → both fields still hold what was typed → save a code → its name lands in
//      THAT box. Law C: a typed user name alone (no password) — Escape ASKS before the form closes. r4 tidy (law B(3) — ONE
//      submittable card): the request's submittable copies in the whole document counted per surface before the press; after
//      the move the form window holds exactly ONE box for it (THIS one), the surface it came from holds none, and no surface
//      holds a copy it did not hold (the others named — the product draws an open ask on each surface at once); where a
//      person's act redraws that surface (the tray, the mini inbox, the phone's sheet reopened) it draws «open in its own
//      window · Show it», still no new box. Every firm press says which attempt landed when it needed a retry.
//   ⑩ (lane totp-request-card, fb-251bb41646) A TWO-STEP CODE: `request … --kind totp --name ci-two-step` ⇒ the card in the tray IS the
//      两步验证… dialog's own fields (its two ways, the proposed name pre-filled, the hub's preview — Save drawn only after it) +
//      «Let <who> read its current code» (ticked); the seed typed into the masked field ⇒ Preview ⇒ Save and allow ⇒ ONE totp entry,
//      the card resolved, the toast; the agent's NEXT TURN: stored, the name, TOTP_USE, never the seed; `vibespace-vault totp
//      ci-two-step` answers a code; the seed in no DOM, frame or log. On the PHONE: every control ≥ 44 px, every text ≥ 16 px,
//      nothing off the screen; by taps, unticked ⇒ «Save only» ⇒ stored, the receipt says it was not given
//   ⑦ RED CONTROL (saved by Enter in the box): a mutant hub whose paste door logs the value and files it on an item ⇒ the same checks find it in the server
//      log, the DOM and a WebSocket frame (they see a leak when there is one)
// THE RELOAD (lane vp393 — the .393 prep mirror's ⑥b red, 3 of 6 runs on the runner's Node 22 at 2 cores, with fable and without):
//   `Page.navigate` + «no splash» passed on the NEW document before its parser reached the splash (readyState 'loading', no app),
//   and a vault door pressed then was never heard. A reload (reload()) is over only when a NEW document (its performance.timeOrigin
//   moved) is complete with no splash, the window holds the vault door's listener (vault-unlock.js initVault — run in /api/home's
//   then: nothing orders it before app.ready, B-6f65), every GET /api/vault/state of that document has answered (the facts the door
//   acts on), and app.ready has resolved; then the door is pressed ONCE, and a door that opens nothing is red by name
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
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));   // (lane chrome-157: VS_CHROME — a Chrome for Testing build the runner has)
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
const VAULT_READS = new Map();   // lane vp393: the page's GET /api/vault/state — requestId → {loaderId, answered, done} (reload())
const WS_FRAMES = [];   // every WebSocket frame the PAGE saw (received and sent) — the multi-client broadcasts included
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.webSocketFrameReceived' || m.method === 'Network.webSocketFrameSent') WS_FRAMES.push(String((m.params.response && m.params.response.payloadData) || ''));
  if (m.method === 'Network.requestWillBeSent' && /\/api\/vault\/state(\?|$)/.test(String(m.params.request && m.params.request.url))) VAULT_READS.set(m.params.requestId, { loaderId: m.params.loaderId, answered: false, done: false });
  if (m.method === 'Network.responseReceived' && VAULT_READS.has(m.params.requestId)) VAULT_READS.get(m.params.requestId).answered = true;
  if ((m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') && VAULT_READS.has(m.params.requestId)) VAULT_READS.get(m.params.requestId).done = m.method === 'Network.loadingFinished' ? 'finished' : 'failed';
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
  /** THE RELOAD (lane vp393 — see the header): navigate, then wait for ① a NEW document (timeOrigin moved), complete, no splash;
   *  ② the window holds the vault door's listener (DOMDebugger.getEventListeners — the listener's own fact); ③ every GET
   *  /api/vault/state of THAT document answered (responseReceived + loadingFinished on its loaderId — the facts the door acts on);
   *  ④ app.ready resolved (the product's own word, the promise the splash waits for). → { ok, why, ms } — `why` names the first
   *  wait that did not end */
  const reload = async (url = URL, { timeout = 30000 } = {}) => {
    const t0 = Date.now(), was = await evalJs('performance.timeOrigin');
    const nav = await cdp('Page.navigate', { url });
    const loader = nav.loaderId;
    const left = () => Math.max(500, timeout - (Date.now() - t0));
    if (!(await until(`performance.timeOrigin !== ${was} && document.readyState === 'complete' && !document.getElementById('loading-screen') && !!window.app`, { timeout: left() }))) return { ok: false, why: 'no new complete document without the splash', ms: Date.now() - t0 };
    const listening = async () => { let id = null; try { const w = await cdp('Runtime.evaluate', { expression: 'window' }); id = w.result.objectId; const l = await cdp('DOMDebugger.getEventListeners', { objectId: id }); return (l.listeners || []).some((x) => x.type === 'vs-vault-door'); } catch { return false; } finally { if (id) cdp('Runtime.releaseObject', { objectId: id }).catch(() => {}); } };
    for (;;) { if (await listening()) break; if (Date.now() - t0 > timeout) return { ok: false, why: 'the vault door is not listening (no vs-vault-door listener on the window)', ms: Date.now() - t0 }; await sleep(120); }
    for (;;) {
      const reads = [...VAULT_READS.values()].filter((r) => r.loaderId === loader);
      if (reads.length && reads.every((r) => r.answered && r.done === 'finished')) break;
      if (reads.some((r) => r.done === 'failed')) return { ok: false, why: 'a GET /api/vault/state of the new document failed', ms: Date.now() - t0 };
      if (Date.now() - t0 > timeout) return { ok: false, why: `GET /api/vault/state of the new document not answered (${reads.length} asked)`, ms: Date.now() - t0 };
      await sleep(60);
    }
    if (!(await until(`Promise.race([app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 1000))])`, { timeout: left() }))) return { ok: false, why: 'app.ready did not resolve', ms: Date.now() - t0 };
    return { ok: true, why: null, ms: Date.now() - t0 };
  };
  const RELOADED = 'the reload is over: a NEW document, complete, no splash; the vault door listening; its GET /api/vault/state answered; app.ready';

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
  const NOTE3 = 'The home router\'s admin login (192.168.1.1, user admin) — changes DNS and port forwards.';
  const a3 = await ask(['the router admin password', '--purpose', 'change the router\'s DNS for you', '--kind', 'password', '--name', 'Router admin', '--note', NOTE3], TOKEN);
  check('a free-entry ask filed while unlocked (a new password entry «Router admin», its description said back)', a3.code === 0 && !!a3.id && /new vault entry «Router admin»/.test(a3.out) && a3.out.includes('its description: ' + NOTE3), a3);
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
  const words3 = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a3.id))}); const n = b.querySelector('input.ut-secret-name'), d = b.querySelector('textarea.ut-secret-desc'); return n && d ? { name: n.value, note: d.value, nfont: parseFloat(getComputedStyle(n).fontSize), dfont: parseFloat(getComputedStyle(d).fontSize), right: Math.max(n.getBoundingClientRect().right, d.getBoundingClientRect().right), vw: innerWidth, above: n.getBoundingClientRect().bottom <= b.querySelector('input.ut-secret-input').getBoundingClientRect().top } : null; })()`);
  check('the box shows the agent\'s NAME and DESCRIPTION in their own fields above the masked one (16 px on the phone, inside the screen)', !!words3 && words3.name === 'Router admin' && words3.note === NOTE3 && words3.nfont >= 16 && words3.dfont >= 16 && words3.right <= words3.vw && words3.above, words3);
  await evalJs(`(() => { const n = document.querySelector(${JSON.stringify(boxOf(a3.id) + ' input.ut-secret-name')}); n.focus(); n.select(); return true; })()`);
  await cdp('Input.insertText', { text: 'Home router admin' });   // the owner renames it before pasting (the keyboard's own road)
  const fit = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(a3.id))}); const i = b.querySelector('input.ut-secret-input'); const s = b.querySelector('.ut-secret-save').getBoundingClientRect(), d = b.querySelector('.ut-secret-deny').getBoundingClientRect(); return { font: parseFloat(getComputedStyle(i).fontSize), ih: i.getBoundingClientRect().height, sh: s.height, dh: d.height, right: Math.max(s.right, d.right, i.getBoundingClientRect().right), vw: innerWidth }; })()`);
  check('the phone box: a 16 px field (no zoom), targets ≥ 36 px, all inside the screen', fit.font >= 16 && fit.ih >= 36 && fit.sh >= 36 && fit.dh >= 36 && fit.right <= fit.vw, fit);
  await evalJs(`document.querySelector(${JSON.stringify(boxOf(a3.id) + ' input.ut-secret-input')}).focus(); true`);
  await cdp('Input.insertText', { text: V_ENTRY });
  check('a tap on Save to vault', (await tap(boxOf(a3.id) + ' .ut-secret-save')) === true);
  check('stored ⇒ the box is gone', !!(await until(`!document.querySelector(${JSON.stringify(boxOf(a3.id))})`, { timeout: 10000 })));
  const contents = await evalJs(`fetch('/api/vault/contents').then((r) => r.json())`);
  const freeRow = ((contents && contents.rows) || []).find((r) => /^secret:[0-9a-f]{10}$/.test(r.entry) && r.label === 'Home router admin');
  check('the Vault window\'s contents list it: «Home router admin» (the OWNER\'s name won), the agent\'s description, a password, revealable, its delete door — and no value', !!freeRow && freeRow.note === NOTE3 && freeRow.noteShared === true && freeRow.kind === 'password' && freeRow.revealable === true && !!(freeRow.doors && freeRow.doors.delete) && hitsIn(JSON.stringify(contents), V_ENTRY) === 0, freeRow);
  const turn3 = await nextTurn(TOKEN);
  check('the agent\'s next turn: STORED as a vault reference it may run with (granted 8 hours) — never the value', /STORED/.test(turn3) && /vault:\/\/secrets\/secret:[0-9a-f]{10}\/secret/.test(turn3) && /vibespace-vault run --env NAME=/.test(turn3) && hitsIn(turn3, V_ENTRY) === 0, turn3.slice(0, 900));
  await sleep(600);
  check('…and the phone value is in no DOM, frame or log line either', hitsIn(await pageText(), V_ENTRY) === 0 && WS_FRAMES.every((f) => hitsIn(f, V_ENTRY) === 0) && hitsIn(fs.readFileSync(LOG, 'utf8'), V_ENTRY) === 0);
  await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  // lane vault-entry-description: a LATER change of an entry's words waits for the owner — the agent's `describe` ⇒ ONE card in the
  // tray (允许 / 拒绝), the Vault window's row marks it; 允许 writes it, the row and the agent's `list` read the new words
  console.log('⑥b a later description waits for the owner — describe ⇒ one card; the Vault row marks it; 允许 writes it');
  const SHOTS = process.env.VAULT_WORDS_SHOTS || '';
  const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const p = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(p.data, 'base64')); };
  const REF3 = (/vault:\/\/secrets\/secret:[0-9a-f]{10}\/secret/.exec(turn3) || [])[0] || '';
  const ROWID3 = REF3 ? `secrets:${REF3.slice('vault://secrets/'.length, -'/secret'.length)}#secret` : '';
  const NEW3 = 'The home router admin login (192.168.1.1, user admin): DNS, DHCP and port forwards — never the Wi-Fi password.';
  const rl6 = await reload();
  check(`⑥b ${RELOADED} (${rl6.ms} ms)`, rl6.ok, rl6);
  const lst0 = await cli(['list'], TOKEN);
  check('`list` names it by the OWNER\'s name and says what it is for (the agent\'s description)', lst0.code === 0 && !!REF3 && lst0.out.includes(REF3) && lst0.out.includes('Home router admin') && lst0.out.includes('what it is: ' + NOTE3), lst0);
  const dsc = await cli(['describe', REF3, '--note', NEW3], TOKEN);
  const tid = (/\((ut-[0-9a-z]+)\)/.exec(dsc.out) || [])[1] || '';
  check('`vibespace-vault describe` ⇒ proposed, nothing changed yet (its filed line names the item)', dsc.code === 0 && /proposed \(ew-[0-9a-f]{12}\)/.test(dsc.out) && /nothing changes until the user allows it/.test(dsc.out) && !!tid, dsc);
  await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);   // ONCE (lane vp393): a door the app said is ready must open
  check('ONE press of the vault door (vs-vault-door) after the reload said ready ⇒ the Vault window opens (else: a door a person could press too early)', !!(await until(`!!document.querySelector('.vw-row')`, { timeout: 10000 })));
  const ROWSEL = `.vw-row[data-id=${JSON.stringify(ROWID3)}]`;
  const mark = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROWSEL)}); if (!r) return null; const d = r.querySelector('.vw-desc'), p = r.querySelector('.vw-desc-pending'); return p && !p.hidden && p.getBoundingClientRect().height > 0 ? { desc: d && d.textContent, pend: p.textContent, edit: !!r.querySelector('.vw-words-edit'), band: !!document.querySelector('.vw-band-row .vw-band-allow') } : null; })()`, { timeout: 15000 });
  check('the Vault row: its description under the name, «An agent proposes new words» while the card waits, its Edit…; the band offers 允许', !!mark && mark.desc === NOTE3 && /proposes new words/.test(mark.pend) && mark.edit && mark.band, mark);
  await shot('vault-row-pending.png');
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  const CARD = `${TRAY} .ut-item[data-id="${tid}"]`;
  const card = await until(`(() => { const c = document.querySelector(${JSON.stringify(CARD)}); if (!c) return null; const a = c.querySelector('.ut-hub-allow'), d = c.querySelector('.ut-hub-deny'); return a && d ? { text: c.innerText, allow: a.textContent, deny: d.textContent } : null; })()`, { timeout: 15000 });
  check('the tray card: who wants to change the description of «Home router admin», the old → new words, 允许 / 拒绝', !!card && /wants to change the description of «Home router admin»/.test(card.text) && card.text.includes(NEW3) && card.text.includes(NOTE3) && card.allow === 'Allow' && card.deny === 'Deny', card);
  await shot('tray-words-card.png');
  await evalJs(`document.querySelector(${JSON.stringify(CARD + ' .ut-hub-allow')})?.scrollIntoView({ block: 'center' }); true`); await sleep(1500);   // the press-arm rule: an Allow that just appeared under the pointer is not the one the owner read
  check('a real click on Allow (after the pointer rests — the press-arm rule)', (await realClick(CARD + ' .ut-hub-allow')) === true);
  const after = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROWSEL)}); const d = r && r.querySelector('.vw-desc'), p = r && r.querySelector('.vw-desc-pending'); return d && d.textContent === ${JSON.stringify(NEW3)} && p && p.hidden ? true : null; })()`, { timeout: 15000 });
  check('allowed ⇒ the Vault row reads the new description, the mark is gone', !!after, await evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | ')`));
  const turn4 = await nextTurn(TOKEN);
  const lst1 = await cli(['list'], TOKEN);
  check('the agent\'s next turn: APPLIED with the words now; its `list` says the new description', /APPLIED/.test(turn4) && turn4.includes(NEW3) && lst1.out.includes('what it is: ' + NEW3), { turn4: turn4.slice(0, 600), lst1: lst1.out.slice(0, 600) });
  await shot('vault-row-applied.png');
  // lane vault-entry-description r2 (the ruling): the RUN card says what the entry is — a held `vibespace-vault run` with it
  const runP = new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-vault'), 'run', '--env', `K=${REF3}`, '--', process.execPath, '-e', 'process.exit(0)'], { cwd: CWD, env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: TOKEN } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
  const runCard = await until(`(() => { const c = [...document.querySelectorAll(${JSON.stringify(TRAY + ' .ut-item')})].find((x) => x.querySelector('.ut-run') && /Home router admin/.test(x.innerText)); return c ? { id: c.dataset.id, text: c.innerText } : null; })()`, { timeout: 20000 });
  check('the RUN card a held `vibespace-vault run` draws says what the entry is (its description under the name)', !!runCard && runCard.text.includes('What it is: ' + NEW3), runCard && runCard.text.slice(0, 900));
  await shot('tray-run-card.png');
  const asks = await pageApi('GET', '/api/user-todos');
  const runItem = ((asks.json && asks.json.todos && asks.json.todos.open) || []).find((i) => i.action && i.action.type === 'vault-run-ask');
  if (runItem) await pageApi('POST', `/api/vault/run/asks/${runItem.action.askId}`, { answer: 'deny' });
  const ran = await Promise.race([runP, sleep(15000).then(() => null)]);
  check('denied ⇒ the run is refused and ends (nothing ran)', !!ran && ran.code !== 0, ran);



  console.log('⑧ A WEBSITE LOGIN — one card, the add door\'s own fields, one web-login entry (lane login-request-card)');
  {
    const T8 = require(path.join(wt, 'src/totp.js'));
    const SEED8 = T8.base32Encode(crypto.randomBytes(20));
    const V_LOGIN = ['typed', 'site', 'password', crypto.randomBytes(8).toString('hex')].join('-');
    const V_LOGIN2 = ['typed', 'phone', 'password', crypto.randomBytes(8).toString('hex')].join('-');
    const SITE8 = 'https://shop.example.test';
    const typeInto = (sel, text) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const focusType = async (sel, text) => { await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.focus(); i.select && i.select(); return true; })()`); await cdp('Input.insertText', { text }); };
    const C = (id, sel = boxOf(id)) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const it = b.closest('.ut-item'); const q = (s) => b.querySelector(s); return { text: it ? it.querySelector('.ut-text').textContent : '', plan: it ? (it.querySelector('.ut-secret-plan') || {}).textContent || '' : '', target: b.dataset.target, site: q('input.vault-login-site').value, ro: q('input.vault-login-site').readOnly, user: q('input.vault-login-user').value, pw: q('input.vault-login-pass').value, pwType: q('input.vault-login-pass').type, otp: q('input.vault-login-otp').value, list: !!q('input.vault-login-otp').list, two: (q('.ut-secret-totp') || {}).textContent, tick: q('input.ut-login-allow-box').checked, says: q('.ut-login-says').textContent, kept: q('.ut-login-kept').textContent, save: q('.ut-secret-save').textContent, words: q('.ut-secret-words').textContent, state: b.dataset.state, labels: [...b.querySelectorAll('.vault-secret-label')].map((x) => x.textContent), hint: /Only the site itself/.test(b.textContent), reply: !!(it && it.querySelector('.ut-reply-btn')), inRow: !!it && !b.closest('[role=dialog]') }; })()`;   // a box moved into its own window has no row
    const rl8 = await reload();
    check(`⑧ ${RELOADED} (${rl8.ms} ms)`, rl8.ok, rl8);
    const bad8 = await cli(['request', 'the wiki login', '--purpose', 'read the wiki', '--kind', 'login', '--host', 'http://wiki.example.test'], TOKEN);
    check('a site the add door refuses (plain http) ⇒ refused at the CLI by name, before any card', bad8.code !== 0 && /https site/.test(bad8.out), bad8);
    const long8 = 'the parts shop login so I can order the replacement parts you listed this morning — '.repeat(4).slice(0, 200);
    const l1 = await ask([long8, '--purpose', 'order the replacement parts', '--kind', 'login', '--host', 'shop.example.test'], TOKEN);
    check('`request "<200 characters>" --purpose … --kind login --host shop.example.test` ⇒ exit 0 — «a website login on https://shop.example.test — only that site is ever filled with it»', l1.code === 0 && !!l1.id && /a website login on https:\/\/shop\.example\.test — only that site is ever filled with it/.test(l1.out), l1);
    const l9 = await ask(['the book shop login', '--purpose', 'order the book', '--kind', 'login', '--host', 'https://bücher.example.test'], TOKEN);
    await realClick('#taskbar-user-todos');
    check('the tray opens on the login card', !!(await until(visible(boxOf(l1.id)), { timeout: 10000 })));
    const c1 = await evalJs(C(l1.id));
    check('its FIRST line: who asks, for which site, typed only there — the agent\'s words below it, with what for', !!c1 && c1.text === `Paste lane asks you for a website login on ${SITE8} — it is typed only on that site` && c1.plan.includes(long8) && /order the replacement parts/.test(c1.plan), c1 && { text: c1.text, plan: c1.plan.slice(0, 300) });
    check('the box IS the add door\'s form: Site (the ask\'s, read-only) · User name · Password (masked) · Two-step code (the vault\'s names) + «Two-step code…», its «only the site itself» line, inline in the tray row (no popup, no reply box)', !!c1 && c1.target === 'login' && JSON.stringify(c1.labels) === JSON.stringify(['Site', 'User name', 'Password', 'Two-step code']) && c1.site === SITE8 && c1.ro && c1.pwType === 'password' && c1.list && c1.two === 'Two-step code…' && c1.hint && !c1.reply && c1.inRow, c1);
    check('«Let Paste lane sign in to it» starts TICKED (the setting\'s default) and says what «allowed» IS before the press — it can sign in as you on that site until you remove it, no time limit — and the button names the moment: Save and allow', !!c1 && c1.tick && /^Paste lane can sign in as you on https:\/\/shop\.example\.test with it until you remove it in Vault ▸ Web logins ▸ Use for… — there is no time limit\.$/.test(c1.says) && c1.save === 'Save and allow', c1 && [c1.tick, c1.says, c1.save]);
    await realClick(boxOf(l1.id) + ' input.ut-login-allow-box');
    const c1u = await evalJs(C(l1.id));
    await realClick(boxOf(l1.id) + ' input.ut-login-allow-box');
    const c1t = await evalJs(C(l1.id));
    check('unticked ⇒ «Paste lane cannot sign in with it until you allow it…» and «Save only»; ticked again ⇒ back', !c1u.tick && /^Paste lane cannot sign in with it until you allow it in Vault ▸ Web logins ▸ Use for…\.$/.test(c1u.says) && c1u.save === 'Save only' && c1t.tick && c1t.save === 'Save and allow', [c1u.says, c1u.save, c1t.save]);
    const c9 = await evalJs(C(l9.id));
    check('an IDN site: the punycode origin the fill compares, its Unicode form beside it — on the first line and in the fixed field', !!c9 && c9.text.includes('https://xn--bcher-kva.example.test (https://bücher.example.test)') && c9.site === 'https://xn--bcher-kva.example.test (https://bücher.example.test)', c9 && [c9.text, c9.site]);
    await realClick(boxOf(l9.id) + ' .ut-secret-deny');
    await until(`!document.querySelector(${JSON.stringify(boxOf(l9.id))})`, { timeout: 10000 });
    // r2 (the rebase onto .388, 主开发's question): a card whose words hold a MASKED link (the door's belt «redacted» inside it) is
    // drawn by THE row's own rule — the login card exactly as a free-entry paste card with the same words; never the link whole
    const TOK8 = ['ya29', 'a0' + crypto.randomBytes(20).toString('hex')].join('.');
    const MW = `sign in from https://shop.example.test/cb?access_token=${TOK8}&state=x`;
    const lm = await ask([MW, '--purpose', 'sign in for the order', '--kind', 'login', '--host', 'https://masked.example.test'], TOKEN);
    const fm = await ask([MW, '--purpose', 'sign in for the order', '--kind', 'password', '--name', 'Masked link entry'], TOKEN);
    await until(`!!document.querySelector(${JSON.stringify(boxOf(lm.id))}) && !!document.querySelector(${JSON.stringify(boxOf(fm.id))})`, { timeout: 10000 });
    const rowFacts = (id) => evalJs(`(() => { const it = document.querySelector(${JSON.stringify(boxOf(id))}).closest('.ut-item'); const plan = it.querySelector('.ut-secret-plan'); return { planNote: !!(plan && plan.querySelector('.fy-masked + .masked-link-note, .fy-masked ~ .masked-link-note')), notes: it.querySelectorAll('.masked-link-note').length, masked: it.querySelectorAll('.fy-masked').length, links: [...it.querySelectorAll('a')].filter((a) => /access_token/.test(a.href)).length, redacted: /access_token=«redacted»/.test(plan ? plan.textContent : ''), whole: it.textContent.includes(${JSON.stringify(TOK8)}), inPre: !!it.querySelector('pre .masked-link-note') }; })()`);
    const fl = await rowFacts(lm.id), ff = await rowFacts(fm.id);
    console.log(`    (the masked link in the tray — login card ${JSON.stringify(fl)} · free-entry card ${JSON.stringify(ff)})`);
    check('a login card whose words hold a MASKED link draws them by THE For-you rows\' own rule, as a free-entry paste card does: every masked link its words + THE note inline in the prose (the paste plan included), never the link whole, never a live link to it, no note inside a verbatim block', [fl, ff].every((f) => f.planNote && f.masked >= 1 && f.notes === f.masked && !f.whole && f.links === 0 && f.redacted && !f.inPre), { login: fl, free: ff });
    for (const r of [lm, fm]) { await realClick(boxOf(r.id) + ' .ut-secret-deny'); await until(`!document.querySelector(${JSON.stringify(boxOf(r.id))})`, { timeout: 10000 }); }
    await focusType(boxOf(l1.id) + ' input.vault-login-user', 'Owner@Shop.Example');
    const ck = await evalJs(C(l1.id));
    check('the user name as the vault will keep it — «Saved as «owner@shop.example»» (lower case: what the fill uses)', ck.kept === 'Saved as «owner@shop.example» — the vault keeps user names in lower case', ck.kept);
    await focusType(boxOf(l1.id) + ' input.vault-login-pass', V_LOGIN + '\n');
    check('a paste with a trailing line break ⇒ the password field holds none (the page\'s own input strips it — a non-DOM client is refused by name at the door)', (await evalJs(C(l1.id))).pw === V_LOGIN);
    await focusType(boxOf(l1.id) + ' input.vault-login-otp', 'no-such-code');
    await realClick(boxOf(l1.id) + ' .ut-secret-save');
    const cw = await until(`(() => { const c = ${C(l1.id)}; return c && /No two-step code of that name/.test(c.words) ? c : null; })()`, { timeout: 8000 });
    check('a two-step NAME that names no entry ⇒ refused by name in the box, every field kept (user, password, the name)', !!cw && cw.user === 'Owner@Shop.Example' && cw.pw === V_LOGIN && cw.otp === 'no-such-code' && cw.site === SITE8, cw);
    await evalJs(`window.__loginBox = document.querySelector(${JSON.stringify(boxOf(l1.id))}); true`);
    await realClick(boxOf(l1.id) + ' .ut-secret-totp');
    const D8 = '.vault-totp-add-dialog', ANY = `.vault-paste-dialog .ut-secret[data-req="${l1.id}"]`;   // r3: the card in its own form
    check('«Two-step code…» opens THE 两步验证… dialog', !!(await until(visible(D8), { timeout: 8000 })));
    const moved = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(ANY)}); return { same: b === window.__loginBox, inForm: !!(b && b.closest('.vault-paste-dialog')), boxes: document.querySelectorAll(${JSON.stringify(ANY)}).length }; })()`);
    check('…THIS card moves into its own form window first (the same box — never rebuilt)', moved.same && moved.inForm && moved.boxes === 1, moved);
    const behind = await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(D8)}).getBoundingClientRect(); const t = document.getElementById('taskbar-user-todos'); const r = t.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); const inside = x >= d.left && x <= d.right && y >= d.top && y <= d.bottom; const b = document.querySelector(${JSON.stringify(ANY)}); const at = (sel) => { const e = document.querySelector(sel); if (!e) return false; const q = e.getBoundingClientRect(); const z = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!z && (z === e || e.contains(z)); }; return { reach: !!h && (h === t || t.contains(h)), inside, front: at(${JSON.stringify(D8 + ' .vt-name')}), overlay: !!document.querySelector('.dialog-overlay:not(.hidden):not([hidden])'), user: b && b.querySelector('input.vault-login-user').value, pw: b && b.querySelector('input.vault-login-pass').value === ${JSON.stringify(V_LOGIN)} }; })()`);
    check('…the dialog is in FRONT, blocks nothing behind it (no overlay; the page\'s own controls answer a press outside it) and the card keeps every typed field', behind.reach && !behind.inside && behind.front && !behind.overlay && behind.user === 'Owner@Shop.Example' && behind.pw, behind);
    await realClick(D8 + ' .vt-way[data-way="seed"]');
    await typeInto(D8 + ' .vt-seed', SEED8);
    await typeInto(D8 + ' .vt-name', 'shop-code');
    await realClick(D8 + ' .vt-preview-b');
    await until(`(() => { const b = document.querySelector(${JSON.stringify(D8 + ' .vt-save')}); return !!b && !b.hidden; })()`, { timeout: 10000 });
    await realClick(D8 + ' .vt-save');
    check('the code saved there ⇒ its dialog closes', !!(await until(`!document.querySelector(${JSON.stringify(D8)})`, { timeout: 10000 })));
    const cn = await evalJs(C(l1.id, ANY));
    check('…and its NAME is in the card\'s field — no retyping; the same box, the other fields kept', !!cn && cn.otp === 'shop-code' && cn.user === 'Owner@Shop.Example' && cn.pw === V_LOGIN && (await evalJs(`document.querySelector(${JSON.stringify(ANY)}) === window.__loginBox`)), cn);
    check('a real click on Save and allow (in the card\'s own window)', (await realClick(ANY + ' .ut-secret-save')) === true);
    check('stored ⇒ the card resolved (its window closed) and the toast says the agent may sign in with it there, never seeing the password', !!(await until(`!document.querySelector(${JSON.stringify(ANY)})`, { timeout: 10000 })) && !!(await until(`[...document.querySelectorAll('.toast, [class*=toast]')].some((t) => /Saved to the vault — the agent may sign in with it on that site; it never sees the password/.test(t.textContent))`, { timeout: 6000 })));
    const wl = await pageApi('GET', '/api/vault/web-logins');
    const e1 = ((wl.json && wl.json.entries) || []).find((e) => e.name === 'web-login:https://shop.example.test#owner@shop.example');
    const gr = (e1 && e1.grants) || [];
    check('ONE web-login entry (the owner\'s, the add door\'s name) and ONE grant: this conversation on THIS account — nothing wider', !!e1 && e1.source === 'owner' && gr.length === 1 && gr[0].scope === 'this-account' && (gr[0].to || []).length === 1 && gr[0].to[0].kind === 'conversation' && hitsIn(JSON.stringify(wl.json), V_LOGIN) === 0, { e1, grants: gr });
    const turn8 = await nextTurn(TOKEN);
    check('the agent\'s next turn: STORED for the site with its user (it may fill it), standing, HOW TO USE IT — never the password', /STORED — a website login for https:\/\/shop\.example\.test \(user owner@shop\.example\)/.test(turn8) && /vibespace-browser login https:\/\/shop\.example\.test --user owner@shop\.example signs in/.test(turn8) && /paused since 2\.369\.364/.test(turn8) && hitsIn(turn8, V_LOGIN) === 0, turn8.slice(0, 900));

    // ⑨ (r3, law B) EVERY SURFACE THAT DRAWS THE CARD — the census's legs. On each: type both fields → «Two-step code…» → a press
    // INSIDE the dialog → both fields still hold what was typed → save a code → its name lands in THAT box (the same element)
    console.log('⑨ every surface that draws the card — what the owner typed is never lost by opening the helper (r3, law B; law C)');
    const itemOf = async (id) => (((await pageApi('GET', '/api/user-todos')).json || {}).todos?.open || []).find((i) => i.action && i.action.requestId === id) || null;
    // r4 (the acceptance of r3 — the press is the test's to prove, never a guess): a press lands only on a target that is REALLY
    // visible (CSS visibility too — a popover is drawn hidden until its first frame repositions it), STILL (the same place on two
    // reads and again after the press-arm rest) and the element under the point; else it scrolls and tries again; a press that
    // hits nothing FAILS BY NAME at once (never three assertions later). Typing is proven by reading the value back.
    // the point to press: the target's centre, else the first point on its first line / its middle (left, centre, right) where the
    // target ITSELF is under the point — a row partly under a sticky bar or the screen's edge is still pressed where it shows
    let lastSpot = null;   // what the last look saw (a miss says it)
    const spotOf = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); const vis = typeof e.checkVisibility === 'function' ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true; const ys = [r.top + r.height / 2, r.top + Math.min(r.height / 2, 22)], xs = [r.left + r.width / 2, r.left + r.width * 0.25, r.left + r.width * 0.75]; let at = null, under = null; for (const y of ys) { for (const x of xs) { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue; const h = document.elementFromPoint(x, y); if (!under) under = h ? (h.id ? '#' + h.id : h.className ? String(h.className).slice(0, 60) : h.tagName) : null; if (h && (h === e || e.contains(h))) { at = { x, y }; break; } } if (at) break; } return { x: at ? at.x : r.left + r.width / 2, y: at ? at.y : r.top + r.height / 2, w: r.width, h: r.height, top: Math.round(r.top), vh: innerHeight, vis, hits: !!at, under }; })()`).then((v) => { lastSpot = v; return v; });
    const firm = async (sel, timeout = 4000) => { const t0 = Date.now(); let prev = null; while (Date.now() - t0 < timeout) { const p = await spotOf(sel); if (p && p.vis && p.hits && p.w > 0 && p.h > 0) { if (prev && Math.abs(prev.x - p.x) < 1 && Math.abs(prev.y - p.y) < 1) return p; prev = p; } else prev = null; await sleep(150); } return null; };
    // r4 tidy (#3): every firm press's attempt is kept, and a press that needed a retry is SAID in the log at once (which attempt,
    // which scroll, what the earlier looks saw) — a silent retry is how a real reach problem would hide. → the attempt (1–5) | 0
    const PRESSES = [];
    const firmPress = async (sel, touch = false) => {
      const BLOCKS = ['center', 'end', 'nearest', 'start', 'center'];   // each retry scrolls the target in another way (a row at a list's edge, or under what stands above it, comes into the open); a control covered at EVERY position still fails. (r4's 12:00Z miss was the phone PAGE's copy lying under the open tray sheet — no bar of the tray is sticky)
      const misses = [];
      for (let i = 0; i < 5; i++) {
        await evalJs(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: ${JSON.stringify(BLOCKS[i])} }); true`);
        await sleep(300);
        const p = await firm(sel, 2500);
        if (!p) { misses.push(lastSpot ? { at: i + 1, vis: lastSpot.vis, hits: lastSpot.hits, under: lastSpot.under } : { at: i + 1, gone: true }); continue; }
        await sleep(400);   // the press-arm rest: what just came to rest under the pointer is pressed once it has rested
        const q = await spotOf(sel);
        if (!q || !q.vis || !q.hits || Math.abs(q.x - p.x) > 1 || Math.abs(q.y - p.y) > 1) { misses.push({ at: i + 1, moved: true, under: q && q.under }); continue; }   // it moved (a list scrolled back to its tail): again
        if (touch) { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        else { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: q.x, y: q.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q.x, y: q.y, button: 'left', clickCount: 1 }); }
        await sleep(250);
        PRESSES.push({ sel, at: i + 1 });
        if (i > 0) console.log(`    ↻ ${sel} — pressed at attempt ${i + 1} of 5 (scrollIntoView «${BLOCKS[i]}»); the looks before it: ${JSON.stringify(misses)}`);
        return i + 1;
      }
      PRESSES.push({ sel, at: 0 });
      console.log(`    ✗ ${sel} — no attempt of 5 landed: ${JSON.stringify(misses)}`);
      return 0;
    };
    const firmType = async (sel, text, touch = false) => { if (!(await firmPress(sel, touch))) return false; await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.focus(); if (i.select) i.select(); return true; })()`); await cdp('Input.insertText', { text }); return (await evalJs(`document.querySelector(${JSON.stringify(sel)})?.value`)) === text; };
    /** the ONE copy of a request's box that is really visible on this surface (a hidden copy may stand elsewhere — the phone's
     *  home, a folded row): marked, and its selector handed back | null */
    const pickVisible = async (sid, reqId, scope, timeout = 12000) => (await until(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(`${scope} .ut-secret[data-req="${reqId}"]`)})].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (typeof x.checkVisibility !== 'function' || x.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })); }); if (!e) return null; e.dataset.legPick = ${JSON.stringify(sid)}; return true; })()`, { timeout })) ? `.ut-secret[data-leg-pick="${sid}"]` : null;
    const boxesOf = (reqId) => evalJs(`[...document.querySelectorAll('.ut-secret[data-req="${reqId}"]')].map((e) => { const r = e.getBoundingClientRect(); return { where: (e.closest('#user-todos-popup, #phone-home, .ut-mini-popover, .cn-card, .chat-attn-dock, .vault-paste-dialog') || {}).className || (e.closest('#user-todos-popup, #phone-home') || {}).id || '?', w: Math.round(r.width), h: Math.round(r.height), vis: typeof e.checkVisibility === 'function' ? e.checkVisibility({ checkVisibilityCSS: true }) : null }; })`);
    /** r4 tidy (law B(3)): the request's SUBMITTABLE copies (a Save) in the WHOLE document other than THIS box, counted per
     *  surface — {place: n}; the product draws an open ask on each surface at once, each its own box */
    const PLACES = `((id) => { const m = {}; for (const x of document.querySelectorAll('.ut-secret[data-req="' + id + '"]')) { if (x === window.__sBox || !x.querySelector('.ut-secret-save')) continue; const s = x.closest('.vault-paste-dialog, #user-todos-popup, #phone-home, .ut-mini-popover, .cn-card, .chat-attn-dock'); const p = s ? (s.id ? '#' + s.id : '.' + String(s.className).split(' ')[0]) : '?'; m[p] = (m[p] || 0) + 1; } return m; })`;
    /** …and where THIS box stands (in a form, the only box the forms hold for it) and what the row it came from still holds */
    const B3 = (reqId) => evalJs(`(() => { const S = '.ut-secret[data-req="${reqId}"]'; const b = window.__sBox, o = window.__sOrigin; return { others: (${PLACES})(${JSON.stringify(reqId)}), forms: document.querySelectorAll('.vault-paste-dialog ' + S).length, thisInForm: !!b && b.isConnected && !!b.closest('.vault-paste-dialog') && !!b.querySelector('.ut-secret-save'), origin: !!o, originHolds: o ? [...o.querySelectorAll(S)].filter((x) => !!x.querySelector('.ut-secret-save')).length : 0 }; })()`);
    /** the surfaces that hold MORE submittable copies than they held before the press → ['<place> +n'] */
    const addedOf = (pre, now) => Object.entries(now || {}).filter(([p, n]) => n > ((pre || {})[p] || 0)).map(([p, n]) => `${p} +${n - ((pre || {})[p] || 0)}`);
    const placesSaid = (m) => Object.entries(m || {}).map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(', ') || 'none';
    /** (iv): a person's act that redraws the surface a card came from — the tray / the phone's sheet closed and opened again by its
     *  own button, the mini inbox by its badge (the button's own click: what is checked is the product's redraw; reach is the
     *  leg's own presses') */
    const toggleTray = async (open) => { if ((await trayOpen()) !== open) await evalJs(`document.getElementById('taskbar-user-todos').click(); true`); await until(`${open ? '!' : ''}document.getElementById('user-todos-popup').classList.contains('hidden')`, { timeout: 5000 }); };
    const trayRedraw = (how) => ({ where: TRAY, how, open: async () => { await toggleTray(false); await toggleTray(true); }, close: () => toggleTray(false) });
    const surfaceLeg = async (sid, reqId, scope, touch = false, redraw = null) => {
      const U = `${sid}-user@example.test`, PW9 = ['surface', sid, 'pw', crypto.randomBytes(4).toString('hex')].join('-'), CODE = `code-${sid}`;
      const fail = async (what, detail) => { check(`[surface:${sid}] ${what}`, false, { detail, lastSpot }); await pageApi('POST', `/api/vault/secret-requests/${reqId}/answer`, { answer: 'deny' }); return false; };   // fail BY NAME at once; the ask closed so nothing cascades
      const sel = await pickVisible(sid, reqId, scope);
      if (!sel) return fail('the login card is drawn there, really visible', await boxesOf(reqId));
      check(`[surface:${sid}] the login card is drawn there (really visible)`, true);
      const tu = await firmType(sel + ' input.vault-login-user', U, touch), tp = await firmType(sel + ' input.vault-login-pass', PW9, touch);
      if (!tu || !tp) return fail('both fields take what is typed (read back)', { user: tu, password: tp, spot: await spotOf(sel + ' input.vault-login-user') });
      await evalJs(`window.__sBox = document.querySelector(${JSON.stringify(sel)}); true`);
      // law B(3): every SUBMITTABLE copy of the request in the whole document, marked before the press (the product draws an open
      // ask on each surface at once — each its own box); the row THIS box stands in (none when it was born in its form)
      const pre = await evalJs(`(() => { const b = window.__sBox; window.__sOrigin = b.closest('.vault-paste-dialog') ? null : (b.closest('.ut-item') || b.parentElement); return (${PLACES})(${JSON.stringify(reqId)}); })()`);
      if (!(await firmPress(sel + ' .ut-secret-totp', touch))) return fail('the press on «Two-step code…» lands on it', await spotOf(sel + ' .ut-secret-totp'));
      if (!(await firm(D8, 8000))) return fail('«Two-step code…» opens the 两步验证… dialog', await boxesOf(reqId));
      if (!(await firmPress(D8 + ' .vt-name', touch))) return fail('a press INSIDE the 两步验证… dialog lands on it', await spotOf(D8 + ' .vt-name'));
      await sleep(400);
      const held = await evalJs(`(() => { const b = window.__sBox; return { on: !!b && b.isConnected, inForm: !!(b && b.closest('.vault-paste-dialog')), user: b ? b.querySelector('input.vault-login-user').value : null, pw: b ? b.querySelector('input.vault-login-pass').value === ${JSON.stringify(PW9)} : false }; })()`);
      check(`[surface:${sid}] «Two-step code…» opens the 两步验证… dialog; after a press INSIDE it both fields still hold what was typed (THIS box, in the card's own form)`, held.on && held.inForm && held.user === U && held.pw, held);
      const b3 = await B3(reqId), added = addedOf(pre, b3.others);
      check(`[surface:${sid}] law B(3) after the move: the form window holds exactly ONE box for the request — THIS one; ${b3.origin ? 'the surface it came from holds none' : 'born in its form (the window draws no box of its own)'}; no surface holds a submittable copy it did not hold before the press (the others, each surface's own: ${placesSaid(b3.others)})`,
        b3.forms === 1 && b3.thisInForm && b3.originHolds === 0 && added.length === 0, { pre, added, ...b3 });
      if (!(await firmPress(D8 + ' .vt-way[data-way="seed"]', touch))) return fail('the dialog\'s «Type the seed» press lands', null);
      if (!(await firmType(D8 + ' .vt-seed', T8.base32Encode(crypto.randomBytes(20)), touch))) return fail('the dialog\'s seed field takes what is typed (read back)', await spotOf(D8 + ' .vt-seed'));
      if (!(await firmType(D8 + ' .vt-name', CODE, touch))) return fail('the dialog\'s name field takes what is typed (read back)', await spotOf(D8 + ' .vt-name'));
      if (!(await firmPress(D8 + ' .vt-preview-b', touch))) return fail('the dialog\'s Preview press lands', null);
      if (!(await firm(D8 + ' .vt-save', 10000))) return fail('the dialog draws Save after its preview', null);
      if (!(await firmPress(D8 + ' .vt-save', touch))) return fail('the dialog\'s Save press lands', null);
      await until(`!document.querySelector(${JSON.stringify(D8)})`, { timeout: 10000 });
      const landed = await evalJs(`(() => { const b = window.__sBox; return { on: !!b && b.isConnected, otp: b ? b.querySelector('input.vault-login-otp').value : null, user: b ? b.querySelector('input.vault-login-user').value : null, pw: b ? b.querySelector('input.vault-login-pass').value === ${JSON.stringify(PW9)} : false }; })()`);
      check(`[surface:${sid}] the saved code's name lands in THAT box (on the page, its typed fields kept — the password too)`, landed.on && landed.otp === CODE && landed.user === U && landed.pw, landed);
      // law B(3) (iv): where a person's act redraws the surface the card came from, it draws the away line — never a new box
      if (redraw && typeof redraw === 'object') {
        await redraw.open();
        const drawn = await until(`(() => { const s = document.querySelector(${JSON.stringify(redraw.where)}); if (!s) return null; const x = [...s.querySelectorAll('.ut-secret[data-req="${reqId}"]')]; return x.length ? x.map((e) => (e.classList.contains('ut-secret-away') && !!e.querySelector('.ut-secret-show') && !e.querySelector('input, .ut-secret-save, .ut-secret-deny') ? 'away' : e.querySelector('.ut-secret-save') ? 'a submittable box' : 'other')) : null; })()`, { timeout: 10000 });
        const words = await evalJs(`(() => { const a = document.querySelector(${JSON.stringify(`${redraw.where} .ut-secret-away[data-req="${reqId}"]`)}); return a ? [...a.children].map((c) => c.textContent).join(' · ') : ''; })()`);
        const b3r = await B3(reqId), addedR = addedOf(pre, b3r.others);
        check(`[surface:${sid}] law B(3) — ${redraw.how}: the surface the card came from draws «${words || 'This login card is open in its own window · Show it'}», never a second box; no surface holds a submittable copy it did not hold before the press (${placesSaid(b3r.others)})`,
          Array.isArray(drawn) && drawn.length === 1 && drawn[0] === 'away' && addedR.length === 0 && b3r.thisInForm && b3r.forms === 1, { drawn, added: addedR, ...b3r });
        await redraw.close();
      } else if (redraw) console.log(`    · [surface:${sid}] law B(3) (iv): ${redraw}`);
      if (!(await firmPress(`.vault-paste-dialog .ut-secret[data-req="${reqId}"] .ut-secret-deny`, touch))) return fail('Refuse in the card\'s own form lands', null);   // done: its answer closes the form
      await until(`!document.querySelector('.vault-paste-dialog .ut-secret[data-req="${reqId}"]')`, { timeout: 10000 });
      return true;
    };
    const askS = async (sid) => { const r = await ask([`the ${sid} login`, '--purpose', `the ${sid} leg`, '--kind', 'login', '--host', `https://${sid}.example.test`], TOKEN); check(`[surface:${sid}] asked (${r.id || 'no id'})`, r.code === 0 && !!r.id, r); return r.id; };
    // the tray
    if (await trayOpen()) await realClick('#taskbar-user-todos');
    const sT = await askS('tray');
    await realClick('#taskbar-user-todos');
    await surfaceLeg('tray', sT, TRAY, false, trayRedraw('the tray closed and opened again'));
    if (await trayOpen()) await realClick('#taskbar-user-todos');
    // the conversation's chat window: its needs card, and its title-bar mini inbox
    // the HUB's session id (the `created` frame of ①'s create — what attachSession and the window's session know), never the CLI's
    const HUB_SID = (frames0.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find((m) => m && m.type === 'created' && m.reqId === 'vp1') || {}).sessionId || null;
    const CHATW = `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(HUB_SID)})`;
    await evalJs(`(() => { if (!${CHATW}) app.attachSession(${JSON.stringify(HUB_SID)}, 'Paste lane', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
    check('the asking conversation\'s chat window is open (attached by the hub\'s session id)', !!HUB_SID && !!(await until(`!!${CHATW}`, { timeout: 15000 })), HUB_SID);
    const sC = await askS('chat-card');
    await surfaceLeg('chat-card', sC, ':is(.cn-card, .chat-attn-dock)', false, 'not here — no act short of closing the conversation\'s window redraws its needs card\'s row while the form is open (the card patches its rows in place); the redraw road is test-vault-paste ⑬b\'s');   // the chat's card: at its record when on screen, else its attention dock (a stub conversation has no transcript record)
    const sM = await askS('mini-inbox');
    await until(`(() => { const w = ${CHATW}; return !!(w && w.titleBar.querySelector(':scope > .win-inbox-badge')); })()`, { timeout: 12000 });
    const badge = await evalJs(`(() => { const w = ${CHATW}; app.wm.focusWindow(w.id); const b = w.titleBar.querySelector(':scope > .win-inbox-badge'); b.id = 'vs-test-mini-badge'; return true; })()`);
    check('[surface:mini-inbox] the press on the title bar\'s inbox badge lands', await firmPress('#vs-test-mini-badge'));
    const BADGE = `(${CHATW})?.titleBar.querySelector(':scope > .win-inbox-badge')`, MINI_OPEN = `!!document.querySelector('.ut-mini-popover')`;
    await surfaceLeg('mini-inbox', sM, '.ut-mini-popover', false, { where: '.ut-mini-popover', how: 'the title bar\'s inbox badge pressed again',
      open: async () => { if (await evalJs(MINI_OPEN)) { await evalJs(`${BADGE}?.click(); true`); await until(`!${MINI_OPEN}`, { timeout: 5000 }); } await evalJs(`${BADGE}?.click(); true`); await until(MINI_OPEN, { timeout: 5000 }); },
      close: async () => { if (await evalJs(MINI_OPEN)) { await evalJs(`${BADGE}?.click(); true`); await until(`!${MINI_OPEN}`, { timeout: 5000 }); } } });
    // the For-you window: its «Paste and save…» opens the card's own form — and LAW C there: a typed user name alone asks on Escape
    const sF = await askS('foryou-window');
    const itF = await itemOf(sF);
    await evalJs(`app.openInbox({ itemId: ${JSON.stringify(itF && itF.id)} }); true`);
    check('[surface:foryou-window] the press on «Paste and save…» lands', await firmPress('.iw-act[data-act="secret-paste"]'));
    const FSEL = `.vault-paste-dialog .ut-secret[data-req="${sF}"]`;
    await until(visible(FSEL), { timeout: 10000 });
    check('law C: a typed user name lands (read back)', await firmType(FSEL + ' input.vault-login-user', 'only-a-name'));
    for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    const asked = await until(`(() => { const s = document.querySelector('.vault-paste-dialog .dialog-unsaved'); return s && s.getClientRects().length ? true : null; })()`, { timeout: 5000 });
    check('law C: a typed user name ALONE (no password) — Escape ASKS before the form closes («unsaved changes»: Save / Discard / Keep editing)', !!asked);
    check('law C: the press on Keep editing lands', await firmPress('.vault-paste-dialog .dialog-unsaved-keep'));
    check('law C: Keep editing ⇒ the form stays, the typed name kept', (await evalJs(`document.querySelector(${JSON.stringify(FSEL + ' input.vault-login-user')})?.value`)) === 'only-a-name');
    await surfaceLeg('foryou-window', sF, '.vault-paste-dialog', false, 'born in its form — the window\'s «Paste and save…» draws no box; pressed again it raises THE form (test-vault-paste ⑬b)');
    // the Vault window's 「需要你」: its «Paste and save…» opens the same form
    const sV = await askS('vault-window');
    await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);
    const vb = await until(`(() => { const b = [...document.querySelectorAll('[data-door="paste"]')].find((x) => /vault-window\.example\.test/.test((x.closest('.vw-band-item, .vw-band-row, li, .vw-band > *') || x.parentElement || x).textContent)); if (!b) return null; b.id = 'vs-test-vw-paste'; return true; })()`, { timeout: 15000 });
    check('[surface:vault-window] the Vault window\'s 「需要你」 offers «Paste and save…» for the login ask', !!vb);
    if (vb && (await firmPress('#vs-test-vw-paste'))) await surfaceLeg('vault-window', sV, '.vault-paste-dialog', false, 'born in its form — the band\'s «Paste and save…» draws no box; pressed again it raises THE form (test-vault-paste ⑬b)');
    else { check('[surface:vault-window] the press on «Paste and save…» lands', false); await pageApi('POST', `/api/vault/secret-requests/${sV}/answer`, { answer: 'deny' }); }

    // ⑩ (lane totp-request-card, fb-251bb41646) THE TWO-STEP CARD on the desk — the 两步验证… dialog's own fields on a For-you card
    console.log('⑩ a two-step code — the card IS the 两步验证… dialog\'s fields; ONE totp entry; the asker reads its current code (lane totp-request-card)');
    const SEED10 = T8.base32Encode(crypto.randomBytes(20));
    const k10 = await ask(['the CI box two-step code', '--purpose', 'sign the release on the CI box', '--kind', 'totp', '--name', 'ci-two-step'], TOKEN);
    check('⑩ the agent asks for a two-step code (--kind totp --name ci-two-step) ⇒ ONE card filed', k10.code === 0 && !!k10.id && /two-step code/.test(k10.out), k10);
    if (!(await trayOpen())) await realClick('#taskbar-user-todos');
    const B10 = k10.id ? await pickVisible('totp-desk', k10.id, TRAY) : null;
    const f10 = B10 ? await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(B10)}); const q = (s) => b.querySelector(s); const it = b.closest('.ut-item'); return { head: it ? (it.querySelector('.ut-text') || {}).textContent : '', ways: [...b.querySelectorAll('.vt-way')].map((x) => x.textContent), seedMasked: q('input.vt-seed').type === 'password', name: q('input.vt-name').value, tick: q('input.ut-login-allow-box').checked, saveShown: !q('.ut-secret-save').hidden, says: (q('.ut-login-says') || {}).textContent }; })()`) : null;
    check(`⑩ the card: its first line «${f10?.head}»; the dialog's own two ways (${(f10?.ways || []).join(' · ')}), the seed field masked; the proposed name pre-filled; «read its current code» ticked; Save not drawn before a preview`,
      !!f10 && /asks you for a two-step code \(TOTP\) for: sign the release on the CI box/.test(f10.head) && f10.ways.join('|') === 'Paste an otpauth link|Type the seed' && f10.seedMasked && f10.name === 'ci-two-step' && f10.tick === true && f10.saveShown === false && /read its current code \(never the seed\) while it runs/.test(f10.says), f10);
    if (B10) {
      check('⑩ «Type the seed» lands', !!(await firmPress(B10 + ' .vt-way[data-way="seed"]')));
      check('⑩ the seed is typed into the dialog\'s own masked field (read back)', await firmType(B10 + ' input.vt-seed', SEED10));
      check('⑩ Preview lands', !!(await firmPress(B10 + ' .vt-preview-b')));
      const pv10 = await until(`(() => { const b = document.querySelector(${JSON.stringify(B10)}); const c = b && b.querySelector('.vw-code-digits'); const s = b && b.querySelector('.ut-secret-save'); return c && /\\d{3} \\d{3}/.test(c.textContent) && s && !s.hidden ? { code: c.textContent, save: s.textContent } : null; })()`, { timeout: 10000 });
      check(`⑩ the hub's preview shows the code the seed makes now (${pv10 && pv10.code}) — and only then Save: «${pv10 && pv10.save}»`, !!pv10 && pv10.save === 'Save and allow', pv10);
      check('⑩ Save and allow lands', !!(await firmPress(B10 + ' .ut-secret-save')));
      const toast10 = await until(`(() => { const t = [...document.querySelectorAll('.toast, [class*=toast]')].map((x) => x.textContent).find((x) => /Saved «ci-two-step»/.test(x)); return t || null; })()`, { timeout: 10000 });
      check(`⑩ the toast: «${toast10}»`, /the agent may read its current code while it runs; it never sees the seed/.test(String(toast10 || '')), toast10);
    }
    const gone10 = await until(`!document.querySelector('.ut-secret[data-req="${k10.id}"]')`, { timeout: 10000 });
    const list10 = await pageApi('GET', '/api/vault/totp');
    const e10 = ((list10.json || {}).entries || []).find((x) => x.name === 'ci-two-step');
    check('⑩ stored ⇒ the card resolved; the Vault lists ONE two-step code «ci-two-step», granted to this conversation', !!gone10 && !!e10 && (e10.grants || []).length === 1 && /^session:/.test(e10.grants[0].subject), { gone: gone10, entry: e10 });
    const turn10 = await nextTurn(TOKEN);
    check('⑩ the agent\'s next turn: STORED, its name, the grant (this run), how to use it — never the seed', /STORED — a two-step code «ci-two-step» is in the vault/.test(turn10) && /vibespace-vault totp ci-two-step answers its current code \(never the seed\)/.test(turn10) && hitsIn(turn10, SEED10) === 0, turn10.slice(0, 700));
    const code10 = await cli(['totp', 'ci-two-step'], TOKEN);
    check('⑩ `vibespace-vault totp ci-two-step` (the asker) answers its current code — never the seed', code10.code === 0 && /\b\d{3} ?\d{3}\b/.test(code10.out) && hitsIn(code10.out, SEED10) === 0, code10);
    check('⑩ the seed is in no DOM, WebSocket frame or server log line', WS_FRAMES.every((f) => hitsIn(f, SEED10) === 0) && hitsIn(fs.readFileSync(LOG, 'utf8'), SEED10) === 0 && hitsIn(await pageText(), SEED10) === 0, WS_FRAMES.length);
    if (await trayOpen()) await realClick('#taskbar-user-todos');

    // THE PHONE over a RESTART (locked at boot — no lock act); a SECOND client sees the card resolve live
    const l2 = await ask(['the forum login', '--purpose', 'read the thread you sent', '--kind', 'login', '--host', 'https://forum.example.test'], TOKEN);
    check('a second login ask, filed while unlocked', l2.code === 0 && !!l2.id, l2);
    if (await trayOpen()) await realClick('#taskbar-user-todos');
    await stopServer(); startServer();
    check('the hub is back (LOCKED at boot — the ask waits)', await ready());
    await cdp('Emulation.setDeviceMetricsOverride', { width: 448, height: 850, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Page.navigate', { url: URL });
    await until(visible('#vault-unlock-dialog'), { timeout: 30000 }); await splashGone();
    await evalJs(`document.querySelector('#vault-unlock-dialog .vault-later').click(); true`);
    await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 5000 });
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    const ROW8 = `${TRAY} .ut-item:has(.ut-secret[data-req="${l2.id}"])`;
    await until(`!!document.querySelector(${JSON.stringify(ROW8)})`, { timeout: 10000 });
    await tap(ROW8);
    check('the phone\'s tray sheet shows the login card kept over the restart', !!(await until(visible(boxOf(l2.id)), { timeout: 10000 })));
    const t2 = await cdp('Target.createTarget', { url: 'about:blank' });
    let tg2 = null; for (let i = 0; i < 40 && !tg2; i++) { tg2 = ((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()) || []).find((t) => t.id === t2.targetId); if (!tg2) await sleep(200); }
    const ws2 = new WebSocket(tg2.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => ws2.on('open', r));
    let seq2 = 0; const pend2 = new Map(); ws2.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend2.has(m.id)) { pend2.get(m.id)(m); pend2.delete(m.id); } });
    const cdp2 = (method, params = {}) => new Promise((res, rej) => { const id = ++seq2; pend2.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws2.send(JSON.stringify({ id, method, params })); });
    const until2 = async (expr, timeout = 20000) => { const t0 = Date.now(); for (;;) { let v = null; try { const r = await cdp2('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); v = r.result && r.result.value; } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(150); } };
    await cdp2('Page.enable'); await cdp2('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp2('Page.navigate', { url: URL });
    await until2(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos')) && !document.getElementById('loading-screen')`, 30000);
    await until2(`(() => { const d = document.getElementById('vault-unlock-dialog'); if (d) d.querySelector('.vault-later')?.click(); return true; })()`);
    await until2(`(() => { const p = document.getElementById('user-todos-popup'); if (p && p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return !!document.querySelector(${JSON.stringify(boxOf(l2.id))}); })()`, 15000);
    check('a SECOND client (another tab) shows the same card', !!(await until2(`!!document.querySelector(${JSON.stringify(boxOf(l2.id))})`, 5000)));
    await cdp('Page.bringToFront');   // the phone's page takes the input again (a background tab's input waits for it to be shown)
    await focusType(boxOf(l2.id) + ' input.vault-login-user', 'forum-user');
    await focusType(boxOf(l2.id) + ' input.vault-login-pass', V_LOGIN2);
    await tap(boxOf(l2.id) + ' .ut-login-allow');
    const cp = await evalJs(C(l2.id));
    check('the phone card: locked said by name with 解锁… inline; unticked by a tap on its words ⇒ «Save only»', cp.state === 'locked' && /vault_locked/.test(cp.words) && !cp.tick && cp.save === 'Save only', cp);
    const fit8 = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(boxOf(l2.id))}); const vw = innerWidth; const H = (s) => { const e = b.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; }; const inputs = [...b.querySelectorAll('input.vault-pw')].map((i) => [Math.round(i.getBoundingClientRect().height), parseFloat(getComputedStyle(i).fontSize)]); const texts = [...b.querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().height > 0).map((e) => [String(e.className || e.tagName), parseFloat(getComputedStyle(e).fontSize)]); const right = Math.max(...[...b.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect().right)); return { vw, right: Math.round(right), inputs, small: texts.filter(([, f]) => f < 16), save: H('.ut-secret-save'), deny: H('.ut-secret-deny'), totp: H('.ut-secret-totp'), allow: H('.ut-login-allow'), unlock: H('.ut-secret-unlock') }; })()`);
    check('the phone card: every field ≥ 44 px with 16 px text (no zoom), every target ≥ 44 px, EVERY text ≥ 16 px, all inside the screen', fit8.inputs.length === 4 && fit8.inputs.every(([h, f]) => h >= 44 && f >= 16) && fit8.small.length === 0 && fit8.save >= 44 && fit8.deny >= 44 && fit8.totp >= 44 && fit8.allow >= 44 && fit8.unlock >= 44 && fit8.right <= fit8.vw, fit8);
    check('a tap on Save only while LOCKED', (await tap(boxOf(l2.id) + ' .ut-secret-save')) === true);
    const cl = await until(`(() => { const c = ${C(l2.id)}; return c && c.words && /unlock/i.test(c.words) && c.state === 'locked' ? c : null; })()`, { timeout: 8000 });
    check('…the box says the vault is locked and where to unlock (解锁… inline), EVERY field kept — nothing stored', !!cl && cl.user === 'forum-user' && cl.pw === V_LOGIN2 && !cl.tick, cl);
    check('a tap on 解锁… opens THE unlock dialog', (await tap(boxOf(l2.id) + ' .ut-secret-unlock')) === true && !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));
    await evalJs(`(() => { const i = document.getElementById('vault-unlock-pw'); i.focus(); i.value = ${JSON.stringify(SECOND)}; document.querySelector('#vault-unlock-dialog .vault-unlock-go').click(); return true; })()`);
    const cr = await until(`(() => { const c = ${C(l2.id)}; return c && c.state === 'ready' ? c : null; })()`, { timeout: 15000 });
    check('unlocked ⇒ the box is ready, its fields as typed', !!cr && cr.user === 'forum-user' && cr.pw === V_LOGIN2, cr);
    check('a tap on Save only', (await tap(boxOf(l2.id) + ' .ut-secret-save')) === true);
    const gone9 = await until(`!document.querySelector(${JSON.stringify(boxOf(l2.id))})`, { timeout: 10000 });   // lane vp393: on a red, what the card held when the wait ended (the password as its length only) — hosted try 1 of the .393 prep mirror
    check('stored ⇒ the phone\'s card resolved', !!gone9, gone9 ? undefined : await evalJs(`(() => { let c = null; try { c = ${C(l2.id)}; } catch (e) { c = { err: String(e) }; } if (c && 'pw' in c) c.pw = 'len ' + String(c.pw || '').length; const b = document.querySelector(${JSON.stringify(boxOf(l2.id))}); const sv = b && b.querySelector('.ut-secret-save'); return { at: new Date().toISOString(), card: c, save: sv ? { text: sv.textContent, disabled: sv.disabled, hidden: sv.hidden } : null, busy: b ? b.dataset.busy || null : null, error: b ? b.dataset.error || null : null, toasts: [...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).slice(-6) }; })()`));
    check('…and the SECOND client\'s card resolved LIVE (no reload)', !!(await until2(`!document.querySelector(${JSON.stringify(boxOf(l2.id))})`, 10000)));
    const wl2 = await pageApi('GET', '/api/vault/web-logins');
    const e2 = ((wl2.json && wl2.json.entries) || []).find((e) => e.name === 'web-login:https://forum.example.test#forum-user');
    check('stored with NO grant (Save only)', !!e2 && (e2.grants || []).length === 0, e2);
    const turn9 = await nextTurn(TOKEN);
    check('the agent\'s next turn: STORED, not allowed yet (where the owner allows it) — and it names NO user', /STORED — a website login for https:\/\/forum\.example\.test is in the vault/.test(turn9) && /did not let this conversation sign in with it/.test(turn9) && !turn9.includes('forum-user') && hitsIn(turn9, V_LOGIN2) === 0, turn9.slice(0, 900));
    await sleep(600);
    check('the two passwords are in no DOM, WebSocket frame or server log line', [V_LOGIN, V_LOGIN2].every((v) => WS_FRAMES.every((f) => hitsIn(f, v) === 0) && hitsIn(fs.readFileSync(LOG, 'utf8'), v) === 0) && hitsIn(await pageText(), V_LOGIN2) === 0, WS_FRAMES.length);
    try { ws2.close(); await cdp('Target.closeTarget', { targetId: t2.targetId }); } catch { }
    // ⑨ the phone's page — the same leg by taps
    const sP = await askS('phone-page');
    // r4 (the 12:00Z miss line, read again: no band bar is sticky — the row the leg took was the phone PAGE's copy, LYING UNDER the
    // open tray SHEET, whose band bar was what sat at that point): the row is taken on the surface that is ON TOP — the tray
    // sheet when it is open, else the phone's page
    const sheetOpen = `(() => { const p = document.getElementById('user-todos-popup'); return !!p && !p.classList.contains('hidden') && p.getBoundingClientRect().height > 0; })()`;
    if (!(await evalJs(sheetOpen))) await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);   // the tray (its own door): a row of the page may stand hidden or folded under it
    await until(sheetOpen, { timeout: 8000 });
    const SURF = (await evalJs(sheetOpen)) ? '#user-todos-popup' : '#phone-home';
    const ROWP = `${SURF} .ut-item:has(.ut-secret[data-req="${sP}"])`;
    const visRow = `[...document.querySelectorAll(${JSON.stringify(ROWP)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (typeof e.checkVisibility !== 'function' || e.checkVisibility({ checkVisibilityCSS: true })); })`;
    const rowShown = await until(`(() => { const r = ${visRow}; if (!r) return null; r.dataset.legRow = 'phone'; return true; })()`, { timeout: 10000 });
    check('[surface:phone-page] a VISIBLE row of the ask stands on the phone', !!rowShown, await boxesOf(sP));
    const boxShown = await evalJs(`(() => { const b = document.querySelector('.ut-item[data-leg-row="phone"] .ut-secret[data-req="${sP}"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
    if (rowShown && !boxShown) check('[surface:phone-page] a tap on the folded row opens it', await firmPress('.ut-item[data-leg-row="phone"]', true), lastSpot);   // the ROW is the tap (⑥'s and ⑧'s phone legs tap it): a folded row opens in place — a miss says what the look saw
    await surfaceLeg('phone-page', sP, '.ut-item[data-leg-row="phone"]', true, SURF === TRAY ? trayRedraw('the For-you sheet closed and opened again') : 'the row stood on the phone\'s page (no sheet open): the page redraws on its own schedule — the redraw road is test-vault-paste ⑬b\'s');
    // ⑩ the two-step card ON THE PHONE — the same fields by taps; its targets and its text
    const SEEDP = T8.base32Encode(crypto.randomBytes(20));
    const kP = await ask(['the jump host two-step code', '--purpose', 'reach the jump host', '--kind', 'totp'], TOKEN);
    check('⑩ phone: a two-step ask with no name proposed ⇒ ONE card', kP.code === 0 && !!kP.id, kP);
    if (!(await evalJs(sheetOpen))) await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    await until(sheetOpen, { timeout: 8000 });
    const SURFP = (await evalJs(sheetOpen)) ? '#user-todos-popup' : '#phone-home';
    const visRowP = `[...document.querySelectorAll(${JSON.stringify(`${SURFP} .ut-item:has(.ut-secret[data-req="${kP.id}"])`)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (typeof e.checkVisibility !== 'function' || e.checkVisibility({ checkVisibilityCSS: true })); })`;
    const rowP = await until(`(() => { const r = ${visRowP}; if (!r) return null; r.dataset.legRow = 'phone-totp'; return true; })()`, { timeout: 10000 });
    const shownP = await evalJs(`(() => { const b = document.querySelector('.ut-item[data-leg-row="phone-totp"] .ut-secret[data-req="${kP.id}"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
    if (rowP && !shownP) check('⑩ phone: a tap on the folded row opens it', !!(await firmPress('.ut-item[data-leg-row="phone-totp"]', true)), lastSpot);
    const BP = '.ut-item[data-leg-row="phone-totp"] .ut-secret[data-req="' + kP.id + '"]';
    const sizesOf = () => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(BP)}); if (!b) return null; const vw = innerWidth; const on = (e) => e.getClientRects().length > 0 && !e.closest('[hidden]'); const els = [...b.querySelectorAll('input:not([type=checkbox]), select, button')].filter(on); const small = els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => String(e.className).slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().height)); const texts = [...b.querySelectorAll('*')].filter((e) => on(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())); const tiny = texts.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + getComputedStyle(e).fontSize); const out = [...els, ...texts].filter((e) => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > vw + 0.5; }).map((e) => String(e.className).slice(0, 30)); return { n: els.length, small, tiny, out }; })()`);
    const z0 = await sizesOf();
    check(`⑩ phone: every control of the two-step card ≥ 44 px (${z0 && z0.n}), every text ≥ 16 px, nothing off the screen`, !!z0 && z0.n >= 4 && !z0.small.length && !z0.tiny.length && !z0.out.length, z0);
    check('⑩ phone: «Type the seed» by a tap', !!(await firmPress(BP + ' .vt-way[data-way="seed"]', true)));
    check('⑩ phone: the seed typed (read back)', await firmType(BP + ' input.vt-seed', SEEDP, true));
    check('⑩ phone: the name typed (read back) — none was proposed', await firmType(BP + ' input.vt-name', 'jump-host', true));
    check('⑩ phone: «read its current code» unticked by a tap', !!(await firmPress(BP + ' input.ut-login-allow-box', true)) && (await evalJs(`!document.querySelector(${JSON.stringify(BP + ' input.ut-login-allow-box')}).checked`)) === true);
    check('⑩ phone: Preview by a tap', !!(await firmPress(BP + ' .vt-preview-b', true)));
    const pvP = await until(`(() => { const b = document.querySelector(${JSON.stringify(BP)}); const s = b && b.querySelector('.ut-secret-save'); return s && !s.hidden ? s.textContent : null; })()`, { timeout: 10000 });
    const z1 = await sizesOf();
    check(`⑩ phone: after its preview, Save reads «${pvP}» — and the card still holds every control ≥ 44 px, every text ≥ 16 px`, pvP === 'Save only' && !!z1 && !z1.small.length && !z1.tiny.length && !z1.out.length, { pvP, z1 });
    check('⑩ phone: Save only by a tap', !!(await firmPress(BP + ' .ut-secret-save', true)));
    const goneP = await until(`!document.querySelector('.ut-secret[data-req="${kP.id}"]')`, { timeout: 10000 });
    const turnP = await nextTurn(TOKEN);
    check('⑩ phone: stored unticked ⇒ the card resolved; the next turn says «jump-host» is stored and NOT given — never the seed', !!goneP && /STORED — a two-step code «jump-host» is in the vault/.test(turnP) && /did not let this conversation read its code/.test(turnP) && hitsIn(turnP, SEEDP) === 0, turnP.slice(0, 600));
    const retried = PRESSES.filter((x) => x.at > 1), missed = PRESSES.filter((x) => x.at === 0);
    console.log(`    (⑨'s firm presses: ${PRESSES.length} — ${PRESSES.filter((x) => x.at === 1).length} at the first look, ${retried.length} after a retry${retried.length ? ': ' + retried.map((x) => `${x.sel} @${x.at}`).join(', ') : ''}, ${missed.length} missed)`);
    await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  console.log('⑦ RED CONTROL — a mutant paste door that logs the value and files it on an item');
  const doorFile = path.join(wt, 'src/server/vault-paste-door.js');
  const src = fs.readFileSync(doorFile, 'utf8');
  const anchor = "settle(q, 'stored', { ref, grantHours, receipt });";   // lane vault-use-grants round 10: the anchor names the LIVE settle line (r6 `100a1ab0` dropped «standing» from it) — an anchor names the code as it is, never a past spelling
  check('the mutant\'s anchor is in the door', src.includes(anchor));
  fs.writeFileSync(doorFile, src.replace(anchor, "log('stored ' + vv.value); try { userTodos.add(q.sessionKey || 'vault', { origin: 'vault', kind: 'notice', text: 'stored ' + vv.value }); } catch { } " + anchor));
  await stopServer(); startServer();
  check('the mutant hub is up', await ready());
  const rl7 = await reload();
  check(`⑦ ${RELOADED} (${rl7.ms} ms)`, rl7.ok, rl7);
  if (await evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await evalJs(`(() => { const i = document.getElementById('vault-unlock-pw'); i.focus(); i.value = ${JSON.stringify(SECOND)}; document.querySelector('#vault-unlock-dialog .vault-unlock-go').click(); return true; })()`); await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 }); }
  else await pageApi('POST', '/api/vault/unlock', { password: SECOND });
  const a4 = await ask(['a mutant key', '--purpose', 'the red control', '--kind', 'secret'], TOKEN);
  await realClick('#taskbar-user-todos');
  await until(visible(boxOf(a4.id)), { timeout: 10000 });
  await evalJs(`document.querySelector(${JSON.stringify(boxOf(a4.id) + ' input.ut-secret-input')}).focus(); true`);
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
