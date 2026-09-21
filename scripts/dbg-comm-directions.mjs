#!/usr/bin/env node
// RENDER THE COMMUNICATION-PANEL DESIGN DIRECTIONS (a2 of the 2026-09-17
// polish; docs/design-communication-panel-ui.md is judged from this output).
//
// Serves this checkout's public/ (the REAL style.css / viewers.css / chat.css /
// fonts.css) plus docs/design-mockups/communication-panel/ and shoots every
// direction × theme × view in headless chrome over raw CDP — no server.js, no
// data/, zero vendor calls. Beside every PNG a JSON holds what a rubric can
// count: row rects and title truncation, the controls-vs-rows split, every
// chip's WCAG contrast over its real composited background, card heights,
// the composer's font, whether the newest message is on screen.
//
//   node scripts/dbg-comm-directions.mjs
//     VS_UI_SHOTS_DIR  where PNG/JSON go (default /tmp/vs-comm-directions-<pid>)
//     VS_UI_DIRS=a,b,c   VS_UI_THEMES=dark,light   VS_UI_ONLY=<substring of a shot name>
//
// Output names: <dir>-<theme>-desktop-all|panel|window|outbox|empty.png and
// <dir>-<theme>-mobile-panel|window|outbox.png (+ .json), plus index.json.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const OUT = process.env.VS_UI_SHOTS_DIR || scratch('comm-directions');
fs.mkdirSync(OUT, { recursive: true });
const DIRS = (process.env.VS_UI_DIRS || 'a,b,c').split(',');
const THEMES = (process.env.VS_UI_THEMES || 'dark,light').split(',');
const ONLY = process.env.VS_UI_ONLY || '';
const [PORT, CDP_PORT] = await freePorts(2);
const chromeDir = scratch('comm-directions-chrome');

