#!/usr/bin/env node
// THE OUTBOX WINDOW IN A BROWSER (lane outbox-window-scroll-filter; the owner, 2026-10-22, the Outbox window 「发件箱」 at
// 2.369.342: «1 条待我审批 这一条在哪呢？而且这个界面需要优化下» + «这个窗口里不能滚动，只能拉长窗口才能看到下面那个要发的消息，太弱智
// 了吧»). Gate row `test-channel-outbox-window`, heavy tier — a scratch copy of this tree served by a REAL server, headless
// chrome, the UI in zh (the owner's language).
//
// ZERO vendor calls and no store seeding: the two reads the window makes — GET /api/channels/outbox and GET
// /api/channels/api — are answered by chrome's Fetch domain with THE OWNER'S SHAPE (157 message proposals, ONE waiting;
// 20 raw-API calls, all executed or refused — 12 deletes, 3 uploads to one folder, the rest refused).
//
//   ① 「待审批」 in the window's OWN 600 px: the list is the window's one scroll container (the toolbar over it, nothing
//      beside it); the waiting message is the FIRST row and on screen with no scroll and no resize — a press at the
//      centre of its 「批准…」 lands on it; the API section is ONE folded line with 「在「全部」里看」; no executed / refused row
//   ② 「批准…」 opens the card under its row with the keyboard on its Approve — the action is reachable
//   ③ 「全部」: scrollHeight > clientHeight, scrollTop moves (400 px) and the window keeps its 600 px; the last row is
//      reached at the bottom of the scroll
//   ④ every height: the window at 260 px — the list shrinks, the waiting row is still reached (scrolled to, then hit)
//   ⑤ the API rows are cards: «大开发 · 删除消息» · «删除 · 总是询问» · «×n» · «已执行»; no id / HTTP status /
//      size on any row; a row opens the card of each of its calls, whose ONE closed 技术细节 fold holds «对象 id：om_…»
//      and «返回：HTTP 200 · 36 B»
//   ⑥ RED CONTROL = the base's shape (THIS source with the API section mounted BESIDE the list, outside the census, and
//      the style without its two no-shrink rules — a shallow clone has no history to build the base from): at the same
//      600 px the waiting row is not where a press lands, executed rows sit under 「待审批」, the head counts 157
// PNGs (for the owner): $OUTBOX_WINDOW_SHOTS (default: <scratch>/shots, removed with it) outbox-awaiting-zh.png, outbox-all-zh.png,
// outbox-fold-zh.png, outbox-base-zh.png. Run: node scripts/test-channel-outbox-window.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v || Date.now() > end) return v; await sleep(150); } };

const VNC_ENV = await vncEnv();
const ROOT = scratch('outbox-window');
const wt = path.join(ROOT, 'wt');
const SHOTS = process.env.OUTBOX_WINDOW_SHOTS || path.join(ROOT, 'shots');
for (const d of [wt, SHOTS]) fs.mkdirSync(d, { recursive: true });
const fakeHome = scratchHome('outbox-window-home', fs);
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-window-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-window-run-'));
fs.chmodSync(chromeRun, 0o700);
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const build = (out) => execSync(`npx esbuild src/client.js --bundle --outfile=${out} --format=iife --platform=browser --target=es2020 --loader:.css=css`, { cwd: wt, stdio: 'ignore' });
// THE CONTROL BUNDLE + STYLE first — the base's shape: the API section BESIDE the list, drawing itself outside the census
const OBX = path.join(wt, 'src/lib/channel-outbox.js'), obxSrc = fs.readFileSync(OBX, 'utf-8');
const MOUNT = "  const apiSec = apiOutboxSection(app, { onRecords: (recs) => { apiCards = recs; draw(last); }, onAll });\n";
const PASS = "    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview, apiCards, apiSection: apiSec, onAll });\n";
const CSS = path.join(wt, 'public/style.css'), cssSrc = fs.readFileSync(CSS, 'utf-8');
const NOSHRINK = ['\n.chan-outbox > .jobs-toolbar { flex-shrink: 0; }', '\n.chan-outbox-list > * { flex-shrink: 0; }'];
ok(obxSrc.split(MOUNT).length === 2 && obxSrc.split(PASS).length === 2 && NOSHRINK.every((r) => cssSrc.split(r).length === 2), 'the control has its lines to cut: the API section mounted once and handed to the census once; the two no-shrink rules');
// …and one row per call, as the base drew them (no runs)
const VIEW = path.join(wt, 'src/lib/channel-api-card-view.js'), viewSrc = fs.readFileSync(VIEW, 'utf-8');
const RUNS = '    const runs = S.folded ? [] : runsOf(S.items, (r) => C.rowModel(r, { now }).runKey);\n';
ok(viewSrc.split(RUNS).length === 2, 'the control has its line to cut: the API rows are drawn as runs once');
fs.writeFileSync(OBX, obxSrc.replace(MOUNT, '  const apiSec = apiOutboxSection(app);\n  root.insertBefore(apiSec.el, list);\n').replace(PASS, '    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview, onAll });\n'));
fs.writeFileSync(VIEW, viewSrc.replace(RUNS, '    const runs = S.items.map((r) => ({ key: r.id, items: [r] }));\n'));
build('public/bundle-control.js');
fs.writeFileSync(OBX, obxSrc);
fs.writeFileSync(VIEW, viewSrc);
fs.writeFileSync(path.join(wt, 'public/style-control.css'), NOSHRINK.reduce((s, r) => s.replace(r, ''), cssSrc));
build('public/bundle.js');

