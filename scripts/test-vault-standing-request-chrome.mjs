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
//      no tool row names is marked «（旧版通配：任何工具）» on its chip, and ONE For-you notice tells the owner (desktop + phone)
//   r2 (主开发's visual read): the standing card = label rows (密钥 = the NAME, 用途, 命令 / 主机, 运行, 期限 …) + ONE 技术细节 fold —
//      the vault:// reference only there, as code, never a link (desktop and phone)
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
  check(`the chip: «Transcriber · 命令 ${PYN} transcribe.py · 已用 2 次 · agent 申请 · HH:MM ✕» (the real program; the source and its time last)`, new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py · 已用 2 次 · agent 申请 · \\d\\d:\\d\\d✕$`).test(String(chip)), chip);
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
  check('the chip now names both commands and the latest source «卡片上的总是»', new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py, ${reEsc(PYN)} upload\\.py · 已用 \\d+ 次 · 卡片上的总是 · \\d\\d:\\d\\d✕$`).test(String(chip2)), chip2);

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
  check(`its Vault row now SHOWS the member: «Transcriber · 命令 ${PYN} transcribe.py · 已用 1 次 · 卡片上的总是 · HH:MM ✕» — with its ✕, and no «谁可以用…» (only its conversation may use it)`, !!own && new RegExp(`^Transcriber · 命令 ${reEsc(PYN)} transcribe\\.py(?: · 已用 \\d+ 次)? · 卡片上的总是 · \\d\\d:\\d\\d✕$`).test(own.chip) && own.x && !own.add, own);
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
    const mac = (key, name, hosts) => hv.macOf('vault-use', JSON.stringify([lid, `conversation:${key}`, hosts.slice().sort(), null, null, name, [], 0]));
    const w = GS.create({ dataDir }).set('vault-use', lid, { to: [{ kind: 'conversation', key: 'cid-older-1', name: 'Deployer', hosts: ['*.amazonaws.com'], mac: mac('cid-older-1', 'Deployer', ['*.amazonaws.com']) }, { kind: 'conversation', key: 'cid-older-2', name: 'Publisher', hosts: ['*.legacy.example'], mac: mac('cid-older-2', 'Publisher', ['*.legacy.example']) }], except: [] }, 'migration');
    check('(the setup) two members as the 2.369.363/.364 carry stored them — a wildcard host, no tool', !!(w && w.ok), w);
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
  const legacyRow = async () => { await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`); return A.until(`(() => { const r = ${LEG_ROW}; const cs = r ? [...r.querySelectorAll('.vw-use-chip')] : []; if (cs.length < 2) return null; r.scrollIntoView({ block: 'center' }); return cs.map((c) => ({ text: c.textContent, legacy: c.classList.contains('vw-use-legacy'), title: c.title, x: !!c.querySelector('.vw-use-x') })); })()`, { timeout: 15000 }); };
  const chips = await legacyRow();
  const aws = chips && chips.find((c) => /^Deployer/.test(c.text)), old = chips && chips.find((c) => /^Publisher/.test(c.text));
  check('the aws member now names its tool «（经由 aws）» (the unlock\'s wildcard carry); the one no tool row names says «（旧版通配：任何工具）» on a marked chip, its title says how to set the tool, its ✕ is there', !!(aws && /（经由 aws）/.test(aws.text) && !aws.legacy && old && /\*\.legacy\.example 下的每个主机（旧版通配：任何工具）/.test(old.text) && old.legacy && /ANY program|任何程序/.test(old.title) && old.x), chips);
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
  check('the phone (390 px) draws the same marked chip', !!(pchips && pchips.some((c) => c.legacy && /旧版通配/.test(c.text))), pchips);
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
