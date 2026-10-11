#!/usr/bin/env node
// lane channels-fold-default — HEAVY (chrome, zero vendor calls, no product server): the Channels list opens FOLDED (the
// owner, 2026-10-11: "能不能让 channels 默认收缩，不然翻找起来很困难" — his Lark alone opened with 81 conversations). The
// REAL renderChannelsPanel (an esbuild iife of the tree, the test-channels-internal-look harness) in headless chrome, zh,
// over a stub HTTP server: three accounts, 60 conversations — Lark (40, the owner's long list) and Gmail (12) with nothing
// that needs the person, Slack (8, two handed to an agent) — and an in-memory /api/user-state (PATCH merges, so a reload reads what was kept).
// ① first paint: Slack open, Lark and Gmail folded, each folded head saying its count + unread (no row of theirs drawn);
// ② a row that comes to need the person in folded Gmail raises the head's "need attention" + dot — Gmail stays folded,
// the same rows / nodes (no jumping list); ③ the person's open / close is user state and survives a reload both ways;
// ④ the filter finds a row inside folded Gmail (the section opens virtually, only its match, nothing written) and
// clearing it folds Gmail back; ⑤ the phone (390 px) — the same rule, nothing wider than the screen.
// CONTROLS (the bundle rebuilt): the person's choice ignored ⇒ ③ red; the default not held ⇒ ② red.
// FDF_TREE=<dir> bundles another tree (a base checkout: the suite is red there); FDF_SHOTS=<dir> writes desk.png
// (1100 px), phone.png (390 px) and desk-filter.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tree = process.env.FDF_TREE ? path.resolve(process.env.FDF_TREE) : repo;
const SHOTS = process.env.FDF_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundle: the REAL panel of the tree (patch = {from, to} rewrites channels-panel.js for a control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('chan-fold-default');
async function bundle(name, patch = null) {
  const entry = `import { renderChannelsPanel } from ${JSON.stringify(path.join(tree, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm in this harness'); } }, openChannel: (a, id) => { window.__opened = [a, id]; } };
window.__fire = (m) => { for (const h of [...hs]) h(m); };
renderChannelsPanel(app, document.getElementById('host'));`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /channels-panel\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing'); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: tree, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
await bundle('nomemory.js', { from: 'const choice = FOLDS ? FOLDS[accountFoldKey(a.id)] : null;', to: 'const choice = null;' }).catch((e) => ok(false, 'CONTROL bundle (no memory)', e.message));
await bundle('notheld.js', { from: 'if (!DEFAULT_FOLD.has(a.id)) DEFAULT_FOLD.set(', to: 'DEFAULT_FOLD.set(' }).catch((e) => ok(false, 'CONTROL bundle (default not held)', e.message));

// ── the stub server (synthesized — never the owner's data)
const NOW = Date.now(), H = 3600e3;
const agent = { principal: { id: 'claude:ops', name: 'Ops agent', kind: 'agent' }, source: 'conversation' };
const acct = (id, kind, label) => ({ id, kind, label, connectable: true, enabled: true, auth: { state: 'connected' } });
const adapters = [acct('lark:a', 'lark', 'Lark'), acct('gmail:a', 'gmail', 'Gmail'), acct('slack:a', 'slack', 'Slack')];
const rowsOf = (id, n, title, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ key: `${id}/c${i}`, adapterId: id, id: 'c' + i, title: `${title} ${i + 1}`, kind: 'group', lastAt: NOW - (i + 1) * 0.7 * H, lastText: `note ${i + 1}`, unread: i % 3, freshness: { state: 'live', seconds: 30 }, ...extra(i) }));
const convs = [
  ...rowsOf('lark:a', 40, '项目群'),
  ...rowsOf('gmail:a', 12, 'Thread', (i) => (i === 9 ? { title: 'Quarterly invoice zeta', lastText: 'Please find the invoice attached' } : {})),
  ...rowsOf('slack:a', 8, '#channel', (i) => (i === 1 || i === 5 ? { assignment: agent } : {})),
];
const byAdapter = Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).length]));
const heads = Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).slice(0, 30).map((c) => c.key)]));
const digest = { adapters, kinds: [], counts: { all: convs.length, byAdapter }, heads, conversations: convs };
let US = {};   // the user state — PATCH merges top-level keys (the server's rule), a reload reads it back
let patches = 0;
const files = { '/style.css': [path.join(tree, 'public/style.css'), 'text/css'] };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (files[u.pathname]) { res.writeHead(200, { 'Content-Type': files[u.pathname][1] }); res.end(fs.readFileSync(files[u.pathname][0])); return; }
  if (u.pathname.startsWith('/brand/')) { const f = path.join(tree, 'public', path.normalize(u.pathname)); if (f.startsWith(path.join(tree, 'public/brand/')) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(fs.readFileSync(f)); return; } }
  if (u.pathname === '/api/channels') return json(digest);
  if (u.pathname === '/api/channels/rows') {
    const q = (u.searchParams.get('q') || '').trim().toLowerCase(), ad = u.searchParams.get('adapter') || u.searchParams.get('adapterId') || '';
    const rows = convs.filter((c) => (!ad || c.adapterId === ad) && (!q || [c.title, c.lastText].some((x) => String(x).toLowerCase().includes(q))));
    return json({ rows, next: null, total: rows.length });
  }
  if (u.pathname === '/api/channel-groups') return json({ groups: [] });
  if (u.pathname === '/api/user-state') {
    if (req.method === 'GET') return json(US);
    let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { US = { ...US, ...JSON.parse(b) }; patches++; } catch {} json({ ok: true }); }); return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not in this harness"}');
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('chan-fold-default-chrome');
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
  const load = async () => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${query}` });
    for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`document.querySelectorAll('.chan-account .chan-sec-head').length === 3`).catch(() => false)) break; }
    await sleep(250);
  };
  await load();
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(b.height)]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: Math.min(ww, w), height: Math.min(hh, 1400), scale: 1 }, captureBeyondViewport: true }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, load, close: () => { try { ws.close(); } catch {} } };
}

// every account section as drawn: its fold, the head's words, the rows drawn and VISIBLE
const SECS = `(() => {
  const out = {};
  for (const s of document.querySelectorAll('.chan-account[data-adapter]')) {
    const f = s.querySelector('.chan-sec-fold'), vis = (el) => !!el && el.getBoundingClientRect().height > 0;
    const need = s.querySelector('.chan-sec-fold-need'), news = s.querySelector('.chan-sec-news');
    out[s.dataset.adapter] = { folded: s.classList.contains('chan-collapsed'), fold: s.dataset.fold, count: (s.querySelector('.chan-sec-count') || {}).textContent,
      bits: vis(f) ? f.textContent : '', need: f ? Number(f.dataset.need) : null, needColor: need ? getComputedStyle(need).color : '', dot: vis(news),
      rows: [...s.querySelectorAll('.chan-rows .chan-row')].filter(vis).map((r) => r.textContent.slice(0, 40)), right: Math.round(s.getBoundingClientRect().right) };
  }
  const part = document.querySelector('.chan-part[data-part="accounts"]');
  return { secs: out, accountsFolded: !!(part && part.classList.contains('chan-part-collapsed')), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
})()`;
const firstPaint = (S, label) => {
  const { 'lark:a': L, 'gmail:a': G, 'slack:a': K } = S.secs;
  ok(K && !K.folded && K.fold === 'open' && K.rows.length === 8 && L && L.folded && L.fold === 'folded' && L.rows.length === 0 && G && G.folded && G.rows.length === 0 && !S.accountsFolded,
    `${label} ① first paint: Slack (two rows handed to an agent) OPEN with its rows; Lark (40) and Gmail (12) — nothing needs the person — FOLDED, no row of theirs drawn; Accounts open`, JSON.stringify({ L: L && [L.folded, L.fold, L.rows.length], G: G && [G.folded, G.rows.length], K: K && [K.folded, K.rows.length], acc: S.accountsFolded }));
  ok(L.count === '40' && /^· \d+ 条未读$/.test(L.bits) && G.count === '12' && /^· 12 条未读$/.test(G.bits) && !G.dot && !L.dot && K.bits === '',
    `${label} ① each FOLDED head says what is inside — its count and unread ("40 · N 条未读", "12 · 12 条未读"); the open head draws no fold words`, JSON.stringify({ L: [L.count, L.bits], G: [G.count, G.bits], K: K.bits }));
  ok(S.sw <= S.vw && Object.values(S.secs).every((s) => s.right <= S.vw), `${label} nothing wider than the screen`, JSON.stringify({ vw: S.vw, sw: S.sw }));
};

console.log('§1 desk (1100 px, zh, light): the first paint');
const d = await page(1100, 900, 'b=after.js');
firstPaint(await d.ev(SECS), 'desk');
await d.shot('desk.png');

console.log('§2 a row that comes to need the person in folded Gmail');
const ARRIVE = `(async () => {
  const sec = document.querySelector('.chan-account[data-adapter="gmail:a"]'), box = sec.querySelector('.chan-rows'), kids = box.children.length;
  window.__fire({ type: 'channels-updated', digest: { partial: true, conversations: [{ key: 'gmail:a/c2', adapterId: 'gmail:a', id: 'c2', title: 'Thread 3', kind: 'group', lastAt: Date.now(), lastText: 'please look', unread: 1, freshness: { state: 'live', seconds: 1 }, assignment: ${JSON.stringify(agent)} }] } });
  await new Promise((r) => setTimeout(r, 200));
  const s2 = document.querySelector('.chan-account[data-adapter="gmail:a"]');
  return { same: s2 === sec && s2.querySelector('.chan-rows') === box, kids0: kids };
})()`;
const A = await d.ev(ARRIVE);
const S2 = (await d.ev(SECS)).secs['gmail:a'];
ok(A.same && S2.folded && S2.rows.length === 0 && S2.need === 1 && /1 需关注/.test(S2.bits) && S2.dot && S2.needColor && S2.needColor !== 'rgb(0, 0, 0)',
  '② Gmail stays FOLDED (the same section, the same rows box — no jumping list); its head now says "1 需关注" in the accent and wears the dot', JSON.stringify({ A, S2 }));

console.log('§3 the person\'s open / close is kept — a reload reads it back both ways');
const p0 = patches;
await d.ev(`(() => { document.querySelector('.chan-account[data-adapter="lark:a"] > .chan-sec-head').click(); document.querySelector('.chan-account[data-adapter="slack:a"] > .chan-sec-head').click(); return 1; })()`);
await sleep(300);
ok(patches === p0 + 2 && US.channelsPanelFolds && US.channelsPanelFolds['acct:lark:a'] === false && US.channelsPanelFolds['acct:slack:a'] === true,
  '③ opening Lark and folding Slack write the person\'s choices to user state (`acct:lark:a: false`, `acct:slack:a: true`)', JSON.stringify({ patches: patches - p0, folds: US.channelsPanelFolds }));
await d.load();
const R = (await d.ev(SECS)).secs;
ok(R['lark:a'] && !R['lark:a'].folded && R['lark:a'].rows.length === 30 && R['slack:a'].folded && R['slack:a'].rows.length === 0 && R['gmail:a'].folded,
  '③ after a RELOAD: Lark open (its first 30 rows) and Slack folded — the remembered fold wins over the default both ways', JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.folded, v.rows.length]]))));

console.log('§4 the filter finds a row inside a folded section');
await d.ev(`(() => { document.querySelector('.chan-account[data-adapter="lark:a"] > .chan-sec-head').click(); return 1; })()`);
await sleep(200);
const p1 = patches;
const FIND = (q) => `(async () => { const i = document.querySelector('input[data-channel-filter]'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 700)); return 1; })()`;
await d.ev(FIND('invoice zeta'));
const Q = (await d.ev(SECS)).secs;
ok(Q['gmail:a'].fold === 'filter' && !Q['gmail:a'].folded && Q['gmail:a'].rows.length === 1 && /Quarterly invoice zeta/.test(Q['gmail:a'].rows[0]) && Q['slack:a'].folded && Q['lark:a'].folded,
  '④ typing "invoice zeta": folded Gmail opens VIRTUALLY with its one match; Slack and Lark (no match) keep their folds', JSON.stringify(Object.fromEntries(Object.entries(Q).map(([k, v]) => [k, [v.fold, v.rows]]))));
await d.shot('desk-filter.png');
await d.ev(FIND(''));
const C = (await d.ev(SECS)).secs;
ok(C['gmail:a'].folded && C['gmail:a'].fold === 'folded' && C['gmail:a'].rows.length === 0 && patches === p1 && !('acct:gmail:a' in US.channelsPanelFolds),
  '④ the filter cleared: Gmail is folded again — the virtual open was never written (no PATCH)', JSON.stringify({ g: C['gmail:a'], patches: patches - p1 }));
d.close();

console.log('§5 phone (390 px): the same rule');
US = {};
const ph = await page(390, 844, 'b=after.js&w=100%25');
firstPaint(await ph.ev(SECS), 'phone');
await ph.shot('phone.png');
ph.close();

console.log('§6 CONTROLS: the bundle rebuilt without each half');
if (fs.existsSync(path.join(dir, 'nomemory.js'))) {
  US = {};
  const c1 = await page(1100, 900, 'b=nomemory.js');
  await c1.ev(`(() => { document.querySelector('.chan-account[data-adapter="lark:a"] > .chan-sec-head').click(); return 1; })()`);
  await sleep(300);
  await c1.load();
  const X = (await c1.ev(SECS)).secs['lark:a'];
  ok(US.channelsPanelFolds && US.channelsPanelFolds['acct:lark:a'] === false && X.folded, 'CONTROL: the person\'s choice ignored — the open was written yet Lark is folded again after the reload (leg ③ would be red)', JSON.stringify({ folds: US.channelsPanelFolds, X }));
  c1.close();
}
if (fs.existsSync(path.join(dir, 'notheld.js'))) {
  US = {};
  const c2 = await page(1100, 900, 'b=notheld.js');
  await c2.ev(ARRIVE);
  const Y = (await c2.ev(SECS)).secs['gmail:a'];
  ok(!Y.folded && Y.rows.length === 12, 'CONTROL: the default re-decided at every draw — the arriving row OPENS Gmail under the person\'s hand (leg ② would be red)', JSON.stringify(Y));
  c2.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
