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
//   ③b (lane vault-one-door) 「稍后」 leaves the chip; a locked card's door (`vs-vault-door`) opens the UNLOCK modal again
//   ③c (lane vault-relock-door) the OPEN tab re-asks on a bundle-preserving restart (no navigate): a NEW startedAt ⇒ the
//      modal; a same-startedAt broadcast is the chip only; a persistent lock strip shows while locked; a pre-fix bundle stays silent
//   ③/④ lane vault-locked-refusal-notice: the integration's refusal is NOTED — facts.blocked ≥ 1, the strip says "N waiting
//      on it", ONE For-you item names «VibeSpace (… the integrations store)»; the unlock resolves it and the count is 0
//   ⑦ lane vault-e2e-password-fix-r2: auth.json holds the login's sha256, never the cookie's token; a LOCK from the page
//      signs every login out — the page lands on the sign-in, and after it the unlock modal (the owner's decision ④)
//   ④b design q-047 L1 (lane vault-totp): a two-step code in the Vault window — its row (name · «Two-step code» · 看码 · 显示 ·
//      用于… · 删除), no code before 看码 and no seed in the DOM; 看码 ⇒ the CURRENT code (RFC 6238 at this clock, 3 + 3) with
//      NO 验证是你, its ring (--p) and seconds; at the step's boundary it is asked again and changes; 显示 ⇒ 验证是你, then the
//      otpauth link; 全部显示 skips the seed; 用于… opens its picker; 隐藏码 hides it; every view an audit line, the seed in none
//   L lane vault-locked-loud (the owner 2026-10-20: "如果 vault 没解锁应该直接在界面上有个显著提醒，不需要等到 agent 被 block 了"): a hub
//      with NO vault says none of the three (no dialog, no ⚙ mark, no tray item); a locked first load opens the dialog, the ⚙
//      button wears the red lock («Vault locked — click to unlock») and the tray holds the URGENT item (the badge's red
//      segment); a reload after 「稍后」 asks no more (the tab's set-aside lock) while the mark and the item stay; Esc closes it;
//      a ⚙ press while locked opens the dialog first, then the menu; the unlock clears the dialog, the mark and the item on
//      BOTH open clients; the phone's ⚙ wears it too and the dialog fits 375×812
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

