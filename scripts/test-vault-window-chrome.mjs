#!/usr/bin/env node
// THE VAULT WINDOW IN A REAL PAGE (heavy, chrome — lane vault-contents-window). A worktree hub WITH a sign-in password and
// a test-only clock shim (`node -r`: SIGUSR2 moves the hub's Date.now 6 minutes on — nothing in src/ knows it), a real
// headless Chrome, the built bundle:
//   ① sign in, set the second password, store two secrets (an integration key that is an HTML payload, an API key)
//   ② the window lists them MASKED: no value anywhere in the page's DOM (markup or any input's value)
//   ③ 「显示」 ⇒ 「验证是你」: a wrong second password says so; the right one ⇒ the value appears in ITS row's field, the
//      countdown chip shows; the HTML payload stays text (no element made, no handler ran)
//   ④ a second 「显示」 inside the window asks nothing more; the SAME cookie without the page secret (a second tab) and
//      another sign-in each need their own window (r2: the window is the PAGE's)
//   ⑤ 5 MINUTES (the hub's clock and the page's both moved on) ⇒ every value masked again, the chip gone, the hub answers
//      reveal_needs_password, and 「显示」 asks for the password again
//   ⑥ a LOCK anywhere ⇒ the open values vanish and the window says locked
//   ⑥b Manage Agents' Show key… (r2): a fresh page ⇒ 验证是你 first, then the key; a second Show key… inside the window asks nothing
//   ⑦ a phone viewport: the rows fit, 「显示」 is reachable (on top, ≥ 36 px)
//   ⑧ the words in Chinese: 「验证是你」, 「显示」; no value or password in the server log; the audit has the reveals
// Run: node scripts/test-vault-window-chrome.mjs [--shots <dir>]   (SKIPs without chrome)
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
const wt = scratch('vault-window-wt'), PROFILE = scratch('vault-window-chrome'), FIXTURE = scratch('vault-window-canonical'), SHIM_DIR = scratch('vault-window-shim');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('vault-window-shots');
for (const d of [FIXTURE, SHOTS, SHIM_DIR]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'window-leg-sign-in-7';
const SECOND = 'window leg second password';
const RAND = crypto.randomBytes(12).toString('hex');
const PLANT_INT = `<img/src=x/onerror=window.__vwXss=1>${RAND}`;
const PLANT_KEY = `sk-ant-api03-WINDOWLEG${crypto.randomBytes(12).toString('hex')}`;
// THE CLOCK SHIM (test-only, never in src/): the hub's Date.now jumps 6 minutes per SIGUSR2
const SHIM = path.join(SHIM_DIR, 'clock-shim.cjs');
fs.writeFileSync(SHIM, "'use strict';\nlet off = 0; const real = Date.now; Date.now = () => real() + off;\nprocess.on('SIGUSR2', () => { off += 6 * 60e3; });\n");

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data');
let srv = null;
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const startServer = () => { srv = spawn(process.execPath, ['-r', SHIM, 'server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN, VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: ['ignore', srvLog, srvLog] }); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); if (p.exitCode !== null || p.signalCode !== null) { clearTimeout(t); r(); return; } p.once('exit', () => { clearTimeout(t); r(); }); }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(300); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [PROFILE, FIXTURE, SHIM_DIR]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
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
const onTop = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && (at === e || e.contains(at)); })()`;
const splashGone = () => until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
const ROW_INT = '.vw-row[data-id="integrations:cloud:browserless#apiKey"]';
const rowKey = (id) => `.vw-row[data-id="accounts:${id}#key"]`;
const plainOf = (sel) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel + ' .vw-plain')}); return i ? i.value : null; })()`);
/** every value-bearing surface of the page: its markup + every input's value */
const pageText = () => evalJs(`document.documentElement.outerHTML + '\\n' + [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('\\n')`);
const openWindow = async () => { await evalJs(`app.replayOpenSpec({ action: 'openVault' })`); return until(visible('.vw-list .vw-row'), { timeout: 15000 }); };

startServer();
check('the hub boots (sign-in password on, the clock shim loaded)', await ready());

console.log('① sign in, the second password, two secrets');
await cdp('Page.navigate', { url: URL + 'login' });
await until(`document.readyState === 'complete'`);
const login = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
check('signed in', login === 200, login);
await cdp('Page.navigate', { url: URL });
check('the app loads', !!(await until(`!!(window.app && app.wm && document.getElementById('taskbar-tray'))`, { timeout: 30000 })));
await splashGone();
const su = await api('POST', '/api/vault/setup', { password: SECOND });
check('the second password is set (unlocked)', su.status === 200 && su.json.state === 'unlocked', su);
const put = await api('PUT', '/api/integrations/cloud:browserless', { values: { apiKey: PLANT_INT, apiUrl: 'https://chrome.example.net' } });
const acc = await api('POST', '/api/accounts', { name: 'Window leg key', key: PLANT_KEY });
const accId = acc.json && acc.json.account && acc.json.account.id;
check('an integration key (an HTML payload) and an API key are stored', put.status === 200 && !!accId, { put: put.status, acc });

console.log('② the window lists them, masked');
check('the Vault window opens with its rows', !!(await openWindow()));
check('the integration row and the API-key row are listed', !!(await until(`!!document.querySelector(${JSON.stringify(ROW_INT)}) && !!document.querySelector(${JSON.stringify(rowKey(accId))})`, { timeout: 5000 })));
check('their value fields are masked (no field open)', (await evalJs(`document.querySelectorAll('.vw-plain').length`)) === 0 && (await evalJs(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-mask')}).textContent`)) === '••••••••');
const t0 = await pageText();
check('NO VALUE IN THE PAGE: neither planted value (nor its random part) in the markup or any input', ![PLANT_INT, PLANT_KEY, RAND].some((v) => t0.includes(v)));
await shot('vw-1-list.png');

console.log('③ 显示 ⇒ 验证是你 ⇒ the value');
await click(ROW_INT + ' .vw-show');
check('「显示」 asks for the second password (the 验证是你 modal)', !!(await until(visible('#vault-reveal-dialog'), { timeout: 5000 })));
check('… on top (its Confirm button is what a click reaches)', !!(await until(onTop('.vault-reveal-go'), { timeout: 5000 })));
await shot('vw-2-verify.png');
await typeInto('#vault-reveal-pw', 'not the second password'); await click('.vault-reveal-go');
check('a wrong second password says so (the modal stays)', (await until(`document.querySelector('#vault-reveal-dialog .vault-err')?.textContent`, { timeout: 8000 })) === 'That is not the second password');
await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
check('the right one closes the modal', !!(await until(`!document.getElementById('vault-reveal-dialog')`, { timeout: 10000 })));
check('the value appears in ITS row\'s field', (await until(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-plain')})?.value`, { timeout: 8000 })) === PLANT_INT);
check('… and only there (the API key row stays masked)', (await plainOf(rowKey(accId))) === null);
check('the countdown chip shows (4:5x)', /4:5\d|5:00/.test(await until(`(() => { const t = document.querySelector('.vw-timer'); return t && !t.hidden ? t.textContent : ''; })()`, { timeout: 3000 }) || ''));
check('THE HTML PAYLOAD STAYS TEXT: no element made from it, no handler ran', (await evalJs(`document.querySelectorAll('img[src="x"]').length === 0 && window.__vwXss === undefined`)) === true);
await shot('vw-3-shown.png');

console.log('④ inside the window: no second ask; another sign-in needs its own');
await click(rowKey(accId) + ' .vw-show');
check('a second 「显示」 shows its value without asking', (await until(`document.querySelector(${JSON.stringify(rowKey(accId) + ' .vw-plain')})?.value`, { timeout: 8000 })) === PLANT_KEY && !(await evalJs(`!!document.getElementById('vault-reveal-dialog')`)));
const tab2 = await api('POST', '/api/vault/reveal', { id: 'integrations:cloud:browserless#apiKey' });
check('the SAME cookie without the page secret (a second tab) ⇒ 403 reveal_needs_password while this page\'s window is open', tab2.status === 403 && tab2.json && tab2.json.code === 'reveal_needs_password', tab2);
const OWN = `http://127.0.0.1:${PORT}`;
const ck2 = await (async () => { const lr = await fetch(`${OWN}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: OWN }, body: JSON.stringify({ password: SIGN_IN }) }); return String(lr.headers.get('set-cookie') || '').split(';')[0]; })();
const node = (p, body) => fetch(`${OWN}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck2, 'sec-fetch-site': 'same-origin', origin: OWN }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const other = await node('/api/vault/reveal', { id: 'integrations:cloud:browserless#apiKey' });
check('another sign-in (a second cookie) ⇒ 403 reveal_needs_password', other.status === 403 && other.json && other.json.code === 'reveal_needs_password', other);
const nodeWin = await node('/api/vault/reveal-session', { password: SECOND });
const nodePage = nodeWin.json && nodeWin.json.page;
const nodeRev = await node('/api/vault/reveal', { id: 'integrations:cloud:browserless#apiKey', page: nodePage });
check('… which opens ITS OWN window with its own page secret (and reveals)', /^[0-9a-f]{32}$/.test(String(nodePage)) && nodeRev.status === 200 && nodeRev.json.value === PLANT_INT, { s: nodeRev.status });
const hide = await click(ROW_INT + ' .vw-show');
check('「隐藏」 forgets that row\'s value (the field is gone)', hide && (await plainOf(ROW_INT)) === null && (await plainOf(rowKey(accId))) === PLANT_KEY);

console.log('⑤ five minutes later — the hub\'s clock and the page\'s moved on');
srv.kill('SIGUSR2');
await evalJs(`(() => { const real = Date.now; Date.now = () => real() + 6 * 60e3; return true; })()`);
check('every value is masked again (no open field) and the chip is gone', !!(await until(`document.querySelectorAll('.vw-plain').length === 0 && document.querySelector('.vw-timer').hidden`, { timeout: 5000 })));
const exp = await node('/api/vault/reveal', { id: 'integrations:cloud:browserless#apiKey', page: nodePage });
check('the hub answers 403 reveal_needs_password to a page secret that WAS open (the hub\'s own 5 minutes are over too)', exp.status === 403 && exp.json && exp.json.code === 'reveal_needs_password', exp);
const t1 = await pageText();
check('no value left in the page', ![PLANT_INT, PLANT_KEY, RAND].some((v) => t1.includes(v)));
await click(ROW_INT + ' .vw-show');
check('「显示」 asks for the second password again', !!(await until(visible('#vault-reveal-dialog'), { timeout: 5000 })));
await shot('vw-4-expired.png');
await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
check('… and shows the value once it is given', (await until(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-plain')})?.value`, { timeout: 8000 })) === PLANT_INT);

console.log('⑥ a lock anywhere (int317: since vault-e2e-password-fix-r2 a LOCK act signs every login out too)');
const lk = await api('POST', '/api/vault/lock');
check('the vault is locked (the lock door, outside the window)', lk.status === 200 && lk.json.state === 'locked', lk);
check('the open value vanishes: the lock signed this login out — the page lands on the sign-in', !!(await until(`location.pathname === '/login'`, { timeout: 20000 })));
const tLock = await pageText();
check('… and no value is left in the page', ![PLANT_INT, PLANT_KEY, RAND].some((v) => tLock.includes(v)));
await shot('vw-5-locked.png');
const relogin = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
const reUnlock = await api('POST', '/api/vault/unlock', { password: SECOND });
check('signed in again, the vault unlocked again', relogin === 200 && reUnlock.status === 200 && reUnlock.json.state === 'unlocked', { relogin, s: reUnlock.status });

console.log('⑥b Manage Agents\' Show key… through the page\'s window');
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
await evalJs(`app._showAgentsDialog()`);
const menuSel = `.acct-key-row[data-id="${accId}"] .acct-menu`;
check('Manage Agents lists the API-key account', !!(await until(visible(menuSel), { timeout: 15000 })));
const showKey = async () => { await click(menuSel); await until(`[...document.querySelectorAll('.context-menu-item')].some((e) => /Show key/.test(e.textContent))`, { timeout: 5000 }); return evalJs(`(() => { const e = [...document.querySelectorAll('.context-menu-item')].find((x) => /Show key/.test(x.textContent)); if (!e) return false; e.click(); return true; })()`); };
check('⋯ ▸ Show key…', await showKey());
check('a fresh page ⇒ 验证是你 first (the hub refused the key without this page\'s window)', !!(await until(visible('#vault-reveal-dialog'), { timeout: 8000 })));
check('the 验证是你 text says a second tab asks again', /Another tab or window asks again/.test(await evalJs(`document.querySelector('#vault-reveal-dialog .vault-text')?.textContent || ''`)));
const keyShown = `[...document.querySelectorAll('.dialog-overlay input')].some((i) => i.value === ${JSON.stringify(PLANT_KEY)})`;
check('no key on the page before the password', !(await evalJs(keyShown)));
await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
check('the right second password ⇒ the key in Show key…\'s dialog', !!(await until(keyShown, { timeout: 10000 })));
await shot('vw-8-showkey.png');
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => { if ([...o.querySelectorAll('input')].some((i) => i.value)) o.remove(); })`);
check('⋯ ▸ Show key… again', await showKey());
check('… inside the window: the key at once, nothing asked', !!(await until(keyShown, { timeout: 8000 })) && !(await evalJs(`!!document.getElementById('vault-reveal-dialog')`)));
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove())`);

console.log('⑦ a phone');
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 760, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
check('the window opens on a phone with its rows', !!(await openWindow()));
const ph = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(ROW_INT)}).getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(ROW_INT + ' .vw-show')}).getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, bh: b.height }; })()`);
check(`a row fits the screen (${Math.round(ph.l)}…${Math.round(ph.r)} of ${ph.w}) and 「显示」 is a ≥ 36 px target`, ph.l >= 0 && ph.r <= ph.w + 1 && ph.bh >= 36, ph);
check('「显示」 is reachable (on top)', !!(await until(onTop(ROW_INT + ' .vw-show'), { timeout: 5000 })));
await shot('vw-6-phone.png');
await cdp('Emulation.clearDeviceMetricsOverride');

console.log('⑧ the words in Chinese; the log; the audit');
await evalJs(`localStorage.setItem('vibespace.lang', 'zh')`);
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
await openWindow();
check('「显示」', (await evalJs(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-show')})?.textContent`)) === '显示');
await click(ROW_INT + ' .vw-show');
check('「验证是你」', (await until(`document.querySelector('#vault-reveal-dialog h3')?.textContent`, { timeout: 5000 })) === '验证是你');
await shot('vw-7-zh.png');
const log = fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8');
const audit = fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8');
check('no value and no password in the server log or the audit', ![PLANT_INT, PLANT_KEY, RAND, SECOND, 'not the second password'].some((v) => log.includes(v) || audit.includes(v)));
check('the audit holds the reveals (vault-reveal: who / ip / entry)', audit.split('\n').filter((l) => l.includes('"event":"vault-reveal"')).length >= 3 && /"entry":"cloud:browserless"/.test(audit));

await stopServer();
console.log(failed ? `\nFAILED (${passed} passed, ${failed} failed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
