#!/usr/bin/env node
// 添加… ▸ 两步验证… IN A REAL PAGE (heavy, chrome — lane vault-totp-add, design q-047 §3's mock: the L2 the owner found missing
// 2026-10-26 「我似乎不能添加两步验证在vault里」). A worktree hub with NO sign-in password (a lock leaves the page open — the locked
// leg needs it; with a sign-in every lock signs the page out), a real vault, a headless Chrome, the built bundle. Every seed is
// BUILT AT RUN TIME (random) and never printed:
//   ① the vault set up from the page (unlocked)
//   ② 添加… lists 两步验证… in the kind registry's order (after Channel account…); it opens ONE dialog: two ways (粘贴 otpauth 链接
//      first), the link field and the seed field MASKED with a 显示 toggle, NO 保存 before a preview, nothing greyed
//   ③ THE LINK WAY: a bad link ⇒ its words, no 保存; a known otpauth link ⇒ the facts (GitHub · owner@example.com · 6 digits ·
//      every 30 s · SHA1), the name github-owner; 预览 ⇒ THE CODE PURE src/totp.js computes for that seed at that second
//      (within the period), its ring and seconds — and the hub stored nothing; 保存 ⇒ the dialog closes, the toast, the row
//      under 两步验证 (the rail counts it) that FITS the default 980-px window (用于… and 删除 inside, no sideways scroll), 看码 =
//      the PURE code; the seed in no markup and no field afterwards
//   ④ THE SEED WAY: the seed as people paste it (lower case, spaces) — no name ⇒ 「Give the code a name」; a name + 高级
//      (8 digits, SHA256) ⇒ the preview = PURE's 8-digit SHA256 code; a change after the preview ⇒ 保存 goes; saved ⇒ its
//      row, 看码 = PURE; a name taken ⇒ the exists words, no 保存
//   ⑤ LOCKED under the open dialog ⇒ 预览 says locked + 「解锁…」 (the unlock modal; unlocked ⇒ the preview works again);
//      ✕ with a typed link ⇒ the unsaved guard asks; 放弃 closes and wipes
//   ⑤b (acceptance r2) THE STEP BUDGET: the page's 1-s dialog tick runs at 50 ms and every preview answers 0 s left (the
//      code stays the hub's), so each tick is a step: 预览 ⇒ 10 automatic re-asks, then the code hides and nothing more is
//      asked; 预览 again ⇒ 10 MORE (a person's 预览 restarts the budget — the row's 看码 does). A CLICK WHILE AN ASK IS ON
//      THE WIRE (an automatic re-ask HELD in the page): 预览 says «Previewing…» and joins it (no second ask); 保存 says
//      «Saving…» and saves when it settles (one save — the dialog closes, the row, the toast) — never a silent nothing
//   ⑥ 网站登录…'s two-step field lists the vault's codes (the three new ones) — lane vault-2fa-pick: in ITS OWN list (no native
//      <datalist>, which the owner read as the browser's suggestion): a press in the field opens it headed, a row per code by
//      name; a press on a row (THE still door) and ↓ Enter each fill the field; Escape closes the list and the dialog stays;
//      a typed name that lists nothing is said under the field at once; ⑥b a phone (375 × 812): the dialog fits the screen,
//      every press target ≥ 36 px, the seed field 16 px
//   ⑦ the zh words (the menu's 两步验证…, the dialog's title and ways, a refusal); no seed in the hub's log; the audit has
//      the three adds (vault-totp-add, paste + manual + manual) and no seed
//   RED CONTROL: the base tree (bbca26b4) under this suite reds at ② — no 两步验证… door in 添加… (the gap the owner found);
//   the lane's first commit (e055630e) reds at ⑤b — a manual 预览 after the budget showed one step, a click during a re-ask did nothing.
// Run: node scripts/test-vault-totp-add-chrome.mjs [--shots <dir>]   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, CHROME_STORE, stillPresser, CHROME_QUIET } from './scratch.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vtotp-add-wt'), PROFILE = scratch('vtotp-add-chrome'), FIXTURE = scratch('vtotp-add-canonical');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('vtotp-add-shots');
for (const d of [SHOTS, FIXTURE]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECOND = 'two-step add leg second password';
const T = require(path.join(repo, 'src/totp.js'));
const hmac = (a, k, m) => crypto.createHmac(String(a).toLowerCase(), k).update(m).digest();
// THE SEEDS — random, built here, never printed (a check that fails prints the page's words, never a field's value)
const SEED = T.base32Encode(crypto.randomBytes(20)), SEED2 = T.base32Encode(crypto.randomBytes(20)), SEED3 = T.base32Encode(crypto.randomBytes(20));
const LINK = `otpauth://totp/GitHub:owner%40example.com?secret=${SEED}&issuer=GitHub`;
/** The codes PURE computes for `seed` over [t0 − 1 s, t1 + 1 s] — the code the page showed was asked for inside it. */
const codesBetween = (seed, t0, t1, { digits = 6, period = 30, algorithm = 'SHA1' } = {}) => {
  const k = T.base32Decode(seed);
  const out = new Set();
  for (let t = t0 - 1000; t <= t1 + 1000; t += 500) out.add(T.totp(k.bytes, { now: t, digits, period, algorithm, hmac }).code);
  return out;
};

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
let srv = null;
const LOG = path.join(SHOTS, 'server.log');
const srvLog = fs.openSync(LOG, 'a');
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: ['ignore', srvLog, srvLog] }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/vault/state`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(300); } };
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
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
target = await waitPageTarget(CDP_PORT, { polls: 80, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
const URL = `http://127.0.0.1:${PORT}/`;
const api = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))`);
const typeInto = (sel, text) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const pick = (sel, value) => evalJs(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return false; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value === ${JSON.stringify(value)}; })()`);
const click = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); })()`;
const textOf = (sel) => evalJs(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const splashGone = () => until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
/** every place a value could show on the page: the markup, the rendered text, every field's value */
const pageText = () => evalJs(`document.documentElement.outerHTML + '\\n' + (document.body ? document.body.innerText : '') + '\\n' + [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('\\n')`);
const openWindow = async () => { await evalJs(`app.replayOpenSpec({ action: 'openVault' })`); return until(visible('.vw-add'), { timeout: 15000 }); };
const menuItems = () => until(`(() => { const m = [...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent); return m.length ? m : null; })()`, { timeout: 4000 });
const pickMenu = (label) => evalJs(`(() => { const m = [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent === ${JSON.stringify(label)}); if (m) m.click(); return !!m; })()`);
const D = '.vault-totp-add-dialog';
const openAdd = async (label = 'Two-step code…') => { await click('.vw-add'); await menuItems(); const hit = await pickMenu(label); return hit && !!(await until(visible(D), { timeout: 5000 })); };
const err = () => textOf(`${D} .vt-err`);
const saveShown = () => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(D + ' .vt-save')}); return !!b && !b.hidden; })()`);
const shownCode = () => until(`(() => { const c = document.querySelector(${JSON.stringify(D + ' .vt-code')}); const d = c && !c.hidden ? c.querySelector('.vw-code-digits').textContent : ''; return d ? d : null; })()`, { timeout: 10000 });
const toasts = () => evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((t) => t.textContent).join(' | ')`);
const viewCode = async (rowSel) => { await click(`${rowSel} .vw-code-view`); return until(`(() => { const d = document.querySelector(${JSON.stringify(rowSel + ' .vw-code-digits')})?.textContent || ''; return d ? d : null; })()`, { timeout: 8000 }); };
const flat = (s) => String(s || '').replace(/\s+/g, '');

startServer();
check('the hub boots (no sign-in password: a lock leaves the page open)', verdictOf(await ready()));

console.log('① the vault, set up from the page');
await cdp('Page.navigate', { url: URL + 'api/vault/state' });
await until(`document.readyState === 'complete'`);
const su = await api('POST', '/api/vault/setup', { password: SECOND });
check('the second password is set (unlocked)', su.status === 200 && gateOf(su.json) && su.json.state === 'unlocked', su);
await cdp('Page.navigate', { url: URL });
check('the app loads', !!(await until(`!!(window.app && app.wm && app._localHome)`, { timeout: 45000 })));
await splashGone();

console.log('② 添加… ▸ 两步验证… — the door (the kind registry\'s order) and ONE dialog');
check('the Vault window opens with its bar (unlocked ⇒ 添加…)', !!(await openWindow()));
await click('.vw-add');
const items = await menuItems();
check('添加… lists 两步验证… after Channel account… — the registry\'s order: Account… · Integration key… · Channel account… · Two-step code… · Automation key… · Website login… · Other key or password… · File…', !!items && items.join('|') === 'Account…|Integration key…|Channel account…|Two-step code…|Automation key…|Website login…|Other key or password…|File…', items);
await shot('vt-0-menu.png');
const opened = (await pickMenu('Two-step code…')) && !!(await until(visible(D), { timeout: 5000 }));
check('两步验证… opens its dialog', verdictOf(opened));
if (!opened) { console.error(`\n${failed} FAILED, ${passed} passed — no dialog to walk (a tree without the 两步验证… door)`); process.exit(1); }
const d0 = await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(D)}); return { title: d.querySelector('.dialog-header h3').textContent, ways: [...d.querySelectorAll('.vt-way')].map((b) => [b.dataset.way, b.textContent, b.classList.contains('on')]), link: d.querySelector('.vt-link').type, seed: d.querySelector('.vt-seed').type, seedPane: d.querySelector('.vt-pane-seed').hidden, save: d.querySelector('.vt-save').hidden, reveal: d.querySelectorAll('.vt-reveal').length, greyed: d.querySelectorAll('[disabled]').length }; })()`);
check('the dialog: «Add a two-step code», TWO ways (Paste an otpauth link — picked — · Type the seed)', d0.title === 'Add a two-step code' && JSON.stringify(d0.ways) === JSON.stringify([['link', 'Paste an otpauth link', true], ['seed', 'Type the seed', false]]) && d0.seedPane === true, d0);
check('the link field and the seed field are MASKED (type password), each with its own 显示 toggle', d0.link === 'password' && d0.seed === 'password' && d0.reveal === 2, d0);
check('NO 保存 before a preview — and nothing greyed (no disabled control)', d0.save === true && d0.greyed === 0, d0);