// THE OWNER'S SHAPE
const NOW = Date.now();
const LARK = { adapterId: 'lark', adapterLabel: 'Lark / 飞书', convKind: 'group', draftedBy: { kind: 'agent', id: 'a-1', name: '大开发' }, sendAs: 'user', identity: { sentAs: 'user', marking: 'none' }, policy: { mode: 'review', reasons: ['channel-policy'] } };
const MSGS = [];
for (let i = 0; i < 157; i++) MSGS.push({ ...LARK, id: `p-ow${i}`, convId: `oc_ow${i % 7}`, title: `项目群 ${i % 7}`, state: i === 101 ? 'awaiting-approval' : i % 9 ? 'sent' : 'rejected', text: i === 101 ? '今晚的发版说明：2.369.343 修好了发件箱的滚动。' : `第 ${i} 条消息`, at: NOW - (157 - i) * 60e3, updatedAt: NOW - (157 - i) * 60e3, ttlAt: NOW + 86400e3 });
const PEND = MSGS[101];
const apiRec = (i, o) => ({ id: `api-ow${i}`, cred: 'lark-1', credLabel: 'Lark · ops', host: 'open.feishu.cn', headers: { 'content-type': 'application/json' }, digest: `d-${i}`, at: NOW - 3600e3 + i * 60e3, tier: 'write-ask', ...o });
const DEL = (i) => apiRec(i, { status: 'ran', principal: { name: '大开发' }, method: 'DELETE', path: `/open-apis/im/v1/messages/om_x100b4${i}aa7c3e`, sensitive: 'delete', result: { status: 200, bytes: 36 } });
const UP = (i) => apiRec(i, { status: 'ran', principal: { name: '杂活' }, method: 'POST', path: '/open-apis/drive/v1/files/upload_all', body: JSON.stringify({ parent_node: 'doxlgPqF7a2b3c4d5e6f', file_name: `r${i}.png` }), bodyBytes: 512, sensitive: 'upload', result: { status: 200, bytes: 88 } });
const APIS = [];
for (let i = 0; i < 20; i++) APIS.push(i >= 4 && i < 7 ? UP(i) : i % 6 === 5 ? { ...DEL(i), status: 'rejected', decidedBy: 'user', result: null } : DEL(i));
const OUTBOX = { proposals: MSGS, accounts: [{ id: 'lark', kind: 'lark', label: 'Lark / 飞书' }] };

