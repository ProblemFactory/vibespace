#!/usr/bin/env node
// THE VAULT IN A REAL PAGE (heavy, chrome — lane vault-e2e-password). A worktree hub WITH a sign-in password, a real
// headless Chrome, the built bundle:
//   ① sign in; a secret is stored (an integration key — its .integrations-key file is minted beside the data: not set up)
//   ② the load-time ask: with the snooze cleared the setup modal shows; two passwords that differ are refused in words;
//      the second password set ⇒ the modal closes, the key file is gone (a .sealed marker), data/vault.json exists
//   ③ RESTART the hub ⇒ the page (still signed in) opens the UNLOCK modal at once; the taskbar lock chip shows; the
//      integration answers key-unreadable:vault_locked; a WRONG password says so and stays locked
//   ④ the RIGHT password ⇒ the modal and the chip go, the integration's key opens again (the feature works)
//   ⑤ RESTART again ⇒ locked again (no auto-unlock of any kind), and a phone viewport gets the same modal, inside the screen
//   ⑥ the words in Chinese: 「解锁保险库」 / 「第二密码不对」
//   ⑦ lane vault-e2e-password-fix-r2: auth.json holds the login's sha256, never the cookie's token; a LOCK from the page
//      signs every login out — the page lands on the sign-in, and after it the unlock modal (the owner's decision ④)
// Run: node scripts/test-vault-chrome.mjs [--shots <dir>]   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vault-chrome-wt'), PROFILE = scratch('vault-chrome-chrome'), FIXTURE = scratch('vault-chrome-canonical');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('vault-chrome-shots');
fs.mkdirSync(FIXTURE, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'chrome-leg-sign-in-7';
const SECOND = 'chrome leg second password';

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data');
let srv = null;
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN, VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: ['ignore', srvLog, srvLog] }); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); if (p.exitCode !== null || p.signalCode) { clearTimeout(t); r(); } else p.once('exit', () => { clearTimeout(t); r(); }); }); };
// the sign-in gate covers /api/boot; /login is open — the hub listens with its routes registered (the page's own splash waits for the boot)
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(200); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [PROFILE, FIXTURE]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
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
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
const URL = `http://127.0.0.1:${PORT}/`;
const api = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))`);
const typeInto = (sel, text) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const click = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
/** the element at a selector's centre IS that element (the person can reach it: no splash, no other layer over it) */
const onTop = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && (at === e || e.contains(at)); })()`;
const splashGone = () => until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
const integration = async () => { const r = await api('GET', '/api/integrations/cloud:browserless'); const v = r.json && r.json.integration; return { status: r.status, storeError: v && v.storeError ? (v.storeError.reason || v.storeError.code) : null, configured: !!(v && JSON.stringify(v).includes('chrome.example.net')) }; };

startServer();
check('the hub boots (sign-in password on)', await ready());

console.log('① sign in, store a secret');
await cdp('Page.navigate', { url: URL + 'login' });
await until(`document.readyState === 'complete'`);
const login = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
check('signed in through /api/login (the cookie is set)', login === 200, login);
await cdp('Page.navigate', { url: URL });
check('the app loads behind the sign-in', !!(await until(`!!(window.app && document.getElementById('taskbar-tray'))`, { timeout: 30000 })));
const put = await api('PUT', '/api/integrations/cloud:browserless', { values: { apiKey: 'chrome-leg-api-key', apiUrl: 'https://chrome.example.net' } });
check('an integration key is stored (not set up: its key FILE is minted beside the data)', put.status === 200 && fs.existsSync(path.join(DATA, '.integrations-key')) && !fs.existsSync(path.join(DATA, 'vault.json')), put);
check('the vault says not_set_up', (await api('GET', '/api/vault/state')).json?.state === 'not_set_up');

console.log('② the load-time ask (snooze cleared) — set the second password');
await evalJs(`localStorage.removeItem('vs-vault-later')`);
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.removeItem('vs-vault-later'); } catch {}" });
await cdp('Page.navigate', { url: URL });
check('the setup modal shows after the load', !!(await until(visible('#vault-setup-dialog'), { timeout: 30000 })));
await splashGone();
check('… on top once the splash is gone (its Set button is what a click reaches)', !!(await until(onTop('.vault-setup-go'), { timeout: 5000 })));
await shot('vault-1-setup.png');
await typeInto('#vault-setup-pw', SECOND); await typeInto('#vault-setup-pw2', SECOND + 'x'); await click('.vault-setup-go');
check('two passwords that differ are refused in words', /differ/.test(await until(`document.querySelector('#vault-setup-dialog .vault-err')?.textContent`, { timeout: 3000 }) || ''));
await typeInto('#vault-setup-pw2', SECOND); await click('.vault-setup-go');
check('set ⇒ the modal closes', !!(await until(`!document.getElementById('vault-setup-dialog')`, { timeout: 15000 })));
check('the key file is sealed: gone, a .sealed marker, data/vault.json', !fs.existsSync(path.join(DATA, '.integrations-key')) && fs.existsSync(path.join(DATA, '.integrations-key.sealed')) && fs.existsSync(path.join(DATA, 'vault.json')));
check('the integration still answers (unlocked)', (await integration()).configured);

