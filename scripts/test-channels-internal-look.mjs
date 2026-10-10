#!/usr/bin/env node
// lane internal-rows-look — HEAVY (chrome, zero vendor calls, no product server): the Channels list tells VibeSpace's OWN
// talk apart from people and vendors at a glance (the owner, 2026-10-09: "这个 VibeSpace 内部的聊天群视觉上很难和其他的外部的
// 区分开" — seven agent rows and a Lark row read as one list). The REAL renderChannelsPanel (an esbuild iife of the tree)
// in headless chrome, zh, the light theme, over a stub HTTP server answering /api/channels (Lark with a picture, a Gmail
// thread, a Slack channel — each handed to an agent) + /api/channel-groups (the owner's shape: one agent group + six
// agent pairs) + /api/user-state (the block unfolded): ① every internal row sits inside ONE band under its head and wears
// the VibeSpace mark on an achromatic disc — no hue, no corner badge — with the muted kind chip; the head's mark is muted
// too; ② the three external rows keep their coloured discs, the Lark picture and their vendor marks, outside the band;
// ③ a group broadcast redraws IN PLACE: the band, the head and an unchanged row are the SAME nodes; ④ a click on the head
// folds the block to the head alone on the same band (and back); ⑤ at 390 px the same, nothing wider than the screen;
// CONTROL: the bundle rebuilt with the band made fresh at every draw (keep() bypassed) ⇒ ③ is red.
// IRL_TREE=<dir> bundles another tree (a base checkout: the suite is red there); IRL_SHOTS=<dir> [IRL_PREFIX=after]
// writes <prefix>.png (desk 1100 px), <prefix>-phone.png (390 px), <prefix>-folded.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tree = process.env.IRL_TREE ? path.resolve(process.env.IRL_TREE) : repo;
const SHOTS = process.env.IRL_SHOTS || '';
const PREFIX = process.env.IRL_PREFIX || 'after';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundle: the REAL panel of the tree (patch = {from, to} rewrites channels-panel.js for the control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('chan-internal-look');
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
await bundle('control.js', { from: "keep('internal-band', () => {", to: "((k, make) => make())('internal-band', () => {" }).catch((e) => ok(false, 'CONTROL bundle', e.message));

// ── the stub server: the owner's shape (synthesized — never the owner's data)
const NOW = Date.now(), H = 3600e3;
const pairs = [['VibeSpace 主开发', 'VibeSpace 设计台 (Fable)'], ['企业助手', 'VibeSpace 主开发'], ['生活方式助手', 'VibeSpace 主开发'], ['VibeSpace 主开发', 'VoiceLab大开发'], ['设备运维大师', 'VibeSpace 主开发'], ['生活方式助手', 'DreamVanLifeCodex']];
const groupsOf = (stamp = '') => [{ id: 'g-lanes', name: 'VibeSpace 车道群', members: ['a', 'b', 'c', 'd'], lastAt: NOW - 1 * H, lastText: 'VibeSpace 主开发 removed lane compose-chip-open (Opus)' + stamp, unread: 0 },
  ...pairs.map(([a, b], i) => ({ id: 'g-pair' + i, name: `${a} · ${b}`, members: [a, b], pair: [a, b], lastAt: NOW - (3 + i * 9) * H, lastText: ['q-022 收到，谢谢', 'Mart 已经在 Browser 面板对 Shared (legacy) 和 hanabi', '收到，谢谢——MemoryMax 作用域 + 单进程这条很好', '收到，谢谢——可用内存 13 G → 45 G', '已用 2.369.202 的 reply --all 在原线程重提', 'FYI from the house3d session'][i], unread: [0, 5, 3, 0, 0, 0][i] }))];
const agent = { principal: { id: 'claude:main', name: 'VibeSpace 主开发', kind: 'agent' }, source: 'conversation' };
const digest = {
  adapters: [{ id: 'lark:a', kind: 'lark', label: 'Lark' }, { id: 'gmail:a', kind: 'gmail', label: 'Gmail' }, { id: 'slack:a', kind: 'slack', label: 'Slack' }],
  kinds: [], counts: { all: 3, byAdapter: { 'lark:a': 1, 'gmail:a': 1, 'slack:a': 1 } }, heads: { 'lark:a': ['lark:a/oc_dana'], 'gmail:a': ['gmail:a/t1'], 'slack:a': ['slack:a/C1'] },
  conversations: [
    { key: 'lark:a/oc_dana', adapterId: 'lark:a', id: 'oc_dana', title: 'Dana', kind: 'p2p', peer: 'ou_dana1', lastAt: NOW - 1.5 * H, lastText: '[image]', unread: 0, assignment: agent },
    { key: 'gmail:a/t1', adapterId: 'gmail:a', id: 't1', title: 'Quarterly invoice — March', kind: 'thread', lastAt: NOW - 2 * H, lastText: 'Please find the invoice attached', unread: 1, assignment: agent },
    { key: 'slack:a/C1', adapterId: 'slack:a', id: 'C1', title: '#design-review', kind: 'channel', lastAt: NOW - 20 * H, lastText: 'The new mockups are up', unread: 0, assignment: agent },
  ],
};
const FACE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e8d9c4"/><circle cx="32" cy="26" r="13" fill="#b08868"/><rect x="12" y="44" width="40" height="20" rx="10" fill="#4a6b8a"/></svg>';
const files = { '/style.css': [path.join(tree, 'public/style.css'), 'text/css'] };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (files[u.pathname]) { res.writeHead(200, { 'Content-Type': files[u.pathname][1] }); res.end(fs.readFileSync(files[u.pathname][0])); return; }
  if (u.pathname.startsWith('/brand/')) { const f = path.join(tree, 'public', path.normalize(u.pathname)); if (f.startsWith(path.join(tree, 'public/brand/')) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(fs.readFileSync(f)); return; } }
  if (u.pathname === '/api/channels') return json(digest);
  if (u.pathname === '/api/channel-groups') return json({ groups: groupsOf() });
  if (u.pathname === '/api/user-state') return json(req.method === 'GET' ? { channelsPanelFolds: { internal: false } } : { ok: true });
  if (u.pathname === '/api/channels/avatar') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(FACE); return; }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not in this harness"}');
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('chan-internal-look-chrome');
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
  for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`document.querySelectorAll('.chan-groups .chan-grow').length >= 10 && [...document.querySelectorAll('img.chan-av-img')].some((i) => i.complete && i.naturalWidth > 0)`).catch(() => false)) break; }
  await sleep(300);
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(b.height)]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: Math.min(ww, w), height: Math.min(hh, 1400), scale: 1 }, captureBeyondViewport: true }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, close: () => { try { ws.close(); } catch {} } };
}

