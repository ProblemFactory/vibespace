#!/usr/bin/env node
// lane lark-consent-chain — HEAVY (chrome, zero vendor calls, no product server): ONE PRESS, EVERY CONSENT PAGE, AS THE
// PERSON SEES IT (the owner, 2026-10-23, on the Lark row's «重新授权一次即可开启：应用已开通的另外 248 项权限»: 「不能一次性打开所有吗？」 +
// ADDENDUM 1: 「lark 授权窗口那个什么 11 项权限的提示没用了吧？」). Three legs in headless chrome, zh:
// ① THE ROW — the REAL renderChannelsPanel (an esbuild iife of the tree — the channel-reauth-line harness) over a stub
//    server: a Lark account whose chain is on page 2 of 3 says «正在授权 第 2/3 页…（在打开的那个标签页里）» + 「取消」 under its
//    «已连接» health line, and NOT the «另外 N 项» line (the chain's pages ARE those); a Lark account with permissions left
//    and no chain says «…另外 165 项权限» + 「重新授权」; a broadcast ending the chain takes the chain line away live.
// ② THE SIGN-IN DIALOG'S NARROWING ROW (Re-authorize → Sign in with Lark; the stub answers the flow): a consent whose
//    scopes came from the app's own list (`scopesFrom: 'app'`) draws NO «不要这 11 项额外权限» row; one that fell back to the
//    built-in floor (`scopesFrom: 'floor'`, the read's answer) draws it WITH the why.
// ③ THE CHAIN LANDING in a real browser: the REAL routes/channels.js landing route (its exact CSP: default-src 'none' +
//    the close script's hash) answering a page that landed with a next page ⇒ the SAME tab is at the next authorize
//    address within ~2 s (a meta refresh — no script needed); the last page's landing stays and carries the close script.
// CONTROLS: the panel bundle without the chain line (① red: the «另外 N 项» line shows while a chain walks); the dialog
// bundle without the verdict (② red: the app-road dialog draws the dead row).
// LCC_SHOTS=<dir> writes row.png, dialog-app.png, dialog-floor.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.LCC_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CR = require(path.join(repo, 'src/consent-road.js'));

// ── the bundles: the REAL panel of the tree (patch = {file, from, to} rewrites one source for a control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('lark-consent-chain');
async function bundle(name, patch = null) {
  const entry = `import { renderChannelsPanel } from ${JSON.stringify(path.join(repo, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm in this harness'); } }, openChannel: (a, id) => { window.__opened = [a, id]; } };
window.__fire = (m) => { for (const h of [...hs]) h(m); };
window.open = (u) => { window.__openedUrl = u; return { closed: false, close() {} }; };
renderChannelsPanel(app, document.getElementById('host'));`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: patch.file }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing'); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
await bundle('nochain.js', { file: /channels-panel\.js$/, from: '  const chainWords = chanCaps.consentChainText(a.consentChain, { t });', to: "  const chainWords = '';" }).catch((e) => ok(false, 'CONTROL bundle (no chain line)', e.message));
await bundle('noverdict.js', { file: /channel-account-dialogs\.js$/, from: '  if (!scopes.length || !v.show) return null;', to: '  if (!scopes.length) return null;' }).catch((e) => ok(false, 'CONTROL bundle (no narrow verdict)', e.message));

// ── the stub server (synthesized — never anyone's data)
const NOW = Date.now();
const PRESETS = [{ key: 'co', label: 'Company app' }];
const acct = (id, label, extra = {}) => ({ id, kind: 'lark', label, connectable: true, enabled: true, credentialKey: 'cluster:co', presets: PRESETS, credentials: [], auth: { state: 'connected', user: 'Carol' }, authState: 'ok', authCause: null, authSince: null, lastPass: { at: NOW - 60e3, ok: true }, consentChain: null, grants: [], ...extra });
const MORE = (n) => [{ what: 'more', n, scopes: [], missing: [], refused: [], console: false, wanted: true }];
const WALKING = acct('lark:a', 'Lark 走链', { consentChain: { page: 2, total: 3 }, grants: MORE(165), flow: { flowId: 'f-a', mode: 'fixed', running: true, done: false, chain: { page: 2, total: 3 } } });
const LEFT_APP = acct('lark:b', 'Lark 应用清单', { grants: MORE(165) });
const LEFT_FLOOR = acct('lark:c', 'Lark 内置清单', { grants: MORE(165) });
let adapters = [WALKING, LEFT_APP, LEFT_FLOOR];
const WIDE = ['auth:user.id:read', 'im:message:readonly', 'im:message.group_msg:get_as_user', 'im:chat:read', 'docx:document', 'docx:document:readonly', 'drive:drive', 'sheets:spreadsheet', 'bitable:app', 'wiki:wiki:readonly', 'calendar:calendar:readonly'];
const flowOf = (id) => ({ flowId: `f-${id}`, mode: 'fixed', running: true, done: false, consentUrl: `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_co&state=${id}`, redirectUri: 'http://127.0.0.1:1/lark/cb', groups: [WIDE, ['minutes:minutes.media:export']], nextNarrow: WIDE, narrowed: null, optional: [...WIDE, 'minutes:minutes.media:export'], chain: { page: 1, total: 3 },
  ...(id === 'lark:c' ? { scopesFrom: 'floor', scopesWhy: 'lark app scopes: Access denied (99991672)', lacking: [] } : { scopesFrom: 'app', scopesWhy: null, lacking: [] }) });