// ── static server: public/ at /, the mockups at /mock/ ──
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const MOCK = path.join(repo, 'docs', 'design-mockups', 'communication-panel');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file;
  if (u.pathname.startsWith('/mock/')) file = path.join(MOCK, u.pathname.slice(6));
  else file = path.join(repo, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  const root = u.pathname.startsWith('/mock/') ? MOCK : path.join(repo, 'public');
  if (!path.resolve(file).startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}`;

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--force-device-scale-factor=1',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1200,800', '--disable-background-timer-throttling', '--hide-scrollbars',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

// ── CDP (the dbg-comm-surfaces.mjs shape) ──
const WebSocket = require('ws');
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const metrics = (w, h, m) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!m });
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    return r2.result?.result?.value;
  };
  const open = async (url) => {
    await cdp('Page.navigate', { url });
    for (let i = 0; i < 80; i++) { try { if (await evaljs('document.body && document.body.dataset.ready === "1" && document.fonts.status === "loaded"')) break; } catch {} await sleep(100); }
    await sleep(150);
  };
  const shot = async (file, clip) => {
    const params = { format: 'png' };
    if (clip) params.clip = { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: Math.max(1, clip.w), height: Math.max(1, clip.h), scale: 1 };
    const r2 = await cdp('Page.captureScreenshot', params);
    if (!r2.result?.data) throw new Error('no screenshot: ' + JSON.stringify(r2).slice(0, 300));
    fs.writeFileSync(file, Buffer.from(r2.result.data, 'base64'));
  };
  return { cdp, evaljs, open, shot, metrics, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// ── the in-page measurer ──
const MEASURE = `(function () {
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const parse = (s) => { let m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(s); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)/.exec(s); if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]]; return null; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const bgOf = (el) => { let acc = null; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { acc = acc ? over(acc, c) : c; if (c[3] >= 1) return acc; } } const body = parse(getComputedStyle(document.body).backgroundColor) || [0, 0, 0, 1]; return acc ? over(acc, body) : body; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; };
  const contrast = (el) => { const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el); const own = parse(cs.backgroundColor); return { text: (el.textContent || '').trim().slice(0, 40), cls: String(el.className), fontSize: cs.fontSize, fontWeight: cs.fontWeight, fg: cs.color, bg: own && own[3] > 0 ? cs.backgroundColor : '(inherited)', ratio: fg ? ratio(fg, over(own && own[3] > 0 ? own : [0, 0, 0, 0], bg)) : null }; };
  const out = { viewport: { w: innerWidth, h: innerHeight }, theme: document.documentElement.getAttribute('data-theme'), dir: document.body.dataset.dir, view: document.body.dataset.view };
  const panel = document.querySelector('.rail-panel-channels');
  if (panel && panel.getBoundingClientRect().width) {
    const rows = [...panel.querySelectorAll('.chan-row')];
    const titles = rows.map((r) => r.querySelector('.chan-row-title')).filter(Boolean);
    const trunc = titles.filter((t) => t.scrollWidth > t.clientWidth + 1);
    const rowsH = rows.reduce((a, r) => a + r.getBoundingClientRect().height, 0);
    const ctl = [...panel.querySelectorAll('.chan-bar, .chan-sec-head, .chan-sec-note, .chan-adapter > .mounts-row-top, .chan-adapter > .mounts-path, .jobs-rail-bar, .chan-outbox-btn')].filter((e) => !e.closest('.chan-row'));
    const ctlH = ctl.reduce((a, r) => a + r.getBoundingClientRect().height, 0);
    out.panel = {
      contentWidth: Math.round(panel.clientWidth), rows: rows.length, truncatedTitles: trunc.length,
      titleWidths: titles.map((t) => Math.round(t.getBoundingClientRect().width)),
      minTitleWidth: Math.min(...titles.map((t) => Math.round(t.getBoundingClientRect().width))),
      rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      rowsH: Math.round(rowsH), controlsH: Math.round(ctlH), controlsPct: Math.round(100 * ctlH / Math.max(1, ctlH + rowsH)),
      scrollH: (panel.closest('#all-sessions-list') || panel).scrollHeight, clientH: (panel.closest('#all-sessions-list') || panel).clientHeight,
      rowsVisibleAtOnce: rows.filter((r) => { const b = r.getBoundingClientRect(); const p = (panel.closest('#all-sessions-list') || panel).getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom; }).length,
      chips: [...panel.querySelectorAll('.chan-chip, .chan-unread, .chan-awaiting, .chan-untracked, .chan-sec-state, .chan-lane, .chan-fresh, .chan-sec-note.chan-warn, .chan-row-assign, .chan-outbox-count')].filter((e) => e.getBoundingClientRect().width).map(contrast),
    };
  }
  const conv = document.querySelector('.window[data-win="conv"]');
  if (conv && conv.getBoundingClientRect().width) {
    const list = conv.querySelector('.chanwin-list');
    const msgs = [...conv.querySelectorAll('.chanmsg')];
    const last = msgs[msgs.length - 1];
    const lb = list ? list.getBoundingClientRect() : null;
    const ta = conv.querySelector('.chanwin-composer textarea');
    const card = conv.querySelector('.chan-prop');
    const foot = conv.querySelector('.chanwin-foot');
    out.window = {
      rect: R(conv), barH: Math.round(conv.querySelector('.chanwin-bar').getBoundingClientRect().height),
      msgHeights: msgs.map((m) => Math.round(m.getBoundingClientRect().height)),
      newestVisible: last && lb ? last.getBoundingClientRect().bottom <= lb.bottom + 1 : null,
      inlineCardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
      footH: foot ? Math.round(foot.getBoundingClientRect().height) : 0,
      footPct: foot ? Math.round(100 * foot.getBoundingClientRect().height / conv.getBoundingClientRect().height) : 0,
      composer: ta ? { fontFamily: getComputedStyle(ta).fontFamily.slice(0, 40), fontSize: getComputedStyle(ta).fontSize, h: Math.round(ta.getBoundingClientRect().height) } : null,
      chips: [...conv.querySelectorAll('.chan-prop-state, .chan-assign-chip, .chan-prop-idwarn, .jobs-chip, .chan-prop-reason.chan-warn')].filter((e) => e.getBoundingClientRect().width).map(contrast),
      buttons: [...conv.querySelectorAll('.chan-prop-actions button, .chanwin-composer-row button')].map((b) => ({ text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), fontSize: getComputedStyle(b).fontSize })),
    };
  }
  const ob = document.querySelector('.window[data-win="outbox"]');
  if (ob && ob.getBoundingClientRect().width) {
    const cards = [...ob.querySelectorAll('.chan-prop')];
    out.outbox = {
      rect: R(ob), toolbarH: Math.round(ob.querySelector('.jobs-toolbar').getBoundingClientRect().height),
      cards: cards.length, cardHeights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
      idWarnings: ob.querySelectorAll('.chan-prop-idwarn').length,
      cardsVisibleAtOnce: cards.filter((c) => { const b = c.getBoundingClientRect(); const p = ob.getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom; }).length,
      chips: [...ob.querySelectorAll('.chan-prop-state, .jobs-chip, .chan-prop-idwarn, .chan-prop-reason.chan-warn')].filter((e) => e.getBoundingClientRect().width).map(contrast),
    };
  }
  const rect = (sel) => { const e = document.querySelector(sel); return e ? R(e) : null; };
  out.rects = { sidebar: rect('#sidebar'), conv: rect('.window[data-win="conv"]'), outbox: rect('.window[data-win="outbox"]') };
  return out;
})()`;

const manifest = [];
async function one(page, { dir, theme, viewport, view, name, clipSel }) {
  const stem = `${dir}-${theme}-${name}`;
  if (ONLY && !stem.includes(ONLY)) return;
  await page.metrics(viewport.w, viewport.h, viewport.mobile);
  await page.open(`${base}/mock/direction-${dir}.html?view=${view}&theme=${theme}`);
  const m = await page.evaljs(MEASURE);
  let clip = null;
  if (clipSel) { clip = await page.evaljs(`(() => { const e = document.querySelector(${JSON.stringify(clipSel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`); }
  await page.shot(path.join(OUT, stem + '.png'), clip);
  fs.writeFileSync(path.join(OUT, stem + '.json'), JSON.stringify(m, null, 1));
  manifest.push({ stem, dir, theme, view, viewport, clip: clipSel || null });
  const p = m.panel, w = m.window, o = m.outbox;
  const line = [stem.padEnd(28)];
  if (p) line.push(`panel ${p.contentWidth}px rows ${p.rows} trunc ${p.truncatedTitles} minTitle ${p.minTitleWidth} ctl ${p.controlsPct}% visible ${p.rowsVisibleAtOnce} minChip ${Math.min(...p.chips.map((c) => c.ratio || 99))}`);
  if (w) line.push(`win bar ${w.barH} card ${w.inlineCardH} foot ${w.footPct}% newest ${w.newestVisible} ta ${w.composer ? w.composer.fontSize : '-'}`);
  if (o) line.push(`outbox cards ${o.cards} h ${o.cardHeights.join('/')} warn ${o.idWarnings} visible ${o.cardsVisibleAtOnce}`);
  console.log(line.join(' | '));
}

const page = await newPage();
const DESK = { w: 1200, h: 800, mobile: false };
const PHONE = { w: 375, h: 667, mobile: true };
for (const dir of DIRS) {
  for (const theme of THEMES) {
    await one(page, { dir, theme, viewport: DESK, view: 'all', name: 'desktop-all' });
    await one(page, { dir, theme, viewport: DESK, view: 'all', name: 'desktop-panel', clipSel: '#sidebar' });
    await one(page, { dir, theme, viewport: DESK, view: 'all', name: 'desktop-window', clipSel: '.window[data-win="conv"]' });
    await one(page, { dir, theme, viewport: DESK, view: 'all', name: 'desktop-outbox', clipSel: '.window[data-win="outbox"]' });
    await one(page, { dir, theme, viewport: DESK, view: 'empty', name: 'desktop-empty' });
    for (const v of ['panel', 'window', 'outbox']) await one(page, { dir, theme, viewport: PHONE, view: v, name: `mobile-${v}` });
  }
}
page.close();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ base: 'docs/design-mockups/communication-panel', shots: manifest }, null, 1));
console.log(`\n${manifest.length} shots → ${OUT}`);
cleanup();
process.exit(0);
