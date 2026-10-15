#!/usr/bin/env node
// B-f95d ② (lane usage-pivots-on-demand, 2.369.274) — HEAVY (chrome, zero vendor calls, no product server): the REAL Usage
// window (an esbuild iife of the tree's usage-window.js on a stub app) in headless chrome, over a stub HTTP server whose
// /api/usage-stats IS the real route (account-usage-routes on a fake app) over a ledger in this instance's shape
// (scripts/usage-shape-fixture.mjs: 14,513 sessions, 940 projects, 234 days). The request census is read on the SERVER side:
//   ① the first paint (the default "Cost overview" dashboard, 30 days) is ONE request with NO pivot; the session × origin
//      panel — the last one, below the fold — says Loading… and asks nothing while it is off screen;
//   ② scrolled to it ⇒ exactly ONE more request, pivot=session:origin&only=pivots, and the panel draws its chart where the
//      reader is (the repaint keeps the scroll — a CONTROL bundle without that jumps back to the top);
//   ③ Refresh, then All time ⇒ one request each, carrying the held pivot beside the rest (never a second ask);
//   ④ a fresh window switched to All time before any scroll ⇒ no pivot (the All-time first paint);
//   ⑤ the classic layout: the session table draws from the held pivot at once; "By project" asks for project × origin
//      only once scrolled into view, and its rows' hover then names the origin split; back on the dashboard a Refresh
//      carries session × origin alone (a pivot nobody draws any more is let go);
// CONTROL: the bundle rebuilt with the base's unconditional fetch planted back ⇒ ① is red (the first paint asks for both).
// UWP_TREE=<dir> bundles another tree (a base checkout: red there — the "before" numbers); UWP_SHOTS=<dir> [UWP_PREFIX=after]
// writes <prefix>-first-paint.png, <prefix>-panel-asking.png (its ask held open), <prefix>-panel-open.png, <prefix>-classic.png
// (the 860×600 window).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeUsageShapeLedger } from './usage-shape-fixture.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tree = process.env.UWP_TREE ? path.resolve(process.env.UWP_TREE) : repo;
const SHOTS = process.env.UWP_SHOTS || '';
const PREFIX = process.env.UWP_PREFIX || 'after';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundle: the REAL window of the tree on a stub app (one window host, settings in memory)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('usage-win-pivots');
const home = scratch('usage-win-pivots-home');
const dataDir = scratch('usage-win-pivots-data');
const CONTROL = { from: 'const pivots = [...new Set([...state.held, ...eager])];', to: "const pivots = [...new Set(['session:origin', 'project:origin', ...state.held, ...eager])];" };
const CONTROL_SCROLL = { from: 'if (keepTop) queueMicrotask(', to: 'if (false) queueMicrotask(' };
async function bundle(name, patch = null) {
  const entry = `import { openUsageWindow } from ${JSON.stringify(path.join(tree, 'src/lib/usage-window.js'))};
const settings = new Map(), wins = new Map();
const app = { settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
  wm: { windows: wins, revealWindow() {}, createWindow(o) { const content = document.getElementById('win'); content.textContent = ''; const w = { id: 'w' + (wins.size + 1), type: o.type, content, onClose: null }; wins.set(w.id, w); return w; } } };
window.__open = () => { for (const [id, w] of [...wins]) { w.onClose?.(); wins.delete(id); } return !!openUsageWindow(app); };
window.__open();`;
  // the generated build-version.js (npm run build) is stubbed: the suite runs on a fresh checkout or a base archive too
  const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const plugins = [stubBuildVersion, ...(patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /usage-window\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing'); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [])];
  await esbuild.build({ stdin: { contents: entry, resolveDir: tree, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
let controlBuilt = true, scrollBuilt = true;
await bundle('control.js', CONTROL).catch((e) => { controlBuilt = false; if (tree === repo) ok(false, 'CONTROL bundle', e.message); else console.log('  (no CONTROL bundle on this tree: ' + e.message + ')'); });
await bundle('noscroll.js', CONTROL_SCROLL).catch((e) => { scrollBuilt = false; if (tree === repo) ok(false, 'CONTROL (scroll) bundle', e.message); });

// ── the server: the REAL route over the shaped ledger; every /api/usage-stats ask logged with its bytes
const NOW = Date.now(), DAY = 86400e3;
const { rows } = writeUsageShapeLedger(dataDir, { now: NOW });
const { UsageHistory } = require(path.join(tree, 'src/usage-history.js'));
const uh = new UsageHistory({ dataDir, homeDir: home });
const handlers = {};
const fakeApp = new Proxy({}, { get: (_t, verb) => (p, ...fns) => { handlers[String(verb).toUpperCase() + ' ' + p] = fns[fns.length - 1]; } });
require(path.join(tree, 'src/server/account-usage-routes.js')).create({ app: fakeApp, rootDir: tree, engine: {}, serverSetting: () => undefined,
  getUsageHistory: () => uh, getAccounts: () => ({}), getHosts: () => ({}), getMounts: () => ({}), getTelemetry: () => ({}), getLoginExpiryWatch: () => null });
const LOG = [], STRAY = [];
let hold = null; // set ⇒ an only=pivots ask waits for hold.release() (the panel's wait note, photographed on screen)
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') {
    const b = /^[a-z]+\.js$/.test(u.searchParams.get('b') || '') ? u.searchParams.get('b') : 'after.js';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#000}#win{position:absolute;left:0;top:0;width:860px;height:600px}</style></head><body><div id="win" class="window-content"></div><script src="/${b}"></script></body></html>`);
    return;
  }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (u.pathname === '/style.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(fs.readFileSync(path.join(tree, 'public/style.css'))); return; }
  if (u.pathname === '/api/usage-stats') {
    const q = Object.fromEntries(u.searchParams);
    const row = { pivot: q.pivot || null, only: q.only || null, range: q.from ? Math.round((NOW - Number(q.from)) / DAY) + 'd' : 'all', bytes: 0, code: 0 };
    LOG.push(row);
    if (q.only === 'pivots' && hold) await hold.p;
    let code = 200;
    await handlers['GET /api/usage-stats']({ query: q, on() { } }, { writableEnded: false, status(c) { code = c; return this; },
      json(b) { const s = JSON.stringify(b); row.bytes = Buffer.byteLength(s); row.code = code; res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(s); } });
    return;
  }
  if (u.pathname === '/api/usage-stats/harvest-hosts') return json({ hosts: {} });
  if (u.pathname.startsWith('/brand/')) { const f = path.join(tree, 'public', path.normalize(u.pathname)); if (f.startsWith(path.join(tree, 'public/brand/')) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(fs.readFileSync(f)); return; } }
  if (u.pathname.startsWith('/api/')) STRAY.push(req.method + ' ' + u.pathname);
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not in this harness"}');
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('usage-win-pivots-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } for (const d of [chromeDir, dir, home, dataDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
const chromeGone = new Promise((r) => chrome.once('exit', r));
// the profile goes only once chrome has exited (removed under a dying chrome, it re-creates a few files)
const finish = async (code) => { try { chrome.kill('SIGKILL'); } catch { } await Promise.race([chromeGone, sleep(5000)]); cleanup(); process.exit(code); };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

async function page(b) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 640, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  const logUntil = async (n, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (LOG.length >= n && LOG.slice(0, n).every((r) => r.code)) return true; await sleep(50); } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?b=${b}` });
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await sleep(450); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 860, height: 600, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, until, logUntil, shot, close: () => { try { ws.close(); } catch { } } };
}

// the page's view of the session × origin panel and the window body
const PANEL = `(() => {
  const body = document.querySelector('.usage-body'), panels = [...document.querySelectorAll('.udash-panel')];
  const p = panels.find((x) => /Session × Origin/.test(x.querySelector('.udash-panel-title')?.textContent || ''));
  const br = body && body.getBoundingClientRect(), pr = p && p.getBoundingClientRect();
  return { panels: panels.length, tiles: !!document.querySelector('.usage-tiles'), found: !!p, last: !!p && p === panels[panels.length - 1],
    wait: !!p && /Loading/.test(p.querySelector('.udash-panel-body')?.textContent || ''), canvas: !!p && !!p.querySelector('canvas'),
    offScreen: !!(p && br && pr.top >= br.bottom), onScreen: !!(p && br && pr.top < br.bottom && pr.bottom > br.top), scrollTop: body ? body.scrollTop : -1,
    canvases: document.querySelectorAll('.udash-panel canvas').length };
})()`;
const firstPaint = async (P, label) => {
  const painted = await P.until(`(() => { const v = ${PANEL}; return v.tiles && v.panels >= 10 && v.canvases >= 6; })()`);
  await P.logUntil(1); await sleep(1200); // anything that would ask by itself has asked by now
  const v = await P.ev(PANEL);
  return { painted, v, reqs: LOG.slice() };
};
const clickText = (sel, text) => `(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (e) e.click(); return !!e; })()`;
const T = {}; // the request table for the report

console.log(`§1 first paint (the default dashboard, 30 days) — ledger ${rows} rows`);
const P = await page('after.js');
const F = await firstPaint(P, 'after');
ok(F.painted && F.v.found && F.v.last, 'the window painted the default dashboard (tiles, 10 panels, charts); the session × origin panel is its LAST panel', JSON.stringify(F.v));
ok(F.reqs.length === 1 && F.reqs[0].pivot === null && F.reqs[0].only === null && F.reqs[0].range === '30d',
  `① the first paint is ONE request and it asks for NO pivot (${F.reqs[0]?.bytes} B)`, JSON.stringify(F.reqs));
ok(F.v.offScreen && F.v.wait && !F.v.canvas, '① the session × origin panel is below the fold, says Loading… and has asked for nothing', JSON.stringify(F.v));
T.firstPaint30d = F.reqs[0]?.bytes;
await P.shot(`${PREFIX}-first-paint.png`);

console.log('§2 scrolled to the panel ⇒ it asks for its pivot alone');
hold = (() => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; })();
await P.ev(`(() => { const b = document.querySelector('.usage-body'); b.scrollTop = b.scrollHeight; return true; })()`);
const waitNote = await P.until(`(() => { const v = ${PANEL}; return v.onScreen && v.wait; })()`);
for (let i = 0; i < 200 && LOG.length < 2; i++) await sleep(50); // the ask is logged, its answer held
const waiting = waitNote && LOG.length === 2 && !LOG[1].code;
ok(waiting, '② on screen, while its ask is out, the panel shows its Loading… note (the rest of the dashboard stays drawn)', JSON.stringify({ v: await P.ev(PANEL), LOG }));
await P.shot(`${PREFIX}-panel-asking.png`);
hold.release(); hold = null;
const asked = await P.logUntil(2);
const drew = await P.until(`(() => { const v = ${PANEL}; return v.canvas && !v.wait; })()`);
await sleep(800);
ok(asked && LOG.length === 2 && LOG[1].pivot === 'session:origin' && LOG[1].only === 'pivots' && LOG[1].range === '30d',
  `② on screen ⇒ exactly ONE more request: pivot=session:origin&only=pivots, same 30 days (${LOG[1]?.bytes} B)`, JSON.stringify(LOG));
const V2 = await P.ev(PANEL);
ok(drew && V2.canvas, '② the panel draws its chart from that answer (no Loading… left)', JSON.stringify(V2));
ok(V2.onScreen && V2.scrollTop > 0, `② …where the reader is: the repaint kept the window scrolled to the panel (scrollTop ${V2.scrollTop}), never back to the top`, JSON.stringify(V2));
T.panel30d = LOG[1]?.bytes;
await P.shot(`${PREFIX}-panel-open.png`);

console.log('§3 the held pivot rides every later load');
await P.ev(clickText('.usage-controls .usage-btn', 'Refresh'));
await P.logUntil(3); await P.until(`(() => { const v = ${PANEL}; return v.canvas; })()`); await sleep(800);
ok(LOG.length === 3 && LOG[2].pivot === 'session:origin' && LOG[2].only === null, '③ Refresh = ONE request carrying session:origin beside the rest (no second ask)', JSON.stringify(LOG.slice(2)));
await P.ev(clickText('.usage-seg-btn', 'All time'));
await P.logUntil(4); await P.until(`(() => { const v = ${PANEL}; return v.canvas; })()`); await sleep(800);
ok(LOG.length === 4 && LOG[3].pivot === 'session:origin' && LOG[3].only === null && LOG[3].range === 'all', `③ All time = ONE request, the held pivot with it (${LOG[3]?.bytes} B)`, JSON.stringify(LOG.slice(3)));
T.allWithPanel = LOG[3]?.bytes;

console.log('§4 the classic layout: the session table at once, "By project" asks on screen');
await P.ev(clickText('.usage-controls .usage-btn', 'Panels…'));
await P.ev(clickText('.context-menu *', 'Switch to classic layout'));
const CLASSIC = `(() => {
  const body = document.querySelector('.usage-body'), secs = [...document.querySelectorAll('.usage-section')];
  const by = (t) => secs.find((s) => s.querySelector('.usage-section-title')?.textContent === t);
  const proj = by('By project'), sess = by('By session'), br = body.getBoundingClientRect();
  return { sections: secs.length, table: !!sess?.querySelector('table.usage-sess-tbl'), sessWait: /Loading/.test(sess?.textContent || ''),
    projRows: proj ? proj.querySelectorAll('.usage-bar-label').length : 0, projOff: !!proj && proj.getBoundingClientRect().top >= br.bottom,
    split: proj ? [...proj.querySelectorAll('.usage-bar-label')].map((l) => l.title).filter((t) => /Conversation|Subagents|Workflows|Unattributed/.test(t) && / · /.test(t)).length : 0 };
})()`;
await P.until(`(() => { const v = ${CLASSIC}; return v.sections >= 8; })()`); await sleep(1000);
const C0 = await P.ev(CLASSIC);
ok(C0.table && !C0.sessWait && LOG.length === 4, '⑤ the session table draws from the HELD pivot at once — no request', JSON.stringify({ C0, n: LOG.length }));
ok(C0.projRows > 0 && C0.split === 0 && (C0.projOff ? LOG.length === 4 : true), `⑤ "By project" rows draw without the split${C0.projOff ? ' and, off screen, ask for nothing' : ''}`, JSON.stringify(C0));
await P.ev(`(() => { const s = [...document.querySelectorAll('.usage-section')].find((x) => x.querySelector('.usage-section-title')?.textContent === 'By project'); s.scrollIntoView(); return true; })()`);
await P.logUntil(5); await P.until(`(() => { const v = ${CLASSIC}; return v.split > 0; })()`); await sleep(800);
const C1 = await P.ev(CLASSIC);
ok(LOG.length === 5 && LOG[4].pivot === 'project:origin' && LOG[4].only === 'pivots', `⑤ on screen ⇒ ONE ask: pivot=project:origin&only=pivots (${LOG[4]?.bytes} B)`, JSON.stringify(LOG.slice(4)));
ok(C1.split > 0, `⑤ …and the project rows' hover now names the origin split (${C1.split} rows)`, JSON.stringify(C1));
T.projectAll = LOG[4]?.bytes;
await P.shot(`${PREFIX}-classic.png`);
await P.ev(clickText('.usage-controls .usage-btn', 'Classic view'));
await P.ev(clickText('.context-menu *', 'Switch to panel dashboard'));
await P.until(`(() => { const v = ${PANEL}; return v.panels >= 10; })()`); await sleep(600);
await P.ev(clickText('.usage-controls .usage-btn', 'Refresh'));
await P.logUntil(6); await sleep(800);
ok(LOG.length === 6 && LOG[5].pivot === 'session:origin' && LOG[5].only === null, '⑤ back on the dashboard, Refresh carries session:origin ALONE — project × origin, drawn by nothing here, was let go', JSON.stringify(LOG.slice(5)));
P.close();

console.log('§5 a fresh window: All time before any scroll');
const SEQ = { window1: LOG.map((r) => ({ ...r })) };
LOG.length = 0;
const Q = await page('after.js');
const F2 = await firstPaint(Q, 'after');
await Q.ev(clickText('.usage-seg-btn', 'All time'));
await Q.logUntil(2); await Q.until(`(() => { const v = ${PANEL}; return v.tiles && v.panels >= 10; })()`); await sleep(1000);
ok(F2.reqs.length === 1 && LOG.length === 2 && LOG[1].pivot === null && LOG[1].range === 'all', `④ All time before any scroll = ONE request with NO pivot (${LOG[1]?.bytes} B)`, JSON.stringify(LOG));
T.firstPaintAll = LOG[1]?.bytes;
SEQ.window2 = LOG.map((r) => ({ ...r }));
Q.close();
ok(STRAY.length === 0, 'the window asked the API for nothing else (no stray route)', STRAY.join(', '));

console.log('§6 CONTROL: the base\'s unconditional fetch planted back');
if (controlBuilt) {
  LOG.length = 0;
  const R = await page('control.js');
  const F3 = await firstPaint(R, 'control');
  ok(F3.painted && F3.reqs.length === 1 && /session:origin/.test(F3.reqs[0].pivot || '') && /project:origin/.test(F3.reqs[0].pivot || ''),
    `CONTROL: the first paint asks for BOTH crosses (${F3.reqs[0]?.bytes} B vs ${T.firstPaint30d} B) — leg ① would be red`, JSON.stringify(F3.reqs));
  R.close();
}
if (scrollBuilt) {
  LOG.length = 0;
  const S = await page('noscroll.js');
  await firstPaint(S, 'noscroll');
  await S.ev(`(() => { const b = document.querySelector('.usage-body'); b.scrollTop = b.scrollHeight; return true; })()`);
  await S.logUntil(2); await S.until(`(() => { const v = ${PANEL}; return v.canvas; })()`); await sleep(500);
  const V = await S.ev(PANEL);
  ok(V.canvas && !V.onScreen && V.scrollTop === 0, 'CONTROL: without the kept scroll the pivot\'s repaint throws the window back to the top (the panel off screen again) — leg ② would be red', JSON.stringify(V));
  S.close();
}
console.log('  TABLE ' + JSON.stringify(T));
console.log('  REQUESTS ' + JSON.stringify(SEQ));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
await finish(fail ? 1 : 0);
