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
//   ⑥b Manage Agents' Show key… (r2): a fresh page ⇒ 验证是你 first — in the click's own task, before any key request (lane
//      takeover-surface-census) — then the key on ONE request; a second Show key… inside the window asks nothing
//   ⑦ a phone viewport: the rows fit, 「显示」 is reachable (on top, ≥ 36 px)
//   ⑧ the words in Chinese: 「验证是你」, 「显示」; no value or password in the server log; the audit has the reveals
//   THE HEADER (lane vault-one-door — the old ⚙ System ▸ Vault… dialog is the window's header now): ⓪ not set up ⇒ only
//   设置第二密码…, which sets it from the header; unlocked ⇒ 立即锁定 + 修改第二密码… (opens the change dialog) + the idle row
//   (writes the same setting); ⑥ locked ⇒ 解锁… + 修改第二密码…, the list says locked, 解锁… from the header unlocks and the
//   rows come back; the vault's door (`vs-vault-door`) opens the UNLOCK modal while locked and the window once unlocked;
//   ⑨ 立即锁定 from the header locks (the page lands on the sign-in) and the window lists nothing. --shots keeps a 1280×800
//   PNG of the header in each state (vw-head-*.png).
//   V2 (lane vault-window-v2, design q-047 §3): ②b the RAIL — 全部 + the nine purposes, each count = its rows in the list =
//   its group head (NINE-COLUMN COUNTS = ROWS), a purpose picked shows its rows only; a row = name · kind chip · provenance
//   chip; THE REVEAL DOOR'S HELP (the automation key's why is its 「显示」's title — no free-floating line); the provenance
//   filter, 只看可显示, the search, «nothing matches»; no greyed control; 添加… and its doors. ②c 「需要你」 — two cards the
//   REAL producers filed (seeded into the store's own file before the boot): answered in the band ⇒ gone from the tray;
//   answered in the tray ⇒ gone from the band. ④ KEYED: a search moves rows, an open value stays in its element.
//   ⑥a LOCKED: one sentence + 解锁… in the list, the rail counts «—», NO 添加…. ⑦ THE PHONE COLUMN (375×812): the rail a
//   chip strip, the filters behind 筛选… (a modal — the list behind follows), a row stacks. ⑧ the zh words of the rail and
//   the 「显示」 help (the owner's own sentence).
//   ⑩ SAY THE WAIT (lane vault-slow-load — inc-mvk5jyv3 «保险库操作好像加载时间有点长»; zh): each answer HELD at the page's own
//   request (CDP Fetch) — 解锁's button says 「正在解锁…」 (disabled) and the dialog 「正在核对第二密码…」 with a spinner until the
//   answer; the window's open says 「正在读取保险库…」 in the list, the keys' grants are asked WHILE the list is still out (one
//   round trip, not two) and the chat accounts are never asked; the page's request ring (the incident snapshot's) has the
//   held list's real wait; 验证是你 says 「正在验证…」, 显示全部 counts 「正在显示 1 / N…」, 审计… says 「正在读取审计记录…」.
//   RED CONTROL: the base tree under this suite (each of these blank).
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
// lane vault-window-v2: two 「需要你」 cards filed by the REAL producers (src/server/vault-hooks.js) into the For-you store's own
// file — the hub loads them at boot (no test door in the product)
const SEED = {};
{
  fs.mkdirSync(DATA, { recursive: true });
  const { UserTodoManager } = require(path.join(wt, 'src/user-todos.js'));
  const VH = require(path.join(wt, 'src/server/vault-hooks.js'));
  const ut = new UserTodoManager({ dataDir: DATA, expirySweepMs: 0 });
  const att = VH.createVaultAttention({ userTodos: ut });
  SEED.fail = att.useFailed({ entry: 'apikey:ak-release', name: 'release-bot', code: 'vault_locked', who: 'Release helper', verb: 'conversations.open', target: 'lane a' }).id;   // lane conversations-archive-verb: the notice names the verb, the target, the reason, the door
  SEED.rotate = att.agentPut({ entry: 'agent:github-token', name: 'github-token', who: 'Release helper' }).id;
  ut.stop();
}
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
// lane vault-slow-load: an answer HELD at the page's own request (CDP Fetch, request stage) — the wait the page shows is the subject
const paused = [];
let autoGo = false;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.method !== 'Fetch.requestPaused') return; if (autoGo) cdp('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}); else paused.push(m.params); });
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
// lane vault-one-door: the window's HEADER — its state word and its doors (the `vault-do-*` class of each button, in order)
const headState = () => evalJs(`document.querySelector('.vw-head')?.dataset.state || ''`);
const headDoors = () => evalJs(`[...document.querySelectorAll('.vw-head .vault-actions button')].map((b) => (b.className.match(/vault-do-[a-z]+/) || ['?'])[0]).join(',')`);
const headIdle = () => evalJs(`!!document.querySelector('.vw-head .vault-idle-select')`);
/** a 1280×800 PNG of the page with the window's header (the brief's size; the headless window's own viewport is shorter) */
const headShot = async (name) => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(400); await shot(name); await cdp('Emulation.clearDeviceMetricsOverride'); await sleep(200); };
const closeVaultWindow = () => evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'vault') app.wm.closeWindow(w.id); true`);

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
console.log('⓪ the header (lane vault-one-door): not set up ⇒ 设置第二密码…, the second password set from it');
await evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
check('the window\'s header says not set up', (await until(`document.querySelector('.vw-head')?.dataset.state === 'not_set_up'`, { timeout: 15000 })) === true);
check('… and offers ONLY 设置第二密码… (no lock, no change, no idle row)', (await headDoors()) === 'vault-do-setup' && !(await headIdle()), await headDoors());
await headShot('vw-head-0-not-set-up.png');
await click('.vw-head .vault-do-setup');
check('设置第二密码… opens the setup modal', !!(await until(visible('#vault-setup-dialog'), { timeout: 5000 })));
await typeInto('#vault-setup-pw', SECOND); await typeInto('#vault-setup-pw2', SECOND); await click('.vault-setup-go');
check('set ⇒ the modal closes', !!(await until(`!document.getElementById('vault-setup-dialog')`, { timeout: 20000 })));
const su = await api('GET', '/api/vault/state');
check('the second password is set (unlocked)', su.status === 200 && su.json.state === 'unlocked', su);
check('the header follows: unlocked ⇒ 立即锁定 + 修改第二密码… + the idle row, and since when', (await until(`document.querySelector('.vw-head')?.dataset.state === 'unlocked'`, { timeout: 5000 })) === true && (await headDoors()) === 'vault-do-lock,vault-do-change' && (await headIdle()) && (await evalJs(`document.querySelectorAll('.vw-head .vault-state-when').length`)) === 2, await headDoors());
await evalJs(`(() => { const s = document.querySelector('.vw-head .vault-idle-select'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
check('the idle row writes the same setting (4 h)', !!(await until(`fetch('/api/vault/state').then((r) => r.json()).then((j) => j.idleLockHours === 4)`, { timeout: 5000, step: 200 })));
check('… and the header keeps showing it (redrawn from the facts)', (await until(`document.querySelector('.vw-head .vault-idle-select')?.value === '4'`, { timeout: 3000 })) === true);
await evalJs(`(() => { const s = document.querySelector('.vw-head .vault-idle-select'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
check('… back to never', !!(await until(`fetch('/api/vault/state').then((r) => r.json()).then((j) => j.idleLockHours === 0)`, { timeout: 5000, step: 200 })));
await headShot('vw-head-1-unlocked.png');
await click('.vw-head .vault-do-change');
check('修改第二密码… opens the change dialog', !!(await until(visible('#vault-change-dialog'), { timeout: 5000 })));
await click('#vault-change-dialog .btn-cancel');
check('… which closes on Cancel', !!(await until(`!document.getElementById('vault-change-dialog')`, { timeout: 3000 })));
await closeVaultWindow();
const put = await api('PUT', '/api/integrations/cloud:browserless', { values: { apiKey: PLANT_INT, apiUrl: 'https://chrome.example.net' } });
const acc = await api('POST', '/api/accounts', { name: 'Window leg key', key: PLANT_KEY });
const accId = acc.json && acc.json.account && acc.json.account.id;
check('an integration key (an HTML payload) and an API key are stored', put.status === 200 && !!accId, { put: put.status, acc });
// lane vault-one-door: an account's long-lived setup-token (the owner: the row must say it is LONG-LIVED)
const subAcc = await api('POST', '/api/accounts/subscription', { name: 'Window leg subscription' });
const subId = subAcc.json && (subAcc.json.id || (subAcc.json.account && subAcc.json.account.id));
const oatSave = subId ? await api('POST', `/api/accounts/${subId}/oat`, { token: 'sk-ant-oat01-' + crypto.randomBytes(24).toString('hex') }) : null;
check('a subscription account holds a long-lived setup-token', !!subId && oatSave && oatSave.status === 200, { subAcc, oat: oatSave && oatSave.status });
const ROW_OAT = `.vw-row[data-id="accounts:${subId}#oat"]`;

console.log('② the window lists them, masked');
check('the Vault window opens with its rows', !!(await openWindow()));
check('the integration row and the API-key row are listed', !!(await until(`!!document.querySelector(${JSON.stringify(ROW_INT)}) && !!document.querySelector(${JSON.stringify(rowKey(accId))})`, { timeout: 5000 })));
check('their value fields are masked (no field open)', (await evalJs(`document.querySelectorAll('.vw-plain').length`)) === 0 && (await evalJs(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-mask')}).textContent`)) === '••••••••');
const t0 = await pageText();
check('NO VALUE IN THE PAGE: neither planted value (nor its random part) in the markup or any input', ![PLANT_INT, PLANT_KEY, RAND].some((v) => t0.includes(v)));
check('the setup-token row says 「Long-lived OAuth token」 (its own kind word) and setup-token', /Long-lived OAuth token/.test(await until(`document.querySelector(${JSON.stringify(ROW_OAT + ' .vw-meta')})?.textContent`, { timeout: 5000 }) || '') && /setup-token/.test(await evalJs(`document.querySelector(${JSON.stringify(ROW_OAT + ' .vw-meta')})?.textContent || ''`)));
await shot('vw-1-list.png');

console.log('②b V2 (lane vault-window-v2, design q-047 §3): the purposes, the chips, the 显示 help, the filters, 添加…');
const mintAk = await api('POST', '/api/automation/keys', { name: 'release-bot', scopes: ['conversations.rename'] });
check('an automation key minted (a row of the automation purpose, made by the hub)', mintAk.status === 200 && !!(mintAk.json && mintAk.json.ok), mintAk);
await closeVaultWindow();
check('the window opens again with it', !!(await openWindow()) && !!(await until(`!!document.querySelector('.vw-row[data-store="automation"]')`, { timeout: 8000 })));
const RAIL = `[...document.querySelectorAll('.vw-rail .vw-rail-item')].map((b) => [b.dataset.purpose, b.querySelector('.vw-rail-n').textContent])`;
const railNow = await until(`(() => { const r = ${RAIL}; return r.length >= 10 ? r : null; })()`, { timeout: 5000 });
check('THE RAIL: 全部 + the nine purposes in the design\'s order (Other only when something lands in it)', !!railNow && railNow.map(([p]) => p).join() === 'all,two-step,accounts,integrations,machines,storage,app-logins,passkeys,automation,agents', railNow);
const countsNow = () => evalJs(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; const by = {}; for (const r of rows) by[r.dataset.purpose] = (by[r.dataset.purpose] || 0) + 1; return { by, total: rows.length, rail: Object.fromEntries(${RAIL}), heads: Object.fromEntries([...document.querySelectorAll('.vw-list .vw-group')].map((h) => [h.dataset.purpose, h.querySelector('.vw-group-n').textContent])) }; })()`);
const c0 = await countsNow();
check('NINE-COLUMN COUNTS = ROWS: each purpose\'s rail count = its rows in the list = its group head; 全部 = every row (accounts 2 · integrations 1 · automation 1)', Number(c0.rail.all) === c0.total && Object.entries(c0.rail).filter(([p]) => p !== 'all').every(([p, n]) => Number(n) === (c0.by[p] || 0)) && Object.entries(c0.heads).every(([p, n]) => Number(n) === c0.by[p]) && c0.by.accounts === 2 && c0.by.integrations === 1 && c0.by.automation === 1 && c0.total === 4, c0);
await click('.vw-rail-item[data-purpose="accounts"]');
check('a purpose picked in the rail shows ITS rows only (its own head, the two account rows)', !!(await until(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; return rows.length === 2 && rows.every((r) => r.dataset.purpose === 'accounts') && document.querySelector('.vw-rail-item[data-purpose="accounts"]').classList.contains('on'); })()`, { timeout: 5000 })));
await click('.vw-rail-item[data-purpose="all"]');
check('全部 brings every row back', !!(await until(`document.querySelectorAll('.vw-list .vw-row').length === 4`, { timeout: 5000 })));
const AK = '.vw-row[data-store="automation"]';
const chipsOf = (sel) => evalJs(`(() => { const r = document.querySelector(${JSON.stringify(sel)}); if (!r) return null; const p = r.querySelector('.vw-chip-prov'); return { kind: r.querySelector('.vw-chip-kind')?.textContent, prov: p && p.dataset.prov, provText: p && p.textContent, help: p && p.title, purpose: r.dataset.purpose }; })()`);
const akc = await chipsOf(AK), kc = await chipsOf(rowKey(accId));
check('a row = name · KIND chip · PROVENANCE chip: the automation key «API key · Minted by the hub · never shown»; an account\'s key «API key · By you» (each chip says where the value came from as its help)', akc && akc.kind === 'API key' && akc.prov === 'hub-mint' && akc.provText === 'Minted by the hub · never shown' && /nobody typed it in/.test(akc.help) && kc && kc.prov === 'me' && kc.provText === 'By you' && kc.purpose === 'accounts', { akc, kc });
const helpNow = await evalJs(`(() => ({ ak: document.querySelector(${JSON.stringify(AK + ' .vw-show')})?.title, int: document.querySelector(${JSON.stringify(ROW_INT + ' .vw-show')})?.title, why: document.querySelectorAll('.vw-ak-why').length, words: [...document.querySelectorAll(${JSON.stringify(AK + ' .vw-meta, ' + AK + ' .vw-value, ' + AK + ' .vw-chips')})].map((e) => e.textContent).join(' | ') }))()`);
check('THE REVEAL DOOR\'S HELP (the owner\'s confusion note): the automation key\'s 「显示」 says WHY as its own help — «only to hand it to an outside system…» — and no sentence sits beside the value as if it were the key\'s state', helpNow.ak === "Show the key's value — only to hand it to an outside system; agents inside use it by grant and never need to see it" && /second password is asked once/.test(helpNow.int || '') && helpNow.why === 0 && !/outside party|outside system/.test(helpNow.words), helpNow);
const rowsShown = () => evalJs(`[...document.querySelectorAll('.vw-list .vw-row')].map((r) => r.dataset.store)`);
await click('.vw-fchip[data-prov="system"]');
check('the provenance filter «System»: only the hub\'s own row stays; the rail counts follow (全部 1 · accounts 0)', !!(await until(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; return rows.length === 1 && rows[0].dataset.store === 'automation' && document.querySelector('.vw-rail-item[data-purpose="all"] .vw-rail-n').textContent === '1' && document.querySelector('.vw-rail-item[data-purpose="accounts"] .vw-rail-n').textContent === '0'; })()`, { timeout: 5000 })), await rowsShown());
await click('.vw-fchip[data-prov="system"]');
await click('.vw-fchip[data-prov="me"]');
check('«By you»: the person\'s own three rows, the hub\'s key gone', !!(await until(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; return rows.length === 3 && rows.every((r) => r.dataset.prov === 'me'); })()`, { timeout: 5000 })), await rowsShown());
await click('.vw-fchip[data-prov="me"]');
await click('.vw-only-shown');
check('只看可显示: every row here can be shown — all four stay', !!(await until(`document.querySelectorAll('.vw-list .vw-row').length === 4 && document.querySelector('.vw-only-shown').classList.contains('on')`, { timeout: 5000 })));
await click('.vw-only-shown');
await typeInto('.vw-search', 'release');
check('the search: «release» finds the key by its name', !!(await until(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; return rows.length === 1 && rows[0].dataset.store === 'automation'; })()`, { timeout: 5000 })));
await typeInto('.vw-search', 'zz-nothing-here');
check('nothing matches ⇒ the list says so', /No stored value matches/.test(await until(`document.querySelector('.vw-list .vw-empty')?.textContent`, { timeout: 5000 }) || ''));
await typeInto('.vw-search', '');
check('cleared ⇒ the four rows back', !!(await until(`document.querySelectorAll('.vw-list .vw-row').length === 4`, { timeout: 5000 })));
check('NO GREYED CONTROL anywhere in the window (a door a row has not is not drawn)', (await evalJs(`document.querySelectorAll('.vw [disabled]').length`)) === 0);
check('unlocked ⇒ 「添加…」 in the bar', !!(await until(visible('.vw-add'), { timeout: 3000 })));
await click('.vw-add');
const addMenu = await until(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent).join('|') || null`, { timeout: 3000 });
check('添加… lists the doors that add a value — each the store\'s own (an account, an integration key, a channel account, an automation key)', addMenu === 'Account…|Integration key…|Channel account…|Automation key…', addMenu);
await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
await shot('vw-v2-list.png');