console.log('③ RESTART ⇒ the unlock modal, the chip, vault_locked');
await stopServer(); startServer();
check('the hub is back', await ready());
await cdp('Page.navigate', { url: URL });
check('the page opens the UNLOCK modal at once (still signed in)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })));
await splashGone();
check('… on top of the app (its Unlock button is what a click reaches)', !!(await until(onTop('.vault-unlock-go'), { timeout: 5000 })));
check('the taskbar lock chip shows', !!(await until(visible('#taskbar-vault'), { timeout: 5000 })));
const lockedInt = await integration();
check('the integration answers key-unreadable:vault_locked', lockedInt.storeError === 'key-unreadable:vault_locked', lockedInt);
await shot('vault-2-locked.png');
await typeInto('#vault-unlock-pw', 'not the second password'); await click('.vault-unlock-go');
check('a wrong password says so', (await until(`document.querySelector('#vault-unlock-dialog .vault-err')?.textContent`, { timeout: 8000 })) === 'That is not the second password');
check('… and the vault stays locked', (await api('GET', '/api/vault/state')).json?.state === 'locked');
await shot('vault-3-wrong.png');

console.log('④ the right password');
await typeInto('#vault-unlock-pw', SECOND); await click('.vault-unlock-go');
check('the modal closes', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 })));
check('the lock chip goes', !!(await until(`!document.getElementById('taskbar-vault')`, { timeout: 5000 })));
const openInt = await integration();
check('the integration\'s key opens again (the feature works)', openInt.configured && !openInt.storeError, openInt);

console.log('⑤ RESTART again ⇒ locked again; a phone gets the same modal');
await stopServer(); startServer();
check('the hub is back', await ready());
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 760, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: URL });
check('locked again after the restart — the unlock modal (no auto-unlock of any kind)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })) && (await api('GET', '/api/vault/state')).json?.state === 'locked');
await splashGone();
check('the phone\'s Unlock button is reachable (on top)', !!(await until(onTop('.vault-unlock-go'), { timeout: 5000 })));
const rect = await evalJs(`(() => { const d = document.querySelector('#vault-unlock-dialog .dialog'); const r = d.getBoundingClientRect(); const go = document.querySelector('.vault-unlock-go').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, goH: go.height }; })()`);
check(`the phone modal sits inside the screen (${Math.round(rect.l)}…${Math.round(rect.r)} of ${rect.w}) with a ≥ 36 px button (a phone target)`, rect.l >= 0 && rect.r <= rect.w && rect.goH >= 36, rect);
await shot('vault-4-phone.png');
await cdp('Emulation.clearDeviceMetricsOverride');

console.log('⑥ the words in Chinese');
await evalJs(`localStorage.setItem('vibespace.lang', 'zh')`);
await cdp('Page.navigate', { url: URL });
check('「解锁保险库」', (await until(`document.querySelector('#vault-unlock-dialog h3')?.textContent`, { timeout: 30000 })) === '解锁保险库');
await splashGone();
await typeInto('#vault-unlock-pw', 'wrong again!'); await click('.vault-unlock-go');
check('「第二密码不对」', (await until(`document.querySelector('#vault-unlock-dialog .vault-err')?.textContent`, { timeout: 8000 })) === '第二密码不对');
await shot('vault-5-zh.png');
console.log('⑦ the login at rest + a LOCK signs every login out');
const cookieTok = ((await cdp('Network.getCookies', { urls: [URL] })).cookies || []).find((c) => c.name === 'vs_token')?.value || '';
const authText = fs.readFileSync(path.join(DATA, 'auth.json'), 'utf8');
check('auth.json holds the login as sha256(token) — never the cookie\'s token', cookieTok.length === 48 && !authText.includes(cookieTok) && authText.includes(require('crypto').createHash('sha256').update(cookieTok).digest('hex')));
await typeInto('#vault-unlock-pw', SECOND); await click('.vault-unlock-go');
check('unlocked', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 })));
const locked = await api('POST', '/api/vault/lock');
check('the page locks the vault (its own door)', locked.status === 200 && locked.json?.state === 'locked', locked);
check('… every login is signed out: the page lands on the sign-in', !!(await until(`location.pathname === '/login'`, { timeout: 20000 })));
check('… auth.json\'s login map is empty', Object.keys(JSON.parse(fs.readFileSync(path.join(DATA, 'auth.json'), 'utf8')).tokens || {}).length === 0);
await shot('vault-6-signed-out.png');
const relogin = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
await cdp('Page.navigate', { url: URL });
check('signed in again ⇒ the unlock modal (the vault stayed locked)', relogin === 200 && !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })));
const log = fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8') + fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8');
check('no password in the server log or the audit', ![SECOND, 'not the second password', 'wrong again!', SIGN_IN].some((p) => log.includes(p)));

await stopServer();
console.log(failed ? `\nFAILED (${passed} passed, ${failed} failed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
