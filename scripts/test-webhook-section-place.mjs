#!/usr/bin/env node
// lane webhook-section-place — HEAVY (chrome, zero vendor calls, no product server): the Channels panel's Webhook section
// (the owner, 2026-10-12: "这个新建路径其实应该放在webhook提示右侧看起来更直观一些。另外webhook应该保持在列表最后或者顶部，因为不是
// 自由添加的。"). The REAL renderChannelsPanel (an esbuild iife of the tree, the test-channels-internal-look harness) in
// headless chrome, zh, light, over a stub HTTP server whose digest lists the Webhook account FIRST, then two of the
// person's own accounts (Lark, Gmail), every section unfolded in user state:
//   ① desk (1100, the 520 px Channels window): "New path…" (glyph + word) is INSIDE the Webhook head row — the same row
//     as the name, right of it, left of the count chip and the ⋯; nothing covers it (elementFromPoint);
//   ② the Webhook section is the LAST account section (after Lark and Gmail, below them);
//   ③ a real mouse press on it opens the New path wizard and does NOT fold the section (no fold PATCH) — while a press on
//     the head's name does fold it (the harness can see a fold);
//   ④ a right-click on the head: the menu's FIRST row is New path…, and it opens the wizard;
//   ⑤ phone (390): the glyph alone (the word hidden, kept in its tooltip + aria-label), a ≥ 36 px target, still on the
//     head row, a tap opens the wizard without folding; nothing wider than the screen;
//   CONTROLS: the bundle rebuilt with the order rule bypassed ⇒ ② red; with the button appended outside the head row ⇒ ① red.
// WSP_SHOTS=<dir> writes desk.png, desk-menu.png, phone.png. WSP_TREE=<dir> bundles another tree (a base checkout: red).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tree = process.env.WSP_TREE ? path.resolve(process.env.WSP_TREE) : repo;
const SHOTS = process.env.WSP_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundles: the REAL panel of the tree (patch = {from, to} rewrites channels-panel.js for a control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('webhook-section-place');
async function bundle(name, patch = null) {
  const entry = `import { renderChannelsPanel } from ${JSON.stringify(path.join(tree, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm in this harness'); } }, openChannel: (a, id) => { window.__opened = [a, id]; } };
renderChannelsPanel(app, document.getElementById('host'));`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /channels-panel\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing: ' + patch.from); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: tree, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
await bundle('ctlorder.js', { from: 'accountSectionOrder(adapters.filter((a) => !a.builtin))', to: 'adapters.filter((a) => !a.builtin)' }).catch((e) => ok(false, 'CONTROL bundle (order)', e.message));
await bundle('ctlhead.js', { from: '      h.appendChild(np);', to: '      sec.appendChild(np);' }).catch((e) => ok(false, 'CONTROL bundle (head row)', e.message));

// ── the stub server (synthesized — never the owner's data): the Webhook account arrives FIRST
const NOW = Date.now(), H = 3600e3;
const digest = {
  adapters: [{ id: 'webhook', kind: 'webhook', label: 'Webhook', pushTransport: 'http-inbound' }, { id: 'lark:a', kind: 'lark', label: 'Lark' }, { id: 'gmail:a', kind: 'gmail', label: 'Gmail' }],
  kinds: [], counts: { all: 3, byAdapter: { webhook: 1, 'lark:a': 1, 'gmail:a': 1 } }, heads: { webhook: ['webhook/deploys'], 'lark:a': ['lark:a/oc_dana'], 'gmail:a': ['gmail:a/t1'] },
  conversations: [
    { key: 'webhook/deploys', adapterId: 'webhook', id: 'deploys', title: 'CI deploys', kind: 'dm', lastAt: NOW - 0.5 * H, lastText: 'deploy #412 finished', unread: 0 },
    { key: 'lark:a/oc_dana', adapterId: 'lark:a', id: 'oc_dana', title: 'Dana', kind: 'p2p', lastAt: NOW - 1.5 * H, lastText: '明天见', unread: 0 },
    { key: 'gmail:a/t1', adapterId: 'gmail:a', id: 't1', title: 'Quarterly invoice — March', kind: 'thread', lastAt: NOW - 2 * H, lastText: 'Please find the invoice attached', unread: 0 },
  ],
};
const FOLDS = { internal: false, accounts: false, 'acct:webhook': false, 'acct:lark:a': false, 'acct:gmail:a': false };
const patches = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (u.pathname === '/style.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(fs.readFileSync(path.join(tree, 'public/style.css'))); return; }
  if (u.pathname.startsWith('/brand/')) { const f = path.join(tree, 'public', path.normalize(u.pathname)); if (f.startsWith(path.join(tree, 'public/brand/')) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(fs.readFileSync(f)); return; } }
  if (u.pathname === '/api/channels') return json(digest);
  if (u.pathname === '/api/channel-groups') return json({ groups: [] });
  if (u.pathname === '/api/user-state') {
    if (req.method === 'GET') return json({ channelsPanelFolds: FOLDS });
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { patches.push(body); json({ ok: true }); }); return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not in this harness"}');
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('webhook-section-place-chrome');
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
  for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`document.querySelectorAll('.chan-part-body > .chan-sec[data-adapter]').length >= 3 && !!document.querySelector('[data-adapter="webhook"] .chan-row')`).catch(() => false)) break; }
  await sleep(300);
  // a REAL press at a point (CSS px): mouse moved, pressed, released — the browser's own hit test decides the target
  const press = async (x, y, button = 'left') => { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 }); await sleep(200); };
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(b.height)]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: Math.min(ww, w), height: Math.min(hh, h), scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, press, shot, close: () => { try { ws.close(); } catch {} } };
}