console.log('②c 「需要你」 — For you\'s own vault items: answered in one place, gone from both');
const b0 = await until(`(() => { const r = [...document.querySelectorAll('.vw-band .vw-band-row')]; return r.length === 2 ? r.map((x) => ({ id: x.dataset.id, type: x.dataset.type, text: x.querySelector('.vw-band-txt').textContent, cause: (x.querySelector('.vw-band-cause') || {}).textContent || null, fold: (x.querySelector('.vw-band-more') || {}).open, doors: [...x.querySelectorAll('[data-door]')].map((b) => b.dataset.door).join() })) : null; })()`, { timeout: 8000 });
check('the band at the top shows the two cards the producers filed, with 2 in its head', !!b0 && b0.some((x) => x.id === SEED.rotate && x.type === 'vault-rotate') && b0.some((x) => x.id === SEED.fail && x.type === 'vault-use-failed') && (await evalJs(`document.querySelector('.vw-band-n').textContent`)) === '2', b0);
// lane vault-key-row-compact (the card grammar): a use failure's HEAD says who · the key · the verb, its CAUSE is the second line, the rest under ONE closed fold
check('their words and doors: «Release helper used “release-bot” for “Open a conversation” — refused» over «The vault is locked — Unlock… at the top of the page» (the count under ONE closed fold) — 打开行 + 知道了; «“github-token” was stored by an agent that saw its value — rotate it» — 换新… + 知道了', !!b0 && b0.find((x) => x.id === SEED.fail).text === 'Release helper used “release-bot” for “Open a conversation” — refused' && b0.find((x) => x.id === SEED.fail).cause === 'The vault is locked — Unlock… at the top of the page' && b0.find((x) => x.id === SEED.fail).fold === false && b0.find((x) => x.id === SEED.fail).doors === 'open,ack' && /github-token/.test(b0.find((x) => x.id === SEED.rotate).text) && b0.find((x) => x.id === SEED.rotate).cause === null && b0.find((x) => x.id === SEED.rotate).doors === 'renew,ack', b0);
const trayOpen = (id) => `!!document.querySelector('#user-todos-popup .ut-item[data-id="${id}"]:not(.ut-item-resolved)')`;
await click('#taskbar-user-todos');
await until(visible('#user-todos-popup'), { timeout: 5000 });
await click('#user-todos-popup .ut-notice-head');
check('the For-you tray lists the SAME two items, open', !!(await until(`${trayOpen(SEED.fail)} && ${trayOpen(SEED.rotate)}`, { timeout: 8000 })));
await click(`.vw-band-row[data-id="${SEED.rotate}"] .vw-band-ack`);
check('知道了 in the BAND ⇒ its row leaves the band', !!(await until(`!document.querySelector('.vw-band-row[data-id="${SEED.rotate}"]')`, { timeout: 8000 })));
const storeOpen = async (id) => ((await api('GET', '/api/user-todos')).json?.todos?.open || []).some((i) => i.id === id);
check('… and the TRAY: the same item is no longer open there (its row resolved in place; the store says so)', !!(await until(`!(${trayOpen(SEED.rotate)})`, { timeout: 8000 })) && !(await storeOpen(SEED.rotate)));
await click(`#user-todos-popup .ut-item[data-id="${SEED.fail}"] .ut-done`);
check('✓ in the TRAY ⇒ the same card leaves the band, and the band goes (nothing left)', !!(await until(`!document.querySelector('.vw-band-row[data-id="${SEED.fail}"]') && document.querySelector('.vw-band').hidden`, { timeout: 8000 })) && !(await storeOpen(SEED.fail)));
await click('#taskbar-user-todos');

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
// lane vault-window-v2: KEYED — a search / a filter MOVES row elements; an open value stays in its own element
await evalJs(`document.querySelector(${JSON.stringify(rowKey(accId))}).__vwMark = 7; true`);
await typeInto('.vw-search', 'Window leg key');
check('KEYED: a search moves rows — the open row is the SAME element, its value still there; the other open row leaves the list', !!(await until(`(() => { const r = document.querySelector(${JSON.stringify(rowKey(accId))}); return !!r && r.__vwMark === 7 && r.querySelector('.vw-plain')?.value === ${JSON.stringify(PLANT_KEY)} && !document.querySelector(${JSON.stringify(ROW_INT)}); })()`, { timeout: 5000 })));
await typeInto('.vw-search', '');
check('… cleared: the row that left comes back with ITS value still shown (never redrawn)', (await until(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-plain')})?.value`, { timeout: 5000 })) === PLANT_INT && (await evalJs(`document.querySelector(${JSON.stringify(rowKey(accId))}).__vwMark`)) === 7);
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
check('signed in again', relogin === 200, relogin);
console.log('⑥a the header while LOCKED (lane vault-one-door): 解锁… is the one door; the vault\'s door event');
await cdp('Page.navigate', { url: URL });
// wait-for-effect, staged (lane vault-unlock-modal-race): a locked vault opens the unlock modal only after the load's
// /api/home pass runs (app._localHome) and the vault-state read it then kicks off answers. Give the modal its OWN bounded
// deadline from the boot pass, so a slow boot (two serial round-trips + the 13 MB bundle under build-server load) is never
// charged against the modal's wait — the base «one 30 s timer from navigate» reds once the serial boot exceeds 30 s.
const bootedLocked = await until(`!!(window.app && app.wm && app._localHome)`, { timeout: 45000 });
check('the load opens the unlock modal (locked)', !!(bootedLocked && (await until(visible('#vault-unlock-dialog'), { timeout: 10000 }))), bootedLocked ? 'the unlock modal did not open within 10 s of the load reading the vault state' : 'the page did not finish its /api/home boot pass within 45 s of the load');
await splashGone();
await click('#vault-unlock-dialog .vault-later');
check('「稍后」 closes it', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 3000 })));
await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);
check('a locked card\'s door (vs-vault-door) opens the UNLOCK modal — not merely the window', !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })) && !(await evalJs(`[...app.wm.windows.values()].some((w) => w.type === 'vault')`)));
await click('#vault-unlock-dialog .vault-later');
await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 3000 });
await evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
check('the header says locked and offers 解锁… + 修改第二密码… (the change works locked too) + the idle row', (await until(`document.querySelector('.vw-head')?.dataset.state === 'locked'`, { timeout: 15000 })) === true && (await headDoors()) === 'vault-do-unlock,vault-do-change' && (await headIdle()), await headDoors());
check('LOCKED (design q-047 §3.5): the list says so with 解锁… and holds no row; the rail counts say «—»; NO 「添加…」 (the bar is away — nothing greyed)', /locked/.test(await until(`document.querySelector('.vw-locked-box')?.textContent`, { timeout: 8000 }) || '') && (await evalJs(`document.querySelectorAll('.vw-row').length`)) === 0 && (await evalJs(`!!document.querySelector('.vw-locked-box .vw-unlock')`)) && (await evalJs(`[...document.querySelectorAll('.vw-rail .vw-rail-n')].every((n) => n.textContent === '—') && document.querySelectorAll('.vw-rail .vw-rail-item').length >= 10`)) && (await evalJs(`getComputedStyle(document.querySelector('.vw-bar')).display`)) === 'none' && !(await evalJs(visible('.vw-add'))));
await click('.vw-locked-box .vw-unlock');
check('the list\'s 解锁… opens the unlock modal', !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));
await click('#vault-unlock-dialog .vault-later');
await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 3000 });
await headShot('vw-head-2-locked.png');
await click('.vw-head .vault-do-unlock');
check('解锁… from the header opens the unlock modal', !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));
await typeInto('#vault-unlock-pw', SECOND); await click('.vault-unlock-go');
check('the right password ⇒ unlocked, the rows appear in the window', !!(await until(`!document.getElementById('vault-unlock-dialog') && !!document.querySelector(${JSON.stringify(ROW_INT)})`, { timeout: 20000 })));
check('… and the header follows (立即锁定 + 修改第二密码…)', (await until(`document.querySelector('.vw-head')?.dataset.state === 'unlocked'`, { timeout: 5000 })) === true && (await headDoors()) === 'vault-do-lock,vault-do-change', await headDoors());
await evalJs(`window.dispatchEvent(new CustomEvent('vs-vault-door')); true`);
check('unlocked, the door opens the Vault window (still ONE window, no dialog)', !!(await until(`[...app.wm.windows.values()].filter((w) => w.type === 'vault').length === 1 && !document.getElementById('vault-dialog') && !document.getElementById('vault-unlock-dialog')`, { timeout: 3000 })));
await closeVaultWindow();