const rowsOf = (id, n, title) => Array.from({ length: n }, (_, i) => ({ key: `${id}/c${i}`, adapterId: id, id: 'c' + i, title: `${title} ${i + 1}`, kind: 'group', lastAt: NOW - (i + 1) * 2.5e6, lastText: `note ${i + 1}`, unread: 0, freshness: { state: 'live', seconds: 30 } }));
const convs = [...rowsOf('lark:a', 3, '项目群'), ...rowsOf('lark:b', 3, '周会'), ...rowsOf('lark:c', 3, '值班')];
const digestNow = () => ({ adapters, kinds: [], counts: { all: convs.length, byAdapter: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).length])) }, heads: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).map((c) => c.key)])), conversations: convs });
const files = { '/style.css': [path.join(repo, 'public/style.css'), 'text/css'] };
const posted = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '760px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (files[u.pathname]) { res.writeHead(200, { 'Content-Type': files[u.pathname][1] }); res.end(fs.readFileSync(files[u.pathname][0])); return; }
  if (u.pathname === '/api/channels') return json(digestNow());
  if (u.pathname === '/api/channels/rows') { const ad = u.searchParams.get('adapter') || u.searchParams.get('adapterId') || ''; const rows = convs.filter((c) => !ad || c.adapterId === ad); return json({ rows, next: null, total: rows.length }); }
  if (u.pathname === '/api/channel-groups') return json({ groups: [] });
  if (u.pathname === '/api/channels/oauth/mount-clients') return json({ clients: [] });
  const m = /^\/api\/channels\/adapters\/([^/]+)\/(reauthorize|auth\/cancel)$/.exec(u.pathname);
  if (m && req.method === 'POST') { req.on('data', () => {}); req.on('end', () => { const id = decodeURIComponent(m[1]); posted.push(`${m[2]} ${id}`); const a = adapters.find((x) => x.id === id); json(m[2] === 'reauthorize' ? { adapter: a, flow: flowOf(id) } : { ok: true, cancelled: true }); }); return; }
  if (u.pathname === '/api/user-state') { if (req.method === 'GET') return json({}); req.on('data', () => {}); req.on('end', () => json({ ok: true })); return; }
  json({ error: 'not in this harness' }, 404);
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
// ③'s server: THE REAL landing route (routes/channels.js) over a stub engine whose landing answers what the engine answers
// for a page that landed with a next page (or for the last page)
const express = require(path.join(repo, 'node_modules/express'));
const RT = require(path.join(repo, 'src/routes/channels.js'));
const LPORT = await freePort();
let landingAnswer = null;
RT.setup({ getEngine: () => ({ consentLandingOf: () => (r, o = {}) => CR.landingHtml(r, { lang: o.lang, name: 'Lark' }), oauthLanding: async () => landingAnswer }) });
const lapp = express(); lapp.use(express.json()); lapp.use(RT.router);
lapp.get('/next-authorize', (req, res) => res.type('html').send(`<!doctype html><title>next</title><p id="next">Lark consent page ${String(req.query.page || '')}</p>`));
const lsrv = http.createServer(lapp);
await new Promise((r) => lsrv.listen(LPORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('lark-consent-chain-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} try { lsrv.close(); } catch {} for (const d of [chromeDir, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, url, { ready = null } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url });
  if (ready) for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(ready).catch(() => false)) break; }
  await sleep(300);
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, close: () => { try { ws.close(); } catch {} } };
}
const PANEL_READY = `document.querySelectorAll('.chan-account .chan-sec-head').length === 3`;
const ROWS = `(() => { const out = {}; for (const s of document.querySelectorAll('.chan-account[data-adapter]')) {
  const ch = s.querySelector('[data-chan-chain]'), gr = s.querySelector('[data-chan-grants]'), hl = s.querySelector('.chan-sec-health-text');
  out[s.dataset.adapter] = { chain: ch ? (ch.querySelector('.chan-note-text') || {}).textContent : null, chainBtn: ch ? (ch.querySelector('button') || {}).textContent : null, chainShown: !!ch && ch.getBoundingClientRect().height > 0,
    grants: gr ? (gr.querySelector('.chan-note-text') || {}).textContent : null, grantsBtn: gr ? (gr.querySelector('button') || {}).textContent : null, health: hl ? hl.textContent : null };
} return out; })()`;