// the LOOK, read off the real DOM: the band, every row's avatar / badge / chip, computed colours' chroma
const LOOK = `(() => {
  const chroma = (c) => { const n = (String(c).match(/[\\d.]+/g) || []).map(Number); if (!n.length) return null; const v = /^color\\(/.test(c) ? n.slice(0, 3).map((x) => x * 255) : n.slice(0, 3); return Math.max(...v) - Math.min(...v); };
  const list = document.querySelector('.chan-groups');
  const band = list && list.querySelector(':scope > .chan-iband');
  const row = (r) => { const av = r.querySelector('.chan-av'), b = av && av.querySelector('.chan-av-badge'), ch = r.querySelector('.chan-src-chip'), m = b && b.querySelector('.chan-av-mark'), im = av && av.querySelector('img.chan-av-img');
    return { key: r.dataset.grow, inBand: !!band && band.contains(r), internal: r.classList.contains('chan-grow-internal'), vs: !!(av && av.classList.contains('chan-av-vs')), hue: av ? av.dataset.hue || null : null, svg: !!(av && av.querySelector(':scope > .chan-ic svg')), badge: !!b, mark: m ? m.dataset.mark : null, pic: !!(im && im.naturalWidth > 0), avChroma: av ? chroma(getComputedStyle(av).backgroundColor) : null, chip: ch ? ch.className : null, chipBg: ch ? getComputedStyle(ch).backgroundColor : null, tag: !!r.querySelector('.chan-grow-tag'), right: Math.round(r.getBoundingClientRect().right) }; };
  const hb = band && band.querySelector('.chan-ihead-badge');
  const bs = band ? getComputedStyle(band) : null;
  return { band: !!band, bandKids: band ? [...band.children].map((k) => k.className.split(' ')[0]) : [], headFirst: !!(band && band.firstElementChild && band.firstElementChild.matches('.chan-ihead')), bandBg: bs ? bs.backgroundColor : null, bandRule: bs ? bs.boxShadow : null, bandRadius: bs ? bs.borderTopLeftRadius : null, bandRight: band ? Math.round(band.getBoundingClientRect().right) : 0,
    headBadgeChroma: hb ? chroma(getComputedStyle(hb).backgroundColor) : null, rows: [...document.querySelectorAll('.chan-groups .chan-grow')].map(row), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth };
})()`;
const judge = (L, label) => {
  const inner = L.rows.filter((r) => r.key.startsWith('groups/') || r.internal), outer = L.rows.filter((r) => !inner.includes(r));
  ok(L.band && L.headFirst && L.bandKids.filter((k) => k === 'chan-grow').length === 7 && inner.length === 7 && inner.every((r) => r.inBand) && outer.every((r) => !r.inBand),
    `${label} ① the block is ONE band: the head first, the seven internal rows inside it, the three external rows outside`, JSON.stringify({ band: L.band, kids: L.bandKids, inner: inner.map((r) => [r.key, r.inBand]) }));
  ok(inner.every((r) => r.vs && r.hue === null && r.svg && !r.badge && r.avChroma !== null && r.avChroma < 12),
    `${label} ① every internal row (the group and the six pairs) wears the VibeSpace mark on an achromatic disc — no hue, no corner badge`, JSON.stringify(inner.map((r) => [r.key, r.vs, r.hue, r.svg, r.badge, r.avChroma])));
  ok(inner.every((r) => r.chip && r.chip.includes('chan-src-chip-internal') && /rgba\(0, 0, 0, 0\)|transparent/.test(r.chipBg)) && L.headBadgeChroma !== null && L.headBadgeChroma < 12,
    `${label} ① the internal kind chips are the muted variant (no fill) and the head's mark is muted too`, JSON.stringify({ chips: inner.map((r) => [r.chip, r.chipBg]), head: L.headBadgeChroma }));
  ok(/inset/.test(L.bandRule || '') && L.bandBg && !/rgba\(0, 0, 0, 0\)/.test(L.bandBg) && L.bandRadius === '8px',
    `${label} ② the band has a fill, the --radius corners and the 2 px inset left rule`, JSON.stringify({ bg: L.bandBg, rule: L.bandRule, radius: L.bandRadius }));
  const lark = outer.find((r) => r.key === 'lark:a/oc_dana'), gm = outer.find((r) => r.key === 'gmail:a/t1'), sl = outer.find((r) => r.key === 'slack:a/C1');
  ok(lark && lark.hue !== null && lark.pic && lark.badge && lark.mark === 'lark' && gm && gm.hue !== null && gm.mark === 'gmail' && gm.avChroma > 20 && sl && sl.hue !== null && sl.mark === 'slack' && outer.every((r) => !r.vs),
    `${label} ② people and vendors keep their look: Dana's picture + the Lark mark, the Gmail thread and the Slack channel on coloured discs with their vendor marks`, JSON.stringify(outer));
  ok(L.sw <= L.vw && L.bandRight <= L.vw && L.rows.every((r) => r.right <= L.vw), `${label} nothing wider than the screen`, JSON.stringify({ vw: L.vw, sw: L.sw, band: L.bandRight }));
};
const KEEP = (b) => `(async () => {
  const before = { band: document.querySelector('.chan-iband'), head: document.querySelector('.chan-ihead'), pair: document.querySelector('.chan-grow[data-grow="groups/g-pair3"]'), lanes: document.querySelector('.chan-grow[data-grow="groups/g-lanes"]') };
  window.__fire({ type: 'channel-groups-updated', groups: ${JSON.stringify(groupsOf(' · 已读'))} });
  await new Promise((r) => setTimeout(r, 120));
  const lanes = document.querySelector('.chan-grow[data-grow="groups/g-lanes"]');
  return { band: document.querySelector('.chan-iband') === before.band, head: document.querySelector('.chan-ihead') === before.head, pair: document.querySelector('.chan-grow[data-grow="groups/g-pair3"]') === before.pair,
    redrawn: !!lanes && lanes.textContent.includes('已读'), inBand: !!lanes && before.band.contains(lanes) && before.band.isConnected };
})()`;