console.log('③ the link way');
await typeInto(`${D} .vt-link`, 'https://example.com/not-an-otpauth-link');
check('a bad link ⇒ its words (bad_uri), no 保存', gateOf(/not an otpauth:\/\/totp\/ link/.test(await err() || '')) && !(await saveShown()), await err());
await typeInto(`${D} .vt-link`, LINK);
const facts = await until(`(() => { const f = document.querySelector(${JSON.stringify(D + ' .vt-facts')}); return f && !f.hidden ? f.textContent : null; })()`, { timeout: 3000 });
check('a known link ⇒ its FACTS read-only: GitHub · owner@example.com · 6 digits · every 30 s · SHA1; the refusal gone', facts === 'GitHub · owner@example.com6 digits · every 30 s · SHA1' && !(await err()), facts);
check('… and the name from them: github-owner', (await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-name')}).value`)) === 'github-owner');
await click(`${D} .vt-pane-link .vt-reveal`);
const shownType = await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-link')}).type`);
await click(`${D} .vt-pane-link .vt-reveal`);
check('显示 shows the link in its field; again ⇒ masked', shownType === 'text' && (await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-link')}).type`)) === 'password', shownType);
const tA = Date.now();
await click(`${D} .vt-preview-b`);
const c1 = await shownCode();
const tB = Date.now();
check('预览 ⇒ THE CODE PURE src/totp.js makes for that seed at that second (3 + 3 digits)', !!c1 && gateOf(/^\d{3} \d{3}$/.test(c1)) && verdictOf(codesBetween(SEED, tA, tB).has(flat(c1))), c1 ? 'the page showed another code' : 'no code');
const ringNow = await evalJs(`(() => { const c = document.querySelector(${JSON.stringify(D + ' .vt-code')}); return { left: c.querySelector('.vw-code-left').textContent, p: c.querySelector('.vw-ring').style.getPropertyValue('--p') }; })()`);
check('… with its ring and its seconds left', gateOf(/^\d{1,2} s$/.test(ringNow.left)) && verdictOf(/^\d{1,3}%$/.test(ringNow.p)), ringNow);
check('… and 保存 is drawn now', verdictOf(await saveShown()));
const listed0 = await api('GET', '/api/vault/totp');
check('the preview stored NOTHING (the vault lists no two-step entry)', listed0.status === 200 && gateOf(Array.isArray(listed0.json.entries)) && listed0.json.entries.length === 0, listed0.json && listed0.json.entries);
await shot('vt-1-link-preview.png');
await click(`${D} .vt-save`);
check('保存 ⇒ the dialog closes', !!(await until(`!document.querySelector(${JSON.stringify(D)})`, { timeout: 8000 })));
check('… the toast: Added “github-owner” — View code shows its current code', verdictOf(/Added “github-owner” — View code shows its current code/.test(await until(`(() => { const t = [...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | '); return /Added/.test(t) ? t : null; })()`, { timeout: 5000 }) || '')), await toasts());
const ROW1 = '.vw-row[data-id="secrets:totp:github-owner#seed"]';
const r1 = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW1)}); if (!r) return null; return { purpose: r.dataset.purpose, view: !!r.querySelector('.vw-code-view'), rail: document.querySelector('.vw-rail-item[data-purpose="two-step"] .vw-rail-n')?.textContent }; })()`, { timeout: 8000 });
check('the window refreshed: the row under 两步验证 with 看码, the rail counts 1', !!r1 && r1.purpose === 'two-step' && gateOf(r1.view) && r1.rail === '1', r1);
const fit = await evalJs(`(() => { const l = document.querySelector('.vw-list'), r = document.querySelector(${JSON.stringify(ROW1)}), del = r.querySelector('.vw-del'), use = r.querySelector('.vw-totp-grant'); const L = l.getBoundingClientRect(), D = del.getBoundingClientRect(), U = use.getBoundingClientRect(); return { sideways: l.scrollWidth - l.clientWidth, delIn: D.right <= L.right + 0.5 && D.width > 0, useIn: U.right <= L.right + 0.5 && U.width > 0 }; })()`);
check('the two-step row FITS the window\'s default 980 px: 用于… and 删除 inside the list, nothing scrolls sideways', fit.sideways <= 1 && gateOf(fit.delIn) && verdictOf(fit.useIn), fit);
const tC = Date.now();
const v1 = await viewCode(ROW1);
check('看码 = the PURE code for that seed now', !!v1 && verdictOf(codesBetween(SEED, tC, Date.now()).has(flat(v1))), v1 ? 'another code' : 'no code');
await evalJs(`document.querySelector(${JSON.stringify(ROW1)}).scrollIntoView({ block: 'center' }); true`);
await shot('vt-2-row-saved.png');
check('THE SEED IS NOWHERE in the page: no markup, no text, no field holds it (the dialog wiped its fields)', !(await pageText()).includes(SEED));

console.log('④ the seed way');
check('the dialog again', verdictOf(await openAdd()));
await click(`${D} .vt-way[data-way="seed"]`);
const panes = await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(D)}); return [d.querySelector('.vt-pane-link').hidden, d.querySelector('.vt-pane-seed').hidden, d.querySelector('.vt-way[data-way="seed"]').classList.contains('on')]; })()`);
check('输入密钥: its pane shows, the link\'s hides', JSON.stringify(panes) === '[true,false,true]', panes);
const pasted = SEED2.toLowerCase().replace(/(.{4})/g, '$1 ').trim();
await typeInto(`${D} .vt-seed`, pasted);
await click(`${D} .vt-preview-b`);
check('no name ⇒ 「Give the code a name」 (required, never guessed), no 保存', (await until(`document.querySelector(${JSON.stringify(D + ' .vt-err')})?.textContent === 'Give the code a name'`, { timeout: 3000 })) === true && !(await saveShown()), await err());
await typeInto(`${D} .vt-name`, 'bank-login');
await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-adv')}).open = true; true`);
const defaults = await evalJs(`[...document.querySelectorAll(${JSON.stringify(D + ' .vt-set')})].map((s) => s.value).join()`);
check('高级: the standard\'s defaults (6 digits · 30 s · SHA1)', defaults === '6,30,SHA1', defaults);
check('… set to 8 digits and SHA256', (gateOf(await pick(`${D} .vt-digits`, '8'))) && (verdictOf(await pick(`${D} .vt-algo`, 'SHA256'))));
const tD = Date.now();
await click(`${D} .vt-preview-b`);
const c2 = await shownCode();
check('预览 ⇒ PURE\'s 8-digit SHA256 code for the pasted seed (lower case, spaces — the same seed)', !!c2 && gateOf(/^\d{4} \d{4}$/.test(c2)) && verdictOf(codesBetween(SEED2, tD, Date.now(), { digits: 8, algorithm: 'SHA256' }).has(flat(c2))), c2 ? 'another code' : 'no code');
await shot('vt-3-seed-preview.png');
await typeInto(`${D} .vt-name`, 'bank-login-2');
check('a change after the preview ⇒ 保存 goes (the preview no longer speaks for the dialog)', !(await saveShown()) && (await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-code')}).hidden`)) === true);
await typeInto(`${D} .vt-name`, 'bank-login');
await click(`${D} .vt-preview-b`);
check('… previewed again ⇒ 保存 is back', !!(await shownCode()) && (verdictOf(await saveShown())));
await click(`${D} .vt-save`);
check('saved ⇒ the dialog closes', !!(await until(`!document.querySelector(${JSON.stringify(D)})`, { timeout: 8000 })));
const ROW2 = '.vw-row[data-id="secrets:totp:bank-login#seed"]';
check('… its row under 两步验证 (the rail counts 2)', !!(await until(`!!document.querySelector(${JSON.stringify(ROW2)}) && document.querySelector('.vw-rail-item[data-purpose="two-step"] .vw-rail-n')?.textContent === '2'`, { timeout: 8000 })));
const tE = Date.now();
const v2 = await viewCode(ROW2);
check('看码 = PURE\'s 8-digit SHA256 code', !!v2 && verdictOf(codesBetween(SEED2, tE, Date.now(), { digits: 8, algorithm: 'SHA256' }).has(flat(v2))), v2 ? 'another code' : 'no code');
check('a name taken: the dialog again', verdictOf(await openAdd()));
await typeInto(`${D} .vt-link`, LINK);
await click(`${D} .vt-preview-b`);
check('… the same link (github-owner) ⇒ «already in the vault — pick another name», no code, no 保存', gateOf(/A two-step code named “github-owner” is in the vault already/.test(await until(`document.querySelector(${JSON.stringify(D + ' .vt-err')})?.textContent || null`, { timeout: 5000 }) || '')) && !(await saveShown()), await err());

console.log('⑤ locked under the open dialog');
await typeInto(`${D} .vt-name`, 'github-two');
const lk = await api('POST', '/api/vault/lock');
check('the vault locks (the lock door — no sign-in here, so the page stays)', lk.status === 200 && gateOf(lk.json) && lk.json.state === 'locked', lk);
await sleep(400);
check('… the dialog is still open', !!(await evalJs(visible(D))));
await click(`${D} .vt-preview-b`);
check('预览 ⇒ «The vault is locked — unlock it first, then preview again» + 「解锁…」 — words, never a greyed button', (await until(`document.querySelector(${JSON.stringify(D + ' .vt-err')})?.textContent === 'The vault is locked — unlock it first, then preview again'`, { timeout: 5000 })) === true && !!(await evalJs(visible(`${D} .vt-unlock`))) && !(await saveShown()), await err());
await shot('vt-4-locked.png');
await click(`${D} .vt-unlock`);
check('解锁… opens the unlock modal', !!(await until(visible('#vault-unlock-dialog'), { timeout: 5000 })));
await typeInto('#vault-unlock-pw', SECOND); await click('#vault-unlock-dialog .vault-unlock-go');
check('… unlocked', !!(await until(`!document.getElementById('vault-unlock-dialog')`, { timeout: 15000 })) && (await api('GET', '/api/vault/state')).json.state === 'unlocked');
await click(`${D} .vt-preview-b`);
check('预览 again ⇒ the code; the 解锁… door gone', !!(await shownCode()) && !(await evalJs(visible(`${D} .vt-unlock`))));
await click(`${D} .dialog-close`);
check('✕ with a typed link ⇒ the unsaved guard asks', !!(await until(visible(`${D} .dialog-unsaved`), { timeout: 3000 })));
await click(`${D} .dialog-unsaved-discard`);
check('放弃 ⇒ the dialog closes; nothing was added (still 2); no field holds a seed', !!(await until(`!document.querySelector(${JSON.stringify(D)})`, { timeout: 3000 })) && (await api('GET', '/api/vault/totp')).json.entries.length === 2 && !(await pageText()).includes(SEED));

console.log('⑤b the step budget; a click while an ask is on the wire (acceptance r2)');
check('the dialog again (the seed way, «paced-code»)', verdictOf(await openAdd()));
await click(`${D} .vt-way[data-way="seed"]`);
await typeInto(`${D} .vt-seed`, SEED3);
await typeInto(`${D} .vt-name`, 'paced-code');
// IN THE PAGE: the hub's two-step POSTs counted (a preview may be HELD), every preview answers 0 s left (each tick is a step),
// and the dialog's own 1-s tick (the one that reads visibilityState) runs at 50 ms — the codes stay the hub's
await evalJs(`(() => { const v = window.__vt = { fetch: window.fetch, si: window.setInterval, previews: 0, saves: 0, holdFrom: Infinity, held: [] };
  const zero = (res) => res.clone().json().then((j) => { if (j && j.preview === true) j.secondsLeft = 0; return new Response(JSON.stringify(j), { status: res.status, headers: { 'Content-Type': 'application/json' } }); }, () => res);
  window.fetch = function (u, o) {
    if (String(u).endsWith('/api/vault/totp') && o && o.method === 'POST') {
      const pv = /"preview":true/.test(String(o.body || ''));
      if (!pv) { v.saves++; return v.fetch.call(window, u, o); }
      v.previews++;
      const go = () => v.fetch.call(window, u, o).then(zero);
      if (v.previews >= v.holdFrom) return new Promise((res, rej) => v.held.push(() => go().then(res, rej)));
      return go();
    }
    return v.fetch.apply(window, arguments);
  };
  window.setInterval = (fn, ms, ...a) => v.si.call(window, fn, ms === 1000 && /visibilityState/.test(String(fn)) ? 50 : ms, ...a);
  return true; })()`);
const vt = () => evalJs(`(() => { const v = window.__vt, d = document.querySelector(${JSON.stringify(D)}); return { previews: v.previews, saves: v.saves, held: v.held.length, open: !!d, code: !!d && !d.querySelector('.vt-code').hidden, save: !!d && !d.querySelector('.vt-save').hidden, prevB: d ? d.querySelector('.vt-preview-b').textContent : null, saveB: d ? d.querySelector('.vt-save').textContent : null }; })()`);
await click(`${D} .vt-preview-b`);
const b1 = await until(`(() => { const v = window.__vt, c = document.querySelector(${JSON.stringify(D + ' .vt-code')}); return v.previews >= 11 && c.hidden ? v.previews : null; })()`, { timeout: 15000 });
await sleep(500);
const b1x = await vt();
check('预览 ⇒ the code, then 10 automatic re-asks (one per step) — then the code hides and nothing more is asked; 保存 stays', b1 === 11 && b1x.previews === 11 && !b1x.code && verdictOf(b1x.save), { at: b1, now: b1x });
await click(`${D} .vt-preview-b`);
const b2 = await until(`(() => { const v = window.__vt, c = document.querySelector(${JSON.stringify(D + ' .vt-code')}); return v.previews >= 22 && c.hidden ? v.previews : null; })()`, { timeout: 15000 });
await sleep(500);
const b2x = await vt();
check('预览 AGAIN after the budget ⇒ the code and 10 MORE re-asks (a person\'s 预览 restarts the budget, as 看码 does) — not one step', b2 === 22 && b2x.previews === 22 && !b2x.code, { at: b2, now: b2x });
// an automatic re-ask HELD on the wire
await evalJs(`window.__vt.holdFrom = window.__vt.previews + 2; true`);
await click(`${D} .vt-preview-b`);
const h0 = await until(`(() => { const v = window.__vt; return v.held.length === 1 ? v.previews : null; })()`, { timeout: 10000 });
check('预览 ⇒ the code; the next step\'s re-ask is on the wire (held in the page)', h0 === 24 && verdictOf((await vt()).code), await vt());
await click(`${D} .vt-preview-b`);
const j1 = await vt();
check('检查验证码 while that re-ask is on the wire ⇒ «Checking the code…» on the button, and it JOINS the ask (no second one)', j1.prevB === 'Checking the code…' /* lane ui-plain-words closure F40: the button's own words */ && j1.previews === 24 && j1.held === 1, j1);
await click(`${D} .vt-save`);
const q1 = await vt();
check('保存 while it is on the wire ⇒ «Saving…» on the button — it waits (no save sent yet), the dialog open: never a silent nothing', q1.saveB === 'Saving…' && q1.saves === 0 && verdictOf(q1.open), q1);
await shot('vt-4b-pending.png');
await evalJs(`(() => { const v = window.__vt; v.holdFrom = Infinity; v.held.splice(0).forEach((f) => f()); return true; })()`);
check('the re-ask answers ⇒ the waiting 保存 saves (ONE save) and the dialog closes', !!(await until(`!document.querySelector(${JSON.stringify(D)})`, { timeout: 8000 })) && (await evalJs('window.__vt.saves')) === 1);
check('… the toast and the row «paced-code» under 两步验证 (the rail counts 3)', gateOf(/Added “paced-code”/.test(await until(`(() => { const t = [...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | '); return /paced-code/.test(t) ? t : null; })()`, { timeout: 5000 }) || ''))
  && !!(await until(`!!document.querySelector('.vw-row[data-id="secrets:totp:paced-code#seed"]') && document.querySelector('.vw-rail-item[data-purpose="two-step"] .vw-rail-n')?.textContent === '3'`, { timeout: 8000 })), await toasts());
await evalJs(`(() => { const v = window.__vt; window.fetch = v.fetch; window.setInterval = v.si; delete window.__vt; return true; })()`);

console.log('⑥ 网站登录…\'s two-step field lists the codes');
await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'vault') app.wm.closeWindow(w.id); true`);
await openWindow();
check('网站登录… opens', verdictOf(await openAdd('Website login…').then(() => until(visible('.vault-login-add-dialog'), { timeout: 5000 }))));
// lane vault-2fa-pick: THE FIELD's OWN LIST (src/lib/vault-otp-field.js) — the browser offers nothing of its own here
const OTP = '.vault-login-add-dialog input.vault-login-otp', OTPL = '.vault-login-add-dialog .vault-otp-list';
const otpFacts = () => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); const l = document.querySelector(${JSON.stringify(OTPL)}); const n = document.querySelector('.vault-login-add-dialog .vault-otp-note');
  const shown = (e) => !!e && !e.hidden && e.getBoundingClientRect().height > 0;
  return { value: i ? i.value : null, focused: document.activeElement === i, open: shown(l), head: l ? (l.querySelector('.vault-otp-head') || {}).textContent : null,
    rows: l ? [...l.querySelectorAll('.vault-otp-row')].map((b) => [b.querySelector('.vault-otp-name').textContent, (b.querySelector('.vault-otp-sub') || {}).textContent || '']) : [],
    note: shown(n) ? n.textContent : '', dialog: !!document.querySelector('.vault-login-add-dialog'), datalists: document.querySelectorAll('datalist').length,
    attrs: i ? { list: i.getAttribute('list'), ac: i.getAttribute('autocomplete'), role: i.getAttribute('role'), lp: i.getAttribute('data-lpignore'), op: i.getAttribute('data-1p-ignore') } : null }; })()`);