// lane vault-locked-loud: the three things a LOCKED vault says at once, as one page sees them
const gearMarkJs = (id = 'btn-global-settings') => `(() => { const b = document.getElementById(${JSON.stringify(id)}); const m = b && b.querySelector('.vault-gear-mark'); if (!m) return { on: false, title: b ? b.title : null }; const r = m.getBoundingClientRect(); const probe = document.createElement('span'); probe.style.color = 'var(--red)'; document.body.appendChild(probe); const red = getComputedStyle(probe).color; probe.remove(); return { on: r.width > 0 && r.height > 0, svg: !!m.querySelector('svg'), color: getComputedStyle(m).color, cog: getComputedStyle(b).color, red, title: b.title }; })()`;
const markRed = (m) => !!m && m.on && m.svg && m.color === m.red && m.cog === m.red && m.title === 'Vault locked \u2014 click to unlock (For you names what is waiting on it)';   // int332: the chip's full words
const trayUrgentJs = `(() => { const b = document.getElementById('taskbar-user-todos'); const u = b && b.querySelector('.ut-seg-urgent'); return { urgency: b ? b.dataset.urgency : null, urgent: u ? Number(u.textContent) : 0 }; })()`;
const openVaultItems = async () => { const r = (await api('GET', '/api/user-todos')).json || {}; return ((r.todos && r.todos.open) || []).filter((i) => i.sessionKey === 'vault' && i.action && i.action.type === 'vault-unlock'); };

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
{
  await sleep(1000);   // the boot read has landed (the setup nag is snoozed by the suite's ONBOARDED_SOURCE)
  const m = await evalJs(gearMarkJs());
  check('①L lane vault-locked-loud: a hub with NO vault says none of the three — no unlock dialog, no ⚙ mark (the plain title), no vault item in the tray', !(await evalJs(`!!document.getElementById('vault-unlock-dialog')`)) && !m.on && m.title === 'Global settings' && (await openVaultItems()).length === 0, m);
  await click('#btn-global-settings');
  check('①L … and a ⚙ press opens the menu at once (no dialog first)', !!(await until(`!!document.querySelector('.global-settings-popover') && !document.getElementById('vault-unlock-dialog')`, { timeout: 5000 })));
  await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`);
}

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
check('③ the persistent lock strip shows at the top of the workspace (owner 2026-10-20: 常驻警告)', !!(await until(visible('#vault-lock-strip'), { timeout: 5000 })));
check('③ the strip never covers the unlock dialog\u2019s button (the dialog stays reachable)', !!(await evalJs(onTop('.vault-unlock-go'))));
{
  const m = await until(`(() => { const m = ${gearMarkJs()}; return m.on ? m : null; })()`, { timeout: 5000 });
  check('③L lane vault-locked-loud: the ⚙ button wears the RED mark (a lock SVG in --red, the cog in --red) and says «Vault locked — click to unlock»', markRed(m), m);
  const tray = await until(`(() => { const t = ${trayUrgentJs}; return t.urgent >= 1 ? t : null; })()`, { timeout: 8000 });
  check('③L the For-you tray holds the URGENT item at once — the badge\u2019s red (urgent) segment counts it', !!tray && tray.urgency === 'urgent' && tray.urgent >= 1, tray || await evalJs(trayUrgentJs));
  const it = await openVaultItems();
  check('③L … the item is ONE urgent action row whose door opens the unlock dialog', it.length === 1 && it[0].kind === 'action' && it[0].urgency === 'urgent' && it[0].action.type === 'vault-unlock', it.map((i) => ({ kind: i.kind, urgency: i.urgency })));
}
const lockedInt = await integration();
check('the integration answers key-unreadable:vault_locked', lockedInt.storeError === 'key-unreadable:vault_locked', lockedInt);
// lane vault-locked-refusal-notice: the refusal IS the signal — noted (the store-key road: «VibeSpace», the store), counted
// on the strip, named by THE one For-you item
const st3 = (await api('GET', '/api/vault/state')).json || {};
check('③ the refusal is NOTED: the vault\u2019s facts count who the lock stopped (blocked \u2265 1)', Number(st3.blocked) >= 1, st3);
check('③ the persistent strip shows the COUNT ("N waiting on it") — and where to unlock (lane vault-manual-and-lock: Unlock… enters the second password)', !!(await until(`(() => { const s = document.getElementById('vault-lock-strip'); const n = s ? Number(s.dataset.blocked) : 0; return n >= 1 && s.querySelector('.vls-text').textContent === 'The vault is locked \u2014 ' + n + ' waiting on it (For you names them). Unlock\u2026 enters the second password.'; })()`, { timeout: 8000 })), await evalJs(`document.querySelector('#vault-lock-strip .vls-text')?.textContent`));
const vaultItems = async () => { const r = (await api('GET', '/api/user-todos')).json || {}; return ((r.todos && r.todos.open) || []).filter((i) => i.sessionKey === 'vault' && i.action && i.action.type === 'vault-unlock'); };
const items3 = await vaultItems();
check('③ ONE For-you item names who was stopped and what (VibeSpace \u2014 the integrations store)', items3.length === 1 && items3[0].i18n && /VibeSpace \(.*the integrations store/.test(items3[0].i18n.text.params?.who || ''), items3.map((i) => i.i18n));
await shot('vault-2-locked.png');
await typeInto('#vault-unlock-pw', 'not the second password'); await click('.vault-unlock-go');
check('a wrong password says so', (await until(`document.querySelector('#vault-unlock-dialog .vault-err')?.textContent`, { timeout: 8000 })) === 'That is not the second password');
check('… and the vault stays locked', (await api('GET', '/api/vault/state')).json?.state === 'locked');
await shot('vault-3-wrong.png');
await click('#vault-unlock-dialog .vault-later');
check('③b 「稍后」 closes the modal; the lock chip stays (the door back)', !!(await until(`!document.getElementById('vault-unlock-dialog') && !!document.getElementById('taskbar-vault')`, { timeout: 3000 })));
check('③b the persistent strip stays after 「稍后」 (not dismissable) and its Unlock button is now reachable (on top)', !!(await until(`!!document.getElementById('vault-lock-strip')`, { timeout: 3000 })) && !!(await evalJs(onTop('#vault-lock-strip .vls-unlock'))));
{
  // lane vault-locked-loud: 「稍后」 set THIS lock aside for the tab — a reload asks no more, the mark and the item stay
  check('③L 「稍后」 wrote the set-aside lock into the tab\u2019s sessionStorage', /^\d+:\d+$/.test(await evalJs(`sessionStorage.getItem('vs-vault-unlock-later') || ''`) || ''));
  await cdp('Page.navigate', { url: URL });
  check('③L RELOAD after 「稍后」: the app is back, its strip drawn by the boot read', !!(await until(`!!document.getElementById('vault-lock-strip')`, { timeout: 30000 })));
  await splashGone(); await sleep(1500);
  check('③L … and NO dialog (the set-aside lock; the base asked at every load)', !(await evalJs(`!!document.getElementById('vault-unlock-dialog')`)));
  check('③L … while the ⚙ mark stays red and the tray keeps the urgent item', markRed(await evalJs(gearMarkJs())) && (await evalJs(trayUrgentJs)).urgent >= 1 && (await openVaultItems()).length === 1);
  await evalJs(`document.getElementById('vault-unlock-dialog')?.remove(); true`);   // (a base run's dialog — the legs below open their own)
  await shot('vault-L1-reload-after-later.png');
  // Esc closes the dialog (the door opens it; the strip stays)
  await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);
  await until(visible('#vault-unlock-dialog'), { timeout: 5000 });
  await until(`document.activeElement && document.activeElement.id === 'vault-unlock-pw'`, { timeout: 3000 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('③L Esc closes the dialog; the strip and the ⚙ mark stay', !!(await until(`!document.getElementById('vault-unlock-dialog') && !!document.getElementById('vault-lock-strip') && !!document.querySelector('#btn-global-settings .vault-gear-mark')`, { timeout: 3000 })));
  // a ⚙ press while locked: the unlock dialog FIRST (one press), the menu once it closes
  await click('#btn-global-settings');
  check('③L a ⚙ press while LOCKED opens the unlock dialog first — no menu yet', !!(await until(`!!document.getElementById('vault-unlock-dialog') && !document.querySelector('.global-settings-popover')`, { timeout: 5000 })));
  await shot('vault-L2-gear-press.png');
  await click('#vault-unlock-dialog .vault-later');
  check('③L … then 「稍后」 ⇒ the menu opens as today (the press ends in the menu)', !!(await until(`!document.getElementById('vault-unlock-dialog') && !!document.querySelector('.global-settings-popover')`, { timeout: 5000 })));
  await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`);
}
await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);
check('③b a locked card\'s door (vs-vault-door) opens the UNLOCK modal again (lane vault-one-door: the old ⚙ dialog is gone; the door is unchanged)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));

console.log('④ the right password — seen by BOTH open clients (lane vault-locked-loud)');
// a SECOND client: another tab of the same signed-in browser (its own sessionStorage — it set nothing aside)
const tB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const wsB = new WebSocket(tB.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => wsB.on('open', r));
let seqB = 0; const pendB = new Map();
wsB.on('message', (d) => { const m = JSON.parse(d); if (m.id && pendB.has(m.id)) { pendB.get(m.id)(m); pendB.delete(m.id); } });
const cdpB = (method, params = {}) => new Promise((res, rej) => { const id = ++seqB; pendB.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); wsB.send(JSON.stringify({ id, method, params })); });
const evalB = async (expr) => { const r = await cdpB('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page B threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const untilB = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalB(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
await cdpB('Page.enable');
await cdpB('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdpB('Page.navigate', { url: URL });
check('④L client B (a second tab) loads LOCKED: its own dialog opens, its ⚙ is red, its tray holds the urgent item', !!(await untilB(`(() => { const m = ${gearMarkJs()}; const t = ${trayUrgentJs}; return !!document.getElementById('vault-unlock-dialog') && m.on && m.color === m.red && t.urgent >= 1; })()`, { timeout: 30000 })));
await untilB(`!!(window.app && window.app.ws && window.app.ws.connected)`, { timeout: 15000 });
await typeInto('#vault-unlock-pw', SECOND); await click('.vault-unlock-go');
check('the modal closes', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 })));
check('the lock chip goes', !!(await until(`!document.getElementById('taskbar-vault')`, { timeout: 5000 })));
check('④ the persistent lock strip goes when the vault is unlocked', !!(await until(`!document.getElementById('vault-lock-strip')`, { timeout: 5000 })));
check('④ lane vault-locked-refusal-notice: the unlock resolves THE item and clears the count', (await vaultItems()).length === 0 && (await api('GET', '/api/vault/state')).json?.blocked === 0);
check('④L client A: the ⚙ mark is gone (the plain title back) and the tray\u2019s urgent segment with it', !!(await until(`(() => { const m = ${gearMarkJs()}; const t = ${trayUrgentJs}; return !m.on && m.title === 'Global settings' && !t.urgent; })()`, { timeout: 8000 })), { mark: await evalJs(gearMarkJs()), tray: await evalJs(trayUrgentJs) });
check('④L client B follows the broadcast WITHOUT a reload: its dialog, its ⚙ mark, its strip and its urgent item are gone', !!(await untilB(`(() => { const m = ${gearMarkJs()}; const t = ${trayUrgentJs}; return !document.getElementById('vault-unlock-dialog') && !m.on && m.title === 'Global settings' && !document.getElementById('vault-lock-strip') && !t.urgent; })()`, { timeout: 10000 })), { mark: await evalB(gearMarkJs()), tray: await evalB(trayUrgentJs), dialog: await evalB(`!!document.getElementById('vault-unlock-dialog')`) });
try { wsB.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tB.id}`); } catch { }
const openInt = await integration();
check('the integration\'s key opens again (the feature works)', openInt.configured && !openInt.storeError, openInt);

console.log('④b TWO-STEP CODES (design q-047 L1, lane vault-totp) — 看码 + its ring in the Vault window; the seed only behind 显示');
{
  const T = require(path.join(repo, 'src/totp.js'));
  const SEEDC = T.base32Encode(Buffer.from('12345678901234567890'));   // RFC 6238's SHA1 key, its base32 built at runtime (never a literal)
  const codeAt = (ms) => T.totp(Buffer.from('12345678901234567890'), { now: ms, hmac: (a, k, m) => require('crypto').createHmac(String(a).toLowerCase(), k).update(m).digest() }).code;
  const add = await api('POST', '/api/vault/totp', { uri: `otpauth://totp/GitHub:owner%40example.com?secret=${SEEDC}&issuer=GitHub` });
  check('④b a two-step code added through its person door (an otpauth link) ⇒ github-owner — the answer carries no seed', add.status === 200 && add.json?.name === 'github-owner' && !JSON.stringify(add.json).includes(SEEDC), add);
  await evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  const ROW = '.vw-row[data-id="secrets:totp:github-owner#seed"]';
  const q = (sel) => JSON.stringify(ROW + ' ' + sel);
  check('④b its row in the Vault window: the name · «Two-step code» · 看码 · 显示 · 用于… · 删除', !!(await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); return !!r && r.querySelector('.vw-label')?.textContent === 'github-owner' && /Two-step code/.test(r.querySelector('.vw-meta')?.textContent || '') && !!r.querySelector('.vw-code-view') && !!r.querySelector('.vw-show') && !!r.querySelector('.vw-totp-grant') && !!r.querySelector('.vw-del'); })()`, { timeout: 15000 })));
  check('④b no code before 看码, and no seed anywhere in the DOM', !!(await evalJs(`document.querySelector(${q('.vw-code')}).hidden && !document.documentElement.outerHTML.includes(${JSON.stringify(SEEDC)})`)));
  check('④b 显示\'s help says what it shows and behind what (a door\'s help, never a state)', /seed and its settings/.test(await evalJs(`document.querySelector(${q('.vw-show')}).title`) || ''));
  const t0 = Date.now();
  await click(`${ROW} .vw-code-view`);
  const read = `(() => { const c = document.querySelector(${q('.vw-code')}); if (!c || c.hidden) return null; const d = c.querySelector('.vw-code-digits').textContent; return d ? { d, left: c.querySelector('.vw-code-left').textContent, p: c.querySelector('.vw-ring').style.getPropertyValue('--p'), dialog: !!document.getElementById('vault-reveal-dialog'), btn: document.querySelector(${q('.vw-code-view')}).textContent } : null; })()`;
  const shown = await until(read, { timeout: 8000 });
  const want = new Set([codeAt(t0), codeAt(Date.now())]);
  check('④b 看码 ⇒ the CURRENT code (RFC 6238 over the seed at this clock), grouped 3 + 3 — and NO 验证是你', !!shown && want.has(shown.d.replace(' ', '')) && /^\d{3} \d{3}$/.test(shown.d) && !shown.dialog && shown.btn === 'Hide code', { shown, want: [...want] });
  const secs = shown && /^(\d+) s$/.test(shown.left) ? Number(shown.left.split(' ')[0]) : -1;
  check('④b … its ring (--p in (0, 100] %) and its seconds («N s», 1 ≤ N ≤ 30)', !!shown && /^\d+%$/.test(shown.p) && parseInt(shown.p, 10) > 0 && parseInt(shown.p, 10) <= 100 && secs >= 1 && secs <= 30, shown);
  await evalJs(`document.querySelector(${JSON.stringify(ROW)}).scrollIntoView({ block: 'center' }); true`);
  await shot('vault-7-totp-code.png');
  const first = shown ? shown.d : '';
  const next = await until(`(() => { const r = ${read}; return r && r.d !== ${JSON.stringify(first)} ? r : null; })()`, { timeout: (secs + 6) * 1000, step: 250 });
  check('④b at the step\'s boundary the code is asked again and CHANGES (the ring restarted near full)', !!next && new Set([codeAt(Date.now() - 2000), codeAt(Date.now())]).has(next.d.replace(' ', '')) && parseInt(next.p, 10) >= 80, { first, next });
  const views = fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"vault-totp-view"'));
  check('④b every view is a vault-totp-view audit line (2 so far) — never a code', views.length === 2 && !views.some((l) => (first && l.includes(first.replace(' ', ''))) || (next && l.includes(next.d.replace(' ', '')))), views);
  await click(`${ROW} .vw-show`);
  check('④b 显示 on that row asks 验证是你 first (the seed is behind the second password)', !!(await until(visible('#vault-reveal-dialog'), { timeout: 5000 })));
  await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
  const plain = await until(`document.querySelector(${q('.vw-plain')})?.value`, { timeout: 8000 });
  check('④b … then ONE value: the otpauth link — the seed and every setting', plain === `otpauth://totp/GitHub:owner%40example.com?secret=${SEEDC}&issuer=GitHub&algorithm=SHA1&digits=6&period=30`, plain);
  await click(`${ROW} .vw-show`);
  await click('.vw-show-all');
  const all = await until(`(() => { const i = document.querySelector('.vw-row[data-id="integrations:cloud:browserless#apiKey"] .vw-plain'); return i && i.value ? { other: i.value, seed: !!document.querySelector(${q('.vw-plain')}) } : null; })()`, { timeout: 8000 });
  check('④b 全部显示 opens the other values but NOT the two-step seed (a seed only by its own 显示 — never a list\'s)', !!all && all.other === 'chrome-leg-api-key' && all.seed === false, all);
  await click('.vw-hide-all');
  await click(`${ROW} .vw-totp-grant`);
  check('④b 用于… opens its picker (no conversation runs here: it says so)', !!(await until(visible('#vault-totp-grant'), { timeout: 5000 })) && /Nothing to pick|Task groups|Conversations/.test(await evalJs(`document.querySelector('#vault-totp-grant')?.textContent || ''`)));
  await shot('vault-8-totp-use-for.png');
  await evalJs(`document.querySelector('#vault-totp-grant .btn-cancel')?.click(); true`);
  await click(`${ROW} .vw-code-view`);
  check('④b 隐藏码 hides it (no digits left in the row)', !!(await until(`document.querySelector(${q('.vw-code')}).hidden && !document.querySelector(${q('.vw-code-digits')}).textContent`, { timeout: 3000 })));
  const audit = fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8') + fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8');
  check('④b the seed in no audit line and no server log line', !audit.includes(SEEDC));
  await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w && w.type === 'vault') app.wm.closeWindow(id); return true; })()`);
}

console.log('③c the OPEN tab re-asks on a bundle-preserving restart — no navigate; a same-startedAt broadcast is the chip only');
const atOpen = (await api('GET', '/api/vault/state')).json || {};
await stopServer(); startServer();
check('the hub is back (same bundle)', await ready());
check('③c the OPEN tab opens the unlock modal on the ws reconnect — no navigate (the bug: it used to stay silent)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })));
check('③c … and draws the strip and the chip', !!(await until(`!!document.getElementById('vault-lock-strip') && !!document.getElementById('taskbar-vault')`, { timeout: 5000 })));
const atBoot = (await api('GET', '/api/vault/state')).json || {};
check('③c the restart is a NEW startedAt (why the tab re-asks — a restart, not a lock act)', typeof atBoot.startedAt === 'number' && atBoot.startedAt !== atOpen.startedAt, { was: atOpen.startedAt, now: atBoot.startedAt });
await click('#vault-unlock-dialog .vault-later');
check('③c 「稍后」 closes the dialog; the strip stays (not dismissable)', !!(await until(`!document.getElementById('vault-unlock-dialog') && !!document.getElementById('vault-lock-strip')`, { timeout: 3000 })));
await evalJs(`document.getElementById('taskbar-vault')?.remove(); true`);   // a fresh signal: the next locked broadcast re-draws the chip
const idle = await api('POST', '/api/vault/idle', { hours: 0 });
check('③c the idle door answers while locked (a same-startedAt locked broadcast — a lock act\u2019s shape without ⑦\u2019s sign-out)', idle.status === 200, idle);
check('③c the broadcast reached the tab (the chip is re-drawn)', !!(await until(visible('#taskbar-vault'), { timeout: 5000 })));
check('③c RED CONTROL: a same-startedAt broadcast opened NO new dialog (a lock act is the chip only; only a NEW startedAt re-asks)', !(await evalJs(`!!document.getElementById('vault-unlock-dialog')`)));

console.log('⑤ RESTART again ⇒ locked again; a phone gets the same modal');
await stopServer(); startServer();
check('the hub is back', await ready());
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: URL });
check('locked again after the restart — the unlock modal (no auto-unlock of any kind)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })) && (await api('GET', '/api/vault/state')).json?.state === 'locked');
await splashGone();
check('the phone\'s Unlock button is reachable (on top)', !!(await until(onTop('.vault-unlock-go'), { timeout: 5000 })));
check('⑤ the persistent strip shows on the phone too, and never covers the dialog button', !!(await until(visible('#vault-lock-strip'), { timeout: 5000 })) && !!(await evalJs(onTop('.vault-unlock-go'))));
const rect = await evalJs(`(() => { const d = document.querySelector('#vault-unlock-dialog .dialog'); const r = d.getBoundingClientRect(); const go = document.querySelector('.vault-unlock-go').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, goH: go.height }; })()`);
check(`the phone modal sits inside the screen (${Math.round(rect.l)}…${Math.round(rect.r)} of ${rect.w}) with a ≥ 36 px button (a phone target)`, rect.l >= 0 && rect.r <= rect.w && rect.goH >= 36, rect);
{
  const box = await evalJs(`(() => { const r = document.querySelector('#vault-unlock-dialog .dialog').getBoundingClientRect(); return { t: r.top, b: r.bottom, h: innerHeight, w: innerWidth }; })()`);
  check(`⑤L the dialog fits 375×812 top to bottom (${Math.round(box.t)}…${Math.round(box.b)} of ${box.h})`, box.w === 375 && box.h === 812 && box.t >= 0 && box.b <= box.h, box);
  const pm = await evalJs(gearMarkJs('mobile-nav-gear'));
  check('⑤L the phone nav\u2019s ⚙ wears the same red mark', markRed(pm), pm);
}
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

console.log('③c-RED the pre-fix client does NOT re-ask on a reconnect/broadcast — a patched worktree bundle (the fix is load-bearing)');
await stopServer();
{
  const vu = path.join(wt, 'src/lib/vault-unlock.js');
  const orig = fs.readFileSync(vu, 'utf8');
  // the pre-fix client: a reconnect did NOTHING (no re-read) and the vault-state broadcast only drew the chip (applyVaultFacts,
  // never onVaultState's startedAt-gated re-ask). Revert BOTH; the load-time ask and the strip stay — the regression this
  // isolates is the missing RE-ASK. A bundle with the reconnect re-read in place would re-open the modal here and go red.
  const noRecon = orig.split('\n').filter((l) => !l.includes("onStateChange?.((connected) => { if (connected && vaultBooted) fetchJson('/api/vault/state')")).join('\n');
  const prefix = noRecon.replace("if (msg && msg.type === 'vault-state') onVaultState(msg, 'broadcast'); }", "if (msg && msg.type === 'vault-state') applyVaultFacts(msg); }");
  check('③c-RED the patch reverts the reconnect re-read AND the broadcast re-ask (the control is real)', noRecon.split('\n').length === orig.split('\n').length - 1 && prefix !== noRecon);
  fs.writeFileSync(vu, prefix);
  execSync(`${wt}/node_modules/.bin/esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify`, { cwd: wt, stdio: 'ignore' });
  startServer();
  check('the hub is back (pre-fix bundle)', await ready());
  await cdp('Page.navigate', { url: URL });
  check('③c-RED the boot path still asks (unchanged — the regression is ONLY the reconnect/broadcast re-ask)', !!(await until(visible('#vault-unlock-dialog'), { timeout: 30000 })));
  await splashGone();
  await click('#vault-unlock-dialog .vault-later');
  await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 3000 });
  await stopServer(); startServer();
  check('the hub is back', await ready());
  check('③c-RED the pre-fix tab\u2019s ws reconnects (so it can RECEIVE the broadcast — it just won\u2019t act on it)', !!(await until(`!!(window.app && window.app.ws && window.app.ws.connected)`, { timeout: 20000 })));
  await evalJs(`document.getElementById('taskbar-vault')?.remove(); true`);
  const idleR = await api('POST', '/api/vault/idle', { hours: 0 });   // a locked broadcast carrying the NEW startedAt
  check('③c-RED the locked broadcast reaches the pre-fix tab — its chip is re-drawn (the tab is live)', idleR.status === 200 && !!(await until(visible('#taskbar-vault'), { timeout: 10000 })));
  check('③c-RED and yet the pre-fix client opened NO unlock modal (the silent bug: it re-asks only through the fix\u2019s onVaultState startedAt gate)', !(await evalJs(`!!document.getElementById('vault-unlock-dialog')`)));
}

await stopServer();
console.log(failed ? `\nFAILED (${passed} passed, ${failed} failed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