console.log('§1 desk (1100 px, zh, light): the look');
const d = await page(1100, 900, 'b=after.js');
judge(await d.ev(LOOK), 'desk');
await d.shot(`${PREFIX}.png`);
console.log('§2 a broadcast redraws in place; the head folds');
const K = await d.ev(KEEP());
ok(K && K.band && K.head && K.pair && K.redrawn && K.inBand, '③ a group broadcast redraws IN PLACE: the band, the head and an unchanged pair row are the SAME nodes; the changed row redrew inside the kept band', JSON.stringify(K));
const F = await d.ev(`(async () => { const band = document.querySelector('.chan-iband'); document.querySelector('.chan-ihead').click(); await new Promise((r) => setTimeout(r, 150));
  const f = { same: document.querySelector('.chan-iband') === band, kids: band.children.length, head: !!band.querySelector(':scope > .chan-ihead.chan-ihead-folded'), rows: document.querySelectorAll('.chan-groups .chan-grow').length };
  return f; })()`);
ok(F && F.same && F.kids === 1 && F.head && F.rows === 3, '④ folded: the head alone on the SAME band; the three external rows stay', JSON.stringify(F));
await d.shot(`${PREFIX}-folded.png`);
const U = await d.ev(`(async () => { const band = document.querySelector('.chan-iband'); document.querySelector('.chan-ihead').click(); await new Promise((r) => setTimeout(r, 150)); return { same: document.querySelector('.chan-iband') === band, kids: band.children.length }; })()`);
ok(U && U.same && U.kids === 8, '④ unfolded again: the head + seven rows back in the same band', JSON.stringify(U));
d.close();
console.log('§3 phone (390 px)');
const ph = await page(390, 844, 'b=after.js&w=100%25');
judge(await ph.ev(LOOK), 'phone');
await ph.shot(`${PREFIX}-phone.png`);
ph.close();
console.log('§4 CONTROL: the band made fresh at every draw');
if (fs.existsSync(path.join(dir, 'control.js'))) {
  const cp = await page(1100, 900, 'b=control.js');
  const K0 = await cp.ev(KEEP());
  ok(K0 && !K0.band && K0.head, 'CONTROL: with keep() bypassed for the band, the same broadcast REPLACES the band (the head itself is still kept) — leg ③ would be red', JSON.stringify(K0));
  cp.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