const PORT = await freePort(), CDP_PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, PATH: `${path.join(wt, 'data/bin')}:${process.env.PATH}`, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' },
});
for (const s of [srv.stdout, srv.stderr]) s.on('data', (d) => { srvLog.push(String(d)); if (srvLog.length > 400) srvLog.shift(); });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: `:${200 + (process.pid % 500)}` } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const r of [ROOT, fakeHome]) { try { endRootedProcesses(r); } catch {} }
  if (!process.env.OUTBOX_WINDOW_KEEP) for (const d of [ROOT, fakeHome, chromeHome, chromeRun]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
ok(await until(async () => (await fetch(`${BASE}/api/home`)).ok, 40000), 'the scratch server booted', srvLog.join('').slice(-600));

// ── CHROME ──
const WebSocket = require('ws');
await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).ok, 20000);
async function newPage({ control = false } = {}) {
  const tgt = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map(), on = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method && on.has(m.method)) on.get(m.method)(m.params); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  // the two store reads answered with the owner's shape; the control page also takes the base-shaped bundle + style
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64');
  const served = { outbox: 0, api: 0 };
  on.set('Fetch.requestPaused', (p) => {
    const u = new URL(p.request.url);
    const reply = (type, body) => cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }], body });
    if (p.request.method === 'GET' && u.pathname === '/api/channels/outbox') { served.outbox++; return reply('application/json', b64(OUTBOX)); }
    if (p.request.method === 'GET' && u.pathname === '/api/channels/api') { served.api++; return reply('application/json', b64({ cards: APIS })); }
    if (control && u.pathname === '/bundle.js') return reply('application/javascript', fs.readFileSync(path.join(wt, 'public/bundle-control.js')).toString('base64'));
    if (control && u.pathname === '/style.css') return reply('text/css', fs.readFileSync(path.join(wt, 'public/style-control.css')).toString('base64'));
    return cdp('Fetch.continueRequest', { requestId: p.requestId });
  });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/channels/outbox*', requestStage: 'Request' }, { urlPattern: '*/api/channels/api', requestStage: 'Request' }, ...(control ? [{ urlPattern: '*/bundle.js*', requestStage: 'Request' }, { urlPattern: '*/style.css*', requestStage: 'Request' }] : [])] });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('vibespace.lang','zh')}catch{}" });
  await cdp('Page.navigate', { url: `${BASE}/` });
  const loaded = await until(() => evaljs("!!(window.app && window.app.wm && window.app.sidebar) && (() => { const l = document.getElementById('loading-screen'); return !l || !l.isConnected || getComputedStyle(l).display === 'none' || Number(getComputedStyle(l).opacity) === 0; })()"), 40000);
  const shot = async (file) => {
    const box = await evaljs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); if (!w) return null; const r = w.element.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) }; })()`);
    const r = await cdp('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 } } : {}) });
    if (r.result && r.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
    return !!(r.result && r.result.data);
  };
  return { cdp, evaljs, shot, loaded, served, close: () => { try { ws.close(); } catch {} } };
}
// THE MEASURE — the window, its list, the waiting row and what a press at its 「批准…」 hits; the visible API rows
const MEASURE = `(() => {
  const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox');
  if (!w) return null;
  const win = w.element, root = win.querySelector('.chan-outbox'), list = win.querySelector('.chan-outbox-list');
  const R = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }; };
  const lb = list.getBoundingClientRect();
  const inList = (e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.top >= lb.top - 1 && b.bottom <= lb.bottom + 1; };
  const pend = win.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}]');
  const btn = pend && pend.querySelector('[data-review]');
  let hit = false;
  if (btn) { const b = btn.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); hit = !!e && btn.contains(e); }
  const rows = [...list.querySelectorAll('.chan-orow')];
  const shown = (e) => !!e.offsetParent && e.getBoundingClientRect().height > 0;
  const apiHead = win.querySelector('.chan-api-outbox .chan-outbox-sec');
  const allBtn = apiHead && apiHead.querySelector('.chan-outbox-sec-all');
  return {
    win: R(win), list: { ...R(list), sh: list.scrollHeight, ch: list.clientHeight, st: list.scrollTop, overflowY: getComputedStyle(list).overflowY },
    kids: [...root.children].map((c) => c.className), summary: win.querySelector('.jobs-summary').textContent,
    first: rows[0] ? rows[0].dataset.orow || rows[0].dataset.key : null, pendIn: !!pend && list.contains(pend), pendVisible: !!pend && inList(pend), hit,
    apiRows: [...win.querySelectorAll('.chan-api-orow')].filter(shown).map((r) => ({ fate: r.dataset.fate, text: r.innerText.replace(/\\s+/g, ' ').trim() })),
    apiFolded: !!apiHead && shown(apiHead) && !!allBtn && shown(allBtn), allWords: allBtn ? allBtn.textContent : null, apiHeadWords: apiHead ? (apiHead.querySelector('.chan-outbox-sec-words') || apiHead).textContent : null,
    msgRows: rows.filter((r) => r.dataset.orow).length,
  };
})()`;
const openOutbox = (p) => p.evaljs(`(async () => { for (const w of [...app.wm.windows.values()]) if (w.type === 'channel-outbox') app.wm.closeWindow(w.id); app.openChannelOutbox(); for (let i = 0; i < 80; i++) { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); if (w && w.element.querySelector('.chan-orow[data-orow]') && w.element.querySelector('.chan-api-outbox .chan-outbox-sec, .chan-api-orow')) return true; await new Promise((r) => setTimeout(r, 150)); } return false; })()`);

const p1 = await newPage();
ok(p1.loaded, 'page 1 (zh, 1400 × 1000) loaded the app');
ok(await openOutbox(p1), 'the Outbox window opens and draws the owner\'s shape');
await sleep(400);
// ① 「待审批」 in the window's own 600 px
const m1 = await p1.evaljs(MEASURE);
ok(m1 && p1.served.outbox >= 1 && p1.served.api >= 1 && m1.summary === '1 条等你审批 · 共 177 条提案', '① the head is the census over the owner\'s shape: «1 条等你审批 · 共 177 条提案» (157 message proposals + 20 API calls)', m1 && m1.summary);
ok(m1 && m1.win.height <= 602 && m1.kids.length === 2 && /jobs-toolbar/.test(m1.kids[0]) && /chan-outbox-list/.test(m1.kids[1]) && m1.list.overflowY === 'auto' && m1.list.height > 300,
  `① the window keeps its 600 px and is the toolbar over ONE list (the list ${m1 && m1.list.height} px, overflow-y auto) — no section beside it`, m1 && { win: m1.win, kids: m1.kids, list: m1.list });
ok(m1 && m1.first === PEND.id && m1.pendIn && m1.pendVisible && m1.hit && m1.msgRows === 1,
  '① 「待审批」: the waiting message is the FIRST row, on screen with no scroll and no resize, and a press at its 「批准…」 lands on it', m1 && { first: m1.first, visible: m1.pendVisible, hit: m1.hit, rows: m1.msgRows });
ok(m1 && m1.apiRows.length === 0 && m1.apiFolded && m1.allWords === '在「全部」里看' && m1.apiHeadWords === 'API 调用 · 0 个等你决定 · 共 20 个',
  '① the API section (nothing of it waits) is ONE folded line «API 调用 · 0 个等你决定 · 共 20 个» + 「在「全部」里看」 — no executed or refused row under 「待审批」', m1 && { rows: m1.apiRows.slice(0, 3), folded: m1.apiFolded, words: m1.apiHeadWords });
ok(await p1.shot('outbox-awaiting-zh.png'), 'outbox-awaiting-zh.png');
// ② the action is reachable: 「批准…」 opens the card under its row, the keyboard on its Approve
const rv = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}] [data-review]').click(); await new Promise((r) => setTimeout(r, 300)); const card = w.element.querySelector('.chan-prop[data-proposal=${JSON.stringify(PEND.id)}]'); const a = document.activeElement; const lb = w.element.querySelector('.chan-outbox-list').getBoundingClientRect(), ab = a.getBoundingClientRect(); return { card: !!card, focused: !!card && card.contains(a) && a.hasAttribute('data-approve'), inView: ab.top >= lb.top - 1 && ab.bottom <= lb.bottom + 1, words: a.textContent }; })()`);
ok(rv && rv.card && rv.focused && rv.inView, '② 「批准…」 opens the waiting card under its row with the keyboard on its Approve, in view — the decision is reachable', rv);
// ③ 「全部」: the list scrolls; the window keeps its height; the last row is reached
await p1.evaljs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-seg [data-view="all"]').click(); return 1; })()`);
await sleep(500);
const m3 = await p1.evaljs(MEASURE);
const sc = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); const l = w.element.querySelector('.chan-outbox-list'); l.scrollTop = 400; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))); const at = l.scrollTop; l.scrollTop = l.scrollHeight; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))); const kids = [...l.querySelectorAll('.chan-orow, .chan-api-orow')]; const last = kids[kids.length - 1], lb = l.getBoundingClientRect(), b = last.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { at, bottom: Math.round(l.scrollTop + l.clientHeight) >= l.scrollHeight - 1, lastSeen: b.bottom <= lb.bottom + 1 && b.top >= lb.top - 1 && !!e && last.contains(e), win: Math.round(w.element.getBoundingClientRect().height) }; })()`);
ok(m3 && m3.msgRows === 157 && m3.list.sh > m3.list.ch && sc && sc.at === 400 && sc.bottom && sc.lastSeen && sc.win <= 602,
  `③ 「全部」: 157 message rows + the API rows in ONE list that scrolls (scrollHeight ${m3 && m3.list.sh} > clientHeight ${m3 && m3.list.ch}), scrollTop moves to 400, the last row is reached at the bottom — the window stays ${sc && sc.win} px`, { m3: m3 && m3.list, sc });
ok(await p1.shot('outbox-all-zh.png'), 'outbox-all-zh.png');
// ⑤ the API rows are cards + the fold
const api = await p1.evaljs(`(async () => {
  const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox');
  const rows = [...w.element.querySelectorAll('.chan-api-orow')];
  const face = rows.map((r) => ({ head: r.querySelector('.chan-api-orow-head').textContent, chip: r.querySelector('.chan-api-orow-chip').hidden ? '' : r.querySelector('.chan-api-orow-chip').textContent, n: r.querySelector('.chan-api-orow-count').hidden ? '' : r.querySelector('.chan-api-orow-count').textContent, out: r.querySelector('.chan-api-orow-out').textContent, text: r.innerText }));
  const del = rows.find((r) => /大开发 · 删除消息/.test(r.textContent) && r.dataset.fate === 'ran');
  del.scrollIntoView({ block: 'center' });
  del.click();
  await new Promise((r) => setTimeout(r, 300));
  const card = del.nextElementSibling;
  const fold = card && card.querySelector('details.chan-api-tech');
  const res = { face, count: Number(del.dataset.count), card: !!card && card.classList.contains('chan-api-card'), closed: !!fold && !fold.open, foldText: fold ? fold.textContent : '', head: !!(card && card.querySelector('.chan-api-head')) };
  if (fold) { fold.open = true; fold.scrollIntoView({ block: 'center' }); }
  return res;
})()`);
const faces = (api && api.face) || [];
ok(faces.length === 7 && faces.some((f) => f.head === '大开发 · 删除消息' && f.chip === '删除 · 总是询问' && f.out === '已执行') && faces.some((f) => f.head === '杂活 · 上传文件到文件夹' && f.n === '×3' && f.out === '已执行') && faces.some((f) => f.out === '已拒绝'),
  '⑤ the API rows read «大开发 · 删除消息» · «删除 · 总是询问» · «已执行» — the three uploads ONE row «杂活 · 上传文件到文件夹 ×3», a refused one «已拒绝» (20 calls, 7 rows)', faces.map((f) => `${f.head} | ${f.chip} | ${f.n} | ${f.out}`));
ok(faces.length && faces.every((f) => !/om_|doxlg|\b200\b|\d+ ?B\b|https?:|open-apis/.test(f.text)), '⑤ no row carries an id, an HTTP status, a size or a path', faces.map((f) => f.text));
ok(api && api.card && api.closed && !api.head && /对象 id：om_x100b4/.test(api.foldText) && /返回：HTTP 200 · 36 B/.test(api.foldText) && api.count >= 2,
  '⑤ a row opens the card of each of its calls (the row not repeated); its ONE closed 技术细节 fold holds «对象 id：om_…» and «返回：HTTP 200 · 36 B»', api && { count: api.count, closed: api.closed, fold: api.foldText.slice(0, 240) });
await sleep(200);
ok(await p1.shot('outbox-fold-zh.png'), 'outbox-fold-zh.png');
// ④ every height: back to 「待审批」, the window at 260 px — the list shrinks, the waiting row is reached
const m4 = await p1.evaljs(`(async () => { const w = [...app.wm.windows.values()].find((x) => x.type === 'channel-outbox'); w.element.querySelector('.chan-seg [data-view="awaiting"]').click(); w.element.style.height = '260px'; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200))); const row = w.element.querySelector('.chan-orow[data-orow=${JSON.stringify(PEND.id)}]'); row.scrollIntoView({ block: 'nearest' }); await new Promise((r) => setTimeout(r, 100)); return 1; })()`).then(() => p1.evaljs(MEASURE));
ok(m4 && m4.win.height <= 262 && m4.list.height > 0 && m4.pendVisible && m4.hit && m4.first === PEND.id,
  `④ at 260 px the list shrinks (${m4 && m4.list.height} px) and the waiting row is still reached — a press at its 「批准…」 lands on it`, m4 && { win: m4.win, list: m4.list, visible: m4.pendVisible, hit: m4.hit });
p1.close();

// ⑥ RED CONTROL — the base's shape, the same data, the same 600 px
const p2 = await newPage({ control: true });
ok(p2.loaded, 'page 2 (the control bundle + style) loaded the app');
ok(await openOutbox(p2), 'the control\'s Outbox window opens');
await sleep(400);
const m6 = await p2.evaljs(MEASURE);
ok(m6 && m6.kids.length === 3 && m6.list.height < 80 && !m6.pendVisible && !m6.hit && m6.apiRows.filter((r) => r.fate !== 'pending').length === 20 && m6.summary === '1 条等你审批 · 共 157 条提案',
  `⑥ RED CONTROL (the base's shape): the API section BESIDE the list squeezes it to ${m6 && m6.list.height} px — the waiting row is off screen and not where a press lands; ${m6 && m6.apiRows.length} executed / refused API rows show under 「待审批」; the head counts 157 — legs ①'s would be red`, m6 && { kids: m6.kids, list: m6.list, visible: m6.pendVisible, hit: m6.hit, api: m6.apiRows.length, summary: m6.summary });
ok(await p2.shot('outbox-base-zh.png'), 'outbox-base-zh.png');
p2.close();

console.log(`PNGs: ${SHOTS}`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
