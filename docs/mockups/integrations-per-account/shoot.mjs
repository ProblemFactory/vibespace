#!/usr/bin/env node
// Renders every mockup page of this directory in headless Chrome (CDP over
// the repo's `ws`, the scripts/dbg-comm-surfaces.mjs pattern) at a DESKTOP
// viewport and at a PHONE viewport (390 px), writes the PNGs beside the HTML
// and a `shots.json` with the bounding rect of every PROBE element — the
// input of check.py, which judges by PIXELS that each probe painted.
//
//   node docs/mockups/integrations-per-account/shoot.mjs
//
// Two files per page and viewport: `<page>[.phone].png` = as the product
// would show it (the dialog's 80vh cap, the window's 560 px with its inner
// scroll), and `<page>[.phone].full.png` = the same DOM with the caps lifted
// so a reader sees every card (labelled as such — a tall variant, not the
// product's frame). No server, no product code: static HTML only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = async () => { const net = await import('node:net'); return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };

/** page → the probes that MUST render (selector, human name). */
const PAGES = {
  // r4: channels keep their own store; the account card, the dialog grammar, duplicate, re-authorize, edit, remove — the mounts patterns
  'account-card': [
    ['#panel', 'the Communication panel'],
    ['#sec-gmail', 'account card: Gmail (credential-first)'],
    ['#sec-gmail .chan-dot', 'its status dot'],
    ['#health-gmail', 'its health line'],
    ['#sec-gmail .chan-cred-chip', 'its client chip (Preset: …)'],
    ['#menu-gmail', 'the OPEN ⋯ menu (verb order = the mount row)'],
    ['#menu-gmail .mock-menu-item:nth-child(1)', 'verb 1: 打开'],
    ['#mi-duplicate', 'verb: 创建副本…'],
    ['#mi-remove', 'verb: 移除…'],
    ['#tracked-1', '↳ tracked conversation 1'],
    ['#tracked-2', '↳ tracked conversation 2'],
    ['#sec-lark', 'account card: Lark (dead token)'],
    ['#err-lark', 'the error line (mounts wording)'],
    ['#reauth-lark', 'the inline 重新授权 Lark… button'],
    ['#sec-empty', 'an account tracking nothing (credential-only style wording)'],
    ['#empty-hint', 'its empty wording'],
    ['#connect-more', 'the entry: 连接账号'],
  ],
  'connect-dialog': [
    ['#chan-connect-dialog', 'the dialog (the storage dialog shell)'],
    ['#kind', 'the TYPE-FIRST select (Gmail / Lark)'],
    ['#oauth-client', 'the OAuth client select'],
    ['#client-hint', 'its hint'],
    ['#connect-block', 'the consent block'],
    ['#connect-btn', '连接 Google'],
    ['#oauth-link input', 'the copyable consent link'],
    ['#paste-input', 'paste-back'],
    ['#query', 'the kind-specific field (when:)'],
    ['#submit', '连接'],
  ],
  'connect-dialog-custom': [
    ['#chan-connect-dialog', 'the dialog'],
    ['#kind', 'the TYPE-FIRST select (Lark)'],
    ['#oauth-client', 'the OAuth client select (自定义)'],
    ['#custom-id', '自定义 App ID (inline)'],
    ['#custom-secret', '自定义 App Secret (inline)'],
    ['#cb-url', 'the callback URL row'],
    ['#prereq', 'the three facts'],
    ['#connect-btn', '连接 Lark'],
    ['#submit', '连接'],
  ],
  'duplicate-dialog': [
    ['#dup-dialog', 'the dialog'],
    ['#dup-name', 'the prefilled name (副本)'],
    ['#dup-kind', 'kind (read-only, copied)'],
    ['#dup-client', 'the OAuth client (copied)'],
    ['#dup-query', 'the filter (copied)'],
    ['#dup-push', 'the push claim (copied)'],
    ['#dup-note', 'what is NEVER copied: the token'],
    ['#connect-btn', 'its OWN consent'],
    ['#submit', '创建并连接'],
  ],
  'reauth-dialog': [
    ['#chan-reauth-dialog', 'the dialog'],
    ['#why', 'who reported the death'],
    ['#oauth-client', 'the OAuth client select'],
    ['#signin', '用 Lark 登录'],
    ['#oauth-link input', 'the copyable link'],
    ['#paste-input', 'paste-back'],
  ],
  'edit-dialog': [
    ['#chan-edit-dialog', 'the dialog'],
    ['#name', 'name'],
    ['#oauth-client', 'the OAuth client select'],
    ['#custom-id', 'custom App ID (prefilled)'],
    ['#custom-secret', 'custom App Secret (prefilled, 2.108.8)'],
    ['#auth-fact', 'the auth fact'],
    ['#query', 'the filter'],
    ['#push-claim', 'the push claim'],
    ['#reauth', '重新授权 Lark…'],
    ['#duplicate', '创建副本…'],
    ['#remove', '移除…'],
    ['#save', '保存'],
  ],
  'remove-refused': [
    ['.dialog', 'the dialog'],
    ['#refusal', 'the refusal line'],
    ['#refs', 'the references named'],
    ['.dialog-hint', 'the remedy'],
  ],
};
const VIEWPORTS = [{ tag: '', width: 1000, height: 920, mobile: false }, { tag: '.phone', width: 390, height: 844, mobile: true }];

