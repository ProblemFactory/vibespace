#!/usr/bin/env node
// WHO MAY HAVE A WEB LOGIN FILLED — THE DIALOGS AND THE ROW IN A REAL CHROME (the owner 2026-11-17: «这个界面逻辑有点问题 最上面那个
// 选项会影响下面的表格内容，容易引起困惑。另外这里配置apply之后似乎会直接对所有网站login生效？» and «这里也无法显示除了密码之外的信息，
// 比如绑定了哪个两步验证码»). HEAVY (chrome). The REAL modules (src/lib/vault-login-grants.js, vault-login-row.js loginExtras, the house
// picker, the real createModalShell) bundled by esbuild, the REAL public/style.css, loopback stand-in routes that record what Save posts
// — in zh (the owner's language), at 280 / 360 / 768 / 960 / 1440. Every step waits on the PAGE's state, never a sleep:
//   ① a login's 用于… is about THAT login: no radio, its title, the picker; a conversation the star row admits is a LOCKED chip
//      «经由：任何网站» with its door and no ✕, its list row ticked, inert and carrying the same door; nothing overflows INSIDE the
//      dialog; the refusal line and its door are not drawn before a refusal (主开发 22:41Z MUST 2);
//   ② the locked row's door opens «任何网站…» as its own dialog, with its own consequence;
//   ③ Save posts THIS login's row only (scope this-account) — the ticked conversation, nothing at a wider scope;
//   ④ the unsaved guard: a tick then the ✕ asks in place, nothing posted;
//   ⑤ the «网站登录» head: its line names what the wider rows hold; «任何网站…»; «某个网站的任何账号…» with two sites asks the site
//      first, then that site's dialog;
//   ⑥ a login's row: what it holds FIRST — the bound two-step code by name with its door (a login without one says «无» with «绑定…»),
//      the kept previous password with when; a wider grant «经由» with NO ✕ and its door; its own grant keeps its ✕;
//   ⑦ the top of the login's dialog — user name, site, the two-step code with its door; the door's dialog lists the vault's codes by
//      name, «无» unbinds: POST /api/vault/web-logins/totp {name, totpName: null}, and the head then says «无»;
//   ⑧ EVERYONE ON THE STAR ROW, ONE CONVERSATION LEFT OUT (MUST 1 + should d; 主开发 23:25Z): a login's dialog draws ONE locked line
//      «全部 · 经由：任何网站 · 除了 新对话» with its door — not a chip per conversation; the left-out conversation's row says it is left out
//      (never drawn like a covered one); a conversation that ALSO holds this login's own row stays ticked and removable, «也经由» beside it.
//   ⑨ EVERYONE ON BOTH ROWS (主开发 00:28Z): the Everyone row's own text says «也经由：任何网站 · 除了 新对话», its chip keeps ✕, D (admitted
//      by this row's Everyone) carries no mark.
//   ⑩ A STOPPED CONVERSATION THE STAR ROW ADMITS (主开发 07:17Z): its locked chip and row say «当前未运行» in the lock's own words.
// LGD_SHOTS_DIR=<dir> also writes the pictures (360 and 960) for the owner's look.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE, CHROME_QUIET } from './scratch.mjs';
import { fitVerdictSource, columnFactsSource, fits as fitsVerdict, columnReads } from './lib/fit-ladder.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));
const SHOTS = process.env.LGD_SHOTS_DIR || '';
const CSS = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
const root = scratch('lgd-chrome'), dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
const J = (p) => JSON.stringify(path.join(repo, p));
// THE VAULT AS THE HUB ANSWERS IT (GET /api/vault/web-logins): two logins on shop, one on mail. alice: A by its own row, a two-step code
// bound, a previous password kept 3 days ago; B by the star row; the shop site row held by a Task Group. «by what» as the hub computes it.
const ORIGIN = 'https://shop.example.test', MAIL = 'https://mail.example.test';
const conv = (key) => ({ kind: 'conversation', key });
const DAY = 86400000;
const STAR = { resource: '*', scope: 'any-site', to: [conv('conv-b')], except: [] };
const SITE = { resource: `${ORIGIN}#*`, scope: 'any-account', to: [{ kind: 'group', id: 'g1' }], except: [] };
const OWN = { resource: `${ORIGIN}#alice`, scope: 'this-account', to: [conv('conv-a')], except: [] };
const SUBJECTS = { sessions: [{ subject: 'session:conv-a', name: '采购助手', groupIds: [] }, { subject: 'session:conv-b', name: '全站代理', groupIds: [] }, { subject: 'session:conv-d', name: '新对话', groupIds: [] }], groups: [{ subject: 'group:g1', name: '商店组' }] };
const alice = (grants, byWhat) => ({ name: `web-login:${ORIGIN}#alice`, origin: ORIGIN, user: 'alice', hasCurrent: true, hasPrevious: true, previousReplacedAt: Date.now() - 3 * DAY, totpName: 'shop-2fa', grants, byWhat });
const DATA = {
  ok: true, state: 'unlocked', subjects: SUBJECTS,
  entries: [
    alice([OWN, SITE, STAR], { 'conversation:conv-a': ['this-account'], 'conversation:conv-b': ['any-site'], 'group:g1': ['any-account'] }),
    { name: `web-login:${ORIGIN}#bob`, origin: ORIGIN, user: 'bob', hasCurrent: true, grants: [SITE, STAR], byWhat: { 'conversation:conv-b': ['any-site'], 'group:g1': ['any-account'] } },
    { name: `web-login:${MAIL}#me`, origin: MAIL, user: 'me', hasCurrent: true, grants: [STAR], byWhat: { 'conversation:conv-b': ['any-site'] } },
  ],
};
// EVERYONE ON THE STAR ROW — «by what» as the hub now answers it (Everyone, the group and every conversation through «any site»; A also
// by this login's own row)
const STAR_ALL = { resource: '*', scope: 'any-site', to: [{ kind: 'everyone' }], except: [conv('conv-d')] };   // D left out
const DATA_ALL = { ...DATA, entries: [alice([OWN, STAR_ALL], { everyone: ['any-site'], 'group:g1': ['any-site'], 'conversation:conv-a': ['this-account', 'any-site'], 'conversation:conv-b': ['any-site'] }), ...DATA.entries.slice(1)] };
// EVERYONE ON BOTH ROWS (主开发 00:28Z): this login's own row holds Everyone, the star row holds Everyone except D — this row admits D
const OWN_ALL = { resource: `${ORIGIN}#alice`, scope: 'this-account', to: [{ kind: 'everyone' }], except: [] };
// A STOPPED CONVERSATION THE STAR ROW ADMITS (主开发 07:17Z): drawn locked, and its lock says «not running now» in its own words
const DATA_GONE = { ...DATA, entries: [alice([OWN, SITE, { ...STAR, to: [conv('conv-b'), conv('conv-gone')] }], { 'conversation:conv-a': ['this-account'], 'conversation:conv-b': ['any-site'], 'conversation:conv-gone': ['any-site'], 'group:g1': ['any-account'] }), ...DATA.entries.slice(1)] };
const DATA_BOTH = { ...DATA, entries: [alice([OWN_ALL, STAR_ALL], { everyone: ['this-account', 'any-site'], 'group:g1': ['this-account', 'any-site'], 'conversation:conv-a': ['this-account', 'any-site'], 'conversation:conv-b': ['this-account', 'any-site'], 'conversation:conv-d': ['this-account'] }), ...DATA.entries.slice(1)] };
const entry = `import { showLoginGrantPicker, showAnySiteDialog, showAnyAccountDialog, wideHeaderDoors, loginHeld } from ${J('src/lib/vault-login-grants.js')};
import { loginExtras } from ${J('src/lib/vault-login-row.js')};
const q = new URLSearchParams(location.search), mode = q.get('mode') || 'login';
const DATA = q.get('star') === 'everyone' ? ${JSON.stringify(DATA_ALL)} : q.get('star') === 'both' ? ${JSON.stringify(DATA_BOTH)} : q.get('star') === 'gone' ? ${JSON.stringify(DATA_GONE)} : ${JSON.stringify(DATA)};
const doors = { held: loginHeld, grant: showLoginGrantPicker, anySite: showAnySiteDialog, anyAccount: showAnyAccountDialog };
const rowOf = (e) => { const w = document.createElement('div'); w.className = 'vw-row'; w.style.margin = '12px'; w.dataset.login = e.name; const n = document.createElement('div'); n.className = 'vw-row-name'; n.textContent = e.user + ' · ' + e.origin.replace('https://', ''); const x = loginExtras({ entry: e.name }, DATA, { refresh: () => {}, doors }); w.append(n, x.box, ...x.doors); return w; };
if (mode === 'login') showLoginGrantPicker(DATA.entries[0], DATA, { refresh: () => {} });
else if (mode === 'head') { const h = document.createElement('div'); h.className = 'vw-group'; h.style.margin = '12px'; const n = document.createElement('span'); n.className = 'vw-group-name'; n.textContent = '网站登录'; h.append(n, wideHeaderDoors(() => DATA, { refresh: () => {} }).el); document.body.appendChild(h); }
else if (mode === 'row') { const list = document.createElement('div'); list.className = 'vw-rows'; list.style.containerType = 'inline-size'; list.style.containerName = 'vw';   /* the Vault window's own container: its rows narrow by «@container vw» */ list.append(rowOf(DATA.entries[0]), rowOf(DATA.entries[1])); document.body.appendChild(list); }
window.__ready = true;`;
await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, 'ui.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
const posted = [];
const web = express();
web.use(express.json());
web.get('/style.css', (req, res) => res.type('css').send(CSS));
web.get('/ui.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, 'ui.js'))));
web.get('/api/vault/totp', (req, res) => res.json({ ok: true, state: 'unlocked', entries: [{ name: 'mail-2fa', grants: [] }, { name: 'shop-2fa', grants: [] }] }));   // names only
web.post('/api/vault/web-logins/grants', (req, res) => { posted.push({ url: req.url, body: req.body }); res.json({ ok: true, resource: 'x' }); });
web.post('/api/vault/web-logins/ungrant', (req, res) => { posted.push({ url: req.url, body: req.body }); res.json({ ok: true, removed: true }); });
web.post('/api/vault/web-logins/totp', (req, res) => { posted.push({ url: req.url, body: req.body }); res.json({ ok: true, name: req.body.name, totpName: req.body.totpName || null, changed: true }); });
web.all(/^\/api\//, (req, res) => res.json({}));
web.get('/', (req, res) => res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)}</style></head><body><script src="/ui.js"></script></body></html>`));
const PORT = await freePort();
const srv = await new Promise((r) => { const s = web.listen(PORT, '127.0.0.1', () => r(s)); });
const CDP_PORT = await freePort();
const chromeDir = scratch('lgd-chrome-profile');
const env = { ...process.env };
delete env.DBUS_SESSION_BUS_ADDRESS;   // no keyring ask (a headless Chrome waits on it at every navigation)
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--password-store=basic', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } for (const d of [chromeDir, root]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page({ vw, vh, mobile = false, query = '', sel }) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 2, mobile });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  // WAIT ON THE PAGE's STATE (主开发 22:41Z, should e): an expression polled until truthy, a bounded number of looks — never a sleep standing for a state
  const until = async (expr, looks = 160) => { let v = null; for (let i = 0; i < looks; i++) { v = await ev(expr).catch(() => null); if (v) return v; await sleep(50); } return v; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${query}` });
  await until(`window.__ready === true && !!document.querySelector(${JSON.stringify(sel)})`, 200);
  await ev('document.fonts.ready.then(() => true)');
  const box = (s) => ev(`(() => { const d = document.querySelector(${JSON.stringify(s)}); if (!d) return null; const r = d.getBoundingClientRect(); return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: Math.ceil(Math.min(innerWidth, r.width + 12)), height: Math.ceil(Math.min(innerHeight, r.height + 12)), left: r.left, right: r.right, vw: innerWidth }; })()`);
  // FIT INSIDE the dialog — THE TREE's JUDGES, never a rule of this suite's own (主开发 13:46Z, after the hosted run): scripts/lib/
  // fit-ladder.mjs. fitVerdictSource over the dialog — the LOCK's WORDS (a locked chip's name and words, a locked row's words) and the
  // doors are never clipped (EVERY clip fails), nothing scrolls sideways (the dialog, its body); columnFactsSource over its body — the
  // house law: an ellipsis whose tip (its own, its parent's or grandparent's title or aria-label) holds the WHOLE words is a preview
  // (a plain row's name and hint at 280: the row's own title holds them); text past the column, a squeeze, a broken word fail.
  const fit = async (s) => ({ inWindow: await ev(`(() => { const d = document.querySelector(${JSON.stringify(s)}); if (!d) return null; const r = d.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; })()`),
    v: await ev(fitVerdictSource(s, { controls: '.pp-chip-locked .pp-chip-door, .dialog-footer button', words: LOCK_WORDS, scrollers: s + ' .dialog-body' })), f: await ev(columnFactsSource(s + ' .dialog-body')) });
  // MUST 2: the refusal line and its door are not drawn before a refusal — in every dialog open
  const noRefusal = () => ev(`[...document.querySelectorAll('.vw-login-refusal, .vw-login-refusal-door')].every((e) => getComputedStyle(e).display === 'none' && e.getBoundingClientRect().width === 0)`);
  const shot = async (s, file) => { const b = await box(s); if (SHOTS && b) { fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); } return b; };
  return { ev, until, box, fit, noRefusal, shot, close: () => { try { ws.close(); } catch { } } };
}
const LOGIN = '.vw-login-grant-dialog', Q = (s) => JSON.stringify(s);
const LOCK_WORDS = '.pp-chip-locked .pp-chip-name, .pp-chip-locked .pp-chip-why, .pp-row.pp-locked .pp-lock-why';   // the lock's words: never clipped
const textOf = (sel) => `(() => [...document.querySelectorAll(${Q(sel)})].map((d) => d.textContent || '').join(' | '))()`;
const dialogs = (n) => `document.querySelectorAll(${Q(LOGIN)}).length >= ${n}`;
const fits = (x) => !!x && x.inWindow === true && fitsVerdict(x.v) && columnReads(x.f);
console.log('① a login\'s 用于… — that login only; the star row\'s admit LOCKED «经由»; it fits 280–1440 inside; no refusal drawn');
for (const [w, h, mobile] of [[280, 700, true], [360, 780, true], [768, 900, false], [960, 900, false], [1440, 900, false]]) {
  const p = await page({ vw: w, vh: h, mobile, query: 'mode=login', sel: LOGIN + ' .pp-chip-locked' });
  const f = await p.ev(`(() => { const d = document.querySelector(${Q(LOGIN)}); const lockedChip = [...d.querySelectorAll('.pp-chip-locked')].find((c) => /全站代理/.test(c.textContent)); return {
    radios: d.querySelectorAll('input[type=radio]').length, title: (d.textContent || '').includes('alice · shop.example.test'), picker: !!d.querySelector('.pp'),
    locked: lockedChip ? lockedChip.textContent : '', lockedX: lockedChip ? lockedChip.querySelectorAll('.pp-chip-x').length : -1, door: lockedChip && lockedChip.querySelector('.pp-chip-door') ? lockedChip.querySelector('.pp-chip-door').textContent : '',
    consequence: (d.querySelector('.vw-login-consequence') || {}).textContent || '' }; })()`);
  ok(f.radios === 0 && gateOf(f.title) && gateOf(f.picker) && gateOf(/经由：任何网站/.test(f.locked)) && f.lockedX === 0 && f.door === '打开那份授权…' && verdictOf(/只在这个网站上/.test(f.consequence)),
    `${w}: no radio; its title names THIS login; the house picker; the star row's admit a LOCKED chip «经由：任何网站» with its door «打开那份授权…» (the act, not the grant's name again) and NO ✕; the consequence speaks of this site only`, f);
  const fi = await p.fit(LOGIN);
  ok(verdictOf(fits(fi)), `${w}: the dialog is in the window, nothing scrolls sideways, the lock's words are whole on every locked chip and row, and nothing is cut but a preview whose tip holds its whole words`, fi);
  if (w === 280) {   // RED CONTROL (主开发 13:46Z): a clipped text with NO tip is still red — the Everyone row's title taken away
    const had = await p.ev(`(() => { const r = document.querySelector(${Q(LOGIN + ' .pp-row.pp-row-everyone')}); const t = r && r.getAttribute('title'); if (r) r.removeAttribute('title'); return t; })()`);
    const fu = await p.fit(LOGIN);
    ok(!!had && !!fu && !fits(fu) && fu.f.clipped.length > 0, '280 CONTROL: the Everyone row without its tip — its cut hint is a cut, and the fit names it', fu);
  }
  ok(verdictOf(await p.noRefusal()), `${w}: no refusal line and no refusal door are drawn before a refusal`);
  if (w === 360 || w === 960) await p.shot(LOGIN, `login-dialog-${w}-zh.png`);
  if (w === 360) {
    const ROW_B = LOGIN + ' .pp-row[data-key="agent:conv-b"]';
    const before = await p.ev(`document.querySelectorAll(${Q(LOGIN + ' .pp-chip')}).length`);
    const row = await p.ev(`(() => { const r = document.querySelector(${Q(ROW_B)}); if (!r) return null; r.click(); return { locked: r.classList.contains('pp-locked'), sel: r.getAttribute('aria-selected'), dis: r.getAttribute('aria-disabled'), door: (r.querySelector('.pp-lock-door') || {}).textContent || '' }; })()`);
    const after = await p.ev(`(() => ({ chips: document.querySelectorAll(${Q(LOGIN + ' .pp-chip')}).length, sel: (document.querySelector(${Q(ROW_B)}) || { getAttribute: () => '' }).getAttribute('aria-selected') }))()`);
    ok(gateOf(row) && gateOf(row.locked) && row.sel === 'true' && row.dis === 'true' && row.door === '打开那份授权…' && before === after.chips && after.sel === 'true', 'the locked list row is ticked, inert, and names its door as its chip does — a press on the row changes nothing', { row, before, after });
    console.log('② the locked row\'s door opens «任何网站…» as its own dialog');
    // the door of the conversation the STAR row admits (B, through «任何网站») — never the first locked chip: the roster lists the Task
    // Groups first, and the group's lock goes through the SITE row, whose door opens the site's dialog (the hosted run's red, 2026-11-18)
    await p.ev(`(document.querySelector(${Q(LOGIN + ' .pp-chip-locked[data-key="agent:conv-b"] .pp-chip-door')}).click(), true)`);
    const star = await p.until(`(() => { const t = ${textOf(LOGIN)}; return /在每个网站上/.test(t) ? t : null; })()`);
    ok(!!star && verdictOf(/以后添加的也算/.test(star)), 'the door opens «任何网站…» as its own dialog, with its own consequence (every login on every site, the ones added later too)', String(star).slice(0, 300));
    ok(verdictOf(await p.noRefusal()), 'the «任何网站…» dialog draws no refusal line and no refusal door before a refusal');
  }
  p.close();
}
console.log('③ Save posts THIS login\'s row only · ④ the unsaved guard asks in place');
{
  const ROW_D = LOGIN + ' .pp-row[data-key="agent:conv-d"]';
  const p = await page({ vw: 1440, vh: 900, query: 'mode=login', sel: ROW_D });
  posted.length = 0;
  await p.ev(`(document.querySelector(${Q(ROW_D)}).click(), true)`);
  ok(verdictOf(await p.until(`document.querySelector(${Q(ROW_D)}).getAttribute('aria-selected') === 'true'`)), 'conversation D is ticked');
  await p.ev(`(document.querySelector(${Q(LOGIN + ' .dialog-close')}).click(), true)`);
  const asked = await p.until(`(() => { const s = document.querySelector(${Q(LOGIN + ' .dialog-unsaved')}); return s && s.offsetParent !== null ? { open: !!document.querySelector(${Q(LOGIN)}) } : null; })()`);
  ok(!!asked && gateOf(asked.open) && posted.length === 0, 'a tick then the ✕: the shell asks IN PLACE «unsaved changes» — the dialog stays, nothing posted', asked);
  await p.shot(LOGIN, 'login-unsaved-960-zh.png');
  p.close();
  const p2 = await page({ vw: 1440, vh: 900, query: 'mode=login', sel: ROW_D });
  posted.length = 0;
  await p2.ev(`(document.querySelector(${Q(ROW_D)}).click(), true)`);
  await p2.until(`document.querySelector(${Q(ROW_D)}).getAttribute('aria-selected') === 'true'`);
  await p2.ev(`(document.querySelector(${Q(LOGIN + ' .vw-login-save')}).click(), true)`);
  await p2.until(`!document.querySelector(${Q(LOGIN)})`);
  ok(posted.length === 1 && posted[0].url === '/api/vault/web-logins/grants' && posted[0].body.scope === 'this-account' && posted[0].body.subject === 'session:conv-d' && posted[0].body.name === `web-login:${ORIGIN}#alice`,
    'ticking a conversation and Save posts ONE grant — THIS login, scope this-account; nothing at a wider scope, nothing for the locked ones — and the dialog closes', posted);
  p2.close();
}
console.log('⑤ the «网站登录» head — «任何网站…» and «某个网站的任何账号…» (the site first)');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=head', sel: '.vw-login-wide' });
  const line = await p.ev(`(document.querySelector('.vw-login-wide-line') || {}).textContent || ''`);
  ok(gateOf(/任何网站：全站代理/.test(line)) && verdictOf(/任何账号：shop\.example\.test/.test(line)), `${tag}: the head's one line names what the wider rows hold — the star row's who, the site rows' sites`, line);
  await p.shot('.vw-group', `head-${tag}-zh.png`);
  await p.ev(`(document.querySelector('.vw-login-wide-any-site').click(), true)`);
  const star = await p.until(`(() => { const t = ${textOf(LOGIN)}; return /在每个网站上/.test(t) ? t : null; })()`);
  ok(!!star, `${tag}: «任何网站…» opens the star row's own dialog`);
  ok(gateOf(fits(await p.fit(LOGIN))) && verdictOf(await p.noRefusal()), `${tag}: it fits inside and draws no refusal before one`);
  await p.shot(LOGIN, `any-site-${tag}-zh.png`);
  p.close();
  const p2 = await page({ ...o, query: 'mode=head', sel: '.vw-login-wide' });
  await p2.ev(`(document.querySelector('.vw-login-wide-any-account').click(), true)`);
  const sites = await p2.until(`(() => { const s = [...document.querySelectorAll('.vw-login-site-name')].map((x) => x.textContent); return s.length ? s : null; })()`);
  ok(JSON.stringify(sites) === JSON.stringify(['mail.example.test', 'shop.example.test']) && verdictOf(await p2.noRefusal()), `${tag}: «某个网站的任何账号…» asks the SITE first — the vault's sites; no refusal drawn`, sites);
  await p2.shot('.vw-login-site-pick', `site-pick-${tag}-zh.png`);
  await p2.ev(`([...document.querySelectorAll('.vw-login-site')].find((b) => /shop/.test(b.textContent)).click(), true)`);
  const title = await p2.until(`(() => { const t = ${textOf(LOGIN)}; return /的任何账号/.test(t) ? t : null; })()`);
  ok(gateOf(/shop\.example\.test 的任何账号/.test(title || '')) && verdictOf(/注册「新」账号/.test(title || '')), `${tag}: the site's own dialog — its title names the site, its consequence says an agent may register a NEW account there`, String(title).slice(0, 260));
  ok(gateOf(fits(await p2.fit(LOGIN))) && verdictOf(await p2.noRefusal()), `${tag}: the site's dialog fits inside and draws no refusal before one`);
  await p2.shot(LOGIN, `any-account-${tag}-zh.png`);
  p2.close();
}
console.log('⑥ a login\'s row — what it holds FIRST; a wider grant «经由» with NO ✕; its own keeps its ✕');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=row', sel: '.vw-login-held' });
  const r = await p.ev(`(() => { const row = (u) => document.querySelector('.vw-row[data-login$="#' + u + '"]'); const a = row('alice'), b = row('bob');
    const t = [...a.querySelectorAll('.vw-ak-chip-through')]; const own = [...a.querySelectorAll('.vw-ak-chip')].filter((c) => !c.classList.contains('vw-ak-chip-through'));
    const box = a.querySelector('.vw-login');
    return { first: box && box.firstElementChild ? box.firstElementChild.className : '', otp: (a.querySelector('.vw-login-held-otp-name') || {}).textContent || '', otpDoor: (a.querySelector('.vw-login-held-otp-door') || {}).textContent || '',
      kept: [...a.querySelectorAll('.vw-login-held-kept')].map((k) => k.textContent), bobOtp: (b.querySelector('.vw-login-held-otp-name') || {}).textContent || '', bobDoor: (b.querySelector('.vw-login-held-otp-door') || {}).textContent || '',
      through: t.map((c) => c.textContent), throughX: t.reduce((n, c) => n + c.querySelectorAll('.vw-ak-x').length, 0), throughDoors: t.filter((c) => c.querySelector('.vw-ak-door')).length,
      ownX: own.reduce((n, c) => n + c.querySelectorAll('.vw-ak-x').length, 0) }; })()`);
  ok(gateOf(/vw-login-held/.test(r.first)) && r.otp === '两步验证码：shop-2fa' && r.otpDoor === '更改…' && r.kept.length === 1 && gateOf(/保留着上一个密码——3 天前被替换/.test(r.kept[0])) && r.bobOtp === '两步验证码：无' && r.bobDoor === '绑定…',
    `${tag}: what the login holds comes FIRST — its two-step code by name with «更改…», the kept previous password WITH WHEN; a login without one says «无» with «绑定…»`, r);
  ok(r.through.length === 2 && gateOf(r.through.every((x) => /经由/.test(x))) && r.throughX === 0 && r.throughDoors === 2 && r.ownX === 1,
    `${tag}: the wider grants show «经由» with NO ✕ and their door; this login's own grant keeps its ✕`, r);
  const inRow = await p.ev(`[...document.querySelectorAll('.vw-row')].every((row) => { const rr = row.getBoundingClientRect(); return [...row.querySelectorAll('.vw-ak-chip')].every((c) => { const b = c.getBoundingClientRect(); return b.left >= rr.left - 0.5 && b.right <= rr.right + 0.5; }); })`);
  const inView = await p.ev(`[...document.querySelectorAll('.vw-row')].every((row) => row.getBoundingClientRect().right <= innerWidth + 0.5)`);
  ok(gateOf(inRow) && verdictOf(inView), `${tag}: every row fits the window inside the Vault window's container, and every chip stays inside its row — a long «经由» chip wraps inside itself`);
  await p.shot('.vw-rows', `rows-${tag}-zh.png`);
  p.close();
}
console.log('⑦ the top of the login\'s dialog — user, site, what it holds; the two-step door binds or unbinds by name');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=login', sel: LOGIN + ' .vw-login-head' });
  const head = await p.ev(`(() => { const h = document.querySelector(${Q(LOGIN + ' .vw-login-head')}); const d = document.querySelector(${Q(LOGIN)}); const pp = d.querySelector('.pp'); return { ids: [...h.querySelectorAll('.vw-login-head-id')].map((x) => x.textContent), otp: (h.querySelector('.vw-login-held-otp-name') || {}).textContent || '', door: (h.querySelector('.vw-login-held-otp-door') || {}).textContent || '', kept: (h.querySelector('.vw-login-held-kept') || {}).textContent || '', abovePicker: !!pp && !!(h.compareDocumentPosition(pp) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`);
  ok(JSON.stringify(head.ids) === JSON.stringify(['用户名：alice', '网站：shop.example.test']) && head.otp === '两步验证码：shop-2fa' && head.door === '更改…' && gateOf(/3 天前/.test(head.kept)) && verdictOf(head.abovePicker),
    `${tag}: the dialog's top names the login — its user name, its site, its two-step code with «更改…», the kept password with when — above the picker`, head);
  await p.shot(LOGIN, `login-head-${tag}-zh.png`);
  if (tag === '960') {
    posted.length = 0;
    await p.ev(`(document.querySelector(${Q(LOGIN + ' .vw-login-held-otp-door')}).click(), true)`);
    const dlg = await p.until(`(() => { const s = document.querySelector('.vw-login-totp-dialog select'); return s && s.options.length >= 3 && !document.querySelector('.vw-login-totp-save').disabled ? { opts: [...s.options].map((o) => o.value + '=' + o.textContent), value: s.value } : null; })()`);
    ok(gateOf(dlg) && JSON.stringify(dlg.opts) === JSON.stringify(['=无——不使用两步验证码', 'mail-2fa=mail-2fa', 'shop-2fa=shop-2fa']) && dlg.value === 'shop-2fa', 'the door\'s dialog lists the vault\'s two-step codes BY NAME (and «无»), starting at the bound one', dlg);
    ok(gateOf(await p.noRefusal()) && verdictOf(fits(await p.fit('.vw-login-totp-dialog'))), 'the two-step dialog fits inside and draws no refusal line or door before a refusal');
    await p.shot('.vw-login-totp-dialog', 'totp-dialog-960-zh.png');
    await p.ev(`(() => { const s = document.querySelector('.vw-login-totp-dialog select'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.vw-login-totp-save').click(); return true; })()`);
    const after = await p.until(`(() => { const t = (document.querySelector(${Q(LOGIN + ' .vw-login-head .vw-login-held-otp-name')}) || {}).textContent || ''; return t === '两步验证码：无' ? t : null; })()`);
    ok(posted.length === 1 && posted[0].url === '/api/vault/web-logins/totp' && posted[0].body.name === `web-login:${ORIGIN}#alice` && posted[0].body.totpName === null && after === '两步验证码：无',
      '«无» + Save UNBINDS it: ONE POST /api/vault/web-logins/totp {name, totpName: null} — and the dialog\'s top then says «无»', { posted, after });
  }
  p.close();
}
console.log('⑧ Everyone on the star row, D left out — ONE locked line that says so; D\'s row marked; a conversation with its own grant stays removable');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=login&star=everyone', sel: LOGIN + ' .pp-chip-locked' });
  const r = await p.ev(`(() => { const d = document.querySelector(${Q(LOGIN)}); const locked = [...d.querySelectorAll('.pp-chip-locked')]; const ownA = [...d.querySelectorAll('.pp-chip')].find((c) => !c.classList.contains('pp-chip-locked') && /采购助手/.test(c.textContent)); const rowA = d.querySelector('.pp-row[data-key="agent:conv-a"]'); const rowB = d.querySelector('.pp-row[data-key="agent:conv-b"]'); const rowD = d.querySelector('.pp-row[data-key="agent:conv-d"]'); const rowE = d.querySelector('.pp-row.pp-locked'); const nmE = rowE && rowE.querySelector('.pp-name');
    return { locked: locked.map((c) => c.textContent), lockedDoors: locked.filter((c) => c.querySelector('.pp-chip-door')).length, ownAx: ownA ? ownA.querySelectorAll('.pp-chip-x').length : -1, rowAhint: rowA ? rowA.textContent : '', rowAlocked: rowA ? rowA.classList.contains('pp-locked') : null, rowBlocked: rowB ? rowB.classList.contains('pp-locked') : null, rowB: rowB ? rowB.textContent : '', rowD: rowD ? rowD.textContent : '', nameE: nmE ? { text: nmE.textContent, whole: nmE.scrollWidth <= nmE.clientWidth + 1 } : null, hintE: rowE ? [...rowE.querySelectorAll(':scope > .pp-hint:not(.pp-lock-why)')].filter((h) => getComputedStyle(h).display !== 'none').length : -1 }; })()`);
  ok(r.locked.length === 1 && gateOf(/全部/.test(r.locked[0])) && gateOf(/经由：任何网站/.test(r.locked[0])) && gateOf(/除了 新对话/.test(r.locked[0])) && r.lockedDoors === 1 && r.rowBlocked === false,
    `${tag}: ONE locked line «全部 · 经由：任何网站 · 除了 新对话» with its door — not a chip per conversation (B, covered by it, has no chip of its own)`, r);
  ok(gateOf(/不在「全部」里——任何网站/.test(r.rowD)) && !/不在「全部」里/.test(r.rowB),
    `${tag}: D, which the star row leaves out, is marked «不在「全部」里» — B, which it covers, is not: the two never look alike`, { rowB: r.rowB, rowD: r.rowD });
  ok(gateOf(r.nameE) && r.nameE.text === '全部' && gateOf(r.nameE.whole) && r.hintE === 0, `${tag}: the locked Everyone row shows its name WHOLE — its «through» note stands in for the row's own hint (it was crushed to «Ev…» by the hint, the note and the door)`, { nameE: r.nameE, hintE: r.hintE });
  ok(r.ownAx === 1 && r.rowAlocked === false && verdictOf(/也经由：任何网站/.test(r.rowAhint)),
    `${tag}: A holds this login's own row too — its chip keeps its ✕, its row is removable, «也经由：任何网站» beside it`, r);
  ok(gateOf(fits(await p.fit(LOGIN))) && verdictOf(await p.noRefusal()), `${tag}: it fits inside and draws no refusal before one`);
  await p.shot(LOGIN, `login-everyone-${tag}-zh.png`);
  p.close();
}
console.log('⑨ Everyone on BOTH rows, D left out by the star row — the Everyone row\'s own text says «也经由 · 除了», its chip keeps ✕');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=login&star=both', sel: LOGIN + ' .pp-row[data-key="everyone:*"]' });
  const r = await p.ev(`(() => { const d = document.querySelector(${Q(LOGIN)}); const chipE = [...d.querySelectorAll('.pp-chip')].find((c) => c.dataset.key === 'everyone:*'); const rowE = d.querySelector('.pp-row[data-key="everyone:*"]'); const rowD = d.querySelector('.pp-row[data-key="agent:conv-d"]');
    return { chipX: chipE ? chipE.querySelectorAll('.pp-chip-x').length : -1, chipLocked: chipE ? chipE.classList.contains('pp-chip-locked') : null, rowE: rowE ? rowE.textContent : '', locked: d.querySelectorAll('.pp-chip-locked').length, rowD: rowD ? rowD.textContent : '' }; })()`);
  ok(r.chipX === 1 && r.chipLocked === false && gateOf(/也经由：任何网站/.test(r.rowE)) && gateOf(/除了 新对话/.test(r.rowE)) && r.locked === 0,
    `${tag}: Everyone held HERE and on the star row: its chip keeps its ✕, its own row says «也经由：任何网站 · 除了 新对话», and no conversation gets a locked chip`, r);
  ok(!/不在「全部」里/.test(r.rowD), `${tag}: D — left out by the star row but admitted by THIS row's Everyone — carries no «left out» mark`, r.rowD);
  p.close();
}
console.log('⑩ a STOPPED conversation the star row admits — locked, and its lock says «当前未运行» in its own words');
for (const [tag, o] of [['360', { vw: 360, vh: 780, mobile: true }], ['960', { vw: 960, vh: 900 }]]) {
  const p = await page({ ...o, query: 'mode=login&star=gone', sel: LOGIN + ' .pp-row[data-key="agent:conv-gone"]' });
  const r = await p.ev(`(() => { const d = document.querySelector(${Q(LOGIN)}); const chip = [...d.querySelectorAll('.pp-chip-locked')].find((c) => c.dataset.key === 'agent:conv-gone'); const row = d.querySelector('.pp-row[data-key="agent:conv-gone"]');
    return { chip: chip ? chip.textContent : '', rowLocked: row ? row.classList.contains('pp-locked') : null, rowWhy: row ? ((row.querySelector('.pp-lock-why') || {}).textContent || '') : '', rowHintShown: row ? [...row.querySelectorAll(':scope > .pp-hint:not(.pp-lock-why)')].filter((h) => getComputedStyle(h).display !== 'none').length : -1 }; })()`);
  ok(gateOf(/经由：任何网站/.test(r.chip)) && gateOf(/当前未运行/.test(r.chip)) && r.rowLocked === true && gateOf(/当前未运行/.test(r.rowWhy)) && r.rowHintShown === 0,
    `${tag}: a stopped conversation the star row admits: its locked chip and its locked row say «经由：任何网站 · 当前未运行» — the lock carries the words its row's hidden hint used to`, r);
  p.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