console.log('⑥b Manage Agents\' Show key… through the page\'s window');
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
await evalJs(`app._showAgentsDialog()`);
const menuSel = `.acct-key-row[data-id="${accId}"] .acct-menu`;
check('Manage Agents lists the API-key account', !!(await until(visible(menuSel), { timeout: 15000 })));
const showKey = async () => { await click(menuSel); await until(`[...document.querySelectorAll('.context-menu-item')].some((e) => /Show key/.test(e.textContent))`, { timeout: 5000 }); return evalJs(`(() => { const e = [...document.querySelectorAll('.context-menu-item')].find((x) => /Show key/.test(x.textContent)); if (!e) return false; e.click(); return true; })()`); };
// lane takeover-surface-census: the ask opens in the click's own task, before any key request (asked after the hub's refusal it
// opened a round trip late — a driven agent browser kept the keys, and the second password went to its page)
await evalJs(`(() => { if (window.__vsKeyGets == null) { window.__vsKeyGets = 0; const f0 = window.fetch; window.fetch = (u, o) => { const p = String(u); if (p.startsWith('/api/accounts/') && p.endsWith('/key')) window.__vsKeyGets++; return f0(u, o); }; } return true; })()`);
check('⋯ ▸ Show key…', await showKey());
check('a fresh page ⇒ 验证是你 first — in the click\'s own task, before any key request', !!(await until(visible('#vault-reveal-dialog'), { timeout: 8000 })) && (await evalJs('window.__vsKeyGets')) === 0, await evalJs('window.__vsKeyGets'));
check('the 验证是你 text says a second tab asks again', /Another tab or window asks again/.test(await evalJs(`document.querySelector('#vault-reveal-dialog .vault-text')?.textContent || ''`)));
const keyShown = `[...document.querySelectorAll('.dialog-overlay input')].some((i) => i.value === ${JSON.stringify(PLANT_KEY)})`;
check('no key on the page before the password', !(await evalJs(keyShown)));
await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
check('the right second password ⇒ the key in Show key…\'s dialog (ONE key request, inside the window)', !!(await until(keyShown, { timeout: 10000 })) && (await evalJs('window.__vsKeyGets')) === 1, await evalJs('window.__vsKeyGets'));
await shot('vw-8-showkey.png');
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => { if ([...o.querySelectorAll('input')].some((i) => i.value)) o.remove(); })`);
check('⋯ ▸ Show key… again', await showKey());
check('… inside the window: the key at once, nothing asked', !!(await until(keyShown, { timeout: 8000 })) && !(await evalJs(`!!document.getElementById('vault-reveal-dialog')`)));
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove())`);

