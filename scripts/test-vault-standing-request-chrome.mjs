#!/usr/bin/env node
// A STANDING GRANT AN AGENT ASKS FOR, AND «ALWAYS (THIS COMMAND)» — IN A REAL PAGE (heavy, chrome — lane vault-standing-request;
// the owner 2026-10-30, four «允许一次» cards in two minutes for `python3 transcribe.py partNN.mp3`: 「能不能让 agent 自行申请权限，我
// 手填填不明白 … 常驻的，跟我配"谁可以用"等效的权限」). A worktree hub WITH a sign-in password, a stub CLI behind the REAL chat wrapper (a
// live conversation «Transcriber» with its own session token — the suite plays its agent), the SYSTEM `/usr/bin/python3` (a
// program the agent cannot write) over scripts in the conversation's folder, a real headless Chrome in 中文 (the owner's UI):
//   ① sign in, the second password, a stored API key, the live conversation
//   ② THE STANDING REQUEST: the agent's `vibespace-vault request <ref> --standing --command "python3 transcribe.py" --for …` ⇒
//      ONE card in For you — its words (who, the command, until you revoke it) and its TWO answers «允许（常驻）» / «拒绝»; the
//      owner's Allow (验证是你) ⇒ two segments run with NO card
//   ③ THE VAULT ROW: the chip «Transcriber · 命令 python3 transcribe.py · agent 申请 · HH:MM ✕»; 「谁可以用…」 explains «主机» and
//      offers «不知道怎么填？让 agent 自己申请。»
//   ④ THE CARD'S «总是（这条命令）»: a run of ANOTHER script draws its card with the button and its plain words; Always (验证是你)
//      ⇒ the next run of it goes with no card; the chip says «卡片上的总是»
//   ⑤ THE PHONE (390 px): a second standing card and the Vault row at phone width
//   ⑥ (r2, MAJOR 3) THE AGENT'S OWN ENTRY: «总是（这条命令）» on a run with the conversation's MINTED entry ⇒ its Vault row draws
//      the member (chip + ✕, no «谁可以用…»); ✕ takes it back
//   ⑦ (r3, MAJOR 1) A LEGACY WILDCARD: the 2.369.363/.364 carry's members (a wildcard host, NO tool — written into the hub's data/
//      under its own vault mark while it is stopped) ⇒ after the restart's unlock the aws one names its tool «（经由 aws）», the one
//      no tool row names is marked «（旧版通配：任何工具）» on its chip, and ONE For-you notice tells the owner (desktop + phone);
//      r4 (THE ROOT MODEL): EACH scope says its own end on the chip — «a.example · 30 天», «b.example · 无限期», the legacy
//      wildcard «… · 20 天» — and at 390 px every chip stays inside the screen
//   r2 (主开发's visual read): the standing card = label rows (密钥 = the NAME, 用途, 命令 / 主机, 运行, 期限 …) + ONE 技术细节 fold —
//      the vault:// reference only there, as code, never a link (desktop and phone)
//   ⑧ (r7, the owner 2026-10-31 «不清楚发往何处的话 … 1个小时授权吧») «ALLOW FOR 1 HOUR»: the shell card's three answers at 1280 and
//      390 (the line of what it writes on its own row, the words beside them), the For-you window's row, the press (验证是你), the
//      record «已允许这个对话 1 小时 · 至 HH:MM · 可在保险库窗口收回» in the chat card, the tray and the window, the NEXT use with no card
//      and nothing filed + its notice on a SECOND client, `uses`, the chip «任何目的地 · 至 HH:MM · 60 分钟» (warning accent), ✕;
//      MEASURED first: what an admitted standing-grant use shows in the chat (nothing — the report says the counts)
//      r8 (主开发's acceptance of r7): THE HUB IS A LOCAL INSTANCE (the owner's: no instance name, no presets dir — forced) and the
//      APPROVED command itself, run again inside the hour, pops its notice (r7 let it through by `seen`, silently); the chip's
//      source «卡片上的「允许 1 小时」»; the WINDOW's own ✕ — the chip keeps its other scopes, the record says «已于 HH:MM 撤销», the
//      next run asks (vsr-23); a conversation the owner EXCEPTED (除了) gets no «允许 1 小时» and the card says why (vsr-24);
//      vsr-17 shot with no toast over the pane, the window maximized (the hint inside it)
//      r9 (主开发's acceptance of r8): the owner ✕'s the «All agents» member — the row KEEPS its 除了 («无需卡片即可使用：没有人 ·
//      除了 Transcriber», vsr-25); the agent's OWN value sent to h2.example: after «允许 1 小时» the next h2.example run is a window
//      use with its notice (r8's host pass ran it silently); a member whose only scope is a window the PAGE sees ended (its clock
//      moved past the end — the hub had not swept it): the dialog says «1 小时授权已结束 — 保存时移除» and its Save lands (vsr-26)
//      r10 (主开发's acceptance of r9): «谁可以用…» on the except-only row, only the judge policy set — the Save posts the POLICY
//      only and the row keeps «除了 Transcriber» (vsr-27); a named member's end changed — the Save sends the stored 除了; picking
//      Transcriber ITSELF says «Transcriber 将不再被排除» and names it (removeExcept, vsr-28); a dialog drawn before the hub
//      dropped a window-only member saves (vsr-29)
//      r11 (主开发's acceptance of r10): a row with a TASK GROUP member (Team, live in the roster) and 除了 Transcriber — a
//      policy-only Save posts NO row (vsr-30), a members-edit Save keeps Team as `group:<its id>`; a Save whose row landed and
//      whose policy's 验证是你 was cancelled says «成员已保存；策略没有保存» (vsr-31) and Team picked again is posted; the
//      ended-window Save (vsr-26) POSTS the row (the hub prunes an ended window — here it holds it live and keeps it)
//   --shots <dir> keeps vsr-*.png. RED CONTROL: this suite over the base tree (4ef7e9494) — ② the request files a PLAIN card
//   (once / 8h), ③ no command chip, ④ no «总是（这条命令）».
// Run: node scripts/test-vault-standing-request-chrome.mjs [--shots <dir>]   (SKIPs without chrome or python3)
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
const PY = ['/usr/bin/python3'].find((p) => fs.existsSync(p));
if (!PY) { console.log('SKIP: no system python3'); process.exit(0); }
const PYN = path.basename(fs.realpathSync(PY));   // the program's REAL name — what the grant pins and the row says (python3 is a link: python3.14)
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vsr-wt'), PROFILE = process.env.VSR_CHROME_PROFILE || scratch('vsr-chrome'), fakeHome = scratch('vsr-home'), stubDir = scratch('vsr-stub');   // VSR_CHROME_PROFILE: a lane keeps the profile under its worktree
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
for (const d of [fakeHome, stubDir, ...(SHOTS ? [SHOTS] : [])]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
fs.writeFileSync(path.join(CWD, 'transcribe.py'), 'import os, sys\nprint("transcribed", sys.argv[1:], "key set" if os.environ.get("T") else "no key")\n');
fs.writeFileSync(path.join(CWD, 'upload.py'), 'import os\nprint("uploaded", "key set" if os.environ.get("T") else "no key")\n');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'vsr-leg-sign-in-3';
const SECOND = 'vsr leg second password';
const SID = crypto.randomUUID();
const VALUE = ['tts', 'api', 'key', crypto.randomBytes(8).toString('hex')].join('-');   // built at runtime
const LABEL = 'TTS API key';

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
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
const { VIBESPACE_INSTANCE_NAME: _instanceName, ...ENV_LOCAL } = process.env;   // r8: the hub is a LOCAL instance (the owner's) — no instance name, no presets dir
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...ENV_LOCAL, VIBESPACE_PRESETS_DIR: '', ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
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
async function pageOf(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
  const api = (method, p, body, headers = {}) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: ${JSON.stringify({ 'Content-Type': 'application/json', ...headers })}${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
  const shot = async (name) => { if (!SHOTS) return; try { await cdp('Page.bringToFront'); } catch { } try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  return { cdp, evalJs, until, api, shot };
}
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const cli = (bin, args, token, { timeout = 20000 } = {}) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', bin), ...args], { cwd: CWD, env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, timeout); c.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); }); });
const LIST_ROW = (label) => `[...document.querySelectorAll('.vw-list .vw-row')].find((r) => r.isConnected && r.querySelector('.vw-label') && r.querySelector('.vw-label').textContent === ${JSON.stringify(label)})`;
const ITEM = (re) => `[...document.querySelectorAll('#user-todos-popup .ut-item')].find((e) => ${re}.test(e.textContent))`;

try {
  let t0 = null;
  for (let i = 0; i < 80 && !t0; i++) { try { t0 = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
  if (!t0) throw new Error('no chrome page');
  const A = await pageOf(t0);
  startServer();
  check('the hub boots (sign-in password on)', await ready());
  const URL = `http://127.0.0.1:${PORT}/`;

  console.log('① sign in, the second password, a stored API key, a live conversation');
  await A.cdp('Page.navigate', { url: URL + 'login' });
  await A.until(`document.readyState === 'complete'`);
  check('signed in', (await A.evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`)) === 200);
  await A.evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);   // the owner's language (a per-device choice)
  await A.cdp('Page.navigate', { url: URL });
  check('the app loads (中文)', !!(await A.until(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos'))`, { timeout: 30000 })));
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const su = await A.api('POST', '/api/vault/setup', { password: SECOND });
  check('the second password is set from the page (unlocked)', su.status === 200 && su.json.state === 'unlocked', su);
  const add = await A.api('POST', '/api/vault/secrets', { label: LABEL, kind: 'api-key', note: '', value: VALUE });
  const REF = add.json && add.json.ref;
  check('a stored API key (a free entry)', add.status === 200 && /^vault:\/\/secrets\/secret:[0-9a-f]{10}\/secret$/.test(String(REF)), add);
  const lr = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify({ password: SIGN_IN }) });
  const cookie = String(lr.headers.get('set-cookie') || '').split(';')[0];
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => frames0.push(String(d)));   // r7: the conversation's session id (its `created` frame) — ⑧ opens its chat
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'vsr1', sessionName: 'Transcriber' }));
  let env = null;
  for (let i = 0; i < 100 && !env; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) env = e; } catch { } } if (!env) await sleep(250); }
  const TOKEN = env && env.VIBESPACE_SESSION_TOKEN;
  check('a live conversation «Transcriber» with its own session token', !!TOKEN);
  const todo = async () => (await A.api('GET', '/api/user-todos')).json.todos;
  const openOf = async (type) => ((await todo()).open || []).filter((i) => i.action && i.action.type === type);
  const reveal = async () => { const rs = await A.api('POST', '/api/vault/reveal-session', { password: SECOND }); return rs.json && rs.json.page; };
  const openTray = async () => { await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`); await A.until(visible('#user-todos-popup .ut-item'), { timeout: 8000 }); await A.evalJs(`(() => { for (const d of document.querySelectorAll('#user-todos-popup details.ut-detail-exp')) d.open = true; return true; })()`); await sleep(350); };
  const closeTray = () => A.evalJs(`document.getElementById('user-todos-popup')?.classList.add('hidden'); true`);
  const cardView = (re) => A.evalJs(`(() => { const it = ${ITEM(re)}; if (!it) return null; it.scrollIntoView({ block: 'center' }); const fold = it.querySelector('details.ut-run-fold'); const foldText = fold ? fold.textContent : ''; const rows = [...it.querySelectorAll('.ut-run-facts .ut-run-row')].map((r) => ({ k: r.dataset.fact, l: (r.querySelector('.ut-run-lbl') || {}).textContent || '', v: (r.querySelector('.ut-run-val') || {}).textContent || '', warn: r.classList.contains('ut-run-warn') })); const codes = fold ? [...fold.querySelectorAll('code')].map((c) => c.textContent) : []; const out = { text: it.textContent, face: it.textContent.replace(foldText, ''), rows, codes, links: [...it.querySelectorAll('.fy-link')].map((a) => a.textContent), buttons: [...it.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) }; if (fold) fold.open = false; return out; })()`);   // r2: the standing card's label rows + its ONE fold (closed for the shot — the face is what the owner reads)

  console.log('② THE STANDING REQUEST — one card, its two answers; Allow (验证是你) ⇒ the segments run with no card');
  let rq = null;
  for (let i = 0; i < 30; i++) { rq = await cli('vibespace-vault', ['request', REF, '--standing', '--command', 'python3 transcribe.py', '--for', 'transcribe the 40 interview segments'], TOKEN); if (rq.code === 0 || /unknown option/.test(rq.out)) break; await sleep(300); }
  check('the agent: `vibespace-vault request <ref> --standing --command "python3 transcribe.py" --for …` ⇒ exit 0, «asked the user ONCE for a standing grant»', rq.code === 0 && /asked the user ONCE for a standing grant/.test(rq.out), rq.out);
  const sc = (await openOf('vault-grant-ask'))[0];
  check('ONE card in For you, marked standing', !!sc && sc.action.standing === true, sc && sc.action);
  await openTray();
  const view = await cardView('/常驻使用/');
  const rowOf = (v, k) => (v && v.rows.find((r) => r.k === k)) || null;
  check('its words in 中文: who asks for a STANDING grant on WHICH secret (its name), the command python3 transcribe.py, «直到你收回»', !!view && /Transcriber 请求常驻使用「TTS API key」/.test(view.text) && /python3 transcribe\.py/.test((rowOf(view, 'command') || {}).v || '') && /直到你收回/.test((rowOf(view, 'until') || {}).v || ''), view && view.text.slice(0, 600));
  check('r2 (visual): LABEL ROWS — 密钥 = the entry\'s NAME, 用途, 命令, 运行 = the program\'s real path, 期限, and (a closed entry) 另外: Allow turns «可供 agent 运行使用» on', !!view && view.rows.map((r) => r.k).join() === 'secret,purpose,command,program,until,switch' && rowOf(view, 'secret').l === '密钥' && rowOf(view, 'secret').v === LABEL && rowOf(view, 'purpose').l === '用途' && rowOf(view, 'command').l === '命令' && rowOf(view, 'program').l === '运行' && rowOf(view, 'program').v.includes(fs.realpathSync(PY)) && rowOf(view, 'switch').warn && /可供 agent 运行使用/.test(rowOf(view, 'switch').v), view && view.rows);
  check('r2 (visual): the vault:// reference is NOT on the face — only under «技术细节», as code; nothing on the card is a link', !!view && !view.face.includes('vault://') && view.codes.includes(REF) && !view.links.length, view && { codes: view.codes, links: view.links });
  check('its answers: «允许（常驻）» and «拒绝» — never 允许一次 / 8 小时', !!view && view.buttons.includes('允许（常驻）') && view.buttons.includes('拒绝') && !view.buttons.includes('允许一次') && !view.buttons.includes('8 小时'), view && view.buttons);
  await A.shot('vsr-1-standing-card-desktop.png');
  await closeTray();
  const page = await reveal();
  const yes = await A.api('POST', `/api/vault/request/asks/${sc.action.askId}`, { answer: 'standing', page }, { 'X-Vault-Page': page || '' });
  check('the owner\'s Allow (验证是你) ⇒ granted · standing', yes.status === 200 && yes.json.ok && yes.json.grantedFor === 'standing', yes.json);
  const r1 = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'python3', 'transcribe.py', 'part01.mp3'], TOKEN, { timeout: 70000 });
  const r2 = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'python3', 'transcribe.py', 'part02.mp3'], TOKEN, { timeout: 70000 });
  check('two segments run with NO card (the real python3 had the key; no value in the output)', r1.code === 0 && r2.code === 0 && /transcribed \['part01\.mp3'\] key set/.test(r1.out) && /part02/.test(r2.out) && !r1.out.includes(VALUE) && (await openOf('vault-run-ask')).length === 0, { r1: r1.out.slice(0, 200), r2: r2.out.slice(0, 200) });
  const uses = await cli('vibespace-vault', ['uses'], TOKEN);
  check(`\`vibespace-vault uses\`: «standing · the command ${PYN} transcribe.py · since …» and «by grant · standing vg-…»`, new RegExp(`standing · the command ${reEsc(PYN)} transcribe\\.py · since `).test(uses.out) && /by grant · standing vg-[0-9a-f]{8}/.test(uses.out), uses.out.slice(0, 900));

  console.log('③ THE VAULT ROW — the chip says the command and who asked; 「谁可以用…」 explains 主机 and «让 agent 自己申请»');
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const chip = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); if (!c) return null; c.scrollIntoView({ block: 'center' }); return c.textContent; })()`, { timeout: 15000 });
  check(`the chip: «Transcriber · 命令 ${PYN} transcribe.py · 无限期 · 已用 2 次 · agent 申请 · HH:MM ✕» (the real program and ITS OWN end — r4; the source and its time last)`, new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py · 无限期 · 已用 2 次 · agent 申请 · \\d\\d:\\d\\d✕$`).test(String(chip)), chip);
  await sleep(300);
  await A.shot('vsr-2-vault-row-desktop.png');
  await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; const b = r && r.querySelector('.vw-use-grant'); if (b) b.click(); return !!b; })()`);
  const dlg = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); if (!d) return null; const w = d.querySelector('.vw-use-hosts-what'), a = d.querySelector('.vw-use-ask-agent'), c = d.querySelector('.vw-use-cmds'), h = d.querySelector('.vw-use-hosts'); return w && a ? { what: w.textContent, ask: a.textContent, cmds: c ? c.textContent : '', order: !!(h && (h.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) && (w.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)) } : null; })()`, { timeout: 6000 });
  check('「谁可以用…」 says what a 主机 is (e.g. api.openai.com), and «不知道怎么填？让 agent 自己申请。» naming the request sits right under the host field; the command member is kept', !!dlg && /主机就是命令带着它连去的地方/.test(dlg.what) && /api\.openai\.com/.test(dlg.what) && /不知道怎么填？让 agent 自己申请。/.test(dlg.ask) && /--standing/.test(dlg.ask) && new RegExp(`${reEsc(PYN)} transcribe\\.py（保留）`).test(dlg.cmds) && dlg.order === true, dlg);
  await A.evalJs(`(() => { const a = document.querySelector('#vault-use-grant .vw-use-ask-agent'); if (a) a.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(200);
  await A.shot('vsr-3-who-may-use-dialog-desktop.png');
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const b = d && [...d.querySelectorAll('button')].find((x) => x.classList.contains('btn-cancel')); if (b) b.click(); return true; })()`);
  await sleep(300);

  console.log('④ THE CARD\'S «总是（这条命令）» — another script, where the destination cannot be read');
  const runP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'python3', 'upload.py'], TOKEN, { timeout: 70000 });
  let rc = null;
  for (let i = 0; i < 60 && !rc; i++) { rc = (await openOf('vault-run-ask'))[0] || null; if (!rc) await sleep(200); }
  check('a run of upload.py (not granted) draws its card, offering «Always (this command)»', !!rc && rc.action.always === true && rc.action.command === true, rc && rc.action);
  await openTray();
  const rv = await A.evalJs(`(() => { const it = [...document.querySelectorAll('#user-todos-popup .ut-item')].find((e) => /upload\\.py/.test(e.textContent)); if (!it) return null; it.scrollIntoView({ block: 'center' }); return { text: it.textContent, buttons: [...it.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) }; })()`);
  check('the card\'s button «总是（这条命令）» beside «允许一次» / «拒绝», with the plain words «VibeSpace 看不到这个程序把密钥发往哪里 … 换了程序或脚本会再问»', !!rv && rv.buttons.includes('总是（这条命令）') && rv.buttons.includes('允许一次') && /VibeSpace 看不到这个程序把密钥发往哪里/.test(rv.text) && /换了程序或脚本会再问/.test(rv.text), rv && { buttons: rv.buttons, text: rv.text.slice(0, 700) });
  await A.shot('vsr-4-run-card-always-command-desktop.png');
  await closeTray();
  const page2 = await reveal();
  const al = await A.api('POST', `/api/vault/run/asks/${rc.action.askId}`, { answer: 'always' }, { 'X-Vault-Page': page2 || '' });
  check('«Always (this command)» (验证是你) ⇒ ok, a command grant with no end', al.status === 200 && al.json.ok && al.json.outcome === 'always' && al.json.ttl === 'forever' && al.json.command === `${PYN} upload.py`, al.json);
  const ra = await runP;
  const rb = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'python3', 'upload.py'], TOKEN, { timeout: 70000 });
  check('that run went, and the next one of it runs with no card', ra.code === 0 && rb.code === 0 && /uploaded key set/.test(rb.out) && (await openOf('vault-run-ask')).length === 0, { ra: ra.out.slice(0, 200), rb: rb.out.slice(0, 200) });
  const chip2 = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /upload\\.py/.test(x.textContent)); return c ? c.textContent : null; })()`, { timeout: 8000 });
  check('the chip now names both commands, EACH with its own end (r4), and the latest source «卡片上的总是»', new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py · 无限期, 命令 ${reEsc(PYN)} upload\\.py · 无限期 · 已用 \\d+ 次 · 卡片上的总是 · \\d\\d:\\d\\d✕$`).test(String(chip2)), chip2);

  console.log('⑤ THE PHONE (390 px) — a standing card and the Vault row');
  await A.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await A.cdp('Page.navigate', { url: URL });
  await A.until(`!!(window.app && app.replayOpenSpec)`, { timeout: 30000 });
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  if (await A.evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await A.api('POST', '/api/vault/unlock', { password: SECOND }); await sleep(300); }
  const rq2 = await cli('vibespace-vault', ['request', REF, '--standing', '--host', 'api.tts.example', '--for', 'call the speech API for the narration'], TOKEN);
  check('a second standing request (a hosts scope) ⇒ filed', rq2.code === 0, rq2.out);
  await openTray();
  const pview = await cardView('/api\\.tts\\.example/');
  check('r2 (visual, phone): the hosts card — 主机 row api.tts.example; the reference only under the fold as code; NO link anywhere on it (the phone linkified «://secrets/secret:…» before)', !!pview && /api\.tts\.example/.test((pview.rows.find((r) => r.k === 'hosts') || {}).v || '') && (pview.rows.find((r) => r.k === 'hosts') || {}).l === '主机' && !pview.face.includes('vault://') && pview.codes.includes(REF) && !pview.links.length, pview && { rows: pview.rows, links: pview.links, codes: pview.codes });
  const pv = await A.evalJs(`(() => { const it = ${ITEM('/api\\.tts\\.example/')}; if (!it) return null; it.scrollIntoView({ block: 'center' }); const r = it.getBoundingClientRect(); const btns = [...it.querySelectorAll('button')].filter((b) => /允许（常驻）|拒绝/.test(b.textContent)); return { w: r.width, overflow: it.scrollWidth > it.clientWidth + 1, buttons: btns.map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(q.height), inside: q.left >= r.left - 1 && q.right <= r.right + 1 }; }), hosts: /主机api\\.tts\\.example/.test(it.textContent) }; })()`);
  check('at 390 px the card fits (no sideways overflow), its scope reads «主机 api.tts.example», both answers inside the card and ≥ 32 px tall', !!pv && !pv.overflow && pv.hosts && pv.buttons.length === 2 && pv.buttons.every((b) => b.inside && b.h >= 32), pv);
  await A.shot('vsr-5-standing-card-phone.png');
  await closeTray();
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const pchip = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); if (!c) return null; c.scrollIntoView({ block: 'center' }); const q = c.getBoundingClientRect(); return { w: Math.round(q.width), vw: window.innerWidth, right: Math.round(q.right) }; })()`, { timeout: 15000 });
  check('at 390 px the Vault row\'s chip stays inside the screen', !!pchip && pchip.right <= pchip.vw + 1, pchip);
  await sleep(300);
  await A.shot('vsr-6-vault-row-phone.png');
  await A.cdp('Emulation.clearDeviceMetricsOverride', {});
  await A.cdp('Page.navigate', { url: URL });
  await A.until(`!!(window.app && app.replayOpenSpec)`, { timeout: 30000 });
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  if (await A.evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await A.api('POST', '/api/vault/unlock', { password: SECOND }); await sleep(300); }

  console.log('⑥ (r2, MAJOR 3) THE AGENT\'S OWN ENTRY — a standing member on it is SEEN and ✕-able in its Vault row');
  const mt = await cli('vibespace-vault', ['mint', 'tts-own', '--for', 'api.tts.example'], TOKEN);
  const OWN = (String(mt.out).match(/vault:\/\/agent:[^\s]+/) || [])[0] || null;
  check('the agent mints its own entry', mt.code === 0 && !!OWN, mt.out);
  const ownP = cli('vibespace-vault', ['run', '--env', `T=${OWN}`, '--', 'python3', 'transcribe.py', 'own01.mp3'], TOKEN, { timeout: 70000 });
  let oc = null;
  for (let i = 0; i < 60 && !oc; i++) { oc = (await openOf('vault-run-ask')).find((x) => x.action && x.action.command) || null; if (!oc) await sleep(200); }
  const page3 = await reveal();
  const oa = oc && await A.api('POST', `/api/vault/run/asks/${oc.action.askId}`, { answer: 'always' }, { 'X-Vault-Page': page3 || '' });
  const oRun = await ownP;
  check('its card offers «总是（这条命令）»; Always (验证是你) ⇒ ok', !!oc && !!oa && oa.status === 200 && oa.json.ok && oRun.code === 0, { action: oc && oc.action, oa: oa && oa.json, out: oRun.out.slice(0, 200) });
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const OWN_ROW = `[...document.querySelectorAll('.vw-list .vw-row')].find((r) => r.isConnected && String(r.dataset.id || '').startsWith('secrets:agent:') && String(r.dataset.id).includes('/tts-own#'))`;
  const own = await A.until(`(() => { const r = ${OWN_ROW}; const c = r && r.querySelector('.vw-use-chip'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const g = r.querySelector('.vw-use-grant'); return { chip: c.textContent, x: !!c.querySelector('.vw-use-x'), add: !!(g && !g.hidden && g.getBoundingClientRect().width > 0) }; })()`, { timeout: 15000 });
  check(`its Vault row now SHOWS the member: «Transcriber · 命令 ${PYN} transcribe.py · 无限期 · 已用 1 次 · 卡片上的总是 · HH:MM ✕» — with its ✕, and no «谁可以用…» (only its conversation may use it)`, !!own && new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py · 无限期(?: · 已用 \\d+ 次)? · 卡片上的总是 · \\d\\d:\\d\\d✕$`).test(own.chip) && own.x && !own.add, own);
  await sleep(300);
  await A.shot('vsr-7-own-entry-row-desktop.png');
  await A.evalJs(`(() => { const r = ${OWN_ROW}; const x = r && r.querySelector('.vw-use-chip .vw-use-x'); if (x) x.click(); return !!x; })()`);
  const gone = await A.until(`(() => { const r = ${OWN_ROW}; return r && !r.querySelector('.vw-use-chip') ? true : null; })()`, { timeout: 10000 });
  const ownP2 = cli('vibespace-vault', ['run', '--env', `T=${OWN}`, '--', 'python3', 'transcribe.py', 'own02.mp3'], TOKEN, { timeout: 70000 });
  let oc2 = null;
  for (let i = 0; i < 60 && !oc2; i++) { oc2 = (await openOf('vault-run-ask'))[0] || null; if (!oc2) await sleep(200); }
  if (oc2) await A.api('POST', `/api/vault/run/asks/${oc2.action.askId}`, { answer: 'deny' });
  await ownP2;
  check('its ✕ takes it back: the chip goes, and the next run of it draws its card again', gone === true && !!oc2, { gone, card: !!oc2 });

  console.log('⑥b (r5, the r4 acceptance\'s MAJOR) WHAT THE ROW WILL BE IS ON THE CARD — the replace line on its own row above the answers (tray, For-you window, 390 px); a card drawn again is marked; the Save says each end first');
  const rq3 = await cli('vibespace-vault', ['request', REF, '--standing', '--host', 'speech.example', '--for', 'call the speech API'], TOKEN);
  const sc3 = (await openOf('vault-grant-ask')).find((i) => /speech\.example/.test(JSON.stringify(i.facts || {})));
  const page5 = await reveal();
  const y3 = sc3 && await A.api('POST', `/api/vault/request/asks/${sc3.action.askId}`, { answer: 'standing', page: page5 }, { 'X-Vault-Page': page5 || '' });
  check('(the setup) speech.example is held with NO end — an agent\'s standing request, Allowed', rq3.code === 0 && !!y3 && y3.status === 200 && y3.json.ok, { rq3: rq3.out.slice(0, 200), y3: y3 && y3.json });
  const run1 = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'curl', '-m', '3', 'https://speech.example/v1/tts', 'https://upload.example/v1/put'], TOKEN, { timeout: 70000 });
  let c1 = null;
  for (let i = 0; i < 60 && !c1; i++) { c1 = (await openOf('vault-run-ask')).find((x) => /upload\.example/.test(String(x.detail))) || null; if (!c1) await sleep(200); }
  const T_C1 = Date.now();   // the card's 60 s: the redraw below is pressed well inside it
  check('a run to speech.example (held) + upload.example (not) draws its card — the hosts «Always» offered', !!c1 && c1.action.always === true && !c1.action.command, c1 && c1.action);
  const LINE_ZH = '这个对话持有 speech.example，不设期限 — 这会替换那个授权：之后 speech.example 为期 30 天。';
  const trayRow = () => A.evalJs(`(() => { const it = ${ITEM('/upload\\.example/')}; if (!it) return null; it.scrollIntoView({ block: 'center' }); const ch = it.querySelector('.ut-run-changes'), ans = it.querySelector('.ut-run-answer'), rd = it.querySelector('.ut-run-redrawn'); const r = it.getBoundingClientRect(), q = ch && ch.getBoundingClientRect(); return { changes: ch ? [...ch.querySelectorAll('.ut-run-line')].map((l) => l.textContent) : null, redrawn: rd ? rd.textContent : null, above: !!(ch && ans && (ch.compareDocumentPosition(ans) & Node.DOCUMENT_POSITION_FOLLOWING)), seen: !!(q && q.width > 0 && q.height > 0), inside: !!(q && q.left >= r.left - 1 && q.right <= r.right + 1), overflow: it.scrollWidth > it.clientWidth + 1, buttons: [...it.querySelectorAll('.ut-run-answer button')].map((b) => b.textContent.trim()), hint: !!it.querySelector('.ut-run-answer .ut-run-hint') }; })()`);
  await openTray();
  const t1 = await trayRow();
  check(`the tray row: «${LINE_ZH}» on its OWN row ABOVE 允许一次 / 总是… / 拒绝 (never only in the hidden hint)`, !!t1 && t1.changes && t1.changes.length === 1 && t1.changes[0] === LINE_ZH && t1.above && t1.seen && t1.buttons.length === 3 && !t1.hint, t1);
  await sleep(300);
  await A.shot('vsr-10-replace-line-desktop.png');
  await closeTray();
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(c1 && c1.id)} }); true`);
  const w1 = await A.until(`(() => { const ch = [...document.querySelectorAll('.iw-detail .ut-run-changes')].find((e) => e.getBoundingClientRect().width > 0); if (!ch) return null; const d = ch.closest('.iw-detail'), win = ch.closest('.window, .wm-window') || document.body, acts = [...win.querySelectorAll('.iw-actions')].find((a) => a.getBoundingClientRect().width > 0); return { line: [...ch.querySelectorAll('.ut-run-line')].map((l) => l.textContent), above: !!(acts && (d.compareDocumentPosition(acts) & Node.DOCUMENT_POSITION_FOLLOWING)), acts: acts ? [...acts.querySelectorAll('button')].map((b) => (b.title || b.textContent).trim()).filter(Boolean).slice(0, 6) : [] }; })()`, { timeout: 10000 });
  check('the For-you window (the other client): the same line in its pane, above its action row', !!w1 && w1.line.length === 1 && w1.line[0] === LINE_ZH && w1.above, w1);
  await sleep(300);
  await A.shot('vsr-11-replace-line-foryou-window.png');
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(300);
  const narrow = async (on) => {
    if (on) await A.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); else await A.cdp('Emulation.clearDeviceMetricsOverride', {});
    await A.cdp('Page.navigate', { url: URL });
    await A.until(`!!(window.app && app.replayOpenSpec)`, { timeout: 30000 });
    await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
    if (await A.evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await A.api('POST', '/api/vault/unlock', { password: SECOND }); await sleep(300); }
  };
  await narrow(true);
  await openTray();
  const p1 = await trayRow();
  check('the phone (390 px): the line on its own row above the answers, inside the card (no sideways overflow)', !!p1 && p1.changes && p1.changes[0] === LINE_ZH && p1.above && p1.seen && p1.inside && !p1.overflow, p1);
  await sleep(300);
  await A.shot('vsr-12-replace-line-phone.png');
  await closeTray();
  // the card goes stale: ANOTHER card's «Always» writes speech.example (30 days) while this one waits — its press draws it again
  const run2 = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'curl', '-m', '3', 'https://speech.example/v2/tts', 'https://other.example/v1'], TOKEN, { timeout: 70000 });
  let c2 = null;
  for (let i = 0; i < 60 && !c2; i++) { c2 = (await openOf('vault-run-ask')).find((x) => /other\.example/.test(String(x.detail))) || null; if (!c2) await sleep(200); }
  const page6 = await reveal();
  const a2 = c2 && await A.api('POST', `/api/vault/run/asks/${c2.action.askId}`, { answer: 'always' }, { 'X-Vault-Page': page6 || '' });
  await run2;
  const a1 = c1 && await A.api('POST', `/api/vault/run/asks/${c1.action.askId}`, { answer: 'always' }, { 'X-Vault-Page': page6 || '' });
  check('another card\'s «Always» wrote speech.example (30 days); THIS card\'s press then writes nothing — 409 ask_redrawn (inside its 60 s)', !!a2 && a2.status === 200 && a2.json.ok && !!a1 && a1.status === 409 && a1.json.code === 'ask_redrawn' && Date.now() - T_C1 < 55000, { a2: a2 && a2.json, a1: a1 && a1.json, ms: Date.now() - T_C1 });
  await openTray();
  const p2 = await A.until(`(() => { const it = ${ITEM('/upload\\.example/')}; return it && it.querySelector('.ut-run-redrawn') ? true : null; })()`, { timeout: 8000 }) && await trayRow();
  const REDRAWN_RE = /^已于 \S+ 重新绘制：这个回答要写入的内容与卡片最初显示时不同 — 请重新阅读。$/, NOW_RE = /^这个对话持有 speech\.example，到 .+ — 这会替换那个授权：之后 speech\.example 为期 30 天。$/;
  check('the card drawn again is MARKED (phone): «已于 HH:MM 重新绘制：…请重新阅读。» first on its row, then the line of NOW («…持有 speech.example，到 … — 这会替换那个授权…») — never the old face', !!p2 && REDRAWN_RE.test(String(p2.redrawn)) && p2.changes && p2.changes.length === 2 && NOW_RE.test(p2.changes[1]) && p2.inside && !p2.overflow, p2);
  await sleep(300);
  await A.shot('vsr-14-redrawn-card-phone.png');
  await closeTray();
  await narrow(false);
  await openTray();
  const d2 = await trayRow();
  check('… and at a desk the same', !!d2 && REDRAWN_RE.test(String(d2.redrawn)) && d2.changes && NOW_RE.test(String(d2.changes[1])) && d2.above, d2);
  await sleep(300);
  await A.shot('vsr-13-redrawn-card-desktop.png');
  await closeTray();
  if (c1) await A.api('POST', `/api/vault/run/asks/${c1.action.askId}`, { answer: 'deny' });
  await run1;
  // r5 (MINOR 2): «As each has it now» — a host typed new takes the member's EARLIEST live end; the dialog says it BEFORE Save
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const b = r && r.querySelector('.vw-use-grant'); if (!b) return null; b.click(); return true; })()`, { timeout: 15000 });
  const pv1 = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); const h = d && d.querySelector('.vw-use-hosts'), e = d && d.querySelector('.vw-use-end'); if (!h || !e) return null; const was = h.value; h.value = (was ? was + ', ' : '') + 'new.example'; h.dispatchEvent(new Event('input', { bubbles: true })); const p = d.querySelector('.vw-use-preview'); const out = { was, end: e.value, preview: p && !p.hidden ? p.textContent : null, fresh: p ? [...p.querySelectorAll('.vw-use-scope-new')].map((s) => s.textContent) : [] }; p && p.scrollIntoView({ block: 'center' }); return out; })()`, { timeout: 10000 });
  check('「谁可以用…」 under «各自保持现有设置» (the member holds commands with no end and hosts with 30 days): a host typed new is said BEFORE Save — «new.example · 30 天 （新）», the earliest live end, never 无限期', !!pv1 && pv1.end === 'keep' && pv1.fresh.length === 1 && /^new\.example · (29|30) 天 （新）$/.test(pv1.fresh[0]) && /保存后写入：/.test(String(pv1.preview)) && /speech\.example · (29|30) 天/.test(String(pv1.preview)) && /无限期/.test(String(pv1.preview)), pv1);
  await sleep(200);
  await A.shot('vsr-15-save-preview-desktop.png');
  // put the field back as it was (the dialog's unsaved guard sees no change), then Cancel — nothing is saved
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const h = d && d.querySelector('.vw-use-hosts'); if (h) { h.value = ${JSON.stringify((pv1 && pv1.was) || '')}; h.dispatchEvent(new Event('input', { bubbles: true })); } const b = d && [...d.querySelectorAll('button')].find((x) => x.classList.contains('btn-cancel')); if (b) b.click(); return true; })()`);
  check('Cancel closes it with nothing saved', !!(await A.until(`!document.getElementById('vault-use-grant')`, { timeout: 5000 })));

  console.log('⑧ (r7, the owner 2026-10-31 «不清楚发往何处的话 … 1个小时授权吧») «ALLOW FOR 1 HOUR» — three answers (1280 + 390), the press, the record in every client, a notice on a SECOND client at the next use (nothing filed), the chip with its end');
  const countItems = async () => { const t = await todo(); return (t.open || []).length + (t.resolved || []).length; };
  // (measured first) what an ADMITTED standing-grant use shows in the CHAT today — the conversation's chat open, a run its ④ command grant admits
  const SID = (frames0.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find((m) => m && m.type === 'created' && m.reqId === 'vsr1') || {}).sessionId;
  await A.evalJs(`(() => { if (![...app.wm.windows.values()].some((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(SID)})) app.attachSession(${JSON.stringify(SID)}, 'Transcriber', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const chatOpen = await A.until(`!!document.querySelector('.chat-message-list')`, { timeout: 15000 });
  const chatNow = () => A.evalJs(`({ msgs: document.querySelectorAll('.chat-message-list .chat-msg').length, cards: document.querySelectorAll('.cn-card').length, open: document.querySelectorAll('.cn-card:not(.cn-done)').length })`);
  const ch0 = await chatNow(), n0 = await countItems();
  const gu = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'python3', 'upload.py'], TOKEN, { timeout: 70000 });
  await sleep(1500);
  const ch1 = await chatNow(), n1 = await countItems();
  check(`(MEASURED) an ADMITTED standing-grant use shows NOTHING in the chat today — no row, no card (its chat: ${ch0.msgs} messages / ${ch0.cards} cards before, ${ch1.msgs} / ${ch1.cards} after) and For you +0; its trace is the use line («by grant · standing») and the row's «used N×»`, !!SID && !!chatOpen && gu.code === 0 && /uploaded key set/.test(gu.out) && ch1.msgs === ch0.msgs && ch1.cards === ch0.cards && n1 === n0, { SID, chatOpen, gu: gu.out.slice(0, 160), ch0, ch1, n0, n1 });
  console.log(`    measured: chat ${JSON.stringify(ch0)} → ${JSON.stringify(ch1)}, For-you items ${n0} → ${n1}`);
  // the SECOND client: another page of the same sign-in, its toasts recorded as they come (a toast lives 6 s)
  const tB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const B = await pageOf(tB);
  await B.cdp('Page.navigate', { url: URL });
  await B.until(`!!(window.app && app.wm)`, { timeout: 30000 });
  await B.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  await B.evalJs(`window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('global-toast')) window.__toasts.push({ text: n.textContent, at: Date.now() }); }).observe(document.body, { childList: true, subtree: true }); true`);
  // THE CARD: the brief's own shape — a shell whose inline code sends the key (the hub cannot read where)
  const winP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'bash', '-c', 'curl -s -m 2 -H "Authorization: Bearer $T" https://api.tts.example/v1/asr || true'], TOKEN, { timeout: 70000 });
  let wc = null;
  for (let i = 0; i < 60 && !wc; i++) { wc = (await openOf('vault-run-ask')).find((x) => /v1\/asr/.test(String(x.detail))) || null; if (!wc) await sleep(200); }
  const T_W = Date.now();   // the card's 60 s: everything below is read and pressed inside it
  check('`bash -c \'curl … -H "Authorization: Bearer $T" …\'` draws its card WITHOUT a hosts «Always» and WITH «Allow for 1 hour» (action.window)', !!wc && wc.action.window === true && wc.action.always === false, wc && wc.action);
  const HOUR_ROW = () => A.evalJs(`(() => { const it = ${ITEM('/v1\\/asr/')}; if (!it) return null; it.scrollIntoView({ block: 'center' }); const ch = it.querySelector('.ut-run-changes'), ans = it.querySelector('.ut-run-answer'); const r = it.getBoundingClientRect(), q = ch && ch.getBoundingClientRect(), a = ans && ans.getBoundingClientRect(); const btns = ans ? [...ans.querySelectorAll('button')] : []; return { changes: ch ? [...ch.querySelectorAll('.ut-run-line')].map((l) => l.textContent) : null, above: !!(q && a && q.bottom <= a.top + 1), buttons: btns.map((b) => { const z = b.getBoundingClientRect(); return { t: b.textContent.trim(), inside: z.left >= r.left - 1 && z.right <= r.right + 1, h: Math.round(z.height) }; }), hints: ans ? [...ans.querySelectorAll('.ut-run-hint')].map((h) => h.textContent) : [], overflow: it.scrollWidth > it.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, vw: window.innerWidth }; })()`);
  const HOUR_LINE = /^「允许 1 小时」：到 \d\d:\d\d 为止，这个对话可以在任何运行中使用“TTS API key”。$/;
  const HOUR_HINT = '1 小时内这个对话用这把密钥不再问你；每次使用都会弹一条提示（不进「待你处理」）；到期后再问。';
  await openTray();
  const h1 = await HOUR_ROW();
  check('the tray row (1280): 允许一次 · 允许 1 小时 · 拒绝 — its OWN row above them «「允许 1 小时」：到 HH:MM 为止，这个对话可以在任何运行中使用“TTS API key”。», and beside them «1 小时内这个对话用这把密钥不再问你；每次使用都会弹一条提示（不进「待你处理」）；到期后再问。»', !!h1 && h1.buttons.map((b) => b.t).join('|') === '允许一次|允许 1 小时|拒绝' && h1.changes && h1.changes.length === 1 && HOUR_LINE.test(h1.changes[0]) && h1.above && h1.hints.includes(HOUR_HINT), h1);
  await sleep(300);
  await A.shot('vsr-16-hour-card-desktop.png');
  await closeTray();
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wc && wc.id)} }); true`);
  const wv = await A.until(`(() => { const acts = [...document.querySelectorAll('.iw-actions')].find((a) => a.getBoundingClientRect().width > 0 && a.querySelector('[data-act="shape-window"]')); if (!acts) return null; const ch = [...document.querySelectorAll('.iw-detail .ut-run-changes')].find((e) => e.getBoundingClientRect().width > 0); return { acts: [...acts.querySelectorAll('[data-act]')].map((b) => b.dataset.act), label: (acts.querySelector('[data-act="shape-window"]').textContent || '').trim(), hints: [...acts.querySelectorAll('.ut-run-hint')].map((h) => h.textContent), line: ch ? [...ch.querySelectorAll('.ut-run-line')].map((l) => l.textContent) : null }; })()`, { timeout: 10000 });
  check('the For-you window (the other client): Allow once · 允许 1 小时 · Deny in its action row, the words beside them, the same line in its pane', !!wv && wv.acts.slice(0, 3).join() === 'hub-once,shape-window,hub-deny' && /允许 1 小时/.test(wv.label) && wv.hints.includes(HOUR_HINT) && wv.line && HOUR_LINE.test(wv.line[0]), wv);
  // r8 (the r7 acceptance, the surfaces' minor 3): the shot shows the pane's row and the hint — no transient toast over it, the
  // window maximized so the hint is inside it
  const iwMax = await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); const w = [...app.wm.windows.values()].find((x) => x.type === 'inbox'); const el = w && (w.element || w.el); const b = el && el.querySelector('.win-maximize'); if (b) b.click(); return !!b; })()`);
  const wvIn = await A.until(`(() => { const h = [...document.querySelectorAll('.iw-actions .ut-run-hint-window')].find((e) => e.getBoundingClientRect().width > 0); const ch = [...document.querySelectorAll('.iw-detail .ut-run-changes')].find((e) => e.getBoundingClientRect().width > 0); if (!h || !ch) return null; const r = h.getBoundingClientRect(), c = ch.getBoundingClientRect(); return r.bottom <= innerHeight && c.bottom <= innerHeight && !document.querySelector('.global-toast') ? { hint: Math.round(r.bottom), line: Math.round(c.bottom), vh: innerHeight } : null; })()`, { timeout: 8000 });
  check('(r8) the For-you window\'s shot is legible: the window maximized, its «允许 1 小时» row and the hint beside the answers inside the screen, no toast over them', !!iwMax && !!wvIn, { iwMax, wvIn });
  await sleep(300);
  await A.shot('vsr-17-hour-card-foryou-window.png');
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(300);
  await narrow(true);
  await openTray();
  const h2 = await HOUR_ROW();
  check('the phone (390 px): the three answers inside the card and ≥ 32 px tall, the line on its own row above them, no sideways overflow', !!h2 && h2.buttons.length === 3 && h2.buttons.every((b) => b.inside && b.h >= 32) && h2.changes && HOUR_LINE.test(h2.changes[0]) && h2.above && !h2.overflow, h2);
  await sleep(300);
  await A.shot('vsr-18-hour-card-phone.png');
  await closeTray();
  await narrow(false);
  await A.evalJs(`(() => { if (![...app.wm.windows.values()].some((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(SID)})) app.attachSession(${JSON.stringify(SID)}, 'Transcriber', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);   // its chat again (the reloads above)
  await A.until(`!!document.querySelector('.chat-message-list .cn-card[data-item="${wc && wc.id}"]')`, { timeout: 15000 });
  // THE PRESS (验证是你), inside the card's 60 s
  const nW = await countItems();
  const pageW = await reveal();
  const wa = wc && await A.api('POST', `/api/vault/run/asks/${wc.action.askId}`, { answer: 'window' }, { 'X-Vault-Page': pageW || '' });
  const wr = await winP;
  const T_P = Date.now();
  check('«允许 1 小时» (验证是你) ⇒ ok · window (its end the press + 1 h), inside the card\'s 60 s; the run goes', !!wa && wa.status === 200 && wa.json.ok && wa.json.outcome === 'window' && Math.abs(Number(wa.json.until) - (T_P + 3600e3)) < 60e3 && T_P - T_W < 58000 && wr.code === 0, { wa: wa && wa.json, ms: T_P - T_W, wr: wr.out.slice(0, 200) });
  const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const TAIL = `已允许这个对话 1 小时 · 至 ${hm(Number(wa && wa.json && wa.json.until))} · 可在保险库窗口收回`;
  // THE RECORD — the same words in the chat card, the tray and the For-you window
  const chatRec = await A.until(`(() => { const c = document.querySelector('.cn-card.cn-done[data-item="${wc && wc.id}"]'); if (!c) return null; const l = c.querySelector('.cn-line'); return l ? l.textContent : c.textContent; })()`, { timeout: 10000 });
  await openTray();
  const trayRec = await A.until(`(() => { const it = ${ITEM('/v1\\/asr/')}; return it && /已允许这个对话 1 小时/.test(it.textContent) ? it.textContent : null; })()`, { timeout: 8000 });
  await sleep(300);
  await A.shot('vsr-19-hour-record-tray.png');
  await closeTray();
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wc && wc.id)} }); true`);
  const winRec = await A.until(`(() => { const m = [...document.querySelectorAll('.iw-pane, .iw-detail-pane, .iw-head, .iw-meta')].map((e) => e.textContent).find((x) => /已允许这个对话 1 小时/.test(x)); return m || null; })()`, { timeout: 10000 });
  await sleep(300);
  await A.shot('vsr-20-hour-record-foryou-window.png');
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(300);
  const near = (x) => (typeof x === 'string' ? x.slice(Math.max(0, x.indexOf('已允许') - 30), x.indexOf('已允许') + 90) : x);
  check(`the record says «${TAIL}» — in the chat card, the tray and the For-you window alike`, [chatRec, trayRec, winRec].every((x) => typeof x === 'string' && x.includes(TAIL)), { chatRec: near(chatRec), trayRec: near(trayRec), winRec: near(winRec) });
  // THE NEXT USE — another command: no card, nothing filed, a notice on the SECOND client
  const ch2 = await chatNow(), n2 = await countItems();
  await B.evalJs(`window.__toasts.length = 0; true`);
  const u1 = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'sh', '-c', 'printf "%s\\n" "${T:+the key is set}"'], TOKEN, { timeout: 70000 });
  const toastB = await B.until(`(window.__toasts || []).find((t) => /在你的 1 小时授权下用了/.test(t.text)) || null`, { timeout: 10000 });
  const SHN = (() => { for (const d of String(process.env.PATH || '').split(':')) { try { return path.basename(fs.realpathSync(path.join(d, 'sh'))); } catch { } } return 'sh'; })();   // the program's REAL name (sh is a link: dash here) — what the card and the notice say
  await B.shot('vsr-21-hour-use-toast-second-client.png');
  await sleep(800);
  const ch3 = await chatNow(), n3 = await countItems();
  check(`the NEXT use (\`sh -c …\`, another command) runs with NO card, files NOTHING (For you +0, the chat +0 rows / +0 cards — ${ch2.msgs} messages / ${ch2.cards} cards before and after) — and the SECOND client pops «Transcriber 在你的 1 小时授权下用了“TTS API key”（还剩 60 分钟）— ${SHN} → 去向未知»`, u1.code === 0 && /the key is set/.test(u1.out) && !!toastB && new RegExp(`^Transcriber 在你的 1 小时授权下用了“TTS API key”（还剩 (59|60) 分钟）— ${reEsc(SHN)} → 去向未知`).test(toastB.text) && n3 === n2 && n2 === nW + 0 && ch2.cards > 0 && ch3.msgs === ch2.msgs && ch3.cards === ch2.cards, { u1: u1.out.slice(0, 160), toastB, n: [nW, n2, n3], ch2, ch3 });
  console.log(`    measured (a window use): chat ${JSON.stringify(ch2)} → ${JSON.stringify(ch3)}, For-you items ${n2} → ${n3}`);
  // r8 (MAJOR 1): THIS hub is a LOCAL instance — the APPROVED command itself, again inside the hour, is a window use: no card,
  // nothing filed, its notice (r7 let it through by `seen`, silently, until the vault locked)
  await B.evalJs(`window.__toasts.length = 0; true`);
  const n4 = await countItems();
  const u2 = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'bash', '-c', 'curl -s -m 2 -H "Authorization: Bearer $T" https://api.tts.example/v1/asr || true'], TOKEN, { timeout: 70000 });
  const toastB2 = await B.until(`(window.__toasts || []).find((t) => /在你的 1 小时授权下用了/.test(t.text)) || null`, { timeout: 10000 });
  const BASHN = (() => { for (const d of String(process.env.PATH || '').split(':')) { try { return path.basename(fs.realpathSync(path.join(d, 'bash'))); } catch { } } return 'bash'; })();
  const n5 = await countItems();
  check(`(r8, MAJOR 1 — this hub is a LOCAL instance) the APPROVED command itself, again inside the hour: NO card, nothing filed, and its notice «Transcriber 在你的 1 小时授权下用了“TTS API key”（还剩 N 分钟）— ${BASHN} → 去向未知»`, u2.code === 0 && !!toastB2 && new RegExp(`^Transcriber 在你的 1 小时授权下用了“TTS API key”（还剩 (5[0-9]|60) 分钟）— ${reEsc(BASHN)} → 去向未知`).test(toastB2.text) && n5 === n4, { u2: u2.out.slice(0, 160), toastB2, n: [n4, n5] });
  const uses2 = await cli('vibespace-vault', ['uses'], TOKEN);
  check('`vibespace-vault uses`: the window said («any run (the 1-hour approval, until …)»), the use line «by grant · standing vg-…» saying «under the 1-hour approval · N min left»', /any run \(the 1-hour approval, until /.test(uses2.out) && /by grant · standing vg-[0-9a-f]{8}.*for: under the 1-hour approval · \d+ min left/.test(uses2.out), uses2.out.slice(0, 1200));
  // THE CHIP — the window with its end, the warning accent
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const wchip = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); const s = c && c.querySelector('.vw-use-scope-window'); if (!s) return null; c.scrollIntoView({ block: 'center' }); const probe = document.createElement('span'); probe.style.color = 'var(--warn-text)'; document.body.append(probe); const warn = getComputedStyle(probe).color; probe.remove(); const wx = c.querySelector('.vw-use-window-x'); return { chip: c.textContent, scope: s.textContent, color: getComputedStyle(s).color, warn, title: s.title, wx: wx ? wx.title : null, principal: c.dataset.principal || '' }; })()`, { timeout: 15000 });
  check('the Vault row\'s chip says the window beside its other scopes — «任何目的地 · 至 HH:MM · 60 分钟», in the warning accent; r8: its OWN ✕ beside it, the member\'s source «卡片上的「允许 1 小时」 · HH:MM»', !!wchip && /^任何目的地 · 至 \d\d:\d\d · (59|60) 分钟$/.test(wchip.scope) && wchip.color === wchip.warn && /^Transcriber · /.test(wchip.chip) && /命令 /.test(wchip.chip) && /卡片上的「允许 1 小时」 · \d\d:\d\d/.test(wchip.chip) && !/卡片上的总是/.test(wchip.chip) && /只收回 1 小时授权/.test(String(wchip.wx)), wchip);
  await sleep(300);
  await A.shot('vsr-22-hour-chip-desktop.png');
  // r8 (MINOR 4): the WINDOW's own ✕ — only the window goes: the chip keeps its other scopes, the record says it, the next run asks
  await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); const x = c && c.querySelector('.vw-use-window-x'); if (x) x.click(); return !!x; })()`);
  const wgone = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); return c && !c.querySelector('.vw-use-scope-window') && !/任何目的地/.test(c.textContent) ? c.textContent : null; })()`, { timeout: 10000 });
  const T_X = Date.now();
  check('(r8, MINOR 4) the window\'s OWN ✕ takes back ONLY the window — the chip stays with its other scopes («命令 …»)', !!wgone && /^Transcriber · /.test(wgone) && /命令 /.test(wgone), wgone);
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);   // r8: no transient toast over the shot (the acceptance's vsr-17 note)
  await A.shot('vsr-23-hour-taken-back-chip-desktop.png');
  await openTray();
  const trayX = await A.until(`(() => { const it = ${ITEM('/v1\\/asr/')}; return it && /撤销/.test(it.textContent) ? it.textContent : null; })()`, { timeout: 8000 });
  await closeTray();
  check('the press\'s record is told — «已允许这个对话 1 小时 · 已于 HH:MM 撤销» (the tray)', typeof trayX === 'string' && new RegExp(`已允许这个对话 1 小时 · 已于 (${hm(T_X)}|${hm(T_X - 60e3)}) 撤销`).test(trayX), typeof trayX === 'string' ? trayX.slice(Math.max(0, trayX.indexOf('已允许') - 20), trayX.indexOf('已允许') + 60) : trayX);
  const afterP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'sh', '-c', 'printf "%s\\n" "${T:+after the window}"'], TOKEN, { timeout: 70000 });
  let ac = null;
  for (let i = 0; i < 60 && !ac; i++) { ac = (await openOf('vault-run-ask')).find((x) => /after the window/.test(String(x.detail))) || null; if (!ac) await sleep(200); }
  if (ac) await A.api('POST', `/api/vault/run/asks/${ac.action.askId}`, { answer: 'deny' });
  await afterP;
  check('after the window\'s ✕ the next shell run asks again — its card («允许 1 小时» offered anew)', !!ac && ac.action.window === true, ac && ac.action);
  // ✕ takes it back (the member, its window with it) — the next run asks again
  await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /Transcriber/.test(x.textContent)); const x = c && c.querySelector('.vw-use-x'); if (x) x.click(); return !!x; })()`);
  const xgone = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; return r && ![...r.querySelectorAll('.vw-use-chip')].some((x) => /Transcriber/.test(x.textContent)) ? true : null; })()`, { timeout: 10000 });
  const backP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'sh', '-c', 'printf "%s\\n" "${T:+again}"'], TOKEN, { timeout: 70000 });
  let bc = null;
  for (let i = 0; i < 60 && !bc; i++) { bc = (await openOf('vault-run-ask')).find((x) => /again/.test(String(x.detail))) || null; if (!bc) await sleep(200); }
  if (bc) await A.api('POST', `/api/vault/run/asks/${bc.action.askId}`, { answer: 'deny' });
  await backP;
  check('its ✕ takes it back: the chip goes, the next run draws its card again («Allow for 1 hour» offered anew)', xgone === true && !!bc && bc.action.window === true, { xgone, card: bc && bc.action });
  // r8 (除了): the owner EXCEPTS this conversation from an «All agents» grant on the entry — its card offers NO «允许 1 小时» (the
  // press would have taken it out of 除了 for good) and says why
  const EID = String(REF || '').replace(/^vault:\/\/secrets\/(.+)\/secret$/, 'secrets:$1#secret');
  const PKEY = String((wchip && wchip.principal) || '').replace(/^conversation:/, '');
  const pageE = await reveal();
  const ex = await A.api('POST', '/api/vault/use-grants', { id: EID, to: [{ kind: 'everyone', scopes: [{ host: 'x.example', until: Date.now() + 30 * 86400e3 }] }], except: [{ kind: 'conversation', key: PKEY }], page: pageE }, { 'X-Vault-Page': pageE || '' });
  const exP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'bash', '-c', 'curl -s -m 2 -H "X: $T" https://except.example/v1/x || true'], TOKEN, { timeout: 70000 });
  let xc = null;
  for (let i = 0; i < 60 && !xc; i++) { xc = (await openOf('vault-run-ask')).find((x) => /except\.example/.test(String(x.detail))) || null; if (!xc) await sleep(200); }
  await openTray();
  const xr = await A.until(`(() => { const it = ${ITEM('/except\\.example/')}; if (!it || !it.querySelector('.ut-run-answer')) return null; it.scrollIntoView({ block: 'center' }); const ans = it.querySelector('.ut-run-answer'); return { buttons: [...ans.querySelectorAll('button')].map((b) => b.textContent.trim()), off: [...ans.querySelectorAll('.ut-run-hint-window-off')].map((h) => h.textContent) }; })()`, { timeout: 10000 });
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); const it = ${ITEM('/except\\.example/')}; const h = it && it.querySelector('.ut-run-hint-window-off'); if (h) h.scrollIntoView({ block: 'center' }); return true; })()`);   // r8: the line in view, no toast over it
  await A.shot('vsr-24-hour-excepted-card-desktop.png');
  await closeTray();
  if (xc) await A.api('POST', `/api/vault/run/asks/${xc.action.askId}`, { answer: 'deny' });
  await exP;
  // r9 (MAJOR A): the owner ✕'s the «All agents» member — the row KEEPS its 除了 (an except-only row; r8 dropped the exception
  // with the last member, so the next grant would have admitted the conversation the owner excluded)
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const allX = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => !x.classList.contains('vw-use-except') && /^所有 agent/.test(x.textContent)); const x = c && c.querySelector('.vw-use-x'); if (!x) return null; x.click(); return true; })()`, { timeout: 15000 });
  const exOnly = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; if (!r) return null; const live = [...r.querySelectorAll('.vw-use-chip')].filter((x) => !x.classList.contains('vw-use-except')); const ex = [...r.querySelectorAll('.vw-use-except')].map((x) => x.textContent); const to = r.querySelector('.vw-use-to'); if (live.length || !ex.length) return null; const c = r.querySelector('.vw-use-chips'); if (c) c.scrollIntoView({ block: 'center' }); return { to: to ? to.textContent : null, ex }; })()`, { timeout: 10000 });
  check('(r9, MAJOR A) the owner ✕\'s the «All agents» member: the row KEEPS its 除了 — the Vault row says «无需卡片即可使用：没有人» and «除了 Transcriber»', !!allX && !!exOnly && exOnly.to === '无需卡片即可使用：没有人' && exOnly.ex.some((x) => /^除了 Transcriber/.test(x)), { allX, exOnly });
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);
  await A.shot('vsr-25-except-only-row-desktop.png');
  // r10 (主开发's acceptance of r9, MAJOR): «谁可以用…» on the except-only row — the 除了 the picker does not offer is kept, a
  // Save that changes only the policy posts NO row, an exception the owner takes away is said and named (removeExcept)
  await A.evalJs(`(() => { if (!window.__vsrPosts) { window.__vsrPosts = []; const f = window.fetch.bind(window); window.fetch = (u, o) => { try { if (o && o.method === 'POST') window.__vsrPosts.push({ url: String(u), body: String(o.body || '') }); } catch { } return f(u, o); }; } window.__vsrPosts.length = 0; return true; })()`);
  const postsOf = (tail) => A.evalJs(`(window.__vsrPosts || []).filter((p) => p.url.endsWith(${JSON.stringify(tail)})).map((p) => { try { return JSON.parse(p.body); } catch { return null; } })`);
  const resetPosts = () => A.evalJs(`(() => { (window.__vsrPosts || []).length = 0; return true; })()`);
  const rowFacts = `(() => { const r = ${LIST_ROW(LABEL)}; if (!r) return null; return { chips: [...r.querySelectorAll('.vw-use-chip')].filter((x) => !x.classList.contains('vw-use-except')).map((x) => x.textContent), ex: [...r.querySelectorAll('.vw-use-except')].map((x) => x.textContent) }; })()`;
  const openUse = async () => { const o = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const b = r && r.querySelector('.vw-use-grant'); if (!b) return null; b.click(); return true; })()`, { timeout: 15000 }); return !!o && !!(await A.until(`(() => { const d = document.getElementById('vault-use-grant'); return d && d.querySelector('.vw-use-hosts') && d.querySelector('.vw-use-policy-in') ? true : null; })()`, { timeout: 10000 })); };
  const dlgState = `(() => { if (document.querySelector('#vault-reveal-dialog input[type=password]')) return 'pw'; const d = document.getElementById('vault-use-grant'); if (!d) return 'closed'; const e = d.querySelector('.vault-secret-error'); return e && e.textContent ? 'error: ' + e.textContent : null; })()`;
  const saveUse = async () => {   // Save — and 验证是你 when the hub asks for it (the second password typed into the page's own dialog)
    await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const b = d && d.querySelector('.vw-use-save'); if (b) b.click(); return !!b; })()`);
    let st = null;
    for (let i = 0; i < 3; i++) {
      st = await A.until(dlgState, { timeout: 10000 });
      if (st !== 'pw') return st;
      await A.evalJs(`(() => { const i = document.querySelector('#vault-reveal-dialog input[type=password]'); i.value = ${JSON.stringify(SECOND)}; const go = document.querySelector('#vault-reveal-dialog .vault-reveal-go'); if (go) go.click(); return !!go; })()`);
      await A.until(`!document.getElementById('vault-reveal-dialog') || null`, { timeout: 8000 });
    }
    return st;
  };
  const pOpen = await openUse();
  await resetPosts();
  const pIn = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const p = d && d.querySelector('.vw-use-policy-in'); if (!p) return null; p.value = 'only read-only status calls to x.example'; p.dispatchEvent(new Event('input', { bubbles: true })); p.scrollIntoView({ block: 'center' }); return { chips: [...d.querySelectorAll('.pp-chip')].map((c) => c.textContent) }; })()`);
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);
  await A.shot('vsr-27-policy-only-save-dialog-desktop.png');
  const pSave = await saveUse();
  const pRows = await postsOf('/api/vault/use-grants'), pPol = await postsOf('/api/vault/use-policy');
  await sleep(600);
  const pRow = await A.until(`(() => { const f = ${rowFacts}; return f && f.ex.length ? f : null; })()`, { timeout: 6000 });
  check('(r10, MAJOR — the probe\'s P3) the except-only row: the owner opens «谁可以用…» ONLY to set the judge policy and saves — the Save posts the policy ONLY, no row (f23ddb5ad posted {to: [], except: []} first, behind the policy\'s 验证是你) — and the row keeps «除了 Transcriber»', pOpen && pSave === 'closed' && Array.isArray(pRows) && pRows.length === 0 && Array.isArray(pPol) && pPol.length >= 1 && pPol.every((b) => b && b.text === 'only read-only status calls to x.example') && !!pRow && pRow.ex.some((x) => /^除了 Transcriber/.test(x)), { pOpen, pIn, pSave, pRows, pPol, pRow });
  await A.api('POST', '/api/vault/use-policy', { id: EID, text: '' });   // the policy cleared (a click)
  const pageD = await reveal();
  const addD = await A.api('POST', '/api/vault/use-grants', { id: EID, to: [{ kind: 'conversation', key: 'cid-dee-offline', name: 'Dee', scopes: [{ host: 'd.example', until: Date.now() + 30 * 86400e3 }] }], except: [{ kind: 'conversation', key: PKEY }], page: pageD }, { 'X-Vault-Page': pageD || '' });
  await A.until(`(() => { const f = ${rowFacts}; return f && f.chips.some((c) => /Dee/.test(c)) ? true : null; })()`, { timeout: 8000 });
  const dOpen = await openUse();
  await resetPosts();
  const dIn = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const s = d && d.querySelector('.vw-use-end'); if (!s) return null; s.value = '90d'; s.dispatchEvent(new Event('change')); const x = d.querySelector('.pp-except'); return { chips: [...d.querySelectorAll('.pp-chip')].map((c) => c.textContent), exceptOffered: !!x && x.style.display !== 'none' }; })()`);
  const dSave = await saveUse();
  const [dBody] = await postsOf('/api/vault/use-grants');
  await sleep(600);
  const dRow = await A.evalJs(rowFacts);
  check('(r10, MAJOR — the probe\'s P2) the row {Dee (not running now) · d.example; 除了 Transcriber}: the owner changes only the end (→ 90 天) — no «除了» row is offered, the Save sends except [Transcriber] as stored (f23ddb5ad sent except [] — the 除了 gone) and the row keeps «除了 Transcriber»', !!(addD && addD.json && addD.json.ok) && dOpen && !!dIn && dIn.exceptOffered === false && dSave === 'closed' && !!dBody && (dBody.except || []).length === 1 && dBody.except[0].key === PKEY && !dBody.removeExcept && !!dRow && dRow.chips.some((c) => /Dee/.test(c)) && dRow.ex.some((x) => /^除了 Transcriber/.test(x)), { addD: addD && addD.json, dIn, dSave, dBody, dRow });
  const rOpen = await openUse();
  await resetPosts();
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const box = d && d.querySelector('.pp-input'); if (box) { box.focus(); box.dispatchEvent(new Event('focus')); } return !!box; })()`);
  await sleep(300);
  const rPick = await A.until(`(() => { const row = [...document.querySelectorAll('.pp-row')].find((x) => x.isConnected && !x.closest('.pp-except') && /Transcriber/.test(x.textContent)); if (!row) return null; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); row.click(); return true; })()`, { timeout: 8000 });
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const h = d.querySelector('.vw-use-hosts'); h.value = 'x.example'; h.dispatchEvent(new Event('input')); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return true; })()`);
  const rPrev = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); const p = d && d.querySelector('.vw-use-preview'); const g = p && !p.hidden && p.querySelector('.vw-use-except-gone'); if (!g) return null; p.scrollIntoView({ block: 'center' }); return { gone: g.textContent, preview: p.textContent }; })()`, { timeout: 8000 });
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);
  await A.shot('vsr-28-except-removed-preview-desktop.png');
  const rSave = await saveUse();
  const [rBody] = await postsOf('/api/vault/use-grants');
  await sleep(600);
  const rRow = await A.evalJs(rowFacts);
  check('(r10, MAJOR) the owner picks Transcriber ITSELF (it cannot be both given and left out): the preview says «Transcriber 将不再被排除», the Save names it (removeExcept) behind 验证是你, and the row then has no 除了', rOpen && !!rPick && !!rPrev && rPrev.gone === 'Transcriber 将不再被排除' && rSave === 'closed' && !!rBody && JSON.stringify(rBody.removeExcept) === JSON.stringify([`conversation:${PKEY}`]) && !!rRow && rRow.ex.length === 0 && rRow.chips.some((c) => /Transcriber/.test(c)), { rPick, rPrev, rSave, rBody: rBody && { except: rBody.except, removeExcept: rBody.removeExcept }, rRow });
  const pageB = await reveal();
  const back = await A.api('POST', '/api/vault/use-grants', { id: EID, to: [], except: [], removeExcept: [`conversation:${PKEY}`], page: pageB }, { 'X-Vault-Page': pageB || '' });   // the row as it was — an exception taken away is a WIDENING (验证是你), named (r10)
  check('(r8, 除了) a conversation the owner excepted from the entry\'s «All agents» grant: its card offers 允许一次 · 拒绝 only and says «不提供「允许 1 小时」：你在保险库窗口里把这个对话排除在“TTS API key”之外了。»', !!(ex && ex.status === 200 && ex.json.ok && PKEY && xc && xc.action.window === undefined && xr && xr.buttons.join('|') === '允许一次|拒绝' && xr.off.includes('不提供「允许 1 小时」：你在保险库窗口里把这个对话排除在“TTS API key”之外了。') && back.json && back.json.ok), { ex: ex && ex.json, action: xc && xc.action, xr, back: back && back.json });
  // r9 (MAJOR B): the press writes ONLY the window — the agent's OWN value (minted for api.tts.example) sent by curl to
  // h2.example: after «允许 1 小时» the next h2.example run is a WINDOW use with its notice (r8 kept a host pass — by own, silent)
  const H2 = (p) => ['run', '--env', `T=${OWN}`, '--', 'curl', '-s', '-m', '2', `https://h2.example/${p}`];
  const hP = cli('vibespace-vault', H2('v1'), TOKEN, { timeout: 70000 });
  let hc = null;
  for (let i = 0; i < 60 && !hc; i++) { hc = (await openOf('vault-run-ask')).find((x) => /h2\.example\/v1/.test(String(x.detail))) || null; if (!hc) await sleep(200); }
  const pageH = await reveal();
  const ha = hc && hc.action.window === true ? await A.api('POST', `/api/vault/run/asks/${hc.action.askId}`, { answer: 'window' }, { 'X-Vault-Page': pageH || '' }) : (hc ? await A.api('POST', `/api/vault/run/asks/${hc.action.askId}`, { answer: 'deny' }) : null);
  await hP;
  await B.evalJs(`window.__toasts.length = 0; true`);
  const nH = await countItems();
  const h2b = await cli('vibespace-vault', H2('v2'), TOKEN, { timeout: 70000 });
  const toastH = await B.until(`(window.__toasts || []).find((t) => /在你的 1 小时授权下用了/.test(t.text) && /h2\\.example/.test(t.text)) || null`, { timeout: 10000 });
  const nH2 = await countItems();
  check('(r9, MAJOR B) the agent\'s OWN value sent by curl to h2.example (minted for api.tts.example): «允许 1 小时» on its card; the next h2.example run inside the hour is a WINDOW use — no card, nothing filed, its notice «Transcriber 在你的 1 小时授权下用了… → h2.example»', !!hc && hc.action.window === true && !!ha && ha.json && ha.json.ok && ha.json.outcome === 'window' && !!toastH && /^Transcriber 在你的 1 小时授权下用了/.test(toastH.text) && nH2 === nH, { action: hc && hc.action, ha: ha && ha.json, toastH, n: [nH, nH2], out: h2b.out.slice(0, 160) });
  // r9 (MINOR C): a member whose only scope is a 1-hour window that ENDED unswept — the dialog's Save is never refused for it.
  // The hub's clock cannot move here: the PAGE's clock is moved past the window's end (what a page sees of a window the hub
  // had not swept — a restart or a lock inside the hour); the hub, whose window is still live, keeps it
  const cP = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'bash', '-c', 'curl -s -m 2 -H "X: $T" https://c.example/v1/x || true'], TOKEN, { timeout: 70000 });
  let cc = null;
  for (let i = 0; i < 60 && !cc; i++) { cc = (await openOf('vault-run-ask')).find((x) => /c\.example\/v1/.test(String(x.detail))) || null; if (!cc) await sleep(200); }
  const pageC = await reveal();
  const ca = cc && await A.api('POST', `/api/vault/run/asks/${cc.action.askId}`, { answer: 'window' }, { 'X-Vault-Page': pageC || '' });
  await cP;
  await A.evalJs(`(() => { if (!window.__realNow) window.__realNow = Date.now.bind(Date); Date.now = () => window.__realNow() + 61 * 60e3; return true; })()`);
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const cOpen = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const b = r && r.querySelector('.vw-use-grant'); if (!b || !r.querySelector('.vw-use-chip')) return null; b.click(); return true; })()`, { timeout: 15000 });
  const cdlg = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); const h = d && d.querySelector('.vw-use-hosts'); const p = d && d.querySelector('.vw-use-preview'); if (!h || !p || p.hidden) return null; p.scrollIntoView({ block: 'center' }); return { hosts: h.value, preview: p.textContent }; })()`, { timeout: 10000 });
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);
  await A.shot('vsr-26-hour-ended-save-dialog-desktop.png');
  await resetPosts();
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const b = d && d.querySelector('.vw-use-save'); if (b) b.click(); return !!b; })()`);
  const cres = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); if (!d) return { closed: true }; const e = d.querySelector('.vault-secret-error'); return e && e.textContent ? { closed: false, error: e.textContent } : null; })()`, { timeout: 10000 });
  const cPosts = await postsOf('/api/vault/use-grants');
  await A.evalJs(`(() => { if (window.__realNow) Date.now = window.__realNow; const d = document.getElementById('vault-use-grant'); const b = d && d.querySelector('.btn-cancel'); if (b) b.click(); return true; })()`);
  const cT = ((cPosts && cPosts[0] && cPosts[0].to) || []).find((m) => m && m.key === PKEY);
  check('(r11, MINOR 1) … and that untouched Save POSTS the row — Transcriber sent with no scope, so the hub prunes an ended window as the preview says (7e99ef689 posted nothing: the ended window stayed and was promised again; here the hub\'s clock cannot move — it holds the window live and keeps it)', !!cres && cres.closed === true && Array.isArray(cPosts) && cPosts.length === 1 && !!cT && Array.isArray(cT.scopes) && cT.scopes.length === 0, { posts: cPosts });
  check('(r9, MINOR C) Transcriber\'s only scope is a 1-hour window the page sees ENDED (the hub had not swept it): the dialog, hosts left empty, says «Transcriber · 1 小时授权已结束 — 保存时移除» and its Save LANDS — never «请写明可用于哪些主机…»', !!ca && ca.json && ca.json.ok && !!cOpen && !!cdlg && cdlg.hosts === '' && /Transcriber · 1 小时授权已结束 — 保存时移除/.test(String(cdlg.preview)) && !!cres && cres.closed === true, { ca: ca && ca.json, cdlg, cres });
  // r10 (MINOR — the probe's P1): the hub drops a window-only member while a dialog drawn before is open (the hour-end sweep —
  // here the window's ✕ from another page: the hub no longer holds Transcriber); that dialog's Save (所有 agent → 90 天) LANDS
  const pageS = await reveal();
  const addAll = await A.api('POST', '/api/vault/use-grants', { id: EID, to: [{ kind: 'everyone', scopes: [{ host: 'x.example', until: Date.now() + 30 * 86400e3 }] }, { kind: 'conversation', key: PKEY, scopes: [] }], except: [], page: pageS }, { 'X-Vault-Page': pageS || '' });
  await A.until(`(() => { const f = ${rowFacts}; return f && f.chips.some((c) => /^所有 agent/.test(c)) && f.chips.some((c) => /Transcriber/.test(c)) ? true : null; })()`, { timeout: 8000 });
  const sOpen = await openUse();
  const sIn = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const s = d && d.querySelector('.vw-use-end'); if (!s) return null; s.value = '90d'; s.dispatchEvent(new Event('change')); const p = d.querySelector('.vw-use-preview'); return { chips: [...d.querySelectorAll('.pp-chip')].map((c) => c.textContent), preview: p ? p.textContent : null }; })()`);
  const sX = await A.api('POST', '/api/vault/use-grants/revoke', { id: EID, principal: `conversation:${PKEY}`, scope: 'window' });
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); const d = document.getElementById('vault-use-grant'); const p = d && d.querySelector('.vw-use-preview'); if (p) p.scrollIntoView({ block: 'center' }); return true; })()`);
  await A.shot('vsr-29-swept-window-save-dialog-desktop.png');
  await resetPosts();
  const sSave = await saveUse();
  await sleep(600);
  const sRow = await A.evalJs(rowFacts);
  check('(r10, MINOR — the probe\'s P1) a dialog drawn while Transcriber held its 1-hour window; the hub then dropped that member (the window\'s ✕ elsewhere — as the hour-end sweep does): the dialog\'s Save (所有 agent → 90 天) LANDS — never «请写明 Transcriber 可用于哪些主机…»; the row: 所有 agent, no Transcriber', !!(addAll && addAll.json && addAll.json.ok) && sOpen && !!sIn && sIn.chips.some((c) => /^所有 agent/.test(c)) && sIn.chips.some((c) => /Transcriber/.test(c)) && !!(sX && sX.json && sX.json.ok) && sSave === 'closed' && !!sRow && sRow.chips.some((c) => /^所有 agent/.test(c)) && !sRow.chips.some((c) => /Transcriber/.test(c)), { addAll: addAll && addAll.json, sIn, sX: sX && sX.json, sSave, sRow });
  await A.api('POST', '/api/vault/use-grants/revoke', { id: EID, principal: 'everyone' });
  // r11 (主开发's acceptance of r10, MAJOR): a row with a TASK GROUP member (Team, live in the roster) and 除了 Transcriber — the
  // member is known by its principal: a policy-only Save posts NO row, a members-edit Save keeps Team as `group:<its id>`
  // (7e99ef689 posted the row behind 验证是你 and rewrote Team to `group:vg-…`, a group that does not exist). MINOR 3: a Save
  // whose row landed and whose policy's 验证是你 was cancelled SAYS so, and the next Save is compared against the landed row.
  const tg = await A.api('POST', '/api/tasks', { title: 'Team', sessions: [] });
  const TG = tg && tg.json && tg.json.task ? tg.json.task.id : null;
  const tgLive = !!TG && !!(await A.until(`((window.app && app.sidebar && app.sidebar._tasks) || []).some((g) => g && g.id === ${JSON.stringify(TG)}) || null`, { timeout: 15000 }));
  const pageT = await reveal();
  const seedT = await A.api('POST', '/api/vault/use-grants', { id: EID, to: [{ kind: 'group', id: TG, name: 'Team', scopes: [{ host: 'x.example', until: Date.now() + 30 * 86400e3 }] }], except: [{ kind: 'conversation', key: PKEY }], page: pageT }, { 'X-Vault-Page': pageT || '' });
  const teamChip = `(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => !x.classList.contains('vw-use-except') && /^Team · /.test(x.textContent)); return c ? { principal: c.dataset.principal, text: c.textContent, ex: [...r.querySelectorAll('.vw-use-except')].map((x) => x.textContent) } : null; })()`;
  const tIn0 = await A.until(teamChip, { timeout: 10000 });
  await A.evalJs(`(() => { if (!window.__realNow) window.__realNow = Date.now.bind(Date); Date.now = () => window.__realNow() + 2 * 60e3; return true; })()`);   // the owner opens the dialog later (7e99ef689: a Team member it cannot find takes a NEW 30-day end — a change)
  const tOpen = await openUse();
  await resetPosts();
  const tPick = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const p = d && d.querySelector('.vw-use-policy-in'); if (!p) return null; p.value = 'only read-only calls to x.example'; p.dispatchEvent(new Event('input', { bubbles: true })); p.scrollIntoView({ block: 'center' }); return { chips: [...d.querySelectorAll('.pp-chip')].map((c) => c.textContent) }; })()`);
  await sleep(300);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); const d = document.getElementById('vault-use-grant'); const c = d && d.querySelector('.pp-chips'); if (c) c.scrollIntoView({ block: 'start' }); return true; })()`);
  await A.shot('vsr-30-task-group-policy-only-dialog-desktop.png');
  const tSave = await saveUse();
  const tRows = await postsOf('/api/vault/use-grants'), tPol = await postsOf('/api/vault/use-policy');
  await sleep(600);
  const tIn1 = await A.until(teamChip, { timeout: 6000 });
  check('(r11, MAJOR) a row {Team (a Task Group, live in the roster) · x.example; 除了 Transcriber}: the owner opens «谁可以用…» only to set the judge policy — the Save posts the POLICY only, NO row (7e99ef689 posted the row behind 验证是你), and the Vault row still names Team by its own id (`group:<id>`)', !!(seedT && seedT.json && seedT.json.ok) && tgLive && !!tIn0 && tIn0.principal === `group:${TG}` && tOpen && !!tPick && tPick.chips.some((c) => /Team/.test(c)) && tSave === 'closed' && Array.isArray(tRows) && tRows.length === 0 && Array.isArray(tPol) && tPol.length >= 1 && !!tIn1 && tIn1.principal === `group:${TG}`, { TG, tgLive, seed: seedT && seedT.json && (seedT.json.ok || seedT.json.code), tIn0, tPick, tSave, tRows, tPol: tPol && tPol.length, tIn1 });
  await A.api('POST', '/api/vault/use-policy', { id: EID, text: '' });
  const eOpen = await openUse();
  await resetPosts();
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const s = d && d.querySelector('.vw-use-end'); if (!s) return null; s.value = '90d'; s.dispatchEvent(new Event('change')); return true; })()`);
  const eSave = await saveUse();
  const [eBody] = await postsOf('/api/vault/use-grants');
  await sleep(600);
  const tIn2 = await A.until(teamChip, { timeout: 6000 });
  const eTo = ((eBody && eBody.to) || []).map((m) => `${m.kind}:${m.id || m.key || ''}`);
  check('(r11, MAJOR) … then a members-edit Save (Team\'s end → 90 天): the Save sends Team as `group:<its id>` — never the grant id — and the Vault row keeps it so, 除了 Transcriber kept', eOpen && eSave === 'closed' && eTo.length === 1 && eTo[0] === `group:${TG}` && !!tIn2 && tIn2.principal === `group:${TG}` && tIn2.ex.some((x) => /^除了 Transcriber/.test(x)), { eSave, eTo, except: eBody && eBody.except, tIn2 });
  // MINOR 3: ✕ Team (a narrowing — no prompt) and a policy typed; the page's 验证是你 window gone (its clock past it), the
  // policy's prompt CANCELLED — the dialog stays open and says the members were saved; then Team picked again ⇒ posted
  await A.evalJs(`(() => { if (!window.__realNow) window.__realNow = Date.now.bind(Date); Date.now = () => window.__realNow() + 12 * 60e3; return true; })()`);
  const hOpen = await openUse();
  await resetPosts();
  const hX = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const c = d && [...d.querySelectorAll('.pp-chip')].find((x) => !x.closest('.pp-except') && /Team/.test(x.textContent)); const x = c && c.querySelector('.pp-chip-x'); if (!x) return null; x.click(); const p = d.querySelector('.vw-use-policy-in'); p.value = 'only read-only calls to x.example'; p.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const b = d && d.querySelector('.vw-use-save'); if (b) b.click(); return !!b; })()`);
  const hPw = await A.until(dlgState, { timeout: 10000 });
  await A.evalJs(`(() => { const b = document.querySelector('#vault-reveal-dialog .btn-cancel'); if (b) b.click(); return !!b; })()`);
  await A.until(`!document.getElementById('vault-reveal-dialog') || null`, { timeout: 8000 });
  const hSaid = await A.until(`(() => { const d = document.getElementById('vault-use-grant'); if (!d) return { closed: true }; const e = d.querySelector('.vault-secret-error'); if (!e || !e.textContent) return null; e.scrollIntoView({ block: 'center' }); return { closed: false, words: e.textContent }; })()`, { timeout: 8000 });
  const hRows1 = await postsOf('/api/vault/use-grants');
  await sleep(400);
  await A.evalJs(`(() => { for (const t of [...document.querySelectorAll('.global-toast')]) t.remove(); return true; })()`);
  await A.shot('vsr-31-members-saved-policy-not-desktop.png');
  const hRow1 = await A.evalJs(rowFacts);
  check('(r11, MINOR 3) Team ✕\'d and a policy typed, Save: the row lands (a narrowing), the policy\'s 验证是你 is CANCELLED — the dialog stays open and says «成员已保存；策略没有保存» (7e99ef689: no words), the Vault row has no Team', hOpen && !!hX && hPw === 'pw' && !!hSaid && hSaid.closed === false && hSaid.words === '成员已保存；策略没有保存' && Array.isArray(hRows1) && hRows1.length === 1 && !!hRow1 && !hRow1.chips.some((c) => /^Team · /.test(c)), { hX, hPw, hSaid, posts: hRows1 && hRows1.length, hRow1 });
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const p = d && d.querySelector('.vw-use-policy-in'); if (p) { p.value = ''; p.dispatchEvent(new Event('input', { bubbles: true })); } const box = d && d.querySelector('.pp-input'); if (box) { box.focus(); box.dispatchEvent(new Event('focus')); } return true; })()`);
  await sleep(300);
  const hPick = await A.until(`(() => { const row = [...document.querySelectorAll('.pp-row')].find((x) => x.isConnected && !x.closest('.pp-except') && /Team/.test(x.textContent)); if (!row) return null; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); row.click(); return true; })()`, { timeout: 8000 });
  await A.evalJs(`(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return true; })()`);
  const hSave = await saveUse();
  const hRows2 = await postsOf('/api/vault/use-grants');
  await sleep(600);
  const tIn3 = await A.until(teamChip, { timeout: 6000 });
  await A.evalJs(`(() => { if (window.__realNow) Date.now = window.__realNow; return true; })()`);
  check('(r11, MINOR 3) … then Team picked again in the same dialog, Save: compared against the row as it LANDED, the Save posts Team back (验证是你) and the Vault row has it — as `group:<id>` (7e99ef689: compared against the row as it opened — nothing posted, the dialog closed, Team gone)', !!hPick && hSave === 'closed' && Array.isArray(hRows2) && hRows2.length >= 2 && !!tIn3 && tIn3.principal === `group:${TG}`, { hPick, hSave, posts: hRows2 && hRows2.map((b) => b && (b.to || []).length), tIn3 });
  // the row as it was for the legs below: no Team, no 除了 (a widening, named), the Task Group gone
  await A.api('POST', '/api/vault/use-policy', { id: EID, text: '' });
  if (TG) await A.api('POST', '/api/vault/use-grants/revoke', { id: EID, principal: `group:${TG}` });
  const pageX = await reveal();
  await A.api('POST', '/api/vault/use-grants', { id: EID, to: [], except: [], removeExcept: [`conversation:${PKEY}`], page: pageX }, { 'X-Vault-Page': pageX || '' });
  if (TG) await A.api('DELETE', `/api/tasks/${TG}`);
  // the windows taken back (the legs below expect cards)
  const OWNID = await A.evalJs(`(() => { const r = [...document.querySelectorAll('.vw-list .vw-row')].find((x) => x.isConnected && String(x.dataset.id || '').startsWith('secrets:agent:') && String(x.dataset.id).includes('/tts-own#')); return r ? r.dataset.id : null; })()`);
  for (const id of [EID, OWNID]) if (id) await A.api('POST', '/api/vault/use-grants/revoke', { id, principal: `conversation:${PKEY}` });
  try { await B.cdp('Page.close'); } catch { }
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tB.id}`); } catch { }

  console.log('⑦ (r3, MAJOR 1) A LEGACY WILDCARD — carried from an older version with no tool: named on its row, the owner told once');
  await stopServer();
  {   // the hub is stopped: write what the shipped carry wrote — its own vault's mark over the writer's canon (a fresh entry: generation 0)
    const VE = require(path.join(wt, 'src/server/vault-engine.js')), GS = require(path.join(wt, 'src/server/grants-store.js'));
    const dataDir = path.join(wt, 'data');
    const hv = VE.create({ dataDir, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: () => {} });
    await hv.unlock(SECOND);
    const lname = 'secret:' + crypto.randomBytes(5).toString('hex');
    hv.secretPut(lname, ['cloud', 'key', crypto.randomBytes(6).toString('hex')].join('-'), { prov: 'owner', label: 'Cloud deploy key', kind: 'api-key', hosts: [] });
    const lid = `secrets:${lname}#secret`;
    const U = require(path.join(wt, 'src/vault-use-grant.js'));
    const marked = (e) => ({ ...e, mac: hv.macOf('vault-use', U.canonOf(lid, e, [], 0)) });   // the writer's canon (a one-end member's is the 2.369.363/.364 bytes verbatim)
    const T = Date.now();
    const w = GS.create({ dataDir }).set('vault-use', lid, { to: [
      marked({ kind: 'conversation', key: 'cid-older-1', name: 'Deployer', hosts: ['*.amazonaws.com'] }),
      marked({ kind: 'conversation', key: 'cid-older-2', name: 'Publisher', hosts: ['*.legacy.example'], until: T + 20 * 86400e3 }),   // r4: a carried legacy wildcard with an end — 20 days
      marked({ kind: 'conversation', key: 'cid-older-3', name: 'Mixer', scopes: [{ host: 'a.example', until: T + 30 * 86400e3, source: 'card', at: T }, { host: 'b.example', source: 'owner', at: T }] }),   // r4: two hosts, EACH its own end
    ], except: [] }, 'migration');
    check('(the setup) two members as the 2.369.363/.364 carry stored them — a wildcard host, no tool (one with 20 days) — and r4: a member whose two hosts carry their OWN ends (a.example 30 days, b.example none)', !!(w && w.ok), w);
    globalThis.__LID = lid;
    hv.lock('test');
  }
  startServer();
  check('the hub boots again', await ready());
  await A.evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
  await A.cdp('Page.navigate', { url: URL });
  await A.until(`!!(window.app && app.replayOpenSpec)`, { timeout: 30000 });
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const ul = await A.api('POST', '/api/vault/unlock', { password: SECOND });
  const page4 = await reveal();
  const on = await A.api('POST', '/api/vault/runnable', { id: globalThis.__LID, on: true }, { 'X-Vault-Page': page4 || '' });
  check('unlocked; the entry switched on (its chips are live, not paused)', ul.status === 200 && on.status === 200 && on.json.ok, { ul: ul.json, on: on.json });
  const LEG_ROW = LIST_ROW('Cloud deploy key');
  const legacyRow = async () => { await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`); return A.until(`(() => { const r = ${LEG_ROW}; const cs = r ? [...r.querySelectorAll('.vw-use-chip')] : []; if (cs.length < 3) return null; r.scrollIntoView({ block: 'center' }); const vw = document.documentElement.clientWidth; return cs.map((c) => ({ text: c.textContent, legacy: c.classList.contains('vw-use-legacy'), title: c.title, x: !!c.querySelector('.vw-use-x'), scopes: [...c.querySelectorAll('.vw-use-scope')].map((s) => s.textContent), right: c.getBoundingClientRect().right, vw })); })()`, { timeout: 15000 }); };
  const chips = await legacyRow();
  const aws = chips && chips.find((c) => /^Deployer/.test(c.text)), old = chips && chips.find((c) => /^Publisher/.test(c.text));
  check('the aws member now names its tool «（经由 aws）» (the unlock\'s wildcard carry); the one no tool row names says «（旧版通配：任何工具）» on a marked chip, its title says how to set the tool, its ✕ is there', !!(aws && /（经由 aws）/.test(aws.text) && !aws.legacy && old && /\*\.legacy\.example 下的每个主机（旧版通配：任何工具）/.test(old.text) && old.legacy && /ANY program|任何程序/.test(old.title) && old.x), chips);
  const mix = chips && chips.find((c) => /^Mixer/.test(c.text));
  check('r4: EACH scope says its own end on the chip — «a.example · 30 天», «b.example · 无限期»; the legacy wildcard «…（旧版通配：任何工具） · 20 天»', !!(mix && mix.scopes.length === 2 && /^a\.example · (29|30) 天$/.test(mix.scopes[0]) && mix.scopes[1] === 'b.example · 无限期' && old && old.scopes.length === 1 && /（旧版通配：任何工具） · (19|20) 天$/.test(old.scopes[0])), { mix, old });
  const notes = ((await todo()).open || []).filter((i) => /An older «Always» lets any program reach a wildcard host/.test(i.text));
  check('ONE For-you notice tells the owner — it names *.legacy.example and the entry', notes.length === 1 && /\*\.legacy\.example \(Cloud deploy key\)/.test(notes[0].detail), notes.map((i) => i.detail));
  await sleep(300);
  await A.shot('vsr-8-legacy-chip-desktop.png');
  await A.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await A.cdp('Page.navigate', { url: URL });
  await A.until(`!!(window.app && app.replayOpenSpec)`, { timeout: 30000 });
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  if (await A.evalJs(`!!document.getElementById('vault-unlock-dialog')`)) { await A.api('POST', '/api/vault/unlock', { password: SECOND }); await sleep(300); }
  const pchips = await legacyRow();
  check('the phone (390 px) draws the same marked chip — and r4: every chip with its per-scope ends stays inside the screen', !!(pchips && pchips.some((c) => c.legacy && /旧版通配/.test(c.text)) && pchips.some((c) => /^Mixer/.test(c.text) && c.scopes.length === 2) && pchips.every((c) => c.right <= c.vw + 1)), pchips);
  await sleep(300);
  await A.shot('vsr-9-legacy-chip-phone.png');
  await A.cdp('Emulation.clearDeviceMetricsOverride', {});
  await A.evalJs(`localStorage.setItem('vibespace.lang', 'auto'); true`);
} catch (e) {
  check('the run did not throw', false, e && e.stack);
} finally {
  await stopServer();
}
console.log(`\n${failed ? '✗' : '✓'} test-vault-standing-request-chrome: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAIL'); process.exit(1); } else { console.log(`ALL PASS (${passed})`); process.exit(0); }
