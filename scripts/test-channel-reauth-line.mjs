#!/usr/bin/env node
// lane channel-reauth-visible — HEAVY (chrome, zero vendor calls, no product server): THE DEAD SIGN-IN UNDER ITS ACCOUNT
// (the owner, 2026-10-23: 「进来之后账号行下方显示登录失效需要 reauth」; userW inc-mvl9qdru-dlew — every Gmail account's refresh
// refused, nothing said where he looked). The REAL renderChannelsPanel (an esbuild iife of the tree — the channels-fold-default
// harness) in headless chrome, zh, over a stub HTTP server: a Gmail account whose sign-in is dead (authState expired, its
// cause, since 07:14), one whose re-authorize is in flight (pending), and a Lark account that works.
// ① desk (1100 px): the red line is the FIRST line under the dead account's head — «登录失效 — 需要重新授权 · <cause> · 始于
// 07:14» + 「重新连接」 (red, the section's red left edge + the red dot), ONE sentence (the old error line is not drawn beside
// it); the in-flight one says «正在重新授权…（在打开的那个标签页里）» + 「取消」; the working account says nothing; ② folded, the
// line still shows; ③ 「重新连接」 opens THE account's Re-authorize dialog; ④ the first good pass (a broadcast) takes the line
// away LIVE — the same section node, no reload; ⑤ the phone (390 px): the same line, wrapped, nothing wider than the screen,
// a 36 px button. CONTROL (the bundle rebuilt without the line): ① is red.
// RAL_SHOTS=<dir> writes desk.png and phone.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.RAL_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundle: the REAL panel of the tree (patch = {from, to} rewrites channels-panel.js for the control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('chan-reauth-line');
async function bundle(name, patch = null) {
  const entry = `import { renderChannelsPanel } from ${JSON.stringify(path.join(repo, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm in this harness'); } }, openChannel: (a, id) => { window.__opened = [a, id]; } };
window.__fire = (m) => { for (const h of [...hs]) h(m); };
renderChannelsPanel(app, document.getElementById('host'));`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /channels-panel\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing'); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
await bundle('noline.js', { from: '  const dead = signinLine(app, a, kinds);', to: '  const dead = null;' }).catch((e) => ok(false, 'CONTROL bundle (no red line)', e.message));

// ── the stub server (synthesized — never anyone's data)
const NOW = Date.now(), H = 3600e3;
const at0714 = (() => { const d = new Date(NOW); d.setHours(7, 14, 0, 0); if (d.getTime() <= NOW) return d.getTime(); const sod = new Date(NOW); sod.setHours(0, 0, 0, 0); return Math.max(sod.getTime(), NOW - H); })(); // ci-351-reds (test-channel-row-notices' ci-350-red-2 fixture): a moment on TODAY'S calendar day, always — before 07:14 the old fallback NOW − 1 h crossed midnight (00:00–01:00) and the product rightly said «始于 昨天» while the pin expected a clock time
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const acct = (id, kind, label, extra = {}) => ({ id, kind, label, connectable: true, enabled: true, auth: { state: 'connected' }, authState: 'ok', authCause: null, authSince: null, presets: [], credentials: [], ...extra });
const DEAD = acct('gmail:a', 'gmail', 'Gmail', { auth: { state: 'expired', why: 'refresh-refused', user: 'alice@example.test' }, authState: 'expired', authCause: 'refresh-refused', authSince: at0714, lastPass: { at: NOW - 60e3, ok: false, code: 'auth-expired', error: 'gmail token refresh: Token has been expired or revoked. (400)' }, consecutiveFailures: 6 });
const PENDING = acct('gmail:b', 'gmail', 'Gmail', { auth: { state: 'expired', why: 'refresh-refused', user: 'bob@example.test' }, authState: 'pending', authCause: 'refresh-refused', authSince: at0714, flow: { flowId: 'f-1', mode: 'loopback', running: true, done: false } });
const LIVE = acct('lark:a', 'lark', 'Lark / 飞书', { auth: { state: 'connected', user: 'Carol' } });
let adapters = [DEAD, PENDING, LIVE];
const rowsOf = (id, n, title) => Array.from({ length: n }, (_, i) => ({ key: `${id}/c${i}`, adapterId: id, id: 'c' + i, title: `${title} ${i + 1}`, kind: 'group', lastAt: NOW - (i + 1) * 0.7 * H, lastText: `note ${i + 1}`, unread: 0, freshness: { state: 'live', seconds: 30 } }));
const convs = [...rowsOf('gmail:a', 4, 'Thread'), ...rowsOf('gmail:b', 3, 'Mail'), ...rowsOf('lark:a', 5, '项目群')];
const digestNow = () => ({ adapters, kinds: [], counts: { all: convs.length, byAdapter: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).length])) }, heads: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).map((c) => c.key)])), conversations: convs });
const files = { '/style.css': [path.join(repo, 'public/style.css'), 'text/css'] };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (files[u.pathname]) { res.writeHead(200, { 'Content-Type': files[u.pathname][1] }); res.end(fs.readFileSync(files[u.pathname][0])); return; }
  if (u.pathname === '/api/channels') return json(digestNow());
  if (u.pathname === '/api/channels/rows') { const ad = u.searchParams.get('adapter') || u.searchParams.get('adapterId') || ''; const rows = convs.filter((c) => !ad || c.adapterId === ad); return json({ rows, next: null, total: rows.length }); }
  if (u.pathname === '/api/channel-groups') return json({ groups: [] });
  if (u.pathname === '/api/user-state') { if (req.method === 'GET') return json({}); req.on('data', () => {}); req.on('end', () => json({ ok: true })); return; }
  json({ error: 'not in this harness' }, 404);
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('chan-reauth-line-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} for (const d of [chromeDir, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, query) {
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
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${query}` });
  for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`document.querySelectorAll('.chan-account .chan-sec-head').length === 3`).catch(() => false)) break; }
  await sleep(300);
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(Math.min(b.height, 900))]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: ww, height: hh, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, close: () => { try { ws.close(); } catch {} } };
}

// every account section as drawn: the red line (its words, its verb, its place, its paint), the dot, the edge, the old error line
const SECS = `(() => {
  const out = {};
  const vis = (el) => !!el && el.getBoundingClientRect().height > 0;
  for (const s of document.querySelectorAll('.chan-account[data-adapter]')) {
    const line = s.querySelector('.chan-sec-reauth');
    const b = line && line.querySelector('.chan-sec-reauth-btn');
    const kids = [...s.children];
    out[s.dataset.adapter] = {
      line: line ? (line.querySelector('.chan-sec-reauth-text') || {}).textContent : null, shown: vis(line), state: line ? line.dataset.state : null,
      afterHead: !!line && kids.indexOf(line) === kids.findIndex((k) => k.classList.contains('chan-sec-head')) + 1,
      btn: b ? b.textContent : null, btnH: b ? Math.round(b.getBoundingClientRect().height) : 0, color: line ? getComputedStyle(line).color : '', btnBg: b ? getComputedStyle(b).backgroundColor : '',
      edge: getComputedStyle(s).boxShadow, dead: s.classList.contains('chan-sec-dead'), dot: (s.querySelector('.chan-sec-head .chan-dot') || {}).className || '',
      errline: !!s.querySelector('.mounts-errline'), folded: s.classList.contains('chan-collapsed'), right: Math.round(s.getBoundingClientRect().right), lineRight: line ? Math.round(line.getBoundingClientRect().right) : 0,
      lines: line ? Math.round(line.getBoundingClientRect().height) : 0,
    };
  }
  return { secs: out, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, red: getComputedStyle(document.documentElement).getPropertyValue('--red').trim() };
})()`;
const RED_RE = /^rgb\((2[0-5]\d|1[6-9]\d), (\d{1,2}|1[0-2]\d), (\d{1,2}|1[0-2]\d)\)$/;   // a red: R high, G and B low (the theme's --red)
const first = (S, label) => {
  const { 'gmail:a': D, 'gmail:b': P, 'lark:a': L } = S.secs;
  ok(D && D.line === `登录失效 — 需要重新授权 · 服务方拒绝了刷新令牌 · 始于 ${hhmm(at0714)}` && D.shown && D.afterHead && D.btn === '重新连接' && D.state === 'expired',
    `${label} ① the dead account: the FIRST line under its head says what, why and since when — «${D && D.line}» + 「${D && D.btn}」`, JSON.stringify(D));
  ok(D && RED_RE.test(D.color) && RED_RE.test(D.btnBg || '') === false && D.dead && /inset/.test(D.edge) && /chan-dot-bad/.test(D.dot) && !D.errline,
    `${label} ① …in red (${D && D.color}), the section's red left edge (${D && D.edge}) and red dot; ONE sentence — the old error line is not drawn beside it`, JSON.stringify(D));
  ok(P && P.line === '正在重新授权…（在打开的那个标签页里）' && P.btn === '取消' && P.state === 'pending' && P.dead && L && L.line === null && !L.dead && !/chan-dot-bad/.test(L.dot),
    `${label} ① a re-authorize in flight says «${P && P.line}» + 「${P && P.btn}」; the working Lark account says nothing`, JSON.stringify({ P, L }));
  ok(S.sw <= S.vw && Object.values(S.secs).every((s) => s.right <= S.vw && s.lineRight <= S.vw), `${label} nothing wider than the screen`, JSON.stringify({ vw: S.vw, sw: S.sw }));
};

