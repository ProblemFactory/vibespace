#!/usr/bin/env node
// TERMINAL SELECTION UNDER BODY ZOOM — the real thing (2.369.118, userW
// inc-mu92zsgw-6c9y "the login terminal copies the wrong lines"). Headless
// chrome loads the SAME xterm build VibeSpace bundles (node_modules/@xterm) on
// a standalone page, applies `document.body.style.zoom` exactly like
// applyUiPrefs(), and drags the mouse through CDP (real input events, not
// synthetic DOM events — xterm's mouse path is what is under test):
//   • the PRE-FIX page (no counter-zoom): a drag at the visual row 20 selects
//     row 25 at zoom 1.25 and row 16 at zoom 0.8 — the incident;
//   • the FIXED page (container zoom 1/scale + font × scale, what
//     TerminalSession does): row 20 at every zoom, and the visual size of the
//     screen is unchanged.
// SKIPs (exit 0, with its reason) when no chrome is installed.
// Run: node scripts/test-terminal-zoom-select.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const [CDP_PORT] = await freePorts(1);
const dir = scratch('term-zoom');
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + JSON.stringify(e) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const X = path.join(repo, 'node_modules/@xterm/xterm');
const utils = fs.readFileSync(path.join(repo, 'src/lib/utils.js'), 'utf8');
const COUNTER_ZOOM = (utils.match(/export const COUNTER_ZOOM = '([^']+)';/) || [])[1];
check('utils.js exports the counter-zoom rule', COUNTER_ZOOM === 'calc(1 / var(--ui-scale, 1))', COUNTER_ZOOM);
fs.writeFileSync(path.join(dir, 'page.html'), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${X}/css/xterm.css"><script src="file://${X}/lib/xterm.js"></script>
<style>body{margin:0;background:#111} #t{position:absolute;left:40px;top:60px}</style></head><body><div id="t"></div>
<script>
const term = new Terminal({rows:30, cols:80, lineHeight:1.15, fontSize:14, allowProposedApi:true, fontFamily:'monospace'});
term.open(document.getElementById('t'));
for (let i=0;i<30;i++) term.write('row'+String(i).padStart(2,'0')+' '+'x'.repeat(60)+(i<29?'\\r\\n':''));
// mode 'raw' = today's page under body zoom; 'fixed' = what TerminalSession does since 2.369.118
window.setup = (zoom, mode) => {
  document.body.style.zoom = zoom === 1 ? '' : String(zoom);
  document.documentElement.style.setProperty('--ui-scale', String(zoom));
  const c = document.getElementById('t');
  c.style.zoom = mode === 'fixed' ? ${JSON.stringify(COUNTER_ZOOM)} : '';
  term.options.fontSize = mode === 'fixed' ? Math.round(14 * zoom * 100) / 100 : 14;
  term.clearSelection();
  return new Promise((r) => setTimeout(() => {
    const s = document.querySelector('.xterm-screen').getBoundingClientRect();
    const cw = s.width / 80, ch = s.height / 30;
    r(JSON.stringify({ screen: [s.width, s.height], x0: s.left + cw * 5.5, y: s.top + ch * 20.5, x1: s.left + cw * 15.5 }));
  }, 150));
};
window.result = () => JSON.stringify({ pos: term.getSelectionPosition() || null, text: term.getSelection() });
</script></body></html>`);

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1600,1200', `--user-data-dir=${path.join(dir, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.log('SKIP: chrome exposed no page target'); process.exit(0); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const mouse = async (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const drag = async (zoom, mode) => {
  const g = JSON.parse(await evalJs(`setup(${zoom}, ${JSON.stringify(mode)})`));
  await mouse('mouseMoved', g.x0, g.y);
  await mouse('mousePressed', g.x0, g.y, { buttons: 1 });
  await mouse('mouseMoved', g.x1, g.y, { buttons: 1 });
  await mouse('mouseReleased', g.x1, g.y);
  await sleep(60);
  const r = JSON.parse(await evalJs('result()'));
  return { screen: g.screen.map((v) => Math.round(v)), row: r.pos ? r.pos.start.y : null, col: r.pos ? r.pos.start.x : null, text: r.text };
};

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false }); // the 1.25 page is 843×675 from (50,75): the headless default 800×600 clipped it
  await cdp('Page.navigate', { url: 'file://' + path.join(dir, 'page.html') });
  await sleep(1200);
  await evalJs('typeof term === "object" && term.rows === 30 ? true : Promise.reject(new Error("no terminal"))');
  const base = await drag(1, 'raw');
  check('zoom 1 (control): a drag at the visual row 20 selects row 20', base.row === 20, base);
  for (const z of [1.25, 0.8]) {
    const raw = await drag(z, 'raw');
    check(`zoom ${z}, PRE-FIX page: the selection lands on row ${Math.round(20.5 * z)} — the incident, not row 20`, raw.row !== 20 && Math.abs(raw.row - 20.5 * z) <= 1, raw);
    const fixed = await drag(z, 'fixed');
    check(`zoom ${z}, FIXED page (counter-zoom + font × scale): the selection lands on row 20`, fixed.row === 20 && /^ ?x{9,11}$/.test(fixed.text), fixed);
    check(`zoom ${z}: the fixed screen is the same visual size as the raw one (±3 %)`, Math.abs(fixed.screen[0] - raw.screen[0]) / raw.screen[0] < 0.03 && Math.abs(fixed.screen[1] - raw.screen[1]) / raw.screen[1] < 0.03, { raw: raw.screen, fixed: fixed.screen });
  }
} catch (e) { failed++; console.error('  ✗ harness error: ' + e.message); }
ws.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