const cdpPort = await freePort();
const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mockup-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--disable-gpu', '--force-device-scale-factor=1',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--window-size=1000,920', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); break; } catch { await sleep(250); } }

async function newPage() {
  const r = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 600));
    return r2.result?.result?.value;
  };
  const metrics = (w, h, m) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!m });
  const shot = async (file) => {
    const r2 = await cdp('Page.captureScreenshot', { format: 'png' });
    if (!r2.result || !r2.result.data) throw new Error('no screenshot: ' + JSON.stringify(r2).slice(0, 300));
    fs.writeFileSync(file, Buffer.from(r2.result.data, 'base64'));
  };
  return { cdp, evaljs, metrics, shot, close: () => { try { ws.close(); } catch {} } };
}

const RECTS = `(function (probes) {
  const out = [];
  for (const [sel, name] of probes) {
    const el = document.querySelector(sel);
    if (!el) { out.push({ sel, name, missing: true }); continue; }
    const b = el.getBoundingClientRect();
    out.push({ sel, name, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80) });
  }
  const body = document.querySelector('.dialog-body') || document.querySelector('.panel');
  const cb = body ? body.getBoundingClientRect() : null;
  return { probes: out, vw: innerWidth, vh: innerHeight, docH: document.documentElement.scrollHeight,
           // the scroll container's VISIBLE rect: a probe outside it is clipped by the inner scroll, not unpainted
           innerScroll: body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : null,
           bg: getComputedStyle(document.body).backgroundColor };
})`;

const report = {};
const page = await newPage();
for (const [name, probes] of Object.entries(PAGES)) {
  const url = pathToFileURL(path.join(here, name + '.html')).href;
  for (const vp of VIEWPORTS) {
    for (const full of [false, true]) {
      await page.metrics(vp.width, vp.height, vp.mobile);
      await page.cdp('Page.navigate', { url });
      for (let i = 0; i < 40; i++) { if (await page.evaljs('document.readyState === "complete"')) break; await sleep(50); }
      await page.evaljs('document.fonts ? document.fonts.ready.then(() => 1) : 1');
      if (full) {
        // lift the product's caps so the reader sees everything; the frame is then as tall as the content
        await page.evaljs(`(() => { const s = document.createElement('style'); s.textContent = '.dialog{max-height:none !important} .window{height:auto !important} .integ-body{overflow:visible !important} .dialog-overlay{position:static !important; min-height:100vh; align-items:flex-start; padding:16px 0}'; document.head.appendChild(s); return 1; })()`);
        const h = await page.evaljs('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
        await page.metrics(vp.width, Math.min(4000, h + 4), vp.mobile);
        await sleep(80);
      }
      const key = `${name}${vp.tag}${full ? '.full' : ''}`;
      const m = await page.evaljs(`${RECTS}(${JSON.stringify(probes)})`);
      await page.shot(path.join(here, key + '.png'));
      report[key] = { file: key + '.png', ...m };
      const missing = m.probes.filter((p) => p.missing).map((p) => p.sel);
      console.log(`${key}: ${vp.width}×${m.vh}${m.innerScroll && m.innerScroll.scrollHeight > m.innerScroll.clientHeight + 1 ? ` (inner scroll ${m.innerScroll.scrollHeight}/${m.innerScroll.clientHeight})` : ''}${missing.length ? ' MISSING ' + missing.join(',') : ''}`);
    }
  }
}
page.close();
fs.writeFileSync(path.join(here, 'shots.json'), JSON.stringify(report, null, 1));
console.log('wrote shots.json');
process.exit(0);