console.log('⑦ a phone (375×812 — design q-047 §3.6)');
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
check('the window opens on a phone with its rows', !!(await openWindow()));
const ph = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(ROW_INT)}).getBoundingClientRect(); const b = document.querySelector(${JSON.stringify(ROW_INT + ' .vw-show')}).getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, bh: b.height }; })()`);
check(`a row fits the screen (${Math.round(ph.l)}…${Math.round(ph.r)} of ${ph.w}) and 「显示」 is a ≥ 36 px target`, ph.l >= 0 && ph.r <= ph.w + 1 && ph.bh >= 36, ph);
check('「显示」 is reachable (on top)', !!(await until(onTop(ROW_INT + ' .vw-show'), { timeout: 5000 })));
const pf = await evalJs(`(() => { const rail = document.querySelector('.vw-rail'); const items = [...rail.querySelectorAll('.vw-rail-item')]; const tops = new Set(items.map((i) => Math.round(i.getBoundingClientRect().top))); const row = document.querySelector(${JSON.stringify(ROW_INT)}); const g = (s) => row.querySelector(s).getBoundingClientRect(); const main = g('.vw-main'), chips = g('.vw-chips'), act = g('.vw-act'); const rr = rail.getBoundingClientRect(); return { items: items.length, tops: tops.size, overflow: getComputedStyle(rail).overflowX, railW: Math.round(rr.width), w: innerWidth, filters: getComputedStyle(document.querySelector('.vw-filters')).display, filterBtn: document.querySelector('.vw-filter-btn').getBoundingClientRect().height, add: document.querySelector('.vw-add').getBoundingClientRect().height, stacked: chips.top >= main.bottom - 1 && act.top >= chips.bottom - 1 }; })()`);
check('THE PHONE COLUMN: the rail is ONE scrolling chip strip; the filters sit behind 筛选… (≥ 36 px, 添加… too); a row stacks — name → chips → value + doors', pf.items >= 10 && pf.tops === 1 && pf.overflow === 'auto' && pf.railW <= pf.w && pf.filters === 'none' && pf.filterBtn >= 36 && pf.add >= 36 && pf.stacked, pf);
await click('.vw-filter-btn');
check('筛选… opens the filters in a modal (sort · where from · only the ones I can show)', !!(await until(visible('#vault-filter-dialog .vw-fchip[data-prov="system"]'), { timeout: 5000 })) && !!(await evalJs(`!!document.querySelector('#vault-filter-dialog .vw-only-shown') && !!document.querySelector('#vault-filter-dialog select')`)));
await click('#vault-filter-dialog .vw-fchip[data-prov="system"]');
check('… a press applies at once: the list behind it follows (the hub\'s own row only)', !!(await until(`(() => { const rows = [...document.querySelectorAll('.vw-list .vw-row')]; return rows.length === 1 && rows[0].dataset.store === 'automation'; })()`, { timeout: 5000 })));
await click('#vault-filter-dialog .vw-fchip[data-prov="system"]');
await click('#vault-filter-dialog .vw-filter-done');
check('… and back: every row, the modal closed', !!(await until(`document.querySelectorAll('.vw-list .vw-row').length === 4 && !document.getElementById('vault-filter-dialog')`, { timeout: 5000 })));
await shot('vw-6-phone.png');
await cdp('Emulation.clearDeviceMetricsOverride');

console.log('⑧ the words in Chinese; the log; the audit');
await evalJs(`localStorage.setItem('vibespace.lang', 'zh')`);
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm)`, { timeout: 30000 });
await splashGone();
await openWindow();
check('「显示」', (await evalJs(`document.querySelector(${JSON.stringify(ROW_INT + ' .vw-show')})?.textContent`)) === '显示');
check('the setup-token row says 「长期 OAuth 令牌」', /长期 OAuth 令牌/.test(await evalJs(`document.querySelector(${JSON.stringify(ROW_OAT + ' .vw-meta')})?.textContent || ''`)));
check('the rail in Chinese: 全部 · 两步验证 · 登录与账号 · 集成与频道 · 机器与中继 · 存储 · 应用登录 · 通行密钥 · 自动化 key · agent 存放', (await evalJs(`[...document.querySelectorAll('.vw-rail .vw-rail-name')].map((e) => e.textContent).join(' · ')`)) === '全部 · 两步验证 · 登录与账号 · 集成与频道 · 机器与中继 · 存储 · 应用登录 · 通行密钥 · 自动化 key · agent 存放');
check('「显示」 on the automation key carries the owner\'s own sentence as its help; the chips read 「hub 铸造 · 从未显示」 / 「我自己」', (await evalJs(`document.querySelector('.vw-row[data-store="automation"] .vw-show')?.title`)) === '显示密钥值——只在要交给外部系统时；内部 agent 按授权使用，不需要看到值' && (await evalJs(`document.querySelector('.vw-row[data-store="automation"] .vw-chip-prov')?.textContent`)) === 'hub 铸造 · 从未显示' && (await evalJs(`document.querySelector(${JSON.stringify(rowKey(accId) + ' .vw-chip-prov')})?.textContent`)) === '我自己');
await click(ROW_INT + ' .vw-show');
check('「验证是你」', (await until(`document.querySelector('#vault-reveal-dialog h3')?.textContent`, { timeout: 5000 })) === '验证是你');
await shot('vw-7-zh.png');
const log = fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8');
const audit = fs.readFileSync(path.join(DATA, 'vault-audit.jsonl'), 'utf8');
check('no value and no password in the server log or the audit', ![PLANT_INT, PLANT_KEY, RAND, SECOND, 'not the second password'].some((v) => log.includes(v) || audit.includes(v)));
check('the audit holds the reveals (vault-reveal: who / ip / entry)', audit.split('\n').filter((l) => l.includes('"event":"vault-reveal"')).length >= 3 && /"entry":"cloud:browserless"/.test(audit));