const otpPress = stillPresser({ evalJs, cdp });   // THE still door (scripts/scratch.mjs): measured, still, landed — never a press by raw coordinates
const otpKey = async (key, code, keyCode) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode }); };
const otpFieldPressed = await otpPress(OTP, { click: 'any' });
const otpOpened = await until(`(() => { const l = document.querySelector(${JSON.stringify(OTPL)}); return !!l && !l.hidden && l.querySelectorAll('.vault-otp-row').length >= 3; })()`, { timeout: 5000 });
const otpF1 = await otpFacts();
check('a press in the two-step field OPENS ITS OWN LIST, headed «Two-step codes in this vault»: a row per code by name — bank-login · github-owner · paced-code',
  gateOf(otpFieldPressed) && !!otpOpened && gateOf(otpF1.focused) && otpF1.head === 'Two-step codes in this vault' && otpF1.rows.map((r) => r[0]).join() === 'bank-login,github-owner,paced-code', { otpF1, last: otpPress.last });
check('… and the browser offers nothing of its own: no <datalist> in the page, no `list` on the field, autocomplete off, the password managers\' ignore marks, a combobox',
  otpF1.datalists === 0 && gateOf(otpF1.attrs) && otpF1.attrs.list === null && otpF1.attrs.ac === 'off' && otpF1.attrs.lp === 'true' && otpF1.attrs.op === 'true' && otpF1.attrs.role === 'combobox', otpF1);
