#!/usr/bin/env node
// LANE PHONE-CHIP (B-e5ff) — the chrome gate (heavy). The owner's phone read "⣿ 全部 → Beta Ma": the chat status
// bar's billing chip (the phone's stand-in for the title-bar badge) sat under a 90 px CSS cap with an ellipsis, and
// the member's name was cut mid-word. A pill is WHOLE or it FOLDS (lane G's rule): full → compact → icon.
//
// Scene: the REAL src/lib/chat-status-bar.js bundled by esbuild into a static page with the REAL public/style.css +
// chat.css, under a phone viewport (360 / 375 / 390 px, mobile) — no server needed: the chip is a pure function of
// its feed (`setBilling`). For each width × name set (zh / ja / en, and a name too long for a line's room) the census
// reads the RENDERED chip: its visible text is exactly one of its three whole forms (never a cut), nothing overflows
// its box (scrollWidth ≤ clientWidth), it fits one line of the bar, and the tooltip / aria-label carry every word.
// A rotation (360 → 700 px) re-decides by the ResizeObserver alone. Forced 'DejaVu Sans' (the runner's face) when
// installed — else this box's face, said.
// CONTROL: the pre-fix chat-status-bar.js + style.css (git show b924041f) under the same scene ⇒ the owner's cut
// (the chip's text overflows its 90 px box).
// SKIPs with evidence without chrome. Scratch: /tmp/vs-pchip-<pid>/ only.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = path.join(os.tmpdir(), `vs-pchip-${process.pid}`);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 600) : '')); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome on this machine'); process.exit(0); }
let dejavu = false; try { dejavu = /DejaVu Sans/.test(execFileSync('fc-list', [':family'], { encoding: 'utf8' })); } catch { }
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));

/** One page: the status bar module at `barPath`, the stylesheets given. */
async function buildPage(name, barPath, css) {
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import { ChatStatusBar } from ${JSON.stringify(barPath)};
window.mkBar = (auth) => {
  const ws = { send() {}, onGlobal() {}, offGlobal() {}, on() {}, off() {} };
  const sb = new ChatStatusBar(ws, 'sid-phone', {});
  const el = sb._element || sb.element;
  document.getElementById('host').appendChild(el);
  sb.setBilling(auth, () => {});
  window.sb = sb; return true;
};`);
  await esbuild.build({ entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
  for (const [i, c] of css.entries()) fs.writeFileSync(path.join(dir, `s${i}.css`), c);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((_, i) => `<link rel="stylesheet" href="s${i}.css">`).join('')}${dejavu ? '<style>html,body,*{font-family:"DejaVu Sans" !important}</style>' : ''}</head><body style="margin:0"><div id="host" class="chat-view" style="width:100%"></div><script src="bundle.js"></script></body></html>`);
  return 'file://' + path.join(dir, 'index.html');
}
const cssNow = [fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8'), fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8')];
const pageNow = await buildPage('now', path.join(REPO, 'src/lib/chat-status-bar.js'), cssNow);
// the CONTROL: the pre-fix bytes (relative imports re-pointed at this tree's modules)
let pagePre = null;
try {
  const pre = execFileSync('git', ['-C', REPO, 'show', 'b924041f:src/lib/chat-status-bar.js'], { encoding: 'utf8' }).replace(/from '(\.{1,2}\/[^']+)'/g, (m, f) => `from ${JSON.stringify(path.resolve(REPO, 'src/lib', f))}`);
  const preCss = execFileSync('git', ['-C', REPO, 'show', 'b924041f:public/style.css'], { encoding: 'utf8' });
  fs.mkdirSync(path.join(ROOT, 'pre'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'pre', 'chat-status-bar.js'), pre);
  pagePre = await buildPage('pre', path.join(ROOT, 'pre', 'chat-status-bar.js'), [preCss, cssNow[1]]);
} catch (e) { console.log(`  (control: the pre-fix bytes are not readable here — ${String(e.message).slice(0, 400)})`); }

const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = () => { try { chrome.kill('SIGKILL'); } catch { } fs.rmSync(ROOT, { recursive: true, force: true }); };
let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('SKIP: chrome exposed no CDP page target'); done(); process.exit(0); }
const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
let seq = 0; const pend = new Map();
cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: every chrome suite pre-sets vs-onboarded (this page is not the app, but the rule is a census)
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
const at = async (url, width) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { if (await ev('typeof window.mkBar === "function" && document.readyState === "complete"')) break; await sleep(100); }
};
const READ = `(() => { const el = document.querySelector('.chat-status-billing'); const bar = el && el.parentElement; if (!el) return null;
  const vis = [...el.querySelectorAll('span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent);
  const cs = getComputedStyle(bar); const slot = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return { mode: el.dataset.mode || null, text: vis.length ? vis.join('') : el.textContent, overflow: el.scrollWidth - el.clientWidth, w: el.getBoundingClientRect().width, slot,
    title: el.getAttribute('title') || '', aria: el.getAttribute('aria-label') || '', forms: [...el.querySelectorAll('span')].map((s) => s.textContent) }; })()`;