// THE HEAD, read off the real DOM: rects of the name / button / count / ⋯, the hit test, the label, the sections' order
const HEAD = `(() => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const sec = document.querySelector('.chan-part-body > .chan-sec[data-adapter="webhook"]');
  const head = sec && sec.querySelector(':scope > .chan-sec-head');
  const np = sec && sec.querySelector('[data-wh-new-path]');
  const lab = np && np.querySelector('.chan-wh-new-label');
  const nr = R(np), cx = nr ? (nr.l + nr.r) / 2 : 0, cy = nr ? (nr.t + nr.b) / 2 : 0;
  const hit = nr ? document.elementFromPoint(cx, cy) : null;
  const order = [...document.querySelectorAll('[data-part="accounts"] .chan-part-body > .chan-sec[data-adapter]')].map((e) => ({ id: e.dataset.adapter, ...R(e) }));
  return { inHead: !!(head && np && head.contains(np)), head: R(head), name: R(head && head.querySelector('.chan-sec-name')), np: nr, cnt: R(head && head.querySelector('.chan-sec-count')), more: R(head && head.querySelector('.chan-sec-more')),
    hit: !!(hit && np && np.contains(hit)), cx, cy, label: lab ? { shown: getComputedStyle(lab).display !== 'none' && lab.getBoundingClientRect().width > 0, text: lab.textContent } : null,
    title: np ? np.title : null, aria: np ? np.getAttribute('aria-label') : null, collapsed: !!(sec && sec.classList.contains('chan-collapsed')), order,
    vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth };
})()`;
const judgeHead = (D, label, { wide }) => {
  const sameRow = D.np && D.head && D.name && D.np.t >= D.head.t - 1 && D.np.b <= D.head.b + 1 && Math.abs((D.np.t + D.np.b) / 2 - (D.name.t + D.name.b) / 2) <= 4;
  ok(D.inHead && sameRow && D.np.l >= D.name.r && D.cnt && D.np.r <= D.cnt.l && D.more && D.np.r <= D.more.l && D.hit,
    `${label} ① New path… is INSIDE the Webhook head row: the name's row, right of the name, left of the count chip and the ⋯ — and the press point hits it`, JSON.stringify({ inHead: D.inHead, head: D.head, name: D.name, np: D.np, cnt: D.cnt, more: D.more, hit: D.hit }));
  if (wide) ok(D.label && D.label.shown && D.label.text === D.title && D.title, `${label} ① wide: the glyph AND the word ("${D.label && D.label.text}")`, JSON.stringify(D.label));
  else ok(D.label && !D.label.shown && D.title && D.title === D.aria && D.title === D.label.text && D.np.w >= 36 && D.np.h >= 36, `${label} ⑤ narrow: the glyph alone, the word in its tooltip + aria-label ("${D.title}"), a ${D.np && D.np.w}×${D.np && D.np.h} target`, JSON.stringify({ label: D.label, title: D.title, aria: D.aria, np: D.np }));
};
const judgeOrder = (D, label) => {
  const ids = D.order.map((o) => o.id), last = D.order[D.order.length - 1];
  ok(ids.join(',') === 'lark:a,gmail:a,webhook' && last && D.order.slice(0, -1).every((o) => o.b <= last.t + 1), `${label} ② the Webhook section is the LAST account section — after the person's Lark and Gmail, below them (the digest listed it first)`, JSON.stringify(D.order));
};
const WIZ = `(() => ({ wiz: !!document.querySelector('[data-wh-wizard]') }))()`;
const CLOSE = `(() => { document.querySelectorAll('.dialog-overlay, .dialog-form, .context-menu').forEach((e) => e.remove()); return true; })()`;
const foldPatches = () => patches.filter((b) => b.includes('acct:webhook')).length;