console.log('⑨ 立即锁定 from the header (lane vault-one-door; zh)');
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);
check('the header\'s words in Chinese: 「已解锁」, 「立即锁定」, 「修改第二密码…」', (await until(`document.querySelector('.vw-head .vw-state')?.textContent === '已解锁'`, { timeout: 5000 })) === true && (await evalJs(`[...document.querySelectorAll('.vw-head .vault-actions button')].map((b) => b.textContent).join('|')`)) === '立即锁定|修改第二密码…');
await headShot('vw-head-3-unlocked-zh.png');
await click('.vw-head .vault-do-lock');
check('立即锁定 locks the vault — a lock signs every login out: the page lands on the sign-in', !!(await until(`location.pathname === '/login'`, { timeout: 20000 })));
const relogin9 = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
// lane vault-locked-loud: 立即锁定 is a LOCK ACT — the hub filed THE urgent For-you item at that moment (nobody refused yet),
// and the load behind the new sign-in asks at once (a NEW lock: an earlier 「稍后」 set aside another one), the ⚙ red
const items9 = ((((await api('GET', '/api/user-todos')).json || {}).todos || {}).open || []).filter((i) => i.sessionKey === 'vault' && i.action && i.action.type === 'vault-unlock');
check('⑨L lane vault-locked-loud: the lock act filed THE urgent For-you item at once — an action row, urgent, the lock\u2019s own words (no refusal yet)', relogin9 === 200 && items9.length === 1 && items9[0].kind === 'action' && items9[0].urgency === 'urgent' && items9[0].i18n?.text?.key === 'The vault is locked \u2014 agents that need a credential will be refused until you unlock it. Enter the second password to unlock.', items9.map((i) => ({ kind: i.kind, urgency: i.urgency, i18n: i.i18n })));
await cdp('Page.navigate', { url: URL });
// wait-for-effect, staged (lane vault-unlock-modal-race): the same shape as ⑥a — the on-load unlock modal is gated behind
// the serial /api/home → /api/vault/state boot, so wait for the /api/home pass (app._localHome), then the modal's OWN 10 s.
const bootedRelock = await until(`!!(window.app && app.wm && app._localHome)`, { timeout: 45000 });
check('⑨L the load after the lock asks at once — the unlock dialog (a new lock is a new ask)', !!(bootedRelock && (await until(visible('#vault-unlock-dialog'), { timeout: 10000 }))), bootedRelock ? 'the unlock modal did not open within 10 s of the load reading the vault state' : 'the page did not finish its /api/home boot pass within 45 s of the load');
check('⑨L … the ⚙ wears the red mark (its title in Chinese: 「保险库已锁定——点击解锁（「待你处理」里写明了在等它的事）」 — the chip\'s full words since int332) and the tray badge is urgent', !!(await until(`(() => { const b = document.getElementById('btn-global-settings'); const t = document.getElementById('taskbar-user-todos'); return !!b.querySelector('.vault-gear-mark') && b.classList.contains('vault-locked') && b.title === '保险库已锁定——点击解锁（「待你处理」里写明了在等它的事）' && t && t.dataset.urgency === 'urgent' && !!t.querySelector('.ut-seg-urgent'); })()`, { timeout: 8000 })), await evalJs(`({ title: document.getElementById('btn-global-settings').title, urgency: document.getElementById('taskbar-user-todos')?.dataset.urgency })`));
await splashGone();
await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); app.replayOpenSpec({ action: 'openVault' }); true`);
check('signed in again: the hub says locked; the window lists nothing and says so (「解锁…」 in its header)', relogin9 === 200 && (await api('GET', '/api/vault/state')).json?.state === 'locked' && (await until(`document.querySelector('.vw-head')?.dataset.state === 'locked'`, { timeout: 15000 })) === true && (await evalJs(`document.querySelectorAll('.vw-row').length`)) === 0 && (await evalJs(`document.querySelector('.vw-head .vault-do-unlock')?.textContent`)) === '解锁…');
await headShot('vw-head-4-locked-zh.png');

console.log('⑩ SAY THE WAIT (lane vault-slow-load — inc-mvk5jyv3; zh): from the press to the answer, never a blank second');
{
  // (globalThis.URL below: the suite's own `URL` is the hub's address)
  const hold = (...pats) => { autoGo = false; return cdp('Fetch.enable', { patterns: pats.map((u) => ({ urlPattern: u, requestStage: 'Request' })) }); };
  const heldOf = async (pathname, ms = 15000) => { const t0 = Date.now(); for (;;) { const i = paused.findIndex((p) => { const u = new globalThis.URL(p.request.url).pathname; return pathname instanceof RegExp ? pathname.test(u) : u === pathname; }); if (i >= 0) return paused.splice(i, 1)[0]; if (Date.now() - t0 > ms) return null; await sleep(50); } };
  const release = (p) => (p ? cdp('Fetch.continueRequest', { requestId: p.requestId }) : null);
  const unhold = async () => { autoGo = true; for (const p of paused.splice(0)) await release(p); await cdp('Fetch.disable'); autoGo = false; };
  const waitOf = (scope) => evalJs(`(() => { const w = document.querySelector(${JSON.stringify(scope + ' .vault-wait')}); return w ? { text: w.textContent, spin: !!w.querySelector('.vault-spin'), role: w.getAttribute('role'), shown: w.getBoundingClientRect().height > 0 } : null; })()`);
  // 解锁 (the vault is locked since ⑨): its button and the dialog say the step while the answer is out
  await hold('*/api/vault/unlock');
  await click('.vw-head .vault-do-unlock');
  await until(visible('#vault-unlock-dialog'), { timeout: 5000 });
  await typeInto('#vault-unlock-pw', SECOND); await click('.vault-unlock-go');
  const heldUnlock = await heldOf('/api/vault/unlock');
  await sleep(400);
  const wU = await waitOf('#vault-unlock-dialog');
  const goU = await evalJs(`(() => { const b = document.querySelector('.vault-unlock-go'); return b ? { text: b.textContent, disabled: b.disabled } : null; })()`);
  check('⑩ 解锁 held: the button is disabled and says 「正在解锁…」', !!heldUnlock && goU && goU.disabled === true && goU.text === '正在解锁…', { held: !!heldUnlock, goU });
  check('⑩ … and the dialog says the step: a spinner + 「正在核对第二密码…」 (role=status) — not a blank second', !!wU && wU.shown && wU.spin && wU.role === 'status' && wU.text === '正在核对第二密码…', wU);
  await release(heldUnlock);
  check('⑩ the answer ⇒ unlocked, the dialog closes (the line goes with it)', !!(await until(`!document.getElementById('vault-unlock-dialog') && document.querySelector('.vw-head')?.dataset.state === 'unlocked'`, { timeout: 20000 })));
  await unhold();
  await closeVaultWindow();
  await sleep(300);
  // the window's OPEN: the list held 700 ms
  await hold('*/api/vault/contents');
  const t0 = await evalJs(`(() => { const t = performance.now(); app.replayOpenSpec({ action: 'openVault' }); return t; })()`);   // its reads start inside the call
  const heldList = await heldOf('/api/vault/contents');
  await sleep(700);
  const wL = await waitOf('.vw-list');
  const early = await evalJs(`performance.getEntriesByType('resource').filter((e) => e.startTime >= ${t0}).map((e) => new URL(e.name).pathname)`);
  check('⑩ the open, the list held: it SAYS 「正在读取保险库…」 with a spinner (the owner\'s blank list on a busy hub)', !!heldList && !!wL && wL.shown && wL.spin && wL.text === '正在读取保险库…', wL);
  check('⑩ … the keys\' grants were asked WHILE the list is out (one round trip, not two)', early.includes('/api/automation/keys'), early);
  await release(heldList);
  check('⑩ the answer ⇒ the rows, and the wait line is gone', !!(await until(`!!document.querySelector(${JSON.stringify(ROW_INT)}) && !document.querySelector('.vw-list .vault-wait')`, { timeout: 15000 })));
  await unhold();
  await sleep(600);
  const opened = await evalJs(`performance.getEntriesByType('resource').filter((e) => e.startTime >= ${t0}).map((e) => new URL(e.name).pathname + new URL(e.name).search)`);
  check('⑩ the window loads what it shows: the open never asks the chat accounts (/api/channels)', opened.includes('/api/vault/contents') && !opened.some((u) => u.startsWith('/api/channels')), opened);
  const ring = await evalJs(`typeof window.__vsFetchTimings === 'function' ? window.__vsFetchTimings() : null`);
  const listT = Array.isArray(ring) ? ring.filter((r) => r.route === '/api/vault/contents').pop() : null;
  check('⑩ the page\'s request ring (what an incident snapshot carries) has the held list\'s real wait — route + ms, no query', !!listT && listT.ms >= 600 && Object.keys(listT).join() === 'at,route,ms' && ring.length <= 20 && ring.every((r) => !/[?#]/.test(r.route)), { listT, n: ring && ring.length });
  // 验证是你 and 显示全部
  const showWord = await evalJs(`document.querySelector('.vw-show-all')?.textContent || ''`);
  await hold('*/api/vault/reveal-session', '*/api/vault/reveal');
  await click('.vw-show-all');
  await until(visible('#vault-reveal-dialog'), { timeout: 5000 });
  await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
  const heldRs = await heldOf('/api/vault/reveal-session');
  await sleep(300);
  const wR = await waitOf('#vault-reveal-dialog');
  const goR = await evalJs(`(() => { const b = document.querySelector('.vault-reveal-go'); return b ? { text: b.textContent, disabled: b.disabled } : null; })()`);
  check('⑩ 验证是你 held: 「正在验证…」 on the disabled button, 「正在核对第二密码…」 in the dialog', !!heldRs && goR && goR.disabled && goR.text === '正在验证…' && !!wR && wR.spin && wR.text === '正在核对第二密码…', { goR, wR });
  await release(heldRs);
  const heldRv = await heldOf('/api/vault/reveal');
  await sleep(200);
  const prog = await evalJs(`document.querySelector('.vw-show-all')?.textContent || ''`);
  check('⑩ 显示全部 counts its reveals: 「正在显示 1 / N…」 while the first is out', !!heldRv && /^正在显示 1 \/ \d+…$/.test(prog), prog);
  await release(heldRv);
  await unhold();
  check('⑩ … and says its own word again (「全部显示」) once every value is in', showWord === '全部显示' && !!(await until(`document.querySelector('.vw-show-all')?.textContent === ${JSON.stringify(showWord)} && document.querySelectorAll('.vw-row.vw-open').length >= 3`, { timeout: 20000 })), { showWord, now: await evalJs(`document.querySelector('.vw-show-all')?.textContent`) });
  // 审计… of the automation key
  await hold('*/api/automation/keys/*/audit*');
  await evalJs(`(() => { const b = document.querySelector('.vw-row[data-store="automation"] .vw-ak-audit'); if (b) b.click(); return !!b; })()`);
  const heldAu = await heldOf(/^\/api\/automation\/keys\/[^/]+\/audit$/);
  await sleep(300);
  const wA = await waitOf('#vault-ak-audit');
  check('⑩ 审计… held: the dialog says 「正在读取审计记录…」 with a spinner', !!heldAu && !!wA && wA.spin && wA.text === '正在读取审计记录…', { held: !!heldAu, wA });
  await release(heldAu);
  check('⑩ … the answer replaces it (the lines, or «none yet»)', !!(await until(`!document.querySelector('#vault-ak-audit .vault-wait') && !!document.querySelector('#vault-ak-audit .vw-ak-audit-line, #vault-ak-audit .vw-empty')`, { timeout: 10000 })));
  await unhold();
  await shot('vw-10-waits-zh.png');
}

await stopServer();
console.log(failed ? `\nFAILED (${passed} passed, ${failed} failed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