const NAMES = [
  { lang: 'zh', auth: { source: 'pooled', name: '全部', poolTarget: 'Beta Max' }, full: '⣿ 全部 → Beta Max' },
  { lang: 'ja', auth: { source: 'pooled', name: 'すべてのアカウント', poolTarget: 'ベータ チーム' }, full: '⣿ すべてのアカウント → ベータ チーム' },
  { lang: 'en', auth: { source: 'pooled', name: 'Everyone', poolTarget: 'Northwind Max' }, full: '⣿ Everyone → Northwind Max' },
  { lang: 'en-long', auth: { source: 'pooled', name: 'The whole engineering organisation pool', poolTarget: 'Northwind Corporate Platinum Max Plan' }, full: '⣿ The whole engineering organisation pool → Northwind Corporate Platinum Max Plan' },
  { lang: 'en-sub', auth: { source: 'subscription', name: 'Personal Max' }, full: 'Personal Max' },
];

console.log(`— the status bar's billing pill on a phone (${dejavu ? 'DejaVu Sans forced' : 'this box\'s face — DejaVu Sans not installed'})`);
for (const width of [360, 375, 390]) {
  for (const n of NAMES) {
    await at(pageNow, width);
    await ev(`window.mkBar(${JSON.stringify(n.auth)})`);
    await sleep(80);
    const r = await ev(READ);
    const whole = r && (r.forms.includes(r.text)) && !/…/.test(r.text);
    ok(r && whole && r.overflow <= 0 && r.w <= r.slot + 0.5 && r.title.startsWith(n.full) && r.aria === n.full,
      `${width} px ${n.lang}: ${r && r.mode} "${r && r.text}" — a whole form, no overflow (${r && r.overflow}), ${r && Math.round(r.w)} ≤ ${r && Math.round(r.slot)} px, the full words in title + aria-label`, JSON.stringify(r));
    if (n.lang === 'zh') ok(r && r.mode === 'full' && r.text === n.full, `${width} px zh: the owner's chip is drawn WHOLE: "${n.full}"`, JSON.stringify(r));
    if (n.lang === 'en-long') ok(r && r.mode !== 'full', `${width} px: a name longer than a line folds (${r && r.mode}), never cut`, JSON.stringify(r));
  }
}
{ // rotation: the ResizeObserver re-decides
  await at(pageNow, 360);
  await ev(`window.mkBar(${JSON.stringify(NAMES[3].auth)})`); await sleep(80);
  const a = await ev(READ);
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 780, deviceScaleFactor: 2, mobile: true }); await sleep(250);
  const b = await ev(READ);
  ok(a && b && a.mode !== 'full' && b.mode === 'full' && b.overflow <= 0, `a rotation re-decides by itself: ${a && a.mode} at 360 px → ${b && b.mode} at 1400 px`, JSON.stringify({ a, b }));
}
{ // verify r1: the UI scale = a CSS zoom on <body> (desktop widths; a phone is always 1) — a rect is zoomed px, clientWidth
  // the bar's own; mixed, 1.25 folded a pill that FITS a 220 px bar to its glyph and 0.8 drew one WIDER than a 180 px line
  for (const [zoom, hostW, want] of [[1.25, 220, 'full'], [0.8, 180, 'icon']]) {
    await at(pageNow, 1000);
    await ev(`document.body.style.zoom = '${zoom}'; document.getElementById('host').style.width = '${hostW}px'; true`);
    await ev(`window.mkBar(${JSON.stringify({ source: 'pooled', name: '全部', poolTarget: 'Engineering Team Max' })})`); await sleep(120);
    const r = await ev(READ);
    ok(r && r.mode === want && r.overflow <= 0, `UI scale ${zoom}, a ${hostW} px bar: ${r && r.mode} (want ${want}) — the slot and the pill in one unit`, JSON.stringify(r));
  }
}
if (pagePre) {
  await at(pagePre, 360);
  await ev(`window.mkBar(${JSON.stringify(NAMES[0].auth)})`); await sleep(80);
  const r = await ev(READ);
  ok(r && r.overflow > 0, `CONTROL: the pre-fix chip CUTS the owner's name (its text overflows its box by ${r && r.overflow} px — "⣿ 全部 → Beta Ma…")`, JSON.stringify(r));
}
done();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