const otpRowPressed = await otpPress(`${OTPL} .vault-otp-row[data-name="github-owner"]`);
const otpF2 = await until(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); return i && i.value === 'github-owner' ? true : null; })()`, { timeout: 3000 }) ? await otpFacts() : await otpFacts();
check('a REAL press on the github-owner row (THE still door) fills the field with its name; the list closes, the focus stays in the field', gateOf(otpRowPressed) && otpF2.value === 'github-owner' && !otpF2.open && verdictOf(otpF2.focused), { last: otpPress.last, otpF2 });
await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); return true; })()`);
await otpKey('Escape', 'Escape', 27);
await otpKey('ArrowDown', 'ArrowDown', 40);
await otpKey('Enter', 'Enter', 13);
const otpF3 = await otpFacts();
check('the keyboard: ↓ opens the list on its first row, Enter picks it (bank-login)', otpF3.value === 'bank-login' && !otpF3.open && verdictOf(otpF3.dialog), otpF3);
await otpKey('ArrowDown', 'ArrowDown', 40);
const otpF4a = await otpFacts();
await otpKey('Escape', 'Escape', 27);
const otpF4 = await otpFacts();
check('Escape with the list open closes THE LIST — the dialog stays, the field keeps its text', gateOf(otpF4a.open) && !otpF4.open && gateOf(otpF4.dialog) && otpF4.value === 'bank-login', { otpF4a, otpF4 });
await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await cdp('Input.insertText', { text: 'no-such-code' });
const otpF5 = await until(`(() => { const n = document.querySelector('.vault-login-add-dialog .vault-otp-note'); return n && !n.hidden && n.textContent ? n.textContent : null; })()`, { timeout: 3000 });
check('a typed name that lists nothing is said UNDER THE FIELD at once (before any Save)', verdictOf(/No two-step code of that name is in this vault/.test(String(otpF5 || ''))), otpF5);
await otpKey('Escape', 'Escape', 27);
await click('.vault-login-add-dialog .btn-cancel');
// THE CURE's PROOF (主开发 2026-11-18 00:02Z, MUST 1 + the cure round's own read): the open list takes NO room in the flow and a
// press that moves the focus closes it only after its click has landed — so a press on Save with the list OPEN lands. (a) a
// PREFIX typed (the list open): the line after the field stands where it stood with the list closed; (b) ONE held press on Save
// through THE still door lands — the add door ran: it refuses the unfinished name in the dialog's own line, by name; (c) the full
// listed name typed SETTLES the choice (the list closes) and Save saves the login. RED: the list drawn back IN THE FLOW (a style
// this control injects) moves that line down when it opens.
const listFlow = async (tag, { inFlow = false, name = 'github-own', expectSave = false } = {}) => {
  if (!(await openAdd('Website login…'))) await until(visible('.vault-login-add-dialog'), { timeout: 5000 });
  if (inFlow) await evalJs(`(() => { const st = document.createElement('style'); st.id = 'vs-otp-in-flow'; st.textContent = '.vault-otp-list { position: static !important; }'; document.head.append(st); return true; })()`);
  await typeInto('.vault-login-add-dialog .vault-login-site', `https://${tag}.example.test`);
  await typeInto('.vault-login-add-dialog .vault-login-user', `${tag}-person@example.test`);
  await typeInto('.vault-login-add-dialog .vault-login-pass', ['pw', tag, Date.now()].join('-'));
  // the line after the field IN THE DIALOG'S OWN FLOW — free of the dialog body's scroll (the box runs' viewport top stood at 501 even
  // with the note shown above it): the field's row height (`rowH`) and the line's offset from the row's top less the note's box
  // between them (`flowHint` — the note under the field takes its room by design); `pos` = the open list's computed placement
  const flowFacts = () => evalJs(`(() => { const d = document.querySelector('.vault-login-add-dialog'); const h = d && d.querySelector('.vw-ak-hint'); const i = document.querySelector(${JSON.stringify(OTP)}); const row = i && i.closest('label'); const nb = d && d.querySelector('.vault-otp-box'); const b = d && d.querySelector('.dialog-body'); const l = document.querySelector(${JSON.stringify(OTPL)});
    if (!h || !row || !nb) return null; const hr = h.getBoundingClientRect(), rr = row.getBoundingClientRect(), bh = nb.getBoundingClientRect().height;
    return { hintTop: Math.round(hr.top), rowH: Math.round(rr.height), boxH: Math.round(bh), flowHint: Math.round(hr.top - rr.top - bh), scroll: b ? Math.round(b.scrollTop) : null, pos: l ? getComputedStyle(l).position : null, listH: l ? Math.round(l.getBoundingClientRect().height) : 0 }; })()`);
  await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); i.blur(); return true; })()`);
  await until(`!document.querySelector(${JSON.stringify(OTPL)})`, { timeout: 2000 });
  const closed = await flowFacts();
  await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(OTP)}); i.focus(); i.value = ''; return true; })()`);
  await cdp('Input.insertText', { text: name });
  // the read of the names LANDS (every opening reads them again): its rows drawn, or the list closed by the settled name
  await until(`(() => { const l = document.querySelector(${JSON.stringify(OTPL)}); return !l || l.querySelectorAll('.vault-otp-row').length > 0; })()`, { timeout: 5000 });
  await sleep(150);
  const listOpen = await evalJs(`(() => { const l = document.querySelector(${JSON.stringify(OTPL)}); return !!l && l.querySelectorAll('.vault-otp-row').length > 0; })()`);
  const opened = await flowFacts();
  const pressed = await otpPress('.vault-login-add-dialog .btn-create', { hold: 120 });
  const saved = expectSave ? !!(await until(`fetch('/api/vault/web-logins').then((r) => r.json()).then((j) => JSON.stringify(j.entries || []).includes(${JSON.stringify(tag + '.example.test')}))`, { timeout: 8000 })) : false;
  const refused = expectSave ? '' : String(await until(`(() => { const e = document.querySelector('.vault-login-add-dialog .vault-secret-error'); return e && e.textContent ? e.textContent : null; })()`, { timeout: 5000 }) || '');
  const out = { listOpen, closed, opened, pressed, saved, refused, landed: otpPress.last && otpPress.last.landed, dialog: await evalJs(`!!document.querySelector('.vault-login-add-dialog')`) };
  if (inFlow) await evalJs(`(() => { document.getElementById('vs-otp-in-flow')?.remove(); return true; })()`);
  if (out.dialog) await click('.vault-login-add-dialog .btn-cancel');
  await until(`!document.querySelector('.vault-login-add-dialog')`, { timeout: 3000 });
  return out;
};
const cureOpen = await listFlow('otp-list-open');
const sameFlow = (r) => !!(r.closed && r.opened) && Math.abs(r.opened.flowHint - r.closed.flowHint) <= 1 && Math.abs(r.opened.rowH - r.closed.rowH) <= 1;
check('THE CURE (a): a prefix typed opens the list, and the line after the field stands where it stood with the list closed (the open list takes NO room in the flow: the field\'s row and the line after it, in the dialog\'s own flow)', gateOf(cureOpen.listOpen) && !!cureOpen.opened && cureOpen.opened.pos === 'absolute' && verdictOf(sameFlow(cureOpen)), cureOpen);
check('THE CURE (b): with the list OPEN, ONE held press on Save lands — the add door ran and refused the unfinished name by name in the dialog\'s own line', gateOf(cureOpen.pressed) && gateOf(/No two-step code of that name/.test(cureOpen.refused)) && verdictOf(cureOpen.dialog), cureOpen);
const cureSave = await listFlow('otp-list-settled', { name: 'github-owner', expectSave: true });
check('THE CURE (c): the full listed name typed SETTLES the choice (the list closes) and Save saves the login', !cureSave.listOpen && gateOf(cureSave.pressed) && gateOf(cureSave.saved) && !cureSave.dialog, cureSave);
const redFlow = await listFlow('otp-list-flow', { inFlow: true });
check('RED control, its plant first: the injected style draws the OPEN list in the flow (its computed position static)', gateOf(redFlow.listOpen) && !!redFlow.opened && redFlow.opened.pos === 'static' && redFlow.opened.listH > 0, redFlow);
check('RED: the list drawn back IN THE FLOW takes room — the field\'s row grows and the line after it moves down when it opens', !!(redFlow.closed && redFlow.opened) && redFlow.opened.rowH - redFlow.closed.rowH > 10 && redFlow.opened.flowHint - redFlow.closed.flowHint > 10, redFlow);