console.log('§1 desk (1100 px, the 520 px Channels window, zh, light)');
const d = await page(1100, 900, 'b=after.js');
const D = await d.ev(HEAD);
judgeHead(D, 'desk', { wide: true });
judgeOrder(D, 'desk');
await d.shot('desk.png');
console.log('§2 the press: the wizard opens, the section does not fold');
const p0 = foldPatches();
await d.press(D.cx, D.cy);
const A = await d.ev(`(() => ({ ...${WIZ}, collapsed: document.querySelector('.chan-sec[data-adapter="webhook"]').classList.contains('chan-collapsed') }))()`);
ok(A.wiz && !A.collapsed && !D.collapsed && foldPatches() === p0, '③ a mouse press on New path… opens the New path wizard; the section stays open and no fold is written', JSON.stringify({ ...A, before: D.collapsed, patches: patches.slice(p0) }));
await d.ev(CLOSE);
await d.press(D.name.l + 4, (D.name.t + D.name.b) / 2);
const F = await d.ev(`(() => ({ ...${WIZ}, collapsed: document.querySelector('.chan-sec[data-adapter="webhook"]').classList.contains('chan-collapsed') }))()`);
ok(F.collapsed && !F.wiz && foldPatches() === p0 + 1 && /"acct:webhook":true/.test(patches[patches.length - 1] || ''), '③ while a press on the head\'s name DOES fold it (and writes the fold) — the harness can see a fold', JSON.stringify({ ...F, patches: patches.slice(p0) }));
await d.press(D.name.l + 4, (D.name.t + D.name.b) / 2);
console.log('§3 the head\'s right-click menu');
await d.press(D.name.l + 4, (D.name.t + D.name.b) / 2, 'right');
const M = await d.ev(`(() => { const items = [...document.querySelectorAll('.context-menu .context-menu-item')]; return { n: items.length, first: items[0] ? items[0].textContent.trim() : null, title: document.querySelector('[data-wh-new-path]').title }; })()`);
ok(M.n > 1 && M.first === M.title && M.first, `④ the head's right-click menu (= its ⋯) opens with New path… ("${M.first}") as its first row`, JSON.stringify(M));
await d.shot('desk-menu.png');
await d.ev(`(() => { document.querySelector('.context-menu .context-menu-item').click(); return true; })()`);
await sleep(200);
ok((await d.ev(WIZ)).wiz, '④ that row opens the New path wizard');
d.close();

console.log('§4 phone (390 px)');
const ph = await page(390, 844, 'b=after.js&w=100%25');
const P = await ph.ev(HEAD);
judgeHead(P, 'phone', { wide: false });
judgeOrder(P, 'phone');
ok(P.sw <= P.vw && P.head && P.head.r <= P.vw, 'phone: nothing wider than the screen', JSON.stringify({ vw: P.vw, sw: P.sw, head: P.head }));
await ph.shot('phone.png');
const q0 = foldPatches();
await ph.press(P.cx, P.cy);
const PA = await ph.ev(`(() => ({ ...${WIZ}, collapsed: document.querySelector('.chan-sec[data-adapter="webhook"]').classList.contains('chan-collapsed') }))()`);
ok(PA.wiz && !PA.collapsed && foldPatches() === q0, '⑤ a tap on the glyph opens the wizard without folding the section', JSON.stringify(PA));
ph.close();

console.log('§5 CONTROLS');
if (fs.existsSync(path.join(dir, 'ctlorder.js'))) {
  const c = await page(1100, 900, 'b=ctlorder.js');
  const C = await c.ev(HEAD);
  ok(C.order.map((o) => o.id).join(',') === 'webhook,lark:a,gmail:a', 'CONTROL: with the order rule bypassed the Webhook section is listed FIRST (arrival order) — leg ② would be red', JSON.stringify(C.order.map((o) => o.id)));
  c.close();
}
if (fs.existsSync(path.join(dir, 'ctlhead.js'))) {
  const c = await page(1100, 900, 'b=ctlhead.js');
  const C = await c.ev(HEAD);
  ok(C.np && !C.inHead && !(C.np.t >= C.head.t - 1 && C.np.b <= C.head.b + 1 && C.np.r <= C.cnt.l), 'CONTROL: with the button appended outside the head row it leaves the name\'s row — leg ① would be red', JSON.stringify({ inHead: C.inHead, head: C.head, np: C.np }));
  c.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