console.log('§1 desk (1100 px, zh, light): the dead sign-in under its account');
const d = await page(1100, 900, 'b=after.js');
first(await d.ev(SECS), 'desk');
await d.shot('desk.png');

console.log('§2 folded, the line still shows');
await d.ev(`(() => { document.querySelector('.chan-account[data-adapter="gmail:a"] > .chan-sec-head').click(); return 1; })()`);
await sleep(200);
const F = (await d.ev(SECS)).secs['gmail:a'];
ok(F.folded && F.shown && F.line && F.line.startsWith('登录失效'), '② the person folds the account: its rows go, the red line stays (a folded section still says it)', JSON.stringify(F));
await d.ev(`(() => { document.querySelector('.chan-account[data-adapter="gmail:a"] > .chan-sec-head').click(); return 1; })()`);
await sleep(200);

console.log('§3 「重新连接」 opens THE account\'s Re-authorize dialog');
await d.ev(`(() => { document.querySelector('.chan-account[data-adapter="gmail:a"] .chan-sec-reauth-btn').click(); return 1; })()`);
let dlg = null;
for (let i = 0; i < 20 && !dlg; i++) { await sleep(150); dlg = await d.ev(`(() => { const x = document.getElementById('chan-reauth-dialog'); return x ? (x.textContent || '').slice(0, 200) : null; })()`); }
ok(dlg && /重新授权/.test(dlg) && /alice@example\.test|Gmail/.test(dlg), '③ 「重新连接」 opens the account\'s Re-authorize dialog (the same road — the account kept)', dlg);
await d.ev(`(() => { const x = document.getElementById('chan-reauth-dialog'); const c = x && (x.closest('.modal-overlay, .dialog-overlay') || x); if (c) c.remove(); return 1; })()`);