console.log('§1 THE ROW (zh, 760 px): a chain on page 2/3, an account with permissions left');
const d = await page(1000, 900, `http://127.0.0.1:${PORT}/?b=after.js`, { ready: PANEL_READY });
const R1 = await d.ev(ROWS);
const A = R1['lark:a'], B = R1['lark:b'];
ok(A && A.chain === '正在授权 第 2/3 页…（在打开的那个标签页里）' && A.chainBtn === '取消' && A.chainShown && A.grants === null && /^已连接/.test(A.health || ''),
  `① the walking account: «${A && A.chain}» + 「${A && A.chainBtn}」 under its health line «${A && (A.health || '').slice(0, 20)}…» — and NO «另外 N 项» line (the chain's pages are those)`, JSON.stringify(A));
ok(B && B.chain === null && B.grants === '继续授权以获取应用下一组权限，总计剩余 165 个权限（具体是哪些，授权时才知道）；现在的收发消息不受影响' && B.grantsBtn === '重新授权', /* int349: channel-row-notices' words (under the account's ⓘ) */ `① an account with permissions left and no chain: «${B && B.grants}» + 「${B && B.grantsBtn}」`, JSON.stringify(B));
await d.shot('row.png');
await d.ev(`(() => { document.querySelector('[data-chan-chain="lark:a"] button').click(); return 1; })()`);
await sleep(300);
ok(posted.includes('auth/cancel lark:a'), '① 「取消」 ends the chain (the account\'s own sign-in Cancel; the pages granted stay)', posted.join(' | '));
await d.ev(`(async () => { window.__fire({ type: 'channels-updated', digest: { partial: true, conversations: [], adapters: ${JSON.stringify([{ ...WALKING, consentChain: null, flow: null, grants: [] }, LEFT_APP, LEFT_FLOOR])} } }); await new Promise((r) => setTimeout(r, 400)); return 1; })()`);
const R2 = (await d.ev(ROWS))['lark:a'];
ok(R2 && R2.chain === null && R2.grants === null && /^已连接/.test(R2.health || ''), '① the last page landed (a broadcast: no chain, nothing pending): the chain line goes, no «N more» line — the row says nothing more', JSON.stringify(R2));

console.log('§2 THE SIGN-IN DIALOG: the narrowing row only where Lark can refuse');
const dialogOf = async (pg, id) => {
  await pg.ev(`(() => { document.querySelector('[data-chan-grants="${id}"] button').click(); return 1; })()`);
  for (let i = 0; i < 30; i++) { await sleep(150); if (await pg.ev(`!!document.querySelector('#chan-reauth-dialog .mounts-btn-primary')`)) break; }
  await pg.ev(`(() => { document.querySelector('#chan-reauth-dialog .mounts-btn-primary').click(); return 1; })()`);
  for (let i = 0; i < 30; i++) { await sleep(150); if (await pg.ev(`!!document.querySelector('#chan-reauth-dialog .mounts-oauth-link')`)) break; }
  await sleep(200);
  const x = await pg.ev(`(() => { const dl = document.getElementById('chan-reauth-dialog'); const n = dl && dl.querySelector('.mounts-oauth-narrow'); return { link: !!(dl && dl.querySelector('.mounts-oauth-link')), narrow: n ? n.textContent : null, from: n ? n.dataset.from || null : null, opened: window.__openedUrl || null, text: dl ? dl.textContent.slice(0, 400) : null }; })()`);
  return x;
};
const closeDialog = (pg) => pg.ev(`(() => { const x = document.getElementById('chan-reauth-dialog'); const c = x && (x.closest('.modal-overlay, .dialog-overlay, .mounts-modal-backdrop') || x); if (c) c.remove(); window.__openedUrl = null; return 1; })()`);
const DA = await dialogOf(d, 'lark:b');
ok(DA.link && DA.opened && DA.narrow === null, '② the app\'s list was READ (scopesFrom app): the sign-in page opened, its link shown — and NO «不要这 11 项额外权限» row (Lark cannot refuse a consent naming only what the app enabled)', JSON.stringify(DA));
await d.shot('dialog-app.png');
await closeDialog(d);
const DF = await dialogOf(d, 'lark:c');
ok(DF.link && DF.narrow && DF.from === 'floor' && DF.narrow.startsWith('应用的权限列表没读到（lark app scopes: Access denied (99991672)），这次按内置清单请求；若 ') && /拒绝（错误 20027），可去掉这 11 项额外权限重试： 不含 这 11 项额外权限 重新登录$/.test(DF.narrow),
  `② the list could NOT be read (scopesFrom floor): the row is there and says why — «${DF.narrow && DF.narrow.slice(0, 90)}…»`, JSON.stringify(DF));
