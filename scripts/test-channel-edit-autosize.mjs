#!/usr/bin/env node
// lane channel-edit-autosize — HEAVY (chrome, zero vendor calls, no product server): A MESSAGE EDITOR OPENS AT ITS TEXT'S
// SIZE (a fleet user 2026-10-12, inc-mv4toyhw-t7ym: an agent's draft opened for editing in a 2–3-row box; he dragged the
// window bigger to review it). The REAL renderProposalCard (an esbuild iife of the tree, real public/style.css) in a
// channel window's own structure (.chanwin > .chanwin-list + .chanwin-foot), headless chrome, the REAL "Edit…" pressed:
//   ① a 25-line draft ⇒ the box shows it all (clientHeight ≈ scrollHeight, no inner scrollbar, ≤ 60 % of the pane);
//   ② a 3-line draft ⇒ 4 rows;  ③ typing 10 more lines ⇒ it grows, the list / page do not scroll, the box's top stays,
//     the caret stays at the end in view (no inner scroll);  ④ ONE 1500-char line ⇒ grows by its wrapped width;
//   ⑤ 200 lines ⇒ clamped at 60 % of the pane and scrollable inside;  ⑥ the composer holding a 12-line draft ⇒ sized;
//   ⑦ a drag on the resize handle wins over the next keystroke;  ⑧ phone 390: the sheet sized within the viewport;
//   CONTROL: the bundle rebuilt without the Edit box's binding ⇒ ① red (the incident's 64 px box).
// CEA_SHOTS=<dir> writes desk.png + phone.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.CEA_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = (n, w = 'line') => Array.from({ length: n }, (_, i) => `${w} ${i + 1} of the agent's draft`).join('\n');

const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('channel-edit-autosize');
async function bundle(name, patch = null) {
  const entry = `import { renderProposalCard } from ${JSON.stringify(path.join(repo, 'src/lib/channel-outbox.js'))};
import { autosizeEditor } from ${JSON.stringify(path.join(repo, 'src/lib/channel-editor-size.js'))};
const app = { ws: { onGlobal() { return () => {}; }, offGlobal() {}, onStateChange() {}, offStateChange() {} }, wm: { windows: new Map() } };
window.__card = (text) => { const list = document.querySelector('.chanwin-list'); list.textContent = '';
  const p = { id: 'pr' + Math.random().toString(36).slice(2, 8), state: 'awaiting-approval', adapterId: 'lark:a', convId: 'oc_dana', text, at: Date.now(), updatedAt: Date.now(), drafter: { name: 'agent' } };
  for (let i = 0; i < 3; i++) { const m = document.createElement('div'); m.className = 'chanmsg'; m.textContent = 'an earlier message ' + i; list.appendChild(m); }
  list.appendChild(renderProposalCard(app, p, {})); };
window.__composer = (text) => { const foot = document.querySelector('.chanwin-foot'); foot.textContent = ''; const comp = document.createElement('div'); comp.className = 'chanwin-composer';
  const ta = document.createElement('textarea'); ta.rows = 2; ta.value = text; comp.appendChild(ta); foot.appendChild(comp); autosizeEditor(ta, { minRows: 2 }); };`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /channel-outbox\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch)) throw new Error('control anchor missing'); return { contents: s.replace(patch, ''), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'silent', plugins });
}
await bundle('after.js');
await bundle('ctl.js', '      autosizeEditor(editor);').catch((e) => ok(false, 'CONTROL bundle', e.message));

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;height:100%;overflow:hidden}#win{position:absolute;left:0;top:0;width:${u.searchParams.get('w')}px;height:${u.searchParams.get('h')}px;background:var(--bg)}</style></head><body><div id="win"><div class="chanwin"><div class="chanwin-main"><div class="chanwin-list"></div><div class="chanwin-foot"></div></div></div></div><script src="/${u.searchParams.get('b')}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (u.pathname === '/style.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(fs.readFileSync(path.join(repo, 'public/style.css'))); return; }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not in this harness"}');
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('channel-edit-autosize-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} for (const d of [chromeDir, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, b) {
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
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?w=${w}&h=${h}&b=${b}` });
  for (let i = 0; i < 80; i++) { await sleep(100); if (await ev('typeof window.__card === "function"').catch(() => false)) break; }
  const frames = () => ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
  const mouse = async (type, x, y) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  const press = async (sel) => { const [x, y] = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`); await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await frames(); };
  // open a card with `text` and press its REAL Edit…
  const edit = async (text) => { await ev(`window.__card(${JSON.stringify(text)})`); await frames(); await press('.chan-prop [data-edit]'); await frames(); return ev(BOX); };
  const type = async (s) => { await cdp('Input.insertText', { text: s }); await frames(); };
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, cdp, edit, type, press, mouse, frames, shot, close: () => { try { ws.close(); } catch {} } };
}
// THE EDIT BOX read off the real DOM
const BOX = `(() => { const t = document.querySelector('.chan-prop-edit'); const pane = document.querySelector('.chanwin'); const list = document.querySelector('.chanwin-list');
  if (!t) return null; const cs = getComputedStyle(t); const r = t.getBoundingClientRect();
  return { ch: t.clientHeight, sh: t.scrollHeight, oy: cs.overflowY, lh: parseFloat(cs.lineHeight), pad: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), h: r.height, top: Math.round(r.top), pane: pane.clientHeight,
    listTop: list.scrollTop, pageY: window.scrollY, taTop: t.scrollTop, caretAtEnd: t.selectionStart === t.value.length, focused: document.activeElement === t }; })()`;