console.log('§4 the first good pass takes the line away — live, through the broadcast');
const LIVEGO = `(async () => {
  const sec = document.querySelector('.chan-account[data-adapter="gmail:a"]');
  window.__fire({ type: 'channels-updated', digest: { partial: true, conversations: [], adapters: ${JSON.stringify([{ ...DEAD, auth: { state: 'connected', user: 'alice@example.test' }, authState: 'ok', authCause: null, authSince: null, lastPass: { at: NOW, ok: true, code: null }, consecutiveFailures: 0 }, PENDING, LIVE])} } });
  await new Promise((r) => setTimeout(r, 400));
  return { same: document.querySelector('.chan-account[data-adapter="gmail:a"]') === sec };
})()`;
const G = await d.ev(LIVEGO);
const G2 = (await d.ev(SECS)).secs['gmail:a'];
ok(G.same && G2.line === null && !G2.dead && !/chan-dot-bad/.test(G2.dot), '④ a broadcast whose account view says ok: the line, the edge and the red dot are gone — the same section node, no reload', JSON.stringify({ G, G2 }));
d.close();

console.log('§5 phone (390 px): the same line, stacked');
const ph = await page(390, 844, 'b=after.js&w=100%25');
first(await ph.ev(SECS), 'phone');
const PD = (await ph.ev(SECS)).secs['gmail:a'];
ok(PD.btnH >= 36 && PD.lines > 40, `phone ⑤ the line wraps (its box ${PD.lines} px tall) and its 「重新连接」 is a 36 px target (${PD.btnH} px)`, JSON.stringify(PD));
await ph.shot('phone.png');
ph.close();

console.log('§7 lane lark-refresh-stall: a Lark sign-in lost to a hub stall says the TRUE cause and the stall — never «another VibeSpace»');
{
  // the owner's hub 2026-10-27: an 89.5-min NFS hold, then 20064 — the row said «你的账号在另一个 VibeSpace 上登录了这个应用»
  const LOST = acct('lark:a', 'lark', 'Lark / 飞书', { auth: { state: 'expired', why: 'refresh-refused', user: 'Carol' }, authState: 'expired', authCause: 'refresh-lost', authHeldMs: 89.5 * 60e3, authSince: at0714, lastPass: { at: NOW - 60e3, ok: false, code: 'auth-expired', error: 'lark token refresh: The refresh token has been revoked. (20064)' } });
  adapters = [DEAD, PENDING, LOST];
  const lp = await page(1100, 900, 'b=after.js');
  const L = (await lp.ev(SECS)).secs['lark:a'] || {};
  ok(typeof L.line === 'string' && L.line.startsWith('登录失效') && L.line.includes('hub 在刷新令牌时卡住了 90 分钟（NAS/磁盘），飞书的一次性刷新令牌已被用掉') && !/另一个 VibeSpace/.test(L.line), `⑦ the Lark row's red line names the stall (zh): «${L.line}»`, JSON.stringify(L));
  await lp.shot('lark-refresh-lost.png');
  lp.close();
  adapters = [DEAD, PENDING, LIVE];
}

console.log('§6 CONTROL: the bundle rebuilt without the red line');
if (fs.existsSync(path.join(dir, 'noline.js'))) {
  const c = await page(1100, 900, 'b=noline.js');
  const X = (await c.ev(SECS)).secs['gmail:a'];
  ok(X.line === null && X.errline, 'CONTROL: without it the dead account shows only the old error line, no 「重新连接」 line — leg ① would be red', JSON.stringify(X));
  c.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