console.log('⑥b a phone (375 × 812): the dialog fits the screen, its press targets ≥ 36 px');
await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(800);
await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'vault') app.wm.closeWindow(w.id); true`);
check('the Vault window on a phone, with 添加…', !!(await openWindow()));
check('两步验证… opens there too', verdictOf(await openAdd()));
await click(`${D} .vt-way[data-way="seed"]`);
await evalJs(`document.querySelector(${JSON.stringify(D + ' .vt-adv')}).open = true; true`);
const ph = await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(D)}); const r = d.getBoundingClientRect(); const small = [...d.querySelectorAll('.vt-way, .vt-reveal, .vt-preview-b, .dialog-footer button')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 35.5).map((b) => b.className); const wide = [...d.querySelectorAll('input, select, button')].filter((x) => { const q = x.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 0.5 || q.left < r.left - 0.5); }).map((x) => x.className); return { left: r.left, right: r.right, vw: innerWidth, small, wide, seedFont: getComputedStyle(d.querySelector('.vt-seed')).fontSize }; })()`);
check('the dialog inside the screen, no control past its edges, every press target ≥ 36 px, the seed field at 16 px (no zoom on focus)', ph.left >= 0 && ph.right <= ph.vw && !ph.small.length && !ph.wide.length && ph.seedFont === '16px', ph);
await shot('vt-6-phone.png');
await click(`${D} .btn-cancel`);
await cdp('Emulation.clearDeviceMetricsOverride');
await sleep(500);