await d.shot('dialog-floor.png');
await closeDialog(d);
d.close();

console.log('§3 THE CHAIN LANDING in chrome, through the REAL landing route and its CSP');
const st = CR.stateOf({ origin: 'https://pod.example.test', flowId: 'ab'.repeat(8), issuedAt: Date.now(), kind: 'lark', chain: { page: 1, total: 3 } }, (c) => 'x'.repeat(43));
landingAnswer = { ok: true, why: null, user: 'Carol', error: null, next: { url: `http://127.0.0.1:${LPORT}/next-authorize?page=2&state=v1.next`, page: 2, total: 3 }, chain: { page: 1, total: 3 } };
const L = await page(800, 600, `http://127.0.0.1:${LPORT}/api/channels/oauth/cb/lark?code=c1&state=${encodeURIComponent(st)}`);
let at = null;
for (let i = 0; i < 30; i++) { at = await L.ev(`({ href: location.href, next: (document.getElementById('next') || {}).textContent || null, landing: document.body && document.body.dataset.landing || null })`).catch(() => null); if (at && at.next) break; await sleep(150); }
ok(at && at.next === 'Lark consent page 2' && /\/next-authorize\?page=2&state=v1\.next$/.test(at.href), `③ page 1's landing (data-landing="chain", the route's CSP default-src 'none') sent the SAME tab on to the next authorize address by itself: ${at && at.href}`, JSON.stringify(at));
L.close();
landingAnswer = { ok: true, why: null, user: 'Carol', error: null, next: null, chain: { page: 3, total: 3 } };
const L3 = await page(800, 600, `http://127.0.0.1:${LPORT}/api/channels/oauth/cb/lark?code=c3&state=${encodeURIComponent(st)}`);
await sleep(1500);
const z = await L3.ev(`({ landing: document.body.dataset.landing, refresh: !!document.querySelector('meta[http-equiv=refresh]'), script: [...document.scripts].map((s) => s.textContent).join('') })`);
ok(z && z.landing === 'ok' && !z.refresh && z.script === CR.CLOSE_SCRIPT, '③ the LAST page\'s landing goes nowhere and carries the close script (the tab closes itself as before)', JSON.stringify(z));
L3.close();

console.log('§4 CONTROLS');
if (fs.existsSync(path.join(dir, 'nochain.js'))) {
  const c = await page(1000, 900, `http://127.0.0.1:${PORT}/?b=nochain.js`, { ready: PANEL_READY });
  adapters = [WALKING, LEFT_APP, LEFT_FLOOR];
  const X = (await c.ev(ROWS))['lark:a'];
  ok(X && X.chain === null && X.health === '正在登录…', 'CONTROL — the panel without the chain line: an account that already works reads «正在登录…» while its page 2 waits, no page said — leg ① would be red', JSON.stringify(X));
  c.close();
}
if (fs.existsSync(path.join(dir, 'noverdict.js'))) {
  const c = await page(1000, 900, `http://127.0.0.1:${PORT}/?b=noverdict.js`, { ready: PANEL_READY });
  const X = await dialogOf(c, 'lark:b');
  ok(X.narrow && /11 项额外权限/.test(X.narrow), 'CONTROL — the dialog without the verdict: the app-road sign-in draws the dead «11 项额外权限» row — leg ② would be red', JSON.stringify(X));
  c.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