const fits = (b) => b && b.sh - b.ch <= 1 && b.oy !== 'scroll' && b.oy !== 'auto';

// ── desk: a 640×720 conversation window
{
  console.log('\n① – ⑦ desk (a 640×720 conversation window)');
  const P = await page(640, 720, 'after.js');
  const b25 = await P.edit(lines(25));
  ok(fits(b25) && b25.ch <= 0.6 * b25.pane + 1 && b25.ch > 20 * b25.lh, '① a 25-line draft opens with ALL its lines shown (no inner scrollbar, ≤ 60 % of the pane)', JSON.stringify(b25));
  ok(b25.focused, '① …and the box has the focus', JSON.stringify(b25));
  await P.shot('desk.png');
  const b3 = await P.edit(lines(3));
  ok(Math.abs((b3.ch - b3.pad) - 4 * b3.lh) <= 2 && fits(b3), '② a 3-line draft opens at 4 rows', JSON.stringify(b3));
  await P.ev(`(() => { const t = document.querySelector('.chan-prop-edit'); t.setSelectionRange(t.value.length, t.value.length); })()`);
  const before = await P.ev(BOX);
  for (let i = 0; i < 10; i++) await P.type('\nand one more typed line ' + (i + 1));
  const after = await P.ev(BOX);
  ok(after.ch > before.ch + 8 * before.lh && fits(after), '③ typing 10 more lines grows the box with them', JSON.stringify({ before, after }));
  ok(after.top === before.top && after.listTop === before.listTop && after.pageY === 0 && after.taTop === 0 && after.caretAtEnd, '③ …the list and the page did not scroll, the box did not move, the caret stays at the end in view', JSON.stringify({ before, after }));
  const bw = await P.edit('word '.repeat(300).trim());
  ok(fits(bw) && bw.ch - bw.pad > 5 * bw.lh, '④ ONE 1500-char line (no newline) grows by its wrapped width', JSON.stringify(bw));
  const b200 = await P.edit(lines(200));
  ok(Math.abs((b200.ch - b200.pad) - Math.floor(0.6 * b200.pane)) <= 1 && b200.oy === 'auto' && b200.sh > b200.ch, '⑤ a 200-line draft is clamped at 60 % of the pane and scrolls inside', JSON.stringify(b200));
  await P.ev(`window.__composer(${JSON.stringify(lines(12, 'held'))})`); await P.frames();
  const comp = await P.ev(`(() => { const t = document.querySelector('.chanwin-composer textarea'); const cs = getComputedStyle(t); return { ch: t.clientHeight, sh: t.scrollHeight, oy: cs.overflowY, lh: parseFloat(cs.lineHeight) }; })()`);
  ok(fits(comp) && comp.ch > 10 * comp.lh, '⑥ the composer holding a 12-line draft opens at its size', JSON.stringify(comp));
  // ⑦ the person's drag on the resize handle (bottom-right corner of the box) wins over the next keystroke
  await P.edit(lines(6));
  const g = await P.ev(`(() => { const r = document.querySelector('.chan-prop-edit').getBoundingClientRect(); return [r.right - 3, r.bottom - 3, r.height]; })()`);
  await P.mouse('mouseMoved', g[0], g[1]); await P.mouse('mousePressed', g[0], g[1]);
  for (let k = 1; k <= 8; k++) await P.mouse('mouseMoved', g[0], g[1] + k * 15);
  await P.mouse('mouseReleased', g[0], g[1] + 120); await P.frames();
  const dragged = await P.ev(BOX);
  await P.ev(`document.querySelector('.chan-prop-edit').focus()`); await P.type('x'); await P.type('\ny');
  const kept = await P.ev(BOX);
  ok(dragged.h > g[2] + 60 && Math.abs(kept.h - dragged.h) <= 1, '⑦ a drag on the resize handle wins: typing does not size the box back', JSON.stringify({ was: g[2], dragged: dragged.h, afterTyping: kept.h }));
  P.close();
}
// ── phone 390: the window is the whole screen (a sheet)
{
  console.log('\n⑧ phone 390×780');
  const P = await page(390, 780, 'after.js');
  const b = await P.edit(lines(25));
  ok(b.ch <= 0.6 * b.pane + 1 && b.ch > 15 * b.lh && b.pane <= 780 && b.h + b.top <= 780, '⑧ the 25-line draft opens sized within the viewport (≤ 60 % of the sheet, then scrolls inside)', JSON.stringify(b));
  await P.shot('phone.png');
  P.close();
}
// ── CONTROL: the Edit box without its binding is the incident's box
{
  console.log('\nCONTROL');
  const P = await page(640, 720, 'ctl.js');
  const b = await P.edit(lines(25));
  ok(b && !fits(b) && b.ch < 6 * b.lh, `CONTROL: without the binding a 25-line draft opens in a ${b && Math.round(b.h)} px box with an inner scrollbar (red)`, JSON.stringify(b));
  P.close();
}
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