console.log('⑦ the words in Chinese; the log; the audit');
await evalJs(`localStorage.setItem('vibespace.lang', 'zh')`);
await cdp('Page.navigate', { url: URL });
await until(`!!(window.app && app.wm && app._localHome)`, { timeout: 45000 });
await splashGone();
await openWindow();
await click('.vw-add');
const zhItems = await menuItems();
check('添加… in Chinese: 两步验证… after 频道账号…', !!zhItems && zhItems[3] === '两步验证…', zhItems);
await pickMenu('两步验证…');
await until(visible(D), { timeout: 5000 });
const zh = await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(D)}); return { title: d.querySelector('.dialog-header h3').textContent, ways: [...d.querySelectorAll('.vt-way')].map((b) => b.textContent).join(' · '), preview: d.querySelector('.vt-preview-b').textContent }; })()`);
check('the dialog in Chinese: 添加两步验证 · 粘贴 otpauth 链接 · 输入密钥 · 检查验证码（下一步保存）', zh.title === '添加两步验证' && zh.ways === '粘贴 otpauth 链接 · 输入密钥' && zh.preview === '检查验证码（下一步保存）', zh);
await typeInto(`${D} .vt-link`, 'otpauth://hotp/X:y?secret=' + SEED2 + '&counter=1');
check('a refusal in Chinese (a counter-based link)', verdictOf(/不支持基于计数器的（HOTP）验证码/.test(await err() || '')), await err());
await shot('vt-5-zh.png');
await click(`${D} .dialog-close`);
await click(`${D} .dialog-unsaved-discard`);
await sleep(300);
const logText = fs.readFileSync(LOG, 'utf8');
check('the hub\'s log holds no seed', !logText.includes(SEED) && !logText.includes(SEED2) && !logText.includes(SEED3));
const auditFile = path.join(wt, 'data', 'vault-audit.jsonl');
const audit = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
const adds = audit.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }).filter((l) => l.event === 'vault-totp-add');
check('the audit: the three adds (vault-totp-add — paste, manual, manual), by a person, and no seed in it', adds.length === 3 && adds.map((a) => a.source).sort().join() === 'manual,manual,paste' && gateOf(adds.every((a) => a.by === 'human')) && !audit.includes(SEED) && !audit.includes(SEED2) && !audit.includes(SEED3), adds);

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
